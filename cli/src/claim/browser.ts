// Best-effort cross-platform open. Hand-rolled with node:child_process (ZERO deps — the npm
// `open` package would trip cli/scripts/assert-self-contained.mjs, whose ALLOWED set is only
// zod + node builtins). Never throws, never blocks; the caller ALWAYS also prints url+code.
import { spawn } from "node:child_process";
import { platform } from "node:os";

export function openInBrowser(url: string): void {
  let command: string;
  let args: string[];
  if (platform() === "darwin") {
    command = "open";
    args = [url];
  } else if (platform() === "win32") {
    // `start` is a cmd.exe BUILTIN, not an exe -> go through cmd. "" is the title arg so a
    // quoted/odd URL isn't eaten as the window title.
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // ENOENT (headless Linux w/o xdg-open) — degrade to print
    child.unref();
  } catch {
    // synchronous spawn throw — still degrade to print
  }
}
