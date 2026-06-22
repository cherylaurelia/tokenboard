// Pure crypto/codegen for the CLI device-authorization flow. No I/O, no DB. node:crypto only.
import { randomBytes, createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Raw sha256 BYTES (Buffer) for bytea columns (ingest_devices.token_hash). Do NOT hex this —
// the column is bytea and the custom bytea type (db/bytea.ts) round-trips a Buffer directly.
export function sha256Bytes(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

// device_code: not displayed, high entropy (RFC 8628 §5.2). 32 bytes base64url (~256 bits).
// Stored at rest as sha256Hex(deviceCode); poll re-hashes with sha256Hex to look up.
export function genDeviceCode(): string {
  return randomBytes(32).toString("base64url");
}

// Ingest token: opaque secret, prefix "tbd_" (Authorization: Bearer tbd_<token>). 32 bytes.
export function mintIngestToken(): string {
  return `tbd_${randomBytes(32).toString("base64url")}`;
}

// Re-salt the client-presented machine_hash with HASH_PEPPER so we never store the raw client
// value. machine_hash is advisory (de-dup/label), never PII, never a security boundary. If
// HASH_PEPPER is unset (local dev) we still hash with an empty pepper; production MUST set it.
export function saltMachineHash(clientMachineHash: string): string {
  return sha256Hex(`${process.env.HASH_PEPPER ?? ""}:${clientMachineHash}`);
}
