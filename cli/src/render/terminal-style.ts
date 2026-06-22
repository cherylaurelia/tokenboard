import pc from "picocolors"; // CJS — MUST default-import (named imports break esbuild interop)

export interface TerminalStyle {
  color: boolean;
  width: number;
  ascii: boolean;
}

export interface StyleInputs {
  isTTY: boolean;
  noColorEnv: boolean; // NO_COLOR present in env
  noColorFlag: boolean; // --no-color
  asciiFlag: boolean; // --ascii
  columns: number | undefined; // process.stdout.columns
}

// Resolve render style deterministically. Color only when interactive AND not suppressed.
// Non-TTY / NO_COLOR / --no-color drop ANSI but KEEP box-drawing alignment. ASCII is an
// explicit opt-in flag (not auto-detected) so a Unicode-hostile terminal never mojibakes.
export function resolveStyle(inputs: StyleInputs): TerminalStyle {
  return {
    color: inputs.isTTY && !inputs.noColorEnv && !inputs.noColorFlag,
    width: Math.min(inputs.columns ?? 80, 80),
    ascii: inputs.asciiFlag,
  };
}

// Color wrappers that no-op when color is off — so render code stays branch-free.
export function styler(style: TerminalStyle) {
  const on = style.color;
  return {
    dim: (s: string) => (on ? pc.dim(s) : s),
    bold: (s: string) => (on ? pc.bold(s) : s),
    green: (s: string) => (on ? pc.green(s) : s),
    red: (s: string) => (on ? pc.red(s) : s),
    cyan: (s: string) => (on ? pc.cyan(s) : s),
    inverse: (s: string) => (on ? pc.inverse(s) : s),
  };
}
