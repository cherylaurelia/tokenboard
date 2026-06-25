"use client";
// Owner-only inline edit. Mounted by the server page ONLY when isOwner. An "Edit profile" button
// reveals a real <form>: a bio <textarea maxLength=280> + one <input> per platform. POST
// /api/v1/profile -> on ok router.refresh() (re-renders the force-dynamic server profile with the
// saved values) and collapse. Non-owners never mount this. Composes form-shell.module.css.
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SOCIAL_PLATFORMS,
  platformLabel,
  platformPlaceholder,
  MAX_BIO_LEN,
  MAX_URL_LEN,
  type Platform,
} from "@/lib/profile/social-links";
import styles from "./edit-profile-form.module.css";

export function EditProfileForm({
  initialBio,
  initialLinks,
  githubHandle,
  className,
}: {
  initialBio: string;
  initialLinks: Record<string, string>;
  githubHandle: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState(initialBio);
  const [links, setLinks] = useState<Record<Platform, string>>(
    () =>
      Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, initialLinks[p] ?? ""])) as Record<
        Platform,
        string
      >,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className={`${styles.btn} ${styles.btnGhost} ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        Edit profile
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // github is locked to the signed-in identity — always persist that handle, ignore the editable
    // state for it. Everything else comes from the form inputs.
    const social_links = Object.fromEntries(
      SOCIAL_PLATFORMS.map(
        (p) => [p, (p === "github" ? githubHandle : links[p]).trim()] as const,
      ).filter(([, v]) => v.length > 0),
    );
    try {
      const res = await fetch("/api/v1/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bio: bio.trim() || null, social_links }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {
          invalid_social_links: "One of your links isn't valid. Use a handle or an https:// URL.",
          invalid_bio: "Your bio is too long (max 280).",
          invalid_request: "Check the form and try again.", // also the path an overlong website hits (zod cap)
          rate_limited: "Too many saves. Slow down and retry.",
          unauthorized: "Sign in to edit your profile.",
          banned: "Your account can't edit its profile.",
        };
        setError(map[data.error] ?? "Couldn't save. Try again.");
        return;
      }
      setOpen(false);
      router.refresh(); // re-fetch the force-dynamic server component (fresh bio/links from Postgres)
    } catch {
      // A thrown fetch (offline / network error) must not leave the form stuck busy.
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.editRegion} ${className ?? ""}`}>
      <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.label} htmlFor="p-bio">
        Bio
      </label>
      <textarea
        id="p-bio"
        className={styles.textarea}
        value={bio}
        maxLength={MAX_BIO_LEN}
        onChange={(e) => setBio(e.target.value)}
        disabled={busy}
        rows={3}
        placeholder="A line about you."
      />
      <span className={styles.counter}>
        {bio.length}/{MAX_BIO_LEN}
      </span>
      {SOCIAL_PLATFORMS.map((p) =>
        p === "github" ? (
          <div key={p} className={styles.field}>
            <label className={styles.label} htmlFor="p-github">
              {platformLabel(p)}
            </label>
            <input
              id="p-github"
              className={styles.input}
              value={githubHandle}
              readOnly
              aria-readonly="true"
              title="Linked to the GitHub account you signed in with"
            />
            <span className={styles.lockedNote}>From your GitHub login</span>
          </div>
        ) : (
          <div key={p} className={styles.field}>
            <label className={styles.label} htmlFor={`p-${p}`}>
              {platformLabel(p)}
            </label>
            <input
              id={`p-${p}`}
              className={styles.input}
              value={links[p]}
              disabled={busy}
              placeholder={platformPlaceholder(p)}
              maxLength={MAX_URL_LEN}
              onChange={(e) => setLinks((s) => ({ ...s, [p]: e.target.value }))}
            />
          </div>
        ),
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className={`${styles.btn} ${styles.btnCoral}`} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      </form>
      {/* Sign Out lives here (owner-only edit region), not in the global nav. Separate <form> (not
          nested in the edit form) so the POST is a clean, prefetch-safe session end. */}
      <form action="/api/auth/logout" method="post" className={styles.signoutRow}>
        <button type="submit" className={`${styles.btn} ${styles.btnGhost} ${styles.signout}`}>
          Sign Out
        </button>
      </form>
    </div>
  );
}
