// Config-dir resolution + atomic 0600 read/write of auth.json. Edge I/O module.
// state.json (the Phase-5 sync watermark) will share this dir — do NOT create it here.
import { homedir, platform } from "node:os";
import { join, isAbsolute } from "node:path";
import { mkdir, writeFile, chmod, rename, unlink, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export interface AuthFile {
  token: string;
  userId: string;
  handle: string;
  createdAt: string;
}

// Pure: resolve the tokenboard config dir. POSIX = $XDG_CONFIG_HOME (only if ABSOLUTE, per
// the XDG spec) else ~/.config; Windows = %APPDATA% (fallback ~/AppData/Roaming). + /tokenboard.
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  if (platform() === "win32") {
    const appData = env.APPDATA && env.APPDATA.trim() !== "" ? env.APPDATA : join(homedir(), "AppData", "Roaming");
    return join(appData, "tokenboard");
  }
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".config");
  return join(base, "tokenboard");
}

export function resolveAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveConfigDir(env), "auth.json");
}

// Atomic + 0600. temp-in-SAME-dir (rename is only atomic within one filesystem), created with
// mode 0600 at open (flag wx) -> chmod (defensive vs umask) -> rename -> chmod dest (rename
// keeps the dest's prior mode on overwrite). No world-readable window. Parent dir 0700.
// NOTE: on Windows, 0600/0700 bits are largely ignored on NTFS; security there relies on
// %APPDATA% being user-scoped. Acceptable for v1.
export async function writeAuthFile(auth: AuthFile, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const dir = resolveConfigDir(env);
  const finalPath = join(dir, "auth.json");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpPath = join(dir, `.auth.json.${randomBytes(6).toString("hex")}.tmp`);
  const body = `${JSON.stringify(auth, null, 2)}\n`;
  try {
    await writeFile(tmpPath, body, { mode: 0o600, flag: "wx" }); // wx: fail if tmp exists
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, finalPath);
    await chmod(finalPath, 0o600);
  } catch (err) {
    await unlink(tmpPath).catch(() => {}); // best-effort; a kill between write+rename can orphan a 0600 .tmp
    throw err;
  }
  return finalPath;
}

// Read for later phases (Phase 5 sync reads the bearer). Fail-loud on non-ENOENT.
export async function readAuthFile(env: NodeJS.ProcessEnv = process.env): Promise<AuthFile | null> {
  try {
    return JSON.parse(await readFile(resolveAuthPath(env), "utf8")) as AuthFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
