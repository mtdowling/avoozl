import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";

// rc-1.1: the Radar label set.
const policy = (mode, repository = {}) =>
  normalizeGitHubPolicy({
    mode,
    ...(mode === "plans-repo" ? { planningRepository: "example/plans" } : {}),
    repositories: { "example/app": { baseBranch: "main", ...repository } },
  });
const repo = (mode, repository) =>
  policy(mode, repository).repositories["example/app"];

test("the Radar labels default to avoozl:plan, avoozl:ready and crew: in progress", () => {
  for (const mode of ["plans-repo", "single-repo"]) {
    const entry = repo(mode, {});
    assert.deepEqual(entry.radar, {
      planLabel: "avoozl:plan",
      reviewLabel: "avoozl:review",
      draftedLabel: "avoozl:drafted",
    });
    assert.equal(entry.crewLabels.inProgress, "crew: in progress");
    assert.equal(entry.managedLabels.ready, undefined);
  }
});

test("a missing or empty radar block gives the defaults; worker repositories get them too", () => {
  assert.equal(
    repo("plans-repo", { radar: {} }).radar.planLabel,
    "avoozl:plan",
  );
  assert.equal(repo("plans-repo").radar.reviewLabel, "avoozl:review");
});

test("radar settings are read, and bad ones refused", () => {
  const entry = repo("single-repo", {
    radar: { planLabel: "plan me", reviewLabel: "look" },
  });
  assert.deepEqual(entry.radar, {
    planLabel: "plan me",
    reviewLabel: "look",
    draftedLabel: "avoozl:drafted",
  });
  for (const radar of [
    { planLabel: "" },
    { planLabel: "   " },
    { reviewLabel: "" },
    { planLabel: 4 },
    { conflictLabel: "x" },
    { crews: [] },
  ])
    assert.throws(() => repo("single-repo", { radar }), /radar/);
  assert.throws(() => repo("single-repo", { radar: [] }), /radar/);
});

const LABELS = {
  planning: (name) => ({ radar: { planLabel: name } }),
  "needs-human": (name) => ({ crewLabels: { needsHuman: name } }),
  "in-progress": (name) => ({ crewLabels: { inProgress: name } }),
  ready: (name) => ({ managedLabels: { ready: name } }),
  review: (name) => ({ radar: { reviewLabel: name } }),
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
          () => repo(mode, { ...input }),
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
    () => repo("single-repo", { radar: { reviewLabel: "crew: in progress" } }),
    /review.*in-progress|in-progress.*review/,
  );
});

test("distinct names pass, including one that only shares a prefix", () => {
  assert.doesNotThrow(() =>
    repo("plans-repo", {
      radar: { planLabel: "ready to plan" },
    }),
  );
});

test("an existing worker repository with its own labels still validates", () => {
  const entry = repo("plans-repo", {
    managedLabels: { managed: "agent:managed", ready: "agent:ready" },
  });
  assert.equal(entry.managedLabels.ready, "agent:ready");
});

test("the conflict and approval labels are not settings", () => {
  for (const radar of [{ conflictLabel: "x" }, { approvalLabel: "x" }])
    assert.throws(() => repo("plans-repo", { radar }), /Unknown setting/);
});

test("conflicts leaves the count unset by default, and bad values are refused by key", () => {
  // An unset count reads landing.conflictRounds, then 2 (design §4.25).
  assert.deepEqual(repo("single-repo").conflicts, { maxAttempts: null });
  assert.deepEqual(
    repo("single-repo", { conflicts: { maxAttempts: 3 } }).conflicts,
    { maxAttempts: 3 },
  );
  assert.throws(
    () => repo("single-repo", { conflicts: { onSourceConflict: "ask" } }),
    /onSourceConflict/,
  );
  for (const maxAttempts of [-1, 11, 1.5, "2"])
    assert.throws(
      () => repo("single-repo", { conflicts: { maxAttempts } }),
      /conflicts\.maxAttempts/,
    );
  assert.throws(
    () => repo("single-repo", { conflicts: { other: 1 } }),
    /conflicts/,
  );
});
