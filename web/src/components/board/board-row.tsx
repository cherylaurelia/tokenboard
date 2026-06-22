// One flat-divider leaderboard row (dashboard-pixel .pl). Server component. Layout: rank / avatar /
// identity+metric+delta. Top-3 get medal colors; the caller's row (isMe or pinned) gets the coral
// tint + the [★ You] pill. On a company board (aliasCompany) every row is aliased by rank ("member
// #n", generic avatar, no profile link) — the §7.2 privacy gate until a Phase-8 opt-in exists.
import type { BoardEntry, BoardMetric } from "@tokenboard/contracts";
import { MetricValue } from "./metric-value";
import { DeltaArrow } from "./delta-arrow";
import styles from "./board-row.module.css";

const MEDAL = ["", styles.r1, styles.r2, styles.r3] as const;

export function BoardRow({
  entry,
  metric,
  aliasCompany = false,
  pinned = false,
}: {
  entry: BoardEntry;
  metric: BoardMetric;
  aliasCompany?: boolean;
  pinned?: boolean;
}) {
  const mine = entry.isMe || pinned;
  const medal = entry.rank <= 3 ? MEDAL[entry.rank] : "";
  const rowClass = `${styles.pl} ${medal} ${mine ? styles.you : ""}`;

  const avatarAlt = aliasCompany ? "" : entry.displayName ?? `@${entry.handle}`;
  // Company-board rows are aliased by rank (no real identity). Otherwise show the display name on
  // top + the @handle below; degrade to just the @handle when there's no display name.
  const displayName = !aliasCompany ? entry.displayName ?? null : null;

  return (
    <li className={rowClass}>
      <span className={styles.rk}>{entry.rank}</span>
      {aliasCompany || !entry.avatar ? (
        <span className={`${styles.pfp} ${styles.pfpGeneric} noPixelate`} aria-hidden="true" />
      ) : (
        // plain <img> matches the prototype + avoids the optimizer/remotePatterns config
        // eslint-disable-next-line @next/next/no-img-element
        <img className={`${styles.pfp} noPixelate`} src={entry.avatar} alt={avatarAlt} loading="lazy" />
      )}
      <div className={styles.plTop}>
        {aliasCompany ? (
          // aliased rows have a single label (no @handle line) -> keep the prominent .name styling
          <span className={styles.name}>member #{entry.rank}</span>
        ) : (
          <a className={styles.whoLink} href={`/user/${entry.handle}`}>
            {displayName && <span className={styles.name}>{displayName}</span>}
            <span className={styles.at}>@{entry.handle}</span>
          </a>
        )}
        {mine && <span className={styles.tagYou}>★ You</span>}
        <MetricValue entry={entry} metric={metric} />
        <DeltaArrow delta={entry.delta} />
      </div>
    </li>
  );
}
