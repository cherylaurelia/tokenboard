import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import type { ServiceSpec } from "./spec.js";
import type { SchedulerBackend, ServiceStatus } from "./backend.js";
import { runCommand } from "./exec.js";

const userUnitDir = () => join(homedir(), ".config", "systemd", "user");
const unitBase = (label: string) => label.replace(/\./g, "-");
export const serviceUnitName = (label: string) => `${unitBase(label)}.service`;
export const timerUnitName = (label: string) => `${unitBase(label)}.timer`;

export function buildServiceUnit(spec: ServiceSpec): string {
  const exec = [spec.nodePath, spec.cliEntry, ...spec.args].map(systemdQuote).join(" ");
  return `[Unit]
Description=tokenboard hourly usage sync

[Service]
Type=oneshot
ExecStart=${exec}
StandardOutput=append:${spec.logPath}
StandardError=append:${spec.logPath}
`;
}

export function buildTimerUnit(spec: ServiceSpec): string {
  return `[Unit]
Description=tokenboard hourly usage sync (timer)

[Timer]
OnBootSec=2min
OnUnitActiveSec=${spec.intervalSeconds}s
Persistent=true

[Install]
WantedBy=timers.target
`;
}

function systemdQuote(value: string): string {
  return /[\s"\\]/.test(value) ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value;
}

export const systemdBackend: SchedulerBackend = {
  name: "systemd",

  async install(spec) {
    const dir = userUnitDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, serviceUnitName(spec.label)), buildServiceUnit(spec), "utf8");
    await writeFile(join(dir, timerUnitName(spec.label)), buildTimerUnit(spec), "utf8");

    await runCommand("systemctl", ["--user", "daemon-reload"]);
    const enable = await runCommand("systemctl", ["--user", "enable", "--now", timerUnitName(spec.label)]);
    if (enable.code !== 0) {
      throw new Error(`systemctl enable failed: ${enable.stderr.trim() || enable.stdout.trim() || `exit ${enable.code}`}`);
    }
  },

  async uninstall(spec) {
    await runCommand("systemctl", ["--user", "disable", "--now", timerUnitName(spec.label)]);
    await rm(join(userUnitDir(), serviceUnitName(spec.label)), { force: true });
    await rm(join(userUnitDir(), timerUnitName(spec.label)), { force: true });
    await runCommand("systemctl", ["--user", "daemon-reload"]);
  },

  async status(spec) {
    const active = await runCommand("systemctl", ["--user", "is-active", timerUnitName(spec.label)]);
    const loaded = active.stdout.trim() === "active";
    const enabled = await runCommand("systemctl", ["--user", "is-enabled", timerUnitName(spec.label)]);
    const installed = enabled.code === 0 || loaded;
    return {
      installed,
      loaded,
      detail: loaded ? `timer active (${enabled.stdout.trim() || "enabled"})` : installed ? "timer installed but inactive" : "timer not installed",
    };
  },
};
