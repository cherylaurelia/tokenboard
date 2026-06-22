// @tokenboard/contracts — public API entry. This is the deliberate package entry point
// named in package.json `exports` (NOT an internal barrel — code.md exempts the public
// API surface). web + cli both import the shared wire contracts from here.
// Explicit .js extensions on relative imports: resolves under bundler (web), NodeNext
// (cli typecheck), esbuild/tsup (cli bundle), and Next — the universally-compatible form.
export {
  normalizedRecordSchema,
  isoDateSchema,
  type NormalizedRecord,
} from "./normalized-record.js";

export {
  syncRequestSchema,
  syncResponseEnvelopeSchema,
  syncFlagSchema,
  syncErrorSchema,
  type SyncRequest,
  type SyncResponseEnvelope,
} from "./sync.js";

export {
  boardQuerySchema,
  boardWindowSchema,
  boardMetricSchema,
  boardFormatSchema,
  type BoardQuery,
  type BoardWindow,
  type BoardMetric,
  type BoardFormat,
} from "./board.js";

export {
  cliLoginStartRequestSchema,
  cliLoginStartResponseSchema,
  cliLoginPollRequestSchema,
  cliLoginPollResponseSchema,
  cliLoginApproveRequestSchema,
  type CliLoginStartResponse,
  type CliLoginPollResponse,
} from "./cli-login.js";
