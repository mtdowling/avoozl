// Crew placement and session choice (tasks 11.1–11.3, 11.11; design §4.10).
import assert from "node:assert/strict";
import test from "node:test";
import { crewSettingsInput, listCrews, remoteHost } from "../crews.mjs";
import {
  chooseSession,
  evaluatePlacement,
  globMatch,
  pickCrew,
  presetOf,
  routingConfig,
  validateRouting,
  validateTrackedRouting,
  weightsOf,
} from "../placement.mjs";

const now = Date.parse("2026-11-13T10:00:00Z");
const fresh = (extra = {}) => ({
  measured_at: new Date(now - 10_000).toISOString(),
  mem_free_gb: 24,
  disk_free_gb: 300,
  load_per_cpu: 0.2,
  ...extra,
});
const crews = (settings = {}, headroom = {}, running = new Map()) =>
  listCrews({
    settings: {
      local: { tags: ["os:macos", "arch:arm64"], chatLimit: 2 },
      "fake-linux": { tags: ["os:linux", "trust:remote"], gitHosts: ["git.example.test"], chatLimit: 2 },
      "fake-windows": { tags: ["os:windows", "trust:remote"], gitHosts: ["git.example.test"], chatLimit: 1 },
      ...settings,
    },
    snapshot: {
      instances: [
        { id: "fake-linux", name: "fake linux" },
        { id: "fake-windows", name: "fake windows" },
      ],
      headroom: { "fake-linux": fresh(), "fake-windows": fresh(), ...headroom },
    },
    local: {
      source: "node",
      measuredAt: new Date(now).toISOString(),
      memFreeGb: 8,
      diskFreeGb: 80,
      loadPerCpu: 0.5,
    },
    running,
    now,
  });
const subject = (extra = {}) => ({
  labels: [],
  kind: "leaf",
  role: "worker",
  repository: "app",
  category: null,
  paths: [],
  ...extra,
});
const rules = (list) => routingConfig({ workspace: { routing: { rules: list } } }).rules;
const open = { remoteDispatch: true, fetchable: () => null };

test("a crew without settings is trust:remote with no git hosts, limit 2", () => {
  const [, other] = listCrews({
    snapshot: { instances: [{ id: "box" }], headroom: { box: fresh() } },
    local: { measuredAt: new Date(now).toISOString() },
    now,
  });
  assert.equal(other.trust, "remote");
  assert.deepEqual(other.gitHosts, []);
  assert.equal(other.chatLimit, 2);
  assert.equal(listCrews({ now })[0].chatLimit, 3);
});

test("a stale, busy, or full crew is unavailable, with why", () => {
  const list = crews(
    {},
    { "fake-windows": fresh({ measured_at: new Date(now - 180_000).toISOString() }) },
    new Map([["fake-linux", 2]]),
  );
  const by = Object.fromEntries(list.map((c) => [c.id, c]));
  assert.match(by["fake-windows"].why, /stale reading \(180 s old\)/);
  assert.equal(by["fake-linux"].why, "2/2 chats");
  assert.equal(by.local.available, true);
  const short = listCrews({
    settings: {},
    staleSeconds: 60,
    snapshot: { instances: [{ id: "b" }], headroom: { b: fresh({ measured_at: new Date(now - 70_000).toISOString() }) } },
    now,
  });
  assert.match(short[1].why, /stale/);
});

test("crew settings refuse an unknown tag key and name each bad key", () => {
  assert.throws(
    () => crewSettingsInput({ box: { tags: ["color:red"], chatLimit: 99, delivery: "fax" } }),
    (error) =>
      /unknown tag key color/.test(error.message) &&
      /chatLimit/.test(error.message) &&
      /delivery must be handback or push/.test(error.message),
  );
  assert.throws(() => crewSettingsInput({ local: { tags: ["trust:remote"] } }), /always trust:local/);
});

test("validation refuses a crew id or router instructions in a tracked file", () => {
  assert.throws(
    () => validateTrackedRouting({ routing: { rules: [{ id: "pin", on: "fake-linux" }] } }),
    /pin a crew only in this machine's settings/,
  );
  assert.throws(
    () => validateTrackedRouting({ routing: { router: { instructions: "prefer x" } } }),
    /routing\.router\.instructions may live only/,
  );
  assert.throws(
    () => validateTrackedRouting({ projects: { app: { routing: { rules: [{ id: "p", on: "box" }] } } } }),
    /projects\.app\.routing\.rules\[0\]\.on/,
  );
  // This machine may pin and hold instructions.
  validateRouting({ rules: [{ id: "pin", on: "fake-linux" }], router: { instructions: "x" } }, { tracked: false });
  assert.throws(() => validateRouting({ rules: [{ on: "any" }] }), /\.id is required/);
  assert.throws(() => validateRouting({ rules: [{ id: "a", requireTags: ["shape:x"] }] }), /unknown tag key shape/);
  assert.throws(
    () => validateRouting({ rules: [{ id: "a", route: "plugin:gone" }] }, { pluginIds: ["here"] }),
    /plugin gone, which is not loaded/,
  );
});

test("session validation names weight 0 and 11 choices together", () => {
  const choices = Array.from({ length: 11 }, () => ({ model: "m" }));
  choices[0].weight = 0;
  assert.throws(
    () => validateRouting({ rules: [{ id: "r", session: { choices } }] }),
    (error) =>
      /rules\[0\]\.session\.choices must list 1–10/.test(error.message) &&
      /choices\[0\]\.weight must be a whole number 1–100/.test(error.message),
  );
  assert.throws(() => validateRouting({ rules: [{ id: "r", session: { model: "" } }] }), /model must be a model name/);
});

test("keepLocal holds wherever it sits; constraints combine from every rule", () => {
  const list = crews(),
    set = rules([
      { id: "spread-work", on: "any" },
      { id: "windows-tests", when: { kinds: ["test"], paths: ["src/win/**"] }, on: "any", requireTags: ["os:windows"] },
      { id: "compliance", when: { labels: ["compliance"] }, keepLocal: true },
    ]);
  assert.deepEqual(evaluatePlacement(subject({ labels: ["compliance"] }), set, list, open).allowed, ["local"]);
  assert.deepEqual(
    evaluatePlacement(subject({ kind: "test", paths: ["src/win/a.c"] }), set, list, open).allowed,
    ["fake-windows"],
  );
  assert.deepEqual(evaluatePlacement(subject(), set, list, open).allowed, ["local", "fake-linux", "fake-windows"]);
  const none = evaluatePlacement(
    subject({ labels: ["needs-arm-linux"] }),
    rules([
      { id: "spread-work", on: "any" },
      { id: "arm-linux", when: { labels: ["needs-arm-linux"] }, requireTags: ["os:linux", "arch:arm64"] },
    ]),
    list,
    open,
  );
  assert.deepEqual(none.allowed, []);
  assert.deepEqual(
    none.removed.map((r) => r.crew).sort(),
    ["fake-linux", "fake-windows", "local"],
  );
  assert.ok(none.removed.every((r) => /arm-linux requires/.test(r.by)));
});

test("no rule means local; remote dispatch off removes remote crews", () => {
  const list = crews();
  assert.deepEqual(evaluatePlacement(subject(), [], list, open).allowed, ["local"]);
  const off = evaluatePlacement(subject(), rules([{ id: "any", on: "any" }]), list, { remoteDispatch: false });
  assert.deepEqual(off.allowed, ["local"]);
  assert.match(off.removed.find((r) => r.crew === "fake-linux").by, /remote dispatch is off/);
});

test("the scorer spreads one batch by reservation and never passes a limit", () => {
  const list = crews(),
    reserved = new Map(),
    picks = [];
  for (let i = 0; i < 5; i++) {
    const pick = pickCrew(["local", "fake-linux"], list, weightsOf({}), reserved);
    if (!pick) break;
    reserved.set(pick.crew.id, (reserved.get(pick.crew.id) || 0) + 1);
    picks.push(pick.crew.id);
  }
  assert.deepEqual(picks.sort(), ["fake-linux", "fake-linux", "local", "local"]);
  // Keep local wins local while it has room.
  assert.equal(pickCrew(["local", "fake-linux"], list, weightsOf({ preset: "keep-local" })).crew.id, "local");
  assert.equal(presetOf({ preset: "balanced", weights: { local: 3 } }), "custom");
  assert.equal(presetOf({ weights: weightsOf({ preset: "spread-out" }) }), "spread-out");
});

test("weighted choices split 4 to 2 and retries keep the pick", () => {
  const set = rules([
      { id: "hard-parts", when: { labels: ["hard"] }, session: { model: "model-a" } },
      { id: "routine", session: { choices: [{ model: "model-b", weight: 2 }, { model: "model-c" }] } },
    ]),
    reserved = new Map(),
    models = [];
  for (let i = 0; i < 6; i++) {
    const s = chooseSession({ task: { id: "r" + i }, role: "worker", rules: set, subject: subject(), reserved, defaults: { agent: "kirocrew-worker" } });
    const key = `${s.agent}\u0000${s.model}`;
    reserved.set(key, (reserved.get(key) || 0) + 1);
    models.push(s.model);
  }
  assert.deepEqual(models.filter((m) => m === "model-b").length, 4);
  assert.deepEqual(models.filter((m) => m === "model-c").length, 2);
  const hard = chooseSession({ task: { id: "h" }, role: "worker", rules: set, subject: subject({ labels: ["hard"] }) });
  assert.equal(hard.model, "model-a");
  assert.equal(hard.reason, "rule hard-parts");
  const manifest = chooseSession({ task: { id: "m", session: { model: "model-m" } }, role: "worker", rules: set, subject: subject() });
  assert.equal(manifest.model, "model-m");
  const kept = chooseSession({ task: { id: "r" }, role: "worker", rules: set, subject: subject(), kept: { agent: null, model: "model-c" } });
  assert.equal(kept.model, "model-c");
  assert.match(kept.reason, /kept/);
  // A rule's session applies to the worker only unless it names roles.
  assert.equal(chooseSession({ task: { id: "r" }, role: "checks", rules: set, subject: subject(), defaults: { source: "role" } }).from, "role");
});

test("distinctFrom model skips a writer choice, else one wait", () => {
  const set = rules([{ id: "routine", session: { choices: [{ model: "model-r" }, { model: "model-c" }] } }]);
  for (let i = 0; i < 3; i++)
    assert.equal(chooseSession({ task: { id: "x" }, role: "worker", rules: set, subject: subject(), skipModels: ["model-r"] }).model, "model-c");
  const only = rules([{ id: "solo", session: { model: "model-r" } }]);
  const wait = chooseSession({ task: { id: "x" }, role: "worker", rules: only, subject: subject(), skipModels: ["model-r"] });
  assert.equal(wait.wait, true);
  assert.equal(wait.distinct, true);
});

test("globs and remote hosts", () => {
  assert.ok(globMatch("src/win/**", "src/win/a/b.c"));
  assert.ok(!globMatch("src/win/*", "src/win/a/b.c"));
  assert.equal(remoteHost("git@git.example.test:o/app.git"), "git.example.test");
  assert.equal(remoteHost("https://git.example.test/o/app.git"), "git.example.test");
  assert.equal(remoteHost("/tmp/bare.git"), null);
});
