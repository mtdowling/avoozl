// A harness definition's `box` key (vm-harness VM7, D4): how a contained
// session routes its commands to its box. It adds a wall and never removes
// one.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseHarnessDefinition } from "../harness-definitions.mjs";

const base = {
  name: "cli",
  start: ["cli", "-p"],
  resume: ["cli", "--resume"],
  permission: { read: "plan", write: "acceptEdits" },
};
const parse = (box) => parseHarnessDefinition({ ...base, box });
const example = (name) =>
  JSON.parse(
    fs.readFileSync(
      fileURLToPath(
        new URL(`../../../../examples/harnesses/${name}.json`, import.meta.url),
      ),
      "utf8",
    ),
  );

test("box with env, args, hosts, signIn and hostPrograms loads", () => {
  const box = {
    env: { CLAUDE_CODE_SHELL_PREFIX: "{box_exec}", CLI_FLAG: "1" },
    args: ["--settings", "{box_settings}"],
    hosts: ["api.example.com:443", "auth.example.com:443"],
    signIn: { darwin: "keychain", linux: ["~/.cli/.credentials.json"] },
    hostPrograms: ["/opt/cli/bin/helper"],
  };
  assert.deepEqual(parse(box).box, box);
});

test("permission-skipping values are refused in every box value", () => {
  for (const box of [
    { args: ["--permission-mode", "bypassPermissions"] },
    { args: ["--sandbox", "danger-full-access"] },
    { args: ["--dangerously-skip-permissions"] },
    { env: { CLI_MODE: "bypassPermissions" } },
    { hostPrograms: ["/opt/--dangerously-x"] },
  ])
    assert.throws(() => parse(box), /skips permissions/, JSON.stringify(box));
});

test("a sign-in path naming another tool's credentials is refused", () => {
  for (const item of [
    "~/.ssh/id_ed25519",
    "~/.config/gh/hosts.yml",
    "~/.git-credentials",
    "~/.config/git/credentials",
    "~/.aws/credentials",
    "~/.config/avoozl/harness-approvals.json",
    "~/.kiro/crew/secret",
  ])
    assert.throws(
      () => parse({ signIn: { linux: [item] } }),
      /holds another tool's credentials/,
      item,
    );
  for (const bad of [
    { signIn: { darwin: "file" } },
    { signIn: { windows: "x" } },
    { signIn: { linux: ["/etc/passwd"] } },
    { signIn: { linux: ["~/../x"] } },
  ])
    assert.throws(() => parse(bad), /box\.signIn/);
});

test("a host with a wildcard, an IP address or another port is refused", () => {
  for (const host of [
    "*.example.com:443",
    "1.1.1.1:443",
    "[::1]:443",
    "api.example.com:80",
    "api.example.com",
    "localhost:443",
  ])
    assert.throws(
      () => parse({ hosts: [host] }),
      /name one host on port 443/,
      host,
    );
});

test("box.env sets no credential or path variable, and only the box placeholders", () => {
  for (const env of [
    { GH_TOKEN: "x" },
    { PATH: "/tmp" },
    { DYLD_INSERT_LIBRARIES: "/tmp/x" },
    { AVOOZL_CHILD: "" },
  ])
    assert.throws(() => parse({ env }), /cannot set|nonempty/);
  assert.throws(
    () => parse({ env: { CLI_DIR: "{worktree}" } }),
    /only a literal value, \{box_exec\} or \{box_settings\}/,
  );
});

test("a host program is never a shell or a container runtime", () => {
  for (const program of [
    "/bin/bash",
    "/usr/bin/security",
    "/opt/homebrew/bin/podman",
    "/usr/local/bin/container",
  ])
    assert.throws(
      () => parse({ hostPrograms: [program] }),
      /could run commands outside the box/,
      program,
    );
  assert.throws(() => parse({ hostPrograms: ["helper"] }), /absolute/);
});

test("the Claude Code example routes every command to box exec and turns off what runs on the host", () => {
  const definition = parseHarnessDefinition(example("claude-code"));
  const { box } = definition;
  assert.equal(box.env.CLAUDE_CODE_SHELL_PREFIX, "{box_exec}");
  const args = box.args.join(" ");
  // The repository's .claude settings are not read; hooks come from the
  // box settings file, which turns them all off.
  assert.match(args, /--setting-sources user/);
  assert.match(args, /--settings \{box_settings\}/);
  // No MCP server starts: --strict-mcp-config with no --mcp-config.
  assert.match(args, /--strict-mcp-config/);
  assert.doesNotMatch(args, /--mcp-config/);
  assert.match(args, /--disallowedTools WebFetch/);
  assert.match(args, /--disallowedTools WebSearch/);
  assert.deepEqual(box.signIn, {
    darwin: "keychain",
    linux: ["~/.claude/.credentials.json"],
  });
  assert.ok(box.hosts.every((host) => host.endsWith(":443")));
});

test("the Codex example holds no box until its routing is proved (D11, question 3)", () => {
  const definition = parseHarnessDefinition(example("codex"));
  assert.equal(definition.box, undefined);
});
