"use client";
// Owner-only profile editing, split across the header (action buttons) and the card body (read-only
// content vs the edit form) but sharing ONE open/close state via context. Mounted by the server page
// ONLY when isOwner. When open, the read-only body (bio/links/graph) is hidden and the form takes its
// place, so the editing view is clean — no stale content alongside the inputs. POST /api/v1/profile
// -> on ok router.refresh() (re-renders the force-dynamic server profile) and collapse.
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  SOCIAL_PLATFORMS,
  platformLabel,
  platformPlaceholder,
  MAX_BIO_LEN,
  MAX_HANDLE_LEN,
  type Platform,
} from "@/lib/profile/social-links";
import styles from "./edit-profile-form.module.css";

interface EditState {
  open: boolean;
  setOpen: (v: boolean) => void;
  initialBio: string;
  initialLinks: Record<string, string>;
  githubHandle: string;
}

const Ctx = createContext<EditState | null>(null);

function useEdit(): EditState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Profile edit components must be used within <ProfileEditProvider>");
  return ctx;
}

export function ProfileEditProvider({
  initialBio,
  initialLinks,
  githubHandle,
  children,
}: {
  initialBio: string;
  initialLinks: Record<string, string>;
  githubHandle: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, setOpen, initialBio, initialLinks, githubHandle }}>
      {children}
    </Ctx.Provider>
  );
}

export function ProfileHeaderActions({ className }: { className?: string }) {
  const { open, setOpen } = useEdit();
  if (open) return null;
  return (
    <div className={`${styles.headActions} ${className ?? ""}`}>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnGhost}`}
        onClick={() => setOpen(true)}
      >
        Edit profile
      </button>
      {/* Separate <form> POST so it's a clean, prefetch-safe session end. */}
      <form action="/api/auth/logout" method="post" className={styles.signoutForm}>
        <button type="submit" className={`${styles.btn} ${styles.btnGhost} ${styles.signout}`}>
          Sign Out
        </button>
      </form>
    </div>
  );
}

export function ProfileEditableBody({ children }: { children: ReactNode }) {
  const { open } = useEdit();
  if (open) return <ProfileEditForm />;
  return <>{children}</>;
}

function ProfileEditForm() {
  const router = useRouter();
  const { setOpen, initialBio, initialLinks, githubHandle } = useEdit();
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
          invalid_social_links: "One of your handles isn't valid. Enter just the username.",
          invalid_bio: "Your bio is too long (max 280).",
          invalid_request: "Check the form and try again.",
          rate_limited: "Too many saves. Slow down and retry.",
          unauthorized: "Sign in to edit your profile.",
          banned: "Your account can't edit its profile.",
        };
        setError(map[data.error] ?? "Couldn't save. Try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
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
      {/* GitHub first: it's the locked identity field (from sign-in), styled as read-only so it
          reads as not editable. The remaining platforms below are the editable inputs. */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="p-github">
          {platformLabel("github")}
        </label>
        <input
          id="p-github"
          className={`${styles.input} ${styles.inputLocked}`}
          value={githubHandle}
          readOnly
          aria-readonly="true"
          title="Linked to the GitHub account you signed in with"
        />
        <span className={styles.lockedNote}>From your GitHub login</span>
      </div>
      {SOCIAL_PLATFORMS.filter((p) => p !== "github").map((p) => (
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
            maxLength={MAX_HANDLE_LEN}
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
