// @tokenboard/contracts — POST /api/v1/sync wire contract (ARCHITECTURE.md §6.3).
// Request body = counts-only camelCase records (the §6.1 NormalizedRecord shape).
// Response = the FULL §6.3 envelope (the server always returns this; the CLI surfaces
// a subset). Cost is NEVER client-supplied — the server computes it from a pinned
// LiteLLM price table (§6.4 step 7). client_version / priceTableVersionSeen are advisory.
import { z } from "zod";
import { normalizedRecordSchema, isoDateSchema } from "./normalized-record";

// ---- request (§6.3) ----
export const syncRequestSchema = z.object({
  // Minutes offset of the client's local TZ from UTC (e.g. -420 for UTC-7).
  tzOffsetMinutes: z.number().int(),
  // What price-table version the CLI's local preview used. Advisory/telemetry only —
  // the server prices from its own pinned table, not this.
  priceTableVersionSeen: z.string().optional(),
  // At most one row per (date, tool, model); chunked at 500 rows/request (§6.3).
  records: z.array(normalizedRecordSchema).max(500),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

// ---- response envelope (§6.3 — canonical) ----
// A flagged day (e.g. DAY_TOTAL_IMPLAUSIBLE) is advisory telemetry only: counts are
// preserved, the day is NOT excluded from ranking (§4.6 — only banned_at hides a user).
export const syncFlagSchema = z.object({
  code: z.string(),
  date: isoDateSchema.optional(),
  detail: z.string().optional(),
});

// Per-record validation failure (partial-success error envelope, §6.3).
export const syncErrorSchema = z.object({
  index: z.number().int().nonnegative(),
  code: z.string(),
  field: z.string().optional(),
  detail: z.string().optional(),
});

export const syncResponseEnvelopeSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  priceTableVersionApplied: z.string(),
  daysAffected: z.array(isoDateSchema),
  computed: z.object({
    // Full-precision diagnostic value — do NOT round to 2dp (§3.1 note). The 2-decimal
    // rule applies only to the board JSON `cost` field + UI, never this.
    totalCostUsdDelta: z.number(),
    totalTokens: z.number().int().nonnegative(),
  }),
  flags: z.array(syncFlagSchema).optional(),
  errors: z.array(syncErrorSchema).optional(),
  boardsTouched: z.array(z.string()).optional(),
  nextSyncSuggestedAfterSec: z.number().int().positive().optional(),
});

export type SyncResponseEnvelope = z.infer<typeof syncResponseEnvelopeSchema>;
