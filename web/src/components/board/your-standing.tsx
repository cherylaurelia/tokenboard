// YOUR STANDING rail panel (dashboard-pixel .you-panel). Shows the caller's avatar, @handle, rank,
// big money, and delta — NOTHING else (no sparkline; the board prototype has none). Server component.
// Reads from the §7.2 me union: the caller's entry is either in entries[] (inTopN) or carried on
// me.entry (outOfTopN). Renders nothing when the viewer is signed out or has no ranked row.
import type { BoardEntry, BoardMe, BoardMetric } from "@tokenboard/contracts";
import type { Viewer } from "@/lib/auth/get-viewer";
import { formatUsd2dp } from "@/lib/format/money";
import { MetricValue } from "./metric-value";
import { DeltaArrow } from "./delta-arrow";
import styles from "./your-standing.module.css";

export function YourStanding({
  me,
  entries,
  metric,
  viewer,
  aliasCompany = false,
}: {
  me: BoardMe;
  entries: BoardEntry[];
  metric: BoardMetric;
  viewer: Viewer | null;
  aliasCompany?: boolean;
}) {
  if (!viewer || !me) return null;

  // Resolve the caller's row: from entries[] when in the top-N, else from me.entry.
  const entry = me.inTopN ? entries.find((e) => e.isMe) ?? null : me.entry;
  if (!entry) return null;

  const label = aliasCompany ? `member #${me.rank}` : `@${entry.handle}`;

  return (
    <section className={styles.panel}>
      <h2 className={styles.phead}>Your Standing</h2>
      <div className={styles.standing}>
        {aliasCompany || !entry.avatar ? (
          <span className={`${styles.pfpLg} ${styles.pfpGeneric} noPixelate`} aria-hidden="true" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={`${styles.pfpLg} noPixelate`} src={entry.avatar} alt="" loading="lazy" />
        )}
        <div className={styles.who}>
          {aliasCompany ? (
            <span className={styles.name}>{label}</span>
          ) : (
            <a className={styles.identity} href={`/user/${entry.handle}`}>
              {entry.displayName && <span className={styles.name}>{entry.displayName}</span>}
              <span className={styles.at}>@{entry.handle}</span>
            </a>
          )}
          <span className={styles.rank}>Rank #{me.rank}</span>
        </div>
      </div>
      <div className={styles.stats}>
        <span className={styles.big}>
          {metric === "cost" ? formatUsd2dp(entry.cost) : <MetricValue entry={entry} metric={metric} />}
        </span>
        <DeltaArrow delta={entry.delta} className={styles.bigElo} />
      </div>
    </section>
  );
}
