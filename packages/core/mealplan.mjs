// ============================================================================
// IRONMAP · core · meal-assembly engine   (NEW, Research brief 3)
// Closes the nutrition loop: macro target → an actual day of meals assembled
// from data/foods.json, honouring each diet mode's tag rules. Deterministic
// constrained assembly (the "knapsack" the brief describes, greedy solver).
// The LLM narrates and swaps; it never invents the grams.
// ============================================================================

import { foods, dietModeById, config } from "./data.mjs";
import { macrosToKcal } from "./nutrition.mjs";

const ATWATER = config.atwater_factors;

// Filter the food pool by a mode's inclusion/exclusion tag rules.
function allowedFoods(mode) {
  const r = mode.rules || {};
  const exclude = new Set(r.exclude_tags || []);
  return foods.filter((f) => {
    if ((f.tags || []).some((t) => exclude.has(t))) return false;
    if (r.whitelist === "whole_food" && !(f.tags || []).includes("whole_food") && (f.nova_class ?? f.nova ?? 1) > 2) return false;
    return true;
  });
}

const macroOf = (f, grams) => ({
  protein: (f.protein_100g * grams) / 100,
  carbs: (f.carbs_100g * grams) / 100,
  fat: (f.fat_100g * grams) / 100,
  kcal: (f.kcal_100g * grams) / 100,
});

// 3×3 linear solve (Cramer's rule) — exact grams for three foods to hit a
// remaining {protein, carbs, fat} vector.
function det3(m) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}
function solve3(A, b) {
  const d = det3(A);
  if (Math.abs(d) < 1e-9) return [0, 0, 0]; // singular → caller keeps zeros
  const col = (j) => A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)));
  return [det3(col(0)) / d, det3(col(1)) / d, det3(col(2)) / d];
}

// Pick the best food for a role from the allowed pool (deterministic).
function pick(pool, kind, prioritize = []) {
  const boost = (f) => ((f.tags || []).some((t) => prioritize.includes(t)) ? 1000 : 0);
  const score = {
    protein: (f) => f.protein_100g - f.fat_100g * 0.3 + boost(f),
    carb: (f) => f.carbs_100g - f.fat_100g * 0.5 + boost(f),
    fat: (f) => f.fat_100g + boost(f),
    veg: (f) => ((f.tags || []).includes("leafy_green") ? 100 : 0) + (f.fiber_100g || 0),
  }[kind];
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Assemble a day hitting {protein_g, carbs_g, fat_g, kcal} for a diet mode.
 * Solves grams for a protein source, then a carb source for the remaining
 * carbs, then a fat source for the remaining fat, plus a vegetable for fibre;
 * splits the result across `mealsPerDay` slots.
 * @returns { totals, deviationPct, within5pct, items[], meals[] }
 */
export function mealPlanDay(target, modeId, { mealsPerDay = 4 } = {}) {
  const mode = dietModeById[modeId];
  if (!mode) throw new Error(`mealPlanDay: unknown diet mode "${modeId}"`);
  const pool = allowedFoods(mode);
  const prioritize = mode.rules?.prioritize_tags || [];

  const proteinFood = pick(pool, "protein", prioritize);
  const carbFood = pick(pool.filter((f) => f !== proteinFood), "carb", prioritize);
  const fatFood = pick(pool.filter((f) => f !== proteinFood && f !== carbFood), "fat", prioritize);
  const veg = pick(pool, "veg");

  // Fixed vegetable serving for fibre/volume, then solve the three macro foods
  // EXACTLY for the remaining macros (3×3 linear system).
  const gV = 150;
  const vM = macroOf(veg, gV);
  const per = (f) => [f.protein_100g / 100, f.carbs_100g / 100, f.fat_100g / 100];
  const [pP, pC, pF] = per(proteinFood);
  const [cP, cC, cF] = per(carbFood);
  const [fP, fC, fF] = per(fatFood);
  const A = [[pP, cP, fP], [pC, cC, fC], [pF, cF, fF]];
  const rhs = [
    Math.max(0, target.protein_g - vM.protein),
    Math.max(0, target.carbs_g - vM.carbs),
    Math.max(0, target.fat_g - vM.fat),
  ];
  let [gP, gC, gF] = solve3(A, rhs);
  gP = Math.max(0, gP); gC = Math.max(0, gC); gF = Math.max(0, gF);

  const items = [
    { food: proteinFood.name, name_ar: proteinFood.name_ar, grams: Math.round(gP), role: "protein" },
    { food: carbFood.name, name_ar: carbFood.name_ar, grams: Math.round(gC), role: "carb" },
    { food: fatFood.name, name_ar: fatFood.name_ar, grams: Math.round(gF), role: "fat" },
    { food: veg.name, name_ar: veg.name_ar, grams: gV, role: "veg" },
  ].filter((it) => it.grams > 0);

  // Totals.
  const foodByName = { [proteinFood.name]: proteinFood, [carbFood.name]: carbFood, [fatFood.name]: fatFood, [veg.name]: veg };
  const totals = items.reduce((acc, it) => {
    const m = macroOf(foodByName[it.food], it.grams);
    acc.protein_g += m.protein; acc.carbs_g += m.carbs; acc.fat_g += m.fat;
    return acc;
  }, { protein_g: 0, carbs_g: 0, fat_g: 0 });
  totals.protein_g = Math.round(totals.protein_g);
  totals.carbs_g = Math.round(totals.carbs_g);
  totals.fat_g = Math.round(totals.fat_g);
  totals.kcal = Math.round(macrosToKcal(totals));

  const deviationPct = Math.abs(totals.kcal - target.kcal) / target.kcal;

  // Split items across meal slots (round-robin by role for variety).
  const slots = ["breakfast", "lunch", "snack", "dinner", "suhoor", "iftar"].slice(0, mealsPerDay);
  const meals = slots.map((slot, i) => ({
    slot,
    items: items.filter((_, idx) => idx % mealsPerDay === i),
  })).filter((m) => m.items.length);

  return {
    mode: modeId,
    target,
    items,
    meals,
    totals,
    deviationPct: Math.round(deviationPct * 1000) / 1000,
    within5pct: deviationPct <= 0.05,
    prioritized: prioritize,
  };
}
