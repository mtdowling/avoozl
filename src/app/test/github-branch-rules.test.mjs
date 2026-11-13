import assert from "node:assert/strict";
import test from "node:test";
import {
  branchReviewRule,
  ruleBranch,
  seenCheckNames,
} from "../github-branch-rules.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { reviewRuleText } from "../../../kirocrew-app/ui/src/settings-api.ts";

const REPO = "example/code";

function fake({
  rules = [],
  protection = null,
  commits = [],
  branch = { protected: false },
  admin = true,
} = {}) {
  return {
    available: () => true,
    reads: [],
    repository: () =>
      Promise.resolve({ default_branch: "trunk", permissions: { admin } }),
    branch: () => Promise.resolve(structuredClone(branch)),
    branchRules(repository, branch) {
      this.reads.push(["rules", repository, branch]);
      return Promise.resolve(structuredClone(rules));
    },
    branchProtection() {
      if (protection instanceof Error) return Promise.reject(protection);
      return Promise.resolve(structuredClone(protection));
    },
    listCommits: () => Promise.resolve(commits.map((c) => ({ sha: c.sha }))),
    checkRuns: (_repository, sha) =>
      Promise.resolve(
        (commits.find((c) => c.sha === sha)?.runs || []).map((name) => ({
          name,
        })),
      ),
    commitStatus: (_repository, sha) =>
      Promise.resolve({
        statuses: (commits.find((c) => c.sha === sha)?.statuses || []).map(
          (context) => ({ context }),
        ),
      }),
  };
}

test("the rule branch is the policy's base branch, else GitHub's default", async () => {
  assert.equal(await ruleBranch(fake(), REPO, { baseBranch: "main" }), "main");
  assert.equal(await ruleBranch(fake(), REPO, {}), "trunk");
});

test("a ruleset and classic protection both count; the stricter count wins", async () => {
  const rule = await branchReviewRule(
    fake({
      rules: [
        {
          type: "pull_request",
          parameters: { required_approving_review_count: 1 },
        },
        { type: "deletion" },
      ],
      protection: {
        required_pull_request_reviews: {
          required_approving_review_count: 2,
          dismiss_stale_reviews: true,
        },
      },
    }),
    REPO,
    "main",
  );
  assert.deepEqual(rule, {
    branch: "main",
    approvals: 2,
    dismissStale: true,
    sources: ["ruleset", "branch protection"],
    hidden: false,
    hiddenReason: null,
    url: "https://github.com/example/code/settings/rules",
  });
});

test("no rule means no approvals, and unreadable classic protection is skipped", async () => {
  const forbidden = Object.assign(Error("forbidden"), { status: 403 });
  const rule = await branchReviewRule(
    fake({ protection: forbidden }),
    REPO,
    "main",
  );
  assert.equal(rule.approvals, 0);
  assert.deepEqual(rule.sources, []);
  const other = Object.assign(Error("down"), { status: 503 });
  await assert.rejects(
    branchReviewRule(fake({ protection: other }), REPO, "main"),
    /down/,
  );
});

// GitHub answers 404 on classic protection to anyone who is not an admin,
// while the branch itself still says protection is on.
const hiddenClassic = {
  protected: true,
  protection: {
    enabled: true,
    required_status_checks: {
      enforcement_level: "non_admins",
      contexts: ["ci/build"],
      checks: [{ context: "ci/test" }],
    },
  },
};

test("classic protection hidden from a non-admin is an unknown rule, not zero", async () => {
  const rule = await branchReviewRule(
    fake({ branch: hiddenClassic, admin: false }),
    REPO,
    "main",
  );
  assert.equal(rule.hidden, true);
  assert.equal(rule.approvals, 0);
  assert.match(rule.hiddenReason, /only to admins/);
  assert.equal(rule.url, "https://github.com/example/code/settings/branches");
  assert.match(
    reviewRuleText({
      repository: REPO,
      branch: "main",
      reviewRule: rule,
      checks: null,
      error: null,
    }),
    /unknown/i,
  );
  assert.doesNotMatch(
    reviewRuleText({
      repository: REPO,
      branch: "main",
      reviewRule: rule,
      checks: null,
      error: null,
    }),
    /No branch rule asks for approvals/,
  );
});

test("a ruleset count with hidden classic protection is a floor", async () => {
  const rule = await branchReviewRule(
    fake({
      branch: hiddenClassic,
      admin: false,
      rules: [
        {
          type: "pull_request",
          parameters: { required_approving_review_count: 1 },
        },
      ],
    }),
    REPO,
    "main",
  );
  assert.equal(rule.approvals, 1);
  assert.equal(rule.hidden, true);
  assert.match(
    reviewRuleText({
      repository: REPO,
      branch: "main",
      reviewRule: rule,
      checks: null,
      error: null,
    }),
    /at least 1/,
  );
});

test("an admin's 404 means no classic protection, and an unprotected branch is known", async () => {
  for (const [branch, admin] of [
    [hiddenClassic, true],
    [{ protected: false }, false],
  ]) {
    const rule = await branchReviewRule(fake({ branch, admin }), REPO, "main");
    assert.equal(rule.hidden, false, JSON.stringify({ branch, admin }));
    assert.equal(rule.approvals, 0);
  }
  // Readable classic protection is used as before, admin or not.
  const read = await branchReviewRule(
    fake({
      branch: hiddenClassic,
      admin: false,
      protection: {
        required_pull_request_reviews: { required_approving_review_count: 2 },
      },
    }),
    REPO,
    "main",
  );
  assert.equal(read.hidden, false);
  assert.equal(read.approvals, 2);
});

test("classic required checks come from the branch when protection is hidden", async () => {
  const names = await seenCheckNames(
    fake({ branch: hiddenClassic, admin: false }),
    REPO,
    "main",
  );
  assert.deepEqual(names.required, ["ci/build", "ci/test"]);
});

test("check names come from recent commits and the branch's required checks", async () => {
  const names = await seenCheckNames(
    fake({
      commits: [
        { sha: "a", runs: ["build", "lint"], statuses: ["ci/legacy"] },
        { sha: "b", runs: ["build"] },
      ],
      rules: [
        {
          type: "required_status_checks",
          parameters: { required_status_checks: [{ context: "deploy" }] },
        },
      ],
      protection: {
        required_status_checks: {
          contexts: ["lint"],
          checks: [{ context: "e2e" }],
        },
      },
    }),
    REPO,
    "main",
  );
  assert.deepEqual(
    { branch: names.branch, seen: names.seen, required: names.required },
    {
      branch: "main",
      seen: ["build", "ci/legacy", "deploy", "e2e", "lint"],
      required: ["deploy", "e2e", "lint"],
    },
  );
});

test("github.repository.inspect reads rules and checks without writing", async (t) => {
  const { store } = fixture(t),
    github = fake({
      rules: [
        {
          type: "pull_request",
          parameters: { required_approving_review_count: 1 },
        },
      ],
      commits: [{ sha: "a", runs: ["build"] }],
    }),
    ops = new Operations(store, { github });
  const before = ops.read().revision;
  const result = await ops.execute("github.repository.inspect", {
    repository: REPO,
    baseBranch: "main",
  });
  assert.equal(ops.read().revision, before);
  assert.equal(result.error, null);
  assert.equal(result.reviewRule.approvals, 1);
  assert.deepEqual(result.checks.seen, ["build"]);
  await assert.rejects(
    ops.execute("github.repository.inspect", { repository: "nope" }),
    /owner\/repository/,
  );
  const down = new Operations(store, {
    github: { ...github, available: () => false },
  });
  const offline = await down.execute("github.repository.inspect", {
    repository: REPO,
  });
  assert.match(offline.error, /GitHub/);
  assert.equal(offline.checks, null);
});

test("check names also come from open pull requests, with where each was seen", async () => {
  const github = fake({
    commits: [{ sha: "a", runs: ["build"] }],
    rules: [
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "lint" }] },
      },
    ],
  });
  github.listPullRequests = () => Promise.resolve([{ head: { sha: "p" } }]);
  const runs = github.checkRuns;
  github.checkRuns = (repository, sha) =>
    sha === "p"
      ? Promise.resolve([
          {
            name: "e2e",
            app: { name: "GitHub Actions" },
            completed_at: "2026-11-10T00:00:00Z",
          },
        ])
      : runs(repository, sha);
  const names = await seenCheckNames(github, REPO, "main");
  assert.deepEqual(names.seen, ["build", "e2e", "lint"]);
  assert.deepEqual(names.required, ["lint"]);
  assert.deepEqual(names.sources.e2e, {
    source: "GitHub Actions",
    at: "2026-11-10T00:00:00Z",
  });
  assert.equal(
    names.sources.lint,
    undefined,
    "a rule-only name was not seen running",
  );
  assert.equal(names.url, "https://github.com/example/code/settings/rules");
});

test("inspect keeps the check names when the review rule cannot be read", async (t) => {
  const { store } = fixture(t),
    github = fake({ commits: [{ sha: "a", runs: ["build"] }] });
  github.branchRules = () =>
    Promise.reject(
      Object.assign(Error("Resource not accessible"), { status: 403 }),
    );
  const ops = new Operations(store, { github });
  const result = await ops.execute("github.repository.inspect", {
    repository: REPO,
    baseBranch: "main",
  });
  assert.equal(result.reviewRule, null);
  assert.match(result.reviewError, /Resource not accessible/);
  assert.deepEqual(result.checks.seen, ["build"]);
  assert.equal(result.checksError, null);
  assert.equal(result.error, null);
});

test("inspect says not signed in instead of reading GitHub anonymously", async (t) => {
  const { store } = fixture(t),
    github = { ...fake(), available: () => true, signedIn: () => false };
  const result = await new Operations(store, { github }).execute(
    "github.repository.inspect",
    {
      repository: REPO,
      baseBranch: "main",
    },
  );
  assert.equal(result.checks, null);
  assert.match(result.error, /not signed in/);
});
