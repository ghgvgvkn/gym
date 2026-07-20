// ============================================================================
// IRONMAP · api · POST /api/program
// Deterministic program generation — no LLM in the path. The serverless entry
// wraps the core orchestrator. Framework-agnostic handler(body) → {status, json}.
// In production: JWT verify → fail-closed rate limit → ai-guard sanitize → here.
// ============================================================================

import { buildProgram } from "../packages/core/program.mjs";

export function handler(body) {
  const { profile, options } = body || {};
  if (!profile || !profile.weightKg) {
    return { status: 400, json: { error: "profile with weightKg (and height/age/sex or bodyFatPct) required" } };
  }
  try {
    const program = buildProgram(profile, options || {});
    return { status: 200, json: program };
  } catch (e) {
    return { status: 422, json: { error: String(e.message || e) } };
  }
}

// Example Vercel adapter (Node runtime):
//   export default async (req, res) => {
//     const { status, json } = handler(req.body);
//     res.status(status).json(json);
//   };
