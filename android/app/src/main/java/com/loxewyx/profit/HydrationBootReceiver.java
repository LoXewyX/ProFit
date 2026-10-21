package com.loxewyx.profit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class HydrationBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(HydrationReminderReceiver.PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(HydrationReminderReceiver.KEY_ENABLED, false)) {
            int interval = prefs.getInt(HydrationReminderReceiver.KEY_INTERVAL, 60);
            HydrationReminderReceiver.scheduleNext(context, interval * 60_000L);
        }
        android.content.SharedPreferences weighPrefs = context.getSharedPreferences(WeighInReminderReceiver.PREFS, Context.MODE_PRIVATE);
        if (weighPrefs.getBoolean(WeighInReminderReceiver.KEY_ENABLED, false)) {
            WeighInReminderReceiver.scheduleNext(context);
        }
        android.content.SharedPreferences proteinPrefs = context.getSharedPreferences(ProteinReminderReceiver.PREFS, Context.MODE_PRIVATE);
        if (proteinPrefs.getBoolean(ProteinReminderReceiver.KEY_ENABLED, false)) {
            ProteinReminderReceiver.scheduleNext(context);
        }
    }
}
