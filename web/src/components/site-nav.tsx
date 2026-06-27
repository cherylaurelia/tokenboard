// Shared app-bar nav. Server component (the active route is known server-side, so no client onClick
// like the prototype's cosmetic state). Takes a resolved viewer + the active nav key + the current
// path (for the sign-in return target). Renders the wordmark, the primary links (Global, My
// Communities, GitHub), and either a @handle chip (signed in) or a CLAIM YOUR SPOT button (anon).
// Sign Out is NOT here — it lives in the owner-only edit-profile form (one place, not every page).
import Link from "next/link";
import styles from "./site-nav.module.css";
import type { Viewer } from "@/lib/auth/get-viewer";
import { GITHUB_URL } from "@/lib/links";

// "home"/"profile" are still valid active keys (Home is the wordmark, Profile the @handle chip), but
// they are no longer rendered as their own nav items.
export type NavKey = "home" | "global" | "communities" | "profile";

const LINKS: { key: NavKey; label: string; href: string }[] = [
  { key: "global", label: "Global", href: "/global" },
  { key: "communities", label: "My Communities", href: "/communities" },
];

export function SiteNav({
  active,
  viewer,
  currentPath,
}: {
  active?: NavKey;
  viewer: Viewer | null;
  currentPath: string;
}) {
  const loginHref = `/api/auth/login?next=${encodeURIComponent(currentPath)}`;

  return (
    <header className={styles.appbar}>
      <Link className={styles.wordmark} href="/">
        <span className={styles.coin} aria-hidden="true">
          &gt;_
        </span>
        TOKENBOARD
      </Link>
      <nav className={styles.nav} aria-label="Primary">
        <ul className={styles.navList}>
          {LINKS.map((l) => (
            <li key={l.key}>
              <Link
                href={l.href}
                className={active === l.key ? styles.active : undefined}
                aria-current={active === l.key ? "page" : undefined}
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <a href={GITHUB_URL} target="_blank" rel="noopener">
              GitHub
            </a>
          </li>
        </ul>
      </nav>
      <div className={styles.spacer} />
      {viewer ? (
        <Link className={styles.handleChip} href={`/user/${viewer.handle}`}>
          @{viewer.handle}
        </Link>
      ) : (
        // Honest label: web auth is a SIGN-IN (GitHub OAuth), not the thing that puts you on the
        // board — that's the CLI. Land on /me so a freshly-signed-in user sees their own profile
        // (and the "$0 — run the CLI" nudge if they haven't synced yet).
        <Link className={styles.claim} href="/api/auth/login?next=/me">
          Sign in with GitHub
        </Link>
      )}
    </header>
  );
}
