// rc-27.2 to rc-27.4 and the merge method (RC28, design D33): Avoozl fixes a
// crew's source conflict with one resolver chat and one merge commit. GitHub
// is a fake that records every write; the drop check runs on a real git
// repository in a temporary folder. Nothing reaches the network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isFixWork } from "../flow.mjs";
import { machineIdentity } from "../github-sync.mjs";
import {
  FIX_AGENT,
  FIX_ROLE,
  checkConflictFix,
  conflictFixDispatches,
  conflictFixNeedsYou,
  conflictFixStep,
  conflictFixesOf,
  decideConflictFix,
  dropCheck,
  reportConflictFix,
} from "../radar-conflict-fix.mjs";
import { mergeNeedsYou } from "../radar-merge.mjs";
import { bindSession } from "../session-bindings.mjs";
import { buildTrace } from "../trace.mjs";
import { fixture } from "./fixtures.mjs";
import {
  NAMESPACE,
  REPO,
  managed,
  provenance,
} from "./radar-coder-merge-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NEEDS = "crew: needs human",
  CONFLICT = "avoozl:merge-conflict";

// ---- a real repository with a source conflict ------------------------------

const run = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  }).trim();

// main and the crew's branch both edit a.txt from one base. Returns the
// folder, the branch head and a function that merges main into the branch
// with the given text for a.txt.
function conflicted() {
  const cwd = temporaryDirectory();
  run(cwd, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(cwd, "a.txt"), "one\ntwo\n");
  fs.writeFileSync(path.join(cwd, "b.txt"), "only main touches this\n");
  run(cwd, "add", ".");
  run(cwd, "commit", "-qm", "base");
  run(cwd, "checkout", "-qb", "crew");
  fs.writeFileSync(path.join(cwd, "a.txt"), "one\ncrew line\ntwo\n");
  run(cwd, "commit", "-qam", "crew change");
  const head = run(cwd, "rev-parse", "HEAD");
  run(cwd, "checkout", "-q", "main");
  fs.writeFileSync(path.join(cwd, "a.txt"), "one\nmain line\ntwo\n");
  fs.writeFileSync(path.join(cwd, "b.txt"), "main changed this\n");
  run(cwd, "commit", "-qam", "main change");
  const baseTip = run(cwd, "rev-parse", "HEAD");
  run(cwd, "checkout", "-q", "crew");
  const merge = (text) => {
    try {
      run(cwd, "merge", "-q", "main");
    } catch {
      // The conflict; resolved below.
    }
    fs.writeFileSync(path.join(cwd, "a.txt"), text);
    run(cwd, "add", "a.txt");
    run(cwd, "commit", "-q", "--no-edit");
    return run(cwd, "rev-parse", "HEAD");
  };
  return { cwd, head, baseTip, merge };
}

test("the drop check passes when both sides stay and fails on a dropped base line", () => {
  const kept = conflicted();
  kept.merge("one\ncrew line\nmain line\ntwo\n");
  return dropCheck({ cwd: kept.cwd, head: kept.head }).then(async (good) => {
    assert.equal(good.ok, true);
    assert.deepEqual(good.files, ["a.txt"]);
    const dropped = conflicted();
    dropped.merge("one\ncrew line\ntwo\n");
    const bad = await dropCheck({ cwd: dropped.cwd, head: dropped.head });
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.missing, [{ path: "a.txt", line: "main line" }]);
    const explained = await dropCheck({
      cwd: dropped.cwd,
      head: dropped.head,
      explained: [{ path: "a.txt", line: "main line", why: "replaced" }],
    });
    assert.equal(explained.ok, true);
    // HEAD that is not a merge of the old head is refused.
    await assert.rejects(
      dropCheck({ cwd: dropped.cwd, head: dropped.baseTip }),
      /first parent/,
    );
  });
});

// ---- the fake GitHub -------------------------------------------------------

const claim = (pr) => ({
  id: 1,
  body: `👻 **Crew**\n<!-- kirocrew-crew v=1 id=c_1 phase=skipped pr=${pr} updated=2026-11-14T00:00:00Z -->`,
});
const handback = { id: 2, body: "Merge conflict in a.txt with main." };

class Fake {
  constructor(head) {
    this.head = head;
    this.writes = [];
    this.armed = [];
    this.issueLabels = [NEEDS];
    this.comments = [claim(12), handback];
    this.body = `${managed()}\n${provenance(["rc-x"])}`;
    this.commits = [{ sha: head, author: { login: "crew-bot" } }];
    this.parents = {};
  }
  available() {
    return true;
  }
  pullRequestClosingIssues() {
    return Promise.resolve([{ repository: REPO, number: 7 }]);
  }
  issue() {
    return Promise.resolve({
      number: 7,
      state: "open",
      body: this.body,
      labels: this.issueLabels.map((name) => ({ name })),
    });
  }
  listIssueComments() {
    return Promise.resolve(structuredClone(this.comments));
  }
  pullRequestCommits() {
    return Promise.resolve(this.commits);
  }
  pullRequest(_c, number) {
    return Promise.resolve({
      number,
      node_id: "PR_" + number,
      title: "Add the thing",
      body: "Closes #7",
      state: "open",
      head: { sha: this.head, ref: "crew" },
      base: { ref: "main" },
      user: { login: "crew-bot" },
    });
  }
  commit(_c, sha) {
    return Promise.resolve({
      sha,
      parents: (this.parents[sha] ?? []).map((p) => ({ sha: p })),
    });
  }
  armAutoMerge(_c, id, method, commit) {
    this.armed.push([id, method, commit?.headline ?? null]);
    return Promise.resolve({});
  }
  createIssueComment(_c, number, body) {
    this.writes.push(["comment", number, body]);
    return Promise.resolve({});
  }
  removeLabel(_c, number, label) {
    this.writes.push(["remove", number, label]);
    return Promise.resolve(null);
  }
  updateIssue() {
    throw Error("the fix never closes or edits a pull request");
  }
  addLabels() {
    throw Error("the fix never adds a label");
  }
}

const policy = (extra = {}) => ({
  mode: "single-repo",
  repositories: {
    [REPO]: {
      coder: "issue-radar",
      baseBranch: "main",
      crewLabels: { claim: "crew: in progress", needsHuman: NEEDS },
      managedLabels: { ready: "go" },
      radar: { conflictLabel: CONFLICT },
      ...extra,
    },
  },
});

function world(t, { head = "a".repeat(40), extra, ship = "auto-merge" } = {}) {
  const { store } = fixture(t),
    github = new Fake(head);
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
    private: true,
  });
  store.mutate("Add a task", (data) => {
    data.tasks.push({
      id: "rc-x",
      title: "x",
      scope: "catalog",
      status: "planned",
      track: "catalog",
      tags: [],
      acceptance: ["x"],
    });
  });
  const options = {
    policy: policy(extra),
    identity: { namespace: NAMESPACE },
    delivery: { ship },
    verify: async () => ({ ok: true, checks: [] }),
  };
  // One read of GitHub by RC5.3's step: the conflicting pull requests now.
  const read = (readAt, pr = 12, at = github.head) =>
    store.setMeta("radarMerge", {
      readAt,
      repositories: {
        [REPO]: {
          ready: [],
          conflicts: pr
            ? [
                {
                  number: pr,
                  url: `https://github.com/${REPO}/pull/${pr}`,
                  head: at,
                  base: "main",
                  author: "crew-bot",
                },
              ]
            : [],
        },
      },
    });
  const bind = () => {
    const [dispatch] = conflictFixDispatches(store);
    bindSession(store, {
      taskId: dispatch.task,
      slot: "slot-f",
      role: FIX_ROLE,
      attempt: 1,
      source: "tick",
    });
    return dispatch;
  };
  const caller = (slot = "slot-f") => ({ sessionKey: "dashboard:" + slot });
  return {
    store,
    github,
    options,
    read,
    bind,
    caller,
    step: () => conflictFixStep(store, github, options),
    report: (input, slot) =>
      reportConflictFix(store, github, options, input, caller(slot)),
  };
}

test("a handed-back conflict starts one resolver chat with the steps", async (t) => {
  const w = world(t);
  w.read("r1");
  for (let i = 0; i < 3; i += 1) await w.step();
  const dispatch = conflictFixDispatches(w.store);
  assert.equal(dispatch.length, 1);
  assert.equal(dispatch[0].agent, FIX_AGENT);
  assert.equal(dispatch[0].role, FIX_ROLE);
  assert.equal(dispatch[0].folder, "Avoozl/code");
  assert.match(dispatch[0].brief, /git merge origin\/main/);
  assert.match(dispatch[0].brief, /never --force/);
  assert.match(dispatch[0].brief, /`npm test`/);
  assert.match(dispatch[0].brief, /HEAD:refs\/heads\/crew/);
  assert.deepEqual(w.github.writes, []);
});

test("a fix pushes one merge commit to the same pull request; squash arms with its title", async (t) => {
  const repo = conflicted(),
    w = world(t, { head: repo.head });
  w.read("r1");
  await w.step();
  w.bind();
  const commit = repo.merge("one\ncrew line\nmain line\ntwo\n");
  const checked = await checkConflictFix(
    w.store,
    { cwd: repo.cwd },
    w.caller(),
  );
  assert.equal(checked.ok, true);
  // The chat pushed: GitHub's head is now the merge commit.
  w.github.head = commit;
  w.github.parents[commit] = [repo.head, repo.baseTip];
  const result = await w.report({
    ok: true,
    commit,
    files: [{ path: "a.txt", how: "kept the crew line and the main line" }],
  });
  assert.equal(result.state, "fixed");
  assert.deepEqual(w.github.armed, [
    ["PR_12", "SQUASH", "Add the thing (#12)"],
  ]);
  assert.deepEqual(
    w.github.writes.map((entry) => entry.slice(0, 3)),
    [
      ["remove", 12, CONFLICT],
      ["remove", 7, CONFLICT],
      ["remove", 7, NEEDS],
      ["comment", 12, w.github.writes[3][2]],
    ],
  );
  assert.match(w.github.writes[3][2], new RegExp(commit));
  assert.match(w.github.writes[3][2], /`a\.txt`: kept the crew line/);
  // Activity, Flow and Trace.
  const rows = w.store.db
    .prepare("SELECT kind, summary FROM activity_log ORDER BY seq")
    .all();
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["conflict.fixed"],
  );
  assert.match(rows[0].summary, /Conflict fixed by Avoozl/);
  assert.equal(
    isFixWork(w.store.read().tasks.find((x) => x.id === "rc-x")),
    true,
  );
  const fixes = conflictFixesOf(w.store, REPO, 12);
  assert.equal(fixes[0].commit, commit);
  const trace = buildTrace({
    issue: { number: 7 },
    pull: { number: 12, created_at: "2026-11-14T00:00:00Z" },
    fixes,
  });
  const keys = trace.steps.map((s) => s.key);
  assert.equal(keys.indexOf("conflictFixed"), keys.indexOf("pr") + 1);
  assert.match(
    trace.steps[keys.indexOf("conflictFixed")].detail,
    /Merge commit/,
  );
  // A second report is refused; later ticks write nothing more.
  await assert.rejects(w.report({ ok: false, reason: "again" }), /already/);
  const count = w.github.writes.length;
  w.read("r2");
  await w.step();
  assert.equal(w.github.writes.length, count);
});

test("merge.method merge arms a merge commit", async (t) => {
  const repo = conflicted(),
    w = world(t, { head: repo.head, extra: { merge: { method: "merge" } } });
  w.read("r1");
  await w.step();
  w.bind();
  const commit = repo.merge("one\ncrew line\nmain line\ntwo\n");
  await checkConflictFix(w.store, { cwd: repo.cwd }, w.caller());
  w.github.head = commit;
  w.github.parents[commit] = [repo.head, repo.baseTip];
  await w.report({ ok: true, commit, files: [{ path: "a.txt", how: "both" }] });
  assert.deepEqual(w.github.armed, [["PR_12", "MERGE", null]]);
});

test("a failed drop check pushes nothing and asks; an unchecked push is not armed", async (t) => {
  const repo = conflicted(),
    w = world(t, { head: repo.head });
  w.read("r1");
  await w.step();
  w.bind();
  const commit = repo.merge("one\ncrew line\ntwo\n");
  const checked = await checkConflictFix(
    w.store,
    { cwd: repo.cwd },
    w.caller(),
  );
  assert.equal(checked.ok, false);
  assert.match(checked.next, /Do not push/);
  // Had it pushed anyway: Avoozl arms nothing and keeps the labels.
  w.github.head = commit;
  w.github.parents[commit] = [repo.head, repo.baseTip];
  const result = await w.report({
    ok: true,
    commit,
    files: [{ path: "a.txt", how: "kept the crew side" }],
  });
  assert.equal(result.state, "unchecked");
  assert.deepEqual(w.github.armed, []);
  assert.deepEqual(w.github.writes, []);
  const [row] = conflictFixNeedsYou(w.store);
  assert.match(row.title, /not checked/);
  assert.deepEqual(row.conflictFix.actions, ["resolve", "dismiss"]);
});

test("a resolver that cannot keep both sides reports, writes nothing, and the row asks", async (t) => {
  const w = world(t);
  w.read("r1");
  await w.step();
  w.bind();
  await w.report({ ok: false, reason: "both sides rewrite the same function" });
  assert.deepEqual(w.github.writes, []);
  assert.deepEqual(w.github.armed, []);
  const rows = conflictFixNeedsYou(w.store);
  assert.equal(rows.length, 1);
  // One row: RC5.3's plain conflict row stands aside.
  assert.equal(
    mergeNeedsYou(w.store).filter((item) => item.pullRequest === 12).length,
    0,
  );
});

test("there is no second attempt on the same conflict", async (t) => {
  const w = world(t);
  w.read("r1");
  await w.step();
  w.bind();
  await w.report({ ok: false, reason: "cannot" });
  for (const at of ["r2", "r3"]) {
    w.read(at);
    await w.step();
  }
  assert.equal(
    w.store.list("receipts").filter((r) => r.kind === "conflict-fix").length,
    1,
  );
  // Dismissed, it stays away; a crew push is a new conflict and gets a chat.
  decideConflictFix(w.store, {
    repository: REPO,
    pullRequest: 12,
    action: "dismiss",
  });
  assert.equal(conflictFixNeedsYou(w.store).length, 0);
  w.read("r4");
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 0);
  w.github.head = "b".repeat(40);
  w.github.commits = [{ sha: w.github.head, author: { login: "crew-bot" } }];
  w.read("r5");
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 1);
});

test("a chat that ends without a report asks once and is not retried", async (t) => {
  const w = world(t);
  w.read("r1");
  await w.step();
  w.bind();
  w.store.put("session_bindings", {
    ...w.store.get("session_bindings", "slot-f"),
    status: "closed",
  });
  w.read("r2");
  await w.step();
  await w.step();
  assert.equal(conflictFixNeedsYou(w.store).length, 1);
  assert.match(conflictFixNeedsYou(w.store)[0].title, /resolver ended/);
  assert.equal(conflictFixDispatches(w.store).length, 0);
});

test("a person's commit after the crew's last push asks and starts nothing", async (t) => {
  const w = world(t);
  w.github.commits.push({
    sha: "c".repeat(40),
    author: { login: "maintainer" },
  });
  w.read("r1");
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 0);
  assert.match(conflictFixNeedsYou(w.store)[0].title, /a person committed/);
  assert.deepEqual(w.github.writes, []);
});

test("pull requests no crew wrote, unmarked issues and failed verifies are untouched", async (t) => {
  const cases = [
    (w) => (w.github.comments = [handback]),
    (w) => (w.github.body = "plain issue"),
    (w) => (w.options.identity = { namespace: "avz_otherotherother1" }),
    (w) => (w.options.verify = async () => ({ ok: false, checks: [] })),
  ];
  for (const change of cases) {
    const w = world(t);
    change(w);
    w.read("r1");
    await w.step();
    assert.equal(conflictFixDispatches(w.store).length, 0);
    assert.equal(conflictFixNeedsYou(w.store).length, 0);
    assert.deepEqual(w.github.writes, []);
  }
});

test("a conflict nobody handed back waits one full read with the same head", async (t) => {
  const w = world(t);
  w.github.issueLabels = [];
  w.github.comments = [claim(12)];
  w.read("r1");
  await w.step();
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 0);
  w.read("r2");
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 1);
});

test("ask starts no chat and opens the row", async (t) => {
  const w = world(t, { extra: { conflicts: { onSourceConflict: "ask" } } });
  w.read("r1");
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 0);
  assert.match(conflictFixNeedsYou(w.store)[0].title, /this repository asks/);
  decideConflictFix(w.store, {
    repository: REPO,
    pullRequest: 12,
    action: "resolve",
  });
  assert.equal(conflictFixNeedsYou(w.store).length, 0);
  assert.throws(
    () =>
      decideConflictFix(w.store, {
        repository: REPO,
        pullRequest: 12,
        action: "resolve",
      }),
    /No source conflict/,
  );
});

test("an open Stop the line pauses the fix", async (t) => {
  const w = world(t);
  w.store.put("flow_stops", {
    id: "stop-1",
    manual: true,
    scope: "all",
    openedAt: new Date().toISOString(),
  });
  w.read("r1");
  await w.step();
  assert.equal(conflictFixDispatches(w.store).length, 0);
  assert.equal(conflictFixNeedsYou(w.store).length, 0);
});

test("only the bound chat may check or report", async (t) => {
  const w = world(t);
  w.read("r1");
  await w.step();
  w.bind();
  await assert.rejects(
    checkConflictFix(w.store, { cwd: "/tmp" }, w.caller("other")),
    /Only a bound conflict fix chat/,
  );
  await assert.rejects(
    w.report({ ok: false, reason: "x" }, "other"),
    /Only a bound conflict fix chat/,
  );
  await assert.rejects(
    checkConflictFix(w.store, { cwd: "/tmp" }, {}),
    /identity/,
  );
});
