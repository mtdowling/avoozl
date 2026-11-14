// rc-5.1: the per-repository merge path check (RC5.1, design D7), with a fake
// GitHub. Nothing here reaches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import {
  effectiveShip,
  mergePath,
  requireMergePath,
} from "../radar-merge-path.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code";

function fake({
  autoMerge = true,
  required = ["build"],
  classic = null,
  fail = null,
} = {}) {
  return {
    available: () => true,
    repository: () =>
      fail
        ? Promise.reject(Error(fail))
        : Promise.resolve({
            default_branch: "main",
            allow_auto_merge: autoMerge,
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
  coder: "issue-radar",
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
  assert.deepEqual(result.missing, ["auto-merge", "required-check"]);
});

test("requireMergePath refuses auto-merge when not ready, warns for manual", () => {
  const notReady = {
    repository: REPO,
    ship: "auto-merge",
    ready: false,
    missing: ["auto-merge"],
    items: [
      { id: "auto-merge", ok: false, label: "Auto-merge allowed", detail: "x" },
    ],
  };
  assert.throws(
    () => requireMergePath([notReady]),
    (error) =>
      error.status === 409 &&
      /example\/code/.test(error.message) &&
      /Auto-merge allowed/.test(error.message),
  );
  assert.deepEqual(requireMergePath([{ ...notReady, ship: "manual" }]), [
    { repository: REPO, missing: ["auto-merge"] },
  ]);
  assert.deepEqual(
    requireMergePath([{ ...notReady, ready: true, missing: [] }]),
    [],
  );
});

function operations(t, { github, ship, coder = "issue-radar" }) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: { baseBranch: "main", requiredChecks: ["build"], coder },
        },
      },
      ...(ship ? { delivery: { ship } } : {}),
    }),
  );
  return new Operations(store, { github, workspaceRoot: root });
}

test("radar.mergepath shows the three items for each Radar repository and writes nothing", async (t) => {
  const ops = operations(t, {
    github: fake({ autoMerge: false }),
    ship: "auto-merge",
  });
  const before = ops.read().revision;
  const result = await ops.execute("radar.mergepath", {});
  assert.equal(ops.read().revision, before);
  assert.equal(result.repositories.length, 1);
  assert.deepEqual(result.repositories[0].missing, ["auto-merge"]);
  assert.equal(result.repositories[0].items.length, 3);
  const none = await operations(t, {
    github: fake(),
    ship: "auto-merge",
    coder: "worker",
  }).execute("radar.mergepath", {});
  assert.deepEqual(none.repositories, []);
});

test("Create and release is refused for auto-merge while not ready; held create is not", async (t) => {
  const ops = operations(t, {
    github: fake({ autoMerge: false }),
    ship: "auto-merge",
  });
  await assert.rejects(
    ops.execute("github.project", { planId: "none", release: true }),
    (error) => error.status === 409 && /Auto-merge allowed/.test(error.message),
  );
  // Without `release` the gate is not consulted, so the failure is the plan's.
  await assert.rejects(
    ops.execute("github.project", { planId: "none" }),
    (error) => !/Auto-merge allowed/.test(error.message),
  );
});

test("Create and release only warns for manual", async (t) => {
  const ops = operations(t, {
    github: fake({ autoMerge: false }),
    ship: "manual",
  });
  await assert.rejects(
    ops.execute("github.project", { planId: "none", release: true }),
    (error) => !/Auto-merge allowed/.test(error.message),
  );
});
