import { stat, readFile } from "node:fs/promises";
import { readAuthFile } from "../config/auth-store.js";
import { selectBackend } from "../service/backend.js";
import { buildServiceSpec, SYNC_INTERVAL_SECONDS } from "../service/spec.js";

const out = (line: string) => process.stdout.write(`${line}\n`);

async function readLastRun(logPath: string): Promise<{ at: Date; line: string } | null> {
  try {
    const [info, body] = await Promise.all([stat(logPath), readFile(logPath, "utf8")]);
    const lastLine = body.split("\n").map((l) => l.trim()).filter(Boolean).at(-1);
    return { at: info.mtime, line: lastLine ?? "(no output yet)" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function runServiceInstall(): Promise<void> {
  const backend = selectBackend();
  const spec = buildServiceSpec();
  await backend.install(spec);

  out(`  tokenboard service — installed. Syncing every ${SYNC_INTERVAL_SECONDS / 60} min via ${backend.name}.`);
  out(`  Logs: ${spec.logPath}`);

  if (!(await readAuthFile())) {
    out("  Not signed in yet — run `tokenboard claim` so the background sync has credentials.");
  }
}

export async function runServiceUninstall(): Promise<void> {
  const backend = selectBackend();
  const spec = buildServiceSpec();
  await backend.uninstall(spec);
  out(`  tokenboard service — removed from ${backend.name}. Background sync stopped.`);
}

export async function runServiceStatus(): Promise<void> {
  const backend = selectBackend();
  const spec = buildServiceSpec();
  const status = await backend.status(spec);

  out(`  tokenboard service — ${status.loaded ? "active" : status.installed ? "installed (inactive)" : "not installed"} (${backend.name}).`);
  out(`  ${status.detail}`);

  const lastRun = await readLastRun(spec.logPath);
  if (lastRun) {
    out(`  Last run: ${lastRun.at.toISOString()}`);
    out(`    ${lastRun.line}`);
  } else if (status.installed) {
    out("  Last run: not yet — the first sync runs shortly after install.");
  }

  if (!status.installed) {
    out("  Run `tokenboard service install` to start syncing hourly in the background.");
  }
}
