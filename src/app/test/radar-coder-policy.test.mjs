import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";

// rc-1.1: the per-repository `coder` setting and the Radar label set.
const policy = (mode, repository = {}) =>
  normalizeGitHubPolicy({
    mode,
    ...(mode === "plans-repo" ? { planningRepository: "example/plans" } : {}),
    repositories: { "example/app": { baseBranch: "main", ...repository } },
  });
const repo = (mode, repository) =>
  policy(mode, repository).repositories["example/app"];

test("issue-radar validates in both GitHub modes", () => {
  assert.equal(
    repo("plans-repo", { coder: "issue-radar" }).coder,
    "issue-radar",
  );
  assert.equal(
    repo("single-repo", { coder: "issue-radar" }).coder,
    "issue-radar",
  );
  assert.equal(repo("plans-repo", { coder: "worker" }).coder, "worker");
  assert.equal(repo("single-repo", { coder: "worker" }).coder, "worker");
});

test("coder defaults are unchanged and unknown values are refused", () => {
  assert.equal(repo("plans-repo").coder, "worker");
  assert.equal(repo("single-repo").coder, "issue-radar");
  // null means "not set", as before.
  assert.equal(repo("plans-repo", { coder: null }).coder, "worker");
  for (const coder of ["", "Worker", "ISSUE-RADAR", 1])
    assert.throws(() => repo("plans-repo", { coder }), /coder must be/);
});

test("the Radar labels default to avoozl:plan, avoozl:ready, crew: in progress, avoozl:merge-conflict", () => {
  for (const mode of ["plans-repo", "single-repo"]) {
    const entry = repo(mode, { coder: "issue-radar" });
    assert.deepEqual(entry.radar, {
      planLabel: "avoozl:plan",
      conflictLabel: "avoozl:merge-conflict",
      approvalLabel: "avoozl:plan-approved",
      reviewLabel: "avoozl:review",
      draftedLabel: "avoozl:drafted",
      clearPlanLabel: false,
    });
    assert.equal(entry.crewLabels.claim, "crew: in progress");
    assert.equal(entry.managedLabels.ready, undefined);
  }
});

test("a missing or empty radar block gives the defaults; worker repositories get them too", () => {
  assert.equal(
    repo("plans-repo", { radar: {} }).radar.planLabel,
    "avoozl:plan",
  );
  assert.equal(repo("plans-repo").radar.conflictLabel, "avoozl:merge-conflict");
});

test("radar settings are read, and bad ones refused", () => {
  const entry = repo("single-repo", {
    radar: {
      planLabel: "plan me",
      conflictLabel: "conflict",
      clearPlanLabel: true,
    },
  });
  assert.deepEqual(entry.radar, {
    planLabel: "plan me",
    conflictLabel: "conflict",
    approvalLabel: "avoozl:plan-approved",
    reviewLabel: "avoozl:review",
    draftedLabel: "avoozl:drafted",
    clearPlanLabel: true,
  });
  for (const radar of [
    { planLabel: "" },
    { planLabel: "   " },
    { conflictLabel: "" },
    { planLabel: 4 },
    { clearPlanLabel: "yes" },
    { crews: [] },
  ])
    assert.throws(() => repo("single-repo", { radar }), /radar/);
  assert.throws(() => repo("single-repo", { radar: [] }), /radar/);
});

const LABELS = {
  planning: (name) => ({ radar: { planLabel: name } }),
  "needs-human": (name) => ({ crewLabels: { needsHuman: name } }),
  claim: (name) => ({ crewLabels: { claim: name } }),
  ready: (name) => ({ managedLabels: { ready: name } }),
  conflict: (name) => ({ radar: { conflictLabel: name } }),
};
const merge = (...parts) =>
  parts.reduce((all, part) => {
    for (const [key, value] of Object.entries(part))
      all[key] = { ...all[key], ...value };
    return all;
  }, {});

test("any two equal label names are refused, naming both", () => {
  const kinds = Object.keys(LABELS);
  for (const mode of ["plans-repo", "single-repo"])
    for (const first of kinds)
      for (const second of kinds) {
        if (first >= second) continue;
        // Case differences count as equal, as GitHub treats label names.
        const input = merge(
          LABELS[first]("Same Name"),
          LABELS[second]("same name"),
        );
        assert.throws(
          () => repo(mode, { coder: "issue-radar", ...input }),
          (error) =>
            error.message.includes(first) &&
            error.message.includes(second) &&
            /different name/.test(error.message),
          `${mode} ${first} ${second}`,
        );
      }
});

test("a default name clashes with a set one", () => {
  assert.throws(
    () => repo("plans-repo", { radar: { planLabel: "avoozl:ready" } }),
    /planning.*ready|ready.*planning/,
  );
  assert.throws(
    () =>
      repo("single-repo", { radar: { conflictLabel: "crew: in progress" } }),
    /conflict.*claim|claim.*conflict/,
  );
});

test("distinct names pass, including one that only shares a prefix", () => {
  assert.doesNotThrow(() =>
    repo("plans-repo", {
      coder: "issue-radar",
      radar: { planLabel: "ready to plan" },
    }),
  );
});

test("an existing worker repository with its own labels still validates", () => {
  const entry = repo("plans-repo", {
    coder: "worker",
    managedLabels: { managed: "agent:managed", ready: "agent:ready" },
  });
  assert.equal(entry.managedLabels.ready, "agent:ready");
});

test("radar.showPlansRepo is unset by default, read when set, and refuses a non-boolean", () => {
  assert.equal(
    "showPlansRepo" in repo("plans-repo", { coder: "issue-radar" }).radar,
    false,
  );
  for (const showPlansRepo of [true, false])
    assert.equal(
      repo("plans-repo", { radar: { showPlansRepo } }).radar.showPlansRepo,
      showPlansRepo,
    );
  assert.throws(
    () => repo("plans-repo", { radar: { showPlansRepo: "yes" } }),
    /radar\.showPlansRepo must be true or false/,
  );
});
