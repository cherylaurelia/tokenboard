"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JoinResponse } from "@tokenboard/contracts";
import { parseInviteCode } from "@/lib/communities/invite-link";
import panel from "./join-panel.module.css";
import styles from "./join-by-code-form.module.css";

export function JoinByCodeForm({ autoCode }: { autoCode?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(autoCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSubmitted = useRef(false);

  async function join(rawInput: string) {
    const code = parseInviteCode(rawInput);
    if (!code) {
      setError("Paste a valid invite link or 6-char code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/communities/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
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
      router.push(new URL(data.board_url).pathname);
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoCode && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void join(autoCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCode]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void join(value);
  }

  return (
    <form className={panel.field} onSubmit={onSubmit}>
      <label htmlFor="invite-code">Invite link or code</label>
      <div className={panel.inputRow}>
        <input
          id="invite-code"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="Paste an invite link or 6-char code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
        <button
          type="submit"
          className={`${panel.btn} ${panel.btnCoral}`}
          disabled={busy || parseInviteCode(value) === null}
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
