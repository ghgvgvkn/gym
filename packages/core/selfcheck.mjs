// ============================================================================
// IRONMAP · core · self-check
// `npm run check` — runs the deterministic engines and asserts they reproduce
// the research's numbers. Exits non-zero on any mismatch.
// ============================================================================

import { counts, muscleById, exerciseBySlug } from "./data.mjs";
import { mifflinStJeor, katchMcArdle, estimateBMR, tdee, calorieTarget, energyPlan } from "./metabolic.mjs";
import { partition, macrosToKcal, withinTolerance } from "./nutrition.mjs";
import { musclesFor, explainMechanics, weeklyVolume, exercisesForMachines, safeFor } from "./biomechanics.mjs";
import { oneRepMax, doubleProgression, rirAdjust, isDeloadWeek, deload } from "./progression.mjs";
import { generatePlan } from "./planner.mjs";
import { mealPlanDay } from "./mealplan.mjs";
import { screenMessage, isContraindicated, validateCalorieFloor } from "./safety.mjs";
import { detectStage, techniqueFor, buildSystemPrompt } from "./coaching.mjs";
import { buildProgram, ENGINE_VERSION } from "./program.mjs";

let passed = 0, failed = 0;
const approx = (a, b, e = 0.5) => Math.abs(a - b) <= e;
const ok = (n, c, d = "") => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.log(`  ✗ ${n}  ${d}`); } };

console.log("\nDATA ─ catalog size (expanded)");
ok(`muscles ≥ 40 (got ${counts.muscles})`, counts.muscles >= 40);
ok(`machines ≥ 55 (got ${counts.machines})`, counts.machines >= 55);
ok(`exercises ≥ 80 (got ${counts.exercises})`, counts.exercises >= 80);
ok("every exercise activation references a real muscle",
  Object.values(exerciseBySlug).every((e) => e.activation.every((a) => muscleById[a.m])));

console.log("\nMETABOLIC ─ BMR / TDEE / goal floor");
ok("Mifflin male 80/180/30 = 1780", approx(mifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, sex: "male" }), 1780));
ok("Katch LBM 68 = 1838.8", approx(katchMcArdle({ lbmKg: 68 }), 1838.8));
ok("body-fat present → Katch selected", estimateBMR({ weightKg: 80, heightCm: 180, age: 30, sex: "male", bodyFatPct: 0.15 }).equation === "katch_mcardle");
ok("TDEE = BMR × 1.55", approx(tdee(1838.8, "moderate"), 2850.14, 0.1));
const clamp = calorieTarget({ tdee: 1600, bmr: 1780, goal: "fat_loss" });
ok("fat-loss never below BMR", clamp.target === 1780 && clamp.floorApplied);

console.log("\nNUTRITION ─ macros");
ok("full_healthy reconstitutes within 5% of 2300", withinTolerance(2300, partition(2300, "full_healthy")));
ok("Atwater exact", macrosToKcal({ protein_g: 100, carbs_g: 100, fat_g: 100 }) === 1700);
const cut = partition(1800, "aggressive_recomp", { lbmKg: 70 });
ok("recomp cut uses LBM protein floor (182g)", cut.proteinSource === "lbm_floor" && approx(cut.protein_g, 182, 1), `${cut.protein_g}/${cut.proteinSource}`);

console.log("\nBIOMECHANICS ─ FGVC distinction over the full catalog");
ok("pulldown → axial, prime = lats", explainMechanics("wide_grip_pulldown").vector === "axial_si" && musclesFor("wide_grip_pulldown")[0].m === "lats");
ok("seated row → posteroanterior, prime = rhomboids", explainMechanics("seated_cable_row").vector === "posteroanterior" && musclesFor("seated_cable_row")[0].m === "rhomboids");
ok("hip thrust prime mover = glute_max", musclesFor("hip_thrust")[0].m === "glute_max");
ok("injury filter removes lumbar-contraindicated deadlift", !safeFor(["lumbar"]).some((e) => e.slug === "conventional_deadlift"));
ok("machine filter unlocks bodyweight + owned machines only", exercisesForMachines(["lat_pulldown"]).some((e) => e.slug === "wide_grip_pulldown") && !exercisesForMachines(["lat_pulldown"]).some((e) => e.slug === "hack_squat_ex"));

console.log("\nPROGRESSION ─ 1RM / double progression / RIR / deload");
ok("Epley 100×5 ≈ 116.7", approx(oneRepMax(100, 5), 116.67, 0.1));
const dp = doubleProgression({ weight: 60, repRange: [8, 12], lastSetsReps: [12, 12, 12], exerciseSlug: "leg_press_ex" });
ok("all-hit-top → add load, reset reps", dp.action === "add_load" && dp.weight > 60 && dp.reps === 8, JSON.stringify(dp));
const dp2 = doubleProgression({ weight: 60, repRange: [8, 12], lastSetsReps: [10, 9, 8], exerciseSlug: "leg_press_ex" });
ok("not all top → add a rep, hold load", dp2.action === "add_reps" && dp2.weight === 60);
ok("RIR 4 → load increases", rirAdjust(50, 4).weight > 50);
ok("RIR 0 → load decreases", rirAdjust(50, 0).weight < 50);
ok("week 5 is a deload, week 3 is not", isDeloadWeek(5) && !isDeloadWeek(3));
ok("deload cuts volume ~half", deload({ sets: 4, weight: 100 }).sets === 2);

console.log("\nPLANNER ─ machine-bound weekly plan");
const plan = generatePlan({ goal: "muscle_gain", daysPerWeek: 4, minutesPerSession: 60, availableMachines: ["lat_pulldown", "seated_row", "leg_press", "chest_press", "shoulder_press", "leg_curl_seated", "pec_deck", "tricep_pushdown_station", "cable_column", "ez_curl_bar", "dumbbell_rack", "hip_abductor"] });
ok("4-day split = upper/lower/upper/lower", JSON.stringify(plan.split) === JSON.stringify(["upper", "lower", "upper", "lower"]));
ok("every planned item is bound to an available machine or bodyweight", plan.days.every((d) => d.items.every((it) => it.machine === null || it.machineName)));
ok("plan produces items on every day", plan.days.every((d) => d.items.length > 0));
ok("volume landmarks computed for major muscles", plan.landmarks.length > 0 && plan.landmarks.every((l) => typeof l.status === "string"));
ok("v2: items ordered compound-first + first compound is a warm-up", plan.days.every((d) => { const w = d.items.filter((i) => i.warmup); return w.length <= 1 && (!w.length || d.items[0].compound); }));
ok("v2: items carry machine-busy alternatives", plan.days.some((d) => d.items.some((it) => it.alternatives.length > 0)));

console.log("\nNUTRITION ─ meal assembly (macros → real foods)");
const meals = mealPlanDay({ protein_g: 150, carbs_g: 200, fat_g: 60, kcal: 1940 }, "mid_healthy", { mealsPerDay: 4 });
ok("assembled day lands within 5% of target kcal", meals.within5pct, `${(meals.deviationPct * 100).toFixed(1)}%`);
ok("assembled day uses real foods with gram amounts", meals.items.length >= 3 && meals.items.every((it) => it.grams > 0));
const keto = mealPlanDay({ protein_g: 120, carbs_g: 40, fat_g: 130, kcal: 1810 }, "therapeutic");
ok("therapeutic mode excludes fried/alcohol foods", keto.items.every((it) => !/falafel/i.test(it.food)));

console.log("\nSAFETY ─ screening + gates");
ok("chest-pain message → pain_redflag severity 3", screenMessage("I have sharp chest pain when I press").kind === "pain_redflag");
ok("purge language → ed_risk", screenMessage("how do I purge after eating").kind === "ed_risk");
ok("benign message → no flag", screenMessage("what's my workout today") === null);
ok("lumbar injury contraindicates conventional deadlift", isContraindicated("conventional_deadlift", ["lumbar"]));
ok("calorie floor validator matches BMR rule", validateCalorieFloor(1500, 1700).ok === false);

console.log("\nCOACHING ─ TTM stage detection + prompt");
ok("'ready to start' → preparation stage", detectStage("I'm ready to start this week").id === "preparation");
ok("'for months' → maintenance stage", detectStage("I've been going for months").id === "maintenance");
ok("preparation uses SFBT technique", techniqueFor("preparation").technique === "SFBT");
ok("system prompt names the model tier", /claude-fable-5/.test(buildSystemPrompt("action")));

console.log("\nPROGRAM ─ end-to-end orchestrator");
const prog = buildProgram(
  { weightKg: 82, heightCm: 178, age: 29, sex: "male", bodyFatPct: 0.18, segmental: { leftArmKg: 3.6, rightArmKg: 3.85 } },
  { goal: "recomp", daysPerWeek: 4, minutesPerSession: 60, dietMode: "mid_healthy",
    availableMachines: ["lat_pulldown", "seated_row", "leg_press", "chest_press", "shoulder_press", "leg_curl_seated", "pec_deck", "tricep_pushdown_station", "cable_column", "ez_curl_bar", "dumbbell_rack", "hip_abductor", "calf_raise_standing"] });
ok("program stamps engine version " + ENGINE_VERSION, prog.engineVersion === ENGINE_VERSION);
ok("program has energy + macros + meals + workout", !!(prog.energy.target && prog.macros.protein_g && prog.meals.items.length && prog.workout.days.length));
ok("program detects the left-arm asymmetry (~6%)", prog.asymmetry && prog.asymmetry.weaker === "left" && prog.asymmetry.gapPct === 6, JSON.stringify(prog.asymmetry));
ok("program produces a human rationale", Array.isArray(prog.rationale) && prog.rationale.length >= 4);

console.log("\nAPI ─ serverless handlers wrap the engines");
const progApi = (await import("../../api/program.mjs")).handler;
const coachApi = (await import("../../api/coach.mjs")).handler;
const recogApi = (await import("../../api/recognize.mjs")).handler;
ok("POST /api/program returns a 200 program", (() => { const r = progApi({ profile: { weightKg: 80, heightCm: 180, age: 30, sex: "male" }, options: { goal: "recomp" } }); return r.status === 200 && r.json.engineVersion === ENGINE_VERSION; })());
ok("POST /api/program 400s on missing profile", progApi({}).status === 400);
ok("POST /api/coach routes to fable-5 + a system prompt", (() => { const r = coachApi({ message: "what's my workout today" }); return r.status === 200 && r.json.model === "claude-fable-5" && /fable-5/.test(r.json.systemPrompt); })());
ok("POST /api/coach red-flags chest pain + escalates", (() => { const r = coachApi({ message: "sharp chest pain when I lift" }); return r.json.escalated === true && r.json.safety; })());
ok("POST /api/recognize returns ranked candidates for review", (() => { const r = recogApi({ gymId: "g1", storagePath: "s3://x.jpg" }); return r.json.status === "needs_review" && r.json.candidates.length >= 1; })());

console.log(`\n${failed === 0 ? "✅" : "❌"}  ${passed} passed, ${failed} failed  ·  v${ENGINE_VERSION} · ${counts.muscles} muscles · ${counts.machines} machines · ${counts.exercises} exercises\n`);
process.exit(failed === 0 ? 0 : 1);
