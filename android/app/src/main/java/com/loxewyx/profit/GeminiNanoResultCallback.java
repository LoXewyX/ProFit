package com.loxewyx.profit;

public interface GeminiNanoResultCallback {
    void onSuccess(String status, String text);
    void onError(String message, String code, Throwable cause);
}
