// In flight across every Avoozl: the `instance` field of the task marker and
// the name variable an Avoozl publishes in its private mirror. Fake GitHub
// only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderMarker, parseMarker } from "../github-marker.mjs";
import { publishInstanceStep } from "../instance-publish.mjs";
import {
  assertNoInstance,
  instanceIdentity,
  instanceOfVariable,
  instanceVariableName,
  instanceView,
  renameInstance,
  stripInstance,
} from "../instance.mjs";
import { fixture } from "./fixtures.mjs";

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

test("a public forward strips the instance field and refuses text that carries it", () => {
  const body = renderMarker(marker({ instance: MIRA })) + "\nBody";
  const stripped = stripInstance(body, { id: MIRA, name: "Mira" });
  assert.doesNotMatch(stripped, /instance|inst-/);
  assert.ok(parseMarker(stripped), "the marker still parses");
  assert.throws(
    () => assertNoInstance(body, { id: MIRA, name: "Mira" }),
    /must not carry the instance/,
  );
});

test("variable names round trip to the instance ID", () => {
  assert.equal(
    instanceVariableName("inst-0123456789ab"),
    "AVOOZL_INSTANCE_INST_0123456789AB",
  );
  assert.equal(
    instanceOfVariable("AVOOZL_INSTANCE_INST_0123456789AB"),
    "inst-0123456789ab",
  );
  assert.equal(instanceOfVariable("OTHER"), null);
});

function storeOf(t) {
  const { store } = fixture(t);
  return store;
}

const mirrorPolicy = (mirror = "example/code-mirror") => ({
  repositories: {
    "example/code": { mirror: { source: "example/code", mirror } },
  },
});

function variableGitHub({ isPrivate }) {
  const calls = [];
  return {
    calls,
    available: () => true,
    repository: async () => ({ private: isPrivate }),
    setRepoVariable: async (repository, name, value) =>
      calls.push({ repository, name, value }),
  };
}

test("an Avoozl publishes its name once in a private mirror and again after a rename", async (t) => {
  const store = storeOf(t),
    github = variableGitHub({ isPrivate: true }),
    { id, name } = instanceIdentity(store);
  assert.deepEqual(
    (await publishInstanceStep(store, github, { policy: mirrorPolicy() }))
      .errors,
    [],
  );
  assert.deepEqual(github.calls, [
    {
      repository: "example/code-mirror",
      name: instanceVariableName(id),
      value: name,
    },
  ]);
  await publishInstanceStep(store, github, { policy: mirrorPolicy() });
  assert.equal(github.calls.length, 1, "nothing again for the same name");
  renameInstance(store, "Fresh");
  await publishInstanceStep(store, github, { policy: mirrorPolicy() });
  assert.equal(github.calls.length, 2);
  assert.equal(github.calls[1].value, "Fresh");
});

test("an Avoozl never publishes its name to a public repository", async (t) => {
  const store = storeOf(t),
    github = variableGitHub({ isPrivate: false }),
    first = await publishInstanceStep(store, github, {
      policy: mirrorPolicy(),
    });
  assert.equal(github.calls.length, 0);
  assert.match(first.errors[0], /not private/);
  // The notice comes once, not on every tick.
  const again = await publishInstanceStep(store, github, {
    policy: mirrorPolicy(),
  });
  assert.deepEqual(again.errors, []);
  assert.equal(github.calls.length, 0);
});
