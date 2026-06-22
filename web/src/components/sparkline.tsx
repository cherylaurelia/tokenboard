// SVG sparkline fed by §7.2 entries[].sparkline ({date,tokens}[]). Server component, pure. A single
// coral stroke with a dot on the latest point. PLACEMENT: the board prototype has no sparkline, so
// this lives only on the PROFILE page (which has no prototype — free design). aria-label carries the
// trend meaning; image-rendering:auto keeps it smooth on the arcade surface.
import type { SparklinePoint } from "@tokenboard/contracts";
import styles from "./sparkline.module.css";

const W = 240;
const H = 40;
const P = 2;

export function Sparkline({ points, className }: { points: SparklinePoint[]; className?: string }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.tokens);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const stepX = (W - P * 2) / (points.length - 1);
  const yFor = (t: number) => H - P - ((t - min) / span) * (H - P * 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(P + i * stepX).toFixed(1)},${yFor(p.tokens).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1]!;
  const lastX = (P + (points.length - 1) * stepX).toFixed(1);
  const lastY = yFor(last.tokens).toFixed(1);

  return (
    <svg
      className={`${styles.spark} ${className ?? ""}`}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`Usage trend over the last ${points.length} days`}
    >
      <path className={styles.line} d={path} fill="none" />
      <circle className={styles.dot} cx={lastX} cy={lastY} r="2.5" />
    </svg>
  );
}
