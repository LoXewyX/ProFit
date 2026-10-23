package com.loxewyx.profit;

import android.os.Bundle;
import android.view.View;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkoutNotificationPlugin.class);
        registerPlugin(HydrationReminderPlugin.class);
        registerPlugin(WeighInReminderPlugin.class);
        registerPlugin(ProteinReminderPlugin.class);
        registerPlugin(AndroidSharePlugin.class);
        registerPlugin(AndroidNavigationPlugin.class);
        registerPlugin(RoutineLinkPlugin.class);
        registerPlugin(ProgressPhotosPlugin.class);
        super.onCreate(savedInstanceState);
        WeighInReminderPlugin.recordNotificationAction(this, getIntent());
        String initialRoutinePayload = routinePayload(getIntent());
        if (initialRoutinePayload != null)
            RoutineLinkPlugin.savePending(this, initialRoutinePayload);
        WorkoutNotificationPlugin.handleNotificationAction(this, getIntent(), getBridge().getWebView());
        // Disable Android's native edge stretch when the WebView reaches a scroll limit.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (AndroidNavigationPlugin.dispatchBackButton()) return;
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        boolean openWeighIn = WeighInReminderPlugin.recordNotificationAction(this, intent);
        String routinePayload = routinePayload(intent);
        if (routinePayload != null && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.location.hash='routine-plan=" + routinePayload + "'",
                null
            );
        }
        WorkoutNotificationPlugin.handleNotificationAction(this, intent, getBridge() == null ? null : getBridge().getWebView());
        if (openWeighIn && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('profit:open-weigh-in'))",
                null
            );
        }
    }

    private String routinePayload(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"profit".equals(data.getScheme()) || !"routine-plan".equals(data.getHost()))
            return null;
        String encoded = data.getLastPathSegment();
        return encoded != null && encoded.matches("[A-Za-z0-9_$-]+") ? encoded : null;
    }
}
