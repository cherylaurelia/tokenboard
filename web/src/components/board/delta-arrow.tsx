// The ELO-style delta column (dashboard-pixel .elo). Direction comes from the §7.2 delta. We render
// ONE consistent integer magnitude — the absolute rank change — on every row (teal ▲ up / coral ▼
// down / dim – flat or new), never a % or a per-row "1w" label (the column legend explains it once).
import type { BoardDelta } from "@tokenboard/contracts";
import styles from "./delta-arrow.module.css";

export function DeltaArrow({ delta, className }: { delta: BoardDelta; className?: string }) {
  const mag = Math.abs(delta.rankChange);
  const cls = `${styles.elo} ${className ?? ""}`;

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
  // flat + new render the same neutral dash (no prior rank to compare).
  return (
    <span className={`${cls} ${styles.flat}`}>
      <span className={styles.ar} aria-hidden="true">
        –
      </span>
    </span>
  );
}
