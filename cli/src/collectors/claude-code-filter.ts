import type { AssistantUsageLine } from "./parsed-line.js";

// The single flip-point for "which Claude Code lines count toward usage."
//
// KEEP iff: an assistant message that carries a usage block, is not the synthetic
// placeholder model, and is not flagged as an API error.
//
// Why skip synthetic + isApiErrorMessage: measured live on the full local corpus
// (1510 files), all 28 synthetic and all 24 isApiErrorMessage lines carry ZERO
// tokens, so skipping them is a no-op for totals (resolves DESIGN §15 OQ#1). If a
// future error line ever carries real billed tokens, flip the decision HERE — this
// is the one place. We deliberately do NOT filter on isSidechain: sub-agent (Task
// tool) lines are real paid spend; excluding them would understate totals.
export function isCountableAssistantLine(line: unknown): line is AssistantUsageLine {
  const l = line as Record<string, unknown> | null;
  const message = l?.["message"] as Record<string, unknown> | undefined;
  return (
    l?.["type"] === "assistant" &&
    message?.["usage"] != null &&
    message?.["model"] !== "<synthetic>" &&
    l?.["isApiErrorMessage"] !== true
  );
}
