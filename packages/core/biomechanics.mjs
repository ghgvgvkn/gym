// ============================================================================
// IRONMAP · core · biomechanics engine   (Research brief 2)
// Maps a recognised machine / chosen exercise to its resistance vector and
// muscle recruitment, over the full catalog in data/. Turns "CV saw a lat
// pulldown" into "trains lats, axial vertical pull — distinct from the seated
// row's mid-back, posteroanterior."
// ============================================================================

import { exerciseBySlug, exercises, muscleById, forceVectors, machineBySlug } from "./data.mjs";

const vectorById = Object.fromEntries(forceVectors.map((v) => [v.id, v]));

/** Ranked muscle recruitment for an exercise (prime movers first). */
export function musclesFor(slug) {
  const ex = exerciseBySlug[slug];
  if (!ex) throw new Error(`musclesFor: unknown exercise "${slug}"`);
  return [...ex.activation]
    .sort((a, b) => b.w - a.w)
    .map((a) => ({ ...a, label: muscleById[a.m]?.label ?? a.m }));
}

/** Plain-language "how this machine works" — vector + prime targets. */
export function explainMechanics(slug) {
  const ex = exerciseBySlug[slug];
  if (!ex) throw new Error(`explainMechanics: unknown exercise "${slug}"`);
  const v = vectorById[ex.vector];
  return {
    exercise: ex.name,
    vector: ex.vector,
    vectorLabel: v?.label ?? null,
    plane: v?.plane ?? null,
    pattern: ex.pattern,
    primeMovers: ex.activation.filter((a) => a.role === "prime").map((a) => a.m),
    machine: ex.machine ? machineBySlug[ex.machine]?.name : "bodyweight/free",
  };
}

/**
 * Weekly effective hard-set volume per muscle from [{ exercise, sets }].
 * A set counts toward a muscle by its activation weight; stabilizer roles are
 * excluded from hypertrophy volume. Returns { muscleId: effectiveSets }.
 */
export function weeklyVolume(prescriptions) {
  const vol = {};
  for (const { exercise, sets } of prescriptions) {
    const ex = exerciseBySlug[exercise];
    if (!ex) continue;
    for (const a of ex.activation) {
      if (a.role === "stabilizer") continue;
      vol[a.m] = (vol[a.m] || 0) + sets * a.w;
    }
  }
  for (const k of Object.keys(vol)) vol[k] = Math.round(vol[k] * 10) / 10;
  return vol;
}

/** Which exercises does a set of available machine slugs unlock? */
export function exercisesForMachines(machineSlugs) {
  const set = new Set(machineSlugs);
  return exercises.filter((e) => e.machine === null || set.has(e.machine));
}

/** Filter out exercises contraindicated by a user's injuries. */
export function safeFor(injuries = []) {
  const bad = new Set(injuries);
  return exercises.filter((e) => !(e.contra || []).some((c) => bad.has(c)));
}
