// Shared footer. variant="landing" renders the landing-dark brand/links row (Press Start 2P brand);
// variant="board" renders the centered VT323 footer used by the board + communities pages. PRIVACY
// and GITHUB hrefs are "#" placeholders for now (no real URLs yet — flagged in the PR).
import styles from "./site-footer.module.css";

export function SiteFooter({ variant = "board" }: { variant?: "landing" | "board" }) {
  if (variant === "landing") {
    return (
      <footer className={styles.footLanding}>
        <div className={styles.landingInner}>
          <span className={styles.brandPixel}>
            <span className={styles.coin} aria-hidden="true">
              &gt;_
            </span>{" "}
            TOKENBOARD
          </span>
          <span className={styles.sep} aria-hidden="true">
            &middot;
          </span>
          <span>&copy; 2026</span>
          <span className={styles.sep} aria-hidden="true">
            &middot;
          </span>
          <span>MIT License</span>
          <span className={styles.spacer} />
          <ul className={styles.links}>
            <li>
              <a href="#">Privacy</a>
            </li>
            <li>
              <a href="#" rel="noopener">
                GitHub
              </a>
            </li>
            <li>
              <a href="#">Contributing</a>
            </li>
          </ul>
        </div>
      </footer>
    );
  }

  return (
    <footer className={styles.footBoard}>
      <span className={styles.brand}>
        <span className={styles.coin} aria-hidden="true">
          &gt;_
        </span>{" "}
        TOKENBOARD
      </span>
      <span className={styles.sep} aria-hidden="true">
        &middot;
      </span>
      <span>&copy; 2026</span>
      <span className={styles.sep} aria-hidden="true">
        &middot;
      </span>
      <a href="#">Privacy</a>
      <span className={styles.sep} aria-hidden="true">
        &middot;
      </span>
      <a href="#" rel="noopener">
        GitHub
      </a>
    </footer>
  );
}
