// DETERMINISTIC, content-derived Idempotency-Key per chunk. The SAME chunk body -> the SAME key
// across process runs, so a crashed/re-run `tokenboard sync` reuses the key and the server REPLAYS
// the stored response instead of minting a new ledger row (the literal "reused on retry" constraint;
// the usage_day PK upsert is the backstop). Pure: node:crypto only (keeps the self-containment gate
// green). UUID-shaped so it satisfies the ULID/UUID expectation; uniqueness comes from the sha256.
import { createHash } from "node:crypto";
import type { SyncRequest } from "@tokenboard/contracts";
import { canonicalChunkJson } from "./canonical-chunk.js";

export function chunkIdempotencyKey(body: SyncRequest): string {
  const hex = createHash("sha256").update(canonicalChunkJson(body)).digest("hex");
  // Shape the first 32 hex chars as a UUID; deterministic and collision-safe at our scale.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
