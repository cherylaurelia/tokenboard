"use client";
// Lazy ranks: a native <details> that fetches /api/v1/admin/communities/:id/ranks ONCE on first
// expand, then renders the ranked rows. RSC renders eagerly regardless of open state, so doing the
// assembleBoard per-community on the server page would be an N+1; this makes the cost track what the
// admin actually opens. Zero work + zero network until expanded.
import { useState } from "react";
import { formatUsd2dp, humanizeTokens } from "@/lib/format/money";
import styles from "./tuna.module.css";

interface RankRow {
  rank: number;
  handle: string;
  cost: number;
  tokens: number;
}

export function CommunityRanks({ communityId }: { communityId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [rows, setRows] = useState<RankRow[]>([]);
  const [total, setTotal] = useState(0);

  async function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || state === "loading" || state === "done") return;
    setState("loading");
    try {
      const res = await fetch(`/api/v1/admin/communities/${communityId}/ranks`);
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as { totalEntries: number; entries: RankRow[] };
      setRows(data.entries);
      setTotal(data.totalEntries);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <details className={styles.ranks} onToggle={onToggle}>
      <summary className={styles.ranksSummary}>Ranks{state === "done" ? ` (${total})` : ""}</summary>
      {state === "loading" && <p className={styles.empty}>Loading ranks…</p>}
      {state === "error" && (
        <p className={styles.error} role="alert">
          Couldn&rsquo;t load ranks — expand again to retry.
        </p>
      )}
      {state === "done" &&
        (rows.length === 0 ? (
          <p className={styles.empty}>No ranked members yet.</p>
        ) : (
          <ol className={styles.rankList}>
            {rows.map((r) => {
              const { value, unit } = humanizeTokens(r.tokens);
              return (
                <li key={r.handle} className={styles.rankRow}>
                  <span className={styles.num}>{r.rank}</span>
                  <span className={styles.handle}>@{r.handle}</span>
                  <span className={styles.spacer} />
                  <span className={styles.num}>{formatUsd2dp(r.cost)}</span>
                  <span className={styles.muted}>{unit ? `${value}${unit}` : value} tok</span>
                </li>
              );
            })}
          </ol>
        ))}
    </details>
  );
}
