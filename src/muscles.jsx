const normalizeMuscleName = (name) => name.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const aliases = {
  pecho: ['chest'], pectoral: ['chest'], pectorales: ['chest'],
  espalda: ['lats', 'upperBack', 'lowerBack'], dorsal: ['lats'], dorsales: ['lats'], trapecio: ['upperBack'], trapecios: ['upperBack'],
  hombro: ['shoulders'], hombros: ['shoulders'], deltoides: ['shoulders'],
  biceps: ['biceps'], triceps: ['triceps'],
  antebrazo: ['forearms'], antebrazos: ['forearms'], abdomen: ['abs'], abdominales: ['abs'],
  piernas: ['quads', 'hamstrings', 'calves'], cuadriceps: ['quads'], cuads: ['quads'],
  isquiotibiales: ['hamstrings'], femorales: ['hamstrings'], gluteos: ['glutes'], gluteo: ['glutes'],
  pantorrillas: ['calves'], gemelos: ['calves'], cuello: ['neck'],
};

const muscleParts = {
  front: [
    // Anatomía anterior: hombros, pectorales, brazos, abdomen y piernas.
    ['neck', 'M45 19.5 Q50 22 55 19.5 L55.5 27 Q53 29 50 29 Q47 29 44.5 27Z'],
    ['shoulders', 'M36.8 29 Q39.5 27.6 42.3 29 Q44.5 30.7 44 34.2 L41.4 38.5 Q38.3 40 35.1 37.6 Q33.7 35.2 34.5 32.2 Q35 30.2 36.8 29Z'],
    ['shoulders', 'M63.2 29 Q60.5 27.6 57.7 29 Q55.5 30.7 56 34.2 L58.6 38.5 Q61.7 40 64.9 37.6 Q66.3 35.2 65.5 32.2 Q65 30.2 63.2 29Z'],
    ['chest', 'M40.1 34.6 Q44.1 32.5 49.2 34.5 L49.2 42.2 Q47.3 44.5 44.8 44.4 Q41.2 43.8 39.6 40.6 Q39.1 37.4 40.1 34.6Z'],
    ['chest', 'M59.9 34.6 Q55.9 32.5 50.8 34.5 L50.8 42.2 Q52.7 44.5 55.2 44.4 Q58.8 43.8 60.4 40.6 Q60.9 37.4 59.9 34.6Z'],
    ['biceps', 'M32.2 38 Q34.2 36.7 37 38.1 L36.4 43.8 Q35.6 47.2 32.4 48.5 Q30.8 46.7 30.7 43.6 Q30.9 40.2 32.2 38Z'],
    ['biceps', 'M67.8 38 Q65.8 36.7 63 38.1 L63.6 43.8 Q64.4 47.2 67.6 48.5 Q69.2 46.7 69.3 43.6 Q69.1 40.2 67.8 38Z'],
    ['forearms', 'M29 48.8 Q31.4 48.8 33.3 50.8 L32.1 58.3 Q30.9 64.1 27.1 69.5 Q25.4 69 25.4 66.1 L26.3 56.1 Q26.7 51.5 29 48.8Z'],
    ['forearms', 'M71 48.8 Q68.6 48.8 66.7 50.8 L67.9 58.3 Q69.1 64.1 72.9 69.5 Q74.6 69 74.6 66.1 L73.7 56.1 Q73.3 51.5 71 48.8Z'],
    // Tres pares de vientres del recto abdominal.
    ['abs', 'M42.4 47.5 Q45.5 46 49.1 47.2 L49 52.4 Q45.8 53.6 42.3 52.4 Q41.4 50.1 42.4 47.5Z'],
    ['abs', 'M57.6 47.5 Q54.5 46 50.9 47.2 L51 52.4 Q54.2 53.6 57.7 52.4 Q58.6 50.1 57.6 47.5Z'],
    ['abs', 'M42.3 54.5 Q45.7 53.4 49.1 54.6 L49 59.4 Q46.1 60.8 42.4 59.5 Q41.4 57.1 42.3 54.5Z'],
    ['abs', 'M57.7 54.5 Q54.3 53.4 50.9 54.6 L51 59.4 Q53.9 60.8 57.6 59.5 Q58.6 57.1 57.7 54.5Z'],
    ['abs', 'M43 61.5 Q46.1 60.4 49 61.5 L48.9 66.4 Q46.6 67.9 43.3 67 Q42.3 64.5 43 61.5Z'],
    ['abs', 'M57 61.5 Q53.9 60.4 51 61.5 L51.1 66.4 Q53.4 67.9 56.7 67 Q57.7 64.5 57 61.5Z'],
    // Vientre completo del cuádriceps; las líneas muestran sus tres cabezas.
    ['quads', 'M38.5 76.6 Q42.4 74.1 48.9 75.8 L49 90.8 Q48.2 95.8 45.7 98.2 Q42.3 99.2 39.8 96.5 Q36.7 92.3 36.8 85 Q36.9 79.8 38.5 76.6Z'],
    ['quads', 'M61.5 76.6 Q57.6 74.1 51.1 75.8 L51 90.8 Q51.8 95.8 54.3 98.2 Q57.7 99.2 60.2 96.5 Q63.3 92.3 63.2 85 Q63.1 79.8 61.5 76.6Z'],
  ],
  back: [
    // Anatomía posterior: trapecio, hombros, dorsales y cadena posterior.
    ['neck', 'M45 19.5 Q50 22 55 19.5 L55.5 27 Q53 29 50 29 Q47 29 44.5 27Z'],
    ['shoulders', 'M36.8 29 Q39.5 27.6 42.3 29 Q44.5 30.7 44 34.2 L41.4 38.5 Q38.3 40 35.1 37.6 Q33.7 35.2 34.5 32.2 Q35 30.2 36.8 29Z'],
    ['shoulders', 'M63.2 29 Q60.5 27.6 57.7 29 Q55.5 30.7 56 34.2 L58.6 38.5 Q61.7 40 64.9 37.6 Q66.3 35.2 65.5 32.2 Q65 30.2 63.2 29Z'],
    ['upperBack', 'M44.5 26.3 Q50 29.5 55.5 26.3 L63.3 31.5 Q60.8 39 56.2 43.2 L50 47 Q43.8 43.2 39.2 39 L36.7 31.5Z'],
    ['triceps', 'M32.2 38 Q34.2 36.7 37 38.1 L36.4 43.8 Q35.6 47.2 32.4 48.5 Q30.8 46.7 30.7 43.6 Q30.9 40.2 32.2 38Z'],
    ['triceps', 'M67.8 38 Q65.8 36.7 63 38.1 L63.6 43.8 Q64.4 47.2 67.6 48.5 Q69.2 46.7 69.3 43.6 Q69.1 40.2 67.8 38Z'],
    ['forearms', 'M29 48.8 Q31.4 48.8 33.3 50.8 L32.1 58.3 Q30.9 64.1 27.1 69.5 Q25.4 69 25.4 66.1 L26.3 56.1 Q26.7 51.5 29 48.8Z'],
    ['forearms', 'M71 48.8 Q68.6 48.8 66.7 50.8 L67.9 58.3 Q69.1 64.1 72.9 69.5 Q74.6 69 74.6 66.1 L73.7 56.1 Q73.3 51.5 71 48.8Z'],
    ['lats', 'M40.3 39.3 Q44.2 37.1 48.4 39.4 L48.4 51.2 Q46.8 58.1 43.1 62.2 Q39.3 60.5 37.7 55.1 Q37.4 46.6 40.3 39.3Z'],
    ['lats', 'M59.7 39.3 Q55.8 37.1 51.6 39.4 L51.6 51.2 Q53.2 58.1 56.9 62.2 Q60.7 60.5 62.3 55.1 Q62.6 46.6 59.7 39.3Z'],
    // Erectores espinales, separados a cada lado de la columna.
    ['lowerBack', 'M46.2 48.2 Q48 47.2 49.4 48.2 L49.1 69.8 Q47.2 71.5 45 70.3 L44.9 57Z'],
    ['lowerBack', 'M53.8 48.2 Q52 47.2 50.6 48.2 L50.9 69.8 Q52.8 71.5 55 70.3 L55.1 57Z'],
    ['glutes', 'M39.3 73.7 Q43.4 71.2 49.2 73.9 L49.2 82.6 Q46.9 86.6 42.7 86 Q38.8 84.2 38.5 79.8Z'],
    ['glutes', 'M60.7 73.7 Q56.6 71.2 50.8 73.9 L50.8 82.6 Q53.1 86.6 57.3 86 Q61.2 84.2 61.5 79.8Z'],
    // Isquiotibiales lateral y medial de cada muslo.
    ['hamstrings', 'M39.3 86.1 Q42.6 84.1 45.1 86 L44 97.2 Q42.7 100.4 40.5 102 Q38.3 99.8 38.5 95Z'],
    ['hamstrings', 'M45.6 86.2 Q47.3 85.4 49.1 86.4 L49 96.6 Q47.7 100.3 45.2 102 Q43.7 100.1 43.9 97Z'],
    ['hamstrings', 'M60.7 86.1 Q57.4 84.1 54.9 86 L56 97.2 Q57.3 100.4 59.5 102 Q61.7 99.8 61.5 95Z'],
    ['hamstrings', 'M54.4 86.2 Q52.7 85.4 50.9 86.4 L51 96.6 Q52.3 100.3 54.8 102 Q56.3 100.1 56.1 97Z'],
    // Dos vientres del gemelo que se estrechan hacia el tendón de Aquiles.
    ['calves', 'M38.1 101.5 Q41.1 98.9 44.2 101.1 Q45.3 105.3 43.4 111.4 Q42 116.1 40.1 118.2 Q37.9 117.3 37.4 113Z'],
    ['calves', 'M45.2 101.5 Q46.5 100.2 48 101.2 L47.2 110.7 Q46.4 115.3 44.5 118.4 L41.6 120.4 Q43.1 115.3 43.8 110Z'],
    ['calves', 'M61.9 101.5 Q58.9 98.9 55.8 101.1 Q54.7 105.3 56.6 111.4 Q58 116.1 59.9 118.2 Q62.1 117.3 62.6 113Z'],
    ['calves', 'M54.8 101.5 Q53.5 100.2 52 101.2 L52.8 110.7 Q53.6 115.3 55.5 118.4 L58.4 120.4 Q56.9 115.3 56.2 110Z'],
  ],
};

const outline = {
  front: [
    // Brazos en la silueta base: los segmentos musculares se dibujan encima.
    'M36 29 Q32.5 27.8 30 30 L27.8 34 Q26.2 38 27 43 L29.5 47.5 Q31.3 49.2 33.1 47.5 L36.6 43 Q37.6 38 40 35Z',
    'M30 47 Q27.5 47.5 26.5 50 L25 57 L23.8 68 Q23.7 71.2 26 72.5 Q28.3 73 29.3 70.5 L32.2 61.8 L35.2 54 L35 49Z',
    'M25 71 Q22.7 72.4 22.3 75.5 L22.8 80.5 Q23.3 82.4 25.1 81 L27.3 77.5 L28.3 73.1Z',
    'M64 29 Q67.5 27.8 70 30 L72.2 34 Q73.8 38 73 43 L70.5 47.5 Q68.7 49.2 66.9 47.5 L63.4 43 Q62.4 38 60 35Z',
    'M70 47 Q72.5 47.5 73.5 50 L75 57 L76.2 68 Q76.3 71.2 74 72.5 Q71.7 73 70.7 70.5 L67.8 61.8 L64.8 54 L65 49Z',
    'M75 71 Q77.3 72.4 77.7 75.5 L77.2 80.5 Q76.7 82.4 74.9 81 L72.7 77.5 L71.7 73.1Z',
    'M43 25 Q47 22 50 23 Q53 22 57 25 L64 28 Q66 30 64 34 L60 40 Q60 46 61 52 L63 64 L65 70 Q63 76 58 78 L42 78 Q37 76 35 70 L37 64 L39 52 Q40 46 40 40 L36 34 Q34 30 36 28Z',
    'M40 73 Q44 71 49 74 L49 91 Q48 99 46 108 L44 121 Q42 125 38 124 L35 122 L38 99 L35 80 Q36 75 40 73Z',
    'M60 73 Q56 71 51 74 L51 91 Q52 99 54 108 L56 121 Q58 125 62 124 L65 122 L62 99 L65 80 Q64 75 60 73Z',
    'M38 122 Q34 123 32 128 Q36 130 43 128 L45 123Z',
    'M62 122 Q66 123 68 128 Q64 130 57 128 L55 123Z',
  ],
  back: [
    'M36 29 Q32.5 27.8 30 30 L27.8 34 Q26.2 38 27 43 L29.5 47.5 Q31.3 49.2 33.1 47.5 L36.6 43 Q37.6 38 40 35Z',
    'M30 47 Q27.5 47.5 26.5 50 L25 57 L23.8 68 Q23.7 71.2 26 72.5 Q28.3 73 29.3 70.5 L32.2 61.8 L35.2 54 L35 49Z',
    'M25 71 Q22.7 72.4 22.3 75.5 L22.8 80.5 Q23.3 82.4 25.1 81 L27.3 77.5 L28.3 73.1Z',
    'M64 29 Q67.5 27.8 70 30 L72.2 34 Q73.8 38 73 43 L70.5 47.5 Q68.7 49.2 66.9 47.5 L63.4 43 Q62.4 38 60 35Z',
    'M70 47 Q72.5 47.5 73.5 50 L75 57 L76.2 68 Q76.3 71.2 74 72.5 Q71.7 73 70.7 70.5 L67.8 61.8 L64.8 54 L65 49Z',
    'M75 71 Q77.3 72.4 77.7 75.5 L77.2 80.5 Q76.7 82.4 74.9 81 L72.7 77.5 L71.7 73.1Z',
    'M43 25 Q47 22 50 23 Q53 22 57 25 L64 28 Q66 30 64 34 L60 40 Q60 46 61 52 L63 64 L65 70 Q63 76 58 78 L42 78 Q37 76 35 70 L37 64 L39 52 Q40 46 40 40 L36 34 Q34 30 36 28Z',
    'M40 73 Q44 71 49 74 L49 91 Q48 99 46 108 L44 121 Q42 125 38 124 L35 122 L38 99 L35 80 Q36 75 40 73Z',
    'M60 73 Q56 71 51 74 L51 91 Q52 99 54 108 L56 121 Q58 125 62 124 L65 122 L62 99 L65 80 Q64 75 60 73Z',
    'M38 122 Q34 123 32 128 Q36 130 43 128 L45 123Z',
    'M62 122 Q66 123 68 128 Q64 130 57 128 L55 123Z',
  ],
};

const anatomyDetails = {
  front: [
    // Clavículas, borde de los pectorales y esternón.
    'M36 31 Q42 29.5 49 33.5 L50 35 L51 33.5 Q58 29.5 64 31 M40 40 Q44 38.7 49 41 M60 40 Q56 38.7 51 41 M50 35V45',
    // Línea alba e intersecciones tendinosas del recto abdominal.
    'M50 46V69 M42 53.5 Q45 54.7 49 53.6 M51 53.6 Q55 54.7 58 53.5 M42 60.5 Q45 61.8 49 60.6 M51 60.6 Q55 61.8 58 60.5 M43 68 Q46 69.1 49 68 M51 68 Q54 69.1 57 68',
    // Pliegues de codo y separación del antebrazo.
    'M29.3 47.8 Q32 49.2 35.1 47.4 M27 58.4 Q29.5 59.3 32.2 58.3 M70.7 47.8 Q68 49.2 64.9 47.4 M73 58.4 Q70.5 59.3 67.8 58.3',
    // Separación suave entre vasto lateral, recto femoral y vasto medial.
    'M42.5 77 Q44.1 83 43.6 89 Q43.3 94 41.5 97 M47.1 77 Q46.8 84 47.4 90 Q47.7 94 46.5 97 M57.5 77 Q55.9 83 56.4 89 Q56.7 94 58.5 97 M52.9 77 Q53.2 84 52.6 90 Q52.3 94 53.5 97 M38 94 Q42 98 48 95 M62 94 Q58 98 52 95 M40 101 Q43 103 47 101 M60 101 Q57 103 53 101',
  ],
  back: [
    // Inserción del trapecio, espinas de las escápulas y deltoides posteriores.
    'M42 29 Q46 29 50 34 Q54 29 58 29 M37 33 Q41 35 43 40 L47 45 M63 33 Q59 35 57 40 L53 45 M35 36 Q38 38 41 36 M65 36 Q62 38 59 36',
    // Columna, bordes escapulares y relieve de los erectores espinales.
    'M50 34V72 M41 39 Q40 45 45 49 L49 51 M59 39 Q60 45 55 49 L51 51 M42 47 Q45 49 48 48 M58 48 Q55 49 52 47 M46 52 Q47 56 48.8 58 M54 52 Q53 56 51.2 58 M46 62 Q48 63 49 62 M54 62 Q52 63 51 62 M46 68 Q48 70 49 69 M54 69 Q52 70 51 68',
    // Separación del tríceps, codo y vientres del antebrazo.
    'M29.3 47.8 Q32 49.2 35.1 47.4 M27 58.4 Q29.5 59.3 32.2 58.3 M70.7 47.8 Q68 49.2 64.9 47.4 M73 58.4 Q70.5 59.3 67.8 58.3',
    // Pliegue glúteo, separación de isquiotibiales y tendones de Aquiles.
    'M50 75V84 M39 82 Q43 85 49 83 M61 82 Q57 85 51 83 M49 86 Q47 93 46 98 M51 86 Q53 93 54 98 M39 99 Q43 102 48 100 M61 99 Q57 102 52 100 M43 112 Q44 117 42 121 M57 112 Q56 117 58 121',
  ],
};

function stateFor(region, focus) {
  return focus[region] || '';
}

function Figure({ side, focus, compact }) {
  return <svg class="muscle-figure-svg" viewBox="0 0 100 130" role="img" aria-label={`${side === 'front' ? 'Vista frontal' : 'Vista posterior'} del mapa muscular`}>
    <circle class="body-base body-ear" cx="43" cy="13" r="1.8" />
    <circle class="body-base body-ear" cx="57" cy="13" r="1.8" />
    <path class="body-base body-head" d="M50 4.5 C54.5 4.5 57.2 7.8 57.2 12.1 L56.7 15.1 Q56.1 19.2 50 20.2 Q43.9 19.2 43.3 15.1 L42.8 12.1 C42.8 7.8 45.5 4.5 50 4.5Z" />
    <path class="body-base" d="M45 18 Q50 21 55 18 L56 27 Q53 29 50 29 Q47 29 44 27Z" />
    {outline[side].map((d, index) => <path class="body-base" d={d} key={`base-${index}`} />)}
    {muscleParts[side].map(([region, d], index) => <path class={`muscle-part ${['shoulders', 'biceps', 'triceps', 'forearms'].includes(region) ? 'muscle-arm-part' : ''} ${stateFor(region, focus)}`} d={d} key={`${region}-${index}`} />)}
    {outline[side].map((d, index) => <path class="body-contour" d={d} key={`contour-${index}`} />)}
    {anatomyDetails[side].map((d, index) => <path class="anatomy-line" d={d} key={`detail-${index}`} />)}
  </svg>;
}

export function getMuscleFocus(exercise) {
  return [
    { name: exercise.muscle, role: 'primary' },
    ...(exercise.secondary || []).map((name) => ({ name, role: 'secondary' })),
  ];
}

export function buildMuscleLoad(workouts, exercises, cutoff = '0000-00-00') {
  const result = new Map();
  const add = (name, role, sets) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const key = cleanName.toLocaleLowerCase('es');
    const entry = result.get(key) || { name: cleanName, primary: 0, secondary: 0 };
    entry[role] += sets;
    result.set(key, entry);
  };
  workouts.filter((workout) => workout.date >= cutoff).forEach((workout) => workout.exercises.forEach((entry) => {
    const exercise = exercises.find((item) => item.id === entry.id) || (entry.name && entry.muscle ? entry : null);
    const count = entry.sets.length;
    if (!exercise || !count) return;
    add(exercise.muscle, 'primary', count);
    (exercise.secondary || []).forEach((name) => add(name, 'secondary', count));
  }));
  return [...result.values()].sort((a, b) => (b.primary + b.secondary * 0.5) - (a.primary + a.secondary * 0.5));
}

export function MuscleMap({ muscles = [], compact = false, showKey = true, showViewLabels = true, className = '' }) {
  const focus = {};
  muscles.forEach(({ name, role = 'primary' }) => {
    const targets = aliases[normalizeMuscleName(name)] || [];
    targets.forEach((region) => {
      if (role === 'primary' || !focus[region]) focus[region] = role === 'primary' ? 'is-primary' : 'is-secondary';
    });
  });
  return <div class={`muscle-map ${compact ? 'muscle-map-compact' : ''} ${className}`} role="img" aria-label="Mapa de músculos principales y secundarios trabajados">
    <div class="muscle-map-figures"><div class="muscle-view"><Figure side="front" focus={focus} compact={compact} />{showViewLabels && <span>Frente</span>}</div>
    <div class="muscle-view"><Figure side="back" focus={focus} compact={compact} />{showViewLabels && <span>Espalda</span>}</div></div>
    {showKey && <div class="muscle-key"><i class="key-primary" /> Principal <i class="key-secondary" /> Apoyo</div>}
  </div>;
}

export function MuscleInsights({ items = [], compact = false, className = '' }) {
  const displayed = items.filter((item) => item.primary || item.secondary).slice(0, compact ? 4 : 6);
  const focus = displayed.flatMap((item) => [
    ...(item.primary ? [{ name: item.name, role: 'primary' }] : []),
    ...(item.secondary && !item.primary ? [{ name: item.name, role: 'secondary' }] : []),
  ]);
  const max = Math.max(...displayed.map((item) => item.primary + item.secondary * 0.5), 1);
  return <div class={`muscle-insights ${compact ? 'insights-compact' : ''} ${className}`}>
    <MuscleMap muscles={focus} />
    {displayed.length ? <div class="muscle-load-list">{displayed.map((item) => {
      const total = item.primary + item.secondary * 0.5;
      return <div class="muscle-load-row" key={item.name}>
        <div class="muscle-load-copy"><span class={`muscle-dot ${item.primary ? 'is-primary' : 'is-secondary'}`} /><strong>{item.name}</strong><small>{item.primary ? `${item.primary} series` : `${item.secondary} series de apoyo`}</small></div>
        <div class="muscle-load-track"><i class={item.primary ? 'is-primary' : 'is-secondary'} style={{ width: `${Math.max(total / max * 100, 5)}%` }} /></div>
      </div>;
    })}</div> : <div class="muscle-empty-copy">Al registrar sesiones, aquí verás los grupos trabajados.</div>}
  </div>;
}
