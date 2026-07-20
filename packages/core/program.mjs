// ============================================================================
// IRONMAP · core · program orchestrator   (NEW — the system-level entry point)
// One call: profile + gym + goal → a complete, personalised program (energy,
// macros, a day of meals, a machine-bound weekly workout, segmental-asymmetry
// note, and a plain-language rationale). Everything downstream is deterministic
// engine output; the coach only narrates it.
// ============================================================================

import { energyPlan } from "./metabolic.mjs";
import { partition } from "./nutrition.mjs";
import { mealPlanDay } from "./mealplan.mjs";
import { generatePlan } from "./planner.mjs";
import { validateCalorieFloor } from "./safety.mjs";
import { buildSystemPrompt, detectStage } from "./coaching.mjs";
import { dietModeById } from "./data.mjs";

export const ENGINE_VERSION = "0.4.0";

/** Detect a left/right lean-mass asymmetry from InBody segmental data. */
function asymmetry(segmental) {
  if (!segmental?.leftArmKg || !segmental?.rightArmKg) return null;
  const gap = (segmental.rightArmKg - segmental.leftArmKg) / segmental.rightArmKg;
  if (Math.abs(gap) < 0.03) return null;
  const weaker = gap > 0 ? "left" : "right";
  return { weaker, gapPct: Math.round(Math.abs(gap) * 100), recommendation: "add unilateral work to close the gap" };
}

/**
 * @param {object} profile  { weightKg, heightCm, age, sex, bodyFatPct?, lbmKg?, segmental? }
 * @param {object} opts      { goal, activityLevel, daysPerWeek, minutesPerSession,
 *                             availableMachines, injuries, dietMode, mealsPerDay, locale }
 */
export function buildProgram(profile, opts = {}) {
  const {
    goal = "recomp", activityLevel = "moderate", daysPerWeek = 4, minutesPerSession = 60,
    availableMachines, injuries = [], dietMode = "mid_healthy", mealsPerDay = 4, locale = "en",
  } = opts;

  // 1 · Energy (deterministic, never below BMR).
  const energy = energyPlan(profile, { activityLevel, goal });
  const floor = validateCalorieFloor(energy.target, energy.bmr);

  // 2 · Macros for the chosen diet mode (LBM protein floor when known).
  const macros = partition(energy.target, dietMode, { lbmKg: energy.lbmKg });

  // 3 · A day of meals hitting those macros.
  const meals = mealPlanDay({ ...macros, kcal: energy.target }, dietMode, { mealsPerDay });

  // 4 · A machine-bound weekly workout filled toward volume landmarks.
  const workout = generatePlan({ goal, daysPerWeek, minutesPerSession, availableMachines, injuries });

  // 5 · Segmental asymmetry → unilateral recommendation.
  const asym = asymmetry(profile.segmental);

  // 6 · Coaching frame + rationale.
  const stage = detectStage(opts.userNote || "ready to start");
  const under = workout.landmarks.filter((l) => l.status === "under").map((l) => l.label);
  const rationale = [
    `Energy from ${energy.equation === "katch_mcardle" ? "your InBody lean mass (Katch-McArdle)" : "Mifflin-St Jeor"}: BMR ${energy.bmr}, TDEE ${energy.tdee}, target ${energy.target} kcal for ${goal.replace("_", " ")}.`,
    floor.ok ? null : `Target was clamped up to your BMR (${energy.bmr}) — we never diet below it.`,
    `Macros (${dietModeById[dietMode].label}): ${macros.protein_g}g protein / ${macros.carbs_g}g carbs / ${macros.fat_g}g fat${macros.proteinSource === "lbm_floor" ? " — protein set by your lean-mass floor to protect muscle" : ""}.`,
    `Meals land within ${(meals.deviationPct * 100).toFixed(1)}% of target.`,
    `${workout.split.join("/")} split, ${daysPerWeek}×/week.`,
    asym ? `Your ${asym.weaker} arm is ${asym.gapPct}% behind — added unilateral work.` : null,
    under.length ? `Note: ${under.join(", ")} sit below their minimum landmark with your current equipment/time — consider an extra day.` : null,
  ].filter(Boolean);

  return {
    engineVersion: ENGINE_VERSION,
    goal, dietMode,
    energy, macros, meals, workout,
    asymmetry: asym,
    coaching: { stage: stage.id, systemPrompt: buildSystemPrompt(stage.id, { locale }) },
    rationale,
  };
}
