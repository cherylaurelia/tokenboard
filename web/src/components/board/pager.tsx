// Pagination row (dashboard-pixel .pager-row). The §7.2 contract has `limit` but NO offset/cursor,
// so true paging isn't wired yet — this renders the "1–N of M" range label + a cosmetic disabled
// pager (top-N only). The numbered pager stays disabled until a cursor lands (flagged in the PR).
import styles from "./pager.module.css";

export function Pager({ totalEntries, shown }: { totalEntries: number; shown: number }) {
  if (shown === 0) return null;
  return (
    <div className={styles.pagerRow}>
      <span className={styles.range}>
        1&ndash;{shown} of {totalEntries}
      </span>
      <div className={styles.pager}>
        <button type="button" className={`${styles.pg} ${styles.nav}`} disabled aria-label="Previous page">
          &#9664;
        </button>
        <span className={`${styles.pg} ${styles.active}`} aria-current="page">
          1
        </span>
        <button
          type="button"
          className={`${styles.pg} ${styles.nav}`}
          disabled
          aria-label="Next page (more pages coming soon)"
        >
          &#9654;
        </button>
      </div>
    </div>
  );
}
