"use client";

// Metric toggle ($ SPENT / TOKENS) — client leaf. A segmented <button> group that pushes ?metric=
// (preserving the current window) so the server page re-renders with the chosen metric. useTransition
// keeps the UI responsive during the server round-trip. aria-pressed marks the active button.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { BoardWindow, BoardMetric } from "@tokenboard/contracts";
import styles from "./controls.module.css";

const OPTIONS: { metric: BoardMetric; label: string }[] = [
  { metric: "cost", label: "$ Spent" },
  { metric: "tokens", label: "Tokens" },
];

export function MetricToggle({
  current,
  basePath,
  window,
}: {
  current: BoardMetric;
  basePath: string;
  window: BoardWindow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.metricToggle} role="group" aria-label="Metric">
      {OPTIONS.map((o) => {
        const active = o.metric === current;
        return (
          <button
            key={o.metric}
            type="button"
            aria-pressed={active}
            disabled={pending}
            className={`${styles.mt} ${active ? styles.mtActive : ""}`}
            onClick={() => {
              if (active) return;
              const params = new URLSearchParams({ window, metric: o.metric });
              startTransition(() => router.push(`${basePath}?${params.toString()}`, { scroll: false }));
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
