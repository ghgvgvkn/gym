// ============================================================================
// IRONMAP · core · progression engine   (NEW)
// Load/rep progression: estimated 1RM, double progression, RIR autoregulation,
// and deload timing. Constants from data/config.json (progression). This is the
// "what weight next time?" logic — deterministic, so the coach only narrates it.
// ============================================================================

import { config, exerciseBySlug } from "./data.mjs";

const P = config.progression;

// ---- Estimated 1RM ---------------------------------------------------------
export function oneRepMax(weight, reps, formula = "epley") {
  if (reps <= 1) return weight;
  return formula === "brzycki"
    ? (weight * 36) / (37 - reps)
    : weight * (1 + reps / 30); // Epley
}

/** Load for a target rep count from an estimated 1RM (inverse Epley). */
export function loadForReps(e1rm, reps) {
  return e1rm / (1 + reps / 30);
}

// ---- Load increment by movement class --------------------------------------
export function loadIncrement(exerciseSlug) {
  const ex = exerciseBySlug[exerciseSlug];
  const pattern = ex?.pattern ?? "";
  const lower = /squat|hinge|lunge|press_ex/.test(pattern) || /squat|deadlift|press/.test(exerciseSlug);
  if (/flexion|extension|raise|fly|curl/.test(pattern)) return P.load_increment_pct.upper_isolation;
  return lower ? P.load_increment_pct.lower_compound : P.load_increment_pct.upper_compound;
}

/**
 * Double progression: if every set hit the top of the rep range, add load and
 * reset reps to the bottom; otherwise add a rep. Returns the next prescription.
 */
export function doubleProgression({ weight, repRange, lastSetsReps, exerciseSlug }) {
  const [lo, hi] = repRange;
  const allHitTop = lastSetsReps.every((r) => r >= hi);
  if (allHitTop) {
    const inc = loadIncrement(exerciseSlug);
    return { weight: Math.round(weight * (1 + inc) * 2) / 2, reps: lo, action: "add_load" };
  }
  const minReps = Math.min(...lastSetsReps);
  return { weight, reps: Math.min(hi, minReps + 1), action: "add_reps" };
}

/**
 * RIR autoregulation: nudge load toward the target reps-in-reserve.
 * Too easy (RIR high) → add load; grinding (RIR ~0) → pull load back.
 */
export function rirAdjust(weight, observedRir, targetRir = P.rir_autoregulation.target_rir) {
  if (observedRir >= 4) return { weight: Math.round(weight * 1.05 * 2) / 2, note: "too easy → +5%" };
  if (observedRir <= 0) return { weight: Math.round(weight * 0.925 * 2) / 2, note: "at failure → −7.5%" };
  const drift = (observedRir - targetRir) * 0.02;
  return { weight: Math.round(weight * (1 + drift) * 2) / 2, note: `RIR ${observedRir} vs target ${targetRir}` };
}

/** Is this training week a deload? (default cadence every 5th week.) */
export function isDeloadWeek(weekIndex, cadence = 5) {
  return weekIndex > 0 && weekIndex % cadence === 0;
}

/** Scale a normal prescription down for a deload week. */
export function deload(prescription) {
  return {
    ...prescription,
    sets: Math.max(1, Math.round(prescription.sets * P.deload.volume_pct)),
    weight: prescription.weight ? Math.round(prescription.weight * P.deload.intensity_pct * 2) / 2 : undefined,
    deload: true,
  };
}
