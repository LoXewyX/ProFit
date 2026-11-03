import { translateText } from "./i18n.js";
import atlasPaths from "./muscle-atlas.js";

const clean = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

const muscleGroups = [
  { id: "chest", names: ["pecho", "pectoral", "pectorales", "chest", "pecs", "serrato anterior", "serratus anterior"] },
  { id: "trapezius", names: ["trapecio", "trapecio superior", "trapecio medio", "trapecio inferior", "trapezius", "traps", "elevador de la escapula", "levator scapulae"] },
  { id: "upperBack", names: ["espalda alta", "romboides", "rhomboids", "upper back"] },
  { id: "lats", names: ["dorsal", "dorsales", "latissimus", "lats", "redondo mayor", "teres major"] },
  { id: "lowerBack", names: ["espalda baja", "zona lumbar", "lumbar", "lower back", "erectores", "erectores espinales", "spinal erectors"] },
  { id: "hipFlexors", names: ["flexores de cadera", "iliopsoas", "hip flexors"] },
  { id: "legs", names: ["pierna", "piernas", "leg", "legs", "lower body"] },
  { id: "shoulders", names: ["hombro", "hombros", "deltoides", "shoulder", "shoulders"] },
  { id: "biceps", names: ["biceps", "bíceps", "braquial", "brachialis"] },
  { id: "triceps", names: ["triceps", "tríceps"] },
  { id: "forearms", names: ["antebrazo", "antebrazos", "forearm", "forearms", "braquiorradial", "brachioradialis", "flexores de muñeca", "extensores de muñeca", "wrist flexors", "wrist extensors"] },
  { id: "abs", names: ["core", "abdomen", "abdominales", "abs", "transverso abdominal", "transversus abdominis"] },
  { id: "obliques", names: ["oblicuos", "obliques"] },
  { id: "glutes", names: ["gluteo", "gluteos", "glúteo", "glúteos", "glutes", "nalgas"] },
  { id: "quads", names: ["cuadriceps", "cuádriceps", "quadriceps", "quads", "recto femoral", "vasto medial", "vasto lateral"] },
  { id: "adductors", names: ["aductores", "adductor", "adductors", "parte interna del muslo"] },
  { id: "hamstrings", names: ["isquiotibiales", "femorales", "hamstrings", "biceps femoral"] },
  { id: "calves", names: ["gemelo", "gemelos", "pantorrilla", "pantorrillas", "calves", "gastrocnemio", "gastrocnemius", "soleo", "soleus"] },
  { id: "tibialis", names: ["tibial", "tibial anterior", "tibialis"] },
  { id: "neck", names: ["cuello", "neck", "esternocleidomastoideo", "esplenio de la cabeza", "sternocleidomastoid", "splenius capitis"] },
];

// More specific labels share the same atlas regions while remaining distinct in
// exercise details and muscle distribution summaries.
for (const group of muscleGroups) {
  if (group.id === "shoulders") group.names.push("deltoides anterior", "deltoides lateral", "deltoides posterior");
  if (group.id === "glutes") group.names.push("gluteo mayor", "gluteus maximus", "gluteo medio", "gluteus medius");
  if (group.id === "hamstrings") group.names.push("semitendinoso", "semimembranoso");
}

const groupByName = new Map();
for (const group of muscleGroups) {
  for (const name of group.names) groupByName.set(clean(name), group);
}

function resolveGroup(name) {
  const normalized = clean(name);
  if (!normalized) return null;
  if (groupByName.has(normalized)) return groupByName.get(normalized);
  for (const group of muscleGroups) {
    if (group.names.some((part) => normalized.includes(part))) return group;
  }
  return null;
}

export function getMuscleFocus(exercise) {
  const primary = String(exercise?.muscle || "").trim();
  const secondary = Array.isArray(exercise?.secondary)
    ? exercise.secondary
    : String(exercise?.secondary || "").split(/[;,]/);
  return [
    ...(primary ? [{ name: primary, role: "primary" }] : []),
    ...secondary
      .map((name) => String(name || "").trim())
      .filter((name) => name && clean(name) !== clean(primary))
      .map((name) => ({ name, role: "secondary" })),
  ];
}

function musclesForWorkoutEntry(entry, exercisesById) {
  const exercise = exercisesById.get(entry?.id) || entry;
  return getMuscleFocus(exercise);
}

export function buildMuscleLoad(workouts = [], exercises = [], fromDate = "") {
  const exercisesById = new Map((exercises || []).map((item) => [item.id, item]));
  const totals = new Map();
  for (const workout of workouts || []) {
    if (fromDate && workout?.date && workout.date < fromDate) continue;
    for (const entry of workout?.exercises || []) {
      const seenGroups = new Set();
      for (const muscle of musclesForWorkoutEntry(entry, exercisesById)) {
        const group = resolveGroup(muscle.name);
        const key = group?.id || clean(muscle.name);
        if (!key || seenGroups.has(key)) continue;
        seenGroups.add(key);
        const current = totals.get(key) || {
          name: muscle.name,
          value: 0,
          count: 0,
          secondary: muscle.role === "secondary",
        };
        current.value += 1;
        current.count += 1;
        current.secondary = current.secondary && muscle.role === "secondary";
        totals.set(key, current);
      }
    }
  }
  const result = [...totals.values()].sort((a, b) => b.value - a.value);
  const maximum = Math.max(1, ...result.map((item) => item.value));
  return result.map((item) => ({ ...item, percent: item.value / maximum }));
}

// The supplied atlas is a collection of individually outlined muscle regions.
// These path ranges map those original contours to the app's selectable groups.
const atlasRegionByPath = new Map();
const assignAtlasRegions = (region, indexes) => indexes.forEach((index) => {
  const assigned = atlasRegionByPath.get(index) || [];
  assigned.push(region);
  atlasRegionByPath.set(index, assigned);
});
assignAtlasRegions("chest", [8, 9]);
assignAtlasRegions("shoulders", [4, 5, 6, 7]);
assignAtlasRegions("biceps", [16, 17]);
// Keep the arm groups separate: 12–15 are rear triceps, 18–19 front triceps.
assignAtlasRegions("triceps", [12, 13, 14, 15, 18, 19]);
// The atlas only separates the front forearms. Do not map the combined rear
// arm/hand silhouette, or the front hand paths, to forearms.
assignAtlasRegions("forearms", [28, 29, 30, 31]);
assignAtlasRegions("abs", [24, 25, 26, 27, 36, 37]);
assignAtlasRegions("obliques", [22, 23]);
assignAtlasRegions("quads", [48, 49, 54, 55, 58, 59, 66, 67]);
assignAtlasRegions("adductors", [50, 51]);
// Only the visible anterior tibialis portions are mapped; 72–73 include feet.
assignAtlasRegions("tibialis", [70, 71]);
// 78–79 are feet. Leave them unclassified instead of coloring them as calves.
assignAtlasRegions("calves", [68, 69, 74, 75, 76, 77]);
assignAtlasRegions("trapezius", [2, 3]);
assignAtlasRegions("upperBack", [10, 11]);
assignAtlasRegions("lats", [20, 21]);
assignAtlasRegions("lowerBack", [34, 35, 38, 39]);
assignAtlasRegions("hipFlexors", [44, 45]);
assignAtlasRegions("legs", [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 74, 75, 76, 77]);
assignAtlasRegions("glutes", [46, 47, 52, 53]);
assignAtlasRegions("hamstrings", [60, 61, 62, 63, 64, 65]);

function Figure({ side, focus }) {
  const back = side === "back";
  const minX = back ? 375 : 85;
  return (
    <svg
      class="muscle-figure-svg"
      viewBox={`${minX} 0 160 360`}
      role="img"
      aria-label={back ? "Vista posterior de la musculatura" : "Vista frontal de la musculatura"}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="translate(0 360) scale(.1 -.1)">
        {atlasPaths.map((path, index) => {
          const roles = (atlasRegionByPath.get(index) || []).map((region) => focus.get(region));
          const role = roles.includes("primary") ? "primary" : roles.includes("secondary") ? "secondary" : null;
          return <path key={index} d={path} class={`atlas-muscle${role ? ` is-${role}` : ""}`} />;
        })}
      </g>
    </svg>
  );
}

export function MuscleMap({
  muscles = [],
  compact = false,
  showKey = true,
  showViewLabels = true,
  className = "",
}) {
  const focus = new Map();
  for (const item of muscles || []) {
    const group = resolveGroup(typeof item === "string" ? item : item?.name);
    if (group && !focus.has(group.id)) {
      focus.set(group.id, typeof item === "string" ? "primary" : item?.role || "primary");
    }
  }
  return (
    <div class={`muscle-map${compact ? " muscle-map-compact" : ""}${className ? ` ${className}` : ""}`}>
      <div class="muscle-map-figures">
        <div class="muscle-view">
          <Figure side="front" focus={focus} />
          {showViewLabels && <span>{translateText("Frente")}</span>}
        </div>
        <div class="muscle-view">
          <Figure side="back" focus={focus} />
          {showViewLabels && <span>{translateText("Espalda")}</span>}
        </div>
      </div>
      {showKey && muscles?.length > 0 && (
        <div class="muscle-key">
          <i class="key-primary" /> {translateText("Principal")}
          <i class="key-secondary" /> {translateText("Apoyo")}
        </div>
      )}
    </div>
  );
}

export function MuscleInsights({ items = [], compact = false, className = "" }) {
  const load = items || [];
  const maximum = Math.max(1, ...load.map((item) => item.value || item.count || 0));
  const highlighted = load.slice(0, 8).map((item) => ({
    name: item.name,
    role: item.secondary ? "secondary" : "primary",
  }));
  return (
    <div class={`muscle-insights${compact ? " insights-compact" : ""}${className ? ` ${className}` : ""}`}>
      <MuscleMap muscles={highlighted} compact={compact} showKey={!compact} />
      <div class="muscle-load-list">
        {load.length ? load.slice(0, compact ? 5 : 10).map((item) => {
          const value = item.value || item.count || 0;
          return (
            <div class="muscle-load-row" key={item.name}>
              <div class="muscle-load-copy">
                <i class={`muscle-dot${item.secondary ? " is-secondary" : ""}`} />
                <strong>{translateText(item.name)}</strong>
                <small>{value} {translateText("estímulos")}</small>
              </div>
              <div class="muscle-load-track">
                <i class={item.secondary ? "is-secondary" : ""} style={{ width: `${Math.max(5, (value / maximum) * 100)}%` }} />
              </div>
            </div>
          );
        }) : <p class="muscle-empty-copy">{translateText("Completa entrenamientos para ver el mapa muscular.")}</p>}
      </div>
    </div>
  );
}
