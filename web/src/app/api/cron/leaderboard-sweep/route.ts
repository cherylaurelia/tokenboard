// QStash-triggered nightly sweep (00:10 UTC). Verify the QStash signature with the raw Receiver
// (read req.text() ONCE), verifying against the EXTERNAL url QStash signed (sweepPublicUrl), NOT
// request.url (proxy URL mismatch would 401 every real sweep). 401 on missing/invalid signature.
// Idempotent. nodejs runtime (Drizzle), force-dynamic.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Receiver } from "@upstash/qstash";
import { runLeaderboardSweep } from "@/lib/leaderboard/sweep";
import { sweepPublicUrl } from "@/lib/leaderboard/sweep-public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function receiver(): Receiver {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error("leaderboard-sweep: QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY must be set");
  }
  return new Receiver({ currentSigningKey, nextSigningKey });
}

export async function POST(request: NextRequest) {
  const body = await request.text(); // read ONCE; the signature is over the raw body
  const signature = request.headers.get("upstash-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 401 });

  const url = sweepPublicUrl(request);
  let valid = false;
  try {
    valid = await receiver().verify({ body, signature, url });
  } catch {
    valid = false;
  }
  if (!valid) {
    // Log the reconstructed url (NEVER the signature/keys) for prod URL-mismatch diagnosis.
    console.error("leaderboard-sweep: QStash signature verify failed for url", url);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const result = await runLeaderboardSweep();
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
