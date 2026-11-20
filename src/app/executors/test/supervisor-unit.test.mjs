// The supervisor under launchd or systemd, running the tick too (R95.3).
// Every unit is written into a temporary home; nothing is loaded into the
// machine's service manager.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "../../test/temporary.mjs";
import {
  LAUNCHD_LABEL,
  SYSTEMD_UNIT,
  supervisorUnit,
  unitKindFor,
  writeSupervisorUnit,
} from "../supervisor-unit.mjs";

const CLI = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));

// An isolated machine: its own home, config and state, and no GitHub.
function machine(prefix) {
  const root = temporaryDirectory(prefix);
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|KIROCREW)(_|$)/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    GH_TOKEN: "fake-token",
    GITHUB_TOKEN: "fake-token",
    GITHUB_API_URL: "http://127.0.0.1:9",
  });
  fs.mkdirSync(env.HOME, { recursive: true });
  return {
    root,
    env,
    stateDirectory: path.join(root, "state", "avoozl"),
    configDirectory: path.join(root, "config", "avoozl"),
  };
}

const base = (m) => ({
  home: m.env.HOME,
  env: m.env,
  node: process.execPath,
  cli: CLI,
  stateDirectory: m.stateDirectory,
  configDirectory: m.configDirectory,
  pathEnv: "/usr/bin:/bin",
  uid: 501,
});

// The argv a launchd plist runs, read back from its XML.
const plistArgv = (text) =>
  text
    .match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)[1]
    .match(/<string>[^<]*<\/string>/g)
    .map((s) =>
      s
        .slice(8, -9)
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&"),
    );

test("a launchd agent runs the supervisor with the tick, in the person's LaunchAgents", () => {
  const m = machine("avoozl-unit-launchd-");
  const odd = path.join(m.root, "a&b <c>");
  const unit = supervisorUnit({
    ...base(m),
    kind: "launchd",
    stateDirectory: odd,
    tickSeconds: 45,
  });
  assert.equal(
    unit.file,
    path.join(m.env.HOME, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`),
  );
  assert.deepEqual(plistArgv(unit.text), [
    process.execPath,
    CLI,
    "supervisor",
    "--state-directory",
    odd,
    "--config-directory",
    m.configDirectory,
    "--tick-seconds",
    "45",
  ]);
  assert.match(unit.text, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(unit.text, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.deepEqual(unit.load[0].split(" ").slice(0, 3), [
    "launchctl",
    "bootstrap",
    "gui/501",
  ]);
  if (process.platform === "darwin") {
    const file = path.join(m.root, "check.plist");
    fs.writeFileSync(file, unit.text);
    execFileSync("plutil", ["-lint", file], { stdio: "pipe" });
  }
});

test("a systemd user service keeps detached children alive and quotes every word", () => {
  const m = machine("avoozl-unit-systemd-");
  const odd = path.join(m.root, 'p%h $HOME "q" \\z');
  const unit = supervisorUnit({
    ...base(m),
    kind: "systemd",
    configDirectory: odd,
  });
  assert.equal(
    unit.file,
    path.join(m.env.XDG_CONFIG_HOME, "systemd", "user", SYSTEMD_UNIT),
  );
  // KillMode=process: a restart must not end the children (R95.4).
  assert.match(unit.text, /^KillMode=process$/m);
  assert.match(unit.text, /^Restart=always$/m);
  assert.match(unit.text, /^WantedBy=default\.target$/m);
  const exec = unit.text.match(/^ExecStart=(.*)$/m)[1];
  assert(exec.includes('"--tick-seconds" "60"'));
  // `%` and `$` doubled, quote and backslash escaped: systemd reads the path
  // back exactly.
  assert(exec.includes('p%%h $$HOME \\"q\\" \\\\z'), exec);
  const noXdg = { ...m.env };
  delete noXdg.XDG_CONFIG_HOME;
  assert.equal(
    supervisorUnit({ ...base(m), env: noXdg, kind: "systemd" }).file,
    path.join(m.env.HOME, ".config", "systemd", "user", SYSTEMD_UNIT),
  );
  const verify = spawnSync("systemd-analyze", ["--version"], {
    stdio: "ignore",
  });
  if (process.platform === "linux" && verify.status === 0) {
    const plainUnit = supervisorUnit({ ...base(m), kind: "systemd" });
    const file = path.join(m.root, SYSTEMD_UNIT);
    fs.writeFileSync(file, plainUnit.text);
    const result = spawnSync("systemd-analyze", ["verify", file], {
      encoding: "utf8",
      env: m.env,
    });
    assert.doesNotMatch(
      result.stderr,
      new RegExp(`${SYSTEMD_UNIT}.*(error|Failed|Unknown)`, "i"),
      result.stderr,
    );
  }
});

test("a unit refuses relative paths, a line break, a bad interval and an unknown kind", () => {
  const m = machine("avoozl-unit-refuse-");
  assert.throws(
    () => supervisorUnit({ ...base(m), kind: "launchd", cli: "cli.mjs" }),
    /absolute path/,
  );
  assert.throws(
    () =>
      supervisorUnit({
        ...base(m),
        kind: "systemd",
        stateDirectory: `${m.root}\nExecStartPre=/bin/false`,
      }),
    /one line/,
  );
  assert.throws(
    () => supervisorUnit({ ...base(m), kind: "systemd", tickSeconds: 0 }),
    /1 to 86400/,
  );
  assert.throws(
    () => supervisorUnit({ ...base(m), kind: "cron" }),
    /launchd or systemd/,
  );
  assert.equal(unitKindFor("darwin"), "launchd");
  assert.equal(unitKindFor("linux"), "systemd");
  assert.throws(() => unitKindFor("win32"), /not win32/);
});

test("writing a unit keeps a person's edited file unless forced", () => {
  const m = machine("avoozl-unit-write-");
  const unit = supervisorUnit({ ...base(m), kind: "systemd" });
  assert.deepEqual(writeSupervisorUnit(unit), {
    written: true,
    replaced: false,
  });
  assert.equal(fs.readFileSync(unit.file, "utf8"), unit.text);
  assert.deepEqual(writeSupervisorUnit(unit), {
    written: false,
    unchanged: true,
  });
  fs.appendFileSync(unit.file, "# mine\n");
  assert.throws(() => writeSupervisorUnit(unit), /already exists/);
  assert.match(fs.readFileSync(unit.file, "utf8"), /# mine/);
  assert.deepEqual(writeSupervisorUnit(unit, { force: true }), {
    written: true,
    replaced: true,
  });
  assert.equal(fs.readFileSync(unit.file, "utf8"), unit.text);
});
