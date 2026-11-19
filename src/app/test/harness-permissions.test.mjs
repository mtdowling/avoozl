// Permission classes, write roots, the skip-flag refusal and the
// per-machine opt-in for harnesses (R94.4, R94.4b, R94.5, §4.28).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  approveHarnessDefinition,
  harnessDefinitionHash,
  harnessPermission,
  loadHarnessDefinition,
  parseHarnessDefinition,
  sandboxWriteRoots,
} from "../harness-definitions.mjs";

const example = (patch = {}) => ({
  name: "example-cli",
  start: ["example-cli", "--cwd", "{worktree}", "--sandbox", "{permission}"],
  resume: ["example-cli", "--resume", "{session}"],
  permission: { write: "workspace-write", read: "read-only" },
  writeRoots: ["{worktree}", "{tmp}", "{repository_cache_dirs}"],
  ...patch,
});

function machine(t) {
  const configDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avoozl-harness-"),
  );
  t.after(() => fs.rmSync(configDirectory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(configDirectory, "harnesses"));
  const install = (value, { approve = true } = {}) => {
    const file = path.join(configDirectory, "harnesses", value.name + ".json");
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    const hash = harnessDefinitionHash(fs.readFileSync(file));
    if (approve)
      approveHarnessDefinition({ configDirectory, name: value.name, hash });
    return hash;
  };
  return { configDirectory, install };
}

const at = (...parts) => path.join(path.parse(os.tmpdir()).root, ...parts);
const session = (extra = {}) => ({
  permissionClass: "write",
  worktree: at("work", "task-1"),
  tmp: at("scratch", "task-1"),
  gitCommonDir: at("repo", ".git"),
  ...extra,
});

test("approved definitions with a skip-permission value never load", (t) => {
  const { configDirectory, install } = machine(t);
  for (const [name, patch, value] of [
    [
      "bypass-cli",
      { permission: { write: "bypassPermissions", read: "read-only" } },
      "bypassPermissions",
    ],
    [
      "full-cli",
      { start: ["full-cli", "--sandbox", "danger-full-access"] },
      "danger-full-access",
    ],
    [
      "skip-cli",
      { resume: ["skip-cli", "--dangerously-skip-permissions"] },
      "--dangerously-skip-permissions",
    ],
  ]) {
    install(example({ name, ...patch }));
    assert.throws(
      () => loadHarnessDefinition({ configDirectory, name }),
      (error) =>
        error.message.includes(value) &&
        error.message.includes("skips permissions"),
      name,
    );
  }
});

test("permission keys are the executor's classes and write roots are placeholders only", () => {
  assert.throws(
    () =>
      parseHarnessDefinition(
        example({ permission: { write: "w", read: "r", admin: "a" } }),
      ),
    /permission\.admin is not a permission class/,
  );
  for (const [writeRoots, pattern] of [
    [["{worktree}", "/home/me"], /writeRoots\[1\] must be one of/],
    [["{worktree}/sub"], /writeRoots\[0\] must be one of/],
    [["{tmp}"], /must include \{worktree\}/],
  ])
    assert.throws(
      () => parseHarnessDefinition(example({ writeRoots })),
      pattern,
    );
});

test("a read class writes nowhere; a write class writes the task, temp and cache folders", (t) => {
  const { configDirectory, install } = machine(t);
  install(example());
  const definition = loadHarnessDefinition({
    configDirectory,
    name: "example-cli",
  });
  assert.deepEqual(harnessPermission(definition, { permissionClass: "read" }), {
    permissionClass: "read",
    permission: "read-only",
    writeRoots: [],
  });
  assert.deepEqual(
    harnessPermission(
      definition,
      session({ cacheDirs: [at("cache", "sccache")] }),
    ),
    {
      permissionClass: "write",
      permission: "workspace-write",
      writeRoots: [
        at("work", "task-1"),
        at("scratch", "task-1"),
        at("cache", "sccache"),
      ],
    },
  );
  assert.throws(
    () => harnessPermission(definition, { permissionClass: "admin" }),
    /Permission class must be/,
  );
  assert.throws(
    () => harnessPermission(definition, session({ tmp: undefined })),
    /own temp folder/,
  );
  assert.throws(
    () => harnessPermission(definition, session({ tmp: at("repo") })),
    /overlaps the git directory/,
  );
});

test("repository cache folders cannot reach the git directory, home or root", () => {
  const home = at("home", "me");
  const gitCommonDir = at("repo", ".git");
  for (const [value, pattern] of [
    ["cache", /absolute path/],
    [[path.parse(home).root], /filesystem root/],
    [[home], /home folder/],
    [[at("home")], /home folder/],
    [[at("repo")], /git directory/],
    [[at("repo", ".git", "objects")], /git directory/],
    [[3], /list of absolute/],
  ])
    assert.throws(
      () =>
        sandboxWriteRoots(Array.isArray(value) ? value : [value], {
          gitCommonDir,
          home,
        }),
      pattern,
    );
  assert.deepEqual(
    sandboxWriteRoots([at("home", "me", ".cache", "sccache")], {
      gitCommonDir,
      home,
    }),
    [at("home", "me", ".cache", "sccache")],
  );
});
