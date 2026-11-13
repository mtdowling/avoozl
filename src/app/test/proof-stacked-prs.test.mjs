// Proof for task 8.2, stacked pull requests on an open blocker (R27.13),
// against a fake GitHub in plans-repo mode. Off by default: only a code
// repository whose policy sets `stackedPullRequests` stacks.
import assert from "node:assert/strict";
import test from "node:test";
import { queryTasks } from "../../model.mjs";
import { findPlanningLeak } from "../github-plans-repo.mjs";
import {
  A_HEAD,
  PLANS,
  briefOf,
  workspace as plansWorkspace,
} from "./plans-repo-github.mjs";

const workspace = (t, { stacked, runner } = {}) =>
  plansWorkspace(t, {
    runner,
    repository: stacked === undefined ? {} : { stackedPullRequests: stacked },
  });

test("P-stack 1: with stackedPullRequests unset or false, an open blocker pull request stacks nothing", async (t) => {
  for (const stacked of [undefined, false]) {
    const { github, run, names } = workspace(t, { stacked });
    await run();
    github.pull("a");
    const result = await run();
    assert.deepEqual(names(), ["avoozl/a", "avoozl/b"], String(stacked));
    assert.equal(briefOf(result, "a-next"), undefined);
  }
});

test("P-stack 2: on, a dependent stacks only on one blocker's open pull request, and its brief keeps it there until the blocker merges", async (t) => {
  const { store, github, run, task, branch, names } = workspace(t, {
    stacked: true,
  });
  await run();
  // No pull request yet, then a closed one, then a blocker with a decision:
  // nothing stacks.
  assert.deepEqual(names(), ["avoozl/a", "avoozl/b"]);
  github.pull("a", { state: "CLOSED" });
  await run();
  assert.equal(branch("a-next"), null);
  github.pull("a");
  store.mutate("Hold a", (data) => {
    data.tasks.find((item) => item.id === "a").decision = "test:a";
  });
  await run();
  assert.equal(branch("a-next"), null);
  store.mutate("Release a", (data) => {
    data.tasks.find((item) => item.id === "a").decision = null;
  });
  // Open pull request, no decision: a-next's branch is cut from a's head.
  let result = await run();
  assert.deepEqual(names(), ["avoozl/a", "avoozl/b", "avoozl/a-next"]);
  assert.deepEqual(github.created.at(-1).oid, A_HEAD);
  assert.deepEqual(
    (({ baseBranch, stackedOn, stackedAt, finalBase }) => ({
      baseBranch,
      stackedOn,
      stackedAt,
      finalBase,
    }))(branch("a-next")),
    {
      baseBranch: "avoozl/a",
      stackedOn: "a",
      stackedAt: A_HEAD,
      finalBase: "main",
    },
  );
  const brief = briefOf(result, "a-next");
  assert.ok(brief, "a-next is dispatched in the same tick");
  for (const step of [
    /gh pr create --base avoozl\/a --head avoozl\/a-next/,
    /Do not turn on auto-merge and do not merge it while its base is avoozl\/a/,
    /If it closes without merging, report blocked/,
    // Merged forward, never rebased or force pushed (R77.3).
    /git merge origin\/main/,
    /gh pr edit avoozl\/a-next --base main/,
  ])
    assert.match(brief, step);
  assert.doesNotMatch(brief, /gh pr create --base main/);
  assert.doesNotMatch(brief, /--force|push -f|rebase --onto/);
  assert.equal(findPlanningLeak([["brief", brief]], PLANS), null);
  // `both` has two unmet blockers and never stacks.
  assert.equal(branch("both"), null);
  // Readiness that GitHub sees (labels, Project) is unchanged: a-next still
  // waits on a there.
  assert.equal(
    queryTasks(store.read(), { scope: "all", q: "ready:true" }).some(
      (item) => item.id === "a-next",
    ),
    false,
  );
  // The worker is bound; the next tick dispatches nothing again.
  store.put("session_bindings", {
    id: "worker-a-next",
    slot: "worker-a-next",
    taskId: "a-next",
    role: "worker",
    attempt: 1,
    source: "tick",
    boundAt: new Date().toISOString(),
  });
  result = await run([{ target: "worker-a-next", status: "working" }]);
  assert.equal(briefOf(result, "a-next"), undefined);
  // a merges first and completes; a-next completes only by its own merge.
  github.closeByPull(1, "a");
  await run([{ target: "worker-a-next", status: "working" }]);
  assert.equal(task("a").githubVerdict.state, "verified");
  assert.notEqual(task("a-next").githubVerdict?.state, "verified");
  github.pull("a-next");
  github.closeByPull(3, "a-next");
  await run([{ target: "worker-a-next", status: "working" }]);
  assert.equal(task("a-next").githubVerdict.state, "verified");
  // Only branches were written to GitHub.
  assert.deepEqual(github.updates, []);
});

test("P-stack 3: a Crew Mode conductor sees the stacked leaf ready with the stacked brief", async (t) => {
  const { github, ops, run } = workspace(t, {
    stacked: true,
    runner: "crew-mode",
  });
  await run();
  github.pull("a");
  await run();
  const view = await ops.execute("runner.next", {}),
    row = view.ready.find((item) => item.id === "a-next");
  assert.ok(row, "a-next is ready");
  assert.match(row.brief, /gh pr create --base avoozl\/a/);
  assert.ok(!view.ready.some((item) => item.id === "both"));
});
