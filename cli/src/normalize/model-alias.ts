// Canonicalize a raw model string to the LiteLLM key space (ARCH §6.2). ccusage@20 and
// Claude Code logs already emit near-canonical ids (verified: "claude-opus-4-8"), so the
// MVP map is intentionally small: lowercase + trim, pass through verbatim, and alias only
// known-divergent spellings. Unknown models pass through unchanged — the cost engine
// prices them at 0 / priced:false rather than guessing.
const ALIASES: Record<string, string> = {
  // Add only confirmed divergent spellings here, e.g.:
  // "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
};

export function canonicalModel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ALIASES[key] ?? key;
}
