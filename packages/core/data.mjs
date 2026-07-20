// ============================================================================
// IRONMAP · core · data loader
// Loads the canonical JSON in /data as the single source of truth. The SQL
// seeds are GENERATED from these same files (scripts/gen-sql.mjs), so the DB
// and the engines can never drift. Read-only at runtime.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const load = (f) => JSON.parse(readFileSync(join(DATA_DIR, f), "utf8"));

export const muscles = load("muscles.json").muscles;
export const machineData = load("machines.json");
export const machines = machineData.machines;
export const equipmentCategories = machineData.categories;
export const exercises = load("exercises.json").exercises;
export const forceVectors = load("force_vectors.json").force_vectors;
export const dietModes = load("diet_modes.json").diet_modes;
export const foods = load("foods.json").foods;
export const coachingStages = load("coaching.json").coaching_stages;
export const config = load("config.json");

// Index helpers.
export const muscleById = Object.fromEntries(muscles.map((m) => [m.id, m]));
export const machineBySlug = Object.fromEntries(machines.map((m) => [m.slug, m]));
export const exerciseBySlug = Object.fromEntries(exercises.map((e) => [e.slug, e]));
export const dietModeById = Object.fromEntries(dietModes.map((d) => [d.id, d]));

export const counts = {
  muscles: muscles.length,
  machines: machines.length,
  exercises: exercises.length,
  foods: foods.length,
  dietModes: dietModes.length,
};
