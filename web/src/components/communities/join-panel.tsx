// JOIN A COMMUNITY rail (Phase 8 wired). Server component shell. The invite-code stub becomes the
// JoinByCodeForm client leaf; the work-email stub becomes a <Link> to /verify/email (real nav, no
// POST here); "+ Create a community" -> /communities/new. The 'Work email' text is a plain heading
// (NOT a <label> — there is no form control to label here; a <label htmlFor> on a <Link> is invalid).
import Link from "next/link";
import { JoinByCodeForm } from "./join-by-code-form";
import styles from "./join-panel.module.css";

export function JoinPanel({ autoCode }: { autoCode?: string }) {
  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.phead}>Join a Community</h2>
        <p className={styles.pdesc}>
          Got a <span className={styles.hl}>link or code</span> from a friend&rsquo;s board? Paste it —
          you&rsquo;re in instantly, no email needed.
        </p>
        <JoinByCodeForm autoCode={autoCode} />
        <div className={styles.orDiv}>or join your company</div>
        <div className={styles.field}>
          <span className={styles.fieldHead}>Work email</span>
          <p className={styles.note}>
            Everyone on the same domain lands on one board. We&rsquo;ll email a code to confirm it&rsquo;s you.
          </p>
          <Link href="/verify/email" className={`${styles.btn} ${styles.btnGhost}`}>
            Verify your work email
          </Link>
        </div>
      </section>
      <section className={styles.panel}>
        <p className={styles.createLine}>
          Starting fresh? <Link href="/communities/new">+ Create a community</Link>
        </p>
      </section>
    </>
  );
}
