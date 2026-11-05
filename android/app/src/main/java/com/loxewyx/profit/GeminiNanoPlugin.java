package com.loxewyx.profit;

import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.splitcompat.SplitCompat;
import com.google.android.play.core.splitinstall.SplitInstallManager;
import com.google.android.play.core.splitinstall.SplitInstallManagerFactory;
import com.google.android.play.core.splitinstall.SplitInstallRequest;
import com.google.android.play.core.splitinstall.SplitInstallStateUpdatedListener;
import com.google.android.play.core.splitinstall.model.SplitInstallSessionStatus;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Base-module facade for the Gemini Nano code delivered on demand by Play. */
@CapacitorPlugin(name = "GeminiNano")
public class GeminiNanoPlugin extends Plugin {
    private static final String MODULE_NAME = "geminiNano";
    private static final String ENGINE_CLASS = "com.loxewyx.profit.GeminiNanoEngine";

    @PluginMethod
    public void checkAvailability(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(statusResult("unsupported", ""));
            return;
        }
        if (!isFeatureInstalled()) {
            call.resolve(statusResult("module_missing", ""));
            return;
        }
        invokeEngine(call, "checkAvailability", null, null);
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(statusResult("unsupported", ""));
            return;
        }
        withFeature(call, () -> invokeEngine(call, "downloadModel", null, null));
    }

    @PluginMethod
    public void generate(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Gemini Nano requires Android 8 or later", "MODEL_UNSUPPORTED");
            return;
        }
        String prompt = call.getString("prompt", "").trim();
        if (prompt.isEmpty() || prompt.length() > 14000) {
            call.reject("Prompt is empty or too long", "INVALID_PROMPT");
            return;
        }
        String imageBase64 = call.getString("imageBase64", "");
        withFeature(call, () -> invokeEngine(call, "generate", prompt, imageBase64));
    }

    private JSObject statusResult(String status, String text) {
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("text", text == null ? "" : text);
        result.put("apiLevel", Build.VERSION.SDK_INT);
        return result;
    }

    private boolean isFeatureInstalled() {
        try {
            Set<String> modules = SplitInstallManagerFactory.create(getContext()).getInstalledModules();
            return modules.contains(MODULE_NAME);
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void withFeature(PluginCall call, Runnable onInstalled) {
        SplitInstallManager manager;
        try {
            manager = SplitInstallManagerFactory.create(getContext());
        } catch (RuntimeException error) {
            call.reject("Gemini Nano can only be installed through Google Play", "MODULE_INSTALL_UNAVAILABLE", error);
            return;
        }
        if (manager.getInstalledModules().contains(MODULE_NAME)) {
            installSplitCompatAndRun(call, onInstalled);
            return;
        }

        AtomicBoolean completed = new AtomicBoolean(false);
        AtomicReference<SplitInstallStateUpdatedListener> listenerRef = new AtomicReference<>();
        SplitInstallStateUpdatedListener listener = state -> {
            if (!state.moduleNames().contains(MODULE_NAME) || completed.get()) return;
            if (state.status() == SplitInstallSessionStatus.INSTALLED) {
                if (!completed.compareAndSet(false, true)) return;
                manager.unregisterListener(listenerRef.get());
                installSplitCompatAndRun(call, onInstalled);
            } else if (state.status() == SplitInstallSessionStatus.FAILED ||
                state.status() == SplitInstallSessionStatus.CANCELED) {
                if (!completed.compareAndSet(false, true)) return;
                manager.unregisterListener(listenerRef.get());
                call.reject("Gemini Nano module installation failed", "MODULE_INSTALL_FAILED");
            }
        };
        listenerRef.set(listener);
        manager.registerListener(listener);
        manager.startInstall(
            SplitInstallRequest.newBuilder().addModule(MODULE_NAME).build()
        ).addOnFailureListener(error -> {
            if (!completed.compareAndSet(false, true)) return;
            manager.unregisterListener(listener);
            call.reject("Gemini Nano module installation failed", "MODULE_INSTALL_FAILED", error);
        });
    }

    private void installSplitCompatAndRun(PluginCall call, Runnable onInstalled) {
        try {
            SplitCompat.install(getContext());
            onInstalled.run();
        } catch (RuntimeException error) {
            call.reject("Gemini Nano module could not be loaded", "MODULE_LOAD_FAILED", error);
        }
    }

    private void invokeEngine(PluginCall call, String methodName, String prompt, String imageBase64) {
        try {
            Class<?> engine = Class.forName(ENGINE_CLASS, true, getContext().getClassLoader());
            GeminiNanoResultCallback callback = new GeminiNanoResultCallback() {
                @Override
                public void onSuccess(String status, String text) {
                    call.resolve(statusResult(status, text));
                }

                @Override
                public void onError(String message, String code, Throwable cause) {
                    call.reject(message, code, cause instanceof Exception
                        ? (Exception) cause
                        : cause == null ? null : new Exception(cause));
                }
            };
            Method method;
            if ("generate".equals(methodName)) {
                method = engine.getMethod(
                    methodName,
                    Context.class,
                    String.class,
                    String.class,
                    GeminiNanoResultCallback.class
                );
                method.invoke(null, getContext(), prompt, imageBase64, callback);
            } else {
                method = engine.getMethod(methodName, Context.class, GeminiNanoResultCallback.class);
                method.invoke(null, getContext(), callback);
            }
        } catch (Exception error) {
            call.reject("Gemini Nano is unavailable on this device", "MODULE_LOAD_FAILED", error);
        }
    }
}
