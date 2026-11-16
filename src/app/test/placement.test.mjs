// Placement hard checks and the routing agent (tasks 11.14–11.16; design
// §4.10). Pure functions and one in-memory store; fake crews only.
import assert from "node:assert/strict";
import test from "node:test";
import { crewSettingsInput, listCrews, remoteHost } from "../crews.mjs";
import {
  crewChecks,
  modelChecks,
  routingConfig,
  validateNeeds,
  validateRouting,
  validateSession,
  validateTrackedRouting,
} from "../placement.mjs";
import { placeOne } from "../routing.mjs";
import { fixture } from "./fixtures.mjs";

const now = Date.parse("2026-11-13T10:00:00Z");
const fresh = (extra = {}) => ({
  measured_at: new Date(now - 10_000).toISOString(),
  mem_free_gb: 24,
  disk_free_gb: 300,
  load_per_cpu: 0.2,
  ...extra,
});
const crews = (settings = {}, { running = new Map(), ready } = {}) =>
  listCrews({
    settings: {
      local: { tags: ["os:macos", "arch:arm64"], chatLimit: 2 },
      "fake-linux": {
        tags: ["os:linux", "trust:remote"],
        gitHosts: ["git.example.test"],
        chatLimit: 2,
      },
      "fake-windows": {
        tags: ["os:windows", "trust:remote"],
        gitHosts: ["git.example.test"],
        chatLimit: 1,
      },
      ...settings,
    },
    snapshot: {
      instances: [
        { id: "fake-linux", name: "fake linux" },
        { id: "fake-windows", name: "fake windows" },
      ],
      headroom: { "fake-linux": fresh(), "fake-windows": fresh() },
      ready: ready ?? { "fake-linux": true, "fake-windows": true },
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
const open = {
  role: "worker",
  remoteDispatch: true,
  canOpenRemote: true,
  fetchable: () => null,
};
const noHealth = { level: () => "ok", replacement: () => null, marks: [] };
const health = (levels) => ({
  level: (m) => levels[m] ?? "ok",
  replacement: () => null,
  marks: [],
});

test("a crew without settings is trust:remote with no git hosts, limit 2", () => {
  const [, other] = listCrews({
    snapshot: { instances: [{ id: "box" }], headroom: { box: fresh() } },
    local: { measuredAt: new Date(now).toISOString() },
    now,
  });
  assert.equal(other.trust, "remote");
  assert.deepEqual(other.gitHosts, []);
  assert.equal(other.chatLimit, 2);
  assert.equal(other.ready, null, "approval mode unknown until reported");
  assert.equal(listCrews({ now })[0].chatLimit, 3);
  assert.equal(listCrews({ now })[0].ready, true, "local is ready");
});

test("crew settings refuse an unknown tag key and name each bad key", () => {
  assert.throws(
    () =>
      crewSettingsInput({
        box: { tags: ["color:red"], chatLimit: 99, delivery: "fax" },
      }),
    (error) =>
      /unknown tag key color/.test(error.message) &&
      /chatLimit/.test(error.message) &&
      /delivery must be handback or push/.test(error.message),
  );
});

test("validation keeps the prompt on this machine and refuses old keys", () => {
  assert.throws(
    () => validateTrackedRouting({ routing: { prompt: "x" } }),
    /only in this machine's settings/,
  );
  assert.throws(
    () => validateTrackedRouting({ routing: { rules: [], pick: {} } }),
    /old routing keys; run node scripts\/migrate-routing\.mjs/,
  );
  assert.throws(
    () => validateTrackedRouting({ projects: { app: { routing: {} } } }),
    /projects\.app\.routing: old routing keys/,
  );
  assert.throws(
    () => validateTrackedRouting({ providers: {} }),
    /machine's setting/,
  );
  assert.throws(
    () =>
      validateRouting(
        { enabled: "yes", prompt: "a\u0001", extra: 1 },
        { tracked: false },
      ),
    (e) =>
      /enabled must be true or false/.test(e.message) &&
      /printable/.test(e.message) &&
      /extra is not a routing setting/.test(e.message),
  );
  validateRouting(
    { enabled: true, prompt: "Spread the load.", model: "model-r" },
    { tracked: false },
  );
});

test("a manifest pins agent, model and crew; choices and bad needs are refused", () => {
  validateSession({
    agent: "kirocrew-worker",
    model: "model-a",
    crew: "local",
  });
  assert.throws(
    () => validateSession({ choices: [{ model: "m" }] }),
    /choices was removed/,
  );
  assert.throws(() => validateSession({ crew: "" }), /crew must be a crew id/);
  validateNeeds(["os:windows", "tools:docker"]);
  assert.throws(() => validateNeeds(["windows"]), /tag key:value/);
});

test("hard checks: needs, pins, approvals, reach and MC-10 only remove", () => {
  const list = crews(
    {},
    { ready: { "fake-linux": true, "fake-windows": false } },
  );
  const all = crewChecks(list, open);
  assert.deepEqual(all.allowed, ["local", "fake-linux"]);
  assert.match(
    all.removed.find((r) => r.crew === "fake-windows").by,
    /would stall on tool approvals/,
  );
  const win = crewChecks(crews(), { ...open, needs: ["os:windows"] });
  assert.deepEqual(win.allowed, ["fake-windows"]);
  assert.match(
    win.removed.find((r) => r.crew === "local").by,
    /lacks os:windows/,
  );
  assert.deepEqual(
    crewChecks(crews(), { ...open, pin: "fake-linux" }).allowed,
    ["fake-linux"],
  );
  assert.deepEqual(
    crewChecks(crews(), { ...open, remoteDispatch: false }).allowed,
    ["local"],
  );
  assert.match(
    crewChecks(crews(), { ...open, canOpenRemote: false }).removed[0].by,
    /waits on Kiro Crew \(MC-10\)/,
  );
  assert.deepEqual(
    crewChecks(crews(), { ...open, role: "checks" }).allowed,
    ["local"],
    "checks run where the commit is",
  );
  assert.match(
    crewChecks(crews(), { ...open, contentForbids: "fake-diff" }).removed[0].by,
    /fake-diff forbids remote crews/,
  );
  const unknown = crewChecks(crews({}, { ready: {} }), open);
  assert.deepEqual(unknown.allowed, ["local"]);
  assert.match(unknown.removed[0].by, /approval mode unknown/);
  const full = crewChecks(
    crews({}, { running: new Map([["fake-linux", 2]]) }),
    open,
  );
  assert.deepEqual(
    full.busy,
    ["fake-linux"],
    "a full crew is busy, not ruled out",
  );
});

test("model checks: out is never offered, low stays, the pin wins", () => {
  const h = health({ "alpha-1": "out", "beta-1": "low" });
  assert.deepEqual(
    modelChecks({
      fallback: null,
      listed: ["alpha-1", "beta-1", "gamma-1"],
      health: h,
    }),
    {
      models: [null, "beta-1", "gamma-1"],
      removed: [{ model: "alpha-1", by: "alpha-1 is out" }],
    },
  );
  assert.deepEqual(
    modelChecks({ pin: "beta-1", listed: ["gamma-1"], health: h }).models,
    ["beta-1"],
  );
  assert.deepEqual(
    modelChecks({ pin: "alpha-1", listed: ["gamma-1"], health: h }).models,
    [],
    "an out pin waits",
  );
  assert.deepEqual(
    modelChecks({
      listed: ["delta-1"],
      skipModels: ["delta-1"],
      health: noHealth,
    }).removed,
    [{ model: "delta-1", by: "delta-1 is a review role's model" }],
  );
});

function ctxFor(store, extra = {}) {
  return {
    config: routingConfig({
      machine: { routing: { enabled: true, prompt: "Spread the load." } },
    }),
    crews: crews(),
    remoteDispatch: true,
    mc10: true,
    counts: { crews: new Map(), models: new Map() },
    fetch: new Map(),
    now,
    script: true,
    models: ["model-a", "model-b"],
    localLimit: null,
    health: noHealth,
    ...extra,
  };
}
const project = { id: "app", root: "/nowhere" };
const fetchable = { fetch: new Map([["app", null]]) };

test("off: local on the default model; a manifest pin still wins", (t) => {
  const { store } = fixture(t),
    data = store.read(),
    ctx = ctxFor(store, {
      ...fetchable,
      config: routingConfig(),
    });
  const plain = placeOne(
    store,
    data,
    ctx,
    { crews: new Map() },
    {
      task: { id: "t1", repository: "app" },
      role: "worker",
      project,
      policy: { model: "model-w" },
    },
  );
  assert.equal(plain.crew, "local");
  assert.equal(plain.model, "model-w");
  assert.equal(plain.placement.reason, "routing is off: local");
  const pinned = placeOne(
    store,
    data,
    ctxFor(store, fetchable),
    { crews: new Map() },
    {
      task: { id: "t2", repository: "app", session: { model: "model-m" } },
      role: "worker",
      project,
    },
  );
  assert.equal(pinned.model, "model-m");
  assert.equal(pinned.placement.reason, "pinned in the manifest");
  const needsWin = placeOne(
    store,
    data,
    ctxFor(store, fetchable),
    { crews: new Map() },
    {
      task: { id: "t3", repository: "app", needs: ["os:windows"] },
      role: "worker",
      project,
    },
  );
  assert.equal(needsWin.noFit, true, "fake-windows cannot fetch: no crew fits");
});

test("remote hosts", () => {
  assert.equal(
    remoteHost("git@git.example.test:o/app.git"),
    "git.example.test",
  );
  assert.equal(remoteHost("/tmp/bare.git"), null);
});

test("failure: no crew passes the checks waits as a no-fit, not locally", (t) => {
  const { store } = fixture(t),
    r = placeOne(
      store,
      store.read(),
      ctxFor(store, fetchable),
      { crews: new Map() },
      {
        task: { id: "t1", repository: "app", needs: ["os:windows"] },
        role: "worker",
        project,
      },
    );
  assert.equal(r.wait, true);
  assert.equal(r.noFit, true);
  assert.equal(r.crew, undefined);
});
