// GLOBAL max-output-per-message.id dedup — THE #1 trust risk for total accuracy.
//
// On disk, Claude Code's `requestId` is null on ~100% of assistant lines, so the documented
// (requestId + message.id) key degenerates to message.id alone. The same message.id recurs (a)
// WITHIN a file — Claude Code writes several lines per assistant turn as it streams, each a snapshot
// whose output_tokens GROWS from a tiny partial to the final billed value — and (b) ACROSS files
// (session resume). So we must dedupe on ONE message.id key GLOBALLY across all files.
//
// WHICH occurrence to keep: the one with the GREATEST output_tokens. input/cacheRead/cacheCreate are
// constant across a message.id's snapshots; only output_tokens ascends, and the turn is billed ONCE
// at its final (max) value. Keeping the FIRST occurrence (the old rule) held the tiny partial and
// discarded the final write — measured to UNDER-count output by ~49% on a real corpus (matching
// ccusage only after this fix). Max-output is order-independent (no dependency on file/line sort) and
// gives the true billed figure; last-occurrence-wins is equivalent only because snapshots ascend.
//
// A line with no id can't be deduped, so it's always kept.

interface DedupableLine {
  messageId: string | null;
  // output_tokens is the value that VARIES across a message.id's streaming snapshots; we keep the max.
  usage: { output_tokens?: number };
}

function outputOf(line: DedupableLine): number {
  return line.usage.output_tokens ?? 0;
}

export function dedupeByMessageId<T extends DedupableLine>(lines: T[]): T[] {
  const best = new Map<string, T>(); // message.id -> the occurrence with the greatest output_tokens
  const idless: T[] = []; // id-less lines: undedupable, always kept (preserve input order)
  for (const line of lines) {
    if (line.messageId == null || line.messageId === "") {
      idless.push(line);
      continue;
    }
    const cur = best.get(line.messageId);
    if (cur === undefined || outputOf(line) > outputOf(cur)) best.set(line.messageId, line);
  }
  return [...best.values(), ...idless];
}
