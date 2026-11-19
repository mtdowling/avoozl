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
import {
  approvalCommits,
  approverCheck,
  commitApproval,
} from "../git-approvals.mjs";
import {
  landingMessage,
  landingMetrics,
  parseLanding,
} from "../../landing/landing-trailers.mjs";
import { listSpans, putSpan } from "../../flow/flow.mjs";
import { listActivity } from "../../store/activity-log.mjs";
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
function commitSpec({ root, run }, name, { author, committer, files }) {
  writeSpec(root, name, files ?? specFiles());
  run(["add", "--", `.kiro/specs/${name}`]);
  run(["commit", "-q", "-m", `Spec ${name}`], {
    GIT_AUTHOR_NAME: "A",
    GIT_AUTHOR_EMAIL: author,
    GIT_COMMITTER_NAME: "C",
    GIT_COMMITTER_EMAIL: committer,
  });
  return run(["rev-parse", "HEAD"]);
}

test("approvals read and write every spec file under specs.path", async () => {
  const r = repo(),
    folder = "docs/specs/lean";
  fs.writeFileSync(
    path.join(r.root, ".avoozl.json"),
    JSON.stringify({ version: 1, specs: { path: "docs/specs" } }),
  );
  fs.mkdirSync(path.join(r.root, folder), { recursive: true });
  const tasks = "- [ ] `a-1` Do it\n  - $done: Done\n";
  fs.writeFileSync(path.join(r.root, folder, "tasks.md"), tasks);
  fs.writeFileSync(path.join(r.root, folder, "old.md"), "Old\n");
  r.run(["add", "-A"]);
  r.run(["commit", "-q", "-m", "Start"]);
  const allowed = async (email) => email === OWNER;
  let [first] = await approvalCommits(r.root, { allowed });
  assert.equal(first.spec, "lean");
  assert.deepEqual(Object.keys(first.files).sort(), ["old.md", "tasks.md"]);
  // Approve drops old.md and adds notes.md; the commit removes what the
  // reviewed revision left out.
  await commitApproval(r.root, {
    lean: { "tasks.md": tasks, "notes.md": "Notes\n" },
  });
  assert.deepEqual(
    r.run(["ls-tree", "--name-only", "HEAD", `${folder}/`]).split("\n"),
    [`${folder}/notes.md`, `${folder}/tasks.md`],
  );
  [first] = await approvalCommits(r.root, { allowed });
  assert.deepEqual(first.files, { "notes.md": "Notes\n", "tasks.md": tasks });
});

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
  store.initialize(snapshot());
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
    .map((task) => [task.id, task.status, task.type ?? null])
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
  // A second approved spec, with a fact of its own.
  const files = specFiles();
  files["tasks.md"] = files["tasks.md"].replace(
    "    - Parse",
    "    - $type: intake\n    - Parse",
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

// The tick reads approvals that reach main with no click: a pull request an
// approver authored and GitHub squash-merged, or a push (§4.42).
const tickApprovals = (store) =>
  listActivity(store, { kind: "plan.approved", source: "tick" }).items;
const taskStates = (store, planId) =>
  store
    .read()
    .tasks.filter((task) => task.planId === planId)
    .map((task) => [task.id.slice(planId.length), task.status])
    .sort();

test("the tick adopts an approver's spec commit on main, and nothing else", async (t) => {
  const r = workspace(),
    { store, ops } = open(r.root, "workspace.sqlite"),
    tick = () => ops.execute("workspace.tick", {});
  t.after(() => store.close());
  // Drafts on disk, as their spec branches hold them.
  for (const name of ["merged", "foreign", "clicked"]) {
    writeSpec(r.root, name, specFiles());
    await ops.execute("plan.create", { spec: name });
  }
  // GitHub's squash merge of the owner's pull request: the owner is the
  // author and GitHub the committer.
  const squash = commitSpec(r, "merged", {
    author: OWNER,
    committer: "noreply@github.com",
  });
  // Someone else's spec commit, with the owner as committer.
  commitSpec(r, "foreign", { author: OTHER, committer: OWNER });
  await tick();
  const merged = store.get("plans", "merged");
  assert.equal(merged.state, "approved");
  assert.deepEqual(
    store.list("approvals").map((a) => [a.planId, a.hash, a.approvedBy]),
    [["merged", merged.hash, OWNER]],
  );
  assert.match(store.list("approvals")[0].evidence, new RegExp(squash));
  assert.equal(taskStates(store, "merged").length, 3);
  assert.equal(store.get("plans", "foreign").state, "draft");
  assert.deepEqual(taskStates(store, "foreign"), []);
  // Activity names the commit and the approver, once.
  const rows = tickApprovals(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetId, "merged");
  assert.equal(rows[0].actor, OWNER);
  assert.match(rows[0].summary, new RegExp(`${OWNER}.*${squash.slice(0, 12)}`));
  await tick();
  assert.equal(tickApprovals(store).length, 1);

  // A later edit by a non-approver is a revision that needs approval again.
  const files = specFiles();
  files["requirements.md"] += "\nIt also reads config.toml.\n";
  commitSpec(r, "merged", { author: OTHER, committer: OWNER, files });
  await tick();
  await ops.execute("plan.save", { id: "merged", expectedHash: merged.hash });
  await tick();
  const edited = store.get("plans", "merged");
  assert.notEqual(edited.hash, merged.hash);
  assert.equal(edited.state, "draft");
  assert.ok(!store.list("approvals").some((a) => a.hash === edited.hash));

  // A click makes its own approval commit: no second Activity row, and its
  // tasks come out as the merged spec's did.
  await approve(ops, "clicked");
  await tick();
  assert.equal(tickApprovals(store).length, 1);
  assert.equal(
    store.list("approvals").filter((a) => a.planId === "clicked").length,
    1,
  );
  assert.deepEqual(taskStates(store, "clicked"), taskStates(store, "merged"));

  // An approver's own push of an edit: the tick reads the text in as the
  // next revision and approves it.
  const pushed = commitSpec(r, "clicked", {
    author: OWNER,
    committer: OWNER,
    files,
  });
  await tick();
  const clicked = store.get("plans", "clicked");
  assert.equal(clicked.state, "approved");
  assert.equal(clicked.hash, edited.hash);
  assert.ok(
    store
      .list("approvals")
      .some((a) => a.planId === "clicked" && a.hash === clicked.hash),
  );
  assert.match(
    tickApprovals(store)[0].summary,
    new RegExp(pushed.slice(0, 12)),
  );
});
