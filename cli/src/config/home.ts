import { join } from "node:path";

// Pure path resolution — no filesystem reads. Claude Code stores per-project
// session transcripts as JSONL under ~/.claude/projects/<project>/<session>.jsonl.
// The project dir name is irrelevant to us and never leaves the machine.
export function resolveProjectsRoot(homedir: string): string {
  return join(homedir, ".claude", "projects");
}
