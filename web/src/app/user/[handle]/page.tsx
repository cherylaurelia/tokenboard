// Profile "/user/[handle]" — a clean, Monkeytype-style public profile. Server component, force-dynamic.
// Looks up the handle (banned-excluded) -> bio + social_links + assembleBoard(global, me=handle) for
// the global rank/spend/delta/sparkline + the user's community memberships (visibility-filtered for a
// non-owner viewer). The owner (viewer.userId === u.id) gets an inline Edit form; everyone else is
// read-only. Social links are RE-validated at render via buildSocialUrl (defense in depth) — a value
// that somehow bypassed the write-time normalizer is dropped before it reaches an href. notFound()
// for unknown/banned handles. This is the one place a sparkline lives.
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { boardQuerySchema } from "@tokenboard/contracts";
import { getViewer } from "@/lib/auth/get-viewer";
import { assembleBoard } from "@/lib/leaderboard/assemble-board";
import { listMyCommunities } from "@/lib/leaderboard/list-my-communities";
import { WEB_DEFAULT_METRIC, WEB_DEFAULT_WINDOW } from "@/lib/board/web-defaults";
import { formatUsd2dp } from "@/lib/format/money";
import { buildSocialUrl, SOCIAL_PLATFORMS, platformLabel, type Platform } from "@/lib/profile/social-links";
import { profileUsageDetail } from "@/lib/profile/usage-detail";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Sparkline } from "@/components/sparkline";
import { DeltaArrow } from "@/components/board/delta-arrow";
import { MembershipCard } from "@/components/profile/membership-card";
import {
  ProfileEditProvider,
  ProfileHeaderActions,
  ProfileEditableBody,
} from "./profile-edit";
import styles from "./profile.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SafeLink = { platform: Platform; label: string; url: string };

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;

  const [u] = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatar: users.avatarUrl,
      createdAt: users.createdAt,
      bio: users.bio,
      socialLinks: users.socialLinks,
    })
    .from(users)
    .where(and(eq(users.handle, handle), isNull(users.bannedAt)))
    .limit(1);
  if (!u) notFound();

  const v = await getViewer();
  const viewer = v === "outage" ? null : v; // public page: outage -> anon, no edit
  const isOwner = viewer != null && viewer.userId === u.id;

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

  // Richer per-day series (tokens + cost) and per-tool breakdown for the profile chart. Only fetched
  // when there's a usage series to draw.
  const usageDetail =
    meEntry && meEntry.sparkline.length > 1
      ? await profileUsageDetail(u.id, board.windowStart, board.windowEnd)
      : null;

  const boards = await listMyCommunities(u.id, isOwner);

  // Re-validate every stored link at render (the href is always server-built; a bad stored value is
  // silently dropped, never rendered).
  const socialLinks: SafeLink[] = SOCIAL_PLATFORMS.map((p): SafeLink | null => {
    const stored = u.socialLinks?.[p];
    if (typeof stored !== "string" || stored.length === 0) return null;
    const url = buildSocialUrl(p, stored);
    return url ? { platform: p, label: platformLabel(p), url } : null;
  }).filter((x): x is SafeLink => x !== null);

  const joined = u.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Read-only profile body (bio, social links, usage stats + graph). Shown to everyone; for the owner
  // it's hidden while the edit form is open (ProfileEditableBody) so the editing view stays clean.
  const readOnlyBody = (
    <>
      {u.bio && <p className={styles.bio}>{u.bio}</p>}

      {socialLinks.length > 0 && (
        <ul className={styles.links}>
          {socialLinks.map((l) => (
            <li key={l.platform}>
              <a className={styles.link} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      {meEntry ? (
        <div className={styles.statsBlock}>
          <div className={styles.stats}>
            <span className={styles.big}>{formatUsd2dp(meEntry.cost)}</span>
            <DeltaArrow delta={meEntry.delta} className={styles.bigElo} />
          </div>
          {rank !== null && (
            <span className={styles.rank}>
              Global Rank #{rank} of {board.totalEntries}
            </span>
          )}
          {usageDetail && (
            <Sparkline
              points={usageDetail.points}
              tools={usageDetail.tools}
              topTool={meEntry.topTool ?? null}
              className={styles.spark}
            />
          )}
        </div>
      ) : (
        <p className={styles.empty}>No synced usage yet for @{u.handle}.</p>
      )}
    </>
  );

  const header = (
    <header className={styles.head}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${styles.pfpLg} noPixelate`}
        src={u.avatar ?? `https://github.com/${u.handle}.png`}
        alt={`@${u.handle}`}
        width={88}
        height={88}
        loading="lazy"
      />
      <div className={styles.who}>
        <h1 className={styles.name}>{u.displayName ?? `@${u.handle}`}</h1>
        {/* The handle IS the GitHub username (avatar resolves from github.com/<handle>.png),
            so link it out to the profile — works for everyone, edited or not. */}
        <a
          className={styles.atLink}
          href={`https://github.com/${u.handle}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          @{u.handle}
        </a>
        <div className={styles.meta}>
          <span className={styles.joined}>Joined {joined}</span>
          {meEntry?.tierPill && <span className={styles.pill}>{meEntry.tierPill.label}</span>}
        </div>
      </div>
      {/* Owner controls (Edit + Sign Out) live in the header's top-right; hidden while editing. */}
      {isOwner && viewer && <ProfileHeaderActions className={styles.editSlot} />}
    </header>
  );

  return (
    <div className={`${styles.surfaceBoardBase} ${styles.surfaceBoardArcade}`}>
      <SiteNav active="profile" viewer={viewer} currentPath={`/user/${u.handle}`} />
      <main className={styles.shell}>
        <section className={styles.card}>
          {isOwner && viewer ? (
            <ProfileEditProvider
              initialBio={u.bio ?? ""}
              initialLinks={u.socialLinks ?? {}}
              githubHandle={viewer.handle}
            >
              {header}
              <ProfileEditableBody>{readOnlyBody}</ProfileEditableBody>
            </ProfileEditProvider>
          ) : (
            <>
              {header}
              {readOnlyBody}
            </>
          )}
        </section>

        {boards.length > 0 && (
          <section className={styles.communities}>
            <h2 className={styles.secLabel}>Communities</h2>
            <ul className={styles.boards}>
              {boards.map((b) => (
                <MembershipCard key={b.slug} board={b} isOwner={isOwner} ownerHandle={u.handle} />
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
