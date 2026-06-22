// The gate every limited route calls at the top. FAIL-OPEN on the limiter's OWN error: the SDK's
// limit() has no catch, so a THROWN Upstash transport/5xx error would 500 the route — §8.2 forbids
// that. We wrap EACH .limit() in try/catch and treat a throw OR a reason==="timeout" slow-Redis
// sentinel as an allow-with-NO-headers (the timeout sentinel carries remaining=0, which would
// otherwise emit a misleading X-RateLimit-Remaining: 0 on a 200). Fail-CLOSED only on a genuine
// success:false from a healthy Redis. Same non-fatal posture as the sync post-commit Redis write.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { policies, type PolicyName, type Policy } from "./policies";
import { clientIp, uidKey, ipKey, emailKey } from "./identifiers";
import { pickStricter, rateLimitHeaders, retryAfterSeconds, type LimitResult } from "./headers";

// Returns null (allow, no headers) on a throw OR the timeout sentinel; the LimitResult on a real
// allow/deny decision from a healthy Redis.
async function safeLimit(inst: Policy["ip"][number], id: string): Promise<LimitResult | null> {
  try {
    const r = await inst.limit(id);
    if (r.reason === "timeout") return null; // slow-Redis fail-open: allow, emit no headers
    return { success: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
  } catch (err) {
    console.error("ratelimit: limit() threw (fail-open)", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface EnforceArgs {
  uid?: string | null;
  email?: string | null;
}
export type EnforceResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; response: NextResponse };

export async function enforce(
  request: NextRequest,
  policyName: PolicyName,
  args: EnforceArgs = {},
): Promise<EnforceResult> {
  // `satisfies` narrows each entry to its literal shape (most omit `email`); widen back to Policy so
  // the optional `email` leg is visible. The interface is the contract.
  const policy: Policy = policies[policyName];
  const ip = clientIp(request.headers);

  const checks: Array<Promise<LimitResult | null>> = [];
  for (const inst of policy.ip) checks.push(safeLimit(inst, ipKey(ip)));
  if (args.uid) for (const inst of policy.uid) checks.push(safeLimit(inst, uidKey(args.uid)));
  if (args.email && policy.email)
    for (const inst of policy.email) checks.push(safeLimit(inst, emailKey(args.email)));

  const results = (await Promise.all(checks)).filter((r): r is LimitResult => r !== null);
  if (results.length === 0) return { ok: true, headers: {} }; // all legs threw/timed-out -> fail OPEN

  const denied = results.filter((r) => !r.success);
  if (denied.length > 0) {
    const strictest = pickStricter(denied);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", message: "Too many requests. Slow down and retry." },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders(strictest),
            "Retry-After": String(retryAfterSeconds(strictest.reset, Date.now())),
          },
        },
      ),
    };
  }
  return { ok: true, headers: rateLimitHeaders(pickStricter(results)) };
}
