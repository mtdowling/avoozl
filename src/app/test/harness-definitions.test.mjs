// Harness definition files load only from machine config, as argv lists
// with known placeholders, at an approved hash (R94.1-R94.3, §4.28).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  approveHarnessDefinition,
  fillHarnessArgv,
  harnessDefinitionHash,
  loadHarnessDefinition,
  parseHarnessDefinition,
} from "../harness-definitions.mjs";

const example = () => ({
  name: "example-cli",
  start: [
    "example-cli",
    "--cwd",
    "{worktree}",
    "--model={model}",
    "--prompt-file",
    "{brief_file}",
    "--sandbox",
    "{permission}",
  ],
  resume: [
    "example-cli",
    "--resume",
    "{session}",
    "--message-file",
    "{message_file}",
  ],
  permission: { write: "workspace-write", read: "read-only" },
  writeRoots: ["{worktree}", "{tmp}", "{project_cache_dirs}"],
  allow: ["{project_allow_commands}"],
  cost: { from: "output", field: "total_cost_usd" },
});

function machine(t) {
  const configDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "avoozl-harness-"),
  );
  t.after(() => fs.rmSync(configDirectory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(configDirectory, "harnesses"));
  const write = (value, name = "example-cli") => {
    const file = path.join(configDirectory, "harnesses", name + ".json");
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return harnessDefinitionHash(fs.readFileSync(file));
  };
  return { configDirectory, write };
}

test("an approved definition loads with its hash", (t) => {
  const { configDirectory, write } = machine(t);
  const hash = write(example());
  approveHarnessDefinition({ configDirectory, name: "example-cli", hash });
  const loaded = loadHarnessDefinition({
    configDirectory,
    name: "example-cli",
  });
  assert.equal(loaded.hash, hash);
  assert.deepEqual(loaded.start, example().start);
  assert.deepEqual(loaded.permission, example().permission);
});

test("an unapproved or changed definition does not load", (t) => {
  const { configDirectory, write } = machine(t);
  const first = write(example());
  const load = () =>
    loadHarnessDefinition({ configDirectory, name: "example-cli" });
  assert.throws(
    load,
    (error) =>
      error.status === 409 &&
      error.message.includes(first) &&
      !error.message.includes("differs"),
  );
  approveHarnessDefinition({
    configDirectory,
    name: "example-cli",
    hash: first,
  });
  load();
  const second = write({ ...example(), resume: ["example-cli", "--continue"] });
  assert.throws(
    load,
    (error) =>
      error.status === 409 &&
      error.message.includes(second) &&
      error.message.includes("differs"),
  );
});

test("loading refuses shell strings and shell commands", () => {
  const cases = [
    ["example-cli --cwd {worktree}", /shell string/],
    [["example-cli --cwd", "{worktree}"], /holds spaces/],
    [["sh", "-c", "example-cli {worktree}"], /runs a shell/],
    [["/bin/bash", "-lc", "example-cli"], /runs a shell/],
    [["C:\\Windows\\System32\\cmd.exe", "/c", "x"], /runs a shell/],
    [["example-cli", "$({model})"], /shell text/],
    [["example-cli", "{worktree};rm"], /shell text/],
    [["example-cli", "`{session}`"], /shell text/],
    [["{worktree}/bin/cli"], /program/],
    [[], /nonempty argv/],
    [["example-cli", 3], /nonempty string/],
  ];
  for (const [start, pattern] of cases)
    assert.throws(
      () => parseHarnessDefinition({ ...example(), start }),
      pattern,
      JSON.stringify(start),
    );
});

test("loading refuses unknown placeholders and stray braces", () => {
  for (const [start, pattern] of [
    [["example-cli", "{home}"], /unknown placeholder \{home\}/],
    [["example-cli", "{WORKTREE}"], /unknown placeholder/],
    [["example-cli", "{worktree"], /stray brace/],
  ])
    assert.throws(
      () => parseHarnessDefinition({ ...example(), start }),
      pattern,
    );
});

test("an old spendCap key loads and is ignored", () => {
  const definition = parseHarnessDefinition({
    ...example(),
    spendCap: ["--max-cost", "{budget_usd}"],
  });
  assert.equal(definition.spendCap, undefined);
});

test("loading refuses permission-skipping values", () => {
  for (const [patch, value] of [
    [
      { permission: { write: "bypassPermissions", read: "read-only" } },
      "bypassPermissions",
    ],
    [
      { start: ["example-cli", "--sandbox", "danger-full-access"] },
      "danger-full-access",
    ],
    [
      { start: ["example-cli", "--dangerously-skip-permissions"] },
      "--dangerously-skip-permissions",
    ],
  ])
    assert.throws(
      () => parseHarnessDefinition({ ...example(), ...patch }),
      (error) =>
        error.message.includes(value) &&
        /skips permissions/.test(error.message),
    );
});

test("loading refuses bad shapes", () => {
  for (const [patch, pattern] of [
    [{ extra: true }, /unknown key extra/],
    [{ name: "Example" }, /name must/],
    [{ resume: undefined }, /resume/],
    [{ permission: { write: "workspace-write" } }, /permission\.read/],
    [{ cost: { from: "output", path: "x" } }, /cost must/],
  ])
    assert.throws(
      () => parseHarnessDefinition({ ...example(), ...patch }),
      pattern,
    );
});

test("the file name must match and be a regular file", (t) => {
  const { configDirectory, write } = machine(t);
  const hash = write(example(), "other-cli");
  approveHarnessDefinition({ configDirectory, name: "other-cli", hash });
  assert.throws(
    () => loadHarnessDefinition({ configDirectory, name: "other-cli" }),
    /file is named other-cli/,
  );
  assert.throws(
    () => loadHarnessDefinition({ configDirectory, name: "../x" }),
    /not valid/,
  );
  if (process.platform === "win32") return; // symlinks need privilege there
  const target = path.join(configDirectory, "real.json");
  fs.writeFileSync(target, JSON.stringify(example()));
  fs.symlinkSync(
    target,
    path.join(configDirectory, "harnesses", "link-cli.json"),
  );
  assert.throws(
    () => loadHarnessDefinition({ configDirectory, name: "link-cli" }),
    /symlink/,
  );
});

test("definitions inside a repository are refused", (t) => {
  const { configDirectory, write } = machine(t);
  fs.mkdirSync(path.join(configDirectory, ".git"));
  const hash = write(example());
  assert.throws(
    () =>
      approveHarnessDefinition({ configDirectory, name: "example-cli", hash }),
    /never in a repository/,
  );
  assert.throws(
    () => loadHarnessDefinition({ configDirectory, name: "example-cli" }),
    /never in a repository/,
  );
});

test("filling argv keeps one argument per value", () => {
  const definition = parseHarnessDefinition(example());
  assert.deepEqual(
    fillHarnessArgv(definition.start, {
      worktree: "/w t",
      model: "m; rm -rf /",
      brief_file: "/b",
      permission: "workspace-write",
    }),
    [
      "example-cli",
      "--cwd",
      "/w t",
      "--model=m; rm -rf /",
      "--prompt-file",
      "/b",
      "--sandbox",
      "workspace-write",
    ],
  );
  assert.deepEqual(
    fillHarnessArgv(definition.writeRoots, {
      worktree: "/w",
      tmp: "/t",
      project_cache_dirs: ["/c1", "/c2"],
    }),
    ["/w", "/t", "/c1", "/c2"],
  );
  assert.throws(() => fillHarnessArgv(definition.resume, {}), /\{session\}/);
});
