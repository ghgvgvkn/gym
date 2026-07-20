// ============================================================================
// IRONMAP · api · POST /api/coach
// The coach turn: screen for safety FIRST, detect the TTM stage, assemble the
// system prompt, then hand off to the model. Fable 5 default, escalate on
// safety/plan-change. The LLM call is marked — everything around it is the
// deterministic guardrail the model runs inside.
// ============================================================================

import { screenMessage, toSafetyEvent } from "../packages/core/safety.mjs";
import { detectStage, buildSystemPrompt, TOOL_SURFACE } from "../packages/core/coaching.mjs";
import { config } from "../packages/core/data.mjs";

export function handler(body) {
  const { message, userId, locale = "en" } = body || {};
  if (!message) return { status: 400, json: { error: "message required" } };

  // 1 · Safety gate — logs event kind+severity only, never content.
  const finding = screenMessage(message);
  if (finding && finding.severity >= 3) {
    return {
      status: 200,
      json: {
        safety: { action: finding.action, event: toSafetyEvent(finding, userId) },
        reply: finding.kind === "pain_redflag"
          ? "That sounds like something to stop and get checked by a professional — I won't program through it. Want me to swap today for something that avoids that area?"
          : "I hear you, and I want to make sure you're okay — this is beyond what I should coach. Let's talk to someone who can help. I'm not going to tighten your plan.",
        escalated: true,
      },
    };
  }

  // 2 · Stage → strategy → system prompt for the model.
  const stage = detectStage(message);
  const systemPrompt = buildSystemPrompt(stage.id, { locale });
  const model = config.coach_model.router.default; // claude-fable-5

  // 3 · >>> MODEL CALL GOES HERE <<<
  //     const reply = await claude({ model, system: systemPrompt, messages:[{role:"user",content:message}], tools: TOOL_SURFACE });
  return {
    status: 200,
    json: {
      stage: stage.id,
      technique: stage.technique,
      model,
      systemPrompt,
      toolSurface: TOOL_SURFACE,
      reply: null, // filled by the model in production
    },
  };
}
