// A tiny stderr spinner for the collection phase, so the user knows the CLI is working (reading logs
// + probing ccusage can take a few seconds on a cold npx cache). Writes to STDERR so it never
// pollutes stdout (the preview / --json payload stays clean + pipeable). Strictly TTY-gated: when
// stderr isn't a TTY (piped, CI, redirected) every method is a no-op, so non-interactive output is
// byte-identical to before. No deps; honors NO_COLOR-style plainness via the ascii flag.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAMES_ASCII = ["|", "/", "-", "\\"];
const INTERVAL_MS = 80;

export interface Spinner {
  stop: () => void;
}

// Start a spinner with `label`. Returns a handle whose stop() clears the line. A no-op handle when
// stderr is not a TTY. `ascii` swaps the braille frames for ASCII (matches the --ascii render flag).
export function startSpinner(label: string, ascii = false): Spinner {
  if (!process.stderr.isTTY) return { stop: () => {} };

  const frames = ascii ? FRAMES_ASCII : FRAMES;
  let i = 0;
  const write = (s: string) => process.stderr.write(s);

  write("\x1b[?25l"); // hide cursor
  const render = () => {
    const frame = frames[i % frames.length];
    i += 1;
    write(`\r${frame} ${label}`); // \r returns to col 0; the line is overwritten each tick
  };
  render();
  const timer = setInterval(render, INTERVAL_MS);
  timer.unref?.(); // never keep the process alive just for the spinner

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      write("\r\x1b[2K"); // \r + clear-entire-line: erase the spinner so output starts clean
      write("\x1b[?25h"); // restore cursor
    },
  };
}
