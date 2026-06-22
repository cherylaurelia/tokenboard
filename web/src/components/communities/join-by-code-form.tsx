"use client";
// Invite-code form. POSTs {code} to /api/v1/communities/join; on success router.push(board path).
// 403 invalid_join_code -> inline error. Model: the claim approve-form (useState phase, fetch, res.ok).
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JoinResponse } from "@tokenboard/contracts";
import panel from "./join-panel.module.css";
import styles from "./join-by-code-form.module.css";

export function JoinByCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/communities/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) setError("Sign in to join a board.");
        else if (data.error === "banned") setError("Your account can't join boards.");
        else if (res.status === 403) setError("That code didn't match any board. Check it and try again.");
        else setError("Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      const data = (await res.json()) as JoinResponse;
      router.push(new URL(data.board_url).pathname); // board_url is absolute; push the path
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className={panel.field} onSubmit={onSubmit}>
      <label htmlFor="invite-code">Invite link or code</label>
      <div className={panel.inputRow}>
        <input
          id="invite-code"
          type="text"
          inputMode="text"
          maxLength={6}
          autoComplete="off"
          placeholder="6-char code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, "").toUpperCase().slice(0, 6))}
          required
        />
        <button
          type="submit"
          className={`${panel.btn} ${panel.btnCoral}`}
          disabled={busy || code.trim().length !== 6}
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      {error && (
        <p className={styles.errorNote} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
