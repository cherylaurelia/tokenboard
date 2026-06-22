// Profile "/user/[handle]" — minimal rollup, designed from the YOUR STANDING + card visual language
// (no prototype exists, so this is the one place a sparkline lives). Server component. Looks up the
// handle (banned-excluded) -> assembleBoard(global, me=handle) for global rank/spend/delta/sparkline.
// notFound() for unknown/banned handles. The rich profile (X-connect, share rail) is Phase 8 §7.4.
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { boardQuerySchema } from "@tokenboard/contracts";
import { getViewer } from "@/lib/auth/get-viewer";
import { assembleBoard } from "@/lib/leaderboard/assemble-board";
import { WEB_DEFAULT_METRIC, WEB_DEFAULT_WINDOW } from "@/lib/board/web-defaults";
import { formatUsd2dp } from "@/lib/format/money";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Sparkline } from "@/components/sparkline";
import { DeltaArrow } from "@/components/board/delta-arrow";
import styles from "./profile.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;

  const [u] = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName, avatar: users.avatarUrl })
    .from(users)
    .where(and(eq(users.handle, handle), isNull(users.bannedAt)))
    .limit(1);
  if (!u) notFound();

  const v = await getViewer();
  const viewer = v === "outage" ? null : v;

  const query = boardQuerySchema.parse({
    community: "global",
    window: WEB_DEFAULT_WINDOW,
    metric: WEB_DEFAULT_METRIC,
    me: u.handle,
  });
  const board = await assembleBoard({
    query,
    scope: "g",
    community: null,
    meUserId: u.id,
    callerUserId: viewer?.userId ?? null,
  });

  const meEntry = board.me?.inTopN === false ? board.me.entry : board.entries.find((e) => e.isMe) ?? null;
  const rank = board.me?.rank ?? null;

  return (
    <div className={`${styles.surfaceBoardBase} ${styles.surfaceBoardArcade}`}>
      <SiteNav active="profile" viewer={viewer} currentPath={`/user/${u.handle}`} />
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.standing}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={`${styles.pfpLg} noPixelate`}
              src={u.avatar ?? `https://github.com/${u.handle}.png`}
              alt={`@${u.handle}`}
              width={64}
              height={64}
              loading="lazy"
            />
            <div className={styles.who}>
              <span className={styles.name}>{u.displayName ?? `@${u.handle}`}</span>
              <span className={styles.at}>@{u.handle}</span>
              {rank !== null && (
                <span className={styles.rank}>
                  Global Rank #{rank} of {board.totalEntries}
                </span>
              )}
            </div>
          </div>

          {meEntry ? (
            <>
              <div className={styles.stats}>
                <span className={styles.big}>{formatUsd2dp(meEntry.cost)}</span>
                <DeltaArrow delta={meEntry.delta} className={styles.bigElo} />
              </div>
              {meEntry.sparkline.length > 1 && (
                <Sparkline points={meEntry.sparkline} className={styles.spark} />
              )}
            </>
          ) : (
            <p className={styles.empty}>No synced usage yet for @{u.handle}.</p>
          )}
        </section>
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
