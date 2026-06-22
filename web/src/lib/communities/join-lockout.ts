// §8.2 join brute-force control — SEPARATE from the 30/hr volume limiter. Counts WRONG invite codes
// per (uid, community) in Redis (`jl:{uid}:{communityId}`, INCR + EXPIRE 1h); at >=10 fails the join
// is locked for the window. The +5s-per-failure penalty is ADVISORY ONLY (returned as a Retry-After
// hint, capped) — never an `await sleep()` server-side (a serverless function must not hold wall-clock
// per failed attempt: it bills time + amplifies DoS). The hard control is the lock-after-10.
//
// FAIL-OPEN (per §8.2): a Redis outage must NOT take down the join endpoint. Both functions swallow
// Redis errors — checkJoinLockout returns {locked:false} (allow), recordJoinFailure no-ops. Same
// non-fatal posture as the rate limiter and the post-commit cache writes.
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

// Read the current failure count; lock when it has reached MAX_FAILS. Fails OPEN (allow) on a Redis
// error. Repairs a missing TTL (a counter with no expiry would otherwise lock forever).
export async function checkJoinLockout(uid: string, communityId: string): Promise<LockoutCheck> {
  const k = key(uid, communityId);
  try {
    const fails = Number((await redis.get<number>(k)) ?? 0);
    if (fails < MAX_FAILS) return { locked: false };
    let ttl = await redis.ttl(k);
    if (ttl < 0) {
      // -1 = key exists with no expiry (a missed EXPIRE) -> repair it so the lock can't be permanent.
      await redis.expire(k, WINDOW_SEC);
      ttl = WINDOW_SEC;
    }
    return { locked: true, retryAfter: ttl > 0 ? ttl : WINDOW_SEC };
  } catch (err) {
    console.error("join-lockout: check failed (fail-open)", err instanceof Error ? err.message : err);
    return { locked: false };
  }
}

// Record one wrong-code attempt (INCR + ensure the 1h TTL). Returns the advisory penalty seconds for
// this attempt count (caller may surface as a soft Retry-After hint). No-ops on a Redis error.
export async function recordJoinFailure(uid: string, communityId: string): Promise<number> {
  const k = key(uid, communityId);
  try {
    const count = await redis.incr(k);
    // Set the TTL on first write AND repair it if a prior EXPIRE was missed (ttl -1 = no expiry).
    if (count === 1 || (await redis.ttl(k)) < 0) await redis.expire(k, WINDOW_SEC);
    return Math.min(count * PENALTY_PER_FAIL_SEC, PENALTY_CAP_SEC);
  } catch (err) {
    console.error("join-lockout: record failed (non-fatal)", err instanceof Error ? err.message : err);
    return 0;
  }
}
