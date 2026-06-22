// Signed rebuild trigger (§7.6). Same QStash signature gate as the sweep. Rebuilds all boards from
// Postgres (Redis loss = non-event). Idempotent + hot-safe. nodejs runtime, force-dynamic.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Receiver } from "@upstash/qstash";
import { rebuildBoardsFromPostgres } from "@/lib/leaderboard/rebuild";
import { sweepPublicUrl } from "@/lib/leaderboard/sweep-public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function receiver(): Receiver {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error("leaderboard-rebuild: QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY must be set");
  }
  return new Receiver({ currentSigningKey, nextSigningKey });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
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
    console.error("leaderboard-rebuild: QStash signature verify failed for url", url);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const result = await rebuildBoardsFromPostgres();
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
