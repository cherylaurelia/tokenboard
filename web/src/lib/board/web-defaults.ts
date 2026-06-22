// The single source for web-surface display defaults. The §7.2 contract defaults metric to
// "tokens", but the dollars-forward prototypes default to "$ SPENT" — so the WEB surface overrides
// to "cost" in ONE documented place rather than scattering `?? "cost"` across pages. The board page,
// profile, OG route and nav all import this so there is no drift.
import type { BoardWindow, BoardMetric } from "@tokenboard/contracts";

export const WEB_DEFAULT_METRIC: BoardMetric = "cost";
export const WEB_DEFAULT_WINDOW: BoardWindow = "7d";

// Uppercase tab/label text for a window (the prototype's "7 DAYS" / "30 DAYS" / "ALL-TIME").
const WINDOW_LABELS: Record<BoardWindow, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  all: "All-Time",
};

export function windowLabel(w: BoardWindow): string {
  return WINDOW_LABELS[w];
}

// The ordered set of window tabs the board renders. NOTE: the prototype shows a 4th "TODAY" pill,
// but the contract window enum is exactly ["7d","30d","all"] — no "today"/"1d". We render these
// three rather than silently mislabel 7d data as "today" (flagged for sign-off in the PR).
export const WINDOW_TABS: BoardWindow[] = ["7d", "30d", "all"];
