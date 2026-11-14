// rc-2.6: each failing preflight item refuses Create and release and is named;
// a passing run is ok. The crew label scope can never be verified, so it is
// shown and never refuses. Pure: a fake store and a fake merge path.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { leaf, setup } from "./radar-coder-release-fixture.mjs";
import { preflight, requirePreflight } from "../radar-preflight.mjs";

const REPO = "example/code";
const APPROVED = "# S\n\nStatus: Approved\n";
const plan = (extra = {}) => ({
  id: "s",
  hash: "h",
  spec: "s",
  files: {
    "requirements.md": APPROVED,
    "design.md": APPROVED,
    "tasks.md": APPROVED,
  },
  ...extra,
});
const ready = { ready: true, items: [] };
const store = ({ merged = true, signoff = false, isPrivate = true } = {}) => ({
  getMeta: (key) =>
    key === "publicSignoff"
      ? signoff
        ? { [REPO]: { complete: true } }
        : undefined
      : merged
        ? {
            state: "merged",
            commit: "0123456789abcdef0123456789abcdef01234567",
          }
        : undefined,
  get: () => ({ private: isPrivate }),
});
const run = (extra = {}) =>
  preflight({
    store: store(extra.store),
    plan: plan(extra.plan),
    repository: REPO,
    approved: true,
    decisionRecord: true,
    mergePath: ready,
    delivery: { ship: "auto-merge" },
    ...extra.input,
  });
const failing = (result) =>
  result.items.filter((i) => i.status === "fail").map((i) => i.id);

test("a passing run is ok, and the crew scope is shown as unverified", () => {
  const result = run();
  assert.equal(result.ok, true);
  assert.deepEqual(failing(result), []);
  assert.equal(
    result.items.find((i) => i.id === "crew-scope").status,
    "unverified",
  );
  assert.doesNotThrow(() => requirePreflight(result));
});

test("each item fails alone and is named in the refusal", () => {
  const cases = [
    ["spec", { input: { approved: false } }],
    ["spec", { plan: { files: { "tasks.md": "# S\n\nStatus: Draft\n" } } }],
    ["decision", { store: { merged: false } }],
    [
      "merge-path",
      {
        input: {
          mergePath: {
            ready: false,
            items: [
              { ok: false, label: "Auto-merge allowed", detail: "turn it on" },
            ],
          },
        },
      },
    ],
    ["public-signoff", { store: { isPrivate: false } }],
  ];
  for (const [id, extra] of cases) {
    const result = run(extra);
    assert.equal(result.ok, false, id);
    assert.ok(failing(result).includes(id), id);
    assert.throws(
      () => requirePreflight(result),
      (error) =>
        error.status === 409 &&
        error.message.includes(result.items.find((i) => i.id === id).label),
      id,
    );
  }
});

test("manual ship mode does not need a ready merge path, and a sign-off clears a public repository", () => {
  const notReady = { ready: false, items: [] };
  assert.equal(
    run({ input: { mergePath: notReady, delivery: { ship: "manual" } } }).ok,
    true,
  );
  assert.equal(run({ store: { isPrivate: false, signoff: true } }).ok, true);
});

test("the decision record is not needed when the repository turns it off", () => {
  assert.equal(
    run({ store: { merged: false }, input: { decisionRecord: false } }).ok,
    true,
  );
});

test("radar.preflight reads without writing, and Create and release names the failing items", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, [leaf("leaf-a")]);
  const file = path.join(w.root, ".avoozl.json"),
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(
    file,
    JSON.stringify({ ...config, delivery: { ship: "manual" } }),
  );
  const before = w.store.read().revision;
  const { preflight: result } = await w.ops.execute("radar.preflight", {
    planId: "rel",
    repository: REPO,
  });
  assert.equal(w.store.read().revision, before);
  assert.equal(result.items.length, 5);
  assert.equal(result.ok, false);
  await assert.rejects(
    w.ops.execute("github.project", {
      planId: "rel",
      repository: REPO,
      release: true,
    }),
    (error) => error.status === 409 && /Preflight failed/.test(error.message),
  );
});
