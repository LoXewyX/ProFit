package com.loxewyx.profit;

import android.Manifest;
import android.content.Context;
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
    name = "HydrationReminder",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class HydrationReminderPlugin extends Plugin {
    @PluginMethod
    public void schedule(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        int interval = call.getInt("intervalMinutes", 60);
        interval = Math.max(15, Math.min(interval, 240));
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        applySchedule(call, enabled, interval);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (!allowed) {
            JSObject result = new JSObject();
            result.put("scheduled", false);
            call.resolve(result);
            return;
        }
        int interval = Math.max(15, Math.min(call.getInt("intervalMinutes", 60), 240));
        applySchedule(call, true, interval);
    }

    private void applySchedule(PluginCall call, boolean enabled, int interval) {
        Context context = getContext();
        String language = call.getString("language", "en");
        if (enabled) {
            HydrationReminderReceiver.ensureNotificationChannel(context, language);
            if (!HydrationReminderReceiver.canPostNotifications(context)) {
                HydrationReminderReceiver.cancel(context);
                JSObject result = new JSObject();
                result.put("scheduled", false);
                result.put("notificationsEnabled", false);
                call.resolve(result);
                return;
            }
        }
        String daysOfWeek = call.getString("daysOfWeek", "0,1,2,3,4,5,6");
        int quietStart = parseTime(call.getString("quietStart", "22:00"), 22 * 60);
        int quietEnd = parseTime(call.getString("quietEnd", "08:00"), 8 * 60);
        context.getSharedPreferences(HydrationReminderReceiver.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(HydrationReminderReceiver.KEY_ENABLED, enabled)
            .putInt(HydrationReminderReceiver.KEY_INTERVAL, interval)
            .putString(HydrationReminderReceiver.KEY_DAYS, daysOfWeek)
            .putInt(HydrationReminderReceiver.KEY_QUIET_START, quietStart)
            .putInt(HydrationReminderReceiver.KEY_QUIET_END, quietEnd)
            .putString(HydrationReminderReceiver.KEY_LANGUAGE, language)
            .apply();
        if (enabled) HydrationReminderReceiver.scheduleNext(context, interval * 60_000L);
        else HydrationReminderReceiver.cancel(context);
        JSObject result = new JSObject();
        result.put("scheduled", enabled);
        call.resolve(result);
    }

    private int parseTime(String value, int fallback) {
        if (value == null || !value.matches("\\d{2}:\\d{2}")) return fallback;
        try {
            int hour = Integer.parseInt(value.substring(0, 2));
            int minute = Integer.parseInt(value.substring(3, 5));
            return hour <= 23 && minute <= 59 ? hour * 60 + minute : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    @PluginMethod
    public void recordWater(PluginCall call) {
        Context context = getContext();
        android.content.SharedPreferences prefs = context.getSharedPreferences(HydrationReminderReceiver.PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(HydrationReminderReceiver.KEY_ENABLED, false)) {
            int interval = prefs.getInt(HydrationReminderReceiver.KEY_INTERVAL, 60);
            HydrationReminderReceiver.scheduleNext(context, interval * 60_000L);
        }
        call.resolve();
    }
}
