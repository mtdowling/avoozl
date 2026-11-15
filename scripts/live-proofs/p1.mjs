#!/usr/bin/env node
// Live proof rc-p1: Intake lists only what was asked to plan. Real GitHub.
// Usage: node scripts/live-proofs/p1.mjs OWNER/REPO --confirm
// Creates 5 issues (3 plain, `from owner` with the planning label, `plan me`)
// in the named scratch repository, then reads Intake and Needs you.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Operations } from "../../src/app/operations.mjs";
import { GitHubClient } from "../../src/app/github.mjs";
import { Store } from "../../src/app/store.mjs";
import { machineIdentity } from "../../src/app/github-sync.mjs";

const REPO = process.argv[2];
if (!REPO || !process.argv.includes("--confirm")) {
  console.error("usage: p1.mjs OWNER/REPO --confirm");
  process.exit(2);
}
const [owner, repo] = REPO.split("/");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-p1-"));
const store = new Store(path.join(dir, "workspace.sqlite"));
store.importSnapshot({
  schemaVersion: 1,
  revision: 1,
  updatedAt: new Date(0).toISOString(),
  project: {
    name: "p1",
    title: "p1",
    integration: { revision: "", mainRevision: "", acceptedRevision: "" },
    pollIntervalMs: 10000,
  },
  statuses: [{ id: "planned", label: "Planned", complete: false }],
  epics: [],
  tracks: [{ id: "catalog", label: "Plans" }],
  tasks: [],
  edges: [],
  documents: {},
  changelog: [],
});
fs.writeFileSync(
  path.join(dir, ".avoozl.json"),
  JSON.stringify({
    version: 1,
    namespace: "avz_0123456789abcdef",
    github: {
      mode: "single-repo",
      repositories: {
        [REPO]: {
          baseBranch: "main",
          coder: "issue-radar",
          minimumPermission: "write",
          managedLabels: { managed: "avoozl:managed", ready: "ready" },
          crewLabels: { needsHuman: "plan me" },
        },
      },
    },
  }),
);
store.put("github_repositories", {
  id: REPO,
  owner,
  repo,
  projectId: "code",
  activeMachine: machineIdentity(store).id,
});
store.put("projects", { id: REPO, name: repo, root: dir });
const github = new GitHubClient();
const ops = new Operations(store, { github, workspaceRoot: dir });
const log = (...a) => console.log(...a);

const labels = await github.request(
  "GET",
  `/repos/${REPO}/labels?per_page=100`,
);
const have = new Set(labels.map((l) => l.name));
for (const name of ["avoozl:plan", "plan me"])
  if (!have.has(name))
    await github.request("POST", `/repos/${REPO}/labels`, { body: { name } });

// Search indexes new issues late: re-run with --reuse to read the same ones.
const existing = process.argv.includes("--reuse")
  ? await github.request("GET", `/repos/${REPO}/issues?state=open&per_page=100`)
  : [];
const make = async (title, labelNames = []) =>
  existing.find((i) => i.title === title)?.number ??
  (
    await github.createIssue(REPO, {
      title,
      body: `Body of ${title}`,
      labels: labelNames,
    })
  ).number;
const plain = [
  await make("plain one"),
  await make("plain two"),
  await make("plain three"),
];
const fromOwner = await make("from owner", ["avoozl:plan"]);
const planMe = await make("plan me", ["plan me"]);
log("issues", { plain, fromOwner, planMe });

await ops.execute("untriaged.view", { refresh: true });
const view = await ops.execute("untriaged.view", {});
const needs = await ops.execute("conflicts.view", {});
const result = {
  intake: view.items.map((i) => i.number).sort((a, b) => a - b),
  withRadar: view.withRadar.map((i) => i.number),
  needsYou: needs.items
    .filter((i) => i.reason === "crew")
    .map((i) => i.issue.number),
};
log("result", JSON.stringify(result));
const started = await ops.execute("untriaged.plan", {
  repository: REPO,
  number: fromOwner,
});
log("plan this on from-owner:", started.agent);
const refused = [];
for (const number of [...plain.slice(0, 1), planMe])
  try {
    await ops.execute("untriaged.plan", { repository: REPO, number });
    refused.push([number, "NOT refused"]);
  } catch (e) {
    refused.push([number, e.message]);
  }
log("refused", JSON.stringify(refused));
const after = await github.request(
  "GET",
  `/repos/${REPO}/issues?state=open&per_page=50`,
);
log(
  "comments/labels after:",
  JSON.stringify(
    after.map((i) => [i.number, i.comments, i.labels.map((l) => l.name)]),
  ),
);
log("rate", JSON.stringify(github.rateLimit("core")));
const ok =
  JSON.stringify(result.intake) === JSON.stringify([fromOwner]) &&
  JSON.stringify(result.withRadar) === JSON.stringify([planMe]) &&
  JSON.stringify(result.needsYou) === JSON.stringify([planMe]) &&
  refused.every(([, m]) => /not in Intake/.test(m));
log(ok ? "PASS (without the stranger step)" : "FAIL");
store.close();
process.exit(ok ? 0 : 1);
