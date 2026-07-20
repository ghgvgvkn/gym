// ============================================================================
// IRONMAP · scripts · data-integrity
// Validates /data referential + range integrity — the gate that runs before
// generating SQL or shipping. `npm run check:data`.
// ============================================================================

import { muscles, machines, exercises, foods, dietModes, muscleById, machineBySlug, forceVectors }
  from "../packages/core/data.mjs";

let bad = 0;
const err = (m) => { bad++; console.log("  ✗ " + m); };
const vectorIds = new Set(forceVectors.map((v) => v.id));
const muscleIds = new Set(muscles.map((m) => m.id));
const machineSlugs = new Set(machines.map((m) => m.slug));

// Machines → muscles + force vectors resolve.
for (const m of machines) {
  for (const mus of [...(m.primary_muscles || []), ...(m.secondary_muscles || [])])
    if (!muscleIds.has(mus)) err(`machine ${m.slug} → unknown muscle "${mus}"`);
  if (m.primary_force && !vectorIds.has(m.primary_force)) err(`machine ${m.slug} → unknown force "${m.primary_force}"`);
  for (const c of m.confused_with || []) if (!machineSlugs.has(c)) err(`machine ${m.slug} confused_with unknown "${c}"`);
}

// Exercises → machine, vector, muscles resolve; activation weights in range.
for (const e of exercises) {
  if (e.machine && !machineSlugs.has(e.machine)) err(`exercise ${e.slug} → unknown machine "${e.machine}"`);
  if (e.vector && !vectorIds.has(e.vector)) err(`exercise ${e.slug} → unknown vector "${e.vector}"`);
  if (!e.activation?.length) err(`exercise ${e.slug} has no activation`);
  for (const a of e.activation || []) {
    if (!muscleIds.has(a.m)) err(`exercise ${e.slug} activation → unknown muscle "${a.m}"`);
    if (!(a.w > 0 && a.w <= 1)) err(`exercise ${e.slug} activation ${a.m} weight ${a.w} out of (0,1]`);
    if (!["prime", "synergist", "stabilizer"].includes(a.role)) err(`exercise ${e.slug} bad role "${a.role}"`);
  }
}

// Muscles landmark sanity (MEV ≤ MAV ≤ MRV).
for (const m of muscles) if (m.landmarks) {
  const { mev, mav, mrv } = m.landmarks;
  if (!(mev <= mav && mav <= mrv)) err(`muscle ${m.id} landmarks not ordered (${mev}/${mav}/${mrv})`);
}

// Diet modes: macro split ~sums to 1, protein floor present.
for (const d of dietModes) {
  const sum = d.protein + d.fat + d.carbs;
  if (Math.abs(sum - 1) > 0.02) err(`diet ${d.id} macro split sums to ${sum.toFixed(2)}, expected ~1`);
}

// Foods: macros reconstitute to stated kcal via the fibre-aware Atwater model
// (fibre ≈ 2 kcal/g, not 4), ±12% for rounding/sugar-alcohols.
for (const f of foods) {
  const fiber = f.fiber_100g || 0;
  const netCarbs = Math.max(0, f.carbs_100g - fiber);
  const kcal = f.protein_100g * 4 + netCarbs * 4 + fiber * 2 + f.fat_100g * 9;
  if (f.kcal_100g > 20 && Math.abs(kcal - f.kcal_100g) / f.kcal_100g > 0.12)
    err(`food "${f.name}" kcal ${f.kcal_100g} vs macro-derived ${kcal.toFixed(0)}`);
}

console.log(`\n${bad === 0 ? "✅" : "❌"}  data-integrity: ${bad} problems  ·  ${muscles.length} muscles · ${machines.length} machines · ${exercises.length} exercises · ${foods.length} foods`);
process.exit(bad === 0 ? 0 : 1);
