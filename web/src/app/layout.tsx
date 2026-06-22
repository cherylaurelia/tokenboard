// Minimal root layout. The real UI (fonts, palette, the landing-dark/dashboard-pixel
// prototypes) lands in Phase 7.
import type { ReactNode } from "react";

export const metadata = {
  title: "tokenboard",
  description: "A leaderboard for your agentic-coding token usage.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
