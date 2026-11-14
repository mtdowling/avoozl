// Proof rc-p10 on a fake GitHub: a public repository releases nothing before
// its public sign-off is complete, and releases after. Temporary workspace and
// fake GitHub only. The live run is the owner's.
import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_HELD } from "../public-signoff.mjs";
import { leaf, setup, labelsOf } from "./radar-coder-release-fixture.mjs";

const REPO = "example/code";
const visibility = (w, value) =>
  w.store.put("github_repositories", {
    ...w.store.get("github_repositories", REPO),
    private: value,
  });
const readyWrites = (w) =>
  w.github.labels.filter(
    ([kind, , ...names]) => kind === "add" && names.includes("ready"),
  );

test("public repository: nothing releases before the sign-off, the queue says why, tasks release after", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, [
    leaf("leaf-a"),
    leaf("leaf-b"),
  ]);
  const issues = () => w.github.created.map((issue) => labelsOf(issue));

  // Before: public, then unread visibility. No ready label is ever written.
  for (const value of [false, undefined]) {
    visibility(w, value);
    await w.tick();
    await w.tick();
    assert.deepEqual(w.readyIds(), [], `visibility ${value}`);
    assert.deepEqual(readyWrites(w), []);
    const { repositories } = await w.ops.execute("radar.releasequeue", {});
    assert.deepEqual(
      repositories[0].rows.map((row) => row.reason),
      [PUBLIC_HELD, PUBLIC_HELD],
    );
  }
  assert.ok(issues().every((labels) => !labels.includes("ready")));

  // An incomplete sign-off still holds.
  visibility(w, false);
  w.store.setMeta("publicSignoff", { [REPO]: { complete: false } });
  await w.tick();
  assert.deepEqual(w.readyIds(), []);

  // After: a complete sign-off releases up to the capacity.
  w.store.setMeta("publicSignoff", { [REPO]: { complete: true } });
  await w.tick();
  assert.equal(w.readyIds().length, 2);
  assert.equal(readyWrites(w).length, 2);
});
