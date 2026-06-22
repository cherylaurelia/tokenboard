// POST /api/v1/cli/login/start (auth: none). Creates a device_grants row and returns the
// device-authorization envelope (RFC 8628 §3.2 shape; ARCH §3 routes table). Writes via
// supabaseAdmin (service_role) because device_grants is RLS fail-closed. device_code is
// HASHED AT REST per the ARCH §2.1 DDL comment: device_grants.device_code stores
// sha256Hex(raw); poll MUST hash with the identical sha256Hex before lookup. The RAW
// device_code leaves the server ONCE, here, and is never stored raw and never logged.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cliLoginStartRequestSchema } from "@tokenboard/contracts";
import { genDeviceCode, sha256Hex, saltMachineHash } from "@/lib/cli-login/token";
import { genUserCode } from "@/lib/cli-login/user-code";

export const dynamic = "force-dynamic"; // never cache a token-minting route

const GRANT_TTL_SEC = 600; // ~10 min (ARCH §4.3 / §2.1)
const POLL_INTERVAL_SEC = 5;
const USER_CODE_COLLISION_RETRIES = 5;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = cliLoginStartRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const deviceCode = genDeviceCode(); // raw, returned once
  const deviceCodeHash = sha256Hex(deviceCode); // stored at rest; poll re-hashes to look up
  const machineHash = saltMachineHash(parsed.data.machine_hash); // re-salt; never bare, never PII
  const expiresAt = new Date(Date.now() + GRANT_TTL_SEC * 1000).toISOString();

  // user_code is human-typed/low-entropy -> retry on the (rare) unique collision rather than 500.
  let userCode = "";
  for (let attempt = 0; attempt < USER_CODE_COLLISION_RETRIES; attempt++) {
    userCode = genUserCode();
    const { error } = await supabaseAdmin.from("device_grants").insert({
      device_code: deviceCodeHash,
      user_code: userCode,
      machine_hash: machineHash,
      status: "pending",
      interval_sec: POLL_INTERVAL_SEC,
      expires_at: expiresAt,
    });
    if (!error) break;
    // 23505 = unique_violation (almost certainly the user_code). Retry; otherwise fail loud.
    if (error.code !== "23505" || attempt === USER_CODE_COLLISION_RETRIES - 1) {
      console.error(`cli/login/start: insert failed (${error.code ?? "unknown"})`);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  }

  // verification_url uses THIS request's origin (dev vs prod) so a dev CLI opens the dev /claim.
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    device_code: deviceCode, // RAW — the only time it leaves the server
    user_code: userCode,
    verification_url: `${origin}/claim?code=${userCode}`,
    interval: POLL_INTERVAL_SEC,
    expires_in: GRANT_TTL_SEC,
  });
}
