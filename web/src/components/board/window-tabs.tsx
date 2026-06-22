"use client";

// Window tabs (7 Days / 30 Days / All-Time) — client leaf. Each is a <Link> that sets ?window= while
// preserving the current metric, so the SERVER page re-reads searchParams and re-renders the real
// board (no client data-fetch). aria-current marks the active tab. NOTE: the prototype's 4th "TODAY"
// pill is intentionally not rendered — the contract window enum has no "today"/"1d" (flagged in PR).
import Link from "next/link";
import type { BoardWindow, BoardMetric } from "@tokenboard/contracts";
import { WINDOW_TABS, windowLabel } from "@/lib/board/web-defaults";
import styles from "./controls.module.css";

export function WindowTabs({
  current,
  basePath,
  metric,
}: {
  current: BoardWindow;
  basePath: string;
  metric: BoardMetric;
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Time window">
      {WINDOW_TABS.map((w) => {
        const params = new URLSearchParams({ window: w, metric });
        const active = w === current;
        return (
          <Link
            key={w}
            href={`${basePath}?${params.toString()}`}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={`${styles.tab} ${active ? styles.tabActive : ""}`}
          >
            {windowLabel(w)}
          </Link>
        );
      })}
    </div>
  );
}
