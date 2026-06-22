// §5.3 send. Resend client at MODULE scope (not per-request). resend.emails.send RESOLVES with
// {data,error} and does NOT throw on API errors — MUST branch on error. NEVER log/return the code
// or confirmUrl (it contains the code). Returns a typed result carrying no secret.
import "server-only";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { VerifyEmail } from "@/emails/verify-email";

const resend = new Resend(process.env.RESEND_API_KEY);

export type SendResult = { ok: true } | { ok: false };

export async function sendVerificationEmail(args: {
  to: string;
  code: string;
  confirmUrl: string;
  domain: string;
}): Promise<SendResult> {
  const from = process.env.RESEND_FROM;
  if (!from) {
    console.error("verify/send: RESEND_FROM not set");
    return { ok: false };
  }
  try {
    const { error } = await resend.emails.send({
      from,
      to: [args.to],
      subject: "Your tokenboard verification code",
      react: VerifyEmail({ code: args.code, confirmUrl: args.confirmUrl, domain: args.domain }),
      headers: { "X-Entity-Ref-ID": randomUUID() }, // stop Gmail threading repeated codes
    });
    if (error) {
      console.error("verify/send: resend failed", { name: error.name, message: error.message });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("verify/send: resend threw", { name: (err as Error).name }); // backstop, no code
    return { ok: false };
  }
}
