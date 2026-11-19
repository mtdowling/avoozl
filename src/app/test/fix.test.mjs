// Fixes without spec files (triage-agent ta-1.1, TA9, design §D5): one from
// text and one from an issue each become a ready leaf, verify and land with
// the two acceptance lines; a version 1 record loads; Make this a spec
// writes a folder that lints clean. Real git with a bare "origin"; nothing
// live.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Store } from "../store.mjs";
import { integrateVerified } from "../delivery.mjs";
import { landDirect } from "../direct-landing.mjs";
import { queryTasks } from "../../query.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { startGitHubItem, closingLine } from "../github-intake.mjs";
import {
  FIX_ACCEPTANCE,
  fixIssue,
  fixRecord,
  fixToSpec,
  loadFix,
  openFixJournal,
  startFix,
} from "../fix.mjs";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { snapshot } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = "o/app";
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const CHECK = [
  process.execPath,
  "-e",
  "process.exit(require('fs').existsSync('FAIL') ? 1 : 0)",
];

function workspace(t) {
  const root = temporaryDirectory("avoozl-fix-"),
    origin = path.join(root, "origin.git"),
    checkout = path.join(root, "app");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    repository: REPOSITORY,
    baseBranch: "main",
    landing: "direct",
    checks: [CHECK],
    worktreeRoot: path.join(root, "wt"),
  });
  const context = { workspaceRoot: root, actor: "Operator" };
  return {
    root,
    origin,
    checkout: fs.realpathSync.native(checkout),
    store,
    context,
    start: (input) => startFix(store, input, context),
  };
}

const task = (store, id) => store.read().tasks.find((entry) => entry.id === id);

// The worker's commit and the verifier's pass, as the tick records them.
function verified(w, taskId) {
  const branch = `avoozl/${taskId}`,
    wt = path.join(w.root, "wt", taskId);
  git(w.checkout, "worktree", "add", "-q", "-b", branch, wt, "main");
  fs.writeFileSync(path.join(wt, `${taskId}.txt`), `${taskId}\n`);
  git(wt, "add", ".");
  git(wt, "commit", "-qm", `Do ${taskId}`);
  const commit = git(wt, "rev-parse", "HEAD");
  w.store.put("task_worktrees", {
    id: taskId,
    taskId,
    path: wt,
    branch,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    id: taskId,
    taskId,
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  return commit;
}

async function lands(w, taskId) {
  const ready = queryTasks(w.store.read(), { scope: "all", q: "ready:true" });
  assert.ok(
    ready.some((entry) => entry.id === taskId),
    `${taskId} is ready to start`,
  );
  const commit = verified(w, taskId);
  await integrateVerified(w.store);
  await landDirect(w.store, { workspaceRoot: w.root, rounds: 2, machine: {} });
  const landed = git(w.origin, "rev-parse", "main");
  git(w.origin, "merge-base", "--is-ancestor", commit, landed);
  assert.equal(w.store.get("task_deliveries", taskId).state, "integrated");
}

test("a fix from text is a ready leaf that verifies and lands", async (t) => {
  const w = workspace(t),
    { taskId } = await w.start({
      text: "Trim the trailing space in the greeting.\n\nIt shows on every page.",
      repository: "app",
    });
  const made = task(w.store, taskId);
  assert.equal(taskId, "fix-1");
  assert.equal(made.title, "Trim the trailing space in the greeting.");
  assert.deepEqual(made.acceptance, [...FIX_ACCEPTANCE]);
  assert.deepEqual(made.fix.source, {
    text: "Trim the trailing space in the greeting.\n\nIt shows on every page.",
    by: "person",
  });
  assert.equal(made.approvedSource.hash, made.fix.definition);
  assert.equal(made.dispatch.ready, true);
  assert.equal(fixIssue(made), null);
  await lands(w, taskId);
  // The next fix takes the next number.
  assert.equal(
    (await w.start({ text: "Another", repository: REPOSITORY })).taskId,
    "fix-2",
  );
});

test("a fix from an issue keeps the issue and lands with the same lines", async (t) => {
  const w = workspace(t),
    github = new FakeGitHub(),
    policy = normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: { [REPOSITORY]: { baseBranch: "main" } },
    });
  github.created.push({
    id: 5,
    node_id: "issue-5",
    number: 5,
    state: "open",
    title: "Greeting has a space",
    body: "There is a trailing space.",
    labels: [],
    html_url: `https://example.test/${REPOSITORY}/issues/5`,
    user: { login: "reporter" },
    assignees: [],
  });
  const { taskId } = await startGitHubItem(w.store, github, policy, {
      id: `${REPOSITORY}#5`,
      action: "deliver",
    }),
    made = task(w.store, taskId);
  await openFixJournal(w.store, w.context, taskId);
  assert.deepEqual(made.acceptance, [...FIX_ACCEPTANCE]);
  assert.deepEqual(fixIssue(made), { repository: REPOSITORY, number: 5 });
  assert.equal(closingLine(made, REPOSITORY), "Fixes #5");
  await lands(w, taskId);
});

test("a version 1 record loads as version 2 and its task still lands", async (t) => {
  const w = workspace(t),
    v1 = {
      v: 1,
      kind: "bounded-fix",
      issue: { repository: REPOSITORY, number: 9 },
      snapshot: "s",
      acceptance: ["The change does what o/app#9 asks.", "Checks pass."],
      definition: digest("old fix"),
      journal: { repository: REPOSITORY, number: 9 },
    };
  const loaded = loadFix(v1);
  assert.equal(loaded.v, 2);
  assert.deepEqual(loaded.source, {
    issue: { repository: REPOSITORY, number: 9 },
  });
  assert.equal(loaded.kind, undefined);
  assert.equal(loaded.definition, digest("old fix"));
  assert.equal(loadFix({ v: 7 }), null);
  w.store.mutate("Old fix", (data) => {
    data.tasks.push({
      id: "intake-old",
      title: "Old fix",
      summary: "x",
      acceptance: v1.acceptance,
      status: "planned",
      scope: "runtime",
      kind: "leaf",
      authority: "local",
      repository: "app",
      track: "catalog",
      tags: [],
      fix: v1,
      intake: { source: "github", by: "person" },
      dispatch: { ready: true, state: "authorized", reason: "" },
    });
  });
  assert.equal(
    closingLine(task(w.store, "intake-old"), REPOSITORY),
    "Fixes #9",
  );
  await openFixJournal(w.store, w.context, "intake-old");
  await lands(w, "intake-old");
});

test("the definition hash changes when the text changes", () => {
  const a = fixRecord({ text: "Do A" }),
    b = fixRecord({ text: "Do B" });
  assert.notEqual(a.definition, b.definition);
  assert.equal(a.definition, fixRecord({ text: "Do A" }).definition);
  const issue = { repository: REPOSITORY, number: 1 };
  assert.notEqual(
    fixRecord({ issue, title: "T", body: "one" }).definition,
    fixRecord({ issue, title: "T", body: "two" }).definition,
  );
});

test("a fix refuses empty text and a repository with no checkout", async (t) => {
  const w = workspace(t);
  await assert.rejects(w.start({ text: " ", repository: "app" }), /Say what/);
  await assert.rejects(
    w.start({ text: "x", repository: "nope" }),
    (error) => error.status === 404,
  );
});

test("Make this a spec writes a folder that lints clean and archives the fix", async (t) => {
  const w = workspace(t),
    { taskId } = await w.start({
      text: "Rework the greeting.\n\nIt needs a design: three pages use it.",
      repository: "app",
    });
  const result = fixToSpec(w.store, w.root, { taskId });
  assert.equal(result.spec, "fix-1");
  const spec = readSpecFolder(w.root, "fix-1"),
    lint = lintSpec({ spec, plan: { id: "fix-1" }, data: w.store.read() });
  assert.equal(lint.counts.error, 0, JSON.stringify(lint.diagnostics));
  assert.match(spec.files["requirements.md"], /> It needs a design/);
  assert.equal(lint.taskCount, 1);
  const archived = task(w.store, taskId);
  assert.ok(archived.archivedAt);
  assert.deepEqual(
    { spec: archived.fixSpec.spec, folder: archived.fixSpec.folder },
    { spec: "fix-1", folder: path.join(".kiro", "specs", "fix-1") },
  );
  assert.equal(archived.dispatch.ready, false);
  assert.throws(
    () => fixToSpec(w.store, w.root, { taskId }),
    /already archived/,
  );
});
