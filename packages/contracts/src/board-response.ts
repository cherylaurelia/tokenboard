// @tokenboard/contracts — GET /api/v1/board RESPONSE contract (ARCHITECTURE.md §7.2).
// CANONICAL shape shared verbatim by the web SSR table, the CLI render, and the share card.
// Query params live in board.ts; this is the response superset. format=cli OMITS the web-only
// fields (avatar, displayName, tierPill, topTool), so those are .optional() (absent in cli);
// in json they are present (nullable when data is missing).
import { z } from "zod";
import { isoDateSchema } from "./normalized-record";
import { boardWindowSchema, boardMetricSchema } from "./board";

export const tierSchema = z.enum(["individual", "community", "company"]);
export type Tier = z.infer<typeof tierSchema>;

// tierPill.kind mirrors tier; verified = the verification ladder (GitHub identity for individual;
// work-email domain proof for company).
export const tierPillSchema = z.object({
  label: z.string(),
  kind: tierSchema,
  verified: z.boolean(),
});
export type TierPill = z.infer<typeof tierPillSchema>;

export const boardDeltaDirectionSchema = z.enum(["up", "down", "flat", "new"]);
// tokensChange/pct are vs the PREVIOUS equal-length window (lbsnap). UNIT NOTE: tokensChange is in
// the SAME DISPLAY UNIT as the row's ranked field — whole tokens for metric=tokens, 2dp DOLLARS for
// metric=cost (the assembler divides micro-dollars by 1e6 before computing the delta), so it
// matches the displayed `cost`. pct is unit-invariant.
export const boardDeltaSchema = z.object({
  rankChange: z.number().int(), // prevRank - curRank (positive = climbed)
  tokensChange: z.number(), // cur - prev, in the row's DISPLAY unit (tokens | 2dp USD)
  pct: z.number(), // tokensChange / prev * 100 (0 when prev<=0)
  direction: boardDeltaDirectionSchema, // 'new' when no prev snapshot row
});
export type BoardDelta = z.infer<typeof boardDeltaSchema>;

export const sparklinePointSchema = z.object({
  date: isoDateSchema,
  tokens: z.number(),
});
export type SparklinePoint = z.infer<typeof sparklinePointSchema>;

// avatar/displayName/tierPill/topTool are OPTIONAL so format=cli (which omits them) validates
// against the SAME schema. In json they are present (nullable when absent).
export const boardEntrySchema = z.object({
  rank: z.number().int().positive(), // 1-based
  handle: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  tier: tierSchema,
  tierPill: tierPillSchema.optional(),
  tokens: z.number(), // all-in token volume
  cost: z.number(), // USD, 2dp at THIS edge only
  delta: boardDeltaSchema,
  sparkline: z.array(sparklinePointSchema),
  topTool: z.string().nullable().optional(),
  isMe: z.boolean(),
});
export type BoardEntry = z.infer<typeof boardEntrySchema>;

// community meta is null for the global (g) board.
export const communityMetaSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.enum(["community", "company"]),
  joinPolicy: z.enum(["open", "code", "email_domain"]),
  visibility: z.enum(["public", "unlisted", "private"]),
  memberCount: z.number().int().nonnegative(), // COUNT(memberships) roster, NOT ZCARD
});
export type CommunityMeta = z.infer<typeof communityMetaSchema>;

// me is a THREE-way union:
//  (1) null                                              — ?me= absent OR handle unknown/banned/no rows
//  (2) {inTopN:true,  rank, totalEntries, handle}        — row already in entries[]
//  (3) {inTopN:false, rank, totalEntries, entry:<row>}   — caller outside top-N
export const meInTopNSchema = z.object({
  inTopN: z.literal(true),
  rank: z.number().int().positive(),
  totalEntries: z.number().int().nonnegative(),
  handle: z.string(),
});
export const meOutOfTopNSchema = z.object({
  inTopN: z.literal(false),
  rank: z.number().int().positive(),
  totalEntries: z.number().int().nonnegative(),
  entry: boardEntrySchema,
});
export const boardMeSchema = z.union([z.null(), meInTopNSchema, meOutOfTopNSchema]);
export type BoardMe = z.infer<typeof boardMeSchema>;

export const boardResponseSchema = z.object({
  community: communityMetaSchema.nullable(), // null for global
  window: boardWindowSchema,
  metric: boardMetricSchema,
  generatedAt: z.string(), // ISO-8601 (second precision at the edge)
  priceTableVersion: z.string(),
  windowStart: isoDateSchema,
  windowEnd: isoDateSchema,
  totalEntries: z.number().int().nonnegative(),
  entries: z.array(boardEntrySchema),
  me: boardMeSchema,
});
export type BoardResponse = z.infer<typeof boardResponseSchema>;
