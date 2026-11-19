// The contained-session preflight and the supervisor's refusals (vm-harness
// vm-2.5, D5), with a fake runtime: each step's failure is recorded and
// holds the work, and the key names the runtime version, digest and hash.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PREFLIGHT_COMMANDS,
  preflightKey,
  runBoxPreflight,
} from "../box-preflight.mjs";
import { BOX_MARKER } from "../box-session.mjs";
import {
  boxPreflight,
  forgetBoxPreflight,
  openSupervisorDatabase,
  requestChild,
} from "../supervisor.mjs";

// A fake runtime: `run` and `exec` lines answer as `answers` says, and a
// box exec line runs nothing. `exec(argv)` gets the whole argv.
function fakeRuntime(answers = {}) {
  const ran = [];
  const exec = async (argv) => {
    ran.push(argv);
    const line = argv.join(" ");
    if (argv.includes("inspect"))
      return { status: 0, stdout: `"sha256:${"c".repeat(64)}"`, stderr: "" };
    if (argv[1] === "run")
      return answers.run ?? { status: 0, stdout: "id", stderr: "" };
    if (line.includes(BOX_MARKER)) return { status: 0, stdout: "", stderr: "" };
    const command = argv.at(-1);
    if (command === "true")
      return answers.start ?? { status: 0, stdout: "", stderr: "" };
    if (command.startsWith("cat ")) {
      const file = command.slice(4);
      return (
        answers.mounts ?? {
          status: 0,
          stdout: fs.readFileSync(file, "utf8"),
          stderr: "",
        }
      );
    }
    if (command.includes("/dev/tcp"))
      return (
        answers.route ?? {
          status: 0,
          stdout: "tcp-closed\ndns-closed\n",
          stderr: "",
        }
      );
    return { status: 0, stdout: "", stderr: "" };
  };
  return { ran, exec };
}
const proxy = async () => ({ port: 41000, close: async () => {} });

// The CLI as the preflight launches it: it "runs" the fixed commands by
// writing what the broker would log for each.
const cli =
  (outputs) =>
  async ({ opened }) => {
    for (const command of PREFLIGHT_COMMANDS)
      fs.appendFileSync(
        opened.folders.brokerLog,
        JSON.stringify({ command, ...outputs(command) }) + "\n",
      );
    return { code: 0 };
  };

const state = () =>
  fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-pf-")));
const plan = (stateDirectory) => ({
  runtime: "podman",
  image: "node:22",
  hosts: ["api.example.com:443"],
  stateDirectory,
  platform: "darwin",
});

test("every step passes when the box works and the CLI's commands reach it", async () => {
  const runtime = fakeRuntime();
  const result = await runBoxPreflight(plan(state()), {
    exec: runtime.exec,
    startProxy: proxy,
    launch: cli((command) =>
      command === "uname -s"
        ? { code: 0, output: "Linux\n" }
        : command.includes(BOX_MARKER)
          ? { code: 0, output: "process-" }
          : { code: 1, output: "not found" },
    ),
  });
  // The marker holds the preflight's own session, which the fake echoes
  // only in part; the routing step checks the whole one.
  assert.deepEqual(
    result.steps.map((s) => [s.name, s.passed]),
    [
      ["starts", true],
      ["no network", true],
      ["mounts", true],
      ["no route", true],
      ["routing", false],
    ],
  );
  // With the session's marker read back, routing and host stays shut pass.
  const marker = { value: null };
  const runtime2 = fakeRuntime();
  const passed = await runBoxPreflight(plan(state()), {
    exec: async (argv) => {
      const line = argv.join(" ");
      const at = line.match(/process-[0-9a-f-]{36}/);
      if (at) marker.value = at[0];
      return runtime2.exec(argv);
    },
    startProxy: proxy,
    launch: cli((command) =>
      command === "uname -s"
        ? { code: 0, output: "Linux\n" }
        : command.includes(BOX_MARKER)
          ? { code: 0, output: `${marker.value}\n` }
          : { code: 1, output: "not found" },
    ),
  });
  assert.equal(passed.passed, true, JSON.stringify(passed.steps));
  assert.deepEqual(
    passed.steps.map((s) => s.name),
    [
      "starts",
      "no network",
      "mounts",
      "no route",
      "routing",
      "host stays shut",
    ],
  );
  // The box went after the preflight.
  assert.ok(runtime2.ran.some((argv) => argv.includes("rm")));
});

test("each failing step is recorded with its output, and later steps do not run", async () => {
  for (const [answers, name, output] of [
    [
      { run: { status: 125, stdout: "", stderr: "no such image" } },
      "starts",
      /no such image/,
    ],
    [{ mounts: { status: 1, stdout: "", stderr: "" } }, "mounts", /^$/],
    [
      { route: { status: 0, stdout: "tcp-open\ndns-closed\n", stderr: "" } },
      "no route",
      /tcp-open/,
    ],
  ]) {
    const runtime = fakeRuntime(answers);
    const result = await runBoxPreflight(plan(state()), {
      exec: runtime.exec,
      startProxy: proxy,
      launch: async () => {
        throw Error("the CLI must not start");
      },
    });
    assert.equal(result.passed, false);
    assert.equal(result.failed.name, name);
    assert.match(result.failed.output, output);
    assert.equal(result.steps.at(-1).name, name);
  }
  // A command that ran on the host, not in the box, fails "host stays shut".
  const marker = { value: null };
  const runtime = fakeRuntime();
  const result = await runBoxPreflight(plan(state()), {
    exec: async (argv) => {
      const at = argv.join(" ").match(/process-[0-9a-f-]{36}/);
      if (at) marker.value = at[0];
      return runtime.exec(argv);
    },
    startProxy: proxy,
    launch: async ({ opened }) => {
      for (const [command, entry] of [
        ["uname -s", { code: 0, output: "Linux" }],
        [`cat ${BOX_MARKER}`, { code: 0, output: marker.value }],
      ])
        fs.appendFileSync(
          opened.folders.brokerLog,
          JSON.stringify({ command, ...entry }) + "\n",
        );
      return { code: 0 };
    },
  });
  assert.equal(result.failed.name, "host stays shut");
  assert.match(result.failed.output, /did not reach the box/);
});

test("the key names the runtime version, digest and harness hash; a person runs it again", () => {
  const base = {
    repository: "app",
    runtime: "apple-container",
    version: "1.7.1",
    digest: "d1",
    harnessHash: "h1",
  };
  const keys = new Set([
    preflightKey(base),
    preflightKey({ ...base, version: "1.8.0" }),
    preflightKey({ ...base, digest: "d2" }),
    preflightKey({ ...base, harnessHash: "h2" }),
  ]);
  assert.equal(keys.size, 4);
  const db = openSupervisorDatabase(state());
  try {
    db.prepare(
      "INSERT INTO box_preflights (key, repository, runtime, harness, state, steps, failed, at) VALUES (?, 'app', 'podman', 'cli', 'failed', '[]', ?, ?)",
    ).run(
      preflightKey(base),
      JSON.stringify({ name: "no route", output: "tcp-open" }),
      "2026-01-01",
    );
    assert.equal(boxPreflight(db, "app").failed.name, "no route");
    assert.equal(forgetBoxPreflight(db, "app"), 1);
    assert.equal(boxPreflight(db, "app"), null);
  } finally {
    db.close();
  }
});

test("a contained request names its repository and image; one with none is refused", () => {
  const db = openSupervisorDatabase(state());
  try {
    const base = {
      executor: "process",
      role: "worker",
      task: "a",
      worktree: os.tmpdir(),
      harness: "cli",
      permissionClass: "write",
      brief: "b",
    };
    assert.throws(
      () =>
        requestChild(db, {
          ...base,
          contained: { repository: "app", isolation: {} },
        }),
      /needs isolation\.image/,
    );
    const id = requestChild(db, {
      ...base,
      contained: {
        repository: "app",
        isolation: { worker: "container", image: "node:22" },
        stranger: { reason: "r" },
      },
    });
    const settings = JSON.parse(
      db.prepare("SELECT settings FROM children WHERE session_id = ?").get(id)
        .settings,
    );
    assert.deepEqual(settings.contained, {
      repository: "app",
      isolation: {
        run: "sandbox",
        worker: "container",
        image: "node:22",
        network: "off",
      },
      caches: [],
      stranger: { reason: "r" },
    });
    // The supervisor fills the box placeholders itself.
    assert.throws(
      () => requestChild(db, { ...base, values: { box_exec: "/tmp/evil" } }),
      /fills \{box_exec\} itself/,
    );
  } finally {
    db.close();
  }
});
