// POST one chunk to /api/v1/sync. Global fetch + AbortSignal.timeout (Node >=18). Fail-loud at the
// boundary; parse with the shared §6.3 contract. Self-containment: only zod (via contracts) + node
// builtins. NEVER log the token. Distinguishes the two 409 sub-cases.
import { syncResponseEnvelopeSchema, type SyncResponseEnvelope, type SyncRequest } from "@tokenboard/contracts";

const REQUEST_TIMEOUT_MS = 30_000; // a 500-row chunk + server tx can run longer than auth calls.

// Retryable in-progress signal — the route returned 409 idempotency_request_in_progress (a concurrent
// first request with the SAME key is committing). The caller retries the SAME key after a backoff.
export class SyncInProgressError extends Error {}

export async function postSyncChunk(
  base: string,
  token: string,
  idempotencyKey: string,
  cliVersion: string,
  body: SyncRequest,
): Promise<SyncResponseEnvelope> {
  const res = await fetch(`${base}/api/v1/sync`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-tokenboard-cli": cliVersion,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401) {
    throw new Error("sync: unauthorized — run `tokenboard claim` to re-link this machine.");
  }
  if (res.status === 409) {
    // in_progress is retryable with the SAME key; key_conflict (different body — impossible with our
    // content-derived key) is fatal.
    const code = await res
      .json()
      .then((j) => (j as { error?: string }).error)
      .catch(() => undefined);
    if (code === "idempotency_request_in_progress") {
      throw new SyncInProgressError("sync: a concurrent request for this chunk is committing.");
    }
    throw new Error("sync: idempotency_key_conflict — this key was used with a different body.");
  }
  if (!res.ok) throw new Error(`sync: ${base}/api/v1/sync -> HTTP ${res.status}`);
  return syncResponseEnvelopeSchema.parse(await res.json());
}
