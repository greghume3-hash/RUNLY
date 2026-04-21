// Générateur de séance (étape 2 de l'algo).
//
// Principe : un Template décrit une séance paramétriquement
// (familles de blocs, fourchettes de paramètres, règles d'adaptation).
// generateSessionFromTemplate() résout ces paramètres selon le profil
// et la sortie de getPaces() pour produire une Session concrète.
//
// Format Template : voir src/plan/templates/*.js
// Format Session  : voir bloc de doc ci-dessous.

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {number|null} week
 * @property {string|null} day
 * @property {string|null} date
 * @property {string} type              easy | long | tempo | intervals | recovery | rest | cross | hills
 * @property {string} family            vma_short | vma_long | threshold | tempo | easy | long | recovery | ...
 * @property {string} templateId
 * @property {string|null} phase        base | development | specific | taper
 * @property {string} intent            phrase pédagogique "pourquoi cette séance"
 * @property {number} totalDurationMin
 * @property {number|null} totalDistanceKm
 * @property {number} estimatedLoad     score 0-150 pour ACWR futur
 * @property {string} difficulty        easy | moderate | hard | very_hard
 * @property {Block[]} blocks
 * @property {{before: string|null, during: string|null, after: string|null}} tips
 * @property {Object|null} indoorAlternative
 * @property {string} status            planned | done | skipped | partial | modified
 * @property {Object|null} completion
 */

// --- Forfait de charge par type (sera affiné avec l'ACWR plus tard) ---
const LOAD_BY_TYPE = {
  recovery: 15,
  easy: 30,
  cross: 30,
  long: 80,
  tempo: 70,
  intervals: 85,
  hills: 85,
  rest: 0,
};

// --- Difficulté par type ---
const DIFFICULTY_BY_TYPE = {
  recovery: "easy",
  easy: "easy",
  cross: "easy",
  long: "moderate",
  tempo: "hard",
  intervals: "hard",
  hills: "very_hard",
  rest: "easy",
};

// ---------------------------------------------------------------------
// Helpers de résolution de paramètres
// ---------------------------------------------------------------------

// Niveau du coureur en ratio [0, 1] : débutant=0, confirmé vol élevé=1.
function levelToRatio(profile) {
  const experience = profile.experience;
  const vol = profile.weeklyVolumeKm ?? 0;
  if (experience === "none") return 0;
  if (experience === "lt6m") return 0.2;
  if (experience === "6m-2y") return vol >= 30 ? 0.55 : 0.4;
  if (experience === "2y+") return vol >= 40 ? 0.8 : 0.6;
  return 0.4;
}

// Pick un nombre dans [min, max] selon :
//   - le niveau du coureur (ratio fixe par expérience + volume)
//   - la progression dans la phase (weekInPhase / totalWeeksInPhase)
//
// Formule : t = 0.5 × levelRatio + 0.5 × progressRatio
// → début de phase pour débutant : t=0.1 → min
// → fin de phase pour confirmé : t=0.9 → max
// → séance 1 de phase (progress=0) ignore le progrès et laisse juste le niveau
// → deload week : progressRatio neutralisé (voir `deloadDownscale`)
function pickByLevel({ min, max }, profile, context = {}) {
  const levelT = levelToRatio(profile);
  const progressT = computeProgressRatio(context);
  const t = Math.max(0, Math.min(1, 0.5 * levelT + 0.5 * progressT));

  let raw = min + (max - min) * t;

  // En deload, on scale down (~75 % du param résolu) — moins de reps/durée
  if (context.isDeload) raw = raw * 0.75;

  return Number.isInteger(min) && Number.isInteger(max)
    ? Math.max(min, Math.round(raw))
    : raw;
}

// Progression dans la phase : 0 en semaine 1, 1 en dernière semaine.
// On ne monte pas linéairement jusqu'à 1 : on plafonne à 0.9 pour éviter
// que la dernière semaine de chaque phase soit trop dure (piège d'accumulation).
function computeProgressRatio(context) {
  const w = context.weekInPhase ?? 1;
  const total = context.totalWeeksInPhase ?? 1;
  if (total <= 1) return 0.3;
  const raw = (w - 1) / (total - 1);
  return Math.max(0, Math.min(0.9, raw));
}

// Durée approximative d'un bloc courant à une allure donnée (en min).
function minFromDistance(distanceKm, paceSecPerKm) {
  return (distanceKm * paceSecPerKm) / 60;
}

// Convertit distance (m) + allure (sec/km) en temps (mm:ss sur cette distance).
function timeForDistance(distanceM, paceSecPerKm) {
  const totalSec = Math.round((distanceM / 1000) * paceSecPerKm);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Constructeurs de blocs
// ---------------------------------------------------------------------

function buildWarmup(paces, { minutes = 15, zone = "Z2" } = {}) {
  const z = paces.zones[zone];
  return {
    type: "warmup",
    label: "Échauffement",
    durationMin: minutes,
    zone,
    zoneShort: z.short,
    paceTarget: { min: z.paceMin, max: z.paceMax, unit: "min/km" },
    speedTarget: { min: z.kmhMin, max: z.kmhMax, unit: "km/h" },
    description:
      "Footing progressif, tu termines un peu plus rapide qu'au début.",
  };
}

function buildCooldown(paces, { minutes = 10 } = {}) {
  const z = paces.zones.Z1;
  return {
    type: "cooldown",
    label: "Retour au calme",
    durationMin: minutes,
    zone: "Z1",
    zoneShort: z.short,
    paceTarget: { min: z.paceMin, max: z.paceMax, unit: "min/km" },
    speedTarget: { min: z.kmhMin, max: z.kmhMax, unit: "km/h" },
    description: "Footing très lent pour évacuer.",
  };
}

function buildDrills() {
  return {
    type: "drills",
    label: "Gammes",
    durationMin: 5,
    optional: true,
    description:
      "Talons-fesses, montées de genoux, skipping, 2×20 m de chaque.",
  };
}

// Bloc d'intervalles par distance (ex: 8×400m)
function buildIntervalsByDistance(paces, { reps, distanceM, context, recoverySec }) {
  const target = paces.getTargetPace(context);
  const z = context.startsWith("vma_long")
    ? paces.zones.Z5b
    : paces.zones.Z5a;
  const rZ = paces.zones.Z1;
  return {
    type: "intervals",
    label: "Corps de séance",
    repetitions: reps,
    work: {
      distance: distanceM,
      zone: context === "vma_long" ? "Z5b" : "Z5a",
      zoneShort: z.short,
      paceTarget: { value: target.pace, unit: "min/km" },
      speedTarget: { value: target.kmh, unit: "km/h" },
      timeTarget: {
        value: timeForDistance(distanceM, target.paceSec),
        unit: distanceM === 400 ? "per400m" : `per${distanceM}m`,
      },
    },
    recovery: {
      type: "jog",
      durationSec: recoverySec,
      zone: "Z1",
      zoneShort: rZ.short,
      description: `Trottinée lente (~${Math.round(recoverySec / 60)} min).`,
    },
    description: `${reps} répétitions de ${distanceM} m à ${target.pace}/km (${target.kmh} km/h), récup ${Math.round(
      recoverySec / 60
    )} min trottinée.`,
    tips:
      "Vise la régularité entre les répétitions. Si les 2 dernières s'effondrent, pars moins vite la prochaine fois.",
  };
}

// Bloc continu à allure cible (ex: 2×15 min tempo)
function buildTempoBlock(paces, { reps, durationMin, context, recoveryMin }) {
  const target = paces.getTargetPace(context);
  const zoneKey = context === "threshold" || context === "tempo" ? "Z4" : "Z3";
  const z = paces.zones[zoneKey];
  const rZ = paces.zones.Z1;
  const isSingleBlock = reps === 1;
  return {
    type: "tempo",
    label: isSingleBlock ? "Bloc tempo" : "Blocs tempo",
    repetitions: reps,
    work: {
      durationMin,
      zone: zoneKey,
      zoneShort: z.short,
      paceTarget: { value: target.pace, unit: "min/km" },
      speedTarget: { value: target.kmh, unit: "km/h" },
    },
    recovery: isSingleBlock
      ? null
      : {
          type: "jog",
          durationMin: recoveryMin,
          zone: "Z1",
          zoneShort: rZ.short,
          description: `Trottinée lente ${recoveryMin} min entre les blocs.`,
        },
    description: isSingleBlock
      ? `${durationMin} min à ${target.pace}/km (${target.kmh} km/h).`
      : `${reps} × ${durationMin} min à ${target.pace}/km (${target.kmh} km/h), récup ${recoveryMin} min trot.`,
    tips: "Allure soutenue mais tenable — tu dois pouvoir dire 3-4 mots.",
  };
}

// Bloc d'intervalles en SÉQUENCE (ex: pyramide 30/45/60/45/30).
// steps = tableau d'objets { workSec, recoverySec?, workDistanceM?, paceContext? }
// Chaque step peut écraser le contexte d'allure si besoin (ex: montée en VMA+
// au sommet de la pyramide).
function buildIntervalsSequence(paces, { steps, defaultContext = "vma_short", series = 1, betweenSeriesRecoveryMin = 3 }) {
  // On pré-calcule les allures par contexte utilisé (évite les appels répétés)
  const paceCache = {};
  const paceFor = (ctx) => (paceCache[ctx] ??= paces.getTargetPace(ctx));

  // Hydrate chaque step avec son allure cible
  const resolvedSteps = steps.map((s) => {
    const ctx = s.paceContext || defaultContext;
    const target = paceFor(ctx);
    // Si le step est défini par distance, on calcule le temps correspondant
    const workSec =
      s.workSec ??
      (s.workDistanceM != null
        ? Math.round((s.workDistanceM / 1000) * target.paceSec)
        : null);
    return {
      ...s,
      workSec,
      resolvedContext: ctx,
      paceTarget: { value: target.pace, unit: "min/km" },
      speedTarget: { value: target.kmh, unit: "km/h" },
      vmaPct: target.vmaPct,
    };
  });

  // Description compacte "30s / 45s / 60s / 45s / 30s"
  const shortSeq = resolvedSteps
    .map((s) =>
      s.workDistanceM
        ? `${s.workDistanceM}m`
        : `${s.workSec}s`
    )
    .join(" / ");
  const seriesLabel = series > 1 ? `${series} × ( ${shortSeq} )` : shortSeq;

  return {
    type: "intervals",
    label: "Séquence",
    repetitions: series,
    sequence: resolvedSteps, // nouveau champ — détail de chaque step
    sequenceSummary: seriesLabel,
    betweenSeriesRecoveryMin: series > 1 ? betweenSeriesRecoveryMin : null,
    description: `Séquence : ${seriesLabel}. Allure de base : ${paceFor(defaultContext).pace}/km (${paceFor(defaultContext).kmh} km/h).`,
    tips:
      "Varie les durées sans changer l'effort perçu. Sur les plus longs, relâche la foulée.",
  };
}

// Bloc d'intervalles par temps (ex: 30-30, 45-15, fartlek structuré)
function buildIntervalsByTime(paces, { reps, workSec, recoverySec, context, recoveryType = "jog" }) {
  const target = paces.getTargetPace(context);
  const zoneKey =
    context === "vma_long" ? "Z5b" : context === "vma_short" ? "Z5a" : "Z4";
  const z = paces.zones[zoneKey];
  const rZ = paces.zones.Z1;
  return {
    type: "intervals",
    label: "Corps de séance",
    repetitions: reps,
    work: {
      durationSec: workSec,
      zone: zoneKey,
      zoneShort: z.short,
      paceTarget: { value: target.pace, unit: "min/km" },
      speedTarget: { value: target.kmh, unit: "km/h" },
    },
    recovery: {
      type: recoveryType,
      durationSec: recoverySec,
      zone: "Z1",
      zoneShort: rZ.short,
      description:
        recoveryType === "static"
          ? "Arrêt complet entre les efforts."
          : "Trottinée très lente.",
    },
    description: `${reps} × ${workSec}s rapide / ${recoverySec}s ${recoveryType === "static" ? "arrêt" : "récup"} (allure ${target.pace}/km · ${target.kmh} km/h).`,
    tips: "Sur les efforts courts, concentre-toi sur la qualité de foulée plus que le chrono.",
  };
}

// Bloc côtes (hills) — défini par nb répétitions et durée d'effort
function buildHillsBlock(paces, { reps, workSec, recoverySec, context = "vma_short" }) {
  const target = paces.getTargetPace(context);
  return {
    type: "intervals",
    label: "Côtes",
    repetitions: reps,
    work: {
      durationSec: workSec,
      zone: context === "threshold" ? "Z4" : "Z5a",
      zoneShort: "Côte",
      speedTarget: { value: target.kmh, unit: "km/h (sur plat équivalent)" },
      description: `Montée à allure ${target.pace}/km équivalent plat.`,
    },
    recovery: {
      type: "walk_down",
      durationSec: recoverySec,
      description: "Redescente en marchant ou trottinant très lent.",
    },
    description: `${reps} × ${workSec}s de montée en côte (pente ~5-8 %), redescente en récup ${recoverySec}s.`,
    tips: "Cherche une côte d'environ 80-150 m. Relance la foulée, bras actifs, buste droit.",
  };
}

// Footing avec lignes droites (éducatifs en fin) — marqueur de "fraîcheur"
function buildStridesBlock() {
  return {
    type: "drills",
    label: "Lignes droites",
    durationMin: 6,
    optional: false,
    description:
      "6 × 80-100 m accélérations progressives sur plat, récup complète en marchant.",
  };
}

// Bloc à allure spécifique course (marathon, semi, 10k) — à insérer
// dans une sortie ou en bloc seul
function buildSpecificPaceBlock(paces, { durationMin, distanceKm, context }) {
  const target = paces.getTargetPace(context);
  const paceLabelByCtx = {
    marathon_pace: "allure marathon",
    semi_pace: "allure semi",
    "10k_pace": "allure 10k",
  };
  const paceLabel = paceLabelByCtx[context] ?? context;
  const zoneKey =
    context === "marathon_pace" ? "Z3" : "Z4"; // semi/10k tombent Z4
  const z = paces.zones[zoneKey];
  const hasDuration = durationMin != null;
  return {
    type: "tempo",
    label: `Bloc ${paceLabel}`,
    repetitions: 1,
    work: {
      durationMin: hasDuration ? durationMin : undefined,
      distanceKm: hasDuration ? undefined : distanceKm,
      zone: zoneKey,
      zoneShort: z.short,
      paceTarget: { value: target.pace, unit: "min/km" },
      speedTarget: { value: target.kmh, unit: "km/h" },
    },
    recovery: null,
    description: hasDuration
      ? `${durationMin} min à ${target.pace}/km (${paceLabel}).`
      : `${distanceKm} km à ${target.pace}/km (${paceLabel}).`,
    tips: "Garde l'allure cible la plus régulière possible. C'est ton allure du jour J.",
  };
}

// Footing progressif (accélération contrôlée sur la durée)
function buildProgressiveRunBlock(paces, { minutes }) {
  const start = paces.getTargetPace("long_run_base");     // 68 %
  const end = paces.getTargetPace("long_run_marathon");   // 72 %
  const z = paces.zones.Z2;
  return {
    type: "easy",
    label: "Footing progressif",
    durationMin: minutes,
    zone: "Z2",
    zoneShort: z.short,
    paceTarget: {
      value: `${start.pace} → ${end.pace}`,
      unit: "min/km",
    },
    speedTarget: { value: `${start.kmh} → ${end.kmh}`, unit: "km/h" },
    description: `Démarre tranquille à ${start.pace}/km, finis un peu plus soutenu à ${end.pace}/km. Progression linéaire.`,
  };
}

// Bloc cross-training (vélo, natation, rameur, renfo)
function buildCrossBlock({ activity, durationMin, intensity = "easy" }) {
  const labels = {
    bike: "Vélo",
    swim: "Natation",
    row: "Rameur",
    strength: "Renforcement",
    home_trainer: "Home trainer",
    walk: "Marche active",
  };
  return {
    type: "cross",
    label: labels[activity] ?? "Cross-training",
    durationMin,
    description:
      intensity === "easy"
        ? `${durationMin} min à intensité modérée, on reste confortable.`
        : `${durationMin} min soutenu, tu dois être essoufflé·e en fin.`,
  };
}

// Fartlek libre (variations d'allure non structurées)
function buildFartlekBlock(paces, { minutes }) {
  const easy = paces.getTargetPace("standard_easy");
  const hard = paces.getTargetPace("threshold");
  return {
    type: "tempo",
    label: "Fartlek libre",
    durationMin: minutes,
    description: `Sur ${minutes} min, alterne 1-3 min d'effort soutenu (~${hard.pace}/km) et 1-2 min de retour au calme (~${easy.pace}/km). Joue avec le terrain.`,
    tips: "Amuse-toi. Pas de chrono, écoute ton corps.",
  };
}

// Footing simple (easy / long)
function buildRunBlock(paces, { minutes, context, label = "Footing" }) {
  const target = paces.getTargetPace(context);
  const zoneKey =
    context === "recovery"
      ? "Z1"
      : context === "long_run_marathon"
      ? "Z2"
      : "Z2";
  const z = paces.zones[zoneKey];
  return {
    type: context === "recovery" ? "recovery" : "easy",
    label,
    durationMin: minutes,
    zone: zoneKey,
    zoneShort: z.short,
    paceTarget: {
      value: target.pace,
      unit: "min/km",
      range: { min: z.paceMin, max: z.paceMax },
    },
    speedTarget: { value: target.kmh, unit: "km/h" },
    description:
      context === "recovery"
        ? "Très lent, tu dois pouvoir tenir une conversation complète."
        : `Allure easy autour de ${target.pace}/km, confortable.`,
  };
}

// ---------------------------------------------------------------------
// Génération d'une séance depuis un template
// ---------------------------------------------------------------------

export function generateSessionFromTemplate({
  template,
  profile,
  paces,
  context = {},
}) {
  // Clone pour ne pas muter le template
  const t = template;

  // Résout les paramètres (fourchettes → valeurs)
  const resolvedParams = resolveTemplateParams(t.params || {}, profile, context, t);

  // Construit les blocs dans l'ordre
  const blocks = [];
  for (const spec of t.blockSpecs) {
    const block = buildBlockFromSpec(spec, paces, resolvedParams);
    if (block) blocks.push(block);
  }

  // Durée totale = somme des blocs (on ignore les récups intervalles,
  // elles sont déjà incluses dans le forfait conventionnel)
  const totalDurationMin = Math.round(
    blocks.reduce((acc, b) => {
      if (b.durationMin) return acc + b.durationMin;
      if (b.repetitions && b.work?.durationMin) {
        const rec = b.recovery?.durationMin ?? 0;
        return acc + b.repetitions * b.work.durationMin + (b.repetitions - 1) * rec;
      }
      // Intervalles par temps (ex: côtes, 30-30) — durée en secondes
      if (b.repetitions && b.work?.durationSec) {
        const workSec = b.repetitions * b.work.durationSec;
        const recSec = (b.repetitions - 1) * (b.recovery?.durationSec ?? 0);
        // Pour les côtes, la récup (descente en marchant) prend aussi du temps
        // et elle doit être comptée APRÈS chaque rep, pas seulement entre
        const recAllSec = b.type === "intervals" && b.label === "Côtes"
          ? b.repetitions * (b.recovery?.durationSec ?? 0)
          : recSec;
        return acc + (workSec + recAllSec) / 60;
      }
      if (b.repetitions && b.work?.distance) {
        // Estimation durée intervalle = distance × allure
        const target = paces.getTargetPace(
          b.zoneShort === "VMA+" ? "vma_long" : "vma_short"
        );
        const perRepMin = (b.work.distance / 1000) * (target.paceSec / 60);
        const recMin = (b.recovery?.durationSec ?? 0) / 60;
        return acc + b.repetitions * (perRepMin + recMin) - recMin;
      }
      // Séquence (pyramide, etc.) : somme des steps × nb de séries + récup inter-séries
      if (b.sequence) {
        const steps = b.sequence;
        const series = b.repetitions || 1;
        let oneSeriesSec = 0;
        steps.forEach((s, i) => {
          oneSeriesSec += s.workSec ?? 0;
          if (i < steps.length - 1) oneSeriesSec += s.recoverySec ?? 0;
        });
        const totalSec =
          oneSeriesSec * series +
          (series - 1) * (b.betweenSeriesRecoveryMin ?? 0) * 60;
        return acc + totalSec / 60;
      }
      return acc;
    }, 0)
  );

  // Séance complète
  /** @type {Session} */
  const session = {
    id: makeId(t.id, context),
    week: context.week ?? null,
    day: context.day ?? null,
    date: context.date ?? null,
    type: t.type,
    family: t.family,
    templateId: t.id,
    phase: context.phase ?? null,
    intent: t.intent,
    totalDurationMin,
    totalDistanceKm: null, // on calcule plus tard si utile
    estimatedLoad: LOAD_BY_TYPE[t.type] ?? 40,
    difficulty: DIFFICULTY_BY_TYPE[t.type] ?? "moderate",
    blocks,
    tips: t.tips ?? { before: null, during: null, after: null },
    indoorAlternative: null, // post-traitement ultérieur
    status: "planned",
    completion: null,
  };

  return session;
}

function makeId(templateId, { week, day } = {}) {
  const parts = [];
  if (week != null) parts.push(`w${week}`);
  if (day) parts.push(day);
  parts.push(templateId);
  return parts.join("_");
}

// Calcule la marge (warmup + cooldown) d'un template depuis ses blocSpecs.
// Permet d'adapter le cap de durée au type de séance.
function staticMarginFromBlockSpecs(blockSpecs) {
  let m = 0;
  for (const spec of blockSpecs) {
    if (spec.kind === "warmup") m += spec.minutes ?? 15;
    else if (spec.kind === "cooldown") m += spec.minutes ?? 10;
    else if (spec.kind === "drills") m += 5;
  }
  return m;
}

// Résout { reps: { min: 6, max: 10 } } → { reps: 8 } selon niveau + progression.
function resolveTemplateParams(paramSpecs, profile, context, template) {
  const out = {};
  for (const [key, spec] of Object.entries(paramSpecs)) {
    if (spec && typeof spec === "object" && "min" in spec && "max" in spec) {
      out[key] = pickByLevel(spec, profile, context);
    } else {
      out[key] = spec; // valeur fixe
    }
  }
  // Plafond de durée : si le contexte fournit un maxDurationMin,
  // on écrête les paramètres de durée pour ne pas dépasser la dispo
  // déclarée par l'utilisateur. La marge dépend des blocSpecs fixes
  // du template (warmup + cooldown). Si le template est mono-bloc,
  // marge = 0 et on cap sur toute la durée.
  if (context?.maxDurationMin && template?.blockSpecs) {
    const margin = staticMarginFromBlockSpecs(template.blockSpecs);
    const maxBody = Math.max(10, context.maxDurationMin - margin);
    // Paramètres "durée corps" à plafonner s'ils existent
    for (const key of ["durationMin", "paceBlockMin", "easyWarmupMin", "easyCooldownMin"]) {
      if (out[key] != null) out[key] = Math.min(out[key], maxBody);
    }
  }

  // Plancher de durée : si le contexte fournit un minDurationMin (ex:
  // séance vélo placée sur un jour de vélotaff où l'user fait déjà X min),
  // on garantit que la durée totale ≥ minDurationMin. On ajuste durationMin
  // du corps principal en conséquence.
  if (context?.minDurationMin && template?.blockSpecs) {
    const margin = staticMarginFromBlockSpecs(template.blockSpecs);
    const minBody = Math.max(10, context.minDurationMin - margin);
    if (out.durationMin != null && out.durationMin < minBody) {
      out.durationMin = minBody;
    }
  }
  // Le template peut lire des éléments de contexte
  out.__context = context;
  return out;
}

// Dispatcher : transforme un "blockSpec" de template en bloc concret
function buildBlockFromSpec(spec, paces, params) {
  switch (spec.kind) {
    case "warmup":
      return buildWarmup(paces, {
        minutes: spec.minutes ?? 15,
        zone: spec.zone ?? "Z2",
      });
    case "cooldown":
      return buildCooldown(paces, { minutes: spec.minutes ?? 10 });
    case "drills":
      return buildDrills();
    case "intervals_distance":
      return buildIntervalsByDistance(paces, {
        reps: params[spec.repsParam] ?? spec.reps,
        distanceM: spec.distanceM,
        context: spec.paceContext,
        recoverySec: spec.recoverySec,
      });
    case "tempo":
      return buildTempoBlock(paces, {
        reps: params[spec.repsParam] ?? spec.reps ?? 1,
        durationMin: params[spec.durationParam] ?? spec.durationMin,
        context: spec.paceContext,
        recoveryMin: spec.recoveryMin ?? 3,
      });
    case "run":
      return buildRunBlock(paces, {
        minutes: params[spec.durationParam] ?? spec.minutes,
        context: spec.paceContext,
        label: spec.label,
      });
    case "intervals_time":
      return buildIntervalsByTime(paces, {
        reps: params[spec.repsParam] ?? spec.reps,
        workSec: spec.workSec,
        recoverySec: spec.recoverySec,
        context: spec.paceContext,
        recoveryType: spec.recoveryType ?? "jog",
      });
    case "intervals_sequence":
      return buildIntervalsSequence(paces, {
        steps: spec.steps,
        defaultContext: spec.paceContext ?? "vma_short",
        series: params[spec.seriesParam] ?? spec.series ?? 1,
        betweenSeriesRecoveryMin: spec.betweenSeriesRecoveryMin ?? 3,
      });
    case "hills":
      return buildHillsBlock(paces, {
        reps: params[spec.repsParam] ?? spec.reps,
        workSec: spec.workSec,
        recoverySec: spec.recoverySec,
        context: spec.paceContext ?? "vma_short",
      });
    case "strides":
      return buildStridesBlock();
    case "specific_pace":
      return buildSpecificPaceBlock(paces, {
        durationMin: params[spec.durationParam] ?? spec.durationMin,
        distanceKm: params[spec.distanceParam] ?? spec.distanceKm,
        context: spec.paceContext,
      });
    case "progressive":
      return buildProgressiveRunBlock(paces, {
        minutes: params[spec.durationParam] ?? spec.minutes,
      });
    case "cross":
      return buildCrossBlock({
        activity: spec.activity,
        durationMin: params[spec.durationParam] ?? spec.durationMin,
        intensity: spec.intensity ?? "easy",
      });
    case "fartlek":
      return buildFartlekBlock(paces, {
        minutes: params[spec.durationParam] ?? spec.minutes,
      });
    default:
      console.warn(`[session] kind inconnu : ${spec.kind}`);
      return null;
  }
}
