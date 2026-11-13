// Proof P44: provider health and switching models (tasks.md Phase 30,
// design §4.20, Requirement 72). The P29 workspace and fake crew driver, fake
// usage rows, fake session error rows, and a fake Kiro Crew model change.
// Tested only against fakes: no Kiro Crew, network, or real workspace.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fakeCrew } from "./fake-crew.mjs";
import {
  CREWS,
  defaults,
  leaf,
  MACHINE,
  workspace,
} from "./fixtures/crews/workspace.mjs";
import { ingestUsage } from "../flow-usage.mjs";
import {
  applySwitches,
  errorKind,
  healthContext,
  healthyChoices,
  ingestProviderErrors,
  providerOf,
  providersInput,
  refreshHealth,
} from "../provider-health.mjs";
import { chooseSession, validateTrackedRouting } from "../placement.mjs";
import { servedModel } from "../delivery.mjs";
import { principalAllows } from "../app-backend.mjs";
import { listActivity } from "../activity-log.mjs";

const IDS = ["r1", "r2", "r3"];
const MANIFEST = Object.fromEntries(
  IDS.map((id) => [id, leaf(`${id} is routine.`)]),
);
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
const PROVIDERS = {
  limits: { "alpha-1": { credits: 100 } },
  fallback: ["delta-1", "gamma-1"],
  cooldownMinutes: 30,
};
const hold = Object.fromEntries(IDS.map((id) => [`${id}:worker`, "hold"]));
const writers = (result) =>
  Object.fromEntries(
    result.dispatch.filter((d) => d.role === "worker").map((d) => [d.task, d]),
  );

function machine(providers) {
  const value = JSON.parse(fs.readFileSync(MACHINE, "utf8"));
  if (providers) value.providers = providers;
  else delete value.providers;
  fs.writeFileSync(MACHINE, JSON.stringify(value, null, 2));
}

async function setup(t, { providers = PROVIDERS, ...options } = {}) {
  const env = await workspace(t, {
    crews: TEN,
    ids: IDS,
    manifest: MANIFEST,
    routing: { rules: RULES },
    delivery: { model: "alpha-1", reviewers: REVIEWERS },
    agents: {
      "fake-linux": ["kirocrew-worker", "avoozl-verifier", "avoozl-reviewer"],
    },
    ...options,
  });
  machine(providers);
  return env;
}

const turn = (store, model, credits, ts = new Date().toISOString()) =>
  ingestUsage(store, { slot: `feed-${model}-${ts}`, taskId: "feed" }, [
    { ts, model, input: 0, output: 0, credits },
  ]);

test("P44 action 1: with no providers settings routing is unchanged", async (t) => {
  const env = await setup(t, { providers: null });
  const health = healthContext(env.store);
  assert.equal(health.empty, true);
  const choices = [{ model: "alpha-1", weight: 1 }];
  assert.equal(healthyChoices(choices, health).pool, choices);
  const preview = await env.ops.execute("routing.preview", {});
  for (const item of preview.items) {
    assert.doesNotMatch(item.sessionReason, /skipped|fallback|is out/);
    assert.ok(["alpha-1", "beta-1"].includes(item.model));
  }
});

test("P44 actions 2-3: usage marks alpha-1 low, then out; new tasks skip it and Preview says why", async (t) => {
  const env = await setup(t),
    { ops, store } = env;
  turn(store, "alpha-1", 85);
  refreshHealth(store);
  assert.equal(healthContext(store).level("alpha-1"), "low");
  let preview = await ops.execute("routing.preview", {});
  assert.ok(preview.items.every((i) => i.model === "beta-1"));
  assert.match(preview.items[0].sessionReason, /skipped alpha-1 is low/);

  turn(store, "alpha-1", 20);
  refreshHealth(store);
  assert.equal(healthContext(store).level("alpha-1"), "out");
  const placed = writers(
    await fakeCrew(ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: hold,
    }).tick(),
  );
  assert.equal(Object.keys(placed).length, IDS.length);
  for (const d of Object.values(placed)) {
    assert.equal(d.model, "beta-1", "no session opens on an out model");
    assert.match(d.sessionReason, /skipped alpha-1 is out/);
  }
  // The window drops below the low line: the usage mark clears by itself.
  refreshHealth(store, { now: Date.now() + 6 * 3600000 });
  assert.equal(healthContext(store).level("alpha-1"), "ok");
});

test("P44 actions 2-3: every choice out takes the fallback, never a review role's model, else waits", async (t) => {
  const env = await setup(t),
    { ops, store } = env;
  turn(store, "alpha-1", 100);
  ingestProviderErrors(store, { slot: "x", model: "beta-1" }, [
    {
      role: "error",
      meta: { kind: "usage_limit" },
      ts: new Date().toISOString(),
    },
  ]);
  refreshHealth(store);
  let preview = await ops.execute("routing.preview", {});
  for (const item of preview.items) {
    assert.equal(item.model, "gamma-1", "delta-1 is the reviewer's model");
    assert.match(item.sessionReason, /fallback gamma-1/);
  }
  machine({ ...PROVIDERS, fallback: ["delta-1"] });
  preview = await ops.execute("routing.preview", {});
  for (const item of preview.items) {
    assert.equal(item.crew, null);
    assert.match(item.reason, /every model it may use is out/);
  }
  const crew = fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold,
  });
  assert.deepEqual(writers(await crew.tick()), {});
  const noFit = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "no-fit",
  );
  assert.equal(noFit.length, 0, "health waits open no no-fit decision");
});

test("P44 actions 4-5: error rows mark health by kind, store no text, and recover", async (t) => {
  const env = await setup(t),
    { store } = env,
    t0 = Date.now(),
    at = (minutes) => new Date(t0 + minutes * 60000).toISOString();
  assert.equal(
    errorKind({ role: "error", content: "HTTP 429 Too Many Requests" }),
    "rate",
  );
  assert.equal(
    errorKind({ role: "error", content: "You are out of credits" }),
    "credits",
  );
  assert.equal(errorKind({ role: "assistant", content: "rate limit" }), null);
  assert.equal(errorKind({ role: "error", content: "disk full" }), null);
  ingestProviderErrors(store, { slot: "b", model: "beta-1" }, [
    {
      role: "error",
      meta: { kind: "usage_limit" },
      content: "secret words",
      ts: at(0),
    },
  ]);
  ingestProviderErrors(store, { slot: "a", model: "alpha-2" }, [
    { role: "error", content: "429 rate limit reached", ts: at(1) },
  ]);
  assert.equal(
    healthContext(store).level("beta-9"),
    "out",
    "the provider is out",
  );
  assert.equal(healthContext(store).level("alpha-2"), "low");
  assert.equal(
    healthContext(store).level("alpha-1"),
    "ok",
    "a rate limit marks one model",
  );
  ingestProviderErrors(store, { slot: "a", model: "alpha-2" }, [
    { role: "error", content: "429 rate limit reached", ts: at(2) },
  ]);
  assert.equal(healthContext(store).level("alpha-2"), "out");
  assert.doesNotMatch(
    JSON.stringify(store.list("provider_health")),
    /secret words|rate limit reached/,
  );
  // An auto session marks nothing.
  assert.equal(
    ingestProviderErrors(store, { slot: "z", model: null }, [
      { role: "error", content: "429", ts: at(3) },
    ]),
    0,
  );
  // A later beta turn clears the provider; the cooldown clears alpha-2.
  turn(store, "beta-1", 1, at(4));
  refreshHealth(store, { now: t0 + 5 * 60000 });
  assert.equal(healthContext(store).level("beta-1"), "ok");
  assert.equal(
    healthContext(store, { now: t0 + 33 * 60000 }).level("alpha-2"),
    "ok",
  );
  refreshHealth(store, { now: t0 + 34 * 60000 });
  assert.equal(store.list("provider_health").length, 0);
});

test("P44 action 6: a retry keeps its model while low and moves off it when out", () => {
  const rules = RULES.map((r) => ({ ...r, source: "workspace" })),
    subject = { kind: "leaf", labels: [], role: "worker" },
    health = (level) => ({
      empty: false,
      level: (m) => (m === "alpha-1" ? level : "ok"),
      replacement: () => null,
      fallback: [],
    }),
    kept = { agent: null, model: "alpha-1" };
  const low = chooseSession({
    task: {},
    role: "worker",
    rules,
    subject,
    kept,
    health: health("low"),
  });
  assert.equal(low.model, "alpha-1");
  assert.match(low.reason, /kept from the last attempt/);
  const out = chooseSession({
    task: {},
    role: "worker",
    rules,
    subject,
    kept,
    health: health("out"),
  });
  assert.equal(out.model, "beta-1");
  assert.match(out.reason, /the kept model alpha-1 is out/);
});

test("P44 action 7: running chats on an out model switch in the same session; refusals are not retried", async (t) => {
  const env = await setup(t),
    { ops, store } = env;
  const crew = fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold,
  });
  await crew.tick();
  const live = store
    .list("session_bindings")
    .filter((b) => b.role === "worker" && b.model === "alpha-1");
  assert.ok(live.length >= 2, "the weights put two chats on alpha-1");
  const [busy, refused] = live.map((b) => b.slot),
    statusBefore = store.get("session_bindings", busy).status;
  turn(store, "alpha-1", 100);
  refreshHealth(store);
  const calls = [];
  const switcher = async (slot, model) => {
    calls.push([slot, model]);
    if (slot === refused) return { ok: false, status: 404 };
    return { ok: true, status: 200, deferred: slot === busy };
  };
  const options = {
    ...ops.providerOptions(),
    choicesFor: () => ["alpha-1", "beta-1"],
  };
  const results = await applySwitches(store, switcher, options);
  assert.equal(calls.length, live.length);
  assert.ok(calls.every(([, m]) => m === "beta-1"));
  const by = (slot) => results.find((r) => r.slot === slot);
  assert.equal(by(busy).result, "deferred");
  assert.equal(by(refused).result, "refused");
  assert.equal(by(refused).status, 404);
  const after = store.get("session_bindings", busy);
  assert.equal(after.model, "beta-1");
  assert.deepEqual(
    after.switches.map((s) => [s.from, s.to, s.by]),
    [["alpha-1", "beta-1", "auto"]],
  );
  assert.equal(after.status, statusBefore, "the session is not stopped");
  assert.equal(store.get("session_bindings", refused).model, "alpha-1");
  // The next pass leaves the refused chat alone and moves nothing again.
  calls.length = 0;
  await applySwitches(store, switcher, options);
  assert.deepEqual(calls, []);
  assert.ok(store.list("provider_switches").every((s) => s.state === "done"));
  // Each switch reaches the activity log once, by Avoozl.
  const logged = listActivity(store, { kind: "model.switch" }).items;
  assert.equal(logged.length, live.length);
  assert.ok(logged.every((r) => r.actor === "avoozl" && r.source === "local"));
  assert.ok(
    logged.some(
      (r) => /at its next turn/.test(r.summary) && r.targetId === after.taskId,
    ),
  );
  assert.ok(logged.some((r) => /Kiro Crew refused/.test(r.summary)));
});

test("P44 action 7: with no healthy target the chat stays and Needs you says so", async (t) => {
  const env = await setup(t, { providers: { fallback: ["delta-1"] } }),
    { ops, store } = env;
  await fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold,
  }).tick();
  ingestProviderErrors(store, { slot: "x", model: "alpha-1" }, [
    {
      role: "error",
      meta: { kind: "usage_limit" },
      ts: new Date().toISOString(),
    },
  ]);
  ingestProviderErrors(store, { slot: "y", model: "beta-1" }, [
    {
      role: "error",
      meta: { kind: "usage_limit" },
      ts: new Date().toISOString(),
    },
  ]);
  const calls = [];
  const results = await applySwitches(store, async (...a) => calls.push(a), {
    ...ops.providerOptions(),
    choicesFor: () => ["alpha-1", "beta-1"],
  });
  assert.deepEqual(calls, [], "delta-1 is the reviewer's model");
  assert.ok(results.length && results.every((r) => r.result === "no target"));
  assert.equal(
    (
      await applySwitches(
        store,
        async () => ({ ok: true }),
        ops.providerOptions(),
      )
    ).length,
    0,
  );
  const items = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "provider-out",
  );
  assert.equal(items.length, 2);
  assert.match(
    items.map((i) => i.detail).join(" "),
    /stayed on it: no healthy model/,
  );
});

test("P44 action 8: the served-model check counts every model a switched chat ran on", () => {
  const writer = {
    model: "beta-1",
    served: { model: "beta-1", changed: true },
    switches: [{ from: "alpha-1", to: "beta-1" }],
  };
  assert.deepEqual(servedModel(writer), {
    model: "beta-1",
    reported: true,
    cause: null,
  });
  assert.match(
    servedModel({ model: "beta-1", served: { model: "beta-1", changed: true } })
      .cause,
    /changed its model mid-session/,
  );
});

test("P44 actions 9-11: the manual switch previews, refuses a stale hash, marks new tasks, is person-only, and shows in Needs you", async (t) => {
  const env = await setup(t, { providers: { fallback: ["gamma-1"] } }),
    { ops, store } = env;
  await fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold,
  }).tick();
  const input = { from: { provider: "alpha" }, to: "gamma-1" };
  const preview = await ops.execute("provider.switch.preview", input);
  assert.ok(preview.chats.length >= 1);
  assert.ok(preview.chats.every((c) => c.model === "alpha-1"));
  assert.equal(
    store.list("provider_switches").length,
    0,
    "preview writes nothing",
  );
  const toReviewer = await ops.execute("provider.switch.preview", {
    from: { provider: "alpha" },
    to: "delta-1",
  });
  assert.equal(toReviewer.chats.length, 0);
  assert.match(toReviewer.skipped[0].why, /review role's model/);

  // (10) Only a person switches, undoes and saves.
  for (const [name, args] of [
    ["provider.switch", { ...input, previewHash: preview.previewHash }],
    ["provider.health.clear", { id: "person:provider:alpha" }],
    ["providers.settings.update", { providers: {} }],
  ]) {
    await assert.rejects(
      ops.execute(name, args, undefined, { mcp: true }),
      /Only a person/,
    );
    for (const kind of ["app-token", "agent-tool"])
      assert.equal(principalAllows({ kind }, name), false, `${kind} ${name}`);
    assert.equal(principalAllows({ kind: "owner-session" }, name), true);
  }
  for (const name of ["providers.view", "provider.switch.preview"])
    assert.equal(principalAllows({ kind: "app-token" }, name), true);
  assert.ok(await ops.execute("providers.view", {}, undefined, { mcp: true }));

  await assert.rejects(
    ops.execute("provider.switch", {
      ...input,
      previewHash: "stale",
      alsoNewTasks: true,
    }),
    (error) => error.status === 409,
  );
  const queued = await ops.execute("provider.switch", {
    ...input,
    previewHash: preview.previewHash,
    alsoNewTasks: true,
  });
  assert.equal(queued.queued, preview.chats.length);
  const mark = store.get("provider_health", "person:provider:alpha");
  assert.equal(mark.level, "out");
  assert.equal(mark.to, "gamma-1");
  // New tasks: alpha is out, so the routine choices keep only beta-1; a task
  // whose only model is alpha takes the person's replacement.
  const health = healthContext(store);
  assert.equal(
    healthyChoices([{ model: "alpha-1", weight: 1 }], health).pool[0].model,
    "gamma-1",
  );
  // The backend pass applies the person's switches.
  const results = await applySwitches(
    store,
    async () => ({ ok: true, status: 200 }),
    ops.providerOptions(),
  );
  const mine = results.filter((r) => r.by === "person");
  assert.equal(mine.length, preview.chats.length);
  assert.ok(mine.every((r) => r.result === "switched" && r.to === "gamma-1"));
  const queuedRow = listActivity(store, { kind: "model.switch" }).items.find(
    (r) => /^Switch model: queued/.test(r.summary),
  );
  assert.equal(queuedRow.source, "local");
  assert.match(queuedRow.summary, /to gamma-1, and new tasks/);

  // (11) Needs you shows the mark with the switched count; Undo clears it.
  let items = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "provider-out",
  );
  assert.equal(items.length, 1);
  assert.match(
    items[0].detail,
    new RegExp(`Switched ${preview.chats.length} running chat`),
  );
  await ops.execute("provider.health.clear", { id: mark.id });
  items = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "provider-out",
  );
  assert.equal(items.length, 0);
});

test("P44: without routing an out delivery model takes the fallback, else the task waits", async (t) => {
  const env = await setup(t, {
    routing: undefined,
    delivery: { model: "alpha-1" },
    providers: { fallback: ["gamma-1"] },
  });
  ingestProviderErrors(env.store, { slot: "x", model: "alpha-1" }, [
    {
      role: "error",
      meta: { kind: "usage_limit" },
      ts: new Date().toISOString(),
    },
  ]);
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold,
  });
  const placed = writers(await crew.tick());
  assert.ok(Object.values(placed).length);
  assert.ok(Object.values(placed).every((d) => d.model === "gamma-1"));
  machine({});
  const env2 = await setup(t, {
    routing: undefined,
    delivery: { model: "alpha-1" },
    providers: {},
  });
  ingestProviderErrors(env2.store, { slot: "x", model: "alpha-1" }, [
    {
      role: "error",
      meta: { kind: "usage_limit" },
      ts: new Date().toISOString(),
    },
  ]);
  const crew2 = fakeCrew(env2.ops, {
    aliases: env2.aliases,
    defaults: defaults(env2),
    scripts: hold,
  });
  assert.deepEqual(writers(await crew2.tick()), {});
});

test("P44: provider settings are validated and refused in .avoozl.json", async (t) => {
  assert.deepEqual(providersInput(undefined), {});
  assert.throws(() => providersInput({ lowPercent: 100 }), /lowPercent/);
  assert.throws(
    () => providersInput({ limits: { a: { dollars: 1 } } }),
    /credits or tokens/,
  );
  assert.throws(() => providersInput({ fallback: ["auto"] }), /name a model/);
  assert.throws(() => providersInput({ nope: 1 }), /not a provider setting/);
  assert.equal(providerOf("claude-sonnet-4.5"), "claude");
  assert.equal(
    providerOf("gpt-5", { groups: { openai: ["gpt-*"] } }),
    "openai",
  );
  assert.equal(providerOf("auto"), null);
  assert.throws(
    () => validateTrackedRouting({ providers: {} }),
    /this machine's setting/,
  );
  const env = await setup(t);
  const view = await env.ops.execute("providers.view", {});
  await env.ops.execute("providers.settings.update", {
    providers: { lowPercent: 70 },
    expectedHash: view.hash,
  });
  assert.equal(
    (await env.ops.execute("providers.view", {})).settings.lowPercent,
    70,
  );
  const file = path.join(env.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.providers = { lowPercent: 70 };
  fs.writeFileSync(file, JSON.stringify(value));
  const tick = await env.ops.execute("workspace.tick", {});
  assert.equal(tick.policy.status, "invalid");
  assert.match(tick.policy.error, /providers is this machine's setting/);
});
