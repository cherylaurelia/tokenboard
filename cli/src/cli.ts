#!/usr/bin/env node
// tokenboard — placeholder entry. The real CLI (Phase 2+) lands here.
// We import a real symbol from @tokenboard/contracts so tsup's noExternal inlining is
// actually EXERCISED in Phase 1 (the prior placeholder imported nothing, so bundling was
// never tested and self-containment held only trivially). `void` keeps it referenced
// without side effects; the bundled output now contains the inlined schema source.
import { syncRequestSchema } from "@tokenboard/contracts";

void syncRequestSchema;

console.log(
  "\n  tokenboard — a leaderboard for your agentic-coding token usage.\n" +
    "  This CLI is still in active development. Follow along at https://tokenboard.sh\n",
);
