import { useEffect, useState } from "preact/hooks";
import { getExerciseAsset } from "./exercise-assets.js";
import { getMuscleFocus, MuscleMap } from "./muscles.jsx";
import {
  exercisePrimaryMuscleLabel,
  hasExerciseDemoMedia,
} from "./exercise-model.js";

function MediaGlyph({ name, size }) {
  return (
    <svg
      class="icon"
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
      {name === "play" ? (
        <path d="m8 5 11 7-11 7V5Z" />
      ) : (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="m21 15-5-5L5 20" />
        </>
      )}
    </svg>
  );
}

export function ExerciseThumb({
  exercise,
  large = false,
  animate = false,
  previewPlaceholder = false,
}) {
  const [assetUrl, setAssetUrl] = useState("");
  const [previewAssetUrl, setPreviewAssetUrl] = useState("");
  const [assetsReady, setAssetsReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let mediaObjectUrl = "";
    let previewObjectUrl = "";
    setAssetUrl("");
    setPreviewAssetUrl("");
    setAssetsReady(false);
    setVideoFailed(false);

    Promise.all([
      exercise.mediaAssetId
        ? getExerciseAsset(exercise.mediaAssetId).catch(() => null)
        : null,
      exercise.previewAssetId
        ? getExerciseAsset(exercise.previewAssetId).catch(() => null)
        : null,
    ]).then(([media, preview]) => {
      if (!active) return;
      if (media) {
        mediaObjectUrl = URL.createObjectURL(media);
        setAssetUrl(mediaObjectUrl);
      }
      if (preview) {
        previewObjectUrl = URL.createObjectURL(preview);
        setPreviewAssetUrl(previewObjectUrl);
      }
      setAssetsReady(true);
    });

    return () => {
      active = false;
      if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [
    exercise.media,
    exercise.poster,
    exercise.mediaAssetId,
    exercise.previewAssetId,
  ]);

  const mediaSource = assetUrl || exercise.media || "";
  const isVideo =
    exercise.mediaType?.startsWith("video/") ||
    /\.(mp4|webm|mov)(?:$|[?#])/i.test(mediaSource);
  const stillSource =
    previewAssetUrl || exercise.poster || (!isVideo ? mediaSource : "");
  const showVideo = Boolean(
    large && animate && isVideo && mediaSource && !videoFailed,
  );
  const shownSource = showVideo ? mediaSource : stillSource;

  if (shownSource)
    return (
      <div
        class={`exercise-thumb exercise-media-thumb ${large ? "thumb-large" : ""} ${isVideo ? "exercise-video-thumb" : "exercise-image-thumb"}`}
      >
        {showVideo ? (
          <video
            src={shownSource}
            poster={previewAssetUrl || exercise.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            tabIndex="-1"
            aria-hidden="true"
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <img
            src={shownSource}
            alt={`Demostración de ${exercise.name}`}
            loading="lazy"
            onError={(event) => {
              if (
                !isVideo &&
                mediaSource &&
                !event.currentTarget.dataset.fallbackTried
              ) {
                event.currentTarget.dataset.fallbackTried = "true";
                event.currentTarget.src = mediaSource;
              }
            }}
          />
        )}
        {!large && (
          <span class="media-play">
            <MediaGlyph name="play" size={14} />
          </span>
        )}
      </div>
    );

  if (!assetsReady && (exercise.mediaAssetId || exercise.previewAssetId))
    return (
      <div
        class={`exercise-thumb exercise-media-loading ${large ? "thumb-large" : ""}`}
        aria-label={`Cargando imagen de ${exercise.name}`}
      >
        <span class="media-loading-mark">
          <MediaGlyph name="image" size={large ? 24 : 18} />
        </span>
      </div>
    );

  return (
    <div
      class={`exercise-thumb exercise-muscle-thumb ${large ? "thumb-large" : ""} ${previewPlaceholder ? "preview-placeholder" : ""}`}
      aria-label={`Músculos principales de ${exercise.name}`}
    >
      <MuscleMap
        muscles={getMuscleFocus(exercise)}
        compact
        showKey={false}
        showViewLabels={false}
      />
      {large && <span>{exercisePrimaryMuscleLabel(exercise)}</span>}
    </div>
  );
}

export function ExerciseDemo({ exercise }) {
  if (!hasExerciseDemoMedia(exercise)) return null;
  return (
    <div class="exercise-demo">
      <ExerciseThumb exercise={exercise} large animate />
      <div class="demo-caption">
        <span>MÚSCULOS</span>
      </div>
    </div>
  );
}
