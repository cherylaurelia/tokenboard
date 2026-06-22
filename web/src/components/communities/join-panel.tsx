// JOIN A COMMUNITY rail (communities prototype). PHASE-8 SEAM: the form fields are real
// <label>/<input> for visual + a11y parity, but there is NO POST wiring here — the submit controls
// are <Link> buttons that navigate to clearly-marked Phase-8 stub anchors. The actual
// join / verify-email / create actions land in Phase 8 (POST /communities, /join, /verify/email).
import Link from "next/link";
import styles from "./join-panel.module.css";

export function JoinPanel() {
  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.phead}>Join a Community</h2>
        <p className={styles.pdesc}>
          Got a <span className={styles.hl}>link or code</span> from a friend&rsquo;s board? Paste it —
          you&rsquo;re in instantly, no email needed.
        </p>

        {/* PHASE-8 STUB — no POST. The button Link-navigates to a marked placeholder. */}
        <div className={styles.field}>
          <label htmlFor="invite-code">Invite link or code</label>
          <div className={styles.inputRow}>
            <input id="invite-code" type="text" placeholder="code or a link" disabled />
            <Link href="/communities?soon=join" className={`${styles.btn} ${styles.btnCoral}`}>
              Join
            </Link>
          </div>
          <span className={styles.note}>Joining is coming soon — wiring lands in the next release.</span>
        </div>

        <div className={styles.orDiv}>or join your company</div>

        <div className={styles.field}>
          <label htmlFor="work-email">Work email</label>
          <div className={styles.inputRow}>
            <input id="work-email" type="email" placeholder="you@acme-corp.com" disabled />
            <Link href="/communities?soon=verify" className={`${styles.btn} ${styles.btnGhost}`}>
              Verify
            </Link>
          </div>
          <span className={styles.note}>
            Everyone on the same domain lands on one board. We&rsquo;ll email a link to confirm it&rsquo;s you.
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <p className={styles.createLine}>
          Starting fresh? <Link href="/communities?soon=create">+ Create a community</Link>
        </p>
      </section>
    </>
  );
}
