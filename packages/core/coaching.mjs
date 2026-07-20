// ============================================================================
// IRONMAP · core · coaching engine   (NEW, Research brief 4)
// Deterministic scaffolding around the LLM: detect the user's Transtheoretical
// stage, select the matching technique (MI / SFBT / behavioral activation),
// expose the tool surface, and assemble the system prompt. The model generates
// language; this decides the STRATEGY and the tools it may call.
// ============================================================================

import { coachingStages, config } from "./data.mjs";

const stageById = Object.fromEntries(coachingStages.map((s) => [s.id, s]));

// Signal → stage heuristic. In production the LLM classifies; this is the
// deterministic fallback + the labels the classifier is trained against.
const CUES = {
  precontemplation: ["don't want", "not interested", "too busy", "can't be bothered", "waste of time"],
  contemplation: ["thinking about", "maybe", "should probably", "not sure", "on the fence"],
  preparation: ["ready to start", "want to begin", "how do i start", "signing up", "this week"],
  action: ["been going", "started", "3 times this week", "on my program", "hit the gym"],
  maintenance: ["for months", "keeping it up", "habit now", "streak", "years"],
};

/**
 * Detect the TTM stage from a message (defaults to contemplation). When cues
 * overlap (e.g. "been going for months" hits both action and maintenance), the
 * MORE-ADVANCED stage wins, so we scan maintenance→precontemplation.
 */
export function detectStage(text) {
  const t = (text || "").toLowerCase();
  for (const [stage, cues] of Object.entries(CUES).reverse()) {
    if (cues.some((c) => t.includes(c))) return stageById[stage];
  }
  return stageById.contemplation;
}

/** Technique + strategy for a stage. */
export function techniqueFor(stageId) {
  const s = stageById[stageId];
  if (!s) throw new Error(`techniqueFor: unknown stage "${stageId}"`);
  return { technique: s.technique, strategy: s.strategy };
}

// The tools the coach may call — thin surface, engines do the work.
export const TOOL_SURFACE = [
  "get_today_workout", "log_set", "swap_exercise", "adjust_for_soreness",
  "get_meal", "swap_meal", "log_checkin", "explain_machine", "get_progress",
];

/** Assemble the system prompt from persona + detected stage + safety rules. */
export function buildSystemPrompt(stage, { locale = "en" } = {}) {
  const cm = config.coach_model;
  const s = stageById[stage] || stageById.contemplation;
  return [
    `You are IRONMAP's coach — ${cm.persona}.`,
    `The user is in the "${s.label}" stage. ${s.strategy}`,
    `Reply in ${locale === "ar" ? "the user's Arabic dialect" : "English"}, concise and TTS-ready (no bullet dumps).`,
    `Safety: ${config.safety_guardrails.on_redflag}. Never diagnose or prescribe for acute injury/disease.`,
    `You may call: ${TOOL_SURFACE.join(", ")}.`,
    `Model: ${cm.router.default} (escalate to ${cm.router.escalate_to} on ${cm.router.escalate_on.join("/")}).`,
  ].join("\n");
}
