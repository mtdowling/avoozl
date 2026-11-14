// Proof rc-p6 on a fake GitHub: a crew on the avoozl-crew agent calls
// plans_verify_issue, builds the issue that passes and skips the one with a
// bad approver; Set up shows the agent present. Temporary files and a fake
// `gh` only. The live run is the owner's.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createAppMcp } from "../app-mcp.mjs";
import { CREW_AGENT, crewAgentCheck } from "../crew-agent.mjs";
import { renderProvenance } from "../github-provenance.mjs";
import { radarReread, radarValues } from "../radar-values.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const CODE = "octo-org/octo-code";
const base = `repos/${CODE}/contents/.kiro/specs/demo`;
const prose = "Status: Approved\n";
const tasks = `${prose}\n- [ ] d-1.1 First one [R1.1] (§D1)\n- [ ] d-1.2 Second one\n`;
const issueBody = (approvedBy) =>
  `<!-- avoozl:managed:start -->\nDo it.\n\n## Acceptance criteria\n\n- [ ] It works\n<!-- avoozl:managed:end -->\n${renderProvenance({ spec: "demo", tasks: ["d-1.1"], commit, approvedBy })}`;

// Issue 7 was approved by a writer; issue 8 by an account with read only.
const answers = {
  [`repos/${CODE}/issues/7`]: {
    body: { body: issueBody("octocat"), user: { login: "owner1" } },
  },
  [`repos/${CODE}/issues/8`]: {
    body: { body: issueBody("mallory"), user: { login: "owner1" } },
  },
  [`repos/${CODE}/collaborators/octocat/permission`]: {
    body: { permission: "write" },
  },
  [`repos/${CODE}/collaborators/mallory/permission`]: {
    body: { permission: "read" },
  },
  [`repos/${CODE}/collaborators/owner1/permission`]: {
    body: { permission: "admin" },
  },
  [`repos/${CODE}`]: { body: { default_branch: "main" } },
  [`repos/${CODE}/compare/main...${commit}`]: { body: { status: "identical" } },
  [`${base}/requirements.md?ref=${commit}`]: { text: prose },
  [`${base}/design.md?ref=${commit}`]: { text: prose },
  [`${base}/tasks.md?ref=${commit}`]: { text: tasks },
  [`${base}/avoozl/manifest.json?ref=${commit}`]: { text: "{}" },
};
const reply = (hit) => ({
  status: hit ? 200 : 404,
  headers: {},
  text: hit ? (hit.text ?? JSON.stringify(hit.body)) : "{}",
});
const read = async (apiPath) => reply(answers[apiPath]);

// The crew's rule, from the shipped agent prompt: verify first, build only
// when every check is ok, otherwise skip with scope needs-decision and name
// the failed check.
function crewDecision(result) {
  return result.ok
    ? { action: "build", brief: result.brief }
    : {
        action: "skip",
        scope: "needs-decision",
        failed: result.checks
          .filter((c) => c.status !== "ok")
          .map((c) => c.name),
      };
}

const appDir = path.join(import.meta.dirname, "../../../kirocrew-app");
const spec = JSON.parse(
  fs.readFileSync(path.join(appDir, "agents", `${CREW_AGENT}.json`), "utf8"),
);

test("the avoozl-crew agent builds the verified issue, skips the bad approver; Set up shows the agent present", async () => {
  // The shipped agent is told to do exactly this and holds the tool.
  assert.ok(spec.tools.includes("@avoozl:avoozl/plans_verify_issue"));
  assert.match(spec.prompt, /plans_verify_issue first/);
  assert.match(spec.prompt, /needs-decision/);

  const good = crewDecision(
    await verifyIssue(`${CODE}#7`, { read, brief: true }),
  );
  assert.equal(good.action, "build");
  assert.deepEqual(good.brief.taskIds, ["d-1.1"]);
  assert.deepEqual(good.brief.acceptance, ["It works"]);

  const bad = crewDecision(
    await verifyIssue(`${CODE}#8`, { read, brief: true }),
  );
  assert.deepEqual(bad, {
    action: "skip",
    scope: "needs-decision",
    failed: ["approver"],
  });
  assert.equal("brief" in bad, false);

  // Set up: the installed agent files (as Kiro Crew materializes them) show
  // the agent present, and a crew on another agent is not covered.
  const files = fs
    .readdirSync(path.join(appDir, "agents"))
    .map((file) => `avoozl--${file}`);
  assert.equal(crewAgentCheck({ files, crews: [] }).state, "present");
  const crews = [
    { name: "avoozl-code", agent: CREW_AGENT },
    { name: "old-crew", agent: "kirocrew" },
  ];
  const check = crewAgentCheck({ files, crews });
  assert.deepEqual(
    check.crews.map((c) => c.covered),
    [true, false],
  );
  assert.match(check.note, /unreliable/);
  const values = radarValues({ repository: CODE, settings: {} });
  const reread = radarReread(values, {
    connected: [CODE],
    agents: [CREW_AGENT],
    crews: [crews[0]],
  });
  assert.equal(reread.items.find((i) => i.id === "agent").status, "ok");
  // A fake Radar list without the agent shows it missing, not ok.
  const missing = radarReread(values, {
    connected: [CODE],
    agents: ["kirocrew"],
    crews: [{ name: "avoozl-code" }],
  });
  assert.notEqual(missing.items.find((i) => i.id === "agent").status, "ok");
});

// The crew's real route is the MCP tool, with no workspace, through `gh`.
test(
  "plans_verify_issue over MCP returns the brief for issue 7 and none for issue 8",
  { skip: process.platform === "win32" },
  async () => {
    const dir = temporaryDirectory("avoozl-p6-");
    fs.mkdirSync(path.join(dir, "bin"));
    const table = {};
    for (const [apiPath, hit] of Object.entries(answers))
      table[apiPath] = reply(hit);
    fs.writeFileSync(path.join(dir, "answers.json"), JSON.stringify(table));
    fs.writeFileSync(
      path.join(dir, "bin", "gh"),
      `#!${process.execPath}
const a = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(path.join(dir, "answers.json"))}, "utf8"));
const hit = a[process.argv[process.argv.length - 1]];
if (!hit || hit.status === 404) { process.stdout.write("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
process.stdout.write("HTTP/2.0 200 X\\r\\n\\r\\n" + hit.text);
`,
      { mode: 0o755 },
    );
    const oldPath = process.env.PATH;
    process.env.PATH = path.join(dir, "bin") + path.delimiter + oldPath;
    const server = createAppMcp({
      fallback: null,
      env: { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") },
    });
    try {
      const call = (number) =>
        server.handle({
          jsonrpc: "2.0",
          id: number,
          method: "tools/call",
          params: {
            name: "plans_verify_issue",
            arguments: { input: { issue: `${CODE}#${number}` } },
          },
        });
      const one = (await call(7)).result.structuredContent;
      assert.equal(one.ok, true);
      assert.deepEqual(one.brief.taskIds, ["d-1.1"]);
      const two = (await call(8)).result.structuredContent;
      assert.equal(two.ok, false);
      assert.equal("brief" in two, false);
    } finally {
      process.env.PATH = oldPath;
      server.close();
    }
  },
);
