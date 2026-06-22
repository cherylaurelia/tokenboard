// /verify/email — §5.3 start->confirm entry. Thin wrapper over the shared VerifyPageShell (the auth
// gating lives there so it can't drift vs the /confirm landing).
import { VerifyPageShell } from "./verify-page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default function VerifyEmailPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <VerifyPageShell
      searchParams={searchParams}
      currentPath="/verify/email"
      lede="Everyone on the same domain lands on one company board."
    />
  );
}
