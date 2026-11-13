// The Switch model dry run (provider.switch.preview) and its confirm
// (provider.switch): what the preview lists and why, that it writes nothing,
// that both are a person's, and that Switch runs exactly the previewed set.
// The P29 workspace and fake crew driver; no Kiro Crew or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fakeCrew } from "./fake-crew.mjs";
import {
  CREWS,
  defaults,
  leaf,
  MACHINE,
  workspace,
} from "./fixtures/crews/workspace.mjs";
import { switchPreview } from "../provider-health.mjs";
import { principalAllows } from "../app-backend.mjs";
import { listSessionBindings } from "../session-bindings.mjs";

const IDS = ["r1", "r2", "r3"];
const TEN = Object.fromEntries(
  Object.entries(CREWS).map(([id, c]) => [id, { ...c, chatLimit: 10 }]),
);
const RULES = [
  {
    id: "routine",
    when: { kinds: ["leaf"] },
    session: {
      choices: [{ model: "alpha-1", weight: 2 }, { model: "beta-1" }],
    },
  },
];
const REVIEWERS = [
  {
    id: "correctness",
    focus: "correctness",
    agent: "avoozl-reviewer",
    model: "delta-1",
    distinctFrom: "model",
  },
];

async function setup(t, { manifest = {}, ids = IDS, crews = TEN } = {}) {
  const env = await workspace(t, {
    crews,
    ids,
    manifest: Object.fromEntries(
      ids.map((id) => [id, { ...leaf(`${id} is routine.`), ...manifest[id] }]),
    ),
    routing: { rules: RULES },
    delivery: { model: "alpha-1", reviewers: REVIEWERS },
    agents: {
      "fake-linux": ["kirocrew-worker", "avoozl-verifier", "avoozl-reviewer"],
    },
  });
  const value = JSON.parse(fs.readFileSync(MACHINE, "utf8"));
  value.providers = { fallback: ["gamma-1"] };
  fs.writeFileSync(MACHINE, JSON.stringify(value, null, 2));
  await fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: Object.fromEntries(ids.map((id) => [`${id}:worker`, "hold"])),
  }).tick();
  return env;
}

const tables = (store) =>
  JSON.stringify(
    ["provider_switches", "provider_health", "session_bindings"].map((t) =>
      store.list(t),
    ),
  );

test("the dry run lists each chat it moves with task, spec, models and place, and writes nothing", async (t) => {
  const { ops, store } = await setup(t);
  const before = tables(store);
  const preview = await ops.execute("provider.switch.preview", {
    from: { model: "alpha-1" },
    to: "gamma-1",
  });
  assert.equal(tables(store), before, "a dry run changes nothing");
  assert.equal(preview.chats.length, 2);
  for (const chat of preview.chats) {
    assert.equal(chat.model, "alpha-1");
    assert.equal(chat.to, "gamma-1");
    assert.equal(chat.where, "local");
    assert.match(chat.title, /^Do r\d$/);
    assert.ok("spec" in chat);
  }
  assert.deepEqual(preview.counts, { move: 2, stay: 0, newTasks: 0 });
  assert.deepEqual(preview.newTasks, []);
  // To can be auto: Kiro Crew picks the model.
  const auto = await ops.execute("provider.switch.preview", {
    from: { model: "beta-1" },
    to: "auto",
  });
  assert.deepEqual(
    auto.chats.map((c) => [c.model, c.to]),
    [["beta-1", "auto"]],
  );
});

test("the dry run says why a chat stays: remote, pinned, a distinct reviewer, already there", async (t) => {
  const { ops, store } = await setup(t, {
    manifest: { r3: { session: { model: "alpha-1" } } },
  });
  // r1's chat runs on a remote crew.
  const r1 = listSessionBindings(store).find((b) => b.taskId === "p29.1");
  store.put("session_bindings", { ...r1, crew: "fake-linux" });
  const preview = await ops.execute("provider.switch.preview", {
    from: { provider: "alpha" },
    to: "gamma-1",
  });
  const why = Object.fromEntries(preview.skipped.map((s) => [s.taskId, s.why]));
  assert.match(why["p29.1"], /runs on fake-linux/);
  assert.match(why["p29.3"], /pins alpha-1/);
  assert.equal(preview.chats.length, 0);
  assert.equal(preview.counts.stay, 2);

  const toReviewer = await ops.execute("provider.switch.preview", {
    from: { model: "beta-1" },
    to: "delta-1",
  });
  assert.match(toReviewer.skipped[0].why, /review role's model/);
  const same = await ops.execute("provider.switch.preview", {
    from: { tasks: ["p29.2"] },
    to: "beta-1",
  });
  assert.match(same.skipped[0].why, /already on beta-1/);
});

test("the dry run names a chosen task Issue Radar codes, or one with no chat", () => {
  const preview = switchPreview(
    { list: () => [] },
    { from: { tasks: ["x1", "x2"] }, to: "gamma-1" },
    {
      settings: {},
      issueRadar: (id) => id === "x1",
      taskInfo: (id) => ({ title: `Task ${id}`, spec: null }),
    },
  );
  assert.deepEqual(
    preview.skipped.map((s) => [s.taskId, s.why]),
    [
      ["x1", "Issue Radar codes it; Avoozl cannot change its chat"],
      ["x2", "no running chat"],
    ],
  );
});

test("with Also new tasks, the dry run lists queued tasks the rule moves off From", () => {
  const preview = switchPreview(
    { list: () => [] },
    { from: { provider: "alpha" }, to: "gamma-1", alsoNewTasks: true },
    {
      settings: {},
      queued: [
        { taskId: "q1", title: "Queued one", model: "alpha-1" },
        { taskId: "q2", title: "Queued two", model: "beta-1" },
        { taskId: "q3", title: "Queued three", model: null },
      ],
    },
  );
  assert.deepEqual(preview.newTasks, [
    { taskId: "q1", title: "Queued one", model: "alpha-1" },
  ]);
  assert.equal(preview.counts.newTasks, 1);
  const without = switchPreview(
    { list: () => [] },
    { from: { provider: "alpha" }, to: "gamma-1" },
    {
      settings: {},
      queued: [{ taskId: "q1", title: "Queued one", model: "alpha-1" }],
    },
  );
  assert.deepEqual(without.newTasks, []);
  assert.notEqual(preview.previewHash, without.previewHash);
});

test("the dry run and the switch are a person's only", async (t) => {
  const { ops } = await setup(t);
  const input = { from: { model: "alpha-1" }, to: "gamma-1" };
  for (const name of ["provider.switch.preview", "provider.switch"]) {
    await assert.rejects(
      ops.execute(name, { ...input, previewHash: "x" }, undefined, {
        mcp: true,
      }),
      /Only a person/,
    );
    for (const kind of ["app-token", "agent-tool"])
      assert.equal(principalAllows({ kind }, name), false, `${kind} ${name}`);
    assert.equal(principalAllows({ kind: "owner-session" }, name), true);
  }
});

test("Switch runs exactly the previewed set and refuses a changed one", async (t) => {
  const { ops, store } = await setup(t);
  const input = { from: { model: "alpha-1" }, to: "gamma-1" };
  const preview = await ops.execute("provider.switch.preview", input);
  // A previewed chat ends: the set changed, so Switch asks again.
  const gone = preview.chats[0];
  const binding = store.get("session_bindings", gone.slot);
  store.put("session_bindings", { ...binding, status: "closed" });
  await assert.rejects(
    ops.execute("provider.switch", {
      ...input,
      previewHash: preview.previewHash,
    }),
    (error) =>
      error.status === 409 && /changed since the preview/.test(error.message),
  );
  const again = await ops.execute("provider.switch.preview", input);
  assert.equal(again.chats.length, preview.chats.length - 1);
  const result = await ops.execute("provider.switch", {
    ...input,
    previewHash: again.previewHash,
  });
  assert.equal(result.queued, again.chats.length);
  assert.deepEqual(
    result.switches.map((s) => [s.slot, s.from, s.to]),
    again.chats.map((c) => [c.slot, c.model, "gamma-1"]),
  );
});
