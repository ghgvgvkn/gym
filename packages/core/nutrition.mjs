// ============================================================================
// IRONMAP · core · nutrition engine   (Research brief 3)
// 5-mode macro partitioning + LBM protein floor. Reads diet modes + Atwater
// from data/. The LLM chooses foods to hit these grams; it never invents them.
// ============================================================================

import { config, dietModeById } from "./data.mjs";

const ATWATER = config.atwater_factors;

/**
 * Partition kcal into macro grams for a diet mode. When LBM is known and the
 * mode's g/kg protein floor exceeds the % split, the floor wins (protects
 * muscle on a cut) and the remainder re-splits fat/carbs by their ratio.
 */
export function partition(kcal, modeId, { lbmKg } = {}) {
  const mode = dietModeById[modeId];
  if (!mode) throw new Error(`partition: unknown diet mode "${modeId}"`);

  let proteinG = (kcal * mode.protein) / ATWATER.protein;
  let proteinSource = "percent_split";

  if (lbmKg && mode.protein_per_kg_lbm) {
    const floorG = lbmKg * mode.protein_per_kg_lbm;
    if (floorG > proteinG) { proteinG = floorG; proteinSource = "lbm_floor"; }
  }

  const remaining = Math.max(0, kcal - proteinG * ATWATER.protein);
  const denom = mode.fat + mode.carbs;
  const fatG = (remaining * (mode.fat / denom)) / ATWATER.fat;
  const carbsG = (remaining * (mode.carbs / denom)) / ATWATER.carbs;

  return {
    mode: modeId,
    kcal,
    protein_g: Math.round(proteinG),
    carbs_g: Math.round(carbsG),
    fat_g: Math.round(fatG),
    proteinSource,
    rules: mode.rules,
  };
}

export function macrosToKcal({ protein_g, carbs_g, fat_g }) {
  return protein_g * ATWATER.protein + carbs_g * ATWATER.carbs + fat_g * ATWATER.fat;
}

export function withinTolerance(targetKcal, macros, tol = 0.05) {
  return Math.abs(macrosToKcal(macros) - targetKcal) / targetKcal <= tol;
}
