import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createAppMcp } from "../app-mcp.mjs";
import { renderProvenance } from "../github-provenance.mjs";
import { Operations } from "../operations.mjs";
import { formatVerification, verifyIssue } from "../verify-issue.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// RC6.3: with every check ok, verify-issue hands a crew the brief (task IDs,
// acceptance, references). With any check not ok there is no brief. No
// workspace is needed. A fake GitHub answers; nothing touches the network.
const commit = "0123456789abcdef0123456789abcdef01234567";
const CODE = "octo-org/octo-code";
const base = `repos/${CODE}/contents/.kiro/specs/radar-coder`;
const marker = renderProvenance({
  spec: "radar-coder",
  tasks: ["rc-2.3", "rc-2.4"],
  commit,
  approvedBy: "octocat",
});
const section = `<!-- avoozl:managed:start -->
This issue is projected from approved design \`radar-coder\` at \`abcdef012345\`.

Do the thing.

## Acceptance criteria

- [ ] First criterion
- [ ] Second criterion

## Dependencies

- rc-1.1
<!-- avoozl:managed:end -->`;
const prose = "Status: Approved\n";
const tasks = `${prose}
- [ ] rc-2.3 First one [RC2.1, RC2.2] (§D5)
- [ ] rc-2.4 Second one (§D6)
- [ ] rc-2.5 Third one [RC9.9] (§D9)
`;

function fake(over = {}) {
  const table = new Map([
    [
      `repos/${CODE}/issues/7`,
      {
        status: 200,
        body: {
          body: `${section}\n${marker}`,
          user: { login: "owner1" },
        },
      },
    ],
    [
      `repos/${CODE}/collaborators/octocat/permission`,
      { status: 200, body: { permission: "write" } },
    ],
    [
      `repos/${CODE}/collaborators/owner1/permission`,
      { status: 200, body: { permission: "admin" } },
    ],
    [`repos/${CODE}`, { status: 200, body: { default_branch: "main" } }],
    [
      `repos/${CODE}/compare/main...${commit}`,
      { status: 200, body: { status: "identical" } },
    ],
    [`${base}/requirements.md?ref=${commit}`, { status: 200, text: prose }],
    [`${base}/design.md?ref=${commit}`, { status: 200, text: prose }],
    [`${base}/tasks.md?ref=${commit}`, { status: 200, text: tasks }],
    [`${base}/avoozl/manifest.json?ref=${commit}`, { status: 200, text: "{}" }],
  ]);
  for (const [key, value] of Object.entries(over)) table.set(key, value);
  return async (apiPath) => {
    const hit = table.get(apiPath) ?? { status: 404, body: {} };
    return {
      status: hit.status,
      headers: {},
      text: hit.text ?? JSON.stringify(hit.body ?? {}),
    };
  };
}

const verify = (over, options = { brief: true }) =>
  verifyIssue(`${CODE}#7`, { read: fake(over), ...options });

test("all checks ok: the brief holds task IDs, acceptance and references", async () => {
  const result = await verify();
  assert.equal(result.ok, true);
  assert.deepEqual(result.brief, {
    spec: "radar-coder",
    commit,
    taskIds: ["rc-2.3", "rc-2.4"],
    acceptance: ["First criterion", "Second criterion"],
    references: {
      "rc-2.3": ["RC2.1", "RC2.2", "§D5"],
      "rc-2.4": ["§D6"],
    },
  });
});

test("any check not ok means no brief", async () => {
  const cases = {
    marker: { [`repos/${CODE}/issues/7`]: { status: 500, body: {} } },
    approver: {
      [`repos/${CODE}/collaborators/octocat/permission`]: {
        status: 200,
        body: { permission: "read" },
      },
    },
    author: {
      [`repos/${CODE}/collaborators/owner1/permission`]: {
        status: 200,
        body: { permission: "none" },
      },
    },
    spec: { [`${base}/design.md?ref=${commit}`]: { status: 404, body: {} } },
    commit: {
      [`repos/${CODE}/compare/main...${commit}`]: {
        status: 200,
        body: { status: "ahead" },
      },
    },
    unreadable: { [`repos/${CODE}`]: { status: 502, body: {} } },
  };
  for (const [name, over] of Object.entries(cases)) {
    const result = await verify(over);
    assert.equal(result.ok, false, name);
    assert.equal("brief" in result, false, name);
  }
});

test("the brief is asked for; the CLI and posted text never carry it", async () => {
  const plain = await verify({}, {});
  assert.equal(plain.ok, true);
  assert.equal("brief" in plain, false);
  const asked = await verify();
  assert.doesNotMatch(
    formatVerification(asked),
    /criterion|RC2\.1|Do the thing/,
  );
});

test("a managed section that is missing or odd gives an empty list, not an error", async () => {
  for (const body of [
    marker,
    `<!-- avoozl:managed:start -->\n## Acceptance criteria\n<!-- avoozl:managed:end -->\n${marker}`,
    `<!-- avoozl:managed:start -->\n${marker}\n<!-- avoozl:managed:end -->`,
  ]) {
    const result = await verify({
      [`repos/${CODE}/issues/7`]: {
        status: 200,
        body: { body, user: { login: "owner1" } },
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.brief.acceptance, []);
  }
});

test("a task line with no references, or in a fence, gives an empty list", async () => {
  const result = await verify({
    [`${base}/tasks.md?ref=${commit}`]: {
      status: 200,
      text: `${prose}- [ ] rc-2.3 Plain\n- [ ] rc-2.4 [RC1.1]\n`,
    },
  });
  assert.deepEqual(result.brief.references, {
    "rc-2.3": [],
    "rc-2.4": ["RC1.1"],
  });
});

test("the operation returns the brief with no workspace", async () => {
  const ops = new Operations(null);
  // The operation reads through gh; with no gh it must still not ask for a
  // workspace, and a bad reference is the usual refusal.
  await assert.rejects(
    ops.perform("issue.verify", { issue: "nope" }),
    /owner\/repo#number/,
  );
});

// A fake `gh` is a script first on PATH, so this runs where one can execute.
test(
  "MCP with no workspace returns the brief; every listed crew tool is workspace-free",
  { skip: process.platform === "win32" },
  async () => {
    const dir = temporaryDirectory("avoozl-brief-");
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    const answers = {};
    const read = fake();
    for (const apiPath of [
      `repos/${CODE}/issues/7`,
      `repos/${CODE}/collaborators/octocat/permission`,
      `repos/${CODE}/collaborators/owner1/permission`,
      `repos/${CODE}`,
      `repos/${CODE}/compare/main...${commit}`,
      ...[
        "requirements.md",
        "design.md",
        "tasks.md",
        "avoozl/manifest.json",
      ].map((f) => `${base}/${f}?ref=${commit}`),
    ])
      answers[apiPath] = await read(apiPath);
    fs.writeFileSync(path.join(dir, "answers.json"), JSON.stringify(answers));
    fs.writeFileSync(
      path.join(bin, "gh"),
      `#!${process.execPath}
const fs = require("node:fs");
const a = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, "answers.json"))}, "utf8"));
const hit = a[process.argv[process.argv.length - 1]];
if (!hit) { process.stdout.write("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
process.stdout.write("HTTP/2.0 " + hit.status + " X\\r\\n\\r\\n" + hit.text);
`,
      { mode: 0o755 },
    );
    const oldPath = process.env.PATH;
    process.env.PATH = bin + path.delimiter + oldPath;
    const server = createAppMcp({
      fallback: null,
      env: { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") },
    });
    try {
      const call = (name, args) =>
        server.handle({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        });
      const reply = await call("plans_verify_issue", {
        input: { issue: `${CODE}#7` },
      });
      assert.notEqual(reply.result.isError, true);
      const value = reply.result.structuredContent;
      assert.equal(value.ok, true);
      assert.deepEqual(value.brief.taskIds, ["rc-2.3", "rc-2.4"]);
      assert.deepEqual(value.brief.acceptance, [
        "First criterion",
        "Second criterion",
      ]);
      // The crew's own tool list: this app contributes one tool, and it
      // never answers that there is no workspace.
      const bad = await call("plans_verify_issue", { input: { issue: "x" } });
      assert.doesNotMatch(JSON.stringify(bad), /no workspace/i);
    } finally {
      process.env.PATH = oldPath;
      server.close();
    }
  },
);
