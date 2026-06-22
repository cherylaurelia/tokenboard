// COMMUNITY rail panel (dashboard-pixel community panel). Renders ONLY §7.2 CommunityMeta fields
// (name, member count, a join-policy hint) + a Phase-8 INVITE FRIENDS stub button. The prototype's
// invite-code pill is intentionally omitted: join_code is not in the CommunityMeta contract and
// surfacing it is Phase-8 invite work (flagged in the PR).
import Link from "next/link";
import type { CommunityMeta } from "@tokenboard/contracts";
import styles from "./community-panel.module.css";

function policyHint(c: CommunityMeta): string {
  if (c.joinPolicy === "email_domain") return "work-email board";
  if (c.joinPolicy === "code") return "invite-only";
  return "open to join";
}

export function CommunityPanel({ community }: { community: CommunityMeta }) {
  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.phead}>{community.name}</h2>
        <dl className={styles.meta}>
          <div className={styles.metaRow}>
            <dt className={styles.k}>Members</dt>
            <dd className={styles.v}>{community.memberCount}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt className={styles.k}>Access</dt>
            <dd className={styles.v}>{policyHint(community)}</dd>
          </div>
        </dl>
      </section>
      <section className={styles.panel}>
        {/* PHASE-8 STUB — real invite generation is Phase 8; this links to a marked placeholder. */}
        <Link className={styles.inviteBtn} href="/communities?soon=invite">
          Invite Friends
        </Link>
      </section>
    </>
  );
}
