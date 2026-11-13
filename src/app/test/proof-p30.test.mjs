// Proof P30 (design §4.11, §8.4; Requirements 43–48): flow with fake workers
// and scripted timings. One workspace, one sample repository with one
// declared check, fake worker and verifier sessions that follow a script on
// a fake clock, a fake check-run feed for one plans-repo leaf, and a fake
// retro model. Each numbered block is the proof's action of that number.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  flowPolicy,
  ingestToolRows,
  linePausedTaskIds,
  listSpans,
  taskTiming,
} from "../flow.mjs";
import { readyCandidates } from "../delivery.mjs";
import { recordGitHubTiming, runLocalChecks } from "../flow-checks.mjs";
import { recordRetroReply, retroStep } from "../flow-retro.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const MIN = 60_000;
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
const CHECK = "node test/check.mjs";

function workspace(t) {
  const root = temporaryDirectory("avoozl-p30-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(path.join(checkout, "test"), { recursive: true });
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  const flaky = path.join(root, "flaky");
  // The one declared check. `broken` fails it anywhere; `breaks-main` fails
  // it only on the branch (a scratch worktree), as a check can that depends
  // on what else is on main; the flaky file fails one run.
  fs.writeFileSync(
    path.join(checkout, "test/check.mjs"),
    `import fs from "node:fs";
import path from "node:path";
const f = ${JSON.stringify(flaky)};
if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === "1") { fs.writeFileSync(f, "0"); console.error("flaky"); process.exit(1); }
if (fs.existsSync("broken")) { console.error("assertion failed: broken"); process.exit(1); }
if (fs.existsSync("breaks-main") && path.basename(process.cwd()).startsWith("avoozl-line-")) { console.error("main is broken by breaks-main"); process.exit(1); }
`,
  );
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const filler = Array.from({ length: 20 }, (_, i) =>
    leaf("f" + (i + 1), { status: "accepted" }),
  );
  const tasks = [
    leaf("e1", { kind: "epic", acceptance: undefined }),
    ...["a1", "a2", "a3", "a4"].map((id) =>
      leaf(id, { parent: "e1", size: "small" }),
    ),
    leaf("b1"),
    leaf("c1"),
    leaf("c2"),
    leaf("d1"),
    leaf("g1", {
      route: "github",
      github: { repository: "example/app", number: 7 },
    }),
    ...filler,
  ];
  const dbPath = path.join(root, "workspace.sqlite"),
    store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks,
    edges: [{ from: "a1", to: "d1", kind: "requires" }],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
    checks: [["node", "test/check.mjs"]],
  });
  const config = {
    version: 1,
    delivery: { concurrency: 3, retries: 2 },
    flow: { batch: { max: 3 } },
  };
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  return {
    root,
    dbPath,
    checkout: fs.realpathSync(checkout),
    store,
    ops: new Operations(store, { workspaceRoot: root }),
    flaky,
    config,
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

test(
  "P30: flow with fake workers and scripted timings",
  { timeout: 300_000 },
  async (t) => {
    const w = workspace(t),
      { store, ops } = w,
      T0 = Date.parse("2026-11-12T09:00:00Z");
    t.mock.timers.enable({ apis: ["Date"], now: T0 });
    const at = (m) => new Date(T0 + m * MIN).toISOString(),
      clockTo = (m) => t.mock.timers.setTime(T0 + m * MIN),
      live = new Set(),
      tick = () =>
        ops.execute("workspace.tick", {
          sessions: [...live].map((target) => ({ target, status: "idle" })),
        }),
      bind = async (taskId, slot, role = "worker", attempt = 1, extra = {}) => {
        await ops.execute("session.bind", {
          taskId,
          slot,
          role,
          attempt,
          source: "tick",
          title: `avoozl:${taskId} ${role}`,
          ...extra,
        });
        live.add(slot);
      },
      report = (slot, input) =>
        ops.execute("session.report", input, undefined, as(slot)),
      commit = async (taskId, file, text = file) => {
        const { path: wt } = await ops.execute("worktree.prepare", { taskId });
        fs.writeFileSync(path.join(wt, file), text + "\n");
        git(wt, "add", ".");
        git(wt, "commit", "-m", `${taskId}: ${file}`);
        return git(wt, "rev-parse", "HEAD");
      },
      verify = async (taskId, slot, sha, exitCode = 0) => {
        await bind(taskId, slot, "verifier", undefined, { commit: sha });
        await report(slot, {
          taskId,
          kind: "done",
          commit: sha,
          checks: [{ command: CHECK, exitCode, durationMs: 1000 }],
        });
      },
      delivery = (id) => store.get("task_deliveries", id),
      receipt = {};

    // (1) c1, a tick-opened worker: 2 edits, npm install, the check, done.
    await bind("c1", "w-c1");
    const c1Binding = store.get("session_bindings", "w-c1"),
      row = (id, m, kind, command) => ({
        role: "tool",
        ts: at(m),
        content: "OUTPUT",
        meta: {
          tool_call_id: id,
          kind,
          input: command ? { command } : { path: "x" },
        },
      });
    ingestToolRows(
      store,
      c1Binding,
      [
        row("1", 1, "edit"),
        row("2", 3, "edit"),
        row("3", 5, "execute", "npm install"),
        row("4", 8, "execute", CHECK),
      ],
      { checks: [CHECK] },
    );
    clockTo(10);
    const c1Sha = await commit("c1", "c1.txt");
    await report("w-c1", { taskId: "c1", kind: "done", commit: c1Sha });
    clockTo(11);
    await tick();
    await verify("c1", "v-c1", c1Sha);
    clockTo(13);
    await tick();
    const c1Spans = listSpans(store, { taskId: "c1" }).filter(
      (s) => s.role === "worker",
    );
    assert.deepEqual([...new Set(c1Spans.map((s) => s.stage))].sort(), [
      "coding",
      "commands",
      "tests",
    ]);
    assert.ok(c1Spans.every((s) => s.source === "tool-calls"));
    assert.equal(
      c1Spans.find((s) => s.stage === "tests").detail,
      CHECK,
      "the check counts as tests",
    );
    assert.doesNotMatch(
      JSON.stringify(store.db.prepare("SELECT * FROM flow_spans").all()),
      /OUTPUT/,
      "no output stored",
    );
    // By hand from the script: worker 0–10 (coding 0–5, commands 5–8, tests
    // 8–10), verifier session 11–11, merge from the verdict to integration.
    const c1 = taskTiming(
      store,
      store.read().tasks.find((x) => x.id === "c1"),
    );
    assert.equal(
      store.read().tasks.find((x) => x.id === "c1").integration?.at,
      at(13),
      "integrated at 13",
    );
    assert.deepEqual(
      [c1.stages.coding, c1.stages.commands, c1.stages.tests],
      [5 * MIN, 3 * MIN, 2 * MIN],
    );
    assert.equal(c1.stages.merge, 2 * MIN);
    assert.equal(c1.leadMs, 13 * MIN);
    assert.equal(c1.activeMs, 12 * MIN);
    assert.equal(c1.firstPass, true);
    receipt.c1 = {
      stages: c1.stages,
      leadMs: c1.leadMs,
      flowEfficiency: c1.activeMs / c1.leadMs,
    };

    // (2) b1, a Crew Mode worker: phase markers only, so its bar is coarse.
    await bind("b1", "w-b1");
    store.put("session_bindings", {
      ...store.get("session_bindings", "w-b1"),
      source: "conductor",
      conductor: "cli",
    });
    clockTo(15);
    await report("w-b1", {
      taskId: "b1",
      kind: "progress",
      phase: "tests",
      text: "testing",
    });
    clockTo(18);
    const b1Sha = await commit("b1", "b1.txt");
    await report("w-b1", { taskId: "b1", kind: "done", commit: b1Sha });
    const b1Spans = listSpans(store, { taskId: "b1" }).filter(
      (s) => s.role === "worker",
    );
    assert.deepEqual(
      b1Spans.map((s) => [s.stage, s.source]),
      [
        ["coding", "events"],
        ["tests", "markers"],
      ],
    );
    assert.equal(
      taskTiming(
        store,
        store.read().tasks.find((x) => x.id === "b1"),
      ).coarse,
      true,
    );
    await tick();
    await verify("b1", "v-b1", b1Sha);
    clockTo(20);
    await tick();
    assert.ok(
      store.read().tasks.find((x) => x.id === "b1").integration,
      "b1 integrated; main is green from here",
    );

    // (3) a1–a4 ready, flow.batch.max 3: one batch by epic, a4 waits.
    clockTo(21);
    const third = await tick(),
      batch = third.dispatch.find((d) => d.batch);
    assert.deepEqual(batch.batch.tasks, ["a1", "a2", "a3"]);
    assert.ok(!third.dispatch.some((d) => d.task === "a4"), "a4 waits");
    await bind("a1", "w-batch", "worker", 1, { batch: batch.batch });
    const shas = [];
    for (const id of ["a1", "a2", "a3"]) {
      // (4) a2's commit breaks the check on the batch head.
      shas.push(await commit("a1", id === "a2" ? "broken" : id + ".txt"));
      await report("w-batch", {
        taskId: id,
        kind: "done",
        commit: shas.at(-1),
      });
    }
    clockTo(30);
    const verifyBatch = await tick();
    assert.deepEqual(
      verifyBatch.dispatch
        .filter((d) => d.role === "verifier")
        .map((d) => d.task),
      ["a3"],
      "checks once, on the head",
    );
    await verify("a3", "v-batch", shas[2], 1);
    clockTo(31);
    await tick();
    for (const id of ["a1", "a2", "a3"]) {
      assert.equal(delivery(id).batchSplit, true, id);
      assert.equal(
        delivery(id).attempts.filter((a) => a.outcome === "failed").length,
        0,
        `${id}: the split costs no attempt`,
      );
    }
    receipt.batch = { tasks: batch.batch.tasks, head: "a3", split: true };

    // (5) a1 alone again; its commit breaks the check on main once landed.
    const retry = (await tick()).dispatch
      .filter((d) => d.role === "worker")
      .map((d) => d.task);
    assert.ok(retry.includes("a1") && !retry.includes("d1"));
    await bind("a1", "w-a1-2", "worker", 2);
    await bind("c2", "w-c2");
    clockTo(40);
    const a1Sha = await commit("a1", "breaks-main");
    await report("w-a1-2", { taskId: "a1", kind: "done", commit: a1Sha });
    await tick();
    await verify("a1", "v-a1-2", a1Sha);
    clockTo(45);
    const stopTick = await tick();
    const [stop] = store.list("flow_stops");
    assert.ok(stop, "the line stopped");
    assert.equal(stop.culprit, "a1");
    assert.equal(stop.check, CHECK);
    assert.equal(stop.branch, "main");
    assert.ok(
      !stopTick.dispatch.some((d) => d.task === "d1"),
      "d1 is not dispatched",
    );
    assert.equal(
      store.get("session_bindings", "w-c2").status,
      "idle",
      "c2 keeps running",
    );
    const banner = (await ops.execute("flow.view", {})).line[0];
    assert.equal(banner.fixTaskId, "a1.fix-1");
    assert.ok(banner.paused >= 1);
    assert.equal(banner.needsYou, false, "Needs you stays empty");
    // c2's result for the stopped check is not judged and costs no attempt.
    const c2Sha = await commit("c2", "c2.txt");
    await report("w-c2", { taskId: "c2", kind: "done", commit: c2Sha });
    await tick();
    await verify("c2", "v-c2", c2Sha, 1);
    await tick();
    assert.equal(delivery("c2").verifications.at(-1).outcome, "held");
    assert.equal(
      delivery("c2").attempts.filter((a) => a.outcome === "failed").length,
      0,
    );
    // The fix task is first in line.
    const fixFirst = (await tick()).dispatch
      .filter((d) => d.role === "worker")
      .map((d) => d.task);
    assert.equal(fixFirst[0], "a1.fix-1");
    receipt.stop = {
      culprit: stop.culprit,
      check: stop.check,
      branch: stop.branch,
      fixTask: banner.fixTaskId,
      paused: banner.paused,
    };

    // (7) the fix task reverts the break; green on main resumes d1.
    await bind("a1.fix-1", "w-fix");
    clockTo(60);
    const { path: fixWt } = await ops.execute("worktree.prepare", {
      taskId: "a1.fix-1",
    });
    fs.rmSync(path.join(fixWt, "breaks-main"));
    git(fixWt, "commit", "-qam", "Revert breaks-main");
    const fixSha = git(fixWt, "rev-parse", "HEAD");
    await report("w-fix", { taskId: "a1.fix-1", kind: "done", commit: fixSha });
    await tick();
    await verify("a1.fix-1", "v-fix", fixSha);
    clockTo(62);
    const green = await tick();
    const closed = store.get("flow_stops", stop.id);
    assert.ok(closed.closedAt, "the stop closed");
    assert.equal(
      closed.timeToFixMs,
      17 * MIN,
      "line stopped at 45, green at 62",
    );
    assert.equal(
      green.notify.filter((n) => /Line green/.test(n.title)).length,
      1,
      "notified once",
    );
    // d1 is ready again and waits only for a free slot (concurrency 3).
    assert.equal(linePausedTaskIds(store).has("d1"), false, "d1 resumes");
    assert.ok(readyCandidates(store).some((x) => x.id === "d1"));
    // (6) a one-time failure on a later commit is flaky, not a stop.
    fs.writeFileSync(w.flaky, "1");
    fs.writeFileSync(path.join(w.checkout, "NOTES.md"), "notes\n");
    git(w.checkout, "add", "NOTES.md");
    git(w.checkout, "commit", "-qm", "A person's commit on main");
    await tick();
    assert.equal(
      store.list("flow_records").filter((r) => r.kind === "flaky").length,
      1,
      "the flaky run is recorded",
    );
    assert.equal(
      store.list("flow_stops").filter((s) => !s.closedAt).length,
      0,
      "no stop",
    );
    assert.ok(
      store.read().tasks.find((x) => x.id === "a1").integration,
      "a1 stays integrated",
    );
    receipt.timeToFixMs = closed.timeToFixMs;

    // (8) a second stop: Run anyway as the owner, then from an agent.
    store.put("flow_stops", {
      id: "stop-2",
      projectId: "app",
      check: CHECK,
      branch: "main",
      culprit: "c2",
      commit: null,
      range: { from: null, to: fixSha },
      scope: "repo",
      openedAt: at(63),
      closedAt: null,
      fixTaskId: null,
      runAnyway: null,
    });
    await assert.rejects(
      ops.execute(
        "flow.runAnyway",
        { stopId: "stop-2", confirm: true },
        undefined,
        as("agent"),
      ),
      (e) => e.status === 403,
    );
    await ops.execute("flow.runAnyway", { stopId: "stop-2", confirm: true });
    const shown = (await ops.execute("flow.view", {})).line.find(
      (s) => s.id === "stop-2",
    );
    assert.equal(shown.runAnyway.by, "dashboard");
    assert.equal(shown.paused, 0, "dispatch resumes; the stop still shows");
    store.put("flow_stops", {
      ...store.get("flow_stops", "stop-2"),
      closedAt: at(64),
      timeToFixMs: MIN,
    });

    // (9) g1 pushes: refused without a local pass, then CI fails a passing commit.
    await bind("g1", "w-g1");
    const gWt = path.join(w.root, "g1-wt");
    git(w.checkout, "worktree", "add", "-q", gWt, "-b", "avoozl/g1");
    fs.writeFileSync(path.join(gWt, "g1.txt"), "g1\n");
    git(gWt, "add", ".");
    git(gWt, "commit", "-qm", "g1");
    const gSha = git(gWt, "rev-parse", "HEAD"),
      push = `refs/heads/avoozl/g1 ${gSha} refs/heads/avoozl/g1 ${"0".repeat(40)}\n`;
    await assert.rejects(
      ops.execute("content.check", { taskId: "g1", push: true, stdin: push }),
      /no recorded local pass/,
    );
    await assert.rejects(
      report("w-g1", { taskId: "g1", kind: "done", commit: gSha }),
      /Local checks first/,
    );
    const local = await runLocalChecks({
      cwd: gWt,
      root: w.checkout,
      checks: [CHECK],
    });
    await ops.execute("content.check", {
      taskId: "g1",
      push: true,
      stdin: push,
    });
    // A check list for another commit is not a local pass of this one.
    await assert.rejects(
      report("w-g1", {
        taskId: "g1",
        kind: "done",
        commit: git(gWt, "rev-parse", "HEAD~1"),
        checks: local.checks,
      }),
      /Local checks first: the check list is for/,
    );
    await report("w-g1", {
      taskId: "g1",
      kind: "done",
      commit: gSha,
      checks: local.checks,
    });
    await recordGitHubTiming(
      store,
      store.read().tasks.find((x) => x.id === "g1"),
      {
        headSha: gSha,
        checks: [
          {
            name: "build",
            state: "failure",
            startedAt: at(70),
            completedAt: at(85),
          },
        ],
      },
    );
    assert.equal(
      store.list("flow_records").filter((r) => r.kind === "ci-only").length,
      1,
    );
    assert.ok(
      listSpans(store, { taskId: "g1" }).some(
        (s) =>
          s.stage === "ci-wait" &&
          s.startedAt === at(70) &&
          s.endedAt === at(85),
      ),
    );

    // (10) ten more finished tasks start a retro; the fake model proposes.
    const finishFillers = (ids, startMinute) => {
      let m = startMinute;
      for (const id of ids) {
        store.db
          .prepare("INSERT INTO flow_spans VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(
            "fq" + id,
            id,
            1,
            null,
            null,
            "queued",
            at(m),
            at(m + 10),
            "events",
            null,
          );
        store.db
          .prepare("INSERT INTO flow_spans VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(
            "fc" + id,
            id,
            1,
            null,
            "worker",
            "coding",
            at(m + 10),
            at(m + 40),
            "events",
            null,
          );
        store.mutate("finish " + id, (data) => {
          data.tasks.find((x) => x.id === id).integration = {
            commit: "x",
            at: at(m + 40),
          };
        });
        m += 40;
      }
      return m;
    };
    let minute = finishFillers(
      ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10"],
      100,
    );
    clockTo(minute + 120);
    const retro = retroStep(store, w.config, { folder: "Avoozl/app" });
    assert.equal(retro.dispatch[0].agent, "avoozl-retro");
    const reply = recordRetroReply(
      store,
      retro.retro,
      JSON.stringify({
        bottleneck: {
          stage: "queued",
          repository: "app",
          evidence: "queued is a quarter of lead time; median 10 min",
        },
        proposals: [
          {
            type: "settings",
            file: "workspace",
            key: "flow.batch.max",
            from: 3,
            to: 5,
            metric: "lead time",
            direction: "down",
            evidence: "most tasks were small in one epic",
          },
          {
            type: "settings",
            file: "workspace",
            key: "contentRules.sets",
            from: [],
            to: [],
            metric: "lead time",
            direction: "down",
            evidence: "rules slow briefs",
          },
        ],
      }),
    ).retro;
    assert.equal(reply.bottleneck.stage, "queued");
    assert.match(reply.bottleneck.evidence, /\d/, "with numbers");
    assert.match(reply.dropped[0].reason, /guards safety/);
    const before = fs.readFileSync(path.join(w.root, ".avoozl.json"), "utf8"),
      { hash } = await ops.execute("flow.settings.get", {});
    await ops.execute("flow.retro.decide", {
      retroId: reply.id,
      proposalId: "p1",
      decision: "approve",
      expectedHash: hash,
    });
    const after = JSON.parse(
      fs.readFileSync(path.join(w.root, ".avoozl.json"), "utf8"),
    );
    assert.equal(after.flow.batch.max, 5);
    assert.deepEqual(
      { ...after, flow: undefined, $schema: undefined },
      { ...JSON.parse(before), flow: undefined, $schema: undefined },
      "nothing else changes",
    );
    w.config.flow.batch.max = 5;

    // (11) ten more with lead time unchanged: PDCA says it did not help, and
    // the next retro carries the revert.
    minute = finishFillers(
      ["f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20"],
      minute,
    );
    clockTo(minute + 120);
    const next = retroStep(store, w.config, { folder: "Avoozl/app" });
    const approved = store.get("flow_retros", reply.id).proposals[0];
    assert.equal(approved.pdca.result, "no change");
    const revert = recordRetroReply(
      store,
      next.retro,
      JSON.stringify({
        bottleneck: { stage: "queued", evidence: "same 25%" },
        proposals: [],
      }),
    ).retro;
    assert.deepEqual(
      revert.proposals.map((p) => [p.key, p.from, p.to]),
      [["flow.batch.max", 5, 3]],
    );

    // (12) a backend restart with a span open: it closes at its next ending
    // event, not at the restart.
    await bind("c2", "w-c2-q", "worker", 2);
    clockTo(minute + 130);
    await report("w-c2-q", { taskId: "c2", kind: "question", text: "Which?" });
    clockTo(minute + 140);
    const reopened = new Store(w.dbPath);
    t.after(() => reopened.close());
    const again = new Operations(reopened, { workspaceRoot: w.root });
    clockTo(minute + 150);
    await again.execute(
      "session.report",
      { taskId: "c2", kind: "progress", text: "answered" },
      undefined,
      as("w-c2-q"),
    );
    const waited = listSpans(reopened, { taskId: "c2" }).find(
      (s) => s.stage === "waiting",
    );
    assert.equal(waited.endedAt, at(minute + 150));

    // (13) the retro instructions in the repository's .avoozl.json.
    assert.throws(
      () =>
        flowPolicy({
          projects: {
            app: { root: ".", flow: { retro: { instructions: "x" } } },
          },
        }),
      /projects\.app\.flow\.retro\.instructions/,
    );
    await assert.rejects(
      ops.execute("flow.settings.update", {
        flow: { retro: { instructions: "x" } },
        expectedHash: (await ops.execute("flow.settings.get", {})).hash,
      }),
      /retro\.instructions is saved on this machine only/,
    );

    // The Flow tab's numbers for this script.
    const view = await ops.execute("flow.view", { window: 50 });
    // By hand: two stops closed, 17 min and 1 min, median 9 min. Finished:
    // c1, b1, a1, a1.fix-1 and f1–f20; only a1 reworked, so 23 of 24 pass
    // first time; 20 of the 24 lead times are 40 min, so the median is 40.
    assert.equal(view.metrics.timeToFixMs, 9 * MIN);
    assert.equal(view.metrics.tasks, 24);
    assert.equal(view.metrics.firstPassRate, 23 / 24);
    assert.equal(view.metrics.leadTimeMs, 40 * MIN);
    assert.ok(
      view.metrics.flowEfficiency > 0 && view.metrics.flowEfficiency < 1,
    );
    receipt.view = { metrics: view.metrics, bottleneck: view.bottleneck };
    if (process.env.P30_RECEIPT)
      fs.writeFileSync(
        process.env.P30_RECEIPT,
        JSON.stringify(receipt, null, 2),
      );
  },
);
