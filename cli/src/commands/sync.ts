// `tokenboard sync` (client half, Phase 5). readAuthFile bearer + collectLocalRecords payload,
// chunk@500, content-derived stable Idempotency-Key per chunk, POST with a bounded in_progress retry,
// print summary + error/flag breakdown. Fail-loud (throws) -> non-zero exit.
import { readAuthFile } from "../config/auth-store.js";
import { resolveApiBase } from "../claim/api-base.js";
import { collectLocalRecords } from "./preview.js";
import { chunk } from "../sync/chunk.js";
import { tzOffsetMinutes } from "../sync/tz-offset.js";
import { chunkIdempotencyKey } from "../sync/idempotency-key.js";
import { postSyncChunk, SyncInProgressError } from "../sync/transport.js";
import { canonicalTool } from "../normalize/tool-name.js";
import type { NormalizedRecord, SyncRequest, SyncResponseEnvelope } from "@tokenboard/contracts";

export interface SyncOptions {
  since?: string;
  sources?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function filterRecordsForSync(records: NormalizedRecord[], options: SyncOptions): NormalizedRecord[] {
  const sources =
    options.sources && options.sources.length > 0
      ? new Set(options.sources.map(canonicalTool).filter((s) => s.length > 0))
      : null;
  return records.filter((record) => {
    if (options.since && record.date < options.since) return false;
    if (sources && !sources.has(record.tool)) return false;
    return true;
  });
}

const CHUNK_SIZE = 500;
const CLI_VERSION = "0.0.1"; // mirror package.json; X-Tokenboard-CLI header.
const IN_PROGRESS_RETRIES = 3;
const IN_PROGRESS_BACKOFF_MS = 1_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Send one chunk, retrying ONLY on the retryable in_progress 409 with the SAME (content-derived) key.
async function sendChunk(base: string, token: string, body: SyncRequest): Promise<SyncResponseEnvelope> {
  const key = chunkIdempotencyKey(body); // SAME chunk -> SAME key, even across process runs
  for (let attempt = 0; ; attempt++) {
    try {
      return await postSyncChunk(base, token, key, CLI_VERSION, body);
    } catch (err) {
      if (err instanceof SyncInProgressError && attempt < IN_PROGRESS_RETRIES) {
        await sleep(IN_PROGRESS_BACKOFF_MS * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

export async function runSync(options: SyncOptions = {}): Promise<void> {
  if (options.since && !ISO_DATE.test(options.since)) {
    throw new Error(`--since must be a date in YYYY-MM-DD form (got: ${options.since}).`);
  }

  const auth = await readAuthFile();
  if (!auth) throw new Error("not signed in — run `tokenboard claim` first."); // fail loud -> non-zero exit

  const base = resolveApiBase();
  const { records: collected } = await collectLocalRecords();
  const records = filterRecordsForSync(collected, options);
  if (records.length === 0) {
    const scoped = options.since || (options.sources && options.sources.length > 0) ? " matching those filters" : "";
    process.stdout.write(`  tokenboard sync — nothing to upload (no local usage found${scoped}).\n`);
    return;
  }

  const tz = tzOffsetMinutes();
  const batches = chunk(records, CHUNK_SIZE);

  let accepted = 0;
  let rejected = 0;
  let totalCostUsd = 0; // DISPLAY ONLY — never persisted/sent; the server's per-chunk delta is truth.
  const daysAffected = new Set<string>();
  const flagCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();

  for (const batch of batches) {
    const envelope = await sendChunk(base, auth.token, { tzOffsetMinutes: tz, records: batch });
    accepted += envelope.accepted;
    rejected += envelope.rejected;
    totalCostUsd += envelope.computed.totalCostUsdDelta;
    for (const d of envelope.daysAffected) daysAffected.add(d);
    for (const f of envelope.flags ?? []) flagCounts.set(f.code, (flagCounts.get(f.code) ?? 0) + 1);
    for (const e of envelope.errors ?? []) errorCounts.set(e.code, (errorCounts.get(e.code) ?? 0) + 1);
  }

  process.stdout.write(
    `  tokenboard sync — uploaded ${accepted} record${accepted === 1 ? "" : "s"} across ` +
      `${daysAffected.size} day${daysAffected.size === 1 ? "" : "s"} ` +
      `(~$${totalCostUsd.toFixed(2)} this sync${rejected > 0 ? `, ${rejected} rejected` : ""}).\n`,
  );
  if (errorCounts.size > 0) {
    const breakdown = [...errorCounts.entries()].map(([c, n]) => `${c} x${n}`).join(", ");
    process.stderr.write(`  rejected: ${breakdown}\n`);
  }
  for (const [code, n] of flagCounts) process.stderr.write(`  flag: ${code} x${n}\n`);
}
