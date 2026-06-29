"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateCommunityResponse } from "@tokenboard/contracts";
import { inviteLink } from "@/lib/communities/invite-link";
import styles from "./new.module.css";

export function CreateCommunityForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [policy, setPolicy] = useState<"open" | "code">("open");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateCommunityResponse | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/communities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "community", name: name.trim(), join_policy: policy, visibility }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const map: Record<string, string> = {
        reserved_slug: "That name maps to a reserved slug. Try another.",
        invalid_slug: "That name is too short. Try a longer one.",
        invalid_request: "Check the form and try again.",
      };
      setError(map[data.error] ?? "Couldn't create the community. Try again.");
      setBusy(false);
      return;
    }
    const c = data as CreateCommunityResponse;
    const path = new URL(c.join_url).pathname;
    if (c.join_code) {
      setCreated(c);
      setBusy(false);
    } else {
      router.push(path);
    }
  }

  if (created) {
    const path = new URL(created.join_url).pathname;
    const link = created.join_code ? inviteLink(window.location.origin, created.join_code) : null;
    const copy = (which: "code" | "link", text: string) =>
      navigator.clipboard
        ?.writeText(text)
        .then(() => setCopied(which))
        .catch(() => {});
    return (
      <section className={styles.card} role="status">
        <p className={styles.success}>Created. Share the invite link (or code) so people can join:</p>
        {link && (
          <div className={styles.linkRow}>
            <span className={styles.linkValue}>{link}</span>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => copy("link", link)}
            >
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        <div className={styles.codeRow}>
          <span className={styles.codeValue}>{created.join_code}</span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => copy("code", created.join_code ?? "")}
          >
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>
        <a className={`${styles.btn} ${styles.btnCoral}`} href={path}>
          Go to board
        </a>
      </section>
    );
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <label htmlFor="c-name">Name</label>
      <input
        id="c-name"
        className={styles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        required
        disabled={busy}
        placeholder="Frontend Guild"
      />
      <fieldset className={styles.fieldset}>
        <legend>How do people join?</legend>
        <label className={styles.radio}>
          <input type="radio" name="policy" checked={policy === "open"} onChange={() => setPolicy("open")} /> Open —
          anyone can join
        </label>
        <label className={styles.radio}>
          <input type="radio" name="policy" checked={policy === "code"} onChange={() => setPolicy("code")} /> Code —
          needs the invite code
        </label>
      </fieldset>
      <label htmlFor="c-vis">Visibility</label>
      <select
        id="c-vis"
        className={styles.select}
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        disabled={busy}
      >
        <option value="public">Public</option>
        <option value="unlisted">Unlisted</option>
        <option value="private">Private</option>
      </select>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={`${styles.btn} ${styles.btnCoral}`} disabled={busy || name.trim().length === 0}>
        {busy ? "Creating…" : "Create community"}
      </button>
    </form>
  );
}
