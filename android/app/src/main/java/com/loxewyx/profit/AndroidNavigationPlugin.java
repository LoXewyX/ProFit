package com.loxewyx.profit;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidNavigation")
public class AndroidNavigationPlugin extends Plugin {
    private static volatile AndroidNavigationPlugin instance;
    private static volatile boolean canGoBack;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setCanGoBack(PluginCall call) {
        canGoBack = call.getBoolean("canGoBack", false);
        call.resolve();
    }

    public static boolean dispatchBackButton() {
        AndroidNavigationPlugin plugin = instance;
        if (!canGoBack || plugin == null) return false;
        plugin.notifyListeners("backButton", new JSObject());
        return true;
    }
}
