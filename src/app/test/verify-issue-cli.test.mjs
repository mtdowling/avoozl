// `avoozl verify-issue` and the MCP tool `plans_verify_issue`: exit codes,
// --json, no workspace, the aicommander alias. A fake `gh` is a shell script
// first on PATH, so these run where a script can be executed; Windows finds
// gh only as gh.exe, and the reader's own tests cover it there.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createAppMcp } from "../app-mcp.mjs";
import { handleMcp } from "../mcp.mjs";
import { renderProvenance } from "../github-provenance.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  cli = path.join(root, "cli.mjs"),
  windows = process.platform === "win32",
  commit = "0123456789abcdef0123456789abcdef01234567",
  REPO = "octo-org/octo-code",
  TEXT = "ISSUE-TEXT-DO-NOT-ECHO";

// answers: path -> [status, body|text]. The script prints a gh -i answer.
function fakeGh(dir, answers, { login = true } = {}) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const data = path.join(dir, "answers.json");
  fs.writeFileSync(data, JSON.stringify(answers));
  const script = path.join(bin, "gh");
  fs.writeFileSync(
    script,
    `#!${process.execPath}
const fs = require("node:fs");
const answers = JSON.parse(fs.readFileSync(${JSON.stringify(data)}, "utf8"));
if (!${login}) { process.stderr.write("gh auth login"); process.exit(4); }
const hit = answers[process.argv[process.argv.length - 1]];
if (!hit) { process.stdout.write("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
const text = typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1]);
process.stdout.write("HTTP/2.0 " + hit[0] + " X\\r\\n\\r\\n" + text);
process.exit(hit[0] < 400 ? 0 : 1);
`,
    { mode: 0o755 },
  );
  return bin;
}

const marker = renderProvenance({
  spec: "s1",
  tasks: ["t-1"],
  commit,
  approvedBy: "octocat",
});
const prose = "Status: Approved\n";
const base = `repos/${REPO}/contents/.kiro/specs/s1`;
const good = () => ({
  [`repos/${REPO}/issues/5`]: [
    200,
    { body: TEXT + "\n" + marker, user: { login: "owner1" } },
  ],
  [`repos/${REPO}/collaborators/octocat/permission`]: [
    200,
    { permission: "write" },
  ],
  [`repos/${REPO}/collaborators/owner1/permission`]: [
    200,
    { permission: "admin" },
  ],
  [`repos/${REPO}`]: [200, { default_branch: "main" }],
  [`repos/${REPO}/compare/main...${commit}`]: [200, { status: "identical" }],
  [`${base}/requirements.md?ref=${commit}`]: [200, prose],
  [`${base}/design.md?ref=${commit}`]: [200, prose],
  [`${base}/tasks.md?ref=${commit}`]: [200, prose + "- [ ] t-1 One\n"],
  [`${base}/avoozl/manifest.json?ref=${commit}`]: [200, "{}"],
});

function run(dir, args, { answers, login, bin = "cli.mjs", env = {} } = {}) {
  const path_ = answers ? fakeGh(dir, answers, { login }) : null,
    clean = { ...process.env };
  for (const name of Object.keys(clean))
    if (
      /^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)(_|$)|^(GH|GITHUB)_TOKEN$/.test(name)
    )
      delete clean[name];
  const result = spawnSync(
    process.execPath,
    [bin === "cli.mjs" ? cli : bin, ...args],
    {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...clean,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_STATE_HOME: path.join(dir, "state"),
        ...(path_
          ? { PATH: path_ + path.delimiter + process.env.PATH }
          : { PATH: path.dirname(process.execPath) }),
        ...env,
      },
    },
  );
  return result;
}

test(
  "exit 0 and one line per check, with no workspace",
  { skip: windows },
  () => {
    const dir = temporaryDirectory("avoozl-verify-");
    const result = run(dir, ["verify-issue", `${REPO}#5`], { answers: good() });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^marker\s+ok$/m);
    assert.match(
      result.stdout,
      /^commit\s+ok\s+0123456 is identical to main$/m,
    );
    assert.equal(result.stdout.trim().split("\n").length, 5);
    assert.doesNotMatch(result.stdout + result.stderr, /DO-NOT-ECHO/);
  },
);

test("exit 1 when a check fails", { skip: windows }, () => {
  const answers = good();
  answers[`repos/${REPO}/collaborators/octocat/permission`] = [
    200,
    { permission: "read" },
  ];
  const result = run(
    temporaryDirectory("avoozl-verify-"),
    ["verify-issue", `${REPO}#5`],
    { answers },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^FAIL approver: /m);
  assert.match(result.stdout, /^author\s+ok/m);
});

test(
  "exit 2 when gh is not logged in or the issue cannot be read",
  { skip: windows },
  () => {
    const dir = temporaryDirectory("avoozl-verify-");
    const noLogin = run(dir, ["verify-issue", `${REPO}#5`], {
      answers: {},
      login: false,
    });
    assert.equal(noLogin.status, 2);
    assert.match(noLogin.stdout, /gh auth login/);
    const none = run(
      temporaryDirectory("avoozl-verify-"),
      ["verify-issue", `${REPO}#5`],
      { answers: {} },
    );
    assert.equal(none.status, 2);
  },
);

test("exit 2 when gh is not installed", () => {
  const dir = temporaryDirectory("avoozl-verify-");
  const result = run(dir, ["verify-issue", `${REPO}#5`], {
    env: { PATH: dir },
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /gh is not installed/);
});

test("exit 64 for a wrong argument, with no call to gh", () => {
  for (const args of [
    ["verify-issue"],
    ["verify-issue", "nope"],
    ["verify-issue", "a/b#0"],
    ["verify-issue", "a/b#1", "a/b#2"],
    ["verify-issue", "../x/y#1"],
  ]) {
    const result = run(temporaryDirectory("avoozl-verify-"), args);
    assert.equal(result.status, 64, args.join(" "));
    assert.match(result.stderr, /owner\/repo#number|Usage/);
  }
});

test(
  "--json prints the result object and keeps the exit code",
  { skip: windows },
  () => {
    const ok = run(
      temporaryDirectory("avoozl-verify-"),
      ["verify-issue", `${REPO}#5`, "--json"],
      { answers: good() },
    );
    assert.equal(ok.status, 0);
    const value = JSON.parse(ok.stdout);
    assert.equal(value.ok, true);
    assert.equal(value.exitCode, 0);
    assert.deepEqual(value.taskIds, ["t-1"]);
    assert.equal(value.commit, commit);
    assert.deepEqual(
      value.checks.map((c) => c.name),
      ["marker", "approver", "author", "spec", "commit"],
    );
    const answers = good();
    answers[`repos/${REPO}/compare/main...${commit}`] = [
      200,
      { status: "ahead" },
    ];
    const bad = run(
      temporaryDirectory("avoozl-verify-"),
      ["verify-issue", `${REPO}#5`, "--json"],
      { answers },
    );
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).checks.at(-1).status, "fail");
  },
);

test("aicommander verify-issue is the same command", { skip: windows }, (t) => {
  const dir = temporaryDirectory("avoozl-verify-");
  const link = path.join(dir, "aicommander");
  fs.symlinkSync(cli, link);
  const result = run(dir, ["verify-issue", `${REPO}#5`], {
    answers: good(),
    bin: link,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^spec\s+ok/m);
});

test("the MCP tool is listed read-only and works with no workspace", async () => {
  const server = createAppMcp({
    fallback: null,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: temporaryDirectory("avoozl-verify-"),
    },
  });
  try {
    const list = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const tool = list.result.tools.find(
      (item) => item.name === "plans_verify_issue",
    );
    assert.ok(tool, "listed");
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.doesNotMatch(tool.description, /^Deprecated/);
    // No workspace and no gh login: the call still runs and says why it failed.
    const reply = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plans_verify_issue",
        arguments: { input: { issue: "nope" } },
      },
    });
    assert.equal(reply.result.isError, true);
    assert.match(reply.result.content[0].text, /owner\/repo#number/);
    assert.doesNotMatch(reply.result.content[0].text, /no workspace/i);
  } finally {
    server.close();
  }
});

test("through MCP the result is the same object, and a bad reference is an error", async () => {
  const reply = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "plans_verify_issue", arguments: { input: {} } },
    },
    null,
  );
  assert.equal(reply.body.result.isError, true);
});
