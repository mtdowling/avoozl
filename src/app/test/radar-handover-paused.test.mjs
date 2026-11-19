// R103.4, R103.5, R91.6: Avoozl hands no task issue to an Issue Radar crew,
// its executor runs those tasks, and one previewed, paced backfill puts
// crew:avoozl on old task issues. Fake GitHub and isolated temporary
// workspaces only; nothing reaches GitHub.
import assert from "node:assert/strict";
import test from "node:test";
import { crewLabelBackfill } from "../crew-label-backfill.mjs";
import { isLinkedBranchLeaf } from "../github-plans-repo.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "o/app";

test("Avoozl's executor runs the leaves of an Issue Radar repository", () => {
  const leaf = {
    kind: "leaf",
    route: "github",
    github: { repository: REPO, number: 4 },
  };
  assert.equal(
    isLinkedBranchLeaf(leaf, {
      mode: "single-repo",
      repositories: { [REPO]: {} },
    }),
    true,
  );
});

// ---- the backfill ----------------------------------------------------------

function fakeGitHub(issues) {
  const github = {
    issues,
    reads: 0,
    writes: [],
    pacedAfter: Infinity,
    available: () => true,
    async issue(_config, number) {
      github.reads += 1;
      return structuredClone(issues.find((entry) => entry.number === number));
    },
    async addLabels(_config, number, labels) {
      if (github.writes.length >= github.pacedAfter)
        throw Object.assign(Error("GitHub writes are paced"), { paced: true });
      github.writes.push([number, ...labels]);
      const found = issues.find((entry) => entry.number === number);
      found.labels.push(...labels.map((name) => ({ name })));
      return found.labels;
    },
  };
  return github;
}

const ghIssue = (number, labels = [], state = "open") => ({
  number,
  state,
  title: `Task ${number}`,
  html_url: `https://example.test/${REPO}/issues/${number}`,
  labels: labels.map((name) => ({ name })),
});

function backfillWorkspace(t) {
  const { store } = fixture(t),
    github = fakeGitHub([
      ghIssue(1, ["avoozl:managed"]),
      ghIssue(2, ["avoozl:managed", "avoozl:ready"]),
      ghIssue(3, ["avoozl:managed", "crew: in progress"]),
      ghIssue(4, ["avoozl:managed", "crew:avoozl"]),
      ghIssue(5, ["avoozl:managed"], "closed"),
      ghIssue(6, ["avoozl:managed", "crew: needs human"]),
    ]);
  store.mutate("Projected tasks", (data) => {
    for (const number of [1, 2, 3, 4, 5, 6])
      data.tasks.push({
        ...structuredClone(data.tasks[0]),
        id: `task-${number}`,
        github: { repository: REPO, number },
      });
  });
  store.put("github_repositories", { id: REPO, owner: "o", repo: "app" });
  return { store, github };
}

test("the backfill previews, then adds crew:avoozl once, skipping claimed issues", async (t) => {
  const { store, github } = backfillWorkspace(t);
  await assert.rejects(crewLabelBackfill(store, github, {}), /Preview/);
  const preview = await crewLabelBackfill(store, github, { preview: true });
  assert.deepEqual(
    preview.add.map((entry) => entry.number),
    [1, 2],
  );
  assert.deepEqual(
    preview.claimed.map((entry) => entry.number),
    [3, 6],
  );
  assert.deepEqual([preview.labeled, preview.closed], [1, 1]);
  assert.deepEqual(github.writes, [], "a preview writes nothing");
  const done = await crewLabelBackfill(store, github, { confirm: true });
  assert.deepEqual(github.writes, [
    [1, "crew:avoozl"],
    [2, "crew:avoozl"],
  ]);
  assert.deepEqual(
    done.written.map((entry) => entry.number),
    [1, 2],
  );
  // A crew's labels stay; nothing was removed or added on 3 and 6.
  assert.deepEqual(
    github.issues[2].labels.map((label) => label.name),
    ["avoozl:managed", "crew: in progress"],
  );
  // Running it again writes nothing.
  await crewLabelBackfill(store, github, { confirm: true });
  assert.equal(github.writes.length, 2);
});

test("a paced stop keeps what was written and the retry finishes once", async (t) => {
  const { store, github } = backfillWorkspace(t);
  github.pacedAfter = 1;
  const first = await crewLabelBackfill(store, github, { confirm: true });
  assert.deepEqual(
    first.written.map((entry) => entry.number),
    [1],
  );
  assert.equal(first.stopped.number, 2);
  assert.equal(first.stopped.paced, true);
  github.pacedAfter = Infinity;
  const second = await crewLabelBackfill(store, github, { confirm: true });
  assert.deepEqual(
    second.written.map((entry) => entry.number),
    [2],
  );
  assert.deepEqual(github.writes, [
    [1, "crew:avoozl"],
    [2, "crew:avoozl"],
  ]);
});

test("each claimed issue gets one Needs you row, through the person-only operation", async (t) => {
  const { store, github } = backfillWorkspace(t),
    ops = new Operations(store, { github });
  await assert.rejects(
    ops.execute("github.crewlabel.backfill", { preview: true }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  for (let i = 0; i < 2; i++)
    await ops.execute("github.crewlabel.backfill", { preview: true });
  const rows = (await ops.execute("conflicts.view", {})).items.filter(
    (row) => row.reason === "crew-label",
  );
  assert.deepEqual(
    rows.map((row) => row.issue.number),
    [3, 6],
  );
  assert.match(rows[0].detail, /crew: in progress/);
  // Once the crew's label is gone, the row goes with the next run.
  github.issues[2].labels = [{ name: "avoozl:managed" }];
  await ops.execute("github.crewlabel.backfill", { preview: true });
  assert.deepEqual(
    (await ops.execute("conflicts.view", {})).items
      .filter((row) => row.reason === "crew-label")
      .map((row) => row.issue.number),
    [6],
  );
});
