// Approvals live in git (design §4.42): a commit on main by an approver's
// author email approves the spec as that commit holds it, whoever committed
// it. A commit by someone not on the list approves nothing. A deleted
// database is rebuilt from git with the same state. Scratch repositories
// only; no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  approvalCommits,
  approverCheck,
  evidenceCache,
  commitApproval,
} from "../git-approvals.mjs";
import { listSpans } from "../../flow/flow.mjs";
import { listActivity } from "../../store/activity-log.mjs";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { specFiles, writeSpec } from "../../test/spec-fixture.mjs";
import { OWNER, specCheckout as repo } from "../../test/spec-checkout.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const OTHER = "someone@example.com";

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
  const tasks = "- [ ] `a-1` Do it\n  - Done\n";
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

test("a merged pull request's merge commit is the approval of the spec it brought", async () => {
  // Nearby input: the branch's own commit, by someone else, is not walked.
  const r = repo(),
    allowed = async (email) => email === OWNER;
  r.run(["commit", "-q", "--allow-empty", "-m", "Start"]);
  const main = r.run(["branch", "--show-current"]);
  r.run(["checkout", "-q", "-b", "spec/merged"]);
  commitSpec(r, "merged", { author: OTHER, committer: OTHER });
  r.run(["checkout", "-q", main]);
  r.run(["merge", "-q", "--no-ff", "-m", "Merge spec/merged", "spec/merged"], {
    GIT_AUTHOR_NAME: "A",
    GIT_AUTHOR_EMAIL: OWNER,
    GIT_COMMITTER_NAME: "A",
    GIT_COMMITTER_EMAIL: OWNER,
  });
  const merge = r.run(["rev-parse", "HEAD"]);
  const found = await approvalCommits(r.root, { allowed });
  assert.deepEqual(
    found.map((entry) => [entry.spec, entry.commit, entry.email]),
    [["merged", merge, OWNER]],
  );
});

test("the author decides an approval; the committer neither grants nor blocks it", async () => {
  const r = repo(),
    own = commitSpec(r, "own", { author: OWNER, committer: OWNER }),
    squashed = commitSpec(r, "squashed", {
      author: OWNER,
      committer: "noreply@github.com",
    }),
    other = commitSpec(r, "other", { author: OTHER, committer: OWNER }),
    allowed = approverCheck({
      repository: { allowedActors: [OWNER] },
      trust: "branch-protection",
    });
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
  const byLogin = approverCheck({
    repository: { allowedActors: ["octo"] },
    trust: "branch-protection",
  });
  assert.equal(await byLogin("1+octo@users.noreply.github.com"), true);
  assert.equal(await byLogin("someone@example.com"), false);
});

function workspace(settings = {}) {
  const r = repo();
  fs.writeFileSync(
    path.join(r.root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" }, ...settings }),
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
  // Flow's stage timings.
  spans: listSpans(store),
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
  files["tasks.md"] = files["tasks.md"].replace("    - Parse");
  writeSpec(r.root, "intake", files);
  await first.ops.execute("plan.create", { spec: "intake" });
  await approve(first.ops, "intake");
  // A task lands: its tick, with no trailer (SM4.4).
  const tasks = path.join(r.root, ".kiro/specs/feature/tasks.md");
  fs.writeFileSync(
    tasks,
    fs.readFileSync(tasks, "utf8").replace("- [ ] 1.1 ", "- [x] 1.1 "),
  );
  r.run(["add", ".kiro"]);
  r.run(["commit", "-q", "-m", "Land feature.1.1"]);
  await first.ops.applyBaseTicks();
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
  const queuedAtPublish = [],
    publish = ops.publishApproved.bind(ops);
  ops.publishApproved = () => {
    const pending = store.getMeta("publish.pending") ?? {};
    if (Object.keys(pending).length) queuedAtPublish.push(pending);
    return publish();
  };
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
  // The adopted approval was queued for its spec issue (rule 8.1).
  assert.deepEqual(queuedAtPublish, [{ merged: squash }]);
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

test("with specs.branch, approvals and ticks are read and written on that branch, and main is left alone", async (t) => {
  const r = workspace({ specs: { branch: "plans" } });
  r.run(["checkout", "-q", "-b", "plans"]);
  const main = r.run(["rev-parse", "main"]),
    { store, ops } = open(r.root, "workspace.sqlite");
  t.after(() => store.close());
  // A click commits the approval on the specs branch.
  writeSpec(r.root, "feature", specFiles());
  await ops.execute("plan.create", { spec: "feature" });
  await approve(ops, "feature");
  assert.equal(
    r.run(["log", "-1", "--format=%B", "plans"]),
    "Approve spec feature",
  );
  // An approver's commit on the specs branch approves on the tick.
  writeSpec(r.root, "merged", specFiles());
  await ops.execute("plan.create", { spec: "merged" });
  commitSpec(r, "merged", { author: OWNER, committer: OWNER });
  await ops.execute("workspace.tick", {});
  assert.equal(store.get("plans", "merged").state, "approved");
  // A tick committed on the specs branch is read there.
  const tasks = path.join(r.root, ".kiro/specs/feature/tasks.md");
  fs.writeFileSync(
    tasks,
    fs.readFileSync(tasks, "utf8").replace("- [ ] 1.1 ", "- [x] 1.1 "),
  );
  r.run(["commit", "-qam", "Tick feature.1.1"]);
  await ops.applyBaseTicks();
  const id = store.get("plans", "feature").mapping["feature.1.1"];
  assert.equal(
    store.read().tasks.find((task) => task.id === id).tickCommit,
    r.run(["rev-parse", "plans"]),
  );
  assert.equal(r.run(["rev-parse", "main"]), main, "main is untouched");
  // A spec checkout on another branch is named, since its folders are not
  // the specs.
  r.run(["checkout", "-q", "main"]);
  assert.match(
    ops.specList().homeErrors.join(" "),
    /Specs live on plans, but .+ has main checked out\./,
  );
});

// One leaf spec of epic launch whose task 1.1 needs `after` (another
// spec's task) and is ticked when `done`.
const leafSpec = (title, { after = null, done = false } = {}) => ({
  "requirements.md": `---\nepic: launch\n---\n# ${title}\n\nThe goal.\n`,
  "design.md": "# Design\n\nOne step.\n",
  "tasks.md": `# Tasks\n\n- [${done ? "x" : " "}] 1 ${title}\n  - [${done ? "x" : " "}] 1.1 Do ${title}\n`,
  "avoozl/manifest.json": JSON.stringify({
    tasks: {
      1: {
        kind: "package",
        summary: "The goal.",
        requires: ["1.1"],
        acceptance: ["Done."],
      },
      1.1: {
        kind: "leaf",
        summary: `Do ${title}.`,
        ...(after ? { requires: [after] } : {}),
        acceptance: ["It works."],
        checks: ["npm test"],
        completion: "integrated",
      },
    },
  }),
});

// A fake GitHub that answers for one commit `c1`: who merged its pull request
// and who signed it. `calls` counts the reads.
function fakeGithub({ mergedBy = null, signer = null, author = "mallory" }) {
  const calls = { commit: 0 };
  return {
    calls,
    available: () => true,
    permission: async () => ({ permission: "read" }),
    commitPullRequests: async () =>
      mergedBy ? [{ number: 7, merged_at: "2026-01-01" }] : [],
    pullRequest: async () => ({
      merged: true,
      merge_commit_sha: "c1",
      merged_by: { login: mergedBy },
    }),
    commit: async () => {
      calls.commit += 1;
      return {
        author: { login: author },
        committer: { login: signer ?? "web-flow" },
        commit: { verification: { verified: Boolean(signer) } },
      };
    },
  };
}

test("a spoofed author email approves nothing unless GitHub or branch protection vouches", async () => {
  const spoofed = "acme-owner@users.noreply.github.com",
    repository = { allowedActors: ["acme-owner"] },
    check = (github, trust) =>
      approverCheck({
        repository,
        github,
        repositoryName: "acme/widget",
        trust,
      });
  // Default: the email is nothing, the merger or signer is evidence.
  const none = check(fakeGithub({}), undefined);
  assert.equal(await none(spoofed, "c1"), false);
  const merged = check(fakeGithub({ mergedBy: "acme-owner" }), undefined);
  assert.equal(await merged("mallory@example.com", "c1"), true);
  assert.equal(merged.used.get("c1"), "merged_by");
  assert.equal(
    await check(fakeGithub({ mergedBy: "mallory" }), undefined)(spoofed, "c1"),
    false,
  );
  const signed = check(fakeGithub({ signer: "acme-owner" }), undefined);
  assert.equal(await signed("mallory@example.com", "c1"), true);
  assert.equal(signed.used.get("c1"), "signature");
  // GitHub's own signature on a web merge names no approver.
  assert.equal(
    await check(fakeGithub({}), undefined)("acme-owner@example.com", "c1"),
    false,
  );
  // Declared branch protection trusts the author.
  const trusted = check(fakeGithub({}), "branch-protection");
  assert.equal(await trusted(spoofed, "c1"), true);
  assert.equal(trusted.used.get("c1"), "branch-protection");
});

test("what GitHub returned for a commit is read back from the evidence file", async () => {
  const root = temporaryDirectory("avoozl-evidence-"),
    first = fakeGithub({ mergedBy: "acme-owner" }),
    make = (github) =>
      approverCheck({
        repository: { allowedActors: ["acme-owner"] },
        github,
        repositoryName: "acme/widget",
        cache: evidenceCache(root),
      });
  assert.equal(await make(first)("x@example.com", "c1"), true);
  // The approving pull request's number is kept for spec issue publishing.
  assert.equal(evidenceCache(root).get("c1").pull, 7);
  const offline = fakeGithub({});
  offline.commitPullRequests =
    offline.pullRequest =
    offline.commit =
      async () => {
        throw Error("offline");
      };
  assert.equal(await make(offline)("x@example.com", "c1"), true);
});
