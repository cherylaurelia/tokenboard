// /me — redirects to the signed-in user's own profile (/user/<handle>), or to GitHub sign-in when
// signed out. Folds the Phase-3 done-gate surface into the real profile route.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const v = await getViewer();
  if (v && v !== "outage") redirect(`/user/${v.handle}`);
  redirect("/api/auth/login?next=/me");
}
