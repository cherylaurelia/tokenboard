// Shared footer. variant="landing" renders the landing-dark brand/links row (Press Start 2P brand)
// with a single "Contributing" link (-> CONTRIBUTING.md on GitHub); variant="board" renders the VT323
// brand + copyright used by the board + communities pages.
import styles from "./site-footer.module.css";
import { CONTRIBUTING_URL } from "@/lib/links";

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
              <a href={CONTRIBUTING_URL} target="_blank" rel="noopener">
                Contributing
              </a>
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
