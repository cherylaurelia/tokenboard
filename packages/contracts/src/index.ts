// @tokenboard/contracts — public API entry. This is the deliberate package entry point
// named in package.json `exports` (NOT an internal barrel — code.md exempts the public
// API surface). web + cli both import the shared wire contracts from here.
// Extensionless relative imports: the monorepo is on `moduleResolution: bundler`, which
// every consumer uses — Turbopack (web build), esbuild/tsup (cli bundle), and tsc (all
// packages, incl. the cli typecheck). Turbopack cannot resolve `.js` specifiers that point
// at `.ts` sources, so extensionless is the universally-compatible form here.
export {
  normalizedRecordSchema,
  isoDateSchema,
  type NormalizedRecord,
} from "./normalized-record";

export {
  syncRequestSchema,
  syncResponseEnvelopeSchema,
  syncFlagSchema,
  syncErrorSchema,
  type SyncRequest,
  type SyncResponseEnvelope,
} from "./sync";

export {
  boardQuerySchema,
  boardWindowSchema,
  boardMetricSchema,
  boardFormatSchema,
  type BoardQuery,
  type BoardWindow,
  type BoardMetric,
  type BoardFormat,
} from "./board";

export {
  cliLoginStartRequestSchema,
  cliLoginStartResponseSchema,
  cliLoginPollRequestSchema,
  cliLoginPollResponseSchema,
  cliLoginApproveRequestSchema,
  cliLoginPollStatusEnvelopeSchema,
  KNOWN_POLL_STATUSES,
  type CliLoginStartResponse,
  type CliLoginPollResponse,
} from "./cli-login";

export {
  boardResponseSchema,
  boardEntrySchema,
  boardDeltaSchema,
  sparklinePointSchema,
  tierSchema,
  tierPillSchema,
  communityMetaSchema,
  boardMeSchema,
  type BoardResponse,
  type BoardEntry,
  type BoardDelta,
  type SparklinePoint,
  type Tier,
  type TierPill,
  type CommunityMeta,
  type BoardMe,
} from "./board-response";
