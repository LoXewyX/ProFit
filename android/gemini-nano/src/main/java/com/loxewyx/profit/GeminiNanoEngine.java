package com.loxewyx.profit;

import android.content.Context;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.Content;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.ImagePart;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Loaded reflectively from the optional Play Feature Delivery module. */
public final class GeminiNanoEngine {
    private static final int MAX_PROMPT_CHARS = 14000;
    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private GeminiNanoEngine() { }

    private static GenerativeModelFutures model() {
        return GenerativeModelFutures.from(Generation.INSTANCE.getClient());
    }

    private static String statusName(int status) {
        if (status == FeatureStatus.AVAILABLE) return "available";
        if (status == FeatureStatus.DOWNLOADABLE) return "downloadable";
        if (status == FeatureStatus.DOWNLOADING) return "downloading";
        return "unavailable";
    }

    public static void checkAvailability(
        Context context,
        GeminiNanoResultCallback callback
    ) {
        EXECUTOR.execute(() -> {
            try {
                int status = model().checkStatus().get(30, TimeUnit.SECONDS);
                callback.onSuccess(statusName(status), "");
            } catch (Exception error) {
                callback.onSuccess("unavailable", "");
            }
        });
    }

    public static void downloadModel(
        Context context,
        GeminiNanoResultCallback callback
    ) {
        EXECUTOR.execute(() -> {
            try {
                GenerativeModelFutures generator = model();
                int status = generator.checkStatus().get(30, TimeUnit.SECONDS);
                if (status == FeatureStatus.AVAILABLE) {
                    callback.onSuccess("available", "");
                    return;
                }
                if (status != FeatureStatus.DOWNLOADABLE) {
                    callback.onSuccess(statusName(status), "");
                    return;
                }
                generator.download(new DownloadCallback() {
                    @Override
                    public void onDownloadStarted(long bytesToDownload) { }

                    @Override
                    public void onDownloadProgress(long totalBytesDownloaded) { }

                    @Override
                    public void onDownloadCompleted() {
                        callback.onSuccess("available", "");
                    }

                    @Override
                    public void onDownloadFailed(@NonNull GenAiException error) {
                        callback.onError("Gemini Nano download failed", "MODEL_DOWNLOAD_FAILED", error);
                    }
                });
            } catch (Exception error) {
                callback.onError("Gemini Nano download failed", "MODEL_DOWNLOAD_FAILED", error);
            }
        });
    }

    public static void generate(
        Context context,
        String prompt,
        String encodedImage,
        GeminiNanoResultCallback callback
    ) {
        String cleanPrompt = prompt == null ? "" : prompt.trim();
        if (cleanPrompt.isEmpty() || cleanPrompt.length() > MAX_PROMPT_CHARS) {
            callback.onError("Prompt is empty or too long", "INVALID_PROMPT", null);
            return;
        }
        EXECUTOR.execute(() -> {
            try {
                GenerativeModelFutures generator = model();
                int status = generator.checkStatus().get(30, TimeUnit.SECONDS);
                if (status != FeatureStatus.AVAILABLE) {
                    callback.onSuccess(statusName(status), "");
                    return;
                }

                Content.Builder content = new Content.Builder();
                if (encodedImage != null && !encodedImage.isEmpty()) {
                    String base64 = encodedImage.replaceFirst("^data:[^,]*,", "");
                    byte[] image = Base64.decode(base64, Base64.DEFAULT);
                    if (image.length == 0 || image.length > MAX_IMAGE_BYTES) {
                        callback.onError("Image is too large", "INVALID_IMAGE", null);
                        return;
                    }
                    content.addPart(new ImagePart(image));
                }
                content.addPart(new TextPart(cleanPrompt));
                GenerateContentRequest.Builder requestBuilder =
                    new GenerateContentRequest.Builder(content.build());
                requestBuilder.setTemperature(0.25f);
                GenerateContentResponse response = generator.generateContent(requestBuilder.build())
                    .get(180, TimeUnit.SECONDS);
                if (response.getCandidates() == null || response.getCandidates().isEmpty()) {
                    callback.onError("Gemini Nano returned no answer", "EMPTY_RESPONSE", null);
                    return;
                }
                String answer = response.getCandidates().get(0).getText();
                callback.onSuccess("available", answer == null ? "" : answer);
            } catch (Exception error) {
                callback.onError("Gemini Nano could not complete the request", "GENERATION_FAILED", error);
            }
        });
    }
}
