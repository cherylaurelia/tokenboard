// §8.2 join brute-force control — SEPARATE from the 30/hr volume limiter. Counts WRONG invite codes
// per (uid, community) in Redis (`jl:{uid}:{communityId}`, INCR + EXPIRE 1h); at >=10 fails the join
// is locked for the window. The +5s-per-failure penalty is ADVISORY ONLY (returned as a Retry-After
// hint, capped) — never an `await sleep()` server-side (a serverless function must not hold wall-clock
// per failed attempt: it bills time + amplifies DoS). The hard control is the lock-after-10.
import "server-only";
import { redis } from "@/lib/redis/client";

const MAX_FAILS = 10;
const WINDOW_SEC = 60 * 60; // 1h
const PENALTY_PER_FAIL_SEC = 5;
const PENALTY_CAP_SEC = 60;

function key(uid: string, communityId: string): string {
  return `jl:${uid}:${communityId}`;
}

export type LockoutCheck = { locked: false } | { locked: true; retryAfter: number };

// Read the current failure count; lock when it has reached MAX_FAILS.
export async function checkJoinLockout(uid: string, communityId: string): Promise<LockoutCheck> {
  const fails = Number((await redis.get<number>(key(uid, communityId))) ?? 0);
  if (fails >= MAX_FAILS) {
    const ttl = await redis.ttl(key(uid, communityId));
    return { locked: true, retryAfter: ttl > 0 ? ttl : WINDOW_SEC };
  }
  return { locked: false };
}

// Record one wrong-code attempt (INCR + set/refresh the 1h TTL on first failure). Returns the
// advisory penalty seconds for this attempt count (caller may surface as a soft Retry-After hint).
export async function recordJoinFailure(uid: string, communityId: string): Promise<number> {
  const k = key(uid, communityId);
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, WINDOW_SEC);
  return Math.min(count * PENALTY_PER_FAIL_SEC, PENALTY_CAP_SEC);
}
