// §5.3 OTP minting + hashing. Entropy is ~20 bits (1e6), so security rests on TTL + attempt-lockout
// + throttle, NOT the code. The hash is salted per (user, DOMAIN) so the per-(user,domain) hash
// namespace MATCHES the per-(user,domain) pending model + DELETE scope — one user verifying two
// domains can't collide on the GLOBAL code_hash UNIQUE and 500. Reuses sha256Bytes (Buffer for
// bytea) + timingSafeEqual.
import { randomInt, timingSafeEqual } from "node:crypto";
import { sha256Bytes, sha256Hex } from "@/lib/cli-login/token";

// crypto-secure, uniform, zero-padded (NOT Math.random; NOT randomBytes()%1e6 which is modulo-biased).
export function mintOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// code_hash bytea = sha256(pepper : userId : domain : code). domain in the input -> per-(user,domain)
// salt. confirm MUST hash with the identical input (it has domain in scope).
export function hashOtp(userId: string, domain: string, code: string): Buffer {
  return sha256Bytes(`${process.env.HASH_PEPPER ?? ""}:${userId}:${domain}:${code}`);
}

// Constant-time bytea compare. timingSafeEqual THROWS on length mismatch -> guard equal length first.
// Both sides are 32-byte sha256 Buffers so the guard always passes, but keep it defensive.
export function constantTimeEqualBytea(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Long-term dedup hash over the NORMALIZED address (store/compare, never store plaintext long-term).
// Kept here so the salting pattern lives in one place; the dedup COLUMN that uses it is a Phase-9
// follow-up (needs DDL).
export function saltedEmailHash(normalizedEmail: string): string {
  return sha256Hex(`${process.env.HASH_PEPPER ?? ""}:${normalizedEmail}`);
}
