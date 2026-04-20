// Sélection de template avec rotation anti-répétition.
//
// Règles :
// 1. Exclure le template utilisé la semaine précédente dans la même famille.
// 2. Pondérer : jamais utilisé > utilisé il y a longtemps > utilisé récemment.
// 3. "Fraîcheur" : 1 chance sur 8 de swap la famille "easy" standard vers
//    fartlek ou lignes droites (uniquement sur slot easy, pas sur quality).
// 4. Filtrer les templates inadaptés au profil (hills uniquement si trail
//    ou phase base, specific_pace uniquement en phase spécifique).

import { getTemplatesByFamily } from "./templates/index.js";

// Nombre de templates récents à garder en historique par famille
const HISTORY_DEPTH = 4;

// --- Compatibilité template ↔ contexte ------------------------------
function isTemplateCompatible(template, { profile, phase, slotKind }) {
  const obj = profile.objectiveCategory;

  // hills : OK si trail OU phase base (renforcement général)
  if (template.family === "hills" && obj !== "trail" && phase !== "base") {
    return false;
  }

  // specific_pace : uniquement en phase spécifique / taper
  if (
    template.family === "specific_pace" &&
    phase !== "specific" &&
    phase !== "taper"
  ) {
    return false;
  }

  // long-with-marathon-block : uniquement si objectif marathon ou ultra
  if (template.id === "long-with-marathon-block") {
    if (obj !== "road") return false;
    const dist = profile.objectiveDistanceKm ?? 0;
    if (dist < 30) return false;
  }

  // long-trail : uniquement si objectif trail
  if (template.id === "long-trail" && obj !== "trail") {
    return false;
  }

  // walk_run : uniquement si walkRunMode actif (géré en amont)
  if (template.family === "walk_run" && !profile.__walkRunMode) {
    return false;
  }

  return true;
}

// --- Score d'un template compte tenu de l'historique ----------------
function scoreTemplate(template, historyForFamily) {
  // historyForFamily est un tableau des templateId récemment utilisés,
  // du plus récent (index 0) au plus ancien.
  const idx = historyForFamily.indexOf(template.id);
  if (idx === -1) return 100; // jamais utilisé = meilleur score
  // Plus l'usage est récent, plus le score est bas.
  // idx 0 = semaine précédente → -50 (quasi exclu sauf dernier recours)
  // idx 1 = 2 semaines avant → -20
  // idx 2+ = OK mais pas idéal
  const penaltyByIdx = [-50, -20, -5, 0, 0, 0];
  return 100 + (penaltyByIdx[idx] ?? 0);
}

// --- Sélecteur principal --------------------------------------------
/**
 * @param {string} family           famille cible (vma_long, threshold, …)
 * @param {object} profile
 * @param {object} context          { phase, slotKind }
 * @param {object} history          { [family]: [templateId, ...] }
 * @returns {object|null}           template choisi (ou null si pool vide)
 */
export function selectTemplate(family, profile, context, history = {}) {
  // Pool : tous les templates de la famille filtrés par compatibilité
  let pool = getTemplatesByFamily(family).filter((t) =>
    isTemplateCompatible(t, { profile, ...context })
  );

  // Fallback : si la famille est vide après filtrage, on élargit
  if (pool.length === 0) {
    // Fallback cascade selon la famille demandée
    const fallbackByFamily = {
      vma_long: ["vma_short", "threshold"],
      vma_short: ["vma_long", "threshold"],
      hills: ["vma_short", "threshold"],
      specific_pace: ["threshold"],
      threshold: ["tempo"],
      long: ["easy"],
      recovery: ["easy"],
    };
    for (const fb of fallbackByFamily[family] ?? []) {
      pool = getTemplatesByFamily(fb).filter((t) =>
        isTemplateCompatible(t, { profile, ...context })
      );
      if (pool.length > 0) break;
    }
  }
  if (pool.length === 0) return null;

  const histForFamily = history[family] ?? [];

  // Si un seul template compatible : on le prend (rotation impossible)
  if (pool.length === 1) return pool[0];

  // Score chaque template, puis trie
  const scored = pool
    .map((t) => ({ template: t, score: scoreTemplate(t, histForFamily) }))
    .sort((a, b) => b.score - a.score);

  // On prend le meilleur score, avec un peu d'aléa entre équivalents pour
  // éviter de toujours prendre le premier défini dans le fichier.
  const topScore = scored[0].score;
  const topCandidates = scored.filter((s) => s.score === topScore);
  const pick =
    topCandidates[Math.floor(deterministicRandom(profile, context) * topCandidates.length)];
  return pick.template;
}

// Aléa déterministe : même profil + même semaine → même tirage.
// Utilise une empreinte large du profil pour que 2 coureurs différents
// (même prénom ou prénom vide) aient des rotations décorrélées.
function profileFingerprint(profile) {
  return [
    profile.firstName ?? "",
    profile.age ?? "",
    profile.sex ?? "",
    profile.weight ?? "",
    profile.height ?? "",
    profile.vma ?? "",
    profile.paceSecondsPerKm ?? "",
    profile.experience ?? "",
    profile.weeklyVolumeKm ?? "",
    profile.objectiveType ?? "",
    profile.deadline ?? "",
    (profile.availableDays ?? []).join(","),
    profile.locationCity ?? "",
  ].join("|");
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicRandom(profile, context) {
  const seed = `${profileFingerprint(profile)}|${context.week ?? 0}|${context.day ?? ""}|${context.slotKind ?? ""}`;
  return (hashString(seed) % 10000) / 10000;
}

// --- Mise à jour de l'historique ------------------------------------
// Appelé après qu'on a choisi un template pour la semaine courante.
export function pushTemplateToHistory(history, family, templateId) {
  const prev = history[family] ?? [];
  const next = [templateId, ...prev.filter((id) => id !== templateId)].slice(
    0,
    HISTORY_DEPTH
  );
  return { ...history, [family]: next };
}

// --- Fraîcheur : 1 slot easy sur 8 devient "fresh" (fartlek / strides) ---
// Appelé par generateWeek pour décider de swap un slot easy vers un template
// "fraîcheur" hors rotation normale.
export function maybeFreshSlot({ profile, weekNumber, slotIndex, history }) {
  // Les slots "fresh" ne doivent pas tomber trop souvent : règle 1 sur 8.
  // On combine empreinte profil + week + slotIndex pour avoir une cadence
  // déterministe propre à chaque coureur.
  const key = `fresh|${profileFingerprint(profile)}|${weekNumber}|${slotIndex}`;
  const r = hashString(key) % 8;
  if (r !== 0) return null;
  // Choix entre strides et fartlek nature, en évitant le plus récent
  const freshIds = ["easy-strides", "easy-fartlek-nature"];
  const recent = history.easy ?? [];
  const candidate = freshIds.find((id) => id !== recent[0]) ?? freshIds[0];
  return candidate;
}
