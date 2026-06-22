// @tokenboard/contracts — public API entry. This is the deliberate package entry point
// named in package.json `exports` (NOT an internal barrel — code.md exempts the public
// API surface). web + cli both import the shared wire contracts from here.
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
