package com.loxewyx.profit;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "WorkoutNotification",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class WorkoutNotificationPlugin extends Plugin {
    private static final String CHANNEL_ID = "profit-workout-session-sound-v2";
    private static final int NOTIFICATION_ID = 4107;
    private static final int ACTION_REQUEST_CODE = 4108;
    private static final String ACTION_PREFS = "profit-workout-notification-actions";
    private static final String ACTION_KEY = "pendingAction";
    static final String ACTION_EXTRA = "profitWorkoutAction";
    static final String ACTION_PAUSE = "pause";
    static final String ACTION_RESUME = "resume";

    @PluginMethod
    public void show(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        showNotification(call);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("shown", false);
            call.resolve(result);
            return;
        }
        showNotification(call);
    }

    private void showNotification(PluginCall call) {
        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.reject("El gestor de notificaciones no está disponible");
            return;
        }
        String language = call.getData().optString("language", java.util.Locale.getDefault().getLanguage());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
            int importance = existing == null ? NotificationManager.IMPORTANCE_DEFAULT : existing.getImportance();
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                NotificationLanguage.text(language, "Entrenamiento en curso", "Entrenament en curs", "Workout in progress"),
                importance
            );
            channel.setDescription(NotificationLanguage.text(language,
                "Cronómetro de la sesión activa de ProFit",
                "Cronòmetre de la sessió activa de ProFit",
                "Timer for your active ProFit workout"));
            channel.setShowBadge(false);
            NotificationBranding.configureNotificationChannel(channel, context);
            manager.createNotificationChannel(channel);
        }

        String name = call.getData().optString("title", "Entrenamiento");
        long elapsedMs = Math.max(0L, call.getData().optLong("elapsedMs", 0L));
        boolean paused = call.getData().optBoolean("paused", false);
        long chronometerBase = System.currentTimeMillis() - elapsedMs;
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = launchIntent == null ? null : PendingIntent.getActivity(
            context,
            4107,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_profit)
            .setLargeIcon(NotificationBranding.appIcon(context))
            .setContentTitle(paused
                ? NotificationLanguage.text(language, "Entrenamiento en pausa", "Entrenament en pausa", "Workout paused")
                : NotificationLanguage.text(language, "Entrenamiento en curso", "Entrenament en curs", "Workout in progress"))
            .setContentText(name)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setWhen(chronometerBase)
            .setUsesChronometer(!paused)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (paused) {
            builder.setContentText(name + " · " + formatElapsed(elapsedMs));
        }
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        Intent actionIntent = new Intent(context, MainActivity.class)
            .setAction(context.getPackageName() + ".WORKOUT_NOTIFICATION_ACTION")
            .putExtra(ACTION_EXTRA, paused ? ACTION_RESUME : ACTION_PAUSE)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent workoutAction = PendingIntent.getActivity(
            context,
            ACTION_REQUEST_CODE,
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        builder.addAction(new NotificationCompat.Action.Builder(
            R.drawable.ic_stat_dumbbell,
            paused
                ? NotificationLanguage.text(language, "Reanudar", "Reprendre", "Resume")
                : NotificationLanguage.text(language, "Pausar", "Pausar", "Pause"),
            workoutAction
        ).build());

        NotificationBranding.applyNotificationSound(builder, context);
        manager.notify(NOTIFICATION_ID, builder.build());
        JSObject result = new JSObject();
        result.put("shown", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
        getContext().getSharedPreferences(ACTION_PREFS, Context.MODE_PRIVATE).edit().remove(ACTION_KEY).apply();
        call.resolve();
    }

    @PluginMethod
    public void consumeAction(PluginCall call) {
        android.content.SharedPreferences preferences = getContext().getSharedPreferences(ACTION_PREFS, Context.MODE_PRIVATE);
        String action = preferences.getString(ACTION_KEY, "");
        preferences.edit().remove(ACTION_KEY).apply();
        JSObject result = new JSObject();
        result.put("action", ACTION_PAUSE.equals(action) || ACTION_RESUME.equals(action) ? action : "");
        call.resolve(result);
    }

    static void handleNotificationAction(Context context, Intent intent, android.webkit.WebView webView) {
        if (intent == null) return;
        String action = intent.getStringExtra(ACTION_EXTRA);
        if (!ACTION_PAUSE.equals(action) && !ACTION_RESUME.equals(action)) return;

        context.getSharedPreferences(ACTION_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(ACTION_KEY, action)
            .apply();

        if (webView != null) {
            String script = "window.dispatchEvent(new CustomEvent('profit-workout-notification-action', {detail: {action: '" + action + "'}}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        }
        intent.removeExtra(ACTION_EXTRA);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        getActivity().startActivity(intent);
        call.resolve();
    }

    private String formatElapsed(long elapsedMs) {
        long seconds = elapsedMs / 1000L;
        long hours = seconds / 3600L;
        long minutes = (seconds % 3600L) / 60L;
        long remainder = seconds % 60L;
        return hours > 0
            ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", hours, minutes, remainder)
            : String.format(java.util.Locale.ROOT, "%02d:%02d", minutes, remainder);
    }
}
