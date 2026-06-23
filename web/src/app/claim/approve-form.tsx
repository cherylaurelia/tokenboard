"use client";
// Client leaf: Approve / Deny buttons POST {user_code, action} to /api/v1/cli/login/approve.
// The server re-resolves the user from the session (never trusts a client user_id). On
// success shows "return to your terminal" — the token is NEVER shown here (CLI poll delivers it).
import { useState } from "react";
import styles from "./claim.module.css";

type Phase = "idle" | "working" | "approved" | "denied" | "error";

export function ApproveForm({ userCode }: { userCode: string }) {
  const [phase, setPhase] = useState<Phase>("idle");

  async function submit(action: "approve" | "deny") {
    setPhase("working");
    try {
      const res = await fetch("/api/v1/cli/login/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: userCode, action }),
      });
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const data = (await res.json()) as { action?: string };
      setPhase(data.action === "denied" ? "denied" : "approved");
    } catch {
      setPhase("error");
    }
  }

  if (phase === "approved") {
    return (
      <section className={styles.card} role="status">
        <p className={styles.success}>
          Device approved. Return to your terminal — it will finish automatically.
        </p>
      </section>
    );
  }
  if (phase === "denied") {
    return (
      <section className={styles.card} role="status">
        <p className={styles.note}>Request denied. Nothing was linked.</p>
      </section>
    );
  }
  if (phase === "error") {
    return (
      <section className={styles.card}>
        <p className={styles.error} role="alert">
          Something went wrong. Run <code>tokenboard claim</code> again.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <span className={styles.code}>{userCode}</span>
      <p className={styles.note}>
        Make sure this code matches the one shown in your terminal before approving.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnCoral}`}
          onClick={() => submit("approve")}
          disabled={phase === "working"}
        >
          {phase === "working" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => submit("deny")}
          disabled={phase === "working"}
        >
          Deny
        </button>
      </div>
    </section>
  );
}
