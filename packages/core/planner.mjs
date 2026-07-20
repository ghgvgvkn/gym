// ============================================================================
// IRONMAP · core · workout planner  (v2, NEW behaviours)
// Weekly plan from goal + days + minutes + the gym's machines + injuries.
// v2: fills each session toward the muscle-group volume landmarks, orders
// compounds before isolation, tags warm-ups, and precomputes machine-busy
// alternates. Every item is bound to a real machine (or bodyweight).
// Deterministic — the LLM narrates the rationale, it does not pick exercises.
// ============================================================================

import { exercisesForMachines, safeFor, weeklyVolume } from "./biomechanics.mjs";
import { muscles, muscleById, machineBySlug } from "./data.mjs";

const TEMPLATES = {
  full_body: ["quads", "hamstrings", "chest", "back", "delts", "biceps", "triceps", "abs"],
  upper: ["chest", "back", "delts", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes", "calves", "abs"],
  push: ["chest", "delts", "triceps"],
  pull: ["back", "biceps", "traps"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
};

function splitFor(days) {
  if (days <= 2) return Array(Math.max(1, days)).fill("full_body");
  if (days === 3) return ["full_body", "full_body", "full_body"];
  if (days === 4) return ["upper", "lower", "upper", "lower"];
  if (days === 5) return ["push", "pull", "legs", "upper", "lower"];
  return ["push", "pull", "legs", "push", "pull", "legs"];
}

function scheme(goal, isCompound) {
  const table = {
    muscle_gain: { compound: [6, 10], iso: [10, 15] },
    strength: { compound: [3, 6], iso: [6, 10] },
    fat_loss: { compound: [8, 12], iso: [12, 15] },
    recomp: { compound: [8, 12], iso: [10, 15] },
  };
  const t = table[goal] || table.recomp;
  return { repRange: isCompound ? t.compound : t.iso, restSec: isCompound ? 150 : 75 };
}

const groupOf = (mId) => muscleById[mId]?.group;
const primeGroups = (ex) => ex.activation.filter((a) => a.role === "prime").map((a) => groupOf(a.m));
const isCompound = (ex) => ex.activation.filter((a) => a.role !== "stabilizer").length >= 3;
const compoundScore = (ex) => ex.activation.filter((a) => a.role === "prime").length * 2 + ex.activation.length;

export function generatePlan({ goal = "recomp", daysPerWeek = 4, minutesPerSession = 60, availableMachines, injuries = [] }) {
  const available = availableMachines ?? Object.keys(machineBySlug);
  const unlocked = new Set(exercisesForMachines(available).map((e) => e.slug));
  const pool = safeFor(injuries).filter((e) => unlocked.has(e.slug) && e.pattern !== "cardio");

  const split = splitFor(daysPerWeek);
  const maxItems = Math.max(3, Math.min(8, Math.floor(minutesPerSession / 8)));

  // Pass 1: one best exercise per template group (compound-first).
  const days = split.map((template, i) => {
    const groups = TEMPLATES[template];
    const items = [];
    const used = new Set();
    for (const group of groups) {
      if (items.length >= maxItems) break;
      const cands = pool
        .filter((e) => !used.has(e.slug) && primeGroups(e).includes(group))
        .sort((a, b) => compoundScore(b) - compoundScore(a));
      if (cands.length) { used.add(cands[0].slug); items.push(mkItem(cands[0], goal, pool, used)); }
    }
    return { day: i + 1, focus: template, groups, items, used };
  });

  // Pass 2: fill spare capacity toward volume — add accessories for the
  // least-served group still in each day's template.
  let progressed = true;
  while (progressed) {
    progressed = false;
    const vol = weeklyVolume(days.flatMap((d) => d.items.map((it) => ({ exercise: it.exercise, sets: it.sets }))));
    for (const d of days) {
      if (d.items.length >= maxItems) continue;
      // Rank this day's groups by how under-served they are (fewest weekly sets first).
      const ranked = [...d.groups].sort((a, b) => groupVol(vol, a) - groupVol(vol, b));
      for (const group of ranked) {
        const cands = pool
          .filter((e) => !d.used.has(e.slug) && primeGroups(e).includes(group))
          .sort((a, b) => compoundScore(a) - compoundScore(b)); // accessories: isolation-first now
        if (cands.length) { d.used.add(cands[0].slug); d.items.push(mkItem(cands[0], goal, pool, d.used)); progressed = true; break; }
      }
    }
  }

  // Pass 3: order compounds first, assign ord, tag the first compound as warm-up.
  for (const d of days) {
    d.items.sort((a, b) => (b.compound ? 1 : 0) - (a.compound ? 1 : 0));
    let warmed = false;
    d.items.forEach((it, idx) => {
      it.ord = idx + 1;
      if (!warmed && it.compound) { it.warmup = true; warmed = true; }
    });
    d.estMinutes = d.items.length * 8;
    delete d.used;
  }

  const prescriptions = days.flatMap((d) => d.items.map((it) => ({ exercise: it.exercise, sets: it.sets })));
  const vol = weeklyVolume(prescriptions);
  const landmarks = muscles.filter((m) => m.landmarks).map((m) => ({
    muscle: m.id, label: m.label, sets: vol[m.id] ?? 0,
    mev: m.landmarks.mev, mav: m.landmarks.mav, mrv: m.landmarks.mrv,
    status: (vol[m.id] ?? 0) < m.landmarks.mev ? "under" : (vol[m.id] ?? 0) > m.landmarks.mrv ? "over" : "in_range",
  }));

  return { goal, split, daysPerWeek, days, volume: vol, landmarks };
}

function mkItem(ex, goal, pool, usedInDay) {
  const comp = isCompound(ex);
  const { repRange, restSec } = scheme(goal, comp);
  const primary = primeGroups(ex)[0];
  const alternatives = pool
    .filter((e) => e.slug !== ex.slug && !usedInDay.has(e.slug) && primeGroups(e).includes(primary))
    .slice(0, 2)
    .map((e) => ({ exercise: e.slug, name: e.name, machine: e.machine }));
  return {
    exercise: ex.slug, name: ex.name, machine: ex.machine,
    machineName: ex.machine ? machineBySlug[ex.machine]?.name : "bodyweight/free",
    compound: comp, sets: 3, repRange, restSec,
    primeMovers: ex.activation.filter((a) => a.role === "prime").map((a) => a.m),
    alternatives,
  };
}

// Sum weekly sets across all muscles in a group.
function groupVol(vol, group) {
  let s = 0;
  for (const m of muscles) if (m.group === group) s += vol[m.id] ?? 0;
  return s;
}
