package com.loxewyx.profit;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

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
    name = "WeighInReminder",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class WeighInReminderPlugin extends Plugin {
    private static final String ACTION_PREFS = "profit-notification-actions";
    private static final String KEY_OPEN_WEIGH_IN = "open-weigh-in";

    @PluginMethod
    public void schedule(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        int hour = Math.max(0, Math.min(call.getInt("hour", 9), 23));
        int minute = Math.max(0, Math.min(call.getInt("minute", 0), 59));
        String language = call.getString("language", "en");
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        applySchedule(call, enabled, hour, minute, language);
    }

    @PluginMethod
    public void consumeOpenWeighIn(PluginCall call) {
        android.content.SharedPreferences preferences = getContext()
            .getSharedPreferences(ACTION_PREFS, Context.MODE_PRIVATE);
        boolean openWeighIn = preferences.getBoolean(KEY_OPEN_WEIGH_IN, false);
        if (openWeighIn) preferences.edit().remove(KEY_OPEN_WEIGH_IN).apply();
        JSObject result = new JSObject();
        result.put("openWeighIn", openWeighIn);
        call.resolve(result);
    }

    static boolean recordNotificationAction(Context context, Intent intent) {
        if (intent == null || !intent.getBooleanExtra(WeighInReminderReceiver.EXTRA_OPEN_WEIGH_IN, false))
            return false;
        context.getSharedPreferences(ACTION_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_OPEN_WEIGH_IN, true)
            .apply();
        return true;
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        int hour = Math.max(0, Math.min(call.getInt("hour", 9), 23));
        int minute = Math.max(0, Math.min(call.getInt("minute", 0), 59));
        String language = call.getString("language", "en");
        // Keep the daily alarm active after a denial so it starts notifying if the user later grants permission in Android settings.
        applySchedule(call, true, hour, minute, language);
    }

    private void applySchedule(PluginCall call, boolean enabled, int hour, int minute, String language) {
        WeighInReminderReceiver.configure(getContext(), enabled, hour, minute, language);
        WeighInReminderReceiver.ensureNotificationChannel(getContext(), language);
        boolean notificationsEnabled = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            && androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        JSObject result = new JSObject();
        result.put("scheduled", enabled && notificationsEnabled);
        result.put("notificationsEnabled", notificationsEnabled);
        call.resolve(result);
    }
}
