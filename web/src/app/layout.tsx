// Root layout — loads the global tokens + the six brand fonts, and applies the font-variable
// classes on <html> so they preload on every route. Per-surface body fonts come from each page's
// own wrapper class (.surfaceLanding / .surfaceBoardBase), not forced globally here.
import type { ReactNode } from "react";
import "./globals.css";
import { fontVars } from "./fonts";

export const metadata = {
  title: "tokenboard — a leaderboard for your agentic-coding usage",
  description:
    "Track your token spend across Claude Code, Codex, Opencode and more — then race your friends to the top of the board.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
