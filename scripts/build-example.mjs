// ============================================================================
// IRONMAP · scripts · build-example
// Runs the program orchestrator on a demo profile and writes a machine-readable
// examples/sample-program.json + a rendered examples/sample-program.html report.
// Proves the whole engine chain end-to-end. `npm run example`.
// ============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildProgram } from "../packages/core/program.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_MACHINES = ["lat_pulldown", "seated_row", "leg_press", "chest_press", "shoulder_press",
  "leg_curl_seated", "pec_deck", "tricep_pushdown_station", "cable_column", "ez_curl_bar",
  "dumbbell_rack", "hip_abductor", "calf_raise_standing", "smith_machine", "cable_crossover"];

const program = buildProgram(
  { weightKg: 82, heightCm: 178, age: 29, sex: "male", bodyFatPct: 0.18, segmental: { leftArmKg: 3.6, rightArmKg: 3.85 } },
  { goal: "recomp", daysPerWeek: 4, minutesPerSession: 60, dietMode: "mid_healthy", availableMachines: DEMO_MACHINES, locale: "en" }
);

mkdirSync(join(ROOT, "examples"), { recursive: true });
writeFileSync(join(ROOT, "examples", "sample-program.json"), JSON.stringify(program, null, 2));

// --- rendered report --------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const { energy, macros, meals, workout, asymmetry, rationale } = program;

const dayHtml = workout.days.map((d) => `
  <div class="card">
    <div class="dh"><b>Day ${d.day} · ${esc(d.focus)}</b><span>${d.estMinutes} min</span></div>
    ${d.items.map((it) => `<div class="row">
      <span class="ord">${it.ord}</span>
      <div class="grow"><b>${esc(it.name)}</b>${it.warmup ? '<span class="tag">warm-up</span>' : ""}
        <div class="sub">${esc(it.machineName)} · ${it.sets}×${it.repRange[0]}–${it.repRange[1]} · rest ${it.restSec}s</div></div>
    </div>`).join("")}
  </div>`).join("");

const mealHtml = meals.items.map((it) => `<div class="row"><div class="grow"><b>${esc(it.food)}</b>
  <div class="sub">${esc(it.role)}</div></div><span class="num">${it.grams} g</span></div>`).join("");

const landHtml = workout.landmarks.filter((l) => l.sets > 0).map((l) => `<div class="lrow">
  <span class="grow">${esc(l.label)}</span><span class="num">${l.sets}</span>
  <span class="badge ${l.status}">${l.status.replace("_", " ")}</span>
  <span class="sub">MEV ${l.mev} · MAV ${l.mav} · MRV ${l.mrv}</span></div>`).join("");

const html = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>IRONMAP — Sample Program</title>
<style>
:root{color-scheme:dark;--bg:#0B0C0E;--surf:#14161A;--line:rgba(235,240,245,.09);--text:#EDF0F2;--muted:#98A1AC;--volt:#D8FF3E;--cyan:#3FD9FF;--mint:#3DDC97;--coral:#FF5F56;--mono:"SF Mono",ui-monospace,Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.55}
.wrap{max-width:900px;margin:0 auto;padding:40px 22px 80px}
h1{font-size:30px;font-weight:850;letter-spacing:-.03em;margin:0 0 4px}h1 i{font-style:normal;color:var(--volt)}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;color:var(--muted);text-transform:uppercase}
h2{font-size:15px;font-family:var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:34px 0 12px;border-top:1px solid var(--line);padding-top:18px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:18px 0}
.kpi{background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:14px}
.kpi .v{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}.kpi .l{font-family:var(--mono);font-size:9px;letter-spacing:.13em;color:var(--muted);text-transform:uppercase;margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:680px){.grid{grid-template-columns:1fr}}
.card{background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
.dh{display:flex;justify-content:space-between;margin-bottom:8px}.dh span{font-family:var(--mono);font-size:11px;color:var(--muted)}
.row{display:flex;align-items:center;gap:12px;padding:7px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.ord{font-family:var(--mono);font-size:10px;color:var(--muted);width:16px}.grow{flex:1}.sub{color:var(--muted);font-size:12px}
.num{font-variant-numeric:tabular-nums;font-family:var(--mono)}
.tag{font-family:var(--mono);font-size:8px;letter-spacing:.1em;color:var(--volt);border:1px solid rgba(216,255,62,.4);border-radius:5px;padding:1px 5px;margin-left:8px}
.lrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:13px}
.badge{font-family:var(--mono);font-size:9px;padding:2px 7px;border-radius:99px}
.badge.in_range{color:var(--mint);border:1px solid rgba(61,220,151,.4)}.badge.under{color:var(--coral);border:1px solid rgba(255,95,86,.4)}.badge.over{color:var(--cyan);border:1px solid rgba(63,217,255,.4)}
.rat{background:var(--surf);border-left:2px solid var(--volt);border-radius:0 10px 10px 0;padding:12px 16px;margin:8px 0;color:var(--text);font-size:14px}
.note{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:24px}
</style>
<div class="wrap">
  <div class="eyebrow">IRONMAP · SAMPLE PROGRAM · ENGINE v${program.engineVersion} · GENERATED</div>
  <h1>IRON<i>MAP</i> — your program</h1>
  <p style="color:var(--muted)">Recomp · 4 days/week · Mid Healthy · demo InBody (82 kg, 18% BF)</p>

  <h2>Energy &amp; macros</h2>
  <div class="kpis">
    <div class="kpi"><div class="v num">${energy.bmr}</div><div class="l">BMR (${esc(energy.equation)})</div></div>
    <div class="kpi"><div class="v num">${energy.tdee}</div><div class="l">TDEE</div></div>
    <div class="kpi"><div class="v num">${energy.target}</div><div class="l">Target kcal</div></div>
    <div class="kpi"><div class="v num" style="color:var(--mint)">${macros.protein_g}g</div><div class="l">Protein</div></div>
    <div class="kpi"><div class="v num" style="color:var(--cyan)">${macros.carbs_g}g</div><div class="l">Carbs</div></div>
    <div class="kpi"><div class="v num" style="color:var(--volt)">${macros.fat_g}g</div><div class="l">Fat</div></div>
  </div>

  <div class="grid">
    <div>
      <h2>Today's meals (${(meals.deviationPct * 100).toFixed(1)}% off target)</h2>
      <div class="card">${mealHtml}</div>
    </div>
    <div>
      <h2>Weekly volume vs landmark</h2>
      <div class="card">${landHtml}</div>
    </div>
  </div>

  <h2>Workout — ${esc(workout.split.join(" / "))}</h2>
  ${dayHtml}

  <h2>Coach rationale</h2>
  ${rationale.map((r) => `<div class="rat">${esc(r)}</div>`).join("")}

  <div class="note">Every number above is deterministic engine output (metabolic · nutrition · mealplan · planner · program). Regenerate: npm run example</div>
</div>`;

writeFileSync(join(ROOT, "examples", "sample-program.html"), html);
console.log(`wrote examples/sample-program.json + .html — ${workout.days.length} days, ${meals.items.length} foods, ${rationale.length} rationale lines`);
