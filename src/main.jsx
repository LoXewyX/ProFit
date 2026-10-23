import { render } from "preact";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import {
  activateLanguage,
  decimalSeparator,
  intlLocale,
  parseLocalizedDecimal,
  registerBundledExerciseNames,
  resolveLanguage,
  translateText,
} from "./i18n.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { decodeRoutinePlan } from "./routine-link-codec.js";
import {
  buildMuscleLoad,
  getMuscleFocus,
  MuscleInsights,
  MuscleMap,
} from "./muscles.jsx";
import { decodeMessagePack, encodeMessagePack } from "./msgpack.js";
import {
  deleteExerciseAsset,
  getExerciseAsset,
  saveExerciseAsset,
} from "./exercise-assets.js";
import { ExerciseDemo, ExerciseThumb } from "./ExerciseMedia.jsx";
import {
  exerciseDoseLabel,
  exerciseMuscleLine,
  exercisePrimaryMuscleLabel,
  exerciseTracksReps,
  exerciseTracksSets,
  exerciseTracksWeight,
  exerciseValueLabel,
  hasExerciseDemoMedia,
  isExerciseDemoVideo,
  isTimedPrescription,
} from "./exercise-model.js";
import "./style.css";

const WorkoutNotification = registerPlugin("WorkoutNotification");
const AndroidShare = registerPlugin("AndroidShare");
const AndroidNavigation = registerPlugin("AndroidNavigation");
const RoutineLink = registerPlugin("RoutineLink");
const HydrationReminder = registerPlugin("HydrationReminder");
const WeighInReminder = registerPlugin("WeighInReminder");
const ProteinReminder = registerPlugin("ProteinReminder");
const ProgressPhotos = registerPlugin("ProgressPhotos");

const today = () => new Date();
const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const kgToUnit = (value, unit) =>
  unit === "lb" ? parseLocalizedDecimal(value) * 2.20462 : parseLocalizedDecimal(value);
const unitToKg = (value, unit) =>
  unit === "lb" ? parseLocalizedDecimal(value) / 2.20462 : parseLocalizedDecimal(value);
const formatEditableDecimal = (value, maximumFractionDigits = 12) =>
  value === "" || value === null || value === undefined
    ? ""
    : Number(value).toLocaleString(intlLocale(), {
        useGrouping: false,
        maximumFractionDigits,
      });
const formatMassValue = (value, unit = "kg") =>
  value === null || value === undefined || value === ""
    ? "—"
    : `${kgToUnit(value, unit).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${unit}`;
const compositionMeasureType = (measure, key) => {
  const savedType = measure?.[`${key}Type`];
  if (savedType === "percent" || savedType === "mass") return savedType;
  // Older weigh-ins stored fat/water as percentages and muscle/bone as kg.
  return key === "bodyFat" || key === "water" ? "percent" : "mass";
};
const formatCompositionMeasure = (measure, key, unit = "kg") => {
  const value = measure?.[key];
  if (value === null || value === undefined || value === "") return "—";
  if (compositionMeasureType(measure, key) === "mass")
    return formatMassValue(value, unit);
  return `${Number(value).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} %`;
};
const compressMeasurePhoto = async (file, highResolution = false) => {
  if (!file?.type?.startsWith("image/"))
    throw new Error("Elige un archivo de imagen válido.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("La imagen debe ocupar menos de 25 MB antes de comprimirla.");
  let bitmap;
  let fallbackUrl = "";
  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file);
  } else {
    fallbackUrl = URL.createObjectURL(file);
    bitmap = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      image.src = fallbackUrl;
    }).finally(() => URL.revokeObjectURL(fallbackUrl));
  }
  const sourceWidth = bitmap.width || bitmap.naturalWidth;
  const sourceHeight = bitmap.height || bitmap.naturalHeight;
  const maxDimension = highResolution ? 1920 : 960;
  const scale = Math.min(
    1,
    maxDimension / Math.max(sourceWidth, sourceHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close?.();
    throw new Error("No se pudo preparar la imagen.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No se pudo comprimir la imagen.")),
      "image/jpeg",
      highResolution ? 0.88 : 0.72,
    ),
  );
};
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
const saveProgressPhotoToGallery = async (blob) => {
  if (Capacitor.getPlatform() !== "android") {
    throw new Error("Guardar fotos en Fotos/ProFit solo está disponible en Android.");
  }
  const dataUrl = await blobToDataUrl(blob);
  return saveProgressPhotoDataUrl(dataUrl);
};
const saveProgressPhotoDataUrl = async (dataUrl) => {
  if (Capacitor.getPlatform() !== "android") {
    throw new Error("Guardar fotos en Fotos/ProFit solo está disponible en Android.");
  }
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("No se pudo preparar la foto para la galería.");
  return ProgressPhotos.savePhoto({ data: match[2], mimeType: match[1] });
};
const dataUrlToBlob = async (value) => {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  return (await fetch(value)).blob();
};
const weekStartKey = (date = today(), weekStartsOn = 1) => {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  return dateKey(start);
};
const normalizeWeekStartsOn = (value) =>
  Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 6
    ? Number(value)
    : 1;
const weekdayNames = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const shiftDateKey = (key, days) => {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
const getWeeklyGoalStats = (
  workouts,
  goal,
  goalHistory = {},
  currentDate = today(),
  weekStartsOn = 1,
) => {
  const dates = new Set(
    workouts
      .map((workout) => workout.date)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  );
  const todayKey = dateKey(currentDate);
  const currentWeekStart = weekStartKey(currentDate, weekStartsOn);
  const currentWeekDays = [...dates].filter(
    (date) => date >= currentWeekStart && date <= todayKey,
  ).length;
  const firstWorkout = [...dates].sort()[0];
  if (!firstWorkout)
    return { completedWeeks: 0, streak: 0, bestStreak: 0, currentWeekDays };
  const lastCompletedWeekStart = shiftDateKey(currentWeekStart, -7);
  const daysByWeek = new Map();
  dates.forEach((date) => {
    const week = weekStartKey(new Date(`${date}T12:00:00`), weekStartsOn);
    daysByWeek.set(week, (daysByWeek.get(week) || 0) + 1);
  });
  let week = weekStartKey(new Date(`${firstWorkout}T12:00:00`), weekStartsOn);
  let completedWeeks = 0;
  let streak = 0;
  let bestStreak = 0;
  while (week <= lastCompletedWeekStart) {
    const weekGoal = Number(goalHistory[week]) || goal;
    if ((daysByWeek.get(week) || 0) >= weekGoal) {
      completedWeeks += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
    week = shiftDateKey(week, 7);
  }
  return { completedWeeks, streak, bestStreak, currentWeekDays };
};
const timeGreeting = () => {
  const hour = today().getHours();
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 20) return "Buenas tardes";
  return "Buenas noches";
};
const dayOffset = (n) => {
  const d = today();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return dateKey(d);
};
const trainingStreak = (workouts) => {
  const dates = new Set(workouts.map((workout) => workout.date));
  let offset = dates.has(dayOffset(0)) ? 0 : 1;
  let streak = 0;
  while (dates.has(dayOffset(offset))) {
    streak += 1;
    offset += 1;
  }
  return streak;
};
const dateLabel = (date, options = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat(intlLocale(), options).format(
    new Date(`${date}T12:00:00`),
  );
const safeRestSeconds = (value, fallback = 60) => {
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.min(3600, Math.max(0, Math.round(seconds)))
    : fallback;
};
const boundedIntegerValue = (value, minimum, maximum, fallback) => {
  const numeric = value === "" || value === null ? Number.NaN : Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, Math.round(numeric)))
    : fallback;
};
const normalizeExerciseData = (exercise = {}) => {
  const { category, subtype, demo, ...normalized } = exercise;
  const legacyActivity = ["Cardio", "Movilidad"].includes(category);
  if (normalized.trackSets === undefined && legacyActivity)
    normalized.trackSets = false;
  if (normalized.trackReps === undefined && legacyActivity)
    normalized.trackReps = false;
  if (normalized.trackWeight === undefined) normalized.trackWeight = true;
  if (normalizeMuscleFilterValue(normalized.muscle) === "otro")
    normalized.muscle = "";
  if (Array.isArray(normalized.secondary))
    normalized.secondary = normalized.secondary.filter(
      (muscle) => normalizeMuscleFilterValue(muscle) !== "otro",
    );
  return normalized;
};
const normalizeWorkoutExercises = (workout) => ({
  ...workout,
  exercises: (workout.exercises || []).map((exercise) =>
    normalizeExerciseData({
      ...exercise,
      id: exercise.id,
    }),
  ),
  newMedals: Array.isArray(workout.newMedals)
    ? workout.newMedals.map((medal) => ({
        ...medal,
        exerciseId: medal.exerciseId,
      }))
    : workout.newMedals,
});
const normalizeRoutineExerciseIds = (routine) => {
  const exercises = routine?.exercises || [];
  const exerciseSettings = Object.fromEntries(
    Object.entries(routine?.exerciseSettings || {}).map(([id, settings]) => [
      id,
      settings,
    ]),
  );
  return { ...routine, exercises, exerciseSettings };
};
const playLocalSound = (filename, volume = 0.72) => {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("profit-sounds-muted") === "true"
    )
      return;
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${filename}`);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    /* El sonido es complementario; completar el ejercicio no depende de audio. */
  }
};
const playNotificationSound = () => {
  try {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/continue.mp3`);
    audio.volume = 0.72;
    audio.play().catch(() => {});
  } catch {
    /* Browser notification sound is best-effort; the notification still appears. */
  }
};
const playExerciseCompletedSound = () => playLocalSound("completed.mp3");
const playWorkoutFanfare = () => playLocalSound("fanfare.mp3", 0.86);
const playRestFinishedSound = () => playLocalSound("continue.mp3");
const playWarningSound = () => playLocalSound("warn.mp3");
const isWarningMessage = (message) =>
    /(?:no se pudo|no se pudieron|no se puede|no se pueden|no incluye|no contiene|no tiene un formato|no válido|error|permite las notificaciones|activa las notificaciones|puedes activar los avisos|ajustes del sistema|elige un archivo|ya existe|termina la sesión|no se guardó|descartarán|incompleto|aún no|todavía no)/i.test(
    String(message || ""),
  );
const searchStopWords = new Set(
  "a an and al algo ante any are as at bajo be but by cabe con contra de del desde during durante e el ella en entre era es esta este for from hacia hasta have he her him his how i in into is it la las lo los mas me mediante mi my no nor of o on or para pero por que se según segun she sin so sobre su sus the their them then there these they this those through to tras tu un una unas uno unos y ya".split(
    " ",
  ),
);
const normalizeSearchText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const levenshteinWithin = (left, right, limit) => {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let smallest = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
      smallest = Math.min(smallest, current[column]);
    }
    if (smallest > limit) return false;
    previous = current;
  }
  return previous[right.length] <= limit;
};
const matchesSearchQuery = (query, values) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const searchableText = normalizeSearchText(
    (Array.isArray(values) ? values : [values]).filter(Boolean).join(" "),
  );
  if (!searchableText) return false;
  if (searchableText.includes(normalizedQuery)) return true;
  const words = searchableText.split(" ");
  const queryWords = normalizedQuery
    .split(" ")
    .filter((word) => !searchStopWords.has(word));
  return queryWords.every((word) =>
    words.some((candidate) => {
      if (
        candidate === word ||
        candidate.startsWith(word) ||
        (word.length >= 4 && candidate.includes(word))
      )
        return true;
      const limit =
        Math.max(word.length, candidate.length) >= 8
          ? 2
          : Math.max(word.length, candidate.length) >= 5
            ? 1
            : 0;
      return limit > 0 && levenshteinWithin(word, candidate, limit);
    }),
  );
};
const exerciseSearchValues = (exercise) => {
  const values = [
    exercise?.name,
    exercise?.muscle,
    ...(exercise?.secondary || []),
    exercise?.equipment,
    exercise?.description,
    ...(exercise?.cues || []),
  ].filter(Boolean);
  return values.flatMap((value) => {
    const localized = translateText(String(value));
    return localized === value ? [value] : [value, localized];
  });
};
const safeSetCount = (value, fallback = 1) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30
    ? parsed
    : fallback;
};
const fullDate = () =>
  new Intl.DateTimeFormat(intlLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(today());
const uid = () => Math.random().toString(36).slice(2, 10);
const cmToIn = (cm) => parseLocalizedDecimal(cm || 0) / 2.54;
const inToCm = (inches) => Number(inches || 0) * 2.54;
const waterReminderIntervals = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240];
const weekdayNarrowLabel = (day) => {
  const locale = intlLocale();
  const label = new Intl.DateTimeFormat(locale, { weekday: "short" })
    .format(new Date(2024, 0, 7 + day))
    .replace(/\.$/, "");
  return `${label.charAt(0).toLocaleUpperCase(locale)}${label.slice(1)}`;
};
const reminderWeekdays = [
  { day: 1, name: "lunes" },
  { day: 2, name: "martes" },
  { day: 3, name: "miércoles" },
  { day: 4, name: "jueves" },
  { day: 5, name: "viernes" },
  { day: 6, name: "sábado" },
  { day: 0, name: "domingo" },
];
const normalizeReminderDays = (value) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .map(Number)
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        ),
      ].sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];
const normalizeQuietHours = (value) => {
  const validTime = (candidate, fallback) => {
    if (!/^\d{2}:\d{2}$/.test(candidate || "")) return fallback;
    const [hour, minute] = candidate.split(":").map(Number);
    return hour <= 23 && minute <= 59 ? candidate : fallback;
  };
  return {
    start: validTime(value?.start, "22:00"),
    end: validTime(value?.end, "08:00"),
  };
};
const isReminderQuietNow = (date, quietHours) => {
  const [startHour, startMinute] = (quietHours?.start || "22:00")
    .split(":")
    .map(Number);
  const [endHour, endMinute] = (quietHours?.end || "08:00")
    .split(":")
    .map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (start === end) return false;
  const current = date.getHours() * 60 + date.getMinutes();
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};
let openModalCount = 0;
const loadJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

// Load the selected locale alongside the bundled exercise catalogue before
// the first render, so translated labels never flash in Spanish.
const storedLanguage = loadJson("profit-language", "system");
const explicitSystemLanguage = loadJson("profit-language-explicit-choice", false);
const initialLanguagePreference =
  !explicitSystemLanguage
    ? "system"
    : ["system", "es", "ca", "en", "fr", "de", "it", "pt"].includes(storedLanguage)
      ? storedLanguage
      : "system";
const [exerciseLibraryModule] = await Promise.all([
  import("./exercise-library.json"),
  activateLanguage(resolveLanguage(initialLanguagePreference)),
]);
const exerciseLibrary = exerciseLibraryModule.default;

const makeExportFile = (name, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return blob;
};

const encodeBase64 = (bytes) => {
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length)),
    );
  }
  return btoa(binary);
};

async function exportThroughAndroid(filename, title, bytes, destination) {
  const begun = await AndroidShare.beginExport({ filename });
  const transferId = begun?.transferId;
  if (!transferId)
    throw new Error("Android no pudo preparar el archivo para exportar.");
  try {
    const chunkSize = 512 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(
        offset,
        Math.min(offset + chunkSize, bytes.length),
      );
      await AndroidShare.appendExportChunk({
        transferId,
        filename,
        data: encodeBase64(chunk),
      });
    }
    const completed = await AndroidShare.finishExport({
      transferId,
      filename,
      expectedBytes: bytes.length,
    });
    if (Number(completed?.bytes) !== bytes.length)
      throw new Error("El archivo no se transfirió completo a Android.");
    const options = {
      transferId,
      filename,
      title,
      mimeType: "application/msgpack",
    };
    return destination === "device"
      ? await AndroidShare.saveExport(options)
      : await AndroidShare.shareExport(options);
  } catch (error) {
    AndroidShare.discardExport({ transferId, filename }).catch(() => {});
    throw error;
  }
}

async function shareMessagePack(
  filename,
  title,
  kind,
  data,
  destination = "share",
) {
  const kindNames = {
    backup: "Copia de seguridad",
    routine: "Rutina",
    routineGroup: "Grupo de rutinas",
    exercise: "Ejercicio",
    workout: "Sesión",
  };
  const extension = filename.toLowerCase().endsWith(".msgpack")
    ? ".msgpack"
    : "";
  const baseName = extension ? filename.slice(0, -extension.length) : filename;
  const localizedKind = translateText(kindNames[kind] || "Archivo");
  const kindSlug =
    localizedKind
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "file";
  filename = `${baseName}-${kindSlug}${extension || ".msgpack"}`;
  const titlePrefixes = {
    routine: "Rutina",
    routineGroup: "Grupo de rutinas",
    exercise: "Ejercicio",
    workout: "Entrenamiento",
  };
  if (kind === "backup") title = translateText("Copia de seguridad de ProFit");
  else if (kind === "routineGroup" && title === "Rutinas sin grupo")
    title = translateText(title);
  else if (titlePrefixes[kind] && title.startsWith(`${titlePrefixes[kind]}: `))
    title = `${translateText(titlePrefixes[kind])}: ${title.slice(titlePrefixes[kind].length + 2)}`;
  title = `${title} · ${translateText("Archivo")} ${localizedKind} (.msgpack)`;
  const bytes = encodeMessagePack({
    app: "ProFit",
    schemaVersion: 1,
    kind,
    data,
  });
  if (!bytes.length)
    throw new Error("La copia quedó vacía; no se ha exportado ningún archivo.");
  if (bytes.length > 128 * 1024 * 1024)
    throw new Error("El archivo supera el límite de exportación de 128 MB.");
  const file = new File([bytes], filename, { type: "application/msgpack" });
  if (destination === "device") {
    if (Capacitor.getPlatform() === "android") {
      const result = await exportThroughAndroid(
        filename,
        title,
        bytes,
        "device",
      );
      return result?.cancelled ? "cancelled" : "saved";
    }
    makeExportFile(filename, bytes, "application/msgpack");
    return "saved";
  }
  if (Capacitor.getPlatform() === "android") {
    await exportThroughAndroid(filename, title, bytes, "share");
    return "shared";
  }
  const canShareFile = Boolean(
    navigator.canShare?.({ files: [file] }) && navigator.share,
  );
  if (canShareFile) {
    await navigator.share({ title, files: [file] });
    return "shared";
  }
  makeExportFile(filename, bytes, "application/msgpack");
  return "saved";
}

async function decodeImportFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length)
    throw new Error(
      "El archivo está vacío (0 bytes). Exporta una copia nueva e inténtalo de nuevo.",
    );
  const firstByte = bytes.find(
    (byte) =>
      byte !== 0xef &&
      byte !== 0xbb &&
      byte !== 0xbf &&
      byte !== 0x20 &&
      byte !== 0x09 &&
      byte !== 0x0a &&
      byte !== 0x0d,
  );
  const jsonCandidate =
    file.name.toLowerCase().endsWith(".json") ||
    firstByte === 0x7b ||
    firstByte === 0x5b;
  if (jsonCandidate) {
    try {
      return JSON.parse(
        new TextDecoder()
          .decode(bytes)
          .replace(/^\uFEFF/, "")
          .trim(),
      );
    } catch {}
  }
  try {
    return decodeMessagePack(bytes);
  } catch (error) {
    throw new Error(
      `No se pudo leer el MessagePack: ${error?.message || "formato inválido"}`,
    );
  }
}

function normalizeImportedEnvelope(value) {
  if (!value || typeof value !== "object")
    throw new Error("El archivo no contiene datos compatibles con ProFit.");
  if (value.app === "ProFit" && value.kind) return value;
  if (value.kind && value.data)
    return { app: "ProFit", schemaVersion: 1, ...value };
  if (value.exercises && value.date)
    return { app: "ProFit", schemaVersion: 1, kind: "workout", data: value };
  if (value.name && Array.isArray(value.exercises))
    return {
      app: "ProFit",
      schemaVersion: 1,
      kind: "routine",
      data: { routine: value, exercises: [] },
    };
  if (
    value.name &&
    (value.muscle || value.equipment || value.trackSets !== undefined)
  )
    return { app: "ProFit", schemaVersion: 1, kind: "exercise", data: value };
  if (
    value.workouts ||
    value.exercises ||
    value.exerciseGroups ||
    value.routines ||
    value.measures
  )
    return { app: "ProFit", schemaVersion: 1, kind: "backup", data: value };
  throw new Error(
    "No pude reconocer si el archivo contiene una copia, rutina, ejercicio o sesión.",
  );
}

function mergeById(current, incoming) {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  return [...merged.values()];
}

const routineImportVisualFields = new Set([
  "id",
  "media",
  "poster",
  "mediaType",
  "mediaAssetId",
  "previewAssetId",
  "previewType",
  "image",
  "imageUrl",
  "thumbnail",
  "thumbnailUrl",
  "custom",
  "group",
]);
const canonicalExerciseValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalExerciseValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalExerciseValue(value[key])]),
    );
  return value;
};
const routineImportExerciseKey = (exercise) =>
  JSON.stringify(
    canonicalExerciseValue(
      Object.fromEntries(
        Object.entries(normalizeExerciseData(exercise)).filter(
          ([key]) => !routineImportVisualFields.has(key),
        ),
      ),
    ),
  );

function mergeRoutineGroups(current = [], incoming = []) {
  const names = new Map();
  [
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ].forEach((value) => {
    const name = String(value || "")
      .trim()
      .slice(0, 40);
    if (name && !names.has(name.toLocaleLowerCase("es")))
      names.set(name.toLocaleLowerCase("es"), name);
  });
  return [...names.values()];
}

const normalizeMuscleFilterValue = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
const loadSecondaryMuscles = () => {
  const stored = loadJson("profit-secondary-muscles", []);
  const cleaned = stored.filter(
    (muscle) =>
      normalizeMuscleFilterValue(muscle) &&
      normalizeMuscleFilterValue(muscle) !== "otro",
  );
  if (cleaned.length !== stored.length)
    localStorage.setItem("profit-secondary-muscles", JSON.stringify(cleaned));
  return cleaned;
};
const getExerciseMuscleFilters = (exercises) => {
  const muscles = new Map();
  (exercises || [])
    .flatMap((exercise) => getMuscleFocus(exercise).map(({ name }) => name))
    .forEach((muscle) => {
      const label = String(muscle || "").trim();
      const key = normalizeMuscleFilterValue(label);
      if (key && !muscles.has(key)) muscles.set(key, label);
    });
  return [
    "Todos",
    ...[...muscles.values()].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    ),
  ];
};
const exerciseMatchesMuscleFilter = (exercise, muscle) =>
  muscle === "Todos" ||
  getMuscleFocus(exercise).some(
    ({ name }) =>
      normalizeMuscleFilterValue(name) === normalizeMuscleFilterValue(muscle),
  );

const motivationalQuotes = [
  "Cada repetición cuenta. Cada día también.",
  "No necesitas hacerlo perfecto; solo empezar.",
  "La constancia convierte el esfuerzo en progreso.",
  "Tu siguiente entrenamiento está a una decisión de distancia.",
  "Celebra lo que tu cuerpo puede hacer hoy.",
  "Un paso pequeño sigue siendo un paso adelante.",
  "La fuerza se construye sesión a sesión.",
];
const chooseMotivationalQuote = () =>
  motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

function loadUserWorkouts() {
  return loadJson("profit-workouts", [])
    .filter((workout) => !/^w\d+$/.test(workout.id || ""))
    .map(normalizeWorkoutExercises);
}

function loadUserRoutines() {
  return loadJson("profit-routines", []).map(normalizeRoutineExerciseIds);
}

function loadUserMeasures() {
  return loadJson("profit-measures", [])
    .filter((measure) => !/^m\d+$/.test(measure.id || ""))
    .map(({ dateOfBirth: _legacyDateOfBirth, ...measure }) => measure)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function calculateAge(dateOfBirth, referenceDate = today()) {
  const value = String(dateOfBirth || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const birth = new Date(year, month - 1, day, 12);
  if (!Number.isFinite(birth.getTime()) || dateKey(birth) !== value) return null;
  let age = referenceDate.getFullYear() - year;
  const beforeBirthday =
    referenceDate.getMonth() < month - 1 ||
    (referenceDate.getMonth() === month - 1 && referenceDate.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function loadUserDateOfBirth() {
  const savedDateOfBirth = loadJson("profit-date-of-birth", "");
  if (calculateAge(savedDateOfBirth) !== null) return savedDateOfBirth;
  const legacyMeasures = loadJson("profit-measures", []);
  if (!Array.isArray(legacyMeasures)) return "";
  return (
    [...legacyMeasures]
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .find((measure) => calculateAge(measure?.dateOfBirth) !== null)
      ?.dateOfBirth || ""
  );
}

const weightGoalOptions = [
  { id: "maintain", label: "Mantener mi peso", calorieFactor: 1 },
  { id: "gentle", label: "Bajar poco a poco", calorieFactor: 0.95 },
  { id: "steady", label: "Perder peso progresivamente", calorieFactor: 0.9 },
  {
    id: "focused",
    label: "Dar más prioridad a la pérdida",
    calorieFactor: 0.85,
  },
];

function calculateDailyGoals(measures, weightGoal = "maintain", dateOfBirth = "") {
  const sortedMeasures = [...(measures || [])].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
  const latestMeasure = sortedMeasures.filter(
    (measure) => Number(measure.weight) > 0,
  )[0];
  const referenceAge = calculateAge(dateOfBirth);
  const referenceWeightKg = latestMeasure ? Number(latestMeasure.weight) : 70;
  const referenceHeightCm = Number(latestMeasure?.height) || 0;
  const usesAgeAdjustedFormula =
    Boolean(latestMeasure) && referenceAge !== null && referenceHeightCm > 0;
  const calorieFactor =
    weightGoalOptions.find((option) => option.id === weightGoal)
      ?.calorieFactor ?? 1;
  const genderOffset =
    latestMeasure?.gender === "hombre"
      ? 5
      : latestMeasure?.gender === "mujer"
        ? -161
        : -78;
  // Mifflin–St Jeor estimates resting energy from weight, height, age and sex.
  const restingCalories = usesAgeAdjustedFormula
    ? 10 * referenceWeightKg +
      6.25 * referenceHeightCm -
      5 * referenceAge +
      genderOffset
    : referenceWeightKg * 30;
  const maintenanceCalories = usesAgeAdjustedFormula
    ? Math.max(500, restingCalories * 1.4)
    : referenceWeightKg * 30;
  const rawWaterGoal = usesAgeAdjustedFormula
    ? maintenanceCalories
    : referenceWeightKg * 35;
  return {
    referenceWeightKg,
    usedGenericWeight: !latestMeasure,
    referenceAge,
    usesAgeAdjustedFormula,
    water: Math.min(7000, Math.max(500, Math.round(rawWaterGoal / 50) * 50)),
    kcal: Math.min(
      10000,
      Math.max(
        500,
        Math.round((maintenanceCalories * calorieFactor) / 50) * 50,
      ),
    ),
  };
}

const initialExercises = [
  {
    id: "press-banca",
    name: "Press banca con barra",
    muscle: "Pecho",
    secondary: ["Tríceps", "Hombros"],
    equipment: "Barra",
    sets: 4,
    reps: "6–8",
    rest: 120,
    duration: 35,
    description:
      "Túmbate con los pies apoyados, baja la barra hacia el pecho y empuja manteniendo las escápulas estables.",
    cues: [
      "Apoya los pies con firmeza",
      "Mantén las muñecas sobre los codos",
      "Controla la bajada durante 2 segundos",
    ],
    accent: "violet",
  },
  {
    id: "sentadilla",
    name: "Sentadilla con barra",
    muscle: "Piernas",
    secondary: ["Glúteos", "Abdominales"],
    equipment: "Barra",
    sets: 4,
    reps: "6–8",
    rest: 150,
    duration: 40,
    description:
      "Inicia el movimiento llevando la cadera atrás. Desciende con el torso firme y empuja el suelo para subir.",
    cues: [
      "Respira y fija el abdomen",
      "Rodillas en línea con los pies",
      "Busca profundidad sin perder postura",
    ],
    accent: "orange",
  },
  {
    id: "peso-muerto",
    name: "Peso muerto rumano",
    muscle: "Isquiotibiales",
    secondary: ["Glúteos", "Espalda"],
    equipment: "Barra",
    sets: 3,
    reps: "8–10",
    rest: 120,
    duration: 30,
    description:
      "Con una ligera flexión de rodillas, lleva la cadera atrás y desliza la barra cerca de las piernas.",
    cues: [
      "Espalda neutra en todo momento",
      "La cadera inicia el movimiento",
      "Detente al sentir tensión en femorales",
    ],
    accent: "blue",
  },
  {
    id: "jalon",
    name: "Jalón al pecho",
    muscle: "Espalda",
    secondary: ["Bíceps"],
    equipment: "Polea",
    sets: 3,
    reps: "10–12",
    rest: 90,
    duration: 25,
    description:
      "Lleva la barra hacia la parte alta del pecho, guiando el movimiento con los codos.",
    cues: [
      "Eleva el pecho ligeramente",
      "Evita balancear el torso",
      "Regresa con control",
    ],
    accent: "teal",
  },
  {
    id: "press-militar",
    name: "Press militar",
    muscle: "Hombros",
    secondary: ["Tríceps", "Abdominales"],
    equipment: "Mancuernas",
    sets: 3,
    reps: "8–10",
    rest: 90,
    duration: 25,
    description:
      "Empuja las mancuernas desde la altura de los hombros hasta extender los brazos sobre la cabeza.",
    cues: [
      "Aprieta glúteos y abdomen",
      "Mantén los antebrazos verticales",
      "No arquees la zona lumbar",
    ],
    accent: "yellow",
  },
  {
    id: "remo",
    name: "Remo con mancuerna",
    muscle: "Espalda",
    secondary: ["Bíceps"],
    equipment: "Mancuernas",
    sets: 3,
    reps: "10–12",
    rest: 75,
    duration: 20,
    description:
      "Apoya una mano, inclina el tronco y lleva la mancuerna hacia la cadera sin rotar el cuerpo.",
    cues: [
      "Hombro lejos de la oreja",
      "Tira con el codo",
      "Baja sin perder tensión",
    ],
    accent: "green",
  },
  {
    id: "hip-thrust",
    name: "Hip thrust",
    muscle: "Glúteos",
    secondary: ["Isquiotibiales"],
    equipment: "Barra",
    sets: 4,
    reps: "8–12",
    rest: 90,
    duration: 25,
    description:
      "Apoya la espalda alta en un banco y extiende la cadera hasta alinear hombros, cadera y rodillas.",
    cues: [
      "Barbilla ligeramente hacia dentro",
      "Empuja con los talones",
      "Haz una pausa arriba",
    ],
    accent: "pink",
  },
  {
    id: "curl-biceps",
    name: "Curl de bíceps",
    muscle: "Bíceps",
    secondary: ["Antebrazo"],
    equipment: "Mancuernas",
    sets: 3,
    reps: "10–12",
    rest: 60,
    duration: 15,
    description:
      "Flexiona los codos manteniendo los brazos junto al cuerpo y baja lentamente.",
    cues: [
      "Evita balancear el tronco",
      "Codos cerca del cuerpo",
      "Completa el recorrido",
    ],
    accent: "blue",
  },
  {
    id: "plancha",
    name: "Plancha",
    muscle: "Abdominales",
    secondary: ["Hombros"],
    equipment: "Peso corporal",
    sets: 3,
    reps: "30–45 s",
    rest: 45,
    duration: 10,
    description:
      "Apóyate sobre antebrazos y puntas de los pies, formando una línea recta de cabeza a talones.",
    cues: [
      "Aprieta abdomen y glúteos",
      "No dejes caer la cadera",
      "Respira con normalidad",
    ],
    trackWeight: false,
    accent: "teal",
  },
];

const defaultExerciseLibrary = exerciseLibrary;
const bundledExerciseById = new Map(
  defaultExerciseLibrary.map((exercise) => [exercise.id, exercise]),
);
const bundledExerciseNames = new Set(
  defaultExerciseLibrary.map((exercise) => exercise.name),
);
const bundledExerciseByAssetId = new Map(
  defaultExerciseLibrary
    .filter((exercise) => exercise.assetId)
    .map((exercise) => [exercise.assetId, exercise]),
);
const legacySeedExerciseById = new Map(
  initialExercises.map((exercise) => [exercise.id, exercise]),
);
const refreshBundledExerciseMedia = (exercise) => {
  const assetFromPath = (source) =>
    String(source || "").match(/(?:^|\/)exercises\/(?:posters\/)?(\d+)\./i)?.[1];
  const storedAssetId = String(
    exercise.assetId || assetFromPath(exercise.media) || assetFromPath(exercise.poster) || "",
  );
  const bundled =
    bundledExerciseById.get(exercise.id) ||
    bundledExerciseByAssetId.get(storedAssetId);
  if (!bundled) return exercise;
  const legacySeed = legacySeedExerciseById.get(exercise.id);
  const isBundledPath = (source) =>
    typeof source === "string" && /(?:^|\/)exercises\//i.test(source);
  return {
    ...exercise,
    id: bundled.id,
    name:
      legacySeed && exercise.name === legacySeed.name
        ? bundled.name
        : exercise.name,
    assetId: bundled.assetId || storedAssetId || "",
    media:
      !exercise.mediaAssetId && isBundledPath(exercise.media)
        ? bundled.media || ""
        : exercise.media,
    poster:
      !exercise.previewAssetId && isBundledPath(exercise.poster)
        ? bundled.poster || ""
        : exercise.poster,
  };
};
registerBundledExerciseNames(
  defaultExerciseLibrary.map((exercise) => exercise.name),
);
const isBundledExercise = (exercise) =>
  Boolean(exercise && bundledExerciseById.has(exercise.id));
const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const isUnmodifiedBundledExercise = (exercise) => {
  const original = bundledExerciseById.get(exercise.id);
  return Boolean(
    original && stableSerialize(exercise) === stableSerialize(original),
  );
};
function refreshCatalogEntries(entries) {
  return entries.map((exercise) => normalizeExerciseData(exercise));
}
function dedupeExerciseEntries(entries) {
  const byId = new Map();
  const withoutId = [];
  entries.forEach((exercise) => {
    if (!exercise?.id) {
      withoutId.push(exercise);
      return;
    }
    const previous = byId.get(exercise.id);
    const previousIsCanonical = previous?.__profitSourceId === previous?.id;
    const currentIsCanonical = exercise.__profitSourceId === exercise.id;
    if (!previous || currentIsCanonical || !previousIsCanonical)
      byId.set(exercise.id, exercise);
  });
  return [...byId.values(), ...withoutId];
}

function loadExerciseLibrary() {
  const stored = loadJson("profit-exercises", null);
  if (!stored) return defaultExerciseLibrary;
  const enriched = dedupeExerciseEntries(
    refreshCatalogEntries(
      stored.map((exercise) => {
        const refreshed = refreshBundledExerciseMedia(exercise);
        const defaultDefinition =
          bundledExerciseById.get(refreshed.id) ||
          legacySeedExerciseById.get(refreshed.id);
        return {
          ...refreshed,
          ...(exercise.trackWeight === undefined &&
          defaultDefinition?.trackWeight !== undefined
            ? { trackWeight: defaultDefinition.trackWeight }
            : {}),
          __profitSourceId: exercise.id,
        };
      }),
    ),
  ).map(({ __profitSourceId, ...exercise }) => exercise);
  const storedById = new Map(enriched.map((exercise) => [exercise.id, exercise]));
  const orderedBundled = defaultExerciseLibrary.map((exercise) => ({
    ...exercise,
    ...storedById.get(exercise.id),
    name:
      storedById.has(exercise.id) &&
      bundledExerciseNames.has(storedById.get(exercise.id).name) &&
      storedById.get(exercise.id).name !== exercise.name
        ? exercise.name
        : storedById.get(exercise.id)?.name || exercise.name,
  }));
  const bundledIds = new Set(bundledExerciseById.keys());
  const customExercises = enriched.filter(
    (exercise) =>
      !bundledIds.has(exercise.id) &&
      !String(exercise.id || "").startsWith("library-"),
  );
  return [...orderedBundled, ...customExercises];
}

const palettes = [
  { id: "grove", name: "Bosque", color: "#d2f476" },
  { id: "ocean", name: "Océano", color: "#67d6e9" },
  { id: "orchid", name: "Orquídea", color: "#bda5ff" },
  { id: "ember", name: "Ámbar", color: "#ffb565" },
  { id: "rose", name: "Coral", color: "#ff91aa" },
  { id: "cobalt", name: "Cobalto", color: "#7ca4ff" },
  { id: "mint", name: "Menta", color: "#63d9b2" },
  { id: "ruby", name: "Rubí", color: "#ff7184" },
  { id: "violet", name: "Violeta", color: "#dc82ff" },
  { id: "sun", name: "Sol", color: "#ffd166" },
];
const themeOptions = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
  { id: "system", label: "Sistema" },
];
const icons = {
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9M9 20v-6h6v6" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M3 9v6M7 6v12M17 6v12M21 9v6M7 12h10" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M4.5 7.5h15M4.5 16.5h15" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  flame: (
    <>
      <path d="M12 22c4.4 0 7-3.2 7-7.3 0-3.2-2.2-5.2-3.6-6.7-.3 2-1.1 2.8-2 3.4.1-3.7-1.7-6.6-4.8-9.4.4 3.2-.9 4.9-2.5 6.8C4.6 9.7 5 12.7 5 14.7 5 18.8 7.7 22 12 22Z" />
    </>
  ),
  water: (
    <>
      <path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7Z" />
      <path d="M9 16a3 3 0 0 0 3 3" />
    </>
  ),
  shaker: (
    <>
      <path d="M9 2.5h5.5V4H16v1.5H8V4h1V2.5Zm-1 3h8l2.2 2.5c.5.5.8 1.2.8 1.9v9.6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V9.9c0-.7.3-1.4.8-1.9L8 5.5Z" />
      <path d="M7 9.5h10m1.5-1.4-1.2 1.4" />
      <circle cx="12" cy="15.5" r="2.4" />
      <path d="M10.6 14.2c.8.7.8 2 0 2.6m2.8-2.6c-.8.7-.8 2 0 2.6M9.8 15.5h4.4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-5 5 5-5 5 5" />
      <path d="M4 16v4h16v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12m-5-5 5 5 5-5" />
      <path d="M4 18v2h16v-2" />
    </>
  ),
  edit: (
    <>
      <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <circle cx="12" cy="12" r="6.9" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12m0-14.14-2.12 2.12m-9.9 9.9-2.12 2.12" />
    </>
  ),
  scale: (
    <>
      <path d="M7.2 3.5h9.6c1.5 0 2.7 1.1 2.9 2.6l1.1 10.8a3 3 0 0 1-3 3.3H6.2a3 3 0 0 1-3-3.3L4.3 6.1a2.9 2.9 0 0 1 2.9-2.6Z" />
      <rect x="8.6" y="6.1" width="6.8" height="4.1" rx="1" />
      <path d="M12 7.2v1.2l1.3.6M8.3 14.8h.01M15.7 14.8h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 8-9" />
      <path d="M15 6h6v6" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: (
    <>
      <path d="M8 5h3v14H8zM15 5h3v14h-3z" />
    </>
  ),
  swap: (
    <>
      <path d="M16 3l4 4-4 4M4 7h16M8 21l-4-4 4-4M20 17H4" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  ellipsis: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="5" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="19" r="1" />
    </>
  ),
  folderPlus: (
    <>
      <path d="M3.5 7a2.5 2.5 0 0 1 2.5-2.5h4l2 2H18A2.5 2.5 0 0 1 20.5 9v8A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7Z" />
      <path d="M12 10.5v6m-3-3h6" />
    </>
  ),
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg
      class={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {icons[name] || icons.dumbbell}
    </svg>
  );
}

function BuiltinNameWarning({ originalName, onRestore }) {
  return (
    <div class="builtin-name-warning" role="note">
      <span>
        {translateText("Nombre original:")}{" "}
        <span translate="no">{translateText(originalName)}</span>
      </span>
      <button
        type="button"
        class="text-button builtin-name-restore"
        onClick={onRestore}
      >
        {translateText("Restaurar")}
      </button>
    </div>
  );
}

function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button class={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function ExportMenu({
  onSave,
  onShare,
  label = "Exportar",
  className = "",
  iconOnly = false,
  hideCaret = false,
}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const localizedLabel = translateText(label);
  const destinationLabel = translateText("elegir destino");
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choose = async (action) => {
    setOpen(false);
    await action?.();
  };
  return (
    <div class="export-menu" ref={root}>
      <button
        type="button"
        class={`export-menu-trigger ${className}`}
        aria-label={
          iconOnly ? `${localizedLabel}: ${destinationLabel}` : undefined
        }
        title={`${localizedLabel}: ${destinationLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="share" size={15} />
        {!iconOnly && <span>{localizedLabel}</span>}
        {!iconOnly && !hideCaret && (
          <Icon name="chevronDown" size={13} className="export-menu-caret" />
        )}
      </button>
      {open && (
        <div class="export-menu-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(onSave)}>
            <Icon name="download" size={16} />
            <span>
              <strong>Guardar en este dispositivo</strong>
              <small>Elige dónde guardar el archivo</small>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onShare)}>
            <Icon name="share" size={16} />
            <span>
              <strong>Compartir…</strong>
              <small>Enviar a otra app o dispositivo</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, src, className = "", onClick, fireDays = 0 }) {
  const content = src ? (
    <img src={src} alt="" />
  ) : (
    (name?.trim()?.[0] || "U").toUpperCase()
  );
  const props = {
    class: `user-avatar ${className}`,
    "aria-label": onClick
      ? "Cambiar foto de perfil"
      : `Perfil de ${name || "perfil"}`,
  };
  const avatar = onClick ? (
    <button type="button" {...props} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span {...props}>{content}</span>
  );
  const level = fireDays ? Math.min(7, Math.max(1, Math.round(fireDays))) : 0;
  if (!level) return avatar;
  return (
    <span
      class={`user-fire-frame fire-level-${level}`}
      title={`${level} ${level === 1 ? "día activo" : "días activos"} esta semana`}
    >
      {avatar}
      <FireEmbers level={level} />
    </span>
  );
}

function FireEmbers({ level }) {
  const emberCount = level < 3 ? 2 : level < 5 ? 3 : level < 7 ? 4 : 5;
  const nextId = useRef(0);
  const [embers, setEmbers] = useState([]);
  useEffect(() => {
    let active = true;
    const timers = new Set();
    const schedule = (callback, delay) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (active) callback();
      }, delay);
      timers.add(timer);
    };
    const spawnInterval =
      level < 3 ? 1300 : level < 5 ? 1000 : level < 7 ? 750 : 550;
    setEmbers([]);
    const spawn = () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 43 + Math.random() * 7;
      const drift = Math.round((Math.random() - 0.5) * 26);
      const duration = 1700 + Math.round(Math.random() * 700);
      const id = ++nextId.current;
      const ember = {
        id,
        left: `${50 + Math.cos(angle) * radius}%`,
        top: `${50 + Math.sin(angle) * radius}%`,
        drift: `${drift}px`,
        midDrift: `${Math.round(drift * 0.55)}px`,
        duration: `${duration}ms`,
      };
      setEmbers((current) => [...current, ember].slice(-emberCount));
      schedule(
        () => setEmbers((current) => current.filter((item) => item.id !== id)),
        duration,
      );
      schedule(spawn, spawnInterval * (0.75 + Math.random() * 0.5));
    };
    schedule(spawn, 180 + Math.random() * 440);
    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [emberCount, level]);
  return (
    <>
      {embers.map((ember) => (
        <span
          class="fire-ember"
          aria-hidden="true"
          key={ember.id}
          style={{
            "--ember-left": ember.left,
            "--ember-top": ember.top,
            "--ember-drift": ember.drift,
            "--ember-mid-drift": ember.midDrift,
            "--ember-duration": ember.duration,
          }}
        />
      ))}
    </>
  );
}

function formatElapsed(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const nextWorkoutNotice = (previousMinute) =>
  previousMinute === 0
    ? 15
    : previousMinute < 60
      ? previousMinute + 15
      : previousMinute + 30;

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div class="section-heading">
      <div>
        {eyebrow && <div class="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function WeeklyBars({ workouts, timeframe = 7, weekStartsOn = 1 }) {
  const days = Array.from({ length: timeframe }, (_, i) => {
    const date = shiftDateKey(weekStartKey(today(), weekStartsOn), i);
    const workout = workouts.find((w) => w.date === date);
    const volume = workout
      ? workout.exercises.reduce(
          (sum, item) =>
            sum + (item.trackWeight === false ? 0 : item.sets.reduce((s, set) => s + set.weight * set.reps, 0)),
          0,
        )
      : 0;
    return {
      date,
      label: weekdayNarrowLabel(new Date(`${date}T12:00:00`).getDay()),
      volume,
    };
  });
  const max = Math.max(...days.map((d) => d.volume), 1);
  return (
    <div class="week-bars">
      {days.map((d) => (
        <div class="bar-day" key={d.date}>
          <div class="bar-track">
            <div
              class={`bar-fill ${d.volume ? "has-value" : ""}`}
              style={{
                height: `${Math.max((d.volume / max) * 100, d.volume ? 12 : 3)}%`,
              }}
            />
          </div>
          <span class={d.volume ? "day-active" : ""}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, unit, note, icon, tone = "" }) {
  return (
    <article class={`stat-card ${tone}`}>
      <div class="stat-card-top">
        <span class="stat-icon">
          <Icon name={icon} size={17} />
        </span>
        <span class="stat-label">{label}</span>
      </div>
      <div class="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      {note && <div class="stat-note">{note}</div>}
    </article>
  );
}

const achievementLevels = [
  5, 10, 15, 20, 50, 100, 200, 500, 1000, 1200, 1500, 2000, 2500, 3000, 4000,
  5000, 7500, 10000, 15000, 20000, 30000, 50000,
];
function getNextAchievement(total) {
  const levels = [...achievementLevels];
  while (levels.at(-1) <= total) levels.push(levels.at(-1) + 5000);
  const next = levels.find((level) => level > total);
  const previous = [...levels].reverse().find((level) => level <= total) || 0;
  return {
    next,
    previous,
    progress: Math.min(100, ((total - previous) / (next - previous)) * 100),
  };
}

function DailyIntakeCards({
  waterMl,
  waterGoal,
  kcal,
  kcalGoal,
  onAddWater,
  onAddKcal,
  onResetWater,
  onResetKcal,
  cardOrder,
  hidden,
}) {
  const [customKcal, setCustomKcal] = useState("");
  const waterPercent = waterGoal
    ? Math.min(Math.round((waterMl / waterGoal) * 100), 100)
    : 0;
  const kcalPercent = kcalGoal
    ? Math.min(Math.round((kcal / kcalGoal) * 100), 100)
    : 0;
  return (
    <section
      class="daily-intake-grid"
      data-dashboard-card="intake"
      style={{ order: cardOrder }}
      hidden={hidden}
      aria-label="Consumo de hoy"
    >
      <article class="panel intake-card water-card">
        <div class="intake-heading">
          <span class="intake-icon water-icon">
            <Icon name="water" size={19} />
          </span>
          <div>
            <div class="eyebrow">HOY</div>
            <h2>Hidratación</h2>
          </div>
          <button
            class="intake-reset"
            type="button"
            aria-label="Reiniciar agua de hoy"
            title="Reiniciar contador"
            onClick={onResetWater}
          >
            <Icon name="reset" size={15} />
          </button>
        </div>
        <div class="intake-total">
          {waterMl.toLocaleString(intlLocale())}
          <small> mL</small>
        </div>
        <div class="intake-progress">
          <i style={{ width: `${waterPercent}%` }} />
        </div>
        <div class="intake-caption">
          <span>Meta {waterGoal.toLocaleString(intlLocale())} mL</span>
          <strong>{waterPercent}%</strong>
        </div>
        <div class="intake-actions">
          <button
            type="button"
            title="Añadir 10 mililitros"
            onClick={() => onAddWater(10)}
          >
            10 mL
          </button>
          <button
            type="button"
            title="Añadir 100 mililitros"
            onClick={() => onAddWater(100)}
          >
            100 mL
          </button>
          <button
            type="button"
            title="Añadir 250 mililitros"
            onClick={() => onAddWater(250)}
          >
            250 mL
          </button>
        </div>
      </article>
      <article class="panel intake-card kcal-card">
        <div class="intake-heading">
          <span class="intake-icon kcal-icon">
            <Icon name="flame" size={19} />
          </span>
          <div>
            <div class="eyebrow">HOY</div>
            <h2>Consumo de calorías</h2>
          </div>
          <button
            class="intake-reset"
            type="button"
            aria-label="Reiniciar consumo de calorías de hoy"
            title="Reiniciar contador"
            onClick={onResetKcal}
          >
            <Icon name="reset" size={15} />
          </button>
        </div>
        <div class="intake-total">
          {kcal.toLocaleString(intlLocale())}
          <small> kcal</small>
        </div>
        <div class="intake-progress kcal-progress">
          <i style={{ width: `${kcalPercent}%` }} />
        </div>
        <div class="intake-caption">
          <span>Meta {kcalGoal.toLocaleString(intlLocale())} kcal</span>
          <strong>{kcalPercent}%</strong>
        </div>
        <form
          class="kcal-quick-add"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(customKcal);
            if (value > 0) {
              onAddKcal(value);
              setCustomKcal("");
            }
          }}
        >
          <input
            aria-label="Cantidad de calorías a añadir"
            type="number"
            min="1"
            max="10000"
            inputMode="numeric"
            placeholder="Añadir"
            value={customKcal}
            onInput={(event) => setCustomKcal(event.currentTarget.value)}
          />
          <button type="submit" aria-label="Registrar consumo de calorías">
            <Icon name="plus" size={17} />
          </button>
        </form>
      </article>
    </section>
  );
}

const dashboardCards = [
  {
    id: "milestone",
    label: "Próximo hito",
    detail: "Tus logros y el siguiente objetivo",
  },
  { id: "hero", label: "Tu próximo paso", detail: "Acceso rápido a entrenar" },
  {
    id: "stats",
    label: "Resumen semanal",
    detail: "Sesiones, volumen y series",
  },
  {
    id: "goalWeeks",
    label: "Semanas a tu objetivo",
    detail: "Constancia y logros semanales",
  },
  {
    id: "medals",
    label: "Medallas por ejercicio",
    detail: "Tus mejores marcas personales",
  },
  {
    id: "intake",
    label: "Hidratación y consumo de calorías",
    detail: "Consumo diario",
  },
  {
    id: "weekly",
    label: "Esta semana",
    detail: "Volumen y ritmo de actividad",
  },
  {
    id: "muscles",
    label: "Músculos trabajados",
    detail: "Mapa muscular de los últimos 7 días",
  },
  {
    id: "activity",
    label: "Actividad reciente",
    detail: "Tus últimas sesiones guardadas",
  },
];
const defaultDashboardOrder = dashboardCards.map((card) => card.id);
const loadDashboardLayout = () => {
  const saved = loadJson("profit-dashboard-layout", null);
  const valid = Array.isArray(saved?.order)
    ? saved.order.filter((id) => defaultDashboardOrder.includes(id))
    : [];
  return {
    order: [...new Set([...valid, ...defaultDashboardOrder])],
    hidden: Array.isArray(saved?.hidden)
      ? saved.hidden.filter((id) => defaultDashboardOrder.includes(id))
      : [],
  };
};

function DashboardLayoutModal({ layout, onChange, onClose }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropTargetAfter, setDropTargetAfter] = useState(false);
  const dragRef = useRef(null);
  const listRef = useRef(null);
  const toggle = (id) =>
    onChange((current) => ({
      ...current,
      hidden: current.hidden.includes(id)
        ? current.hidden.filter((item) => item !== id)
        : [...current.hidden, id],
    }));
  const move = (id, targetId, after = false) =>
    onChange((current) => {
      const order = [...current.order];
      const index = order.indexOf(id);
      if (index < 0 || !order.includes(targetId) || id === targetId)
        return current;
      const [pickedUp] = order.splice(index, 1);
      order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, pickedUp);
      return { ...current, order };
    });
  const scrollListAt = (pointerY) => {
    const list = listRef.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    const edge = 44;
    if (pointerY < bounds.top + edge)
      list.scrollTop = Math.max(0, list.scrollTop - 12);
    else if (pointerY > bounds.bottom - edge) list.scrollTop += 12;
  };
  const beginDrag = (event, id) => {
    event.preventDefault();
    dragRef.current = {
      id,
      targetId: id,
      targetAfter: false,
      pointerId: event.pointerId,
    };
    setDraggingId(id);
    setDropTargetId(id);
    setDropTargetAfter(false);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    scrollListAt(event.clientY);
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-dashboard-card-id]");
    if (target) {
      drag.targetId = target.dataset.dashboardCardId;
      drag.targetAfter =
        event.clientY >=
        target.getBoundingClientRect().top +
          target.getBoundingClientRect().height / 2;
      setDropTargetId(drag.targetId);
      setDropTargetAfter(drag.targetAfter);
    }
  };
  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    move(drag.id, drag.targetId, drag.targetAfter);
    dragRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    setDropTargetAfter(false);
  };
  const cancelDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    setDropTargetAfter(false);
  };
  return (
    <Modal title="Organizar Inicio" onClose={onClose}>
      <div class="dashboard-layout-modal">
        <div class="eyebrow">PERSONALIZA TU INICIO</div>
        <h2>Tarjetas del inicio</h2>
        <p>Elige qué aparece y ajusta el orden a tu manera.</p>
        <div class="dashboard-layout-list" ref={listRef}>
          {layout.order.map((id, index) => {
            const card = dashboardCards.find((item) => item.id === id);
            if (!card) return null;
            const visible = !layout.hidden.includes(id);
            return (
              <div
                data-dashboard-card-id={id}
                class={`dashboard-layout-row ${visible ? "" : "is-hidden"} ${draggingId === id ? "is-dragging" : ""} ${dropTargetId === id && draggingId && draggingId !== id ? "is-drop-target" : ""} ${dropTargetId === id && draggingId && draggingId !== id && dropTargetAfter ? "is-drop-target-after" : ""}`}
                key={id}
              >
                <button
                  type="button"
                  class="dashboard-layout-drag"
                  aria-label={`Arrastrar ${card.label} para cambiar su orden`}
                  title="Mantén pulsado y arrastra"
                  onPointerDown={(event) => beginDrag(event, id)}
                  onPointerMove={continueDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                >
                  <Icon name="grip" size={18} />
                </button>
                <button
                  type="button"
                  class="dashboard-layout-toggle"
                  role="switch"
                  aria-checked={visible}
                  onClick={() => toggle(id)}
                >
                  <span class="dashboard-layout-switch">
                    <i />
                  </span>
                  <span>
                    <strong>{card.label}</strong>
                    <small>{card.detail}</small>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div class="dashboard-layout-actions">
          <Button
            variant="quiet"
            type="button"
            onClick={() =>
              onChange({ order: [...defaultDashboardOrder], hidden: [] })
            }
          >
            Restablecer
          </Button>
          <Button type="button" onClick={onClose}>
            <Icon name="check" size={14} /> Listo
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Dashboard({
  workouts,
  exercises,
  onNavigate,
  onStartWorkout,
  onWorkoutOpen,
  unit,
  goal,
  weeklyGoalHistory,
  weekStartsOn,
  layout,
  name,
  avatar,
  motivation,
  waterMl,
  waterGoal,
  kcal,
  kcalGoal,
  onAddWater,
  onAddKcal,
  onResetWater,
  onResetKcal,
}) {
  const cardVisible = (id) => !layout.hidden.includes(id);
  const cardOrder = (id) => layout.order.indexOf(id);
  const todayDateKey = dateKey(today());
  const weekStart = weekStartKey(today(), weekStartsOn);
  const week = workouts.filter(
    (workout) => workout.date >= weekStart && workout.date <= todayDateKey,
  );
  const previousWeekStart = shiftDateKey(weekStart, -7);
  const previousWeek = workouts.filter(
    (workout) => workout.date >= previousWeekStart && workout.date < weekStart,
  );
  const allSets = week.reduce(
    (n, workout) =>
      n + workout.exercises.reduce((c, e) => c + e.sets.length, 0),
    0,
  );
  const volume = week.reduce(
    (n, workout) =>
      n +
      workout.exercises.reduce(
        (c, e) => c + (e.trackWeight === false ? 0 : e.sets.reduce((a, set) => a + set.weight * set.reps, 0)),
        0,
      ),
    0,
  );
  const previousVolume = previousWeek.reduce(
    (n, workout) =>
      n +
      workout.exercises.reduce(
        (c, e) => c + (e.trackWeight === false ? 0 : e.sets.reduce((a, set) => a + set.weight * set.reps, 0)),
        0,
      ),
    0,
  );
  const volumeChange = previousVolume
    ? ((volume - previousVolume) / previousVolume) * 100
    : null;
  const volumeChangeLabel =
    volumeChange === null
      ? week.length
        ? "Nueva referencia"
        : "Sin sesiones todavía"
      : `${volumeChange > 0 ? "+" : ""}${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(volumeChange)}%`;
  const workoutDays = new Set(week.map((workout) => workout.date)).size;
  const target = goal;
  const weeklyGoalStats = getWeeklyGoalStats(
    workouts,
    goal,
    weeklyGoalHistory,
    today(),
    weekStartsOn,
  );
  const latest = [...workouts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const muscles = useMemo(
    () => buildMuscleLoad(workouts, exercises, weekStart),
    [workouts, exercises, weekStart],
  );
  const fmt = (kg) =>
    `${Math.round(unit === "lb" ? kg * 2.20462 : kg).toLocaleString(intlLocale())} ${unit}`;
  const milestone = getNextAchievement(workouts.length);
  const greeting = timeGreeting();

  return (
    <div class="page-grid dashboard-page">
      <section class="welcome-row">
        <div class="welcome-copy">
          <div class="eyebrow">{fullDate()}</div>
          <h1 class="welcome-heading">
            <span class="welcome-brand-mark brand-mark" aria-label="ProFit">
              <span />
              <span />
              <span />
            </span>
            <span class="welcome-greeting">
              {greeting}
              {name ? `, ${name}` : ""}
              <span class="welcome-dot">.</span>
            </span>
          </h1>
          <p class="welcome-motivation">✳ {motivation}</p>
        </div>
        <div class="welcome-actions">
          <Avatar
            name={name}
            src={avatar}
            className="avatar-button"
            onClick={() => onNavigate("profile")}
            fireDays={weeklyGoalStats.currentWeekDays}
          />
        </div>
      </section>
      <section
        class="achievement-card achievement-card-top"
        data-dashboard-card="milestone"
        style={{ order: cardOrder("milestone") }}
        hidden={!cardVisible("milestone")}
      >
        <div class="achievement-icon">
          <Icon name="trophy" size={22} />
        </div>
        <div class="achievement-copy">
          <div class="eyebrow">PRÓXIMO HITO</div>
          <strong>
            {workouts.length
              ? `${milestone.next} entrenamientos`
              : "Tu primer hito: 5 entrenamientos"}
          </strong>
          <span>
            {workouts.length === milestone.previous && milestone.previous > 0
              ? `¡Hito de ${milestone.previous} conseguido! El siguiente está a ${milestone.next - workouts.length} sesiones.`
              : workouts.length
                ? `Te faltan ${milestone.next - workouts.length} sesiones. Cada una te acerca.`
                : "Cada sesión cuenta para llegar al primero."}
          </span>
          <div class="milestone-track">
            <i style={{ width: `${milestone.progress}%` }} />
          </div>
        </div>
        <div class="achievement-count">
          {workouts.length}
          <small> / {milestone.next}</small>
        </div>
      </section>
      <section
        class="hero-card"
        data-dashboard-card="hero"
        style={{ order: cardOrder("hero") }}
        hidden={!cardVisible("hero")}
      >
        <div class="hero-copy">
          <div class="hero-tag">
            <span class="pulse-dot" /> TU PRÓXIMO PASO
          </div>
          <h2>
            Hoy cuenta.
            <br />
            <em>Muévete a tu ritmo.</em>
          </h2>
          <p>
            {latest[0]
              ? (() => {
                  const daysSince = Math.max(
                    1,
                    Math.round(
                      (Date.now() -
                        new Date(`${latest[0].date}T12:00:00`).getTime()) /
                        86400000,
                    ),
                  );
                  return `Tu última sesión fue hace ${daysSince} ${daysSince === 1 ? "día" : "días"}. ¿Te apetece volver?`;
                })()
              : "Empieza cuando quieras. Tu primer entrenamiento cuenta desde hoy."}
          </p>
          <Button onClick={onStartWorkout}>
            <Icon name="play" size={15} /> Empezar entrenamiento
          </Button>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="hero-orbit orbit-one" />
          <div class="hero-orbit orbit-two" />
          <div class="hero-orbit orbit-three" />
          <div class="hero-spark spark-one" />
          <div class="hero-spark spark-two" />
          <div class="hero-center">
            <span class="brand-mark hero-brand-mark">
              <span />
              <span />
              <span />
            </span>
          </div>
          <div class="hero-art-label">
            01 <span>·</span> constancia
          </div>
        </div>
        <div class="hero-bottom">
          <span>
            <Icon name="flame" size={16} />{" "}
            <strong>
              {workoutDays} de {target}
            </strong>{" "}
            sesiones esta semana
          </span>
          <span class="hero-progress">
            <i
              style={{
                width: `${Math.min(target > 0 ? (workoutDays / target) * 100 : 0, 100)}%`,
              }}
            />
          </span>
          <span class="hero-progress-label">
            {Math.max(target - workoutDays, 0)} para tu objetivo
          </span>
        </div>
      </section>
      <section
        class="stat-grid"
        data-dashboard-card="stats"
        style={{ order: cardOrder("stats") }}
        hidden={!cardVisible("stats")}
      >
        <StatCard
          label="Entrenamientos"
          value={workoutDays}
          unit={`/ ${goal}`}
          note="esta semana"
          icon="dumbbell"
        />
        <StatCard
          label="Volumen total"
          value={(volume / 1000).toLocaleString(intlLocale(), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
          unit="t"
          note="en los últimos 7 días"
          icon="trend"
          tone="stat-lime"
        />
        <StatCard
          label="Series completadas"
          value={allSets}
          unit=""
          note={allSets ? "buen trabajo" : "aún sin series"}
          icon="check"
        />
      </section>
      <WeeklyGoalAchievements
        stats={weeklyGoalStats}
        goal={goal}
        weekStartsOn={weekStartsOn}
        cardOrder={cardOrder("goalWeeks")}
        hidden={!cardVisible("goalWeeks")}
      />
      <StrengthMedals
        workouts={workouts}
        unit={unit}
        cardOrder={cardOrder("medals")}
        hidden={!cardVisible("medals")}
      />
      <DailyIntakeCards
        waterMl={waterMl}
        waterGoal={waterGoal}
        kcal={kcal}
        kcalGoal={kcalGoal}
        onAddWater={onAddWater}
        onAddKcal={onAddKcal}
        onResetWater={onResetWater}
        onResetKcal={onResetKcal}
        cardOrder={cardOrder("intake")}
        hidden={!cardVisible("intake")}
      />
      <section
        class="panel weekly-panel"
        data-dashboard-card="weekly"
        style={{ order: cardOrder("weekly") }}
        hidden={!cardVisible("weekly")}
      >
        <SectionHeading
          eyebrow="TU RITMO"
          title="Esta semana"
          action={
            <button class="text-button" onClick={() => onNavigate("profile")}>
              Ver estadísticas <Icon name="arrow" size={15} />
            </button>
          }
        />
        <div class="weekly-content">
          <div class="weekly-chart-copy">
            <div class="big-number">
              {fmt(volume)}
              <small> levantados</small>
            </div>
            <div
              class={`change-badge ${volumeChange !== null && volumeChange < 0 ? "negative" : ""}`}
            >
              <Icon name="trend" size={13} /> {volumeChangeLabel}{" "}
              <span>
                {volumeChange === null
                  ? week.length
                    ? "sin período anterior"
                    : "registra una sesión"
                  : "vs. semana pasada"}
              </span>
            </div>
            <p>Cada repetición suma.</p>
          </div>
          <WeeklyBars workouts={workouts} weekStartsOn={weekStartsOn} />
        </div>
      </section>
      <section
        class="panel muscle-panel"
        data-dashboard-card="muscles"
        style={{ order: cardOrder("muscles") }}
        hidden={!cardVisible("muscles")}
      >
        <SectionHeading
          eyebrow="MAPA MUSCULAR"
          title="Músculos trabajados"
          action={<span class="muted-label">7 días</span>}
        />
        <MuscleInsights items={muscles} compact />
      </section>
      <section
        class="panel activity-panel"
        data-dashboard-card="activity"
        style={{ order: cardOrder("activity") }}
        hidden={!cardVisible("activity")}
      >
        <SectionHeading
          eyebrow="HISTORIAL"
          title="Actividad reciente"
          action={
            <button class="text-button" onClick={() => onNavigate("profile")}>
              Ver todo <Icon name="arrow" size={15} />
            </button>
          }
        />
        <div class="activity-list">
          {latest.length ? (
            latest.map((workout) => (
              <ActivityRow
                key={workout.id}
                workout={workout}
                exercises={exercises}
                onOpen={() => onWorkoutOpen(workout)}
              />
            ))
          ) : (
            <div class="activity-empty">
              <span>Aquí aparecerán tus sesiones guardadas.</span>
              <button
                type="button"
                class="text-button"
                onClick={onStartWorkout}
              >
                Registrar primer entrenamiento <Icon name="arrow" size={14} />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ActivityRow({ workout, exercises, onOpen }) {
  const exerciseNames = workout.exercises
    .map((entry) => exercises.find((e) => e.id === entry.id)?.name)
    .filter(Boolean);
  const sets = workout.exercises.reduce((n, entry) => n + entry.sets.length, 0);
  const medals = Array.isArray(workout.newMedals)
    ? workout.newMedals.length
    : 0;
  return (
    <button type="button" class="activity-row" onClick={onOpen}>
      <div class="activity-date">
        <strong>{dateLabel(workout.date, { day: "2-digit" })}</strong>
        <span>
          {dateLabel(workout.date, { month: "short" }).replace(".", "")}
        </span>
      </div>
      <div class="activity-main">
        <strong>
          <span translate="no">{workout.name}</span>
        </strong>
        <span>
          {exerciseNames.slice(0, 2).join(" · ")}
          {exerciseNames.length > 2 ? ` +${exerciseNames.length - 2}` : ""}
        </span>
      </div>
      <div class="activity-meta">
        <span>
          <Icon name="clock" size={13} /> {workout.duration} min
        </span>
        <span>{sets} series</span>
        {medals > 0 && (
          <span
            class="activity-medals"
            aria-label={`${medals} ${medals === 1 ? "medalla ganada" : "medallas ganadas"}`}
          >
            <Icon name="trophy" size={12} />
            {medals}
          </span>
        )}
      </div>
      <Icon name="chevron" size={16} className="row-chevron" />
    </button>
  );
}

const metricOptions = [
  { id: "weight", label: "Mayor peso", short: "Peso", icon: "scale" },
  { id: "oneRm", label: "Mejor 1RM", short: "1RM", icon: "trend" },
  {
    id: "setVolume",
    label: "Volumen · serie",
    short: "Serie",
    icon: "dumbbell",
  },
  {
    id: "sessionVolume",
    label: "Volumen · sesión",
    short: "Sesión",
    icon: "calendar",
  },
];
const dateRanges = [
  { id: "7d", label: "7 días", days: 7 },
  { id: "30d", label: "30 días", days: 30 },
  { id: "90d", label: "90 días", days: 90 },
  { id: "all", label: "Todo", days: Infinity },
];
const parseReps = (reps) => Number.parseInt(reps, 10) || 1;

function getExerciseStats(exercise, workouts, range) {
  const cutoff = range === Infinity ? "0000-00-00" : dayOffset(range - 1);
  const records = workouts
    .filter((workout) => workout.date >= cutoff)
    .flatMap((workout) => {
      const entry = workout.exercises.find((item) => item.id === exercise.id);
      if (!entry || entry.trackWeight === false) return [];
      const sets = entry.sets.map((set) => ({
        ...set,
        date: workout.date,
        session: workout.id,
      }));
      return sets.map((set) => ({
        ...set,
        sessionVolume: sets.reduce(
          (sum, item) => sum + item.weight * item.reps,
          0,
        ),
      }));
    });
  if (!records.length)
    return {
      value: null,
      subtitle: "Sin registros en este período",
      sessions: 0,
    };
  const best = (metric) =>
    records.reduce(
      (top, item) => (metric(item) > metric(top) ? item : top),
      records[0],
    );
  const metric = (id) => {
    if (id === "oneRm")
      return best((item) => item.weight * (1 + item.reps / 30));
    if (id === "setVolume") return best((item) => item.weight * item.reps);
    if (id === "sessionVolume") return best((item) => item.sessionVolume);
    return best((item) => item.weight);
  };
  const sessions = new Set(records.map((r) => r.session)).size;
  return { value: metric, sessions, date: dateLabel(records[0].date) };
}

function formatMetric(stats, metricId, unit) {
  if (!stats.value) return { main: "—", suffix: "", foot: stats.subtitle };
  const record =
    typeof stats.value === "function" ? stats.value(metricId) : stats.value;
  const amount =
    metricId === "oneRm"
      ? record.weight * (1 + record.reps / 30)
      : metricId === "setVolume"
        ? record.weight * record.reps
        : metricId === "sessionVolume"
          ? record.sessionVolume
          : record.weight;
  const converted = unit === "lb" ? amount * 2.20462 : amount;
  const main = Math.round(converted * 10) / 10;
  const suffix =
    metricId === "setVolume" || metricId === "sessionVolume"
      ? ` ${unit}`
      : ` ${unit}`;
  const foot =
    metricId === "weight"
      ? `${record.reps} reps · ${dateLabel(record.date)}`
      : metricId === "oneRm"
        ? `estimado · ${dateLabel(record.date)}`
        : `récord · ${dateLabel(record.date)}`;
  return { main: main.toLocaleString(intlLocale()), suffix, foot };
}

function ExercisePreviewModal({ exercise, onClose, onTop = false }) {
  const hasDemo = hasExerciseDemoMedia(exercise);
  const videoDemo = isExerciseDemoVideo(exercise);
  return (
    <Modal
      title={`Cómo hacer ${exercise.name}`}
      onClose={onClose}
      wide
      className={onTop ? "modal-over-picker" : ""}
    >
      <div class="exercise-preview-modal">
        <div class="exercise-preview-heading">
          <div>
            <div class="eyebrow">
              {hasDemo
                ? "DEMOSTRACIÓN DEL EJERCICIO"
                : "DETALLES DEL EJERCICIO"}
            </div>
            <h2>{exercise.name}</h2>
            <p>{exercise.description}</p>
          </div>
          <div class="exercise-preview-tags">
            <span>{exerciseMuscleLine(exercise)}</span>
            <span>{exercise.equipment}</span>
          </div>
        </div>
        <div
          class={`exercise-preview-content ${hasDemo ? "" : "without-demo-media"}`}
        >
          {hasDemo && (
            <div
              class={`exercise-preview-media ${videoDemo ? "exercise-preview-media-video" : ""}`}
            >
              <ExerciseThumb
                exercise={exercise}
                large
                animate
                previewPlaceholder
              />
            </div>
          )}
          <div class="exercise-preview-side">
            <div class="detail-block">
              <div class="eyebrow">MÚSCULOS</div>
              <MuscleMap muscles={getMuscleFocus(exercise)} />
            </div>
            <div class="detail-block">
              <div class="eyebrow">INDICACIONES</div>
              <div class="preview-cues">
                {(exercise.cues || [exercise.description]).map((cue) => (
                  <p key={cue}>
                    <Icon name="check" size={14} />
                    {cue}
                  </p>
                ))}
              </div>
            </div>
            <div class="preview-prescription">
              {exerciseTracksSets(exercise) || exerciseTracksReps(exercise) ? (
                <>
                  {exerciseTracksSets(exercise) && (
                    <>
                      <span>
                        <strong>{exercise.sets}</strong> series
                      </span>
                      {exerciseTracksReps(exercise) && <i />}
                    </>
                  )}
                  {exerciseTracksReps(exercise) && (
                    <span>
                      <strong>{exercise.reps}</strong>{" "}
                      {isTimedPrescription(exercise.reps)
                        ? "duración"
                        : "repeticiones"}
                    </span>
                  )}
                  {exerciseTracksSets(exercise) && (
                    <>
                      <i />
                      <span>
                        <strong>{exercise.rest}s</strong> descanso
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span>Actividad libre</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ExerciseCard({
  exercise,
  workouts,
  metric,
  range,
  unit,
  onOpen,
  index = 0,
}) {
  const stats = getExerciseStats(
    exercise,
    workouts,
    dateRanges.find((r) => r.id === range)?.days ?? Infinity,
  );
  const formatted = formatMetric(stats, metric, unit);
  const title =
    metricOptions.find((option) => option.id === metric)?.label || "Mayor peso";
  return (
    <button
      class="exercise-card"
      style={{
        "--card-index": index,
        "--card-delay": `${Math.min(index, 10) * 24}ms`,
      }}
      onClick={onOpen}
    >
      <span class="exercise-card-map">
        {<ExerciseThumb exercise={exercise} />}
      </span>
      <div class="exercise-card-main">
        <div class="exercise-title-row">
          <strong>{exercise.name}</strong>
          <span class="card-arrow">
            <Icon name="arrow" size={15} />
          </span>
        </div>
        <div class="exercise-tags">
          <span>{exercisePrimaryMuscleLabel(exercise)}</span>
          <i /> <span>{exercise.equipment}</span>
        </div>
        <div class="exercise-prescription">{exerciseDoseLabel(exercise)}</div>
      </div>
      <div class="exercise-record">
        <span>{title}</span>
        <strong>
          {formatted.main}
          <small>{formatted.suffix}</small>
        </strong>
        <em>{formatted.foot}</em>
      </div>
    </button>
  );
}

function RoutineCard({
  routine,
  exercises,
  onOpen,
  onStart,
  onEdit,
  onShare,
  onDelete,
  index = 0,
}) {
  const selectedExercises = routine.exercises
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter(Boolean);
  const focus = selectedExercises.flatMap(getMuscleFocus);
  const duration = selectedExercises.reduce(
    (total, exercise) => total + exercise.duration,
    0,
  );
  const muscles = [
    ...new Set(
      selectedExercises.map((exercise) => exercise.muscle).filter(Boolean),
    ),
  ].slice(0, 3);
  return (
    <article
      class="routine-card"
      style={{
        "--card-index": index,
        "--card-delay": `${Math.min(index, 10) * 24}ms`,
      }}
    >
      <button type="button" class="routine-card-main" onClick={onOpen}>
        <span class="routine-art">
          {selectedExercises.length ? (
            <MuscleMap
              muscles={focus}
              compact
              showKey={false}
              showViewLabels={false}
            />
          ) : (
            <span class="routine-empty-art">
              <Icon name="dumbbell" size={25} />
              <small>Añade ejercicios</small>
            </span>
          )}
        </span>
        <span class="routine-card-copy">
          <span class="eyebrow">
            RUTINA · {selectedExercises.length}{" "}
            {selectedExercises.length === 1 ? "EJERCICIO" : "EJERCICIOS"}
          </span>
          <strong>
            <span translate="no">{routine.name}</span>
          </strong>
          <span class="routine-note">
            {routine.note ||
              (selectedExercises.length
                ? `${duration} min estimados`
                : "Lista para personalizar")}
          </span>
          <span class="routine-muscles">
            {muscles.length ? muscles.join(" · ") : "Sin ejercicios todavía"}
          </span>
        </span>
        <Icon name="chevron" size={17} className="row-chevron" />
      </button>
      <div class="routine-card-actions">
        <span class="routine-card-utility-actions">
          <ExportMenu
            iconOnly
            label={`Compartir ${routine.name}`}
            className="icon-button"
            onSave={() => onShare("device")}
            onShare={() => onShare("share")}
          />
          <button
            type="button"
            class="icon-button danger"
            onClick={onDelete}
            aria-label={`Eliminar ${routine.name}`}
            title={`Eliminar ${routine.name}`}
          >
            <Icon name="trash" size={15} />
          </button>
        </span>
        <Button
          type="button"
          variant="quiet"
          className="routine-start-button"
          onClick={onStart}
          disabled={!selectedExercises.length}
          title={`Iniciar ${routine.name}`}
          aria-label={`Iniciar ${routine.name}`}
        >
          <Icon name="play" size={15} />
        </Button>
      </div>
    </article>
  );
}

function RoutineGroupSection({
  group,
  exercises,
  onOpen,
  onStart,
  onEdit,
  onShare,
  onShareGroup,
  onCreateRoutine,
  onDelete,
  onDeleteGroup,
  index = 0,
}) {
  const expansionKey = group.name
    ? `group:${group.name.trim().toLocaleLowerCase("es")}`
    : "ungrouped";
  const [expanded, setExpanded] = useState(() => {
    const savedExpansion = loadJson("profit-routine-group-expansion", {});
    return typeof savedExpansion?.[expansionKey] === "boolean"
      ? savedExpansion[expansionKey]
      : true;
  });
  const toggleExpanded = () =>
    setExpanded((value) => {
      const nextValue = !value;
      const savedExpansion = loadJson("profit-routine-group-expansion", {});
      localStorage.setItem(
        "profit-routine-group-expansion",
        JSON.stringify({ ...savedExpansion, [expansionKey]: nextValue }),
      );
      return nextValue;
    });
  return (
    <section
      class={`routine-group ${group.name ? "" : "ungrouped"} ${expanded ? "expanded" : "collapsed"}`}
    >
      <div class="routine-group-heading-row">
        <button
          type="button"
          class="routine-group-heading"
          aria-expanded={expanded}
          aria-controls={`routine-group-items-${index}`}
          onClick={toggleExpanded}
        >
          <span class="routine-group-title">
            <strong>
              {group.name ? (
                <span translate="no">{group.name}</span>
              ) : (
                "(Sin grupo)"
              )}
            </strong>
            <small>
              {group.routines.length}{" "}
              {group.routines.length === 1 ? "rutina" : "rutinas"}
            </small>
          </span>
        </button>
        <ExportMenu
          iconOnly
          label={`Compartir ${group.name ? `grupo ${group.name}` : "rutinas (Sin grupo)"}`}
          className="icon-button routine-group-share"
          onSave={() => onShareGroup?.(group, "device")}
          onShare={() => onShareGroup?.(group, "share")}
        />
        <button
          type="button"
          class="routine-group-create icon-button"
          onClick={() => onCreateRoutine?.(group)}
          aria-label={`Crear rutina en ${group.name || "Sin grupo"}`}
          title={`Crear rutina en ${group.name || "Sin grupo"}`}
        >
          <Icon name="plus" size={17} />
        </button>
        <button
          type="button"
          class="routine-group-delete icon-button danger"
          onClick={() => onDeleteGroup?.(group)}
          aria-label={`Eliminar grupo ${group.name || "(Sin grupo)"} y sus ${group.routines.length} rutinas`}
          title="Eliminar grupo y sus rutinas"
        >
          <Icon name="trash" size={16} />
        </button>
        <button
          type="button"
          class="routine-group-toggle icon-button"
          aria-label={`${expanded ? "Contraer" : "Expandir"} grupo ${group.name || "Sin grupo"}`}
          aria-expanded={expanded}
          aria-controls={`routine-group-items-${index}`}
          onClick={toggleExpanded}
          title={expanded ? "Contraer grupo" : "Expandir grupo"}
        >
          <Icon
            name="chevronDown"
            size={16}
            className={
              expanded
                ? "routine-group-chevron expanded"
                : "routine-group-chevron"
            }
          />
        </button>
      </div>
      {expanded && (
        <div class="routine-group-content" id={`routine-group-items-${index}`}>
          {group.routines.length ? (
            <div class="routine-grid">
              {group.routines.map((routine, itemIndex) => (
                <RoutineCard
                  key={routine.id}
                  routine={routine}
                  exercises={exercises}
                  index={index + itemIndex}
                  onOpen={() => onOpen(routine)}
                  onStart={() => onStart(routine)}
                  onEdit={() => onEdit(routine)}
                  onShare={(target) => onShare(routine, target)}
                  onDelete={() => onDelete(routine)}
                />
              ))}
            </div>
          ) : (
            <div class="routine-group-empty">
              {group.name
                ? "Añade una rutina a este grupo desde el editor."
                : "Las rutinas sin grupo aparecerán aquí."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TrainingPage({
  exercises,
  workouts,
  routines,
  routineGroups = [],
  unit,
  onOpen,
  onCreateExercise,
  onCreateRoutine,
  onCreateGroup,
  onOpenRoutine,
  onEditRoutine,
  onShareRoutine,
  onShareRoutineGroup,
  onCreateRoutineInGroup,
  onDeleteRoutine,
  onDeleteRoutineGroup,
  onStartRoutine,
  onImportFile,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const metric = "weight";
  const range = "30d";
  const [section, setSection] = useState("routines");
  const [visibleCount, setVisibleCount] = useState(24);
  const routineImport = useRef(null);
  const exerciseImport = useRef(null);
  const muscleFilters = getExerciseMuscleFilters(exercises);
  const filtered = exercises.filter(
    (exercise) =>
      exerciseMatchesMuscleFilter(exercise, filter) &&
      matchesSearchQuery(query, exerciseSearchValues(exercise)),
  );
  const visibleExercises = filtered.slice(0, visibleCount);
  const routineGroupNames = mergeRoutineGroups(
    routineGroups,
    routines.map((routine) => routine.group),
  );
  const ungroupedRoutines = routines.filter(
    (routine) => !String(routine.group || "").trim(),
  );
  const routineGroupsToShow = [
    ...(ungroupedRoutines.length
      ? [{ name: "", routines: ungroupedRoutines }]
      : []),
    ...routineGroupNames.map((name) => ({
      name,
      routines: routines.filter(
        (routine) =>
          String(routine.group || "")
            .trim()
            .toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
      ),
    })),
  ];
  return (
    <div class="page-grid training-page">
      <section class="page-title-row">
        <div>
          <div class="eyebrow">TU ESPACIO DE ENTRENAMIENTO</div>
          <h1>
            Entrenamientos<span class="welcome-dot">.</span>
          </h1>
          <p>Organiza tus rutinas y consulta cada ejercicio.</p>
        </div>
        <div class="training-import-actions">
          {section === "routines" ? (
            <>
              <input
                ref={routineImport}
                class="visually-hidden"
                type="file"
                accept=".json,.msgpack,.mpk,.bin,application/json,application/msgpack,application/octet-stream,*/*"
                aria-label="Importar rutina"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onImportFile(file, "routine");
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="quiet"
                className="training-page-action"
                title="Importar rutina"
                aria-label="Importar rutina"
                onClick={() => routineImport.current?.click()}
              >
                <Icon name="upload" size={17} />
                <span>Importar rutina</span>
              </Button>
              <Button
                type="button"
                variant="quiet"
                className="training-page-action create-group-action"
                title="Crear grupo de rutinas"
                aria-label="Crear grupo de rutinas"
                onClick={onCreateGroup}
              >
                <Icon name="folderPlus" size={17} />
                <span>Grupo</span>
              </Button>
              <Button
                type="button"
                className="training-page-action"
                title="Crear rutina"
                aria-label="Crear rutina"
                onClick={onCreateRoutine}
              >
                <Icon name="plus" size={18} />
                <span>Crear rutina</span>
              </Button>
            </>
          ) : (
            <>
              <input
                ref={exerciseImport}
                class="visually-hidden"
                type="file"
                accept=".json,.msgpack,.mpk,.bin,application/json,application/msgpack,application/octet-stream,*/*"
                aria-label="Importar ejercicio"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onImportFile(file, "exercise");
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="quiet"
                className="training-page-action"
                title="Importar ejercicio"
                aria-label="Importar ejercicio"
                onClick={() => exerciseImport.current?.click()}
              >
                <Icon name="upload" size={17} />
                <span>Importar ejercicio</span>
              </Button>
              <Button
                type="button"
                onClick={onCreateExercise}
                className="training-page-action create-exercise"
                title="Nuevo ejercicio"
                aria-label="Nuevo ejercicio"
              >
                <Icon name="plus" size={18} />
                <span>Nuevo ejercicio</span>
              </Button>
            </>
          )}
        </div>
      </section>
      <section class="training-summary">
        <div>
          <span class="summary-icon">
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <strong>{routines.length} rutinas</strong>
            <span>creadas por ti</span>
          </div>
        </div>
        <div class="summary-divider" />
        <div>
          <span class="summary-icon purple">
            <Icon name="dumbbell" size={18} />
          </span>
          <div>
            <strong>{exercises.length} ejercicios</strong>
            <span>con guía visual</span>
          </div>
        </div>
        <div class="summary-focus">
          <span class="pulse-dot" /> TU BIBLIOTECA PERSONAL
        </div>
      </section>
      <div class="training-tabs">
        <button
          type="button"
          class={section === "routines" ? "active" : ""}
          onClick={() => setSection("routines")}
        >
          <Icon name="calendar" size={15} /> Mis rutinas{" "}
          <span>{routines.length}</span>
        </button>
        <button
          type="button"
          class={section === "library" ? "active" : ""}
          onClick={() => setSection("library")}
        >
          <Icon name="dumbbell" size={15} /> Biblioteca de ejercicios{" "}
          <span>{exercises.length}</span>
        </button>
      </div>
      {section === "routines" ? (
        <section class="routine-list-section">
          {routines.length || routineGroupNames.length ? (
            routineGroupsToShow.map((group, index) => (
              <RoutineGroupSection
                key={group.name || "__ungrouped__"}
                group={group}
                exercises={exercises}
                index={index * 12}
                onOpen={onOpenRoutine}
                onStart={onStartRoutine}
                onEdit={onEditRoutine}
                onShare={onShareRoutine}
                onShareGroup={onShareRoutineGroup}
                onCreateRoutine={onCreateRoutineInGroup}
                onDelete={onDeleteRoutine}
                onDeleteGroup={onDeleteRoutineGroup}
              />
            ))
          ) : (
            <div class="empty-state routine-empty-state">
              <span class="empty-icon">
                <Icon name="calendar" size={20} />
              </span>
              <strong>Aún no tienes rutinas</strong>
              <span>
                Crea una rutina con nombre y detalles. Después podrás añadir y
                ordenar sus ejercicios.
              </span>
              <Button onClick={onCreateRoutine}>
                <Icon name="plus" size={15} /> Crear mi primera rutina
              </Button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section class="exercise-controls">
            <label class="search-box">
              <Icon name="search" size={18} />
              <input
                value={query}
                onInput={(event) => {
                  setQuery(event.currentTarget.value);
                  setVisibleCount(24);
                }}
                placeholder="Buscar ejercicio o músculo"
              />
            </label>
            <div
              class="muscle-filters"
              role="group"
              aria-label="Filtrar ejercicios por músculo"
            >
              {muscleFilters.map((muscle) => (
                <button
                  key={muscle}
                  class={filter === muscle ? "selected" : ""}
                  aria-pressed={filter === muscle}
                  onClick={() => {
                    setFilter(muscle);
                    setVisibleCount(24);
                  }}
                >
                  {muscle}
                </button>
              ))}
            </div>
          </section>
          <section class="exercise-list-section">
            <div class="list-heading">
              <span>
                Ejercicio <small>({filtered.length})</small>
              </span>
              <span>
                Marca destacada{" "}
                <small>
                  ·{" "}
                  {metricOptions.find((option) => option.id === metric)?.short}
                </small>
              </span>
            </div>
            {visibleExercises.length ? (
              <>
                <div class="exercise-list">
                  {visibleExercises.map((exercise, index) => (
                    <ExerciseCard
                      key={exercise.id}
                      exercise={exercise}
                      index={index}
                      workouts={workouts}
                      metric={metric}
                      range={range}
                      unit={unit}
                      onOpen={() => onOpen(exercise)}
                    />
                  ))}
                </div>
                {visibleCount < filtered.length && (
                  <button
                    type="button"
                    class="load-more-exercises"
                    onClick={() => setVisibleCount((count) => count + 24)}
                  >
                    Cargar más ejercicios{" "}
                    <span>
                      {visibleExercises.length} / {filtered.length}
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div class="empty-state">
                <span class="empty-icon">
                  <Icon name="search" size={20} />
                </span>
                <strong>No encontramos ese ejercicio</strong>
                <span>Prueba con otro nombre o cambia el filtro.</span>
                <button
                  onClick={() => {
                    setQuery("");
                    setFilter("Todos");
                  }}
                >
                  Limpiar búsqueda
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function RoutineForm({ routine, groups = [], fixedGroup, onClose, onSave }) {
  const [form, setForm] = useState(
    routine || { name: "", note: "", group: fixedGroup ?? "" },
  );
  const [newGroupName, setNewGroupName] = useState("");
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Modal title={routine ? "Editar rutina" : "Crear rutina"} onClose={onClose}>
      <form
        class="exercise-form routine-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            group:
              fixedGroup !== undefined
                ? fixedGroup
                : form.group === CREATE_ROUTINE_GROUP
                  ? newGroupName.trim()
                  : String(form.group || "").trim(),
            id: form.id || uid(),
            exercises: form.exercises || [],
          });
        }}
      >
        <div class="eyebrow">PLANIFICACIÓN PERSONAL</div>
        <h2>{routine ? "Ajusta tu rutina" : "Nueva rutina"}</h2>
        <p>
          Guarda el nombre y añade los ejercicios desde la ficha de la rutina.
        </p>
        <label>
          Nombre de la rutina
          <input
            required
            autoFocus
            maxLength="50"
            value={form.name}
            onInput={(event) => set("name", event.currentTarget.value)}
            placeholder="Ej. Torso · fuerza"
          />
        </label>
        <div class="routine-group-picker">
          {fixedGroup !== undefined ? (
            <label>
              Grupo de rutinas
              <span class="routine-fixed-group" aria-readonly="true">
                <Icon name="folderPlus" size={16} />
                {fixedGroup || "Sin grupo"}
              </span>
            </label>
          ) : (
            <label>
              Grupo de rutinas
              <select
                value={form.group || ""}
                onChange={(event) => set("group", event.currentTarget.value)}
              >
                <option value="">Sin grupo</option>
                {mergeRoutineGroups(
                  groups,
                  routine?.group ? [routine.group] : [],
                ).map((group) => (
                  <option value={group} key={group}>
                    {group}
                  </option>
                ))}
                <option value={CREATE_ROUTINE_GROUP}>＋ Crear grupo…</option>
              </select>
            </label>
          )}
          {fixedGroup === undefined && form.group === CREATE_ROUTINE_GROUP && (
            <label>
              Nombre del grupo
              <input
                required
                maxLength="40"
                autoFocus
                value={newGroupName}
                onInput={(event) => setNewGroupName(event.currentTarget.value)}
                placeholder="Ej. Tren superior"
              />
            </label>
          )}
        </div>
        <label>
          Notas
          <textarea
            rows="3"
            value={form.note}
            onInput={(event) => set("note", event.currentTarget.value)}
            placeholder="Objetivo, día de la semana o indicación personal"
          />
        </label>
        <div class="form-actions">
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            <Icon name="check" size={15} />{" "}
            {routine ? "Guardar cambios" : "Crear rutina"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const CREATE_ROUTINE_GROUP = "__create_routine_group__";

function RoutineDetail({
  routine,
  exercises,
  onClose,
  onEdit,
  onUpdate,
  onStart,
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("Todos");
  const [pickerCount, setPickerCount] = useState(30);
  const [preview, setPreview] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragTargetIndex, setDragTargetIndex] = useState(null);
  const routineDragRef = useRef(null);
  const pendingScrollFollow = useRef(null);
  useLayoutEffect(() => {
    const pending = pendingScrollFollow.current;
    if (!pending) return;
    const movedRow = [
      ...pending.element.querySelectorAll("[data-routine-exercise-id]"),
    ].find((row) => row.dataset.routineExerciseId === pending.exerciseId);
    if (movedRow) {
      const viewport = pending.element.getBoundingClientRect();
      const top = viewport.top + pending.element.clientTop + 12;
      const bottom = top + pending.element.clientHeight - 24;
      const row = movedRow.getBoundingClientRect();
      if (row.top < top) pending.element.scrollTop -= top - row.top;
      else if (row.bottom > bottom)
        pending.element.scrollTop += row.bottom - bottom;
    }
    pendingScrollFollow.current = null;
  }, [routine.exercises]);
  const selectedExercises = routine.exercises
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter(Boolean);
  const focus = selectedExercises.flatMap(getMuscleFocus);
  const duration = selectedExercises.reduce(
    (total, exercise) => total + exercise.duration,
    0,
  );
  const muscleFilters = getExerciseMuscleFilters(exercises);
  const availableExercises = exercises.filter(
    (exercise) =>
      exerciseMatchesMuscleFilter(exercise, muscleFilter) &&
      matchesSearchQuery(query, exerciseSearchValues(exercise)),
  );
  const matches = availableExercises.slice(0, pickerCount);
  const routineSettings = routine.exerciseSettings || {};
  const exerciseSettingsFor = (exercise) => ({
    sets: routineSettings[exercise.id]?.sets ?? exercise.sets ?? 3,
    reps: String(routineSettings[exercise.id]?.reps ?? exercise.reps ?? ""),
    ...(exerciseTracksSets(exercise)
      ? {
          restSeconds: String(
            routineSettings[exercise.id]?.restSeconds ?? exercise.rest ?? 60,
          ),
        }
      : {}),
    targetMinutes: String(routineSettings[exercise.id]?.targetMinutes ?? ""),
    comment: String(
      routineSettings[exercise.id]?.comment ?? exercise.templateNote ?? "",
    ),
  });
  const updateExerciseSetting = (exercise, key, value) => {
    const defaults = exerciseSettingsFor(exercise);
    onUpdate({
      ...routine,
      exerciseSettings: {
        ...routineSettings,
        [exercise.id]: {
          ...defaults,
          ...routineSettings[exercise.id],
          [key]: value,
        },
      },
    });
  };
  const add = (exercise) =>
    onUpdate({
      ...routine,
      exercises: [...routine.exercises, exercise.id],
      exerciseSettings: {
        ...routineSettings,
        [exercise.id]:
          routineSettings[exercise.id] || exerciseSettingsFor(exercise),
      },
    });
  const remove = (id) => {
    const exerciseSettings = { ...routineSettings };
    delete exerciseSettings[id];
    onUpdate({
      ...routine,
      exercises: routine.exercises.filter((exerciseId) => exerciseId !== id),
      exerciseSettings,
    });
    if (editingTemplateId === id) setEditingTemplateId(null);
  };
  const reorderRoutineExercise = (from, to, scrollElement) => {
    if (
      from === null ||
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= routine.exercises.length ||
      to >= routine.exercises.length
    )
      return;
    if (scrollElement)
      pendingScrollFollow.current = {
        element: scrollElement,
        exerciseId: routine.exercises[from],
      };
    const next = [...routine.exercises];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onUpdate({ ...routine, exercises: next });
  };
  const autoScrollWhileDragging = (scrollElement, pointerY) => {
    if (!scrollElement) return;
    const rect = scrollElement.getBoundingClientRect();
    const topEdge = rect.top + 54;
    const bottomEdge = rect.bottom - 18;
    const edgeSize = 76;
    if (pointerY < topEdge + edgeSize) {
      const intensity = Math.min(1, (topEdge + edgeSize - pointerY) / edgeSize);
      scrollElement.scrollTop = Math.max(
        0,
        scrollElement.scrollTop - Math.ceil(4 + intensity * 17),
      );
    } else if (pointerY > bottomEdge - edgeSize) {
      const intensity = Math.min(
        1,
        (pointerY - (bottomEdge - edgeSize)) / edgeSize,
      );
      scrollElement.scrollTop += Math.ceil(4 + intensity * 17);
    }
  };
  return (
    <>
      <Modal
        title="RUTINA PERSONAL"
        onClose={() => (adding ? setAdding(false) : onClose())}
        wide
        className={adding ? "routine-library-modal" : ""}
      >
        <div
          className={`routine-detail ${
            adding ? "routine-detail-library-mode" : ""
          }`}
        >
          {adding ? (
            <section className="routine-picker routine-picker-immersive">
              <div className="library-immersive-top">
                <button
                  type="button"
                  className="library-back-button"
                  onClick={() => setAdding(false)}
                >
                  <Icon name="arrow" size={15} className="library-back-arrow" />
                  Volver a la rutina
                </button>

                <div className="eyebrow">
                  BIBLIOTECA LOCAL ·{" "}
                  <span translate="no">
                    {routine.name.toLocaleUpperCase("es")}
                  </span>
                </div>

                <h2>
                  Añadir ejercicios
                  <span className="welcome-dot">.</span>
                </h2>

                <p>
                  Busca, filtra y añade ejercicios. Tu orden de entrenamiento
                  queda en segundo plano hasta que vuelvas.
                </p>

                <div className="library-count-pill">
                  {routine.exercises.length}{" "}
                  {routine.exercises.length === 1
                    ? "ejercicio en la rutina"
                    : "ejercicios en la rutina"}
                </div>
              </div>

              <label className="search-box">
                <Icon name="search" size={17} />

                <input
                  autoFocus
                  value={query}
                  onInput={(event) => {
                    setQuery(event.currentTarget.value);
                    setPickerCount(30);
                  }}
                  placeholder="Buscar por ejercicio, músculo o equipo"
                />
              </label>

              <div
                className="exercise-picker-categories"
                role="group"
                aria-label="Filtrar ejercicios por músculo"
              >
                {muscleFilters.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={muscleFilter === item ? "selected" : ""}
                    aria-pressed={muscleFilter === item}
                    onClick={() => {
                      setMuscleFilter(item);
                      setPickerCount(30);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="picker-results-label">
                {availableExercises.length}{" "}
                {availableExercises.length === 1
                  ? "ejercicio disponible"
                  : "ejercicios disponibles"}
              </div>

              {/* Solo esta zona tiene scroll vertical */}
              <div className="routine-picker-results">
                {matches.length > 0 ? (
                  matches.map((exercise) => {
                    const isAdded = routine.exercises.includes(exercise.id);
                    return (
                      <article className="routine-picker-row" key={exercise.id}>
                        <button
                          type="button"
                          className="exercise-preview-trigger"
                          onClick={() => setPreview(exercise)}
                        >
                          <span className="routine-exercise-visual">
                            {exercise.poster ||
                            exercise.media ||
                            exercise.mediaAssetId ||
                            exercise.previewAssetId ? (
                              <ExerciseThumb exercise={exercise} />
                            ) : (
                              <MuscleMap
                                muscles={getMuscleFocus(exercise)}
                                compact
                              />
                            )}
                          </span>

                          <span className="routine-exercise-copy">
                            <strong>{exercise.name}</strong>
                            <span>
                              {exerciseMuscleLine(exercise)} ·{" "}
                              {exercise.equipment}
                            </span>
                            <small>{exerciseDoseLabel(exercise)}</small>
                          </span>
                        </button>

                        <button
                          type="button"
                          className={`icon-button routine-add-button ${isAdded ? "is-added" : ""}`}
                          onClick={() =>
                            isAdded ? remove(exercise.id) : add(exercise)
                          }
                          aria-label={
                            isAdded
                              ? `${translateText("Quitar de la rutina")}: ${exercise.name}`
                              : `${translateText("Añadir a la rutina")}: ${exercise.name}`
                          }
                          title={
                            isAdded
                              ? translateText("Quitar de la rutina")
                              : translateText("Añadir a la rutina")
                          }
                          aria-pressed={isAdded}
                        >
                          {isAdded ? (
                            <>
                              <Icon name="check" size={14} />
                              <span>{translateText("Añadido")}</span>
                            </>
                          ) : (
                            <Icon name="plus" size={15} />
                          )}
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-inline">
                    No hay ejercicios que coincidan con esos filtros.
                  </div>
                )}

                {pickerCount < availableExercises.length && (
                  <div className="picker-result-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setPickerCount((count) =>
                          Math.min(count + 30, availableExercises.length),
                        )
                      }
                    >
                      Mostrar más
                    </button>

                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setPickerCount(availableExercises.length)}
                    >
                      Mostrar todos ({availableExercises.length})
                    </button>
                  </div>
                )}
              </div>

              <div className="library-immersive-footer">
                <span>
                  Los ejercicios añadidos se incorporan al final del orden
                  actual.
                </span>

                <Button onClick={() => setAdding(false)}>
                  Listo <Icon name="check" size={14} />
                </Button>
              </div>
            </section>
          ) : (
            <>
              <div className="routine-detail-head">
                <div>
                  <div className="eyebrow">RUTINA PERSONAL</div>
                  <h2>
                    <span translate="no">{routine.name}</span>
                  </h2>

                  <p>
                    {routine.note ||
                      "Añade los ejercicios que forman parte de este entrenamiento."}
                  </p>

                  <div className="detail-actions">
                    <Button
                      type="button"
                      variant="quiet"
                      title="Editar rutina"
                      aria-label="Editar rutina"
                      onClick={onEdit}
                    >
                      <Icon name="edit" size={14} />
                      <span>Editar rutina</span>
                    </Button>

                    <Button
                      type="button"
                      variant="quiet"
                      title="Añadir ejercicios"
                      aria-label="Añadir ejercicios"
                      onClick={() => setAdding(true)}
                    >
                      <Icon name="plus" size={15} />
                      <span>Añadir ejercicios</span>
                    </Button>

                    <Button
                      type="button"
                      title="Iniciar rutina"
                      aria-label="Iniciar rutina"
                      onClick={onStart}
                      disabled={!selectedExercises.length}
                    >
                      <Icon name="play" size={14} />
                      <span>Iniciar</span>
                    </Button>
                  </div>
                </div>

                <div className="routine-detail-art">
                  {selectedExercises.length ? (
                    <MuscleMap
                      muscles={focus}
                      showKey={false}
                      showViewLabels={false}
                    />
                  ) : (
                    <div className="routine-empty-art">
                      <Icon name="dumbbell" size={31} />
                      <strong>Tu rutina empieza aquí</strong>
                      <span>Añade ejercicios para ver el mapa muscular.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="routine-detail-stats">
                <span>
                  <strong>{selectedExercises.length}</strong>{" "}
                  {selectedExercises.length === 1 ? "ejercicio" : "ejercicios"}
                </span>
                <i />
                <span>
                  <strong>{duration}</strong> min estimados
                </span>
                <i />
                <span>
                  <strong>
                    {
                      [
                        ...new Set(
                          selectedExercises
                            .map((exercise) => exercise.muscle)
                            .filter(Boolean),
                        ),
                      ].length
                    }
                  </strong>{" "}
                  grupos principales
                </span>
              </div>

              <section className="routine-detail-list">
                <div className="detail-block-head">
                  <div>
                    <div className="eyebrow">ORDEN DEL ENTRENAMIENTO</div>
                    <strong>Ejercicios de la rutina</strong>
                  </div>

                  {selectedExercises.length > 0 && (
                    <span className="muted-label">
                      Mantén pulsado el inicio de un ejercicio y arrástralo para
                      cambiar el orden
                    </span>
                  )}
                </div>

                {selectedExercises.length ? (
                  <div className="routine-exercise-list">
                    {selectedExercises.map((exercise, index) => (
                      <div
                        className="routine-exercise-template-wrap"
                        key={exercise.id}
                      >
                        <article
                          data-routine-index={index}
                          data-routine-exercise-id={exercise.id}
                          className={`routine-exercise-row ${
                            dragIndex === index ? "is-dragging" : ""
                          } ${
                            dragTargetIndex === index && dragIndex !== index
                              ? "is-drop-target"
                              : ""
                          } ${
                            dragTargetIndex === index &&
                            dragIndex !== null &&
                            dragIndex < dragTargetIndex
                              ? "is-drop-target-after"
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="drag-handle"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              routineDragRef.current = {
                                from: index,
                                to: index,
                                pointerId: event.pointerId,
                                scrollElement:
                                  event.currentTarget.closest(".modal-card"),
                              };
                              setDragIndex(index);
                              setDragTargetIndex(index);
                              event.currentTarget.setPointerCapture?.(
                                event.pointerId,
                              );
                            }}
                            onPointerMove={(event) => {
                              const drag = routineDragRef.current;
                              if (!drag || drag.pointerId !== event.pointerId) {
                                return;
                              }
                              autoScrollWhileDragging(
                                drag.scrollElement,
                                event.clientY,
                              );

                              const target = document
                                .elementFromPoint(event.clientX, event.clientY)
                                ?.closest("[data-routine-index]");

                              if (target) {
                                const to = Number(target.dataset.routineIndex);

                                if (Number.isInteger(to)) {
                                  drag.to = to;
                                  setDragTargetIndex(to);
                                }
                              }
                            }}
                            onPointerUp={(event) => {
                              const drag = routineDragRef.current;

                              if (!drag || drag.pointerId !== event.pointerId) {
                                return;
                              }

                              reorderRoutineExercise(
                                drag.from,
                                drag.to,
                                drag.scrollElement,
                              );
                              routineDragRef.current = null;
                              setDragIndex(null);
                              setDragTargetIndex(null);
                            }}
                            onPointerCancel={() => {
                              routineDragRef.current = null;
                              setDragIndex(null);
                              setDragTargetIndex(null);
                            }}
                            aria-label={`Arrastrar ${exercise.name} para cambiar el orden`}
                            title="Arrastrar para reordenar"
                          >
                            <Icon name="grip" size={17} />
                          </button>

                          <button
                            type="button"
                            className="exercise-preview-trigger"
                            onClick={() => setPreview(exercise)}
                          >
                            <span className="routine-exercise-visual">
                              {exercise.poster ||
                              exercise.media ||
                              exercise.mediaAssetId ||
                              exercise.previewAssetId ? (
                                <ExerciseThumb exercise={exercise} />
                              ) : (
                                <MuscleMap
                                  muscles={getMuscleFocus(exercise)}
                                  compact
                                />
                              )}
                            </span>

                            <span className="routine-exercise-copy">
                              <strong>{exercise.name}</strong>
                              <span>
                                {exerciseMuscleLine(exercise)} ·{" "}
                                {exerciseDoseLabel(exercise)}
                              </span>
                              <small>
                                {exercise.cues?.[0] || exercise.description}
                              </small>
                            </span>
                          </button>

                          <div className="routine-exercise-actions">
                            <button
                              type="button"
                              className="icon-button routine-template-toggle"
                              aria-label={`${editingTemplateId === exercise.id ? "Cerrar" : "Editar"} plantilla de ${exercise.name}`}
                              aria-expanded={editingTemplateId === exercise.id}
                              title="Configurar series, repeticiones y comentario de la rutina"
                              onClick={() =>
                                setEditingTemplateId((current) =>
                                  current === exercise.id ? null : exercise.id,
                                )
                              }
                            >
                              <Icon name="edit" size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button danger"
                              onClick={() => remove(exercise.id)}
                              aria-label={`Quitar ${exercise.name}`}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </article>
                        {editingTemplateId === exercise.id && (
                          <div className="routine-template-editor">
                            <div className="routine-template-fields">
                              {exerciseTracksSets(exercise) && (
                                <label className="routine-dose-field">
                                  Series
                                  <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    step="1"
                                    value={exerciseSettingsFor(exercise).sets}
                                    onInput={(event) =>
                                      updateExerciseSetting(
                                        exercise,
                                        "sets",
                                        event.currentTarget.value,
                                      )
                                    }
                                    onBlur={(event) => {
                                      const value = Number(
                                        event.currentTarget.value,
                                      );
                                      updateExerciseSetting(
                                        exercise,
                                        "sets",
                                        Number.isInteger(value) &&
                                          value >= 1 &&
                                          value <= 30
                                          ? value
                                          : 1,
                                      );
                                    }}
                                  />
                                </label>
                              )}
                              {exerciseTracksReps(exercise) && (
                                <label className="routine-dose-field">
                                  Repeticiones
                                  <input
                                    type="text"
                                    maxLength="24"
                                    value={exerciseSettingsFor(exercise).reps}
                                    onInput={(event) =>
                                      updateExerciseSetting(
                                        exercise,
                                        "reps",
                                        event.currentTarget.value,
                                      )
                                    }
                                    placeholder="Ej. 8–12 o 30 s"
                                  />
                                </label>
                              )}
                              {!exerciseTracksSets(exercise) &&
                                !exerciseTracksReps(exercise) && (
                                  <label className="routine-template-target-field">
                                    Objetivo de la actividad (min)
                                    <input
                                      type="number"
                                      min="0"
                                      max="1440"
                                      step="1"
                                      value={exerciseSettingsFor(exercise).targetMinutes}
                                      onInput={(event) =>
                                        updateExerciseSetting(
                                          exercise,
                                          "targetMinutes",
                                          event.currentTarget.value,
                                        )
                                      }
                                      placeholder="Ej. 30"
                                    />
                                  </label>
                                )}
                              {exerciseTracksSets(exercise) && (
                                <label className="routine-dose-field">
                                  Descanso (s)
                                  <input
                                    type="number"
                                    min="0"
                                    max="3600"
                                    step="5"
                                    value={exerciseSettingsFor(exercise).restSeconds}
                                    onInput={(event) =>
                                      updateExerciseSetting(
                                        exercise,
                                        "restSeconds",
                                        event.currentTarget.value,
                                      )
                                    }
                                    onBlur={(event) =>
                                      updateExerciseSetting(
                                        exercise,
                                        "restSeconds",
                                        safeRestSeconds(event.currentTarget.value),
                                      )
                                    }
                                  />
                                </label>
                              )}
                              <label className="routine-template-comment">
                                Comentario
                                <textarea
                                  rows="2"
                                  maxLength="500"
                                  value={exerciseSettingsFor(exercise).comment}
                                  onInput={(event) =>
                                    updateExerciseSetting(
                                      exercise,
                                      "comment",
                                      event.currentTarget.value,
                                    )
                                  }
                                  placeholder="Indicaciones para este ejercicio en esta rutina"
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline">
                    Esta rutina todavía no tiene ejercicios. Añádelos cuando
                    quieras y ordénalos según tu sesión.
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </Modal>

      {preview && (
        <ExercisePreviewModal
          exercise={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function WorkoutLaunchModal({
  routines,
  exercises,
  onClose,
  onChooseRoutine,
  onFreeWorkout,
  onCreateRoutine,
}) {
  return (
    <Modal title="Empezar entrenamiento" onClose={onClose} wide>
      <div class="launch-modal">
        <div class="eyebrow">¿CÓMO QUIERES ENTRENAR?</div>
        <h2>
          Elige tu sesión<span class="welcome-dot">.</span>
        </h2>
        <p>
          Empieza desde una rutina que ya preparaste o registra una sesión
          libre.
        </p>
        {routines.length ? (
          <div class="launch-routines">
            {routines.map((routine) => {
              const count = routine.exercises.length;
              const minutes = routine.exercises.reduce(
                (total, id) =>
                  total +
                  (exercises.find((exercise) => exercise.id === id)?.duration ||
                    0),
                0,
              );
              return (
                <button
                  type="button"
                  class="launch-routine"
                  onClick={() => onChooseRoutine(routine)}
                  key={routine.id}
                >
                  <span class="launch-icon">
                    <Icon name="dumbbell" size={18} />
                  </span>
                  <span>
                    <strong>
                      <span translate="no">{routine.name}</span>
                    </strong>
                    <small>
                      {count} {count === 1 ? "ejercicio" : "ejercicios"}
                      {minutes ? ` · ${minutes} min` : ""}
                    </small>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              );
            })}
          </div>
        ) : (
          <div class="empty-inline">
            Todavía no hay rutinas guardadas. Puedes crear una ahora o comenzar
            una sesión libre.
          </div>
        )}
        <div class="launch-actions">
          <Button variant="quiet" onClick={onCreateRoutine}>
            <Icon name="plus" size={15} /> Crear rutina
          </Button>
          <Button onClick={onFreeWorkout}>
            <Icon name="play" size={14} /> Entrenamiento libre
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteWorkoutsModal({ workouts, onClose, onDelete, onConfirm }) {
  const [mode, setMode] = useState("day");
  const [date, setDate] = useState(dayOffset(0));
  const [fromDate, setFromDate] = useState(dayOffset(6));
  const [toDate, setToDate] = useState(dayOffset(0));
  const validRange = fromDate <= toDate;
  const matches = workouts
    .filter((workout) =>
      mode === "day"
        ? workout.date === date
        : validRange && workout.date >= fromDate && workout.date <= toDate,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const removeOne = (workout) => {
    onConfirm({
      title: "Eliminar entrenamiento",
      message: `¿Eliminar “${workout.name}” del ${dateLabel(workout.date)}? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      onConfirm: () => onDelete([workout.id], false),
    });
  };
  const removeMatches = () => {
    if (!matches.length) return;
    const period =
      mode === "day"
        ? dateLabel(date)
        : `${dateLabel(fromDate)} – ${dateLabel(toDate)}`;
    onConfirm({
      title: "Borrar del historial",
      message: `¿Eliminar ${matches.length} ${matches.length === 1 ? "entrenamiento" : "entrenamientos"} del período ${period}? Esta acción no se puede deshacer.`,
      confirmLabel: `Eliminar ${matches.length}`,
      onConfirm: () =>
        onDelete(
          matches.map((workout) => workout.id),
          true,
        ),
    });
  };
  return (
    <Modal title="Eliminar entrenamientos" onClose={onClose} wide>
      <div class="delete-workouts-modal">
        <div class="eyebrow">GESTIÓN DEL HISTORIAL</div>
        <h2>Borrar entrenamientos</h2>
        <p>
          Elige un día para borrar una sesión concreta o selecciona un rango
          para eliminar las sesiones de ese período.
        </p>
        <div
          class="delete-mode-switch"
          role="tablist"
          aria-label="Tipo de borrado"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "day"}
            class={mode === "day" ? "active" : ""}
            onClick={() => setMode("day")}
          >
            Un día
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "range"}
            class={mode === "range" ? "active" : ""}
            onClick={() => setMode("range")}
          >
            Rango de días
          </button>
        </div>
        {mode === "day" ? (
          <label class="delete-date-field">
            Día del entrenamiento
            <input
              type="date"
              value={date}
              onInput={(event) => setDate(event.currentTarget.value)}
            />
          </label>
        ) : (
          <div class="delete-date-range">
            <label class="delete-date-field">
              Desde
              <input
                type="date"
                value={fromDate}
                onInput={(event) => setFromDate(event.currentTarget.value)}
              />
            </label>
            <label class="delete-date-field">
              Hasta
              <input
                type="date"
                value={toDate}
                onInput={(event) => setToDate(event.currentTarget.value)}
              />
            </label>
          </div>
        )}
        {!validRange && mode === "range" ? (
          <div class="delete-empty">
            La fecha inicial debe ser anterior o igual a la fecha final.
          </div>
        ) : matches.length ? (
          <>
            <div class="delete-match-heading">
              <strong>
                {matches.length}{" "}
                {matches.length === 1
                  ? "entrenamiento encontrado"
                  : "entrenamientos encontrados"}
              </strong>
              <span>
                {mode === "day"
                  ? dateLabel(date)
                  : `${dateLabel(fromDate)} – ${dateLabel(toDate)}`}
              </span>
            </div>
            <div class="delete-match-list">
              {matches.map((workout) => (
                <div class="delete-match-row" key={workout.id}>
                  <div class="delete-match-date">
                    <strong>
                      {dateLabel(workout.date, { day: "2-digit" })}
                    </strong>
                    <span>{dateLabel(workout.date, { month: "short" })}</span>
                  </div>
                  <div class="delete-match-copy">
                    <strong>
                      <span translate="no">{workout.name}</span>
                    </strong>
                    <span>
                      {workout.exercises.length}{" "}
                      {workout.exercises.length === 1
                        ? "ejercicio"
                        : "ejercicios"}{" "}
                      · {workout.duration} min
                    </span>
                  </div>
                  {mode === "day" && (
                    <button
                      type="button"
                      class="delete-one-button"
                      onClick={() => removeOne(workout)}
                      aria-label={`Eliminar ${workout.name}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {(mode === "range" || matches.length > 1) && (
              <Button
                variant="quiet"
                className="delete-all-button"
                onClick={removeMatches}
              >
                <Icon name="trash" size={15} />{" "}
                {translateText(
                  `Eliminar ${mode === "day" ? "todas las sesiones de este día" : "todo el rango"} (${matches.length})`,
                )}
              </Button>
            )}
          </>
        ) : (
          <div class="delete-empty">
            No hay entrenamientos guardados para estas fechas.
          </div>
        )}
        <div class="delete-modal-footer">
          <span>Las medidas y la biblioteca de ejercicios no se borrarán.</span>
          <Button variant="quiet" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StrengthMedals({ workouts, unit, cardOrder, hidden = false }) {
  const records = new Map();
  workouts.forEach((workout) =>
    workout.exercises.forEach((entry) => {
      const best = entry.trackWeight === false
        ? 0
        : Math.max(0, ...entry.sets.map((set) => Number(set.weight) || 0));
      const reps = Math.max(
        0,
        ...entry.sets.map((set) => Number(set.reps) || 0),
      );
      if (!best && !reps) return;
      const current = records.get(entry.id) || {
        id: entry.id,
        name: entry.name || entry.id,
        weight: 0,
        reps: 0,
        date: workout.date,
      };
      records.set(entry.id, {
        ...current,
        name: entry.name || current.name,
        weight: Math.max(best, current.weight),
        reps: Math.max(reps, current.reps),
        date: workout.date,
      });
    }),
  );
  const medals = [...records.values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const convert = (weight) => (unit === "lb" ? weight * 2.20462 : weight);
  return (
    <section
      class="panel strength-medals-panel"
      data-dashboard-card={cardOrder === undefined ? undefined : "medals"}
      style={cardOrder === undefined ? undefined : { order: cardOrder }}
      hidden={hidden}
    >
      <SectionHeading
        eyebrow="MARCAS PERSONALES"
        title="Medallas por ejercicio"
        action={
          <span class="muted-label">
            {medals.length} {medals.length === 1 ? "récord" : "récords"}
          </span>
        }
      />
      <p class="medal-intro">
        Cada medalla reconoce una mejora personal en un ejercicio: más peso o
        más repeticiones.
      </p>
      {medals.length ? (
        <div class="strength-medal-list">
          {medals.map((record) => (
            <div
              class="strength-medal unlocked"
              key={record.id}
              title={record.name}
            >
              <span>🏅</span>
              <strong>{record.name}</strong>
              <small>
                {record.weight
                  ? `${convert(record.weight).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${unit}`
                  : `${record.reps} reps`}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <div class="bests-empty">
          Al superar tu marca en un ejercicio, aquí aparecerá su medalla.
        </div>
      )}
    </section>
  );
}

function WeeklyGoalAchievements({
  stats,
  goal,
  weekStartsOn = 1,
  cardOrder,
  hidden = false,
}) {
  const milestones = [1, 2, 4, 8, 12, 26, 52];
  return (
    <section
      class="panel weekly-goal-achievements"
      data-dashboard-card={cardOrder === undefined ? undefined : "goalWeeks"}
      style={cardOrder === undefined ? undefined : { order: cardOrder }}
      hidden={hidden}
    >
      <SectionHeading
        eyebrow="CONSTANCIA"
        title="Semanas a tu objetivo"
        action={<span class="muted-label">{stats.streak} seguidas</span>}
      />
      <div class="weekly-goal-stats">
        <div>
          <strong>{stats.streak}</strong>
          <span>semanas seguidas</span>
        </div>
        <div>
          <strong>{stats.completedWeeks}</strong>
          <span>semanas cumplidas</span>
        </div>
        <div>
          <strong>{stats.bestStreak}</strong>
          <span>mejor racha</span>
        </div>
      </div>
      <p class="weekly-goal-check-copy">
        Tu objetivo es {goal} {goal === 1 ? "sesión" : "sesiones"} por semana.
        Revisamos cada {translateText(weekdayNames[weekStartsOn])} si cumpliste
        la semana anterior.
      </p>
      <div
        class="weekly-goal-milestones"
        aria-label="Hitos de semanas cumplidas"
      >
        {milestones.map((weeks) => (
          <div
            class={
              stats.completedWeeks >= weeks
                ? "weekly-goal-milestone unlocked"
                : "weekly-goal-milestone"
            }
            key={weeks}
            title={`${weeks} semanas cumplidas`}
          >
            <span>
              <Icon name="trophy" size={15} />
            </span>
            <small>{weeks} sem</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsSectionLabel({ label, description, first = false }) {
  return (
    <div class={`settings-section-label ${first ? "first" : ""}`}>
      <span>{label}</span>
      <small>{description}</small>
    </div>
  );
}

function ProfilePage({
  workouts,
  exercises,
  measures,
  onAddMeasure,
  onManageMeasures,
  onManagePhotos,
  onManageDashboardLayout,
  onEditMeasure,
  onDeleteMeasure,
  onDeleteWorkouts,
  onWorkoutOpen,
  onImportFile,
  onExportData,
  unit,
  onUnit,
  heightUnit,
  onHeightUnit,
  goal,
  weeklyGoalHistory,
  weekStartsOn,
  onWeekStartsOn,
  onGoal,
  name,
  onName,
  avatar,
  onAvatarFile,
  onAvatar,
  palette,
  onPalette,
  theme,
  onTheme,
  language,
  onLanguage,
  soundsMuted,
  onSoundsMuted,
  waterGoal,
  onWaterGoal,
  kcalGoal,
  onKcalGoal,
  manualGoals,
  onManualGoals,
  weightGoal,
  onWeightGoal,
  calculatedGoals,
  waterReminder,
  onWaterReminder,
  proteinReminder,
  onProteinReminder,
  proteinReminderTime,
  onProteinReminderTime,
  reminderInterval,
  onReminderInterval,
  reminderDays,
  onReminderDays,
  reminderQuietHours,
  onReminderQuietHours,
  weightReminder,
  onWeightReminder,
  weightReminderTime,
  onWeightReminderTime,
  highResolutionProgressPhotos,
  onHighResolutionProgressPhotos,
}) {
  const avatarInput = useRef(null);
  const backupInput = useRef(null);
  const displayName = name.trim();
  const [waterGoalDraft, setWaterGoalDraft] = useState(String(waterGoal));
  const [kcalGoalDraft, setKcalGoalDraft] = useState(String(kcalGoal));
  useEffect(() => setWaterGoalDraft(String(waterGoal)), [waterGoal]);
  useEffect(() => setKcalGoalDraft(String(kcalGoal)), [kcalGoal]);
  const last30 = workouts.filter((workout) => workout.date >= dayOffset(29));
  const previous30 = workouts.filter(
    (workout) => workout.date >= dayOffset(59) && workout.date < dayOffset(29),
  );
  const totalSets = last30.reduce(
    (total, workout) =>
      total + workout.exercises.reduce((n, e) => n + e.sets.length, 0),
    0,
  );
  const totalVolume = last30.reduce(
    (total, workout) =>
      total +
      workout.exercises.reduce(
        (n, e) => n + (e.trackWeight === false ? 0 : e.sets.reduce((s, set) => s + set.weight * set.reps, 0)),
        0,
      ),
    0,
  );
  const previousVolume = previous30.reduce(
    (total, workout) =>
      total +
      workout.exercises.reduce(
        (n, e) => n + (e.trackWeight === false ? 0 : e.sets.reduce((s, set) => s + set.weight * set.reps, 0)),
        0,
      ),
    0,
  );
  const volumeChange = previousVolume
    ? ((totalVolume - previousVolume) / previousVolume) * 100
    : null;
  const volumeChangeLabel =
    volumeChange === null
      ? last30.length
        ? "Nueva referencia"
        : "Sin sesiones todavía"
      : `${volumeChange > 0 ? "+" : ""}${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(volumeChange)}% ${translateText("vs. período anterior")}`;
  const days = new Set(last30.map((workout) => workout.date)).size;
  const streak = trainingStreak(workouts);
  const weeklyGoalStats = getWeeklyGoalStats(
    workouts,
    goal,
    weeklyGoalHistory,
    today(),
    weekStartsOn,
  );
  const currentMeasure = measures.at(-1) || null;
  const firstMeasure = measures[0] || null;
  const weightChange =
    currentMeasure && firstMeasure
      ? currentMeasure.weight - firstMeasure.weight
      : 0;
  const personalBests = exercises
    .map((exercise) => ({
      exercise,
      stats: getExerciseStats(exercise, workouts, Infinity),
    }))
    .filter((entry) => entry.stats.value)
    .sort((a, b) => b.stats.sessions - a.stats.sessions)
    .slice(0, 4);
  const recentMeasures = measures.slice(-3).reverse();
  const monthMuscles = buildMuscleLoad(workouts, exercises, dayOffset(29));
  const bmi =
    currentMeasure?.weight && currentMeasure?.height
      ? currentMeasure.weight / (currentMeasure.height / 100) ** 2
      : null;
  const displayLength = (cm, digits = 1) =>
    cm
      ? `${(heightUnit === "in" ? cmToIn(cm) : cm).toLocaleString(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${heightUnit}`
      : "—";
  return (
    <div class="page-grid profile-page">
      <section class="profile-header">
        <Avatar
          name={displayName}
          src={avatar}
          className="profile-avatar"
          fireDays={weeklyGoalStats.currentWeekDays}
        />
        <div class="profile-identity">
          <div class="eyebrow">TU ESPACIO</div>
          <h1>
            {displayName || "Perfil"}
            <span class="welcome-dot">.</span>
          </h1>
          <p>Tu entrenamiento, tus registros y tus preferencias.</p>
        </div>
      </section>
      <section class="profile-top-grid">
        <article class="panel profile-stat-panel">
          <SectionHeading eyebrow="ÚLTIMOS 30 DÍAS" title="Tu actividad" />
          <div class="profile-kpis">
            <div>
              <strong>{days}</strong>
              <span>días activo</span>
            </div>
            <div>
              <strong>{last30.length}</strong>
              <span>sesiones</span>
            </div>
            <div>
              <strong>{totalSets}</strong>
              <span>series</span>
            </div>
          </div>
          <div class="profile-volume">
            <span>Volumen total</span>
            <strong>
              {Math.round(totalVolume / 1000).toLocaleString(intlLocale())}{" "}
              <small>t</small>
            </strong>
            <span
              class={`positive-text ${volumeChange !== null && volumeChange < 0 ? "negative" : ""}`}
            >
              <Icon name="trend" size={13} /> {volumeChangeLabel}
            </span>
          </div>
        </article>
        <article class="panel profile-consistency">
          <div class="consistency-orb">
            <div class="consistency-ring">
              <span>
                {Math.min(Math.round((days / 30) * 100), 100)}
                <small>%</small>
              </span>
            </div>
          </div>
          <div class="consistency-copy">
            <div class="eyebrow">CONSTANCIA</div>
            <strong>Un hábito en marcha</strong>
            <span>
              Has entrenado {days} {days === 1 ? "día" : "días"} este mes;
              revisamos cada {translateText(weekdayNames[weekStartsOn])} si
              cumpliste la semana anterior.
            </span>
            <div class="mini-streak">
              <Icon name="flame" size={15} /> {streak}{" "}
              {streak === 1 ? "día consecutivo" : "días consecutivos"}
            </div>
            <div class="consistency-weekly-goal">
              <span>
                <small>OBJETIVO SEMANAL</small>
                <strong>Sesiones por semana</strong>
              </span>
              <select
                aria-label="Objetivo semanal de sesiones"
                value={goal}
                onChange={(event) => onGoal(Number(event.currentTarget.value))}
              >
                {Array.from({ length: 7 }, (_, index) => index + 1).map(
                  (days) => (
                    <option value={days} key={days}>
                      {days} {days === 1 ? "día" : "días"}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
        </article>
      </section>
      <section class="profile-columns">
        <div class="panel calendar-panel">
          <SectionHeading
            eyebrow="HISTORIAL"
            title="Tu calendario"
            action={<span class="muted-label">Historial completo</span>}
          />
          <ActivityCalendar
            workouts={workouts}
            onWorkoutOpen={onWorkoutOpen}
            unit={unit}
            weekStartsOn={weekStartsOn}
          />
          <div class="calendar-legend">
            <span>Menos</span>
            <i />
            <i />
            <i />
            <i />
            <i />
            <span>Más sesiones</span>
          </div>
        </div>
        <div class="panel measures-panel">
          <SectionHeading
            eyebrow="CUERPO"
            title="Medidas"
          />
          <div class="measure-heading-actions">
            <button
              type="button"
              class="text-button"
              onClick={onManagePhotos}
            >
              <Icon name="image" size={14} /> Fotos
            </button>
            <button
              type="button"
              class="text-button"
              onClick={onManageMeasures}
            >
              <Icon name="history" size={14} /> Historial
            </button>
            <button
              type="button"
              class="text-button"
              onClick={onAddMeasure}
            >
              <Icon name="plus" size={14} /> Añadir
            </button>
          </div>
          {currentMeasure ? (
            <>
              <div class="measure-weight">
                <div>
                  <span>Peso actual</span>
                  <strong>
                    {kgToUnit(currentMeasure.weight, unit).toLocaleString(
                      intlLocale(),
                      { minimumFractionDigits: 1, maximumFractionDigits: 1 },
                    )}{" "}
                    <small>{unit}</small>
                  </strong>
                </div>
                <span
                  class={
                    measures.length < 2
                      ? "measure-change"
                      : weightChange <= 0
                        ? "measure-change"
                        : "measure-change increase"
                  }
                >
                  {measures.length < 2 ? (
                    "Primera referencia"
                  ) : (
                    <>
                      <Icon
                        name={weightChange <= 0 ? "trend" : "arrow"}
                        size={13}
                      />{" "}
                      {weightChange > 0 ? "+" : ""}
                      {(unit === "lb"
                        ? weightChange * 2.20462
                        : weightChange
                      ).toLocaleString(intlLocale(), {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{" "}
                      {unit}
                    </>
                  )}
                </span>
              </div>
              <MeasureChart
                measures={measures}
                unit={unit}
                heightUnit={heightUnit}
              />
              <div class="measure-detail-grid">
                <div>
                  <span>Altura</span>
                  <strong>{displayLength(currentMeasure.height)}</strong>
                </div>
                <div>
                  <span>Género</span>
                  <strong>
                    {currentMeasure.gender
                      ? currentMeasure.gender.replaceAll("-", " ")
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>IMC estimado</span>
                  <strong>
                    {bmi
                      ? bmi.toLocaleString(intlLocale(), {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Grasa</span>
                  <strong>{formatCompositionMeasure(currentMeasure, "bodyFat", unit)}</strong>
                </div>
                <div>
                  <span>Agua</span>
                  <strong>{formatCompositionMeasure(currentMeasure, "water", unit)}</strong>
                </div>
                <div>
                  <span>Músculo</span>
                  <strong>{formatCompositionMeasure(currentMeasure, "muscleMass", unit)}</strong>
                </div>
                <div>
                  <span>Masa ósea</span>
                  <strong>{formatCompositionMeasure(currentMeasure, "boneMass", unit)}</strong>
                </div>
                <div>
                  <span>Cintura</span>
                  <strong>{displayLength(currentMeasure.waist)}</strong>
                </div>
                <div>
                  <span>Pecho</span>
                  <strong>{displayLength(currentMeasure.chest)}</strong>
                </div>
              </div>
              <div class="measure-history">
                {recentMeasures.map((measure) => (
                  <div key={measure.id}>
                    <span>{dateLabel(measure.date)}</span>
                    <span>
                      {kgToUnit(measure.weight, unit).toLocaleString(
                        intlLocale(),
                        { minimumFractionDigits: 1, maximumFractionDigits: 1 },
                      )}{" "}
                      {unit}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div class="measure-empty">
              <span>
                Registra peso, altura y género para empezar; la composición es
                opcional.
              </span>
              <Button variant="quiet" onClick={onAddMeasure}>
                <Icon name="plus" size={14} /> Añadir primera medida
              </Button>
            </div>
          )}
        </div>
      </section>
      <section class="panel category-balance-panel">
        <CategoryBalance workouts={workouts} exercises={exercises} />
      </section>
      <section class="panel profile-muscles">
        <SectionHeading
          eyebrow="DISTRIBUCIÓN DEL ENTRENAMIENTO"
          title="Así repartes tu trabajo"
          action={<span class="muted-label">Últimos 30 días</span>}
        />
        <MuscleInsights
          items={monthMuscles}
          className="profile-muscle-insights"
        />
      </section>
      <section class="profile-columns profile-bottom">
        <div class="panel bests-panel">
          <SectionHeading
            eyebrow="PROGRESO"
            title="Ejercicios favoritos"
            action={<span class="muted-label">Más practicados</span>}
          />
          {personalBests.length ? (
            <div class="bests-list">
              {personalBests.map(({ exercise, stats }, index) => {
                const record = stats.value("weight");
                return (
                  <div class="best-row" key={exercise.id}>
                    <span class="best-rank">0{index + 1}</span>
                    <div class="best-name">
                      <strong>{exercise.name}</strong>
                      <span>{stats.sessions} sesiones registradas</span>
                    </div>
                    <div class="best-record">
                      <strong>
                        {unit === "lb"
                          ? Math.round(record.weight * 2.20462)
                          : record.weight}{" "}
                        {unit}
                      </strong>
                      <span>mejor peso</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div class="bests-empty">
              Tus mejores marcas aparecerán aquí después de guardar una sesión.
            </div>
          )}
        </div>
        <div class="panel settings-panel">
          <SectionHeading
            eyebrow="PERFIL Y PREFERENCIAS"
            title="Configuración"
          />
          <SettingsSectionLabel
            first
            label="TU PERFIL"
            description="Foto y nombre que identifican tu actividad en este dispositivo."
          />
          <div class="profile-settings-card">
            <div class="settings-avatar-wrap">
              <Avatar name={name} src={avatar} className="settings-avatar" />
              <button
                type="button"
                class="profile-avatar-upload"
                title={avatar ? "Cambiar foto" : "Añadir foto"}
                aria-label={avatar ? "Cambiar foto" : "Añadir foto"}
                onClick={() => avatarInput.current?.click()}
              >
                <Icon name="upload" size={15} />
              </button>
            </div>
            <input
              ref={avatarInput}
              class="visually-hidden"
              type="file"
              accept="image/*"
              aria-label="Subir foto de perfil"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onAvatarFile(file);
                event.currentTarget.value = "";
              }}
            />
            <div class="profile-settings-fields">
              <div class="profile-name-row">
                <label>
                  Nombre de usuario
                  <input
                    type="text"
                    maxlength="32"
                    value={name}
                    onInput={(event) => onName(event.currentTarget.value)}
                    placeholder="Usuario"
                  />
                </label>
                {avatar && (
                  <button
                    type="button"
                    class="profile-photo-delete icon-button danger"
                    title="Quitar foto"
                    aria-label="Quitar foto"
                    onClick={() => onAvatar(null)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
              <span class="setting-hint">
                La foto se guarda localmente y puedes cambiarla cuando quieras.
              </span>
            </div>
          </div>
          <SettingsSectionLabel
            label="INICIO"
            description="Elige qué secciones aparecen y cómo se ordenan."
          />
          <button
            type="button"
            class="dashboard-layout-profile-button"
            onClick={onManageDashboardLayout}
          >
            <span>
              <strong>Tarjetas del inicio</strong>
              <small>Mostrar, ocultar y ordenar secciones</small>
            </span>
            <Icon name="chevron" size={15} />
          </button>
          <SettingsSectionLabel
            label="UNIDADES"
            description="Ajusta cómo se muestran el peso y las medidas corporales."
          />
          <div class="unit-settings-row" aria-label="Unidades">
            <div class="unit-setting">
              <span class="setting-icon">
                <Icon name="scale" size={16} />
              </span>
              <strong>Peso</strong>
              <div class="segmented-control">
                <button
                  type="button"
                  class={unit === "kg" ? "active" : ""}
                  onClick={() => onUnit("kg")}
                >
                  kg
                </button>
                <button
                  type="button"
                  class={unit === "lb" ? "active" : ""}
                  onClick={() => onUnit("lb")}
                >
                  lb
                </button>
              </div>
            </div>
            <div class="unit-setting">
              <span class="setting-icon">
                <Icon name="scale" size={16} />
              </span>
              <strong>Altura</strong>
              <div class="segmented-control">
                <button
                  type="button"
                  class={heightUnit === "cm" ? "active" : ""}
                  onClick={() => onHeightUnit("cm")}
                >
                  cm
                </button>
                <button
                  type="button"
                  class={heightUnit === "in" ? "active" : ""}
                  onClick={() => onHeightUnit("in")}
                >
                  in
                </button>
              </div>
            </div>
          </div>
          <SettingsSectionLabel
            label="SEMANA Y CALENDARIO"
            description="Configura el primer día de la semana en los resúmenes y el calendario."
          />
          <label class="week-start-setting">
            <span>
              <strong>Primer día de la semana</strong>
              <small>
                Se aplica a «Esta semana» y a las columnas del calendario.
              </small>
            </span>
            <select
              value={weekStartsOn}
              onChange={(event) =>
                onWeekStartsOn(Number(event.currentTarget.value))
              }
              aria-label="Primer día de la semana"
            >
              {reminderWeekdays.map(({ day, name: weekday }) => {
                const localizedWeekday = translateText(weekday);
                return (
                  <option value={day} key={day}>
                    {localizedWeekday.charAt(0).toLocaleUpperCase(intlLocale())}
                    {localizedWeekday.slice(1)}
                  </option>
                );
              })}
            </select>
          </label>
          <SettingsSectionLabel
            label="OBJETIVOS DIARIOS"
            description="Las metas automáticas consideran edad, peso, altura y género; puedes ajustarlas manualmente."
          />
          <div class="manual-goals-control">
            <label>
              <input
                type="checkbox"
                checked={manualGoals}
                onChange={(event) => onManualGoals(event.currentTarget.checked)}
              />
              <span>Ajustar manualmente</span>
            </label>
            <small>
              {manualGoals
                ? translateText("Metas personalizadas por ti.")
                : calculatedGoals.usedGenericWeight
                  ? translateText(
                      "Sin pesajes, usamos 70 kg como referencia y metas generales.",
                    )
                  : calculatedGoals.usesAgeAdjustedFormula
                    ? `${translateText("Edad de referencia:")} ${calculatedGoals.referenceAge} ${translateText("años")}. ${translateText("Las metas usan edad, peso, altura y género.")}`
                    : calculatedGoals.referenceAge === null
                      ? translateText(
                          "Añade una fecha de nacimiento al pesaje para incluir la edad en las metas automáticas.",
                        )
                      : translateText(
                          "Añade la altura al pesaje para ajustar las metas automáticas con tu edad.",
                        )}
              {!manualGoals && calculatedGoals.usesAgeAdjustedFormula && (
                <> {translateText("El agua se estima con 1 mL por kcal de mantenimiento.")}</>
              )}
            </small>
          </div>
          {!manualGoals && (
            <label class="weight-goal-setting">
              <span>
                <strong>Objetivo de peso</strong>
                <small>La elección ajusta la meta calórica automática.</small>
              </span>
              <select
                value={weightGoal}
                onChange={(event) => onWeightGoal(event.currentTarget.value)}
                aria-label="Objetivo de peso"
              >
                {weightGoalOptions.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div class="daily-goals-settings" aria-label="Metas diarias">
            <div class="daily-goal-card">
              <div class="daily-goal-heading">
                <span class="setting-icon water-setting-icon">
                  <Icon name="water" size={16} />
                </span>
                <strong>Agua diaria</strong>
              </div>
              <label class="setting-number">
                <input
                  aria-label="Meta diaria de agua en mililitros"
                  type="number"
                  min="500"
                  max="7000"
                  step="50"
                  value={waterGoalDraft}
                  disabled={!manualGoals}
                  onInput={(event) =>
                    setWaterGoalDraft(event.currentTarget.value)
                  }
                  onBlur={() => {
                    const value = Number(waterGoalDraft);
                    if (value >= 500 && value <= 7000) onWaterGoal(value);
                    else setWaterGoalDraft(String(waterGoal));
                  }}
                />
                <small>mL</small>
              </label>
            </div>
            <div class="daily-goal-card">
              <div class="daily-goal-heading">
                <span class="setting-icon kcal-setting-icon">
                  <Icon name="flame" size={16} />
                </span>
                <strong>Consumo diario de calorías</strong>
              </div>
              <label class="setting-number">
                <input
                  aria-label="Meta diaria de consumo de calorías"
                  type="number"
                  min="500"
                  max="10000"
                  step="50"
                  value={kcalGoalDraft}
                  disabled={!manualGoals}
                  onInput={(event) =>
                    setKcalGoalDraft(event.currentTarget.value)
                  }
                  onBlur={() => {
                    const value = Number(kcalGoalDraft);
                    if (value >= 500 && value <= 10000) onKcalGoal(value);
                    else setKcalGoalDraft(String(kcalGoal));
                  }}
                />
                <small>kcal</small>
              </label>
            </div>
          </div>
          <section
            class="profile-reminders-section"
            aria-labelledby="profile-reminders-heading"
          >
            <div class="profile-reminders-heading">
              <div class="eyebrow">RECORDATORIOS</div>
              <strong id="profile-reminders-heading">Hidratación</strong>
              <small>Configura cuándo recibir avisos para beber agua.</small>
            </div>
            <div class="setting-row reminder-setting">
              <div class="setting-icon water-setting-icon">
                <Icon name="water" size={17} />
              </div>
              <div class="setting-copy">
                <strong>Recordatorios de agua</strong>
                <span>Notificaciones cada cierto tiempo</span>
              </div>
              <button
                type="button"
                class={waterReminder ? "toggle-switch active" : "toggle-switch"}
                role="switch"
                aria-checked={waterReminder}
                aria-label="Activar recordatorios de agua"
                onClick={() => onWaterReminder(!waterReminder)}
              >
                <i />
              </button>
            </div>
            {waterReminder && (
              <div class="reminder-preferences">
                <div class="reminder-interval-row">
                  <span class="reminder-interval-label">
                    <Icon name="clock" size={15} /> Recordarme cada
                  </span>
                  <select
                    value={reminderInterval}
                    onChange={(event) =>
                      onReminderInterval(Number(event.currentTarget.value))
                    }
                  >
                    {waterReminderIntervals.map((minutes) => (
                      <option value={minutes} key={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </div>
                <div class="reminder-exceptions">
                  <div class="reminder-exception-copy">
                    <strong>Excepciones</strong>
                    <span>Elige cuándo pausar los avisos</span>
                  </div>
                  <div
                    class="reminder-days-picker"
                    role="group"
                    aria-label="Días con recordatorios de agua"
                  >
                    {reminderWeekdays.map(({ day, name: weekday }) => {
                      const active = reminderDays.includes(day);
                      const weekdayName = translateText(weekday);
                      const reminderState = translateText(
                        active ? "recordatorio activado" : "sin recordatorio",
                      );
                      return (
                        <button
                          type="button"
                          key={day}
                          class={
                            active ? "reminder-day active" : "reminder-day"
                          }
                          aria-label={`${weekdayName}: ${reminderState}`}
                          aria-pressed={active}
                          disabled={active && reminderDays.length === 1}
                          onClick={() =>
                            onReminderDays(
                              active
                                ? reminderDays.filter((item) => item !== day)
                                : [...reminderDays, day],
                            )
                          }
                        >
                          {weekdayNarrowLabel(day)}
                        </button>
                      );
                    })}
                  </div>
                  <span class="reminder-days-caption">
                    Se avisará los días seleccionados
                  </span>
                  <div class="reminder-quiet-picker">
                    <span>No avisar entre</span>
                    <label>
                      <span class="visually-hidden">Inicio del descanso</span>
                      <input
                        type="time"
                        value={reminderQuietHours.start}
                        onChange={(event) =>
                          onReminderQuietHours({
                            ...reminderQuietHours,
                            start: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                    <span>y</span>
                    <label>
                      <span class="visually-hidden">Fin del descanso</span>
                      <input
                        type="time"
                        value={reminderQuietHours.end}
                        onChange={(event) =>
                          onReminderQuietHours({
                            ...reminderQuietHours,
                            end: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <span class="reminder-days-caption">
                    Durante este descanso no llegarán avisos; se reanudarán al
                    terminar. Puede cruzar la medianoche. Horas iguales
                    desactivan la pausa.
                  </span>
                </div>
              </div>
            )}
          </section>
          <section
            class="profile-reminders-section weigh-in-reminder-section"
            aria-labelledby="profile-weigh-reminder-heading"
          >
            <div class="profile-reminders-heading">
              <strong id="profile-weigh-reminder-heading">Pesaje diario</strong>
              <small>
                Un aviso diario te ayuda a mantener un historial constante.
              </small>
            </div>
            <div class="setting-row reminder-setting">
              <div class="setting-icon">
                <Icon name="scale" size={17} />
              </div>
              <div class="setting-copy">
                <strong>Recordarme hacer un pesaje</strong>
                <span>Notificación diaria a la hora elegida</span>
              </div>
              <button
                type="button"
                class={
                  weightReminder ? "toggle-switch active" : "toggle-switch"
                }
                role="switch"
                aria-checked={weightReminder}
                aria-label="Activar recordatorio diario de pesaje"
                onClick={() => onWeightReminder(!weightReminder)}
              >
                <i />
              </button>
            </div>
            {weightReminder && (
              <label class="weigh-reminder-time">
                <span>
                  <Icon name="clock" size={15} /> Hora del recordatorio
                </span>
                <input
                  type="time"
                  value={weightReminderTime}
                  onChange={(event) =>
                    onWeightReminderTime(event.currentTarget.value)
                  }
                />
              </label>
            )}
          </section>
          <section
            class="profile-reminders-section protein-reminder-section"
            aria-labelledby="profile-protein-reminder-heading"
          >
            <div class="profile-reminders-heading">
              <strong id="profile-protein-reminder-heading">Proteína</strong>
              <small>
                Recibe un aviso diario para acordarte de incluir proteína en tu alimentación.
              </small>
            </div>
            <div class="setting-row reminder-setting">
              <div class="setting-icon protein-setting-icon">
                <Icon name="shaker" size={17} />
              </div>
              <div class="setting-copy">
                <strong>Recordatorio de proteína</strong>
                <span>Notificación diaria a la hora elegida</span>
              </div>
              <button
                type="button"
                class={proteinReminder ? "toggle-switch active" : "toggle-switch"}
                role="switch"
                aria-checked={proteinReminder}
                aria-label="Activar recordatorio de proteína"
                onClick={() => onProteinReminder(!proteinReminder)}
              >
                <i />
              </button>
            </div>
            {proteinReminder && (
              <label class="weigh-reminder-time">
                <span>
                  <Icon name="clock" size={15} /> Hora del recordatorio
                </span>
                <input
                  type="time"
                  value={proteinReminderTime}
                  onChange={(event) =>
                    onProteinReminderTime(event.currentTarget.value)
                  }
                />
              </label>
            )}
          </section>
          <SettingsSectionLabel
            label="APARIENCIA"
            description="Personaliza los colores y el modo claro u oscuro."
          />
          <div class="palette-preference">
            <div>
              <strong>Paleta de color</strong>
              <span>Personaliza el aspecto de la app</span>
            </div>
            <div
              class="palette-options"
              role="group"
              aria-label="Paleta de color"
            >
              {palettes.map((item) => (
                <button
                  type="button"
                  class={
                    palette === item.id
                      ? "palette-choice active"
                      : "palette-choice"
                  }
                  aria-pressed={palette === item.id}
                  onClick={() => onPalette(item.id)}
                  key={item.id}
                  title={item.name}
                >
                  <i
                    style={{
                      backgroundColor: item.color,
                      "--swatch": item.color,
                    }}
                  />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div class="theme-preference">
            <div>
              <strong>Tema</strong>
              <span>Claro, oscuro o según el dispositivo</span>
            </div>
            <div
              class="theme-options"
              role="group"
              aria-label="Tema de la aplicación"
            >
              {themeOptions.map((option) => (
                <button
                  type="button"
                  class={theme === option.id ? "active" : ""}
                  aria-pressed={theme === option.id}
                  onClick={() => onTheme(option.id)}
                  key={option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <SettingsSectionLabel
            label="IDIOMA Y REGIÓN"
            description="Elige un idioma o sigue el idioma del dispositivo."
          />
          <label class="week-start-setting language-preference">
            <span>
              <strong>Idioma de la aplicación</strong>
              <small>El cambio se aplica a toda la interfaz.</small>
            </span>
            <select
              value={language}
              onChange={(event) => onLanguage(event.currentTarget.value)}
              aria-label="Idioma de la aplicación"
            >
              <option value="system">Sistema</option>
              <option value="es" translate="no">Español</option>
              <option value="ca" translate="no">Català</option>
              <option value="en" translate="no">English</option>
              <option value="fr" translate="no">Français</option>
              <option value="de" translate="no">Deutsch</option>
              <option value="it" translate="no">Italiano</option>
              <option value="pt" translate="no">Português</option>
            </select>
          </label>
          <SettingsSectionLabel
            label="SONIDO"
            description="Activa o silencia las señales al completar ejercicios y sesiones."
          />
          <div class="sound-preference">
            <div class="sound-preference-copy">
              <strong>Silenciar sonidos de entrenamiento</strong>
              <small>Indicaciones al completar ejercicios y sesiones</small>
            </div>
            <label class="sound-mute-control">
              <input
                type="checkbox"
                checked={soundsMuted}
                onChange={(event) => onSoundsMuted(event.currentTarget.checked)}
              />
              <span class="visually-hidden">
                Silenciar sonidos de entrenamiento
              </span>
            </label>
          </div>
          <SettingsSectionLabel
            label="DATOS Y PRIVACIDAD"
            description="Gestiona las copias de seguridad y el almacenamiento local de tus fotos."
          />
          <div class="progress-photo-settings">
            <label class="progress-photo-highres">
              <input
                type="checkbox"
                checked={highResolutionProgressPhotos}
                onChange={(event) =>
                  onHighResolutionProgressPhotos(event.currentTarget.checked)
                }
              />
              <span>
                <strong>Usar fotos de alta resolución</strong>
                <small>
                  La resolución estándar ahorra espacio; la alta resolución ocupa más.
                </small>
              </span>
            </label>
          </div>
          <div class="data-management">
            <div>
              <strong>Copia de seguridad</strong>
              <span>
                Exporta e importa sesiones, rutinas, ejercicios, pesajes,
                consumo y medios.
              </span>
            </div>
            <ExportMenu
              className="button button-quiet"
              hideCaret
              onSave={() => onExportData("device")}
              onShare={() => onExportData("share")}
            />
            <input
              ref={backupInput}
              class="visually-hidden"
              type="file"
              accept=".msgpack,.mpk,.bin,.json,application/msgpack,application/octet-stream,application/json,*/*"
              aria-label="Importar datos"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onImportFile(file, "backup");
                event.currentTarget.value = "";
              }}
            />
            <Button
              variant="quiet"
              type="button"
              title="Importar datos, sesiones o una copia de seguridad"
              onClick={() => backupInput.current?.click()}
            >
              <Icon name="upload" size={14} /> Importar
            </Button>
          </div>
          <button
            type="button"
            class="delete-data-action profile-data-card"
            onClick={onDeleteWorkouts}
          >
            <span class="delete-data-icon">
              <Icon name="trash" size={16} />
            </span>
            <span>
              <strong>Borrar entrenamientos</strong>
              <small>Por día o por un rango de fechas</small>
            </span>
            <Icon name="chevron" size={15} className="delete-data-chevron" />
          </button>
          <a
            class="online-routine-card profile-data-card"
            href="https://loxewyx.github.io/ProFit/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Crea y comparte tus rutinas online"
          >
            <span class="online-routine-icon">
              <Icon name="globe" size={17} />
            </span>
            <span class="online-routine-copy">
              <strong>Crea y comparte tus rutinas online</strong>
              <small>
                Diseña rutinas desde la web y comparte un enlace para abrirlas en ProFit.
              </small>
            </span>
            <Icon name="external" size={15} className="online-routine-open" />
          </a>
          <div class="local-note profile-data-card">
            <span class="local-lock">⌑</span>
            <div>
              <strong>Tus datos son tuyos</strong>
              <span>
                Sin cuentas, sin servidores; los datos permanecen en el
                dispositivo.
              </span>
            </div>
            <span class="local-status">LOCAL</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivityCalendar({ workouts, onWorkoutOpen, unit, weekStartsOn = 1 }) {
  const [month, setDisplayedMonth] = useState(() => {
    const date = today();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today()));
  const monthYear = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDayOffset =
    (new Date(monthYear, monthIndex, 1).getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(monthYear, monthIndex + 1, 0).getDate();
  const gridLength = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: gridLength }, (_, index) => {
    const day = index - firstDayOffset + 1;
    return day > 0 && day <= daysInMonth
      ? dateKey(new Date(monthYear, monthIndex, day))
      : null;
  });
  const monthWorkouts = workouts.filter((workout) =>
    workout.date.startsWith(
      `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}-`,
    ),
  );
  const dailyWorkouts = new Map();
  monthWorkouts.forEach((workout) =>
    dailyWorkouts.set(workout.date, [
      ...(dailyWorkouts.get(workout.date) || []),
      workout,
    ]),
  );
  const activeDays = dailyWorkouts.size;
  const monthSets = monthWorkouts.reduce(
    (count, workout) =>
      count +
      workout.exercises.reduce(
        (sets, exercise) => sets + exercise.sets.length,
        0,
      ),
    0,
  );
  const monthVolume = monthWorkouts.reduce(
    (volume, workout) =>
      volume +
      workout.exercises.reduce(
        (sum, exercise) =>
          sum +
          (exercise.trackWeight === false
            ? 0
            : exercise.sets.reduce(
                (subtotal, set) => subtotal + set.weight * set.reps,
                0,
              )),
        0,
      ),
    0,
  );
  const selectedWorkouts = dailyWorkouts.get(selectedDate) || [];
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
  const currentMonth = today();
  const canMoveForward =
    monthYear < currentMonth.getFullYear() ||
    (monthYear === currentMonth.getFullYear() &&
      monthIndex < currentMonth.getMonth());
  const monthLabel = new Intl.DateTimeFormat(intlLocale(), {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    weekdayNarrowLabel((weekStartsOn + index) % 7),
  );
  const moveMonth = (offset) => {
    const nextMonth = new Date(monthYear, monthIndex + offset, 1);
    setMonthState(nextMonth);
  };
  const setMonthState = (nextMonth) => {
    setDisplayedMonth(nextMonth);
    setSelectedDate(dateKey(nextMonth));
  };
  const goToToday = () => {
    const date = today();
    setMonthState(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedDate(dateKey(date));
  };
  const selectedSets = selectedWorkouts.reduce(
    (count, workout) =>
      count +
      workout.exercises.reduce(
        (sets, exercise) => sets + exercise.sets.length,
        0,
      ),
    0,
  );
  const selectedVolume = selectedWorkouts.reduce(
    (volume, workout) =>
      volume +
      workout.exercises.reduce(
        (sum, exercise) =>
          sum +
          (exercise.trackWeight === false
            ? 0
            : exercise.sets.reduce(
                (subtotal, set) => subtotal + set.weight * set.reps,
                0,
              )),
        0,
      ),
    0,
  );
  const volumeLabel = (volume) =>
    `${Math.round(unit === "lb" ? volume * 2.20462 : volume).toLocaleString(intlLocale())} ${unit}`;
  return (
    <div class="activity-calendar">
      <div class="calendar-month-toolbar">
        <div class="calendar-month-nav">
          <button
            type="button"
            class="calendar-nav-button"
            onClick={() => moveMonth(-1)}
            aria-label="Mes anterior"
          >
            <Icon name="chevron" size={16} className="calendar-chevron-back" />
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            class="calendar-nav-button"
            onClick={() => moveMonth(1)}
            disabled={!canMoveForward}
            aria-label="Mes siguiente"
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>
        {(monthYear !== currentMonth.getFullYear() ||
          monthIndex !== currentMonth.getMonth()) && (
          <button
            type="button"
            class="calendar-today-button"
            onClick={goToToday}
          >
            Hoy
          </button>
        )}
      </div>
      <div class="calendar-month-summary">
        <strong>{monthWorkouts.length}</strong>{" "}
        {monthWorkouts.length === 1 ? "sesión" : "sesiones"} <i />{" "}
        <strong>{activeDays}</strong>{" "}
        {activeDays === 1 ? "día activo" : "días activos"} <i />{" "}
        <strong>{monthSets}</strong> series <i />{" "}
        <strong>{volumeLabel(monthVolume)}</strong>
      </div>
      <div class="calendar-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div class="calendar-days">
        {cells.map((date, index) => {
          if (!date)
            return (
              <span
                class="calendar-day calendar-day-empty"
                key={`blank-${index}`}
                aria-hidden="true"
              />
            );
          const count = dailyWorkouts.get(date)?.length || 0;
          const isFuture = date > dateKey(currentMonth);
          const intensity = count ? Math.min(count, 4) : 0;
          return (
            <button
              type="button"
              class={`calendar-day ${count ? `trained intensity-${intensity}` : ""} ${date === dateKey(currentMonth) ? "today" : ""} ${date === selectedDate ? "selected" : ""}`}
              key={date}
              onClick={() => setSelectedDate(date)}
              disabled={isFuture}
              aria-pressed={date === selectedDate}
              aria-label={`${dateLabel(date, { day: "numeric", month: "long", year: "numeric" })}${count ? `, ${count} ${count === 1 ? "entrenamiento" : "entrenamientos"}` : ", sin entrenamientos"}`}
              title={`${dateLabel(date, { day: "numeric", month: "long" })}${count ? ` · ${count} ${count === 1 ? "sesión" : "sesiones"}` : ""}`}
            >
              <span>{Number(date.slice(-2))}</span>
              {count > 0 && <i />}
            </button>
          );
        })}
      </div>
      <div class="calendar-day-detail">
        <div class="calendar-detail-heading">
          <div>
            <span class="eyebrow">DÍA SELECCIONADO</span>
            <strong>
              {new Intl.DateTimeFormat(intlLocale(), {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(selectedDateObject)}
            </strong>
          </div>
          {selectedWorkouts.length > 0 && (
            <span class="calendar-detail-kpis">
              {selectedWorkouts.length}{" "}
              {selectedWorkouts.length === 1 ? "sesión" : "sesiones"} ·{" "}
              {selectedSets} series · {volumeLabel(selectedVolume)}
            </span>
          )}
        </div>
        {selectedWorkouts.length ? (
          <div class="calendar-session-list">
            {selectedWorkouts.map((workout) => (
              <button
                type="button"
                class="calendar-session"
                key={workout.id}
                onClick={() => onWorkoutOpen(workout)}
              >
                <span class="calendar-session-icon">
                  <Icon name="dumbbell" size={15} />
                </span>
                <span class="calendar-session-copy">
                  <strong>
                    <span translate="no">{workout.name}</span>
                  </strong>
                  <small>
                    {workout.exercises.length}{" "}
                    {workout.exercises.length === 1
                      ? "ejercicio"
                      : "ejercicios"}{" "}
                    ·{" "}
                    {workout.exercises.reduce(
                      (count, exercise) => count + exercise.sets.length,
                      0,
                    )}{" "}
                    series
                  </small>
                </span>
                <span class="calendar-session-duration">
                  {workout.duration} min
                </span>
                <Icon name="chevron" size={14} />
              </button>
            ))}
          </div>
        ) : (
          <div class="calendar-no-session">
            <Icon name="calendar" size={15} /> Sin sesiones registradas este
            día.
          </div>
        )}
      </div>
    </div>
  );
}

const categoryRanges = [
  { days: 30, label: "30 días" },
  { days: 90, label: "3 meses" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 año" },
  { days: 0, label: "Siempre" },
];

function CategoryBalance({ workouts, exercises }) {
  const [period, setPeriod] = useState(90);
  const [muscleVisibility, setMuscleVisibility] = useState(() => {
    const saved = loadJson("profit-muscle-chart-visibility", null);
    if (saved && typeof saved === "object" && !Array.isArray(saved))
      return saved;
    try {
      if (localStorage.getItem("profit-muscle-chart-hidden") !== null) {
        const legacyHidden = loadJson("profit-muscle-chart-hidden", []);
        const hiddenKeys = Array.isArray(legacyHidden) ? legacyHidden : [];
        return {
          __legacyAllVisible: true,
          ...Object.fromEntries(hiddenKeys.map((key) => [key, false])),
        };
      }
    } catch {}
    return {};
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const muscleStats = useMemo(() => {
    const from = period ? dayOffset(period - 1) : "0000-00-00";
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const labels = new Map();
    const counts = new Map();
    const addMuscle = (value) => {
      const name = String(value || "")
        .trim()
        .replace(/\s+/g, " ");
      const key = normalizeSearchText(name);
      if (key && !labels.has(key)) labels.set(key, name);
      if (key && !counts.has(key)) counts.set(key, 0);
      return key;
    };
    const standardMuscles = [
      "Pecho",
      "Espalda",
      "Piernas",
      "Glúteos",
      "Hombros",
      "Bíceps",
      "Tríceps",
      "Antebrazo",
      "Abdominales",
      "Isquiotibiales",
      "Cuádriceps",
      "Pantorrillas",
      "Cuello",
    ];
    [
      ...standardMuscles,
      ...loadSecondaryMuscles(),
      ...exercises.flatMap((exercise) => [
        exercise.muscle,
        ...(exercise.secondary || []),
      ]),
    ].forEach(addMuscle);
    workouts
      .filter((workout) => workout.date >= from && workout.date <= dayOffset(0))
      .forEach((workout) =>
        workout.exercises.forEach((entry) => {
          if (!entry.sets?.length && !entry.activityComplete) return;
          const definition = byId.get(entry.id);
          const main = entry.muscle || definition?.muscle;
          const secondary = Array.isArray(entry.secondary)
            ? entry.secondary
            : definition?.secondary || [];
          [
            ...new Set([main, ...secondary].map(addMuscle).filter(Boolean)),
          ].forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));
        }),
      );
    const items = [...labels.entries()]
      .map(([key, name]) => {
        let hash = 0;
        for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
        return {
          key,
          name,
          count: counts.get(key) || 0,
          color: [
            "#b9dc74",
            "#64c9cf",
            "#ff9a77",
            "#bda5ff",
            "#ffb565",
            "#ff91aa",
            "#82aaff",
            "#80d19b",
            "#e5cf72",
            "#da91d1",
          ][(hash >>> 0) % 10],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    const visibleItems = items.filter((item) => {
      if (typeof muscleVisibility[item.key] === "boolean")
        return muscleVisibility[item.key];
      return muscleVisibility.__legacyAllVisible === true || item.count > 0;
    });
    const activeItems = visibleItems.filter((item) => item.count > 0);
    const total = activeItems.reduce((sum, item) => sum + item.count, 0);
    const allTotal = items.reduce((sum, item) => sum + item.count, 0);
    const max = Math.max(...visibleItems.map((item) => item.count), 1);
    const strongest =
      [...activeItems].sort((a, b) => b.count - a.count)[0] || null;
    const weakest =
      activeItems.length > 1
        ? [...activeItems].sort((a, b) => a.count - b.count)[0]
        : null;
    return {
      items,
      visibleItems,
      activeItems,
      total,
      allTotal,
      max,
      strongest,
      weakest,
    };
  }, [workouts, exercises, period, muscleVisibility]);
  const selectedRange = categoryRanges.find((range) => range.days === period);
  const periodLabel = selectedRange?.days
    ? `${translateText("últimos")} ${translateText(selectedRange.label)}`
    : translateText("todo el historial");
  const toggleMuscle = (key) => {
    const currentlyVisible = muscleStats.visibleItems.some(
      (item) => item.key === key,
    );
    const next = { ...muscleVisibility, [key]: !currentlyVisible };
    localStorage.setItem(
      "profit-muscle-chart-visibility",
      JSON.stringify(next),
    );
    setMuscleVisibility(next);
  };
  return (
    <>
      <SectionHeading
        eyebrow="BALANCE MUSCULAR"
        title="Puntos fuertes y por reforzar"
        action={
          <button
            type="button"
            class="measure-settings-toggle muscle-chart-settings-toggle"
            aria-label="Mostrar u ocultar músculos"
            title="Mostrar u ocultar músculos"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Icon name="settings" size={15} />
          </button>
        }
      />
      <div class="category-balance-toolbar">
        <p>
          Compara los grupos musculares que aparecen en tus ejercicios
          completados de {periodLabel}.
        </p>
        <div
          class="category-range-options"
          role="group"
          aria-label="Período de la gráfica"
        >
          {categoryRanges.map((range) => (
            <button
              type="button"
              class={period === range.days ? "active" : ""}
              aria-pressed={period === range.days}
              key={range.days}
              onClick={() => setPeriod(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
      {settingsOpen && (
        <div class="measure-chart-settings">
          <div class="measure-chart-settings-heading">
            <strong>Músculos visibles</strong>
            <span>Elige qué grupos aparecen en el radar</span>
          </div>
          <div class="measure-series-options">
            {muscleStats.items.map((item) => {
              const shown = muscleStats.visibleItems.some(
                (visible) => visible.key === item.key,
              );
              return (
                <button
                  type="button"
                  class={
                    shown
                      ? "measure-series-toggle active"
                      : "measure-series-toggle"
                  }
                  aria-pressed={shown}
                  onClick={() => toggleMuscle(item.key)}
                  key={item.key}
                >
                  <i
                    style={{
                      "--series-color": item.color,
                      background: item.color,
                    }}
                  />
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {muscleStats.total ? (
        <>
          <div class="category-insight-cards">
            <div class="category-insight strongest">
              <span>
                <Icon name="trend" size={14} /> MÁS TRABAJADO
              </span>
              <strong>{muscleStats.strongest?.name || "—"}</strong>
              <small>
                {muscleStats.strongest?.count || 0} estímulos en {periodLabel}
              </small>
            </div>
            {muscleStats.weakest ? (
              <div class="category-insight weakest">
                <span>
                  <Icon name="arrow" size={14} /> MENOS PRESENTE
                </span>
                <strong>{muscleStats.weakest.name}</strong>
                <small>
                  {muscleStats.weakest.count} estímulos en {periodLabel}
                </small>
              </div>
            ) : (
              <div class="category-insight balanced-insight">
                <span>
                  <Icon name="check" size={14} /> SIGUE AMPLIANDO
                </span>
                <strong>Buen comienzo</strong>
                <small>
                  Entrena otro grupo para poder comparar tu reparto.
                </small>
              </div>
            )}
          </div>
          {muscleStats.visibleItems.length ? (
            <div class="category-radar-wrap">
              <svg
                class="category-radar"
                viewBox="0 0 360 292"
                role="img"
                aria-label={`Radar de músculos: ${muscleStats.total} registros en ${muscleStats.visibleItems.length} grupos musculares visibles.`}
              >
                {[0.25, 0.5, 0.75, 1].map((scale) => (
                  <polygon
                    key={scale}
                    points={muscleStats.visibleItems
                      .map((_, index) => {
                        const angle =
                          ((-90 +
                            (index * 360) / muscleStats.visibleItems.length) *
                            Math.PI) /
                          180;
                        return `${180 + Math.cos(angle) * 84 * scale},${146 + Math.sin(angle) * 84 * scale}`;
                      })
                      .join(" ")}
                    class="radar-grid"
                  />
                ))}
                {muscleStats.visibleItems.map((item, index) => {
                  const angle =
                    ((-90 + (index * 360) / muscleStats.visibleItems.length) *
                      Math.PI) /
                    180;
                  return (
                    <line
                      key={item.key}
                      x1="180"
                      y1="146"
                      x2={180 + Math.cos(angle) * 84}
                      y2={146 + Math.sin(angle) * 84}
                      class="radar-axis"
                    />
                  );
                })}
                {[0.25, 0.5, 0.75, 1].map((scale) => (
                  <text
                    key={`scale-${scale}`}
                    x="184"
                    y={146 - 84 * scale + 4}
                    class="radar-scale-label"
                  >
                    {Math.round(scale * muscleStats.max)}
                  </text>
                ))}
                <polygon
                  points={muscleStats.visibleItems
                    .map((item, index) => {
                      const angle =
                        ((-90 +
                          (index * 360) / muscleStats.visibleItems.length) *
                          Math.PI) /
                        180;
                      const radius = 84 * (item.count / muscleStats.max);
                      return `${180 + Math.cos(angle) * radius},${146 + Math.sin(angle) * radius}`;
                    })
                    .join(" ")}
                  class="radar-data-area"
                />
                {muscleStats.visibleItems.map((item, index) => {
                  const angle =
                    ((-90 + (index * 360) / muscleStats.visibleItems.length) *
                      Math.PI) /
                    180;
                  const radius = 84 * (item.count / muscleStats.max);
                  const x = 180 + Math.cos(angle) * radius;
                  const y = 146 + Math.sin(angle) * radius;
                  const lx = 180 + Math.cos(angle) * 116;
                  const ly = 146 + Math.sin(angle) * 116;
                  const label =
                    item.name.length > 11
                      ? `${item.name.slice(0, 10)}…`
                      : item.name;
                  return (
                    <g key={item.key}>
                      <circle
                        cx={x}
                        cy={y}
                        r="4"
                        class="radar-point"
                        style={{ fill: item.color }}
                      />
                      <text
                        x={lx}
                        y={ly}
                        text-anchor={
                          Math.abs(lx - 180) < 12
                            ? "middle"
                            : lx < 180
                              ? "end"
                              : "start"
                        }
                        dominant-baseline="middle"
                        class="radar-label"
                      >
                        <title>{item.name}</title>
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div class="category-radar-key">
                {muscleStats.visibleItems.map((item) => (
                  <div class="category-radar-key-item" key={item.key}>
                    <i style={{ background: item.color }} />
                    <span>
                      {item.name}
                      <small>
                        {muscleStats.total
                          ? Math.round((item.count / muscleStats.total) * 100)
                          : 0}
                        % del reparto
                      </small>
                    </span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div class="category-balance-empty">
              <span class="category-empty-icon">
                <Icon name="settings" size={18} />
              </span>
              <div>
                <strong>No hay músculos visibles</strong>
                <span>
                  Abre «Músculos» y activa al menos un grupo para mostrar el
                  radar.
                </span>
              </div>
            </div>
          )}
          <div class="category-chart-legend">
            <span>
              <i class="legend-strong" /> Más registros, más trabajo acumulado
            </span>
            <span>
              <i class="legend-weak" /> Cada músculo se cuenta por ejercicio
              completado
            </span>
          </div>
        </>
      ) : (
        <div class="category-balance-empty">
          <span class="category-empty-icon">
            <Icon
              name={muscleStats.allTotal ? "settings" : "trend"}
              size={18}
            />
          </span>
          <div>
            <strong>
              {muscleStats.allTotal
                ? "No hay músculos visibles"
                : "Aún no hay ejercicios en este período"}
            </strong>
            <span>
              {muscleStats.allTotal
                ? "Abre «Músculos» y activa algún grupo para mostrarlo en el radar."
                : "Al guardar sesiones, verás qué músculos trabajas más y cuáles podrías incluir."}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function MeasurePhotoAsset({
  assetId,
  photoUri,
  alt,
  className = "",
  onMissing,
  onClick,
  interactive = false,
}) {
  const [source, setSource] = useState("");
  const [sourceRevision, setSourceRevision] = useState(0);
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible")
        setSourceRevision((revision) => revision + 1);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, []);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSource("");
    if (photoUri && Capacitor.getPlatform() === "android") {
      ProgressPhotos.readPhoto({ uri: photoUri })
        .then(({ data, mimeType }) => {
          if (!active || !data) return;
          setSource(`data:${mimeType || "image/jpeg"};base64,${data}`);
        })
        .catch(() => {
          if (!active) return;
          ProgressPhotos.photoExists({ uri: photoUri })
            .then(({ exists }) => {
              if (active && !exists) onMissingRef.current?.();
            })
            .catch(() => {});
        });
    } else if (assetId) {
      getExerciseAsset(assetId)
        .then((blob) => {
          if (!active || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setSource(objectUrl);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, photoUri, sourceRevision]);
  return source ? (
    <img
      className={`${className}${interactive ? " measure-photo-expandable" : ""}`}
      src={source}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.(event);
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${alt}. ${translateText("Ampliar foto")}` : undefined}
    />
  ) : (
    <div className={`${className} measure-photo-loading`} aria-label={alt}>
      <Icon name="image" size={22} />
    </div>
  );
}

function MeasurePhotoDatePickerModal({
  photos,
  selectedDate,
  weekStartsOn,
  onSelectDate,
  onClose,
  title = "Elegir fecha de las fotos",
  hint = "Selecciona un día marcado para ver sus fotos.",
  itemLabel = "Fotos",
  className = "measure-photo-date-modal",
}) {
  const [month, setMonth] = useState(() => {
    const latestDate = photos.reduce(
      (latest, record) => (record.date > latest ? record.date : latest),
      "",
    );
    const source = selectedDate || latestDate || dateKey(today());
    const date = new Date(`${source}T12:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  });
  const photosByDate = new Map();
  photos.forEach((photo) =>
    photosByDate.set(photo.date, (photosByDate.get(photo.date) || 0) + 1),
  );
  const offset =
    (month.getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    weekdayNarrowLabel((weekStartsOn + index) % 7),
  );
  return (
    <Modal
      title={translateText(title)}
      onClose={onClose}
      className={className}
    >
      <div className="measure-photo-date-picker">
        <div className="measure-photo-month-nav">
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              setMonth((value) =>
                new Date(value.getFullYear(), value.getMonth() - 1, 1, 12),
              )
            }
            aria-label={translateText("Mes anterior")}
          >
            <Icon name="chevron" size={16} className="calendar-chevron-back" />
          </button>
          <strong>
            {month.toLocaleDateString(intlLocale(), {
              month: "long",
              year: "numeric",
            })}
          </strong>
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              setMonth((value) =>
                new Date(value.getFullYear(), value.getMonth() + 1, 1, 12),
              )
            }
            aria-label={translateText("Mes siguiente")}
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <div className="measure-photo-calendar-grid" role="grid">
          {weekdayLabels.map((label, index) => (
            <span className="measure-photo-weekday" key={`weekday-${index}`}>
              {label}
            </span>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <span
              className="measure-photo-calendar-blank"
              key={`blank-${index}`}
              aria-hidden="true"
            />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1;
            const key = dateKey(
              new Date(month.getFullYear(), month.getMonth(), day, 12),
            );
            const count = photosByDate.get(key) || 0;
            return (
              <button
                type="button"
                role="gridcell"
                className={`measure-photo-calendar-day ${count ? "has-photos" : ""} ${key === selectedDate ? "selected" : ""}`}
                key={key}
                disabled={!count}
                aria-label={`${dateLabel(key, { day: "numeric", month: "long", year: "numeric" })}${count ? `, ${count} ${translateText(itemLabel)}` : ""}`}
                aria-pressed={key === selectedDate}
                onClick={() => onSelectDate(key)}
              >
                <span>{day}</span>
                {count > 1 && <small>{count}</small>}
                {count === 1 && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <p className="measure-photo-date-hint">
          {translateText(hint)}
        </p>
      </div>
    </Modal>
  );
}

function MeasurePhotoProgressModal({
  measures,
  initialPhotoId = "",
  unit,
  heightUnit = "cm",
  weekStartsOn = 1,
  onClose,
  onAddMeasure,
  onEditMeasure,
  onDeletePhoto,
  onMissingPhoto,
}) {
  const photos = measures
    .filter((measure) => measure.photoUri || measure.photoAssetId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = photos.at(-1);
  const initialPhoto = photos.find((photo) => photo.id === initialPhotoId);
  const [selectedDate, setSelectedDate] = useState(initialPhoto?.date || latest?.date || "");
  const [selectedId, setSelectedId] = useState(() => {
    if (initialPhoto) return initialPhoto.id;
    const matches = photos.filter((photo) => photo.date === latest?.date);
    return matches.length === 1 ? matches[0].id : "";
  });
  useEffect(() => {
    if (!selectedId || photos.some((photo) => photo.id === selectedId)) return;
    const next = photos.find((photo) => photo.date === selectedDate) || photos.at(-1);
    setSelectedId(next?.id || "");
    setSelectedDate(next?.date || "");
  }, [photos, selectedDate, selectedId]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState(null);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const swipeStart = useRef(null);
  useEffect(() => {
    if (!photoExpanded) return;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPhotoExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [photoExpanded]);
  const photoDeletePrompt = useMemo(
    () => ({
      title: translateText("Eliminar foto de progreso"),
      message: translateText(
        "La foto se eliminará y no se podrá recuperar. Solo se eliminará la foto; los datos del pesaje se conservarán.",
      ),
      confirmLabel: translateText("Eliminar foto"),
    }),
    [],
  );
  const photosOnDate = photos.filter((photo) => photo.date === selectedDate);
  const selectedIndex = photos.findIndex((photo) => photo.id === selectedId);
  const selectedPhoto = selectedIndex >= 0 ? photos[selectedIndex] : null;
  const selectedMetrics = selectedPhoto
    ? [
        selectedPhoto.bodyFat != null && [translateText("Grasa corporal"), formatCompositionMeasure(selectedPhoto, "bodyFat", unit)],
        selectedPhoto.muscleMass != null && [translateText("Masa muscular"), formatCompositionMeasure(selectedPhoto, "muscleMass", unit)],
        selectedPhoto.boneMass != null && [translateText("Masa ósea"), formatCompositionMeasure(selectedPhoto, "boneMass", unit)],
        selectedPhoto.water != null && [translateText("Agua corporal"), formatCompositionMeasure(selectedPhoto, "water", unit)],
        selectedPhoto.height != null && [translateText("Altura"), `${(heightUnit === "in" ? cmToIn(selectedPhoto.height) : selectedPhoto.height).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${heightUnit}`],
        selectedPhoto.waist != null && [translateText("Cintura"), `${(heightUnit === "in" ? cmToIn(selectedPhoto.waist) : selectedPhoto.waist).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${heightUnit}`],
        selectedPhoto.chest != null && [translateText("Pecho"), `${(heightUnit === "in" ? cmToIn(selectedPhoto.chest) : selectedPhoto.chest).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${heightUnit}`],
      ].filter(Boolean)
    : [];
  const changePhoto = (direction) => {
    if (!photos.length) return;
    const nextIndex =
      (Math.max(selectedIndex, 0) + direction + photos.length) % photos.length;
    const next = photos[nextIndex];
    setSelectedId(next.id);
    setSelectedDate(next.date);
  };
  const chooseDate = (date) => {
    const matches = photos.filter((photo) => photo.date === date);
    setSelectedDate(date);
    setSelectedId(matches.length === 1 ? matches[0].id : "");
    setDatePickerOpen(false);
  };
  const confirmDeletePhoto = async () => {
    const target = photoToDelete;
    if (!target) return;
    const deleted = await onDeletePhoto(target);
    if (deleted === false) return;
    const index = photos.findIndex((photo) => photo.id === target.id);
    const remaining = photos.filter((photo) => photo.id !== target.id);
    setPhotoToDelete(null);
    if (!remaining.length) {
      setSelectedId("");
      setSelectedDate("");
      return;
    }
    const next = remaining[Math.min(Math.max(index - 1, 0), remaining.length - 1)];
    setSelectedId(next.id);
    setSelectedDate(next.date);
  };
  return (
    <>
      <Modal
        title="Fotos de progreso"
        onClose={onClose}
        wide
        className="measure-photo-gallery-modal"
      >
        <div className="measure-photo-progress">
          <div className="measure-photo-gallery-heading">
            <div>
              <div className="eyebrow">
                {translateText("Evolución corporal").toLocaleUpperCase(intlLocale())}
              </div>
              <h2>{translateText("Fotos de progreso")}</h2>
            </div>
            <div className="measure-photo-toolbar">
              <Button
                type="button"
                variant="quiet"
                className="measure-photo-date-button"
                disabled={!photos.length}
                onClick={() => setDatePickerOpen(true)}
              >
                <Icon name="calendar" size={15} />
                {selectedDate
                  ? dateLabel(selectedDate, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : translateText("Elegir fecha")}
              </Button>
              {selectedPhoto && (
                <div className="measure-photo-toolbar-actions">
                  <span>
                    {selectedIndex + 1} / {photos.length}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onEditMeasure(selectedPhoto)}
                    aria-label={translateText("Editar detalles del pesaje")}
                    title={translateText("Editar detalles del pesaje")}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => setPhotoToDelete(selectedPhoto)}
                    aria-label={translateText("Eliminar foto")}
                    title={translateText("Eliminar foto")}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
          {photos.length ? (
            <>
              {photosOnDate.length > 1 && !selectedPhoto && (
                <section className="measure-photo-date-choices">
                  <strong>
                    {translateText("Elige una foto de este día")} · {photosOnDate.length}
                  </strong>
                  <div className="measure-photo-choice-list">
                    {photosOnDate.map((photo, index) => (
                      <button
                        type="button"
                        className="measure-photo-choice"
                        key={photo.id}
                        onClick={() => setSelectedId(photo.id)}
                      >
                        <MeasurePhotoAsset
                          assetId={photo.photoAssetId}
                          photoUri={photo.photoUri}
                          alt={`${translateText("Foto de progreso")} ${index + 1}`}
                          className="measure-photo-choice-image"
                          onMissing={() => onMissingPhoto?.(photo)}
                        />
                        <span>{index + 1}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {selectedPhoto ? (
                <article
                  className="measure-photo-viewer"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    swipeStart.current = event.clientX;
                  }}
                  onPointerUp={(event) => {
                    const start = swipeStart.current;
                    swipeStart.current = null;
                    const delta = event.clientX - (start ?? event.clientX);
                    if (start != null && Math.abs(delta) > 48)
                      changePhoto(delta < 0 ? 1 : -1);
                  }}
                  onPointerCancel={() => { swipeStart.current = null; }}
                  onLostPointerCapture={() => { swipeStart.current = null; }}
                >
                  <div className="measure-photo-viewer-image-wrap">
                    {photos.length > 1 && (
                      <span className="measure-photo-image-count">
                        {selectedIndex + 1} / {photos.length}
                      </span>
                    )}
                    {photos.length > 1 && (
                      <button
                        type="button"
                        className="measure-photo-nav previous"
                        onClick={() => changePhoto(-1)}
                        aria-label={translateText("Foto anterior")}
                      >
                        <Icon name="chevron" size={19} className="calendar-chevron-back" />
                      </button>
                    )}
                    <MeasurePhotoAsset
                      assetId={selectedPhoto.photoAssetId}
                      photoUri={selectedPhoto.photoUri}
                      alt={`${translateText("Foto de progreso")}: ${dateLabel(selectedPhoto.date)}, ${formatMassValue(selectedPhoto.weight, unit)}`}
                      className="measure-photo-viewer-image"
                      interactive
                      onClick={() => setPhotoExpanded(true)}
                      onMissing={() => onMissingPhoto?.(selectedPhoto)}
                    />
                    {photos.length > 1 && (
                      <button
                        type="button"
                        className="measure-photo-nav next"
                        onClick={() => changePhoto(1)}
                        aria-label={translateText("Foto siguiente")}
                      >
                        <Icon name="chevron" size={19} />
                      </button>
                    )}
                  </div>
                  <div className="measure-photo-viewer-details">
                    <div className="measure-photo-main-stats">
                      <span className="measure-photo-date-label">
                        {dateLabel(selectedPhoto.date, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <div className="measure-photo-weight">
                        <span>{translateText("Peso")}</span>
                        <strong>{formatMassValue(selectedPhoto.weight, unit)}</strong>
                      </div>
                    </div>
                    <div className="measure-photo-metric-list">
                      {selectedMetrics.length ? selectedMetrics.map(([label, value]) => (
                        <span className="measure-photo-metric-chip" key={label}>
                          <small>{label}</small><strong>{value}</strong>
                        </span>
                      )) : (
                        <span className="measure-photo-metric-empty">
                          {translateText("Sin composición adicional")}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ) : photosOnDate.length === 1 ? null : (
                <div className="measure-photo-empty measure-photo-pick-hint">
                  <span><Icon name="image" size={22} /></span>
                  <strong>{translateText("Selecciona una foto para verla")}</strong>
                </div>
              )}
            </>
          ) : (
            <div className="measure-photo-empty">
              <span><Icon name="image" size={22} /></span>
              <strong>{translateText("Aún no hay fotos de progreso")}</strong>
              <small>
                {translateText(
                  "Añade una foto al guardar un pesaje para seguir tu evolución.",
                )}
              </small>
              <Button
                type="button"
                onClick={() => {
                  onClose();
                  onAddMeasure();
                }}
              >
                <Icon name="plus" size={15} /> {translateText("Añadir pesaje")}
              </Button>
            </div>
          )}
        </div>
        {photoExpanded && selectedPhoto && (
          <div
            className="modal-backdrop measure-photo-expanded-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={translateText("Foto ampliada")}
            onClick={(event) => {
              if (event.target === event.currentTarget) setPhotoExpanded(false);
            }}
          >
            <button
              type="button"
              className="measure-photo-expanded-close icon-button"
              onClick={() => setPhotoExpanded(false)}
              aria-label={translateText("Cerrar imagen ampliada")}
              title={translateText("Cerrar imagen ampliada")}
            >
              <Icon name="close" size={22} />
            </button>
            <MeasurePhotoAsset
              assetId={selectedPhoto.photoAssetId}
              photoUri={selectedPhoto.photoUri}
              alt={`${translateText("Foto de progreso")}: ${dateLabel(selectedPhoto.date)}`}
              className="measure-photo-expanded-image"
              onMissing={() => onMissingPhoto?.(selectedPhoto)}
            />
          </div>
        )}
      </Modal>
      {datePickerOpen && (
        <MeasurePhotoDatePickerModal
          photos={photos}
          selectedDate={selectedDate}
          weekStartsOn={weekStartsOn}
          onSelectDate={chooseDate}
          onClose={() => setDatePickerOpen(false)}
        />
      )}
      {photoToDelete && (
        <ConfirmModal
          className="measure-photo-delete-confirm"
          confirmation={photoDeletePrompt}
          onCancel={() => setPhotoToDelete(null)}
          onConfirm={confirmDeletePhoto}
        />
      )}
    </>
  );
}

const bodyMeasureSeries = [
  { id: "weight", key: "weight", label: "Peso", unit: "kg", dataType: "mass", color: "#b9dc74" },
  { id: "muscleMass", key: "muscleMass", label: "Masa muscular", unit: "kg", dataType: "mass", composition: true, color: "#398a92" },
  { id: "bodyFat", key: "bodyFat", label: "Grasa corporal", unit: "kg", dataType: "mass", composition: true, color: "#b86b4f" },
  { id: "water", key: "water", label: "Agua corporal", unit: "kg", dataType: "mass", composition: true, color: "#4e75b4" },
  { id: "boneMass", key: "boneMass", label: "Masa ósea", unit: "kg", dataType: "mass", composition: true, color: "#8064b4" },
  { id: "waist", key: "waist", label: "Cintura", unit: "cm", dataType: "length", color: "#e5b85e" },
  { id: "chest", key: "chest", label: "Pecho", unit: "cm", dataType: "length", color: "#e587bc" },
];

// Convert percentage-based composition values to their equivalent mass in kg
// for charting, using the body weight recorded in the same weigh-in.
const compositionMassForChart = (measure, key) => {
  const value = Number(measure?.[key]);
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  if (compositionMeasureType(measure, key) === "mass") return value;
  const bodyWeightKg = Number(measure?.weight);
  return Number.isFinite(bodyWeightKg) && bodyWeightKg > 0
    ? (bodyWeightKg * value) / 100
    : Number.NaN;
};

function MeasureChart({ measures, unit = "kg", heightUnit = "cm" }) {
  const [period, setPeriod] = useState("30d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartConfig, setChartConfig] = useState(() => {
    const saved = loadJson("profit-measure-chart-config", null);
    const savedHidden = Array.isArray(saved?.hidden) ? saved.hidden : [];
    const legacyCompositionIds = {
      muscleMass: ["muscleMass-percent", "muscleMass-mass"],
      bodyFat: ["bodyFat-percent", "bodyFat-mass"],
      water: ["water-percent", "water-mass"],
      boneMass: ["boneMass-percent", "boneMass-mass"],
    };
    return {
      hidden: bodyMeasureSeries
        .filter((series) => {
          if (savedHidden.includes(series.id)) return true;
          const legacyIds = legacyCompositionIds[series.id];
          // Migrate old settings by hiding a combined measure only when both
          // of its previous percent/mass variants were hidden.
          return Boolean(
            legacyIds && legacyIds.every((id) => savedHidden.includes(id)),
          );
        })
        .map((series) => series.id),
    };
  });
  useEffect(() => {
    localStorage.setItem(
      "profit-measure-chart-config",
      JSON.stringify(chartConfig),
    );
  }, [chartConfig]);
  const periods = [
    { id: "30d", label: "30 días", days: 30 },
    { id: "3m", label: "3 meses", days: 90 },
    { id: "6m", label: "6 meses", days: 180 },
    { id: "1y", label: "1 año", days: 365 },
    { id: "all", label: "Todo", days: Infinity },
  ];
  const activePeriod = periods.find((item) => item.id === period) || periods[0];
  const cutoff = Number.isFinite(activePeriod.days)
    ? dayOffset(activePeriod.days - 1)
    : "";
  const visibleMeasures = [...measures]
    .filter((measure) => !cutoff || measure.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
  const displaySeries = bodyMeasureSeries.filter(
    (series) => !chartConfig.hidden.includes(series.id),
  );
  const seriesPoints = displaySeries.map((series) => {
    const entries = visibleMeasures
      .map((measure, dateIndex) => ({
        measure,
        dateIndex,
        value: series.composition
          ? compositionMassForChart(measure, series.key)
          : Number(measure[series.key || series.id]),
      }))
      .filter(({ value }) => Number.isFinite(value) && value > 0);
    const values = entries.map((entry) => entry.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const spread = Math.max(high - low, Math.abs(high || 1) * 0.08, 0.1);
    const points = entries.map(({ measure, dateIndex, value }) => ({
      x:
        visibleMeasures.length === 1
          ? 50
          : 6 + (dateIndex / Math.max(visibleMeasures.length - 1, 1)) * 88,
      y: 21 - ((value - low) / spread) * 15,
      value,
      date: measure.date,
    }));
    return { ...series, entries, points, latest: values.at(-1) };
  });
  const formatValue = (series, value) => {
    const isMass = series.dataType === "mass" || series.measureType === "mass";
    const isLength = series.dataType === "length";
    const selectedUnit = isMass ? unit : isLength ? heightUnit : series.unit;
    const converted = isMass
      ? kgToUnit(value, unit)
      : isLength && heightUnit === "in"
        ? cmToIn(value)
        : value;
    return `${converted.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${selectedUnit}`;
  };
  const toggle = (id) =>
    setChartConfig((current) => ({
      ...current,
      hidden: current.hidden.includes(id)
        ? current.hidden.filter((item) => item !== id)
        : [...current.hidden, id],
    }));
  const seriesById = new Map(seriesPoints.map((series) => [series.id, series]));
  return (
    <div class="measure-chart-card">
      <div class="measure-chart-toolbar">
        <div>
          <div class="eyebrow">TENDENCIA CORPORAL</div>
          <strong>
            {visibleMeasures.length}{" "}
            {visibleMeasures.length === 1 ? "registro" : "registros"}
          </strong>
        </div>
        <button
          class="measure-settings-toggle"
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((value) => !value)}
        >
          <Icon name="settings" size={14} />
        </button>
      </div>
      <div
        class="measure-periods"
        role="group"
        aria-label="Período del gráfico"
      >
        {periods.map((item) => (
          <button
            type="button"
            key={item.id}
            class={period === item.id ? "active" : ""}
            aria-pressed={period === item.id}
            onClick={() => setPeriod(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {settingsOpen && (
        <div class="measure-chart-settings">
          <div class="measure-chart-settings-heading">
            <strong>Series visibles</strong>
            <span>Elige qué medidas aparecen en la gráfica</span>
          </div>
          <div class="measure-series-options">
            {bodyMeasureSeries.map((series) => {
              const shown = !chartConfig.hidden.includes(series.id);
              return (
                <button
                  type="button"
                  class={
                    shown
                      ? "measure-series-toggle active"
                      : "measure-series-toggle"
                  }
                  aria-pressed={shown}
                  onClick={() => toggle(series.id)}
                  key={series.id}
                >
                  <i style={{ "--series-color": series.color }} />
                  {translateText(series.label)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {displaySeries.length ? (
        <div class="measure-chart-wrap">
          <svg
            viewBox="0 0 100 24"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Tendencia comparada de medidas corporales"
          >
            {[6, 13.5, 21].map((y) => (
              <line
                key={y}
                x1="5"
                x2="95"
                y1={y}
                y2={y}
                class="measure-chart-gridline"
              />
            ))}
            {seriesPoints.map((series) =>
              series.points.length ? (
                <g
                  key={series.id}
                  class="measure-series-line"
                  style={{ "--series-color": series.color }}
                >
                  <polyline
                    points={series.points
                      .map(({ x, y }) => `${x},${y}`)
                      .join(" ")}
                  />
                  <g>
                    {series.points.map((point, index) => (
                      <circle
                        key={`${series.id}-${point.date}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r="1.15"
                      >
                        <title>{`${translateText(series.label)}: ${formatValue(series, point.value)} · ${dateLabel(point.date)}`}</title>
                      </circle>
                    ))}
                  </g>
                </g>
              ) : null,
            )}
          </svg>
          <div class="measure-chart-axis">
            <span>
              {visibleMeasures[0]
                ? dateLabel(visibleMeasures[0].date, {
                    day: "numeric",
                    month: "short",
                  })
                : ""}
            </span>
            <span>
              {visibleMeasures.at(-1)
                ? dateLabel(visibleMeasures.at(-1).date, {
                    day: "numeric",
                    month: "short",
                  })
                : ""}
            </span>
          </div>
        </div>
      ) : (
        <div class="measure-chart-empty">
          Activa al menos una línea para comparar tu progreso.
        </div>
      )}
      <div class="measure-chart-legend">
        {displaySeries.map((series) => {
          const source = seriesById.get(series.id);
          return (
            <div key={series.id} class="measure-legend-item">
              <i style={{ "--series-color": series.color }} />
              <span>{translateText(series.label)}</span>
              <strong>
                {source?.latest ? formatValue(series, source.latest) : "—"}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
  dismissible = true,
  className = "",
}) {
  const onCloseRef = useRef(onClose);
  const backdropRef = useRef(null);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handle = (event) => {
      if (!dismissible || event.key !== "Escape") return;
      const stack = document.querySelectorAll(".modal-backdrop");
      if (stack[stack.length - 1] !== backdropRef.current) return;
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", handle);
    openModalCount += 1;
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", handle);
      openModalCount = Math.max(0, openModalCount - 1);
      if (!openModalCount) document.body.classList.remove("modal-open");
    };
  }, []);
  return (
    <div
      ref={backdropRef}
      class={`modal-backdrop ${className}`}
      onClick={(event) =>
        dismissible && event.target === event.currentTarget && onClose()
      }
    >
      <div
        class={`modal-card ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div class="modal-header">
          <div class="eyebrow">PROFIT</div>
          {dismissible && (
            <button
              class="icon-button modal-close-button"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ confirmation, onCancel, onConfirm, className = "" }) {
  useEffect(() => {
    if (confirmation) playWarningSound();
  }, [confirmation]);
  if (!confirmation) return null;
  return (
    <Modal
      title={confirmation.title}
      onClose={onCancel}
      className={`confirmation-layer ${className}`.trim()}
    >
      <div class="confirm-modal-content">
        <span class="confirm-modal-icon">
          <Icon name={confirmation.icon || "trash"} size={20} />
        </span>
        <div class="eyebrow">CONFIRMA ESTA ACCIÓN</div>
        <h2>{confirmation.title}</h2>
        <p>{confirmation.message}</p>
        <div class="form-actions">
          <Button variant="quiet" onClick={onCancel}>
            Volver
          </Button>
          <Button
            variant={confirmation.buttonVariant || "danger"}
            onClick={onConfirm}
          >
            {confirmation.confirmLabel || "Confirmar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function personalRecordsForWorkout(workout, previousWorkouts) {
  const previousBest = new Map();
  previousWorkouts.forEach((session) =>
    session.exercises.forEach((entry) => {
      const current = previousBest.get(entry.id) || { weight: 0, reps: 0 };
      const weight = entry.trackWeight === false
        ? 0
        : Math.max(0, ...entry.sets.map((set) => Number(set.weight) || 0));
      const reps = Math.max(
        0,
        ...entry.sets.map((set) => Number(set.reps) || 0),
      );
      previousBest.set(entry.id, {
        weight: Math.max(current.weight, weight),
        reps: Math.max(current.reps, reps),
      });
    }),
  );
  return workout.exercises.flatMap((entry) => {
    const previous = previousBest.get(entry.id) || { weight: 0, reps: 0 };
    const bestWeight = entry.trackWeight === false
      ? 0
      : Math.max(0, ...entry.sets.map((set) => Number(set.weight) || 0));
    const bestReps = Math.max(
      0,
      ...entry.sets.map((set) => Number(set.reps) || 0),
    );
    const name = entry.name || entry.id;
    const records = [];
    if (bestWeight > previous.weight)
      records.push({
        exerciseId: entry.id,
        exerciseName: name,
        kind: "weight",
        previous: previous.weight,
        best: bestWeight,
      });
    if (bestReps > previous.reps)
      records.push({
        exerciseId: entry.id,
        exerciseName: name,
        kind: "reps",
        previous: previous.reps,
        best: bestReps,
      });
    return records;
  });
}
const completionMessages = [
  "Has cumplido contigo. Ese progreso también cuenta.",
  "Una sesión más fuerte que la última: la constancia se nota.",
  "Hoy sumaste trabajo de calidad. Mañana partes desde aquí.",
  "Lo que registras hoy se convierte en tu progreso de mañana.",
  "Buen trabajo: cada serie fue una decisión a favor de ti.",
  "El progreso no siempre hace ruido; a veces solo suma una sesión más.",
];
const completionMessage = (workout) =>
  completionMessages[
    workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) %
      completionMessages.length
  ];

function WorkoutCelebration({ workout, onClose, onSummary, unit }) {
  const medals = (workout.newMedals || []).filter(
    (medal) => medal && typeof medal === "object",
  );
  const showWeight = (weight) =>
    (unit === "lb" ? weight * 2.20462 : weight).toLocaleString(intlLocale(), {
      maximumFractionDigits: 1,
    });
  const particles = Array.from({ length: 28 }, (_, index) => index);
  const completedHeading = translateText("¡Buen trabajo!");
  const hasSpanishOpeningExclamation = completedHeading.startsWith("¡");
  const completedHeadingText = completedHeading
    .replace(/^¡/, "")
    .replace(/!$/, "");
  return (
    <div
      class="celebration-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Entrenamiento completado"
    >
      <div class="celebration-confetti" aria-hidden="true">
        {particles.map((particle) => (
          <i
            key={particle}
            style={{
              "--particle-left": `${(particle * 37 + 9) % 100}%`,
              "--particle-color": [
                "var(--accent)",
                "#8de4d2",
                "#f7bd77",
                "#d7a6ff",
                "#ff93a6",
              ][particle % 5],
              "--particle-rotation": `${particle * 29}deg`,
              "--particle-delay": `${particle * 38}ms`,
            }}
          />
        ))}
      </div>
      <section class="celebration-card">
        <span class="celebration-medal">
          <Icon name="trophy" size={29} />
        </span>
        <div class="eyebrow">SESIÓN COMPLETADA</div>
        <h2>
          {hasSpanishOpeningExclamation && <span class="welcome-dot">¡</span>}
          {completedHeadingText}
          <span class="welcome-dot">!</span>
        </h2>
        <p>
          <span translate="no">{workout.name}</span> ya está en tu historial.{" "}
          {completionMessage(workout)}
        </p>
        {medals.length > 0 && (
          <>
            <div class="celebration-record-count">
              <div class="celebration-record-value">
                <strong>{medals.length}</strong>
                <Icon name="trophy" size={18} />
              </div>
              <span>
                {medals.length === 1
                  ? "récord batido en esta sesión"
                  : "récords batidos en esta sesión"}
              </span>
            </div>
            <div class="celebration-medal-unlock">
              <div class="celebration-record-heading">
                <Icon name="trophy" size={15} />
                <strong>Nuevas marcas personales</strong>
              </div>
              <div class="celebration-record-list">
                {medals.map((medal, index) => (
                  <div
                    class="celebration-record-item"
                    key={`${medal.exerciseId}-${medal.kind}-${index}`}
                  >
                    <strong>{medal.exerciseName}</strong>
                    <span class="celebration-record-values">
                      {medal.kind === "weight" ? (
                        <>
                          {showWeight(medal.previous)}{" "}
                          <Icon name="arrow" size={12} />{" "}
                          {showWeight(medal.best)} {unit}
                        </>
                      ) : (
                        <>
                          {medal.previous} <Icon name="arrow" size={12} />{" "}
                          {medal.best} reps
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        <div class="celebration-stats">
          <span>
            <strong>{workout.duration}</strong>
            <small>minutos</small>
          </span>
          <span>
            <strong>{workout.exercises.length}</strong>
            <small>ejercicios</small>
          </span>
          <span>
            <strong>
              {workout.exercises.reduce(
                (total, exercise) => total + exercise.sets.length,
                0,
              )}
            </strong>
            <small>series</small>
          </span>
        </div>
        <div class="celebration-actions">
          <Button variant="quiet" onClick={onClose}>
            Seguir
          </Button>
          <Button onClick={onSummary}>
            <Icon name="trend" size={15} /> Ver resumen
          </Button>
        </div>
      </section>
    </div>
  );
}

function ExerciseDetail({
  exercise,
  workouts,
  unit,
  onClose,
  onEdit,
  onDelete,
  onShare,
  onRestoreOriginal,
}) {
  const [range, setRange] = useState("90d");
  const [metric, setMetric] = useState("weight");
  const bundledOriginal = isBundledExercise(exercise)
    ? bundledExerciseById.get(exercise.id)
    : null;
  const logs = workouts
    .filter((workout) =>
      workout.exercises.some((entry) => entry.id === exercise.id),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const stats = getExerciseStats(
    exercise,
    workouts,
    dateRanges.find((r) => r.id === range)?.days ?? Infinity,
  );
  const formatted = formatMetric(stats, metric, unit);
  const shownMetric = metricOptions.find((item) => item.id === metric);
  return (
    <Modal title={exercise.name} onClose={onClose} wide>
      <div class="detail-top">
        <ExerciseThumb exercise={exercise} large />
        <div class="detail-title">
          <div class="exercise-tags">
            <span>{exercisePrimaryMuscleLabel(exercise)}</span>
            <i />
            <span>{exercise.equipment}</span>
          </div>
          <h2>{exercise.name}</h2>
          <p>{exercise.description}</p>
          <div class="detail-actions">
            <Button
              type="button"
              variant="quiet"
              onClick={() => onEdit(exercise)}
              title="Editar ejercicio"
              aria-label="Editar ejercicio"
            >
              <Icon name="edit" size={15} />
              <span>Editar</span>
            </Button>
            <ExportMenu
              label="Exportar"
              className="button button-quiet"
              onSave={() => onShare(exercise, "device")}
              onShare={() => onShare(exercise, "share")}
            />
            {!isBundledExercise(exercise) && (
              <button
                type="button"
                class="icon-button danger"
                onClick={() => onDelete(exercise)}
                title="Eliminar ejercicio"
                aria-label="Eliminar ejercicio"
              >
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
          {bundledOriginal && exercise.name !== bundledOriginal.name && (
            <BuiltinNameWarning
              originalName={bundledOriginal.name}
              onRestore={() => onRestoreOriginal(exercise.id)}
            />
          )}
        </div>
      </div>
      <div class="detail-body">
        <div class="detail-main-column">
          <section class="detail-block">
            <div class="detail-block-head">
              <div>
                <div class="eyebrow">TU MEJOR MARCA</div>
                <strong>{shownMetric.label}</strong>
              </div>
              <select
                value={metric}
                onChange={(event) => setMetric(event.currentTarget.value)}
              >
                {metricOptions.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div class="detail-record">
              <strong>
                {formatted.main}
                <small>{formatted.suffix}</small>
              </strong>
              <span>{formatted.foot}</span>
            </div>
            <div class="range-row compact">
              <span>Tiempo</span>
              {dateRanges.map((period) => (
                <button
                  class={range === period.id ? "active" : ""}
                  onClick={() => setRange(period.id)}
                  key={period.id}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </section>
          <section class="detail-block history-block">
            <div class="detail-block-head">
              <div>
                <div class="eyebrow">HISTORIAL</div>
                <strong>Últimas sesiones</strong>
              </div>
              <span class="muted-label">
                {stats.sessions} sesiones ·{" "}
                {stats.value
                  ? `${formatted.main}${formatted.suffix}`
                  : "sin marcas"}
              </span>
            </div>
            {logs.length ? (
              logs.map((workout) => {
                const entry = workout.exercises.find(
                  (item) => item.id === exercise.id,
                );
                return (
                  <div class="history-row" key={workout.id}>
                    <div>
                      <strong>
                        {dateLabel(workout.date, {
                          day: "numeric",
                          month: "long",
                        })}
                      </strong>
                      <span>
                        {entry.activityComplete
                          ? "Actividad completada"
                          : `${entry.sets.length} series`}{" "}
                        · {workout.duration} min de sesión
                      </span>
                    </div>
                    <span>
                      {entry.activityComplete
                        ? entry.activityValue
                          ? `${entry.activityValue} min`
                          : "Actividad"
                        : entry.sets
                            .map((set) =>
                              entry.trackWeight === false
                                ? `${set.reps} reps`
                                : `${(unit === "lb" ? set.weight * 2.20462 : set.weight).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })}×${set.reps}`,
                            )
                            .join(" · ")}
                    </span>
                  </div>
                );
              })
            ) : (
              <div class="empty-inline">
                Aún no hay registros para este ejercicio.
              </div>
            )}
          </section>
        </div>
        <aside class="detail-aside">
          <div class="detail-block">
            {hasExerciseDemoMedia(exercise) && (
              <>
                <div class="eyebrow">DEMOSTRACIÓN</div>
                <ExerciseDemo exercise={exercise} />
              </>
            )}
            {!hasExerciseDemoMedia(exercise) && (
              <div class="eyebrow">MÚSCULOS</div>
            )}
            <MuscleMap
              muscles={getMuscleFocus(exercise)}
              compact
              className="detail-target-map"
            />
          </div>
          <div class="detail-block prescription">
            <div class="eyebrow">DOSIS SUGERIDA</div>
            {(exerciseTracksSets(exercise) || exerciseTracksReps(exercise)) && (
              <div class="prescription-grid">
                {exerciseTracksSets(exercise) && (
                  <div>
                    <strong>{exercise.sets}</strong>
                    <span>series</span>
                  </div>
                )}
                {exerciseTracksReps(exercise) && (
                  <div>
                    <strong>{exercise.reps}</strong>
                    <span>
                      {isTimedPrescription(exercise.reps) ? "duración" : "reps"}
                    </span>
                  </div>
                )}
                {exerciseTracksSets(exercise) && (
                  <div>
                    <strong>{exercise.rest}s</strong>
                    <span>descanso</span>
                  </div>
                )}
              </div>
            )}
            <p>
              <Icon name="clock" size={14} /> Tiempo estimado:{" "}
              {exercise.duration} min
            </p>
          </div>
          <div class="coach-tip">
            <span>✳</span>
            <div>
              <div class="eyebrow">PUNTOS CLAVE</div>
              {(exercise.cues || []).map((cue, index) => (
                <p key={cue}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  {cue}
                </p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function WorkoutDetail({ workout, exercises, unit, onClose, onShare, onEdit }) {
  const focus = workout.exercises.flatMap((entry) => {
    const exercise =
      exercises.find((item) => item.id === entry.id) ||
      (entry.name && entry.muscle ? entry : null);
    return exercise ? getMuscleFocus(exercise) : [];
  });
  const sets = workout.exercises.reduce(
    (sum, entry) => sum + entry.sets.length,
    0,
  );
  const volume = workout.exercises.reduce(
    (sum, entry) =>
      sum +
      (entry.trackWeight === false
        ? 0
        : entry.sets.reduce((subtotal, set) => subtotal + set.weight * set.reps, 0)),
    0,
  );
  const shownVolume = unit === "lb" ? volume * 2.20462 : volume;
  return (
    <Modal title="Entrenamiento" onClose={onClose} wide>
      <div class="workout-detail-head">
        <div>
          <div class="eyebrow">
            SESIÓN ·{" "}
            {dateLabel(workout.date, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <h2>
            <span translate="no">{workout.name}</span>
          </h2>
          <p>
            {workout.exercises.length} ejercicios <i>·</i> {sets} series{" "}
            <i>·</i> {workout.duration} min
          </p>
          <div class="workout-detail-actions">
            <Button
              type="button"
              variant="quiet"
              onClick={onEdit}
              title="Modificar pesajes"
              aria-label="Modificar pesajes"
            >
              <Icon name="edit" size={14} />
              <span>Modificar pesajes</span>
            </Button>
            <ExportMenu
              iconOnly
              label="Compartir sesión"
              className="icon-button"
              onSave={() => onShare("device")}
              onShare={() => onShare("share")}
            />
          </div>
        </div>
        <div class="workout-volume">
          <span>VOLUMEN</span>
          <strong>
            {Math.round(shownVolume).toLocaleString(intlLocale())}{" "}
            <small>{unit}</small>
          </strong>
        </div>
      </div>
      <div class="workout-detail-body">
        <section class="workout-muscle-summary">
          <div class="eyebrow">MAPA DE LA SESIÓN</div>
          <p>Los grupos principales y de apoyo que trabajaste.</p>
          <MuscleMap muscles={focus} />
        </section>
        <section class="workout-exercise-breakdown">
          <div class="eyebrow">EJERCICIOS Y SERIES</div>
          {workout.exercises.map((entry) => {
            const exercise =
              exercises.find((item) => item.id === entry.id) ||
              (entry.name && entry.muscle ? entry : null);
            if (!exercise) return null;
            return (
              <article class="workout-exercise-detail" key={entry.id}>
                <div class="workout-exercise-heading">
                  <div>
                    <strong>{exercise.name}</strong>
                    <span>{exerciseMuscleLine(exercise)}</span>
                  </div>
                  <span>{exercise.duration} min</span>
                </div>
                {(entry.trackSets !== undefined
                  ? entry.trackSets !== false
                  : exerciseTracksSets(exercise)) && (
                  <div class="workout-rest-summary">
                    <Icon name="clock" size={13} />
                    <span class="workout-rest-label">
                      {translateText("Descanso entre series")}
                    </span>
                    <strong>
                      {safeRestSeconds(entry.restSeconds ?? exercise.rest ?? 0, 0)}s
                    </strong>
                  </div>
                )}
                <MuscleMap muscles={getMuscleFocus(exercise)} compact />
                <div class="workout-set-table">
                  {entry.sets.length > 0 && (
                    <div class={`workout-set-labels${entry.trackWeight === false ? " no-weight" : ""}`}>
                      <span>Serie</span>
                      {entry.trackWeight !== false && <span>Peso ({unit})</span>}
                      <span>Reps</span>
                      {entry.trackWeight !== false && <span>Volumen</span>}
                    </div>
                  )}
                  {entry.sets.map((set, index) => {
                    const tracksWeight = entry.trackWeight !== false;
                    const weight = tracksWeight
                      ? unit === "lb" ? set.weight * 2.20462 : set.weight
                      : 0;
                    return (
                      <div class={`workout-set-row${tracksWeight ? "" : " no-weight"}`} key={`${entry.id}-${index}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        {tracksWeight && (
                          <strong>
                            {weight.toLocaleString(intlLocale(), {
                              maximumFractionDigits: 1,
                            })}
                          </strong>
                        )}
                        <span>{set.reps}</span>
                        {tracksWeight && (
                          <span>
                            {Math.round(weight * set.reps).toLocaleString(
                              intlLocale(),
                            )}{" "}
                            {unit}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {!entry.sets.length && (
                    <div class="workout-activity-complete">
                      <Icon name="check" size={14} />
                      Actividad completada
                      {entry.activityValue
                        ? ` · ${entry.activityValue} ${!exerciseTracksSets(exercise) ? "min" : "unidades"}`
                        : ""}
                    </div>
                  )}
                </div>
                <div class="exercise-instruction">
                  <Icon name="check" size={14} />
                  <span>
                    {exercise.cues?.[0] ||
                      exercise.description ||
                      "Ejercicio guardado en esta sesión."}
                  </span>
                </div>
                {entry.note && (
                  <div class="workout-exercise-note">
                    <span>COMENTARIO</span>
                    <p>{entry.note}</p>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </Modal>
  );
}

function WorkoutEditModal({ workout, exercises, unit, onClose, onSave }) {
  const [form, setForm] = useState(() => structuredClone(workout));
  const [weightDrafts, setWeightDrafts] = useState({});
  const weightDraftKey = (exerciseIndex, setIndex) =>
    `${exerciseIndex}:${setIndex}`;
  const displayedWeight = (weight) => {
    const value = Number(weight) || 0;
    return formatEditableDecimal(
      unit === "lb" ? value * 2.20462 : value,
      unit === "lb" ? 1 : 6,
    );
  };
  const commitWeightDraft = (exerciseIndex, setIndex) => {
    const key = weightDraftKey(exerciseIndex, setIndex);
    const draft = weightDrafts[key];
    if (draft === undefined) return;
    const parsed = parseLocalizedDecimal(draft);
    if (String(draft).trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
      updateSet(
        exerciseIndex,
        setIndex,
        "weight",
        unit === "lb" ? parsed / 2.20462 : parsed,
      );
    }
    setWeightDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const updateSet = (exerciseIndex, setIndex, key, value) =>
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index !== exerciseIndex
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, itemIndex) =>
                itemIndex !== setIndex
                  ? set
                  : { ...set, [key]: Math.max(0, Number(value) || 0) },
              ),
            },
      ),
    }));
  return (
    <Modal
      title="Modificar sesión"
      onClose={onClose}
      wide
      className="workout-edit-modal"
    >
      <form
        class="exercise-form workout-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            exercises: form.exercises.map((entry, exerciseIndex) => {
              const definition = exercises.find((item) => item.id === entry.id);
              const tracksSets =
                entry.trackSets !== undefined
                  ? entry.trackSets !== false
                  : definition
                    ? exerciseTracksSets(definition)
                    : !entry.activityComplete;
              const tracksWeight = tracksSets && entry.trackWeight !== false;
              const { restSeconds, ...withoutRest } = entry;
              return {
                ...(tracksSets
                  ? { ...entry, restSeconds: safeRestSeconds(restSeconds) }
                  : {
                      ...withoutRest,
                      activityValue:
                        entry.activityValue == null
                          ? null
                          : parseLocalizedDecimal(entry.activityValue),
                    }),
                trackWeight: tracksWeight,
                sets: entry.sets.map((set, setIndex) => {
                const draft =
                  weightDrafts[weightDraftKey(exerciseIndex, setIndex)];
                const parsed = parseLocalizedDecimal(draft);
                const hasValidDraft =
                  draft !== undefined &&
                  String(draft).trim() !== "" &&
                  Number.isFinite(parsed) &&
                  parsed >= 0;
                return {
                  ...set,
                  weight: !tracksWeight
                    ? 0
                    : hasValidDraft
                      ? unit === "lb"
                        ? parsed / 2.20462
                        : parsed
                      : Math.max(0, Number(set.weight) || 0),
                };
                }),
              };
            }),
          });
        }}
      >
        <div class="workout-edit-content">
          <div class="eyebrow">EDITAR HISTORIAL</div>
          <h2>Corrige los datos de la sesión</h2>
          <div class="form-row three">
            <label>
              Nombre
              <input
                value={form.name}
                onInput={(event) =>
                  setForm({ ...form, name: event.currentTarget.value })
                }
              />
            </label>
            <label>
              Fecha
              <input
                required
                type="date"
                value={form.date}
                onInput={(event) =>
                  setForm({ ...form, date: event.currentTarget.value })
                }
              />
            </label>
            <label>
              Duración (min)
              <input
                type="number"
                min="1"
                max="720"
                value={form.duration}
                onInput={(event) =>
                  setForm({
                    ...form,
                    duration: Number(event.currentTarget.value),
                  })
                }
              />
            </label>
          </div>
          {form.exercises.map((entry, exerciseIndex) => {
            const definition = exercises.find((item) => item.id === entry.id);
            const tracksSets =
              entry.trackSets !== undefined
                ? entry.trackSets !== false
                : definition
                  ? exerciseTracksSets(definition)
                  : !entry.activityComplete;
            const isActivity = !tracksSets;
            const tracksWeight = tracksSets && entry.trackWeight !== false;
            return (
              <section
                class="workout-edit-exercise"
                key={`${entry.id}-${exerciseIndex}`}
              >
                <div class="workout-edit-exercise-head">
                  <strong>
                    {definition?.name || entry.name || "Ejercicio guardado"}
                  </strong>
                  {tracksSets && (
                    <label class="workout-edit-rest">
                      <span>{translateText("Descanso entre series (s)")}</span>
                      <input
                        type="number"
                        min="0"
                        max="3600"
                        step="5"
                        inputMode="numeric"
                        value={entry.restSeconds ?? definition?.rest ?? 0}
                        onInput={(event) => {
                          const value = event.currentTarget.value;
                          setForm((current) => ({
                            ...current,
                            exercises: current.exercises.map((item, index) =>
                              index === exerciseIndex
                                ? { ...item, restSeconds: value }
                                : item,
                            ),
                          }));
                        }}
                        onBlur={(event) => {
                          const value = event.currentTarget.value;
                          setForm((current) => ({
                            ...current,
                            exercises: current.exercises.map((item, index) =>
                              index === exerciseIndex
                                ? {
                                    ...item,
                                    restSeconds: safeRestSeconds(
                                      value,
                                      safeRestSeconds(definition?.rest, 0),
                                    ),
                                  }
                                : item,
                            ),
                          }));
                        }}
                      />
                    </label>
                  )}
                </div>
                {entry.sets.map((set, setIndex) => (
                  <div class={`workout-edit-set${tracksWeight ? "" : " no-weight"}`} key={setIndex}>
                    <span>Serie {setIndex + 1}</span>
                    {tracksWeight && (
                      <label>
                        Peso ({unit})
                        <input
                          type="text"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder={`0${decimalSeparator()}0`}
                          value={
                            weightDrafts[weightDraftKey(exerciseIndex, setIndex)] ??
                            displayedWeight(set.weight)
                          }
                          onInput={(event) => {
                            const value = event.currentTarget.value;
                            setWeightDrafts((current) => ({
                              ...current,
                              [weightDraftKey(exerciseIndex, setIndex)]: value,
                            }));
                          }}
                          onBlur={() => commitWeightDraft(exerciseIndex, setIndex)}
                        />
                      </label>
                    )}
                    <label>
                      Reps
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={set.reps}
                        onInput={(event) =>
                          updateSet(
                            exerciseIndex,
                            setIndex,
                            "reps",
                            event.currentTarget.value,
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
                {isActivity && (
                  <label>
                    Tiempo (min)
                    <input
                      type="text"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      placeholder={formatEditableDecimal(definition?.duration || "")}
                      value={entry.activityValue ?? ""}
                      onInput={(event) =>
                        setForm((current) => ({
                          ...current,
                          exercises: current.exercises.map((item, index) =>
                            index === exerciseIndex
                              ? {
                                  ...item,
                                  activityValue:
                                    event.currentTarget.value === ""
                                      ? null
                                      : event.currentTarget.value,
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                )}
              </section>
            );
          })}
        </div>
        <div class="form-actions workout-edit-actions">
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            <Icon name="check" size={15} /> Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  );
}

async function createVideoPoster(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", reject, { once: true });
      video.load();
    });
    const seekTime = Math.max(0, Math.min(video.duration * 0.12 || 0, 1.5));
    if (seekTime > 0)
      await new Promise((resolve, reject) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
        video.currentTime = seekTime;
      });
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 404;
    const context = canvas.getContext("2d");
    if (context) context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84),
    );
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

const standardSecondaryMuscles = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Bíceps",
  "Tríceps",
  "Antebrazo",
  "Abdominales",
  "Glúteos",
  "Cuádriceps",
  "Isquiotibiales",
  "Pantorrillas",
  "Cuello",
];

function MusclePicklist({ value, onChange, onDeleteCustom }) {
  value = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const [custom, setCustom] = useState(loadSecondaryMuscles);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = [...new Set([...standardSecondaryMuscles, ...custom])];
  const matches = options.filter((muscle) =>
    normalizeMuscleFilterValue(muscle).includes(
      normalizeMuscleFilterValue(query),
    ),
  );
  const existing = options.some(
    (muscle) =>
      normalizeMuscleFilterValue(muscle) ===
      normalizeMuscleFilterValue(query.trim()),
  );
  const toggle = (muscle) =>
    onChange(
      value.includes(muscle)
        ? value.filter((item) => item !== muscle)
        : [...value, muscle],
    );
  const add = (event) => {
    event?.preventDefault();
    const muscle = query.trim().replace(/\s+/g, " ");
    if (!muscle || normalizeMuscleFilterValue(muscle) === "otro") return;
    const existingMuscle = options.find(
      (item) =>
        normalizeMuscleFilterValue(item) === normalizeMuscleFilterValue(muscle),
    );
    const selectedMuscle = existingMuscle || muscle;
    if (!existingMuscle) {
      const next = [...custom, muscle];
      setCustom(next);
      localStorage.setItem("profit-secondary-muscles", JSON.stringify(next));
    }
    if (!value.includes(selectedMuscle)) onChange([...value, selectedMuscle]);
    setQuery("");
    setOpen(false);
  };
  const removeCustom = (muscle) => {
    const next = custom.filter(
      (item) =>
        normalizeMuscleFilterValue(item) !== normalizeMuscleFilterValue(muscle),
    );
    const commit = () => {
      setCustom(next);
      localStorage.setItem("profit-secondary-muscles", JSON.stringify(next));
      onChange(
        value.filter(
          (item) =>
            normalizeMuscleFilterValue(item) !==
            normalizeMuscleFilterValue(muscle),
        ),
      );
    };
    if (onDeleteCustom) onDeleteCustom(muscle, commit);
    else commit();
  };
  const blur = () => window.setTimeout(() => setOpen(false), 120);
  return (
    <div class="muscle-picklist">
      <label class="muscle-picklist-label" for="secondary-muscle-search">
        Músculos secundarios
      </label>
      {value.length > 0 && (
        <div class="muscle-picklist-selected">
          {value.map((muscle) => (
            <button
              type="button"
              key={muscle}
              onClick={() => toggle(muscle)}
              aria-label={`Quitar ${muscle}`}
              title={`Quitar ${muscle}`}
            >
              {muscle}
              <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}
      <input
        id="secondary-muscle-search"
        type="text"
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={blur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const exact = options.find(
              (muscle) =>
                normalizeMuscleFilterValue(muscle) ===
                normalizeMuscleFilterValue(query.trim()),
            );
            const selectedMuscle =
              exact || (matches.length === 1 ? matches[0] : null);
            if (selectedMuscle) {
              toggle(selectedMuscle);
              setQuery("");
              setOpen(false);
            } else if (!matches.length) add(event);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Busca o añade un músculo"
        aria-label="Buscar o añadir músculo secundario"
      />
      {open && (
        <div
          class="muscle-picklist-options"
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.map((muscle) => (
            <div class="muscle-picklist-option" key={muscle}>
              <label>
                <input
                  type="checkbox"
                  checked={value.includes(muscle)}
                  onChange={() => toggle(muscle)}
                />
                <span>{muscle}</span>
              </label>
              {custom.includes(muscle) && (
                <button
                  type="button"
                  class="muscle-delete-option"
                  title={`Eliminar ${muscle} de la lista y del radar`}
                  aria-label={`Eliminar ${muscle} de la lista y del radar`}
                  onClick={() => removeCustom(muscle)}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
          {query.trim() && !matches.length && !existing && (
            <button type="button" class="muscle-add-option" onClick={add}>
              <Icon name="plus" size={14} /> Añadir “{query.trim()}”
            </button>
          )}
          {!matches.length && !query.trim() && (
            <span class="muscle-picklist-hint">
              Escribe un músculo para buscarlo o añadirlo.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function RoutineGroupForm({ groups, onClose, onSave }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Escribe un nombre para el grupo.");
      return;
    }
    if (
      groups.some(
        (group) =>
          group.toLocaleLowerCase("es") === cleanName.toLocaleLowerCase("es"),
      )
    ) {
      setError("Ya existe un grupo con ese nombre.");
      return;
    }
    onSave(cleanName);
  };
  return (
    <Modal title="Crear grupo de rutinas" onClose={onClose}>
      <form class="exercise-form routine-group-form" onSubmit={submit}>
        <div class="eyebrow">PLANIFICACIÓN PERSONAL</div>
        <h2>Nuevo grupo</h2>
        <p>Organiza tus rutinas por día, objetivo o bloque de entrenamiento.</p>
        <label>
          Nombre del grupo
          <input
            required
            autoFocus
            maxLength="40"
            value={name}
            onInput={(event) => {
              setName(event.currentTarget.value);
              setError("");
            }}
            placeholder="Ej. Tren superior"
          />
        </label>
        {error && <span class="exercise-media-error">{error}</span>}
        <div class="form-actions">
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            <Icon name="folderPlus" size={15} /> Crear grupo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ExerciseForm({ exercise, onClose, onSave, onDeleteCustomMuscle }) {
  const [form, setForm] = useState(() =>
    exercise
      ? normalizeExerciseData(exercise)
      : {
          name: "",
          muscle: "Pecho",
          secondary: [],
          equipment: "Mancuernas",
          sets: 3,
          reps: "8–12",
          trackSets: true,
          trackReps: true,
          rest: 90,
          duration: 25,
          description: "",
          cues: ["Mantén una postura cómoda durante todo el movimiento"],
          templateNote: "",
          accent: "violet",
        },
  );
  const bundledOriginal = exercise
    ? bundledExerciseById.get(exercise.id)
    : null;
  const nameInputValue =
    bundledOriginal && form.name === bundledOriginal.name
      ? translateText(form.name)
      : form.name;
  const descriptionInputValue =
    bundledOriginal && form.description === bundledOriginal.description
      ? translateText(form.description)
      : form.description;
  const cueInputValue = Array.isArray(form.cues)
    ? form.cues.map(translateText).join("\n")
    : form.cues;
  const fileInput = useRef(null);
  const previewInput = useRef(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [removePreview, setRemovePreview] = useState(false);
  const [manualPreview, setManualPreview] = useState(false);
  const [fileError, setFileError] = useState("");
  const localMediaUrl = useMemo(
    () => (mediaFile ? URL.createObjectURL(mediaFile) : ""),
    [mediaFile],
  );
  const localPreviewUrl = useMemo(
    () => (previewFile ? URL.createObjectURL(previewFile) : ""),
    [previewFile],
  );
  useEffect(
    () => () => {
      if (localMediaUrl) URL.revokeObjectURL(localMediaUrl);
    },
    [localMediaUrl],
  );
  useEffect(
    () => () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    },
    [localPreviewUrl],
  );
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const chooseDemoMedia = async (file) => {
    if (!file) return;
    const maxSize = file.type.startsWith("video/")
      ? 60 * 1024 * 1024
      : 15 * 1024 * 1024;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setFileError("Elige una imagen o un vídeo.");
      return;
    }
    if (file.size > maxSize) {
      setFileError(
        `El archivo supera el máximo de ${file.type.startsWith("video/") ? "60 MB" : "15 MB"}.`,
      );
      return;
    }
    setFileError("");
    setMediaFile(file);
    setRemoveMedia(false);
    if (!manualPreview && file.type.startsWith("video/")) {
      const poster = await createVideoPoster(file);
      if (poster) {
        setPreviewFile(poster);
        setRemovePreview(false);
      }
    } else if (!manualPreview && file.type.startsWith("image/")) {
      setPreviewFile(null);
      setRemovePreview(true);
    }
  };
  const choosePreview = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("La imagen de vista previa debe ser una foto.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFileError("La imagen de vista previa no puede superar 15 MB.");
      return;
    }
    setFileError("");
    setPreviewFile(file);
    setManualPreview(true);
    setRemovePreview(false);
  };
  const onSubmit = (event) => {
    event.preventDefault();
    const cues = Array.isArray(form.cues)
      ? form.cues
      : form.cues
          .split("\n")
          .map((cue) => cue.trim())
          .filter(Boolean);
    onSave({
      ...normalizeExerciseData(form),
      id: form.id || uid(),
      sets: boundedIntegerValue(form.sets, 1, 20, 3),
      rest: boundedIntegerValue(form.rest, 0, 600, 90),
      duration: Number(form.duration),
      cues,
      secondary:
        typeof form.secondary === "string"
          ? form.secondary
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
          : form.secondary,
      mediaFile,
      previewFile,
      removeMedia,
      removePreview,
    });
  };
  const previewExercise = {
    ...form,
    mediaAssetId: mediaFile || removeMedia ? null : form.mediaAssetId,
    previewAssetId: previewFile || removePreview ? null : form.previewAssetId,
    mediaType: mediaFile?.type || (removeMedia ? "" : form.mediaType),
    media: mediaFile ? localMediaUrl : removeMedia ? "" : form.media,
    poster: localPreviewUrl || (removePreview || mediaFile ? "" : form.poster),
  };
  return (
    <Modal title="Guardar ejercicio" onClose={onClose}>
      <form class="exercise-form" onSubmit={onSubmit}>
        <div class="eyebrow">BIBLIOTECA PERSONAL</div>
        <h2>{exercise ? "Editar ejercicio" : "Nuevo ejercicio"}</h2>
        <p>Define los detalles que te ayudan a entrenar mejor.</p>
        <label>
          Nombre del ejercicio
          <input
            required
            autoFocus
            maxLength="80"
            value={nameInputValue}
            onInput={(e) => change("name", e.currentTarget.value.slice(0, 80))}
            placeholder="Ej. Press inclinado con mancuernas"
          />
        </label>
        {bundledOriginal && form.name !== bundledOriginal.name && (
          <BuiltinNameWarning
            originalName={bundledOriginal.name}
            onRestore={() => change("name", bundledOriginal.name)}
          />
        )}
        <div class="exercise-media-editor">
          <div class="exercise-media-editor-head">
            <div>
              <strong>Vídeo o foto de demostración</strong>
              <span>
                El vídeo conserva una portada automática. Puedes elegir otra
                abajo.
              </span>
            </div>
            <Button
              variant="quiet"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload" size={14} /> Elegir
            </Button>
          </div>
          <input
            ref={fileInput}
            class="visually-hidden"
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            aria-label="Elegir foto o vídeo del ejercicio"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              chooseDemoMedia(file);
            }}
          />
          {(mediaFile || hasExerciseDemoMedia(previewExercise)) && (
            <div
              class={`exercise-media-editor-preview ${mediaFile?.type.startsWith("video/") || isExerciseDemoVideo(previewExercise) ? "exercise-media-editor-preview-video" : ""}`}
            >
              {mediaFile ? (
                mediaFile.type.startsWith("video/") ? (
                  <video src={localMediaUrl} muted autoPlay loop playsInline />
                ) : (
                  <img src={localMediaUrl} alt="Foto de demostración" />
                )
              ) : (
                <ExerciseThumb exercise={previewExercise} large animate />
              )}
            </div>
          )}
          <div class="exercise-preview-upload">
            <div>
              <strong>Imagen de vista previa</strong>
              <small>En vídeos se genera una portada automáticamente.</small>
            </div>
            <input
              ref={previewInput}
              class="visually-hidden"
              type="file"
              accept="image/*"
              aria-label="Elegir imagen de vista previa"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                choosePreview(file);
              }}
            />
            <Button
              variant="quiet"
              type="button"
              className="exercise-preview-choose"
              title={translateText("Elegir imagen de vista previa")}
              aria-label={translateText("Elegir imagen de vista previa")}
              onClick={() => previewInput.current?.click()}
            >
              <Icon name="upload" size={14} /> Elegir
            </Button>
          </div>
          <div class="exercise-preview-thumb">
            {previewFile ? (
              <img src={localPreviewUrl} alt="Imagen de vista previa" />
            ) : (form.previewAssetId || form.poster) && !removePreview ? (
              <ExerciseThumb exercise={previewExercise} />
            ) : (
              <span>
                <Icon name="image" size={16} /> Sin portada personalizada
              </span>
            )}
          </div>
          {fileError && <span class="exercise-media-error">{fileError}</span>}
          {(mediaFile || form.mediaAssetId) && (
            <button
              type="button"
              class="text-button exercise-media-remove"
              onClick={() => {
                setMediaFile(null);
                setRemoveMedia(true);
                setFileError("");
              }}
            >
              Quitar demostración
            </button>
          )}
          {(previewFile || form.previewAssetId) && (
            <button
              type="button"
              class="text-button exercise-media-remove"
              onClick={() => {
                setPreviewFile(null);
                setManualPreview(false);
                setRemovePreview(true);
                if (mediaFile?.type.startsWith("video/"))
                  setFileError(
                    "Puedes elegir una portada o volver a seleccionar el vídeo para generarla automáticamente.",
                  );
              }}
            >
              Quitar imagen de vista previa
            </button>
          )}
        </div>
        <div class="form-row">
          <label>
            Músculo principal
            <select
              value={form.muscle}
              onChange={(e) => change("muscle", e.currentTarget.value)}
            >
              {[
                "Pecho",
                "Espalda",
                "Piernas",
                "Glúteos",
                "Hombros",
                "Bíceps",
                "Tríceps",
                "Antebrazo",
                "Abdominales",
                "Isquiotibiales",
                "Cuádriceps",
                "Pantorrillas",
                "Cuello",
              ].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Equipamiento
            <select
              value={form.equipment}
              onChange={(e) => change("equipment", e.currentTarget.value)}
            >
              {[
                "Barra",
                "Mancuernas",
                "Polea",
                "Máquina",
                "Peso corporal",
                "Kettlebell",
                "Otro",
              ].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <MusclePicklist
          value={form.secondary}
          onChange={(value) => change("secondary", value)}
          onDeleteCustom={onDeleteCustomMuscle}
        />
        <fieldset class="exercise-tracking-options">
          <legend>Qué registrar</legend>
          <label>
            <input
              type="checkbox"
              checked={form.trackSets !== false}
              onChange={(event) =>
                change("trackSets", event.currentTarget.checked)
              }
            />
            <span>Series</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.trackReps !== false}
              onChange={(event) =>
                change("trackReps", event.currentTarget.checked)
              }
            />
            <span>Repeticiones o duración</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.trackSets !== false && form.trackWeight !== false}
              disabled={form.trackSets === false}
              onChange={(event) =>
                change("trackWeight", event.currentTarget.checked)
              }
            />
            <span>Incluir peso</span>
          </label>
        </fieldset>
        <div
          class={
            form.trackSets !== false || form.trackReps !== false
              ? "form-row three exercise-dose-fields"
              : "form-row three exercise-dose-fields is-activity-only"
          }
        >
          {form.trackSets !== false && (
            <label>
              Series
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                max="20"
                required
                value={form.sets}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  change(
                    "sets",
                    value === "" ? "" : boundedIntegerValue(value, 1, 20, 20),
                  );
                }}
                onBlur={() =>
                  change("sets", boundedIntegerValue(form.sets, 1, 20, 3))
                }
              />
            </label>
          )}
          {form.trackReps !== false && (
            <label>
              Repeticiones o duración
              <input
                maxLength="40"
                value={form.reps}
                onInput={(e) => change("reps", e.currentTarget.value.slice(0, 40))}
                placeholder="Ej. 8–12 o 20 min"
              />
            </label>
          )}
          {form.trackSets !== false && (
            <label>
              Descanso (s)
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                max="600"
                value={form.rest}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  change(
                    "rest",
                    value === "" ? "" : boundedIntegerValue(value, 0, 600, 600),
                  );
                }}
                onBlur={() =>
                  change("rest", boundedIntegerValue(form.rest, 0, 600, 90))
                }
              />
            </label>
          )}
        </div>
        <label>
          Cómo se realiza
          <textarea
            rows="3"
            maxLength="1000"
            value={descriptionInputValue}
            onInput={(e) => change("description", e.currentTarget.value.slice(0, 1000))}
            placeholder="Describe el movimiento, el equipo y la postura."
          />
        </label>
        <label>
          Puntos clave · uno por línea
          <textarea
            rows="3"
            maxLength="1000"
            value={cueInputValue}
            onInput={(e) => change("cues", e.currentTarget.value.slice(0, 1000))}
            placeholder={
              "Ajusta la postura\nControla el recorrido\nRespira durante el esfuerzo"
            }
          />
        </label>
        <label>
          Comentario de plantilla · opcional
          <textarea
            rows="2"
            maxLength="500"
            value={form.templateNote || ""}
            onInput={(e) => change("templateNote", e.currentTarget.value)}
            placeholder="Una nota que aparecerá al empezar cada sesión"
          />
        </label>
        <div class="form-actions">
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            <Icon name="check" size={15} /> Guardar ejercicio
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function WorkoutExercisePicker({
  mode,
  muscles,
  muscle,
  query,
  count,
  results,
  shown,
  onMuscle,
  onQuery,
  onCount,
  onChoose,
  onPreview,
  onClose,
}) {
  const replacing = mode === "replace";
  return (
    <section
      class="workout-exercise-picker-screen"
      role="dialog"
      aria-modal="true"
      aria-label={replacing ? "Cambiar ejercicio" : "Añadir ejercicio"}
    >
      <div class="picker-screen-inner">
        <header class="picker-screen-header">
          <div>
            <div class="eyebrow">BIBLIOTECA DE MOVIMIENTOS</div>
            <h2>
              {replacing ? "Cambiar ejercicio" : "Añadir ejercicio"}
              <span class="welcome-dot">.</span>
            </h2>
            <p>
              {replacing
                ? "Elige un movimiento para sustituir el actual."
                : "Encuentra el siguiente movimiento de tu sesión."}
            </p>
          </div>
          <button
            type="button"
            class="icon-button picker-screen-close"
            onClick={onClose}
            aria-label="Cerrar biblioteca"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <label class="search-box picker-screen-search">
          <Icon name="search" size={18} />
          <input
            autoFocus
            value={query}
            onInput={(event) => onQuery(event.currentTarget.value)}
            placeholder="Buscar ejercicio, músculo o equipo"
          />
        </label>
        <div
          class="exercise-picker-categories"
          role="group"
          aria-label="Filtrar ejercicios por músculo"
        >
          {muscles.map((item) => (
            <button
              type="button"
              class={muscle === item ? "selected" : ""}
              aria-pressed={muscle === item}
              onClick={() => onMuscle(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <div class="picker-screen-count">
          {results.length}{" "}
          {results.length === 1
            ? "ejercicio disponible"
            : "ejercicios disponibles"}
        </div>
        <div class="picker-screen-list">
          {shown.length ? (
            <div class="picker-scroll">
              {shown.map((exercise) => (
                <article
                  class="session-picker-row picker-screen-row"
                  key={exercise.id}
                >
                  <button
                    type="button"
                    class="session-picker-preview"
                    onClick={() => onPreview(exercise)}
                  >
                    <span class="picker-visual">
                      {<ExerciseThumb exercise={exercise} />}
                    </span>
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exerciseMuscleLine(exercise)} ·{" "}
                        {exerciseDoseLabel(exercise)} · {exercise.equipment}
                      </small>
                      <em>{exercise.cues?.[0] || exercise.description}</em>
                    </span>
                  </button>
                  <Button variant="quiet" onClick={() => onChoose(exercise.id)}>
                    <Icon name={replacing ? "swap" : "plus"} size={16} />
                    <span>{replacing ? "Cambiar" : "Añadir"}</span>
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div class="empty-inline picker-screen-empty">
              No hay ejercicios con estos filtros. Prueba otro músculo o
              búsqueda.
            </div>
          )}
          {count < results.length && (
            <div class="picker-result-actions">
              <button
                type="button"
                class="text-button"
                onClick={() => onCount(Math.min(count + 30, results.length))}
              >
                Mostrar más
              </button>
              <button
                type="button"
                class="text-button"
                onClick={() => onCount(results.length)}
              >
                Mostrar todos ({results.length})
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function WorkoutModal({
  exercises,
  workouts,
  routine,
  session,
  onPause,
  onResume,
  onCancel,
  onFinish,
  unit,
  nativeTimerAvailable,
}) {
  const startTime = session.startedAt;
  const storedDraft = loadJson("profit-active-draft", null);
  const draftMatches = storedDraft?.startedAt === startTime;
  const savedDraft = draftMatches
    ? {
        ...storedDraft,
        selected: storedDraft.selected || [],
        sets: storedDraft.sets || {},
        linkedSetFields: storedDraft.linkedSetFields || {},
        setCounts: storedDraft.setCounts || {},
        restSeconds: storedDraft.restSeconds || {},
        restEndsAt: storedDraft.restEndsAt || {},
        completedSets: storedDraft.completedSets || {},
        exerciseNotes: storedDraft.exerciseNotes || {},
      }
    : storedDraft;
  const lastRestByExercise = useMemo(() => {
    const latest = {};
    [...(workouts || [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((workout) => {
        (workout.exercises || []).forEach((entry) => {
          if (
            latest[entry.id] === undefined &&
            Number.isFinite(Number(entry.restSeconds))
          )
            latest[entry.id] = safeRestSeconds(entry.restSeconds);
        });
      });
    return latest;
  }, [workouts]);
  const [selected, setSelected] = useState(() =>
    draftMatches ? savedDraft.selected : routine?.exercises || [],
  );
  const [openExerciseOptions, setOpenExerciseOptions] = useState(null);
  const [sets, setSets] = useState(() => (draftMatches ? savedDraft.sets : {}));
  const [linkedSetFields, setLinkedSetFields] = useState(() =>
    draftMatches ? savedDraft.linkedSetFields || {} : {},
  );
  const [setCounts, setSetCounts] = useState(() =>
    draftMatches
      ? Object.fromEntries(
          Object.entries(savedDraft.setCounts || {}).map(([id, value]) => [
            id,
            safeSetCount(value, 1),
          ]),
        )
      : Object.fromEntries(
          (routine?.exercises || []).map((id) => {
            const templateSets = routine?.exerciseSettings?.[id]?.sets;
            const exerciseDefault =
              exercises.find((exercise) => exercise.id === id)?.sets || 3;
            return [
              id,
              templateSets === undefined || templateSets === null
                ? exerciseDefault
                : safeSetCount(templateSets, 1),
            ];
          }),
        ),
  );
  const [restSeconds, setRestSeconds] = useState(() =>
    draftMatches && savedDraft.restSeconds
      ? savedDraft.restSeconds
      : Object.fromEntries(
          (routine?.exercises || []).map((id) => {
            const exercise = exercises.find((item) => item.id === id);
            return [
              id,
              safeRestSeconds(
                routine?.exerciseSettings?.[id]?.restSeconds ??
                  lastRestByExercise[id] ??
                  exercise?.rest ??
                  60,
              ),
            ];
          }),
        ),
  );
  const [restEndsAt, setRestEndsAt] = useState(() =>
    draftMatches ? savedDraft.restEndsAt || {} : {},
  );
  const finishedRestTimers = useRef(new Set());
  const [completedSets, setCompletedSets] = useState(() =>
    draftMatches
      ? savedDraft.completedSets || savedDraft.previousApplied || {}
      : {},
  );
  const [exerciseNotes, setExerciseNotes] = useState(() =>
    draftMatches
      ? savedDraft.exerciseNotes || {}
      : Object.fromEntries(
          (routine?.exercises || []).map((id) => [
            id,
            String(
              routine?.exerciseSettings?.[id]?.comment ??
                exercises.find((exercise) => exercise.id === id)
                  ?.templateNote ??
                "",
            ),
          ]),
        ),
  );
  const [lastNoticeMinute, setLastNoticeMinute] = useState(() =>
    draftMatches ? savedDraft.lastNoticeMinute || 0 : 0,
  );
  const [sessionNotice, setSessionNoticeState] = useState("");
  const setSessionNotice = (message) => {
    if (isWarningMessage(message)) playWarningSound();
    setSessionNoticeState(message);
  };
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "unsupported",
  );
  const [sessionName, setSessionName] = useState(
    routine?.name || translateText("Entrenamiento libre"),
  );
  const [now, setNow] = useState(Date.now());
  const [finalElapsedSeconds, setFinalElapsedSeconds] = useState(null);
  const [wasPausedBeforeFinish, setWasPausedBeforeFinish] = useState(false);
  const [confirmDuration, setConfirmDuration] = useState(false);
  const [incompleteExerciseCount, setIncompleteExerciseCount] =
    useState(null);
  const [adjustDuration, setAdjustDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCount, setPickerCount] = useState(30);
  const [pickerMuscle, setPickerMuscle] = useState("Todos");
  const [pickerMode, setPickerMode] = useState(null);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [preview, setPreview] = useState(null);
  const lastPerformance = useMemo(() => {
    const latest = {};
    [...(workouts || [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((workout) => {
        workout.exercises.forEach((entry) => {
          if (latest[entry.id] == null && entry.sets.length)
            latest[entry.id] = entry.sets.at(-1);
        });
      });
    return latest;
  }, [workouts]);
  const lastActivityTime = useMemo(() => {
    const latest = {};
    [...(workouts || [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((workout) => {
        workout.exercises.forEach((entry) => {
          const value = Number(entry.activityValue);
          if (latest[entry.id] == null && entry.activityComplete && value > 0)
            latest[entry.id] = value;
        });
      });
    return latest;
  }, [workouts]);
  const elapsedAt = (timestamp) =>
    Math.max(
      0,
      (session.elapsedMs || 0) +
        (session.paused
          ? 0
          : timestamp - (session.segmentStartedAt ?? startTime)),
    );
  const liveElapsedMs = elapsedAt(now);
  const elapsedSeconds =
    finalElapsedSeconds ?? Math.floor(liveElapsedMs / 1000);
  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    const interval = window.setInterval(updateClock, 1000);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, []);
  useEffect(() => {
    const expired = Object.entries(restEndsAt).filter(
      ([, endsAt]) => Number(endsAt) > 0 && Number(endsAt) <= now,
    );
    const newlyExpired = expired.filter(([id, endsAt]) => {
      const key = `${id}:${endsAt}`;
      if (finishedRestTimers.current.has(key)) return false;
      finishedRestTimers.current.add(key);
      return true;
    });
    if (!newlyExpired.length) return;
    playRestFinishedSound();
    const expiredTimes = new Map(newlyExpired);
    setRestEndsAt((current) => {
      let changed = false;
      const next = { ...current };
      expiredTimes.forEach((endsAt, id) => {
        if (Number(next[id]) === Number(endsAt)) {
          next[id] = 0;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [now, restEndsAt]);
  useEffect(() => {
    localStorage.setItem(
      "profit-active-draft",
      JSON.stringify({
        startedAt: startTime,
        selected,
        sets,
        linkedSetFields,
        setCounts,
        restSeconds,
        restEndsAt,
        completedSets,
        exerciseNotes,
        lastNoticeMinute,
      }),
    );
  }, [
    startTime,
    selected,
    sets,
    linkedSetFields,
    setCounts,
    restSeconds,
    restEndsAt,
    completedSets,
    exerciseNotes,
    lastNoticeMinute,
  ]);
  useEffect(() => {
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    let noticeMinute = null;
    let nextMinute = nextWorkoutNotice(lastNoticeMinute);
    while (nextMinute <= elapsedMinutes) {
      noticeMinute = nextMinute;
      nextMinute = nextWorkoutNotice(nextMinute);
    }
    if (noticeMinute === null) return;
    const message = `Llevas ${noticeMinute} minutos entrenando. Escucha tu cuerpo y continúa a tu ritmo.`;
    setLastNoticeMinute(noticeMinute);
    setSessionNotice(message);
    if (notificationPermission === "granted") {
      try {
        playNotificationSound();
        new window.Notification("ProFit · tiempo de sesión", {
          body: message,
          tag: "profit-session-time",
        });
      } catch {
        /* Aviso en pantalla sigue disponible si el sistema lo bloquea. */
      }
    }
  }, [elapsedSeconds, lastNoticeMinute, notificationPermission]);
  useEffect(() => {
    if (!sessionNotice) return;
    const timeout = window.setTimeout(() => setSessionNotice(""), 6500);
    return () => window.clearTimeout(timeout);
  }, [sessionNotice]);
  useEffect(() => {
    if (incompleteExerciseCount !== null) playWarningSound();
  }, [incompleteExerciseCount]);
  const pickerMuscles = getExerciseMuscleFilters(exercises);
  const filteredPickerExercises = exercises.filter(
    (exercise) =>
      (!selected.includes(exercise.id) ||
        (pickerMode === "replace" && selected[replaceIndex] === exercise.id)) &&
      exerciseMatchesMuscleFilter(exercise, pickerMuscle) &&
      matchesSearchQuery(pickerQuery, exerciseSearchValues(exercise)),
  );
  const shownPickerExercises = filteredPickerExercises.slice(0, pickerCount);
  const parseSessionDecimal = (value) => {
    const parsed = parseLocalizedDecimal(value);
    return Number.isNaN(parsed) ? (String(value ?? "").trim() ? Number.NaN : 0) : parsed;
  };
  const update = (exerciseId, index, key, value) => {
    const selectedExercise = exercises.find(
      (exercise) => exercise.id === exerciseId,
    );
    const isTimedActivity =
      key === "reps" &&
      !exerciseTracksSets(selectedExercise) &&
      !exerciseTracksReps(selectedExercise);
    const numericValue =
      key === "weight" || isTimedActivity
        ? parseSessionDecimal(value)
        : Number(value);
    const count = exerciseTracksSets(selectedExercise)
      ? setCounts[exerciseId] || selectedExercise?.sets || 3
      : 1;
    const otherRowsAreEmpty =
      index === 0 &&
      count > 1 &&
      Array.from({ length: count - 1 }, (_, rowIndex) => rowIndex + 1).every(
        (rowIndex) =>
          (key === "weight" || isTimedActivity
            ? parseSessionDecimal(sets[exerciseId]?.[rowIndex]?.[key])
            : Number(sets[exerciseId]?.[rowIndex]?.[key] || 0)) === 0,
      );
    const shouldKeepLinked =
      index === 0 &&
      Boolean(
        linkedSetFields[exerciseId]?.[key] ||
        (numericValue > 0 && otherRowsAreEmpty),
      );
    setSets((current) => {
      const rows = { ...(current[exerciseId] || {}) };
      const nextValue = key === "weight" || isTimedActivity ? String(value) : numericValue;
      rows[index] = { ...(rows[index] || {}), [key]: nextValue };
      if (shouldKeepLinked) {
        for (let rowIndex = 1; rowIndex < count; rowIndex += 1)
          rows[rowIndex] = { ...(rows[rowIndex] || {}), [key]: nextValue };
      }
      return { ...current, [exerciseId]: rows };
    });
    setLinkedSetFields((current) => ({
      ...current,
      [exerciseId]: { ...(current[exerciseId] || {}), [key]: shouldKeepLinked },
    }));
  };
  const toggleSetComplete = (exerciseId, index, checked) => {
    const exercise = exercises.find((item) => item.id === exerciseId);
    const previous = lastPerformance[exerciseId];
    const previousActivity =
      lastActivityTime[exerciseId] ||
      Number(routine?.exerciseSettings?.[exerciseId]?.targetMinutes) ||
      0;
    const isActivity = !exerciseTracksSets(exercise);
    const count = exerciseTracksSets(exercise)
      ? setCounts[exerciseId] || exercise?.sets || 3
      : 1;
    const wasChecked = Boolean(completedSets[exerciseId]?.[index]);
    const completingExercise =
      checked &&
      !wasChecked &&
      Array.from(
        { length: count },
        (_, rowIndex) =>
          rowIndex === index || Boolean(completedSets[exerciseId]?.[rowIndex]),
      ).every(Boolean);
    if (completingExercise) playExerciseCompletedSound();
    setCompletedSets((current) => ({
      ...current,
      [exerciseId]: { ...(current[exerciseId] || {}), [index]: checked },
    }));
    setLinkedSetFields((current) => ({
      ...current,
      [exerciseId]: {
        ...(current[exerciseId] || {}),
        weight: false,
        reps: false,
      },
    }));
    if (checked) {
      setSets((current) => {
        const row = current[exerciseId]?.[index] || {};
        return {
          ...current,
          [exerciseId]: {
            ...(current[exerciseId] || {}),
            [index]: {
              weight: exerciseTracksWeight(exercise)
                ? parseSessionDecimal(row.weight) > 0
                  ? row.weight
                  : previous
                    ? Math.round(
                        (unit === "lb"
                          ? previous.weight * 2.20462
                          : previous.weight) * 10,
                      ) / 10
                    : 0
                : 0,
              reps: isActivity
                ? row.reps > 0
                  ? row.reps
                  : previousActivity
                : exerciseTracksReps(exercise)
                  ? row.reps > 0
                    ? row.reps
                    : previous?.reps || 0
                  : 0,
            },
          },
        };
      });
    }
  };
  const completeExercise = (exerciseId) => {
    const exercise = exercises.find((item) => item.id === exerciseId);
    const count = exerciseTracksSets(exercise)
      ? setCounts[exerciseId] || exercise?.sets || 3
      : 1;
    const allComplete = Array.from({ length: count }, (_, index) =>
      Boolean(completedSets[exerciseId]?.[index]),
    ).every(Boolean);
    if (allComplete) {
      setCompletedSets((current) => ({
        ...current,
        [exerciseId]: {
          ...(current[exerciseId] || {}),
          ...Object.fromEntries(
            Array.from({ length: count }, (_, index) => [index, false]),
          ),
        },
      }));
      return;
    }
    playExerciseCompletedSound();
    const previous = lastPerformance[exerciseId];
    const previousActivity =
      lastActivityTime[exerciseId] ||
      Number(routine?.exerciseSettings?.[exerciseId]?.targetMinutes) ||
      0;
    const isActivity = !exerciseTracksSets(exercise);
    const previousWeight = previous
      ? Math.round(
          (unit === "lb" ? previous.weight * 2.20462 : previous.weight) * 10,
        ) / 10
      : 0;
    setCompletedSets((current) => ({
      ...current,
      [exerciseId]: {
        ...(current[exerciseId] || {}),
        ...Object.fromEntries(
          Array.from({ length: count }, (_, index) => [index, true]),
        ),
      },
    }));
    setLinkedSetFields((current) => ({
      ...current,
      [exerciseId]: {
        ...(current[exerciseId] || {}),
        weight: false,
        reps: false,
      },
    }));
    setSets((current) => {
      const rows = { ...(current[exerciseId] || {}) };
      for (let index = 0; index < count; index += 1) {
        const row = rows[index] || {};
        rows[index] = {
          weight: exerciseTracksWeight(exercise)
            ? parseSessionDecimal(row.weight) > 0
              ? row.weight
              : previousWeight
            : 0,
          reps: isActivity
            ? Number(row.reps) > 0
              ? row.reps
              : previousActivity
            : exerciseTracksReps(exercise)
              ? Number(row.reps) > 0
                ? row.reps
                : previous?.reps || 0
              : 0,
        };
      }
      return { ...current, [exerciseId]: rows };
    });
  };
  const openSystemNotificationSettings = () =>
    WorkoutNotification.openSettings().catch(() =>
      setSessionNotice(
        "Activa las notificaciones de ProFit desde los ajustes del sistema.",
      ),
    );
  const requestTimeNotifications = async () => {
    if (!("Notification" in window)) {
      setSessionNotice(
        "Los avisos aparecerán en esta pantalla mientras la sesión esté abierta.",
      );
      return;
    }
    try {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      setSessionNotice(
        permission === "granted"
          ? "Avisos de tiempo activados."
          : "Puedes activar los avisos desde los ajustes de Android.",
      );
    } catch {
      setSessionNotice(
        "Los avisos en pantalla siguen activos durante la sesión.",
      );
    }
  };
  const hasLoggedSet = selected.some((id) => {
    const exercise = exercises.find((item) => item.id === id);
    const count = exerciseTracksSets(exercise)
      ? setCounts[id] || exercise?.sets || 3
      : 1;
    return Array.from(
      { length: count },
      (_, index) =>
        completedSets[id]?.[index] &&
        (!exerciseTracksWeight(exercise) ||
          (Number.isFinite(parseSessionDecimal(sets[id]?.[index]?.weight)) &&
            parseSessionDecimal(sets[id]?.[index]?.weight) >= 0)) &&
        (!exerciseTracksReps(exercise) || Number(sets[id]?.[index]?.reps) > 0),
    ).some(Boolean);
  });
  const openPicker = (mode, index = null) => {
    setPickerQuery("");
    setPickerCount(30);
    setReplaceIndex(index);
    setPickerMode(mode);
  };
  const chooseExercise = (id) => {
    const exercise = exercises.find((item) => item.id === id);
    if (!exercise) return;
    if (pickerMode === "replace" && replaceIndex !== null) {
      const previous = selected[replaceIndex];
      if (previous === id) {
        setPickerMode(null);
        setReplaceIndex(null);
        return;
      }
      setSelected((current) =>
        current.map((item, index) => (index === replaceIndex ? id : item)),
      );
      if (
        previous &&
        !selected.some(
          (item, index) => item === previous && index !== replaceIndex,
        )
      ) {
        setSets((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
        setLinkedSetFields((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
        setSetCounts((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
        setCompletedSets((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
        setExerciseNotes((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
        setRestSeconds((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
        setRestEndsAt((current) => {
          const next = { ...current };
          delete next[previous];
          return next;
        });
      }
    } else {
      setSelected((current) => [...current, id]);
    }
    setSetCounts((current) => ({
      ...current,
      [id]:
        current[id] || (exerciseTracksSets(exercise) ? exercise.sets || 3 : 1),
    }));
    setExerciseNotes((current) => ({
      ...current,
      [id]: current[id] ?? exercise.templateNote ?? "",
    }));
    setRestSeconds((current) => ({
      ...current,
      [id]: safeRestSeconds(
        routine?.exerciseSettings?.[id]?.restSeconds ??
          lastRestByExercise[id] ??
          exercise.rest ??
          60,
      ),
    }));
    setPickerMode(null);
    setReplaceIndex(null);
  };
  const changeSetCount = (id, difference) => {
    const selectedExercise = exercises.find((exercise) => exercise.id === id);
    const currentCount = exerciseTracksSets(selectedExercise)
      ? safeSetCount(setCounts[id], safeSetCount(selectedExercise?.sets, 3))
      : 1;
    const nextCount = Math.min(30, Math.max(1, currentCount + difference));
    if (difference < 0) {
      setSets((current) => {
        const next = { ...current, [id]: { ...(current[id] || {}) } };
        delete next[id][nextCount];
        return next;
      });
      setCompletedSets((current) => {
        const next = { ...current, [id]: { ...(current[id] || {}) } };
        delete next[id][nextCount];
        return next;
      });
    }
    setSetCounts((current) => ({ ...current, [id]: nextCount }));
  };
  const toggleRestTimer = (id) => {
    const activeUntil = Number(restEndsAt[id]) || 0;
    if (activeUntil > Date.now()) {
      setRestEndsAt((current) => ({ ...current, [id]: 0 }));
      return;
    }
    const seconds = safeRestSeconds(restSeconds[id], 60);
    if (seconds <= 0) return;
    setRestEndsAt((current) => ({ ...current, [id]: Date.now() + seconds * 1000 }));
  };
  const removeExercise = (id) => {
    setSelected((current) => current.filter((item) => item !== id));
    setSets((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setLinkedSetFields((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSetCounts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setCompletedSets((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setExerciseNotes((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setRestSeconds((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setRestEndsAt((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };
  const reorderSessionExercise = (from, to) => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= selected.length ||
      to >= selected.length
    )
      return;
    setSelected((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const finish = () => {
    const incompleteCount = selected.reduce((count, id) => {
      const exercise = exercises.find((item) => item.id === id);
      if (!exercise) return count;
      const expectedCount = exerciseTracksSets(exercise)
        ? safeSetCount(setCounts[id], safeSetCount(exercise.sets, 3))
        : 1;
      const isComplete = Array.from(
        { length: expectedCount },
        (_, index) => Boolean(completedSets[id]?.[index]),
      ).every(Boolean);
      return count + (isComplete ? 0 : 1);
    }, 0);
    if (incompleteCount > 0) {
      setIncompleteExerciseCount(incompleteCount);
      return;
    }
    continueFinish();
  };
  const continueFinish = () => {
    const wasPaused = session.paused;
    const finishTime = Date.now();
    const finalElapsedMs = elapsedAt(finishTime);
    const finalSeconds = Math.floor(finalElapsedMs / 1000);
    setWasPausedBeforeFinish(wasPaused);
    if (!wasPaused) onPause(finalElapsedMs);
    setNow(finishTime);
    setFinalElapsedSeconds(finalSeconds);
    setDurationInput(String(Math.max(1, Math.round(finalSeconds / 60))));
    setConfirmDuration(true);
  };
  const returnToSession = () => {
    setConfirmDuration(false);
    setAdjustDuration(false);
    setFinalElapsedSeconds(null);
    if (!wasPausedBeforeFinish) onResume();
  };
  const saveWorkout = (duration) => {
    const entries = selected
      .map((id) => {
        const exercise = exercises.find((item) => item.id === id);
        if (!exercise) return null;
        const tracksSets = exerciseTracksSets(exercise);
        const tracksReps = exerciseTracksReps(exercise);
        const tracksWeight = exerciseTracksWeight(exercise);
        const complete = tracksSets
          ? Array.from(
              { length: setCounts[id] || exercise.sets || 3 },
              (_, index) =>
                completedSets[id]?.[index] ? sets[id]?.[index] : null,
            )
              .filter(
                (item) =>
                  (!tracksWeight ||
                    (Number.isFinite(parseSessionDecimal(item?.weight)) &&
                      parseSessionDecimal(item?.weight) >= 0)) &&
                  (!tracksReps || Number(item?.reps) > 0),
              )
              .map((item) => ({
                ...item,
                weight: !tracksWeight
                  ? 0
                  : unit === "lb"
                    ? parseSessionDecimal(item.weight) / 2.20462
                    : parseSessionDecimal(item.weight),
              }))
          : [];
        const activityComplete = !tracksSets && Boolean(completedSets[id]?.[0]);
        return normalizeExerciseData({
          id,
          name: exercise.name,
          muscle: exercise.muscle,
          secondary: exercise.secondary || [],
          equipment: exercise.equipment,
          duration: exercise.duration,
          description: exercise.description,
          cues: exercise.cues || [],
          trackSets: tracksSets,
          trackReps: tracksReps,
          trackWeight: tracksWeight,
          activityComplete,
          activityValue: activityComplete
            ? parseSessionDecimal(sets[id]?.[0]?.reps) || 0
            : null,
          restSeconds: tracksSets
            ? safeRestSeconds(restSeconds[id], 60)
            : undefined,
          sets: complete,
          note: exerciseNotes[id]?.trim() || "",
        });
      })
      .filter(
        (entry) => entry && (entry.sets.length || entry.activityComplete),
      );
    localStorage.removeItem("profit-active-draft");
    onFinish({
      id: uid(),
      date: dayOffset(0),
      name:
        sessionName.trim() ||
        routine?.name ||
        translateText("Entrenamiento libre"),
      routineId: routine?.id,
      duration: Math.max(1, Number(duration) || 1),
      exercises: entries,
    });
  };

  return (
    <>
      <Modal title="Entrenamiento" onClose={() => {}} wide dismissible={false}>
        <div class="workout-modal">
          {!confirmDuration ? (
            <>
              <div class="workout-modal-title">
                <div class="workout-title-line">
                  <div class="eyebrow">SESIÓN EN CURSO</div>

                  <div class="session-time-tools">
                    <div
                      class={`session-timer ${session.paused ? "paused" : ""}`}
                    >
                      <Icon name="clock" size={15} />
                      <strong>{formatElapsed(elapsedSeconds)}</strong>
                      <span>
                        {session.paused ? "en pausa" : "transcurrido"}
                      </span>
                    </div>

                    <Button
                      variant={session.paused ? "primary" : "quiet"}
                      className="session-pause-button"
                      aria-label={
                        session.paused
                          ? "Continuar entrenamiento"
                          : "Pausar entrenamiento"
                      }
                      onClick={() =>
                        session.paused
                          ? onResume()
                          : onPause(elapsedAt(Date.now()))
                      }
                    >
                      <Icon
                        name={session.paused ? "play" : "pause"}
                        size={14}
                      />
                      {session.paused ? "Continuar" : "Pausar entreno"}
                    </Button>

                    <button
                      type="button"
                      class="session-cancel-button"
                      onClick={onCancel}
                    >
                      <Icon name="trash" size={14} />
                      Cancelar
                    </button>

                    {notificationPermission === "default" &&
                      Capacitor.getPlatform() !== "android" && (
                        <button
                          type="button"
                          class="notification-enable"
                          onClick={requestTimeNotifications}
                        >
                          <Icon name="calendar" size={13} />
                          Activar avisos
                        </button>
                      )}

                    {notificationPermission === "granted" &&
                      Capacitor.getPlatform() !== "android" && (
                        <span class="notification-enabled">
                          Avisos activados
                        </span>
                      )}

                    {notificationPermission === "unsupported" &&
                      Capacitor.getPlatform() !== "android" && (
                        <span class="notification-enabled">
                          Avisos en pantalla
                        </span>
                      )}

                    {Capacitor.getPlatform() === "android" &&
                      (nativeTimerAvailable ? (
                        <span class="notification-enabled android-timer-status">
                          <Icon name="clock" size={12} />
                          Cronómetro del sistema
                        </span>
                      ) : (
                        <button
                          type="button"
                          class="notification-enable"
                          onClick={openSystemNotificationSettings}
                        >
                          <Icon name="settings" size={13} />
                          Activar avisos
                        </button>
                      ))}
                  </div>
                </div>

                <h2>
                  {routine?.name ? (
                    <span translate="no">{routine.name}</span>
                  ) : (
                    "Entrenamiento libre"
                  )}
                  <span class="welcome-dot">.</span>
                </h2>

                <p>
                  {routine
                    ? "La rutina carga sus ejercicios; puedes añadir o quitar movimientos para esta sesión."
                    : "Añade ejercicios y registra las series que completes."}{" "}
                  {session.paused
                    ? "El tiempo está detenido; tus series y comentarios se conservan."
                    : "El cronómetro sigue contando con la app en segundo plano."}
                </p>

                {sessionNotice && (
                  <div class="session-time-notice" role="status">
                    <Icon name="clock" size={15} />
                    <span>{sessionNotice}</span>
                    <button
                      type="button"
                      onClick={() => setSessionNotice("")}
                      aria-label="Cerrar aviso"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
              </div>

              {selected.length ? (
                <div class="session-entry-list">
                  {selected.map((id) => {
                    const exercise = exercises.find((item) => item.id === id);
                    if (!exercise) return null;

                    const tracksSets = exerciseTracksSets(exercise);
                    const tracksReps = exerciseTracksReps(exercise);
                    const tracksWeight = exerciseTracksWeight(exercise);
                    const setCount = tracksSets
                      ? setCounts[id] || exercise.sets || 3
                      : 1;
                    const targetReps =
                      routine?.exerciseSettings?.[id]?.reps ?? exercise.reps;
                    const targetMinutes =
                      Number(routine?.exerciseSettings?.[id]?.targetMinutes) || 0;
                    const restRemaining = Math.max(
                      0,
                      Math.ceil(((Number(restEndsAt[id]) || 0) - now) / 1000),
                    );
                    const allComplete = Array.from(
                      { length: setCount },
                      (_, setIndex) => Boolean(completedSets[id]?.[setIndex]),
                    ).every(Boolean);
                    const trackingClass = `${!tracksSets ? " no-set-track" : ""}${!tracksWeight ? " no-weight-track" : ""}${!tracksReps ? " no-rep-track" : ""}${!tracksSets && !tracksReps ? " has-duration" : ""}`;
                    const index = selected.indexOf(id);

                    return (
                      <div class="session-entry" key={id}>
                        <div class="session-entry-head">
                          <button
                            type="button"
                            class="session-exercise-preview"
                            onClick={() => setPreview(exercise)}
                          >
                            <span class="session-entry-visual">
                              {exercise.poster ||
                              exercise.media ||
                              exercise.mediaAssetId ||
                              exercise.previewAssetId ? (
                                <ExerciseThumb exercise={exercise} />
                              ) : (
                                <MuscleMap
                                  muscles={getMuscleFocus(exercise)}
                                  compact
                                />
                              )}
                            </span>

                            <span>
                              <strong>{exercise.name}</strong>
                              <small>{exerciseMuscleLine(exercise)}</small>
                              <em>Ver demostración</em>
                            </span>
                          </button>

                          <div class="session-entry-actions">
                            <button
                              type="button"
                              class="icon-button session-more-button"
                              aria-label={`Más opciones para ${exercise.name}`}
                              aria-expanded={openExerciseOptions === id}
                              onClick={() =>
                                setOpenExerciseOptions((current) =>
                                  current === id ? null : id,
                                )
                              }
                            >
                              <Icon name="ellipsis" size={18} />
                            </button>

                            {openExerciseOptions === id && (
                              <div class="session-entry-menu">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenExerciseOptions(null);
                                    openPicker("replace", index);
                                  }}
                                >
                                  <Icon name="swap" size={15} />
                                  Intercambiar
                                </button>

                                <button
                                  type="button"
                                  class="session-entry-menu-delete"
                                  onClick={() => {
                                    setOpenExerciseOptions(null);
                                    removeExercise(id);
                                  }}
                                >
                                  <Icon name="close" size={15} />
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div class="session-cue">
                          <Icon name="check" size={13} />
                          <span>
                            {exercise.cues?.[0] || exercise.description}
                          </span>
                        </div>

                        {routine && tracksReps && targetReps && (
                          <div class="session-template-target">
                            <Icon name="edit" size={12} />
                            <span>
                              {translateText("Objetivo de la rutina")} ·{" "}
                              {tracksSets ? `${setCount} × ` : ""}
                              {targetReps}{" "}
                              {isTimedPrescription(String(targetReps))
                                ? "s"
                                : "reps"}
                            </span>
                          </div>
                        )}
                        {routine && !tracksSets && !tracksReps && targetMinutes > 0 && (
                          <div class="session-template-target">
                            <Icon name="clock" size={12} />
                            <span>
                              {translateText("Objetivo de la rutina")} · {targetMinutes} min
                            </span>
                          </div>
                        )}

                        <div class="session-note-editor">
                          <textarea
                            rows="2"
                            maxLength="500"
                            value={exerciseNotes[id] || ""}
                            onInput={(event) =>
                              setExerciseNotes((current) => ({
                                ...current,
                                [id]: event.currentTarget.value,
                              }))
                            }
                            placeholder="Escribe un comentario…"
                            aria-label={`Comentario para ${exercise.name}`}
                          />
                        </div>

                        <div class="session-set-controls">
                          <span class="session-set-count">
                            {tracksSets
                              ? `${setCount} ${setCount === 1 ? "serie" : "series"}`
                              : "Actividad"}
                          </span>

                          <div>
                            <button
                              type="button"
                              class={`icon-button session-complete-exercise ${allComplete ? "is-complete" : ""}`}
                              aria-label={`${allComplete ? "Desmarcar" : "Completar"} ${tracksSets ? "todas las series" : "actividad"} de ${exercise.name}`}
                              title={
                                allComplete
                                  ? "Desmarcar todo"
                                  : tracksSets
                                    ? "Completar todas las series"
                                    : "Marcar actividad completada"
                              }
                              aria-pressed={allComplete}
                              onClick={() => completeExercise(id)}
                            >
                              <Icon name="check" size={16} />
                            </button>
                            {tracksSets && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => changeSetCount(id, -1)}
                                  disabled={setCount <= 1}
                                  aria-label={`Quitar serie de ${exercise.name}`}
                                >
                                  −
                                </button>

                                <button
                                  type="button"
                                  onClick={() => changeSetCount(id, 1)}
                                  aria-label={`Añadir serie a ${exercise.name}`}
                                >
                                  ＋
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {tracksSets && <div class="session-rest-control">
                          <label>
                            <Icon name="clock" size={14} />
                            <span>Descanso</span>
                            <input
                              type="number"
                              min="0"
                              max="3600"
                              step="5"
                              inputMode="numeric"
                              value={String(restSeconds[id] ?? 60)}
                              aria-label={`Descanso entre series para ${exercise.name}, en segundos`}
                              onInput={(event) => {
                                const value = event.currentTarget.value;
                                setRestSeconds((current) => ({
                                  ...current,
                                  [id]: value,
                                }));
                                setRestEndsAt((current) => ({
                                  ...current,
                                  [id]: 0,
                                }));
                              }}
                              onBlur={(event) =>
                                setRestSeconds((current) => ({
                                  ...current,
                                  [id]: safeRestSeconds(
                                    event.currentTarget.value,
                                  ),
                                }))
                              }
                            />
                            <small>s</small>
                          </label>
                          <Button
                            type="button"
                            variant="quiet"
                            className={`session-rest-button${restRemaining ? " is-running" : ""}`}
                            aria-label={
                              restRemaining
                                ? `Detener descanso de ${formatElapsed(restRemaining)} para ${exercise.name}`
                                : `Iniciar descanso de ${restSeconds[id] || 0} segundos para ${exercise.name}`
                            }
                            onClick={() => toggleRestTimer(id)}
                            disabled={!restRemaining && !safeRestSeconds(restSeconds[id], 60)}
                          >
                            <Icon name={restRemaining ? "pause" : "clock"} size={14} />
                            {restRemaining
                              ? formatElapsed(restRemaining)
                              : "Iniciar descanso"}
                          </Button>
                        </div>}

                        <div class={`session-set-head${trackingClass}`}>
                          <span>{tracksSets ? "Serie" : "Actividad"}</span>
                          {tracksSets && tracksWeight && <span>Peso ({unit})</span>}
                          {tracksReps && (
                            <span>{exerciseValueLabel(exercise)}</span>
                          )}
                          {!tracksSets && !tracksReps && (
                            <span>Tiempo (min)</span>
                          )}
                          <span title="Marcar serie completada">
                            <Icon name="check" size={12} />
                          </span>
                        </div>

                        {Array.from({ length: setCount }, (_, setIndex) => {
                          const previous = lastPerformance[id];
                          const weightValue = sets[id]?.[setIndex]?.weight;
                          const previousWeight = previous
                            ? Math.round(
                                (unit === "lb"
                                  ? previous.weight * 2.20462
                                  : previous.weight) * 10,
                              ) / 10
                            : 0;

                          const isComplete = Boolean(
                            completedSets[id]?.[setIndex],
                          );

                          const previousValues = previous
                            ? `${tracksWeight ? `${formatEditableDecimal(previousWeight)} ${unit} × ` : ""}${previous.reps} ${isTimedPrescription(exercise.reps) ? "s" : "reps"}`
                            : "Sin serie anterior";

                          return (
                            <div
                              class={`session-set-inputs${trackingClass}`}
                              key={setIndex}
                            >
                              <span>{tracksSets ? setIndex + 1 : "Hecha"}</span>

                              {tracksSets && tracksWeight && (
                                <>
                                  <input
                                    aria-label={`Peso serie ${setIndex + 1}`}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={formatEditableDecimal(previousWeight)}
                                    value={
                                      weightValue === 0 || weightValue == null
                                        ? ""
                                        : String(weightValue)
                                    }
                                    onInput={(event) =>
                                      update(
                                        id,
                                        setIndex,
                                        "weight",
                                        event.currentTarget.value,
                                      )
                                    }
                                  />
                                </>
                              )}

                              {tracksReps && (
                                <>
                                  <input
                                    aria-label={`${exerciseValueLabel(exercise)}${tracksSets ? ` de la serie ${setIndex + 1}` : ""} para ${exercise.name}`}
                                    type="number"
                                    min="0"
                                    placeholder={String(previous?.reps ?? 0)}
                                    value={
                                      sets[id]?.[setIndex]?.reps > 0
                                        ? sets[id][setIndex].reps
                                        : ""
                                    }
                                    onInput={(event) =>
                                      update(
                                        id,
                                        setIndex,
                                        "reps",
                                        event.currentTarget.value,
                                      )
                                    }
                                  />
                                </>
                              )}

                              {!tracksSets && !tracksReps && (
                                <input
                                  aria-label={`Tiempo de actividad en minutos para ${exercise.name}`}
                                  type="text"
                                  min="0"
                                  inputMode="decimal"
                                  placeholder={formatEditableDecimal(
                                    lastActivityTime[id] ??
                                      targetMinutes ??
                                      0,
                                  )}
                                  value={
                                    sets[id]?.[setIndex]?.reps > 0
                                      ? sets[id][setIndex].reps
                                      : ""
                                  }
                                  onInput={(event) =>
                                    update(
                                      id,
                                      setIndex,
                                      "reps",
                                      event.currentTarget.value,
                                    )
                                  }
                                />
                              )}

                              <label
                                class="set-completion-toggle"
                                title={
                                  previous
                                    ? `Marcar serie completada. Si está vacía, copiar última serie: ${previousValues}`
                                    : "Marcar serie como completada"
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isComplete}
                                  onChange={(event) =>
                                    toggleSetComplete(
                                      id,
                                      setIndex,
                                      event.currentTarget.checked,
                                    )
                                  }
                                  aria-label={`Marcar serie ${setIndex + 1} de ${exercise.name} como completada${
                                    previous
                                      ? `. Usar última serie: ${previousValues}`
                                      : ""
                                  }`}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div class="session-actions">
                    <Button
                      variant="quiet"
                      onClick={() => openPicker("append")}
                      aria-label="Añadir ejercicio al final"
                    >
                      <Icon name="plus" size={16} />
                      Añadir ejercicio
                    </Button>
                  </div>
                </div>
              ) : (
                <div class="session-entry-list">
                  <div class="empty-inline">
                    Selecciona al menos un ejercicio para empezar.
                  </div>

                  <div class="session-actions">
                    <Button
                      variant="quiet"
                      onClick={() => openPicker("append")}
                      aria-label="Añadir ejercicio al final"
                    >
                      <Icon name="plus" size={16} />
                      Añadir ejercicio
                    </Button>
                  </div>
                </div>
              )}

              <div class="workout-modal-footer">
                <span>
                  <Icon name="clock" size={15} />
                  Marca la casilla tras introducir peso y repeticiones o el
                  tiempo de cada serie.
                </span>

                <Button
                  disabled={!selected.length || !hasLoggedSet}
                  onClick={finish}
                >
                  <Icon name="check" size={15} />
                  Finalizar sesión
                </Button>
              </div>
            </>
          ) : (
            <section
              class={`finish-duration-panel ${adjustDuration ? "adjusting-duration-mode" : ""}`}
            >
              <div class="finish-duration-icon">
                <Icon name="clock" size={21} />
              </div>

              <div class="eyebrow">SESIÓN COMPLETADA</div>
              <h2>{formatElapsed(elapsedSeconds)}</h2>
              <p>¿Este es el tiempo que has tardado en entrenar?</p>

              <div class="finish-duration-actions">
                <Button
                  variant="quiet"
                  className="cancel-session-link"
                  onClick={onCancel}
                >
                  <Icon name="trash" size={14} />
                  Cancelar sesión
                </Button>
                <Button variant="quiet" onClick={returnToSession}>
                  <Icon name="play" size={14} />
                  Volver a la sesión
                </Button>
              </div>
              <span class="finish-duration-divider" aria-hidden="true" />

              {!adjustDuration ? (
                <div class="finish-duration-actions">
                  <Button
                    variant="quiet"
                    onClick={() => setAdjustDuration(true)}
                  >
                    No, cambiar tiempo
                  </Button>
                  <Button
                    onClick={() =>
                      saveWorkout(Math.max(1, Math.round(elapsedSeconds / 60)))
                    }
                  >
                    <Icon name="check" size={15} />
                    Sí, guardar
                  </Button>
                </div>
              ) : (
                <div class="adjust-duration">
                  <label>
                    Duración real (min)
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="720"
                      value={durationInput}
                      onInput={(event) =>
                        setDurationInput(event.currentTarget.value)
                      }
                    />
                  </label>
                  <span class="finish-duration-divider" aria-hidden="true" />
                  <div class="finish-duration-actions adjust-duration-actions">
                    <Button
                      variant="quiet"
                      onClick={() => setAdjustDuration(false)}
                    >
                      Volver
                    </Button>
                    <Button onClick={() => saveWorkout(durationInput)}>
                      <Icon name="check" size={15} />
                      Guardar duración
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </Modal>

      {incompleteExerciseCount !== null && (
        <Modal
          title="Entrenamiento incompleto"
          onClose={() => setIncompleteExerciseCount(null)}
          className="incomplete-workout-modal"
        >
          <div class="confirm-modal-content">
            <span class="confirm-modal-icon">
              <Icon name="clock" size={20} />
            </span>
            <div class="eyebrow">REVISIÓN DE LA SESIÓN</div>
            <h2>Aún no has completado todos los ejercicios</h2>
            <p>
              {incompleteExerciseCount}{" "}
              {translateText(
                incompleteExerciseCount === 1
                  ? "ejercicio no está marcado como completado. Puedes volver a la sesión o finalizar y guardar lo registrado hasta ahora."
                  : "ejercicios no están marcados como completados. Puedes volver a la sesión o finalizar y guardar lo registrado hasta ahora.",
              )}
            </p>
            <div class="form-actions">
              <Button
                variant="quiet"
                onClick={() => setIncompleteExerciseCount(null)}
              >
                Volver a la sesión
              </Button>
              <Button
                onClick={() => {
                  setIncompleteExerciseCount(null);
                  continueFinish();
                }}
              >
                Finalizar de todos modos
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pickerMode && (
        <WorkoutExercisePicker
          mode={pickerMode}
          muscles={pickerMuscles}
          muscle={pickerMuscle}
          query={pickerQuery}
          count={pickerCount}
          results={filteredPickerExercises}
          shown={shownPickerExercises}
          onMuscle={(value) => {
            setPickerMuscle(value);
            setPickerCount(30);
          }}
          onQuery={(value) => {
            setPickerQuery(value);
            setPickerCount(30);
          }}
          onCount={setPickerCount}
          onChoose={chooseExercise}
          onPreview={setPreview}
          onClose={() => {
            setPickerMode(null);
            setReplaceIndex(null);
          }}
        />
      )}

      {preview && (
        <ExercisePreviewModal
          exercise={preview}
          onClose={() => setPreview(null)}
          onTop={Boolean(pickerMode)}
        />
      )}
    </>
  );
}

function NewUserGuide({
  step,
  onNext,
  onBack,
  onImportBackup,
  onStartWeighIn,
  onFinish,
  hasWeight,
  weightReminder,
  onWeightReminder,
  weightReminderTime,
  onWeightReminderTime,
  waterReminder,
  onWaterReminder,
  proteinReminder,
  onProteinReminder,
  proteinReminderTime,
  onProteinReminderTime,
  reminderInterval,
  onReminderInterval,
  palette,
  onPalette,
  unit,
  onUnit,
  heightUnit,
  onHeightUnit,
  weightGoal,
  onWeightGoal,
  highResolutionProgressPhotos,
  onHighResolutionProgressPhotos,
}) {
  const backupInput = useRef(null);
  if (step === null) return null;
  const steps = [
    "Te damos la bienvenida",
    "Importar copia o crear perfil",
    "Tu punto de partida",
    "Mantén el hábito",
    "Personaliza los colores",
  ];
  return (
    <Modal
      title="Guía de inicio"
      dismissible={false}
      className="onboarding-guide"
    >
      <div class="onboarding-content">
        <div class="eyebrow">
          GUÍA DE INICIO · {String(step + 1).padStart(2, "0")} / 05
        </div>
        <div class="onboarding-progress" aria-label={`Paso ${step + 1} de 5`}>
          {steps.map((label, index) => (
            <i class={index <= step ? "active" : ""} key={label} />
          ))}
        </div>
        {step === 0 && (
          <>
            <span class="onboarding-icon">
              <Icon name="dumbbell" size={25} />
            </span>
            <h2>Tu progreso empieza aquí</h2>
            <p>
              ProFit guarda tus datos en este dispositivo y te ayuda a seguir
              entrenamientos, medidas y constancia.
            </p>
            <div class="onboarding-cards">
              <div>
                <Icon name="home" size={17} />
                <span>
                  <strong>Inicio</strong>
                  <small>Tu actividad y progreso diario</small>
                </span>
              </div>
              <div>
                <Icon name="calendar" size={17} />
                <span>
                  <strong>Entrenamientos</strong>
                  <small>Rutinas y biblioteca de ejercicios</small>
                </span>
              </div>
              <div>
                <Icon name="user" size={17} />
                <span>
                  <strong>Perfil</strong>
                  <small>Medidas, calendario y ajustes</small>
                </span>
              </div>
            </div>
            <Button type="button" onClick={onNext}>
              Continuar <Icon name="arrow" size={16} />
            </Button>
          </>
        )}
        {step === 1 && (
          <>
            <span class="onboarding-icon">
              <Icon name="upload" size={25} />
            </span>
            <h2>¿Ya tienes una copia de seguridad?</h2>
            <p>
              Importa tus datos para recuperar tu progreso o continúa con un
              perfil nuevo.
            </p>
            <input
              ref={backupInput}
              class="visually-hidden"
              type="file"
              accept=".json,.msgpack,.mpk,.bin,application/json,application/msgpack,application/octet-stream,*/*"
              aria-label="Importar copia de seguridad"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onImportBackup(file);
                event.currentTarget.value = "";
              }}
            />
            <div class="onboarding-navigation onboarding-start-navigation">
              <Button
                type="button"
                variant="quiet"
                className="onboarding-back"
                onClick={onBack}
              >
                <Icon
                  name="chevron"
                  size={15}
                  className="onboarding-back-icon"
                />{" "}
                Volver
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => backupInput.current?.click()}
              >
                <Icon name="upload" size={16} /> Importar copia de seguridad
              </Button>
            </div>
            <Button type="button" onClick={onNext}>
              Continuar con un perfil nuevo <Icon name="arrow" size={16} />
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <span class="onboarding-icon">
              <Icon name="scale" size={25} />
            </span>
            <h2>Registra tu primer pesaje</h2>
            <p>
              Lo usaremos como referencia para tus gráficas y para calcular tus
              objetivos diarios. Puedes añadir composición corporal más
              adelante.
            </p>
            <div class="onboarding-units">
              <div>
                <strong>Unidad de peso</strong>
                <div
                  class="onboarding-segmented"
                  role="group"
                  aria-label="Unidad de peso"
                >
                  <button
                    type="button"
                    class={unit === "kg" ? "active" : ""}
                    aria-pressed={unit === "kg"}
                    onClick={() => onUnit("kg")}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    class={unit === "lb" ? "active" : ""}
                    aria-pressed={unit === "lb"}
                    onClick={() => onUnit("lb")}
                  >
                    lb
                  </button>
                </div>
              </div>
              <div>
                <strong>Unidad de altura</strong>
                <div
                  class="onboarding-segmented"
                  role="group"
                  aria-label="Unidad de altura"
                >
                  <button
                    type="button"
                    class={heightUnit === "cm" ? "active" : ""}
                    aria-pressed={heightUnit === "cm"}
                    onClick={() => onHeightUnit("cm")}
                  >
                    cm
                  </button>
                  <button
                    type="button"
                    class={heightUnit === "in" ? "active" : ""}
                    aria-pressed={heightUnit === "in"}
                    onClick={() => onHeightUnit("in")}
                  >
                    in
                  </button>
                </div>
              </div>
            </div>
            <label class="weight-goal-setting onboarding-weight-goal">
              <span>
                <strong>Objetivo de peso</strong>
                <small>
                  Personaliza el cálculo automático de calorías para tu
                  objetivo.
                </small>
              </span>
              <select
                value={weightGoal}
                onChange={(event) => onWeightGoal(event.currentTarget.value)}
                aria-label="Objetivo de peso"
              >
                {weightGoalOptions.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label class="progress-photo-highres onboarding-highres-setting">
              <input
                type="checkbox"
                checked={highResolutionProgressPhotos}
                onChange={(event) =>
                  onHighResolutionProgressPhotos(event.currentTarget.checked)
                }
              />
              <span>
                <strong>Usar fotos de alta resolución</strong>
                <small>
                  Las fotos estándar ocupan menos espacio en el dispositivo.
                </small>
              </span>
            </label>
            <div class="onboarding-required">
              <Icon name="check" size={16} />
              <span>
                <strong>Este paso es necesario para terminar la guía.</strong>
                <small>
                  Peso, altura y género forman parte del registro inicial.
                </small>
              </span>
            </div>
            <div class="onboarding-navigation">
              <Button
                type="button"
                variant="quiet"
                className="onboarding-back"
                onClick={onBack}
              >
                <Icon
                  name="chevron"
                  size={15}
                  className="onboarding-back-icon"
                />{" "}
                Volver
              </Button>
              {hasWeight ? (
                <Button type="button" onClick={onNext}>
                  Continuar <Icon name="arrow" size={16} />
                </Button>
              ) : (
                <Button type="button" onClick={onStartWeighIn}>
                  <Icon name="plus" size={16} /> Añadir mi primer pesaje
                </Button>
              )}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <span class="onboarding-icon onboarding-success">
              <Icon name="water" size={25} />
            </span>
            <h2>Mantén el hábito</h2>
            <p>
              Activa avisos para el agua, el pesaje y la proteína. Puedes
              ajustar los horarios más adelante desde Perfil.
            </p>
            <div class="onboarding-reminder-settings">
              <div class="onboarding-reminder-row">
                <span>
                  <Icon name="scale" size={17} />
                  <strong>Recordatorio diario de pesaje</strong>
                </span>
                <button
                  type="button"
                  class={
                    weightReminder ? "toggle-switch active" : "toggle-switch"
                  }
                  role="switch"
                  aria-checked={weightReminder}
                  aria-label="Activar recordatorio diario de pesaje"
                  onClick={() => onWeightReminder(!weightReminder)}
                >
                  <i />
                </button>
              </div>
              {weightReminder && (
                <label class="weigh-reminder-time onboarding-time">
                  <span>
                    <Icon name="clock" size={15} /> Hora del aviso
                  </span>
                  <input
                    type="time"
                    value={weightReminderTime}
                    onChange={(event) =>
                      onWeightReminderTime(event.currentTarget.value)
                    }
                  />
                </label>
              )}
              <div class="onboarding-reminder-row">
                <span>
                  <Icon name="water" size={17} />
                  <strong>Recordatorio de agua</strong>
                </span>
                <button
                  type="button"
                  class={
                    waterReminder ? "toggle-switch active" : "toggle-switch"
                  }
                  role="switch"
                  aria-checked={waterReminder}
                  aria-label="Activar recordatorio de agua"
                  onClick={() => onWaterReminder(!waterReminder)}
                >
                  <i />
                </button>
              </div>
              {waterReminder && (
                <label class="reminder-interval-row onboarding-water-interval">
                  <span class="reminder-interval-label">
                    <Icon name="clock" size={15} /> Recordatorio de agua cada
                  </span>
                  <select
                    value={reminderInterval}
                    onChange={(event) =>
                      onReminderInterval(Number(event.currentTarget.value))
                    }
                  >
                    {waterReminderIntervals.map((minutes) => (
                      <option value={minutes} key={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div class="onboarding-reminder-row">
                <span>
                  <Icon name="shaker" size={17} />
                  <strong>Recordatorio de proteína</strong>
                </span>
                <button
                  type="button"
                  class={proteinReminder ? "toggle-switch active" : "toggle-switch"}
                  role="switch"
                  aria-checked={proteinReminder}
                  aria-label="Activar recordatorio de proteína"
                  onClick={() => onProteinReminder(!proteinReminder)}
                >
                  <i />
                </button>
              </div>
              {proteinReminder && (
                <label class="weigh-reminder-time onboarding-time">
                  <span>
                    <Icon name="clock" size={15} /> Hora del aviso
                  </span>
                  <input
                    type="time"
                    value={proteinReminderTime}
                    onChange={(event) =>
                      onProteinReminderTime(event.currentTarget.value)
                    }
                  />
                </label>
              )}
            </div>
            <div class="onboarding-navigation">
              <Button
                type="button"
                variant="quiet"
                className="onboarding-back"
                onClick={onBack}
              >
                <Icon
                  name="chevron"
                  size={15}
                  className="onboarding-back-icon"
                />{" "}
                Volver
              </Button>
              <Button type="button" onClick={onNext}>
                Continuar <Icon name="arrow" size={16} />
              </Button>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <span class="onboarding-icon">
              <Icon name="settings" size={25} />
            </span>
            <h2>Personaliza los colores de ProFit</h2>
            <p>
              Elige una paleta para tu espacio. Podrás cambiarla cuando quieras
              desde Perfil.
            </p>
            <div
              class="palette-options onboarding-palette-options"
              role="group"
              aria-label="Paleta de color"
            >
              {palettes.map((item) => (
                <button
                  type="button"
                  class={
                    palette === item.id
                      ? "palette-choice active"
                      : "palette-choice"
                  }
                  aria-pressed={palette === item.id}
                  onClick={() => onPalette(item.id)}
                  key={item.id}
                  title={item.name}
                >
                  <i
                    style={{
                      backgroundColor: item.color,
                      "--swatch": item.color,
                    }}
                  />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <div class="onboarding-navigation">
              <Button
                type="button"
                variant="quiet"
                className="onboarding-back"
                onClick={onBack}
              >
                <Icon
                  name="chevron"
                  size={15}
                  className="onboarding-back-icon"
                />{" "}
                Volver
              </Button>
              <Button type="button" onClick={onFinish}>
                Empezar a entrenar <Icon name="arrow" size={16} />
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function MeasureModal({
  current,
  previous,
  dateOfBirth,
  highResolutionProgressPhotos,
  onMissingPhoto,
  modalClassName = "",
  onClose,
  onSave,
  unit,
  heightUnit,
}) {
  const source = current || previous || {};
  const showLength = (cm) =>
    cm
      ? heightUnit === "in"
        ? formatEditableDecimal(cmToIn(cm), 1)
        : formatEditableDecimal(cm, 1)
      : "";
  const initialCompositionType = (key) => compositionMeasureType(source, key);
  const initialCompositionValue = (key) => {
    if (source[key] == null) return "";
    const type = initialCompositionType(key);
    return formatEditableDecimal(
      type === "mass" ? kgToUnit(source[key], unit) : source[key],
      type === "mass" ? 1 : 2,
    );
  };
  const initialWeightValue = source.weight
    ? formatEditableDecimal(
        unit === "lb" ? source.weight * 2.20462 : source.weight,
        unit === "lb" ? 1 : 6,
      )
    : "";
  // Keep exact canonical values (kg for mass, percentage points for percent)
  // separate from rounded display strings. This prevents kg/lb conversions
  // from accumulating rounding error when a weigh-in is opened and saved again.
  const compositionExactRef = useRef({
    weightKg:
      source.weight !== null && source.weight !== undefined && source.weight !== "" && Number.isFinite(Number(source.weight))
        ? Number(source.weight)
        : Number.NaN,
    values: {
      bodyFat: source.bodyFat ?? null,
      water: source.water ?? null,
      muscleMass: source.muscleMass ?? null,
      boneMass: source.boneMass ?? null,
    },
    types: {
      bodyFat: initialCompositionType("bodyFat"),
      water: initialCompositionType("water"),
      muscleMass: initialCompositionType("muscleMass"),
      boneMass: initialCompositionType("boneMass"),
    },
  });
  const [form, setForm] = useState({
    date: current?.date || dateKey(today()),
    dateOfBirth: dateOfBirth || "",
    weight: initialWeightValue,
    waist: showLength(source.waist),
    chest: showLength(source.chest),
    height: showLength(source.height),
    gender: source.gender ?? "",
    bodyFatType: initialCompositionType("bodyFat"),
    waterType: initialCompositionType("water"),
    muscleMassType: initialCompositionType("muscleMass"),
    boneMassType: initialCompositionType("boneMass"),
    bodyFat: initialCompositionValue("bodyFat"),
    water: initialCompositionValue("water"),
    boneMass: initialCompositionValue("boneMass"),
    muscleMass: initialCompositionValue("muscleMass"),
  });
  const currentAge = calculateAge(form.dateOfBirth);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const changeWeightInput = (value) => {
    set("weight", value);
    const parsed = value === "" ? Number.NaN : parseLocalizedDecimal(value);
    compositionExactRef.current.weightKg = Number.isFinite(parsed)
      ? unitToKg(parsed, unit)
      : Number.NaN;
  };
  const changeCompositionValue = (key, value) => {
    set(key, value);
    const type = form[`${key}Type`] || initialCompositionType(key);
    const parsed = value === "" ? Number.NaN : parseLocalizedDecimal(value);
    compositionExactRef.current.types[key] = type;
    compositionExactRef.current.values[key] = Number.isFinite(parsed)
      ? type === "mass"
        ? unitToKg(parsed, unit)
        : parsed
      : null;
  };
  const changeCompositionType = (key, nextType) => {
    const typeKey = `${key}Type`;
    const exact = compositionExactRef.current;
    const previousType = exact.types[key] || form[typeKey] || initialCompositionType(key);
    if (previousType === nextType) return;

    const value = exact.values[key];
    const weightKg = exact.weightKg;
    let nextValue = "";
    let nextCanonicalValue = null;
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number.isFinite(weightKg) && weightKg > 0) {
      if (previousType === "percent" && nextType === "mass") {
        nextCanonicalValue = (weightKg * Number(value)) / 100;
        nextValue = formatEditableDecimal(kgToUnit(nextCanonicalValue, unit), 1);
      } else if (previousType === "mass" && nextType === "percent") {
        nextCanonicalValue = (Number(value) / weightKg) * 100;
        nextValue = formatEditableDecimal(nextCanonicalValue, 2);
      }
    }
    // Keep the unrounded converted result for subsequent type switches.
    exact.types[key] = nextType;
    exact.values[key] = nextCanonicalValue;
    setForm((prev) => ({ ...prev, [typeKey]: nextType, [key]: nextValue }));
  };
  const photoCameraInput = useRef(null);
  const photoGalleryInput = useRef(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoUri, setPhotoUri] = useState(current?.photoUri || "");
  const pendingPhotoUri = useRef("");
  const photoSavedToMeasure = useRef(false);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoDeleteConfirmation, setPhotoDeleteConfirmation] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const closeModal = () => {
    if (pendingPhotoUri.current && !photoSavedToMeasure.current) {
      ProgressPhotos.deletePhoto({ uri: pendingPhotoUri.current }).catch(() => {});
      pendingPhotoUri.current = "";
    }
    onClose?.();
  };
  const photoDeletePrompt = useMemo(
    () => ({
      title: translateText("Eliminar foto de progreso"),
      message: translateText(
        "La foto se eliminará y no se podrá recuperar. Solo se eliminará la foto; los datos del pesaje se conservarán al guardar los cambios.",
      ),
      confirmLabel: translateText("Eliminar foto"),
    }),
    [],
  );
  useEffect(() => {
    let active = true;
    setPhotoPreview("");
    const loadPreview = async () => {
      if (photoBlob) {
        const dataUrl = await blobToDataUrl(photoBlob);
        if (active) setPhotoPreview(dataUrl);
        return;
      }
      if (photoRemoved) return;
      if (photoUri && Capacitor.getPlatform() === "android") {
        try {
          const { data, mimeType } = await ProgressPhotos.readPhoto({
            uri: photoUri,
          });
          if (active && data)
            setPhotoPreview(`data:${mimeType || "image/jpeg"};base64,${data}`);
        } catch {
          let photoStillExists = true;
          try {
            const result = await ProgressPhotos.photoExists({ uri: photoUri });
            photoStillExists = Boolean(result.exists);
          } catch {
            // Keep the persisted URI when the gallery cannot be checked.
          }
          if (active && !photoStillExists) {
            setPhotoUri("");
            setPhotoBlob(null);
            setPhotoRemoved(true);
            onMissingPhoto?.(current?.id);
          }
        }
        return;
      }
      if (current?.photoAssetId) {
        const legacyBlob = await getExerciseAsset(current.photoAssetId);
        if (!active || !legacyBlob) return;
        setPhotoPreview(await blobToDataUrl(legacyBlob));
      }
    };
    loadPreview().catch(() => {});
    return () => {
      active = false;
    };
  }, [current?.photoAssetId, current?.id, photoUri, photoBlob, photoRemoved]);
  const selectProgressPhoto = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setPhotoError("");
    setPhotoProcessing(true);
    try {
      const compressed = await compressMeasurePhoto(
        file,
        highResolutionProgressPhotos,
      );
      const saved = await saveProgressPhotoToGallery(compressed);
      if (pendingPhotoUri.current)
        await ProgressPhotos.deletePhoto({ uri: pendingPhotoUri.current }).catch(() => {});
      pendingPhotoUri.current = saved.uri;
      photoSavedToMeasure.current = false;
      setPhotoUri(saved.uri);
      setPhotoBlob(compressed);
      setPhotoRemoved(false);
    } catch {
      setPhotoError(translateText("No se pudo guardar la foto en Fotos/ProFit."));
    } finally {
      setPhotoProcessing(false);
    }
  };
  const minHeight = heightUnit === "in" ? 39 : 100;
  const maxHeight = heightUnit === "in" ? 98 : 250;
  const toCm = (value) => (heightUnit === "in" ? inToCm(parseLocalizedDecimal(value)) : parseLocalizedDecimal(value));
  return (
    <>
    <Modal
      title={current?.id ? "Modificar pesaje" : "Añadir medidas"}
      onClose={closeModal}
      className={modalClassName}
    >
      <form
        class="exercise-form measure-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving || photoProcessing) return;
          const fields = [
            ["weight", 1],
            ["height", minHeight, maxHeight],
            ["bodyFat", 0, form.bodyFatType === "percent" ? 75 : undefined],
            ["water", 0, form.waterType === "percent" ? 100 : undefined],
            ["muscleMass", 0, form.muscleMassType === "percent" ? 100 : undefined],
            ["boneMass", 0, form.boneMassType === "percent" ? 100 : undefined],
            ["waist", 0],
            ["chest", 0],
          ];
          for (const [key, minimum, maximum] of fields) {
            if (!form[key] && !["weight", "height"].includes(key)) continue;
            const value = parseLocalizedDecimal(form[key]);
            if (!Number.isFinite(value) || value < minimum || (maximum != null && value > maximum)) {
              const input = event.currentTarget.elements.namedItem(key);
              input?.setCustomValidity(translateText("Introduce un número válido dentro del rango permitido."));
              input?.reportValidity();
              input?.setCustomValidity("");
              return;
            }
          }
          setSaving(true);
          try {
            const measureId = current?.id || uid();
            let photoAssetId = current?.photoAssetId || "";
            let savedPhotoUri = photoUri;
            if (photoRemoved) {
              if (savedPhotoUri && Capacitor.getPlatform() === "android") {
                const result = await ProgressPhotos.deletePhoto({ uri: savedPhotoUri });
                if (!result?.deleted) {
                  const { exists } = await ProgressPhotos.photoExists({ uri: savedPhotoUri });
                  if (exists) throw new Error(translateText("No se pudo eliminar la foto de Fotos/ProFit."));
                }
              }
              if (photoAssetId)
                await deleteExerciseAsset(photoAssetId);
              photoAssetId = "";
              savedPhotoUri = "";
            }
            photoSavedToMeasure.current = true;
            pendingPhotoUri.current = "";
            onSave({
              id: measureId,
              date: form.date,
              dateOfBirth: form.dateOfBirth,
              weight: Number.isFinite(compositionExactRef.current.weightKg)
                ? compositionExactRef.current.weightKg
                : unitToKg(form.weight, unit),
              waist: form.waist ? toCm(form.waist) : null,
              chest: form.chest ? toCm(form.chest) : null,
              height: toCm(form.height),
              gender: form.gender,
              bodyFatType: form.bodyFatType,
              bodyFat: form.bodyFat !== "" ? compositionExactRef.current.values.bodyFat : null,
              waterType: form.waterType,
              water: form.water !== "" ? compositionExactRef.current.values.water : null,
              boneMassType: form.boneMassType,
              boneMass: form.boneMass !== "" ? compositionExactRef.current.values.boneMass : null,
              muscleMassType: form.muscleMassType,
              muscleMass: form.muscleMass !== "" ? compositionExactRef.current.values.muscleMass : null,
              ...(savedPhotoUri ? { photoUri: savedPhotoUri } : {}),
              ...(photoAssetId ? { photoAssetId } : {}),
            });
          } catch (error) {
            setPhotoError(translateText("No se pudo guardar la foto en Fotos/ProFit."));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div class="eyebrow">SEGUIMIENTO CORPORAL</div>
        <h2>{current?.id ? "Editar referencia" : "Nuevo pesaje"}</h2>
        <p>
          {current?.id
            ? "Corrige este registro sin perder el resto de tus medidas."
            : previous
              ? "Los campos parten del último registro; añade otra fecha para crear un nuevo punto en tu historial."
              : "Introduce tu peso, altura y género para crear tu primer punto de referencia."}
        </p>
        <div class="form-row">
          <label>
            Fecha
            <input
              required
              type="date"
              value={form.date}
              onInput={(e) => set("date", e.currentTarget.value)}
            />
          </label>
          <label>
            Peso ({unit})
            <input
              name="weight"
              required
              type="text"
              inputMode="decimal"
              pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
              min="1"
              step="0.1"
              placeholder={`0${decimalSeparator()}0`}
              value={form.weight}
              onInput={(e) => changeWeightInput(e.currentTarget.value)}
            />
          </label>
        </div>
        <div class="form-row measure-age-row">
          <label>
            Fecha de nacimiento
            <input
              required
              type="date"
              max={dateKey(today())}
              value={form.dateOfBirth}
              onInput={(e) => set("dateOfBirth", e.currentTarget.value)}
            />
          </label>
          <div class="measure-age-preview" aria-live="polite">
            <span>Edad actual</span>
            <strong>
              {currentAge === null ? "—" : `${currentAge} años`}
            </strong>
          </div>
        </div>
        <div class="form-row">
          <label>
            Altura ({heightUnit})
            <input
              name="height"
              required
              type="text"
              inputMode="decimal"
              pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
              min={minHeight}
              max={maxHeight}
              step="0.1"
              placeholder={`0${decimalSeparator()}0`}
              value={form.height}
              onInput={(e) => set("height", e.currentTarget.value)}
            />
          </label>
          <label>
            Género
            <select
              required
              value={form.gender}
              onChange={(e) => set("gender", e.currentTarget.value)}
            >
              <option value="" disabled>
                Selecciona
              </option>
              <option value="mujer">Mujer</option>
              <option value="hombre">Hombre</option>
              <option value="no-binario">No binario</option>
              <option value="prefiero-no-decirlo">Prefiero no decirlo</option>
            </select>
          </label>
        </div>
        <div class="measure-form-section">
          <div class="eyebrow">COMPOSICIÓN CORPORAL · OPCIONAL</div>
          <div className="measure-composition-grid">
            <label className="measure-composition-field">
              <span>{translateText("Grasa corporal")}</span>
              <div className="measure-composition-controls">
                <input
                  name="bodyFat"
                  type="text"
                  inputMode="decimal"
                  pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
                  min="0"
                  max={form.bodyFatType === "percent" ? 75 : undefined}
                  step="0.1"
                  value={form.bodyFat}
                  onInput={(e) => changeCompositionValue("bodyFat", e.currentTarget.value)}
                  placeholder="—"
                />
                <select
                  aria-label={`${translateText("Unidad de medida")}: ${translateText("Grasa corporal")}`}
                  value={form.bodyFatType}
                  onChange={(e) => changeCompositionType("bodyFat", e.currentTarget.value)}
                >
                  <option value="percent">%</option>
                  <option value="mass">{unit}</option>
                </select>
              </div>
            </label>
            <label className="measure-composition-field">
              <span>{translateText("Agua corporal")}</span>
              <div className="measure-composition-controls">
                <input
                  name="water"
                  type="text"
                  inputMode="decimal"
                  pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
                  min="0"
                  max={form.waterType === "percent" ? 100 : undefined}
                  step="0.1"
                  value={form.water}
                  onInput={(e) => changeCompositionValue("water", e.currentTarget.value)}
                  placeholder="—"
                />
                <select
                  aria-label={`${translateText("Unidad de medida")}: ${translateText("Agua corporal")}`}
                  value={form.waterType}
                  onChange={(e) => changeCompositionType("water", e.currentTarget.value)}
                >
                  <option value="percent">%</option>
                  <option value="mass">{unit}</option>
                </select>
              </div>
            </label>
            <label className="measure-composition-field">
              <span>{translateText("Masa muscular")}</span>
              <div className="measure-composition-controls">
                <input
                  name="muscleMass"
                  type="text"
                  inputMode="decimal"
                  pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
                  min="0"
                  max={form.muscleMassType === "percent" ? 100 : undefined}
                  step="0.1"
                  value={form.muscleMass}
                  onInput={(e) => changeCompositionValue("muscleMass", e.currentTarget.value)}
                  placeholder="—"
                />
                <select
                  aria-label={`${translateText("Unidad de medida")}: ${translateText("Masa muscular")}`}
                  value={form.muscleMassType}
                  onChange={(e) => changeCompositionType("muscleMass", e.currentTarget.value)}
                >
                  <option value="percent">%</option>
                  <option value="mass">{unit}</option>
                </select>
              </div>
            </label>
            <label className="measure-composition-field">
              <span>{translateText("Masa ósea")}</span>
              <div className="measure-composition-controls">
                <input
                  name="boneMass"
                  type="text"
                  inputMode="decimal"
                  pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
                  min="0"
                  max={form.boneMassType === "percent" ? 100 : undefined}
                  step="0.1"
                  value={form.boneMass}
                  onInput={(e) => changeCompositionValue("boneMass", e.currentTarget.value)}
                  placeholder="—"
                />
                <select
                  aria-label={`${translateText("Unidad de medida")}: ${translateText("Masa ósea")}`}
                  value={form.boneMassType}
                  onChange={(e) => changeCompositionType("boneMass", e.currentTarget.value)}
                >
                  <option value="percent">%</option>
                  <option value="mass">{unit}</option>
                </select>
              </div>
            </label>
          </div>
          <div className="form-row">
            <label>
              {translateText("Cintura")} ({heightUnit})
              <input
                name="waist"
                type="text"
                inputMode="decimal"
                pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
                min="0"
                step="0.1"
                value={form.waist}
                onInput={(e) => set("waist", e.currentTarget.value)}
                placeholder="—"
              />
            </label>
            <label>
              {translateText("Pecho")} ({heightUnit})
              <input
                name="chest"
                type="text"
                inputMode="decimal"
                pattern="[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)"
                min="0"
                step="0.1"
                value={form.chest}
                onInput={(e) => set("chest", e.currentTarget.value)}
                placeholder="—"
              />
            </label>
          </div>
        </div>
        <section className="measure-photo-section">
          <div className="measure-photo-section-heading">
            <span className="setting-icon">
              <Icon name="image" size={16} />
            </span>
            <div>
              <strong>{translateText("Foto de progreso")}</strong>
              <small>
                {translateText(
                  "Opcional. Se guarda en la galería Fotos/ProFit.",
                )}
              </small>
            </div>
          </div>
          <input
            ref={photoCameraInput}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={translateText("Cámara")}
            disabled={photoProcessing || saving}
            onChange={selectProgressPhoto}
          />
          <input
            ref={photoGalleryInput}
            className="visually-hidden"
            type="file"
            accept="image/*"
            aria-label={translateText("Galería")}
            disabled={photoProcessing || saving}
            onChange={selectProgressPhoto}
          />
          <div className="measure-photo-actions">
            <div className="measure-photo-frame-wrap">
              <div
                className={`measure-photo-frame ${photoPreview ? "has-photo" : ""}`}
                role="group"
                aria-label={translateText(
                  photoPreview ? "Cambiar foto" : "Hacer o elegir una foto",
                )}
              >
                {photoPreview ? (
                  <img
                  className="measure-photo-form-preview"
                  src={photoPreview}
                  alt={translateText("Vista previa de la foto de progreso")}
                />
                ) : (
                  <span className="measure-photo-form-empty">
                    <Icon name="image" size={23} />
                    <strong>
                      {photoProcessing
                        ? translateText("Preparando foto…")
                        : translateText("Hacer o elegir una foto")}
                    </strong>
                    <small>{translateText("Usa los iconos para añadir una imagen")}</small>
                  </span>
                )}
              </div>
              <div
                className="measure-photo-source-actions"
                role="group"
                aria-label={translateText("Opciones de foto")}
              >
                <button
                  type="button"
                  className="measure-photo-source-icon icon-button"
                  title={translateText("Cámara")}
                  aria-label={translateText("Cámara")}
                  disabled={photoProcessing || saving}
                  onClick={() => photoCameraInput.current?.click()}
                >
                  <Icon name="camera" size={17} />
                </button>
                <button
                  type="button"
                  className="measure-photo-source-icon icon-button"
                  title={translateText("Galería")}
                  aria-label={translateText("Galería")}
                  disabled={photoProcessing || saving}
                  onClick={() => photoGalleryInput.current?.click()}
                >
                  <Icon name="image" size={17} />
                </button>
              </div>
              {photoPreview && (
                <button
                  type="button"
                  className="measure-photo-remove icon-button danger"
                  title={translateText("Quitar foto")}
                  aria-label={translateText("Quitar foto")}
                  disabled={saving}
                  onClick={() => setPhotoDeleteConfirmation(true)}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          </div>
          {photoError && (
            <small className="measure-photo-error" role="alert">
              {photoError}
            </small>
          )}
        </section>
        <div class="form-actions">
          <Button variant="quiet" type="button" onClick={closeModal}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || photoProcessing}>
            <Icon name="check" size={15} />{" "}
            {saving
              ? translateText("Guardando…")
              : current?.id
                ? translateText("Actualizar pesaje")
                : translateText("Guardar pesaje")}
          </Button>
        </div>
      </form>
    </Modal>
    {photoDeleteConfirmation && (
      <ConfirmModal
        className={modalClassName ? "measure-photo-edit-delete-confirm" : ""}
        confirmation={photoDeletePrompt}
        onCancel={() => setPhotoDeleteConfirmation(false)}
        onConfirm={() => {
          setPhotoBlob(null);
          setPhotoRemoved(true);
          setPhotoError("");
          setPhotoDeleteConfirmation(false);
        }}
      />
    )}
    </>
  );
}
function MeasureHistoryModal({
  measures,
  unit,
  heightUnit,
  weekStartsOn = 1,
  onClose,
  onEdit,
  onDelete,
}) {
  const sortedMeasures = useMemo(
    () => [...measures].sort((a, b) => b.date.localeCompare(a.date)),
    [measures],
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const filteredMeasures = selectedDate
    ? sortedMeasures.filter((measure) => measure.date === selectedDate)
    : sortedMeasures;
  const visibleMeasures = filteredMeasures.slice(0, visibleCount);
  const chooseDate = (date) => {
    setSelectedDate(date);
    setVisibleCount(8);
    setDatePickerOpen(false);
  };
  return (
    <>
      <Modal
        title={translateText("Historial corporal")}
        onClose={onClose}
        className="measure-history-main-modal"
      >
        <div className="measure-history-modal">
          <div className="measure-history-heading">
            <div>
              <div className="eyebrow">{translateText("PESAJE Y COMPOSICIÓN")}</div>
              <h2>{translateText("Tus registros")}</h2>
              <p>{translateText("Modifica o elimina una medición anterior cuando necesites corregirla.")}</p>
            </div>
            <div className="measure-history-date-actions">
              <Button
                type="button"
                variant="quiet"
                className="measure-photo-date-button"
                disabled={!sortedMeasures.length}
                onClick={() => setDatePickerOpen(true)}
              >
                <Icon name="calendar" size={15} />
                {selectedDate
                  ? dateLabel(selectedDate, { day: "numeric", month: "long", year: "numeric" })
                  : translateText("Elegir fecha")}
              </Button>
              {selectedDate && (
                <button
                  type="button"
                  className="measure-history-clear-date"
                  onClick={() => {
                    setSelectedDate("");
                    setVisibleCount(8);
                  }}
                >
                  {translateText("Todos los pesajes")}
                </button>
              )}
            </div>
          </div>
          {sortedMeasures.length ? (
            <>
              <div className="measure-history-results-label">
                {selectedDate
                  ? `${translateText("Registros del día")} · ${filteredMeasures.length}`
                  : `${translateText("Mostrando")} ${visibleMeasures.length} ${translateText("de")} ${filteredMeasures.length} ${translateText("registros")}`}
              </div>
              <div className="measure-history-list">
                {visibleMeasures.map((measure) => (
                  <article className="measure-history-card" key={measure.id}>
                    <div>
                      <strong>
                        {dateLabel(measure.date, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </strong>
                      <span>
                        {(unit === "lb"
                          ? measure.weight * 2.20462
                          : measure.weight
                        ).toLocaleString(intlLocale(), {
                          maximumFractionDigits: 1,
                        })}{" "}
                        {unit} ·{" "}
                        {measure.height
                          ? `${(heightUnit === "in" ? cmToIn(measure.height) : measure.height).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${heightUnit}`
                          : translateText("altura pendiente")}
                        {measure.gender
                          ? ` · ${measure.gender.replaceAll("-", " ")}`
                          : ""}
                      </span>
                      <small>
                        {[
                          measure.bodyFat != null &&
                            `${translateText("Grasa")}: ${formatCompositionMeasure(measure, "bodyFat", unit)}`,
                          measure.water != null &&
                            `${translateText("Agua")}: ${formatCompositionMeasure(measure, "water", unit)}`,
                          measure.muscleMass != null &&
                            `${translateText("Masa muscular")}: ${formatCompositionMeasure(measure, "muscleMass", unit)}`,
                          measure.boneMass != null &&
                            `${translateText("Masa ósea")}: ${formatCompositionMeasure(measure, "boneMass", unit)}`,
                          measure.waist &&
                            `${translateText("Cintura")}: ${(heightUnit === "in" ? cmToIn(measure.waist) : measure.waist).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${heightUnit}`,
                          measure.chest &&
                            `${translateText("Pecho")}: ${(heightUnit === "in" ? cmToIn(measure.chest) : measure.chest).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} ${heightUnit}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || translateText("Sin composición adicional")}
                      </small>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => onEdit(measure)}
                        aria-label={translateText("Editar pesaje")}
                        title={translateText("Editar pesaje")}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => onDelete(measure)}
                        aria-label={translateText("Eliminar pesaje")}
                        title={translateText("Eliminar pesaje")}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {visibleMeasures.length < filteredMeasures.length && (
                <button
                  type="button"
                  className="measure-history-more"
                  onClick={() => setVisibleCount((count) => count + 8)}
                >
                  {translateText("Ver registros anteriores")}
                </button>
              )}
            </>
          ) : (
            <div className="empty-inline">
              {translateText(selectedDate ? "No hay pesajes para esta fecha." : "Aún no has guardado pesajes.")}
            </div>
          )}
        </div>
      </Modal>
      {datePickerOpen && (
        <MeasurePhotoDatePickerModal
          photos={sortedMeasures}
          selectedDate={selectedDate}
          weekStartsOn={weekStartsOn}
          onSelectDate={chooseDate}
          onClose={() => setDatePickerOpen(false)}
          title="Elegir fecha del historial"
          hint="Selecciona un día marcado para ver los pesajes."
          itemLabel="Pesajes"
          className="measure-history-date-modal"
        />
      )}
    </>
  );
}

function App() {
  const incomingImportHandler = useRef(null);
  const nativeImportProcessing = useRef(false);
  const nativeImportQueued = useRef(false);
  const [, setLocaleRevision] = useState(0);
  const [tab, setTabState] = useState("home");
  const [pageTransition, setPageTransition] = useState(null);
  const [dashboardLayout, setDashboardLayout] = useState(loadDashboardLayout);
  const [dashboardLayoutOpen, setDashboardLayoutOpen] = useState(false);
  const [calendarDay, setCalendarDay] = useState(() => dateKey(today()));
  const [weekStartsOn, setWeekStartsOn] = useState(() =>
    normalizeWeekStartsOn(loadJson("profit-week-start", 1)),
  );
  const tabRef = useRef("home");
  const tabHistory = useRef([]);
  const pageSwipeStart = useRef(null);
  const pageOrder = ["home", "training", "profile"];
  const directionBetween = (from, to) =>
    pageOrder.indexOf(to) >= pageOrder.indexOf(from)
      ? "from-right"
      : "from-left";
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector(".main-scroll")?.scrollTo(0, 0);
  }, [tab]);
  const setTab = (nextTab) => {
    if (nextTab === tabRef.current) return;
    setPageTransition(directionBetween(tabRef.current, nextTab));
    tabHistory.current.push(tabRef.current);
    tabRef.current = nextTab;
    setTabState(nextTab);
  };
  const returnToPreviousTab = () => {
    const openModals = [...document.querySelectorAll(".modal-backdrop")];
    const topModal = openModals[openModals.length - 1];
    if (topModal) {
      if (topModal.classList.contains("onboarding-guide")) return;
      const closeButton = topModal.querySelector(".modal-close-button");
      if (closeButton) closeButton.click();
      return;
    }
    let previousTab = tabHistory.current.pop();
    while (previousTab === tabRef.current && tabHistory.current.length)
      previousTab = tabHistory.current.pop();
    const nextTab = previousTab || "home";
    setPageTransition(directionBetween(tabRef.current, nextTab));
    tabRef.current = nextTab;
    setTabState(nextTab);
  };
  const beginPageSwipe = (event) => {
    if (event.touches.length !== 1) {
      pageSwipeStart.current = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        'input, textarea, select, option, [contenteditable="true"], [data-swipe-ignore], .drag-handle, .picker-scroll, .exercise-picker-categories, .muscle-filters, .range-row, .reminder-days-picker, .palette-options, .theme-options',
      )
    ) {
      pageSwipeStart.current = null;
      return;
    }
    const touch = event.touches[0];
    pageSwipeStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const endPageSwipe = (event) => {
    const start = pageSwipeStart.current;
    pageSwipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 68 || Math.abs(deltaY) > Math.abs(deltaX) * 0.7)
      return;
    const pageIndex = pageOrder.indexOf(tabRef.current);
    const nextIndex = pageIndex + (deltaX < 0 ? 1 : -1);
    if (nextIndex >= 0 && nextIndex < pageOrder.length)
      setTab(pageOrder[nextIndex]);
  };
  const [exercises, setExercises] = useState(() =>
    loadExerciseLibrary().map(({ group, ...exercise }) => exercise),
  );
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const [routineGroups, setRoutineGroups] = useState(() =>
    mergeRoutineGroups(
      loadJson("profit-routine-groups", []),
      loadJson("profit-exercise-groups", []),
    ),
  );
  const [routineGroupOpen, setRoutineGroupOpen] = useState(false);
  const [workouts, setWorkouts] = useState(loadUserWorkouts);
  const [routines, setRoutines] = useState(() =>
    loadUserRoutines(),
  );
  const [measures, setMeasures] = useState(loadUserMeasures);
  const photoMigrationInFlight = useRef(new Set());
  const photoMigrationAttempts = useRef(new Map());
  const photoMigrationNotified = useRef(false);
  const updateMeasurePhotoRecord = (measureId, update) => {
    const stored = loadJson("profit-measures", []);
    if (Array.isArray(stored) && stored.some((measure) => measure.id === measureId)) {
      localStorage.setItem(
        "profit-measures",
        JSON.stringify(stored.map((measure) =>
          measure.id === measureId ? update(measure) : measure,
        )),
      );
    }
    setMeasures((current) => current.map((measure) =>
      measure.id === measureId ? update(measure) : measure,
    ));
  };
  const unlinkMeasurePhotoReference = (measureOrId) => {
    const measureId =
      typeof measureOrId === "object" ? measureOrId?.id : measureOrId;
    if (!measureId) return;
    const savedMeasure = loadJson("profit-measures", [])
      .find((measure) => measure.id === measureId)
      || measures.find((measure) => measure.id === measureId);
    if (savedMeasure?.photoAssetId) {
      deleteExerciseAsset(savedMeasure.photoAssetId).catch(() => {
        setToast(translateText("No se pudo eliminar la foto de Fotos/ProFit."));
      });
    }
    updateMeasurePhotoRecord(measureId, (measure) => {
      const {
        photoUri: _photoUri,
        photoAssetId: _photoAssetId,
        ...withoutPhoto
      } = measure;
      return withoutPhoto;
    });
  };
  const [highResolutionProgressPhotos, setHighResolutionProgressPhotos] =
    useState(() =>
      Boolean(loadJson("profit-progress-photos-high-resolution", false)),
    );
  const [dateOfBirth, setDateOfBirth] = useState(loadUserDateOfBirth);
  const [guideStep, setGuideStep] = useState(() => {
    const flowVersion = Number(
      loadJson("profit-onboarding-flow-version", 1),
    );
    localStorage.setItem("profit-onboarding-flow-version", JSON.stringify(2));
    if (loadJson("profit-onboarding-complete", false)) return null;
    const storedStep = loadJson("profit-onboarding-step", null);
    const savedStep =
      flowVersion < 2 && Number.isInteger(storedStep)
        ? storedStep === 0
          ? 0
          : storedStep + 1
        : storedStep;
    if (flowVersion < 2 && Number.isInteger(savedStep))
      localStorage.setItem("profit-onboarding-step", JSON.stringify(savedStep));
    if (Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 4) {
      return savedStep >= 3 && loadUserMeasures().length === 0 ? 2 : savedStep;
    }
    const hasExistingProgress =
      loadUserWorkouts().length > 0 ||
      loadUserRoutines().length > 0 ||
      loadUserMeasures().length > 0 ||
      Boolean(String(loadJson("profit-name", "") || "").trim()) ||
      Boolean(loadJson("profit-avatar", null));
    return hasExistingProgress ? null : 0;
  });
  const [unit, setUnit] = useState(() => loadJson("profit-unit", "kg"));
  const [heightUnit, setHeightUnit] = useState(() =>
    loadJson("profit-height-unit", "cm") === "in" ? "in" : "cm",
  );
  const [waterByDay, setWaterByDay] = useState(() =>
    loadJson("profit-water-by-day", {}),
  );
  const [kcalByDay, setKcalByDay] = useState(() =>
    loadJson("profit-kcal-by-day", {}),
  );
  const [waterGoal, setWaterGoal] = useState(() =>
    Math.min(
      7000,
      Math.max(500, Number(loadJson("profit-water-goal", 2000)) || 2000),
    ),
  );
  const [kcalGoal, setKcalGoal] = useState(() =>
    Math.min(
      10000,
      Math.max(500, Number(loadJson("profit-kcal-goal", 2000)) || 2000),
    ),
  );
  const [manualGoals, setManualGoals] = useState(() =>
    Boolean(loadJson("profit-manual-goals", false)),
  );
  const [weightGoal, setWeightGoal] = useState(() => {
    const savedWeightGoal = loadJson("profit-weight-goal", "maintain");
    return weightGoalOptions.some((option) => option.id === savedWeightGoal)
      ? savedWeightGoal
      : "maintain";
  });
  const manualGoalsValuesInitialized = useRef(
    Boolean(loadJson("profit-manual-goals-initialized", false)) ||
      Boolean(loadJson("profit-manual-goals", false)),
  );
  const calculatedGoals = calculateDailyGoals(measures, weightGoal, dateOfBirth);
  const effectiveWaterGoal = manualGoals ? waterGoal : calculatedGoals.water;
  const effectiveKcalGoal = manualGoals ? kcalGoal : calculatedGoals.kcal;
  const [waterReminder, setWaterReminder] = useState(() =>
    Boolean(loadJson("profit-water-reminder", false)),
  );
  const [weightReminder, setWeightReminder] = useState(() =>
    Boolean(loadJson("profit-weight-reminder", true)),
  );
  const [weightReminderTime, setWeightReminderTime] = useState(() => {
    const saved = loadJson("profit-weight-reminder-time", "09:00");
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(saved) ? saved : "09:00";
  });
  const [proteinReminder, setProteinReminder] = useState(() =>
    Boolean(loadJson("profit-protein-reminder", false)),
  );
  const [proteinReminderTime, setProteinReminderTime] = useState(() => {
    const saved = loadJson("profit-protein-reminder-time", "15:00");
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(saved) ? saved : "15:00";
  });
  const [reminderInterval, setReminderInterval] = useState(
    () => Number(loadJson("profit-water-reminder-interval", 60)) || 60,
  );
  const [reminderDays, setReminderDays] = useState(() => {
    const savedDays = normalizeReminderDays(
      loadJson("profit-water-reminder-days", [0, 1, 2, 3, 4, 5, 6]),
    );
    return savedDays.length ? savedDays : [0, 1, 2, 3, 4, 5, 6];
  });
  const [reminderQuietHours, setReminderQuietHours] = useState(() =>
    normalizeQuietHours(
      loadJson("profit-water-reminder-quiet-hours", {
        start: "22:00",
        end: "08:00",
      }),
    ),
  );
  const [goal, setGoal] = useState(() => {
    const savedGoal = Number(loadJson("profit-goal", 3));
    const savedGoalVersion = localStorage.getItem("profit-goal-version");
    if (savedGoalVersion !== "2" && savedGoal === 4) return 3;
    return Number.isInteger(savedGoal) && savedGoal >= 1 && savedGoal <= 7
      ? savedGoal
      : 3;
  });
  const weeklyGoalBaseline = useRef(goal);
  const [weeklyGoalHistory, setWeeklyGoalHistory] = useState(() => {
    const saved = loadJson("profit-weekly-goal-history", {});
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  });
  const [name, setName] = useState(() => {
    const saved = loadJson("profit-name", null);
    return !saved || saved === "Alex" || saved === "Usuario" ? "" : saved;
  });
  const [avatar, setAvatar] = useState(() => loadJson("profit-avatar", null));
  const [palette, setPalette] = useState(() =>
    loadJson("profit-palette", "grove"),
  );
  const [theme, setTheme] = useState(() => {
    const saved = loadJson("profit-theme", "system");
    return ["light", "dark", "system"].includes(saved) ? saved : "system";
  });
  const [language, setLanguage] = useState(() => {
    const saved = loadJson("profit-language", "system");
    const hasExplicitSystemChoice = loadJson(
      "profit-language-explicit-choice",
      false,
    );
    if (!hasExplicitSystemChoice) return "system";
    return ["system", "es", "ca", "en", "fr", "de", "it", "pt"].includes(saved)
      ? saved
      : "system";
  });
  const resolvedLanguage = resolveLanguage(language);
  const chooseLanguage = (value) => {
    localStorage.setItem("profit-language-explicit-choice", JSON.stringify(true));
    setLanguage(["system", "es", "ca", "en", "fr", "de", "it", "pt"].includes(value) ? value : "system");
  };
  const [soundsMuted, setSoundsMuted] = useState(() =>
    Boolean(loadJson("profit-sounds-muted", false)),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );
  const resolvedTheme =
    theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
  const [motivation] = useState(chooseMotivationalQuote);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [formExercise, setFormExercise] = useState(undefined);
  const [formRoutine, setFormRoutine] = useState(undefined);
  const [formRoutineGroup, setFormRoutineGroup] = useState(undefined);
  const [selectedRoutine, setSelectedRoutine] = useState(null);
  const handledRoutinePlans = useRef(new Set());
  const [activeSession, setActiveSession] = useState(() => {
    const saved = loadJson("profit-active-session", null);
    if (!saved) return null;
    return {
      ...saved,
      routine: saved.routine
        ? normalizeRoutineExerciseIds(saved.routine)
        : null,
      elapsedMs: saved.elapsedMs || 0,
      paused: Boolean(saved.paused),
      segmentStartedAt: saved.paused
        ? null
        : (saved.segmentStartedAt ?? saved.startedAt),
    };
  });
  const activeRoutine = activeSession?.routine || null;
  const [workoutChooserOpen, setWorkoutChooserOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [measureHistoryOpen, setMeasureHistoryOpen] = useState(false);
  const [measurePhotosOpen, setMeasurePhotosOpen] = useState(false);
  const [photoGalleryResumeId, setPhotoGalleryResumeId] = useState("");
  const [editingMeasure, setEditingMeasure] = useState(null);
  const returnToPhotoGalleryAfterMeasureEdit = useRef(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [deleteWorkoutsOpen, setDeleteWorkoutsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [celebrationWorkout, setCelebrationWorkout] = useState(null);
  const [nativeTimerAvailable, setNativeTimerAvailable] = useState(false);
  const [toast, setToastState] = useState("");
  const setToast = (message) => {
    if (isWarningMessage(message)) playWarningSound();
    setToastState(message);
  };
  const openWeighInModal = () => {
    setTab("profile");
    setEditingMeasure(null);
    setMeasureOpen(true);
  };

  useEffect(() => {
    const importRoutinePlan = (value) => {
      if (!value || handledRoutinePlans.current.has(value)) return;
      handledRoutinePlans.current.add(value);
      try {
        const payload = decodeRoutinePlan(value);
        if (
          payload?.type !== "profit-routine-plan" ||
          payload.version !== 1 ||
          !Array.isArray(payload.routines) ||
          !payload.routines.length ||
          payload.routines.length > 7 ||
          (payload.exercises !== undefined &&
            (!Array.isArray(payload.exercises) ||
              payload.exercises.length > 100 ||
              payload.exercises.some(
                (exercise) =>
                  !exercise ||
                  typeof exercise.id !== "string" ||
                  !exercise.id.startsWith("builder-") ||
                  typeof exercise.name !== "string" ||
                  typeof exercise.muscle !== "string",
              ))) ||
          payload.routines.some(
            (routine) =>
              !routine ||
              typeof routine.id !== "string" ||
              typeof routine.name !== "string" ||
              !Array.isArray(routine.exercises) ||
              routine.exercises.length > 30 ||
              routine.exercises.some((id) => typeof id !== "string"),
          )
        )
          throw new Error("Invalid routine plan");
        const routineCount = payload.routines.length;
        const totalExerciseCount = payload.routines.reduce(
          (total, routine) => total + routine.exercises.length,
          0,
        );
        const currentExercises = exercisesRef.current;
        const importCandidates = [...currentExercises];
        const exerciseIdMap = new Map();
        const exercisesToMerge = [];
        let newExerciseCount = 0;
        for (const sourceExercise of payload.exercises || []) {
          const incomingExercise = normalizeExerciseData(sourceExercise);
          const incomingKey = routineImportExerciseKey(incomingExercise);
          const matchingDefinition = importCandidates.find(
            (exercise) => routineImportExerciseKey(exercise) === incomingKey,
          );
          if (matchingDefinition) {
            exerciseIdMap.set(incomingExercise.id, matchingDefinition.id);
            continue;
          }

          const matchingIdIndex = importCandidates.findIndex(
            (exercise) => exercise.id === incomingExercise.id,
          );
          if (matchingIdIndex >= 0) {
            // Same ID with edited non-visual data: update it, but don't count
            // it as a newly created exercise.
            exerciseIdMap.set(incomingExercise.id, incomingExercise.id);
            exercisesToMerge.push(incomingExercise);
            importCandidates[matchingIdIndex] = incomingExercise;
            continue;
          }

          newExerciseCount++;
          exerciseIdMap.set(incomingExercise.id, incomingExercise.id);
          exercisesToMerge.push(incomingExercise);
          importCandidates.push(incomingExercise);
        }
        const routinesToImport = payload.routines.map((routine) => {
          const remapId = (id) => exerciseIdMap.get(id) || id;
          return normalizeRoutineExerciseIds({
            ...routine,
            exercises: routine.exercises.map(remapId),
            exerciseSettings: Object.fromEntries(
              Object.entries(routine.exerciseSettings || {}).map(
                ([id, settings]) => [remapId(id), settings],
              ),
            ),
          });
        });
        const routineLabel = routineCount === 1 ? "rutina" : "rutinas";
        const exerciseLabel = totalExerciseCount === 1 ? "ejercicio" : "ejercicios";
        const messageParts = [
          (routineCount === 1 ? "Se añadirá " : "Se añadirán ") +
            routineCount + " " + routineLabel + " con " +
            totalExerciseCount + " " + exerciseLabel + " en total.",
        ];
        if (newExerciseCount) {
          messageParts.push(
            (newExerciseCount === 1 ? "Se añadirá " : "Se añadirán ") +
              newExerciseCount + " " +
              (newExerciseCount === 1 ? "ejercicio nuevo" : "ejercicios nuevos") +
              " a tu biblioteca.",
          );
        } else if (payload.exercises?.length) {
          messageParts.push("Los ejercicios incluidos ya están en tu biblioteca.");
        }
        setConfirmation({
          title: "Importar rutinas",
          message: messageParts.join(" ") + " ¿Quieres continuar?",
          confirmLabel: "Añadir",
          icon: "dumbbell",
          buttonVariant: "primary",
          onConfirm: () => {
            if (exercisesToMerge.length) {
              setExercises((current) =>
                mergeById(current, exercisesToMerge),
              );
            }
            setRoutineGroups((current) =>
              mergeRoutineGroups(
                current,
                routinesToImport.map((routine) => routine.group),
              ),
            );
            setRoutines((current) => mergeById(current, routinesToImport));
            setSelectedRoutine(routinesToImport[0]);
            setTab("training");
            setToast("Rutina importada");
          },
        });
      } catch {
        setToast("No se pudo importar la rutina del enlace");
      } finally {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    };
    const readRoutineHash = () => {
      const match = window.location.hash.match(/^#routine-plan=([A-Za-z0-9_$-]+)$/);
      if (match) importRoutinePlan(match[1]);
    };
    window.addEventListener("hashchange", readRoutineHash);
    readRoutineHash();
    if (Capacitor.getPlatform() === "android") {
      RoutineLink.consume()
        .then(({ payload }) => importRoutinePlan(payload))
        .catch(() => {});
    }
    return () => window.removeEventListener("hashchange", readRoutineHash);
  }, []);

  useEffect(() => {
    const consumeWeighInAction = () => {
      WeighInReminder.consumeOpenWeighIn()
        .then((result) => {
          if (result?.openWeighIn) openWeighInModal();
        })
        .catch(() => {});
    };
    window.addEventListener("profit:open-weigh-in", consumeWeighInAction);
    if (Capacitor.getPlatform() === "android") consumeWeighInAction();
    return () =>
      window.removeEventListener("profit:open-weigh-in", consumeWeighInAction);
  }, []);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let backListener;
    AndroidNavigation.addListener("backButton", returnToPreviousTab)
      .then((listener) => {
        backListener = listener;
      })
      .catch(() => {});
    return () => {
      backListener?.remove();
    };
  }, []);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    const syncBackAvailability = () => {
      const hasModal = Boolean(document.querySelector(".modal-backdrop"));
      AndroidNavigation.setCanGoBack({
        canGoBack:
          hasModal ||
          tabRef.current !== "home" ||
          tabHistory.current.length > 0,
      }).catch(() => {});
    };
    syncBackAvailability();
    const observer = new MutationObserver(syncBackAvailability);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tab]);

  useEffect(() => {
    localStorage.setItem("profit-exercises", JSON.stringify(exercises));
    localStorage.setItem("profit-library-version", "10");
  }, [exercises]);
  useEffect(() => {
    localStorage.setItem(
      "profit-routine-groups",
      JSON.stringify(routineGroups),
    );
  }, [routineGroups]);
  useEffect(() => {
    localStorage.setItem(
      "profit-dashboard-layout",
      JSON.stringify(dashboardLayout),
    );
  }, [dashboardLayout]);
  useEffect(() => {
    localStorage.setItem("profit-workouts", JSON.stringify(workouts));
  }, [workouts]);
  useEffect(() => {
    localStorage.setItem("profit-routines", JSON.stringify(routines));
  }, [routines]);
  useEffect(() => {
    localStorage.setItem("profit-measures", JSON.stringify(measures));
  }, [measures]);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    measures
      .filter((measure) => measure.photoUri && !measure.photoAssetId)
      .forEach((measure) => {
        ProgressPhotos.photoExists({ uri: measure.photoUri })
          .then(({ exists }) => {
            if (!exists) unlinkMeasurePhotoReference(measure.id);
          })
          .catch(() => {});
      });
  }, [measures]);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    measures
      .filter((measure) => measure.photoAssetId)
      .forEach((measure) => {
        if (photoMigrationInFlight.current.has(measure.id)) return;
        photoMigrationInFlight.current.add(measure.id);
        (async () => {
          try {
            if (measure.photoUri) {
              const { exists } = await ProgressPhotos.photoExists({
                uri: measure.photoUri,
              });
              if (!exists) {
                await deleteExerciseAsset(measure.photoAssetId);
                updateMeasurePhotoRecord(measure.id, (item) => {
                  const {
                    photoUri: _missingUri,
                    photoAssetId: _missingAssetId,
                    ...withoutPhoto
                  } = item;
                  return withoutPhoto;
                });
                return;
              }
              await deleteExerciseAsset(measure.photoAssetId);
              updateMeasurePhotoRecord(measure.id, (item) => {
                const { photoAssetId: _migratedAssetId, ...withoutLegacyAsset } = item;
                return withoutLegacyAsset;
              });
              photoMigrationAttempts.current.delete(measure.id);
              return;
            }

            const legacyPhoto = await getExerciseAsset(measure.photoAssetId);
            if (!legacyPhoto) {
              updateMeasurePhotoRecord(measure.id, (item) => {
                const { photoAssetId: _missingAssetId, ...withoutLegacyAsset } = item;
                if (item.photoUri) return withoutLegacyAsset;
                const { photoUri: _missingUri, ...withoutPhoto } = withoutLegacyAsset;
                return withoutPhoto;
              });
              return;
            }
            const saved = await saveProgressPhotoToGallery(legacyPhoto);
            const { exists } = await ProgressPhotos.photoExists({ uri: saved.uri });
            if (!exists) throw new Error("La foto no aparece en la galería después de guardarla.");
            const migratedUri = saved.uri;
            const measureStillExists = loadJson("profit-measures", [])
              .some((item) => item.id === measure.id);
            if (!measureStillExists) {
              await ProgressPhotos.deletePhoto({ uri: migratedUri }).catch(() => {});
              await deleteExerciseAsset(measure.photoAssetId).catch(() => {});
              return;
            }

            // Keep both references durably until IndexedDB confirms deletion. A
            // retry can then reuse the gallery URI instead of writing a second copy.
            updateMeasurePhotoRecord(measure.id, (item) => ({
              ...item,
              photoUri: migratedUri,
            }));
            await deleteExerciseAsset(measure.photoAssetId);
            updateMeasurePhotoRecord(measure.id, (item) => {
              const { photoAssetId: _migratedAssetId, ...withoutLegacyAsset } = item;
              return withoutLegacyAsset;
            });
            photoMigrationAttempts.current.delete(measure.id);
          } catch {
            const attempts = (photoMigrationAttempts.current.get(measure.id) || 0) + 1;
            photoMigrationAttempts.current.set(measure.id, attempts);
            if (!photoMigrationNotified.current) {
              photoMigrationNotified.current = true;
              setToast(translateText("No se pudo mover una foto de progreso a Fotos/ProFit. Se volverá a intentar."));
            }
            if (attempts < 3) {
              window.setTimeout(() => {
                setMeasures((current) => [...current]);
              }, 4000);
            }
          } finally {
            photoMigrationInFlight.current.delete(measure.id);
          }
        })();
      });
  }, [measures]);
  useEffect(() => {
    localStorage.setItem(
      "profit-progress-photos-high-resolution",
      JSON.stringify(highResolutionProgressPhotos),
    );
  }, [highResolutionProgressPhotos]);
  useEffect(() => {
    localStorage.setItem("profit-date-of-birth", JSON.stringify(dateOfBirth));
  }, [dateOfBirth]);
  useEffect(() => {
    localStorage.setItem("profit-onboarding-flow-version", JSON.stringify(2));
    if (guideStep === null) {
      localStorage.setItem("profit-onboarding-complete", JSON.stringify(true));
      localStorage.removeItem("profit-onboarding-step");
    } else {
      localStorage.setItem("profit-onboarding-step", JSON.stringify(guideStep));
      localStorage.removeItem("profit-onboarding-complete");
    }
  }, [guideStep]);
  useEffect(() => {
    localStorage.setItem("profit-unit", JSON.stringify(unit));
  }, [unit]);
  useEffect(() => {
    localStorage.setItem("profit-height-unit", JSON.stringify(heightUnit));
  }, [heightUnit]);
  useEffect(() => {
    localStorage.setItem("profit-water-by-day", JSON.stringify(waterByDay));
  }, [waterByDay]);
  useEffect(() => {
    localStorage.setItem("profit-kcal-by-day", JSON.stringify(kcalByDay));
  }, [kcalByDay]);
  useEffect(() => {
    localStorage.setItem("profit-water-goal", JSON.stringify(waterGoal));
  }, [waterGoal]);
  useEffect(() => {
    localStorage.setItem("profit-kcal-goal", JSON.stringify(kcalGoal));
  }, [kcalGoal]);
  useEffect(() => {
    localStorage.setItem("profit-manual-goals", JSON.stringify(manualGoals));
  }, [manualGoals]);
  useEffect(() => {
    localStorage.setItem("profit-weight-goal", JSON.stringify(weightGoal));
  }, [weightGoal]);
  useEffect(() => {
    localStorage.setItem(
      "profit-water-reminder",
      JSON.stringify(waterReminder),
    );
  }, [waterReminder]);
  useEffect(() => {
    localStorage.setItem(
      "profit-weight-reminder",
      JSON.stringify(weightReminder),
    );
  }, [weightReminder]);
  useEffect(() => {
    localStorage.setItem(
      "profit-weight-reminder-time",
      JSON.stringify(weightReminderTime),
    );
  }, [weightReminderTime]);
  useEffect(() => {
    localStorage.setItem(
      "profit-protein-reminder",
      JSON.stringify(proteinReminder),
    );
  }, [proteinReminder]);
  useEffect(() => {
    localStorage.setItem(
      "profit-protein-reminder-time",
      JSON.stringify(proteinReminderTime),
    );
  }, [proteinReminderTime]);
  useEffect(() => {
    localStorage.setItem(
      "profit-water-reminder-interval",
      JSON.stringify(reminderInterval),
    );
  }, [reminderInterval]);
  useEffect(() => {
    localStorage.setItem(
      "profit-water-reminder-days",
      JSON.stringify(reminderDays),
    );
  }, [reminderDays]);
  useEffect(() => {
    localStorage.setItem(
      "profit-water-reminder-quiet-hours",
      JSON.stringify(reminderQuietHours),
    );
  }, [reminderQuietHours]);
  useEffect(() => {
    localStorage.setItem("profit-goal", JSON.stringify(goal));
    localStorage.setItem("profit-goal-version", "2");
  }, [goal]);
  useEffect(() => {
    localStorage.setItem(
      "profit-weekly-goal-history",
      JSON.stringify(weeklyGoalHistory),
    );
  }, [weeklyGoalHistory]);
  useEffect(() => {
    localStorage.setItem("profit-week-start", JSON.stringify(weekStartsOn));
  }, [weekStartsOn]);
  useEffect(() => {
    const timer = setInterval(() => {
      const currentDay = dateKey(today());
      setCalendarDay((previousDay) =>
        previousDay === currentDay ? previousDay : currentDay,
      );
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const currentWeekStart = weekStartKey(today(), weekStartsOn);
    const firstWorkoutDate = workouts
      .map((workout) => workout.date)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()[0];
    const firstWeekStart = firstWorkoutDate
      ? weekStartKey(new Date(`${firstWorkoutDate}T12:00:00`), weekStartsOn)
      : currentWeekStart;
    setWeeklyGoalHistory((current) => {
      let next = current;
      for (
        let week = firstWeekStart;
        week <= currentWeekStart;
        week = shiftDateKey(week, 7)
      ) {
        if (next[week]) continue;
        if (next === current) next = { ...current };
        next[week] =
          week === currentWeekStart ? goal : weeklyGoalBaseline.current;
      }
      return next;
    });
  }, [goal, workouts, calendarDay, weekStartsOn]);
  useEffect(() => {
    localStorage.setItem("profit-name", JSON.stringify(name));
  }, [name]);
  useEffect(() => {
    try {
      if (avatar) localStorage.setItem("profit-avatar", JSON.stringify(avatar));
      else localStorage.removeItem("profit-avatar");
    } catch {
      setToast(
        "No se pudo guardar la foto. Prueba con una imagen más pequeña.",
      );
    }
  }, [avatar]);
  useEffect(() => {
    localStorage.setItem("profit-palette", JSON.stringify(palette));
  }, [palette]);
  useEffect(() => {
    localStorage.setItem("profit-theme", JSON.stringify(theme));
  }, [theme]);
  useEffect(() => {
    let current = true;
    activateLanguage(resolvedLanguage).then(() => {
      if (current) setLocaleRevision((revision) => revision + 1);
    });
    localStorage.setItem("profit-language", JSON.stringify(language));
    return () => {
      current = false;
    };
  }, [language, resolvedLanguage]);
  useEffect(() => {
    document.documentElement.lang = resolvedLanguage;
    document.title =
      resolvedLanguage === "en"
        ? "ProFit — Train at your pace"
        : resolvedLanguage === "ca"
          ? "ProFit — Entrena al teu ritme"
          : resolvedLanguage === "pt"
            ? "ProFit — Treina ao teu ritmo"
            : "ProFit — Entrena a tu ritmo";
    const description = document.querySelector("meta[name=description]");
    if (description)
      description.content =
        resolvedLanguage === "en"
          ? "ProFit: log your workouts and track your progress, all stored locally."
          : resolvedLanguage === "ca"
            ? "ProFit: registra els entrenaments i segueix el progrés, tot localment."
            : resolvedLanguage === "pt"
              ? "ProFit: regista os teus treinos e acompanha o teu progresso, tudo guardado localmente."
              : "ProFit: registra tus entrenamientos y sigue tu progreso, todo en local.";
  }, [resolvedLanguage]);
  useEffect(() => {
    localStorage.setItem("profit-sounds-muted", JSON.stringify(soundsMuted));
  }, [soundsMuted]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const syncTheme = (event) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(media.matches);
    media.addEventListener?.("change", syncTheme);
    return () => media.removeEventListener?.("change", syncTheme);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.body.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    if (activeSession)
      localStorage.setItem(
        "profit-active-session",
        JSON.stringify(activeSession),
      );
    else localStorage.removeItem("profit-active-session");
  }, [activeSession]);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    if (!activeSession) {
      WorkoutNotification.stop()
        .then(() => setNativeTimerAvailable(false))
        .catch(() => setNativeTimerAvailable(false));
      return;
    }
    const elapsedMs = Math.max(
      0,
      (activeSession.elapsedMs || 0) +
        (activeSession.paused
          ? 0
          : Date.now() -
            (activeSession.segmentStartedAt ?? activeSession.startedAt)),
    );
    WorkoutNotification.show({
      title:
        activeSession.routine?.name || translateText("Entrenamiento libre"),
      elapsedMs,
      paused: activeSession.paused,
      language: resolvedLanguage,
    })
      .then((result) => setNativeTimerAvailable(Boolean(result?.shown)))
      .catch(() => setNativeTimerAvailable(false));
  }, [activeSession, resolvedLanguage]);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    const applySessionAction = (action) => {
      if (action !== "pause" && action !== "resume") return;
      setActiveSession((current) => {
        if (
          !current ||
          (action === "pause" && current.paused) ||
          (action === "resume" && !current.paused)
        )
          return current;
        if (action === "pause") {
          const now = Date.now();
          const elapsedMs = Math.max(
            0,
            (current.elapsedMs || 0) +
              now -
              (current.segmentStartedAt ?? current.startedAt),
          );
          return {
            ...current,
            elapsedMs,
            segmentStartedAt: null,
            paused: true,
          };
        }
        return { ...current, segmentStartedAt: Date.now(), paused: false };
      });
    };
    const handleNotificationAction = (event) =>
      applySessionAction(event.detail?.action);
    const consumePendingAction = () =>
      WorkoutNotification.consumeAction()
        .then((result) => applySessionAction(result?.action))
        .catch(() => {});
    const handleVisibility = () => {
      if (document.visibilityState === "visible") consumePendingAction();
    };
    window.addEventListener(
      "profit-workout-notification-action",
      handleNotificationAction,
    );
    document.addEventListener("visibilitychange", handleVisibility);
    consumePendingAction();
    return () => {
      window.removeEventListener(
        "profit-workout-notification-action",
        handleNotificationAction,
      );
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
  useEffect(() => {
    if (Capacitor.getPlatform() === "android") {
      HydrationReminder.schedule({
        enabled: waterReminder,
        intervalMinutes: reminderInterval,
        daysOfWeek: reminderDays.join(","),
        quietStart: reminderQuietHours.start,
        quietEnd: reminderQuietHours.end,
        language: resolvedLanguage,
      })
        .then((result) => {
          if (waterReminder && result?.scheduled === false) {
            setWaterReminder(false);
            setToast(
              "Activa las notificaciones de ProFit para recibir recordatorios de agua",
            );
          }
        })
        .catch(() => {
          if (waterReminder)
            setToast("No se pudieron programar los recordatorios de agua");
        });
      return;
    }
    if (waterReminder) {
      if (
        !("Notification" in window) ||
        window.Notification.permission !== "granted"
      )
        return;
      const timer = setInterval(() => {
        const now = new Date();
        if (
          !reminderDays.includes(now.getDay()) ||
          isReminderQuietNow(now, reminderQuietHours)
        )
          return;
        playNotificationSound();
        new window.Notification(translateText("Un momento para hidratarte"), {
          body: translateText(
            "Bebe un poco de agua y registra tu progreso en ProFit.",
          ),
        });
      }, reminderInterval * 60_000);
      return () => clearInterval(timer);
    }
  }, [
    waterReminder,
    reminderInterval,
    reminderDays,
    reminderQuietHours,
    resolvedLanguage,
  ]);
  useEffect(() => {
    if (guideStep !== null) return;
    const [hour, minute] = weightReminderTime.split(":").map(Number);
    if (Capacitor.getPlatform() === "android") {
      WeighInReminder.schedule({
        enabled: weightReminder,
        hour,
        minute,
        language: resolvedLanguage,
      })
        .then((result) => {
          if (weightReminder && result?.scheduled === false)
            setToast(
              "Activa las notificaciones de ProFit para recibir el recordatorio de pesaje",
            );
        })
        .catch(() => {
          if (weightReminder)
            setToast("No se pudo programar el recordatorio de pesaje");
        });
      return;
    }
    if (
      !weightReminder ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted"
    )
      return;
    const notifyAtChosenTime = () => {
      const now = new Date();
      const key = dateKey(now);
      const alreadyNotified =
        localStorage.getItem("profit-weigh-in-notified-date") === key;
      if (
        !alreadyNotified &&
        now.getHours() === hour &&
        now.getMinutes() === minute
      ) {
        playNotificationSound();
        const notification = new window.Notification(
          translateText("Hora de tu pesaje"),
          {
          body: translateText(
            "Registra tu peso de hoy y sigue tu progreso en ProFit.",
          ),
          },
        );
        notification.onclick = () => {
          window.focus();
          notification.close();
          openWeighInModal();
        };
        localStorage.setItem("profit-weigh-in-notified-date", key);
      }
    };
    notifyAtChosenTime();
    const timer = setInterval(notifyAtChosenTime, 30_000);
    return () => clearInterval(timer);
  }, [guideStep, weightReminder, weightReminderTime, resolvedLanguage]);
  useEffect(() => {
    if (guideStep !== null) return;
    const [hour, minute] = proteinReminderTime.split(":").map(Number);
    if (Capacitor.getPlatform() === "android") {
      ProteinReminder.schedule({
        enabled: proteinReminder,
        hour,
        minute,
        language: resolvedLanguage,
      })
        .then((result) => {
          if (proteinReminder && result?.scheduled === false)
            setToast(
              "Activa las notificaciones de ProFit para recibir el recordatorio de proteína",
            );
        })
        .catch(() => {
          if (proteinReminder)
            setToast("No se pudo programar el recordatorio de proteína");
        });
      return;
    }
    if (
      !proteinReminder ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted"
    )
      return;
    const notifyAtChosenTime = () => {
      const now = new Date();
      const key = dateKey(now);
      const alreadyNotified =
        localStorage.getItem("profit-protein-notified-date") === key;
      if (
        !alreadyNotified &&
        now.getHours() === hour &&
        now.getMinutes() === minute
      ) {
        playNotificationSound();
        new window.Notification(translateText("Hora de tu proteína"), {
          body: translateText(
            "Recuerda incluir proteína en tu alimentación de hoy.",
          ),
        });
        localStorage.setItem("profit-protein-notified-date", key);
      }
    };
    notifyAtChosenTime();
    const timer = setInterval(notifyAtChosenTime, 30_000);
    return () => clearInterval(timer);
  }, [guideStep, proteinReminder, proteinReminderTime, resolvedLanguage]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 2700);
    return () => clearTimeout(timeout);
  }, [toast]);

  const todayKey = calendarDay;
  const updateWeeklyGoal = (value, startDay = weekStartsOn) => {
    const nextGoal = Math.min(7, Math.max(1, Number(value) || 1));
    setGoal(nextGoal);
    setWeeklyGoalHistory((current) => ({
      ...current,
      [weekStartKey(today(), startDay)]: nextGoal,
    }));
  };
  const updateSoundsMuted = (value) => {
    const muted = Boolean(value);
    localStorage.setItem("profit-sounds-muted", JSON.stringify(muted));
    setSoundsMuted(muted);
  };
  const updateManualGoals = (enabled) => {
    if (enabled && !manualGoalsValuesInitialized.current) {
      setWaterGoal(calculatedGoals.water);
      setKcalGoal(calculatedGoals.kcal);
      manualGoalsValuesInitialized.current = true;
      localStorage.setItem(
        "profit-manual-goals-initialized",
        JSON.stringify(true),
      );
    }
    setManualGoals(Boolean(enabled));
  };
  const todayWater = Number(waterByDay[todayKey] || 0);
  const todayKcal = Number(kcalByDay[todayKey] || 0);
  const addWater = (amount) => {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    if (!value) return;
    const key = dateKey(today());
    setWaterByDay((current) => ({
      ...current,
      [key]: Number(current[key] || 0) + value,
    }));
    if (Capacitor.getPlatform() === "android" && waterReminder)
      HydrationReminder.recordWater().catch(() => {});
  };
  const addKcal = (amount) => {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    if (!value) return;
    const key = dateKey(today());
    setKcalByDay((current) => ({
      ...current,
      [key]: Number(current[key] || 0) + value,
    }));
  };
  const resetWaterToday = () => {
    setWaterByDay((current) => ({ ...current, [todayKey]: 0 }));
    setToast("Hidratación de hoy reiniciada");
  };
  const resetKcalToday = () => {
    setKcalByDay((current) => ({ ...current, [todayKey]: 0 }));
    setToast("Consumo de calorías de hoy reiniciado");
  };
  const toggleWaterReminder = async (enabled) => {
    if (
      enabled &&
      Capacitor.getPlatform() !== "android" &&
      "Notification" in window
    ) {
      const permission =
        window.Notification.permission === "default"
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
      if (permission !== "granted") {
        setToast("Permite las notificaciones para activar los recordatorios");
        return;
      }
    }
    setWaterReminder(enabled);
  };
  const toggleWeightReminder = async (enabled) => {
    if (!enabled) {
      setWeightReminder(false);
      return;
    }
    if (Capacitor.getPlatform() !== "android" && "Notification" in window) {
      const permission =
        window.Notification.permission === "default"
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
      if (permission !== "granted") {
        setToast(
          "Permite las notificaciones para activar el recordatorio de pesaje",
        );
        return;
      }
    }
    setWeightReminder(true);
  };
  const toggleProteinReminder = async (enabled) => {
    if (!enabled) {
      setProteinReminder(false);
      return;
    }
    if (Capacitor.getPlatform() !== "android" && "Notification" in window) {
      const permission =
        window.Notification.permission === "default"
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
      if (permission !== "granted") {
        setToast("Permite las notificaciones para activar el recordatorio de proteína");
        return;
      }
    }
    setProteinReminder(true);
  };
  const finishOnboarding = async () => {
    if (
      (weightReminder || waterReminder || proteinReminder) &&
      Capacitor.getPlatform() !== "android" &&
      "Notification" in window &&
      window.Notification.permission === "default"
    ) {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted")
        setToast(
          "La guía terminó; activa las notificaciones para recibir el aviso diario",
        );
    }
    localStorage.setItem("profit-onboarding-complete", JSON.stringify(true));
    localStorage.removeItem("profit-onboarding-step");
    setGuideStep(null);
  };

  const askToConfirm = (options) => setConfirmation(options);
  const resolveConfirmation = () => {
    const action = confirmation?.onConfirm;
    setConfirmation(null);
    action?.();
  };

  const handleAvatarFile = (file) => {
    if (!file.type.startsWith("image/")) {
      setToast("Elige un archivo de imagen");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const maxDimension = 384;
        const scale = Math.min(
          1,
          maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setAvatar(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        setToast("No se pudo procesar esta foto");
      }
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setToast("No se pudo abrir esta imagen");
    };
    image.src = objectUrl;
  };

  const saveExercise = async (exercise) => {
    try {
      const { mediaFile, previewFile, removeMedia, removePreview, ...fields } =
        exercise;
      const previous = exercises.find((item) => item.id === exercise.id);
      let saved = normalizeExerciseData(fields);
      delete saved.group;
      if (mediaFile) {
        await saveExerciseAsset(exercise.id, mediaFile);
        saved.mediaAssetId = exercise.id;
        saved.mediaType = mediaFile.type;
      } else if (removeMedia) {
        try {
          await deleteExerciseAsset(previous?.mediaAssetId || exercise.id);
        } catch {}
        saved.mediaAssetId = null;
        saved.mediaType = null;
      } else if (previous?.mediaAssetId && !saved.mediaAssetId) {
        saved.mediaAssetId = previous.mediaAssetId;
        saved.mediaType = previous.mediaType;
      }
      if (previewFile) {
        const previewId = `${exercise.id}-preview`;
        await saveExerciseAsset(previewId, previewFile);
        saved.previewAssetId = previewId;
        saved.previewType = previewFile.type;
      } else if (removePreview) {
        try {
          await deleteExerciseAsset(
            previous?.previewAssetId || `${exercise.id}-preview`,
          );
        } catch {}
        saved.previewAssetId = null;
        saved.previewType = null;
      } else if (previous?.previewAssetId && !saved.previewAssetId) {
        saved.previewAssetId = previous.previewAssetId;
        saved.previewType = previous.previewType;
      }
      setExercises((current) =>
        current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      setFormExercise(undefined);
      setSelectedExercise(null);
      setToast("Ejercicio guardado en tu biblioteca");
    } catch (error) {
      console.error("Error saving exercise media", error);
      setToast("No se pudo guardar el medio de este ejercicio");
    }
  };
  const restoreBundledExerciseName = (exerciseId) => {
    const original = bundledExerciseById.get(exerciseId);
    if (!original) return;
    const restore = (exercise) =>
      exercise.id === exerciseId
        ? { ...exercise, name: original.name }
        : exercise;
    setExercises((current) => current.map(restore));
    setSelectedExercise((current) =>
      current?.id === exerciseId ? restore(current) : current,
    );
    setToast("Nombre original restaurado");
  };
  const deleteSecondaryMuscle = (muscle, onDeleted) => {
    const key = normalizeMuscleFilterValue(muscle);
    if (!key) return;
    askToConfirm({
      title: "Eliminar músculo personalizado",
      message: `Se quitará “${muscle}” de la lista, los ejercicios y sus registros del historial. También dejará de aparecer en el radar.`,
      confirmLabel: "Eliminar músculo",
      onConfirm: () => {
        const cleanDefinition = (exercise) =>
          normalizeExerciseData({
            ...exercise,
            muscle:
              normalizeMuscleFilterValue(exercise.muscle) === key
                ? ""
                : exercise.muscle,
            secondary: (exercise.secondary || []).filter(
              (item) => normalizeMuscleFilterValue(item) !== key,
            ),
          });
        const cleanWorkout = (workout) =>
          normalizeWorkoutExercises({
            ...workout,
            exercises: (workout.exercises || []).map(cleanDefinition),
          });
        onDeleted?.();
        setExercises((current) => current.map(cleanDefinition));
        setWorkouts((current) => current.map(cleanWorkout));
        setSelectedWorkout((current) =>
          current ? cleanWorkout(current) : current,
        );
        setToast(`“${muscle}” eliminado de los músculos y del radar`);
      },
    });
  };
  const createRoutineGroup = (name) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) return;
    const existing = routineGroups.find(
      (group) =>
        group.toLocaleLowerCase("es") === cleanName.toLocaleLowerCase("es"),
    );
    if (existing) {
      setToast(`El grupo «${existing}» ya existe`);
      return;
    }
    setRoutineGroups((current) => mergeRoutineGroups(current, [cleanName]));
    setRoutineGroupOpen(false);
    setToast(`Grupo «${cleanName}» creado`);
  };
  const saveRoutine = (routine) => {
    const savedRoutine = normalizeRoutineExerciseIds({
      ...routine,
      exercises: Array.isArray(routine.exercises) ? routine.exercises : [],
    });
    if (savedRoutine.group)
      setRoutineGroups((current) =>
        mergeRoutineGroups(current, [savedRoutine.group]),
      );
    setRoutines((current) =>
      current.some((item) => item.id === savedRoutine.id)
        ? current.map((item) =>
            item.id === savedRoutine.id ? savedRoutine : item,
          )
        : [...current, savedRoutine],
    );
    setFormRoutine(undefined);
    setFormRoutineGroup(undefined);
    setTab("training");
    setSelectedRoutine(savedRoutine);
    setToast(
      savedRoutine.exercises.length
        ? "Rutina actualizada"
        : "Rutina creada · ahora puedes añadir ejercicios",
    );
  };
  const updateRoutine = (routine) => {
    const normalizedRoutine = normalizeRoutineExerciseIds(routine);
    if (routine.group)
      setRoutineGroups((current) =>
        mergeRoutineGroups(current, [routine.group]),
      );
    setRoutines((current) =>
      current.map((item) =>
        item.id === normalizedRoutine.id ? normalizedRoutine : item,
      ),
    );
    setSelectedRoutine(normalizedRoutine);
  };
  const deleteRoutine = (routine) => {
    askToConfirm({
      title: "Eliminar rutina",
      message: `¿Eliminar “${routine.name}”? Las sesiones guardadas no se borrarán.`,
      confirmLabel: "Eliminar",
      onConfirm: () => {
        setRoutines((current) =>
          current.filter((item) => item.id !== routine.id),
        );
        setToast("Rutina eliminada");
      },
    });
  };
  const deleteRoutineGroup = (group) => {
    const groupName = String(group?.name || "").trim();
    const isUngrouped = !groupName;
    const displayName = groupName || "(Sin grupo)";
    const matchesGroup = (value) => {
      const valueName = String(value || "").trim();
      return isUngrouped
        ? !valueName
        : valueName.toLocaleLowerCase("es") ===
            groupName.toLocaleLowerCase("es");
    };
    const attachedRoutines = routines.filter((routine) =>
      matchesGroup(routine.group),
    );
    const attachedIds = new Set(attachedRoutines.map((routine) => routine.id));
    const routineCountLabel = `${attachedRoutines.length} ${attachedRoutines.length === 1 ? "rutina asociada" : "rutinas asociadas"}`;
    askToConfirm({
      title: "Eliminar grupo",
      message: attachedRoutines.length
        ? `Se eliminará «${displayName}» y sus ${routineCountLabel}. Las sesiones ya guardadas se conservarán.`
        : `Se eliminará «${displayName}». Las sesiones ya guardadas se conservarán.`,
      confirmLabel: attachedRoutines.length
        ? "Eliminar grupo y rutinas"
        : "Eliminar grupo",
      onConfirm: () => {
        setRoutineGroups((current) =>
          current.filter((name) => !matchesGroup(name)),
        );
        setRoutines((current) =>
          current.filter((routine) => !matchesGroup(routine.group)),
        );
        setSelectedRoutine((current) =>
          current && attachedIds.has(current.id) ? null : current,
        );
        setFormRoutine((current) =>
          current && attachedIds.has(current.id) ? undefined : current,
        );
        setToast(
          attachedRoutines.length
            ? `Grupo y ${routineCountLabel} eliminados`
            : `Grupo «${displayName}» eliminado`,
        );
      },
    });
  };
  const packageExercise = async (exercise) => {
    const packaged = normalizeExerciseData(exercise);
    delete packaged.mediaAssetId;
    delete packaged.previewAssetId;
    const loadPackagedAsset = async (assetId, source, fallbackType) => {
      let blob = assetId
        ? await getExerciseAsset(assetId).catch(() => null)
        : null;
      if (!blob && source) {
        const response = await fetch(source);
        if (!response.ok)
          throw new Error(
            `No se pudo leer el medio de «${exercise.name}» para exportarlo.`,
          );
        blob = await response.blob();
      }
      if (!blob && assetId)
        throw new Error(
          `Falta el archivo multimedia de «${exercise.name}». No se exportó una copia incompleta.`,
        );
      if (!blob) return null;
      if (!blob.size)
        throw new Error(
          `El archivo multimedia de «${exercise.name}» está vacío.`,
        );
      return {
        data: new Uint8Array(await blob.arrayBuffer()),
        type: blob.type || fallbackType || "application/octet-stream",
      };
    };
    const media = await loadPackagedAsset(
      exercise.mediaAssetId,
      exercise.media,
      exercise.mediaType,
    );
    if (media) {
      packaged.mediaData = media.data;
      packaged.mediaDataType = media.type;
    }
    const preview = await loadPackagedAsset(
      exercise.previewAssetId,
      exercise.poster,
      exercise.previewType || "image/jpeg",
    );
    if (preview) {
      packaged.previewData = preview.data;
      packaged.previewDataType = preview.type;
    }
    return packaged;
  };
  const shareRoutine = async (routine, target = "share") => {
    try {
      const bundledExercises = await Promise.all(
        routine.exercises
          .map((id) => exercises.find((exercise) => exercise.id === id))
          .filter(Boolean)
          .map(packageExercise),
      );
      const destination = await shareMessagePack(
        `${routine.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "rutina"}.msgpack`,
        `Rutina: ${routine.name}`,
        "routine",
        { routine, exercises: bundledExercises },
        target,
      );
      setToast(
        destination === "cancelled"
          ? ""
          : destination === "saved"
            ? "Archivo de rutina guardado"
            : "Elige una app para compartir la rutina",
      );
    } catch (error) {
      if (error?.name !== "AbortError")
        setToast(error?.message || "No se pudo exportar esta rutina");
    }
  };
  const shareRoutineGroup = async (group, target = "share") => {
    try {
      const ungrouped = !String(group.name || "").trim();
      const groupedRoutines = group.routines.map((routine) => ({
        ...routine,
        group: ungrouped ? "" : group.name,
      }));
      const exerciseIds = [
        ...new Set(
          groupedRoutines.flatMap((routine) => routine.exercises || []),
        ),
      ];
      const bundledExercises = await Promise.all(
        exerciseIds
          .map((id) => exercises.find((exercise) => exercise.id === id))
          .filter(Boolean)
          .map(packageExercise),
      );
      const label = ungrouped ? "rutinas sin grupo" : `grupo «${group.name}»`;
      const slug =
        (ungrouped ? translateText("Rutinas sin grupo") : group.name)
          .toLocaleLowerCase("es")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-") || "grupo";
      const destination = await shareMessagePack(
        `${slug}.msgpack`,
        ungrouped ? "Rutinas sin grupo" : `Grupo de rutinas: ${group.name}`,
        "routineGroup",
        {
          group: { name: ungrouped ? "Sin grupo" : group.name, ungrouped },
          routines: groupedRoutines,
          exercises: bundledExercises,
        },
        target,
      );
      setToast(
        destination === "cancelled"
          ? ""
          : destination === "saved"
            ? `${ungrouped ? "Rutinas sin grupo" : `Grupo «${group.name}»`} exportadas`
            : `Elige una app para compartir ${label}`,
      );
    } catch (error) {
      if (error?.name !== "AbortError")
        setToast(error?.message || "No se pudo exportar este grupo");
    }
  };
  const startRoutine = (routine) => {
    if (activeSession) {
      setToast("Termina la sesión actual antes de empezar otra");
      return;
    }
    setWorkoutChooserOpen(false);
    setSelectedRoutine(null);
    const now = Date.now();
    const routineSnapshot = routine
      ? normalizeRoutineExerciseIds({
          ...routine,
          exercises: [...routine.exercises],
          exerciseSettings: structuredClone(routine.exerciseSettings || {}),
        })
      : null;
    setActiveSession({
      routine: routineSnapshot,
      startedAt: now,
      elapsedMs: 0,
      segmentStartedAt: now,
      paused: false,
    });
  };
  const deleteExercise = (exercise) => {
    if (isBundledExercise(exercise)) {
      setToast("No se pueden eliminar los ejercicios predeterminados.");
      return;
    }
    askToConfirm({
      title: "Eliminar ejercicio",
      message: `¿Quitar “${exercise.name}” de tu biblioteca y de las rutinas donde aparece? Las sesiones guardadas se conservan.`,
      confirmLabel: "Eliminar",
      onConfirm: async () => {
        await Promise.allSettled([
          deleteExerciseAsset(exercise.mediaAssetId || exercise.id),
          deleteExerciseAsset(
            exercise.previewAssetId || `${exercise.id}-preview`,
          ),
        ]);
        setExercises((current) =>
          current.filter((item) => item.id !== exercise.id),
        );
        setRoutines((current) =>
          current.map((routine) => {
            const exerciseSettings = { ...(routine.exerciseSettings || {}) };
            delete exerciseSettings[exercise.id];
            return {
              ...routine,
              exerciseSettings,
              exercises: routine.exercises.filter((id) => id !== exercise.id),
            };
          }),
        );
        setSelectedExercise(null);
        setToast("Ejercicio eliminado");
      },
    });
  };
  const shareExercise = async (exercise, target = "share") => {
    try {
      const exportName = isBundledExercise(exercise)
        ? translateText(exercise.name)
        : exercise.name;
      const exportSlug =
        exportName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") || "exercise";
      const destination = await shareMessagePack(
        `${exportSlug}.msgpack`,
        `Ejercicio: ${exportName}`,
        "exercise",
        await packageExercise(exercise),
        target,
      );
      setToast(
        destination === "cancelled"
          ? ""
          : destination === "saved"
            ? "Archivo de ejercicio guardado"
            : "Elige una app para compartir el ejercicio",
      );
    } catch (error) {
      if (error?.name !== "AbortError")
        setToast(error?.message || "No se pudo exportar este ejercicio");
    }
  };
  const shareWorkout = async (workout, target = "share") => {
    try {
      const bundledExercises = await Promise.all(
        workout.exercises
          .map((entry) =>
            exercises.find((exercise) => exercise.id === entry.id),
          )
          .filter(Boolean)
          .map(packageExercise),
      );
      const workoutWithExerciseSnapshots = {
        ...workout,
        exercises: workout.exercises.map((entry) => {
          const definition = exercises.find(
            (exercise) => exercise.id === entry.id,
          );
          return definition
            ? normalizeExerciseData({
                ...entry,
                name: definition.name,
                muscle: definition.muscle,
                secondary: definition.secondary || [],
                equipment: definition.equipment,
                duration: definition.duration,
                description: definition.description,
                cues: definition.cues || [],
              })
            : normalizeExerciseData(entry);
        }),
      };
      const destination = await shareMessagePack(
        `${workout.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "entrenamiento"}.msgpack`,
        `Entrenamiento: ${workout.name}`,
        "workout",
        { workout: workoutWithExerciseSnapshots, exercises: bundledExercises },
        target,
      );
      setToast(
        destination === "cancelled"
          ? ""
          : destination === "saved"
            ? "Archivo de entrenamiento guardado"
            : "Elige una app para compartir el entrenamiento",
      );
    } catch (error) {
      if (error?.name !== "AbortError")
        setToast(error?.message || "No se pudo exportar este entrenamiento");
    }
  };
  const finishWorkout = (workout) => {
    playWorkoutFanfare();
    const newMedals = personalRecordsForWorkout(workout, workouts);
    const completedWorkout = { ...workout, newMedals };
    setWorkouts((current) => [completedWorkout, ...current]);
    setActiveSession(null);
    setCelebrationWorkout(completedWorkout);
    setTab("home");
    setToast("Sesión guardada en tu historial");
  };
  const pauseWorkout = (elapsedMs) => {
    setActiveSession((current) =>
      current
        ? { ...current, elapsedMs, segmentStartedAt: null, paused: true }
        : current,
    );
  };
  const resumeWorkout = () => {
    setActiveSession((current) =>
      current
        ? { ...current, segmentStartedAt: Date.now(), paused: false }
        : current,
    );
  };
  const cancelWorkout = () => {
    askToConfirm({
      title: "Cancelar sesión",
      message:
        "Se descartarán las series y comentarios de este entrenamiento. Esta acción no se puede deshacer.",
      confirmLabel: "Descartar sesión",
      onConfirm: () => {
        localStorage.removeItem("profit-active-draft");
        setActiveSession(null);
        setToast("Entrenamiento cancelado; no se guardó");
      },
    });
  };
  const deleteWorkouts = (ids, close = true) => {
    const selectedIds = new Set(ids);
    setWorkouts((current) =>
      current.filter((workout) => !selectedIds.has(workout.id)),
    );
    if (close) setDeleteWorkoutsOpen(false);
    setToast(
      `${ids.length} ${ids.length === 1 ? "entrenamiento eliminado" : "entrenamientos eliminados"}`,
    );
  };
  const saveMeasure = (measure) => {
    const { dateOfBirth: profileDateOfBirth, ...measureData } = measure;
    setDateOfBirth(profileDateOfBirth);
    const savedMeasure = {
      ...measureData,
      id: measure.id || editingMeasure?.id || uid(),
    };
    setMeasures((current) =>
      (editingMeasure
        ? current.map((item) =>
            item.id === editingMeasure.id ? savedMeasure : item,
          )
        : [...current, savedMeasure]
      ).sort((a, b) => a.date.localeCompare(b.date)),
    );
    setMeasureOpen(false);
    setEditingMeasure(null);
    if (returnToPhotoGalleryAfterMeasureEdit.current) {
      returnToPhotoGalleryAfterMeasureEdit.current = false;
      setMeasurePhotosOpen(true);
    }
    if (guideStep === 2 && !editingMeasure) setGuideStep(3);
    setToast(
      editingMeasure
        ? "Pesaje actualizado"
        : "Nuevo pesaje añadido al historial",
    );
  };
  const removeMeasure = (measure) =>
    askToConfirm({
      title: "Eliminar pesaje",
      message: `¿Eliminar el registro del ${dateLabel(measure.date, { day: "numeric", month: "long", year: "numeric" })}?`,
      confirmLabel: "Eliminar",
      className: "measure-history-delete-confirm",
      onConfirm: async () => {
        // The photo is in the user's gallery; deleting a weigh-in only unlinks it.
        try {
          if (measure.photoAssetId)
            await deleteExerciseAsset(measure.photoAssetId);
        } catch {
          setToast(translateText("No se pudo eliminar la foto de Fotos/ProFit."));
          return;
        }
        setMeasures((current) =>
          current.filter((item) => item.id !== measure.id),
        );
        setToast("Pesaje eliminado");
      },
    });
  const deleteMeasurePhoto = async (measure) => {
    if (!measure?.photoUri && !measure?.photoAssetId) return true;
    try {
      // Remove any legacy IndexedDB copy first so a failed gallery delete cannot
      // leave a stale blob that the migration would restore later.
      if (measure.photoAssetId)
        await deleteExerciseAsset(measure.photoAssetId);
      if (measure.photoUri && Capacitor.getPlatform() === "android") {
        const result = await ProgressPhotos.deletePhoto({ uri: measure.photoUri });
        if (!result?.deleted) {
          const { exists } = await ProgressPhotos.photoExists({ uri: measure.photoUri });
          if (exists) {
            setToast(translateText("No se pudo eliminar la foto de Fotos/ProFit."));
            return false;
          }
        }
      }
      updateMeasurePhotoRecord(measure.id, (item) => {
        const {
          photoUri: _photoUri,
          photoAssetId: _photoAssetId,
          ...withoutPhoto
        } = item;
        return withoutPhoto;
      });
      setToast(translateText("Foto eliminada; el pesaje se conserva"));
      return true;
    } catch {
      setToast(translateText("No se pudo eliminar la foto de Fotos/ProFit."));
      return false;
    }
  };
  const saveWorkoutEdits = (updated) => {
    setWorkouts((current) =>
      current
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
    setSelectedWorkout(updated);
    setEditingWorkout(null);
    setToast("Cambios del entrenamiento guardados");
  };
  const importExerciseData = async (exercise) => {
    if (!exercise?.name || !exercise?.id)
      throw new Error("El archivo no incluye un ejercicio válido.");
    const {
      mediaData,
      mediaDataType,
      previewData,
      previewDataType,
      ...fields
    } = exercise;
    Object.assign(fields, normalizeExerciseData(fields));
    if (mediaData) {
      const blob = new Blob([mediaData], {
        type: mediaDataType || "application/octet-stream",
      });
      await saveExerciseAsset(fields.id, blob);
      fields.mediaAssetId = fields.id;
      fields.mediaType = mediaDataType || blob.type;
    }
    if (previewData) {
      const previewId = `${fields.id}-preview`;
      const blob = new Blob([previewData], {
        type: previewDataType || "image/jpeg",
      });
      await saveExerciseAsset(previewId, blob);
      fields.previewAssetId = previewId;
      fields.previewType = previewDataType || blob.type;
    }
    return fields;
  };
  const handleImportFile = async (file, expectedKind) => {
    let missingProgressPhotos = 0;
    try {
      const envelope = normalizeImportedEnvelope(await decodeImportFile(file));
      const compatibleKinds =
        expectedKind === "routine"
          ? ["routine", "routineGroup"]
          : [expectedKind];
      if (!compatibleKinds.includes(envelope.kind))
        throw new Error(
          expectedKind === "backup"
            ? "Selecciona un archivo de copia de seguridad válido."
            : `Este archivo contiene ${envelope.kind}, no ${expectedKind === "routine" ? "una rutina o grupo de rutinas" : "un ejercicio"}.`,
        );
      const data = envelope.data;
      if (envelope.kind === "exercise") {
        const exercise = await importExerciseData(data.exercise || data);
        setExercises((current) => mergeById(current, [exercise]));
        setToast(`Ejercicio «${exercise.name}» importado`);
      } else if (envelope.kind === "routineGroup") {
        const groupName = String(data.group?.name || data.group || "").trim();
        const ungrouped = data.group?.ungrouped === true;
        const sourceRoutines = Array.isArray(data.routines)
          ? data.routines
          : [];
        if (!groupName && !ungrouped)
          throw new Error("El grupo importado no contiene un nombre válido.");
        const importedExercises = await Promise.all(
          (data.exercises || []).map(importExerciseData),
        );
        if (importedExercises.length)
          setExercises((current) => mergeById(current, importedExercises));
        const importedRoutines = sourceRoutines.map((routine) => normalizeRoutineExerciseIds({
          ...routine,
          group: ungrouped ? "" : groupName,
        }));
        if (
          importedRoutines.some(
            (routine) => !routine?.id || !Array.isArray(routine.exercises),
          )
        )
          throw new Error(
            "El grupo contiene una rutina con formato no válido.",
          );
        if (!ungrouped)
          setRoutineGroups((current) =>
            mergeRoutineGroups(current, [groupName]),
          );
        setRoutines((current) => mergeById(current, importedRoutines));
        setToast(
          ungrouped
            ? `${importedRoutines.length} ${importedRoutines.length === 1 ? "rutina sin grupo importada" : "rutinas sin grupo importadas"}`
            : `Grupo «${groupName}» y ${importedRoutines.length} ${importedRoutines.length === 1 ? "rutina importada" : "rutinas importadas"}`,
        );
      } else if (envelope.kind === "routine") {
        const importedExercises = await Promise.all(
          (data.exercises || []).map(importExerciseData),
        );
        if (importedExercises.length)
          setExercises((current) => mergeById(current, importedExercises));
        const routine = normalizeRoutineExerciseIds(data.routine || data);
        if (!routine?.id || !Array.isArray(routine.exercises))
          throw new Error("La rutina importada no tiene un formato válido.");
        setRoutines((current) => mergeById(current, [routine]));
        if (routine.group)
          setRoutineGroups((current) =>
            mergeRoutineGroups(current, [routine.group]),
          );
        setToast(`Rutina «${routine.name}» importada`);
      } else if (envelope.kind === "workout") {
        const importedExercises = await Promise.all(
          (data.exercises || [])
            .filter((item) => item?.mediaData || item?.name)
            .map(importExerciseData),
        );
        if (importedExercises.length)
          setExercises((current) => mergeById(current, importedExercises));
        const workout = normalizeWorkoutExercises(data.workout || data);
        if (!workout?.id || !Array.isArray(workout.exercises))
          throw new Error(
            "El entrenamiento importado no tiene un formato válido.",
          );
        setWorkouts((current) =>
          mergeById(current, [workout]).sort((a, b) =>
            b.date.localeCompare(a.date),
          ),
        );
        setToast(`Entrenamiento «${workout.name}» importado`);
      } else if (envelope.kind === "backup") {
        const importedExercises = await Promise.all(
          (data.exercises || []).map(importExerciseData),
        );
        if (importedExercises.length)
          setExercises((current) => mergeById(current, importedExercises));
        const importedRoutines = Array.isArray(data.routines)
          ? data.routines.map(normalizeRoutineExerciseIds)
          : [];
        setRoutineGroups((current) =>
          mergeRoutineGroups(current, [
            ...(Array.isArray(data.routineGroups) ? data.routineGroups : []),
            ...(Array.isArray(data.exerciseGroups) ? data.exerciseGroups : []),
            ...importedRoutines.map((routine) => routine.group),
          ]),
        );
        if (importedRoutines.length)
          setRoutines((current) => mergeById(current, importedRoutines));
        if (Array.isArray(data.workouts))
          setWorkouts((current) =>
            mergeById(
              current,
              data.workouts.map(normalizeWorkoutExercises),
            ).sort((a, b) => b.date.localeCompare(a.date)),
          );
        if (Array.isArray(data.measures)) {
          const legacyBirthDate = [...data.measures]
            .sort((a, b) =>
              String(b?.date || "").localeCompare(String(a?.date || "")),
            )
            .find((measure) => calculateAge(measure?.dateOfBirth) !== null)
            ?.dateOfBirth;
          const importedBirthDate =
            calculateAge(data.profile?.dateOfBirth) !== null
              ? data.profile.dateOfBirth
              : legacyBirthDate;
          if (importedBirthDate) setDateOfBirth(importedBirthDate);
          const importedMeasures = data.measures.filter(
            (measure) => measure && typeof measure === "object",
          );
          const restoredMeasures = await Promise.all(
            importedMeasures.map(async (rawMeasure) => {
              const {
                dateOfBirth: _legacyDateOfBirth,
                photoData,
                photoAssetId: _sourcePhotoAssetId,
                photoUri: sourcePhotoUri,
                ...measure
              } = rawMeasure;
              const hadPhotoReference = Boolean(
                sourcePhotoUri || _sourcePhotoAssetId || photoData,
              );
              const isAndroid = Capacitor.getPlatform() === "android";
              if (isAndroid && sourcePhotoUri) {
                try {
                  const { exists } = await ProgressPhotos.photoExists({
                    uri: sourcePhotoUri,
                  });
                  if (exists) {
                    if (typeof photoData !== "string")
                      return { ...measure, photoUri: sourcePhotoUri };
                    const backupImage = photoData.match(
                      /^data:([^;]+);base64,([\s\S]+)$/,
                    );
                    if (!backupImage)
                      return { ...measure, photoUri: sourcePhotoUri };
                    const galleryImage = await ProgressPhotos.readPhoto({
                      uri: sourcePhotoUri,
                    });
                    if (
                      backupImage[2].replace(/\s/g, "") ===
                        String(galleryImage.data || "").replace(/\s/g, "")
                    )
                      return { ...measure, photoUri: sourcePhotoUri };
                  }
                } catch {
                  // The backup's image data below can still restore the photo.
                }
              }
              if (
                isAndroid &&
                typeof photoData === "string" &&
                photoData.length <= 36 * 1024 * 1024
              ) {
                try {
                  const saved = await saveProgressPhotoDataUrl(photoData);
                  return { ...measure, photoUri: saved.uri };
                } catch {
                  // Keep the weigh-in when an optional photo cannot be restored.
                }
              }
              if (hadPhotoReference) missingProgressPhotos += 1;
              return measure;
            }),
          );
          setMeasures((current) =>
            mergeById(current, restoredMeasures).sort((a, b) =>
              a.date.localeCompare(b.date),
            ),
          );
        }
        if (data.waterByDay && typeof data.waterByDay === "object")
          setWaterByDay((current) => ({ ...current, ...data.waterByDay }));
        if (data.kcalByDay && typeof data.kcalByDay === "object")
          setKcalByDay((current) => ({ ...current, ...data.kcalByDay }));
        if (data.profile && typeof data.profile === "object") {
          if (data.profile.name) setName(data.profile.name);
          if (data.profile.avatar !== undefined) setAvatar(data.profile.avatar);
          if (calculateAge(data.profile.dateOfBirth) !== null)
            setDateOfBirth(data.profile.dateOfBirth);
          if (data.profile.unit === "kg" || data.profile.unit === "lb")
            setUnit(data.profile.unit);
          if (
            data.profile.heightUnit === "cm" ||
            data.profile.heightUnit === "in"
          )
            setHeightUnit(data.profile.heightUnit);
          const importedWeekStartsOn =
            data.profile.weekStartsOn !== undefined
              ? normalizeWeekStartsOn(data.profile.weekStartsOn)
              : weekStartsOn;
          if (data.profile.weekStartsOn !== undefined)
            setWeekStartsOn(importedWeekStartsOn);
          const importedGoal = Number(data.profile.goal);
          if (
            data.profile.weeklyGoalHistory &&
            typeof data.profile.weeklyGoalHistory === "object"
          ) {
            const importedWeekGoals = Object.fromEntries(
              Object.entries(data.profile.weeklyGoalHistory)
                .filter(
                  ([week, value]) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(week) &&
                    Number.isInteger(Number(value)) &&
                    Number(value) >= 1 &&
                    Number(value) <= 7,
                )
                .map(([week, value]) => [week, Number(value)]),
            );
            setWeeklyGoalHistory((current) => ({
              ...current,
              ...importedWeekGoals,
            }));
          }
          if (
            Number.isInteger(importedGoal) &&
            importedGoal >= 1 &&
            importedGoal <= 7
          )
            updateWeeklyGoal(importedGoal, importedWeekStartsOn);
          if (
            Number(data.profile.waterGoal) >= 500 &&
            Number(data.profile.waterGoal) <= 7000
          )
            setWaterGoal(Number(data.profile.waterGoal));
          if (
            Number(data.profile.kcalGoal) >= 500 &&
            Number(data.profile.kcalGoal) <= 10000
          )
            setKcalGoal(Number(data.profile.kcalGoal));
          if (
            weightGoalOptions.some(
              (option) => option.id === data.profile.weightGoal,
            )
          )
            setWeightGoal(data.profile.weightGoal);
          if (typeof data.profile.manualGoals === "boolean") {
            setManualGoals(data.profile.manualGoals);
            if (data.profile.manualGoals) {
              manualGoalsValuesInitialized.current = true;
              localStorage.setItem(
                "profit-manual-goals-initialized",
                JSON.stringify(true),
              );
            }
          }
          if (typeof data.profile.waterReminder === "boolean")
            setWaterReminder(data.profile.waterReminder);
          if (typeof data.profile.weightReminder === "boolean")
            setWeightReminder(data.profile.weightReminder);
          if (typeof data.profile.highResolutionProgressPhotos === "boolean")
            setHighResolutionProgressPhotos(
              data.profile.highResolutionProgressPhotos,
            );
          if (
            typeof data.profile.weightReminderTime === "string" &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(data.profile.weightReminderTime)
          )
            setWeightReminderTime(data.profile.weightReminderTime);
          if (typeof data.profile.proteinReminder === "boolean")
            setProteinReminder(data.profile.proteinReminder);
          if (
            typeof data.profile.proteinReminderTime === "string" &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(data.profile.proteinReminderTime)
          )
            setProteinReminderTime(data.profile.proteinReminderTime);
          if (
            waterReminderIntervals.includes(
              Number(data.profile.reminderInterval),
            )
          )
            setReminderInterval(Number(data.profile.reminderInterval));
          if (Array.isArray(data.profile.reminderDays)) {
            const importedDays = normalizeReminderDays(
              data.profile.reminderDays,
            );
            if (importedDays.length) setReminderDays(importedDays);
          }
          if (
            data.profile.reminderQuietHours &&
            typeof data.profile.reminderQuietHours === "object"
          )
            setReminderQuietHours(
              normalizeQuietHours(data.profile.reminderQuietHours),
            );
          if (data.profile.palette) setPalette(data.profile.palette);
          if (["light", "dark", "system"].includes(data.profile.theme))
            setTheme(data.profile.theme);
          if (["system", "es", "ca", "en", "fr", "de", "it", "pt"].includes(data.profile.language)) {
            localStorage.setItem(
              "profit-language-explicit-choice",
              JSON.stringify(true),
            );
            setLanguage(data.profile.language);
          }
          if (typeof data.profile.soundsMuted === "boolean")
            updateSoundsMuted(data.profile.soundsMuted);
        }
        setToast(
          missingProgressPhotos
            ? "La copia se importó, pero algunas fotos no se pudieron recuperar desde la galería."
            : "Copia importada y combinada con los datos actuales",
        );
      } else throw new Error("Este tipo de archivo no se puede importar aquí.");
      return true;
    } catch (error) {
      console.error("Error importing ProFit data", error);
      setToast(error?.message || "No se pudo importar el archivo");
      return false;
    }
  };
  incomingImportHandler.current = async (file) => {
    const envelope = normalizeImportedEnvelope(await decodeImportFile(file));
    const allowedKinds = ["backup", "routine", "routineGroup", "exercise", "workout"];
    if (!allowedKinds.includes(envelope.kind))
      throw new Error("Este archivo no contiene un tipo de datos compatible con ProFit.");
    const expectedKind = envelope.kind === "routineGroup" ? "routine" : envelope.kind;
    const imported = await handleImportFile(file, expectedKind);
    if (imported && envelope.kind === "backup") {
      localStorage.setItem("profit-onboarding-complete", JSON.stringify(true));
      localStorage.setItem("profit-onboarding-flow-version", JSON.stringify(2));
      localStorage.removeItem("profit-onboarding-step");
      setGuideStep(null);
    }
    return imported;
  };

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let active = true;
    const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    const processPendingImport = async () => {
      if (!active) return;
      if (nativeImportProcessing.current) {
        nativeImportQueued.current = true;
        return;
      }
      nativeImportProcessing.current = true;
      let fileId = "";
      try {
        let info = null;
        // Native Android copies the incoming content URI asynchronously into private cache.
        for (let attempt = 0; active && attempt < 600; attempt += 1) {
          info = await AndroidShare.getPendingImportInfo();
          if (!info || info.status !== "preparing") break;
          await sleep(500);
        }
        if (!active || !info || info.status === "none") return;
        fileId = info.fileId || "";
        if (info.status === "error")
          throw new Error(info.error || "No se pudo leer el archivo abierto.");
        if (info.status !== "ready")
          throw new Error("El archivo tardó demasiado en prepararse. Vuelve a abrirlo desde el gestor de archivos.");

        const size = Number(info.sizeBytes);
        if (!Number.isSafeInteger(size) || size <= 0 || size > 128 * 1024 * 1024)
          throw new Error("El archivo está vacío o supera el límite de 128 MB.");

        const chunks = [];
        let offset = 0;
        while (active && offset < size) {
          const length = Math.min(512 * 1024, size - offset);
          const part = await AndroidShare.readPendingImportChunk({ fileId, offset, length });
          const binary = atob(part.data || "");
          if (!binary.length || binary.length > length)
            throw new Error("El archivo recibido está incompleto.");
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1)
            bytes[index] = binary.charCodeAt(index);
          chunks.push(bytes);
          offset += bytes.length;
        }
        if (!active) return;
        if (offset !== size) throw new Error("No se pudo transferir el archivo completo a ProFit.");
        const file = new File(chunks, info.filename || "profit-import.msgpack", {
          type: info.mimeType || "application/msgpack",
          lastModified: Date.now(),
        });
        if (typeof incomingImportHandler.current !== "function")
          throw new Error("El importador de ProFit todavía no está disponible.");
        await incomingImportHandler.current(file);
      } catch (error) {
        if (active) setToast(error?.message || "No se pudo abrir el archivo con ProFit.");
      } finally {
        if (fileId) {
          try { await AndroidShare.finishPendingImport({ fileId }); } catch (error) {
            console.warn("No se pudo limpiar el archivo temporal recibido", error);
          }
        }
        nativeImportProcessing.current = false;
        if (active && nativeImportQueued.current) {
          nativeImportQueued.current = false;
          void processPendingImport();
        }
      }
    };

    const onIncomingFile = () => { void processPendingImport(); };
    window.addEventListener("profit:incoming-file", onIncomingFile);
    // Covers files that launched ProFit from a cold start before this listener existed.
    void processPendingImport();
    return () => {
      active = false;
      window.removeEventListener("profit:incoming-file", onIncomingFile);
    };
  }, []);

  const importBackupFromGuide = async (file) => {
    const imported = await handleImportFile(file, "backup");
    if (!imported) return;
    localStorage.setItem("profit-onboarding-complete", JSON.stringify(true));
    localStorage.setItem("profit-onboarding-flow-version", JSON.stringify(2));
    localStorage.removeItem("profit-onboarding-step");
    setGuideStep(null);
  };
  const exportBackup = async (target = "share") => {
    try {
      const packagedExercises = await Promise.all(
        exercises
          .filter((exercise) => !isUnmodifiedBundledExercise(exercise))
          .map(packageExercise),
      );
      const packagedMeasures = await Promise.all(
        measures.map(async (measure) => {
          if (!measure.photoUri && !measure.photoAssetId) return measure;
          const {
            photoAssetId,
            ...withoutAssetReference
          } = measure;
          const photoUri = measure.photoUri;
          try {
            if (photoUri && Capacitor.getPlatform() === "android") {
              const { data, mimeType } = await ProgressPhotos.readPhoto({
                uri: photoUri,
              });
              return {
                ...withoutAssetReference,
                photoUri,
                photoData: `data:${mimeType || "image/jpeg"};base64,${data}`,
              };
            }
            if (photoAssetId) {
              const blob = await getExerciseAsset(photoAssetId);
              return blob
                ? { ...withoutAssetReference, photoData: await blobToDataUrl(blob) }
                : withoutAssetReference;
            }
            return {
              ...withoutAssetReference,
              ...(photoUri ? { photoUri } : {}),
            };
          } catch {
            return {
              ...withoutAssetReference,
              ...(photoUri ? { photoUri } : {}),
            };
          }
        }),
      );
      const payload = {
        profile: {
          name,
          avatar,
          dateOfBirth,
          unit,
          heightUnit,
          goal,
          weeklyGoalHistory,
          weekStartsOn,
          palette,
          theme,
          language,
          soundsMuted,
          waterGoal: effectiveWaterGoal,
          kcalGoal: effectiveKcalGoal,
          manualGoals,
          weightGoal,
          waterReminder,
          reminderInterval,
          reminderDays,
          reminderQuietHours,
          weightReminder,
          weightReminderTime,
          highResolutionProgressPhotos,
          proteinReminder,
          proteinReminderTime,
        },
        workouts,
        routines,
        exercises: packagedExercises,
        routineGroups,
        measures: packagedMeasures,
        waterByDay,
        kcalByDay,
        exportedAt: new Date().toISOString(),
      };
      const backupSlug = translateText("Copia de seguridad")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("en")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const destination = await shareMessagePack(
        `profit-${backupSlug}-${dateKey(today())}.msgpack`,
        "Copia de seguridad de ProFit",
        "backup",
        payload,
        target,
      );
      setToast(
        destination === "cancelled"
          ? ""
          : destination === "saved"
            ? "Copia de seguridad guardada en el dispositivo"
            : "Elige dónde compartir la copia de seguridad",
      );
    } catch (error) {
      console.error("Error exporting ProFit backup", error);
      setToast(error?.message || "No se pudo exportar la copia");
    }
  };

  const content =
    tab === "home" ? (
      <Dashboard
        workouts={workouts}
        exercises={exercises}
        onNavigate={setTab}
        onStartWorkout={() => !activeSession && setWorkoutChooserOpen(true)}
        onWorkoutOpen={setSelectedWorkout}
        unit={unit}
        goal={goal}
        weeklyGoalHistory={weeklyGoalHistory}
        weekStartsOn={weekStartsOn}
        layout={dashboardLayout}
        name={name.trim()}
        avatar={avatar}
        motivation={motivation}
        waterMl={todayWater}
        waterGoal={effectiveWaterGoal}
        kcal={todayKcal}
        kcalGoal={effectiveKcalGoal}
        onAddWater={addWater}
        onAddKcal={addKcal}
        onResetWater={resetWaterToday}
        onResetKcal={resetKcalToday}
      />
    ) : tab === "training" ? (
      <TrainingPage
        exercises={exercises}
        workouts={workouts}
        routines={routines}
        routineGroups={routineGroups}
        unit={unit}
        onOpen={setSelectedExercise}
        onCreateExercise={() => setFormExercise(null)}
        onCreateGroup={() => setRoutineGroupOpen(true)}
        onCreateRoutine={() => {
          setFormRoutineGroup(undefined);
          setFormRoutine(null);
        }}
        onCreateRoutineInGroup={(group) => {
          setFormRoutineGroup(group.name || "");
          setFormRoutine(null);
        }}
        onOpenRoutine={setSelectedRoutine}
        onEditRoutine={(routine) => {
          setFormRoutineGroup(undefined);
          setFormRoutine(routine);
        }}
        onShareRoutine={shareRoutine}
        onShareRoutineGroup={shareRoutineGroup}
        onDeleteRoutine={deleteRoutine}
        onDeleteRoutineGroup={deleteRoutineGroup}
        onStartRoutine={startRoutine}
        onImportFile={handleImportFile}
      />
    ) : (
      <ProfilePage
        workouts={workouts}
        exercises={exercises}
        measures={measures}
        highResolutionProgressPhotos={highResolutionProgressPhotos}
        onHighResolutionProgressPhotos={setHighResolutionProgressPhotos}
        onAddMeasure={() => {
          setEditingMeasure(null);
          setMeasureOpen(true);
        }}
        onManageMeasures={() => setMeasureHistoryOpen(true)}
        onManagePhotos={() => setMeasurePhotosOpen(true)}
        onManageDashboardLayout={() => setDashboardLayoutOpen(true)}
        onEditMeasure={(measure) => {
          setMeasureHistoryOpen(false);
          setEditingMeasure(measure);
          setMeasureOpen(true);
        }}
        onDeleteMeasure={removeMeasure}
        onDeleteWorkouts={() => setDeleteWorkoutsOpen(true)}
        onWorkoutOpen={setSelectedWorkout}
        onImportFile={handleImportFile}
        onExportData={exportBackup}
        unit={unit}
        onUnit={setUnit}
        heightUnit={heightUnit}
        onHeightUnit={setHeightUnit}
        goal={goal}
        weeklyGoalHistory={weeklyGoalHistory}
        weekStartsOn={weekStartsOn}
        onWeekStartsOn={setWeekStartsOn}
        onGoal={updateWeeklyGoal}
        name={name}
        onName={setName}
        avatar={avatar}
        onAvatarFile={handleAvatarFile}
        onAvatar={setAvatar}
        palette={palette}
        onPalette={setPalette}
        theme={theme}
        onTheme={setTheme}
        language={language}
        onLanguage={chooseLanguage}
        soundsMuted={soundsMuted}
        onSoundsMuted={updateSoundsMuted}
        waterGoal={effectiveWaterGoal}
        onWaterGoal={(value) =>
          setWaterGoal(Math.min(7000, Math.max(500, Number(value))))
        }
        kcalGoal={effectiveKcalGoal}
        onKcalGoal={(value) =>
          setKcalGoal(Math.min(10000, Math.max(500, Number(value))))
        }
        manualGoals={manualGoals}
        onManualGoals={updateManualGoals}
        weightGoal={weightGoal}
        onWeightGoal={setWeightGoal}
        calculatedGoals={calculatedGoals}
        waterReminder={waterReminder}
        onWaterReminder={toggleWaterReminder}
        reminderInterval={reminderInterval}
        onReminderInterval={setReminderInterval}
        reminderDays={reminderDays}
        onReminderDays={setReminderDays}
        reminderQuietHours={reminderQuietHours}
        onReminderQuietHours={(value) =>
          setReminderQuietHours(normalizeQuietHours(value))
        }
        weightReminder={weightReminder}
        onWeightReminder={toggleWeightReminder}
        weightReminderTime={weightReminderTime}
        onWeightReminderTime={setWeightReminderTime}
        proteinReminder={proteinReminder}
        onProteinReminder={toggleProteinReminder}
        proteinReminderTime={proteinReminderTime}
        onProteinReminderTime={setProteinReminderTime}
      />
    );

  return (
    <div class="app-shell" data-palette={palette} data-theme={resolvedTheme}>
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            pro<span>fit</span>
          </span>
        </div>
        <div class="sidebar-label">MENÚ PRINCIPAL</div>
        <nav class="side-nav">
          {[
            ["home", "Inicio", "home"],
            ["training", "Entrenamientos", "dumbbell"],
            ["profile", "Perfil", "user"],
          ].map(([id, label, icon]) => (
            <button
              class={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              <Icon name={icon} size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main class="main-area">
        <div
          class="main-scroll"
          onTouchStart={beginPageSwipe}
          onTouchEnd={endPageSwipe}
          onTouchCancel={() => {
            pageSwipeStart.current = null;
          }}
        >
          <div class="content-wrap">
            <div
              key={tab}
              class={pageTransition ? `page-transition ${pageTransition}` : ""}
              onAnimationEnd={(event) => {
                if (
                  event.target === event.currentTarget &&
                  event.animationName === "page-swipe-in"
                ) {
                  setPageTransition(null);
                }
              }}
            >
              {content}
              <footer class="page-footer">
                <span>
                  PROFIT <i>·</i> TU PROGRESO, TUYO.
                </span>
              </footer>
            </div>
          </div>
        </div>
        <nav class="mobile-nav">
          {[
            ["home", "Inicio", "home"],
            ["training", "Entrenar", "dumbbell"],
            ["profile", "Perfil", "user"],
          ].map(([id, label, icon]) => (
            <button
              class={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </main>
      {dashboardLayoutOpen && (
        <DashboardLayoutModal
          layout={dashboardLayout}
          onChange={setDashboardLayout}
          onClose={() => setDashboardLayoutOpen(false)}
        />
      )}
      {selectedExercise && (
        <ExerciseDetail
          exercise={selectedExercise}
          workouts={workouts}
          unit={unit}
          onClose={() => setSelectedExercise(null)}
          onEdit={(exercise) => {
            setSelectedExercise(null);
            setFormExercise(exercise);
          }}
          onDelete={deleteExercise}
          onShare={shareExercise}
          onRestoreOriginal={restoreBundledExerciseName}
        />
      )}
      {selectedWorkout && (
        <WorkoutDetail
          workout={selectedWorkout}
          exercises={exercises}
          unit={unit}
          onClose={() => setSelectedWorkout(null)}
          onShare={(target) => shareWorkout(selectedWorkout, target)}
          onEdit={() => setEditingWorkout(selectedWorkout)}
        />
      )}
      {editingWorkout && (
        <WorkoutEditModal
          workout={editingWorkout}
          exercises={exercises}
          unit={unit}
          onClose={() => setEditingWorkout(null)}
          onSave={saveWorkoutEdits}
        />
      )}
      {selectedRoutine && (
        <RoutineDetail
          routine={
            routines.find((routine) => routine.id === selectedRoutine.id) ||
            selectedRoutine
          }
          exercises={exercises}
          onClose={() => setSelectedRoutine(null)}
          onEdit={() => {
            const routine =
              routines.find((item) => item.id === selectedRoutine.id) ||
              selectedRoutine;
            setFormRoutineGroup(undefined);
            setFormRoutine(routine);
          }}
          onUpdate={updateRoutine}
          onStart={() =>
            startRoutine(
              routines.find((item) => item.id === selectedRoutine.id) ||
                selectedRoutine,
            )
          }
        />
      )}
      {formRoutine !== undefined && (
        <RoutineForm
          routine={formRoutine || undefined}
          groups={routineGroups}
          fixedGroup={formRoutineGroup}
          onClose={() => {
            setFormRoutine(undefined);
            setFormRoutineGroup(undefined);
          }}
          onSave={saveRoutine}
        />
      )}
      {formExercise !== undefined && (
        <ExerciseForm
          exercise={formExercise || undefined}
          onClose={() => setFormExercise(undefined)}
          onSave={saveExercise}
          onDeleteCustomMuscle={deleteSecondaryMuscle}
        />
      )}
      {routineGroupOpen && (
        <RoutineGroupForm
          groups={routineGroups}
          onClose={() => setRoutineGroupOpen(false)}
          onSave={createRoutineGroup}
        />
      )}
      {workoutChooserOpen && (
        <WorkoutLaunchModal
          routines={routines}
          exercises={exercises}
          onClose={() => setWorkoutChooserOpen(false)}
          onChooseRoutine={startRoutine}
          onFreeWorkout={() => startRoutine(null)}
          onCreateRoutine={() => {
            setWorkoutChooserOpen(false);
            setFormRoutineGroup(undefined);
            setFormRoutine(null);
          }}
        />
      )}
      {activeSession && (
        <WorkoutModal
          exercises={exercises}
          workouts={workouts}
          routine={activeRoutine}
          session={activeSession}
          onPause={pauseWorkout}
          onResume={resumeWorkout}
          onCancel={cancelWorkout}
          onFinish={finishWorkout}
          unit={unit}
          nativeTimerAvailable={nativeTimerAvailable}
        />
      )}
      {guideStep !== null && (
        <NewUserGuide
          step={guideStep}
          onNext={() =>
            setGuideStep((current) => Math.min(4, (current ?? 0) + 1))
          }
          onBack={() =>
            setGuideStep((current) => Math.max(0, (current ?? 0) - 1))
          }
          onStartWeighIn={() => {
            setEditingMeasure(null);
            setMeasureOpen(true);
          }}
          onImportBackup={importBackupFromGuide}
          onFinish={finishOnboarding}
          hasWeight={measures.some((measure) => Number(measure.weight) > 0)}
          weightReminder={weightReminder}
          onWeightReminder={toggleWeightReminder}
          weightReminderTime={weightReminderTime}
          onWeightReminderTime={setWeightReminderTime}
          waterReminder={waterReminder}
          onWaterReminder={toggleWaterReminder}
          proteinReminder={proteinReminder}
          onProteinReminder={toggleProteinReminder}
          proteinReminderTime={proteinReminderTime}
          onProteinReminderTime={setProteinReminderTime}
          reminderInterval={reminderInterval}
          onReminderInterval={setReminderInterval}
          palette={palette}
          onPalette={setPalette}
          unit={unit}
          onUnit={setUnit}
          heightUnit={heightUnit}
          onHeightUnit={setHeightUnit}
          weightGoal={weightGoal}
          onWeightGoal={setWeightGoal}
          highResolutionProgressPhotos={highResolutionProgressPhotos}
          onHighResolutionProgressPhotos={setHighResolutionProgressPhotos}
        />
      )}
      {measureOpen && (
        <MeasureModal
          current={editingMeasure}
          previous={measures.at(-1)}
          dateOfBirth={dateOfBirth}
          highResolutionProgressPhotos={highResolutionProgressPhotos}
          modalClassName={returnToPhotoGalleryAfterMeasureEdit.current ? "measure-photo-edit-overlay" : ""}
          onMissingPhoto={unlinkMeasurePhotoReference}
          onClose={() => {
            setMeasureOpen(false);
            setEditingMeasure(null);
            if (returnToPhotoGalleryAfterMeasureEdit.current) {
              returnToPhotoGalleryAfterMeasureEdit.current = false;
              setMeasurePhotosOpen(true);
            }
          }}
          onSave={saveMeasure}
          unit={unit}
          heightUnit={heightUnit}
        />
      )}
      {measureHistoryOpen && (
        <MeasureHistoryModal
          measures={measures}
          unit={unit}
          heightUnit={heightUnit}
          weekStartsOn={weekStartsOn}
          onClose={() => setMeasureHistoryOpen(false)}
          onEdit={(measure) => {
            setMeasureHistoryOpen(false);
            setEditingMeasure(measure);
            setMeasureOpen(true);
          }}
          onDelete={removeMeasure}
        />
      )}
      {measurePhotosOpen && (
        <MeasurePhotoProgressModal
          measures={measures}
          initialPhotoId={photoGalleryResumeId}
          unit={unit}
          heightUnit={heightUnit}
          weekStartsOn={weekStartsOn}
          onClose={() => {
            setMeasurePhotosOpen(false);
            setPhotoGalleryResumeId("");
          }}
          onAddMeasure={() => {
            setEditingMeasure(null);
            setMeasureOpen(true);
          }}
          onEditMeasure={(measure) => {
            returnToPhotoGalleryAfterMeasureEdit.current = true;
            setPhotoGalleryResumeId(measure.id);
            setEditingMeasure(measure);
            setMeasureOpen(true);
          }}
          onDeletePhoto={deleteMeasurePhoto}
          onMissingPhoto={unlinkMeasurePhotoReference}
        />
      )}
      {deleteWorkoutsOpen && (
        <DeleteWorkoutsModal
          workouts={workouts}
          onClose={() => setDeleteWorkoutsOpen(false)}
          onDelete={deleteWorkouts}
          onConfirm={askToConfirm}
        />
      )}
      {confirmation && (
        <ConfirmModal
          confirmation={confirmation}
          className={confirmation.className || ""}
          onCancel={() => setConfirmation(null)}
          onConfirm={resolveConfirmation}
        />
      )}
      {celebrationWorkout && (
        <WorkoutCelebration
          workout={celebrationWorkout}
          unit={unit}
          onClose={() => setCelebrationWorkout(null)}
          onSummary={() => {
            setCelebrationWorkout(null);
            setSelectedWorkout(celebrationWorkout);
          }}
        />
      )}
      {toast && (
        <div class="toast">
          <span>
            <Icon name="check" size={15} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

render(<App />, document.getElementById("app"));
