// Renders a board entry's ranked metric: cost ($1,180.00) or tokens (12.4 + a dimmer "M" unit).
// Server component, pure presentation.
import type { BoardEntry, BoardMetric } from "@tokenboard/contracts";
import { formatUsd2dp, humanizeTokens } from "@/lib/format/money";
import styles from "./metric-value.module.css";

export function MetricValue({ entry, metric }: { entry: BoardEntry; metric: BoardMetric }) {
  if (metric === "cost") {
    return <span className={styles.tok}>{formatUsd2dp(entry.cost)}</span>;
  }
  const { value, unit } = humanizeTokens(entry.tokens);
  return (
    <span className={styles.tok}>
      {value}
      {unit && <span className={styles.m}>{unit}</span>}
    </span>
  );
}
