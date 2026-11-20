// The login unit (MS4): written with absolute paths and argv lists, loaded and
// unloaded by commands that are printed, never installed over a file Avoozl
// did not write. The service managers are fakes, so these run on every system.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LAUNCHD_LABEL,
  MARKER,
  SYSTEMD_UNIT,
  TASK_NAME,
  installLoginUnit,
  loginUnit,
  removeLoginUnit,
} from "../login-unit.mjs";

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-login-"));
  t.after(() =>
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    }),
  );
  const base = {
    home: path.join(root, "home"),
    env: { XDG_CONFIG_HOME: path.join(root, "xdg") },
    node: path.resolve(root, "bin", "node"),
    cli: path.resolve(root, "avoozl", "cli.mjs"),
    stateDirectory: path.resolve(root, "state"),
    configDirectory: path.resolve(root, "config"),
    pathEnv: "/opt/tools:/usr/bin",
    uid: 501,
    user: "HOST\\person",
  };
  return { root, base };
}

// A service manager that records each argv and answers from a table.
function fake({ answers = () => "" } = {}) {
  const calls = [];
  const run = (argv) => {
    calls.push(argv.join(" "));
    return answers(argv);
  };
  return { calls, run };
}

test("launchd: the agent holds absolute paths, argv strings, the captured PATH and no secret", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({ ...base, kind: "launchd" });
  assert.equal(
    unit.file,
    path.join(base.home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`),
  );
  for (const word of [
    base.node,
    base.cli,
    "<string>start</string>",
    "<string>--foreground</string>",
  ])
    assert.ok(unit.text.includes(word), word);
  assert.ok(unit.text.includes("<string>/opt/tools:/usr/bin</string>"));
  assert.ok(unit.text.includes(MARKER));
  assert.ok(unit.text.includes("<key>KeepAlive</key>"));
  assert.doesNotMatch(unit.text, /TOKEN|SECRET|KEY=|PASSWORD/i);
  assert.deepEqual(unit.load, [
    ["launchctl", "bootstrap", "gui/501", unit.file],
  ]);
  assert.deepEqual(unit.unload, [
    ["launchctl", "bootout", `gui/501/${LAUNCHD_LABEL}`],
  ]);
});

test("systemd: every word is quoted and a specifier cannot expand", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({
    ...base,
    kind: "systemd",
    cli: path.resolve(base.cli, "../odd %h $HOME dir/cli.mjs"),
  });
  assert.equal(
    unit.file,
    path.join(base.env.XDG_CONFIG_HOME, "systemd", "user", SYSTEMD_UNIT),
  );
  assert.ok(unit.text.startsWith(`# ${MARKER}`));
  const exec = unit.text
    .split("\n")
    .find((line) => line.startsWith("ExecStart="));
  assert.ok(exec.includes("odd %%h $$HOME dir"), exec);
  assert.ok(
    exec.endsWith('"start" "--foreground" "--starter" "login-unit"'),
    exec,
  );
  assert.match(unit.text, /Restart=on-failure/);
  assert.match(unit.text, /Environment="PATH=\/opt\/tools:\/usr\/bin"/);
});

test("a unit refuses relative paths and a line break", (t) => {
  const { base } = scratch(t);
  assert.throws(
    () => loginUnit({ ...base, kind: "launchd", cli: "cli.mjs" }),
    /absolute path/,
  );
  assert.throws(
    () => loginUnit({ ...base, kind: "systemd", pathEnv: "/bin\nExecStop=x" }),
    /one line/,
  );
  assert.throws(() => loginUnit({ ...base, kind: "cron" }), /Choose launchd/);
});

test("start --at-login writes the unit, runs the load commands and lists them", (t) => {
  const { base } = scratch(t);
  for (const [kind, expected] of [
    ["launchd", ["launchctl bootstrap gui/501"]],
    [
      "systemd",
      [
        "systemctl --user daemon-reload",
        `systemctl --user enable --now ${SYSTEMD_UNIT}`,
      ],
    ],
  ]) {
    const unit = loginUnit({ ...base, kind });
    const { calls, run } = fake();
    const done = installLoginUnit(unit, { run });
    assert.equal(fs.readFileSync(unit.file, "utf8"), unit.text);
    assert.equal(done.replaced, false);
    const loads = calls.filter((c) => !/show-environment/.test(c));
    assert.equal(loads.length, expected.length);
    expected.forEach((line, i) =>
      assert.ok(loads[i].startsWith(line), loads[i]),
    );
    assert.deepEqual(done.ran.length, expected.length);
  }
});

test("an install replaces its own unit and refuses a file it did not write", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({ ...base, kind: "launchd" });
  installLoginUnit(unit, { run: fake().run });
  const again = fake();
  const done = installLoginUnit(
    { ...unit, text: `${unit.text}<!-- again -->` },
    { run: again.run },
  );
  assert.equal(done.replaced, true);
  assert.match(
    again.calls[0],
    /launchctl bootout/,
    "the old unit is unloaded first",
  );
  assert.match(fs.readFileSync(unit.file, "utf8"), /again/);

  fs.writeFileSync(unit.file, "someone else's agent");
  const refused = fake();
  assert.throws(
    () => installLoginUnit(unit, { run: refused.run }),
    /did not write it/,
  );
  assert.deepEqual(refused.calls, []);
  assert.equal(fs.readFileSync(unit.file, "utf8"), "someone else's agent");
});

test("a Linux without a user systemd is refused with the foreground line", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({ ...base, kind: "systemd" });
  const { calls, run } = fake({
    answers: () => {
      throw Error("Failed to connect to bus");
    },
  });
  assert.throws(
    () => installLoginUnit(unit, { run }),
    /no user systemd.*avoozl start --foreground/,
  );
  assert.equal(calls.length, 1);
  assert.equal(fs.existsSync(unit.file), false);
});

test("stop --at-login unloads and deletes the unit, and leaves another's alone", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({ ...base, kind: "systemd" });
  assert.equal(removeLoginUnit(unit, { run: fake().run }).removed, false);
  installLoginUnit(unit, { run: fake().run });
  const { calls, run } = fake();
  const done = removeLoginUnit(unit, { run });
  assert.equal(done.removed, true);
  assert.deepEqual(calls, [`systemctl --user disable --now ${SYSTEMD_UNIT}`]);
  assert.equal(fs.existsSync(unit.file), false);

  fs.mkdirSync(path.dirname(unit.file), { recursive: true });
  fs.writeFileSync(unit.file, "[Unit]\nDescription=mine\n");
  assert.throws(
    () => removeLoginUnit(unit, { run: fake().run }),
    /did not write it/,
  );
  assert.equal(fs.existsSync(unit.file), true);
});

test("Windows: a logon task for this user, least privilege, restart on failure, the marker as description", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({ ...base, kind: "schtasks" });
  assert.match(unit.text, new RegExp(`<Description>${MARKER}</Description>`));
  assert.match(
    unit.text,
    /<LogonTrigger>[\s\S]*<UserId>HOST\\person<\/UserId>/,
  );
  assert.match(unit.text, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(unit.text, /<RestartOnFailure>/);
  assert.match(unit.text, /--foreground/);
  const task = fake({
    answers: (argv) => {
      if (argv[1] === "/Query")
        throw Error("ERROR: The system cannot find the file specified.");
      return "";
    },
  });
  const done = installLoginUnit(unit, { run: task.run });
  assert.deepEqual(task.calls, [
    `schtasks /Query /TN ${TASK_NAME} /XML`,
    `schtasks /Create /TN ${TASK_NAME} /XML ${unit.file} /F`,
    `schtasks /Run /TN ${TASK_NAME}`,
  ]);
  assert.equal(done.replaced, false);
  const bytes = fs.readFileSync(unit.file);
  assert.deepEqual(
    [...bytes.subarray(0, 2)],
    [0xff, 0xfe],
    "UTF-16 with a byte order mark",
  );

  const gone = fake({ answers: () => `<Description>${MARKER}</Description>` });
  assert.equal(removeLoginUnit(unit, { run: gone.run }).removed, true);
  assert.deepEqual(gone.calls, [
    `schtasks /Query /TN ${TASK_NAME} /XML`,
    `schtasks /Delete /TN ${TASK_NAME} /F`,
  ]);
  assert.equal(fs.existsSync(unit.file), false);
});

test("Windows: a task without the marker is refused", (t) => {
  const { base } = scratch(t);
  const unit = loginUnit({ ...base, kind: "schtasks" });
  const { calls, run } = fake({
    answers: () => "<Description>mine</Description>",
  });
  assert.throws(() => installLoginUnit(unit, { run }), /did not write it/);
  assert.deepEqual(calls, [`schtasks /Query /TN ${TASK_NAME} /XML`]);
});
