// The per-repository allow-list for unattended children; git push is never
// allowed (R94.4c, §4.28).
import test from "node:test";
import assert from "node:assert/strict";
import {
  allowCommandRefusal,
  harnessAllow,
  sandboxAllowCommands,
} from "../harness-allow.mjs";
import { parseHarnessDefinition } from "../harness-definitions.mjs";

const definition = (allow) =>
  parseHarnessDefinition({
    name: "example-cli",
    start: ["example-cli", "--cwd", "{worktree}"],
    resume: ["example-cli", "--resume", "{session}"],
    permission: { write: "workspace-write", read: "read-only" },
    writeRoots: ["{worktree}"],
    ...(allow ? { allow } : {}),
  });

test("build and test commands pass to the harness, one argument each", () => {
  const commands = [
    ["npm", "test"],
    ["cargo", "build", "--release"],
    ["git", "status"],
    ["git", "diff", "--check"],
  ];
  assert.deepEqual(sandboxAllowCommands(commands), commands);
  assert.deepEqual(
    harnessAllow(definition(["{repository_allow_commands}"]), commands),
    ["npm test", "cargo build --release", "git status", "git diff --check"],
  );
  assert.deepEqual(harnessAllow(definition(), commands), []);
  assert.deepEqual(sandboxAllowCommands(undefined), []);
});

test("git push is refused in every spelling, even when listed", () => {
  for (const command of [
    ["git", "push"],
    ["git", "push", "origin", "main"],
    ["git", "-C", "/repo", "push"],
    ["git", "--no-pager", "push", "--force"],
    ["/usr/bin/git", "push"],
    ["C:\\Program Files\\Git\\bin\\git.exe", "PUSH"],
    ["GIT.EXE", "Push"],
    ["hub", "push"],
    ["git", "send-pack", "--push"],
    ["npm", "run", "push"],
    ["git", "-c", "alias.p=push", "p"],
  ])
    assert.match(
      allowCommandRefusal(command) || "",
      /push|spaces/,
      JSON.stringify(command),
    );
  assert.throws(
    () =>
      sandboxAllowCommands([
        ["npm", "test"],
        ["git", "push"],
      ]),
    /sandbox\.allowCommands\[1\] pushes; git push is never allowed/,
  );
  assert.throws(
    () =>
      harnessAllow(definition(["{repository_allow_commands}"]), [
        ["git", "push"],
      ]),
    /never allowed/,
  );
});

test("wrappers, bare git and git config that could reach a push are refused", () => {
  for (const [command, pattern] of [
    [["sh", "-c", "git"], /can run any command/],
    [["/bin/bash"], /can run any command/],
    [["env", "git", "status"], /can run any command/],
    [["xargs", "git"], /can run any command/],
    [["npx", "git-cli"], /can run any command/],
    [["sudo", "make"], /can run any command/],
    [["pwsh.exe", "-Command", "x"], /can run any command/],
    [["git"], /every git subcommand/],
    [["git", "--no-pager"], /every git subcommand/],
    [["git", "-c", "alias.ship=log", "ship"], /config or aliases/],
    [["git", "--config-env=alias.s=X", "s"], /config or aliases/],
    [["git", "-c", "core.pager=cat", "log"], /config or aliases/],
  ])
    assert.match(
      allowCommandRefusal(command) || "",
      pattern,
      JSON.stringify(command),
    );
});

test("allow commands are plain argv lists", () => {
  for (const [value, pattern] of [
    ["npm test", /list of argv lists/],
    [["npm test"], /nonempty argv list/],
    [[[]], /nonempty argv list/],
    [[["npm", ""]], /nonempty strings/],
    [[["npm test"]], /no spaces/],
    [[["npm", "test;git"]], /shell operators/],
    [[["npm", "$(x)"]], /shell operators/],
    [[["npm", "*"]], /shell operators/],
  ])
    assert.throws(
      () => sandboxAllowCommands(value),
      pattern,
      JSON.stringify(value),
    );
});
