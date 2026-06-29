// Communities hub "/communities" — ported from the communities prototype. Server component. Lists
// the boards the viewer is racing in (or an empty/sign-in state) + the JOIN rail. VISUALS only: the
// join / verify / create ACTIONS are Phase-8 stubs (see JoinPanel). Uses the calm (non-pixelated)
// board surface to match the prototype's html block (it omits image-rendering:pixelated).
import { getViewer } from "@/lib/auth/get-viewer";
import { listMyCommunities } from "@/lib/leaderboard/list-my-communities";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { BoardCard } from "@/components/communities/board-card";
import { JoinPanel } from "@/components/communities/join-panel";
import { parseInviteCode } from "@/lib/communities/invite-link";
import styles from "./communities.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const v = await getViewer();
  const viewer = v === "outage" ? null : v; // graceful: a public page treats an outage as signed-out
  const boards = viewer ? await listMyCommunities(viewer.userId, true) : [];
  const sp = await searchParams;
  const rawCode = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const inviteCode = (rawCode && parseInviteCode(rawCode)) || undefined;

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav active="communities" viewer={viewer} currentPath="/communities" />
      <main className={styles.shell}>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>
            MY <span className={styles.dim}>COMMUNITIES</span>
          </h1>
          <p className={styles.lede}>
            The boards you&rsquo;re racing in. Paste an invite to join a crew, or use your work email
            for your whole company.
          </p>
        </div>

        <div className={styles.layout}>
          <section>
            <h2 className={styles.secLabel}>Your Boards</h2>
            {!viewer ? (
              <p className={styles.empty}>Sign in to see the boards you&rsquo;re racing in.</p>
            ) : boards.length > 0 ? (
              <ul className={styles.boards}>
                {boards.map((b) => (
                  <BoardCard key={b.slug} board={b} />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                You&rsquo;re not in any boards yet. Paste an invite code or join your company to get on
                a board.
              </p>
            )}
          </section>

          <aside className={styles.rail}>
            <JoinPanel autoCode={inviteCode} />
          </aside>
        </div>
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
