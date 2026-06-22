#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { runPreview } from "./commands/preview.js";
import { runShowData } from "./commands/show-data.js";
import { notAvailableYet } from "./commands/stub.js";

// Window flags are bare per DESIGN §14.1 (--7d, not --window=7d). In Phase 2 they're
// cosmetic — the local preview shows all available local history — but registered so the
// surface is locked. --ascii/--no-color/--json drive rendering.
const windowArgs = {
  "7d": { type: "boolean", description: "leaderboard window: last 7 days" },
  "30d": { type: "boolean", description: "leaderboard window: last 30 days" },
  all: { type: "boolean", description: "leaderboard window: all time" },
  "no-color": { type: "boolean", description: "force plain output (also honors NO_COLOR)" },
  ascii: { type: "boolean", description: "ASCII-only box/sparkline glyphs" },
  json: { type: "boolean", description: "raw JSON, no rendering" },
} as const;

const showData = defineCommand({
  meta: { name: "show-data", description: "dry-run: print the exact counts a future sync would upload (no network)" },
  async run() {
    await runShowData();
  },
});

// Phase-2 inert stubs — names visible in --help; zero side effects until their phase.
const stub = (name: string, phase: string, description: string) =>
  defineCommand({ meta: { name, description }, run: () => notAvailableYet(name, phase) });

const main = defineCommand({
  meta: {
    name: "tokenboard",
    description: "A leaderboard for your agentic-coding token usage.",
  },
  args: windowArgs,
  subCommands: {
    "show-data": showData,
    claim: stub("claim", "Phase 4", "sign in with GitHub and claim this machine"),
    sync: stub("sync", "Phase 5", "upload local usage to the server"),
    top: stub("top", "Phase 6", "the global / default board"),
    board: stub("board", "Phase 6", "a specific community board"),
    me: stub("me", "Phase 6", "your rank across communities"),
    join: stub("join", "Phase 6", "join a community"),
  },
  // Bare `tokenboard` = the ARCH §4.3 Phase-A local preview in Phase 2; becomes the
  // §14.1 sync-then-render hero path in Phase 5 (not a regression — intentional split).
  //
  // citty fires this parent run() even when a subcommand matched, so only run the preview
  // when NO subcommand was invoked (args._ holds the matched subcommand name otherwise).
  async run({ args }) {
    if (Array.isArray(args._) && args._.length > 0) return; // a subcommand handled it
    await runPreview({
      json: Boolean(args.json),
      noColor: Boolean(args["no-color"]),
      ascii: Boolean(args.ascii),
    });
  },
});

runMain(main);
