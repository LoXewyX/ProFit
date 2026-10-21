package com.loxewyx.profit;

import android.Manifest;
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
