// Proof P45 (design §4.21–§4.25, Requirements 75–80): investigate first,
// the evidence bundle, staying current with the base branch, rules from
// repeated corrections, the fix-work share, and ship mode. Every value is
// fake: a temporary workspace with a real Git checkout, fake workers and a
// fake falsifier that report through Operations, and a fake GitHub that
// answers only the reads it is given; anything else is recorded.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import {
  asksForcePush,
  deliveryPolicy,
  plansRepoSteps,
  rebaseForIntegration,
} from "../delivery.mjs";
import { feedbackStep } from "../github-feedback.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { conflictsView } from "../page-views.mjs";
import { flowView } from "../flow.mjs";
import { decideProposal, recordRetroReply } from "../flow-retro.mjs";
import { evidenceCommentStep } from "../evidence.mjs";
import { deliverRetroRule } from "../intake.mjs";
import { RULES_FILE } from "../corrections.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  ...extra,
});

// A local workspace with a real checkout `app`, leaves a1, a2 (small), a3,
// and a bugfix spec's f1.
function local(t, delivery = {}) {
  const root = temporaryDirectory("avoozl-p45-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      leaf("a1"),
      leaf("a2", { size: "small" }),
      leaf("a3"),
      leaf("f1", { specType: "bugfix" }),
    ],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 4, ...delivery } }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  const bound = [];
  const tick = () =>
    ops.execute("workspace.tick", {
      sessions: bound.map((slot) => ({ target: slot, status: "working" })),
    });
  const bind = async (taskId, slot, extra = {}) => {
    bound.push(slot);
    await ops.execute("session.bind", {
      taskId,
      slot,
      source: "tick",
      title: `avoozl:${taskId} ${extra.role || "worker"}`,
      ...extra,
    });
  };
  const report = (slot, input) =>
    ops.execute("session.report", input, undefined, as(slot));
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops,
    tick,
    bind,
    report,
  };
}

const findings = (confidence = "high") => ({
  read: "src/app.js and its test",
  cause: "the loader skips empty lines",
  plan: "keep empty lines in the loader",
  check: "the loader test with an empty line",
  confidence,
});

test("P45 (1)–(3): findings first, a falsifier, the gate, Needs you, and small tasks skip it", async (t) => {
  const w = local(t);
  let result = await w.tick();
  const byTask = new Map(result.dispatch.map((d) => [d.task, d]));
  // (3) a2 is small: no investigation.
  assert.equal(byTask.get("a2").investigate, undefined);
  assert.doesNotMatch(byTask.get("a2").brief, /Investigate first/);
  for (const id of ["a1", "a3"]) {
    assert.equal(byTask.get(id).investigate, true);
    assert.match(byTask.get(id).brief, /Investigate first/);
    assert.match(byTask.get(id).brief, /"kind": "findings"/);
  }
  for (const id of ["a1", "a2", "a3"])
    await w.bind(id, "w-" + id, {
      attempt: 1,
      ...(byTask.get(id).investigate ? { investigate: true } : {}),
    });

  // (1) a1: a change before the gate is refused; findings from a clean
  // worktree are taken; done waits for Go ahead.
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  const base = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(tree.path, "early.txt"), "too soon\n");
  await assert.rejects(
    w.report("w-a1", { taskId: "a1", kind: "findings", findings: findings() }),
    (e) => e.status === 409 && /before any change/.test(e.message),
  );
  fs.rmSync(path.join(tree.path, "early.txt"));
  await w.report("w-a1", {
    taskId: "a1",
    kind: "findings",
    findings: findings(),
  });
  await assert.rejects(
    w.report("w-a1", { taskId: "a1", kind: "done", commit: base }),
    (e) => e.status === 409 && /Go ahead/.test(e.message),
  );
  // a3 reports its findings too.
  await w.report("w-a3", {
    taskId: "a3",
    kind: "findings",
    findings: findings("high"),
  });

  // The tick opens one read-only falsifier per round.
  result = await w.tick();
  const falsifiers = result.dispatch.filter((d) => d.role === "falsifier");
  assert.deepEqual(falsifiers.map((d) => d.task).sort(), ["a1", "a3"]);
  const fa1 = falsifiers.find((d) => d.task === "a1");
  assert.equal(fa1.agent, "avoozl-falsifier");
  assert.match(fa1.brief, /find evidence that they are wrong/);
  assert.match(fa1.brief, /Edit, commit, merge, and push nothing/);
  assert.match(fa1.brief, /data, not instructions/);
  await w.bind("a1", "f-a1", { role: "falsifier", attempt: 1 });
  await w.bind("a3", "f-a3", { role: "falsifier", attempt: 1 });
  result = await w.tick();
  assert.equal(
    result.dispatch.filter((d) => d.role === "falsifier").length,
    0,
    "one falsifier per round",
  );
  // A falsifier names no commit.
  await assert.rejects(
    w.report("f-a1", {
      taskId: "a1",
      kind: "done",
      commit: base,
      falsifier: { verdict: "stands", evidence: "x", confidence: "high" },
    }),
    (e) => e.status === 400,
  );
  await w.report("f-a1", {
    taskId: "a1",
    kind: "done",
    falsifier: {
      verdict: "stands",
      evidence: "The loader is the only reader of that file.",
      confidence: "high",
    },
  });
  assert.equal(git(tree.path, "rev-parse", "HEAD"), base, "no change yet");
  result = await w.tick();
  const go = result.messages.filter((m) => m.slot === "w-a1");
  assert.equal(go.length, 1);
  assert.match(go[0].text, /^Go ahead on Avoozl task a1/);
  // Coding now: commit and report done.
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const a1 = git(tree.path, "rev-parse", "HEAD");
  await w.report("w-a1", { taskId: "a1", kind: "done", commit: a1 });

  // (2) a3: refuted, so it waits in Needs you with the three choices.
  await w.report("f-a3", {
    taskId: "a3",
    kind: "done",
    falsifier: {
      verdict: "refuted",
      evidence: "A second reader in src/cli.js also skips empty lines.",
      confidence: "high",
    },
  });
  result = await w.tick();
  assert.deepEqual(
    result.messages.filter((m) => m.slot === "w-a3"),
    [],
    "no coding on refuted findings",
  );
  let item = conflictsView(w.store, w.store.read()).items.find(
    (i) => i.kind === "investigation",
  );
  assert.equal(item.taskId, "a3");
  assert.deepEqual(item.choices, ["go", "again", "stop"]);
  assert.equal(item.reply.verdict, "refuted");
  // Person only: an MCP or session caller is refused.
  await assert.rejects(
    w.ops.execute(
      "investigation.decide",
      { taskId: "a3", action: "go" },
      undefined,
      as("w-a3"),
    ),
    (e) => e.status === 403,
  );
  await w.ops.execute("investigation.decide", {
    taskId: "a3",
    action: "again",
  });
  result = await w.tick();
  const again = result.messages.filter((m) => m.slot === "w-a3");
  assert.equal(again.length, 1);
  assert.match(again[0].text, /^Investigate again/);
  assert.match(again[0].text, /src\/cli\.js/);
  await w.report("w-a3", {
    taskId: "a3",
    kind: "findings",
    findings: { ...findings("medium"), cause: "both readers skip them" },
  });
  result = await w.tick();
  const second = result.dispatch.filter((d) => d.role === "falsifier");
  assert.deepEqual(
    second.map((d) => [d.task, d.attempt]),
    [["a3", 2]],
    "one new round",
  );
  await w.bind("a3", "f-a3-2", { role: "falsifier", attempt: 2 });
  await w.report("f-a3-2", {
    taskId: "a3",
    kind: "done",
    falsifier: {
      verdict: "stands",
      evidence: "Both readers are covered.",
      confidence: "high",
    },
  });
  // The worker was only medium sure, under the high bar: Needs you again.
  result = await w.tick();
  assert.deepEqual(
    result.messages.filter((m) => m.slot === "w-a3"),
    [],
  );
  await w.ops.execute("investigation.decide", { taskId: "a3", action: "go" });
  result = await w.tick();
  const goA3 = result.messages.filter((m) => m.slot === "w-a3");
  assert.equal(goA3.length, 1);
  assert.match(goA3[0].text, /^Go ahead on Avoozl task a3/);
  item = conflictsView(w.store, w.store.read()).items.find(
    (i) => i.kind === "investigation",
  );
  assert.equal(item, undefined);

  // (3) a2 codes and reports done with no investigation.
  const a2tree = await w.ops.execute("worktree.prepare", { taskId: "a2" });
  fs.writeFileSync(path.join(a2tree.path, "a2.txt"), "a2\n");
  git(a2tree.path, "add", ".");
  git(a2tree.path, "commit", "-m", "a2");
  await w.report("w-a2", {
    taskId: "a2",
    kind: "done",
    commit: git(a2tree.path, "rev-parse", "HEAD"),
  });

  // Investigation and the falsifier are their own Flow spans.
  const spans = w.store.db
    .prepare("SELECT stage, role FROM flow_spans WHERE task_id='a3'")
    .all()
    .map((r) => `${r.role}:${r.stage}`);
  assert.ok(spans.includes("worker:investigate"), spans.join());
  assert.ok(spans.includes("falsifier:falsify"), spans.join());

  // The evidence bundle has the findings, both replies and the decisions.
  const evidence = await w.ops.execute("task.evidence", { taskId: "a3" });
  const kinds = evidence.entries.map((e) => e.kind);
  assert.deepEqual(
    kinds.filter((k) => k === "findings").length,
    2,
    kinds.join(),
  );
  assert.equal(kinds.filter((k) => k === "falsifier").length, 2);
  assert.equal(kinds.filter((k) => k === "decision").length, 2);
  assert.equal(kinds[0], "decision", "newest first");
});

test("P45 mode off dispatches exactly as before, and a manifest override wins", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  const result = await w.tick();
  for (const d of result.dispatch) {
    assert.equal(d.investigate, undefined);
    assert.doesNotMatch(d.brief, /Investigate first/);
  }
  const on = deliveryPolicy({ delivery: { investigate: { mode: "off" } } });
  const { investigates } = await import("../investigate.mjs");
  assert.equal(investigates(on, leaf("x", { investigate: true })), true);
  assert.equal(investigates(deliveryPolicy({ delivery: {} }), leaf("y")), true);
  assert.equal(
    investigates(
      deliveryPolicy({ delivery: {} }),
      leaf("y", { investigate: false }),
    ),
    false,
  );
  assert.throws(
    () => deliveryPolicy({ delivery: { investigate: { mode: "some" } } }),
    /investigate\.mode/,
  );
});

test("P45 (4): a screenshot lands in the drawer and the comment; a 30 MB file is refused", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  await w.tick();
  await w.bind("a1", "w-a1", { attempt: 1 });
  const shot = path.join(w.root, "shot.png"),
    big = path.join(w.root, "big.mp4");
  fs.writeFileSync(shot, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  fs.writeFileSync(big, Buffer.alloc(30 * 1024 * 1024));
  await assert.rejects(
    w.report("w-a1", {
      taskId: "a1",
      kind: "progress",
      text: "video",
      evidence: [{ kind: "file", path: big }],
    }),
    (e) => e.status === 413 && /20 MB/.test(e.message),
  );
  await assert.rejects(
    w.report("w-a1", {
      taskId: "a1",
      kind: "progress",
      text: "text",
      evidence: [{ kind: "file", path: path.join(w.root, ".avoozl.json") }],
    }),
    (e) => e.status === 400 && /image or video/.test(e.message),
  );
  await w.report("w-a1", {
    taskId: "a1",
    kind: "progress",
    text: "screenshot",
    evidence: [{ kind: "file", path: shot, note: "The page after the fix" }],
  });
  const bundle = await w.ops.execute("task.evidence", { taskId: "a1" });
  const file = bundle.entries.find((e) => e.kind === "file");
  assert.equal(file.text, "The page after the fix");
  assert.equal(file.file.type, "image/png");
  assert.equal(bundle.entries.filter((e) => e.kind === "file").length, 1);
  const read = await w.ops.execute("task.evidence", {
    taskId: "a1",
    file: file.file.name,
  });
  assert.equal(Buffer.from(read.base64, "base64").length, 7);
  // Kept under .avoozl/local, never in a tracked file.
  assert.ok(
    fs.existsSync(
      path.join(w.root, ".avoozl", "local", "evidence", "a1", "bundle.json"),
    ),
  );
  // A secret in an entry is saved redacted.
  await w.report("w-a1", {
    taskId: "a1",
    kind: "progress",
    text: "note",
    evidence: [{ kind: "note", text: "token ghp_" + "a".repeat(36) }],
  });
  const notes = (await w.ops.execute("task.evidence", { taskId: "a1" }))
    .entries;
  assert.equal(notes[0].redacted, true);
  assert.doesNotMatch(JSON.stringify(notes), /ghp_a/);
  // The pull request comment: created once, then updated in place, with
  // the summary and no attachment.
  w.store.put("pr_feedback", {
    id: "a1",
    taskId: "a1",
    repository: "o/app",
    pull: { number: 7, url: "https://github.com/o/app/pull/7" },
  });
  const calls = [];
  const github = {
    listIssueComments: async () => [],
    createIssueComment: async (...args) => (
      calls.push(["create", ...args]),
      { id: 501 }
    ),
    updateIssueComment: async (...args) => (
      calls.push(["update", ...args]),
      {}
    ),
  };
  await evidenceCommentStep(w.store, github);
  await evidenceCommentStep(w.store, github);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["create"],
    "unchanged: no second write",
  );
  assert.match(calls[0][3], /<!-- avoozl:evidence:a1 -->/);
  assert.match(calls[0][3], /image\/png/);
  assert.match(calls[0][3], /The page after the fix/);
  assert.doesNotMatch(calls[0][3], /base64|iVBOR/);
  await w.report("w-a1", {
    taskId: "a1",
    kind: "progress",
    text: "more",
    evidence: [{ kind: "note", text: "Checked on a narrow screen." }],
  });
  await evidenceCommentStep(w.store, github);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["create", "update"],
  );
  assert.equal(calls[1][2], 501);
});

// A fake GitHub for single-repo pull request reads (P34's shape, plus base
// heads, merge state, review decision and closed pull requests).
class FakeGitHub {
  constructor() {
    this.pulls = new Map();
    this.closed = new Map();
    this.writes = [];
    return new Proxy(this, {
      get(target, name) {
        if (typeof name !== "string" || name in target) return target[name];
        return (...args) => {
          target.writes.push([name, args]);
          return Promise.resolve({});
        };
      },
    });
  }
  open(branch, extra = {}) {
    const number = 10 + this.pulls.size + this.closed.size,
      pull = {
        number,
        url: `https://github.com/o/lib/pull/${number}`,
        updatedAt: "2026-11-13T10:00:00Z",
        head: "1".repeat(40),
        base: "main",
        baseHead: "b".repeat(40),
        mergeable: "MERGEABLE",
        mergeState: "CLEAN",
        reviewDecision: null,
        autoMerge: true,
        checks: [
          {
            id: "check:1",
            name: "test",
            status: "COMPLETED",
            conclusion: "SUCCESS",
            url: null,
            runId: 1,
          },
        ],
        reviews: [],
        threads: [],
        comments: [],
        ...extra,
      };
    this.pulls.set(branch, pull);
    return pull;
  }
  touch(pull, change) {
    Object.assign(pull, change, {
      updatedAt: new Date(Date.parse(pull.updatedAt) + 60_000).toISOString(),
    });
  }
  pullRequestHeads(repository, branches) {
    return Promise.resolve(
      Object.fromEntries(
        branches.map((b) => {
          const p = this.pulls.get(b);
          return [b, p ? { ...p } : null];
        }),
      ),
    );
  }
  pullRequestFeedback(repository, numbers) {
    const all = [...this.pulls.values()];
    return Promise.resolve(
      Object.fromEntries(
        numbers.map((n) => [
          n,
          structuredClone(all.find((p) => p.number === n)),
        ]),
      ),
    );
  }
  branchPullRequests(repository, branch) {
    const c = this.closed.get(branch);
    return Promise.resolve(c ? [c] : []);
  }
  permission() {
    return Promise.resolve({ permission: "write" });
  }
}

function single(t, delivery = {}) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    config = {
      version: 1,
      delivery: { concurrency: 4, ...delivery },
      github: {
        mode: "single-repo",
        repositories: {
          "o/lib": {
            baseBranch: "main",
            coder: "worker",
            allowedActors: ["alice"],
          },
        },
      },
    },
    policy = normalizeGitHubPolicy(config.github),
    policyDelivery = deliveryPolicy(config);
  store.put("projects", {
    id: "lib",
    root: temporaryDirectory(),
    baseBranch: "main",
    checks: [],
  });
  store.mutate("Seed", (data) => {
    for (const [id, n] of [
      ["a1", 1],
      ["a3", 3],
    ])
      data.tasks.push({
        ...leaf(id, { repository: "lib", authority: "github", kind: "leaf" }),
        github: {
          repository: "o/lib",
          number: n,
          nodeId: "I_" + n,
          url: `https://github.com/o/lib/issues/${n}`,
        },
      });
  });
  for (const id of ["a1", "a3"]) {
    store.put("github_linked_branches", {
      id,
      taskId: id,
      repository: "o/lib",
      name: "avoozl/" + id,
      baseBranch: "main",
      at: "2026-11-13T09:00:00Z",
    });
    store.put("session_bindings", {
      id: "w-" + id,
      slot: "w-" + id,
      taskId: id,
      role: "worker",
      attempt: 1,
      source: "tick",
      status: "working",
      boundAt: "2026-11-13T09:00:00Z",
    });
  }
  let clock = Date.parse("2026-11-13T11:00:00Z");
  const step = () => {
    clock += 60 * 60_000;
    return feedbackStep(store, github, {
      policy,
      delivery: policyDelivery,
      now: clock,
    });
  };
  return { store, github, step, policy, policyDelivery };
}

test("P45 (5): main moves, the conflicting pull request gets one base-moved message, and nobody force pushes", async (t) => {
  const w = single(t);
  const pull = w.github.open("avoozl/a1");
  w.github.open("avoozl/a3");
  let result = await w.step();
  assert.deepEqual(result.messages, []);
  // The base branch moves; GitHub has not judged mergeability yet.
  w.github.touch(pull, { baseHead: "c".repeat(40), mergeable: "UNKNOWN" });
  result = await w.step();
  assert.deepEqual(result.messages, []);
  w.github.touch(pull, { mergeable: "CONFLICTING", mergeState: "DIRTY" });
  result = await w.step();
  const sent = result.messages.filter((m) => m.slot === "w-a1");
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Base branch main moved/);
  assert.match(sent[0].text, /git merge origin\/main/);
  assert.match(sent[0].text, /never force push/);
  assert.equal(asksForcePush(sent[0].text), false);
  assert.deepEqual(
    result.messages.filter((m) => m.slot === "w-a3"),
    [],
  );
  // The next tick sends nothing more for the same move and conflict.
  result = await w.step();
  assert.deepEqual(result.messages, []);
  // BEHIND (the base requires branches up to date) also asks once.
  const a3 = w.github.pulls.get("avoozl/a3");
  w.github.touch(a3, { baseHead: "c".repeat(40), mergeState: "BEHIND" });
  result = await w.step();
  const behind = result.messages.filter((m) => m.slot === "w-a3");
  assert.equal(behind.length, 1);
  assert.match(behind[0].text, /is behind it/);
  assert.deepEqual(w.github.writes, []);
  // Avoozl refuses to send a brief or message that asks for a force push.
  for (const text of [
    "git push --force origin avoozl/a1",
    "git push --force-with-lease",
    "then push -f",
    "git push origin +HEAD:avoozl/a1",
  ])
    assert.equal(asksForcePush(text), true, text);
  for (const ship of ["auto-merge", "manual"])
    for (const stack of [
      null,
      { branch: "avoozl/b", blocker: "b", at: "d".repeat(40) },
    ])
      assert.equal(
        asksForcePush(
          plansRepoSteps(
            leaf("s"),
            { id: "lib", root: "/r" },
            { ship, stack },
          ).join("\n"),
        ),
        false,
      );
});

test("P45 (5) local: a task branch behind the integration branch is merged forward with a merge commit", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(w.checkout, "other.txt"), "main moved\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-m", "Main moves");
  const moved = await rebaseForIntegration(
    w.store.get("projects", "app"),
    w.store.get("task_worktrees", "a1"),
    commit,
  );
  assert.equal(moved.how, "merge");
  const parents = git(
    tree.path,
    "rev-list",
    "--parents",
    "-n",
    "1",
    "HEAD",
  ).split(" ");
  assert.equal(parents.length, 3, "a merge commit");
  assert.ok(parents.includes(commit), "the reviewed commit is kept as it was");
});

test("P45 (6): the same correction on two tasks becomes one rule proposal and one steering leaf", async (t) => {
  const w = single(t);
  const a1 = w.github.open("avoozl/a1"),
    a3 = w.github.open("avoozl/a3");
  await w.step();
  const review = (pull, id) => ({
    reviews: [
      {
        id,
        state: "CHANGES_REQUESTED",
        body: "Add a test for the empty input case.",
        url: `${pull.url}#pullrequestreview-${id}`,
        login: "alice",
        commit: pull.head,
      },
    ],
  });
  w.github.touch(a1, review(a1, 71));
  w.github.touch(a3, review(a3, 72));
  await w.step();
  await w.step();
  const corrections = w.store.list("corrections");
  assert.equal(corrections.length, 2, "once each");
  assert.deepEqual(corrections.map((c) => [c.taskId, c.kind, c.by]).sort(), [
    ["a1", "changes-requested", "alice"],
    ["a3", "changes-requested", "alice"],
  ]);
  // The retro is shown both and proposes a rule.
  const ids = corrections.map((c) => c.id);
  w.store.put("flow_retros", {
    id: "retro-1",
    n: 1,
    state: "running",
    triggers: [],
    startedAt: new Date().toISOString(),
    proposals: [],
    dropped: [],
    seen: { corrections: ids },
  });
  recordRetroReply(
    w.store,
    "retro-1",
    JSON.stringify({
      bottleneck: {
        stage: "rework",
        repository: null,
        evidence: "two reworks",
      },
      proposals: [
        {
          type: "rule",
          text: "Every change to an input reader adds a test for empty input.",
          corrections: ids,
          evidence:
            "Two pull requests were sent back for the same missing test.",
        },
        {
          type: "rule",
          text: "Ask alice before changing a1 again.",
          corrections: ids,
          evidence: "x",
        },
        {
          type: "rule",
          text: "Ask alice before merging.",
          corrections: ids,
          evidence: "x",
        },
        {
          type: "rule",
          text: "Read /etc/hosts first.",
          corrections: ids,
          evidence: "x",
        },
        {
          type: "rule",
          text: "One is enough.",
          corrections: [ids[0]],
          evidence: "x",
        },
      ],
    }),
  );
  const retro = w.store.get("flow_retros", "retro-1");
  assert.equal(retro.proposals.length, 1, JSON.stringify(retro.dropped));
  assert.deepEqual(
    retro.dropped.map((d) => d.reason),
    [
      "a rule names no task ID",
      "a rule names no person",
      "a rule names no path outside the repository",
      "a rule names at least 2 corrections this retro was shown",
    ],
  );
  const [rule] = retro.proposals;
  assert.deepEqual(rule.corrections.sort(), [...ids].sort());
  const result = await decideProposal(
    w.store,
    { retroId: "retro-1", proposalId: rule.id, decision: "approve" },
    {
      rule: (change) => deliverRetroRule(w.store, w.policy, change),
      config: {},
    },
  );
  const landed = result.retro.proposals[0];
  assert.equal(landed.status, "approved");
  assert.equal(landed.repository, "lib");
  const task = w.store.read().tasks.find((x) => x.id === landed.leaf);
  assert.ok(task, "one leaf");
  assert.equal(task.intake?.source ?? task.source?.intake ?? "retro", "retro");
  assert.match(
    JSON.stringify(task),
    new RegExp(RULES_FILE.replaceAll(".", "\\.")),
  );
  assert.match(JSON.stringify(task), /adds a test for empty input/);
  // Approval is a person's: MCP is refused by policy.
  const { PERSON_ONLY } = await import("../mcp-policy.mjs");
  for (const name of [
    "flow.retro.decide",
    "investigation.decide",
    "delivery.integrate",
  ])
    assert.ok(PERSON_ONLY.has(name), name);
});

test("P45 (7): the fix-work share counts the bugfix spec's task", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  await w.tick();
  for (const id of ["a1", "a2", "f1"])
    await w.bind(id, "w-" + id, { attempt: 1 });
  await w.tick();
  const at = new Date().toISOString();
  w.store.mutate("Finish three", (data) => {
    for (const task of data.tasks)
      if (["a1", "a2", "f1"].includes(task.id))
        task.integration = { at, commit: "e".repeat(40) };
  });
  const view = flowView(w.store, w.store.read());
  assert.deepEqual(view.metrics.fixWork, {
    fixes: 1,
    finished: 3,
    share: 1 / 3,
  });
  assert.equal(view.series.week.at(-1).fixes, 1);
  // The retro payload carries it (R79.3).
  const { retroBrief } = await import("../flow-retro.mjs");
  const brief = retroBrief(w.store, w.store.read(), {
    id: "retro-x",
    triggers: [],
    reverts: [],
  });
  assert.match(brief, /"fixWork": \{\n\s*"fixes": 1,\n\s*"finished": 3/);
});

test("P45 (8): manual ship turns auto-merge off, shows one Ready to merge, and never merges", async (t) => {
  const w = single(t, { ship: "manual" });
  const pull = w.github.open("avoozl/a3", { autoMerge: false });
  let result = await w.step();
  assert.deepEqual(result.messages, [], "no auto-merge request");
  let items = conflictsView(w.store, w.store.read()).items.filter(
    (i) => i.kind === "ready-to-merge",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].link, pull.url);
  assert.equal(
    result.notify.filter((n) => /ready to merge/.test(n.title)).length,
    1,
  );
  result = await w.step();
  assert.equal(result.notify.length, 0, "said once");
  // A writer that turned auto-merge on is asked to turn it off.
  w.github.touch(pull, { autoMerge: true });
  result = await w.step();
  assert.match(result.messages[0].text, /gh pr merge --disable-auto/);
  // Briefs say so.
  const steps = plansRepoSteps(
    leaf("a3"),
    { id: "lib", root: "/r" },
    { ship: "manual" },
  ).join("\n");
  assert.match(steps, /Do not turn on auto-merge/);
  assert.doesNotMatch(steps, /gh pr merge --auto/);
  // Closed without merging: back to the writer, once.
  w.github.pulls.delete("avoozl/a3");
  w.github.closed.set("avoozl/a3", {
    number: pull.number,
    state: "CLOSED",
    merged: false,
  });
  result = await w.step();
  const back = result.messages.filter((m) => m.slot === "w-a3");
  assert.equal(back.length, 1);
  assert.match(back[0].text, /closed without merging/);
  assert.match(back[0].text, new RegExp(`gh pr reopen ${pull.number}`));
  result = await w.step();
  assert.deepEqual(result.messages, []);
  items = conflictsView(w.store, w.store.read()).items.filter(
    (i) => i.kind === "ready-to-merge",
  );
  assert.equal(items.length, 0);
  // Avoozl wrote nothing to GitHub, so it merged nothing.
  assert.deepEqual(w.github.writes, []);
});

test("P45 (8) local: manual ship waits for a person's Integrate", async (t) => {
  const w = local(t, { ship: "manual", investigate: { mode: "off" } });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  w.store.put("task_deliveries", {
    id: "a1",
    taskId: "a1",
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  const { integrateVerified } = await import("../delivery.mjs");
  const policy = deliveryPolicy(
    JSON.parse(fs.readFileSync(path.join(w.root, ".avoozl.json"), "utf8")),
  );
  let result = await integrateVerified(w.store, { policy });
  assert.equal(result.notify.length, 1);
  assert.equal(w.store.get("task_deliveries", "a1").state, "verified");
  const item = conflictsView(w.store, w.store.read()).items.find(
    (i) => i.kind === "ready-to-merge",
  );
  assert.equal(item.integrate, true);
  result = await integrateVerified(w.store, { policy });
  assert.equal(result.notify.length, 0, "asked once");
  await assert.rejects(
    w.ops.execute(
      "delivery.integrate",
      { taskId: "a1" },
      undefined,
      as("w-a1"),
    ),
    (e) => e.status === 403,
  );
  await w.ops.execute("delivery.integrate", { taskId: "a1", commit });
  await integrateVerified(w.store, { policy });
  assert.notEqual(w.store.get("task_deliveries", "a1").state, "verified");
});
