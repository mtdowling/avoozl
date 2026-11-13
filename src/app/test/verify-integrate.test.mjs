// Tasks 2.8, 2.9 and 2.10: verify each done report in its own verifier
// session, integrate verified commits, release dependents in the same tick,
// and complete parents from children. One test per rule; each lists the nearby
// inputs it checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { projectConfig } from "../git.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url)),
  app = path.join(repo, "kirocrew-app");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  checks: ["npm test"],
  repository: "app",
  ...extra,
});

function setup(t, { tasks = [leaf("a")], edges = [], project = {} } = {}) {
  const root = temporaryDirectory("avoozl-verify-"),
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
  store.importSnapshot({ ...snapshot(), tasks, edges });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
    ...project,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 4, retries: 1 } }),
  );
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

async function bind(ops, taskId, slot, role, attempt) {
  await ops.execute("session.bind", {
    taskId,
    slot,
    role,
    attempt,
    source: "tick",
    title: `avoozl:${taskId} ${role}`,
  });
}

// A worker attempt that commits in the task's worktree and reports done.
async function workerDone(ops, taskId, slot, attempt = 1) {
  await bind(ops, taskId, slot, "worker", attempt);
  const { path: worktree } = await ops.execute("worktree.prepare", { taskId });
  fs.writeFileSync(path.join(worktree, `${taskId}-${attempt}.txt`), "work\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", `Work ${taskId} ${attempt}`);
  const commit = git(worktree, "rev-parse", "HEAD");
  await ops.execute(
    "session.report",
    { taskId, kind: "done", commit },
    undefined,
    as(slot),
  );
  return commit;
}

const verdict = (ops, taskId, slot, commit, checks) =>
  ops.execute(
    "session.report",
    { taskId, kind: "done", commit, checks },
    undefined,
    as(slot),
  );

const tick = (ops, slots = []) =>
  ops.execute("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });

const passed = [{ command: "npm test", exitCode: 0 }];

test("the verifier agent ships with tool refs on the server key Kiro Crew registers", () => {
  // Nearby inputs: a bare @avoozl ref, a ref to an unserved tool, write tools.
  const manifest = JSON.parse(
      fs.readFileSync(path.join(app, "app.json"), "utf8"),
    ),
    agent = JSON.parse(
      fs.readFileSync(path.join(app, "agents/avoozl-verifier.json"), "utf8"),
    );
  assert.ok(manifest.agents.includes("agents/avoozl-verifier.json"));
  assert.equal(agent.name, "avoozl-verifier");
  assert.equal(agent.includeMcpJson, false);
  assert.deepEqual(agent.allowedTools, []);
  assert.ok(!agent.tools.includes("fs_write"), "the verifier writes no files");
  const refs = agent.tools.filter((tool) => tool.startsWith("@"));
  assert.deepEqual(refs, ["@avoozl:avoozl/plans_report"]);
  const dir = temporaryDirectory(),
    workspace = path.join(dir, "workspace");
  initializeWorkspace(workspace);
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_|^NUPP_WORKSPACE$/.test(name))
      delete env[name];
  const served = JSON.parse(
    execFileSync(
      "python3",
      [path.join(app, "bin", "avoozl_mcp.py"), "--workspace", workspace],
      {
        cwd: dir,
        encoding: "utf8",
        env,
        input:
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) +
          "\n",
      },
    ).trim(),
  ).result.tools.map((tool) => tool.name);
  for (const ref of refs)
    assert.ok(served.includes(ref.split("/")[1]), ref + " is served");
});

test("a done report opens one verifier; only the matching SHA with passing declared checks is accepted", async (t) => {
  // Nearby inputs: a second tick while the verifier is live, a verifier done
  // without checks, a worker sending checks, a different SHA, a check missing,
  // a check exiting 1, a verifier closed without a verdict, verifier retries
  // past the bound, and a verdict repeated after it was recorded.
  const { store, ops, checkout } = setup(t, { tasks: [leaf("a")] });
  const commit = await workerDone(ops, "a", "w-1");
  const first = await tick(ops);
  assert.equal(store.get("task_deliveries", "a").state, "done");
  const [intent] = first.dispatch.filter((d) => d.role === "verifier");
  // A dashboard session resolves an app agent only by the name its spec
  // declares; the `<app>/<agent>` form leaves the session unable to run.
  const declared = JSON.parse(
    fs.readFileSync(path.join(app, "agents", "avoozl-verifier.json"), "utf8"),
  ).name;
  assert.equal(intent.agent, declared);
  assert.doesNotMatch(intent.agent, /\//);
  assert.equal(intent.attempt, 1);
  assert.match(intent.title, /^avoozl:a verify /);
  assert.ok(intent.brief.includes(commit));
  assert.match(intent.brief, /npm test/);
  assert.match(intent.brief, /--detach/);
  await bind(ops, "a", "v-1", "verifier", 1);
  assert.deepEqual(
    (await tick(ops, ["v-1"])).dispatch,
    [],
    "one verifier per done report",
  );

  await assert.rejects(
    verdict(ops, "a", "v-1", commit, undefined),
    (error) => error.status === 400,
    "a verifier's done lists checks",
  );
  const other = setup(t, { tasks: [leaf("b")] });
  await bind(other.ops, "b", "w-b", "worker", 1);
  await assert.rejects(
    other.ops.execute(
      "session.report",
      {
        taskId: "b",
        kind: "done",
        commit: git(other.checkout, "rev-parse", "HEAD"),
        checks: passed,
      },
      undefined,
      as("w-b"),
    ),
    (error) => error.status === 400,
    "a worker does not report checks",
  );

  // A different SHA: rejected, and the worker retries with the cause.
  const base = git(checkout, "rev-parse", "main");
  await verdict(ops, "a", "v-1", base, passed);
  const rejected = await tick(ops);
  const delivery = store.get("task_deliveries", "a");
  assert.equal(delivery.state, "failed");
  assert.match(delivery.attempts[0].cause, /verifier rejected: verified/);
  const [retry] = rejected.dispatch;
  assert.deepEqual([retry.role, retry.attempt], ["worker", 2]);
  assert.match(retry.brief, /verifier rejected/);

  // Attempt 2: a missing check fails only the checks session (R38.3), so the
  // verifier is retried and no writer attempt is spent.
  const second = await workerDone(ops, "a", "w-2", 2);
  await tick(ops);
  await bind(ops, "a", "v-2", "verifier", 2);
  await verdict(ops, "a", "v-2", second, [
    { command: "npm run lint", exitCode: 0 },
  ]);
  const rerun = await tick(ops);
  assert.equal(store.get("task_deliveries", "a").state, "done");
  assert.equal(store.get("task_deliveries", "a").attempts[1].outcome, "done");
  assert.match(
    store.get("task_deliveries", "a").verifications.at(-1).cause,
    /checks not run: check `npm test` was not run/,
  );
  assert.deepEqual(
    rerun.dispatch.map((d) => [d.role, d.attempt]),
    [["verifier", 3]],
  );
  // Then a failing check: attempt 3 would be past retries 1, so a decision.
  await bind(ops, "a", "v-3", "verifier", 3);
  await verdict(ops, "a", "v-3", second, [
    { command: "npm test", exitCode: 1 },
  ]);
  const decided = await tick(ops);
  assert.equal(store.get("task_deliveries", "a").state, "decision");
  assert.match(
    store.get("task_deliveries", "a").attempts[1].cause,
    /check `npm test` exited 1/,
  );
  assert.equal(decided.notify.length, 1);
  assert.deepEqual(decided.dispatch, []);

  // A failing check, and verifiers that end without a verdict.
  const c = setup(t, { tasks: [leaf("c")] });
  const cCommit = await workerDone(c.ops, "c", "w-c");
  await tick(c.ops);
  await bind(c.ops, "c", "v-c1", "verifier", 1);
  await verdict(c.ops, "c", "v-c1", cCommit, [
    { command: "npm test", exitCode: 1 },
  ]);
  await tick(c.ops);
  assert.match(
    c.store.get("task_deliveries", "c").attempts[0].cause,
    /check `npm test` exited 1/,
  );

  const d = setup(t, { tasks: [leaf("d")] });
  const dCommit = await workerDone(d.ops, "d", "w-d");
  await tick(d.ops);
  await bind(d.ops, "d", "v-d1", "verifier", 1);
  const lost = await d.ops.execute("workspace.tick", {
    sessions: [{ target: "v-d1", status: "closed" }],
  });
  assert.deepEqual(
    lost.dispatch.map((x) => [x.role, x.attempt]),
    [["verifier", 2]],
    "a verifier without a verdict is retried",
  );
  assert.match(lost.dispatch[0].title, /^avoozl:d attempt 2 verify /);
  assert.equal(d.store.get("task_deliveries", "d").state, "done");
  await bind(d.ops, "d", "v-d2", "verifier", 2);
  await d.ops.execute("workspace.tick", {
    sessions: [
      { target: "v-d1", status: "closed" },
      { target: "v-d2", status: "lost" },
    ],
  });
  assert.equal(d.store.get("task_deliveries", "d").state, "decision");
  assert.match(
    d.store.get("task_deliveries", "d").cause,
    /verifier session lost/,
  );
  assert.ok(dCommit);

  // Accepted: matching SHA, every declared check 0.
  const e = setup(t, { tasks: [leaf("e")] });
  const eCommit = await workerDone(e.ops, "e", "w-e");
  await e.ops.execute("workspace.tick", {});
  await bind(e.ops, "e", "v-e1", "verifier", 1);
  await verdict(e.ops, "e", "v-e1", eCommit, passed);
  await e.ops.execute("workspace.tick", {});
  const accepted = e.store.get("task_deliveries", "e");
  assert.equal(accepted.state, "verified", "a page tick does not integrate");
  assert.deepEqual(accepted.verifications.at(-1).outcome, "accepted");
  const recorded = e.store.get("task_deliveries", "e");
  await e.ops.execute("workspace.tick", {});
  assert.deepEqual(
    e.store.get("task_deliveries", "e"),
    recorded,
    "a recorded verdict is not recorded again",
  );
});

function age(store, slot, minutes) {
  const binding = store.get("session_bindings", slot),
    at = new Date(Date.now() - minutes * 60_000).toISOString();
  store.put("session_bindings", { ...binding, boundAt: at, statusAt: at });
}

test("a quiet verifier is nudged, then failed and retried, so the graph never hangs", async (t) => {
  // Nearby inputs: idle for less than quietMinutes, a tick without a roster,
  // a verifier the roster does not list, a working verifier, one nudge per
  // interval, and the retry bound (a decision, not a hang).
  const { store, ops, root } = setup(t, { tasks: [leaf("a")] });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { retries: 1, quietMinutes: 10, nudges: 1 },
    }),
  );
  const commit = await workerDone(ops, "a", "w-1");
  await tick(ops);
  await bind(ops, "a", "v-1", "verifier", 1);
  const idle = [
    { target: "w-1", status: "idle" },
    { target: "v-1", status: "idle" },
  ];
  const run = (sessions = idle) => ops.execute("workspace.tick", { sessions });
  await run();
  age(store, "v-1", 5);
  assert.deepEqual((await run()).messages, [], "not quiet yet");
  age(store, "v-1", 600);
  assert.deepEqual(
    (await ops.execute("workspace.tick", {})).messages,
    [],
    "a tick without the roster sends nothing",
  );
  assert.deepEqual(
    (await run([{ target: "v-1", status: "working" }])).messages,
    [],
    "a working verifier is left alone",
  );
  await run([{ target: "w-1", status: "idle" }]);
  age(store, "v-1", 600);
  const unseen = await run([{ target: "w-1", status: "idle" }]);
  assert.deepEqual(
    [unseen.messages, unseen.dispatch],
    [[], []],
    "an unobserved verifier is never treated as quiet",
  );

  await run();
  age(store, "v-1", 600);
  const nudged = await run();
  assert.equal(nudged.messages.length, 1);
  assert.equal(nudged.messages[0].slot, "v-1");
  assert.ok(nudged.messages[0].text.includes(commit));
  assert.deepEqual(nudged.dispatch, [], "a nudge does not replace");
  assert.deepEqual((await run()).messages, [], "one nudge per quiet interval");

  const delivery = store.get("task_deliveries", "a");
  store.put("task_deliveries", {
    ...delivery,
    verifierNudge: {
      ...delivery.verifierNudge,
      at: new Date(Date.now() - 3600_000).toISOString(),
    },
  });
  const retried = await run();
  assert.deepEqual(retried.messages, []);
  assert.deepEqual(
    retried.dispatch.map((d) => [d.role, d.attempt]),
    [["verifier", 2]],
  );
  assert.match(retried.dispatch[0].title, /^avoozl:a attempt 2 verify /);
  const failed = store.get("task_deliveries", "a");
  assert.equal(failed.state, "done", "the worker's commit still waits");
  assert.match(
    failed.verifications.at(-1).cause,
    /verifier quiet after 1 nudges/,
  );

  // Past the retry bound: a decision for a person, not a hang.
  await bind(ops, "a", "v-2", "verifier", 2);
  const both = [...idle, { target: "v-2", status: "idle" }];
  await run(both);
  age(store, "v-2", 600);
  await run(both);
  const second = store.get("task_deliveries", "a");
  store.put("task_deliveries", {
    ...second,
    verifierNudge: {
      ...second.verifierNudge,
      at: new Date(Date.now() - 3600_000).toISOString(),
    },
  });
  const decided = await run(both);
  assert.equal(store.get("task_deliveries", "a").state, "decision");
  assert.deepEqual(decided.dispatch, []);
});

async function verified(ops, taskId, n = 1) {
  const commit = await workerDone(ops, taskId, `w-${taskId}`);
  await ops.execute("workspace.tick", {});
  await bind(ops, taskId, `v-${taskId}`, "verifier", n);
  await verdict(ops, taskId, `v-${taskId}`, commit, passed);
  return commit;
}

test("a verified commit integrates with integrateRun and records the integrated commit", async (t) => {
  // Nearby inputs: the checkout on its base branch (fast-forwarded), a dirty
  // checkout and a repository without checks (both decisions, nothing moved),
  // and a repeated tick (nothing integrated twice).
  const { store, ops, checkout } = setup(t, { tasks: [leaf("a")] });
  const commit = await verified(ops, "a");
  const result = await tick(ops);
  const delivery = store.get("task_deliveries", "a");
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.into, "main");
  assert.equal(git(checkout, "rev-parse", "main"), delivery.integratedCommit);
  assert.equal(delivery.integratedCommit, commit, "already on main: no rebase");
  const task = store.read().tasks.find((x) => x.id === "a");
  assert.deepEqual(
    [task.integration.commit, task.integration.into],
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
  assert.equal(kiro.store.get("task_deliveries", "k").state, "integrated");

  const dirty = setup(t, { tasks: [leaf("b")] });
  await verified(dirty.ops, "b");
  fs.writeFileSync(path.join(dirty.checkout, "README.md"), "edited\n");
  const before = git(dirty.checkout, "rev-parse", "main"),
    refused = await tick(dirty.ops);
  assert.equal(dirty.store.get("task_deliveries", "b").state, "decision");
  assert.match(
    dirty.store.get("task_deliveries", "b").cause,
    /checkout has changes/,
  );
  assert.equal(refused.notify.length, 1);
  assert.equal(git(dirty.checkout, "rev-parse", "main"), before);
  assert.deepEqual((await tick(dirty.ops)).notify, [], "decided once");

  const unchecked = setup(t, { tasks: [leaf("c")], project: { checks: [] } });
  await verified(unchecked.ops, "c");
  await tick(unchecked.ops);
  assert.match(
    unchecked.store.get("task_deliveries", "c").cause,
    /acceptance commands/,
  );
});

test("an integration branch takes the verified commit and leaves the checkout untouched", async (t) => {
  // Nearby inputs: a branch that does not exist yet (created from the base),
  // the branch checked out in a clean worktree (fast-forwarded there), in a
  // worktree with an edit or an untracked file in the way (decision, nothing
  // touched), and project configuration naming the base branch or an
  // invalid name.
  const { store, ops, checkout, root } = setup(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c"), leaf("d")],
    project: { integrationBranch: "avoozl-integration" },
  });
  const main = git(checkout, "rev-parse", "main"),
    commit = await verified(ops, "a");
  await tick(ops);
  assert.equal(store.get("task_deliveries", "a").state, "integrated");
  assert.equal(git(checkout, "rev-parse", "avoozl-integration"), commit);
  assert.equal(git(checkout, "rev-parse", "main"), main, "main is untouched");
  assert.equal(git(checkout, "branch", "--show-current"), "main");
  assert.equal(
    store.read().tasks.find((x) => x.id === "a").integration.into,
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
    fs.existsSync(path.join(store.get("task_worktrees", "b").path, "a-1.txt")),
    "a dependent starts from the integration branch, not the base",
  );
  const holder = fs.realpathSync.native(path.join(root, "holder"));
  // An untracked file elsewhere in the holder is not in the way.
  fs.writeFileSync(path.join(holder, "notes.txt"), "mine\n");
  await tick(ops);
  assert.equal(store.get("task_deliveries", "b").state, "integrated");
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
  assert.equal(store.get("task_deliveries", "c").state, "decision");
  assert.ok(
    store
      .get("task_deliveries", "c")
      .cause.includes(
        `checked out at ${holder}, which has uncommitted changes (a-1.txt)`,
      ),
  );
  assert.ok(notify.some((item) => item.task === "c"));
  assert.equal(git(checkout, "rev-parse", "avoozl-integration"), landed);
  assert.match(fs.readFileSync(path.join(holder, "a-1.txt"), "utf8"), /edited/);
  assert.equal(
    store.get(
      "integration",
      `avoozl:c:${store.get("task_deliveries", "c").commit}`,
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
    store.get("task_deliveries", "d").cause,
    /untracked files the fast-forward would overwrite \(d-1\.txt\)/,
  );
  assert.equal(git(checkout, "rev-parse", "avoozl-integration"), landed);
  assert.equal(fs.readFileSync(path.join(holder, "d-1.txt"), "utf8"), "mine\n");

  for (const integrationBranch of ["main", "bad..name"])
    await assert.rejects(
      projectConfig({ id: "app", root: checkout, integrationBranch }),
      /integration branch/,
      integrationBranch,
    );
  assert.equal(
    (
      await projectConfig({
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
    data.tasks.find((x) => x.id === "old").integration = { commit: "abc" };
  });
  await verified(ops, "a");
  const released = await tick(ops, ["v-a"]);
  assert.equal(store.get("task_deliveries", "a").state, "integrated");
  const workers = released.dispatch
    .filter((d) => d.role === "worker")
    .map((d) => d.task);
  assert.ok(workers.includes("b"), "b is released in the same tick");
  assert.ok(
    !workers.includes("after-old"),
    "a legacy edge waits for acceptance",
  );
  let data = store.read();
  const byId = (id) => data.tasks.find((x) => x.id === id);
  assert.equal(byId("pkg").childrenComplete, undefined, "b is not done");

  const bCommit = await workerDone(ops, "b", "w-b");
  await tick(ops);
  await bind(ops, "b", "v-b", "verifier", 1);
  await verdict(ops, "b", "v-b", bCommit, passed);
  await tick(ops);
  data = store.read();
  assert.deepEqual(byId("pkg").childrenComplete.children, ["a", "b"]);
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
    store.read().tasks.find((x) => x.id === "a").status,
    "accepted",
    "acceptance is its own action",
  );
});
