// /tuna — owner console. requireAdmin() -> notFound() (404, NOT 403/redirect) for non-admins; the
// route is omitted from SiteNav so it is never advertised. Server component: stats strip + People
// table + Communities list (with lazy per-community ranks). Tokens-only, semantic HTML.
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadOverviewStats } from "@/lib/admin/overview-stats";
import { listAllUsers } from "@/lib/admin/list-all-users";
import { listAllCommunities } from "@/lib/admin/list-all-communities";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { formatUsd2dp, humanizeTokens } from "@/lib/format/money";
import { BanToggle } from "./ban-toggle";
import { DeleteCommunityButton } from "./delete-community-button";
import { CommunityRanks } from "./community-ranks";
import styles from "./tuna.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmtTokens = (t: number) => {
  const { value, unit } = humanizeTokens(t);
  return unit ? `${value}${unit}` : value;
};

export default async function TunaPage() {
  const admin = await requireAdmin();
  if (!admin) notFound(); // 404 for non-admins — never 403/redirect

  const [stats, users, communities] = await Promise.all([
    loadOverviewStats(),
    listAllUsers(),
    listAllCommunities(),
  ]);

  const stat = (label: string, value: string) => (
    <div className={styles.stat} key={label}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav viewer={admin} currentPath="/tuna" />
      <main className={styles.shell}>
        <h1 className={styles.title}>
          TUNA <span className={styles.dim}>// OWNER CONSOLE</span>
        </h1>

        <section aria-label="Overview" className={styles.statStrip}>
          {stat("Users", String(stats.usersTotal))}
          {stat("Live", String(stats.usersLive))}
          {stat("Banned", String(stats.usersBanned))}
          {stat("Communities", String(stats.communitiesCommunity))}
          {stat("Companies", String(stats.communitiesCompany))}
          {stat("Memberships", String(stats.memberships))}
          {stat("Tokens (all)", fmtTokens(stats.tokensAllTime))}
          {stat("Spend (all)", formatUsd2dp(stats.costAllTime2dp))}
          {stat("Synced today", String(stats.syncedToday))}
        </section>

        <section aria-labelledby="people-h">
          <h2 id="people-h" className={styles.secLabel}>
            People <span className={styles.count}>({users.length})</span>
          </h2>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="People table (scrollable)">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">User</th>
                  <th scope="col">GitHub</th>
                  <th scope="col" className={styles.num}>
                    Tokens
                  </th>
                  <th scope="col" className={styles.num}>
                    Spend
                  </th>
                  <th scope="col" className={styles.num}>
                    Boards
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.bannedAt ? styles.bannedRow : undefined}>
                    <td className={styles.num}>{u.globalRank ?? "—"}</td>
                    <td>
                      <span className={styles.handle}>@{u.handle}</span>
                      {u.isAdmin && <span className={styles.adminPill}>OWNER</span>}
                    </td>
                    <td className={styles.muted}>{u.githubLogin ?? "—"}</td>
                    <td className={styles.num}>{fmtTokens(u.tokens)}</td>
                    <td className={styles.num}>{formatUsd2dp(u.cost2dp)}</td>
                    <td className={styles.num}>{u.communityCount}</td>
                    <td>
                      {u.bannedAt ? (
                        <span className={styles.banned}>BANNED</span>
                      ) : (
                        <span className={styles.live}>live</span>
                      )}
                    </td>
                    <td>
                      {u.isAdmin ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        <BanToggle userId={u.id} handle={u.handle} banned={u.bannedAt !== null} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="comm-h">
          <h2 id="comm-h" className={styles.secLabel}>
            Communities <span className={styles.count}>({communities.length})</span>
          </h2>
          <ul className={styles.commList}>
            {communities.map((c) => (
              <li key={c.id} className={styles.commItem}>
                <div className={styles.commHead}>
                  <span className={styles.commName}>{c.name}</span>
                  <span className={styles.typePill}>{c.type}</span>
                  <span className={styles.muted}>/{c.slug}</span>
                  <span className={styles.spacer} />
                  <span className={styles.muted}>{c.memberCount} members</span>
                  <span className={styles.num}>{formatUsd2dp(c.totalSpend2dp)}</span>
                  <span className={styles.muted}>by @{c.createdByHandle ?? "—"}</span>
                </div>
                <CommunityRanks communityId={c.id} />
                <DeleteCommunityButton
                  communityId={c.id}
                  slug={c.slug}
                  name={c.name}
                  memberCount={c.memberCount}
                />
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
