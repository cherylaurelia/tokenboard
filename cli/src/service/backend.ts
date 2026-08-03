import { platform } from "node:os";
import type { ServiceSpec } from "./spec.js";
import { launchdBackend } from "./launchd.js";
import { systemdBackend } from "./systemd.js";
import { schtasksBackend } from "./schtasks.js";

export interface ServiceStatus {
  installed: boolean;
  loaded: boolean;
  detail: string;
}

export interface SchedulerBackend {
  readonly name: string;
  install(spec: ServiceSpec): Promise<void>;
  uninstall(spec: ServiceSpec): Promise<void>;
  status(spec: ServiceSpec): Promise<ServiceStatus>;
}

export function serviceSupported(os: NodeJS.Platform = platform()): boolean {
  return os === "darwin" || os === "linux" || os === "win32";
}

export function selectBackend(os: NodeJS.Platform = platform()): SchedulerBackend {
  switch (os) {
    case "darwin":
      return launchdBackend;
    case "linux":
      return systemdBackend;
    case "win32":
      return schtasksBackend;
    default:
      throw new Error(`background sync is not supported on this platform (${os}). Run \`tokenboard sync\` manually or via your own scheduler.`);
  }
}
