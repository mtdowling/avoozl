// Proof P29: crew placement with fake crews (tasks.md Phase 11, design
// §4.10, §8.3, Requirements 41–42). An isolated temporary workspace, a
// sample repository with a bare remote that answers as git.example.test,
// and the fake crew driver playing `fake-linux` and `fake-windows`. No real
// crew, host, or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { commitIn, fakeCrew, git } from "./fake-crew.mjs";
import { crewDriver } from "./fixtures/crews/driver.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const XDG = temporaryDirectory("avoozl-p29-xdg-");
process.env.XDG_CONFIG_HOME = XDG;
const MACHINE = path.join(XDG, "avoozl", "config.json");
const CHECK = "scripts/validate.sh";
const URL = "https://git.example.test/o/app.git";

const IDS = ["c1", "t1", "w1", "w2", "w3", "w4", "u1"];
const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  repository: "app",
  summary,
  acceptance: [summary],
  checks: [CHECK],
  completion: "integrated",
  ...extra,
});
const MANIFEST = {
  c1: leaf("c1 is compliance work.", { labels: ["compliance"] }),
  t1: leaf("t1 tests Windows paths.", { type: "test", paths: ["src/win/**"] }),
  w1: leaf("w1 plain work."),
  w2: leaf("w2 plain work."),
  w3: leaf("w3 plain work."),
  w4: leaf("w4 plain work."),
  u1: leaf("u1 needs arm Linux.", {
    type: "test",
    labels: ["needs-arm-linux"],
  }),
};
const spec = (ids = IDS) => ({
  "tasks.md": [
    "# Tasks",
    "",
    ...ids.map((id, i) => `- [ ] ${i + 1} Do ${id}`),
    "",
  ].join("\n"),
  "avoozl/manifest.json": JSON.stringify({
    tasks: Object.fromEntries(
      ids.map((id, i) => [String(i + 1), MANIFEST[id]]),
    ),
  }),
});
export const RULES = [
  {
    id: "windows-tests",
    when: { kinds: ["test"], paths: ["src/win/**"] },
    on: "any",
    requireTags: ["os:windows"],
  },
  { id: "spread-work", on: "any" },
  {
    id: "arm-linux",
    when: { labels: ["needs-arm-linux"] },
    requireTags: ["os:linux", "arch:arm64"],
  },
  { id: "compliance", when: { labels: ["compliance"] }, keepLocal: true },
];
export const CREWS = {
  local: { tags: ["os:macos", "trust:local"], chatLimit: 2 },
  "fake-linux": {
    tags: ["os:linux", "trust:remote"],
    gitHosts: ["git.example.test"],
    chatLimit: 2,
    delivery: "push",
  },
  "fake-windows": {
    tags: ["os:windows", "trust:remote"],
    gitHosts: ["git.example.test"],
    chatLimit: 1,
    delivery: "push",
  },
};

const localReading = () => ({
  source: "node",
  measuredAt: new Date().toISOString(),
  memFreeGb: 12,
  diskFreeGb: 200,
  loadPerCpu: 0.3,
});

export async function workspace(
  t,
  {
    routing,
    machine = null,
    crews = CREWS,
    ids = IDS,
    delivery = {},
    extra = {},
    mc10 = true,
  } = {},
) {
  const root = temporaryDirectory("avoozl-p29-"),
    checkout = path.join(root, "app"),
    bare = path.join(root, "remote", "app.git");
  fs.mkdirSync(path.join(checkout, "scripts"), { recursive: true });
  git(root, "init", "--quiet", "--bare", bare);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  // The remote answers as git.example.test; git reads it from the bare repo.
  git(checkout, "config", `url.${bare}.insteadOf`, URL);
  git(checkout, "remote", "add", "origin", URL);
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  fs.writeFileSync(path.join(checkout, CHECK), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  git(checkout, "push", "--quiet", "origin", "main");
  fs.mkdirSync(path.dirname(MACHINE), { recursive: true });
  fs.writeFileSync(
    MACHINE,
    JSON.stringify(
      { version: 1, crews, ...(machine ? { routing: machine } : {}) },
      null,
      2,
    ),
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 10, retries: 2, ...delivery },
      ...(routing ? { routing } : {}),
      ...extra,
    }),
  );
  const ops = new Operations(store, {
    workspaceRoot: root,
    placement: { localReading },
  });
  await ops.execute("project.configure", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    checks: [[CHECK]],
  });
  writeSpec(root, "p29", spec(ids));
  await ops.execute("plan.create", { spec: "p29" });
  const preview = await ops.execute("plan.preview", { id: "p29" });
  await ops.execute("plan.approve", {
    id: "p29",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
  const byTitle = Object.fromEntries(
    ops
      .read()
      .tasks.filter((x) => x.planId === "p29")
      .map((x) => [x.title.replace(/^Do /, ""), x.id]),
  );
  const aliases = Object.fromEntries(
    Object.entries(byTitle).map(([a, id]) => [id, a]),
  );
  const driver = crewDriver(store, {
    root,
    mc10,
    crews: {
      "fake-linux": { name: "fake linux" },
      "fake-windows": { name: "fake windows" },
    },
  });
  return { root, checkout, bare, store, ops, driver, id: byTitle, aliases };
}

const passed = [{ command: CHECK, exitCode: 0 }];
const defaults = (env) => (role) =>
  role === "worker"
    ? async ({ session, worktree, report }) => {
        const commit = session.crew
          ? env.driver.remoteCommit(session, {
              url: URL.replace("https://git.example.test/o/app.git", env.bare),
              base: git(env.checkout, "rev-parse", "main"),
              file: `src/${session.alias}.txt`,
              text: `${session.alias}\n`,
              push: true,
            })
          : commitIn(
              await worktree(),
              `src/${session.alias}.txt`,
              `${session.alias}\n`,
              `Work ${session.alias}`,
            );
        await report({ commit });
        return commit;
      }
    : role === "verifier"
      ? ({ session, report }) =>
          report({ commit: session.commit, checks: passed })
      : ({ session, report }) =>
          report({ commit: session.commit, verdict: "approved" });

const crewOf = (result) =>
  Object.fromEntries(
    result.dispatch
      .filter((d) => d.role === "worker")
      .map((d) => [d.task, d.crew ?? "local"]),
  );
const workerBindings = (store) =>
  store.list("session_bindings").filter((b) => b.role === "worker");

test("P29 action 1: no routing key keeps every session local, at most 2", async (t) => {
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
  assert.deepEqual(
    (await crew.tick()).dispatch.filter((d) => d.role === "worker"),
    [],
  );
});

test("P29 actions 2 and 14: rules spread work, keep hard limits, and wait on MC-10", async (t) => {
  const env = await workspace(t, { routing: { rules: RULES } }),
    { ops, store, id } = env;
  // Preview opens nothing and writes nothing.
  const before = store.list("session_bindings").length;
  const preview = await ops.execute("routing.preview", {});
  assert.equal(store.list("session_bindings").length, before);
  const row = (alias) => preview.items.find((i) => i.taskId === id[alias]);
  assert.equal(row("c1").crew, "local");
  assert.match(row("c1").reason, /local only/);
  assert.equal(row("t1").crew, "fake-windows");
  assert.equal(row("u1").noFit, true);
  assert.ok(row("u1").whyNot.some((w) => /arm-linux requires/.test(w.by)));
  assert.ok(preview.items.every((i) => i.route === "local"));

  const crew = fakeCrew(ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { "c1:worker": "hold", "t1:worker": "hold" },
  });
  const result = await crew.tick(),
    placed = crewOf(result);
  assert.equal(
    placed[id.c1],
    "local",
    "compliance holds though its rule is last",
  );
  assert.equal(placed[id.t1], "fake-windows");
  assert.equal(placed[id.u1], undefined, "u1 waits");
  const counts = {};
  for (const c of Object.values(placed)) counts[c] = (counts[c] || 0) + 1;
  assert.deepEqual(counts, { local: 2, "fake-windows": 1, "fake-linux": 2 });
  const remoteBrief = result.dispatch.find(
    (d) => d.crew === "fake-linux",
  ).brief;
  assert.match(remoteBrief, /clone https:\/\/git\.example\.test\/o\/app\.git/);
  assert.ok(
    !remoteBrief.includes(env.checkout),
    "a remote brief names no local path",
  );
  // Every binding records where and why.
  for (const b of workerBindings(store)) {
    assert.ok(b.placement?.reason, `${b.taskId} records a reason`);
    assert.ok(b.placement.at);
  }
  // u1: one yellow no-fit decision naming every crew.
  const conflicts = await ops.execute("conflicts.view", {});
  const noFit = conflicts.items.filter((i) => i.kind === "no-fit");
  assert.equal(noFit.length, 1);
  assert.equal(noFit[0].taskId, id.u1);
  assert.deepEqual(noFit[0].removed.map((r) => r.crew).sort(), [
    "fake-linux",
    "fake-windows",
    "local",
  ]);
  await crew.tick();
  assert.equal(
    (await ops.execute("conflicts.view", {})).items.filter(
      (i) => i.kind === "no-fit",
    ).length,
    1,
    "still one",
  );
  // A rule change that makes u1 fit closes it by itself.
  env.driver.set("fake-linux", {});
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

  // (14) Without MC-10 every new session runs on local; Preview still
  // shows remote picks, and the Routing page says so.
  env.driver.state.mc10 = false;
  env.driver.record();
  const view = await ops.execute("routing.view", {});
  assert.equal(view.mc10, false);
});

test("P29 action 14: no MC-10 runs every session local", async (t) => {
  const env = await workspace(t, { routing: { rules: RULES }, mc10: false }),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: {},
    });
  const preview = await env.ops.execute("routing.preview", {});
  assert.equal(
    preview.items.find((i) => i.taskId === env.id.t1).crew,
    "fake-windows",
  );
  const placed = crewOf(await crew.tick());
  assert.ok(Object.values(placed).every((c) => c === "local"));
  assert.equal(
    placed[env.id.t1],
    undefined,
    "t1 may not run on local; it waits",
  );
  assert.equal(Object.keys(placed).length, 2);
  const view = await env.ops.execute("routing.view", {});
  assert.equal(view.mc10, false);
});

test("P29 actions 6 and 11: a crew id or router instructions in a tracked file are refused", async (t) => {
  const env = await workspace(t);
  const settings = await env.ops
    .execute("configuration.get", {})
    .catch(() => null);
  const file = path.join(env.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.projects = {
    app: { routing: { rules: [{ id: "pin", on: "fake-linux" }] } },
  };
  fs.writeFileSync(file, JSON.stringify(value));
  const tick = await env.ops.execute("workspace.tick", {});
  assert.equal(tick.policy.status, "invalid");
  assert.match(
    tick.policy.error,
    /projects\.app\.routing\.rules\[0\]\.on names crew fake-linux/,
  );
  value.projects = {};
  value.routing = {
    router: { enabled: true, instructions: "Prefer the build box." },
  };
  fs.writeFileSync(file, JSON.stringify(value));
  const second = await env.ops.execute("workspace.tick", {});
  assert.match(
    second.policy.error,
    /routing\.router\.instructions may live only/,
  );
  void settings;
});

const blocked = ({ report }) =>
  report({ kind: "blocked", text: "the fixture fails" });

test("P29 action 3: a stale crew is unavailable and the retry waits without a decision", async (t) => {
  const env = await workspace(t, { routing: { rules: RULES }, ids: ["t1"] }),
    crew = fakeCrew(env.ops, {
      aliases: env.aliases,
      defaults: defaults(env),
      scripts: { "t1:worker:1": blocked },
    });
  assert.equal(crewOf(await crew.tick())[env.id.t1], "fake-windows");
  env.driver.set("fake-windows", { ageSeconds: 180 });
  await crew.play();
  const retry = await crew.tick();
  assert.deepEqual(
    retry.dispatch.filter((d) => d.role === "worker"),
    [],
  );
  const items = (await env.ops.execute("conflicts.view", {})).items;
  assert.deepEqual(
    items.filter((i) => i.kind === "no-fit"),
    [],
    "no room is not a decision",
  );
  const view = await env.ops.execute("routing.view", {});
  assert.match(
    view.crews.find((c) => c.id === "fake-windows").why,
    /stale reading/,
  );
  // Fresh again: the retry is placed there.
  env.driver.set("fake-windows", { ageSeconds: 5 });
  const again = await crew.tick();
  assert.equal(crewOf(again)[env.id.t1], "fake-windows");
  assert.equal(again.dispatch.find((d) => d.role === "worker").attempt, 2);
});

test("P29 action 5: a base only on this machine keeps work local", async (t) => {
  const env = await workspace(t, {
    routing: { rules: [{ id: "spread-work", on: "tags:os:linux" }] },
    ids: ["w1"],
  });
  commitIn(env.checkout, "local-only.txt", "x\n", "Local only");
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { "w1:worker": "hold" },
  });
  const d = (await crew.tick()).dispatch.find((x) => x.role === "worker");
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

test("P29 actions 7 and 12: an unreachable crew keeps its binding; a pushed branch integrates", async (t) => {
  // A pin is allowed in this machine's rules only.
  const env = await workspace(t, {
      routing: { rules: [{ id: "spread-work", on: "any" }] },
      machine: {
        rules: [
          { id: "pin-linux", when: { roles: ["worker"] }, on: "fake-linux" },
        ],
      },
      ids: ["w2", "w3"],
    }),
    { ops, store, id } = env;
  // The repository's remote reports public; placement does not read it.
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
  // fake-linux stops answering while w2 runs.
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
  // It comes back: its roster lists w2 again before anything new opens there.
  reachable = true;
  env.driver.set("fake-linux", { reachable: true });
  const back = await crew.tick();
  assert.equal(back.held, undefined);
  // w3's retry after its reported failure is placed afresh.
  const retry = back.dispatch.find(
    (d) => d.task === id.w3 && d.role === "worker",
  );
  assert.equal(retry.attempt, 2);
  assert.equal(retry.crew, "fake-linux");
  // w2's remote worker pushes its branch; Avoozl fetches it, checks the
  // commit, verifies, and integrates it like a local one.
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
  void store;
});

test("P29 action 7b: a reported commit that is not the pushed tip is refused", async (t) => {
  const env = await workspace(t, {
      routing: { rules: [{ id: "linux", on: "tags:os:linux" }] },
      crews: { ...CREWS, local: { ...CREWS.local, chatLimit: 0 } },
      ids: ["w1"],
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

test("P29 actions 8 and 9: a diff rule set or the switch off keeps sessions local", async (t) => {
  const env = await workspace(t, {
    routing: { rules: [{ id: "spread-work", on: "any" }] },
    ids: ["w1", "w2", "w3"],
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
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { "w1:worker": "hold", "w2:worker": "hold", "w3:worker": "hold" },
  });
  const result = await crew.tick();
  const d = result.dispatch.filter((x) => x.role === "worker");
  assert.ok(d.length >= 1);
  assert.ok(
    d.every((x) => !x.crew),
    "no session in that repository goes remote",
  );
  assert.ok(
    d[0].placement.removed.some((r) =>
      /content rule set fake-diff forbids remote crews/.test(r.by),
    ),
  );

  const off = await workspace(t, {
    routing: { rules: [{ id: "spread-work", on: "any" }] },
    ids: ["w1", "w2", "w3"],
  });
  off.driver.state.remoteDispatch = false;
  off.driver.record();
  const crew2 = fakeCrew(off.ops, {
    aliases: off.aliases,
    defaults: defaults(off),
    scripts: { "w1:worker": "hold", "w2:worker": "hold", "w3:worker": "hold" },
  });
  const second = (await crew2.tick()).dispatch.filter(
    (x) => x.role === "worker",
  );
  assert.equal(second.length, 2, "local's limit");
  assert.ok(second.every((x) => !x.crew));
  assert.match(
    second[0].placement.removed.find((r) => r.crew === "fake-linux").by,
    /remote dispatch is off/,
  );
});

test("P29 action 10: chat and stale limits are set and cleared on this machine", async (t) => {
  const env = await workspace(t, {
    routing: { rules: [{ id: "linux", on: "tags:os:linux" }] },
    ids: ["w1", "w2", "w3"],
    crews: { ...CREWS, local: { ...CREWS.local, chatLimit: 0 } },
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
    scripts: { "w1:worker": "hold", "w2:worker": "hold", "w3:worker": "hold" },
  });
  assert.equal(
    Object.keys(crewOf(await crew.tick())).length,
    1,
    "at most 1 on fake-linux",
  );
  env.driver.set("fake-linux", { ageSeconds: 70 });
  let view = await env.ops.execute("routing.view", {});
  assert.match(
    view.crews.find((c) => c.id === "fake-linux").why,
    /stale reading \(70 s old\)/,
  );
  assert.equal(view.staleSeconds, 60);
  // A session is refused the write.
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
  assert.equal(linux.chatLimitSet, true);
  assert.equal(view.staleSeconds, null, "the placeholder shows 120 s");
  assert.ok(!linux.why || !/stale/.test(linux.why));
});

test("P29 action 13: Attach opens a local chat and, through MC-10, a remote one", async (t) => {
  const env = await workspace(t, {
    routing: {
      rules: [
        { id: "linux", when: { labels: ["x"] }, on: "tags:os:linux" },
        { id: "spread", on: "any" },
      ],
    },
    ids: ["w1", "w2", "w3"],
  });
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: { "w1:worker": "hold", "w2:worker": "hold", "w3:worker": "hold" },
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
    routing: { rules: [{ id: "spread-work", on: "any" }] },
    machine: {
      rules: [
        { id: "pin-linux", when: { roles: ["worker"] }, on: "fake-linux" },
      ],
    },
    ids: ["w1"],
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
  // The remote reports public: visibility plays no part in placement.
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
  assert.equal(
    env.store.get("task_deliveries", env.id.w1) ?? null,
    null,
    "recorded by the next tick",
  );
  await crew.tick();
  assert.equal(env.store.get("task_deliveries", env.id.w1).state, "done");
});
