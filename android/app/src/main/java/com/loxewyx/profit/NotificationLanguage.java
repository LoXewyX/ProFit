package com.loxewyx.profit;

final class NotificationLanguage {
    private NotificationLanguage() {}

    static String text(String language, String spanish, String catalan, String english) {
        String value = language == null ? "" : language.toLowerCase(java.util.Locale.ROOT);
        if (value.startsWith("en")) return english;
        if (value.startsWith("ca")) return catalan;
        if (value.startsWith("es")) return spanish;
        return english;
    }
}
