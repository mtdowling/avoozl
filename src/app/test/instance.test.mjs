// Instance names: a short display name picked once, a fixed ID beside it, the
// ID (never the name) in hidden markers, and a guard that strips both before
// text leaves a mirror for a public repository.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import { approvalMarker } from "../approval-label.mjs";
import {
  INSTANCE_NAMES,
  assertNoInstance,
  instanceIdentity,
  instanceView,
  recordSeenInstance,
  renameInstance,
  stripInstance,
} from "../instance.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// Issue Radar's crew name pool (its backend, crew_store_records.NAME_POOL).
// Avoozl names must not reuse any of them, so a name never reads as a crew.
const RADAR_NAMES = [
  "Andromeda",
  "Bode",
  "Butterfly",
  "Carina",
  "Cigar",
  "Cocoon",
  "Draco",
  "Fireworks",
  "Fornax",
  "Grus",
  "Hoag",
  "Leo",
  "Mayall",
  "Medusa",
  "Pinwheel",
  "Porpoise",
  "Sculptor",
  "Sombrero",
  "Spindle",
  "Tadpole",
  "Triangulum",
  "Tucana",
  "Ursa",
  "Whirlpool",
];

function setup(t) {
  const root = temporaryDirectory("avoozl-instance-");
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("the word list shares no name with Issue Radar's crew names, ignoring case", () => {
  const radar = new Set(RADAR_NAMES.map((name) => name.toLowerCase()));
  assert.deepEqual(
    INSTANCE_NAMES.filter((name) => radar.has(name.toLowerCase())),
    [],
  );
  assert.equal(
    new Set(INSTANCE_NAMES).size,
    INSTANCE_NAMES.length,
    "no repeats",
  );
  for (const name of INSTANCE_NAMES)
    assert.match(name, /^[A-Z][a-z]{2,11}$/, name);
});

test("the first run picks a name and a fixed ID; later runs keep both", (t) => {
  const { store } = setup(t);
  const first = instanceIdentity(store, { random: () => 0 });
  assert.equal(first.name, INSTANCE_NAMES[0]);
  assert.match(first.id, /^inst-[0-9a-f]{12}$/);
  const again = instanceIdentity(store, { random: () => 0.99 });
  assert.deepEqual(again, first);
});

test("renaming changes the name and never the ID", (t) => {
  const { store } = setup(t);
  const before = instanceIdentity(store);
  const after = renameInstance(store, "  Harbor Light ");
  assert.equal(after.name, "Harbor Light");
  assert.equal(after.id, before.id);
  assert.equal(instanceIdentity(store).name, "Harbor Light");
  for (const bad of [
    "",
    "   ",
    "x".repeat(25),
    "a<b>",
    "a\nb",
    "inst-0123456789ab",
  ])
    assert.throws(
      () => renameInstance(store, bad),
      /name/i,
      JSON.stringify(bad),
    );
});

test("one instance is quiet; another one seen in a marker turns the name on", (t) => {
  const { store } = setup(t);
  const own = instanceIdentity(store);
  assert.equal(instanceView(store).shared, false);
  recordSeenInstance(store, own.id);
  assert.equal(
    instanceView(store).shared,
    false,
    "its own ID is not another instance",
  );
  recordSeenInstance(store, "inst-aaaaaaaaaaaa");
  recordSeenInstance(store, "not an id");
  assert.equal(instanceView(store).shared, true);
  assert.deepEqual(instanceView(store).others, ["inst-aaaaaaaaaaaa"]);
});

test("the approval marker carries the ID, never the name", (t) => {
  const { store } = setup(t);
  const { id, name } = instanceIdentity(store);
  const marker = approvalMarker({
    approver: "me",
    spec: "s",
    commit: "c",
    at: "t",
    instance: id,
  });
  assert.match(marker, new RegExp(` instance=${id} -->$`));
  assert.ok(!marker.includes(name));
  assert.equal(
    approvalMarker({ approver: "me", spec: "s", commit: "c", at: "t" }),
    "<!-- avoozl-approval v=1 approver=me spec=.kiro/specs/s commit=c at=t -->",
  );
});

test("the mirror guard strips the ID, the name and their markers from outgoing text", (t) => {
  const { store } = setup(t);
  const identity = instanceIdentity(store);
  renameInstance(store, "Mira");
  const { id } = identity;
  const text = [
    `Mira hands the driver role to Juno. <!-- avoozl-approval v=1 approver=me instance=${id} -->`,
    `<!-- avoozl-driver instance=${id} name=Mira -->`,
    `Owned by ${id}.`,
    "Plain text stays.",
  ].join("\n");
  const clean = stripInstance(text, { id, name: "Mira" });
  assert.ok(!clean.includes(id));
  assert.ok(!/\bMira\b/.test(clean));
  assert.ok(!/instance=/.test(clean));
  assert.ok(clean.includes("Plain text stays."));
  assert.doesNotThrow(() => assertNoInstance(clean, { id, name: "Mira" }));
  assert.throws(
    () => assertNoInstance(text, { id, name: "Mira" }),
    /instance/i,
  );
  // A foreign ID (another instance's) is stripped by its shape too.
  assert.ok(
    !stripInstance("by inst-0123456789ab here", { id, name: "Mira" }).includes(
      "inst-0123456789ab",
    ),
  );
});

test("the operations read and rename the instance", async (t) => {
  const { ops } = setup(t);
  const view = await ops.execute("instance.view", {});
  assert.match(view.id, /^inst-/);
  assert.equal(view.shared, false);
  const renamed = await ops.execute("instance.rename", { name: "Juno" });
  assert.equal(renamed.name, "Juno");
  assert.equal(renamed.id, view.id);
});
