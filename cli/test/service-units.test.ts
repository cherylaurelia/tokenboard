import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildServiceSpec, resolveServiceLogPath, SERVICE_LABEL, SYNC_INTERVAL_SECONDS, type ServiceSpec } from "../src/service/spec.js";
import { selectBackend } from "../src/service/backend.js";
import { buildLaunchdPlist, launchdPlistPath } from "../src/service/launchd.js";
import { buildServiceUnit, buildTimerUnit, serviceUnitName, timerUnitName } from "../src/service/systemd.js";
import { taskName, buildSchtasksRunCommand } from "../src/service/schtasks.js";

const spec: ServiceSpec = {
  label: SERVICE_LABEL,
  nodePath: "/opt/node bin/node",
  cliEntry: "/home/devon/.npm/tokenboard/dist/cli.js",
  args: ["sync"],
  intervalSeconds: SYNC_INTERVAL_SECONDS,
  logPath: "/home/devon/.config/tokenboard/service.log",
};

test("buildServiceSpec defaults to the hourly sync job and honors overrides", () => {
  const s = buildServiceSpec({ nodePath: "/x/node", cliEntry: "/x/cli.js" }, { XDG_CONFIG_HOME: "/cfg" } as NodeJS.ProcessEnv);
  assert.equal(s.label, SERVICE_LABEL);
  assert.deepEqual(s.args, ["sync"]);
  assert.equal(s.intervalSeconds, 3600);
  assert.equal(s.nodePath, "/x/node");
  assert.equal(s.logPath, "/cfg/tokenboard/service.log");
});

test("resolveServiceLogPath sits beside auth.json in the config dir", () => {
  assert.ok(resolveServiceLogPath().endsWith(join("tokenboard", "service.log")));
});

test("selectBackend maps each OS and fails loud on the rest", () => {
  assert.equal(selectBackend("darwin").name, "launchd");
  assert.equal(selectBackend("linux").name, "systemd");
  assert.equal(selectBackend("win32").name, "Task Scheduler");
  assert.throws(() => selectBackend("aix" as NodeJS.Platform), /not supported/);
});

test("launchd plist carries the full invocation, interval, and log, XML-escaped", () => {
  const plist = buildLaunchdPlist({ ...spec, cliEntry: "/a & b/cli.js" });
  assert.match(plist, /<string>sh\.tokenboard\.sync<\/string>/);
  assert.match(plist, /<string>\/opt\/node bin\/node<\/string>/);
  assert.match(plist, /<string>sync<\/string>/);
  assert.match(plist, /<integer>3600<\/integer>/);
  assert.match(plist, /<string>\/home\/devon\/\.config\/tokenboard\/service\.log<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /\/a &amp; b\/cli\.js/);
});

test("launchdPlistPath lands in ~/Library/LaunchAgents", () => {
  assert.ok(launchdPlistPath(SERVICE_LABEL).endsWith(join("Library", "LaunchAgents", "sh.tokenboard.sync.plist")));
});

test("systemd service unit runs the sync and appends to the log, quoting spaced paths", () => {
  const unit = buildServiceUnit(spec);
  assert.match(unit, /Type=oneshot/);
  assert.match(unit, /ExecStart="\/opt\/node bin\/node" \/home\/devon\/\.npm\/tokenboard\/dist\/cli\.js sync/);
  assert.match(unit, /StandardOutput=append:\/home\/devon\/\.config\/tokenboard\/service\.log/);
});

test("systemd timer arms hourly with catch-up", () => {
  const timer = buildTimerUnit(spec);
  assert.match(timer, /OnUnitActiveSec=3600s/);
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /WantedBy=timers\.target/);
});

test("systemd unit names derive from the label", () => {
  assert.equal(serviceUnitName(SERVICE_LABEL), "sh-tokenboard-sync.service");
  assert.equal(timerUnitName(SERVICE_LABEL), "sh-tokenboard-sync.timer");
});

test("schtasks task name is UI-friendly and run command redirects to the log", () => {
  assert.equal(taskName(SERVICE_LABEL), "tokenboard-sync");
  const cmd = buildSchtasksRunCommand(spec);
  assert.match(cmd, /^cmd \/c "\/opt\/node bin\/node" "\/home\/devon\/\.npm\/tokenboard\/dist\/cli\.js" "sync" >> "\/home\/devon\/\.config\/tokenboard\/service\.log" 2>&1$/);
});
