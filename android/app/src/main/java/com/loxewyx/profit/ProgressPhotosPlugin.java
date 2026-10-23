package com.loxewyx.profit;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(
    name = "ProgressPhotos",
    permissions = {
        @Permission(alias = "writeStorage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class ProgressPhotosPlugin extends Plugin {
    private static final int MAX_PHOTO_BYTES = 20 * 1024 * 1024;

    @PluginMethod
    public void savePhoto(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("writeStorage") != PermissionState.GRANTED) {
            requestPermissionForAlias("writeStorage", call, "savePhotoPermissionResult");
            return;
        }
        savePhotoWithPermission(call);
    }

    @PermissionCallback
    private void savePhotoPermissionResult(PluginCall call) {
        if (call == null) return;
        if (getPermissionState("writeStorage") != PermissionState.GRANTED) {
            call.reject("Se necesita permiso para guardar la foto en la galería.");
            return;
        }
        savePhotoWithPermission(call);
    }

    private void savePhotoWithPermission(PluginCall call) {
        Uri outputUri = null;
        try {
            String encoded = call.getString("data", "");
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_PHOTO_BYTES) {
                throw new IllegalArgumentException("La foto comprimida debe ocupar menos de 20 MB.");
            }

            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            String filename = "profit_" + System.currentTimeMillis() + "_"
                + UUID.randomUUID().toString().substring(0, 8) + ".jpg";
            values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_PICTURES + "/ProFit");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            } else {
                File directory = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    "ProFit"
                );
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("No se pudo crear la carpeta Fotos/ProFit.");
                }
                values.put(MediaStore.Images.Media.DATA,
                    new File(directory, filename).getAbsolutePath());
            }
            outputUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (outputUri == null) throw new IllegalStateException("No se pudo crear la foto en la galería.");

            try (OutputStream stream = resolver.openOutputStream(outputUri, "w")) {
                if (stream == null) throw new IllegalStateException("No se pudo escribir la foto en la galería.");
                stream.write(bytes);
                stream.flush();
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(outputUri, ready, null, null);
            }

            JSObject result = new JSObject();
            result.put("uri", outputUri.toString());
            result.put("mimeType", "image/jpeg");
            call.resolve(result);
        } catch (Exception error) {
            if (outputUri != null) {
                try { getContext().getContentResolver().delete(outputUri, null, null); }
                catch (Exception ignored) { }
            }
            call.reject(error.getMessage() == null ? "No se pudo guardar la foto en Fotos/ProFit." : error.getMessage(), error);
        }
    }

    @PluginMethod
    public void readPhoto(PluginCall call) {
        try {
            Uri uri = parsePhotoUri(call.getString("uri", ""));
            ContentResolver resolver = getContext().getContentResolver();
            String mimeType = resolver.getType(uri);
            try (InputStream input = resolver.openInputStream(uri);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new IllegalStateException("La foto ya no está disponible en la galería.");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > MAX_PHOTO_BYTES) {
                        throw new IllegalStateException("La foto supera el tamaño permitido.");
                    }
                    output.write(buffer, 0, count);
                }
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                result.put("mimeType", mimeType == null ? "image/jpeg" : mimeType);
                call.resolve(result);
            }
        } catch (Exception error) {
            call.reject("La foto ya no está disponible en la galería.", error);
        }
    }

    @PluginMethod
    public void photoExists(PluginCall call) {
        try {
            Uri uri = parsePhotoUri(call.getString("uri", ""));
            boolean exists;
            try (Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[] { MediaStore.Images.Media._ID },
                null,
                null,
                null
            )) {
                exists = cursor != null && cursor.moveToFirst();
            }
            JSObject result = new JSObject();
            result.put("exists", exists);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo comprobar la foto en la galería.", error);
        }
    }

    @PluginMethod
    public void deletePhoto(PluginCall call) {
        try {
            Uri uri = parsePhotoUri(call.getString("uri", ""));
            int deleted = getContext().getContentResolver().delete(uri, null, null);
            JSObject result = new JSObject();
            result.put("deleted", deleted > 0);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo eliminar la foto de la galería.", error);
        }
    }

    private Uri parsePhotoUri(String value) {
        Uri uri = Uri.parse(value);
        if (!"content".equals(uri.getScheme())) {
            throw new IllegalArgumentException("La referencia de la foto no es válida.");
        }
        return uri;
    }
}
