// machine.env and harness readiness (MS5): the file's rules, what a child
// gets, and why a harness cannot start here.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { harnessStartProblem } from "../harness-ready.mjs";
import {
  machineEnvPath,
  readMachineEnv,
  withKeptValues,
} from "../machine-env.mjs";
import { sandboxEnv, sandboxSecretPaths } from "../sandbox.mjs";

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
    harnessStartProblem({ ...value, start: ["no-such-agent-cli"] }, { env }),
    /no-such-agent-cli is not on the PATH/,
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

test("status names each role whose harness cannot start, and no other", async () => {
  const { roleProblems } = await import("../../workspace/machine-status.mjs");
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
      verifier: { harness: "claude-code" },
      reviewer: { harness: "codex" },
      retro: { harness: "kirocrew" },
    },
  };
  assert.deepEqual(roleProblems(config, harnesses), [
    {
      role: "worker",
      harness: "claude-code",
      problem: "claude is not on the PATH.",
    },
    {
      role: "verifier",
      harness: "claude-code",
      problem: "claude is not on the PATH.",
    },
  ]);
});
