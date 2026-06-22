// GLOBAL first-occurrence-wins dedup on message.id — THE #1 trust risk.
//
// On disk, Claude Code's `requestId` is null on ~100% of assistant lines, so the
// documented (requestId + message.id) key degenerates to message.id alone. The same
// message.id recurs (a) within a file and (b) across files (session resume) — measured
// live: 1266 ids span >1 file on this machine. Without GLOBAL dedup, every token total
// roughly DOUBLES (measured 1.945x total / 2.60x input inflation) — silent and
// credibility-destroying. So dedup must use ONE Set across ALL files, never per-file.
//
// Caveat (NOT lossless): ~60% of duplicated ids carry differing usage across
// occurrences — a partial streaming snapshot first, then the complete final write.
// First-occurrence-wins (mandated by ARCH §6.1 / DESIGN §5.1) therefore UNDERCOUNTS by
// ~0.24% vs last/max. We follow the spec; flagged to the spec owner whether last/max is
// the more accurate rule. A line with no id can't be deduped, so it's always kept.

interface DedupableLine {
  messageId: string | null;
  sourcePath: string;
  lineIndex: number;
}

export function dedupeByMessageId<T extends DedupableLine>(lines: T[]): T[] {
  // Stable, deterministic order so "first occurrence" is reproducible regardless of
  // filesystem read order: order by (sourcePath, lineIndex).
  const ordered = [...lines].sort((a, b) =>
    a.sourcePath < b.sourcePath
      ? -1
      : a.sourcePath > b.sourcePath
        ? 1
        : a.lineIndex - b.lineIndex,
  );

  const seen = new Set<string>();
  const kept: T[] = [];
  for (const line of ordered) {
    if (line.messageId == null || line.messageId === "") {
      kept.push(line); // cannot dedupe an id-less line — keep it
      continue;
    }
    if (seen.has(line.messageId)) continue; // a later occurrence — drop
    seen.add(line.messageId);
    kept.push(line);
  }
  return kept;
}
