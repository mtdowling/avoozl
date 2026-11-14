// rc-16.2: an epic with an integration branch names it as the base in the
// marker; verify-issue checks it, and a pull request into the default branch
// fails; arming follows the branch's own rule. Fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { parseProvenance, renderProvenance } from "../github-provenance.mjs";
import { verifyIssue } from "../verify-issue.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const CODE = "octo-org/octo-code";
const BRANCH = "rewrite/loader";
const prose = "# T\n\nStatus: Approved\n";
const tasks = "# Tasks\n\nStatus: Approved\n\n- [ ] rc-1 First\n";

function fake({ base = BRANCH, manifestBranch = BRANCH, pulls = {} } = {}) {
  const body = renderProvenance({
    spec: "s",
    tasks: ["rc-1"],
    commit,
    approvedBy: "octocat",
    ...(base ? { base } : {}),
  });
  const spec = `repos/${CODE}/contents/.kiro/specs/s`;
  const table = new Map([
    [`repos/${CODE}/issues/7`, { body: { body, user: { login: "owner1" } } }],
    [
      `repos/${CODE}/collaborators/octocat/permission`,
      { body: { permission: "write" } },
    ],
    [
      `repos/${CODE}/collaborators/owner1/permission`,
      { body: { permission: "admin" } },
    ],
    [`repos/${CODE}`, { body: { default_branch: "main" } }],
    [`repos/${CODE}/compare/main...${commit}`, { body: { status: "behind" } }],
    [`${spec}/requirements.md?ref=${commit}`, { text: prose }],
    [`${spec}/design.md?ref=${commit}`, { text: prose }],
    [`${spec}/tasks.md?ref=${commit}`, { text: tasks }],
    [
      `${spec}/avoozl/manifest.json?ref=${commit}`,
      {
        text: JSON.stringify(
          manifestBranch ? { integrationBranch: manifestBranch } : {},
        ),
      },
    ],
  ]);
  for (const [number, ref] of Object.entries(pulls))
    table.set(`repos/${CODE}/pulls/${number}`, { body: { base: { ref } } });
  return async (apiPath) => {
    const hit = table.get(apiPath);
    return hit
      ? { status: 200, headers: {}, text: hit.text ?? JSON.stringify(hit.body) }
      : { status: 404, headers: {}, text: "{}" };
  };
}
const run = (options, pull) =>
  verifyIssue(`${CODE}#7`, { read: fake(options), ...(pull ? { pull } : {}) });
const base = (result) => result.checks.find((c) => c.name === "base");

test("the marker carries the base, and an unusable base is refused on write and read", () => {
  const line = renderProvenance({
    spec: "s",
    tasks: ["rc-1"],
    commit,
    approvedBy: "octocat",
    base: BRANCH,
  });
  assert.equal(parseProvenance(line).marker.base, BRANCH);
  assert.equal(parseProvenance(line.replace(BRANCH, "a b")).marker, null);
  for (const bad of ["../x", "refs/heads/x", "x..y", ""])
    assert.throws(
      () =>
        renderProvenance({
          spec: "s",
          tasks: ["rc-1"],
          commit,
          approvedBy: "octocat",
          base: bad,
        }),
      /base/,
    );
  // An old reader's marker has no base and parses as before.
  assert.equal(
    parseProvenance(line.replace(` base=${BRANCH}`, "")).marker.base,
    undefined,
  );
});

test("an epic with a branch passes when the marker says it, and a pull request into the branch passes", async () => {
  const plain = await run({});
  assert.equal(base(plain).status, "ok");
  assert.equal(plain.ok, true);
  const pull = await run({ pulls: { 11: BRANCH } }, 11);
  assert.equal(base(pull).status, "ok");
  assert.equal(pull.ok, true);
});

test("a pull request into main for a branch epic fails verify-issue, naming both branches", async () => {
  const result = await run({ pulls: { 12: "main" } }, 12);
  assert.equal(result.ok, false);
  assert.equal(base(result).status, "fail");
  assert.match(base(result).reason, /main/);
  assert.match(base(result).reason, /rewrite\/loader/);
});

test("a marker without the base, or a base without a branch, fails", async () => {
  assert.equal(base(await run({ base: null })).status, "fail");
  assert.equal(base(await run({ manifestBranch: null })).status, "fail");
});

test("an epic with no branch reports no base check, and a pull request into the default branch passes", async () => {
  const none = await run({ base: null, manifestBranch: null });
  assert.equal(base(none), undefined);
  assert.equal(none.ok, true);
  const into = await run(
    { base: null, manifestBranch: null, pulls: { 13: "main" } },
    13,
  );
  assert.equal(base(into).status, "ok");
  const wrong = await run(
    { base: null, manifestBranch: null, pulls: { 14: "other" } },
    14,
  );
  assert.equal(base(wrong).status, "fail");
});

test("a hostile base branch on the pull request is not printed", async () => {
  const result = await run({ pulls: { 15: "SENTINEL TEXT" } }, 15);
  assert.equal(base(result).status, "fail");
  assert.doesNotMatch(JSON.stringify(result), /SENTINEL/);
});

test("a pull request number must be a positive integer", async () => {
  await assert.rejects(run({}, -1), /pull request as a number/);
});
