// Tasks 4.1, 4.2 and 4.5: the Issue Radar crew scope in Settings, stale
// claims and needs-human labels as decisions that hold dependents, and
// priority order under the concurrency cap. Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { queryTasks } from "../../model.mjs";
import { Operations } from "../operations.mjs";
import { renderMarker } from "../github-marker.mjs";
import {
  CREW_LABEL_DEFAULTS,
  issueRadarCrews,
  normalizeGitHubPolicy,
  priorityRank,
} from "../github-policy.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_crewcrewcrewcrew",
  REPO = "example/code",
  hash = "b".repeat(64),
  CLAIM = CREW_LABEL_DEFAULTS.claim,
  HUMAN = CREW_LABEL_DEFAULTS.needsHuman;

const names = (issue) => issue.labels.map((label) => label.name);

// --- 4.1 and policy ------------------------------------------------------

test("crew labels default to Issue Radar's own and stay configurable", () => {
  const base = { baseBranch: "main", managedLabels: { ready: "go" } },
    policy = normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        [REPO]: base,
        "example/other": {
          ...base,
          crewLabels: { claim: "bot busy", needsHuman: "help wanted" },
        },
      },
    });
  assert.deepEqual(policy.repositories[REPO].crewLabels, {
    claim: "crew: in progress",
    needsHuman: "crew: needs human",
  });
  assert.deepEqual(policy.repositories["example/other"].crewLabels, {
    claim: "bot busy",
    needsHuman: "help wanted",
  });
  for (const crewLabels of [
    { claim: "same", needsHuman: "Same" },
    { claim: "go" },
    { unknown: "x" },
    { claim: "" },
  ])
    assert.throws(() =>
      normalizeGitHubPolicy({
        mode: "single-repo",
        repositories: { [REPO]: { ...base, crewLabels } },
      }),
    );
});

test("each Issue Radar crew scope is exactly the repository's ready label", () => {
  const policy = normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "example/a": {
        baseBranch: "main",
        managedLabels: { ready: "Ready To Code" },
      },
      "example/b": { baseBranch: "main", coder: "worker" },
      "example/c": { baseBranch: "main" },
    },
  });
  assert.deepEqual(issueRadarCrews(policy), [
    {
      repository: "example/a",
      label: "Ready To Code",
      link: "/issue-radar",
    },
    { repository: "example/c", label: null, link: "/issue-radar" },
  ]);
  // Plans-repo leaves are coded by worker sessions, not crews.
  assert.deepEqual(
    issueRadarCrews(
      normalizeGitHubPolicy({
        mode: "plans-repo",
        planningRepository: "example/plans",
        repositories: { "example/a": { baseBranch: "main" } },
      }),
    ),
    [],
  );
  assert.deepEqual(issueRadarCrews(normalizeGitHubPolicy({})), []);
});

test("settings.get shows the crew scope from the saved policy", async (t) => {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: { baseBranch: "main", managedLabels: { ready: "agent:go" } },
        },
      },
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root }),
    settings = await ops.execute("github.settings.get", {});
  assert.deepEqual(settings.crews, [
    { repository: REPO, label: "agent:go", link: "/issue-radar" },
  ]);
  assert.deepEqual(settings.choices.crewLabels, ["claim", "needsHuman"]);
});

test("priority rank takes the best listed label, without case; others sort last", () => {
  const list = ["critical", "high"];
  assert.equal(priorityRank(list, [{ name: "High" }]), 1);
  assert.equal(priorityRank(list, ["high", "CRITICAL"]), 0);
  assert.equal(priorityRank(list, ["urgent"]), 2);
  assert.equal(priorityRank(list, []), 2);
  assert.equal(priorityRank(undefined, ["critical"]), 0);
  assert.equal(priorityRank("critical", ["critical"]), 0);
});

// --- 4.2 ------------------------------------------------------------------

const marker = (taskId) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });

class CrewGitHub {
  constructor() {
    this.issues = new Map();
    this.events = new Map();
    this.writes = [];
    this.lists = 0;
  }
  available() {
    return true;
  }
  open(number, taskId, labels = []) {
    this.issues.set(number, {
      number,
      state: "open",
      state_reason: null,
      closed_at: null,
      updated_at: "2026-11-12T10:00:00Z",
      labels: labels.map((name) => ({ name })),
      body: marker(taskId) + "\nBody",
      html_url: `https://example.test/${REPO}/issues/${number}`,
    });
  }
  label(number, ...labels) {
    const issue = this.issues.get(number);
    for (const name of labels)
      if (!names(issue).includes(name)) issue.labels.push({ name });
    issue.updated_at = new Date().toISOString();
  }
  unlabel(number, label) {
    const issue = this.issues.get(number);
    issue.labels = issue.labels.filter((entry) => entry.name !== label);
    issue.updated_at = new Date().toISOString();
  }
  close(number) {
    Object.assign(this.issues.get(number), {
      state: "closed",
      state_reason: "not_planned",
      closed_at: "2026-11-12T10:05:00Z",
      updated_at: "2026-11-12T10:05:00Z",
    });
    this.events.set(number, [
      {
        event: "closed",
        actor: { login: "maintainer" },
        state_reason: "not_planned",
        created_at: "2026-11-12T10:05:00Z",
      },
    ]);
  }
  listIssues(_repository, { state = "all", label } = {}) {
    this.lists += 1;
    return Promise.resolve(
      structuredClone(
        [...this.issues.values()].filter(
          (issue) =>
            (state === "all" || issue.state === state) &&
            (!label || names(issue).includes(label)),
        ),
      ),
    );
  }
  issue(_repository, number) {
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
  addLabels(_repository, number, labels) {
    this.writes.push(["add", number, ...labels]);
    this.label(number, ...labels);
    return Promise.resolve([]);
  }
  removeLabel(_repository, number, label) {
    this.writes.push(["remove", number, label]);
    this.unlabel(number, label);
    return Promise.resolve(null);
  }
  closingPullRequests() {
    return Promise.resolve([]);
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  issueEvents(_repository, number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: actor === "maintainer" ? "write" : "none",
    });
  }
  updateIssue(_repository, number, input) {
    Object.assign(this.issues.get(number), input);
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
}

// Leaves a, b, c with issues 1, 2, 3; each has a dependent `x-next`.
function crewWorkspace(t, repository = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    github = new CrewGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            minimumPermission: "write",
            managedLabels: { managed: "m", ready: "go", stale: "stale-work" },
            ...repository,
          },
        },
      },
    }),
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  const leaf = (id, number) => ({
    id,
    title: "Task " + id,
    scope: "catalog",
    status: "planned",
    epic: "sample",
    track: "catalog",
    kind: "leaf",
    authority: "github",
    repository: "code",
    acceptance: [id + " works"],
    checks: [],
    ...(number
      ? {
          github: {
            repository: REPO,
            number,
            nodeId: "I_" + number,
            url: `https://example.test/${REPO}/issues/${number}`,
          },
        }
      : {}),
  });
  store.mutate("Seed GitHub leaves", (data) => {
    for (const [id, number] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]) {
      data.tasks.push(leaf(id, number), leaf(id + "-next", null));
      data.edges.push({
        id: `${id}:requires:${id}-next`,
        from: id,
        to: id + "-next",
        kind: "requires",
      });
    }
  });
  github.open(1, "a");
  github.open(2, "b");
  github.open(3, "c");
  const ops = new Operations(store, { github, workspaceRoot: root }),
    run = () => ops.execute("workspace.tick", { sessions: [] }),
    task = (id) => store.read().tasks.find((item) => item.id === id),
    ready = () =>
      new Set(
        queryTasks(store.read(), { scope: "all", q: "ready:true" }).map(
          (item) => item.id,
        ),
      ),
    crewNotices = (result) =>
      result.notify.filter((notice) =>
        /needs a person|stale claimed work/.test(notice.title),
      );
  return { store, github, ops, run, task, ready, crewNotices };
}

test("a claim without the ready label opens one decision, adds stale, and holds the leaf", async (t) => {
  const { store, github, run, task, ready, crewNotices } = crewWorkspace(t);
  // Claimed and still ready is normal crew work.
  github.label(1, "go", CLAIM);
  let result = await run();
  assert.equal(result.crew, undefined);
  assert.equal(task("a").decision ?? null, null);
  assert.deepEqual(crewNotices(result), []);

  github.unlabel(1, "go");
  result = await run();
  assert.equal(task("a").decision, "crew-stale-claim:a");
  assert.equal(task("a").crewHold.kind, "stale-claim");
  assert.equal(crewNotices(result).length, 1);
  assert.match(crewNotices(result)[0].text, /does not cancel the crew/);
  assert.equal(ready().has("a"), false);
  assert.deepEqual(github.writes, [["add", 1, "stale-work"]]);
  // Avoozl never writes the crew's own label.
  assert.ok(names(github.issues.get(1)).includes(CLAIM));

  // Later ticks: no second decision, notice or write. (The first may record
  // the completion step's new key for the issue the stale label changed.)
  assert.deepEqual(crewNotices(await run()), []);
  const revision = store.read().revision;
  for (let round = 0; round < 3; round += 1)
    assert.deepEqual(crewNotices(await run()), []);
  assert.equal(store.read().revision, revision);
  assert.equal(github.writes.length, 1);

  // The leaf is ready again: settled, and stale is removed.
  github.label(1, "go");
  await run();
  assert.equal(task("a").decision, null);
  assert.equal(task("a").crewHold, undefined);
  assert.deepEqual(github.writes.at(-1), ["remove", 1, "stale-work"]);
  assert.ok(!names(github.issues.get(1)).includes("stale-work"));
});

test("needs-human opens one decision and holds dependents of a finished blocker until removed; re-adding opens a new one", async (t) => {
  const { run, task, ready, crewNotices, github } = crewWorkspace(t);
  // b finishes by an allowed close, which alone would release b-next.
  github.close(2);
  await run();
  assert.equal(ready().has("b-next"), true);

  github.label(2, HUMAN);
  let result = await run();
  assert.equal(task("b").decision, "crew-needs-human:b");
  assert.equal(crewNotices(result).length, 1);
  assert.equal(ready().has("b-next"), false);
  assert.deepEqual(crewNotices(await run()), []);
  assert.equal(ready().has("b-next"), false);

  github.unlabel(2, HUMAN);
  result = await run();
  assert.equal(task("b").decision, null);
  assert.equal(ready().has("b-next"), true);
  assert.deepEqual(crewNotices(result), []);

  github.label(2, HUMAN);
  result = await run();
  assert.equal(task("b").decision, "crew-needs-human:b");
  assert.equal(crewNotices(result).length, 1);
  assert.equal(ready().has("b-next"), false);
  // Avoozl wrote nothing to GitHub for needs-human.
  assert.deepEqual(github.writes, []);
});

test("needs-human wins over a stale claim, and the decision shows in Conflicts", async (t) => {
  const { ops, run, task, github } = crewWorkspace(t);
  github.label(3, CLAIM, HUMAN);
  await run();
  assert.equal(task("c").decision, "crew-needs-human:c");
  // No stale label: the hold is needs-human.
  assert.deepEqual(github.writes, []);
  const view = await ops.execute("conflicts.view", {});
  assert.ok(
    view.items.some(
      (item) =>
        item.kind === "decision" &&
        item.taskId === "c" &&
        /crew added "crew: needs human" to issue #3: it needs a person/.test(
          item.detail,
        ) &&
        item.issue?.number === 3,
    ),
  );
  github.unlabel(3, HUMAN);
  await run();
  assert.equal(task("c").decision, "crew-stale-claim:c");
});

test("configured crew labels are the ones read; a worker repository is not read", async (t) => {
  const custom = crewWorkspace(t, {
    crewLabels: { claim: "bot busy", needsHuman: "help please" },
  });
  custom.github.label(1, HUMAN);
  custom.github.label(2, "help please");
  await custom.run();
  assert.equal(custom.task("a").decision ?? null, null);
  assert.equal(custom.task("b").decision, "crew-needs-human:b");

  const worker = crewWorkspace(t, { coder: "worker" });
  worker.github.label(1, HUMAN);
  await worker.run();
  assert.equal(worker.github.lists, 0);
  assert.equal(worker.task("a").decision ?? null, null);
});
