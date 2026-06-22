import type { NextRequest } from "next/server";

// Reconstruct the EXTERNAL URL QStash signed the request against. QStash signs the schedule
// DESTINATION url (e.g. https://tokenboard.sh/api/cron/leaderboard-sweep); behind a proxy
// request.url is the internal origin and would fail Receiver.verify. Prefer SWEEP_PUBLIC_URL
// (the deploy's public origin); fall back to x-forwarded-proto/host; last resort request.url.
export function sweepPublicUrl(request: NextRequest): string {
  const path = request.nextUrl.pathname;
  const base = process.env.SWEEP_PUBLIC_URL?.trim();
  if (base) return `${base.replace(/\/+$/, "")}${path}`;

  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (proto && host) return `${proto}://${host}${path}`;

  return request.url;
}
