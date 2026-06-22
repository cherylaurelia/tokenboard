// @tokenboard/contracts — NormalizedRecord (ARCHITECTURE.md §6.1).
// The single internal record shape both CLI collectors (first-party Claude Code
// parser + ccusage shell-out) emit, and the per-record shape the server validates
// on POST /api/v1/sync. Counts only — never prompts, code, paths, or repo names.
//
// The cache-write bucket is SPLIT into cacheCreate5m / cacheCreate1h because the two
// price differently (1.25x vs 2x). This split is load-bearing (§6.1.1) — do not merge.
import { z } from "zod";

// Local calendar day, "YYYY-MM-DD" (§6.4 step 3 validates this exact format).
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// Non-negative integer token count. Server rejects negatives (NEGATIVE_COUNT, §6.3).
const tokenCount = z.number().int().nonnegative();

// tool/model are non-empty strings, <= 64 chars (§6.4 step 3).
const dimensionKey = z.string().min(1).max(64);

export const normalizedRecordSchema = z.object({
  date: isoDateSchema,
  tool: dimensionKey, // "claude-code" | "cursor" | "codex" | "aider" | ...
  model: dimensionKey, // canonical LiteLLM model key, lowercased
  input: tokenCount,
  output: tokenCount,
  cacheRead: tokenCount,
  cacheCreate5m: tokenCount, // ephemeral 5-min cache write tokens (priced 1.25x)
  cacheCreate1h: tokenCount, // ephemeral 1-hour cache write tokens (priced 2x)
});

export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;
