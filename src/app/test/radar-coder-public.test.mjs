// rc-10.1 and rc-2.6: a public repository, or one whose visibility was not
// read, releases and arms nothing until its public sign-off is complete.
// Fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_HELD, publicHold } from "../public-signoff.mjs";
import { fixture } from "./fixtures.mjs";
import { leaf, setup as release } from "./radar-coder-release-fixture.mjs";

const REPO = "example/code";
const setup = (t, record) => {
  const { store } = fixture(t);
  if (record) store.put("github_repositories", { id: REPO, ...record });
  return store;
};

test("a private repository is not held", (t) => {
  assert.equal(publicHold(setup(t, { private: true }), REPO), null);
});

test("a public repository, an unread one and an unknown one are held with a reason", (t) => {
  assert.equal(publicHold(setup(t, { private: false }), REPO), PUBLIC_HELD);
  assert.equal(publicHold(setup(t, {}), REPO), PUBLIC_HELD);
  assert.equal(publicHold(setup(t, null), REPO), PUBLIC_HELD);
});

test("a complete sign-off releases the hold, an incomplete one does not", (t) => {
  const store = setup(t, { private: false });
  store.setMeta("publicSignoff", { [REPO]: { complete: false } });
  assert.equal(publicHold(store, REPO), PUBLIC_HELD);
  store.setMeta("publicSignoff", { [REPO]: { complete: true } });
  assert.equal(publicHold(store, REPO), null);
  assert.equal(publicHold(store, "example/other"), PUBLIC_HELD);
});

const flip = (w, value) =>
  w.store.put("github_repositories", {
    ...w.store.get("github_repositories", REPO),
    private: value,
  });

test("a public repository releases nothing and the queue says why, until the sign-off is complete", async (t) => {
  const w = await release(t, { release: { capacity: 2 } }, [
    leaf("leaf-a"),
    leaf("leaf-b"),
  ]);
  flip(w, false);
  await w.tick();
  await w.tick();
  assert.deepEqual(w.readyIds(), []);
  const { repositories } = await w.ops.execute("radar.releasequeue", {});
  assert.deepEqual(
    repositories[0].rows.map((row) => row.reason),
    [PUBLIC_HELD, PUBLIC_HELD],
  );
  w.store.setMeta("publicSignoff", { [REPO]: { complete: true } });
  await w.tick();
  assert.equal(w.readyIds().length, 2);
});
