import type { LocalSummary } from "../aggregate/summary.js";
import type { TerminalStyle } from "./terminal-style.js";
import { styler } from "./terminal-style.js";
import { glyphs, padCell, rule, row } from "./box.js";
import { humanizeTokens, formatApproxUsd } from "./humanize.js";
import { sparkline } from "./sparkline.js";

// PURE: render the local preview to a string (render-once-and-exit, screenshot-clean).
// The "~$" is ALWAYS a labeled estimate with the dim "server is authoritative" footnote;
// it is NEVER transmitted. The board shows THIS machine's own per-tool usage — not ranks
// vs other people (that needs server data; deferred to Phase 6/7). The claim-CTA footer
// is cosmetic text only (TTY-only) — it persists nothing and calls no stub.
export function renderLocalPreview(summary: LocalSummary, style: TerminalStyle): string {
  const c = styler(style);
  const g = glyphs(style.ascii);
  const lines: string[] = [];

  // Headline.
  lines.push(
    c.bold(`you burned ${humanizeTokens(summary.totalTokens)} tokens`) +
      ` · ${formatApproxUsd(summary.totalCostUsd)} est`,
  );
  lines.push("");
  lines.push(c.dim("🪙 tokenboard · your local usage by day"));

  // Daily breakdown table (newest last), with a TOTAL row — like ccusage's daily report.
  // Columns: date | tokens | ~$ est. The per-day series also drives the headline sparkline below.
  const headers = ["date", "tokens", "~$ est"];
  const aligns = ["left", "right", "right"] as const;
  const bodyRows = summary.perDay.map((d) => [
    d.date,
    humanizeTokens(d.tokens),
    formatApproxUsd(d.costUsd),
  ]);
  const totalRow = ["TOTAL", humanizeTokens(summary.totalTokens), formatApproxUsd(summary.totalCostUsd)];

  // Width each column to the widest cell across headers + body + the total row.
  const allRows = [headers, ...bodyRows, totalRow];
  const colWidths = headers.map((_, col) =>
    Math.max(...allRows.map((r) => [...r[col]!].length), 1),
  );

  const cellAlign = (i: number): "left" | "right" => aligns[i] ?? "left";
  const width = (i: number): number => colWidths[i] ?? 1;
  const renderRow = (cells: string[]) =>
    row(cells.map((cell, i) => padCell(cell, width(i), cellAlign(i))), g);

  lines.push(rule(colWidths, "top", g));
  lines.push(renderRow(headers));
  lines.push(rule(colWidths, "mid", g));
  for (const r of bodyRows) lines.push(renderRow(r));
  lines.push(rule(colWidths, "mid", g)); // separate the TOTAL from the daily rows
  lines.push(renderRow(totalRow));
  lines.push(rule(colWidths, "bottom", g));

  // The daily-burn sparkline (per-day token series) under the table.
  const spark = sparkline(
    summary.perDay.map((d) => d.tokens),
    style.ascii,
  );
  if (spark) lines.push(c.dim("daily burn ") + spark);

  // Honest labels.
  lines.push(
    c.dim("approx $ is a local estimate from a bundled LiteLLM snapshot — the server is authoritative"),
  );
  if (summary.anyUnpriced) {
    lines.push(c.dim(`(some usage couldn't be priced: ${summary.unpricedModels.join(", ")})`));
  }

  return lines.join("\n");
}

// The claim CTA. On an interactive TTY the command turns CLAIM_PROMPT into a [y/N] prompt that
// runs `claim` on yes; CLAIM_HINT is the passive fallback printed when the user declines or when
// the run isn't interactive (so the next step is always discoverable).
export const CLAIM_PROMPT = "Sign in with GitHub to claim your spot?";
export const CLAIM_HINT = "→ Claim your spot anytime → tokenboard claim";
