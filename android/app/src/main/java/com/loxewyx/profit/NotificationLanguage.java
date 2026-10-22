package com.loxewyx.profit;

final class NotificationLanguage {
    private NotificationLanguage() {}

    static String text(String language, String spanish, String catalan, String english) {
        String value = language == null ? "" : language.toLowerCase(java.util.Locale.ROOT);
        if (value.startsWith("fr")) return translate(english, "fr");
        if (value.startsWith("de")) return translate(english, "de");
        if (value.startsWith("it")) return translate(english, "it");
        if (value.startsWith("en")) return english;
        if (value.startsWith("ca")) return catalan;
        if (value.startsWith("es")) return spanish;
        return english;
    }

    private static String translate(String english, String language) {
        String[] values;
        switch (english) {
            case "Hydration reminders": values = new String[] {"Rappels d’hydratation", "Trinkerinnerungen", "Promemoria idratazione"}; break;
            case "Periodic reminders to log your water intake": values = new String[] {"Rappels périodiques pour noter votre consommation d’eau", "Regelmäßige Erinnerungen zum Erfassen deiner Trinkmenge", "Promemoria periodici per registrare l’acqua bevuta"}; break;
            case "Time to hydrate": values = new String[] {"Pensez à vous hydrater", "Zeit, etwas zu trinken", "È il momento di bere"}; break;
            case "Have some water and log your progress in ProFit.": values = new String[] {"Buvez un peu d’eau et suivez votre progression dans ProFit.", "Trink etwas Wasser und erfasse deinen Fortschritt in ProFit.", "Bevi un po’ d’acqua e registra i tuoi progressi in ProFit."}; break;
            case "Weigh-in reminder": values = new String[] {"Rappel de pesée", "Wiegeerinnerung", "Promemoria pesata"}; break;
            case "Daily reminder to log your weight in ProFit": values = new String[] {"Rappel quotidien pour noter votre poids dans ProFit", "Tägliche Erinnerung, dein Gewicht in ProFit einzutragen", "Promemoria giornaliero per registrare il peso in ProFit"}; break;
            case "Time for your weigh-in": values = new String[] {"C’est l’heure de la pesée", "Zeit für deinen Wiegeeintrag", "È ora di pesarti"}; break;
            case "Log today’s weight and track your progress in ProFit.": values = new String[] {"Notez votre poids du jour et suivez votre progression dans ProFit.", "Trage dein heutiges Gewicht ein und verfolge deinen Fortschritt in ProFit.", "Registra il peso di oggi e segui i tuoi progressi in ProFit."}; break;
            case "Protein reminder": values = new String[] {"Rappel protéines", "Proteinerinnerung", "Promemoria proteine"}; break;
            case "Daily reminder to include protein in your diet": values = new String[] {"Rappel quotidien pour inclure des protéines dans votre alimentation", "Tägliche Erinnerung, Protein in deine Ernährung einzubauen", "Promemoria giornaliero per includere proteine nella tua alimentazione"}; break;
            case "Remember to include protein in your diet today.": values = new String[] {"Pensez à inclure des protéines dans votre alimentation aujourd’hui.", "Denk daran, heute Protein in deine Ernährung einzubauen.", "Ricordati di includere proteine nella tua alimentazione di oggi."}; break;
            case "Workout in progress": values = new String[] {"Entraînement en cours", "Training läuft", "Allenamento in corso"}; break;
            case "Workout paused": values = new String[] {"Entraînement en pause", "Training pausiert", "Allenamento in pausa"}; break;
            case "Timer for your active ProFit workout": values = new String[] {"Chronomètre de votre séance ProFit en cours", "Timer für dein aktuelles ProFit-Training", "Timer della sessione ProFit in corso"}; break;
            case "Resume": values = new String[] {"Reprendre", "Fortsetzen", "Riprendi"}; break;
            case "Pause": values = new String[] {"Mettre en pause", "Pausieren", "Pausa"}; break;
            default: return english;
        }
        return values[language.equals("fr") ? 0 : language.equals("de") ? 1 : 2];
    }
}
