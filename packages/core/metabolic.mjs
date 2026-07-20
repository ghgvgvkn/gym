// ============================================================================
// IRONMAP · core · metabolic engine   (Research brief 3)
// BMR / TDEE / goal-target math. Constants come from data/config.json so the
// DB, docs, and engine share one source. No LLM produces these numbers.
// ============================================================================

import { config } from "./data.mjs";

export const ACTIVITY_MULTIPLIERS = config.activity_multipliers;
export const ATWATER = config.atwater_factors;
export const ENERGY_PER_KG_FAT = config.goal_deltas.energy_per_kg_fat;

export function leanBodyMass(weightKg, bodyFatPct) {
  return weightKg * (1 - bodyFatPct);
}

// ---- BMR equations (coefficients from config) ------------------------------
export function mifflinStJeor({ weightKg, heightCm, age, sex }) {
  const c = config.metabolic_equations.mifflin_st_jeor.coeffs;
  return c.weight * weightKg + c.height * heightCm + c.age * age + (sex === "female" ? c.const.female : c.const.male);
}

export function harrisBenedict({ weightKg, heightCm, age, sex }) {
  const c = config.metabolic_equations.harris_benedict.coeffs[sex === "female" ? "female" : "male"];
  return c.weight * weightKg + c.height * heightCm + c.age * age + c.const;
}

export function katchMcArdle({ lbmKg }) {
  const c = config.metabolic_equations.katch_mcardle.coeffs;
  return c.const + c.lbm * lbmKg;
}

export function cunningham({ lbmKg }) {
  const c = config.metabolic_equations.cunningham.coeffs;
  return c.const + c.lbm * lbmKg;
}

/** Pick the most accurate equation for the data available (research rule). */
export function estimateBMR(profile) {
  const { weightKg, heightCm, age, sex, bodyFatPct, lbmKg } = profile;
  let lbm = lbmKg;
  if (lbm == null && bodyFatPct != null && bodyFatPct > 0 && bodyFatPct < 0.75) {
    lbm = leanBodyMass(weightKg, bodyFatPct);
  }
  if (lbm != null && lbm > 0 && lbm < weightKg + 0.01) {
    return { bmr: katchMcArdle({ lbmKg: lbm }), equation: "katch_mcardle", lbmKg: lbm };
  }
  if (weightKg && heightCm && age && sex) {
    return { bmr: mifflinStJeor({ weightKg, heightCm, age, sex }), equation: "mifflin_st_jeor" };
  }
  throw new Error("estimateBMR: insufficient data");
}

export function tdee(bmr, activityLevel = "moderate") {
  const m = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!m) throw new Error(`tdee: unknown activity level "${activityLevel}"`);
  return bmr * m;
}

/** Apply goal → daily target. HARD FLOOR: never below BMR. */
export function calorieTarget({ tdee, bmr, goal }) {
  let target = tdee;
  if (goal === "fat_loss") target = tdee - 500;
  else if (goal === "muscle_gain") target = tdee * 1.125;
  let floorApplied = false;
  if (target < bmr) { target = bmr; floorApplied = true; }
  return { target: Math.round(target), floorApplied };
}

export function energyPlan(profile, { activityLevel = "moderate", goal = "recomp" } = {}) {
  const { bmr, equation, lbmKg } = estimateBMR(profile);
  const total = tdee(bmr, activityLevel);
  const { target, floorApplied } = calorieTarget({ tdee: total, bmr, goal });
  return {
    equation,
    lbmKg: lbmKg ? Math.round(lbmKg * 10) / 10 : undefined,
    bmr: Math.round(bmr),
    tdee: Math.round(total),
    goal, target, floorApplied,
  };
}
