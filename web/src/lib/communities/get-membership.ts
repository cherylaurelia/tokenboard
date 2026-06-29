import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export interface ViewerMembership {
  communityId: string;
  role: "member" | "admin" | "owner";
}

export async function getViewerMembership(
  userId: string,
  slug: string,
): Promise<ViewerMembership | null> {
  const rows = (await db.execute(sql`
    select c.id::text as "communityId", m.role
    from memberships m
    join communities c on c.id = m.community_id
    where m.user_id = ${userId} and c.slug = ${slug}
    limit 1
  `)) as unknown as Array<{ communityId: string; role: "member" | "admin" | "owner" }>;
  return rows[0] ?? null;
}
