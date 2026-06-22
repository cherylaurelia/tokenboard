// /communities/new — create a community. Server shell; redirect-through-login if anon. Renders the
// CreateCommunityForm leaf inside the calm board surface.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { CreateCommunityForm } from "./create-community-form";
import styles from "./new.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function NewCommunityPage() {
  const v = await getViewer();
  const viewer = v === "outage" ? null : v;
  if (!viewer) redirect(`/api/auth/login?next=${encodeURIComponent("/communities/new")}`);

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav active="communities" viewer={viewer} currentPath="/communities/new" />
      <main className={styles.shell}>
        <h1 className={styles.title}>
          CREATE A <span className={styles.dim}>COMMUNITY</span>
        </h1>
        <p className={styles.lede}>Name your board, pick how people join, and you&rsquo;re the owner.</p>
        <CreateCommunityForm />
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
