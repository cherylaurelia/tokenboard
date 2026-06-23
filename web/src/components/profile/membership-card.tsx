// Read-only community-membership card for a PROFILE (any handle). Unlike BoardCard (the viewer's own
// /communities hub), this is shown on a third party's profile, so the standing label is viewer-aware:
// "You · #n" only when the viewer IS the profile owner, else "@handle · #n". Links to the board.
// Server component. Tokens-only.
import Link from "next/link";
import type { MyCommunity } from "@/lib/leaderboard/list-my-communities";
import { formatUsd2dp } from "@/lib/format/money";
import { DeltaArrow } from "@/components/board/delta-arrow";
import styles from "./membership-card.module.css";

function tag(b: MyCommunity, isOwner: boolean): string {
  if (isOwner && b.role === "owner") return `${b.memberCount} members · you're the owner`;
  if (b.role === "owner") return `${b.memberCount} members · owner`;
  return `${b.memberCount} members`;
}

export function MembershipCard({
  board,
  isOwner,
  ownerHandle,
}: {
  board: MyCommunity;
  isOwner: boolean;
  ownerHandle: string;
}) {
  const initials = board.name.slice(0, 2).toUpperCase();
  const standingLabel = isOwner ? "You" : `@${ownerHandle}`;
  return (
    <li>
      <Link className={styles.ccard} href={`/community/${board.slug}`}>
        <div className={styles.top}>
          <span className={styles.badge} aria-hidden="true">
            {initials}
          </span>
          <div className={styles.titleWrap}>
            <span className={styles.cname}>{board.name}</span>
            <span className={styles.ctag}>{tag(board, isOwner)}</span>
          </div>
          <span className={styles.arrow} aria-hidden="true">
            &#9656;
          </span>
        </div>
        <div className={styles.stats}>
          <span className={styles.youRank}>
            {standingLabel} · <b>#{board.rank ?? "—"}</b> / {board.totalEntries}
          </span>
          <span className={styles.youSpend}>
            <span className={styles.big}>
              {board.displayCost === null ? "—" : formatUsd2dp(board.displayCost)}
            </span>
            {board.delta && <DeltaArrow delta={board.delta} className={styles.cardElo} />}
          </span>
        </div>
      </Link>
    </li>
  );
}
