import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertPlanningLink,
  assertPlanningProjectItem,
  generateNamespace,
  parseMarker,
  planningIdentity,
  renderMarker,
  requireNamespace,
  validateMarker,
  withOrder,
  withoutOrder,
} from "../github-marker.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const hash = "a".repeat(64);

function marker(overrides = {}) {
  return {
    version: 2,
    taskId: "w3.reactor-timers",
    namespace: "avz_k3q9m2x7v4d8p1ta",
    kind: "leaf",
    parent: "w3",
    source: { commit: "b".repeat(40), manifest: hash },
    edges: { conditions: { "w2.core": "integrated" }, supports: ["w4"] },
    applied: {
      title: hash,
      body: hash,
      labels: ["agent:managed"],
      blockers: ["I_kwDOErhbSc4BrPjQ"],
      project: { Release: "runtime-flip", Wave: 2 },
    },
    ...overrides,
  };
}

test("namespaces are avz_ and 16 base32 characters from 80 random bits", () => {
  const values = new Set(Array.from({ length: 200 }, generateNamespace));
  assert.equal(values.size, 200);
  for (const value of values) assert.match(value, /^avz_[a-z2-7]{16}$/);
});

test("version 2 markers round-trip and version 1 stays readable", () => {
  const body = renderMarker(marker()) + "\nHuman text.";
  assert.deepEqual(parseMarker(body), marker());
  const legacy = { version: 1, taskId: "old", planId: "plan", planHash: "x" };
  assert.deepEqual(
    parseMarker(`<!-- avoozl-task\n${JSON.stringify(legacy)}\n-->`),
    legacy,
  );
  assert.equal(parseMarker("no marker"), null);
  // A tampered version 2 marker is not trusted as Avoozl's own.
  assert.equal(
    parseMarker(
      `<!-- avoozl-task\n${JSON.stringify(marker({ extra: 1 }))}\n-->`,
    ),
    null,
  );
});

test("markers refuse paths, credentials, planning repository names, and free fields", () => {
  const cases = [
    [marker({ parent: "/Users/someone/plans" }), /path/],
    [
      marker({
        applied: { ...marker().applied, labels: ["~/secret-plans"] },
      }),
      /path/,
    ],
    [
      marker({
        applied: {
          ...marker().applied,
          labels: ["ghp_" + "A1b2C3d4E5f6G7h8I9j0"],
        },
      }),
      /token/,
    ],
    [marker({ source: { commit: "main", manifest: hash } }), /source.commit/],
    [
      marker({ source: { commit: null, manifest: hash, path: "plans/x" } }),
      /unsupported fields: path/,
    ],
    [marker({ planId: "plan" }), /unsupported fields: planId/],
    [marker({ namespace: "avoozl123" }), /namespace/],
  ];
  for (const [value, pattern] of cases)
    assert.throws(() => validateMarker(value), pattern);
  const leak = marker({
    applied: {
      ...marker().applied,
      project: { Release: "Example-Org/Example-Plans#4" },
    },
  });
  assert.doesNotThrow(() => validateMarker(leak));
  assert.throws(
    () =>
      validateMarker(leak, { planningRepository: "example-org/example-plans" }),
    /names the planning repository/,
  );
  assert.throws(
    () =>
      renderMarker(leak, { planningRepository: "example-org/example-plans" }),
    /names the planning repository/,
  );
});

test("an order records the close and reopening removes it", () => {
  const ordered = withOrder(marker(), {
    actor: "mtdowling",
    reason: "NOT_PLANNED",
    closedAt: "2026-11-12T06:00:00Z",
  });
  assert.deepEqual(ordered.order, {
    actor: "mtdowling",
    reason: "NOT_PLANNED",
    closedAt: "2026-11-12T06:00:00Z",
  });
  assert.deepEqual(parseMarker(renderMarker(ordered)), ordered);
  assert.equal("order" in withoutOrder(ordered), false);
  assert.throws(
    () =>
      withOrder(marker(), {
        actor: "mtdowling",
        reason: "DUPLICATE",
        closedAt: "2026-11-12T06:00:00Z",
      }),
    /order.reason/,
  );
});

test("the planning identity comes from .avoozl.json", () => {
  const root = temporaryDirectory();
  assert.deepEqual(planningIdentity(root), {
    namespace: null,
    mode: null,
    planningRepository: null,
    epicIssueType: null,
    maxPerParent: 100,
    includeDone: false,
    repositories: {},
  });
  assert.throws(
    () => requireNamespace(planningIdentity(root)),
    /"namespace": "avz_[a-z2-7]{16}"/,
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_k3q9m2x7v4d8p1ta",
      github: { mode: "plans-repo", planningRepository: "example/plans" },
    }),
  );
  assert.deepEqual(planningIdentity(root), {
    namespace: "avz_k3q9m2x7v4d8p1ta",
    mode: "plans-repo",
    planningRepository: "example/plans",
    epicIssueType: null,
    maxPerParent: 100,
    includeDone: false,
    repositories: {},
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, namespace: "avoozl123" }),
  );
  assert.throws(() => planningIdentity(root), /namespace must be avz_/);
});

test("plans-repo mode links and adds only planning issues", () => {
  const identity = {
    mode: "plans-repo",
    planningRepository: "example/plans",
  };
  assert.doesNotThrow(() =>
    assertPlanningLink(identity, "example/plans", "Example/Plans"),
  );
  assert.throws(
    () => assertPlanningLink(identity, "example/plans", "example/app"),
    /example\/app is not the planning repository/,
  );
  assert.doesNotThrow(() =>
    assertPlanningProjectItem(identity, { repository: "example/plans" }),
  );
  assert.throws(
    () =>
      assertPlanningProjectItem(identity, {
        repository: "example/plans",
        pullRequest: true,
      }),
    /no pull request/,
  );
  assert.throws(
    () => assertPlanningProjectItem(identity, { repository: "example/app" }),
    /not the planning repository/,
  );
  assert.doesNotThrow(() =>
    assertPlanningLink({ mode: "single-repo" }, "example/a", "other/b"),
  );
});
