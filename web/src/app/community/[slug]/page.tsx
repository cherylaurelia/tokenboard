// Board page — server component for /community/[slug] (slug="global" -> the global board). Replicates
// the API route's sequence (getViewer -> resolveBoardScope -> assembleBoard) DIRECTLY rather than
// fetch-to-self: no self-HTTP hop, no second cookie round-trip, full BoardResponse types. The window
// tabs + metric toggle are client leaves that drive ?window=/?metric=, so this re-renders server-side.
import { cache } from "react";
import { notFound } from "next/navigation";
import { boardQuerySchema } from "@tokenboard/contracts";
import { getViewer } from "@/lib/auth/get-viewer";
import { getViewerMembership } from "@/lib/communities/get-membership";
import { resolveBoardScope } from "@/lib/leaderboard/resolve-scope";
import { assembleBoard } from "@/lib/leaderboard/assemble-board";
import { WEB_DEFAULT_METRIC, WEB_DEFAULT_WINDOW } from "@/lib/board/web-defaults";
import { ogImageUrl } from "@/lib/og/og-hash";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { BoardTitle } from "./board-title";
import { WindowTabs } from "@/components/board/window-tabs";
import { MetricToggle } from "@/components/board/metric-toggle";
import { BoardRow } from "@/components/board/board-row";
import { YourStanding } from "@/components/board/your-standing";
import { CommunityPanel } from "@/components/board/community-panel";
import { Pager } from "@/components/board/pager";
import styles from "./board.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Keyed on primitives (not the searchParams object) so generateMetadata and the page component share
// one result via React cache() per request — otherwise the getViewer + scope + assembleBoard chain
// runs twice per navigation.
const loadBoard = cache(async function loadBoard(slug: string, windowParam: string, metricParam: string) {
  const parsed = boardQuerySchema.safeParse({
    community: slug,
    window: windowParam,
    metric: metricParam,
  });
  if (!parsed.success) return { kind: "notfound" as const };

  const viewer = await getViewer();
  if (viewer === "outage") return { kind: "outage" as const };
  const callerUserId = viewer?.userId ?? null;

  const resolved = await resolveBoardScope(parsed.data.community, callerUserId);
  if (!resolved.ok) return { kind: "notfound" as const };

  const board = await assembleBoard({
    query: parsed.data,
    scope: resolved.scope,
    community: resolved.community,
    meUserId: callerUserId,
    callerUserId,
  });
  return { kind: "ok" as const, board, viewer };
});

const loadBoardFromSearch = (slug: string, sp: Search) =>
  loadBoard(slug, one(sp.window) ?? WEB_DEFAULT_WINDOW, one(sp.metric) ?? WEB_DEFAULT_METRIC);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const res = await loadBoardFromSearch(slug, await searchParams);
  if (res.kind !== "ok") return { title: "tokenboard" };
  const name = res.board.community?.name ?? "Global";
  return {
    title: `${name} — tokenboard`,
    openGraph: { images: [ogImageUrl(slug, res.board)] },
  };
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const res = await loadBoardFromSearch(slug, await searchParams);
  if (res.kind === "outage") throw new Error("auth_unavailable");
  if (res.kind !== "ok") notFound();

  const { board, viewer } = res;
  const isGlobal = slug.toLowerCase() === "global" || slug === "";
  const currentPath = isGlobal ? "/global" : `/community/${slug}`;

  // COMPANY-board privacy gate (DESIGN §7.2): there's no opt-in/alias column yet, so until Phase 8
  // lands it, company boards alias every row by rank rather than leak real handles.
  const aliasCompany = board.community?.type === "company";
  const pinnedMe = board.me && board.me.inTopN === false ? board.me.entry : null;
  const membership =
    viewer && board.community ? await getViewerMembership(viewer.userId, board.community.slug) : null;

  return (
    <div className={`${styles.surfaceBoardBase} ${styles.surfaceBoardArcade}`}>
      <SiteNav active={isGlobal ? "global" : "communities"} viewer={viewer} currentPath={currentPath} />
      <main className={styles.shell}>
        <div className={styles.layout}>
          <div className={styles.card}>
            <div className={styles.head}>
              <BoardTitle name={board.community?.name ?? "Global"} />
            </div>

            <div className={styles.controls}>
              <WindowTabs current={board.window} basePath={currentPath} metric={board.metric} />
              <MetricToggle current={board.metric} basePath={currentPath} window={board.window} />
            </div>

            <div className={styles.boardLabel}>
              <span>Standings</span>
              <span className={styles.rule} aria-hidden="true" />
              <span className={styles.leg}>
                <span className={styles.ar} aria-hidden="true">
                  ▲▼
                </span>{" "}
                vs last week
              </span>
            </div>

            {board.entries.length === 0 ? (
              <p className={styles.empty}>No synced usage in this window yet. Be the first on the board.</p>
            ) : (
              <ul className={styles.board}>
                {board.entries.map((e) => (
                  <BoardRow key={e.handle} entry={e} metric={board.metric} aliasCompany={aliasCompany} />
                ))}
                {pinnedMe && (
                  <BoardRow
                    key={`me-${pinnedMe.handle}`}
                    entry={pinnedMe}
                    metric={board.metric}
                    aliasCompany={aliasCompany}
                    pinned
                  />
                )}
              </ul>
            )}

            <Pager totalEntries={board.totalEntries} shown={board.entries.length} />
          </div>

          <aside className={styles.rail}>
            <YourStanding
              me={board.me}
              entries={board.entries}
              metric={board.metric}
              viewer={viewer}
              aliasCompany={aliasCompany}
            />
            {board.community && (
              <CommunityPanel community={board.community} membership={membership} />
            )}
          </aside>
        </div>
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
