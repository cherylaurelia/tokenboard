import { homedir } from "node:os";
import { resolveProjectsRoot } from "../config/home.js";
import { findJsonlFiles } from "../collectors/claude-code-source.js";
import { collectClaudeCodeLinesCached } from "../collectors/claude-code-cache.js";
import { dedupeByMessageId } from "../collectors/dedup.js";
import { parsedLineToRecord } from "../collectors/claude-code-map.js";
import { collectCcusage } from "../collectors/ccusage-source.js";
import { aggregateByKey } from "../aggregate/aggregate.js";
import { summarize, type LocalSummary } from "../aggregate/summary.js";
import { loadPriceTable } from "@tokenboard/cost";
import { resolveTimeZone } from "../normalize/local-day.js";
import { resolveStyle, styler } from "../render/terminal-style.js";
import { startSpinner } from "../render/spinner.js";
import { renderLocalPreview, CLAIM_PROMPT, CLAIM_HINT } from "../render/local-preview.js";
import { readAuthFile, resolveConfigDir } from "../config/auth-store.js";
import { confirm } from "../prompt/confirm.js";
import { runClaim } from "./claim.js";
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

  // Read Claude Code (first-party, cached by file mtime+size) and run the ccusage long-tail probe
  // concurrently — independent local I/O, so overlap them instead of serializing.
  const files = findJsonlFiles(resolveProjectsRoot(homedir()));
  const [claudeLines, ccusage] = await Promise.all([
    Promise.resolve().then(() => dedupeByMessageId(collectClaudeCodeLinesCached(files, resolveConfigDir()))),
    collectCcusage(),
  ]);
  const claudeRecords = claudeLines.map((l) => parsedLineToRecord(l, tz));

  const records = aggregateByKey([...claudeRecords, ...ccusage.records]);
  return { records, ccusageSkipped: ccusage.skipped, npxAvailable: ccusage.npxAvailable };
}

// The bare `npx @tokenboard/cli` path: LOCAL PREVIEW ONLY (ARCH §4.3 Phase A). No network
// identity, no sync. Ends at the preview + cosmetic claim footer. In Phase 5 this becomes
// the §14.1 sync-then-render hero path.
export async function runPreview(args: PreviewArgs): Promise<void> {
  const prices = loadPriceTable();
  // Show a spinner while we read logs + probe ccusage (a few seconds on a cold npx cache). It writes
  // to stderr and self-disables off a TTY, so --json / piped output is unaffected. Skip it entirely
  // for --json (machine path). Always stop it before any stdout render.
  const spinner = args.json ? null : startSpinner("reading your local usage…", args.ascii);
  let records: NormalizedRecord[];
  try {
    ({ records } = await collectLocalRecords());
  } finally {
    spinner?.stop();
  }
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

  await offerClaim(style);
}

// The claim nudge. NON-interactive (piped/CI/`npx | tee`) -> nothing, so output stays
// screenshot-clean and scripts never block. Already claimed -> a quiet confirmation, no prompt.
// Otherwise -> a [y/N] prompt that runs `claim` on yes (the device flow opens the browser),
// else the passive hint so the next step is still discoverable.
async function offerClaim(style: ReturnType<typeof resolveStyle>): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return; // both: non-interactive runs stay clean
  const c = styler(style);

  const auth = await readAuthFile();
  if (auth) {
    process.stdout.write("\n" + c.dim(`✓ claimed as @${auth.handle} · run \`tokenboard sync\` to upload`) + "\n");
    return;
  }

  process.stdout.write("\n");
  if (await confirm(c.cyan(CLAIM_PROMPT))) {
    await runClaim();
    return;
  }
  process.stdout.write(c.dim(CLAIM_HINT) + "\n");
}

export type { LocalSummary };
