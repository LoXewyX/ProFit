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

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.Calendar;

public class ProteinReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "profit-protein-reminders";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_HOUR = "hour";
    static final String KEY_MINUTE = "minute";
    static final String KEY_LANGUAGE = "language";
    static final String CHANNEL_ID = "profit-protein-reminders-sound-v2";
    private static final int ALARM_ID = 6110;
    private static final int NOTIFICATION_ID = 6110;

    static void configure(Context context, boolean enabled, int hour, int minute, String language) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putInt(KEY_HOUR, Math.max(0, Math.min(hour, 23)))
            .putInt(KEY_MINUTE, Math.max(0, Math.min(minute, 59)))
            .putString(KEY_LANGUAGE, language)
            .apply();
        if (enabled) scheduleNext(context);
        else cancel(context);
    }

    static void scheduleNext(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        Calendar trigger = Calendar.getInstance();
        trigger.set(Calendar.HOUR_OF_DAY, prefs.getInt(KEY_HOUR, 15));
        trigger.set(Calendar.MINUTE, prefs.getInt(KEY_MINUTE, 0));
        trigger.set(Calendar.SECOND, 0);
        trigger.set(Calendar.MILLISECOND, 0);
        if (trigger.getTimeInMillis() <= System.currentTimeMillis()) trigger.add(Calendar.DAY_OF_YEAR, 1);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, ALARM_ID, new Intent(context, ProteinReminderReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger.getTimeInMillis(), pendingIntent);
        } else {
            manager.set(AlarmManager.RTC_WAKEUP, trigger.getTimeInMillis(), pendingIntent);
        }
    }

    static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, ALARM_ID, new Intent(context, ProteinReminderReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        manager.cancel(pendingIntent);
        pendingIntent.cancel();
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
            NotificationLanguage.text(language, "Recordatorio de proteína", "Recordatori de proteïna", "Protein reminder"), importance);
        channel.setDescription(NotificationLanguage.text(language,
            "Aviso diario para acordarte de incluir proteína en tu alimentación",
            "Avís diari per recordar-te d’incloure proteïna a la teva alimentació",
            "Daily reminder to include protein in your diet"));
        NotificationBranding.configureNotificationChannel(channel, context);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;
        scheduleNext(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureNotificationChannel(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = launchIntent == null ? null : PendingIntent.getActivity(
            context, ALARM_ID, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_shaker)
            .setLargeIcon(NotificationBranding.appIcon(context))
            .setContentTitle(NotificationLanguage.text(prefs.getString(KEY_LANGUAGE, "en"), "Hora de tu proteína", "Hora de la proteïna", "Protein reminder"))
            .setContentText(NotificationLanguage.text(prefs.getString(KEY_LANGUAGE, "en"),
                "Recuerda incluir proteína en tu alimentación de hoy.",
                "Recorda incloure proteïna a l’alimentació d’avui.",
                "Remember to include protein in your diet today."))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        if (contentIntent != null) builder.setContentIntent(contentIntent);
        NotificationBranding.applyNotificationSound(builder, context);
        manager.notify(NOTIFICATION_ID, builder.build());
    }
}
