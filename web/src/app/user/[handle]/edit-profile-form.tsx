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
  className,
}: {
  initialBio: string;
  initialLinks: Record<string, string>;
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
    const social_links = Object.fromEntries(
      SOCIAL_PLATFORMS.map((p) => [p, links[p].trim()] as const).filter(([, v]) => v.length > 0),
    );
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
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    router.refresh(); // re-fetch the force-dynamic server component (fresh bio/links from Postgres)
  }

  return (
    <form className={`${styles.form} ${className ?? ""}`} onSubmit={onSubmit}>
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
      {SOCIAL_PLATFORMS.map((p) => (
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
      ))}
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
  );
}
