// The isolation setting's worker and runtime keys, the one runtime picker,
// and the one container builder that checks and boxes share (vm-harness
// vm-1.1, vm-1.2, D3).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  boxExecArgv,
  boxListArgv,
  boxStopArgv,
  containerRunArgv,
  isolatedCheck,
  isolationSetting,
  listedBoxSessions,
  pickRuntime,
  pinnedImage,
  recordIsolation,
  sweepBoxes,
  writeEnvFile,
} from "../check-isolation.mjs";
import { cliRefusal, mcpRefusal } from "../../mcp/mcp-policy.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const SESSION = "process-00000000-0000-4000-8000-000000000001";
const OTHER = "process-00000000-0000-4000-8000-000000000002";

test("worker and runtime load, and a bad value is refused naming its key", () => {
  assert.deepEqual(
    isolationSetting({
      worker: "container",
      runtime: "podman",
      image: "node:22",
    }),
    {
      run: "sandbox",
      worker: "container",
      runtime: "podman",
      image: "node:22",
      network: "off",
    },
  );
  for (const [bad, message] of [
    [{ worker: "vm" }, /isolation\.worker must be sandbox or container/],
    [{ runtime: "lxc" }, /isolation\.runtime must be apple-container/],
    [{ worker: "container" }, /image is needed when worker is container/],
    [{ run: "container" }, /image is needed when run is container/],
    [{ strangers: "maybe" }, /isolation\.strangers must be container/],
    [{ strangerRoles: ["worker", "boss"] }, /strangerRoles names "boss"/],
  ])
    assert.throws(() => isolationSetting(bad), message);
  assert.deepEqual(
    isolationSetting({
      strangers: "hold",
      strangerRoles: ["triage", "checks"],
    }),
    {
      run: "sandbox",
      network: "off",
      strangers: "hold",
      strangerRoles: ["triage", "checks"],
    },
  );
});

test("the picker prefers Apple container on macOS and podman on Linux", () => {
  const works =
    (...names) =>
    (name) => ({ ok: names.includes(name), output: "" });
  const pick = (platform, purpose, probe, named) =>
    pickRuntime({ platform, purpose, probe, named });
  const all = works("apple-container", "podman", "docker");
  assert.deepEqual(pick("darwin", "check", all), {
    runtime: "apple-container",
  });
  assert.deepEqual(pick("darwin", "check", works("docker")), {
    runtime: "docker",
  });
  assert.deepEqual(pick("darwin", "box", all), { runtime: "apple-container" });
  // A box on macOS takes only Apple container.
  assert.match(
    pick("darwin", "box", works("podman", "docker")).refused,
    /no container runtime works on this machine for a box \(tried apple-container\)/,
  );
  assert.match(
    pick("darwin", "box", all, "docker").refused,
    /docker, which cannot run a box on darwin; use apple-container/,
  );
  assert.deepEqual(pick("linux", "box", all), { runtime: "podman" });
  assert.deepEqual(pick("linux", "check", works("docker")), {
    runtime: "docker",
  });
  assert.match(
    pick("win32", "box", all).refused,
    /this machine cannot run a box/,
  );
});

test("a named runtime whose probe fails is refused with its output, and nothing falls back", () => {
  const probed = [];
  const probe = (name) => {
    probed.push(name);
    return name === "podman"
      ? { ok: false, output: "cannot connect to podman" }
      : { ok: true, output: "" };
  };
  const refused = pickRuntime({
    platform: "linux",
    purpose: "check",
    named: "podman",
    probe,
  });
  assert.equal(
    refused.refused,
    "isolation.runtime is podman, and `podman version` failed: cannot connect to podman",
  );
  assert.deepEqual(probed, ["podman"], "docker was never tried");
  // A check under that setting is refused, naming the runtime.
  const dir = temporaryDirectory("avoozl-builder-refuse-");
  const result = isolatedCheck(
    {
      id: "app",
      isolation: { run: "container", image: "node:22", runtime: "podman" },
    },
    dir,
    ["true"],
    {},
    {
      pick: (input) => pickRuntime({ ...input, platform: "linux", probe }),
    },
  );
  assert.match(
    result.refused,
    /isolation is container, and isolation\.runtime is podman/,
  );
});

test("a check record names container with its runtime", () => {
  const dir = temporaryDirectory("avoozl-builder-check-");
  const check = isolatedCheck(
    { id: "app", isolation: { run: "container", image: "node:22" } },
    dir,
    ["npm", "test"],
    { PATH: "/usr/bin" },
    { pick: () => ({ runtime: "podman" }) },
  );
  try {
    assert.equal(check.isolation, "container");
    assert.equal(check.runtime, "podman");
    assert.deepEqual(recordIsolation(check), {
      isolation: "container",
      runtime: "podman",
    });
    assert.equal(check.argv[0], "podman");
    assert.deepEqual(check.argv.slice(-3), ["node:22", "npm", "test"]);
    assert.ok(check.argv.includes("--rm"));
    assert.deepEqual(
      check.argv.slice(
        check.argv.indexOf("--network"),
        check.argv.indexOf("--network") + 2,
      ),
      ["--network", "none"],
    );
    assert.ok(!check.argv.includes("--env"), "values come from the env file");
    const envFile = check.argv[check.argv.indexOf("--env-file") + 1];
    assert.equal(fs.readFileSync(envFile, "utf8"), "PATH=/usr/bin\n");
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
  } finally {
    check.cleanup();
  }
});

const user = { uid: 501, gid: 20 };
const boxRun = (runtime, extra = {}) =>
  containerRunArgv(runtime, {
    image: "node:22@sha256:" + "a".repeat(64),
    box: { session: SESSION },
    user,
    mounts: [
      { path: "/work/task", mode: "rw" },
      { path: "/work/repo/.git", mode: "ro" },
      { path: "/tmp/avoozl-s", mode: "rw" },
    ],
    envFile: "/state/box/s/box.env",
    ...extra,
  });

test("the box's run argv for each runtime: no network, its mounts, no home, its user", () => {
  assert.deepEqual(boxRun("apple-container"), [
    "container",
    "run",
    "-d",
    "--name",
    `avoozl-${SESSION}`,
    "--label",
    `avoozl.session=${SESSION}`,
    "--network",
    "none",
    "--no-dns",
    "--uid",
    "501",
    "--gid",
    "20",
    "--cap-drop",
    "ALL",
    "--volume",
    "/work/task:/work/task",
    "--mount",
    "type=bind,source=/work/repo/.git,target=/work/repo/.git,readonly",
    "--volume",
    "/tmp/avoozl-s:/tmp/avoozl-s",
    "--env-file",
    "/state/box/s/box.env",
    "node:22@sha256:" + "a".repeat(64),
    "sleep",
    "infinity",
  ]);
  const podman = boxRun("podman");
  assert.deepEqual(podman.slice(0, 2), ["podman", "run"]);
  for (const part of [
    ["--network", "none"],
    ["--userns", "keep-id", "--user", "501:20"],
    ["--cap-drop", "ALL", "--security-opt", "no-new-privileges"],
    ["--volume", "/work/task:/work/task:rw"],
    ["--volume", "/work/repo/.git:/work/repo/.git:ro"],
    ["--env-file", "/state/box/s/box.env"],
  ])
    assert.ok(
      podman.join(" ").includes(part.join(" ")),
      `podman has ${part.join(" ")}`,
    );
  const docker = boxRun("docker");
  assert.ok(docker.join(" ").includes("--user 501:20 --cap-drop ALL"));
  assert.ok(!docker.includes("--userns"));
  for (const argv of [podman, docker, boxRun("apple-container")]) {
    assert.ok(!argv.includes("--env"), "no --env value");
    assert.ok(!argv.join(" ").includes(os.homedir()), "no home folder");
    assert.ok(argv.includes(`avoozl.session=${SESSION}`));
  }
  // A box's network is off whatever the setting says.
  assert.ok(boxRun("podman", { network: "on" }).includes("none"));
});

test("box exec's exec and stop argv for each runtime", () => {
  const exec = (runtime) =>
    boxExecArgv(runtime, {
      session: SESSION,
      cwd: "/work/task",
      envFile: "/state/box.env",
      user,
      command: "npm test",
    });
  assert.deepEqual(exec("apple-container"), [
    "container",
    "exec",
    "-i",
    "--uid",
    "501",
    "--gid",
    "20",
    "--workdir",
    "/work/task",
    "--env-file",
    "/state/box.env",
    `avoozl-${SESSION}`,
    "bash",
    "-c",
    "npm test",
  ]);
  assert.deepEqual(exec("podman"), [
    "podman",
    "exec",
    "-i",
    "--workdir",
    "/work/task",
    "--env-file",
    "/state/box.env",
    `avoozl-${SESSION}`,
    "bash",
    "-c",
    "npm test",
  ]);
  assert.deepEqual(boxStopArgv("apple-container", SESSION), [
    "container",
    "delete",
    "--force",
    `avoozl-${SESSION}`,
  ]);
  assert.deepEqual(boxStopArgv("docker", SESSION), [
    "docker",
    "rm",
    "-f",
    `avoozl-${SESSION}`,
  ]);
  assert.deepEqual(boxListArgv("podman").slice(-4), [
    "--filter",
    "label=avoozl.session",
    "--format",
    "{{.Names}}",
  ]);
});

test("a mount that is, holds or is inside a secret path is refused naming it", () => {
  const home = temporaryDirectory("avoozl-builder-home-"),
    ssh = path.join(home, ".ssh");
  fs.mkdirSync(ssh);
  for (const at of [ssh, path.join(ssh, "keys"), home])
    assert.throws(
      () =>
        boxRun("podman", {
          mounts: [{ path: at, mode: "ro" }],
          secrets: [ssh],
        }),
      new RegExp(`mount ${at.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} meets`),
    );
  // A path beside it is fine, and a path that a mount option would misread
  // is refused.
  assert.ok(
    boxRun("podman", {
      mounts: [{ path: path.join(home, "work"), mode: "rw" }],
      secrets: [ssh],
    }),
  );
  assert.throws(
    () => boxRun("podman", { mounts: [{ path: "/a:/b", mode: "rw" }] }),
    /cannot mount/,
  );
});

test("a labelled box with no running session is removed", () => {
  const ran = [];
  const run = (program, args) => {
    ran.push([program, ...args]);
    if (args[0] === "ps")
      return { status: 0, stdout: `avoozl-${SESSION}\navoozl-${OTHER}\n` };
    return { status: 0, stdout: "" };
  };
  assert.deepEqual(sweepBoxes("podman", new Set([SESSION]), { run }), [OTHER]);
  assert.deepEqual(ran.at(-1), ["podman", "rm", "-f", `avoozl-${OTHER}`]);
  // Apple's JSON list is searched for box names.
  assert.deepEqual(
    listedBoxSessions(
      JSON.stringify([
        { configuration: { id: `avoozl-${SESSION}` } },
        { configuration: { id: "buildkit" } },
      ]),
    ),
    [SESSION],
  );
});

test("the image is pinned to its digest, pulled first when missing", async () => {
  const digest = "sha256:" + "b".repeat(64);
  let pulled = false;
  const run = (_program, args) => {
    if (args[1] === "pull") {
      pulled = true;
      return { status: 0, stdout: "" };
    }
    return pulled
      ? { status: 0, stdout: `[{"Digest":"${digest}"}]` }
      : { status: 1, stdout: "", stderr: "no such image" };
  };
  assert.deepEqual(await pinnedImage("podman", "node:22", { run }), {
    image: `node:22@${digest}`,
    digest,
  });
  assert.deepEqual(await pinnedImage("podman", `node@${digest}`, { run }), {
    image: `node@${digest}`,
  });
  assert.match(
    (
      await pinnedImage("podman", "x", {
        run: () => ({ status: 1, stdout: "", stderr: "denied" }),
      })
    ).refused,
    /could not pull x: denied/,
  );
});

test("an env file is written 0600 and leaves out values it cannot hold", () => {
  const file = path.join(temporaryDirectory("avoozl-builder-env-"), "e.env");
  writeEnvFile(file, { A: "1", B: "two\nlines", C: "x=y" });
  assert.equal(fs.readFileSync(file, "utf8"), "A=1\nC=x=y\n");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("only a person sets worker, runtime and the stranger keys", () => {
  for (const isolation of [
    { worker: "container", image: "x" },
    { runtime: "podman" },
    { strangers: "host" },
    { strangerRoles: ["worker"] },
  ])
    assert.match(
      mcpRefusal("repository.configure", { id: "app", isolation }),
      /Only a person/,
    );
  const child = { AVOOZL_CHILD: "1" },
    agent = { KIROCREW_SPAWNED: "1" };
  assert.match(
    cliRefusal(
      "repository.configure",
      { isolation: { strangers: "host" } },
      { env: child },
    ),
    /supervisor started/,
  );
  assert.match(
    cliRefusal(
      "repository.configure",
      { isolation: { strangers: "host" } },
      { env: agent },
    ),
    /agent session, which may not change it/,
  );
  for (const isolation of [
    { strangerRoles: ["checks"] },
    { worker: "container", image: "x" },
    { runtime: "podman" },
  ])
    assert.match(
      cliRefusal("repository.configure", { isolation }, { env: agent }),
      /agent session/,
    );
  // Other settings run from an agent session's CLI and are noted, as before.
  assert.equal(
    cliRefusal(
      "repository.configure",
      { isolation: { network: "on" } },
      { env: agent },
    ),
    null,
  );
});
