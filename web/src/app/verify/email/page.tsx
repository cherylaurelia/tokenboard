// /verify/email — §5.3 start->confirm. Server shell: gates on viewer, redirects-through-login when
// anon PRESERVING any magic-link query (?domain&?code) so the link survives a sign-in round-trip.
// Reads ?domain&?code and hands them to the client leaf, which auto-confirms when both are present
// (the bare /verify/email start flow has neither).
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VerifyFlow } from "./verify-flow";
import styles from "./verify.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const magicDomain = one(sp.domain) ?? null;
  const magicCode = one(sp.code) ?? null;

  const v = await getViewer();
  const viewer = v === "outage" ? null : v;
  if (!viewer) {
    const next =
      magicDomain && magicCode
        ? `/verify/email?domain=${encodeURIComponent(magicDomain)}&code=${encodeURIComponent(magicCode)}`
        : "/verify/email";
    redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav active="communities" viewer={viewer} currentPath="/verify/email" />
      <main className={styles.shell}>
        <h1 className={styles.title}>
          VERIFY YOUR <span className={styles.dim}>WORK EMAIL</span>
        </h1>
        <p className={styles.lede}>Everyone on the same domain lands on one company board.</p>
        <VerifyFlow magicDomain={magicDomain} magicCode={magicCode} />
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
