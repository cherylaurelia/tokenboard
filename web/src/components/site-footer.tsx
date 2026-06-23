// Shared footer. variant="landing" renders the landing-dark brand/links row (Press Start 2P brand)
// with a single "Contributing" link ("#" placeholder); variant="board" renders the centered VT323
// brand + copyright used by the board + communities pages.
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
    </footer>
  );
}
