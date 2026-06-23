import pc from "picocolors"; // CJS — MUST default-import (named imports break esbuild interop)

// 0 = no color, 1 = basic 16, 2 = 256-color, 3 = truecolor (16m). Mirrors supports-color.
export type ColorLevel = 0 | 1 | 2 | 3;

export interface TerminalStyle {
  color: boolean; // master gate (false => level forced to 0 => byte-clean output)
  level: ColorLevel; // resolved color depth, already gated by `color`
  width: number;
  ascii: boolean;
}

export interface StyleInputs {
  isTTY: boolean;
  noColorEnv: boolean; // NO_COLOR present in env
  noColorFlag: boolean; // --no-color
  asciiFlag: boolean; // --ascii
  columns: number | undefined; // process.stdout.columns
  colorterm: string | undefined; // process.env.COLORTERM
  term: string | undefined; // process.env.TERM
  forceColor: string | undefined; // process.env.FORCE_COLOR
}

// PURE color-depth ladder (mirrors supports-color, dependency-free). Only runs when color is already
// permitted (NO_COLOR / non-TTY are handled FIRST by style.color in resolveStyle). FORCE_COLOR sets
// DEPTH but never overrides the isTTY requirement — NO_COLOR / non-TTY always win.
function detectColorLevel(i: StyleInputs): ColorLevel {
  const force = i.forceColor;
  if (force !== undefined && force !== "") {
    const n = Number(force);
    if (n === 0) return 0; // FORCE_COLOR=0 explicitly disables (supports-color convention)
    if (n === 1 || n === 2 || n === 3) return n as ColorLevel;
    return 3; // FORCE_COLOR=true/yes => max
  }
  const ct = (i.colorterm ?? "").toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return 3;
  const term = (i.term ?? "").toLowerCase();
  if (term === "xterm-kitty" || term === "ghostty" || term === "wezterm") return 3;
  if (/-256(color)?$/.test(term)) return 2;
  return 1; // TTY but unknown/basic TERM: assume 16-color (coral degrades to yellow)
}

// Resolve render style deterministically. Color only when interactive AND not suppressed.
export function resolveStyle(inputs: StyleInputs): TerminalStyle {
  const color = inputs.isTTY && !inputs.noColorEnv && !inputs.noColorFlag;
  return {
    color,
    level: color ? detectColorLevel(inputs) : 0, // master gate: NO_COLOR/non-TTY => 0
    width: Math.min(inputs.columns ?? 80, 80),
    ascii: inputs.asciiFlag,
  };
}

// Raw truecolor coral (#cc785c) + hi-coral (#d68d72). Reset with \x1b[39m (FG-ONLY) so it COMPOSES
// inside pc.bold/pc.dim — \x1b[0m would clear bold mid-string. 256-cube nearest indices: 173/180.
const CORAL_TC = "\x1b[38;2;204;120;92m";
const CORAL_HI_TC = "\x1b[38;2;214;141;114m";
const RESET_FG = "\x1b[39m";
const CORAL_256 = "\x1b[38;5;173m";
const CORAL_HI_256 = "\x1b[38;5;180m";

// Color wrappers that no-op when color is off — render code stays branch-free.
export function styler(style: TerminalStyle) {
  const on = style.color;
  const lvl = style.level;
  // The ONLY place a raw coral escape can be emitted — gated by lvl so it never leaks to pipes.
  const coral = (s: string): string => {
    if (lvl >= 3) return CORAL_TC + s + RESET_FG;
    if (lvl === 2) return CORAL_256 + s + RESET_FG;
    if (lvl === 1) return pc.yellow(s); // closest warm basic-16
    return s;
  };
  const coralHi = (s: string): string => {
    if (lvl >= 3) return CORAL_HI_TC + s + RESET_FG;
    if (lvl === 2) return CORAL_HI_256 + s + RESET_FG;
    if (lvl === 1) return pc.yellow(s);
    return s;
  };
  return {
    dim: (s: string) => (on ? pc.dim(s) : s),
    bold: (s: string) => (on ? pc.bold(s) : s),
    green: (s: string) => (on ? pc.green(s) : s),
    red: (s: string) => (on ? pc.red(s) : s),
    cyan: (s: string) => (on ? pc.cyan(s) : s),
    inverse: (s: string) => (on ? pc.inverse(s) : s),
    coral,
    coralHi,
    // Accent a busy day WITHOUT ever dimming real data: a normal/low day stays DEFAULT full-weight
    // text (readable), a busy day (t >= 0.34 of the per-series max) gets coral, the peak (t > 0.67)
    // gets bold hi-coral. Identity at level 0. "Tasteful: accent peaks only."
    accentByLevel: (s: string, t: number): string => {
      if (lvl === 0) return s;
      if (t > 0.67) return pc.bold(coralHi(s));
      if (t >= 0.34) return coral(s);
      return s; // baseline: plain default text, never dimmed
    },
  };
}
