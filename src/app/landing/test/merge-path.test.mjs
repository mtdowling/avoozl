// rc-5.1: the per-repository merge path check (RC5.1, design D7), with a fake
// GitHub. Nothing here reaches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { effectiveShip, mergePath } from "../merge-path.mjs";

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

// Who merges is the repository's landing.autoMerge; `on` sets it.
const settings = (extra = {}, autoMerge = true) => ({
  baseBranch: "main",
  requiredChecks: ["build"],
  ...extra,
  landing: { autoMerge, ...extra.landing },
});
const unset = () => ({ baseBranch: "main", requiredChecks: ["build"] });
const ids = (result) => result.items.map((item) => [item.id, item.ok]);

test("a repository with all three items reads ready", async () => {
  const result = await mergePath(fake(), REPO, settings());
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
    [fake({ autoMerge: false }), settings(), ["auto-merge"]],
    [fake({ required: [] }), settings(), ["required-check"]],
    [fake({ required: ["lint"] }), settings(), ["required-check"]],
    [fake(), settings({ requiredChecks: [] }), ["required-check"]],
    [fake(), unset(), ["ship"]],
    // RC28.7: the merge method the repository refuses.
    [
      fake({ allows: { allow_squash_merge: false } }),
      settings(),
      ["merge-method"],
    ],
    [
      fake({ allows: { allow_merge_commit: false } }),
      settings({ landing: { method: "merge" } }),
      ["merge-method"],
    ],
    [
      fake({ autoMerge: false, required: [] }),
      unset(),
      ["auto-merge", "required-check", "ship"],
    ],
  ];
  for (const [github, entry, missing] of cases) {
    const result = await mergePath(github, REPO, entry);
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, missing);
    for (const item of result.items)
      assert.equal(item.ok, !missing.includes(item.id), item.id);
    for (const id of missing)
      assert.ok(result.items.find((item) => item.id === id).detail.length > 10);
  }
});

test("the required check is named in the detail, and a classic rule counts", async () => {
  const wrong = await mergePath(fake({ required: ["lint"] }), REPO, settings());
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
  );
  assert.equal(classic.ready, true);
});

test("the repository's landing.autoMerge sets the ship mode", async () => {
  assert.equal(effectiveShip(settings()), "auto-merge");
  assert.equal(effectiveShip(settings({}, false)), "manual");
  assert.equal(effectiveShip(unset()), "auto-merge");
  const manual = await mergePath(fake(), REPO, settings({}, false));
  assert.equal(manual.ready, true);
  assert.equal(manual.ship, "manual");
});

test("GitHub failing to answer leaves the items not ok and says why", async () => {
  const result = await mergePath(fake({ fail: "boom" }), REPO, settings());
  assert.equal(result.ready, false);
  assert.match(result.error, /boom/);
  assert.deepEqual(result.missing, [
    "auto-merge",
    "required-check",
    "merge-method",
  ]);
});

test("pk-1.5: a required name a plugin check provides here needs no branch rule; a CI name still does", async () => {
  const both = settings({ requiredChecks: ["build", "parity"] }),
    asked = await mergePath(fake({ required: [] }), REPO, both, {
      local: ["parity"],
    });
  const check = asked.items.find((item) => item.id === "required-check");
  assert.equal(check.ok, false);
  assert.match(check.detail, /does not require build\./);
  assert.doesNotMatch(check.detail, /parity/);
  const ruled = await mergePath(fake({ required: ["build"] }), REPO, both, {
    local: ["parity"],
  });
  assert.equal(
    ruled.items.find((item) => item.id === "required-check").ok,
    true,
  );
});
