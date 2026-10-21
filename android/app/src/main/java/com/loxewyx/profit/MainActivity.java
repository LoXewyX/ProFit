package com.loxewyx.profit;

import android.os.Bundle;
import android.view.View;

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
        super.onCreate(savedInstanceState);
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
        WorkoutNotificationPlugin.handleNotificationAction(this, intent, getBridge() == null ? null : getBridge().getWebView());
    }
}
