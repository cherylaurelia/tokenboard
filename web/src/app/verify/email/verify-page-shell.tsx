// Shared shell for the two verify entry points (/verify/email start + /verify/email/confirm magic-
// link landing). Centralizes the security-critical auth gating (getViewer -> outage|anon ->
// redirect-through-login PRESERVING the magic-link query) so it can't drift between the two routes.
// Each page is a thin wrapper that passes its own currentPath + lede.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VerifyFlow } from "./verify-flow";
import styles from "./verify.module.css";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function VerifyPageShell({
  searchParams,
  currentPath,
  lede,
}: {
  searchParams: Promise<Search>;
  currentPath: "/verify/email" | "/verify/email/confirm";
  lede: string;
}) {
  const sp = await searchParams;
  const magicDomain = one(sp.domain) ?? null;
  const magicCode = one(sp.code) ?? null;

  const v = await getViewer();
  const viewer = v === "outage" ? null : v;
  if (!viewer) {
    const next =
      magicDomain && magicCode
        ? `${currentPath}?domain=${encodeURIComponent(magicDomain)}&code=${encodeURIComponent(magicCode)}`
        : "/verify/email";
    redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav active="communities" viewer={viewer} currentPath={currentPath} />
      <main className={styles.shell}>
        <h1 className={styles.title}>
          VERIFY YOUR <span className={styles.dim}>WORK EMAIL</span>
        </h1>
        <p className={styles.lede}>{lede}</p>
        <VerifyFlow magicDomain={magicDomain} magicCode={magicCode} />
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
