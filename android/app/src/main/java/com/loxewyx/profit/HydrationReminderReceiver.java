package com.loxewyx.profit;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

public class HydrationReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "profit-hydration-reminders";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_INTERVAL = "intervalMinutes";
    static final String KEY_DAYS = "daysOfWeek";
    static final String KEY_QUIET_START = "quietStartMinutes";
    static final String KEY_QUIET_END = "quietEndMinutes";
    static final String KEY_LANGUAGE = "language";
    static final String CHANNEL_ID = "profit-hydration-reminders-sound-v2";
    private static final int ALARM_ID = 4108;
    private static final int NOTIFICATION_ID = 4108;

    static void scheduleNext(Context context, long delayMs) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        Intent intent = new Intent(context, HydrationReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, ALARM_ID, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        long triggerAt = SystemClock.elapsedRealtime() + Math.max(delayMs, 60_000L);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        } else {
            manager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        }
    }

    static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, ALARM_ID, new Intent(context, HydrationReminderReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        manager.cancel(pendingIntent);
    }

    static void ensureNotificationChannel(Context context) {
        String language = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_LANGUAGE, java.util.Locale.getDefault().getLanguage());
        ensureNotificationChannel(context, language);
    }

    static void ensureNotificationChannel(Context context, String language) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        int importance = existing == null ? NotificationManager.IMPORTANCE_DEFAULT : existing.getImportance();
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
            NotificationLanguage.text(language, "Recordatorios de hidratación", "Recordatoris d’hidratació", "Hydration reminders"), importance);
        channel.setDescription(NotificationLanguage.text(language,
            "Avisos periódicos para registrar tu consumo de agua",
            "Avisos periòdics per registrar el consum d’aigua",
            "Periodic reminders to log your water intake"));
        NotificationBranding.configureNotificationChannel(channel, context);
        manager.createNotificationChannel(channel);
    }

    static boolean canPostNotifications(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;
        int interval = prefs.getInt(KEY_INTERVAL, 60);
        Calendar now = Calendar.getInstance();
        long delay = interval * 60_000L;
        if (isAllowedNow(now, prefs)) {
            showReminder(context, prefs);
        } else {
            delay = millisUntilAllowedTime(now, prefs, delay);
        }
        scheduleNext(context, delay);
    }

    private boolean isAllowedNow(Calendar now, android.content.SharedPreferences prefs) {
        Set<Integer> days = readDays(prefs.getString(KEY_DAYS, "0,1,2,3,4,5,6"));
        int javaDay = now.get(Calendar.DAY_OF_WEEK) - 1;
        if (!days.contains(javaDay)) return false;
        int quietStart = prefs.getInt(KEY_QUIET_START, 22 * 60);
        int quietEnd = prefs.getInt(KEY_QUIET_END, 8 * 60);
        if (quietStart == quietEnd) return true;
        int minuteOfDay = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        boolean quiet = quietStart < quietEnd
            ? minuteOfDay >= quietStart && minuteOfDay < quietEnd
            : minuteOfDay >= quietStart || minuteOfDay < quietEnd;
        return !quiet;
    }

    private long millisUntilAllowedTime(Calendar now, android.content.SharedPreferences prefs, long fallbackDelay) {
        Set<Integer> days = readDays(prefs.getString(KEY_DAYS, "0,1,2,3,4,5,6"));
        if (days.isEmpty()) return fallbackDelay;
        Calendar cursor = (Calendar) now.clone();
        cursor.set(Calendar.SECOND, 0);
        cursor.set(Calendar.MILLISECOND, 0);
        cursor.add(Calendar.MINUTE, 1);
        for (int minute = 0; minute < 8 * 24 * 60; minute++) {
            if (isAllowedNow(cursor, prefs)) return Math.max(60_000L, cursor.getTimeInMillis() - now.getTimeInMillis());
            cursor.add(Calendar.MINUTE, 1);
        }
        return fallbackDelay;
    }

    private Set<Integer> readDays(String serializedDays) {
        Set<Integer> days = new HashSet<>();
        if (serializedDays == null) return days;
        for (String item : serializedDays.split(",")) {
            try {
                int day = Integer.parseInt(item.trim());
                if (day >= 0 && day <= 6) days.add(day);
            } catch (NumberFormatException ignored) {
                // Ignore malformed values from an older or edited preference.
            }
        }
        return days;
    }

    private void showReminder(Context context, android.content.SharedPreferences prefs) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureNotificationChannel(context);
        if (!canPostNotifications(context)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = launchIntent == null ? null : PendingIntent.getActivity(
            context, ALARM_ID, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_water_drop)
            .setLargeIcon(NotificationBranding.appIcon(context))
            .setContentTitle(NotificationLanguage.text(prefs.getString(KEY_LANGUAGE, "en"), "Un momento para hidratarte", "Un moment per hidratar-te", "Time to hydrate"))
            .setContentText(NotificationLanguage.text(prefs.getString(KEY_LANGUAGE, "en"),
                "Bebe un poco de agua y registra tu progreso en ProFit.",
                "Beu una mica d’aigua i registra el teu progrés a ProFit.",
                "Have some water and log your progress in ProFit."))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        if (contentIntent != null) builder.setContentIntent(contentIntent);
        NotificationBranding.applyNotificationSound(builder, context);
        manager.notify(NOTIFICATION_ID, builder.build());
    }
}
