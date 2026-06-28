// The ELO-style delta column (dashboard-pixel .elo). Direction comes from the §7.2 delta. We render
// ONE consistent integer magnitude — the absolute rank change — on every row (teal ▲ up / coral ▼
// down / dim – flat), never a % or a per-row "1w" label (the column legend explains it once). A
// brand-new entrant (no prior-period snapshot) shows a "NEW" badge instead of a bare dash, so when a
// newcomer ranks above existing users — pushing them down — the drops have a VISIBLE cause (rank is
// relative; without this, a new arrival makes others' ▼ look unexplained).
import type { BoardDelta } from "@tokenboard/contracts";
import styles from "./delta-arrow.module.css";

export function DeltaArrow({ delta, className }: { delta: BoardDelta; className?: string }) {
  const mag = Math.abs(delta.rankChange);
  const cls = `${styles.elo} ${className ?? ""}`;

  if (delta.direction === "new") {
    return <span className={`${cls} ${styles.new}`}>NEW</span>;
  }

  if (delta.direction === "up") {
    return (
      <span className={`${cls} ${styles.up}`}>
        <span className={styles.ar} aria-hidden="true">
          ▲
        </span>{" "}
        {mag}
      </span>
    );
  }
  if (delta.direction === "down") {
    return (
      <span className={`${cls} ${styles.down}`}>
        <span className={styles.ar} aria-hidden="true">
          ▼
        </span>{" "}
        {mag}
      </span>
    );
  }
  // flat renders the neutral dash (on the board last period, same rank now).
  return (
    <span className={`${cls} ${styles.flat}`}>
      <span className={styles.ar} aria-hidden="true">
        –
      </span>
    </span>
  );
}
