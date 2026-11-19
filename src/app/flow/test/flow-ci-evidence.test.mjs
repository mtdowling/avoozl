import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BUILD_METRIC,
  CI_METRIC,
  buildMinutesPerPullRequest,
  ciFacts,
  ciMinutesPerPullRequest,
  ciSettings,
  ciStep,
  readEffectiveCIConfig,
  repeatRuns,
} from "../flow-ci.mjs";
import {
  decideProposal,
  proposalProblem,
  pdcaResult,
  retroBrief,
  retroStep,
} from "../flow-retro.mjs";
import { flowPolicy } from "../flow.mjs";
import { globalAvoozlConfigPath } from "../../settings/layered-config.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.KIRO_HOME = temporaryDirectory("avoozl-ci-evidence-home-");
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-ci-evidence-xdg-");
const NOW = Date.parse("2026-11-15T12:00:00Z"),
  REPO = "example/code",
  POLICY = { mode: "single-repo", repositories: { [REPO]: {} } },
  iso = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

function setup(t) {
  const root = temporaryDirectory("avoozl-ci-evidence-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  t.after(() => store.close());
  return { root, store };
}
const check = (start, end) => ({
  startedAt: iso(start),
  completedAt: iso(end),
  checkSuite: { workflowRun: { databaseId: 1 } },
});
const pull = (paths, checks = []) => ({
  number: 1,
  headRefOid: "a".repeat(40),
  createdAt: iso(-120),
  files: {
    totalCount: paths.length,
    nodes: paths.map((name) => ({ path: name })),
  },
  commits: {
    nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: checks } } } }],
  },
});
const run = (start, end, attempt = 1) => ({
  id: 1,
  workflow: ".github/workflows/test.yml",
  headSha: "a".repeat(40),
  event: "push",
  attempt,
  startedAt: iso(start),
  endedAt: iso(end),
  pullRequests: [],
});
const fake = (state) => ({
  openPullRequests: async () => state.pulls,
  workflowRuns: async () => state.runs,
});
const proposal = () => ({
  id: "p1",
  type: "plan",
  spec: "synthetic",
  change: "Reduce CI time.",
  repository: REPO,
  metric: CI_METRIC,
  class: "docs",
  direction: "down",
  status: "open",
});
function closed(store, number, at, ciMs) {
  store.put("pr_ci", {
    id: `${REPO}#${number}`,
    repository: REPO,
    number,
    classes: ["docs"],
    createdAt: iso(at - 2),
    closedAt: iso(at),
    ciMs,
    waitMs: 0,
  });
}

for (const staleHeadChecks of [false, true])
  test(`a newer attempt replaces prior measured timing with an estimate (${staleHeadChecks ? "stale" : "missing"} head checks)`, async (t) => {
    const { store } = setup(t),
      oldChecks = [check(-20, -10), check(-20, -10)],
      state = {
        pulls: [pull(["README.md"], oldChecks)],
        runs: [run(-20, -10)],
      },
      github = fake(state);
    await ciStep(store, github, { policy: POLICY, now: NOW });
    assert.equal(store.list("ci_runs")[0].jobMs, 20 * 60_000);
    assert.equal(store.list("ci_runs")[0].estimate, false);
    state.pulls = staleHeadChecks ? [pull(["README.md"], oldChecks)] : [];
    state.runs = [run(1, 41, 2)];
    await ciStep(store, github, { policy: POLICY, now: NOW + 42 * 60_000 });
    let row = store.list("ci_runs")[0];
    assert.equal(row.attempt, 2);
    assert.equal(row.jobMs, 40 * 60_000);
    assert.equal(row.estimate, true);
    assert.deepEqual(repeatRuns(store.list("ci_runs")), []);
    state.pulls = [pull(["README.md"], [check(1, 3), check(1, 4)])];
    await ciStep(store, github, { policy: POLICY, now: NOW + 43 * 60_000 });
    row = store.list("ci_runs")[0];
    assert.equal(row.jobMs, 5 * 60_000);
    assert.equal(row.estimate, false);
    state.pulls = [];
    await ciStep(store, github, { policy: POLICY, now: NOW + 44 * 60_000 });
    assert.equal(store.list("ci_runs").length, 1);
    assert.equal(store.list("ci_runs")[0].jobMs, 5 * 60_000);
    assert.equal(store.list("ci_runs")[0].estimate, false);
  });

test("the 10% PDCA decision uses full precision in both directions", (t) => {
  const { store } = setup(t);
  for (const [beforeMs, afterMs, expected] of [
    [15600, 14940, "no change"],
    [24000, 21000, "helped"],
  ]) {
    closed(store, 1, -1, beforeMs);
    closed(store, 2, 1, afterMs);
    const args = { repository: REPO, cls: "docs", n: 1, at: iso(0) },
      before = ciMinutesPerPullRequest(store, args),
      after = ciMinutesPerPullRequest(store, { ...args, after: true });
    assert.equal(before, beforeMs / 60_000);
    assert.equal(after, afterMs / 60_000);
    assert.equal(pdcaResult(before, after, "down"), expected);
  }
});

test("approval with too few baseline PRs stays unmeasured without suggesting an Undo", async (t) => {
  const { store } = setup(t);
  closed(store, 1, -1, 60_000);
  store.put("flow_retros", {
    id: "r1",
    state: "done",
    startedAt: iso(-1),
    proposals: [proposal()],
  });
  let drafts = 0;
  await decideProposal(
    store,
    { retroId: "r1", proposalId: "p1", decision: "approve" },
    {
      config: { flow: { retro: { everyTasks: 2 } } },
      draft: async () => {
        drafts++;
        return "fake-draft";
      },
      now: NOW,
    },
  );
  let approved = store.get("flow_retros", "r1").proposals[0];
  assert.equal(drafts, 1);
  assert.equal(approved.status, "approved");
  assert.equal(approved.pdca.before, null);
  assert.match(
    approved.pdca.pendingReason,
    /fewer than 2 closed docs pull requests.*before approval/,
  );
  closed(store, 3, 1, 30_000);
  closed(store, 4, 2, 30_000);
  retroStep(store, {}, { now: NOW + 3 * 60_000, ciRepositories: [] });
  approved = store.get("flow_retros", "r1").proposals[0];
  assert.equal(approved.pdca.result, undefined);
  assert.match(approved.pdca.pendingReason, /before approval/);
  assert.deepEqual(store.getMeta("flow.retro.state")?.reverts ?? [], []);
  // A later backfill can supply the missing before-window without changing approval.
  closed(store, 2, -2, 60_000);
  retroStep(store, {}, { now: NOW + 4 * 60_000, ciRepositories: [] });
  approved = store.get("flow_retros", "r1").proposals[0];
  assert.equal(approved.pdca.before, 1);
  assert.equal(approved.pdca.after, 0.5);
  assert.equal(approved.pdca.result, "helped");
  assert.equal(approved.pdca.pendingReason, undefined);
});

test("repository class overrides work for observed repositories without GitHub authorization", async (t) => {
  const { store } = setup(t),
    config = {
      flow: { ci: { classes: { docs: ["guide/"] } } },
      repositories: {
        local: { flow: { ci: { classes: { docs: ["handbook/"] } } } },
      },
    },
    state = { pulls: [pull(["handbook/intro.adoc"])], runs: [] };
  store.put("repositories", { id: "local", github: "EXAMPLE/Code" });
  assert.deepEqual(store.list("github_repositories"), []);
  await ciStep(store, fake(state), { policy: POLICY, config, now: NOW });
  assert.deepEqual(store.list("pr_ci")[0].classes, ["docs"]);
  state.pulls = [pull(["guide/intro.adoc"])];
  await ciStep(store, fake(state), {
    policy: POLICY,
    config,
    now: NOW + 60_000,
  });
  assert.deepEqual(store.list("pr_ci")[0].classes, ["code"]);
});

test("a successful unchanged snapshot advances lastSeen without duplicating runs", async (t) => {
  const { store } = setup(t),
    github = fake({ pulls: [pull(["README.md"])], runs: [run(-20, -10)] });
  await ciStep(store, github, { policy: POLICY, now: NOW });
  const first = store.list("pr_ci")[0],
    beforeRuns = store.list("ci_runs");
  await ciStep(store, github, { policy: POLICY, now: NOW + 60_000 });
  const again = store.list("pr_ci")[0];
  assert.equal(again.firstSeen, first.firstSeen);
  assert.equal(again.lastSeen, iso(1));
  assert.deepEqual(store.list("ci_runs"), beforeRuns);
});

for (const unreadable of [false, true])
  test(`retention removes old rows from all repositories when ${unreadable ? "the configured repository is unreadable" : "no repositories remain"}`, async (t) => {
    const { store } = setup(t),
      old = iso(-91 * 24 * 60),
      recent = iso(-24 * 60);
    for (const repository of [REPO, "removed/repo"]) {
      store.put("pr_ci", {
        id: repository + "#1",
        repository,
        number: 1,
        closedAt: old,
      });
      store.put("ci_runs", {
        id: repository + ":1",
        repository,
        runId: 1,
        startedAt: old,
      });
    }
    store.put("pr_ci", {
      id: "keep#2",
      repository: "removed/repo",
      number: 2,
      closedAt: recent,
    });
    store.put("pr_ci", {
      id: "open#3",
      repository: "removed/repo",
      number: 3,
      firstSeen: old,
      closedAt: null,
    });
    store.put("ci_runs", {
      id: "keep:2",
      repository: "removed/repo",
      runId: 2,
      startedAt: recent,
    });
    const github = {
      openPullRequests: async () => {
        throw Error("fake unavailable repository");
      },
      workflowRuns: async () => {
        throw Error("unexpected read");
      },
    };
    await ciStep(store, github, {
      policy: unreadable ? POLICY : null,
      now: NOW,
    });
    assert.deepEqual(
      store
        .list("pr_ci")
        .map((row) => row.id)
        .sort(),
      ["keep#2", "open#3"],
    );
    assert.deepEqual(
      store.list("ci_runs").map((row) => row.id),
      ["keep:2"],
    );
  });

test("CI collection, triggers, brief and PDCA share validated layered settings and their last valid state", async (t) => {
  const { root, store } = setup(t),
    globalFile = globalAvoozlConfigPath(),
    repositoryFile = path.join(root, ".avoozl.json");
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.writeFileSync(
    globalFile,
    JSON.stringify({
      version: 1,
      roles: { planner: { model: "fake-writer" } },
      flow: {
        ci: { docsOnlyMinutes: 17, classes: { docs: ["manual/"] } },
        retro: { everyTasks: 2 },
      },
      repositories: {
        local: {
          root: "/fake/private/root",
          flow: { ci: { waitShare: 0.7, classes: { docs: ["handbook/"] } } },
        },
      },
    }),
  );
  const repositoryConfig = {
    version: 1,
    flow: { ci: { waitShare: 0.3 } },
    repositories: { local: { flow: { ci: { docsOnlyMinutes: 23 } } } },
  };
  fs.writeFileSync(repositoryFile, JSON.stringify(repositoryConfig));
  store.put("repositories", { id: "local", github: REPO });
  const effective = readEffectiveCIConfig(store, { workspaceRoot: root });
  assert.equal(
    store.getMeta("flow.ci.config"),
    null,
    "observing effective settings writes nothing",
  );
  assert.deepEqual(
    readEffectiveCIConfig(store, { workspaceRoot: root, persist: true }),
    effective,
  );
  assert.equal(flowPolicy(effective).workspace.ci.docsOnlyMinutes, 17);
  assert.equal(flowPolicy(effective).workspace.ci.waitShare, 0.3);
  assert.equal(ciSettings(store, effective, REPO).docsOnlyMinutes, 23);
  assert.equal(ciSettings(store, effective, REPO).waitShare, 0.7);
  assert.deepEqual(ciSettings(store, effective, REPO).classes.docs, [
    "handbook/",
  ]);
  assert.equal(
    JSON.stringify(store.getMeta("flow.ci.config")).includes(
      "/fake/private/root",
    ),
    false,
  );
  assert.equal(store.getMeta("flow.ci.config").models, undefined);
  await ciStep(
    store,
    fake({ pulls: [pull(["handbook/intro.adoc"])], runs: [run(-25, -1)] }),
    { policy: POLICY, config: effective, now: NOW },
  );
  assert.deepEqual(store.list("pr_ci")[0].classes, ["docs"]);
  const staleRaw = { flow: { ci: { docsOnlyMinutes: 99999 } } },
    step = retroStep(store, staleRaw, { now: NOW, ciRepositories: [REPO] }),
    retro = store.get("flow_retros", step.retro);
  assert.equal(retro.triggers[0].kind, "waste-docs");
  assert.equal(
    ciFacts(store, effective, REPO, { now: NOW }).settings.docsOnlyMinutes,
    23,
  );
  const brief = retroBrief(store, store.read(), retro, null, {
    config: staleRaw,
    ciRepositories: [REPO],
    now: NOW,
  });
  assert.match(brief, /"docsOnlyMinutes": 24/);
  assert.equal(flowPolicy(effective).workspace.retro.everyTasks, 2);
  retro.proposals = [proposal()];
  store.put("flow_retros", retro);
  await decideProposal(
    store,
    { retroId: retro.id, proposalId: "p1", decision: "approve" },
    {
      config: { flow: { retro: { everyTasks: 10 } } },
      draft: async () => "fake-draft",
      now: NOW,
    },
  );
  assert.equal(store.get("flow_retros", retro.id).proposals[0].pdca.window, 2);
  fs.writeFileSync(repositoryFile, "{ broken");
  assert.deepEqual(
    readEffectiveCIConfig(store, { workspaceRoot: root }),
    effective,
  );
  fs.writeFileSync(
    repositoryFile,
    JSON.stringify({ version: 1, flow: { ci: { waitShare: 2 } } }),
  );
  assert.deepEqual(
    readEffectiveCIConfig(store, { workspaceRoot: root }),
    effective,
  );
  repositoryConfig.flow.ci.waitShare = 0.4;
  fs.writeFileSync(repositoryFile, JSON.stringify(repositoryConfig));
  assert.equal(
    flowPolicy(
      readEffectiveCIConfig(store, { workspaceRoot: root, persist: true }),
    ).workspace.ci.waitShare,
    0.4,
  );
});

test("build minutes per pull request count successful observations, by phase", (t) => {
  const { store } = setup(t),
    add = (head, phase, ms, failed = 0) =>
      store.db
        .prepare(
          "INSERT INTO build_observations(repository,pr_number,head_sha,run_id,task,attempt,command,target,seq,phase,start,ms,failed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          REPO,
          1,
          head,
          1,
          "",
          1,
          phase,
          "linux",
          Math.random(),
          phase,
          "warm",
          ms,
          failed,
        );
  closed(store, 1, -1, 0);
  store.put("pr_ci", { ...store.get("pr_ci", `${REPO}#1`), headSha: "h1" });
  add("h1", "build", 60_000);
  add("h1", "test", 120_000);
  add("h1", "test", 600_000, 1);
  const args = { repository: REPO, cls: "docs", n: 1, at: iso(0) };
  assert.equal(buildMinutesPerPullRequest(store, args), 3);
  assert.equal(
    buildMinutesPerPullRequest(store, { ...args, phase: "test" }),
    2,
  );
  assert.equal(buildMinutesPerPullRequest(store, { ...args, n: 2 }), null);
  const proposal = {
    type: "settings",
    file: "repository",
    repository: REPO,
    key: "flow.retro.everyTasks",
    from: 5,
    to: 3,
    metric: BUILD_METRIC,
    class: "docs",
    phase: "test",
    direction: "down",
    evidence: "x",
  };
  assert.doesNotMatch(String(proposalProblem(proposal)), /metric|class|phase/);
  assert.match(
    proposalProblem({ ...proposal, metric: CI_METRIC }),
    /phase is only for/,
  );
});
