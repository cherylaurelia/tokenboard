// Interactive [y/N] confirm — the CLI's one interactive-input edge. The parse is pure (testable);
// the readline I/O is isolated. Default is NO: empty/unknown answers are false, only an explicit
// y/yes counts. Callers MUST gate the call on a TTY — a non-interactive run (CI, piped, redirected)
// can't answer, so confirm() returns false up front rather than blocking on a stream that never
// delivers a line.
import { createInterface } from "node:readline/promises";

// Pure: interpret a raw y/N answer. Trimmed + case-insensitive; only "y"/"yes" is yes.
export function parseYesNo(answer: string): boolean {
  const a = answer.trim().toLowerCase();
  return a === "y" || a === "yes";
}

// Returns false immediately when stdin OR stdout isn't a TTY (can't prompt -> safe default no).
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return parseYesNo(answer);
  } finally {
    rl.close(); // restores the terminal; without this the process can hang with stdin held open
  }
}
