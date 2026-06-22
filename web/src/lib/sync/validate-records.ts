// §6.4 steps 3-5. Pure (takes `now`). Partial success: invalid records -> errors[]; valid records
// canonicalized + re-aggregated so a tool/model that canonicalizes to the same key can't split the PK.
import { normalizedRecordSchema, type NormalizedRecord } from "@tokenboard/contracts";
import { canonicalTool, canonicalModel, isKnownTool } from "./known-tools";

export interface SyncError {
  index: number;
  code: string;
  field?: string;
  detail?: string;
}
export interface SyncFlag {
  code: string;
  date?: string;
  detail?: string;
}

export interface ValidateResult {
  valid: NormalizedRecord[]; // canonicalized, re-aggregated, ready to price
  errors: SyncError[];
  flags: SyncFlag[];
}

const RETENTION_DAYS = 90;
const GRACE_DAYS = 1;
const DAY_MS = 86_400_000;

// The 5 wire count fields (NOT tool/model). Used to disambiguate NEGATIVE_COUNT from an empty-string
// tool/model (both surface zod 'too_small').
const COUNT_FIELDS = new Set(["input", "output", "cacheRead", "cacheCreate5m", "cacheCreate1h"]);

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD (UTC slice of the tz-shifted ms)
}

// "now" shifted by the client tz offset, bounding the allowed [oldest, newest] local-day window.
function clientLocalDateBounds(now: Date, tzOffsetMinutes: number): { oldest: string; newest: string } {
  const localNowMs = now.getTime() + tzOffsetMinutes * 60_000;
  const newest = isoDay(localNowMs + GRACE_DAYS * DAY_MS); // +1d future grace
  const oldest = isoDay(localNowMs - (RETENTION_DAYS + GRACE_DAYS) * DAY_MS); // 90d + 1d grace
  return { oldest, newest };
}

export function validateAndNormalize(
  records: unknown[],
  ctx: { now: Date; tzOffsetMinutes: number },
): ValidateResult {
  const errors: SyncError[] = [];
  const flags: SyncFlag[] = [];
  const { oldest, newest } = clientLocalDateBounds(ctx.now, ctx.tzOffsetMinutes);
  const unverifiedTools = new Set<string>();
  const canonical: NormalizedRecord[] = [];

  records.forEach((raw, index) => {
    // STEP 3 — per-record schema validate (5 wire counts >=0 ints, date regex, tool/model 1..64).
    // The §6.4 "six count fields" wording counts the SERVER-DERIVED `tokens` (step 7); the WIRE record
    // has only the 5 buckets, which is what normalizedRecordSchema validates.
    const r = normalizedRecordSchema.safeParse(raw);
    if (!r.success) {
      const first = r.error.issues[0];
      const field = typeof first?.path?.[0] === "string" ? (first.path[0] as string) : undefined;
      // NEGATIVE_COUNT only when a COUNT field failed 'too_small'. An empty-string tool/model also
      // emits 'too_small' but is NOT a negative count -> INVALID_RECORD.
      const isNegativeCount = first?.code === "too_small" && field !== undefined && COUNT_FIELDS.has(field);
      errors.push({ index, code: isNegativeCount ? "NEGATIVE_COUNT" : "INVALID_RECORD", field, detail: first?.message });
      return;
    }
    const rec = r.data;

    // STEP 4 — clamp the date window (±1d grace around [now-90d, now]).
    if (rec.date < oldest || rec.date > newest) {
      errors.push({
        index,
        code: "DATE_OUT_OF_RANGE",
        field: "date",
        detail: rec.date < oldest ? "older than 90d retention" : "in the future",
      });
      return;
    }

    // STEP 5 — canonicalize tool/model server-side + known-tools allowlist tag (advisory).
    const tool = canonicalTool(rec.tool);
    const model = canonicalModel(rec.model);
    if (!isKnownTool(tool)) unverifiedTools.add(tool);
    canonical.push({ ...rec, tool, model });
  });

  if (unverifiedTools.size > 0) {
    flags.push({ code: "TOOL_UNVERIFIED", detail: [...unverifiedTools].sort().join(",") });
  }

  // Re-aggregate after canonicalization: two client rows whose (date,tool,model) collide once
  // canonicalized MUST sum into one usage_day PK row, so a client spelling split can't create two PK
  // rows in one request (the client should already dedupe; the server re-keys defensively).
  const merged = new Map<string, NormalizedRecord>();
  for (const rec of canonical) {
    const key = `${rec.date} ${rec.tool} ${rec.model}`;
    const prev = merged.get(key);
    merged.set(
      key,
      prev
        ? {
            ...prev,
            input: prev.input + rec.input,
            output: prev.output + rec.output,
            cacheRead: prev.cacheRead + rec.cacheRead,
            cacheCreate5m: prev.cacheCreate5m + rec.cacheCreate5m,
            cacheCreate1h: prev.cacheCreate1h + rec.cacheCreate1h,
          }
        : rec,
    );
  }

  return { valid: [...merged.values()], errors, flags };
}
