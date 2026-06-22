// §7.5 step 5 delta math. Caller passes BOTH curScore and prevScore in the SAME DISPLAY UNIT: tokens
// stay whole tokens; cost is converted to 2dp dollars BEFORE this fn, so tokensChange matches the
// displayed `cost` (no raw micro-dollars leaking to the contract). direction 'new' when no snapshot
// row existed for the user. pct guarded against prev<=0. Pure + unit-tested.
export interface Delta {
  rankChange: number;
  tokensChange: number;
  pct: number;
  direction: "up" | "down" | "flat" | "new";
}

export function computeDelta(p: {
  curScore: number;
  prevScore: number | null;
  curRank: number;
  prevRank: number | null;
}): Delta {
  if (p.prevScore === null || p.prevRank === null) {
    return { rankChange: 0, tokensChange: 0, pct: 0, direction: "new" };
  }
  const rankChange = p.prevRank - p.curRank; // positive = climbed
  const tokensChange = p.curScore - p.prevScore; // display unit (tokens | 2dp USD)
  const pct = p.prevScore > 0 ? (tokensChange / p.prevScore) * 100 : 0;
  const direction = rankChange > 0 ? "up" : rankChange < 0 ? "down" : "flat";
  return { rankChange, tokensChange, pct, direction };
}
