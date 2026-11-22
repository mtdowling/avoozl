// Tasks 2.8, 2.9 and 2.10: check each done report's commit with Avoozl's
// own check run, integrate verified commits, release dependents in the same tick,
// and complete parents from children. One test per rule; each lists the nearby
// inputs it checks.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { repositoryConfig } from "../../git/git.ts";
import {
  bind,
  deliveryWorkspace,
  age,
  git,
  leaf,
  workerDone,
} from "../../test/delivery-fixture.ts";
import { loopOn } from "../../test/fixtures.ts";
import { drainCheckRuns } from "../check-runs.ts";
import { retryDelivery } from "../delivery.ts";
import type { Operations } from "../../api/operations.ts";
import type { Store } from "../../store/store.ts";
import { found, storedRow, type TickResult } from "../../test/view-shapes.ts";

// A tick's result with the messages it sent sessions.
type Tick = TickResult & { messages: { slot: string; text: string }[] };
// A task delivery, for the fields these tests read.
interface Delivery {
  id: string;
  state: string;
  into?: string;
  integratedCommit?: string;
  commit?: string;
  cause?: string;
  attempts: unknown[];
  verifications: { cause?: string }[];
  reviewNudges?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}
const deliveryOf = (store: Store, id: string) =>
  storedRow<Delivery>(store, "task_deliveries", id);
const worktreeOf = (store: Store, id: string) =>
  storedRow<{ path: string; branch: string }>(store, "task_worktrees", id);

// The tick starts and lands work only with the server loop on.
loopOn();

const setup = (
  t: TestContext,
  options: Parameters<typeof deliveryWorkspace>[1] = {},
) => deliveryWorkspace(t, { prefix: "avoozl-verify-", ...options });

const tick = (ops: Operations, slots: string[] = []) =>
  ops.execute<Tick>("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });

test("a quiet reviewer is nudged, then failed and retried, so the graph never hangs", async (t) => {
  // Nearby inputs: idle for less than quietMinutes, a tick without a roster,
  // a reviewer the roster does not list, a working reviewer, one nudge per
  // interval, and the retry bound (a decision, not a hang).
  const { store, ops, root } = setup(t, {
    tasks: [leaf("a")],
    repository: { checks: [] },
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: {
        retries: 1,
        quietMinutes: 10,
        nudges: 1,
        reviewers: [
          {
            id: "c",
            focus: "conventions",
            agent: "avoozl-reviewer",
            distinctFrom: "session",
          },
        ],
      },
    }),
  );
  const commit = await workerDone(ops, "a", "w-1");
  await tick(ops);
  await bind(ops, "a", "v-1", "review:c", 1);
  const idle = [
    { target: "w-1", status: "idle" },
    { target: "v-1", status: "idle" },
  ];
  const run = (sessions = idle) =>
    ops.execute<Tick>("workspace.tick", { sessions });
  await run();
  age(store, "v-1", 5);
  assert.deepEqual((await run()).messages, [], "not quiet yet");
  age(store, "v-1", 600);
  assert.deepEqual(
    (await ops.execute<Tick>("workspace.tick", {})).messages,
    [],
    "a tick without the roster sends nothing",
  );
  assert.deepEqual(
    (await run([{ target: "v-1", status: "working" }])).messages,
    [],
    "a working reviewer is left alone",
  );
  await run([{ target: "w-1", status: "idle" }]);
  age(store, "v-1", 600);
  const unseen = await run([{ target: "w-1", status: "idle" }]);
  assert.deepEqual(
    [unseen.messages, unseen.dispatch],
    [[], []],
    "an unobserved reviewer is never treated as quiet",
  );

  await run();
  age(store, "v-1", 600);
  const nudged = await run();
  assert.equal(nudged.messages.length, 1);
  const nudge = found(nudged.messages[0]);
  assert.equal(nudge.slot, "v-1");
  assert.ok(nudge.text.includes(commit));
  assert.deepEqual(nudged.dispatch, [], "a nudge does not replace");
  assert.deepEqual((await run()).messages, [], "one nudge per quiet interval");

  const delivery = deliveryOf(store, "a");
  store.put("task_deliveries", {
    ...delivery,
    reviewNudges: {
      c: {
        ...delivery.reviewNudges?.c,
        at: new Date(Date.now() - 3600_000).toISOString(),
      },
    },
  });
  const retried = await run();
  assert.deepEqual(retried.messages, []);
  assert.deepEqual(
    retried.dispatch.map((d) => [d.role, d.attempt]),
    [["review:c", 2]],
  );
  assert.match(
    String(retried.dispatch[0]?.title),
    /^avoozl:a attempt 2 review c /,
  );
  const failed = deliveryOf(store, "a");
  assert.equal(failed.state, "done", "the worker's commit still waits");
  assert.match(
    failed.verifications.at(-1)?.cause ?? "",
    /review c quiet after 1 nudges/,
  );

  // Past the retry bound: a decision for a person, not a hang.
  await bind(ops, "a", "v-2", "review:c", 2);
  const both = [...idle, { target: "v-2", status: "idle" }];
  await run(both);
  age(store, "v-2", 600);
  await run(both);
  const second = deliveryOf(store, "a");
  store.put("task_deliveries", {
    ...second,
    reviewNudges: {
      c: {
        ...second.reviewNudges?.c,
        at: new Date(Date.now() - 3600_000).toISOString(),
      },
    },
  });
  const decided = await run(both);
  assert.equal(deliveryOf(store, "a").state, "decision");
  assert.deepEqual(decided.dispatch, []);
});

// The worker's done report, then Avoozl's own check run on its commit.
async function verified(ops: Operations, taskId: string) {
  const commit = await workerDone(ops, taskId, `w-${taskId}`);
  await tick(ops);
  await drainCheckRuns(ops.store);
  return commit;
}

test("a verified commit integrates with integrateRun and records the integrated commit", async (t) => {
  // Nearby inputs: the checkout on its base branch (fast-forwarded), a dirty
  // checkout and a repository without checks (both decisions, nothing moved),
  // and a repeated tick (nothing integrated twice).
  const { store, ops, checkout } = setup(t, { tasks: [leaf("a")] });
  const commit = await verified(ops, "a");
  const result = await tick(ops);
  const delivery = deliveryOf(store, "a");
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.into, "main");
  assert.equal(git(checkout, "rev-parse", "main"), delivery.integratedCommit);
  assert.equal(delivery.integratedCommit, commit, "already on main: no rebase");
  const task = found(store.read().tasks.find((x) => x.id === "a"));
  assert.deepEqual(
    [task.integration?.commit, task.integration?.into],
    [commit, "main"],
  );
  assert.notEqual(task.status, "accepted", "integration is not acceptance");
  assert.deepEqual(result.notify, []);
  const quiet = JSON.stringify(store.list("task_deliveries"));
  await tick(ops);
  assert.equal(JSON.stringify(store.list("task_deliveries")), quiet);

  // Kiro Crew writes untracked `.kiro/settings` into a session's project
  // directory; that alone does not hold integration.
  const kiro = setup(t, { tasks: [leaf("k")] });
  await verified(kiro.ops, "k");
  fs.mkdirSync(path.join(kiro.checkout, ".kiro", "settings"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(kiro.checkout, ".kiro/settings/cli.json"), "{}\n");
  await tick(kiro.ops);
  assert.equal(deliveryOf(kiro.store, "k").state, "integrated");

  const dirty = setup(t, { tasks: [leaf("b")] });
  await verified(dirty.ops, "b");
  fs.writeFileSync(path.join(dirty.checkout, "README.md"), "edited\n");
  const before = git(dirty.checkout, "rev-parse", "main"),
    refused = await tick(dirty.ops);
  assert.equal(deliveryOf(dirty.store, "b").state, "decision");
  assert.match(
    deliveryOf(dirty.store, "b").cause ?? "",
    /checkout has changes/,
  );
  assert.equal(refused.notify?.length, 1);
  assert.equal(git(dirty.checkout, "rev-parse", "main"), before);
  assert.deepEqual((await tick(dirty.ops)).notify, [], "decided once");
  const attempts = deliveryOf(dirty.store, "b").attempts.length;
  git(dirty.checkout, "checkout", "--", "README.md");
  const retried = await retryDelivery(
    dirty.store,
    { taskId: "b" },
    { local: true },
  );
  assert.equal(
    retried.delivery.state,
    "verified",
    "an integration retry keeps the approved commit",
  );
  await tick(dirty.ops);
  assert.equal(deliveryOf(dirty.store, "b").state, "integrated");
  assert.equal(
    deliveryOf(dirty.store, "b").attempts.length,
    attempts,
    "integration retry does not spend another writer attempt",
  );

  // An integration retry goes back to a writer when the worktree is gone,
  // or when a person sends it back with a reason.
  for (const [taskId, lose, input] of [
    ["g", true, {}],
    ["r", false, { reason: "Use the new client." }],
  ] as const) {
    const held = setup(t, { tasks: [leaf(taskId)] });
    await verified(held.ops, taskId);
    fs.writeFileSync(path.join(held.checkout, "README.md"), "edited\n");
    await tick(held.ops);
    assert.equal(deliveryOf(held.store, taskId).state, "decision");
    git(held.checkout, "checkout", "--", "README.md");
    if (lose)
      fs.rmSync(worktreeOf(held.store, taskId).path, {
        recursive: true,
        force: true,
      });
    const attempts = deliveryOf(held.store, taskId).attempts.length,
      sent = await retryDelivery(
        held.store,
        { taskId, ...input },
        { local: true },
      );
    assert.equal(sent.delivery.state, "failed", taskId);
    assert.equal(sent.delivery.retryFrom, attempts, taskId);
  }

  // A repository with no checks is judged by its reviewers only, and
  // integration still needs checks to run on the rebased work.
  const unchecked = setup(t, {
    tasks: [leaf("c")],
    repository: { checks: [] },
  });
  await workerDone(unchecked.ops, "c", "w-c");
  await unchecked.ops.execute("workspace.tick", {});
  await tick(unchecked.ops);
  assert.match(
    deliveryOf(unchecked.store, "c").cause ?? "",
    /Configure the repository's checks/,
  );
});

test("an integration branch takes the verified commit and leaves the checkout untouched", async (t) => {
  // Nearby inputs: a branch that does not exist yet (created from the base),
  // the branch checked out in a clean worktree (fast-forwarded there), in a
  // worktree with an edit or an untracked file in the way (decision, nothing
  // touched), and repository configuration naming the base branch or an
  // invalid name.
  const { store, ops, checkout, root } = setup(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c"), leaf("d")],
    repository: { integrationBranch: "avoozl-integration" },
  });
  const main = git(checkout, "rev-parse", "main"),
    commit = await verified(ops, "a");
  await tick(ops);
  assert.equal(deliveryOf(store, "a").state, "integrated");
  assert.equal(git(checkout, "rev-parse", "avoozl-integration"), commit);
  assert.equal(git(checkout, "rev-parse", "main"), main, "main is untouched");
  assert.equal(git(checkout, "branch", "--show-current"), "main");
  assert.equal(
    found(store.read().tasks.find((x) => x.id === "a")).integration?.into,
    "avoozl-integration",
  );

  git(
    checkout,
    "worktree",
    "add",
    path.join(root, "holder"),
    "avoozl-integration",
  );
  await verified(ops, "b");
  assert.ok(
    fs.existsSync(path.join(worktreeOf(store, "b").path, "a-1.txt")),
    "a dependent starts from the integration branch, not the base",
  );
  const holder = fs.realpathSync.native(path.join(root, "holder"));
  // An untracked file elsewhere in the holder is not in the way.
  fs.writeFileSync(path.join(holder, "notes.txt"), "mine\n");
  await tick(ops);
  assert.equal(deliveryOf(store, "b").state, "integrated");
  const landed = git(checkout, "rev-parse", "avoozl-integration");
  assert.equal(git(holder, "rev-parse", "HEAD"), landed, "holder moved");
  assert.ok(fs.existsSync(path.join(holder, "b-1.txt")), "holder has the work");
  assert.equal(
    fs.readFileSync(path.join(holder, "notes.txt"), "utf8"),
    "mine\n",
  );

  // An edit in the holder holds integration with a decision naming it.
  await verified(ops, "c");
  fs.appendFileSync(path.join(holder, "a-1.txt"), "edited\n");
  const notify = (await tick(ops)).notify;
  assert.equal(deliveryOf(store, "c").state, "decision");
  assert.ok(
    String(deliveryOf(store, "c").cause).includes(
      `checked out at ${holder}, which has uncommitted changes (a-1.txt)`,
    ),
  );
  assert.ok(notify?.some((item) => item.task === "c"));
  assert.equal(git(checkout, "rev-parse", "avoozl-integration"), landed);
  assert.match(fs.readFileSync(path.join(holder, "a-1.txt"), "utf8"), /edited/);
  assert.equal(
    storedRow<{ state: string }>(
      store,
      "integration",
      `avoozl:c:${deliveryOf(store, "c").commit}`,
    ).state,
    "ready",
    "still queued",
  );

  // An untracked file where the work writes is in the way too.
  git(holder, "checkout", "--", "a-1.txt");
  await verified(ops, "d");
  fs.writeFileSync(path.join(holder, "d-1.txt"), "mine\n");
  await tick(ops);
  assert.match(
    deliveryOf(store, "d").cause ?? "",
    /untracked files the fast-forward would overwrite \(d-1\.txt\)/,
  );
  assert.equal(git(checkout, "rev-parse", "avoozl-integration"), landed);
  assert.equal(fs.readFileSync(path.join(holder, "d-1.txt"), "utf8"), "mine\n");

  for (const integrationBranch of ["main", "bad..name"])
    await assert.rejects(
      repositoryConfig({ id: "app", root: checkout, integrationBranch }),
      /integration branch/,
      integrationBranch,
    );
  assert.equal(
    (
      await repositoryConfig({
        id: "app",
        root: checkout,
        integrationBranch: "next",
      })
    ).integrationBranch,
    "next",
  );
});

test("integration releases dependents in the same tick and completes parents, never acceptance", async (t) => {
  // Nearby inputs: an unconditioned edge on a work-model leaf (own completion,
  // integrated), the same edge on a row stored before the work model (still
  // waits for acceptance), a package with one child left, an epic over a
  // package, and a tick with nothing new (no write).
  const tasks = [
    leaf("a", { parent: "pkg" }),
    leaf("b", { parent: "pkg" }),
    leaf("old", { kind: "task", parent: undefined }),
    leaf("after-old", { kind: "task" }),
    {
      ...leaf("pkg", { kind: "package", parent: "top" }),
      checks: undefined,
    },
    { ...leaf("top", { kind: "package" }), checks: undefined },
  ];
  const edges = [
    { from: "a", to: "b", kind: "requires" },
    { from: "old", to: "after-old", kind: "requires" },
  ];
  const { store, ops } = setup(t, { tasks, edges });
  store.mutate("Integrate old", (data) => {
    found(data.tasks.find((x) => x.id === "old")).integration = {
      commit: "abc",
    };
  });
  await verified(ops, "a");
  const released = await tick(ops, ["v-a"]);
  assert.equal(deliveryOf(store, "a").state, "integrated");
  const workers = released.dispatch
    .filter((d) => d.role === "worker")
    .map((d) => d.task);
  assert.ok(workers.includes("b"), "b is released in the same tick");
  assert.ok(
    !workers.includes("after-old"),
    "a legacy edge waits for acceptance",
  );
  let data = store.read();
  const byId = (id: string) => found(data.tasks.find((x) => x.id === id));
  assert.equal(byId("pkg").childrenComplete, undefined, "b is not done");

  await verified(ops, "b");
  await tick(ops);
  data = store.read();
  assert.deepEqual(byId("pkg").childrenComplete?.children, ["a", "b"]);
  assert.ok(
    byId("top").childrenComplete,
    "the epic completes from its package",
  );
  for (const id of ["a", "b", "pkg", "top"])
    assert.notEqual(byId(id).status, "accepted", id + " is not accepted");
  const revision = store.read().revision;
  await tick(ops);
  assert.equal(store.read().revision, revision, "nothing new, nothing written");

  await ops.execute("task.accept", {
    id: "a",
    evidence: "Whole head checked.",
  });
  assert.equal(
    found(store.read().tasks.find((x) => x.id === "a")).status,
    "accepted",
    "acceptance is its own action",
  );
});

test("a landed task's worktree and branch go; a held one keeps them", async (t) => {
  const { store, ops, checkout } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  await verified(ops, "a");
  const kept = worktreeOf(store, "a");
  assert.ok(fs.existsSync(kept.path), "kept until it lands");
  await tick(ops);
  assert.equal(deliveryOf(store, "a").state, "integrated");
  assert.equal(fs.existsSync(kept.path), false);
  assert.equal(store.get("task_worktrees", "a"), null);
  assert.equal(git(checkout, "branch", "--list", kept.branch), "");
  assert.ok(
    fs.existsSync(path.join(checkout, "a-1.txt")),
    "work stays on main",
  );

  // A task that has not landed keeps both.
  fs.writeFileSync(path.join(checkout, "README.md"), "edited\n");
  await verified(ops, "b");
  await tick(ops);
  const held = worktreeOf(store, "b");
  assert.equal(deliveryOf(store, "b").state, "decision");
  assert.ok(fs.existsSync(held.path));
  assert.notEqual(git(checkout, "branch", "--list", held.branch), "");
});

test("preparing a task runs the approved scripts/worktree helper", {
  skip: process.platform === "win32" && "the helper is a shell script",
}, async (t) => {
  const { store, ops, checkout } = setup(t, { tasks: [leaf("a")] });
  const helper = path.join(checkout, "scripts", "worktree");
  fs.mkdirSync(path.dirname(helper));
  fs.writeFileSync(
    helper,
    '#!/bin/sh\ntouch "$2.ran"; git worktree add -b "$1" "$2" "$3"\n',
    { mode: 0o755 },
  );
  git(checkout, "add", ".");
  git(
    checkout,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-m",
    "helper",
  );
  const { helperHash } = await import("../../git/git.ts");
  await assert.rejects(
    ops.execute("worktree.prepare", { taskId: "a" }),
    /runs every time a worktree is added/,
  );
  store.put("repositories", {
    ...found(store.list("repositories")[0]),
    worktreeHelper: helperHash(helper),
  });
  const made = await ops.execute<{ path: string }>("worktree.prepare", {
    taskId: "a",
  });
  assert.ok(fs.existsSync(made.path + ".ran"), "the helper made it");
});
