// ============================================================================
// IRONMAP · api · POST /api/recognize   (async job — machine cataloging)
// A staff photo → vision model → top-K canonical machine_type candidates for
// the review queue. The vision call is marked; the candidate ranking + the
// human-confirm contract are the deterministic parts. Runs on a queue
// (QStash), not inline — recognition is once-per-machine, not per request.
// ============================================================================

import { machines } from "../packages/core/data.mjs";

const bySlug = Object.fromEntries(machines.map((m) => [m.slug, m]));

export function handler(body) {
  const { gymId, storagePath } = body || {};
  if (!gymId || !storagePath) return { status: 400, json: { error: "gymId and storagePath required" } };

  // >>> VISION MODEL CALL GOES HERE <<<
  //   const vlm = await claudeVision({ image: storagePath, schema: RECOGNITION_SCHEMA });
  //   → { is_gym_machine, canonical_guess, category, confidence, ... }  (YOLO26 in Phase 2)
  //   then embed the guess and pgvector-match against gym.machine_types.
  const vlm = { is_gym_machine: true, canonical_guess: "lat_pulldown", confidence: 0.91 };

  if (!vlm.is_gym_machine) {
    return { status: 200, json: { status: "rejected", reason: "not a gym machine — retake" } };
  }

  // Rank candidates: the guess first, then its documented confusion set — this
  // is what the review queue's "Correct" picker shows the staffer.
  const guess = bySlug[vlm.canonical_guess];
  const candidates = guess
    ? [guess, ...(guess.confused_with || []).map((s) => bySlug[s]).filter(Boolean)]
        .map((m) => ({ slug: m.slug, name: m.name, category: m.category }))
    : [];

  return {
    status: 200,
    json: {
      status: "needs_review",
      confidence: vlm.confidence,
      candidates, // top row is the AI's best guess; every staff confirm trains the recognizer
      note: "Human confirmation is the product, not a failure state.",
    },
  };
}
