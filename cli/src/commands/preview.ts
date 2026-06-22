import { homedir } from "node:os";
import { resolveProjectsRoot } from "../config/home.js";
import { collectClaudeCodeLines } from "../collectors/claude-code-source.js";
import { dedupeByMessageId } from "../collectors/dedup.js";
import { parsedLineToRecord } from "../collectors/claude-code-map.js";
import { collectCcusage } from "../collectors/ccusage-source.js";
import { aggregateByKey } from "../aggregate/aggregate.js";
import { summarize, type LocalSummary } from "../aggregate/summary.js";
import { loadPriceTable } from "../cost/price-table.js";
import { resolveTimeZone } from "../normalize/local-day.js";
import { resolveStyle, styler } from "../render/terminal-style.js";
import { renderLocalPreview, CLAIM_CTA } from "../render/local-preview.js";
import type { NormalizedRecord } from "@tokenboard/contracts";

export interface PreviewArgs {
  json: boolean;
  noColor: boolean;
  ascii: boolean;
}

// Collect from both local sources -> deduped, normalized, aggregated NormalizedRecords.
// Pure-ish (does local I/O via the source edges) and shared by preview + show-data.
export async function collectLocalRecords(): Promise<{ records: NormalizedRecord[]; ccusageSkipped: string[]; npxAvailable: boolean }> {
  const tz = resolveTimeZone();

  const claudeLines = dedupeByMessageId(collectClaudeCodeLines(resolveProjectsRoot(homedir())));
  const claudeRecords = claudeLines.map((l) => parsedLineToRecord(l, tz));

  const ccusage = await collectCcusage();

  const records = aggregateByKey([...claudeRecords, ...ccusage.records]);
  return { records, ccusageSkipped: ccusage.skipped, npxAvailable: ccusage.npxAvailable };
}

// The bare `npx @tokenboard/cli` path: LOCAL PREVIEW ONLY (ARCH §4.3 Phase A). No network
// identity, no sync. Ends at the preview + cosmetic claim footer. In Phase 5 this becomes
// the §14.1 sync-then-render hero path.
export async function runPreview(args: PreviewArgs): Promise<void> {
  const prices = loadPriceTable();
  const { records } = await collectLocalRecords();
  const summary = summarize(records, prices);

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    return;
  }

  const style = resolveStyle({
    isTTY: Boolean(process.stdout.isTTY),
    // Per the NO_COLOR spec (no-color.org), color is disabled when the var is PRESENT
    // regardless of value — so `NO_COLOR=` (empty) still counts. Test presence, not truthiness.
    noColorEnv: process.env["NO_COLOR"] !== undefined,
    noColorFlag: args.noColor,
    asciiFlag: args.ascii,
    columns: process.stdout.columns,
  });

  process.stdout.write(renderLocalPreview(summary, style) + "\n");

  // Cosmetic claim CTA — interactive (TTY) only; creates nothing.
  if (process.stdout.isTTY) {
    const c = styler(style);
    process.stdout.write("\n" + c.cyan(CLAIM_CTA) + "\n");
  }
}

export type { LocalSummary };
