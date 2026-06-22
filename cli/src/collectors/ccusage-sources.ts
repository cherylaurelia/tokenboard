// The long-tail tools we ask ccusage@20 to report. Each is a ccusage subcommand
// (verified present in `ccusage@20 --help`). "claude" is DELIBERATELY EXCLUDED — Claude
// Code is the first-party collector; routing it through ccusage too would double-count
// into the same (date, claude-code, model) keys.
//
// IMPLEMENTATION §8 only requires ONE long-tail tool wired; this is the broader set.
// Further sources live in ccusage@20 (codebuff, hermes, pi, kilo, kimi, openclaw, …) —
// add them here, the single flip-point, when we want them.
export const CCUSAGE_SOURCES = [
  "codex",
  "opencode",
  "amp",
  "droid",
  "goose",
  "gemini",
  "copilot",
  "qwen",
] as const;

export type CcusageSource = (typeof CCUSAGE_SOURCES)[number];
