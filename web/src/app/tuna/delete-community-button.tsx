"use client";
// Destructive + irreversible: deleting a board cascades every membership (incl. verified company
// members -> drops their company badge on next prof rebuild). Stronger than a bare confirm() — the
// owner must TYPE the slug.
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./tuna.module.css";

export function DeleteCommunityButton({
  communityId,
  slug,
  name,
  memberCount,
}: {
  communityId: string;
  slug: string;
  name: string;
  memberCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/communities/${communityId}/delete`, { method: "POST" });
      if (!res.ok) {
        setError(res.status === 429 ? "Rate limited — wait a minute." : "Delete failed — try again.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Delete failed — check your connection.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setOpen(true)}>
        Delete board…
      </button>
    );
  }

  return (
    <div className={styles.confirmBox} role="group" aria-label={`Delete ${name}`}>
      <p className={styles.confirmWarn}>
        Deletes <strong>{name}</strong> and removes {memberCount} member(s). Irreversible. Type{" "}
        <code>{slug}</code> to confirm.
      </p>
      <div className={styles.confirmRow}>
        <label htmlFor={`del-${communityId}`} className={styles.srOnly}>
          Type the slug to confirm
        </label>
        <input
          id={`del-${communityId}`}
          className={styles.input}
          value={confirmText}
          autoComplete="off"
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={slug}
        />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          disabled={busy || confirmText !== slug}
          onClick={onDelete}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
