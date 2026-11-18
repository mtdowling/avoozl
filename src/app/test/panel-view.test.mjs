// panel.view: the side panel's one read. Each part fails alone, GitHub reads go
// through the client, and the sample workspace fills every section.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { demoOperations, installDemo } from "../demo.mjs";
import { checkSummary, panelView, pullChecks } from "../panel-view.mjs";

const run = (name, status, conclusion = null) => ({
  name,
  status,
  conclusion,
  started_at: "2026-11-14T10:00:00Z",
  completed_at: status === "completed" ? "2026-11-14T10:05:00Z" : null,
});

test("checkSummary: failing, pending, passing and none", () => {
  assert.equal(
    checkSummary([run("a", "completed", "failure")]).state,
    "failing",
  );
  assert.deepEqual(checkSummary([run("a", "completed", "failure")]).failed, [
    "a",
  ]);
  assert.equal(
    checkSummary([run("a", "completed", "success"), run("b", "in_progress")])
      .state,
    "pending",
  );
  assert.equal(
    checkSummary([run("a", "completed", "success")]).state,
    "passing",
  );
  assert.equal(checkSummary([]).state, "none");
  // The demo client answers { check_runs }.
  assert.equal(
    checkSummary({ check_runs: [run("a", "completed", "success")] }).state,
    "passing",
  );
});

test("pullChecks looks up each claim's pull request once and leaves an unreadable one out", async () => {
  const calls = [];
  const github = {
    available: () => true,
    pullRequest: async (repo, n) => {
      calls.push(["pull", repo, n]);
      if (n === 2) throw new Error("gone");
      return { head: { sha: `sha${n}` } };
    },
    checkRuns: async (repo, sha) => {
      calls.push(["checks", repo, sha]);
      return [run("t", "completed", "success")];
    },
  };
  const checks = await pullChecks(github, {
    rows: [
      { repository: "o/r", pr: 1 },
      { repository: "o/r", pr: 2 },
      { repository: "o/r", pr: null },
    ],
  });
  assert.deepEqual(Object.keys(checks), ["o/r#1"]);
  assert.equal(checks["o/r#1"].state, "passing");
  assert.deepEqual(
    calls.filter(([kind]) => kind === "checks"),
    [["checks", "o/r", "sha1"]],
  );
  assert.deepEqual(
    await pullChecks(null, { rows: [{ repository: "o/r", pr: 1 }] }),
    {},
  );
});

test("a part that throws is null and the others still come back", async () => {
  const view = await panelView({
    a: () => 1,
    b: async () => {
      throw new Error("down");
    },
    c: async () => [3],
  });
  assert.deepEqual([view.a, view.b, view.c], [1, null, [3]]);
  assert.ok(Date.parse(view.readAt));
});

test("panel.view fills every section from the sample workspace", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-panel-view-"));
  const { root } = await installDemo(path.join(tmp, "demo"));
  const demo = demoOperations(root);
  try {
    const view = await demo.execute("panel.view", {});
    for (const part of [
      "conflicts",
      "crews",
      "remote",
      "queue",
      "flow",
      "specs",
      "instance",
      "checks",
    ])
      assert.notEqual(view[part], null, `${part} was read`);
    assert.ok(view.conflicts.length > 0, "something waits on a person");
    assert.ok(view.crews.rows.length > 0, "a crew holds a claim");
    // No repository is Radar-coded (R91.6), so the release queue is empty.
    assert.deepEqual(view.queue.repositories, []);
    assert.ok(
      view.flow.tasks.some((task) => task.finishedAt),
      "something merged",
    );
    assert.ok(view.instance.name, "the instance has a name");
    assert.ok(
      Object.values(view.checks).every((check) =>
        ["passing", "failing", "pending", "none"].includes(check.state),
      ),
    );
    assert.ok(
      view.crews.rows.some(
        (row) => row.pr && view.checks[`${row.repository}#${row.pr}`],
      ),
      "a claim's pull request has its checks",
    );
    assert.equal("driver" in view, false, "no driver session part");
  } finally {
    demo.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
