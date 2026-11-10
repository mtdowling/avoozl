import test from "node:test";
import assert from "node:assert/strict";
import { stripOverlayParent } from "./strip.mjs";

test("strip overlays remain inside a shadow-root style boundary", () => {
  const body = {};
  const shadowRoot = { nodeType: 11 };
  assert.equal(
    stripOverlayParent({
      ownerDocument: { body },
      getRootNode: () => shadowRoot,
    }),
    shadowRoot,
  );
  assert.equal(
    stripOverlayParent({
      ownerDocument: { body },
      getRootNode: () => ({ nodeType: 9 }),
    }),
    body,
  );
});
