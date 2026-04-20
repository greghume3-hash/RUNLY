// Générateur de semaine type (étape 3 de l'algo).
//
// À partir du profil, des allures et d'une "recette" de semaine
// (nombre de séances + leurs types), pose les séances sur les bons
// jours en respectant :
//   - sortie longue sur longRunDay (ou dernier jour weekend dispo)
//   - jamais 2 séances dures consécutives
//   - jamais de qualité un jour de vélotaff (easy max)
//   - respect de availableDays et maxSessionWeekday/Weekend
//
// La rotation de templates (quel VMA, quel seuil) sera greffée
// à l'étape suivante via selectTemplate(). Ici on prend le 1er
// template disponible de chaque famille pour valider la structure.

import { generateSessionFromTemplate } from "./session.js";
import { getTemplatesByFamily, getTemplateById } from "./templates/index.js";
import {
  selectTemplate,
  pushTemplateToHistory,
  maybeFreshSlot,
} from "./select.js";

const DAYS_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKEND = new Set(["sat", "sun"]);

// --- Recettes par nb de séances -------------------------------------
// Chaque entrée = liste de "slots", classés par priorité de placement.
// kind : "long" | "quality" | "easy" | "recovery" | "cross"
// weight : charge relative (pour répartition 80/20)
const RECIPES = {
  2: [
    { kind: "long",    family: "long" },
    { kind: "easy",    family: "easy" },
  ],
  3: [
    { kind: "long",    family: "long" },
    { kind: "quality", family: "quality" },
    { kind: "easy",    family: "easy" },
  ],
  4: [
    { kind: "long",    family: "long" },
    { kind: "quality", family: "quality" },
    { kind: "easy",    family: "easy" },
    { kind: "easy",    family: "easy" },
  ],
  5: [
    { kind: "long",    family: "long" },
    { kind: "quality", family: "quality" },
    { kind: "quality", family: "quality" },
    { kind: "easy",    family: "easy" },
    { kind: "easy",    family: "easy" },
  ],
  6: [
    { kind: "long",    family: "long" },
    { kind: "quality", family: "quality" },
    { kind: "quality", family: "quality" },
    { kind: "easy",    family: "easy" },
    { kind: "easy",    family: "easy" },
    { kind: "recovery", family: "recovery" },
  ],
};

// --- Choix de famille "quality" selon phase + objectif --------------
function pickQualityFamily(slotIndex, { phase, objectiveCategory }) {
  // Traileurs : remplacer la VMA piste par des côtes (spécificité trail),
  // garder le seuil pour le travail aérobie soutenu.
  if (objectiveCategory === "trail") {
    if (phase === "taper") return "threshold";
    return slotIndex === 0 ? "hills" : "threshold";
  }
  // Phase spécifique (route) → inclure des allures course
  if (phase === "specific") return slotIndex === 0 ? "threshold" : "specific_pace";
  // Phase taper → très peu de qualité, seulement seuil court
  if (phase === "taper") return "threshold";
  // Base / développement / null (V1) : alternance VMA / seuil
  return slotIndex === 0 ? "vma_long" : "threshold";
}

// --- Ordre de priorité des familles "easy" --------------------------
function pickEasyFamily(slotIndex) {
  // 1er footing : standard, 2e : strides (lignes droites), 3e : progressif
  const rotation = ["easy", "easy", "easy"];
  return rotation[slotIndex % rotation.length];
}

// ---------------------------------------------------------------------
// Niveau 2 — Décide si on injecte une séance vélo dans la semaine
// ---------------------------------------------------------------------
// Règles :
//  - Uniquement si l'utilisateur a le matos (home trainer, vélo d'appart
//    OU est vélotaffeur : il a un vélo).
//  - Phase base/developpement : vélo endurance possible (remplace 1 easy)
//  - Phase base : vélo récup post-SL possible (jour J+1 du long run)
//  - Phase spécifique : pas de vélo structuré (spécificité course prime),
//    sauf vélo récup très léger post-SL
//  - Phase taper : rien (repos ou course uniquement)
//  - Si vélotaff lourd tous les jours : pas de vélo en plus (déjà saturé)
//  - Plafond cross ≤ 40 % de la charge totale hebdo (cap Niveau 3)
function shouldInjectBikeSession({ profile, phase, commuteClass }) {
  // Matos nécessaire
  const eq = profile.equipment ?? [];
  const hasBike =
    eq.includes("home_trainer") ||
    eq.includes("indoor_bike") ||
    (profile.commuteDays ?? []).length > 0;
  if (!hasBike) return null;

  // Pas de vélo structuré en taper
  if (phase === "taper") return null;

  // Si vélotaff lourd tous les jours, déjà saturé
  if (
    commuteClass.level === "heavy" &&
    (profile.commuteDays?.length ?? 0) >= 4
  ) {
    return null;
  }

  // Phase base / null : bike_endurance en complément d'un easy
  if (phase === "base" || phase == null) {
    return {
      action: "replace_easy", // remplace un slot easy par un bike
      family: "bike",
      templateId: "bike-endurance",
    };
  }

  // Phase développement : vélo récup le lendemain de la SL (J+1)
  if (phase === "development") {
    return {
      action: "add_after_long", // ajoute le lendemain de la SL
      family: "bike",
      templateId: "bike-recovery",
    };
  }

  // Phase spécifique : pas d'injection (prime à la course)
  return null;
}

// --- Multiplicateur de charge selon l'intensité perçue du vélotaff ---
// chill  : e-bike, trajet cool → coefficient 0.7
// normal : vélo musculaire sans se presser → 1.0 (défaut)
// sporty : vite, sac lourd, relief → 1.4
const INTENSITY_MULT = { chill: 0.7, normal: 1.0, sporty: 1.4 };

function intensityMultiplier(profile) {
  return INTENSITY_MULT[profile.commuteIntensity] ?? 1.0;
}

// --- Réduction en phase d'affûtage ---
// En taper, on préserve les jambes : l'impact du vélotaff est divisé par 2
// (même trajet, on demande juste à l'utilisateur de lever un peu le pied).
function taperReduction(phase) {
  return phase === "taper" ? 0.5 : 1.0;
}

// --- Charge de vélotaff estimée (en points de "load" équivalents) ---
// Calcule une charge d'équivalence course pour un trajet vélotaff A/R.
// Règle empirique : 1 km vélo facile ≈ 0.3 km course en charge,
// + pénalité dénivelé (chaque 100m D+ ≈ 1 km course équivalent).
// Pondéré par l'intensité et la phase.
export function estimateCommuteLoad(profile, phase = null) {
  const km = profile.commuteDistanceKm;
  if (!km) return 0;
  const elev = profile.commuteElevationM ?? km * 10;
  const equivalentRunKm = 2 * (km * 0.3 + elev / 100);
  const mult = intensityMultiplier(profile) * taperReduction(phase);
  return Math.round(equivalentRunKm * 3 * mult);
}

// --- Intensité de la charge vélotaff quotidienne (A/R inclus) ---
// On classe le vélotaff du jour sur une échelle "light / moderate / heavy".
// light     : charge négligeable, aucune adaptation
// moderate  : footing à raccourcir (~50-70% de la durée normale)
// heavy     : remplace la course par un repos actif (vélotaff = séance)
// Le multiplicateur d'intensité peut faire basculer d'un niveau à l'autre
// (ex: trajet 5 km sporty → moderate au lieu de light).
export function classifyDailyCommute(profile, phase = null) {
  const km = profile.commuteDistanceKm;
  if (!km) return { level: "none", equivKm: 0, mult: 1 };
  const elev = profile.commuteElevationM ?? km * 10;
  const baseEquivKm = 2 * (km * 0.3 + elev / 100);
  const mult = intensityMultiplier(profile) * taperReduction(phase);
  const equivKm = baseEquivKm * mult;
  let level;
  if (equivKm < 6) level = "light";
  else if (equivKm < 14) level = "moderate";
  else level = "heavy";
  return {
    level,
    equivKm: Math.round(equivKm * 10) / 10,
    mult: Math.round(mult * 100) / 100,
    intensity: profile.commuteIntensity ?? "normal",
  };
}

// --- Plafonne la durée d'une séance au maxSession du jour -----------
// On ne modifie pas le template mais on ajuste via le contexte
// (les templates "en durée" ont un param `durationMin` qu'on peut forcer).
function capDurationForDay(day, profile, familyKind) {
  const weekend = WEEKEND.has(day);
  const cap = weekend
    ? profile.maxSessionWeekend ?? 180
    : profile.maxSessionWeekday ?? 75;
  return cap;
}

// --- Placement d'une séance sur un jour -----------------------------

// Jour cible de la sortie longue, en respectant les préférences du profil.
function resolveLongRunDay(profile) {
  const available = profile.availableDays ?? [];
  if (profile.longRunDay && profile.longRunDay !== "any") {
    return available.includes(profile.longRunDay) ? profile.longRunDay : null;
  }
  // "any" ou non renseigné : préférer dimanche > samedi > dernier jour dispo
  if (available.includes("sun")) return "sun";
  if (available.includes("sat")) return "sat";
  return available[available.length - 1] ?? null;
}

// Calcule la distance (en nb de jours) entre 2 jours de la semaine, cyclique.
// Utile pour respecter la règle hard/easy (jamais 2 jours d'affilée).
function dayDistance(a, b) {
  const ai = DAYS_ORDER.indexOf(a);
  const bi = DAYS_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return Infinity;
  const d = Math.abs(ai - bi);
  return Math.min(d, 7 - d);
}

// Choisit le meilleur jour pour une séance "quality" : maximiser la
// distance avec les jours déjà occupés par des séances dures ET les
// jours de vélotaff modéré/lourd (anti-cumul fatigue — Niveau 3).
function pickBestQualityDay(candidates, hardDays, moderateLoadDays = []) {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const day of candidates) {
    const minDistToHard = hardDays.length
      ? Math.min(...hardDays.map((h) => dayDistance(day, h)))
      : Infinity;
    // Anti-cumul : distance aux jours de vélotaff qui chargent les jambes
    // (moderate ou heavy). On pénalise fortement l'adjacence (distance = 1).
    const minDistToModerate = moderateLoadDays.length
      ? Math.min(...moderateLoadDays.map((h) => dayDistance(day, h)))
      : Infinity;
    const cumulPenalty = minDistToModerate === 1 ? -2 : 0;
    // Bonus léger pour les jours milieu de semaine (mar/mer/jeu)
    const midWeekBonus = ["tue", "wed", "thu"].includes(day) ? 0.2 : 0;
    const score = minDistToHard + midWeekBonus + cumulPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = day;
    }
  }
  return best;
}

// selectTemplate est désormais importé depuis ./select.js (rotation).
// Cet helper reste en place comme fallback simple si besoin.
function pickFirstTemplate(family) {
  const pool = getTemplatesByFamily(family);
  return pool[0] ?? null;
}

// --- Détermine le paramètre de durée max selon le jour --------------
function maxDurationForDay(day, profile) {
  if (WEEKEND.has(day)) return profile.maxSessionWeekend ?? 180;
  return profile.maxSessionWeekday ?? 75;
}

// ---------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------

/**
 * Génère une semaine d'entraînement.
 *
 * @param {object}  opts
 * @param {object}  opts.profile        profil utilisateur
 * @param {object}  opts.paces          sortie de getPaces()
 * @param {number}  [opts.weekNumber=1]
 * @param {string}  [opts.phase]        base | development | specific | taper
 * @returns {{week: number, phase: string|null, days: Record<string, object>}}
 */
export function generateWeek({
  profile,
  paces,
  weekNumber = 1,
  phase = null,
  history = {},
}) {
  // On clone pour ne pas muter l'historique entrant
  let nextHistory = { ...history };

  // Marque walkRunMode sur le profil pour le sélecteur
  if (paces?.walkRunMode) profile = { ...profile, __walkRunMode: true };
  const sessionsPerWeek = profile.sessionsPerWeek ?? 3;
  const available = profile.availableDays ?? [];
  const commute = new Set(profile.commuteDays ?? []);
  const recipe = RECIPES[sessionsPerWeek] ?? RECIPES[3];

  // --- Classification automatique de la charge vélotaff ---
  // L'algo décide seul selon :
  //   - distance + dénivelé du trajet
  //   - intensité déclarée (chill/normal/sporty)
  //   - phase du plan (taper réduit l'impact)
  //
  //   - light    : pas d'impact, footing normal
  //   - moderate : footing raccourci (60 %)
  //   - heavy    : pas de course, repos actif
  const commuteClass = classifyDailyCommute(profile, phase);
  // Jours de vélotaff "heavy" : exclus du placement course
  const heavyCommuteDays = new Set(
    commuteClass.level === "heavy" ? [...commute] : []
  );
  // Jours exclus pour une séance qualité (light / moderate / heavy)
  const noQualityDays = commute;
  // Jours dispo pour la course (heavy exclus)
  const runAvailable = available.filter((d) => !heavyCommuteDays.has(d));

  // Garde-fou : si le profil a moins de jours dispo que de séances,
  // on réduit la recette (ne devrait pas arriver grâce à la validation UI).
  const effectiveRecipe = recipe.slice(0, Math.min(recipe.length, runAvailable.length));

  // 1) Sortie longue
  const longRunDay = resolveLongRunDay(profile);
  const placements = {}; // day → { kind, family, template, session? }

  if (longRunDay) {
    placements[longRunDay] = { kind: "long", family: "long" };
  }

  // 2) Séances "quality"
  const qualitySlots = effectiveRecipe.filter((s) => s.kind === "quality");
  for (let i = 0; i < qualitySlots.length; i++) {
    const candidates = runAvailable.filter(
      (d) =>
        !placements[d] && // jour libre
        !noQualityDays.has(d) // pas un jour de vélotaff (peu importe la charge)
    );
    if (candidates.length === 0) {
      // Fallback : on autorise un jour de vélotaff, on downgrade en easy plus bas
      const fallback = runAvailable.find((d) => !placements[d]);
      if (fallback) {
        placements[fallback] = {
          kind: "easy",
          family: "easy",
          _downgradedFromQuality: true,
        };
      }
      continue;
    }
    const hardDays = Object.entries(placements)
      .filter(([, p]) => p.kind === "quality" || p.kind === "long")
      .map(([d]) => d);
    // Anti-cumul (Niveau 3) : jours de vélotaff modéré/lourd = jambes
    // sollicitées. On préfère placer la qualité le plus loin possible.
    const moderateLoadDays =
      commuteClass.level === "moderate" || commuteClass.level === "heavy"
        ? [...commute]
        : [];
    const day = pickBestQualityDay(candidates, hardDays, moderateLoadDays);
    placements[day] = {
      kind: "quality",
      family: pickQualityFamily(i, { phase, objectiveCategory: profile.objectiveCategory }),
    };
  }

  // 3) Séances "easy" + "recovery"
  const easySlots = effectiveRecipe.filter((s) => s.kind === "easy");
  const recoverySlots = effectiveRecipe.filter((s) => s.kind === "recovery");

  let easyIdx = 0;
  for (const slot of [...easySlots, ...recoverySlots]) {
    const day = runAvailable.find((d) => !placements[d]);
    if (!day) break;
    placements[day] = {
      kind: slot.kind,
      family: slot.kind === "recovery" ? "recovery" : pickEasyFamily(easyIdx),
    };
    if (slot.kind === "easy") easyIdx++;
  }

  // Niveau 3 : calcul du cap "cross ≤ 40 % de la charge totale"
  // On estime la charge course déjà placée + charge vélotaff estimée.
  // Si le ratio cross est déjà au-dessus de 40 %, on n'injecte PAS de vélo
  // structuré en plus (la spécificité course doit primer).
  const commuteLoadTotal = estimateCommuteLoad(profile, phase) * commute.size;
  // Estimation rapide charge course placée (forfait par kind)
  const runLoadEstimate = Object.values(placements).reduce((acc, p) => {
    if (p.kind === "long") return acc + 80;
    if (p.kind === "quality") return acc + 85;
    if (p.kind === "easy") return acc + 30;
    if (p.kind === "recovery") return acc + 15;
    return acc;
  }, 0);
  const totalIfInjected = runLoadEstimate + commuteLoadTotal + 30; // +30 = bike endurance estimate
  const crossRatio = (commuteLoadTotal + 30) / Math.max(1, totalIfInjected);
  const crossCapExceeded = crossRatio > 0.40;

  // Niveau 2 : injection d'une séance vélo structurée si pertinent
  const bikeInject = crossCapExceeded
    ? null
    : shouldInjectBikeSession({ profile, phase, commuteClass });
  if (bikeInject) {
    if (bikeInject.action === "replace_easy") {
      // Remplace le dernier easy placé (= le moins "pivot") par le vélo
      const easyPlacements = Object.entries(placements).filter(
        ([, p]) => p.kind === "easy"
      );
      if (easyPlacements.length > 0) {
        const [dayToReplace] = easyPlacements[easyPlacements.length - 1];
        placements[dayToReplace] = {
          kind: "cross",
          family: bikeInject.family,
          _forcedTemplateId: bikeInject.templateId,
        };
      }
    } else if (bikeInject.action === "add_after_long" && longRunDay) {
      // Ajoute le lendemain de la SL si libre
      const idx = DAYS_ORDER.indexOf(longRunDay);
      const nextDay = DAYS_ORDER[(idx + 1) % 7];
      if (
        available.includes(nextDay) &&
        !placements[nextDay] &&
        !heavyCommuteDays.has(nextDay)
      ) {
        placements[nextDay] = {
          kind: "cross",
          family: bikeInject.family,
          _forcedTemplateId: bikeInject.templateId,
        };
      }
    }
  }

  // 4) Génération des séances à partir des placements
  // On passe par selectTemplate() pour bénéficier de la rotation
  // anti-répétition (cf. ./select.js).
  const days = {};
  let easySlotIndex = 0;
  for (const d of DAYS_ORDER) {
    if (!placements[d]) {
      const isCommute = commute.has(d);
      days[d] = {
        type: "rest",
        commute: isCommute,
        // Si le vélotaff est "heavy", on indique que c'est LA séance du jour
        commuteIsSession: isCommute && commuteClass.level === "heavy",
        commuteClass: isCommute ? commuteClass : null,
      };
      continue;
    }
    const p = placements[d];

    // Résolution famille effective (avec éventuel "freshness" sur easy)
    let effectiveFamily = p.family;
    let forcedTemplateId = null;
    if (p.kind === "easy") {
      const freshId = maybeFreshSlot({
        profile,
        weekNumber,
        slotIndex: easySlotIndex,
        history: nextHistory,
      });
      if (freshId) {
        // Le template "fresh" (strides/fartlek) peut appartenir à easy
        // ou à une autre famille — on force directement son id.
        forcedTemplateId = freshId;
      }
      easySlotIndex++;
    }

    // Sélection du template :
    //   - slot "fresh" → template easy alternatif forcé
    //   - slot "bike injecté" (Niveau 2) → _forcedTemplateId
    //   - sinon rotation normale
    let template;
    if (forcedTemplateId) {
      template = getTemplateById(forcedTemplateId);
    } else if (p._forcedTemplateId) {
      template = getTemplateById(p._forcedTemplateId);
    } else {
      template = selectTemplate(
        effectiveFamily,
        profile,
        { phase, slotKind: p.kind, week: weekNumber, day: d },
        nextHistory
      );
    }
    if (!template) {
      days[d] = { type: "rest", reason: `no_template_${p.family}` };
      continue;
    }

    // Mise à jour de l'historique (pour la semaine suivante)
    nextHistory = pushTemplateToHistory(
      nextHistory,
      template.family,
      template.id
    );

    // Plafonne la durée du template au maxSession du jour via le contexte.
    // Pour un jour de vélotaff "moderate", on raccourcit encore à 60 %.
    let maxMin = capDurationForDay(d, profile, p.kind);
    const isCommuteDay = commute.has(d);
    if (isCommuteDay && commuteClass.level === "moderate") {
      maxMin = Math.round(maxMin * 0.6);
    }
    const session = generateSessionFromTemplate({
      template,
      profile,
      paces,
      context: {
        week: weekNumber,
        day: d,
        phase,
        maxDurationMin: maxMin,
      },
    });
    days[d] = {
      type: "session",
      commute: commute.has(d),
      commuteAdaptation:
        isCommuteDay && commuteClass.level === "moderate"
          ? { level: "moderate", equivKm: commuteClass.equivKm }
          : null,
      downgraded: p._downgradedFromQuality || false,
      session,
    };
  }

  // 5) Totaux semaine + charge vélotaff
  const sessions = Object.values(days).filter((v) => v.type === "session");
  const totalMin = sessions.reduce(
    (acc, d) => acc + (d.session.totalDurationMin || 0),
    0
  );
  const totalLoad = sessions.reduce(
    (acc, d) => acc + (d.session.estimatedLoad || 0),
    0
  );

  // Charge vélotaff : nb de jours × charge unitaire estimée
  const commuteLoadPerDay = estimateCommuteLoad(profile, phase);
  const commuteLoad = commuteLoadPerDay * commute.size;

  return {
    weekNumber,
    phase,
    days,
    history: nextHistory,
    stats: {
      sessionCount: sessions.length,
      totalMin,
      totalLoad,
      combinedLoad: totalLoad + commuteLoad,
      commuteLoad,
      commuteLoadPerDay,
      longRunDay,
      qualityDays: Object.entries(days)
        .filter(([, v]) => v.type === "session" && v.session.family !== "easy" && v.session.family !== "recovery" && v.session.family !== "long")
        .map(([d]) => d),
      commuteDays: [...commute],
      // Niveau 3 : indicateurs de charge croisée
      crossRatio: Math.round((commuteLoad / Math.max(1, totalLoad + commuteLoad)) * 100),
      crossCapExceeded: commuteLoad / Math.max(1, totalLoad + commuteLoad) > 0.40,
      commuteIntensity: profile.commuteIntensity ?? "normal",
    },
  };
}
