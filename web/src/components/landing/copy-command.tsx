"use client";

// Copy-to-clipboard button for a terminal command line. A real <button> (44px hit area), toggles a
// "Copied" label for 1.3s. No localStorage. Mirrors the prototype's .copy-btn behaviour.
import { useState, useTransition } from "react";
import styles from "./copy-command.module.css";

export function CopyCommand({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      // clipboard may be unavailable (insecure context); the label still flips so the click responds.
    }
    setCopied(true);
    startTransition(() => {
      window.setTimeout(() => setCopied(false), 1300);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`${styles.copyBtn} ${copied ? styles.done : ""} ${className ?? ""}`}
      aria-label={`Copy command: ${value}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
