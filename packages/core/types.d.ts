// IRONMAP core — type definitions for editor support (the engines are .mjs).
// These describe the public shapes; the JSON in /data is the runtime source.

export type Sex = "male" | "female";
export type Goal = "fat_loss" | "muscle_gain" | "recomp" | "strength";
export type DietModeId = "full_healthy" | "mid_healthy" | "iifym" | "aggressive_recomp" | "therapeutic";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extreme";
export type MuscleRole = "prime" | "synergist" | "stabilizer";

export interface Segmental { leftArmKg?: number; rightArmKg?: number; leftLegKg?: number; rightLegKg?: number; }

export interface Profile {
  weightKg: number; heightCm?: number; age?: number; sex?: Sex;
  bodyFatPct?: number; lbmKg?: number; segmental?: Segmental;
}

export interface ProgramOptions {
  goal?: Goal; activityLevel?: ActivityLevel; daysPerWeek?: number; minutesPerSession?: number;
  availableMachines?: string[]; injuries?: string[]; dietMode?: DietModeId; mealsPerDay?: number;
  locale?: "en" | "ar"; userNote?: string;
}

export interface EnergyPlan { equation: string; lbmKg?: number; bmr: number; tdee: number; goal: Goal; target: number; floorApplied: boolean; }
export interface Macros { mode: DietModeId; kcal: number; protein_g: number; carbs_g: number; fat_g: number; proteinSource: "percent_split" | "lbm_floor"; }
export interface MealItem { food: string; name_ar?: string; grams: number; role: "protein" | "carb" | "fat" | "veg"; }
export interface MealPlan { mode: DietModeId; items: MealItem[]; totals: Macros; deviationPct: number; within5pct: boolean; }

export interface WorkoutItem {
  exercise: string; name: string; machine: string | null; machineName: string;
  compound: boolean; sets: number; repRange: [number, number]; restSec: number; ord: number;
  warmup?: boolean; primeMovers: string[]; alternatives: { exercise: string; name: string; machine: string | null }[];
}
export interface WorkoutDay { day: number; focus: string; estMinutes: number; items: WorkoutItem[]; }
export interface Landmark { muscle: string; label: string; sets: number; mev: number; mav: number; mrv: number; status: "under" | "in_range" | "over"; }
export interface WorkoutPlan { goal: Goal; split: string[]; daysPerWeek: number; days: WorkoutDay[]; volume: Record<string, number>; landmarks: Landmark[]; }

export interface Program {
  engineVersion: string; goal: Goal; dietMode: DietModeId;
  energy: EnergyPlan; macros: Macros; meals: MealPlan; workout: WorkoutPlan;
  asymmetry: { weaker: "left" | "right"; gapPct: number; recommendation: string } | null;
  coaching: { stage: string; systemPrompt: string };
  rationale: string[];
}

export function buildProgram(profile: Profile, opts?: ProgramOptions): Program;
