"use client";
// Phase machine: email -> (start) -> otp -> (confirm) -> done. Magic link (domain+code) auto-confirms
// on mount. OTP input strips non-digits so a paste artifact never wastes a lockout attempt. messageFor
// maps EVERY route error code to actionable copy. No localStorage.
import { useEffect, useState } from "react";
import type { VerifyEmailStartResponse, VerifyEmailConfirmResponse } from "@tokenboard/contracts";
import styles from "./verify.module.css";

type Phase = "email" | "sending" | "otp" | "confirming" | "done" | "error";

export function VerifyFlow({ magicDomain, magicCode }: { magicDomain: string | null; magicCode: string | null }) {
  const hasMagic = Boolean(magicDomain && magicCode);
  const [phase, setPhase] = useState<Phase>(hasMagic ? "confirming" : "email");
  const [email, setEmail] = useState("");
  const [domain, setDomain] = useState(magicDomain ?? "");
  const [code, setCode] = useState(magicCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyEmailConfirmResponse | null>(null);

  useEffect(() => {
    if (hasMagic) void confirm(magicDomain as string, magicCode as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    setPhase("sending");
    setError(null);
    const res = await fetch("/api/v1/verify/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(messageFor(res.status, data.error) ?? data.message ?? "Couldn't send a code.");
      setPhase("email");
      return;
    }
    const ok = data as VerifyEmailStartResponse;
    setDomain(ok.domain);
    setCode("");
    setPhase("otp");
  }

  async function confirm(d: string, c: string, e?: React.FormEvent) {
    e?.preventDefault();
    setPhase("confirming");
    setError(null);
    const res = await fetch("/api/v1/verify/email/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: d, code: c.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(messageFor(res.status, data.error) ?? data.message ?? "Couldn't verify the code.");
      setPhase(hasMagic ? "error" : "otp");
      return;
    }
    setResult(data as VerifyEmailConfirmResponse);
    setPhase("done");
  }

  if (phase === "done" && result) {
    return (
      <section className={styles.card} role="status">
        <p className={styles.success}>
          You&rsquo;re verified. You joined the <strong>{domain}</strong> company board.
        </p>
        <a className={`${styles.btn} ${styles.btnCoral}`} href={`/community/${result.community.slug}`}>
          Go to your board
        </a>
      </section>
    );
  }

  if (phase === "otp" || phase === "confirming") {
    return (
      <form className={styles.card} onSubmit={(e) => confirm(domain, code, e)}>
        <p className={styles.note}>
          We emailed a 6-digit code to your address at <strong>{domain}</strong>. Paste it below.
        </p>
        <label htmlFor="otp">Verification code</label>
        <input
          id="otp"
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={styles.input}
          required
          disabled={phase === "confirming"}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnCoral}`}
          disabled={phase === "confirming" || !/^[0-9]{6}$/.test(code)}
        >
          {phase === "confirming" ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => {
            setPhase("email");
            setCode("");
            setError(null);
          }}
        >
          Use a different email
        </button>
      </form>
    );
  }

  if (phase === "error") {
    return (
      <section className={styles.card}>
        <p className={styles.error} role="alert">
          {error}
        </p>
        <button
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => {
            setPhase("email");
            setError(null);
          }}
        >
          Start over
        </button>
      </section>
    );
  }

  // email / sending
  return (
    <form className={styles.card} onSubmit={start}>
      <label htmlFor="work-email">Work email</label>
      <input
        id="work-email"
        type="email"
        autoComplete="email"
        placeholder="you@acme-corp.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={styles.input}
        required
        disabled={phase === "sending"}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className={`${styles.btn} ${styles.btnCoral}`}
        disabled={phase === "sending" || !email.includes("@")}
      >
        {phase === "sending" ? "Sending…" : "Send code"}
      </button>
    </form>
  );
}

function messageFor(status: number, code: string | undefined): string | null {
  if (code === "personal_provider") return "Use your work email — personal providers can't form a company board.";
  if (code === "no_mx") return "That domain can't receive email. Check the spelling.";
  if (code === "dns_unavailable") return "Couldn't reach DNS right now. Try again in a moment.";
  if (code === "invalid_email") return "Enter a valid work email.";
  if (code === "invalid_code") return "Wrong code. Check the email and try again.";
  if (code === "no_pending_verification") return "That code expired or was already used. Send a fresh one.";
  if (code === "too_many_attempts") return "Too many tries. Start over to get a fresh code.";
  if (code === "too_many_requests") return "Wait a moment before requesting another code.";
  if (code === "email_send_failed") return "We couldn't send the code right now. Try again in a moment.";
  if (code === "banned") return "Your account can't verify a work email.";
  if (status === 401) return "Sign in first, then verify.";
  return null;
}
