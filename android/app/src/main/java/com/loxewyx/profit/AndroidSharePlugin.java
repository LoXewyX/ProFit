package com.loxewyx.profit;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "AndroidShare")
public class AndroidSharePlugin extends Plugin {
    private static final long MAX_FILE_BYTES = 128L * 1024L * 1024L;
    private static final String EXPORT_DIRECTORY = "exports";

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
            send.setType("*/*");
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
                send.setType("*/*");
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
