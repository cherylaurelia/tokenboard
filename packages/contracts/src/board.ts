// @tokenboard/contracts — GET /api/v1/board contract (ARCHITECTURE.md §7.2).
//
// Query params below are authoritative (IMPLEMENTATION.md §2.1). The response shape
// (entries[] + me, the rich row with rank/handle/tier/delta/sparkline/topTool/isMe)
// is the canonical §7.2 contract — STUBBED here until §7.2 is transcribed verbatim
// in Phase 6/7. Do NOT invent the row shape from the compact §3.2 illustration; fill
// it from the literal §7.2 JSON so web + CLI share one definition (no drift).
import { z } from "zod";

// ---- request params (§2.1 / §7.2) ----
export const boardWindowSchema = z.enum(["7d", "30d", "all"]);
export const boardMetricSchema = z.enum(["tokens", "cost"]);
export const boardFormatSchema = z.enum(["json", "cli"]);

export type BoardWindow = z.infer<typeof boardWindowSchema>;
export type BoardMetric = z.infer<typeof boardMetricSchema>;
export type BoardFormat = z.infer<typeof boardFormatSchema>;

export const boardQuerySchema = z.object({
  // omit or "global" => the global pseudo-community board
  community: z.string().default("global"),
  window: boardWindowSchema.default("7d"),
  metric: boardMetricSchema.default("tokens"),
  me: z.string().optional(),
  // coerce: HTTP query params arrive as strings (?limit=50), so parse "50" -> 50.
  // The .max(200)/.positive() guards still reject "999"/"abc"/"-5" after coercion.
  limit: z.coerce.number().int().positive().max(200).default(50),
  format: boardFormatSchema.default("json"),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

// The §7.2 RESPONSE shape lives in board-response.ts (it imports the window/metric enums from
// here; one-directional, no cycle).
