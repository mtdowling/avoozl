// Proof P29: crew placement by one routing prompt, with fake crews
// (tasks.md Phase 11, design §4.10, §8.3, Requirements 41–42). An isolated
// temporary workspace, a sample repository with a bare remote that answers
// as git.example.test, the fake crew driver playing `fake-linux` and
// `fake-windows`, and a fake routing agent whose reply the test writes. No
// real crew, host, model or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { commitIn, fakeCrew, git } from "./fake-crew.mjs";
import {
  CREWS,
  defaults,
  leaf,
  MACHINE,
  MANIFEST,
  PROMPT,
  workspace,
} from "./fixtures/crews/workspace.mjs";
import { recordRouterReply, routerBatch } from "../router.mjs";
import { listActivity } from "../activity-log.mjs";

const crewOf = (result) =>
  Object.fromEntries(
    result.dispatch
      .filter((d) => d.role === "worker")
      .map((d) => [d.task, d.crew ?? "local"]),
  );
const workerBindings = (store) =>
  store.list("session_bindings").filter((b) => b.role === "worker");
// The routing sessions stay open and unplayed; the test answers for them.
const ROUTER = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [`router-${i + 1}:router`, "hold"]),
);
const hold = (ids) =>
  Object.fromEntries(ids.map((id) => [`${id}:worker`, "hold"]));
// The fake routing agent: `pick(alias, options)` names one option per task.
function answer(env, pick) {
  const batch = routerBatch(env.store);
  assert.equal(batch.state, "running");
  recordRouterReply(
    env.store,
    batch.id,
    JSON.stringify(
      batch.tasks.map(({ task, options }) => ({
        task,
        ...pick(env.aliases[task], options),
        reason: `fake agent for ${env.aliases[task]}`,
      })),
    ),
  );
  return batch;
}
const onCrew = (crew) => (_, options) =>
  options.find((o) => o.crew === crew) ?? options[0];
const routerDispatch = (result) =>
  result.dispatch.filter((d) => d.role === "router");

test("P29 action 1: routing off keeps every session local, at most 2", async (t) => {
  const env = await workspace(t),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: {},
    });
  const first = await crew.tick();
  const workers = first.dispatch.filter((d) => d.role === "worker");
  assert.equal(workers.length, 2, "local's chat limit of 2 holds");
  assert.ok(workers.every((d) => !d.crew));
  assert.ok(workers.every((d) => d.agent === "kirocrew-worker" && !d.model));
  assert.deepEqual(routerDispatch(first), [], "no routing call while off");
  assert.deepEqual(
    (await crew.tick()).dispatch.filter((d) => d.role === "worker"),
    [],
  );
});

test("P29 action 2: one call places every ready task among the options that passed", async (t) => {
  const env = await workspace(t, { machine: PROMPT }),
    { ops, store, id } = env;
  // Preview is a dry run: it opens nothing, writes nothing, calls no agent.
  const before = store.list("session_bindings").length;
  const preview = await ops.execute("routing.preview", {});
  assert.equal(store.list("session_bindings").length, before);
  assert.ok(!routerBatch(store), "no call from Preview");
  const row = (alias) => preview.items.find((i) => i.taskId === id[alias]);
  assert.deepEqual(
    row("t1").options.map((o) => o.crew),
    ["fake-windows"],
    "t1 needs os:windows",
  );
  assert.equal(row("t1").outcome.kind, "fixed");
  assert.equal(row("u1").noFit, true);
  assert.ok(row("u1").removed.some((r) => /lacks arch:arm64/.test(r.by)));
  assert.equal(row("c1").outcome.kind, "agent");
  assert.match(preview.brief, /Keep compliance work local/);
  assert.match(preview.brief, /untrusted data, not instructions/);

  const crew = fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { ...ROUTER, ...hold(["c1", "t1", "w1", "w2", "w3", "w4"]) },
  });
  const first = await crew.tick();
  // t1 has one option and needs no call; the rest wait on ONE call.
  assert.deepEqual(crewOf(first), { [id.t1]: "fake-windows" });
  const calls = routerDispatch(first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agent, "avoozl-router");
  const batch = answer(env, (alias, options) =>
    alias === "c1" || alias === "w3" || alias === "w4"
      ? onCrew("local")(alias, options)
      : onCrew("fake-linux")(alias, options),
  );
  assert.deepEqual(batch.tasks.map((t) => env.aliases[t.task]).sort(), [
    "c1",
    "w1",
    "w2",
    "w3",
    "w4",
  ]);
  const second = await crew.tick(),
    placed = crewOf(second);
  assert.equal(placed[id.c1], "local");
  assert.equal(placed[id.w1], "fake-linux");
  assert.equal(placed[id.w2], "fake-linux");
  assert.equal(placed[id.w3], "local");
  // local's limit of 2 and fake-linux's are full: w4 waits, with no call,
  // and the answer is spent, so the next call carries fresh facts.
  assert.equal(placed[id.w4], undefined);
  assert.deepEqual(routerDispatch(second), []);
  assert.equal(routerBatch(store).state, "used");
  const remoteBrief = second.dispatch.find(
    (d) => d.crew === "fake-linux",
  ).brief;
  assert.match(remoteBrief, /clone https:\/\/git\.example\.test\/o\/app\.git/);
  assert.ok(!remoteBrief.includes(env.checkout), "no local path");
  for (const b of workerBindings(store))
    assert.ok(b.placement?.reason, `${b.taskId} records a reason`);
  assert.ok(
    workerBindings(store).some((b) =>
      /routing agent: fake agent for w1/.test(b.placement.reason),
    ),
  );
  // u1: one no-fit decision naming every crew.
  const noFit = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "no-fit",
  );
  assert.equal(noFit.length, 1);
  assert.equal(noFit[0].taskId, id.u1);
  assert.deepEqual(noFit[0].removed.map((r) => r.crew).sort(), [
    "fake-linux",
    "fake-windows",
    "local",
  ]);
  // A crew change that makes u1 fit closes it by itself.
  const file = JSON.parse(fs.readFileSync(MACHINE, "utf8"));
  file.crews["fake-linux"].tags.push("arch:arm64");
  fs.writeFileSync(MACHINE, JSON.stringify(file));
  await crew.tick();
  assert.equal(
    (await ops.execute("conflicts.view", {})).items.filter(
      (i) => i.kind === "no-fit",
    ).length,
    0,
  );
});

test("P29 action 4: a malformed or missing reply falls back to local, logged", async (t) => {
  let clock = Date.now();
  const run = async (reply) => {
    const env = await workspace(t, { machine: PROMPT, ids: ["w1"] });
    env.ops.placement.now = () => clock;
    const crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: { ...ROUTER, ...hold(["w1"]) },
    });
    assert.equal(routerDispatch(await crew.tick()).length, 1);
    if (reply === "silent") clock += 91_000;
    else recordRouterReply(env.store, routerBatch(env.store).id, reply);
    const next = (await crew.tick()).dispatch.find((d) => d.role === "worker");
    return { env, next };
  };
  const silent = await run("silent");
  assert.equal(silent.next.crew, undefined);
  assert.match(
    silent.next.placement.reason,
    /fell back to local \(no reply within 90 s\)/,
  );
  const malformed = await run("not json");
  assert.match(malformed.next.placement.reason, /the reply was not a list/);
  assert.ok(
    listActivity(malformed.env.store).items.some(
      (r) => r.kind === "routing.fallback",
    ),
  );
});

test("P29 actions 6 and 11: the prompt or old routing keys in a tracked file are refused", async (t) => {
  const env = await workspace(t);
  const file = path.join(env.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.routing = { prompt: "Prefer the build box." };
  fs.writeFileSync(file, JSON.stringify(value));
  const tick = await env.ops.execute("workspace.tick", {});
  assert.equal(tick.policy.status, "invalid");
  assert.match(
    tick.policy.error,
    /routing\.prompt may live only in this machine's settings/,
  );
  value.routing = { rules: [{ id: "pin", on: "fake-linux" }] };
  fs.writeFileSync(file, JSON.stringify(value));
  assert.match(
    (await env.ops.execute("workspace.tick", {})).policy.error,
    /old routing keys; run node scripts\/migrate-routing\.mjs/,
  );
});

const blocked = ({ report }) =>
  report({ kind: "blocked", text: "the fixture fails" });

test("P29 action 3: a stale crew is busy and the retry waits without a decision", async (t) => {
  const env = await workspace(t, { machine: PROMPT, ids: ["t1"] }),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: { ...ROUTER, "t1:worker:1": blocked },
    });
  assert.equal(crewOf(await crew.tick())[env.id.t1], "fake-windows");
  env.driver.set("fake-windows", { ageSeconds: 180 });
  await crew.play();
  const retry = await crew.tick();
  assert.deepEqual(
    retry.dispatch.filter((d) => d.role === "worker"),
    [],
  );
  assert.deepEqual(
    (await env.ops.execute("conflicts.view", {})).items.filter(
      (i) => i.kind === "no-fit",
    ),
    [],
    "no room is not a decision",
  );
  const view = await env.ops.execute("routing.view", {});
  const online = view.crews
    .find((c) => c.id === "fake-windows")
    .checks.find((c) => c.check === "online");
  assert.equal(online.ok, false);
  assert.match(online.why, /stale reading/);
  env.driver.set("fake-windows", { ageSeconds: 5 });
  const again = await crew.tick();
  assert.equal(crewOf(again)[env.id.t1], "fake-windows");
  assert.equal(again.dispatch.find((d) => d.role === "worker").attempt, 2);
});

test("P29 action 5: a base only on this machine leaves local as the only option", async (t) => {
  const env = await workspace(t, { machine: PROMPT, ids: ["w1"] });
  commitIn(env.checkout, "local-only.txt", "x\n", "Local only");
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { ...ROUTER, ...hold(["w1"]) },
  });
  const result = await crew.tick(),
    d = result.dispatch.find((x) => x.role === "worker");
  assert.deepEqual(routerDispatch(result), [], "one option needs no call");
  assert.equal(d.crew, undefined);
  assert.ok(
    d.placement.removed.some(
      (r) =>
        r.crew === "fake-linux" &&
        /work not fetchable \(the base commit is only on this machine\)/.test(
          r.by,
        ),
    ),
  );
});

test("P29 action 15: a crew that would stall on tool approvals is never offered", async (t) => {
  const env = await workspace(t, { machine: PROMPT, ids: ["t1"] });
  env.driver.set("fake-windows", { ready: false });
  const preview = await env.ops.execute("routing.preview", {});
  const item = preview.items[0];
  assert.equal(item.noFit, true);
  assert.ok(
    item.removed.some(
      (r) => r.crew === "fake-windows" && /stall on tool approvals/.test(r.by),
    ),
  );
});

test("P29 actions 7 and 12: an unreachable crew keeps its binding; a pushed branch integrates", async (t) => {
  // Both tasks pin fake-linux in their manifest: the pin wins, routing off.
  const env = await workspace(t, {
      ids: ["w2", "w3"],
      manifest: {
        w2: leaf("w2 plain work.", { session: { crew: "fake-linux" } }),
        w3: leaf("w3 plain work.", { session: { crew: "fake-linux" } }),
      },
    }),
    { ops, id } = env;
  let reachable = true;
  const crew = fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { "w2:worker:1": "hold", "w3:worker:1": blocked },
    visible: (slot, s) => reachable || s?.crew !== "fake-linux",
  });
  const first = crewOf(await crew.tick());
  assert.deepEqual(Object.values(first), ["fake-linux", "fake-linux"]);
  await crew.play((s) => s.alias === "w3");
  reachable = false;
  env.driver.set("fake-linux", { reachable: false });
  const held = await crew.tick();
  assert.equal(held.held, undefined, "an unreachable crew holds nothing else");
  assert.deepEqual(
    held.dispatch.filter((d) => d.task === id.w2),
    [],
    "nothing re-places w2",
  );
  const delivery = await ops.execute("delivery.view", {});
  const w2 = delivery.items.find((i) => i.id === id.w2);
  assert.equal(
    w2.sessions.find((s) => s.role === "worker").crewUnreachable,
    true,
  );
  reachable = true;
  env.driver.set("fake-linux", { reachable: true });
  const back = await crew.tick();
  assert.equal(back.held, undefined);
  const retry = back.dispatch.find(
    (d) => d.task === id.w3 && d.role === "worker",
  );
  assert.equal(retry.attempt, 2);
  assert.equal(retry.crew, "fake-linux");
  crew.find("w2", "worker", 1).state = "open";
  delete crew.sessions.find((s) => s.alias === "w2").result;
  const scripts = crew.script;
  crew.script = (s) =>
    s.alias === "w2" && s.role === "worker"
      ? defaults(env)("worker")
      : scripts(s);
  await crew.play((s) => s.alias === "w2");
  for (let i = 0; i < 4; i++) {
    await crew.tick();
    await crew.play((s) => s.alias === "w2");
  }
  const task = ops.read().tasks.find((x) => x.id === id.w2);
  assert.ok(task.integration?.commit, "w2 integrated");
  assert.ok(
    git(env.checkout, "log", "--oneline", "main").includes("Remote"),
    "its remote commit landed",
  );
});

test("P29 action 7b: a reported commit that is not the pushed tip is refused", async (t) => {
  const env = await workspace(t, {
      ids: ["w1"],
      manifest: {
        w1: leaf("w1 plain work.", { session: { crew: "fake-linux" } }),
      },
    }),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: {
        "w1:worker": async ({ session, refused }) => {
          const commit = env.driver.remoteCommit(session, {
            url: env.bare,
            base: git(env.checkout, "rev-parse", "main"),
            file: "src/w1.txt",
            text: "w1\n",
            push: false,
          });
          await refused({ commit }, /Could not fetch avoozl\//);
          return commit;
        },
      },
    });
  await crew.tick();
  await crew.play();
});

test("P29 actions 8 and 9: a diff rule set or the switch off removes remote crews", async (t) => {
  const env = await workspace(t, {
    machine: PROMPT,
    ids: ["w1"],
    extra: {
      contentRules: { sets: [{ id: "fake-diff", boundaries: ["diff"] }] },
    },
  });
  fs.mkdirSync(path.join(env.root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(env.root, ".avoozl", "local", "content-rules", "fake-diff.txt"),
    "codename: zorblat\n",
  );
  const item = (await env.ops.execute("routing.preview", {})).items[0];
  assert.deepEqual(
    item.options.map((o) => o.crew),
    ["local"],
  );
  assert.ok(
    item.removed.some((r) =>
      /content rule set fake-diff forbids remote crews/.test(r.by),
    ),
  );
  const off = await workspace(t, { machine: PROMPT, ids: ["w1"] });
  off.driver.state.remoteDispatch = false;
  off.driver.record();
  const second = (await off.ops.execute("routing.preview", {})).items[0];
  assert.deepEqual(
    second.options.map((o) => o.crew),
    ["local"],
  );
  assert.match(
    second.removed.find((r) => r.crew === "fake-linux").by,
    /remote dispatch is off/,
  );
});

test("P29 action 10: chat and stale limits are set and cleared on this machine", async (t) => {
  const env = await workspace(t, {
    ids: ["w1", "w2", "w3"],
    manifest: {
      ...MANIFEST,
      ...Object.fromEntries(
        ["w1", "w2", "w3"].map((a) => [
          a,
          leaf(`${a} plain work.`, { session: { crew: "fake-linux" } }),
        ]),
      ),
    },
  });
  const machine = JSON.parse(fs.readFileSync(MACHINE, "utf8"));
  const hash = (await env.ops.execute("routing.view", {})).machineHash;
  await env.ops.execute("crews.update", {
    crews: {
      ...machine.crews,
      "fake-linux": { ...machine.crews["fake-linux"], chatLimit: 1 },
    },
    staleSeconds: 60,
    expectedHash: hash,
  });
  env.driver.set("fake-linux", { ageSeconds: 30 });
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold(["w1", "w2", "w3"]),
  });
  assert.equal(
    Object.keys(crewOf(await crew.tick())).length,
    1,
    "at most 1 on fake-linux",
  );
  env.driver.set("fake-linux", { ageSeconds: 70 });
  let view = await env.ops.execute("routing.view", {});
  assert.match(
    view.crews
      .find((c) => c.id === "fake-linux")
      .checks.find((c) => c.check === "online").why,
    /stale reading \(70 s old\)/,
  );
  assert.equal(view.staleSeconds, 60);
  await assert.rejects(
    env.ops.execute("crews.update", { staleSeconds: null }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  await env.ops.execute("crews.update", {
    crews: machine.crews,
    staleSeconds: null,
    expectedHash: view.machineHash,
  });
  view = await env.ops.execute("routing.view", {});
  const linux = view.crews.find((c) => c.id === "fake-linux");
  assert.equal(linux.chatLimit, 2);
  assert.equal(view.staleSeconds, null, "the placeholder shows 120 s");
});

test("P29 action 13: Attach opens a local chat and, through MC-10, a remote one", async (t) => {
  const env = await workspace(t, {
    ids: ["w1", "w2"],
    manifest: {
      w1: leaf("w1 plain work.", { session: { crew: "fake-linux" } }),
      w2: leaf("w2 plain work."),
    },
  });
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: hold(["w1", "w2"]),
  });
  await crew.tick();
  const sessions = (await env.ops.execute("delivery.view", {})).items.flatMap(
    (i) => i.sessions || [],
  );
  const local = sessions.find((s) => s.crew === "local"),
    remote = sessions.find((s) => s.crew !== "local");
  assert.match(local.link, /\/chat\?sid=/);
  assert.match(remote.link, /^\/crews\/fake-linux\/chat\?sid=/);
});

test("P29 action 12: a public remote changes nothing, and the diff boundary checks a remote branch at done", async (t) => {
  const env = await workspace(t, {
    ids: ["w1"],
    manifest: {
      w1: leaf("w1 plain work.", { session: { crew: "fake-linux" } }),
    },
    extra: {
      contentRules: {
        sets: [{ id: "fake-diff", boundaries: ["diff"], remote: "allow" }],
      },
    },
  });
  fs.mkdirSync(path.join(env.root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(env.root, ".avoozl", "local", "content-rules", "fake-diff.txt"),
    "codename: zorblat\n",
  );
  env.store.transaction(() =>
    env.store.put("github_repositories", {
      id: "o/app",
      visibility: "public",
      private: false,
    }),
  );
  const base = git(env.checkout, "rev-parse", "main");
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: {
      "w1:worker": async ({ session, report, refused }) => {
        const bad = env.driver.remoteCommit(session, {
          url: env.bare,
          base,
          file: "src/w1.txt",
          text: "zorblat\n",
          push: true,
        });
        await refused({ commit: bad }, /fake-diff/);
        const good = env.driver.remoteCommit(session, {
          url: env.bare,
          base,
          file: "src/w1.txt",
          text: "fine\n",
          push: true,
        });
        await report({ commit: good });
        return good;
      },
    },
  });
  const d = (await crew.tick()).dispatch.find((x) => x.role === "worker");
  assert.equal(d.crew, "fake-linux");
  await crew.play();
  await crew.tick();
  assert.equal(env.store.get("task_deliveries", env.id.w1).state, "done");
});

test("P29 action 14: no MC-10 removes remote crews and keeps sessions local", async (t) => {
  const env = await workspace(t, { machine: PROMPT, mc10: false }),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: { ...ROUTER },
    });
  const preview = await env.ops.execute("routing.preview", {});
  const t1 = preview.items.find((i) => i.taskId === env.id.t1);
  assert.equal(t1.noFit, true);
  assert.ok(t1.removed.some((r) => /waits on Kiro Crew \(MC-10\)/.test(r.by)));
  const result = await crew.tick(),
    placed = crewOf(result);
  assert.ok(Object.values(placed).every((c) => c === "local"));
  assert.equal(placed[env.id.t1], undefined, "t1 may not run on local");
  assert.deepEqual(routerDispatch(result), [], "local alone needs no call");
  assert.equal(Object.keys(placed).length, 2);
  assert.equal((await env.ops.execute("routing.view", {})).mc10, false);
  void CREWS;
});
