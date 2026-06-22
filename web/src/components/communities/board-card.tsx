// One community board card (communities prototype .ccard). Links to the board. Badge = first 2 chars
// of the name; color variant derived deterministically from type/role. Shows the caller's rank +
// spend + delta. Server component.
import Link from "next/link";
import type { MyCommunity } from "@/lib/leaderboard/list-my-communities";
import { formatUsd2dp } from "@/lib/format/money";
import { DeltaArrow } from "@/components/board/delta-arrow";
import styles from "./board-card.module.css";

function badgeClass(b: MyCommunity): string {
  if (b.type === "company") return styles.b2 ?? "";
  if (b.role === "owner") return styles.b3 ?? "";
  return "";
}

function tag(b: MyCommunity): string {
  if (b.role === "owner") return `${b.memberCount} members · you're the owner`;
  if (b.joinPolicy === "code") return `${b.memberCount} members · invite-only`;
  return `${b.memberCount} members`;
}

export function BoardCard({ board }: { board: MyCommunity }) {
  const initials = board.name.slice(0, 2).toUpperCase();
  return (
    <li>
      <Link className={styles.ccard} href={`/community/${board.slug}`}>
        <div className={styles.top}>
          <span className={`${styles.badge} ${badgeClass(board)}`} aria-hidden="true">
            {initials}
          </span>
          <div className={styles.titleWrap}>
            <span className={styles.cname}>{board.name}</span>
            <span className={styles.ctag}>
              {board.type === "company" && board.emailDomain && (
                <>
                  <span className={styles.pin}>@</span>
                  {board.emailDomain} ·{" "}
                </>
              )}
              {tag(board)}
            </span>
          </div>
          <span className={styles.arrow} aria-hidden="true">
            &#9656;
          </span>
        </div>
        <div className={styles.stats}>
          <span className={styles.youRank}>
            You · <b>#{board.rank ?? "—"}</b> / {board.totalEntries}
          </span>
          <span className={styles.youSpend}>
            <span className={styles.big}>{board.displayCost === null ? "—" : formatUsd2dp(board.displayCost)}</span>
            {board.delta && <DeltaArrow delta={board.delta} className={styles.cardElo} />}
          </span>
        </div>
      </Link>
    </li>
  );
}
