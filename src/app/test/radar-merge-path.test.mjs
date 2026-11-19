// rc-5.1: the per-repository merge path check (RC5.1, design D7), with a fake
// GitHub. Nothing here reaches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { effectiveShip, mergePath } from "../radar-merge-path.mjs";

const REPO = "example/code";

function fake({
  autoMerge = true,
  required = ["build"],
  classic = null,
  fail = null,
  allows = {},
} = {}) {
  return {
    available: () => true,
    repository: () =>
      fail
        ? Promise.reject(Error(fail))
        : Promise.resolve({
            default_branch: "main",
            allow_auto_merge: autoMerge,
            ...allows,
            permissions: { admin: true },
          }),
    branch: () => Promise.resolve({ protected: true }),
    branchRules: () =>
      Promise.resolve(
        required.length
          ? [
              {
                type: "required_status_checks",
                parameters: {
                  required_status_checks: required.map((context) => ({
                    context,
                  })),
                },
              },
            ]
          : [],
      ),
    branchProtection: () => Promise.resolve(classic),
    listCommits: () => Promise.resolve([]),
    listPullRequests: () => Promise.resolve([]),
    checkRuns: () => Promise.resolve([]),
    commitStatus: () => Promise.resolve({ statuses: [] }),
  };
}

const settings = (extra = {}) => ({
  baseBranch: "main",
  requiredChecks: ["build"],
  ...extra,
});
const ids = (result) => result.items.map((item) => [item.id, item.ok]);
const AUTO = { ship: "auto-merge" };

test("a repository with all three items reads ready", async () => {
  const result = await mergePath(fake(), REPO, settings(), { delivery: AUTO });
  assert.equal(result.ready, true);
  assert.deepEqual(ids(result), [
    ["auto-merge", true],
    ["required-check", true],
    ["ship", true],
    ["merge-method", true],
  ]);
  assert.deepEqual(result.missing, []);
});

test("each missing item is named, alone and together", async () => {
  const cases = [
    [fake({ autoMerge: false }), settings(), AUTO, ["auto-merge"]],
    [fake({ required: [] }), settings(), AUTO, ["required-check"]],
    [fake({ required: ["lint"] }), settings(), AUTO, ["required-check"]],
    [fake(), settings({ requiredChecks: [] }), AUTO, ["required-check"]],
    [fake(), settings(), {}, ["ship"]],
    // RC28.7: the merge method the repository refuses.
    [
      fake({ allows: { allow_squash_merge: false } }),
      settings(),
      AUTO,
      ["merge-method"],
    ],
    [
      fake({ allows: { allow_merge_commit: false } }),
      settings({ merge: { method: "merge" } }),
      AUTO,
      ["merge-method"],
    ],
    [
      fake({ autoMerge: false, required: [] }),
      settings(),
      {},
      ["auto-merge", "required-check", "ship"],
    ],
  ];
  for (const [github, entry, delivery, missing] of cases) {
    const result = await mergePath(github, REPO, entry, { delivery });
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, missing);
    for (const item of result.items)
      assert.equal(item.ok, !missing.includes(item.id), item.id);
    for (const id of missing)
      assert.ok(result.items.find((item) => item.id === id).detail.length > 10);
  }
});

test("the required check is named in the detail, and a classic rule counts", async () => {
  const wrong = await mergePath(
    fake({ required: ["lint"] }),
    REPO,
    settings(),
    { delivery: AUTO },
  );
  assert.match(
    wrong.items.find((item) => item.id === "required-check").detail,
    /build/,
  );
  const classic = await mergePath(
    fake({
      required: [],
      classic: { required_status_checks: { contexts: ["build"] } },
    }),
    REPO,
    settings(),
    { delivery: AUTO },
  );
  assert.equal(classic.ready, true);
});

test("a repository-level ship value counts, and beats the workspace's", async () => {
  const delivery = {
    ship: "manual",
    repositories: { [REPO]: { ship: "auto-merge" } },
  };
  assert.equal(effectiveShip(delivery, REPO), "auto-merge");
  assert.equal(effectiveShip({ ship: "manual" }, REPO), "manual");
  assert.equal(effectiveShip({}, REPO), "auto-merge");
  const result = await mergePath(fake(), REPO, settings(), { delivery });
  assert.equal(result.ready, true);
});

test("GitHub failing to answer leaves the items not ok and says why", async () => {
  const result = await mergePath(fake({ fail: "boom" }), REPO, settings(), {
    delivery: AUTO,
  });
  assert.equal(result.ready, false);
  assert.match(result.error, /boom/);
  assert.deepEqual(result.missing, [
    "auto-merge",
    "required-check",
    "merge-method",
  ]);
});
