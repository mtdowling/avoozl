// Setup's ruleset, merge methods, CI variable and commit status (task 42.3).
// GitHub is a fake; nothing is written to a real repository.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLanding,
  postVerified,
  previewLanding,
  RULESET_NAME,
} from "../setup-landing.mjs";

const input = {
  repository: "acme/app",
  base: "main",
  checks: ["build", "lint"],
  methods: ["merge"],
};

function fakeGithub({
  rulesets = [],
  remote = {},
  variables = [],
  statuses = [],
} = {}) {
  const writes = [];
  return {
    writes,
    repository: async () => ({
      default_branch: "main",
      permissions: { admin: true },
      allow_merge_commit: true,
      allow_squash_merge: false,
      allow_rebase_merge: false,
      ...remote,
    }),
    rulesets: async () => structuredClone(rulesets),
    listRepoVariables: async () => variables,
    commitStatus: async () => ({ statuses }),
    createRuleset: async (repo, body) => writes.push(["createRuleset", body]),
    updateRuleset: async (repo, id, body) =>
      writes.push(["updateRuleset", id, body]),
    updateRepository: async (repo, body) =>
      writes.push(["updateRepository", body]),
    setRepoVariable: async (repo, name, value) =>
      writes.push(["setRepoVariable", name, value]),
    createCommitStatus: async (repo, sha, body) =>
      writes.push(["createCommitStatus", sha, body]),
  };
}

const gate = (contexts, extra = {}) => ({
  id: 41,
  name: "main requires CI",
  target: "branch",
  enforcement: "disabled",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [
    {
      type: "pull_request",
      parameters: { required_approving_review_count: 0 },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: contexts.map((context) => ({ context })),
      },
    },
  ],
  ...extra,
});

test("a ruleset that has the rule gets the missing check added, never a second one", async () => {
  const github = fakeGithub({
      rulesets: [gate(["build"])],
      variables: [{ name: "AVOOZL_LANDING", value: "pr" }],
    }),
    preview = await previewLanding(github, input),
    result = await applyLanding(github, preview);
  assert.deepEqual(result.written, ["ruleset"]);
  assert.equal(
    github.writes.filter(([kind]) => kind === "createRuleset").length,
    0,
  );
  const [[kind, id, body]] = github.writes;
  assert.equal(kind, "updateRuleset");
  assert.equal(id, 41);
  const checks = body.rules.filter((r) => r.type === "required_status_checks");
  assert.equal(checks.length, 1);
  assert.deepEqual(
    checks[0].parameters.required_status_checks.map((c) => c.context),
    ["build", "lint"],
  );
  // The other rule and the owner's settings on the rule stay as they were.
  assert.equal(body.rules.length, 2);
  assert.equal(checks[0].parameters.strict_required_status_checks_policy, true);
  assert.equal("enforcement" in body, false);
});

test("a second run with nothing to change writes nothing", async () => {
  const github = fakeGithub({
      rulesets: [gate(["build", "lint"])],
      variables: [{ name: "AVOOZL_LANDING", value: "pr" }],
    }),
    preview = await previewLanding(github, input);
  assert.equal(preview.message, "Nothing to change");
  assert.deepEqual(await applyLanding(github, preview), {
    written: [],
    skipped: [],
    message: "Nothing to change",
  });
  assert.deepEqual(github.writes, []);
});

test("with no ruleset rule, setup creates one ruleset and sets methods and the variable", async () => {
  const github = fakeGithub({
      rulesets: [
        gate(["x"], {
          id: 9,
          conditions: { ref_name: { include: ["refs/heads/release"] } },
        }),
      ],
      remote: { allow_squash_merge: true },
    }),
    preview = await previewLanding(github, input);
  await applyLanding(github, preview);
  assert.deepEqual(
    github.writes.map(([kind]) => kind),
    ["createRuleset", "updateRepository", "setRepoVariable"],
  );
  const [, created] = github.writes[0];
  assert.equal(created.name, RULESET_NAME);
  assert.deepEqual(created.conditions.ref_name.include, ["refs/heads/main"]);
  assert.deepEqual(github.writes[1][1], { allow_squash_merge: false });
  assert.deepEqual(github.writes[2], [
    "setRepoVariable",
    "AVOOZL_LANDING",
    "pr",
  ]);
});

test("without admin rights every change is blocked and nothing is written", async () => {
  const github = fakeGithub({ remote: { permissions: { push: true } } }),
    preview = await previewLanding(github, input);
  assert.deepEqual(
    preview.steps.filter((s) => s.status === "blocked").map((s) => s.id),
    ["ruleset", "ci-variable"],
  );
  await applyLanding(github, preview);
  assert.deepEqual(github.writes, []);
});

test("a verified head gets avoozl/verify once", async () => {
  const sha = "a".repeat(40),
    fresh = fakeGithub();
  assert.equal(await postVerified(fresh, "acme/app", sha), true);
  assert.deepEqual(fresh.writes, [
    [
      "createCommitStatus",
      sha,
      {
        state: "success",
        context: "avoozl/verify",
        description: "Avoozl verified this head.",
      },
    ],
  ]);
  const seen = fakeGithub({
    statuses: [{ context: "avoozl/verify", state: "success" }],
  });
  assert.equal(await postVerified(seen, "acme/app", sha), false);
  assert.deepEqual(seen.writes, []);
});

test("bad input is refused before any read", async () => {
  const github = fakeGithub();
  await assert.rejects(
    previewLanding(github, { ...input, methods: ["fast-forward"] }),
    /merge, squash or rebase/,
  );
  await assert.rejects(
    previewLanding(github, { ...input, checks: [] }),
    /required check/,
  );
});
