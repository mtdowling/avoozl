// Tasks 12.4, 12.6 and 12.7: stop the line, local checks first, and GitHub
// timing (design §4.11, Requirements 44 and 45).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { linePausedTaskIds, listSpans } from "../flow.mjs";
import { findCulprit, heldByStop, watchLine } from "../flow-line.mjs";
import {
  checkDoneList,
  localPass,
  recordGitHubTiming,
  runLocalChecks,
} from "../flow-checks.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
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
  repository: "app",
  ...extra,
});

// A repository whose one check fails while a file named `broken` exists;
// `flaky` makes the next run fail once.
function setup(t, tasks, edges = []) {
  const root = temporaryDirectory("avoozl-line-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  const counter = path.join(root, "flaky-count");
  fs.writeFileSync(
    path.join(checkout, "check.mjs"),
    `import fs from "node:fs";
const f = ${JSON.stringify(counter)};
if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === "1") { fs.writeFileSync(f, "0"); console.error("flaky failure"); process.exit(1); }
if (fs.existsSync("broken")) { console.error("assertion failed: broken"); process.exit(1); }
`,
  );
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
    checks: [["node", "check.mjs"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1 }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  // Land a commit on main as if Avoozl integrated task `id`.
  const land = (id, file, text = id || file) => {
    if (text === false) fs.rmSync(path.join(checkout, file));
    else fs.writeFileSync(path.join(checkout, file), text + "\n");
    git(checkout, "add", "-A");
    git(checkout, "commit", "-m", "Land " + (id || file));
    const commit = git(checkout, "rev-parse", "HEAD");
    if (id)
      store.mutate("land " + id, (data) => {
        data.tasks.find((x) => x.id === id).integration = {
          commit,
          at: new Date().toISOString(),
        };
      });
    return commit;
  };
  const integrated = (commit) =>
    store.put("integration", {
      id: "i:" + commit,
      taskId: "x",
      projectId: "app",
      state: "integrated",
      integratedCommit: commit,
    });
  return {
    root,
    checkout,
    store,
    ops,
    land,
    integrated,
    counter,
    config: { version: 1 },
  };
}

test("a check that passed on main and fails after a1 lands stops the line on a1", async (t) => {
  const s = setup(
    t,
    [leaf("a1"), leaf("c2"), leaf("d1"), leaf("e1")],
    [
      { from: "a1", to: "d1", kind: "requires" },
      { from: "d1", to: "e1", kind: "requires" },
    ],
  );
  const start = s.land("c2", "c2.txt");
  s.integrated(start);
  assert.deepEqual(
    (await watchLine(s.store, s.config)).notify,
    [],
    "first green from integration, no run",
  );
  const red = s.land("a1", "broken");
  const { notify } = await watchLine(s.store, s.config);
  assert.equal(notify.length, 1);
  assert.match(notify[0].title, /Line stopped: node check\.mjs fails on main/);
  const [stop] = s.store.list("flow_stops");
  assert.equal(stop.culprit, "a1");
  assert.equal(stop.commit, red);
  assert.equal(stop.fixTaskId, "a1.fix-1");
  const fix = s.store.read().tasks.find((x) => x.id === "a1.fix-1");
  assert.match(fix.summary, /revert the culprit commit/);
  assert.match(
    fix.summary,
    /assertion failed: broken/,
    "the output's last lines",
  );
  assert.deepEqual(
    [...linePausedTaskIds(s.store)].sort(),
    ["d1", "e1"],
    "dependents only",
  );
  // The stopped check failing on another task's commit is not judged.
  assert.equal(
    heldByStop(s.store, "app", [{ command: "node check.mjs", exitCode: 1 }]),
    "node check.mjs",
  );
  assert.equal(
    heldByStop(s.store, "app", [{ command: "npm lint", exitCode: 1 }]),
    null,
  );
  // The same head again changes nothing; green on a later head resumes.
  assert.deepEqual((await watchLine(s.store, s.config)).notify, []);
  s.land("a1.fix-1", "broken", false);
  const resumed = await watchLine(s.store, s.config);
  assert.equal(resumed.notify.length, 1, "notified once");
  assert.match(resumed.notify[0].title, /Line green/);
  const closed = s.store.get("flow_stops", stop.id);
  assert.ok(closed.closedAt && closed.timeToFixMs >= 0);
  assert.equal(linePausedTaskIds(s.store).size, 0);
  assert.equal(
    s.store.read().tasks.find((x) => x.id === "a1").integration.commit,
    red,
    "the culprit stays integrated",
  );
});

test("a failure that passes on rerun is flaky, not a stop", async (t) => {
  const s = setup(t, [leaf("a1")]);
  s.integrated(s.land(null, "one.txt"));
  await watchLine(s.store, s.config);
  fs.writeFileSync(s.counter, "1");
  const head = s.land(null, "two.txt");
  assert.deepEqual((await watchLine(s.store, s.config)).notify, []);
  assert.equal(s.store.list("flow_stops").length, 0);
  const [flaky] = s.store
    .list("flow_records")
    .filter((r) => r.kind === "flaky");
  assert.deepEqual([flaky.check, flaky.commit], ["node check.mjs", head]);
});

test("the culprit is bisected among task commits, else unknown with its range", async (t) => {
  const s = setup(t, [leaf("a1"), leaf("a2"), leaf("a3"), leaf("b1")]);
  const green = s.land(null, "base.txt");
  s.land("a1", "a1.txt");
  s.land("a2", "broken");
  const red = s.land("a3", "a3.txt");
  const project = s.store.get("projects", "app"),
    found = await findCulprit(
      s.store,
      project,
      ["node", "check.mjs"],
      green,
      red,
    );
  assert.equal(found.culprit, "a2");
  assert.ok(found.runs > 0 && found.runs <= 8);
  const none = await findCulprit(
    s.store,
    project,
    ["node", "check.mjs"],
    red,
    red,
  );
  assert.equal(none.culprit, null);
  // With an unknown culprit, the dependents scope pauses the repository.
  s.store.put("flow_stops", {
    id: "x",
    projectId: "app",
    check: "node check.mjs",
    culprit: null,
    scope: "dependents",
    openedAt: "2026-11-12T00:00:00Z",
    fixTaskId: "line.fix-1",
  });
  assert.deepEqual([...linePausedTaskIds(s.store)].sort(), [
    "a1",
    "a2",
    "a3",
    "b1",
  ]);
});

test("Run anyway is a person's: confirmed, recorded, and refused to sessions", async (t) => {
  const s = setup(
    t,
    [leaf("a1"), leaf("d1")],
    [{ from: "a1", to: "d1", kind: "requires" }],
  );
  s.store.put("flow_stops", {
    id: "stop-1",
    projectId: "app",
    check: "node check.mjs",
    culprit: "a1",
    scope: "dependents",
    openedAt: "2026-11-12T00:00:00Z",
    fixTaskId: "a1.fix-1",
  });
  await assert.rejects(
    s.ops.execute(
      "flow.runAnyway",
      { stopId: "stop-1", confirm: true },
      undefined,
      { caller: { sessionKey: "dashboard:agent" } },
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    s.ops.execute(
      "flow.runAnyway",
      { stopId: "stop-1", confirm: true },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.ops.execute("flow.runAnyway", { stopId: "stop-1" }),
    /Confirm Run anyway/,
  );
  assert.deepEqual([...linePausedTaskIds(s.store)], ["d1"]);
  const { stop } = await s.ops.execute("flow.runAnyway", {
    stopId: "stop-1",
    confirm: true,
  });
  assert.equal(stop.runAnyway.by, "dashboard");
  assert.equal(linePausedTaskIds(s.store).size, 0);
  const view = await s.ops.execute("flow.view", {});
  assert.equal(
    view.line[0].runAnyway.by,
    "dashboard",
    "the banner stays and says so",
  );
});

test("local checks first: a recorded pass, a done list for one commit, and CI-only failures", async (t) => {
  const s = setup(t, [
    leaf("g1", { route: "github", github: { repository: "o/p", number: 1 } }),
  ]);
  const worktree = path.join(s.root, "wt");
  git(s.checkout, "worktree", "add", "-q", worktree, "-b", "avoozl/g1");
  const head = git(worktree, "rev-parse", "HEAD"),
    project = s.store.get("projects", "app");
  assert.equal(
    (await localPass(project.root, head, ["node check.mjs"])).ok,
    false,
    "no record yet",
  );
  const ran = await runLocalChecks({
    cwd: worktree,
    root: project.root,
    checks: ["node check.mjs"],
  });
  assert.equal(ran.passed, true);
  assert.equal(ran.checks[0].commit, head);
  assert.ok(Number.isInteger(ran.checks[0].durationMs));
  assert.equal(
    (await localPass(project.root, head, ["node check.mjs"])).ok,
    true,
  );
  assert.equal(checkDoneList(ran.checks, ["node check.mjs"]), head);
  assert.throws(
    () => checkDoneList(undefined, ["node check.mjs"]),
    /list checks/,
  );
  assert.throws(
    () =>
      checkDoneList([{ ...ran.checks[0], exitCode: 1 }], ["node check.mjs"]),
    /exited 1/,
  );
  assert.throws(
    () =>
      checkDoneList(
        [
          ran.checks[0],
          { command: "x", exitCode: 0, durationMs: 1, commit: "f".repeat(40) },
        ],
        ["node check.mjs"],
      ),
    /same pushed commit/,
  );
  // The pre-push hook's check reads the record and does not run the checks.
  const other = git(s.checkout, "rev-parse", "main");
  fs.writeFileSync(path.join(worktree, "n.txt"), "n\n");
  git(worktree, "add", ".");
  git(
    worktree,
    "-c",
    "user.name=T",
    "-c",
    "user.email=t@e.x",
    "commit",
    "-qm",
    "n",
  );
  const unrecorded = git(worktree, "rev-parse", "HEAD");
  await assert.rejects(
    s.ops.execute("content.check", {
      taskId: "g1",
      push: true,
      stdin: `refs/heads/avoozl/g1 ${unrecorded} refs/heads/avoozl/g1 ${"0".repeat(40)}\n`,
    }),
    /Local checks first: no recorded local pass/,
  );
  await s.ops.execute("content.check", {
    taskId: "g1",
    push: true,
    stdin: `refs/heads/avoozl/g1 ${head} refs/heads/avoozl/g1 ${other}\n`,
  });
  // CI fails on the commit that passed here: "CI only", with the CI wait.
  const task = s.store.read().tasks.find((x) => x.id === "g1");
  await recordGitHubTiming(s.store, task, {
    headSha: head,
    checks: [
      {
        name: "build",
        state: "failure",
        startedAt: "2026-11-12T10:01:00Z",
        completedAt: "2026-11-12T10:21:00Z",
      },
      {
        name: "lint",
        state: "success",
        startedAt: "2026-11-12T10:00:00Z",
        completedAt: "2026-11-12T10:05:00Z",
      },
    ],
  });
  const [ci] = listSpans(s.store, { taskId: "g1" });
  assert.deepEqual(
    [ci.stage, ci.startedAt, ci.endedAt],
    ["ci-wait", "2026-11-12T10:00:00Z", "2026-11-12T10:21:00Z"],
  );
  const [only] = s.store
    .list("flow_records")
    .filter((r) => r.kind === "ci-only");
  assert.deepEqual([only.commit, only.checks], [head, ["build"]]);
});
