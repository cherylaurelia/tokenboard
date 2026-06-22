// /verify/email/confirm — the CANONICAL §5.3 magic-link landing. Identical server gating to
// /verify/email (redirect-through-login preserving ?domain&?code if anon). Renders the SAME
// VerifyFlow leaf, which auto-confirms when domain+code are present. No mutating GET — the leaf
// POSTs to /api/v1/verify/email/confirm with the session cookie. This makes the emitted magic-link
// URL a live page (no 404), spec-faithful to §5.3 step 3.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VerifyFlow } from "../verify-flow";
import styles from "../verify.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function VerifyConfirmPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const magicDomain = one(sp.domain) ?? null;
  const magicCode = one(sp.code) ?? null;

  const v = await getViewer();
  const viewer = v === "outage" ? null : v;
  if (!viewer) {
    const next =
      magicDomain && magicCode
        ? `/verify/email/confirm?domain=${encodeURIComponent(magicDomain)}&code=${encodeURIComponent(magicCode)}`
        : "/verify/email";
    redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav active="communities" viewer={viewer} currentPath="/verify/email/confirm" />
      <main className={styles.shell}>
        <h1 className={styles.title}>
          VERIFY YOUR <span className={styles.dim}>WORK EMAIL</span>
        </h1>
        <p className={styles.lede}>Confirming your code…</p>
        <VerifyFlow magicDomain={magicDomain} magicCode={magicCode} />
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
