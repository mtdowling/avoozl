// rc-10.1 and rc-2.6: a public repository, or one whose visibility was not
// read, is held until its public sign-off is complete.
// Fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_HELD, publicHold } from "../public-signoff.mjs";
import { signedOff } from "./public-signoff-fixture.mjs";
import { fixture } from "./fixtures.mjs";

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
  signedOff(store, REPO);
  assert.equal(publicHold(store, REPO), null);
  assert.equal(publicHold(store, "example/other"), PUBLIC_HELD);
});
