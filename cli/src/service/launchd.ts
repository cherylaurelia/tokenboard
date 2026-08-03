import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import type { ServiceSpec } from "./spec.js";
import type { SchedulerBackend, ServiceStatus } from "./backend.js";
import { runCommand } from "./exec.js";

const launchAgentsDir = () => join(homedir(), "Library", "LaunchAgents");
export const launchdPlistPath = (label: string) => join(launchAgentsDir(), `${label}.plist`);

const guiDomain = () => `gui/${process.getuid?.() ?? 0}`;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildLaunchdPlist(spec: ServiceSpec): string {
  const programArgs = [spec.nodePath, spec.cliEntry, ...spec.args]
    .map((arg) => `      <string>${xmlEscape(arg)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${xmlEscape(spec.label)}</string>
    <key>ProgramArguments</key>
    <array>
${programArgs}
    </array>
    <key>StartInterval</key>
    <integer>${spec.intervalSeconds}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xmlEscape(spec.logPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(spec.logPath)}</string>
</dict>
</plist>
`;
}

export const launchdBackend: SchedulerBackend = {
  name: "launchd",

  async install(spec) {
    const path = launchdPlistPath(spec.label);
    await mkdir(launchAgentsDir(), { recursive: true });
    await writeFile(path, buildLaunchdPlist(spec), "utf8");

    await runCommand("launchctl", ["bootout", guiDomain(), path]);
    const boot = await runCommand("launchctl", ["bootstrap", guiDomain(), path]);
    if (boot.code !== 0) {
      throw new Error(`launchctl bootstrap failed: ${boot.stderr.trim() || boot.stdout.trim() || `exit ${boot.code}`}`);
    }
    await runCommand("launchctl", ["kickstart", `${guiDomain()}/${spec.label}`]);
  },

  async uninstall(spec) {
    const path = launchdPlistPath(spec.label);
    await runCommand("launchctl", ["bootout", guiDomain(), path]);
    await rm(path, { force: true });
  },

  async status(spec) {
    const print = await runCommand("launchctl", ["print", `${guiDomain()}/${spec.label}`]);
    const loaded = print.code === 0;
    const stateLine = print.stdout.split("\n").map((l) => l.trim()).find((l) => l.startsWith("state = "));
    return {
      installed: loaded,
      loaded,
      detail: loaded ? stateLine ?? "registered with launchd" : "not registered with launchd",
    };
  },
};
