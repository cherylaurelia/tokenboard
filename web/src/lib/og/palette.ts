// The dashboard-pixel palette as a const object — the SOLE sanctioned hardcoded-hex location in the
// web surface. Satori (next/og) renders to an image and cannot read globals.css CSS variables, so the
// OG route needs literal hex. Do NOT import globals.css into the OG route, and no page imports this.
export const palette = {
  bg: "#14151f",
  panel: "#1f212e",
  frame: "#34374a",
  ink: "#e6e6ea",
  ink2: "#a8a9b6",
  ink3: "#76788a",
  coral: "#cc785c",
  coralHi: "#d68d72",
  teal: "#5f998a",
} as const;
