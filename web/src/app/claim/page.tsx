// /claim — browser approve page (auth: session). Server component. Resolves the user via
// getUser() (NEVER getSession()). Reads ?code=<user_code>. If signed out, redirect THROUGH
// login preserving the code. Styled with the shared board chrome + form-shell (matches verify).
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/get-viewer";
import { USER_CODE_RE } from "@/lib/cli-login/user-code";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ApproveForm } from "./approve-form";
import styles from "./claim.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams; // Next 16: searchParams is a Promise
  // A repeated ?code=a&code=b yields string[]; take the first. Anything else -> "" (rejected
  // by USER_CODE_RE below).
  const raw = Array.isArray(code) ? code[0] : code;
  const userCode = (raw ?? "").toUpperCase();

  const v = await getViewer();
  const viewer = v === "outage" ? null : v;

  // Validate against the actual generator alphabet (shared regex) — a code with an ambiguous
  // char the server can never have minted is rejected at the boundary.
  if (!USER_CODE_RE.test(userCode)) {
    return (
      <div className={styles.surfaceBoardBase}>
        <SiteNav viewer={viewer} currentPath="/claim" />
        <main className={styles.shell}>
          <h1 className={styles.title}>
            INVALID <span className={styles.dim}>CODE</span>
          </h1>
          <p className={styles.lede}>
            That code isn&rsquo;t valid. Run <code>tokenboard claim</code> again to get a fresh one.
          </p>
        </main>
        <SiteFooter variant="board" />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Thread the code back through GitHub OAuth -> callback -> /claim?code=...
    redirect(`/api/auth/login?next=${encodeURIComponent(`/claim?code=${userCode}`)}`);
  }

  return (
    <div className={styles.surfaceBoardBase}>
      <SiteNav viewer={viewer} currentPath="/claim" />
      <main className={styles.shell}>
        <h1 className={styles.title}>
          APPROVE <span className={styles.dim}>THIS MACHINE</span>
        </h1>
        <p className={styles.lede}>
          This links a CLI on your machine to upload your agentic-coding usage as you.
        </p>
        <ApproveForm userCode={userCode} />
      </main>
      <SiteFooter variant="board" />
    </div>
  );
}
