package com.loxewyx.profit;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RoutineLink")
public class RoutineLinkPlugin extends Plugin {
    private static final String PREFS = "profit-routine-links";
    private static final String KEY_PENDING = "pending";

    @PluginMethod
    public void consume(PluginCall call) {
        String pending = getContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .getString(KEY_PENDING, null);
        if (pending != null) {
            getContext()
                .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_PENDING)
                .apply();
        }
        JSObject result = new JSObject();
        result.put("payload", pending);
        call.resolve(result);
    }

    static void savePending(android.content.Context context, String payload) {
        context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PENDING, payload)
            .apply();
    }
}
