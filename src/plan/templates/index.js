// Bibliothèque complète de templates de séance.
// Regroupés par famille pour faciliter la rotation anti-répétition.

import { easyStandardTemplate } from "./easy.js";
import {
  easyProgressiveTemplate,
  easyStridesTemplate,
  recoveryRunTemplate,
  fartlekNatureTemplate,
} from "./easy_extra.js";

import { vma400ClassiqueTemplate } from "./vma_long.js";
import {
  vma1000ClassiqueTemplate,
  vma500_1000Template,
  vmaPyramideDistanceTemplate,
} from "./vma_long_extra.js";

import {
  vma3030ClassiqueTemplate,
  vmaPyramideTemplate,
  hillsCourtsTemplate,
} from "./vma_short.js";

import { thresholdTwoBlocksTemplate } from "./threshold.js";
import {
  thresholdContinuTemplate,
  thresholdFourBlocksTemplate,
} from "./threshold_extra.js";

import {
  specificMarathonTemplate,
  specific10kTemplate,
} from "./specific_pace.js";

import { longRunClassicTemplate } from "./long_run.js";
import {
  longProgressiveTemplate,
  longWithMarathonBlockTemplate,
  longTrailTemplate,
} from "./long_extra.js";

import {
  crossBikeEasyTemplate,
  crossSwimTemplate,
  crossStrengthTemplate,
  crossHomeTrainerTemplate,
} from "./cross.js";

import { walkRun60_120Template } from "./walk_run.js";

export const ALL_TEMPLATES = [
  // easy
  easyStandardTemplate,
  easyProgressiveTemplate,
  easyStridesTemplate,
  recoveryRunTemplate,
  fartlekNatureTemplate,
  // vma_long
  vma400ClassiqueTemplate,
  vma1000ClassiqueTemplate,
  vma500_1000Template,
  vmaPyramideDistanceTemplate,
  // vma_short + hills
  vma3030ClassiqueTemplate,
  vmaPyramideTemplate,
  hillsCourtsTemplate,
  // threshold
  thresholdTwoBlocksTemplate,
  thresholdContinuTemplate,
  thresholdFourBlocksTemplate,
  // specific_pace
  specificMarathonTemplate,
  specific10kTemplate,
  // long
  longRunClassicTemplate,
  longProgressiveTemplate,
  longWithMarathonBlockTemplate,
  longTrailTemplate,
  // cross
  crossBikeEasyTemplate,
  crossSwimTemplate,
  crossStrengthTemplate,
  crossHomeTrainerTemplate,
  // walk-run
  walkRun60_120Template,
];

// Alias pour le sandbox (conservé pour compat)
export const PILOT_TEMPLATES = ALL_TEMPLATES;

export function getTemplateById(id) {
  return ALL_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function getTemplatesByFamily(family) {
  return ALL_TEMPLATES.filter((t) => t.family === family);
}

// Stats de couverture
export const TEMPLATE_FAMILIES = [
  ...new Set(ALL_TEMPLATES.map((t) => t.family)),
];
