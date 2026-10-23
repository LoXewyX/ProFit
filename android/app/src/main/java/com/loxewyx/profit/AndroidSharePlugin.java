package com.loxewyx.profit;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AndroidShare")
public class AndroidSharePlugin extends Plugin {
    private static final long MAX_FILE_BYTES = 128L * 1024L * 1024L;
    private static final String EXPORT_DIRECTORY = "exports";
    private static final String INCOMING_DIRECTORY = "incoming-imports";
    private static final String INCOMING_PREFS = "profit-incoming-messagepack";
    private static final String PREF_ID = "fileId";
    private static final String PREF_STATUS = "status";
    private static final String PREF_FILENAME = "filename";
    private static final String PREF_MIME = "mimeType";
    private static final String PREF_SIZE = "sizeBytes";
    private static final String PREF_ERROR = "error";
    private static final ExecutorService INCOMING_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final int MAX_IMPORT_CHUNK_BYTES = 512 * 1024;

    /**
     * Captures files passed to this activity by Android. The source URI is copied immediately
     * into app-private cache so the import does not depend on a temporary content URI permission.
     */
    public static boolean captureIncomingIntent(Context context, Intent intent) {
        if (context == null || intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action) && !Intent.ACTION_SEND.equals(action)) return false;

        Uri sourceUri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            sourceUri = intent.getData();
        } else {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream instanceof Uri) sourceUri = (Uri) stream;
            if (sourceUri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
                sourceUri = intent.getClipData().getItemAt(0).getUri();
            }
        }
        if (sourceUri == null) return false;
        String scheme = sourceUri.getScheme();
        if (scheme != null && "profit".equalsIgnoreCase(scheme)) return false;

        Context appContext = context.getApplicationContext();
        String filename = queryDisplayName(appContext, sourceUri);
        if (filename.isEmpty()) {
            String segment = sourceUri.getLastPathSegment();
            filename = segment == null ? "profit-import.msgpack" : segment;
        }
        filename = safeIncomingFilename(filename);
        String mimeType = null;
        try { mimeType = appContext.getContentResolver().getType(sourceUri); } catch (Exception ignored) {}
        if (mimeType == null || mimeType.trim().isEmpty()) mimeType = intent.getType();
        if (mimeType == null || mimeType.trim().isEmpty()) mimeType = "application/msgpack";
        if (!isSupportedMessagePack(filename, mimeType)) return false;

        SharedPreferences prefs = appContext.getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE);
        String oldId = prefs.getString(PREF_ID, "");
        String oldName = prefs.getString(PREF_FILENAME, "profit-import.msgpack");
        if (oldId != null && !oldId.isEmpty()) {
            deleteIncomingRecursively(new File(new File(appContext.getCacheDir(), INCOMING_DIRECTORY), oldId));
        }

        final String fileId = UUID.randomUUID().toString();
        final String capturedName = filename;
        final String capturedMime = normalizedImportMime(filename, mimeType);
        prefs.edit()
            .clear()
            .putString(PREF_ID, fileId)
            .putString(PREF_STATUS, "preparing")
            .putString(PREF_FILENAME, capturedName)
            .putString(PREF_MIME, capturedMime)
            .putLong(PREF_SIZE, 0L)
            .apply();

        final Uri capturedUri = sourceUri;
        INCOMING_EXECUTOR.execute(() -> copyIncomingFile(appContext, capturedUri, fileId, capturedName, capturedMime));
        return true;
    }

    private static void copyIncomingFile(Context context, Uri sourceUri, String fileId, String filename, String mimeType) {
        File output = getIncomingFile(context, fileId, filename);
        SharedPreferences prefs = context.getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE);
        try {
            File parent = output.getParentFile();
            if (parent == null || (!parent.mkdirs() && !parent.isDirectory()))
                throw new IllegalStateException("No se pudo preparar el archivo recibido.");
            ContentResolver resolver = context.getContentResolver();
            long total = 0L;
            try (InputStream input = resolver.openInputStream(sourceUri);
                 FileOutputStream stream = new FileOutputStream(output, false)) {
                if (input == null) throw new IllegalStateException("Android no pudo leer el archivo seleccionado.");
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_FILE_BYTES) throw new IllegalArgumentException("El archivo supera el límite de 128 MB.");
                    stream.write(buffer, 0, read);
                }
                stream.flush();
            }
            if (total <= 0L) throw new IllegalStateException("El archivo está vacío.");
            if (fileId.equals(prefs.getString(PREF_ID, ""))) {
                prefs.edit()
                    .putString(PREF_STATUS, "ready")
                    .putString(PREF_FILENAME, filename)
                    .putString(PREF_MIME, mimeType)
                    .putLong(PREF_SIZE, total)
                    .remove(PREF_ERROR)
                    .apply();
            } else {
                deleteIncomingRecursively(output.getParentFile());
            }
        } catch (Exception error) {
            deleteIncomingRecursively(output.getParentFile());
            if (fileId.equals(prefs.getString(PREF_ID, ""))) {
                prefs.edit()
                    .putString(PREF_STATUS, "error")
                    .putString(PREF_ERROR, error.getMessage() == null ? "No se pudo leer el archivo recibido." : error.getMessage())
                    .putLong(PREF_SIZE, 0L)
                    .apply();
            }
        }
    }

    private static boolean isSupportedMessagePack(String filename, String mimeType) {
        String lowerName = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        String lowerMime = mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT).split(";")[0].trim();
        boolean supportedExtension = lowerName.endsWith(".msgpack") || lowerName.endsWith(".mpk") || lowerName.endsWith(".bin");
        boolean supportedMime = "application/msgpack".equals(lowerMime)
            || "application/x-msgpack".equals(lowerMime)
            || "application/vnd.msgpack".equals(lowerMime);
        // Do not associate ProFit with every generic binary file; accept octet-stream only with a known extension.
        return supportedExtension || supportedMime;
    }

    private static String normalizedImportMime(String filename, String mimeType) {
        String lowerMime = mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT).split(";")[0].trim();
        if ("application/msgpack".equals(lowerMime) || "application/x-msgpack".equals(lowerMime) || "application/vnd.msgpack".equals(lowerMime)) return "application/msgpack";
        String lowerName = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (lowerName.endsWith(".msgpack") || lowerName.endsWith(".mpk") || lowerName.endsWith(".bin")) return "application/msgpack";
        return "application/msgpack";
    }

    private static String queryDisplayName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.trim().isEmpty()) return value;
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    private static String safeIncomingFilename(String requestedName) {
        String filename = new File(requestedName == null ? "" : requestedName).getName().replaceAll("[^A-Za-z0-9._-]", "_");
        if (filename.isEmpty() || ".".equals(filename) || "..".equals(filename)) return "profit-import.msgpack";
        return filename;
    }

    private static File getIncomingFile(Context context, String fileId, String filename) {
        if (fileId == null || !fileId.matches("[a-fA-F0-9-]{36}")) throw new IllegalArgumentException("Identificador de archivo recibido no válido.");
        return new File(new File(new File(context.getCacheDir(), INCOMING_DIRECTORY), fileId), safeIncomingFilename(filename));
    }

    private static void deleteIncomingRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteIncomingRecursively(child);
        }
        file.delete();
    }

    @PluginMethod
    public void getPendingImportInfo(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE);
        String fileId = prefs.getString(PREF_ID, "");
        String status = prefs.getString(PREF_STATUS, "none");
        JSObject result = new JSObject();
        result.put("status", fileId == null || fileId.isEmpty() ? "none" : status);
        if (fileId != null && !fileId.isEmpty()) {
            result.put("fileId", fileId);
            result.put("filename", prefs.getString(PREF_FILENAME, "profit-import.msgpack"));
            result.put("mimeType", prefs.getString(PREF_MIME, "application/msgpack"));
            result.put("sizeBytes", prefs.getLong(PREF_SIZE, 0L));
            String error = prefs.getString(PREF_ERROR, "");
            if (error != null && !error.isEmpty()) result.put("error", error);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void readPendingImportChunk(PluginCall call) {
        try {
            String fileId = call.getString("fileId", "");
            String currentId = getContext().getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE).getString(PREF_ID, "");
            String status = getContext().getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE).getString(PREF_STATUS, "none");
            if (!fileId.equals(currentId) || !"ready".equals(status)) throw new IllegalStateException("El archivo recibido ya no está disponible.");
            int offset = call.getInt("offset", -1);
            int requestedLength = call.getInt("length", MAX_IMPORT_CHUNK_BYTES);
            String filename = getContext().getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE).getString(PREF_FILENAME, "profit-import.msgpack");
            File source = getIncomingFile(getContext(), fileId, filename);
            if (!source.isFile() || source.length() <= 0L) throw new IllegalStateException("No se encontró el archivo recibido.");
            if (offset < 0 || offset >= source.length()) throw new IllegalArgumentException("Posición de lectura no válida.");
            if (requestedLength <= 0 || requestedLength > MAX_IMPORT_CHUNK_BYTES) throw new IllegalArgumentException("Tamaño de bloque no válido.");
            int length = (int) Math.min((long) requestedLength, source.length() - offset);
            byte[] buffer = new byte[length];
            try (RandomAccessFile input = new RandomAccessFile(source, "r")) {
                input.seek(offset);
                input.readFully(buffer);
            }
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(buffer, Base64.NO_WRAP));
            result.put("bytes", buffer.length);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo leer el bloque del archivo recibido.", error);
        }
    }

    @PluginMethod
    public void finishPendingImport(PluginCall call) {
        try {
            String fileId = call.getString("fileId", "");
            SharedPreferences prefs = getContext().getSharedPreferences(INCOMING_PREFS, Context.MODE_PRIVATE);
            String currentId = prefs.getString(PREF_ID, "");
            if (fileId.equals(currentId)) {
                String filename = prefs.getString(PREF_FILENAME, "profit-import.msgpack");
                deleteIncomingRecursively(new File(new File(getContext().getCacheDir(), INCOMING_DIRECTORY), fileId));
                prefs.edit().clear().apply();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo limpiar el archivo temporal recibido.", error);
        }
    }

    @PluginMethod
    public void beginExport(PluginCall call) {
        try {
            File directory = new File(getContext().getCacheDir(), EXPORT_DIRECTORY);
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("No se pudo preparar la exportación.");
            removeExpiredFiles(directory);
            String transferId = UUID.randomUUID().toString();
            File output = getExportFile(transferId, call.getString("filename", "profit-export.msgpack"));
            if (!output.getParentFile().mkdirs() && !output.getParentFile().isDirectory()) throw new IllegalStateException("No se pudo crear el espacio temporal.");
            if (!output.createNewFile()) throw new IllegalStateException("No se pudo crear el archivo temporal.");
            JSObject result = new JSObject();
            result.put("transferId", transferId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo preparar el archivo para exportar.", error);
        }
    }

    @PluginMethod
    public void appendExportChunk(PluginCall call) {
        try {
            File output = getExportFile(call.getString("transferId", ""), call.getString("filename", "profit-export.msgpack"));
            String encoded = call.getString("data", "");
            if (!output.isFile() || encoded.isEmpty()) throw new IllegalArgumentException("El bloque de exportación está vacío.");
            byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
            if (bytes.length == 0 || output.length() + bytes.length > MAX_FILE_BYTES) {
                throw new IllegalArgumentException("El archivo debe ocupar menos de 128 MB.");
            }
            try (FileOutputStream stream = new FileOutputStream(output, true)) {
                stream.write(bytes);
                stream.flush();
            }
            JSObject result = new JSObject();
            result.put("bytes", bytes.length);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo transferir una parte del archivo.", error);
        }
    }

    @PluginMethod
    public void finishExport(PluginCall call) {
        try {
            File output = getExportFile(call.getString("transferId", ""), call.getString("filename", "profit-export.msgpack"));
            int expectedBytes = call.getInt("expectedBytes", -1);
            if (!output.isFile() || output.length() == 0 || output.length() != expectedBytes) {
                throw new IllegalStateException("El archivo se transfirió incompleto.");
            }
            JSObject result = new JSObject();
            result.put("bytes", output.length());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo verificar el archivo exportado.", error);
        }
    }

    @PluginMethod
    public void discardExport(PluginCall call) {
        try {
            File output = getExportFile(call.getString("transferId", ""), call.getString("filename", "profit-export.msgpack"));
            deleteExport(output);
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo limpiar el archivo temporal.", error);
        }
    }

    @PluginMethod
    public void saveExport(PluginCall call) {
        try {
            File source = getExportFile(call.getString("transferId", ""), call.getString("filename", "profit-export.msgpack"));
            if (!source.isFile() || source.length() == 0) throw new IllegalStateException("El archivo está vacío.");
            String safeName = safeFilename(call.getString("filename", "profit-export.msgpack"));
            Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            create.addCategory(Intent.CATEGORY_OPENABLE);
            create.setType(call.getString("mimeType", "application/msgpack"));
            create.putExtra(Intent.EXTRA_TITLE, safeName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) create.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
            startActivityForResult(call, create, "saveExportResult");
        } catch (Exception error) {
            call.reject("No se pudo abrir el selector de archivos.", error);
        }
    }

    @ActivityCallback
    private void saveExportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String transferId = call.getString("transferId", "");
        File source;
        try {
            source = getExportFile(transferId, call.getString("filename", "profit-export.msgpack"));
        } catch (Exception error) {
            call.reject("No se encontró el archivo exportado.", error);
            return;
        }
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            deleteExport(source);
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            deleteExport(source);
            call.reject("Android no devolvió una ubicación para guardar el archivo.");
            return;
        }
        new Thread(() -> {
            try {
                long copied = copyToUri(source, uri);
                if (copied == 0 || copied != source.length()) throw new IllegalStateException("El archivo guardado quedó incompleto.");
                deleteExport(source);
                JSObject saved = new JSObject();
                saved.put("saved", true);
                saved.put("bytes", copied);
                call.resolve(saved);
            } catch (Exception error) {
                try { getContext().getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
                deleteExport(source);
                call.reject("No se pudo guardar el archivo completo en el dispositivo.", error);
            }
        }, "profit-save-export").start();
    }

    @PluginMethod
    public void shareExport(PluginCall call) {
        try {
            File source = getExportFile(call.getString("transferId", ""), call.getString("filename", "profit-export.msgpack"));
            if (!source.isFile() || source.length() == 0) throw new IllegalStateException("El archivo está vacío.");
            String safeName = safeFilename(call.getString("filename", "profit-export.msgpack"));
            String title = call.getString("title", "Compartir archivo de ProFit");
            Context context = getContext();
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", source);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(call.getString("mimeType", "application/msgpack"));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TEXT, title);
            send.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { call.getString("mimeType", "application/msgpack"), "application/octet-stream" });
            send.setClipData(ClipData.newUri(context.getContentResolver(), safeName, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            JSObject shared = new JSObject();
            shared.put("shared", true);
            shared.put("bytes", source.length());
            call.resolve(shared);
        } catch (Exception error) {
            call.reject("No se pudo abrir el menú para compartir el archivo.", error);
        }
    }

    private File getExportFile(String transferId, String filename) {
        if (transferId == null || !transferId.matches("[a-fA-F0-9-]{36}")) throw new IllegalArgumentException("Identificador de exportación no válido.");
        return new File(new File(new File(getContext().getCacheDir(), EXPORT_DIRECTORY), transferId), safeFilename(filename));
    }

    private void deleteExport(File source) {
        if (source == null) return;
        source.delete();
        File directory = source.getParentFile();
        if (directory != null && directory.isDirectory()) {
            File[] children = directory.listFiles();
            if (children != null && children.length == 0) directory.delete();
        }
    }

    private String safeFilename(String requestedName) {
        String safeName = new File(requestedName).getName().replaceAll("[^A-Za-z0-9._-]", "_");
        return safeName.isEmpty() ? "profit-export.msgpack" : safeName;
    }

    private long copyToUri(File source, Uri uri) throws Exception {
        long copied = 0;
        try (FileInputStream input = new FileInputStream(source);
             OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) throw new IllegalStateException("No se pudo abrir el archivo de destino.");
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                copied += read;
            }
            output.flush();
        }
        return copied;
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String requestedName = call.getString("filename", "profit-export.msgpack");
        String safeName = new File(requestedName).getName().replaceAll("[^A-Za-z0-9._-]", "_");
        if (safeName.isEmpty()) safeName = "profit-export.msgpack";
        Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        create.addCategory(Intent.CATEGORY_OPENABLE);
        create.setType("application/msgpack");
        create.putExtra(Intent.EXTRA_TITLE, safeName);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) create.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
        startActivityForResult(call, create, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Uri uri = result.getData().getData();
        String encoded = call.getString("data", "");
        if (uri == null || encoded.isEmpty()) {
            call.reject("No se pudo guardar el archivo seleccionado.");
            return;
        }
        new Thread(() -> {
            try {
                byte[] content = Base64.decode(encoded, Base64.DEFAULT);
                if (content.length == 0 || content.length > MAX_FILE_BYTES) {
                    call.reject("El archivo debe ocupar menos de 128 MB.");
                    return;
                }
                try (java.io.OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
                    if (stream == null) throw new IllegalStateException("No se pudo abrir el archivo de destino.");
                    stream.write(content);
                    stream.flush();
                }
                JSObject saved = new JSObject();
                saved.put("saved", true);
                call.resolve(saved);
            } catch (Exception error) {
                call.reject("No se pudo guardar el archivo en el dispositivo.", error);
            }
        }, "profit-save-file").start();
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String encoded = call.getString("data", "");
        String requestedName = call.getString("filename", "profit-export.msgpack");
        String title = call.getString("title", "Compartir archivo de ProFit");
        if (encoded.isEmpty()) {
            call.reject("El archivo está vacío.");
            return;
        }

        new Thread(() -> {
            try {
                byte[] content = Base64.decode(encoded, Base64.DEFAULT);
                if (content.length == 0 || content.length > MAX_FILE_BYTES) {
                    call.reject("El archivo debe ocupar menos de 128 MB.");
                    return;
                }

                Context context = getContext();
                File directory = new File(context.getCacheDir(), "shared-files");
                if (!directory.exists() && !directory.mkdirs()) {
                    call.reject("No se pudo preparar el archivo para compartir.");
                    return;
                }
                removeExpiredFiles(directory);
                String safeName = new File(requestedName).getName().replaceAll("[^A-Za-z0-9._-]", "_");
                if (safeName.isEmpty()) safeName = "profit-export.msgpack";
                File output = new File(directory, System.currentTimeMillis() + "-" + safeName);
                try (FileOutputStream stream = new FileOutputStream(output)) {
                    stream.write(content);
                    stream.flush();
                }

                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", output);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/msgpack");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_SUBJECT, title);
                send.putExtra(Intent.EXTRA_TEXT, title);
                send.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/msgpack", "application/octet-stream" });
                send.setClipData(ClipData.newUri(context.getContentResolver(), safeName, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, title);
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(chooser);
                        JSObject result = new JSObject();
                        result.put("shared", true);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Android no pudo abrir las opciones para compartir.", error);
                    }
                });
            } catch (Exception error) {
                call.reject("No se pudo crear el archivo para compartir.", error);
            }
        }, "profit-share-file").start();
    }

    private void removeExpiredFiles(File directory) {
        File[] files = directory.listFiles();
        if (files == null) return;
        long expiry = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
        for (File file : files) {
            if (file.lastModified() < expiry) deleteRecursively(file);
        }
    }

    private void deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }
}
