// PURE identifier helpers — no Redis, no next/server, no server-only (so the bare
// `node --import tsx --test` runner loads it). Takes a header accessor, NOT a NextRequest, so the
// pure parsing is testable without the Next runtime.
//
// IP TRUST: on Vercel, x-forwarded-for is OVERWRITTEN by the platform to a single, non-spoofable
// client IP (client-supplied XFF is dropped) and x-real-ip mirrors it. So the value is a single
// address, not a client-controlled multi-hop chain. We still split(",")[0] because it is the correct
// LEFT-most-is-client choice IF a Trusted-Proxy chain is ever enabled — harmless on the single-value
// case. Do NOT "fix" this to a different hop.
export interface HeaderGet {
  get(name: string): string | null;
}

export function clientIp(headers: HeaderGet): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

export const uidKey = (id: string): string => `uid:${id}`;
export const ipKey = (addr: string): string => `ip:${addr}`;
export const emailKey = (email: string): string => `email:${email}`;
