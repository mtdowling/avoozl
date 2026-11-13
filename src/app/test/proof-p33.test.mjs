// Proof P33: agent and model per task with fake crews and fake agents
// (tasks.md Phase 11, design §4.10 "Agent and model per session",
// Requirement 53). The P29 workspace and fake crew driver, every chat limit
// 10, and `fake-linux` without agent `alt-worker`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fakeCrew } from "./fake-crew.mjs";
import {
  CREWS,
  defaults,
  leaf,
  workspace,
} from "./fixtures/crews/workspace.mjs";

const IDS = ["h1", "r1", "r2", "r3", "r4", "r5", "r6", "m1", "q1"];
const MANIFEST = {
  h1: leaf("h1 is hard.", { labels: ["hard"] }),
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((n) => [`r${n}`, leaf(`r${n} is routine.`)]),
  ),
  m1: leaf("m1 names its model.", { session: { model: "model-m" } }),
  // A leaf on a route that opens no session (here `github` with no GitHub
  // mode, the way an Issue Radar leaf is handed off): `session` cannot apply.
  q1: leaf("q1 goes to Issue Radar.", {
    labels: ["hard", "radar"],
    route: "github",
    completion: "merged-pr",
  }),
};
const TEN = Object.fromEntries(
  Object.entries(CREWS).map(([id, c]) => [id, { ...c, chatLimit: 10 }]),
);
const REVIEWERS = [
  {
    id: "correctness",
    focus: "correctness",
    agent: "avoozl-reviewer",
    model: "model-r",
    distinctFrom: "model",
  },
];
const RULES = [
  {
    id: "hard-parts",
    when: { labels: ["hard"] },
    session: { model: "model-a" },
  },
  {
    id: "radar",
    when: { labels: ["radar"] },
    route: "github",
    session: { model: "model-a" },
  },
  {
    id: "routine",
    when: { kinds: ["leaf"] },
    session: {
      choices: [{ model: "model-b", weight: 2 }, { model: "model-c" }],
    },
  },
];
const hold = Object.fromEntries(IDS.map((id) => [`${id}:worker`, "hold"]));
const writers = (result) =>
  Object.fromEntries(
    result.dispatch.filter((d) => d.role === "worker").map((d) => [d.task, d]),
  );

const setup = (t, options = {}) =>
  workspace(t, {
    crews: TEN,
    ids: IDS,
    manifest: MANIFEST,
    agents: {
      "fake-linux": ["kirocrew-worker", "avoozl-verifier", "avoozl-reviewer"],
    },
    ...options,
  });

test("P33 action 1: no session anywhere opens every session as before", async (t) => {
  const env = await setup(t),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: hold,
    });
  const placed = writers(await crew.tick());
  const ids = Object.keys(placed)
    .map((id) => env.aliases[id])
    .sort();
  assert.ok(!ids.includes("q1"));
  for (const [id, d] of Object.entries(placed)) {
    assert.equal(d.agent, "kirocrew-worker");
    if (env.aliases[id] === "m1")
      assert.equal(d.model, "model-m", "a manifest session is a session");
    else assert.equal(d.model, undefined, "auto");
  }
});

test("P33 actions 2-4: rules pick models, split by weight, keep a retry's model, and skip a reviewer's model", async (t) => {
  const env = await setup(t, {
      routing: { rules: RULES },
      delivery: { model: "model-w", reviewers: REVIEWERS },
    }),
    { ops, store, id } = env;
  const preview = await ops.execute("routing.preview", {});
  const row = (a) => preview.items.find((i) => i.taskId === id[a]);
  assert.equal(row("h1").model, "model-a");
  assert.equal(row("h1").sessionReason, "rule hard-parts");
  assert.equal(row("m1").model, "model-m");
  assert.equal(row("m1").sessionReason, "manifest");
  assert.equal(row("q1"), undefined, "q1 opens no session");
  const view = await ops.execute("routing.view", {});
  assert.equal(view.rules.find((r) => r.id === "radar").sessionApplies, false);
  assert.equal(
    view.rules.find((r) => r.id === "hard-parts").sessionApplies,
    true,
  );

  const fails = ({ report }) => report({ kind: "blocked", text: "fails" }),
    scripts = { ...hold, "r1:worker:1": fails, "r2:worker:1": fails };
  const crew = fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts,
  });
  const placed = writers(await crew.tick());
  const by = (a) => placed[id[a]];
  assert.equal(by("h1").model, "model-a");
  assert.equal(by("m1").model, "model-m", "the manifest wins over routine");
  assert.equal(by("q1"), undefined);
  const routine = ["r1", "r2", "r3", "r4", "r5", "r6"].map((a) => by(a).model);
  assert.equal(routine.filter((m) => m === "model-b").length, 4);
  assert.equal(routine.filter((m) => m === "model-c").length, 2);
  for (const b of store
    .list("session_bindings")
    .filter((x) => x.role === "worker")) {
    assert.ok(b.agent, `${b.taskId} records its agent`);
    assert.ok(b.sessionReason, `${b.taskId} records how`);
  }
  // (3) r1 retries on its model; r2 is picked afresh after Pick again.
  const r1 = by("r1").model,
    r2 = by("r2").model;
  await assert.rejects(
    ops.execute("delivery.pickAgain", { taskId: id.r2 }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  await ops.execute("delivery.pickAgain", { taskId: id.r2 });
  await crew.play((s) => ["r1", "r2"].includes(s.alias));
  const retry = writers(await crew.tick());
  assert.equal(retry[id.r1].attempt, 2);
  assert.equal(retry[id.r1].model, r1);
  assert.match(retry[id.r1].sessionReason, /kept from the last attempt/);
  assert.equal(retry[id.r2].attempt, 2);
  assert.doesNotMatch(retry[id.r2].sessionReason, /kept/);
  void r2;

  // (4) routine names the reviewer's model: no writer runs on model-r.
  const file = path.join(env.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.routing.rules[2].session.choices = [
    { model: "model-r" },
    { model: "model-c" },
  ];
  fs.writeFileSync(file, JSON.stringify(value));
  const after = await ops.execute("routing.preview", {});
  assert.ok(after.items.every((i) => i.model !== "model-r"));
});

test("P33 action 5: an agent no allowed crew has opens one no-fit decision", async (t) => {
  const env = await setup(t, {
    ids: ["h1"],
    routing: {
      rules: [
        {
          id: "hard-parts",
          when: { labels: ["hard"] },
          on: "tags:os:linux",
          requireTags: ["os:linux"],
          session: { agent: "alt-worker" },
        },
      ],
    },
  });
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold,
  });
  assert.deepEqual(writers(await crew.tick()), {});
  const items = (await env.ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "no-fit",
  );
  assert.equal(items.length, 1);
  assert.ok(
    items[0].removed.some(
      (r) => r.crew === "fake-linux" && r.by === "agent not installed",
    ),
  );
});

test("P33 action 6: weight 0 and 11 choices are refused, naming each key", async (t) => {
  const env = await setup(t, { ids: ["r1"] });
  const file = path.join(env.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  const choices = Array.from({ length: 11 }, (_, i) => ({ model: `m${i}` }));
  choices[0].weight = 0;
  value.routing = { rules: [{ id: "routine", session: { choices } }] };
  fs.writeFileSync(file, JSON.stringify(value));
  const tick = await env.ops.execute("workspace.tick", {});
  assert.equal(tick.policy.status, "invalid");
  assert.match(
    tick.policy.error,
    /routing\.rules\[0\]\.session\.choices must list 1–10/,
  );
  assert.match(
    tick.policy.error,
    /routing\.rules\[0\]\.session\.choices\[0\]\.weight must be a whole number 1–100/,
  );
});
