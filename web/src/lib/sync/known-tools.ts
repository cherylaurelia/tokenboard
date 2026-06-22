// Server-side canonicalization (do NOT trust the client). Mirrors cli/src/normalize/{tool-name,
// model-alias}.ts and ADDS the §6.4 step-5 alias (claude_code/ClaudeCode -> claude-code) that the
// CLI's trim+lowercase tool-name.ts lacks, so the usage_day PK can never split one tool across two
// spellings.
const TOOL_ALIASES: Record<string, string> = {
  claude_code: "claude-code",
  claudecode: "claude-code",
};

// Known-tools allowlist (§6.4 step 5). Unknown tools are ACCEPTED + tagged tool_unverified (advisory)
// — never rejected. Extend as tools are added.
const KNOWN_TOOLS = new Set(["claude-code", "cursor", "codex", "aider", "gemini-cli", "copilot"]);

export function canonicalTool(raw: string): string {
  const key = raw.trim().toLowerCase();
  return TOOL_ALIASES[key] ?? key;
}

export function isKnownTool(canonical: string): boolean {
  return KNOWN_TOOLS.has(canonical);
}

// Mirror cli/src/normalize/model-alias.ts (currently passthrough lowercase+trim). Empty alias map is
// intentional — ccusage@20 + Claude Code emit canonical LiteLLM ids already.
const MODEL_ALIASES: Record<string, string> = {};

export function canonicalModel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return MODEL_ALIASES[key] ?? key;
}
