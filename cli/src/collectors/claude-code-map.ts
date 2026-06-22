import type { NormalizedRecord } from "@tokenboard/contracts";
import type { ParsedLine } from "./parsed-line.js";
import { canonicalModel } from "../normalize/model-alias.js";
import { toLocalDay } from "../normalize/local-day.js";

// Non-negative integer coercion: null/missing/NaN -> 0; floats truncated. Guarantees the
// counts satisfy the contracts schema (z.number().int().nonnegative()).
function count(n: number | undefined): number {
  return Math.max(0, Math.trunc(n ?? 0));
}

// Pure: one deduped+filtered Claude Code line -> one NormalizedRecord.
// Uses the NESTED cache_creation object for the real 5m/1h split (verified present on
// every countable line). The scalar fallback is a documented LOSSY degradation: if the
// nested object is ever absent, the combined cache_creation_input_tokens goes entirely
// into cacheCreate5m and 1h reads 0 — collapsing the split (mirrors the ccusage
// "combined -> 5m" approximation). It is dead on current data.
export function parsedLineToRecord(line: ParsedLine, timeZone: string): NormalizedRecord {
  const u = line.usage;
  return {
    date: toLocalDay(line.timestamp ?? new Date(0).toISOString(), timeZone),
    tool: "claude-code",
    model: canonicalModel(line.model),
    input: count(u.input_tokens),
    output: count(u.output_tokens),
    cacheRead: count(u.cache_read_input_tokens),
    cacheCreate5m: count(
      u.cache_creation?.ephemeral_5m_input_tokens ?? u.cache_creation_input_tokens,
    ),
    cacheCreate1h: count(u.cache_creation?.ephemeral_1h_input_tokens),
  };
}
