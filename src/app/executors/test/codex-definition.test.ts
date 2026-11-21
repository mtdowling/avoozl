// @ts-nocheck: typing debt
// The Codex definition file (task 48.1; R94.1, R94.4, R94.7). Codex runs
// from this file alone: these tests read it as data and change no code.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  approveHarnessDefinition,
  fillHarnessArgv,
  harnessDefinitionHash,
  harnessPermission,
  loadHarnessDefinition,
  readRoleProblem,
} from "../harness-definitions.ts";
import { confineChild } from "../sandbox.ts";
import { harnessAllow } from "../harness-allow.ts";

const CODEX = fileURLToPath(
  new URL("../../../../examples/harnesses/codex.json", import.meta.url),
);

function approved(t) {
  const configDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avoozl-codex-config-"),
  );
  t.after(() => fs.rmSync(configDirectory, { recursive: true, force: true }));
  const bytes = fs.readFileSync(CODEX);
  fs.mkdirSync(path.join(configDirectory, "harnesses"));
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "codex.json"),
    bytes,
  );
  approveHarnessDefinition({
    configDirectory,
    name: "codex",
    hash: harnessDefinitionHash(bytes),
  });
  return loadHarnessDefinition({ configDirectory, name: "codex" });
}

const values = (definition, permissionClass) => ({
  worktree: "/work/task",
  permission: definition.permission[permissionClass],
  model: "gpt-5",
});

// Codex's own macOS sandbox cannot nest inside Avoozl's (a nested
// sandbox-exec fails with "sandbox_apply: Operation not permitted"), so its
// write class turns the inner sandbox off and runs only inside Avoozl's
// (R94.4d). Its read class does the same (MS7.1). That value is the only
// skip in the file.
test("the Codex definition loads by hash and skips nothing but its inner sandbox", (t) => {
  const text = fs.readFileSync(CODEX, "utf8");
  assert.doesNotMatch(text, /bypass|--dangerously-|--full-auto|--yolo/);
  assert.equal(text.split("danger-full-access").length, 3);
  const definition = approved(t);
  assert.equal(definition.promptFrom, "stdin");
  assert.deepEqual(definition.permission, {
    write: "danger-full-access",
    read: "danger-full-access",
  });
});

test("start reads the brief on stdin in the task folder's sandbox", (t) => {
  const definition = approved(t);
  for (const [permissionClass, sandbox] of [
    ["write", "danger-full-access"],
    ["read", "danger-full-access"],
  ])
    assert.deepEqual(
      [
        ...fillHarnessArgv(
          definition.start,
          values(definition, permissionClass),
        ),
        ...fillHarnessArgv(
          definition.model,
          values(definition, permissionClass),
        ),
      ],
      [
        "codex",
        "exec",
        "--json",
        "--color",
        "never",
        "-C",
        "/work/task",
        "--sandbox",
        sandbox,
        "-c",
        "approval_policy=never",
        "--model",
        "gpt-5",
      ],
    );
});

// Codex picks its own session ID and takes none at start, so resume uses
// `--last`, which looks only at sessions recorded for the working folder:
// the task's own worktree. shortcut: two Codex sessions in one worktree
// resume the newer; upgrade to the thread ID from the start output if a
// task ever runs two at once there.
test("resume sends the message on stdin to the folder's last session", (t) => {
  const definition = approved(t);
  const argv = fillHarnessArgv(definition.resume, values(definition, "write"));
  assert.deepEqual(argv.slice(0, 2), ["codex", "exec"]);
  assert.deepEqual(argv.slice(-3), ["resume", "--last", "-"]);
  // The sandbox and approval flags belong to `exec`, so they sit before
  // `resume`, which does not take them itself.
  assert.ok(argv.indexOf("--sandbox") < argv.indexOf("resume"));
  assert.equal(argv[argv.indexOf("--sandbox") + 1], "danger-full-access");
  assert.ok(!argv.some((item) => item.includes("{")));
});

test("writes stay in the write roots; read roles write nowhere", (t) => {
  const definition = approved(t);
  const worktree = path.join(os.tmpdir(), "avoozl-codex-worktree");
  const tmp = path.join(os.tmpdir(), "avoozl-codex-tmp");
  const cache = path.join(os.tmpdir(), "avoozl-codex-cache");
  assert.deepEqual(
    harnessPermission(definition, {
      permissionClass: "write",
      worktree,
      tmp,
      cacheDirs: [cache],
    }).writeRoots,
    [worktree, tmp, cache].map((item) => path.resolve(item)),
  );
  assert.deepEqual(
    harnessPermission(definition, { permissionClass: "read" }).writeRoots,
    [],
  );
});

// MS7.1, MS7.5: the read class's own sandbox is off too, so only Avoozl's
// holds it: its write roots leave out the task folder, and with no Avoozl
// sandbox every class is refused, opt-in or not (the Windows leg has none).
test("a read child writes only its temp and result folders and is refused with no sandbox", (t) => {
  const definition = approved(t);
  const worktree = path.join(os.tmpdir(), "avoozl-codex-worktree");
  const tmp = path.join(os.tmpdir(), "avoozl-codex-tmp");
  const roots = harnessPermission(definition, {
    permissionClass: "read",
    worktree,
    tmp,
  }).writeRoots;
  assert.deepEqual(roots, [
    path.resolve(tmp),
    path.join(path.resolve(worktree), ".avoozl"),
  ]);
  assert.equal(roots.includes(path.resolve(worktree)), false);
  assert.equal(readRoleProblem(definition), null);
  const configDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avoozl-codex-optin-"),
  );
  t.after(() => fs.rmSync(configDirectory, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(configDirectory, "harness-unconfined.json"),
    JSON.stringify({ codex: definition.hash }),
  );
  for (const permissionClass of ["read", "write"])
    assert.throws(
      () =>
        confineChild(
          fillHarnessArgv(
            definition.start,
            values(definition, permissionClass),
          ),
          {
            definition,
            configDirectory,
            writeRoots: roots,
            secrets: [],
            kind: null,
          },
        ),
      /runs only inside Avoozl's sandbox/,
      permissionClass,
    );
});

// Codex has no allow-list flag: inside Avoozl's sandbox, with approvals
// off, a command runs or fails without a prompt, so no child
// stalls. Its JSON output reports tokens, not dollars, and it has no spend
// cap flag, so the file names no cost source and no cap.
test("Codex takes no allow flag, cost field or spend cap", (t) => {
  const definition = approved(t);
  assert.deepEqual(harnessAllow(definition, [["npm", "test"]]), []);
  assert.equal(definition.cost, undefined);
  assert.deepEqual(definition.keepEnv, ["OPENAI_API_KEY", "CODEX_API_KEY"]);
});
