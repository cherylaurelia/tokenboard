// §5.3 basic send throttle (NOT the §9 token bucket): a 60s cooldown between sends per (user,domain)
// + a 5/day cap per (user,domain) + a per-USER 20/day global cap (weakens the email-bomb-via-domain-
// cycling vector). DB-timestamp gate on email_verifications.created_at. TOCTOU note: this is a
// read-then-write gate; a burst of concurrent starts can exceed the cap by ~concurrency. Acceptable
// for Phase 8 (full token-bucket is Phase 9); documented in risks.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

const COOLDOWN_SEC = 60;
const DAILY_CAP_PER_DOMAIN = 5;
const DAILY_CAP_PER_USER = 20;

export type ThrottleResult = { ok: true } | { ok: false; retryAfter: number };

export async function checkSendThrottle(userId: string, domain: string): Promise<ThrottleResult> {
  const rows = (await db.execute(sql`
    select
      count(*) filter (where domain = ${domain} and created_at > now() - interval '24 hours')::int as "domainDay",
      count(*) filter (where created_at > now() - interval '24 hours')::int as "userDay",
      max(created_at) filter (where domain = ${domain}) as "lastAt"
    from email_verifications where user_id = ${userId}
  `)) as unknown as Array<{ domainDay: number; userDay: number; lastAt: string | null }>;
  const r = rows[0] ?? { domainDay: 0, userDay: 0, lastAt: null };
  if (r.lastAt) {
    const elapsed = (Date.now() - new Date(r.lastAt).getTime()) / 1000;
    if (elapsed < COOLDOWN_SEC) return { ok: false, retryAfter: Math.ceil(COOLDOWN_SEC - elapsed) };
  }
  if (r.domainDay >= DAILY_CAP_PER_DOMAIN || r.userDay >= DAILY_CAP_PER_USER) {
    return { ok: false, retryAfter: 3600 };
  }
  return { ok: true };
}
