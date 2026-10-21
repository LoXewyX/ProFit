package com.loxewyx.profit;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.AudioAttributes;
import android.net.Uri;

import android.app.NotificationChannel;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

final class NotificationBranding {
    private NotificationBranding() {}

    static Bitmap appIcon(Context context) {
        Drawable drawable = ContextCompat.getDrawable(context, R.mipmap.ic_launcher);
        if (drawable == null) return null;
        int size = Math.max(1, Math.round(64 * context.getResources().getDisplayMetrics().density));
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, size, size);
        drawable.draw(canvas);
        return bitmap;
    }

    static Uri notificationSoundUri(Context context) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.profit_notification);
    }

    static void configureNotificationChannel(NotificationChannel channel, Context context) {
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(notificationSoundUri(context), audioAttributes);
    }

    static void applyNotificationSound(NotificationCompat.Builder builder, Context context) {
        builder.setSound(notificationSoundUri(context));
    }
}
