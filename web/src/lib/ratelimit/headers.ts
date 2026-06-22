// PURE rate-limit math: NO Redis, NO next/server. `reset` is Unix MILLISECONDS in the @upstash TS SDK
// — divide by 1000 (ceil) for X-RateLimit-Reset and Retry-After (both seconds), else they are ~1000x
// too large. Stricter-wins = the SMALLER remaining; tie on remaining -> the LARGER reset (tell the
// client the longer wait).
export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms
}

export function pickStricter(results: LimitResult[]): LimitResult {
  if (results.length === 0) throw new Error("pickStricter: no results to compare");
  return results.reduce((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining < a.remaining ? b : a;
    return b.reset > a.reset ? b : a;
  });
}

export function resetSeconds(reset: number): number {
  return Math.ceil(reset / 1000);
}

export function retryAfterSeconds(reset: number, now: number): number {
  return Math.max(0, Math.ceil((reset - now) / 1000));
}

export function rateLimitHeaders(r: LimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
    "X-RateLimit-Reset": String(resetSeconds(r.reset)),
  };
}
