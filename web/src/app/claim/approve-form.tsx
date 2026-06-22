"use client";
// Client leaf: Approve / Deny buttons POST {user_code, action} to /api/v1/cli/login/approve.
// The server re-resolves the user from the session (never trusts a client user_id). On
// success shows "return to your terminal" — the token is NEVER shown here (CLI poll delivers it).
import { useState } from "react";

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
    return <p>Device approved. Return to your terminal — it will finish automatically.</p>;
  }
  if (phase === "denied") return <p>Request denied. Nothing was linked.</p>;
  if (phase === "error") {
    return (
      <p>
        Something went wrong. Run <code>tokenboard claim</code> again.
      </p>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => submit("approve")} disabled={phase === "working"}>
        Approve
      </button>
      <button type="button" onClick={() => submit("deny")} disabled={phase === "working"}>
        Deny
      </button>
    </div>
  );
}
