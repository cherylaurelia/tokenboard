// §6.4 step 1 (DEVICE bearer, NOT the Supabase session). Resolve `Authorization: Bearer tbd_<token>`
// -> (user_id, device_id) via the ingest_devices bytea token_hash. Drizzle, NOT supabase-js:
// supabase-js (PostgREST/JSON) cannot do a bytea equality. The sliding-window bump is a SEPARATE
// function so the route can SKIP it on the idempotent-replay path (a replay must not do a hidden
// write). machine_hash mismatch is ADVISORY only (never a 401).
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ingestDevices } from "@/db/schema";
import { sha256Bytes } from "@/lib/cli-login/token";

const INGEST_TTL_DAYS = 90; // matches the mint TTL in cli/login/approve; sliding window.

export interface AuthedDevice {
  deviceRowId: string; // ingest_devices.id == the device_id used in usage_day's PK
  userId: string;
  // Advisory: the request's machine_hash differs from the device's bound hash. Surfaced as a flag,
  // never a rejection (a re-imaged machine legitimately shifts its hash).
  machineHashMismatch: boolean;
}

// Returns null on any auth failure (caller -> 401). NEVER logs the raw token. `presentedMachineHash`
// is advisory — the §6.3 wire body carries no machine_hash, so in Phase 5 it is effectively undefined.
export async function authenticateDevice(
  authorizationHeader: string | null,
  presentedMachineHash?: string | null,
): Promise<AuthedDevice | null> {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(tbd_[A-Za-z0-9._-]+)$/.exec(authorizationHeader.trim());
  if (!match) return null;
  const rawToken = match[1]!;

  const tokenHash = sha256Bytes(rawToken); // Buffer -> bytea (raw bytes, never hex/utf8)
  const [device] = await db
    .select()
    .from(ingestDevices)
    .where(and(eq(ingestDevices.tokenHash, tokenHash), eq(ingestDevices.status, "active")))
    .limit(1);

  if (!device) return null; // unknown token
  if (device.revokedAt) return null; // belt-and-suspenders vs status
  if (device.expiresAt.getTime() < Date.now()) return null; // expired

  const machineHashMismatch =
    presentedMachineHash != null && device.machineHash != null && presentedMachineHash !== device.machineHash;

  return { deviceRowId: device.id, userId: device.userId, machineHashMismatch };
}

// Sliding-window bump — SEPARATE from auth so the route calls it ONLY on the non-replay path. A sync
// that authenticates but later fails should still refresh the token, so the route calls this after a
// successful reserve, before the pipeline, in its own awaited statement (outside the usage tx).
export async function bumpDeviceExpiry(deviceRowId: string): Promise<void> {
  const nextExpiry = new Date(Date.now() + INGEST_TTL_DAYS * 86_400_000);
  await db
    .update(ingestDevices)
    .set({ expiresAt: nextExpiry, lastUsedAt: new Date() })
    .where(eq(ingestDevices.id, deviceRowId));
}
