// §8.2 policies over the EXISTING @upstash/redis singleton. One Ratelimit per (policy, key-space)
// built at MODULE scope (never per-request) — a unique `prefix` per instance prevents key collisions.
// A shared module-scope ephemeralCache (best-effort per-lambda block cache) is passed to every
// instance. Single-region Ratelimit (NOT MultiRegion) so tokenBucket/slidingWindow are available.
// analytics:false — no extra Redis writes. timeout:1000 — the built-in fails-OPEN on Redis SLOWNESS
// only (resolves a {success:true, reason:"timeout"} sentinel); a THROWN transport error still
// propagates and is caught in enforce.ts.
import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis/client";

const ephemeralCache = new Map<string, number>();
const timeout = 1000;

type Limiter = ReturnType<typeof Ratelimit.slidingWindow>;
function make(limiter: Limiter, prefix: string) {
  return new Ratelimit({ redis, limiter, prefix, analytics: false, timeout, ephemeralCache });
}
const sw = Ratelimit.slidingWindow;
const tb = Ratelimit.tokenBucket; // (refillRate, interval, maxTokens)

export interface Policy {
  uid: Array<ReturnType<typeof make>>; // checked with uid:<id> (only when a uid is present)
  ip: Array<ReturnType<typeof make>>; // checked with ip:<addr>
  email?: Array<ReturnType<typeof make>>; // verifyStart only, checked with email:<normalized>
}

export const policies = {
  // POST /sync — 60/hr + burst-10 per-user; 120/hr per-IP. tokenBucket(refillRate=60, "1 h",
  // maxTokens=10): a 10-request cold burst, then ~1/min refill, 60/hr steady. (Interpreting the
  // spec's "burst 10/min" as a 10-token bucket ceiling — STRICTER than a literal rolling-10/min.)
  sync: { uid: [make(tb(60, "1 h", 10), "rl:sync:uid")], ip: [make(sw(120, "1 h"), "rl:sync:ip")] },
  // GET /board — 120/min per-user; 240/min per-IP (anon = IP only; uid omitted by the caller).
  board: { uid: [make(sw(120, "1 m"), "rl:board:uid")], ip: [make(sw(240, "1 m"), "rl:board:ip")] },
  // POST /communities — 10/day per-user; 20/day per-IP.
  communitiesCreate: { uid: [make(sw(10, "1 d"), "rl:cc:uid")], ip: [make(sw(20, "1 d"), "rl:cc:ip")] },
  // POST /communities/:id/join + /communities/join — 30/hr per-user; 60/hr per-IP. (The +5s-penalty /
  // lock-after-10-failed-code control is SEPARATE — join-lockout.ts.)
  communitiesJoin: { uid: [make(sw(30, "1 h"), "rl:join:uid")], ip: [make(sw(60, "1 h"), "rl:join:ip")] },
  // POST /verify/email/start — 5/hr/email, 10/hr/user; 20/hr per-IP.
  verifyStart: {
    uid: [make(sw(10, "1 h"), "rl:vstart:uid")],
    ip: [make(sw(20, "1 h"), "rl:vstart:ip")],
    email: [make(sw(5, "1 h"), "rl:vstart:email")],
  },
  // POST /verify/email/confirm — 10/15min per-user; 30/hr per-IP.
  verifyConfirm: { uid: [make(sw(10, "15 m"), "rl:vconfirm:uid")], ip: [make(sw(30, "1 h"), "rl:vconfirm:ip")] },
  // POST /cli/login/poll — 60/min per-IP (unauthenticated poll; 5s interval kept in-route).
  cliPoll: { uid: [], ip: [make(sw(60, "1 m"), "rl:poll:ip")] },
  // OAuth — 60/min per-IP (anon). Applied to BOTH the start (/api/auth/login) and the §8.2-named
  // callback (/auth/callback).
  oauthStart: { uid: [], ip: [make(sw(60, "1 m"), "rl:oauth:ip")] },
  // Owner-only admin actions (/api/v1/admin/*) — low traffic but consistent: 60/min uid, 120/min ip.
  admin: { uid: [make(sw(60, "1 m"), "rl:admin:uid")], ip: [make(sw(120, "1 m"), "rl:admin:ip")] },
  // POST /api/v1/profile — the owner editing their own bio/social_links. 30/min uid, 60/min ip.
  profileUpdate: { uid: [make(sw(30, "1 m"), "rl:prof:uid")], ip: [make(sw(60, "1 m"), "rl:prof:ip")] },
} satisfies Record<string, Policy>;

export type PolicyName = keyof typeof policies;
