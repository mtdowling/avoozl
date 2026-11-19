// In flight across every Avoozl: the `instance` field of the task marker.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderMarker, parseMarker } from "../../github/github-marker.mjs";
import { fixture } from "../../test/fixtures.mjs";

const MIRA = "inst-00000000a001",
  JUNO = "inst-00000000b002",
  DIGEST = "0".repeat(64);

const marker = (extra = {}) => ({
  version: 2,
  taskId: "t1",
  namespace: "avz_testtesttesttest",
  kind: "leaf",
  source: { commit: null, manifest: DIGEST },
  applied: { title: DIGEST, body: DIGEST, labels: [], blockers: [] },
  ...extra,
});

test("a marker reads with or without instance, and refuses a bad one", () => {
  const old = renderMarker(marker()),
    stamped = renderMarker(marker({ instance: MIRA }));
  assert.equal(parseMarker(old).instance, undefined);
  assert.equal(parseMarker(stamped).instance, MIRA);
  assert.throws(
    () => renderMarker(marker({ instance: "Mira" })),
    /Invalid marker: instance/,
  );
});
