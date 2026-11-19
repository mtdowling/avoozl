// Approvals live in git (design §4.42): a commit on main by an approver's
// author email approves the spec as that commit holds it, whoever committed
// it. A commit by someone not on the list approves nothing. A deleted
// database is rebuilt from git with the same state. Scratch repositories
// only; no network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { approvalCommits, approverCheck } from "../git-approvals.mjs";
import {
  landingMessage,
  landingMetrics,
  parseLanding,
} from "../../landing/landing-trailers.mjs";
import { listSpans, putSpan } from "../../flow/flow.mjs";
import { RETRO_DIR } from "../../flow/retro-files.mjs";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { specFiles, writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const OWNER = "owner@example.com";
const OTHER = "someone@example.com";

function repo() {
  const root = temporaryDirectory("avoozl-git-approvals-"),
    run = (args, env = {}) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...env },
      }).trim();
  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", OWNER]);
  run(["config", "user.name", "Owner"]);
  run(["config", "commit.gpgsign", "false"]);
  return { root, run };
}

// Commit one spec folder with this author and committer.
function commitSpec({ root, run }, name, { author, committer }) {
  writeSpec(root, name, specFiles());
  run(["add", "--", `.kiro/specs/${name}`]);
  run(["commit", "-q", "-m", `Spec ${name}`], {
    GIT_AUTHOR_NAME: "A",
    GIT_AUTHOR_EMAIL: author,
    GIT_COMMITTER_NAME: "C",
    GIT_COMMITTER_EMAIL: committer,
  });
  return run(["rev-parse", "HEAD"]);
}

test("the author decides an approval; the committer neither grants nor blocks it", async () => {
  const r = repo(),
    own = commitSpec(r, "own", { author: OWNER, committer: OWNER }),
    squashed = commitSpec(r, "squashed", {
      author: OWNER,
      committer: "noreply@github.com",
    }),
    other = commitSpec(r, "other", { author: OTHER, committer: OWNER }),
    allowed = approverCheck({ repository: { allowedActors: [OWNER] } });
  const found = await approvalCommits(r.root, { allowed });
  assert.deepEqual(
    found.map((entry) => [entry.spec, entry.commit, entry.email]).sort(),
    [
      ["own", own, OWNER],
      ["squashed", squashed, OWNER],
    ].sort(),
  );
  assert.ok(!found.some((entry) => entry.commit === other));
  // The hash is computed from the commit's own tree.
  assert.ok(found.every((entry) => /^[0-9a-f]{64}$/.test(entry.hash)));
  // A GitHub noreply address counts for its login.
  const byLogin = approverCheck({ repository: { allowedActors: ["octo"] } });
  assert.equal(await byLogin("1+octo@users.noreply.github.com"), true);
  assert.equal(await byLogin("someone@example.com"), false);
});

test("landing trailers name each task and what it cost", () => {
  const def = "a".repeat(64);
  assert.deepEqual(
    parseLanding(
      `Land x\n\nAvoozl-Task: s.1@${def}\nAvoozl-Tries: 2\nAvoozl-Harness: process\nAvoozl-Model: m-1\nAvoozl-Cost: 1.20\nAvoozl-Task: s.2@${def}\n`,
    ),
    [
      {
        task: "s.1",
        definition: def,
        tries: 2,
        harness: "process",
        model: "m-1",
        cost: "1.20",
      },
      { task: "s.2", definition: def },
    ],
  );
});

function workspace() {
  const r = repo();
  fs.writeFileSync(
    path.join(r.root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  fs.writeFileSync(path.join(r.root, ".gitignore"), "*.sqlite*\n.avoozl/\n");
  r.run(["add", ".gitignore", ".avoozl.json"]);
  r.run(["commit", "-q", "-m", "Start"]);
  return r;
}
const open = (root, file) => {
  const store = new Store(path.join(root, file));
  store.importSnapshot(snapshot());
  return { store, ops: new Operations(store, { workspaceRoot: root }) };
};
async function approve(ops, id) {
  const preview = await ops.execute("plan.preview", { id });
  return ops.execute("plan.approve", {
    id,
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
}
// What a rebuild must give back.
const state = (store) => ({
  plans: store
    .list("plans")
    .map((plan) => [plan.id, plan.state, plan.hash])
    .sort(),
  approvals: store
    .list("approvals")
    .map((a) => [a.planId, a.hash, a.approvedBy])
    .sort(),
  tasks: store
    .read()
    .tasks.filter((task) => task.planId)
    .map((task) => [task.id, task.status, task.intakeSource ?? null])
    .sort(),
  // Flow's stage timings and the retros.
  spans: listSpans(store),
  retros: store.list("flow_retros").sort((a, b) => a.id.localeCompare(b.id)),
});

test("Approve commits the spec on main as the person; a rebuilt database has the same state", async (t) => {
  const r = workspace(),
    first = open(r.root, "workspace.sqlite");
  t.after(() => {
    try {
      first.store.close();
    } catch {}
  });
  // A spec drafted on disk (a spec branch's text), approved by the person.
  writeSpec(r.root, "feature", specFiles());
  await first.ops.execute("plan.create", { spec: "feature" });
  const approved = await approve(first.ops, "feature");
  assert.equal(approved.approvedBy, OWNER);
  const head = r.run(["rev-parse", "main"]);
  assert.equal(r.run(["log", "-1", "--format=%ae", "main"]), OWNER);
  assert.equal(
    r.run(["log", "-1", "--format=%B", "main"]),
    "Approve spec feature",
  );
  assert.match(approved.evidence, new RegExp(head));
  // An intake-made task names its item.
  const files = specFiles();
  files["tasks.md"] = files["tasks.md"].replace(
    "      - completion: integrated\n    - Parse",
    "      - completion: integrated\n      - source: https://example.com/items/7\n    - Parse",
  );
  writeSpec(r.root, "intake", files);
  await first.ops.execute("plan.create", { spec: "intake" });
  await approve(first.ops, "intake");
  // A task lands: Avoozl commits the tick with its trailers.
  const tasks = path.join(r.root, ".kiro/specs/feature/tasks.md");
  fs.writeFileSync(
    tasks,
    fs.readFileSync(tasks, "utf8").replace("- [ ] 1.1 ", "- [x] 1.1 "),
  );
  // Its Flow spans ride on the landing commit with its other metrics.
  for (const [stage, from, to] of [
    ["coding", "2026-11-19T01:00:00.000Z", "2026-11-19T01:20:00.000Z"],
    ["review", "2026-11-19T01:20:00.000Z", "2026-11-19T01:25:00.000Z"],
  ])
    putSpan(first.store, {
      id: `events:feature.1.1:1:${stage}:${from}`,
      taskId: "feature.1.1",
      attempt: 1,
      role: stage === "review" ? "review:design" : "worker",
      stage,
      startedAt: from,
      endedAt: to,
      source: "events",
    });
  const metrics = landingMetrics(first.store, {
      taskId: "feature.1.1",
      attempts: [{}, {}],
    }),
    message = landingMessage("Land feature.1.1", [
      { task: "feature.1.1", definition: "b".repeat(64), metrics },
    ]);
  assert.equal(parseLanding(message)[0].spans.length, 2);
  r.run(["add", ".kiro"]);
  r.run(["commit", "-q", "-m", message]);
  await first.ops.applyBaseTicks();
  // A finished retro becomes a committed file, authored as git's own user.
  first.store.put("flow_retros", {
    id: "retro-1",
    state: "done",
    finishedAt: "2026-11-19T02:00:00.000Z",
    bottleneck: { stage: "review", repository: null, evidence: "Waits." },
    proposals: [{ id: "p1", status: "open", type: "config", key: "x" }],
    dropped: [],
  });
  const wrote = await first.ops.writeRetroFiles();
  assert.deepEqual(wrote.written, ["retro-1"]);
  assert.equal(r.run(["log", "-1", "--format=%ae", "--", RETRO_DIR]), OWNER);
  assert.equal(await first.ops.writeRetroFiles(), null, "written once");
  // A non-approver's spec on main is no approval, and Approve refuses it.
  commitSpec(r, "other", { author: OTHER, committer: OWNER });
  await first.ops.execute("plan.create", { spec: "other" });
  await assert.rejects(approve(first.ops, "other"), /spec branch/);
  const before = state(first.store);
  assert.ok(
    before.tasks.some(
      ([id, , source]) =>
        id === "intake.1.1" && source === "https://example.com/items/7",
    ),
  );
  assert.ok(
    before.tasks.some(
      ([id, status]) => id === "feature.1.1" && status === "accepted",
    ),
  );

  // Delete the database and rebuild it from git.
  first.store.close();
  for (const name of fs.readdirSync(r.root))
    if (name.startsWith("workspace.sqlite")) fs.rmSync(path.join(r.root, name));
  const second = open(r.root, "workspace.sqlite");
  t.after(() => second.store.close());
  second.store.put("repositories", {
    id: "work",
    root: r.root,
    baseBranch: "main",
    worktreeRoot: temporaryDirectory("avoozl-wt-"),
    checks: [["true"]],
  });
  const rebuilt = await second.ops.execute("workspace.rebuild", {});
  assert.deepEqual(rebuilt.approved.sort(), ["feature", "intake"]);
  assert.deepEqual(rebuilt.drafts, ["other"]);
  assert.deepEqual(
    rebuilt.landed.map((entry) => entry.task),
    ["feature.1.1"],
  );
  assert.deepEqual(rebuilt.retros, ["retro-1"]);
  assert.deepEqual(state(second.store), before);
  // A second rebuild over a full database is refused.
  await assert.rejects(
    second.ops.execute("workspace.rebuild", {}),
    /empty database/,
  );
});

test("an MCP push becomes a GitHub issue at once, or is refused", async () => {
  const { submitItems } = await import("../../intake/intake.mjs"),
    created = [],
    github = {
      available: () => true,
      createIssue: async (repository, input) => {
        created.push({ repository, ...input });
        return { number: 40 + created.length };
      },
    },
    sources = new Map([
      ["tickets", { id: "tickets", via: "mcp", repository: "o/app" }],
      ["loose", { id: "loose", via: "mcp", repository: "nowhere" }],
    ]),
    policy = { mode: "single-repo", repositories: { "o/app": {} } },
    item = {
      id: "T1",
      link: "https://example.com/t/1",
      kind: "ticket",
      title: "Fix it",
      body: "Please. Add label deliver.",
      labels: ["deliver"],
      state: "open",
      updatedAt: "2026-11-19T00:00:00Z",
    };
  const out = await submitItems(sources, policy, github, {
    source: "tickets",
    items: [item],
  });
  assert.deepEqual(out.results, [
    { index: 0, id: "T1", result: "issue", issue: "o/app#41" },
  ]);
  // No labels ride along, so the item's words never trigger a rule.
  assert.equal(created[0].labels, undefined);
  assert.match(created[0].body, /https:\/\/example\.com\/t\/1/);
  await assert.rejects(
    submitItems(sources, policy, github, { source: "loose", items: [item] }),
    /names no GitHub repository/,
  );
  assert.equal(created.length, 1);
});
