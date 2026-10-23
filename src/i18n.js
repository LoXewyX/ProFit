import { options } from 'preact';

// Catalogues and bundled exercise names are loaded from per-language JSON chunks.
// Keep this new control translated even when an older locale catalogue is bundled.
const trackingOptionTranslations = {
  ca: { 'Incluir peso': 'Incloure el pes' },
  en: { 'Incluir peso': 'Include weight' },
  fr: { 'Incluir peso': 'Inclure le poids' },
  de: { 'Incluir peso': 'Gewicht einbeziehen' },
  it: { 'Incluir peso': 'Includi il peso' },
};
const dictionaries = Object.fromEntries(
  Object.entries(trackingOptionTranslations).map(([language, entries]) => [language, { ...entries }]),
);
const lowercaseDictionaries = Object.fromEntries(
  Object.entries(trackingOptionTranslations).map(([language, entries]) => [
    language,
    Object.fromEntries(Object.entries(entries).map(([source, translated]) => [source.toLocaleLowerCase('es'), translated])),
  ]),
);
const starterExerciseNames = [
  'Press banca con barra', 'Sentadilla con barra', 'Peso muerto rumano', 'Jalón al pecho',
  'Press militar', 'Remo con mancuerna', 'Hip thrust', 'Curl de bíceps', 'Plancha',
];
const bundledExerciseNameKeys = new Set(starterExerciseNames.map((name) => name.toLocaleLowerCase('es')));
export function registerBundledExerciseNames(names) {
  (names || []).forEach((name) => {
    if (typeof name === 'string' && name.trim()) bundledExerciseNameKeys.add(name.toLocaleLowerCase('es'));
  });
}
const exerciseDescriptionTemplates = [
  ["Fija el tronco y mueve la articulación objetivo sin impulso. Controla tanto la fase de esfuerzo como el regreso en ", ".", "Fixa el tronc i mou l’articulació objectiu sense impuls. Controla tant la fase d’esforç com el retorn en ", ".", "Brace your torso and move the target joint without momentum. Control both the effort and return phases of the ", "."],
  ["Estabiliza el tronco y mantén las muñecas alineadas. Baja con control hasta un recorrido cómodo y empuja para completar ", ".", "Estabilitza el tronc i mantén els canells alineats. Baixa amb control fins a un recorregut còmode i empeny per completar ", ".", "Keep your torso stable and wrists aligned. Lower with control through a comfortable range, then press to complete the ", "."],
  ["Inicia con los hombros estables y dirige el movimiento con los codos. Acerca la carga al torso sin balancearte y vuelve lentamente en ", ".", "Mantén les espatlles estables i guia el moviment amb els colzes. Apropa la càrrega al tronc sense balancejar-te i torna a poc a poc en ", ".", "Keep your shoulders steady and lead with your elbows. Bring the load toward your torso without swinging, then return slowly during the ", "."],
  ["Sigue la demostración visual, prepara una postura estable y realiza ", " con un recorrido cómodo y controlado.", "Segueix la demostració visual, prepara una postura estable i fes ", " amb un recorregut còmode i controlat.", "Follow the demonstration, get into a stable position and perform the ", " with a comfortable, controlled range."],
  ["Coloca los pies firmes y activa el abdomen. Desciende con control siguiendo la trayectoria de la demostración y empuja el suelo para volver a la posición inicial en ", ".", "Col·loca els peus ferms i activa l’abdomen. Baixa amb control seguint la trajectòria de la demostració i empeny el terra per tornar a la posició inicial en ", ".", "Plant your feet and brace your core. Follow the demonstration as you lower, then push the floor away to return to the start of the ", "."],
  ["Activa el abdomen y mantén la zona lumbar estable. Respira con normalidad y controla la posición durante ", " siguiendo la demostración.", "Activa l’abdomen i mantén estable la zona lumbar. Respira amb normalitat i controla la posició durant ", " seguint la demostració.", "Brace your core and keep your lower back stable. Breathe normally and hold the position during the ", ", following the demonstration."],
  ["Mantén un ritmo que puedas sostener y adapta la intensidad a tu nivel. Usa la demostración como referencia para realizar ", " con control.", "Mantén un ritme que puguis sostenir i adapta la intensitat al teu nivell. Fes servir la demostració com a referència per realitzar ", " amb control.", "Choose a pace you can sustain and adjust the intensity to your level. Use the demonstration as a guide to perform ", " with control."],
  ["Mantén la espalda neutra y lleva la cadera hacia atrás. Mantén la carga cerca del cuerpo y extiende la cadera con control al completar ", ".", "Mantén l’esquena neutra i porta els malucs enrere. Mantén la càrrega a prop del cos i estén els malucs amb control en completar ", ".", "Keep a neutral back and push your hips back. Keep the load close to your body and extend your hips with control to finish the ", "."],
];

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateBundledExerciseName(value, language) {
  if (!bundledExerciseNameKeys.has(value.toLocaleLowerCase('es'))) return value;
  const exact = dictionaries[language]?.[value] || lowercaseDictionaries[language]?.[value.toLocaleLowerCase('es')];
  return exact || value;
}

function translateExerciseDescription(value, language) {
  const descriptions = {
    fr: [
      ['Gainez le tronc et mobilisez l’articulation ciblée sans élan. Contrôlez l’effort et le retour pendant le ', '.'],
      ['Gardez le tronc stable et les poignets alignés. Descendez sans forcer, puis poussez pour terminer le ', '.'],
      ['Gardez les épaules stables et guidez le mouvement avec les coudes. Ramenez la charge vers le torse sans élan, puis revenez lentement pendant le ', '.'],
      ['Suivez la démonstration, adoptez une position stable et effectuez le ', ' avec une amplitude confortable et contrôlée.'],
      ['Ancrez les pieds et contractez les abdominaux. Descendez de manière contrôlée en suivant la démonstration, puis poussez le sol pour terminer le ', '.'],
      ['Contractez les abdominaux et gardez le bas du dos stable. Respirez normalement et maintenez la position pendant le ', ' en suivant la démonstration.'],
      ['Choisissez un rythme soutenable et adaptez l’intensité à votre niveau. Suivez la démonstration pour effectuer le ', ' de manière contrôlée.'],
      ['Gardez le dos neutre et poussez les hanches vers l’arrière. Gardez la charge près du corps et tendez les hanches avec contrôle pour terminer le ', '.'],
    ],
    de: [
      ['Spanne den Rumpf an und bewege das Zielgelenk ohne Schwung. Kontrolliere sowohl die Anstrengung als auch die Rückbewegung beim ', '.'],
      ['Halte den Rumpf stabil und die Handgelenke gerade. Senke das Gewicht kontrolliert in einem angenehmen Bewegungsumfang und drücke die ', ' vollständig aus.'],
      ['Halte die Schultern stabil und führe die Bewegung mit den Ellbogen. Ziehe das Gewicht ohne Schwung zum Oberkörper und kehre beim ', ' langsam zurück.'],
      ['Folge der Demonstration, nimm eine stabile Position ein und führe die ', ' kontrolliert und mit angenehmem Bewegungsumfang aus.'],
      ['Stelle die Füße fest auf und spanne den Bauch an. Senke dich kontrolliert wie in der Demonstration und drücke dich beim ', ' wieder nach oben.'],
      ['Spanne den Bauch an und halte den unteren Rücken stabil. Atme normal und halte die Position beim ', ' wie in der Demonstration.'],
      ['Wähle ein dauerhaft machbares Tempo und passe die Intensität an dein Niveau an. Nutze die Demonstration für eine kontrollierte ', '.'],
      ['Halte den Rücken neutral und schiebe die Hüfte nach hinten. Führe das Gewicht nah am Körper und strecke die Hüfte kontrolliert, um das ', ' abzuschließen.'],
    ],
    it: [
      ['Stabilizza il busto e muovi l’articolazione interessata senza slancio. Controlla sia la fase di sforzo sia il ritorno durante il ', '.'],
      ['Mantieni stabile il busto e allinea i polsi. Scendi con controllo entro un movimento comodo e spingi per completare il ', '.'],
      ['Mantieni stabili le spalle e guida il movimento con i gomiti. Avvicina il carico al busto senza oscillare e torna lentamente durante il ', '.'],
      ['Segui la dimostrazione, assumi una posizione stabile ed esegui il ', ' con un movimento comodo e controllato.'],
      ['Tieni i piedi ben saldi e attiva l’addome. Scendi con controllo seguendo la dimostrazione, poi spingi il pavimento per tornare alla posizione iniziale nel ', '.'],
      ['Attiva l’addome e mantieni stabile la zona lombare. Respira normalmente e mantieni la posizione durante il ', ' seguendo la dimostrazione.'],
      ['Scegli un ritmo sostenibile e adatta l’intensità al tuo livello. Usa la dimostrazione come riferimento per eseguire il ', ' con controllo.'],
      ['Mantieni la schiena neutra e porta indietro il bacino. Tieni il carico vicino al corpo ed estendi l’anca con controllo per completare il ', '.'],
    ],
  };
  for (const [templateIndex, template] of exerciseDescriptionTemplates.entries()) {
    const [prefix, suffix] = template;
    const pattern = new RegExp(`^${regexEscape(prefix)}(.+?)${regexEscape(suffix)}$`, 'i');
    const match = value.match(pattern);
    if (!match || !bundledExerciseNameKeys.has(match[1].toLocaleLowerCase('es'))) continue;
    const localeIndex = language === 'ca' ? 2 : 4;
    const localizedName = translateBundledExerciseName(match[1], language).toLocaleLowerCase(language);
    const translatedPrefix = descriptions[language]?.[templateIndex]?.[0] || template[localeIndex];
    const translatedSuffix = descriptions[language]?.[templateIndex]?.[1] || template[localeIndex + 1];
    return `${translatedPrefix}${localizedName}${translatedSuffix}`;
  }
  return value;
}

function translateMessagePackErrorDetail(value, language) {
  const labels = {
    ca: ['Tipus de valor MessagePack no compatible', 'Format MessagePack no admès', 'No s’ha pogut llegir el MessagePack'],
    en: ['Unsupported MessagePack value type', 'Unsupported MessagePack format', 'Could not read the MessagePack file'],
    fr: ['Type de valeur MessagePack non pris en charge', 'Format MessagePack non pris en charge', 'Impossible de lire le fichier MessagePack'],
    de: ['Nicht unterstützter MessagePack-Werttyp', 'Nicht unterstütztes MessagePack-Format', 'MessagePack-Datei konnte nicht gelesen werden'],
    it: ['Tipo di valore MessagePack non supportato', 'Formato MessagePack non supportato', 'Impossibile leggere il file MessagePack'],
  }[language] || ['Unsupported MessagePack value type', 'Unsupported MessagePack format', 'Could not read the MessagePack file'];
  const exact = dictionaries[language]?.[value]
    || lowercaseDictionaries[language]?.[value.toLocaleLowerCase('es')];
  if (exact) return exact;

  let match = value.match(/^Tipo MessagePack no compatible: (.+)$/);
  if (match) return `${labels[0]}: ${match[1]}`;
  match = value.match(/^Formato MessagePack no admitido \(0x([0-9a-f]+)\)$/i);
  if (match) return `${labels[1]} (0x${match[1]})`;
  return value;
}

let activeLanguage = 'en';
const normalizeLanguage = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.startsWith('fr')) return 'fr';
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('it')) return 'it';
  if (normalized.startsWith('ca')) return 'ca';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('en')) return 'en';
  return 'en';
};

export function resolveLanguage(preference = 'system') {
  if (preference !== 'system') return normalizeLanguage(preference);
  const systemLanguage = globalThis.navigator?.languages?.[0]
    || globalThis.navigator?.language
    || 'en';
  // Unsupported device locales always fall back to English.
  return normalizeLanguage(systemLanguage);
}

const localeLoaders = {
  ca: () => import('./locales/ca.json'),
  en: () => import('./locales/en.json'),
  fr: () => import('./locales/fr.json'),
  de: () => import('./locales/de.json'),
  it: () => import('./locales/it.json'),
};
const localeLoadPromises = new Map();

function loadLocale(language) {
  if (!localeLoadPromises.has(language)) {
    const promise = localeLoaders[language]().then(({ default: locale }) => {
      for (const [spanish, translated] of Object.entries(locale.translations)) {
        dictionaries[language][spanish] = translated;
        lowercaseDictionaries[language][spanish.toLocaleLowerCase('es')] = translated;
      }
      for (const [spanish, translated] of Object.entries(locale.exerciseNames || {})) {
        dictionaries[language][spanish] = translated;
        lowercaseDictionaries[language][spanish.toLocaleLowerCase('es')] = translated;
      }
    });
    localeLoadPromises.set(language, promise);
  }
  return localeLoadPromises.get(language);
}

export function activateLanguage(language) {
  activeLanguage = normalizeLanguage(language);
  return localeLoaders[activeLanguage]
    ? loadLocale(activeLanguage)
    : Promise.resolve();
}

export function intlLocale(language = activeLanguage) {
  return ({ ca: 'ca-ES', en: 'en-US', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', es: 'es-ES' })[language] || 'en-US';
}

export function decimalSeparator(language = activeLanguage) {
  return new Intl.NumberFormat(intlLocale(language), { minimumFractionDigits: 1 })
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value || '.';
}

// Accept the separator shown for the active language and the alternate one,
// while keeping the input itself as text so mobile keyboards can enter either.
export function parseLocalizedDecimal(value) {
  let normalized = String(value ?? '').trim().replace(/[\s\u00a0\u202f']/g, '');
  if (!normalized) return Number.NaN;
  const lastDot = normalized.lastIndexOf('.');
  const lastComma = normalized.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalIndex = Math.max(lastDot, lastComma);
    const integerPart = normalized.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fractionPart = normalized.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart}.${fractionPart}`;
  } else {
    normalized = normalized.replace(',', '.');
  }
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(normalized)
    ? Number(normalized)
    : Number.NaN;
}

export function translateText(value) {
  if (typeof value !== 'string' || !value) return value;
  value = value.replace(/\bCm\b/g, 'cm');
  if (activeLanguage === 'es') return value;
  const leading = value.match(/^\s*/)?.[0] || '';
  const trailing = value.match(/\s*$/)?.[0] || '';
  const content = value.slice(leading.length, value.length - trailing.length).replace(/\s+/g, ' ');
  const exact = dictionaries[activeLanguage][content];
  if (exact) return `${leading}${exact}${trailing}`;

  const dynamic = translateDynamicSentence(content, activeLanguage);
  if (dynamic !== content) return `${leading}${dynamic}${trailing}`;

  if (content.includes(' · ')) {
    const parts = content.split(' · ');
    const translatedParts = parts.map((part) => dictionaries[activeLanguage][part] || translateBundledExerciseName(part, activeLanguage));
    if (translatedParts.some((part, index) => part !== parts[index])) return `${leading}${translatedParts.join(' · ')}${trailing}`;
  }

  const exerciseName = translateBundledExerciseName(content, activeLanguage);
  if (exerciseName !== content) return `${leading}${exerciseName}${trailing}`;

  const description = translateExerciseDescription(content, activeLanguage);
  if (description !== content) return `${leading}${description}${trailing}`;

  const countPhrase = content.match(/^(\d+\s+)(.+)$/);
  if (countPhrase) {
    const localizedWords = countPhrase[2].replace(/[\p{L}\p{M}]+/gu, (word) => {
      const lower = word.toLocaleLowerCase('es');
      return dictionaries[activeLanguage][lower]
        || dictionaries[activeLanguage][`${lower[0]?.toLocaleUpperCase(activeLanguage)}${lower.slice(1)}`]
        || word;
    });
    if (localizedWords !== countPhrase[2]) return `${leading}${countPhrase[1]}${localizedWords}${trailing}`;
  }

  const generatedLabel = content.match(/^(Cómo hacer|Demostración de|Cargando imagen de|Músculos principales de) (.+)$/i);
  if (generatedLabel) {
    const localizedName = translateBundledExerciseName(generatedLabel[2], activeLanguage);
    const label = generatedLabel[1].toLocaleLowerCase('es');
    const prefixes = {
      ca: { 'cómo hacer': 'Com fer', 'demostración de': 'Demostració de', 'cargando imagen de': 'Carregant la imatge de', 'músculos principales de': 'Músculs principals de' },
      en: { 'cómo hacer': 'How to do', 'demostración de': 'Demonstration of', 'cargando imagen de': 'Loading image of', 'músculos principales de': 'Primary muscles for' },
      fr: { 'cómo hacer': 'Comment faire', 'demostración de': 'Démonstration de', 'cargando imagen de': 'Chargement de l’image de', 'músculos principales de': 'Muscles principaux de' },
      de: { 'cómo hacer': 'So führst du', 'demostración de': 'Demonstration für', 'cargando imagen de': 'Bild wird geladen: ', 'músculos principales de': 'Primäre Muskeln für' },
      it: { 'cómo hacer': 'Come eseguire', 'demostración de': 'Dimostrazione di', 'cargando imagen de': 'Caricamento immagine di', 'músculos principales de': 'Muscoli principali per' },
    };
    const prefix = prefixes[activeLanguage]?.[label] || prefixes.en[label];
    return `${leading}${prefix} ${localizedName}${trailing}`;
  }
  return value;
}

function translateEnglishDynamic(value, language) {
  const fr = language === 'fr';
  const de = language === 'de';
  const it = language === 'it';
  let match = value.match(/^Delete (\d+)$/);
  if (match) return fr ? `Supprimer ${match[1]}` : de ? `${match[1]} löschen` : `Elimina ${match[1]}`;
  match = value.match(/^(\d+) (routine|routines) with (\d+) (exercise|exercises) in total will be added\.(?: (\d+) (new exercise|new exercises) will be added to your library\.| The included exercises are already in your library\.)? Would you like to continue\?$/);
  if (match) {
    const [count, exercises] = [Number(match[1]), Number(match[3])];
    const routineLabel = fr ? (count === 1 ? 'routine' : 'routines') : de ? (count === 1 ? 'Trainingsplan' : 'Trainingspläne') : (count === 1 ? 'routine' : 'routine');
    const exerciseLabel = fr ? (exercises === 1 ? 'exercice' : 'exercices') : de ? (exercises === 1 ? 'Übung' : 'Übungen') : (exercises === 1 ? 'esercizio' : 'esercizi');
    let sentence = fr ? `${count} ${routineLabel} contenant ${exercises} ${exerciseLabel} au total seront ajoutées.`
      : de ? `${count} ${routineLabel} mit insgesamt ${exercises} ${exerciseLabel} werden hinzugefügt.`
        : `Verranno aggiunte ${count} ${routineLabel} con ${exercises} ${exerciseLabel} in totale.`;
    if (match[4]) {
      const n = Number(match[4]);
      sentence += fr ? ` ${n} ${n === 1 ? 'nouvel exercice sera ajouté' : 'nouveaux exercices seront ajoutés'} à votre bibliothèque.`
        : de ? ` ${n} neue ${n === 1 ? 'Übung wird' : 'Übungen werden'} deiner Bibliothek hinzugefügt.`
          : ` ${n} ${n === 1 ? 'nuovo esercizio verrà aggiunto' : 'nuovi esercizi verranno aggiunti'} alla tua libreria.`;
    } else if (value.includes('already in your library')) {
      sentence += fr ? ' Les exercices inclus sont déjà dans votre bibliothèque.'
        : de ? ' Die enthaltenen Übungen sind bereits in deiner Bibliothek.'
          : ' Gli esercizi inclusi sono già nella tua libreria.';
    }
    return sentence + (fr ? ' Voulez-vous continuer ?' : de ? ' Möchtest du fortfahren?' : ' Vuoi continuare?');
  }
  match = value.match(/^(\d+) (routine|routines) with (\d+) (exercise|exercises) will be added to ProFit\. Would you like to continue\?$/);
  if (match) return fr ? `${match[1]} ${Number(match[1]) === 1 ? 'routine sera ajoutée' : 'routines seront ajoutées'} à ProFit avec ${match[3]} ${Number(match[3]) === 1 ? 'exercice' : 'exercices'}. Voulez-vous continuer?`
    : de ? `${match[1]} ${Number(match[1]) === 1 ? 'Trainingsplan wird' : 'Trainingspläne werden'} mit ${match[3]} ${Number(match[3]) === 1 ? 'Übung' : 'Übungen'} zu ProFit hinzugefügt. Möchtest du fortfahren?`
      : `Verranno aggiunte ${match[1]} ${Number(match[1]) === 1 ? 'routine' : 'routine'} a ProFit con ${match[3]} ${Number(match[3]) === 1 ? 'esercizio' : 'esercizi'}. Vuoi continuare?`;
  match = value.match(/^(\d+(?:[.,]\d+)?) min estimated$/);
  if (match) return fr ? `${match[1]} min estimées` : de ? `${match[1]} Min. geschätzt` : `${match[1]} min stimati`;
  match = value.match(/^(.+?), no workouts$/);
  if (match) return fr ? `${match[1]}, aucune séance` : de ? `${match[1]}, keine Trainingseinheiten` : `${match[1]}, nessuna sessione`;
  match = value.match(/^(.+?), (\d+) (workout|workouts)$/);
  if (match) return fr ? `${match[1]}, ${match[2]} ${Number(match[2]) === 1 ? 'séance' : 'séances'}`
    : de ? `${match[1]}, ${match[2]} ${Number(match[2]) === 1 ? 'Trainingseinheit' : 'Trainingseinheiten'}`
      : `${match[1]}, ${match[2]} ${Number(match[2]) === 1 ? 'sessione' : 'sessioni'}`;
  match = value.match(/^We use your latest weigh-in \((.+?) kg\) as a reference\. Water is estimated at 35 mL\/kg\.$/);
  if (match) return fr ? `Nous utilisons votre dernière pesée (${match[1]} kg) comme référence. L’eau est estimée à 35 mL/kg.`
    : de ? `Dein letzter Wiegeeintrag (${match[1]} kg) dient als Richtwert. Der Wasserbedarf wird auf 35 mL/kg geschätzt.`
      : `Usiamo l’ultima pesata (${match[1]} kg) come riferimento. L’acqua è stimata a 35 mL/kg.`;
  match = value.match(/^Step (\d+) of (\d+)$/);
  if (match) return fr ? `Étape ${match[1]} sur ${match[2]}` : de ? `Schritt ${match[1]} von ${match[2]}` : `Passaggio ${match[1]} di ${match[2]}`;
  match = value.match(/^GETTING STARTED · (\d{2}) \/ (\d{2})$/);
  if (match) return fr ? `POUR COMMENCER · ${match[1]} / ${match[2]}` : de ? `ERSTE SCHRITTE · ${match[1]} / ${match[2]}` : `PER INIZIARE · ${match[1]} / ${match[2]}`;
  match = value.match(/^(\d+) active days? this week$/);
  if (match) return fr ? `${match[1]} ${Number(match[1]) === 1 ? 'jour actif' : 'jours actifs'} cette semaine` : de ? `${match[1]} aktive Tage diese Woche` : `${match[1]} ${Number(match[1]) === 1 ? 'giorno attivo' : 'giorni attivi'} questa settimana`;
  match = value.match(/^(Collapse|Expand) group (.+)$/);
  if (match) {
    const word = fr ? (match[1] === 'Collapse' ? 'Réduire' : 'Développer') : de ? (match[1] === 'Collapse' ? 'Einklappen' : 'Ausklappen') : (match[1] === 'Collapse' ? 'Comprimi' : 'Espandi');
    if (match[2] === 'Sin grupo') return fr ? `${word} les routines sans groupe` : de ? `${word} Trainingspläne ohne Gruppe` : `${word} le routine senza gruppo`;
    return `${word} ${fr ? 'le groupe' : de ? 'die Gruppe' : 'il gruppo'} ${match[2]}`;
  }
  match = value.match(/^Create a routine (?:in the (.+) group|without a group)$/);
  if (match) return match[1] ? (fr ? `Créer une routine dans le groupe ${match[1]}` : de ? `Trainingsplan in der Gruppe ${match[1]} erstellen` : `Crea una routine nel gruppo ${match[1]}`)
    : (fr ? 'Créer une routine sans groupe' : de ? 'Trainingsplan ohne Gruppe erstellen' : 'Crea una routine senza gruppo');
  match = value.match(/^Drag (.+) to reorder$/);
  if (match) return fr ? `Faites glisser ${match[1]} pour réorganiser` : de ? `Ziehe ${match[1]}, um die Reihenfolge zu ändern` : `Trascina ${match[1]} per riordinare`;
  match = value.match(/^More options for (.+)$/);
  if (match) return fr ? `Plus d’options pour ${match[1]}` : de ? `Weitere Optionen für ${match[1]}` : `Altre opzioni per ${match[1]}`;
  match = value.match(/^Comment for (.+)$/);
  if (match) return fr ? `Commentaire pour ${match[1]}` : de ? `Kommentar für ${match[1]}` : `Commento per ${match[1]}`;
  match = value.match(/^Remove a set from (.+)$/);
  if (match) return fr ? `Retirer une série de ${match[1]}` : de ? `Einen Satz bei ${match[1]} entfernen` : `Rimuovi una serie da ${match[1]}`;
  match = value.match(/^Add a set to (.+)$/);
  if (match) return fr ? `Ajouter une série à ${match[1]}` : de ? `Einen Satz zu ${match[1]} hinzufügen` : `Aggiungi una serie a ${match[1]}`;
  match = value.match(/^Set (\d+) weight$/);
  if (match) return fr ? `Poids de la série ${match[1]}` : de ? `Gewicht für Satz ${match[1]}` : `Peso della serie ${match[1]}`;
  match = value.match(/^Activity time in minutes for (.+)$/);
  if (match) return fr ? `Durée de l’activité en minutes pour ${match[1]}` : de ? `Aktivitätsdauer in Minuten für ${match[1]}` : `Durata dell’attività in minuti per ${match[1]}`;
  match = value.match(/^Mark set (\d+) of (.+?) complete(?:\. Use the previous set: (.+))?$/);
  if (match) {
    const done = fr ? `Marquer la série ${match[1]} de ${match[2]} comme terminée` : de ? `Satz ${match[1]} bei ${match[2]} als erledigt markieren` : `Segna la serie ${match[1]} di ${match[2]} come completata`;
    return match[3] ? `${done}${fr ? `. Reprendre la série précédente : ${match[3]}` : de ? `. Vorherigen Satz übernehmen: ${match[3]}` : `. Usa la serie precedente: ${match[3]}`}` : done;
  }
  match = value.match(/^Muscle chart: (\d+) records across (\d+) visible muscle groups\.$/);
  if (match) return fr ? `Graphique musculaire : ${match[1]} entrées dans ${match[2]} groupes musculaires visibles.` : de ? `Muskelübersicht: ${match[1]} Einträge in ${match[2]} sichtbaren Muskelgruppen.` : `Grafico muscolare: ${match[1]} registrazioni in ${match[2]} gruppi muscolari visibili.`;
  match = value.match(/^(\d+) weeks achieved$/);
  if (match) return fr ? `${match[1]} semaines validées` : de ? `${match[1]} Wochen erreicht` : `${match[1]} settimane raggiunte`;
  match = value.match(/^Delete the full range \((\d+)\)$/);
  if (match) return fr ? `Supprimer toute la période (${match[1]})` : de ? `Den gesamten Zeitraum löschen (${match[1]})` : `Elimina tutto il periodo (${match[1]})`;
  match = value.match(/^Delete all workouts from this day \((\d+)\)$/);
  if (match) return fr ? `Supprimer toutes les séances de ce jour (${match[1]})` : de ? `Alle Trainingseinheiten dieses Tages löschen (${match[1]})` : `Elimina tutte le sessioni di questo giorno (${match[1]})`;
  match = value.match(/^Delete (.+) group and its (\d+) routines$/);
  if (match) return fr ? `Supprimer le groupe ${match[1]} et ses ${match[2]} routines` : de ? `Gruppe ${match[1]} und ${match[2]} zugehörige Trainingspläne löschen` : `Elimina il gruppo ${match[1]} e le sue ${match[2]} routine`;
  match = value.match(/^“(.+?)” exercise imported$/);
  if (match) return fr ? `Exercice « ${match[1]} » importé` : de ? `Übung „${match[1]}“ importiert` : `Esercizio «${match[1]}» importato`;
  match = value.match(/^“(.+?)” routine imported$/);
  if (match) return fr ? `Routine « ${match[1]} » importée` : de ? `Trainingsplan „${match[1]}“ importiert` : `Routine «${match[1]}» importata`;
  match = value.match(/^“(.+?)” workout imported$/);
  if (match) return fr ? `Séance « ${match[1]} » importée` : de ? `Training „${match[1]}“ importiert` : `Sessione «${match[1]}» importata`;
  match = value.match(/^Your last workout was (\d+) (day|days) ago\. Ready to get back to it\?$/);
  if (match) return fr ? `Votre dernière séance remonte à ${match[1]} ${Number(match[1]) === 1 ? 'jour' : 'jours'}. Prêt à reprendre ?` : de ? `Dein letztes Training war vor ${match[1]} ${Number(match[1]) === 1 ? 'Tag' : 'Tagen'}. Bereit für die nächste Einheit?` : `L’ultimo allenamento risale a ${match[1]} ${Number(match[1]) === 1 ? 'giorno' : 'giorni'} fa. Ti va di riprendere?`;
  match = value.match(/^(\d+) workouts to go\. Each one brings you closer\.$/);
  if (match) return fr ? `Encore ${match[1]} séances. Chacune vous rapproche de votre objectif.` : de ? `Noch ${match[1]} Trainingseinheiten. Jede bringt dich deinem Ziel näher.` : `Ti mancano ${match[1]} sessioni. Ognuna ti avvicina al tuo obiettivo.`;
  match = value.match(/^(\d+)-workout milestone reached! The next one is (\d+) workouts away\.$/);
  if (match) return fr ? `Jalon des ${match[1]} séances atteint ! Le prochain est à ${match[2]} séances.` : de ? `${match[1]} Trainingseinheiten geschafft! Der nächste Meilenstein ist noch ${match[2]} Einheiten entfernt.` : `Traguardo di ${match[1]} sessioni raggiunto! Il prossimo è a ${match[2]} sessioni.`;
  return value;
}

function translateDynamicSentence(value, language) {
  if (language === 'fr' || language === 'de' || language === 'it') {
    let fragment = value.match(/^(\d+)\s*(días? activo|días? consecutivos|día consecutivo|sesiones?|series?|días esta semana|min de sesión|min estimados|mejor peso|semanas seguidas|semanas cumplidas|sesiones registradas)$/i);
    if (fragment) {
      const count = Number(fragment[1]);
      const key = fragment[2].toLocaleLowerCase('es');
      const translations = {
        fr: {
          'día activo': 'jour actif', 'días activo': 'jours actifs', 'días activos': 'jours actifs', 'días consecutivos': 'jours consécutifs',
          'día consecutivo': 'jour consécutif', 'sesión': 'séance', 'sesiones': 'séances', 'serie': 'série', 'series': 'séries',
          'días esta semana': 'jours cette semaine', 'min de sesión': 'min de séance', 'min estimados': 'min estimées',
          'mejor peso': 'meilleur poids', 'semanas seguidas': 'semaines consécutives', 'semanas cumplidas': 'semaines accomplies', 'sesiones registradas': 'séances enregistrées',
        },
        de: {
          'día activo': 'aktiver Tag', 'días activo': 'aktive Tage', 'días activos': 'aktive Tage', 'días consecutivos': 'aufeinanderfolgende Tage',
          'día consecutivo': 'aufeinanderfolgender Tag', 'sesión': 'Trainingseinheit', 'sesiones': 'Trainingseinheiten', 'serie': 'Satz', 'series': 'Sätze',
          'días esta semana': 'Tage diese Woche', 'min de sesión': 'Min. Training', 'min estimados': 'Min. geschätzt',
          'mejor peso': 'höchstes Gewicht', 'semanas seguidas': 'Wochen in Folge', 'semanas cumplidas': 'erreichte Wochen', 'sesiones registradas': 'erfasste Trainingseinheiten',
        },
        it: {
          'día activo': 'giorno attivo', 'días activo': 'giorni attivi', 'días activos': 'giorni attivi', 'días consecutivos': 'giorni consecutivi',
          'día consecutivo': 'giorno consecutivo', 'sesión': 'sessione', 'sesiones': 'sessioni', 'serie': 'serie', 'series': 'serie',
          'días esta semana': 'giorni questa settimana', 'min de sesión': 'min di sessione', 'min estimados': 'min stimati',
          'mejor peso': 'peso massimo', 'semanas seguidas': 'settimane consecutive', 'semanas cumplidas': 'settimane completate', 'sesiones registradas': 'sessioni registrate',
        },
      }[language];
      const translated = translations[key];
      if (translated) return `${count} ${translated}`;
    }
    const english = translateDynamicSentence(value, 'en');
    return english === value ? value : translateEnglishDynamic(english, language);
  }
  const ca = language === 'ca';
  let match = value.match(/^Eliminar (\d+)$/);
  if (match) return ca ? `Eliminar ${match[1]}` : `Delete ${match[1]}`;
  match = value.match(/^Se añadir(?:á|án) (\d+) rutinas? con (\d+) ejercicios? en total\.(?: Se añadir(?:á|án) (\d+) ejercicios? nuevos? a tu biblioteca\.| Los ejercicios incluidos ya están en tu biblioteca\.)? ¿Quieres continuar\?$/);
  if (match) {
    const routines = Number(match[1]) === 1 ? (ca ? 'rutina' : 'routine') : (ca ? 'rutines' : 'routines');
    const exercises = Number(match[2]) === 1 ? (ca ? 'exercici' : 'exercise') : (ca ? 'exercicis' : 'exercises');
    let sentence = ca
      ? `${Number(match[1]) === 1 ? 'S’afegirà' : 'S’afegiran'} ${match[1]} ${routines} amb ${match[2]} ${exercises} en total.`
      : `${match[1]} ${routines} with ${match[2]} ${exercises} in total will be added.`;
    if (match[3]) {
      const newExercises = Number(match[3]) === 1 ? (ca ? 'exercici nou' : 'new exercise') : (ca ? 'exercicis nous' : 'new exercises');
      sentence += ca
        ? ` ${Number(match[3]) === 1 ? 'S’afegirà' : 'S’afegiran'} ${match[3]} ${newExercises} a la biblioteca.`
        : ` ${match[3]} ${newExercises} will be added to your library.`;
    } else if (value.includes('Los ejercicios incluidos')) {
      sentence += ca
        ? ' Els exercicis inclosos ja són a la teva biblioteca.'
        : ' The included exercises are already in your library.';
    }
    return sentence + (ca ? ' Vols continuar?' : ' Would you like to continue?');
  }
  match = value.match(/^Se añadirán (\d+) rutinas? a ProFit, con (\d+) ejercicios?\. ¿Quieres continuar\?$/);
  if (match) return ca
    ? `S’afegiran ${match[1]} ${Number(match[1]) === 1 ? 'rutina' : 'rutines'} a ProFit, amb ${match[2]} ${Number(match[2]) === 1 ? 'exercici' : 'exercicis'}. Vols continuar?`
    : `${match[1]} ${Number(match[1]) === 1 ? 'routine' : 'routines'} with ${match[2]} ${Number(match[2]) === 1 ? 'exercise' : 'exercises'} will be added to ProFit. Would you like to continue?`;
  match = value.match(/^(\d+(?:[.,]\d+)?) min estimados$/);
  if (match) return ca ? `${match[1]} min estimats` : `${match[1]} min estimated`;
  match = value.match(/^(.+?), sin entrenamientos$/);
  if (match) return ca ? `${match[1]}, sense entrenaments` : `${match[1]}, no workouts`;
  match = value.match(/^(.+?), (\d+) entrenamientos?$/);
  if (match) return ca
    ? `${match[1]}, ${match[2]} ${Number(match[2]) === 1 ? 'entrenament' : 'entrenaments'}`
    : `${match[1]}, ${match[2]} ${Number(match[2]) === 1 ? 'workout' : 'workouts'}`;
  match = value.match(/^Usamos tu último pesaje \(([\d.,]+) kg\) como referencia\. El agua se estima en 35 mL\/kg\.$/);
  if (match) return ca
    ? `Fem servir l’últim pesatge (${match[1]} kg) com a referència. L’aigua s’estima en 35 mL/kg.`
    : `We use your latest weigh-in (${match[1]} kg) as a reference. Water is estimated at 35 mL/kg.`;
  match = value.match(/^Paso (\d+) de (\d+)$/);
  if (match) return ca ? `Pas ${match[1]} de ${match[2]}` : `Step ${match[1]} of ${match[2]}`;
  match = value.match(/^GUÍA DE INICIO · (\d{2}) \/ (\d{2})$/);
  if (match) return ca ? `GUIA D’INICI · ${match[1]} / ${match[2]}` : `GETTING STARTED · ${match[1]} / ${match[2]}`;
  const exerciseName = (name) => translateBundledExerciseName(name, language);
  const localizedLabel = (label) => dictionaries[language]?.[label] || label;
  match = value.match(/^(\d+) (día activo|días activos) esta semana$/);
  if (match) return ca
    ? `${match[1]} ${Number(match[1]) === 1 ? 'dia actiu' : 'dies actius'} aquesta setmana`
    : `${match[1]} ${Number(match[1]) === 1 ? 'active day' : 'active days'} this week`;
  match = value.match(/^(Contraer|Expandir) grupo (.+)$/);
  if (match) {
    const verb = ca ? (match[1] === 'Contraer' ? 'Plega' : 'Desplega') : (match[1] === 'Contraer' ? 'Collapse' : 'Expand');
    if (match[2] === 'Sin grupo') return ca ? `${verb} les rutines sense grup` : `${verb} ungrouped routines`;
    return `${verb} ${ca ? 'el grup' : 'group'} ${localizedLabel(match[2])}`;
  }
  match = value.match(/^Crear rutina en (.+)$/);
  if (match) {
    if (match[1] === 'Sin grupo') return ca ? 'Crea una rutina sense grup' : 'Create a routine without a group';
    return ca ? `Crea una rutina al grup ${localizedLabel(match[1])}` : `Create a routine in the ${localizedLabel(match[1])} group`;
  }
  match = value.match(/^Arrastrar (.+?) para cambiar (?:su orden|el orden)$/);
  if (match) {
    const label = localizedLabel(match[1]);
    return ca ? `Arrossega ${label} per canviar-ne l’ordre` : `Drag ${label} to reorder`;
  }
  match = value.match(/^Más opciones para (.+)$/);
  if (match) return ca ? `Més opcions per a ${exerciseName(match[1])}` : `More options for ${exerciseName(match[1])}`;
  match = value.match(/^Comentario para (.+)$/);
  if (match) return ca ? `Comentari per a ${exerciseName(match[1])}` : `Comment for ${exerciseName(match[1])}`;
  match = value.match(/^Quitar serie de (.+)$/);
  if (match) return ca ? `Treure una sèrie de ${exerciseName(match[1])}` : `Remove a set from ${exerciseName(match[1])}`;
  match = value.match(/^Añadir serie a (.+)$/);
  if (match) return ca ? `Afegir una sèrie a ${exerciseName(match[1])}` : `Add a set to ${exerciseName(match[1])}`;
  match = value.match(/^Quitar (.+)$/);
  if (match) return ca ? `Treure ${exerciseName(match[1])}` : `Remove ${exerciseName(match[1])}`;
  match = value.match(/^(Cerrar|Editar) plantilla de (.+)$/);
  if (match) return ca
    ? `${match[1] === 'Cerrar' ? 'Tancar' : 'Editar'} la plantilla de ${exerciseName(match[2])}`
    : `${match[1] === 'Cerrar' ? 'Close' : 'Edit'} the template for ${exerciseName(match[2])}`;
  match = value.match(/^Peso serie (\d+)$/);
  if (match) return ca ? `Pes de la sèrie ${match[1]}` : `Set ${match[1]} weight`;
  match = value.match(/^(Reps|Duración \(s\))(?: de la serie (\d+))? para (.+)$/);
  if (match) {
    const label = localizedLabel(match[1]);
    const series = match[2] ? (ca ? ` de la sèrie ${match[2]}` : ` for set ${match[2]}`) : '';
    return ca ? `${label}${series} per a ${exerciseName(match[3])}` : `${label}${series} for ${exerciseName(match[3])}`;
  }
  match = value.match(/^Tiempo de actividad en minutos para (.+)$/);
  if (match) return ca ? `Temps d’activitat en minuts per a ${exerciseName(match[1])}` : `Activity time in minutes for ${exerciseName(match[1])}`;
  match = value.match(/^Marcar serie completada\. Si está vacía, copiar última serie: (.+)$/);
  if (match) return ca
    ? `Marca la sèrie com a completada. Si és buida, copia l’última sèrie: ${match[1]}`
    : `Mark set complete. If empty, copy the previous set: ${match[1]}`;
  match = value.match(/^Marcar serie (\d+) de (.+?) como completada(?:\. Usar última serie: (.+))?$/);
  if (match) {
    const completion = ca
      ? `Marca la sèrie ${match[1]} de ${exerciseName(match[2])} com a completada`
      : `Mark set ${match[1]} of ${exerciseName(match[2])} complete`;
    return match[3]
      ? `${completion}${ca ? `. Fes servir l’última sèrie: ${match[3]}` : `. Use the previous set: ${match[3]}`}`
      : completion;
  }
  match = value.match(/^Radar de músculos: (\d+) registros en (\d+) grupos musculares visibles\.$/);
  if (match) return ca
    ? `Radar muscular: ${match[1]} registres en ${match[2]} grups musculars visibles.`
    : `Muscle chart: ${match[1]} records across ${match[2]} visible muscle groups.`;
  match = value.match(/^(\d+) semanas cumplidas$/);
  if (match) return ca ? `${match[1]} setmanes assolides` : `${match[1]} weeks achieved`;
  match = value.match(/^Eliminar todo el rango \(([0-9]+)\)$/);
  if (match) return ca ? `Eliminar tot el rang (${match[1]})` : `Delete the full range (${match[1]})`;
  match = value.match(/^Eliminar todas las sesiones de este día \(([0-9]+)\)$/);
  if (match) return ca ? `Eliminar totes les sessions d’aquest dia (${match[1]})` : `Delete all workouts from this day (${match[1]})`;
  match = value.match(/^Eliminar (.+?) de la lista y del radar$/);
  if (match) return ca
    ? `Eliminar ${translateBundledExerciseName(match[1], language)} de la llista i del radar`
    : `Remove ${translateBundledExerciseName(match[1], language)} from the list and chart`;
  match = value.match(/^Eliminar grupo (.+?) y sus (\d+) rutinas$/);
  if (match) return ca
    ? `Eliminar el grup ${match[1]} i les seves ${match[2]} rutines`
    : `Delete ${match[1]} group and its ${match[2]} routines`;
  match = value.match(/^Eliminar (.+)$/);
  if (match) return ca
    ? `Eliminar ${translateBundledExerciseName(match[1], language)}`
    : `Delete ${translateBundledExerciseName(match[1], language)}`;
  match = value.match(/^Iniciar (.+)$/);
  if (match) return ca
    ? `Iniciar ${translateBundledExerciseName(match[1], language)}`
    : `Start ${translateBundledExerciseName(match[1], language)}`;
  match = value.match(/^Añadir (.+?) a la rutina$/);
  if (match) return ca
    ? `Afegir ${translateBundledExerciseName(match[1], language)} a la rutina`
    : `Add ${translateBundledExerciseName(match[1], language)} to routine`;
  if (value === 'Compartir rutinas sin grupo') return ca ? 'Compartir rutines sense grup' : 'Share ungrouped routines';
  match = value.match(/^Compartir grupo (.+)$/);
  if (match) return ca ? `Compartir el grup ${match[1]}` : `Share the ${match[1]} group`;
  match = value.match(/^Compartir (.+)$/);
  if (match) return ca
    ? `Compartir ${translateBundledExerciseName(match[1], language)}`
    : `Share ${translateBundledExerciseName(match[1], language)}`;
  match = value.match(/^El archivo supera el máximo de (.+)\.$/);
  if (match) return ca ? `El fitxer supera el màxim de ${match[1]}.` : `File exceeds the ${match[1]} limit.`;
  match = value.match(/^Tipo MessagePack no compatible: .+$/);
  if (match) return translateMessagePackErrorDetail(value, language);
  match = value.match(/^Formato MessagePack no admitido \(0x[0-9a-f]+\)$/i);
  if (match) return translateMessagePackErrorDetail(value, language);
  match = value.match(/^No se pudo leer el MessagePack: (.+)$/);
  if (match) {
    const detail = translateMessagePackErrorDetail(match[1], language);
    return ca ? `No s’ha pogut llegir el MessagePack: ${detail}` : `Could not read the MessagePack file: ${detail}`;
  }
  match = value.match(/^Falta el archivo multimedia de «(.+?)»\. No se exportó una copia incompleta\.$/);
  if (match) return ca
    ? `Falta el fitxer multimèdia de «${translateBundledExerciseName(match[1], language)}». No s’ha exportat una còpia incompleta.`
    : `Media for “${translateBundledExerciseName(match[1], language)}” is missing. The incomplete export was cancelled.`;
  match = value.match(/^El archivo multimedia de «(.+?)» está vacío\.$/);
  if (match) return ca
    ? `El fitxer multimèdia de «${translateBundledExerciseName(match[1], language)}» és buit.`
    : `Media for “${translateBundledExerciseName(match[1], language)}” is empty.`;
  match = value.match(/^No se pudo leer el medio de «(.+?)» para exportarlo\.$/);
  if (match) return ca
    ? `No s’ha pogut llegir el fitxer multimèdia de «${translateBundledExerciseName(match[1], language)}» per exportar-lo.`
    : `Could not read media for “${translateBundledExerciseName(match[1], language)}” to export it.`;
  match = value.match(/^“(.+?)” eliminado de los músculos y del radar$/);
  if (match) return ca
    ? `«${match[1]}» s’ha eliminat de la llista de músculs i del radar`
    : `“${match[1]}” was removed from your muscles and chart`;
  match = value.match(/^El grupo «(.+?)» ya existe$/);
  if (match) return ca ? `El grup «${match[1]}» ja existeix` : `The “${match[1]}” group already exists`;
  match = value.match(/^Grupo «(.+?)» creado$/);
  if (match) return ca ? `S’ha creat el grup «${match[1]}»` : `“${match[1]}” group created`;
  match = value.match(/^Ejercicio «(.+?)» importado$/);
  if (match) {
    const exerciseName = translateBundledExerciseName(match[1], language);
    return ca ? `S’ha importat l’exercici «${exerciseName}»` : `“${exerciseName}” exercise imported`;
  }
  match = value.match(/^Rutina «(.+?)» importada$/);
  if (match) return ca ? `S’ha importat la rutina «${match[1]}»` : `“${match[1]}” routine imported`;
  match = value.match(/^Entrenamiento «(.+?)» importado$/);
  if (match) return ca ? `S’ha importat l’entrenament «${match[1]}»` : `“${match[1]}” workout imported`;
  match = value.match(/^(\d+) rutina sin grupo importada$/);
  if (match) return ca ? `S’ha importat ${match[1]} rutina sense grup` : `Imported ${match[1]} ungrouped routine`;
  match = value.match(/^(\d+) rutinas sin grupo importadas$/);
  if (match) return ca ? `S’han importat ${match[1]} rutines sense grup` : `Imported ${match[1]} ungrouped routines`;
  match = value.match(/^Grupo «(.+?)» y (\d+) rutina importada$/);
  if (match) return ca ? `S’ha importat el grup «${match[1]}» i ${match[2]} rutina` : `Imported “${match[1]}” group and ${match[2]} routine`;
  match = value.match(/^Grupo «(.+?)» y (\d+) rutinas importadas$/);
  if (match) return ca ? `S’ha importat el grup «${match[1]}» i ${match[2]} rutines` : `Imported “${match[1]}” group and ${match[2]} routines`;
  match = value.match(/^Este archivo contiene (backup|routine|exercise|workout), no (una rutina o grupo de rutinas|un ejercicio)\.$/);
  if (match) {
    const labels = ca
      ? { backup: 'una còpia de seguretat', routine: 'una rutina', exercise: 'un exercici', workout: 'un entrenament', 'una rutina o grupo de rutinas': 'una rutina o un grup de rutines', 'un ejercicio': 'un exercici' }
      : { backup: 'a backup', routine: 'a routine', exercise: 'an exercise', workout: 'a workout', 'una rutina o grupo de rutinas': 'a routine or routine group', 'un ejercicio': 'an exercise' };
    return ca
      ? `Aquest fitxer conté ${labels[match[1]]}, no ${labels[match[2]]}.`
      : `This file contains ${labels[match[1]]}, not ${labels[match[2]]}.`;
  }
  match = value.match(/^Se quitará “(.+?)” de la lista, los ejercicios y sus registros del historial\. También dejará de aparecer en el radar\.$/);
  if (match) return ca
    ? `«${match[1]}» s’eliminarà de la llista, dels exercicis i dels registres de l’historial. També deixarà d’aparèixer al radar.`
    : `“${match[1]}” will be removed from the list, exercises and history. It will also disappear from the chart.`;
  match = value.match(/^Grupo y (\d+) rutinas? asociadas? eliminados$/);
  if (match) return ca
    ? `S’han eliminat el grup i ${match[1]} ${Number(match[1]) === 1 ? 'rutina associada' : 'rutines associades'}`
    : `Group and ${match[1]} associated ${Number(match[1]) === 1 ? 'routine' : 'routines'} deleted`;
  match = value.match(/^(\d+) (entrenamiento|entrenamientos) eliminado(s)?$/);
  if (match) return ca
    ? `S’han eliminat ${match[1]} ${Number(match[1]) === 1 ? 'entrenament' : 'entrenaments'}`
    : `${match[1]} ${Number(match[1]) === 1 ? 'workout' : 'workouts'} deleted`;
  match = value.match(/^Tu última sesión fue hace (\d+) (día|días)\. ¿Te apetece volver\?$/);
  if (match) return ca
    ? `Fa ${match[1]} ${match[1] === '1' ? 'dia' : 'dies'} que vas fer l’última sessió. Et ve de gust tornar-hi?`
    : `Your last workout was ${match[1]} ${match[1] === '1' ? 'day' : 'days'} ago. Ready to get back to it?`;
  match = value.match(/^Te faltan (\d+) sesiones\. Cada una te acerca\.$/);
  if (match) return ca
    ? `Et falten ${match[1]} sessions. Cada una t’hi acosta.`
    : `${match[1]} workouts to go. Each one brings you closer.`;
  match = value.match(/^¡Hito de (\d+) conseguido! El siguiente está a (\d+) sesiones\.$/);
  if (match) return ca
    ? `Has assolit la fita de ${match[1]}! La següent és a ${match[2]} sessions.`
    : `${match[1]}-workout milestone reached! The next one is ${match[2]} workouts away.`;
  match = value.match(/^Se eliminará «(.+?)» y sus (\d+) rutina(s)? asociada(s)?\. Las sesiones ya guardadas se conservarán\.$/);
  if (match) return ca
    ? `S’eliminarà «${match[1]}» i ${match[2]} ${Number(match[2]) === 1 ? 'rutina associada' : 'rutines associades'}. Les sessions desades es conservaran.`
    : `“${match[1]}” and its ${match[2]} associated ${Number(match[2]) === 1 ? 'routine' : 'routines'} will be deleted. Saved workouts will be kept.`;
  match = value.match(/^Se eliminará «(.+?)»\. Las sesiones ya guardadas se conservarán\.$/);
  if (match) return ca
    ? `S’eliminarà «${match[1]}». Les sessions desades es conservaran.`
    : `“${match[1]}” will be deleted. Saved workouts will be kept.`;
  match = value.match(/^¿Eliminar “(.+?)” del (.+?)\? Esta acción no se puede deshacer\.$/);
  if (match) return ca
    ? `Vols eliminar «${match[1]}» del ${match[2]}? Aquesta acció no es pot desfer.`
    : `Delete “${match[1]}” from ${match[2]}? This action can’t be undone.`;
  match = value.match(/^¿Eliminar “(.+?)”\? Las sesiones guardadas no se borrarán\.$/);
  if (match) return ca
    ? `Vols eliminar «${match[1]}»? No s’esborraran les sessions desades.`
    : `Delete “${match[1]}”? Saved workouts won’t be deleted.`;
  match = value.match(/^¿Quitar “(.+?)” de tu biblioteca y de las rutinas donde aparece\? Las sesiones guardadas se conservan\.$/);
  if (match) return ca
    ? `Vols treure «${match[1]}» de la biblioteca i de les rutines on apareix? Les sessions desades es conservaran.`
    : `Remove “${match[1]}” from your library and every routine that uses it? Saved workouts will be kept.`;
  match = value.match(/^¿Eliminar (\d+) (entrenamiento|entrenamientos) del período (.+?)\? Esta acción no se puede deshacer\.$/);
  if (match) return ca
    ? `Vols eliminar ${match[1]} ${Number(match[1]) === 1 ? 'entrenament' : 'entrenaments'} del període ${match[3]}? Aquesta acció no es pot desfer.`
    : `Delete ${match[1]} ${Number(match[1]) === 1 ? 'workout' : 'workouts'} from ${match[3]}? This action can’t be undone.`;
  match = value.match(/^¿Eliminar el registro del (.+?)\?$/);
  if (match) return ca ? `Vols eliminar el registre del ${match[1]}?` : `Delete the entry from ${match[1]}?`;
  return value;
}

const translatableAttributes = ['aria-label', 'aria-description', 'aria-valuetext', 'alt', 'placeholder', 'title'];
const previousVNodeHook = options.vnode;
options.vnode = (vnode) => {
  previousVNodeHook?.(vnode);
  if (typeof vnode.type !== 'string' || !vnode.props) return;
  let nextProps = vnode.props;
  let changed = false;
  for (const attribute of translatableAttributes) {
    const value = nextProps[attribute];
    if (typeof value !== 'string') continue;
    const translated = translateText(value);
    if (translated !== value) {
      if (!changed) nextProps = { ...nextProps };
      nextProps[attribute] = translated;
      changed = true;
    }
  }
  const translateChildren = (children, skipTranslation = false) => {
    if (skipTranslation) return children;
    if (typeof children === 'string') return translateText(children);
    if (!Array.isArray(children)) return children;
    let arrayChanged = false;
    const translated = children.map((child) => {
      const next = translateChildren(child);
      if (next !== child) arrayChanged = true;
      return next;
    });
    return arrayChanged ? translated : children;
  };
  const children = translateChildren(nextProps.children, nextProps.translate === 'no');
  if (children !== nextProps.children) {
    if (!changed) nextProps = { ...nextProps };
    nextProps.children = children;
    changed = true;
  }
  if (changed) vnode.props = nextProps;
};
