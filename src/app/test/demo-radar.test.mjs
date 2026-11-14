// Demo data for the Radar-based screens (the demo's sample, src/app/demo-radar.mjs):
// an epic with release state, crew claims on several machines, a handback
// in Waiting on you, a drafted review, a release queue with a held reason,
// recent merges, a Stop the line example, a driver session link and a
// Mirror sample. Nothing writes to GitHub and no worker rows exist.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  GITHUB_WRITE_METHODS,
  demoGitHub,
  demoOperations,
  installDemo,
} from "../demo.mjs";
import { demoFixtures } from "../demo-radar.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

let shared = null;
async function sample() {
  shared ||= (await installDemo(path.join(temporaryDirectory(), "demo"))).root;
  return shared;
}
async function withDemo(fn) {
  const demo = demoOperations(await sample());
  try {
    return await fn(demo);
  } finally {
    demo.close();
  }
}

test("crew claims show on several machines through the real radar.crews read", async () => {
  await withDemo(async (demo) => {
    const view = await demo.execute("radar.crews", { refresh: true });
    assert.ok(view.rows.length >= 3);
    assert.ok(new Set(view.rows.map((row) => row.crewName)).size >= 3);
    assert.ok(view.rows.every((row) => !row.stale));
    const fixtures = await demoFixtures(demo);
    assert.ok(new Set(fixtures.crews.map((crew) => crew.machine)).size >= 3);
    // Every fixture claim is a live claim the read above also found.
    for (const crew of fixtures.crews.filter((entry) => entry.issue))
      assert.ok(
        view.rows.some((row) => row.number === crew.issue),
        `claim on #${crew.issue}`,
      );
  });
});

test("the release queue shows released, claimed, next-or-held rows and a held reason", async () => {
  await withDemo(async (demo) => {
    const queue = await demo.execute("radar.releasequeue", {}),
      rows = queue.repositories.flatMap((entry) => entry.rows),
      states = new Set(rows.map((row) => row.state));
    for (const state of ["released", "claimed", "held"])
      assert.ok(states.has(state), state);
    assert.ok(
      rows.filter((row) => row.state === "held").every((row) => row.reason),
    );
    assert.ok(rows.some((row) => /Waiting on/.test(row.reason)));
  });
});

test("a Radar handback waits on you, with the crew's question", async () => {
  await withDemo(async (demo) => {
    const conflicts = await demo.execute("conflicts.view", {}),
      hold = conflicts.items.find((item) =>
        /crew: needs human/.test(item.detail || ""),
      );
    assert.ok(hold, "a needs-human crew item in Needs you");
    const fixtures = await demoFixtures(demo),
      handback = fixtures.waitingOnYou.find((item) => item.kind === "handback");
    assert.equal(handback.taskId, hold.taskId);
    assert.ok(handback.question && handback.crew && handback.machine);
    assert.ok(
      fixtures.waitingOnYou.some((item) => item.kind === "review-draft"),
    );
  });
});

test("the epic reads epic, plan, phase with a gate, release count and held reason", async () => {
  await withDemo(async (demo) => {
    const { epics } = await demoFixtures(demo);
    assert.equal(epics.length, 1);
    assert.equal(epics[0].id, "recipe-box");
    assert.deepEqual(
      epics[0].plans.map((plan) => plan.id),
      ["recipe-import", "meal-planner", "shopping-list"],
    );
    const phases = epics[0].plans.flatMap((plan) => plan.phases);
    assert.ok(phases.length >= 5);
    for (const phase of phases) {
      assert.ok(["passed", "open", "closed"].includes(phase.gate));
      assert.ok(phase.released <= phase.total && phase.merged <= phase.total);
    }
    assert.ok(phases.some((phase) => phase.gate === "passed"));
    assert.ok(phases.some((phase) => phase.gate === "open"));
    assert.ok(phases.some((phase) => phase.held));
  });
});

test("a drafted review, recent merges, a trace, a driver session and a mirror are present", async () => {
  await withDemo(async (demo) => {
    const f = await demoFixtures(demo);
    assert.equal(f.reviewDraft.state, "ready-to-post");
    assert.ok(f.reviewDraft.findings.length >= 2);
    assert.ok(f.recentMerges.length >= 2);
    // The side panel's recent list reads Flow's finish time for the same two.
    const flow = await demo.execute("flow.view", {});
    assert.ok(flow.tasks.filter((task) => task.finishedAt).length >= 2);
    assert.ok(f.recentMerges.every((merge) => merge.mergedAt && merge.url));
    assert.ok(f.traces.length >= 2);
    assert.ok(
      f.traces.some((trace) => trace.steps.some((s) => s.state === "now")),
    );
    assert.equal(f.driverSession.state, "running");
    assert.match(f.driverSession.link, /^\/chat\?sid=/);
    assert.ok(f.driverSession.turnsToday < f.driverSession.turnLimit);
    assert.equal(f.mirror.sample, true);
    assert.ok(f.mirror.items.length >= 3);
    assert.ok(f.mirror.items.some((item) => item.state === "to_forward"));
    assert.equal(f.stopLine.example, "running");
    assert.equal(f.stopLine.stopped.state, "stopped");
    assert.ok(f.stopLine.stopped.reason);
  });
});

test("the stopped example holds the release queue the same way a real stop does", async () => {
  await withDemo(async (demo) => {
    const { stopLine } = await demoFixtures(demo);
    assert.equal(stopLine.running.state, "running");
    assert.match(stopLine.stopped.say, /nothing is deleted/i);
  });
});

test("local workers are retired: no worker rows, no running delivery", async () => {
  await withDemo(async (demo) => {
    assert.deepEqual(demo.store.list("session_bindings"), []);
    const deliveries = demo.store.list("task_deliveries");
    assert.ok(deliveries.every((entry) => entry.state !== "running"));
    const f = await demoFixtures(demo);
    assert.equal("workers" in f, false);
    assert.ok(f.crews.every((crew) => crew.kind === "radar-crew"));
    assert.doesNotMatch(JSON.stringify(f), /osiris|glorp/i);
  });
});

test("reading every new screen's data writes nothing to GitHub", async () => {
  await withDemo(async (demo) => {
    await demo.execute("radar.crews", { refresh: true });
    await demo.execute("radar.releasequeue", {});
    await demo.execute("conflicts.view", {});
    await demoFixtures(demo);
    assert.deepEqual(
      demo.github.calls.filter((name) => GITHUB_WRITE_METHODS.includes(name)),
      [],
    );
    for (const name of [
      "createIssueComment",
      "addLabels",
      "removeLabel",
      "updateIssue",
      "createPullRequest",
    ])
      await assert.rejects(demo.github[name]({}), /Demo mode/);
  });
});

test("the fake GitHub keeps its comments and claim labels read-only data", async () => {
  const github = demoGitHub(),
    comments = await github.listIssueComments("example/recipe-box", 4);
  assert.ok(comments.some((comment) => /kirocrew-crew/.test(comment.body)));
  const claimed = (await github.listIssues("example/recipe-box", {})).filter(
    (issue) => issue.labels.some((label) => label.name === "crew: in progress"),
  );
  assert.ok(claimed.length >= 3);
});
