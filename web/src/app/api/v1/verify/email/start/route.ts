// POST /api/v1/verify/email/start (auth: session). §5.3 START. nodejs runtime (node:dns + node:crypto
// + Resend). Order: getUser -> banned -> normalize -> denylist -> MX(new domain only; transient->503)
// -> throttle -> replace prior pending (DELETE-then-INSERT in a tx; the pending index is NOT unique)
// -> mint+hash (domain in the hash; bytea via Drizzle) -> Resend send. NEVER log/return the code.
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { emailVerifications } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyEmailStartRequestSchema, verifyEmailStartResponseSchema } from "@tokenboard/contracts";
import { normalizeWorkEmail } from "@/lib/verify/email-normalize";
import { blockedProvider } from "@/lib/verify/provider-denylist";
import { checkDomainMx } from "@/lib/verify/mx";
import { checkSendThrottle } from "@/lib/verify/throttle";
import { mintOtpCode, hashOtp } from "@/lib/verify/code";
import { sendVerificationEmail } from "@/lib/verify/send-code-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TTL_SEC = 900; // 15m

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = verifyEmailStartRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const banned = (await db.execute(
    sql`select 1 from users where id = ${user.id} and banned_at is not null limit 1`,
  )) as unknown as Array<unknown>;
  if (banned.length > 0) return NextResponse.json({ error: "banned" }, { status: 403 });

  const norm = normalizeWorkEmail(parsed.data.email);
  if (!norm.ok) {
    return NextResponse.json({ error: "invalid_email", message: "Enter a valid work email." }, { status: 400 });
  }
  const { normalized, domain } = norm;

  if (blockedProvider(domain)) {
    return NextResponse.json(
      {
        error: "personal_provider",
        message: "Use your work email; personal providers (gmail, outlook, ...) can't form a company board.",
      },
      { status: 400 },
    );
  }

  // MX only needed to CREATE a new board — skip if a board already exists for the domain.
  const boardExists = (await db.execute(
    sql`select 1 from community_email_domains where domain = ${domain} limit 1`,
  )) as unknown as Array<unknown>;
  if (boardExists.length === 0) {
    const mx = await checkDomainMx(domain);
    if (mx === "no_mx") {
      return NextResponse.json(
        { error: "no_mx", message: `We couldn't find email service for ${domain}. Check the spelling or try another work email.` },
        { status: 400 },
      );
    }
    if (mx === "unavailable") {
      return NextResponse.json(
        { error: "dns_unavailable", message: "Couldn't reach DNS right now. Try again in a moment." },
        { status: 503 },
      );
    }
  }

  const throttle = await checkSendThrottle(user.id, domain);
  if (!throttle.ok) {
    return NextResponse.json(
      { error: "too_many_requests", message: "Wait before requesting another code." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } },
    );
  }

  const code = mintOtpCode();
  const codeHash = hashOtp(user.id, domain, code); // per-(user,domain) salt -> no global collision

  // The pending index is NOT unique -> DELETE prior pending then INSERT fresh (one outstanding code
  // per (user,domain), §5.3). Drizzle for the bytea write (PostgREST can't serialize a Buffer).
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`delete from email_verifications where user_id = ${user.id} and domain = ${domain} and consumed_at is null`,
      );
      await tx.insert(emailVerifications).values({
        userId: user.id,
        email: normalized, // transient (15m); needed to address the send. Scrubbed on confirm.
        domain,
        codeHash,
        expiresAt: sql`now() + interval '900 seconds'`,
        attempts: 0,
      });
    });
  } catch (err) {
    console.error(`verify/start: persist failed (${(err as { code?: string }).code ?? "unknown"})`); // never the code
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Magic link points at the canonical §5.3 path /verify/email/confirm — a real PAGE is hosted there.
  // Absolute URL (relative is meaningless in an email); origin from THIS request.
  const confirmUrl = `${request.nextUrl.origin}/verify/email/confirm?domain=${encodeURIComponent(domain)}&code=${code}`;
  const sent = await sendVerificationEmail({ to: normalized, code, confirmUrl, domain });
  if (!sent.ok) {
    // Fail loud about the SEND; silent about the secret. The pending row stays (replaced next start,
    // expires in 15m) but surface the failure so the user can retry.
    return NextResponse.json(
      { error: "email_send_failed", message: "Could not send the code; try again." },
      { status: 502 },
    );
  }

  return NextResponse.json(
    verifyEmailStartResponseSchema.parse({ sent: true, domain, expires_in: TTL_SEC }),
    { status: 200 },
  );
}
