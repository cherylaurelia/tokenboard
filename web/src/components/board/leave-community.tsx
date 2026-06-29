"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./community-panel.module.css";

export function LeaveCommunity({
  communityId,
  name,
}: {
  communityId: string;
  name: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/communities/${communityId}/leave`, { method: "POST" });
    if (res.ok) {
      router.push("/communities");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(
      data.error === "last_owner"
        ? "You're the only owner — transfer ownership before leaving."
        : "Couldn't leave. Try again.",
    );
    setBusy(false);
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className={styles.leaveConfirm}>
        <p className={styles.leaveAsk}>Leave {name}? You can rejoin later.</p>
        <div className={styles.leaveActions}>
          <button type="button" className={styles.leaveYes} onClick={leave} disabled={busy}>
            {busy ? "Leaving…" : "Yes, leave"}
          </button>
          <button
            type="button"
            className={styles.leaveCancel}
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.leaveWrap}>
      {error && (
        <p className={styles.leaveError} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={styles.leaveBtn} onClick={() => setConfirming(true)}>
        Leave Community
      </button>
    </div>
  );
}
