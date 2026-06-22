"use client";
// Ban/unban a user — confirm() then POST the admin route, router.refresh() on success.
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./tuna.module.css";

export function BanToggle({ userId, handle, banned }: { userId: string; handle: string; banned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const verb = banned ? "Unban" : "Ban";
    if (!window.confirm(`${verb} @${handle}? They'll ${banned ? "return to" : "drop from"} the boards.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/ban`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ banned: !banned }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? "Rate limited — wait a minute." : `${verb} failed — try again.`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError(`${verb} failed — check your connection.`);
      setBusy(false);
    }
  }

  return (
    <span className={styles.actionCell}>
      <button
        type="button"
        className={`${styles.btn} ${banned ? styles.btnGhost : styles.btnDanger}`}
        onClick={onClick}
        disabled={busy}
      >
        {busy ? "…" : banned ? "Unban" : "Ban"}
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
