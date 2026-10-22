import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import bundledExerciseLibrary from "../../../src/exercise-library.json";
import { getMuscleFocus, MuscleMap } from "../../../src/muscles.jsx";
import { ExerciseThumb } from "../../../src/ExerciseMedia.jsx";
import { exerciseDoseLabel, exerciseMuscleLine } from "../../../src/exercise-model.js";
import { activateLanguage, translateText } from "../../../src/i18n.js";
import { encodeRoutinePlan } from "../../../src/routine-link-codec.js";
import "./style.css";

const appUrl = "https://loxewyx.github.io/ProFit/";
const storageKey = "profit-routine-builder-v1";
const routineLinkPath = "routine-link.html";
const rawAssetRoot = "https://raw.githubusercontent.com/LoXewyX/ProFit/main/public/exercises";
const primaryMuscleOptions = ["Pecho", "Espalda", "Piernas", "Glúteos", "Hombros", "Bíceps", "Tríceps", "Antebrazo", "Abdominales", "Isquiotibiales", "Cuádriceps", "Pantorrillas", "Cuello"];
const equipmentOptions = ["Barra", "Mancuernas", "Polea", "Máquina", "Peso corporal", "Kettlebell", "Otro"];
const optionKey = (value) => String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const canonicalOption = (value, options) => options.find((option) => optionKey(option) === optionKey(value)) || "";
const cleanMuscleList = (value) => {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => canonicalOption(item, primaryMuscleOptions)).filter(Boolean))].slice(0, 12);
};
const cleanCustomExercise = (exercise) => {
  if (!exercise || typeof exercise !== "object" || typeof exercise.id !== "string" || !exercise.id.trim() || typeof exercise.name !== "string" || !exercise.name.trim()) return null;
  return {
    ...exercise,
    name: exercise.name.trim().slice(0, 80),
    muscle: canonicalOption(exercise.muscle, primaryMuscleOptions) || "Pecho",
    secondary: cleanMuscleList(exercise.secondary),
    equipment: canonicalOption(exercise.equipment, equipmentOptions) || "Otro",
  };
};
const blankExerciseDraft = { name: "", muscle: "", secondary: "", equipment: "Mancuernas", sets: "3", reps: "8–12", rest: "60", duration: "10", description: "", media: "", poster: "", mediaType: "video/mp4" };
const cleanExerciseDraft = (draft) => ({
  ...blankExerciseDraft,
  ...(draft && typeof draft === "object" ? draft : {}),
  muscle: canonicalOption(draft?.muscle, primaryMuscleOptions),
  secondary: cleanMuscleList(draft?.secondary).join(", "),
  equipment: canonicalOption(draft?.equipment, equipmentOptions) || "Mancuernas",
});
const cleanBundledExercise = (exercise) => {
  if (!exercise || typeof exercise !== "object" || typeof exercise.id !== "string" || !exercise.id.trim() || typeof exercise.name !== "string" || !exercise.name.trim()) return null;
  const muscle = canonicalOption(exercise.muscle, primaryMuscleOptions);
  if (!muscle) return null;
  return {
    ...exercise,
    name: exercise.name.trim().slice(0, 80),
    muscle,
    secondary: cleanMuscleList(exercise.secondary),
    equipment: canonicalOption(exercise.equipment, equipmentOptions) || "Otro",
  };
};
const exerciseLibrary = bundledExerciseLibrary.map(cleanBundledExercise).filter(Boolean);
const CopyLinkIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
const OpenAppIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 5h6v6" /><path d="m19 5-9 9" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
const exercisePoster = (exercise) => exercise?.assetId && exercise.poster ? `${rawAssetRoot}/posters/${exercise.assetId}.webp` : "";
const exerciseVideo = (exercise) => exercise?.assetId && exercise.media ? `${rawAssetRoot}/${exercise.assetId}.webm` : "";
const exerciseMedia = (exercise) => exercise?.custom ? exercise.media || "" : exerciseVideo(exercise);
const exercisePreview = (exercise) => exercise?.custom ? exercise.poster || "" : exercisePoster(exercise);
const isVideoExercise = (exercise) => exercise?.mediaType ? exercise.mediaType.startsWith("video/") : /\.(mp4|webm|mov)(?:$|[?#])/i.test(exerciseMedia(exercise));
const remoteExercise = (exercise) => ({ ...exercise, name: exercise?.custom ? exercise.name : translateText(exercise?.name || ""), media: exerciseMedia(exercise), poster: exercisePreview(exercise), mediaType: exercise?.custom ? exercise.mediaType || "" : exerciseVideo(exercise) ? "video/webm" : "" });
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const languages = ["en", "es", "ca", "fr", "de", "it"];
const readSavedBuilder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved || saved.version !== 1) return {};
    return saved;
  } catch {
    return {};
  }
};
const safeHttpUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const boundedNumber = (value, min, max, fallback) => {
  const number = value === "" || value === null ? Number.NaN : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const messages = {
  en: { title: "Routine builder", sub: "Build your training plan", choose: "Choose a routine", addRoutine: "New routine", name: "Routine name", group: "Group", noGroup: "No group", newGroup: "Create group", groupName: "New group name", add: "Add", exercises: "Exercises", search: "Search exercises, muscles, equipment…", allMuscles: "All muscles", newExercise: "Create exercise", empty: "No exercises in this routine yet. Add one from the library or create your own.", sets: "Sets", reps: "Reps / target", rest: "Rest (sec)", comment: "Exercise note (optional)", notePlaceholder: "Add a cue or reminder…", delete: "Remove", up: "Move up", down: "Move down", library: "Exercise library", saveExercise: "Save exercise", muscle: "Primary muscle", secondary: "Secondary muscles", equipment: "Equipment", description: "Instructions", cancel: "Cancel", createPlan: "Create from a preset", full: "Full body", upper: "Upper / lower", ppl: "Push / pull / legs", days: "Days per week", level: "Experience", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", presetApply: "Use preset", link: "Shareable link", destination: "Link destination", installed: "Android app", web: "ProFit web app", github: "GitHub repository", makeLink: "Generate link", copy: "Copy link", copied: "Link copied", open: "Open in app", footer: "The plan is encoded in the link. No account or external service is used.", warning: "Install the latest app version to import custom exercises from this builder.", required: "Add a name and at least one exercise before sharing.", enterGroup: "Enter a group name.", exName: "Exercise name", duration: "Estimated minutes", saved: "Exercise added", routine: "Routine", appOnly: "Use Android to open the installed app. Choose ProFit web app or GitHub to create a browser link.", limitRoutines: "A plan can contain up to seven routines.", limitExercises: "A routine can contain up to 30 exercises." },
  es: { title: "Creador de rutinas", sub: "Diseña tu plan de entrenamiento", choose: "Elige una rutina", addRoutine: "Nueva rutina", name: "Nombre de la rutina", group: "Grupo", noGroup: "Sin grupo", newGroup: "Crear grupo", groupName: "Nombre del nuevo grupo", add: "Añadir", exercises: "Ejercicios", search: "Buscar ejercicios, músculos, equipo…", allMuscles: "Todos los músculos", newExercise: "Crear ejercicio", empty: "Todavía no hay ejercicios en esta rutina. Añade uno de la biblioteca o crea uno propio.", sets: "Series", reps: "Reps / objetivo", rest: "Descanso (s)", comment: "Comentario del ejercicio (opcional)", notePlaceholder: "Añade una indicación o recordatorio…", delete: "Quitar", up: "Subir", down: "Bajar", library: "Biblioteca de ejercicios", saveExercise: "Guardar ejercicio", muscle: "Músculo principal", secondary: "Músculos secundarios", equipment: "Equipamiento", description: "Indicaciones", cancel: "Cancelar", createPlan: "Crear desde una plantilla", full: "Cuerpo completo", upper: "Tren superior / inferior", ppl: "Empuje / tracción / piernas", days: "Días por semana", level: "Experiencia", beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado", presetApply: "Usar plantilla", link: "Enlace para compartir", destination: "Destino del enlace", installed: "App Android", web: "App web de ProFit", github: "Repositorio GitHub", makeLink: "Generar enlace", copy: "Copiar enlace", copied: "Enlace copiado", open: "Abrir en la app", footer: "El plan se codifica en el enlace. No se usan cuentas ni servicios externos.", warning: "Instala la versión más reciente de la app para importar ejercicios personalizados.", required: "Añade un nombre y al menos un ejercicio antes de compartir.", enterGroup: "Escribe el nombre del grupo.", exName: "Nombre del ejercicio", duration: "Minutos estimados", saved: "Ejercicio añadido", routine: "Rutina", appOnly: "Usa Android para abrir la app instalada. Elige App web o GitHub para generar un enlace de navegador.", limitRoutines: "El plan admite hasta siete rutinas.", limitExercises: "Cada rutina admite hasta 30 ejercicios." },
  ca: { title: "Creador de rutines", sub: "Dissenya el teu pla d’entrenament", choose: "Tria una rutina", addRoutine: "Nova rutina", name: "Nom de la rutina", group: "Grup", noGroup: "Sense grup", newGroup: "Crea un grup", groupName: "Nom del grup nou", add: "Afegeix", exercises: "Exercicis", search: "Cerca exercicis, músculs, equipament…", allMuscles: "Tots els músculs", newExercise: "Crea un exercici", empty: "Encara no hi ha exercicis en aquesta rutina. Afegeix-ne un de la biblioteca o crea’n un.", sets: "Sèries", reps: "Reps / objectiu", rest: "Descans (s)", comment: "Comentari de l’exercici (opcional)", notePlaceholder: "Afegeix una indicació o recordatori…", delete: "Treu", up: "Puja", down: "Baixa", library: "Biblioteca d’exercicis", saveExercise: "Desa l’exercici", muscle: "Múscul principal", secondary: "Músculs secundaris", equipment: "Equipament", description: "Indicacions", cancel: "Cancel·la", createPlan: "Crea des d’una plantilla", full: "Cos complet", upper: "Tren superior / inferior", ppl: "Empenta / tracció / cames", days: "Dies per setmana", level: "Experiència", beginner: "Principiant", intermediate: "Intermedi", advanced: "Avançat", presetApply: "Usa la plantilla", link: "Enllaç per compartir", destination: "Destinació de l’enllaç", installed: "App Android", web: "App web de ProFit", github: "Repositori GitHub", makeLink: "Genera l’enllaç", copy: "Copia l’enllaç", copied: "Enllaç copiat", open: "Obre a l’app", footer: "El pla s’inclou a l’enllaç. No s’utilitzen comptes ni serveis externs.", warning: "Cal tenir l’app actualitzada per importar exercicis personalitzats.", required: "Afegeix un nom i almenys un exercici abans de compartir.", enterGroup: "Escriu el nom del grup.", exName: "Nom de l’exercici", duration: "Minuts estimats", saved: "Exercici afegit", routine: "Rutina", appOnly: "Fes servir Android per obrir l’app instal·lada. Tria l’app web o GitHub per generar un enllaç de navegador.", limitRoutines: "El pla admet fins a set rutines.", limitExercises: "Cada rutina admet fins a 30 exercicis." },
  fr: { title: "Créateur de programmes", sub: "Composez votre programme d’entraînement", choose: "Choisir une séance", addRoutine: "Nouvelle séance", name: "Nom de la séance", group: "Groupe", noGroup: "Sans groupe", newGroup: "Créer un groupe", groupName: "Nom du nouveau groupe", add: "Ajouter", exercises: "Exercices", search: "Rechercher exercices, muscles, équipement…", allMuscles: "Tous les muscles", newExercise: "Créer un exercice", empty: "Aucun exercice pour le moment. Ajoutez-en un depuis la bibliothèque ou créez le vôtre.", sets: "Séries", reps: "Répétitions / objectif", rest: "Repos (s)", comment: "Note sur l’exercice (facultatif)", notePlaceholder: "Ajouter un conseil ou rappel…", delete: "Retirer", up: "Monter", down: "Descendre", library: "Bibliothèque d’exercices", saveExercise: "Enregistrer l’exercice", muscle: "Muscle principal", secondary: "Muscles secondaires", equipment: "Équipement", description: "Instructions", cancel: "Annuler", createPlan: "Créer depuis un modèle", full: "Corps complet", upper: "Haut / bas du corps", ppl: "Poussée / tirage / jambes", days: "Jours par semaine", level: "Expérience", beginner: "Débutant", intermediate: "Intermédiaire", advanced: "Avancé", presetApply: "Utiliser le modèle", link: "Lien de partage", destination: "Destination du lien", installed: "Application Android", web: "Application web ProFit", github: "Dépôt GitHub", makeLink: "Générer le lien", copy: "Copier le lien", copied: "Lien copié", open: "Ouvrir dans l’app", footer: "Le programme est encodé dans le lien. Aucun compte ni service externe.", warning: "Mettez l’application à jour pour importer les exercices personnalisés.", required: "Ajoutez un nom et au moins un exercice avant de partager.", enterGroup: "Saisissez le nom du groupe.", exName: "Nom de l’exercice", duration: "Durée estimée (min)", saved: "Exercice ajouté", routine: "Séance", appOnly: "Sur Android, ouvrez l’application installée. Choisissez l’application web ou GitHub pour créer un lien navigateur.", limitRoutines: "Un plan peut contenir jusqu’à sept séances.", limitExercises: "Une séance peut contenir jusqu’à 30 exercices." },
  de: { title: "Trainingsplan erstellen", sub: "Stelle deinen Trainingsplan zusammen", choose: "Training auswählen", addRoutine: "Neues Training", name: "Trainingsname", group: "Gruppe", noGroup: "Ohne Gruppe", newGroup: "Gruppe erstellen", groupName: "Name der neuen Gruppe", add: "Hinzufügen", exercises: "Übungen", search: "Übungen, Muskeln, Geräte suchen…", allMuscles: "Alle Muskeln", newExercise: "Übung erstellen", empty: "Noch keine Übungen in diesem Training. Füge eine aus der Bibliothek hinzu oder erstelle eine eigene.", sets: "Sätze", reps: "Wdh. / Ziel", rest: "Pause (Sek.)", comment: "Übungshinweis (optional)", notePlaceholder: "Hinweis oder Erinnerung hinzufügen…", delete: "Entfernen", up: "Nach oben", down: "Nach unten", library: "Übungsbibliothek", saveExercise: "Übung speichern", muscle: "Hauptmuskel", secondary: "Sekundärmuskeln", equipment: "Ausrüstung", description: "Anleitung", cancel: "Abbrechen", createPlan: "Vorlage auswählen", full: "Ganzkörper", upper: "Oberkörper / Unterkörper", ppl: "Drücken / Ziehen / Beine", days: "Trainingstage pro Woche", level: "Erfahrung", beginner: "Anfänger", intermediate: "Mittelstufe", advanced: "Fortgeschritten", presetApply: "Vorlage anwenden", link: "Freigabelink", destination: "Linkziel", installed: "Android-App", web: "ProFit-Web-App", github: "GitHub-Repository", makeLink: "Link erstellen", copy: "Link kopieren", copied: "Link kopiert", open: "In der App öffnen", footer: "Der Plan ist im Link enthalten. Kein Konto oder externer Dienst nötig.", warning: "Aktualisiere die App, um eigene Übungen zu importieren.", required: "Gib vor dem Teilen einen Namen ein und füge mindestens eine Übung hinzu.", enterGroup: "Gib einen Gruppennamen ein.", exName: "Übungsname", duration: "Geschätzte Minuten", saved: "Übung hinzugefügt", routine: "Training", appOnly: "Unter Android öffnet sich die installierte App. Für einen Browserlink die Web-App oder GitHub wählen.", limitRoutines: "Ein Plan kann bis zu sieben Trainingseinheiten enthalten.", limitExercises: "Eine Einheit kann bis zu 30 Übungen enthalten." },
  it: { title: "Crea una routine", sub: "Componi il tuo programma di allenamento", choose: "Scegli un allenamento", addRoutine: "Nuovo allenamento", name: "Nome dell’allenamento", group: "Gruppo", noGroup: "Senza gruppo", newGroup: "Crea gruppo", groupName: "Nome del nuovo gruppo", add: "Aggiungi", exercises: "Esercizi", search: "Cerca esercizi, muscoli, attrezzatura…", allMuscles: "Tutti i muscoli", newExercise: "Crea esercizio", empty: "Ancora nessun esercizio. Aggiungine uno dalla libreria o creane uno.", sets: "Serie", reps: "Ripetizioni / obiettivo", rest: "Recupero (s)", comment: "Nota sull’esercizio (facoltativa)", notePlaceholder: "Aggiungi un’indicazione o un promemoria…", delete: "Rimuovi", up: "Sposta su", down: "Sposta giù", library: "Libreria esercizi", saveExercise: "Salva esercizio", muscle: "Muscolo principale", secondary: "Muscoli secondari", equipment: "Attrezzatura", description: "Istruzioni", cancel: "Annulla", createPlan: "Crea da un modello", full: "Corpo intero", upper: "Parte superiore / inferiore", ppl: "Spinta / trazione / gambe", days: "Giorni a settimana", level: "Esperienza", beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzato", presetApply: "Usa modello", link: "Link di condivisione", destination: "Destinazione del link", installed: "App Android", web: "App web ProFit", github: "Repository GitHub", makeLink: "Genera link", copy: "Copia link", copied: "Link copiato", open: "Apri nell’app", footer: "Il programma è codificato nel link. Nessun account o servizio esterno.", warning: "Aggiorna l’app per importare gli esercizi personalizzati.", required: "Aggiungi un nome e almeno un esercizio prima di condividere.", enterGroup: "Inserisci il nome del gruppo.", exName: "Nome esercizio", duration: "Minuti stimati", saved: "Esercizio aggiunto", routine: "Allenamento", appOnly: "Su Android si apre l’app installata. Scegli l’app web o GitHub per creare un link del browser.", limitRoutines: "Il piano può contenere fino a sette allenamenti.", limitExercises: "Ogni allenamento può contenere fino a 30 esercizi." },
};

const routineDefaultName = { en: "Routine", es: "Rutina", ca: "Rutina", fr: "Séance", de: "Training", it: "Allenamento" };
const demoMessages = {
  en: { demo: "Exercise demo", noDemo: "No video demo available for this movement.", muscles: "Muscles", equipment: "Equipment", instructions: "How to perform", add: "Add to routine", added: "Already added", close: "Close", done: "Done", navPlan: "Plan", navLibrary: "Exercises", navShare: "Share", protected: "Routine 1 is always kept", showMore: "Show more", showAll: "Show all", result: "matching exercises", groups: "Muscle groups", noMuscles: "Add exercises to see your muscle map", empty: "No movements match those filters." },
  es: { demo: "Demostración del ejercicio", noDemo: "Este movimiento no tiene vídeo de demostración.", muscles: "Músculos", equipment: "Equipamiento", instructions: "Cómo realizarlo", add: "Añadir a la rutina", added: "Ya añadido", close: "Cerrar", done: "Listo", navPlan: "Rutina", navLibrary: "Ejercicios", navShare: "Compartir", protected: "La rutina 1 siempre se conserva", showMore: "Mostrar más", showAll: "Mostrar todos", result: "ejercicios encontrados", groups: "Grupos musculares", noMuscles: "Añade ejercicios para ver el mapa muscular", empty: "No hay ejercicios que coincidan con esos filtros." },
  ca: { demo: "Demostració de l’exercici", noDemo: "Aquest moviment no té vídeo de demostració.", muscles: "Músculs", equipment: "Equipament", instructions: "Com fer-lo", add: "Afegeix a la rutina", added: "Ja afegit", close: "Tanca", done: "Fet", navPlan: "Rutina", navLibrary: "Exercicis", navShare: "Comparteix", protected: "La rutina 1 sempre es conserva", showMore: "Mostra’n més", showAll: "Mostra’ls tots", result: "exercicis trobats", groups: "Grups musculars", noMuscles: "Afegeix exercicis per veure el mapa muscular", empty: "No hi ha exercicis que coincideixin amb els filtres." },
  fr: { demo: "Démonstration de l’exercice", noDemo: "Aucune vidéo de démonstration pour ce mouvement.", muscles: "Muscles", equipment: "Équipement", instructions: "Exécution", add: "Ajouter à la séance", added: "Déjà ajouté", close: "Fermer", done: "Terminé", navPlan: "Programme", navLibrary: "Exercices", navShare: "Partager", protected: "La séance 1 est toujours conservée", showMore: "Afficher plus", showAll: "Tout afficher", result: "exercices correspondants", groups: "Groupes musculaires", noMuscles: "Ajoutez des exercices pour voir la carte musculaire", empty: "Aucun exercice ne correspond aux filtres." },
  de: { demo: "Übungsdemo", noDemo: "Für diese Übung ist kein Demovideo verfügbar.", muscles: "Muskeln", equipment: "Ausrüstung", instructions: "Ausführung", add: "Zum Training hinzufügen", added: "Bereits hinzugefügt", close: "Schließen", done: "Fertig", navPlan: "Plan", navLibrary: "Übungen", navShare: "Teilen", protected: "Training 1 bleibt immer erhalten", showMore: "Mehr anzeigen", showAll: "Alle anzeigen", result: "passende Übungen", groups: "Muskelgruppen", noMuscles: "Füge Übungen hinzu, um die Muskelkarte zu sehen", empty: "Keine Übungen passen zu diesen Filtern." },
  it: { demo: "Dimostrazione esercizio", noDemo: "Nessun video dimostrativo per questo esercizio.", muscles: "Muscoli", equipment: "Attrezzatura", instructions: "Esecuzione", add: "Aggiungi all’allenamento", added: "Già aggiunto", close: "Chiudi", done: "Fatto", navPlan: "Piano", navLibrary: "Esercizi", navShare: "Condividi", protected: "L’allenamento 1 viene sempre mantenuto", showMore: "Mostra altri", showAll: "Mostra tutti", result: "esercizi corrispondenti", groups: "Gruppi muscolari", noMuscles: "Aggiungi esercizi per visualizzare la mappa muscolare", empty: "Nessun esercizio corrisponde ai filtri." },
};
const builderMessages = {
  en: { clearAll: "Clear all data", clearTitle: "Clear this builder?", clearBody: "This removes saved routines, groups, custom exercises and preferences from this browser. Built-in exercises remain available.", clearConfirm: "Clear data", cleared: "Saved builder data cleared", edit: "Edit", deleteCustom: "Delete custom exercise", deleteTitle: "Delete this exercise?", deleteBody: "It will also be removed from routines in this builder.", saveChanges: "Save changes", media: "Demo media (optional)", demoUrl: "Public video or image URL", mediaType: "Media type", posterUrl: "Public preview image URL", mediaHelp: "Use public HTTPS links. Media is referenced by URL, so it stays small enough to share with the routine.", invalidUrl: "Enter a valid public HTTP or HTTPS URL.", share: "Share", localSaved: "Saved on this device", storageError: "Browser storage is full. Remove large media URLs or clear old data.", endpointHelp: "This link opens the ProFit app on Android and carries the routine. Other devices open the web app.", groupLimit: "You can create up to 20 groups.", customLimit: "You can create up to 100 custom exercises.", exerciseUpdated: "Exercise updated", linkTooLarge: "This plan is too large to share. Remove some exercises or shorten notes and media URLs.", sharePlan: "Open this workout plan in ProFit." },
  es: { clearAll: "Borrar todos los datos", clearTitle: "¿Borrar los datos del creador?", clearBody: "Se borrarán de este navegador las rutinas, los grupos, los ejercicios creados y las preferencias. La biblioteca integrada seguirá disponible.", clearConfirm: "Borrar datos", cleared: "Datos guardados borrados", edit: "Editar", deleteCustom: "Eliminar ejercicio propio", deleteTitle: "¿Eliminar este ejercicio?", deleteBody: "También se quitará de las rutinas de este creador.", saveChanges: "Guardar cambios", media: "Demostración multimedia (opcional)", demoUrl: "URL pública de vídeo o imagen", mediaType: "Tipo de archivo", posterUrl: "URL pública de imagen de vista previa", mediaHelp: "Usa enlaces públicos HTTPS. El archivo se referencia por URL y así el enlace de la rutina sigue siendo pequeño.", invalidUrl: "Introduce una URL pública HTTP o HTTPS válida.", share: "Compartir", localSaved: "Guardado en este dispositivo", storageError: "El almacenamiento del navegador está lleno. Quita enlaces multimedia largos o borra datos antiguos.", endpointHelp: "En Android, el enlace abre ProFit con la rutina. En otros dispositivos abre la app web.", groupLimit: "Puedes crear hasta 20 grupos.", customLimit: "Puedes crear hasta 100 ejercicios propios.", exerciseUpdated: "Ejercicio actualizado", linkTooLarge: "El plan es demasiado grande para compartirlo. Quita ejercicios o acorta notas y enlaces multimedia.", sharePlan: "Abre este plan de entrenamiento en ProFit." },
  ca: { clearAll: "Esborra totes les dades", clearTitle: "Vols esborrar les dades del creador?", clearBody: "S’esborraran d’aquest navegador les rutines, els grups, els exercicis creats i les preferències. La biblioteca integrada es conservarà.", clearConfirm: "Esborra les dades", cleared: "S’han esborrat les dades desades", edit: "Edita", deleteCustom: "Elimina l’exercici propi", deleteTitle: "Vols eliminar aquest exercici?", deleteBody: "També se suprimirà de les rutines d’aquest creador.", saveChanges: "Desa els canvis", media: "Demostració multimèdia (opcional)", videoUrl: "URL pública del vídeo", posterUrl: "URL pública de la imatge", mediaHelp: "Fes servir enllaços públics HTTPS. El fitxer es referencia per URL i l’enllaç de la rutina continua sent petit.", invalidUrl: "Introdueix una URL pública HTTP o HTTPS vàlida.", share: "Comparteix", localSaved: "Desat en aquest dispositiu", storageError: "L’emmagatzematge del navegador és ple. Treu enllaços multimèdia llargs o esborra dades antigues.", endpointHelp: "A Android, l’enllaç obre ProFit amb la rutina. En altres dispositius obre l’app web.", groupLimit: "Pots crear fins a 20 grups.", customLimit: "Pots crear fins a 100 exercicis propis.", exerciseUpdated: "Exercici actualitzat", linkTooLarge: "El pla és massa gran per compartir-lo. Treu exercicis o escurça les notes i els enllaços multimèdia.", sharePlan: "Obre aquest pla d’entrenament a ProFit." },
  fr: { clearAll: "Effacer toutes les données", clearTitle: "Effacer les données du créateur ?", clearBody: "Les séances, groupes, exercices personnalisés et préférences enregistrés dans ce navigateur seront supprimés. La bibliothèque intégrée restera disponible.", clearConfirm: "Effacer les données", cleared: "Données enregistrées effacées", edit: "Modifier", deleteCustom: "Supprimer l’exercice personnalisé", deleteTitle: "Supprimer cet exercice ?", deleteBody: "Il sera également retiré des séances de ce créateur.", saveChanges: "Enregistrer", media: "Démonstration média (facultatif)", videoUrl: "URL publique de la vidéo", posterUrl: "URL publique de l’image", mediaHelp: "Utilisez des liens HTTPS publics. Le média reste référencé par URL afin de garder un lien de séance léger.", invalidUrl: "Saisissez une URL HTTP ou HTTPS publique valide.", share: "Partager", localSaved: "Enregistré sur cet appareil", storageError: "Le stockage du navigateur est plein. Supprimez de longs liens média ou effacez les anciennes données.", endpointHelp: "Sur Android, ce lien ouvre ProFit avec la séance. Sur les autres appareils, il ouvre l’application web.", groupLimit: "Vous pouvez créer jusqu’à 20 groupes.", customLimit: "Vous pouvez créer jusqu’à 100 exercices personnalisés.", exerciseUpdated: "Exercice modifié", linkTooLarge: "Ce programme est trop volumineux pour être partagé. Supprimez des exercices ou raccourcissez les notes et liens média.", sharePlan: "Ouvrez ce programme d’entraînement dans ProFit." },
  de: { clearAll: "Alle Daten löschen", clearTitle: "Builder-Daten löschen?", clearBody: "Gespeicherte Trainings, Gruppen, eigene Übungen und Einstellungen in diesem Browser werden entfernt. Die integrierte Übungsbibliothek bleibt erhalten.", clearConfirm: "Daten löschen", cleared: "Gespeicherte Builder-Daten gelöscht", edit: "Bearbeiten", deleteCustom: "Eigene Übung löschen", deleteTitle: "Diese Übung löschen?", deleteBody: "Sie wird auch aus den Trainings in diesem Builder entfernt.", saveChanges: "Änderungen speichern", media: "Demomedien (optional)", videoUrl: "Öffentliche Video-URL", posterUrl: "Öffentliche Bild-URL", mediaHelp: "Verwende öffentliche HTTPS-Links. Das Medium bleibt eine URL, damit der Trainingslink klein bleibt.", invalidUrl: "Gib eine gültige öffentliche HTTP- oder HTTPS-URL ein.", share: "Teilen", localSaved: "Auf diesem Gerät gespeichert", storageError: "Der Browser-Speicher ist voll. Entferne lange Medienlinks oder lösche alte Daten.", endpointHelp: "Unter Android öffnet der Link ProFit mit dem Training. Auf anderen Geräten öffnet er die Web-App.", groupLimit: "Du kannst bis zu 20 Gruppen erstellen.", customLimit: "Du kannst bis zu 100 eigene Übungen erstellen.", exerciseUpdated: "Übung aktualisiert", linkTooLarge: "Dieser Plan ist zu groß zum Teilen. Entferne Übungen oder kürze Notizen und Medienlinks.", sharePlan: "Öffne diesen Trainingsplan in ProFit." },
  it: { clearAll: "Elimina tutti i dati", clearTitle: "Eliminare i dati del creatore?", clearBody: "Le routine, i gruppi, gli esercizi personalizzati e le preferenze salvati in questo browser verranno eliminati. La libreria integrata resterà disponibile.", clearConfirm: "Elimina dati", cleared: "Dati salvati eliminati", edit: "Modifica", deleteCustom: "Elimina esercizio personalizzato", deleteTitle: "Eliminare questo esercizio?", deleteBody: "Verrà rimosso anche dalle routine create qui.", saveChanges: "Salva modifiche", media: "Media dimostrativi (facoltativi)", videoUrl: "URL pubblico del video", posterUrl: "URL pubblica dell’immagine", mediaHelp: "Usa link HTTPS pubblici. Il media viene referenziato tramite URL per mantenere piccolo il link della routine.", invalidUrl: "Inserisci un URL HTTP o HTTPS pubblico valido.", share: "Condividi", localSaved: "Salvato su questo dispositivo", storageError: "Lo spazio del browser è esaurito. Rimuovi link multimediali lunghi o elimina i vecchi dati.", endpointHelp: "Su Android, il link apre ProFit con la routine. Sugli altri dispositivi apre l’app web.", groupLimit: "Puoi creare fino a 20 gruppi.", customLimit: "Puoi creare fino a 100 esercizi personalizzati.", exerciseUpdated: "Esercizio aggiornato", linkTooLarge: "Il piano è troppo grande da condividere. Rimuovi esercizi o accorcia note e link multimediali.", sharePlan: "Apri questo piano di allenamento in ProFit." },
};
const mediaLabelMessages = {
  ca: { demoUrl: "URL pública de vídeo o imatge", mediaType: "Tipus de fitxer", posterUrl: "URL pública de la imatge de vista prèvia" },
  fr: { demoUrl: "URL publique de vidéo ou d’image", mediaType: "Type de média", posterUrl: "URL publique de l’image d’aperçu" },
  de: { demoUrl: "Öffentliche Video- oder Bild-URL", mediaType: "Medientyp", posterUrl: "Öffentliche URL des Vorschaubilds" },
  it: { demoUrl: "URL pubblica di video o immagine", mediaType: "Tipo di media", posterUrl: "URL pubblica dell’immagine di anteprima" },
};
const mediaKindMessages = {
  en: { video: "Video", image: "Image" }, es: { video: "Vídeo", image: "Imagen" }, ca: { video: "Vídeo", image: "Imatge" }, fr: { video: "Vidéo", image: "Image" }, de: { video: "Video", image: "Bild" }, it: { video: "Video", image: "Immagine" },
};
const shareFooterMessages = {
  en: "Routine data travels in the link. No account is needed.", es: "Los datos de la rutina viajan en el enlace. No necesitas una cuenta.", ca: "Les dades de la rutina viatgen a l’enllaç. No cal cap compte.", fr: "Les données de la séance sont dans le lien. Aucun compte n’est nécessaire.", de: "Die Trainingsdaten sind im Link enthalten. Ein Konto ist nicht erforderlich.", it: "I dati della routine sono nel link. Non serve un account.",
};
const newRoutine = (index = 1, language = "en") => ({ id: `routine-${uuid()}`, name: `${routineDefaultName[language] || routineDefaultName.en} ${index}`, group: "", exercises: [], exerciseSettings: {} });
const muscleNames = [...new Set(exerciseLibrary.map((exercise) => exercise.muscle).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const presetWorkouts = {
  full: [
    ["library-020", "library-382", "library-205", "library-244", "library-032", "library-256"],
    ["library-302", "library-106", "library-162", "library-244", "library-032", "library-256"],
    ["library-020", "library-382", "library-106", "library-162", "library-032", "library-256"],
  ],
  upper: [
    ["library-020", "library-205", "library-244", "library-106", "library-032"],
    ["library-382", "library-302", "library-162", "library-256"],
  ],
  ppl: [
    ["library-020", "library-244", "library-032"],
    ["library-205", "library-106", "library-302"],
    ["library-382", "library-162", "library-256"],
  ],
};
const presetLabels = {
  en: { full: ["Full body A", "Full body B", "Full body C"], upper: ["Upper body", "Lower body"], ppl: ["Push", "Pull", "Legs"] },
  es: { full: ["Cuerpo completo A", "Cuerpo completo B", "Cuerpo completo C"], upper: ["Tren superior", "Tren inferior"], ppl: ["Empuje", "Tracción", "Piernas"] },
  ca: { full: ["Cos complet A", "Cos complet B", "Cos complet C"], upper: ["Tren superior", "Tren inferior"], ppl: ["Empenta", "Tracció", "Cames"] },
  fr: { full: ["Corps complet A", "Corps complet B", "Corps complet C"], upper: ["Haut du corps", "Bas du corps"], ppl: ["Poussée", "Tirage", "Jambes"] },
  de: { full: ["Ganzkörper A", "Ganzkörper B", "Ganzkörper C"], upper: ["Oberkörper", "Unterkörper"], ppl: ["Drücken", "Ziehen", "Beine"] },
  it: { full: ["Corpo intero A", "Corpo intero B", "Corpo intero C"], upper: ["Parte superiore", "Parte inferiore"], ppl: ["Spinta", "Trazione", "Gambe"] },
};
const chooseLanguage = () => {
  for (const value of navigator.languages || [navigator.language]) {
    const code = String(value || "").toLowerCase().split("-")[0];
    if (languages.includes(code)) return code;
  }
  return "en";
};

function App() {
  const [savedState] = useState(readSavedBuilder);
  const [language, setLanguage] = useState(() => languages.includes(savedState.language) ? savedState.language : chooseLanguage());
  const builderText = { ...builderMessages[language], ...(mediaLabelMessages[language] || {}), ...mediaKindMessages[language] };
  const t = messages[language];
  const demoText = demoMessages[language];
  activateLanguage(language);
  const [startingRoutines] = useState(() => {
    const stored = Array.isArray(savedState.routines) ? savedState.routines.filter((routine) => routine && typeof routine.id === "string" && Array.isArray(routine.exercises)).slice(0, 7) : [];
    return stored.length ? stored : [newRoutine(1, language)];
  });
  const [routines, setRoutines] = useState(startingRoutines);
  const [activeId, setActiveId] = useState(() => startingRoutines.some((routine) => routine.id === savedState.activeId) ? savedState.activeId : startingRoutines[0].id);
  const [groups, setGroups] = useState(() => Array.isArray(savedState.groups) ? savedState.groups.slice(0, 20) : []);
  const [groupDraft, setGroupDraft] = useState(() => savedState.groupDraft || "");
  const [librarySearch, setLibrarySearch] = useState(() => savedState.librarySearch || "");
  const [muscleFilter, setMuscleFilter] = useState(() => savedState.muscleFilter || "");
  const [libraryLimit, setLibraryLimit] = useState(() => boundedNumber(savedState.libraryLimit, 60, 300, 60));
  const [customExercises, setCustomExercises] = useState(() => Array.isArray(savedState.customExercises) ? savedState.customExercises.slice(0, 100).map(cleanCustomExercise).filter(Boolean) : []);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(() => Boolean(savedState.exercisePickerOpen));
  const [exerciseModal, setExerciseModal] = useState(() => Boolean(savedState.exerciseModal));
  const [selectedDemo, setSelectedDemo] = useState(null);
  const [exerciseDraft, setExerciseDraft] = useState(() => cleanExerciseDraft(savedState.exerciseDraft));
  const [editingExerciseId, setEditingExerciseId] = useState(() => savedState.editingExerciseId || "");
  const [pendingExerciseDelete, setPendingExerciseDelete] = useState("");
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [preset, setPreset] = useState(() => ["full", "upper", "ppl"].includes(savedState.preset) ? savedState.preset : "full");
  const [presetDays, setPresetDays] = useState(() => boundedNumber(savedState.presetDays, 2, 6, 3));
  const [presetLevel, setPresetLevel] = useState(() => ["beginner", "intermediate", "advanced"].includes(savedState.presetLevel) ? savedState.presetLevel : "beginner");
  const [shareUrl, setShareUrl] = useState(() => savedState.shareUrl || "");
  const [toast, setToast] = useState("");
  const [mobileSection, setMobileSection] = useState("routine-panel");
  const activeRoutine = routines.find((routine) => routine.id === activeId) || routines[0];
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, language, routines, activeId, groups, groupDraft, librarySearch, muscleFilter, libraryLimit, customExercises, exerciseDraft, editingExerciseId, exercisePickerOpen, exerciseModal, preset, presetDays, presetLevel, shareUrl }));
      } catch {
        setToast(builderMessages[language].storageError);
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [language, routines, activeId, groups, groupDraft, librarySearch, muscleFilter, libraryLimit, customExercises, exerciseDraft, editingExerciseId, exercisePickerOpen, exerciseModal, preset, presetDays, presetLevel, shareUrl]);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => {
      const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (current) setMobileSection(current.target.id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: 0 });
    ["routine-panel", "share-panel"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);
  const allExercises = useMemo(() => [...customExercises, ...exerciseLibrary], [customExercises]);
  const tExercise = (id) => allExercises.find((exercise) => exercise.id === id);
  const exerciseName = (exercise) => exercise?.custom ? exercise.name : translateText(exercise?.name || "");
  const matchingExercises = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase();
    return allExercises.filter((exercise) => {
      const matchesMuscle = !muscleFilter || exercise.muscle === muscleFilter || (exercise.secondary || []).includes(muscleFilter);
      const haystack = `${exercise.name} ${translateText(exercise.name)} ${exercise.muscle} ${translateText(exercise.muscle || "")} ${(exercise.secondary || []).join(" ")} ${exercise.equipment || ""}`.toLocaleLowerCase();
      return matchesMuscle && (!query || haystack.includes(query));
    });
  }, [allExercises, librarySearch, muscleFilter]);
  const visibleExercises = useMemo(() => matchingExercises.slice(0, libraryLimit), [matchingExercises, libraryLimit]);
  const routineMuscleFocus = useMemo(() => {
    const focus = new Map();
    activeRoutine.exercises.forEach((id) => {
      const exercise = allExercises.find((item) => item.id === id);
      if (!exercise) return;
      getMuscleFocus(exercise).forEach(({ name, role }) => {
        const key = name.toLocaleLowerCase();
        if (role === "primary" || !focus.has(key)) focus.set(key, { name, role });
      });
    });
    return [...focus.values()];
  }, [activeRoutine.exercises, allExercises]);
  const estimatedDuration = activeRoutine.exercises.reduce((total, id) => total + (Number(allExercises.find((exercise) => exercise.id === id)?.duration) || 0), 0);
  const updateRoutine = (id, changes) => {
    setShareUrl("");
    setRoutines((current) => current.map((routine) => routine.id === id ? { ...routine, ...changes } : routine));
  };
  const addRoutine = () => {
    if (routines.length >= 7) return setToast(t.limitRoutines);
    const routine = newRoutine(routines.length + 1, language);
    setShareUrl("");
    setRoutines((current) => [...current, routine]);
    setActiveId(routine.id);
  };
  const removeRoutine = (id) => {
    if (routines[0]?.id === id) return;
    setShareUrl("");
    setRoutines((current) => {
      const next = current.filter((routine) => routine.id !== id);
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };
  const navigateMobile = (id) => {
    setMobileSection(id);
    if (id === "exercise-library") {
      setExercisePickerOpen(true);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const closeExercisePicker = () => {
    setExercisePickerOpen(false);
    setMobileSection("routine-panel");
  };
  useEffect(() => {
    if (!exercisePickerOpen && !exerciseModal && !selectedDemo) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (selectedDemo) setSelectedDemo(null);
      else if (exerciseModal) setExerciseModal(false);
      else closeExercisePicker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exercisePickerOpen, exerciseModal, selectedDemo]);
  const updateExerciseSetting = (exerciseId, field, value) => {
    updateRoutine(activeRoutine.id, {
      exerciseSettings: {
        ...activeRoutine.exerciseSettings,
        [exerciseId]: { ...activeRoutine.exerciseSettings[exerciseId], [field]: value },
      },
    });
  };
  const addExercise = (exercise) => {
    if (activeRoutine.exercises.includes(exercise.id)) return;
    if (activeRoutine.exercises.length >= 30) return setToast(t.limitExercises);
    const settings = {
      sets: exercise.sets || 3,
      reps: exercise.reps || "8–12",
      restSeconds: exercise.rest || 60,
      comment: exercise.templateNote || "",
      targetMinutes: exercise.duration || "",
    };
    updateRoutine(activeRoutine.id, {
      exercises: [...activeRoutine.exercises, exercise.id],
      exerciseSettings: { ...activeRoutine.exerciseSettings, [exercise.id]: settings },
    });
    setToast(t.saved);
  };
  const removeExercise = (exerciseId) => {
    updateRoutine(activeRoutine.id, {
      exercises: activeRoutine.exercises.filter((id) => id !== exerciseId),
      exerciseSettings: Object.fromEntries(Object.entries(activeRoutine.exerciseSettings).filter(([id]) => id !== exerciseId)),
    });
  };
  const moveExercise = (index, direction) => {
    const next = [...activeRoutine.exercises];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateRoutine(activeRoutine.id, { exercises: next });
  };
  const createGroup = () => {
    const name = groupDraft.trim().slice(0, 60);
    if (!name) return setToast(t.enterGroup);
    if (!groups.some((group) => group.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      if (groups.length >= 20) return setToast(builderText.groupLimit);
      setGroups((current) => [...current, name]);
    }
    updateRoutine(activeRoutine.id, { group: name });
    setGroupDraft("");
  };
  const applyPreset = () => {
    const templates = presetWorkouts[preset];
    const newRoutines = Array.from({ length: Number(presetDays) }, (_, index) => {
      const ids = templates[index % templates.length];
      const sets = { beginner: 2, intermediate: 3, advanced: 4 }[presetLevel];
      const exerciseSettings = Object.fromEntries(ids.map((id) => [id, {
        sets,
        reps: presetLevel === "beginner" ? "8–12" : "6–12",
        restSeconds: presetLevel === "beginner" ? 90 : 75,
        comment: "",
        targetMinutes: "",
      }]));
      return {
        id: `routine-${uuid()}`,
        name: presetLabels[language][preset][index % presetLabels[language][preset].length],
        group: groups[0] || "",
        exercises: ids,
        exerciseSettings,
      };
    });
    setRoutines(newRoutines);
    setShareUrl("");
    setActiveId(newRoutines[0].id);
  };
  const saveCustomExercise = (event) => {
    event.preventDefault();
    const name = exerciseDraft.name.trim().slice(0, 80);
    const muscle = canonicalOption(exerciseDraft.muscle, primaryMuscleOptions);
    if (!name || !muscle) return;
    const media = safeHttpUrl(exerciseDraft.media);
    const poster = safeHttpUrl(exerciseDraft.poster);
    if ((exerciseDraft.media && !media) || (exerciseDraft.poster && !poster)) return setToast(builderText.invalidUrl);
    const exercise = {
      id: editingExerciseId || `builder-${uuid()}`,
      name,
      muscle,
      secondary: cleanMuscleList(exerciseDraft.secondary),
      equipment: canonicalOption(exerciseDraft.equipment, equipmentOptions) || "Otro",
      sets: boundedNumber(exerciseDraft.sets, 1, 20, 3),
      reps: exerciseDraft.reps.trim().slice(0, 32) || "8–12",
      rest: boundedNumber(exerciseDraft.rest, 0, 600, 60),
      duration: boundedNumber(exerciseDraft.duration, 0, 600, 10),
      description: exerciseDraft.description.trim().slice(0, 1200),
      media,
      poster,
      mediaType: media ? exerciseDraft.mediaType : "",
      cues: [],
      trackSets: true,
      trackReps: true,
      custom: true,
    };
    if (editingExerciseId) {
      setCustomExercises((current) => current.map((item) => item.id === editingExerciseId ? exercise : item));
      setShareUrl("");
      setToast(builderText.exerciseUpdated);
    } else {
      if (customExercises.length >= 100) return setToast(builderText.customLimit);
      setCustomExercises((current) => [...current, exercise]);
      addExercise(exercise);
    }
    setExerciseModal(false);
    setEditingExerciseId("");
    setExerciseDraft({ ...blankExerciseDraft });
  };
  const openExerciseEditor = (exercise = null) => {
    setEditingExerciseId(exercise?.id || "");
    setExerciseDraft(exercise ? cleanExerciseDraft({
      name: exercise.name || "", muscle: exercise.muscle || "", secondary: (exercise.secondary || []).join(", "), equipment: exercise.equipment || "", sets: String(exercise.sets ?? 3), reps: exercise.reps || "8–12", rest: String(exercise.rest ?? 60), duration: String(exercise.duration ?? 10), description: exercise.description || "", media: exercise.media || "", poster: exercise.poster || "", mediaType: exercise.mediaType || "video/mp4",
    }) : { ...blankExerciseDraft });
    setExerciseModal(true);
  };
  const deleteCustomExercise = () => {
    const id = pendingExerciseDelete;
    if (!id) return;
    setCustomExercises((current) => current.filter((exercise) => exercise.id !== id));
    setRoutines((current) => current.map((routine) => ({
      ...routine,
      exercises: routine.exercises.filter((exerciseId) => exerciseId !== id),
      exerciseSettings: Object.fromEntries(Object.entries(routine.exerciseSettings || {}).filter(([exerciseId]) => exerciseId !== id)),
    })));
    setPendingExerciseDelete("");
    setShareUrl("");
  };
  const clearAllData = () => {
    try { localStorage.removeItem(storageKey); } catch { /* Storage may be disabled in private browsing. */ }
    const first = newRoutine(1, language);
    setRoutines([first]);
    setActiveId(first.id);
    setGroups([]);
    setGroupDraft("");
    setLibrarySearch("");
    setMuscleFilter("");
    setLibraryLimit(60);
    setCustomExercises([]);
    setExerciseDraft({ ...blankExerciseDraft });
    setEditingExerciseId("");
    setPreset("full");
    setPresetDays(3);
    setPresetLevel("beginner");
    setShareUrl("");
    setClearDataOpen(false);
    setToast(builderText.cleared);
  };
  const createShareUrl = () => {
    const validRoutines = routines.filter((routine) => routine.name.trim() && routine.exercises.length);
    if (!validRoutines.length) {
      setToast(t.required);
      return "";
    }
    const usedCustomIds = new Set(validRoutines.flatMap((routine) => routine.exercises).filter((id) => id.startsWith("builder-")));
    const payload = {
      type: "profit-routine-plan",
      version: 1,
      routines: validRoutines,
      exercises: customExercises.filter((exercise) => usedCustomIds.has(exercise.id)),
    };
    const encoded = encodeRoutinePlan(payload);
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 48_000) {
      setToast(builderText.linkTooLarge);
      return "";
    }
    return `${appUrl}${routineLinkPath}?p=${encoded}`;
  };
  const generateLink = () => {
    const url = createShareUrl();
    if (url) setShareUrl(url);
  };
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast(t.copied);
    } catch {
      const input = document.querySelector("#generated-url");
      input?.select();
      document.execCommand("copy");
      setToast(t.copied);
    }
  };
  return (
    <div class="page-shell">
      <header class="topbar">
        <a class="brand" href={appUrl} aria-label="ProFit"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>pro<span>fit</span></span></a>
        <span class="storage-status"><i aria-hidden="true" />{builderText.localSaved}</span>
        <select class="language-select" value={language} onChange={(event) => setLanguage(event.currentTarget.value)} aria-label="Language">
          <option value="en">English</option><option value="es">Español</option><option value="ca">Català</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="it">Italiano</option>
        </select>
        <button class="button button-clear-data" onClick={() => setClearDataOpen(true)}>{builderText.clearAll}</button>
      </header>
      <main>
        <section class="hero"><div class="hero-copy"><div class="hero-tag"><i class="pulse-dot" /> PROFIT · {t.title.toLocaleUpperCase()}</div><h1>{t.title}</h1><p>{t.sub}</p><div class="hero-summary"><span>{routines.length} {t.routine.toLocaleLowerCase()}</span><i /><span>{activeRoutine.exercises.length} {t.exercises.toLocaleLowerCase()}</span><i /><span>{groups.length} {t.group.toLocaleLowerCase()}</span></div></div><div class="hero-art" aria-hidden="true"><div class="hero-orbit orbit-one" /><div class="hero-orbit orbit-two" /><div class="hero-orbit orbit-three" /><span class="hero-spark spark-one" /><span class="hero-spark spark-two" /><div class="hero-center"><span class="hero-brand-symbol"><i></i><i></i><i></i></span></div><span class="hero-art-label">01 <b>·</b> 02 <b>·</b> 03</span></div></section>
        <section class="preset-panel panel">
          <div class="section-heading"><div><span class="step">01</span><div><span class="section-kicker">{t.createPlan}</span><h2>{t.choose}</h2></div></div></div>
          <div class="preset-choices">{[["full", t.full, "◉"], ["upper", t.upper, "↕"], ["ppl", t.ppl, "⇄"]].map(([id, label, glyph]) => <button class={preset === id ? "preset-choice active" : "preset-choice"} onClick={() => setPreset(id)} aria-pressed={preset === id}><span class="preset-choice-glyph">{glyph}</span><strong>{label}</strong><i>{preset === id ? "✓" : "＋"}</i></button>)}</div>
          <div class="preset-options"><label class="field"><span>{t.days}</span><select value={presetDays} onChange={(event) => setPresetDays(event.currentTarget.value)}>{[2, 3, 4, 5, 6].map((day) => <option value={day}>{day}</option>)}</select></label><label class="field"><span>{t.level}</span><select value={presetLevel} onChange={(event) => setPresetLevel(event.currentTarget.value)}><option value="beginner">{t.beginner}</option><option value="intermediate">{t.intermediate}</option><option value="advanced">{t.advanced}</option></select></label><button class="button button-primary" onClick={applyPreset}><span aria-hidden="true">✦</span>{t.presetApply}</button></div>
        </section>

        <div class="workspace">
          <section class="routine-panel panel" id="routine-panel">
            <div class="section-heading"><div><span class="step">02</span><h2>{t.exercises}</h2></div><button class="button button-soft" onClick={addRoutine}>＋ {t.addRoutine}</button></div>
            <div class="routine-tabs" role="tablist">{routines.map((routine, index) => <button class={routine.id === activeId ? "routine-tab active" : "routine-tab"} onClick={() => setActiveId(routine.id)} role="tab" aria-selected={routine.id === activeId}><span>{routine.name || `${t.routine} ${index + 1}`}</span>{index === 0 && <svg class="routine-lock" viewBox="0 0 16 16" role="img" aria-label={demoText.protected} title={demoText.protected}><path d="M4 7V5a4 4 0 0 1 8 0v2M3 7h10v7H3z" /></svg>}</button>)}</div>
            <div class="routine-fields">
              <label class="field"><span>{t.name}</span><input maxLength="60" value={activeRoutine.name} onInput={(event) => updateRoutine(activeRoutine.id, { name: event.currentTarget.value.slice(0, 60) })} /></label>
              <label class="field"><span>{t.group}</span><select value={activeRoutine.group || ""} onChange={(event) => updateRoutine(activeRoutine.id, { group: event.currentTarget.value })}><option value="">{t.noGroup}</option>{groups.map((group) => <option value={group}>{group}</option>)}</select></label>
              <div class="create-group"><input maxLength="60" value={groupDraft} onInput={(event) => setGroupDraft(event.currentTarget.value)} placeholder={t.groupName} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), createGroup())} /><button class="button button-soft" onClick={createGroup}>{t.newGroup}</button></div>
            </div>
            <div class="routine-overview">
              <div class="routine-overview-map">{routineMuscleFocus.length ? <MuscleMap muscles={routineMuscleFocus} compact showKey={false} showViewLabels={false} /> : <div class="routine-map-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 18v12M13 13v22M35 13v22M41 18v12M13 24h22" /></svg><span>{demoText.noMuscles}</span></div>}</div>
              <div class="routine-overview-stats">
                <span class="section-kicker">{demoText.groups}</span>
                <strong>{routineMuscleFocus.length ? [...new Set(routineMuscleFocus.map((muscle) => muscle.name))].length : "—"}</strong>
                <span class="routine-overview-label">{demoText.muscles.toLocaleLowerCase()}</span>
                <div class="routine-overview-divider" />
                <span class="routine-overview-pair"><b>{activeRoutine.exercises.length}</b> {t.exercises.toLocaleLowerCase()}</span>
                <span class="routine-overview-pair"><b>{estimatedDuration}</b> {t.duration.toLocaleLowerCase()}</span>
                <div class="routine-muscle-key"><i /> {t.muscle} <i class="support" /> {t.secondary}</div>
              </div>
            </div>
            <div class="exercise-list">
              {activeRoutine.exercises.map((exerciseId, index) => {
                const exercise = tExercise(exerciseId);
                if (!exercise) return null;
                const settings = activeRoutine.exerciseSettings[exerciseId] || {};
                return <article class="exercise-card" key={exerciseId}>
                  <div class="exercise-card-top"><button class="exercise-info-button" onClick={() => setSelectedDemo(exercise)} aria-label={`${demoText.demo}: ${exerciseName(exercise)}`}><span class="routine-exercise-visual"><ExerciseThumb exercise={remoteExercise(exercise)} /></span><span class="exercise-index">{String(index + 1).padStart(2, "0")}</span><span class="exercise-name"><strong>{exerciseName(exercise)}</strong><small>{translateText(exerciseMuscleLine(exercise))}{exercise.equipment ? ` · ${translateText(exercise.equipment)}` : ""}</small></span></button><div class="row-actions"><button class="icon-action" title={t.up} aria-label={t.up} onClick={() => moveExercise(index, -1)} disabled={index === 0}>↑</button><button class="icon-action" title={t.down} aria-label={t.down} onClick={() => moveExercise(index, 1)} disabled={index === activeRoutine.exercises.length - 1}>↓</button><button class="icon-action danger" title={t.delete} aria-label={t.delete} onClick={() => removeExercise(exerciseId)}>×</button></div></div>
                  <div class="exercise-controls"><label><span>{t.sets}</span><input type="number" min="1" max="100" value={settings.sets ?? exercise.sets ?? 3} onInput={(event) => updateExerciseSetting(exerciseId, "sets", boundedNumber(event.currentTarget.value, 1, 100, 1))} /></label><label><span>{t.reps}</span><input maxLength="32" value={settings.reps ?? exercise.reps ?? "8–12"} onInput={(event) => updateExerciseSetting(exerciseId, "reps", event.currentTarget.value.slice(0, 32))} /></label><label><span>{t.rest}</span><input type="number" min="0" max="3600" value={settings.restSeconds ?? exercise.rest ?? 60} onInput={(event) => updateExerciseSetting(exerciseId, "restSeconds", boundedNumber(event.currentTarget.value, 0, 3600, 0))} /></label></div>
                  <label class="comment-field"><span>{t.comment}</span><textarea rows="2" maxLength="500" value={settings.comment || ""} placeholder={t.notePlaceholder} onInput={(event) => updateExerciseSetting(exerciseId, "comment", event.currentTarget.value.slice(0, 500))} /></label>
                </article>;
              })}
              {!activeRoutine.exercises.length && <div class="empty-state"><span class="empty-icon">＋</span><strong>{t.empty}</strong></div>}
            </div>
            <button class="button button-add-exercise" onClick={() => setExercisePickerOpen(true)}><span class="add-exercise-symbol">＋</span>{t.add} {t.exercises.toLocaleLowerCase()}<span class="button-count">{matchingExercises.length}</span></button>
            {routines.findIndex((routine) => routine.id === activeId) > 0 && <button class="text-danger" onClick={() => removeRoutine(activeRoutine.id)}>× {t.delete} {t.routine.toLocaleLowerCase()}</button>}
          </section>

        </div>

        <section class="share-panel panel" id="share-panel"><div class="section-heading"><div><span class="step">03</span><div><span class="section-kicker">{t.link}</span><h2>{t.link}</h2></div></div></div><div class="share-controls"><p class="share-description">{builderText.endpointHelp}</p><button class="button button-primary" onClick={generateLink}>{t.makeLink}</button></div>{shareUrl && <div class="share-result"><div class="generated-link"><input id="generated-url" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /><button class="button button-soft generated-link-action" onClick={copyLink}><CopyLinkIcon />{t.copy}</button><a class="button button-soft generated-link-action" href={shareUrl} target="_blank" rel="noreferrer"><OpenAppIcon />{t.open}</a></div></div>}<p class="small-note">{shareFooterMessages[language]}</p></section>
      </main>
      {exercisePickerOpen && <div class="exercise-picker-screen" role="dialog" aria-modal="true" aria-label={t.library}><div class="picker-screen-inner builder-picker-inner"><header class="picker-screen-header"><div class="builder-picker-title"><div><div class="eyebrow">{t.library}</div><h2>{t.add} {t.exercises.toLocaleLowerCase()}</h2><p><span translate="no">{activeRoutine.name}</span> · {activeRoutine.exercises.length} {t.exercises.toLocaleLowerCase()}</p></div></div><button class="picker-screen-close" onClick={closeExercisePicker} aria-label={demoText.close}>×</button></header><div class="builder-picker-tools"><label class="picker-screen-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.5 15.5 4.2 4.2"/></svg><input maxLength="80" value={librarySearch} onInput={(event) => { setLibrarySearch(event.currentTarget.value.slice(0, 80)); setLibraryLimit(60); }} placeholder={t.search} /></label><button class="button button-primary builder-create-exercise" onClick={() => openExerciseEditor()}>＋ {t.newExercise}</button></div><div class="exercise-picker-categories" aria-label={t.allMuscles}><button class={!muscleFilter ? "selected" : ""} onClick={() => { setMuscleFilter(""); setLibraryLimit(60); }}>{t.allMuscles}</button>{muscleNames.map((muscle) => <button class={muscleFilter === muscle ? "selected" : ""} onClick={() => { setMuscleFilter(muscle); setLibraryLimit(60); }}>{translateText(muscle)}</button>)}</div><div class="picker-screen-count">{matchingExercises.length} {demoText.result}</div><div class="builder-picker-list"><div class="builder-picker-results">{visibleExercises.map((exercise) => { const inRoutine = activeRoutine.exercises.includes(exercise.id); const previewExercise = remoteExercise(exercise); return <article class="builder-picker-row" key={exercise.id}><button class="builder-picker-info" onClick={() => setSelectedDemo(exercise)} aria-label={`${demoText.demo}: ${exerciseName(exercise)}`}><span class="builder-picker-visual"><ExerciseThumb exercise={previewExercise} /></span><span class="builder-picker-copy"><strong>{exerciseName(exercise)}</strong><small>{translateText(exerciseMuscleLine(exercise))}{exercise.equipment ? ` · ${translateText(exercise.equipment)}` : ""}</small><em>{translateText(exerciseDoseLabel(exercise))}</em></span></button>{exercise.custom && <div class="builder-custom-actions"><button class="builder-custom-edit" title={builderText.edit} aria-label={`${builderText.edit}: ${exerciseName(exercise)}`} onClick={() => openExerciseEditor(exercise)}>✎</button><button class="builder-custom-delete" title={builderText.deleteCustom} aria-label={`${builderText.deleteCustom}: ${exerciseName(exercise)}`} onClick={() => setPendingExerciseDelete(exercise.id)}>×</button></div>}<button class={inRoutine ? "builder-picker-add added" : "builder-picker-add"} aria-label={`${t.add}: ${exerciseName(exercise)}`} title={inRoutine ? demoText.added : t.add} disabled={inRoutine} onClick={() => addExercise(exercise)}>{inRoutine ? "✓" : "+"}</button></article>; })}{!visibleExercises.length && <div class="picker-screen-empty">{demoText.empty}</div>}{visibleExercises.length < matchingExercises.length && <div class="builder-picker-pagination"><button class="text-button" onClick={() => setLibraryLimit((limit) => Math.min(limit + 60, matchingExercises.length))}>{demoText.showMore}</button><button class="text-button" onClick={() => setLibraryLimit(matchingExercises.length)}>{demoText.showAll} ({matchingExercises.length})</button></div>}</div><footer class="builder-picker-footer"><span><b>{activeRoutine.exercises.length}</b> {t.exercises.toLocaleLowerCase()}</span><button class="button button-primary" onClick={closeExercisePicker}>{demoText.done} <span aria-hidden="true">✓</span></button></footer></div></div></div>}
      {exerciseModal && <div class="modal-backdrop modal-over-picker" onClick={(event) => event.target === event.currentTarget && setExerciseModal(false)}><form class="exercise-modal" onSubmit={saveCustomExercise}><div class="modal-head"><div><span class="step">＋</span><h2>{editingExerciseId ? builderText.edit : t.newExercise}</h2></div><button type="button" class="icon-action" onClick={() => setExerciseModal(false)} aria-label={t.cancel}>×</button></div><label class="field"><span>{t.exName}</span><input autoFocus required maxLength="80" value={exerciseDraft.name} onInput={(event) => setExerciseDraft({ ...exerciseDraft, name: event.currentTarget.value.slice(0, 80) })} /></label><div class="modal-grid"><label class="field"><span>{t.muscle}</span><select required value={exerciseDraft.muscle} onChange={(event) => setExerciseDraft({ ...exerciseDraft, muscle: canonicalOption(event.currentTarget.value, primaryMuscleOptions) })}><option value="">—</option>{primaryMuscleOptions.map((muscle) => <option value={muscle}>{translateText(muscle)}</option>)}</select></label><label class="field"><span>{t.secondary}</span><select multiple size="4" aria-label={t.secondary} onChange={(event) => setExerciseDraft({ ...exerciseDraft, secondary: Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(", ") })}>{primaryMuscleOptions.map((muscle) => <option value={muscle} selected={cleanMuscleList(exerciseDraft.secondary).includes(muscle)}>{translateText(muscle)}</option>)}</select></label><label class="field"><span>{t.equipment}</span><select value={canonicalOption(exerciseDraft.equipment, equipmentOptions) || "Otro"} onChange={(event) => setExerciseDraft({ ...exerciseDraft, equipment: canonicalOption(event.currentTarget.value, equipmentOptions) || "Otro" })}>{equipmentOptions.map((equipment) => <option value={equipment}>{translateText(equipment)}</option>)}</select></label><label class="field"><span>{t.duration}</span><input type="number" inputMode="numeric" step="1" min="0" max="600" value={exerciseDraft.duration} onInput={(event) => { const value = event.currentTarget.value; setExerciseDraft((draft) => ({ ...draft, duration: value === "" ? "" : String(boundedNumber(value, 0, 600, 600)) })); }} onBlur={() => setExerciseDraft((draft) => ({ ...draft, duration: String(boundedNumber(draft.duration, 0, 600, 10)) }))} /></label><label class="field"><span>{t.sets}</span><input type="number" inputMode="numeric" step="1" min="1" max="20" value={exerciseDraft.sets} onInput={(event) => { const value = event.currentTarget.value; setExerciseDraft((draft) => ({ ...draft, sets: value === "" ? "" : String(boundedNumber(value, 1, 20, 20)) })); }} onBlur={() => setExerciseDraft((draft) => ({ ...draft, sets: String(boundedNumber(draft.sets, 1, 20, 3)) }))} /></label><label class="field"><span>{t.reps}</span><input maxLength="32" value={exerciseDraft.reps} onInput={(event) => setExerciseDraft({ ...exerciseDraft, reps: event.currentTarget.value.slice(0, 32) })} /></label><label class="field"><span>{t.rest}</span><input type="number" inputMode="numeric" step="1" min="0" max="600" value={exerciseDraft.rest} onInput={(event) => { const value = event.currentTarget.value; setExerciseDraft((draft) => ({ ...draft, rest: value === "" ? "" : String(boundedNumber(value, 0, 600, 600)) })); }} onBlur={() => setExerciseDraft((draft) => ({ ...draft, rest: String(boundedNumber(draft.rest, 0, 600, 60)) }))} /></label></div><label class="field"><span>{t.description}</span><textarea rows="3" maxLength="1200" value={exerciseDraft.description} onInput={(event) => setExerciseDraft({ ...exerciseDraft, description: event.currentTarget.value.slice(0, 1200) })} /></label><section class="custom-media-fields"><strong>{builderText.media}</strong><label class="field"><span>{builderText.mediaType}</span><select value={exerciseDraft.mediaType || "video/mp4"} onChange={(event) => setExerciseDraft({ ...exerciseDraft, mediaType: event.currentTarget.value })}><option value="video/mp4">{builderText.video}</option><option value="image/jpeg">{builderText.image}</option></select></label><label class="field"><span>{builderText.demoUrl}</span><input type="url" maxLength="500" placeholder="https://…" value={exerciseDraft.media} onInput={(event) => setExerciseDraft({ ...exerciseDraft, media: event.currentTarget.value.slice(0, 500) })} /></label><label class="field"><span>{builderText.posterUrl}</span><input type="url" maxLength="500" placeholder="https://…" value={exerciseDraft.poster} onInput={(event) => setExerciseDraft({ ...exerciseDraft, poster: event.currentTarget.value.slice(0, 500) })} /></label><p>{builderText.mediaHelp}</p></section><div class="modal-actions"><button type="button" class="button button-soft" onClick={() => setExerciseModal(false)}>{t.cancel}</button><button class="button button-primary" type="submit">{editingExerciseId ? builderText.saveChanges : t.saveExercise}</button></div></form></div>}
      {pendingExerciseDelete && <div class="modal-backdrop confirm-backdrop" onClick={(event) => event.target === event.currentTarget && setPendingExerciseDelete("")}><section class="confirm-dialog" role="alertdialog" aria-modal="true"><span class="step danger-step">×</span><h2>{builderText.deleteTitle}</h2><p>{builderText.deleteBody}</p><div class="modal-actions"><button class="button button-soft" onClick={() => setPendingExerciseDelete("")}>{t.cancel}</button><button class="button button-danger" onClick={deleteCustomExercise}>{builderText.deleteCustom}</button></div></section></div>}
      {clearDataOpen && <div class="modal-backdrop confirm-backdrop" onClick={(event) => event.target === event.currentTarget && setClearDataOpen(false)}><section class="confirm-dialog" role="alertdialog" aria-modal="true"><span class="step danger-step">!</span><h2>{builderText.clearTitle}</h2><p>{builderText.clearBody}</p><div class="modal-actions"><button class="button button-soft" onClick={() => setClearDataOpen(false)}>{t.cancel}</button><button class="button button-danger" onClick={clearAllData}>{builderText.clearConfirm}</button></div></section></div>}
      {selectedDemo && <div class="demo-backdrop" onClick={(event) => event.target === event.currentTarget && setSelectedDemo(null)}><section class="demo-dialog" role="dialog" aria-modal="true" aria-label={`${demoText.demo}: ${exerciseName(selectedDemo)}`}><header class="demo-dialog-head"><div class="demo-dialog-identity"><ExerciseThumb exercise={remoteExercise(selectedDemo)} large /><div><span class="section-kicker">{demoText.demo}</span><h2>{exerciseName(selectedDemo)}</h2><small>{translateText(exerciseMuscleLine(selectedDemo))}</small></div></div><button class="icon-action demo-close" onClick={() => setSelectedDemo(null)} aria-label={demoText.close}>×</button></header><div class="demo-media">{isVideoExercise(selectedDemo) && exerciseMedia(selectedDemo) ? <video src={exerciseMedia(selectedDemo)} poster={exercisePreview(selectedDemo) || undefined} autoPlay muted loop playsInline preload="metadata" disablePictureInPicture aria-label={`${demoText.demo}: ${exerciseName(selectedDemo)}`} /> : (exercisePreview(selectedDemo) || exerciseMedia(selectedDemo)) ? <img src={exercisePreview(selectedDemo) || exerciseMedia(selectedDemo)} alt={exerciseName(selectedDemo)} /> : <div class="demo-no-media"><span>↗</span><p>{demoText.noDemo}</p></div>}</div><div class="demo-meta"><div class="demo-muscle-map"><MuscleMap muscles={getMuscleFocus(selectedDemo)} compact showKey={false} showViewLabels={false} /></div><div><span>{demoText.muscles}</span><strong>{translateText(exerciseMuscleLine(selectedDemo))}</strong></div><div><span>{demoText.equipment}</span><strong>{translateText(selectedDemo.equipment || "—")}</strong></div></div>{selectedDemo.description && <section class="demo-instructions"><span class="section-kicker">{demoText.instructions}</span><p>{translateText(selectedDemo.description)}</p></section>}<button class="button button-primary demo-add" disabled={activeRoutine.exercises.includes(selectedDemo.id)} onClick={() => { addExercise(selectedDemo); setSelectedDemo(null); }}>{activeRoutine.exercises.includes(selectedDemo.id) ? demoText.added : demoText.add}</button></section></div>}
      {!exerciseModal && !selectedDemo && <nav class="mobile-bottom-nav" aria-label="Page navigation"><button class={mobileSection === "routine-panel" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => navigateMobile("routine-panel")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5zM8 8h8M8 12h8M8 16h5" /></svg><span>{demoText.navPlan}</span></button><button class={mobileSection === "exercise-library" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => navigateMobile("exercise-library")}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.5 15.5 4.2 4.2" /></svg><span>{demoText.navLibrary}</span></button><button class={mobileSection === "share-panel" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => navigateMobile("share-panel")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m-4 4 4-4 4 4M5 13v6h14v-6" /></svg><span>{demoText.navShare}</span></button></nav>}
      {toast && <div class="toast" role="status" onAnimationEnd={() => {}}>{toast}<button onClick={() => setToast("")}>×</button></div>}
    </div>
  );
}

render(<App />, document.getElementById("app"));
