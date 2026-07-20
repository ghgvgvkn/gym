// ============================================================================
// IRONMAP · core · safety engine   (NEW, Research brief 4 §Safe LoRA + arch §05-F)
// Screens user text for pain red-flags and eating-disorder signals, and gates
// exercises by contraindication. Mirrors config.safety_guardrails. Logs event
// KIND + SEVERITY only — never message content.
// ============================================================================

import { config, exerciseBySlug } from "./data.mjs";

const G = config.safety_guardrails;

/**
 * Screen a user message. Returns the highest-severity finding, or null.
 * @returns { kind, severity, action, matched } | null
 */
export function screenMessage(text) {
  const t = (text || "").toLowerCase();
  for (const phrase of G.pain_redflags) {
    if (t.includes(phrase)) {
      return { kind: "pain_redflag", severity: 3, action: G.on_redflag, matched: phrase };
    }
  }
  for (const phrase of G.eating_disorder_signals) {
    if (t.includes(phrase)) {
      return { kind: "ed_risk", severity: 3, action: G.on_ed_signal, matched: phrase };
    }
  }
  return null;
}

/** Would this exercise violate any of the user's injuries? */
export function isContraindicated(exerciseSlug, injuries = []) {
  const ex = exerciseBySlug[exerciseSlug];
  if (!ex) return false;
  const bad = new Set(injuries);
  return (ex.contra || []).some((c) => bad.has(c));
}

/**
 * Produce a safety_events row (kind + severity only — the privacy contract).
 * The full message is NEVER stored.
 */
export function toSafetyEvent(finding, userId) {
  return { user_id: userId, kind: finding.kind, severity: finding.severity };
}

/** Is a nutrition target dangerously low? (never below BMR, research 3.) */
export function validateCalorieFloor(target, bmr) {
  return { ok: target >= bmr, floor: bmr, target };
}
