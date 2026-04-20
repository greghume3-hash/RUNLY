// Périodisation macro : structure base → développement → spécifique → affûtage.
//
// À partir d'un profil + allures + deadline (optionnelle), produit un Plan
// complet avec N semaines générées via generateWeek().
//
// Règles validées avec l'utilisateur (voir memory/algo_training_plan.md) :
// - Progression volume scalée par niveau + plafond absolu +8 km/sem
// - Semaine allègement (-25 %) toutes les 3-4 semaines
// - Taper adapté à la distance (5-7j sur 10k, 3-4 sem sur ultra)
// - ACWR ratio 7j/28j comme garde-fou (override vers allègement si > 1.5)
// - Phases base/dev/spé/taper, ratios selon distance

import { generateWeek } from "./week.js";

const MS_PER_WEEK = 7 * 24 * 3600 * 1000;

// ---------------------------------------------------------------------
// Table de répartition des phases (% du plan total)
// ---------------------------------------------------------------------
// Choisi selon la catégorie + distance. Les totaux font 100 %.
function phaseRatiosFor(profile) {
  const obj = profile.objectiveCategory;
  const dist = profile.objectiveDistanceKm ?? 0;

  // Pas de deadline : plan "ouvert" type maintenance / développement
  if (profile.noDeadline) {
    return { base: 0.30, development: 0.40, specific: 0.20, taper: 0.10 };
  }

  // Général (se (re)mettre, perte de poids, maintien) : pas de taper dur
  if (obj === "general") {
    return { base: 0.35, development: 0.45, specific: 0.15, taper: 0.05 };
  }

  // Course route
  if (obj === "road") {
    if (dist <= 10) return { base: 0.25, development: 0.40, specific: 0.25, taper: 0.10 };
    if (dist <= 21.1) return { base: 0.25, development: 0.35, specific: 0.25, taper: 0.15 };
    return { base: 0.30, development: 0.30, specific: 0.25, taper: 0.15 }; // marathon
  }

  // Trail
  if (obj === "trail") {
    if (dist <= 60) return { base: 0.30, development: 0.35, specific: 0.20, taper: 0.15 };
    return { base: 0.35, development: 0.30, specific: 0.15, taper: 0.20 }; // ultra
  }

  return { base: 0.30, development: 0.40, specific: 0.20, taper: 0.10 };
}

// ---------------------------------------------------------------------
// Nombre minimal de semaines de taper selon distance
// ---------------------------------------------------------------------
function minTaperWeeks(profile) {
  const obj = profile.objectiveCategory;
  const dist = profile.objectiveDistanceKm ?? 0;
  if (obj !== "road" && obj !== "trail") return 1;
  if (dist <= 10) return 1;       // 5-7 jours
  if (dist <= 21.1) return 2;     // 10-14 jours
  if (dist <= 42.2) return 3;     // 2-3 semaines
  return 3;                       // ultra 3-4 semaines
}

// ---------------------------------------------------------------------
// Semaines disponibles selon deadline
// ---------------------------------------------------------------------
function computeWeeksCount(profile, startDate = new Date()) {
  if (profile.noDeadline) return 12;
  if (!profile.deadline) return 12;
  const end = new Date(profile.deadline);
  if (Number.isNaN(end.getTime())) return 12;
  const diffMs = end.getTime() - startDate.getTime();
  const weeks = Math.floor(diffMs / MS_PER_WEEK);
  return Math.max(4, Math.min(24, weeks));
}

// ---------------------------------------------------------------------
// Attribution phases → semaines (distribution entière)
// ---------------------------------------------------------------------
function distributePhases(weeksCount, profile) {
  // Plan très court (< 4 sem) : on saute base + dev, uniquement spé + taper
  if (weeksCount < 4) {
    return [
      { name: "specific", weeks: Math.max(1, weeksCount - 1) },
      { name: "taper", weeks: 1 },
    ];
  }

  const ratios = phaseRatiosFor(profile);
  const minTaper = minTaperWeeks(profile);

  // Répartition naïve par ratio, arrondie vers le bas
  let base = Math.max(1, Math.floor(weeksCount * ratios.base));
  let dev = Math.max(1, Math.floor(weeksCount * ratios.development));
  let spe = Math.max(1, Math.floor(weeksCount * ratios.specific));
  let taper = Math.max(minTaper, Math.floor(weeksCount * ratios.taper));

  // Ajuste pour que la somme = weeksCount, en piochant sur dev en priorité
  let total = base + dev + spe + taper;
  const delta = weeksCount - total;
  if (delta > 0) dev += delta; // reste → phase de développement
  else if (delta < 0) {
    // Plan trop court → on rogne d'abord sur base, puis dev, puis spé
    let toRemove = -delta;
    for (const key of ["base", "development", "specific"]) {
      const val = { base, development: dev, specific: spe }[key];
      const removable = Math.max(0, val - 1);
      const cut = Math.min(removable, toRemove);
      if (key === "base") base -= cut;
      if (key === "development") dev -= cut;
      if (key === "specific") spe -= cut;
      toRemove -= cut;
      if (toRemove === 0) break;
    }
    // Si toujours trop, on rogne sur le taper en dernier recours
    if (toRemove > 0) taper = Math.max(1, taper - toRemove);
  }

  return [
    { name: "base", weeks: base },
    { name: "development", weeks: dev },
    { name: "specific", weeks: spe },
    { name: "taper", weeks: taper },
  ];
}

// ---------------------------------------------------------------------
// Plan de volume hebdomadaire
// ---------------------------------------------------------------------
function computeVolumeProgression(weeksCount, profile, phases) {
  // Volume de départ : profil.weeklyVolumeKm, ou estimation depuis
  // sessionsPerWeek × durée moyenne × vitesse EF.
  let startVolume = profile.weeklyVolumeKm;
  if (!startVolume) {
    const sessions = profile.sessionsPerWeek ?? 3;
    const avgMin = 45;
    // Vitesse EF approx : 10 km/h pour débutant, 11 pour intermédiaire
    const speed = (profile.experience === "2y+" ? 11 : 10);
    startVolume = Math.round((sessions * avgMin * speed) / 60);
  }

  // Taux de progression selon le niveau
  const isBeginner =
    profile.experience === "none" ||
    profile.experience === "lt6m" ||
    startVolume < 30;
  const isAdvanced = profile.experience === "2y+" && startVolume >= 40;
  const progressionRate = isBeginner ? 0.10 : isAdvanced ? 0.04 : 0.06;

  // Plafond absolu : +8 km max par semaine
  const MAX_ABS_INCREASE = 8;

  // Indices de semaines par phase
  const phaseOfWeek = [];
  let cursor = 0;
  for (const p of phases) {
    for (let i = 0; i < p.weeks; i++) phaseOfWeek.push(p.name);
    cursor += p.weeks;
  }

  const volumes = [];
  let current = startVolume;
  for (let w = 0; w < weeksCount; w++) {
    const phase = phaseOfWeek[w];
    const isFirstWeek = w === 0;

    // Semaine d'allègement toutes les 3-4 semaines (en base/dev/spé)
    const weekOfPhase = phases
      .slice(0, phases.findIndex((p) => p.name === phase) + 1)
      .reduce((acc, p, idx, arr) => {
        if (idx === arr.length - 1) {
          const phaseStart = acc;
          return w - phaseStart + 1;
        }
        return acc + p.weeks;
      }, 0);
    const isDeload =
      phase !== "taper" && weekOfPhase > 0 && weekOfPhase % 4 === 0;

    // Taper : -25 %, -35 %, -50 % selon proximité
    if (phase === "taper") {
      const taperPhase = phases.find((p) => p.name === "taper");
      const taperStart = weeksCount - taperPhase.weeks;
      const wInTaper = w - taperStart; // 0 = première sem du taper
      const taperCoeffs = [0.75, 0.65, 0.50, 0.40]; // S1, S2, S3, S4 de taper
      current = startVolume * taperCoeffs[wInTaper] || startVolume * 0.5;
      // Taper reference = volume max atteint (pas startVolume)
      const peakSoFar = Math.max(startVolume, ...volumes.map((v) => v.km));
      current = Math.round(peakSoFar * (taperCoeffs[wInTaper] ?? 0.5));
    } else if (isFirstWeek) {
      current = Math.round(startVolume);
    } else if (isDeload) {
      current = Math.round(volumes[w - 1].km * 0.75);
    } else if (volumes[w - 1].isDeload) {
      // Semaine post-allègement : on ne repart PAS du volume pré-allègement
      // (+33 % d'un coup), on reprend doucement à volume pré-allègement × 0.95
      // pour éviter un spike ACWR artificiel.
      const preDeload = volumes[w - 2]?.km ?? volumes[w - 1].km;
      current = Math.round(preDeload * 0.95);
    } else {
      const inc = Math.min(
        volumes[w - 1].km * progressionRate,
        MAX_ABS_INCREASE
      );
      current = Math.round(volumes[w - 1].km + inc);
    }

    volumes.push({
      week: w + 1,
      phase,
      km: current,
      isDeload,
    });
  }

  return { volumes, progressionRate, startVolume };
}

// ---------------------------------------------------------------------
// ACWR simplifié : ratio charge 7j / charge moyenne 28j
// ---------------------------------------------------------------------
// La formule ACWR classique (0.8 green / 1.3 yellow / 1.5 red) a été
// calibrée sur des athlètes à gros volume. Sur petits volumes la variance
// intrinsèque est élevée — une oscillation normale de ±25 % sort déjà des
// seuils, ce qui produit des faux positifs (ex : une remise au sport qui
// pique à 1.25 après un allègement de routine).
//
// Pour corriger : seuils adaptatifs selon la charge chronique.
//   - chronic < 100 (très petit volume) : yellow 1.6, red 1.9
//   - chronic < 150 (petit volume)      : yellow 1.45, red 1.7
//   - chronic ≥ 150                     : seuils classiques 1.3 / 1.5
//
// On expose aussi un flag `lowVolume` pour que l'UI puisse indiquer que
// l'ACWR est peu pertinent sur ces semaines.
function computeAcwr(weeks) {
  return weeks.map((w, i) => {
    const acuteLoad = w.stats?.combinedLoad ?? 0;
    const start = Math.max(0, i - 3);
    const window = weeks.slice(start, i + 1);
    const chronicAvg =
      window.reduce((acc, x) => acc + (x.stats?.combinedLoad ?? 0), 0) /
      window.length;
    const ratio = chronicAvg > 0 ? acuteLoad / chronicAvg : 1;

    let yellowThreshold = 1.3;
    let redThreshold = 1.5;
    if (chronicAvg < 100) {
      yellowThreshold = 1.6;
      redThreshold = 1.9;
    } else if (chronicAvg < 150) {
      yellowThreshold = 1.45;
      redThreshold = 1.7;
    }

    let zone = "green";
    if (ratio > redThreshold) zone = "red";
    else if (ratio > yellowThreshold) zone = "yellow";

    return {
      week: w.weekNumber,
      ratio: Math.round(ratio * 100) / 100,
      zone,
      chronicLoad: Math.round(chronicAvg),
      lowVolume: chronicAvg < 150,
    };
  });
}

// ---------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------

/**
 * Génère le plan complet (étape 4).
 *
 * @param {object} opts
 * @param {object} opts.profile
 * @param {object} opts.paces    — résultat de getPaces()
 * @param {Date}   [opts.startDate=new Date()]
 * @returns {Plan}
 */
export function generatePlan({ profile, paces, startDate = new Date() }) {
  const weeksCount = computeWeeksCount(profile, startDate);
  const phases = distributePhases(weeksCount, profile);
  const { volumes, progressionRate, startVolume } = computeVolumeProgression(
    weeksCount,
    profile,
    phases
  );

  // Génération des N semaines en chainant l'historique (pour la rotation)
  const weeks = [];
  let history = {};
  for (let w = 0; w < weeksCount; w++) {
    const v = volumes[w];
    const week = generateWeek({
      profile,
      paces,
      weekNumber: w + 1,
      phase: v.phase,
      history,
    });
    // Ajoute les métadonnées de périodisation à la semaine
    week.targetVolumeKm = v.km;
    week.isDeload = v.isDeload;
    weeks.push(week);
    history = week.history;
  }

  // ACWR
  const acwrHistory = computeAcwr(weeks);

  // Date de fin
  const endDate = new Date(startDate.getTime() + weeksCount * MS_PER_WEEK);

  return {
    startDate,
    endDate,
    weeksCount,
    objective: {
      type: profile.objectiveType,
      category: profile.objectiveCategory,
      distanceKm: profile.objectiveDistanceKm,
      deadline: profile.deadline,
      noDeadline: !!profile.noDeadline,
    },
    phases,
    weeks,
    acwrHistory,
    volumePlan: {
      startVolume,
      progressionRate,
      targets: volumes,
    },
  };
}
