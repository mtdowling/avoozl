import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "../../task-identity.mjs";

test("browser identities use the available native UUID implementation", () => {
  const source = {
    randomUUID() {
      assert.equal(this, source);
      return "native-id";
    },
  };
  assert.equal(randomUUID(source), "native-id");
});
test("intranet HTTP can generate cryptographic UUIDs without randomUUID", () => {
  const source = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };
  const ids = Array.from({ length: 256 }, () => randomUUID(source));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
test("browser identities never fall back to an insecure random source", () => {
  assert.throws(() => randomUUID({}), /Secure random values/);
});
