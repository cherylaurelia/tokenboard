// /verify/email/confirm — the canonical §5.3 magic-link landing. Thin wrapper over the shared
// VerifyPageShell (same auth gating as /verify/email); VerifyFlow auto-confirms when domain+code are
// present. No mutating GET — the client leaf POSTs to /api/v1/verify/email/confirm with the session.
import { VerifyPageShell } from "../verify-page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default function VerifyConfirmPage({ searchParams }: { searchParams: Promise<Search> }) {
  return <VerifyPageShell searchParams={searchParams} currentPath="/verify/email/confirm" lede="Confirming your code…" />;
}
