// @ts-nocheck: typing debt
// machine.env and harness readiness (MS5): the file's rules, what a child
// gets, and why a harness cannot start here.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findProgram,
  harnessStartProblem,
  loginShellPath,
} from "../harness-ready.ts";
import {
  machineEnvPath,
  readMachineEnv,
  withKeptValues,
} from "../machine-env.ts";
import { sandboxEnv, sandboxSecretPaths } from "../sandbox.ts";

function config(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-machine-env-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("machine.env is read as NAME=value lines, and a missing file is empty", (t) => {
  const dir = config(t);
  assert.deepEqual(readMachineEnv(dir), {});
  fs.writeFileSync(
    machineEnvPath(dir),
    '# models\nANTHROPIC_API_KEY="abc"\nexport OPENAI_API_KEY=def\n\n',
    { mode: 0o600 },
  );
  assert.deepEqual(readMachineEnv(dir), {
    ANTHROPIC_API_KEY: "abc",
    OPENAI_API_KEY: "def",
  });
});

test("a bad line is refused naming the line and never its value", (t) => {
  const dir = config(t);
  fs.writeFileSync(machineEnvPath(dir), "OK=1\nnot a pair secret-value\n", {
    mode: 0o600,
  });
  assert.throws(
    () => readMachineEnv(dir),
    (error) =>
      /line 2/.test(error.message) && !error.message.includes("secret-value"),
  );
});

test("a file others can read is refused on macOS and Linux", (t) => {
  if (process.platform === "win32") return t.skip("Windows has no mode bits");
  const dir = config(t);
  fs.writeFileSync(machineEnvPath(dir), "KEY=hidden-value\n", { mode: 0o640 });
  fs.chmodSync(machineEnvPath(dir), 0o640);
  assert.throws(
    () => readMachineEnv(dir),
    (error) =>
      /can be read by other users/.test(error.message) &&
      !error.message.includes("hidden-value"),
  );
});

test("only a keepEnv name is filled from the file, and the server's own value wins", () => {
  const filled = withKeptValues(
    { PATH: "/bin", KEEP_A: "own" },
    ["KEEP_A", "KEEP_B"],
    { KEEP_A: "file", KEEP_B: "file-b", NOT_KEPT: "file-c" },
  );
  assert.equal(filled.KEEP_A, "own");
  assert.equal(filled.KEEP_B, "file-b");
  assert.equal("NOT_KEPT" in filled, false);
  const child = sandboxEnv(filled, { keep: ["KEEP_A", "KEEP_B"] });
  assert.equal(child.KEEP_B, "file-b");
});

test("the file is outside a child's reach: the config folder is a secret path", (t) => {
  const dir = config(t);
  const secrets = sandboxSecretPaths({
    home: path.join(dir, "home"),
    env: {},
    configDirectory: dir,
    stateDirectory: path.join(dir, "state"),
    workspaceRoots: [],
  });
  const real = fs.realpathSync.native(dir);
  assert.ok(
    secrets.some((secret) => machineEnvPath(real).startsWith(secret)),
    "machine.env sits under a path the sandbox hides",
  );
});

test("a harness that cannot start says why: no program, or no sign-in and no proxy", () => {
  const value = { start: [process.execPath], keepEnv: ["MODEL_KEY"] };
  const env = { PATH: path.dirname(process.execPath) };
  assert.match(
    harnessStartProblem(
      { ...value, start: ["no-such-agent-cli"] },
      { env, loginPath: () => null },
    ),
    /no-such-agent-cli was not found on the server's PATH\. Set PATH in machine\.env/,
  );
  assert.match(harnessStartProblem(value, { env }), /None of MODEL_KEY is set/);
  assert.equal(
    harnessStartProblem(value, { env: { ...env, MODEL_KEY: "x" } }),
    null,
  );
  assert.equal(
    harnessStartProblem(value, { env, machineEnv: { MODEL_KEY: "x" } }),
    null,
  );
  assert.equal(harnessStartProblem(value, { env, modelProxy: true }), null);
  assert.equal(
    harnessStartProblem({ start: [process.execPath] }, { env }),
    null,
  );
  // The value is never in the sentence.
  assert.doesNotMatch(
    harnessStartProblem(value, { env: { ...env, OTHER: "secret-value" } }),
    /secret-value/,
  );
});

// A folder holding one executable named `name`, on no PATH the test has.
function programFolder(t, name) {
  const folder = config(t);
  const file = path.join(folder, name);
  fs.writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return { folder, file };
}

test("a harness program is found on machine.env's PATH, then the server's, then the login shell's", (t) => {
  const elsewhere = { PATH: path.dirname(process.execPath) };
  const shell = programFolder(t, "agent-cli");
  const machine = programFolder(t, "agent-cli");
  const value = { start: ["agent-cli"] };
  // Only on the login shell's PATH: found there, and the child gets it.
  let calls = 0;
  const loginPath = () => (calls++, shell.folder);
  assert.equal(harnessStartProblem(value, { env: elsewhere, loginPath }), null);
  assert.deepEqual(findProgram("agent-cli", { env: elsewhere, loginPath }), {
    file: shell.file,
    path: shell.folder,
  });
  // Only on machine.env's PATH: found there first; the shell is not asked.
  calls = 0;
  const machineEnv = { PATH: machine.folder };
  assert.equal(
    harnessStartProblem(value, { env: elsewhere, machineEnv, loginPath }),
    null,
  );
  assert.deepEqual(
    findProgram("agent-cli", { env: elsewhere, machineEnv, loginPath }),
    { file: machine.file, path: machine.folder },
  );
  assert.equal(calls, 0);
  // Nowhere: the sentence names every place looked and the one fix.
  assert.equal(
    harnessStartProblem(
      { start: ["no-such-agent-cli"] },
      { env: elsewhere, machineEnv, loginPath },
    ),
    "no-such-agent-cli was not found on machine.env's PATH, the server's PATH or your login shell's PATH. Set PATH in machine.env, or give an absolute path in the harness definition.",
  );
});

test("the login shell's PATH is read with a fixed command, and skipped on Windows", {
  skip: process.platform === "win32",
}, (t) => {
  assert.equal(
    loginShellPath({ env: { SHELL: "/bin/sh" }, platform: "win32" }),
    null,
  );
  // A fake shell that prints noise and then a PATH line, as startup files may.
  const { file } = programFolder(t, "fake-shell");
  fs.writeFileSync(
    file,
    '#!/bin/sh\necho "hello from rc"\necho "PATH=/from/login:/bin"\n',
  );
  assert.equal(
    loginShellPath({ env: { SHELL: file }, platform: "linux" }),
    "/from/login:/bin",
  );
});

test("status names each role whose harness cannot start, and no other", async () => {
  const { roleProblems } = await import("../../workspace/machine-status.ts");
  const harnesses = [
    {
      name: "claude-code",
      approved: true,
      startProblem: "claude is not on the PATH.",
    },
    { name: "codex", approved: true, startProblem: null },
  ];
  const config = {
    roles: {
      worker: { harness: "claude-code" },
      responder: { harness: "claude-code" },
      reviewer: { harness: "codex" },
      assist: { harness: "kirocrew" },
    },
  };
  assert.deepEqual(roleProblems(config, harnesses), [
    {
      role: "worker",
      harness: "claude-code",
      problem: "claude is not on the PATH.",
    },
    {
      role: "responder",
      harness: "claude-code",
      problem: "claude is not on the PATH.",
    },
  ]);
});
