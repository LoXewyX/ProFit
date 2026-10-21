import { translateText } from "./i18n.js";

export const isTimedPrescription = (value) =>
  /\b(?:s|seg(?:undo)?s?)\b/i.test(String(value ?? ""));

const doseLabel = (value) =>
  isTimedPrescription(value) ? String(value) : `${value} reps`;

export const exercisePrimaryMuscleLabel = (exercise) =>
  translateText(String(exercise?.muscle || "").trim()) ||
  "Sin músculo asignado";

export const exerciseMuscleLine = (exercise) =>
  [exercise?.muscle, ...(exercise?.secondary || [])]
    .filter((muscle) => String(muscle || "").trim())
    .map((muscle) => translateText(muscle))
    .join(" · ") || "Sin músculo asignado";

export const exerciseTracksSets = (exercise) => exercise?.trackSets !== false;
export const exerciseTracksReps = (exercise) => exercise?.trackReps !== false;

export const exerciseDoseLabel = (exercise) =>
  [
    exerciseTracksSets(exercise) ? `${exercise.sets} series` : "",
    exerciseTracksReps(exercise) ? doseLabel(exercise.reps) : "",
    `~${exercise.duration} min`,
  ]
    .filter(Boolean)
    .join(" · ");

export const exerciseValueLabel = (exercise) =>
  isTimedPrescription(exercise?.reps) ? "Duración (s)" : "Reps";

export const hasExerciseDemoMedia = (exercise) =>
  Boolean(
    exercise &&
      (exercise.media ||
        exercise.mediaAssetId ||
        exercise.poster ||
        exercise.previewAssetId),
  );

export const isExerciseDemoVideo = (exercise) =>
  Boolean(
    exercise &&
      (exercise.mediaType?.startsWith("video/") ||
        /\.(mp4|webm|mov)(?:$|[?#])/i.test(exercise.media || "")),
  );
