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

// --- Charge de vélotaff estimée (en points de "load" équivalents) ---
// Calcule une charge d'équivalence course pour un trajet vélotaff A/R.
// Règle empirique : 1 km vélo facile ≈ 0.3 km course en charge,
// + pénalité dénivelé (chaque 100m D+ ≈ 1 km course équivalent).
export function estimateCommuteLoad(profile) {
  const km = profile.commuteDistanceKm;
  if (!km) return 0;
  const elev = profile.commuteElevationM ?? km * 10; // fallback 10 m/km
  const equivalentRunKm = 2 * (km * 0.3 + elev / 100);
  // load ≈ 3 × km équivalent course (en easy)
  return Math.round(equivalentRunKm * 3);
}

// --- Intensité de la charge vélotaff quotidienne (A/R inclus) ---
// On classe le vélotaff du jour sur une échelle "light / moderate / heavy".
// light     : charge négligeable, aucune adaptation
// moderate  : footing à raccourcir (~50-70% de la durée normale)
// heavy     : remplace la course par un repos actif (vélotaff = séance)
export function classifyDailyCommute(profile) {
  const km = profile.commuteDistanceKm;
  if (!km) return { level: "none", equivKm: 0 };
  const elev = profile.commuteElevationM ?? km * 10;
  // Distance équivalente course pour 1 aller-retour
  const equivKm = 2 * (km * 0.3 + elev / 100);
  let level;
  if (equivKm < 6) level = "light";        // < 6 km équiv → pas d'impact
  else if (equivKm < 14) level = "moderate"; // 6-14 → footing raccourci
  else level = "heavy";                     // > 14 → pas de course
  return { level, equivKm: Math.round(equivKm * 10) / 10 };
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
// distance avec les jours déjà occupés par des séances dures.
function pickBestQualityDay(candidates, hardDays) {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const day of candidates) {
    const minDistToHard = hardDays.length
      ? Math.min(...hardDays.map((h) => dayDistance(day, h)))
      : Infinity;
    // Bonus léger pour les jours milieu de semaine (mar/mer/jeu)
    const midWeekBonus = ["tue", "wed", "thu"].includes(day) ? 0.2 : 0;
    const score = minDistToHard + midWeekBonus;
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
  // L'algo décide seul :
  //   - light  : pas d'impact, on met ce qu'on veut
  //   - moderate : pas de qualité + footing raccourci (60 %)
  //   - heavy  : pas de course du tout, repos actif
  const commuteClass = classifyDailyCommute(profile);
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
    const day = pickBestQualityDay(candidates, hardDays);
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

    // Sélection du template : forcé (fresh) ou via le sélecteur
    let template;
    if (forcedTemplateId) {
      template = getTemplateById(forcedTemplateId);
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
  const commuteLoadPerDay = estimateCommuteLoad(profile);
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
    },
  };
}
