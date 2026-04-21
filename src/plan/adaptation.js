// Adaptation dynamique du plan.
// Analyse les complétions des semaines passées et ajuste la semaine courante
// + la semaine suivante en conséquence.
//
// Règles validées (memory/algo_training_plan.md) :
//   - Séance RATÉE (skipped) → la semaine suivante démarre un cran plus bas
//     (PAS de rattrapage → erreur amateur classique).
//   - Séance PARTIELLE → volume légèrement ajusté, mais pas de downgrade.
//   - 2+ séances ratées dans une semaine → allègement forcé sur la suivante.
//   - Blessure déclarée (profile.hasInjury) → bascule mode récup/cross
//     pendant 7-14 jours, le plan macro est "en pause".
//
// L'adaptation ne touche PAS le plan macro (phases, volume peak, taper).
// Elle module uniquement la semaine en cours et la suivante.

import { getCompletion } from "../store.js";

const DAYS_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Analyse les complétions d'une semaine donnée.
export function analyzeWeekCompletions(week) {
  const sessionDays = DAYS_ORDER.filter(
    (d) => week.days[d]?.type === "session"
  );
  if (sessionDays.length === 0) {
    return { total: 0, done: 0, partial: 0, skipped: 0, unmarked: 0, ratio: 1 };
  }
  let done = 0, partial = 0, skipped = 0, unmarked = 0;
  for (const d of sessionDays) {
    const c = getCompletion(week.weekNumber, d);
    if (!c) unmarked++;
    else if (c.status === "done") done++;
    else if (c.status === "partial") partial++;
    else if (c.status === "skipped") skipped++;
  }
  // Ratio de "succès" : done = 1, partial = 0.5, skipped = 0, unmarked = neutre
  const completed = done + partial * 0.5;
  const evaluated = done + partial + skipped;
  const ratio = evaluated > 0 ? completed / evaluated : 1;
  return {
    total: sessionDays.length,
    done, partial, skipped, unmarked,
    ratio,
  };
}

// Calcule l'ajustement à appliquer à la semaine courante + suivante,
// en fonction des complétions de la semaine PRÉCÉDENTE.
//
// Retourne :
//   - type : "none" | "step_back" | "light_deload" | "injury"
//   - volumeCoef : multiplicateur du volume cible (1.0 = normal)
//   - swapQualityForEasy : si true, les qualités deviennent des easy
//   - reason : message à afficher
export function computeAdjustment({ previousWeek, profile }) {
  // Blessure active → override total
  if (profile?.hasInjury === "yes") {
    return {
      type: "injury",
      volumeCoef: 0.6,
      swapQualityForEasy: true,
      reason:
        "Blessure déclarée — mode récup active. Toutes les qualités sont remplacées par des easy. Repasse ton profil en 'pas de blessure' quand tu es prêt·e à reprendre.",
    };
  }

  if (!previousWeek) return { type: "none", volumeCoef: 1, swapQualityForEasy: false, reason: null };

  const stats = analyzeWeekCompletions(previousWeek);

  // Pas encore assez d'infos pour adapter (aucune séance marquée)
  if (stats.done + stats.partial + stats.skipped === 0) {
    return { type: "none", volumeCoef: 1, swapQualityForEasy: false, reason: null };
  }

  // 2+ séances passées ou ratio < 40 % → gros allègement
  if (stats.skipped >= 2 || stats.ratio < 0.4) {
    return {
      type: "step_back",
      volumeCoef: 0.75,
      swapQualityForEasy: true,
      reason: `Semaine difficile (${stats.skipped} séance${stats.skipped > 1 ? "s" : ""} passée${stats.skipped > 1 ? "s" : ""}) → volume réduit de 25 % et qualités adoucies. Reprise progressive.`,
    };
  }

  // 1 séance passée ou ratio 40-70 % → allègement léger
  if (stats.skipped >= 1 || stats.ratio < 0.7) {
    return {
      type: "light_deload",
      volumeCoef: 0.88,
      swapQualityForEasy: false,
      reason: `Quelques séances manquées la semaine dernière — volume très légèrement réduit (-12 %) pour bien redémarrer.`,
    };
  }

  // Tout ratio bon OU 0.7+ → aucune adaptation
  return { type: "none", volumeCoef: 1, swapQualityForEasy: false, reason: null };
}

// Applique un ajustement à une semaine (mutate).
// Retourne la semaine modifiée + un marqueur `week.adaptation` pour l'UI.
export function applyAdjustmentToWeek(week, adjustment) {
  if (adjustment.type === "none") return week;

  // Réduit le volume cible
  if (week.targetVolumeKm != null) {
    week.targetVolumeKm = Math.round(week.targetVolumeKm * adjustment.volumeCoef);
  }

  // Swap quality → easy si besoin
  if (adjustment.swapQualityForEasy) {
    for (const d of Object.keys(week.days)) {
      const dayData = week.days[d];
      if (dayData.type !== "session") continue;
      const s = dayData.session;
      const isQuality =
        s.family?.startsWith("vma") ||
        s.family === "threshold" ||
        s.family === "hills" ||
        s.family === "specific_pace";
      if (!isQuality) continue;

      // On dégrade en "footing easy" : durée = 60 % de la durée actuelle,
      // template forcé = easy-standard
      dayData.session = {
        ...s,
        family: "easy",
        templateId: "easy-standard-adapted",
        type: "easy",
        difficulty: "easy",
        totalDurationMin: Math.round(s.totalDurationMin * 0.6),
        intent: `Séance adaptée (allégée) : au lieu de la séance de qualité prévue, on garde juste un footing facile pour reprendre en douceur. ${adjustment.reason}`,
        blocks: [
          {
            type: "easy",
            label: "Footing facile",
            durationMin: Math.round(s.totalDurationMin * 0.6),
            description: "Allure facile, écoute ton corps. L'objectif est de revenir à la régularité.",
          },
        ],
        tips: {
          before: null,
          during: "Rien à prouver aujourd'hui. Reconstruis la confiance.",
          after: null,
        },
      };
      dayData.downgraded = true;
      dayData.adaptationReason = adjustment.reason;
    }
  }

  // Ajoute un marqueur sur la semaine pour l'UI
  week.adaptation = adjustment;
  return week;
}
