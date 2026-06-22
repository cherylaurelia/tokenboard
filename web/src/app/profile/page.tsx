// /profile — convenience alias for the signed-in user's own profile (the nav already resolves the
// PROFILE link to /user/<handle> or sign-in, but a direct /profile visit should still work).
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";

export const dynamic = "force-dynamic";

export default async function ProfileRedirect() {
  const v = await getViewer();
  if (v && v !== "outage") redirect(`/user/${v.handle}`);
  redirect("/api/auth/login?next=/profile");
}
