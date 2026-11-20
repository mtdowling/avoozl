// MCP steps (plugin-checks pk-1.6, D13, PK10): fixed tool calls on a fake
// stdio MCP server from the test tree, which logs every call it gets.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { validateManifest, inspectPlugins } from "../plugins.mjs";
import {
  approvedPluginChecks,
  setMapping,
  validateMapping,
} from "../plugin-checks.mjs";
import { contentKey, runPluginCheck } from "../plugin-check-run.mjs";
import { readPath } from "../mcp-steps.mjs";
import { checkRuns, drainCheckRuns } from "../../delivery/check-runs.mjs";
import { OPERATIONS } from "../../api/operation-table.mjs";
import { git, workerDone } from "../../test/delivery-fixture.mjs";
import {
  FAKE_MCP,
  PLUGIN_FIXTURE,
  manifestOf,
  refused,
  pluginWorkspace,
  taskStage,
} from "../../test/plugin-checks-fixture.mjs";

const review = (m) => m.checks["parity-review"];

// Only parity-review, at task stage, its server mapped to the fake with
// `args` (and a log file).
function mcpWorkspace(t, args = [], { approve = true } = {}) {
  let log = null;
  const workspace = pluginWorkspace(t, {
    edit: (m) => {
      taskStage(m);
      delete m.checks.parity;
      delete m.checks["license-scan"];
      review(m).mcp.poll.everySeconds = 5;
    },
    approve,
    files: { "src/api/handler.js": "1\n", "schema/api.json": "{}\n" },
  });
  log = path.join(workspace.root, "mcp.log");
  setMapping(workspace.options, {
    id: "acme-checks",
    alias: "review",
    command: [process.execPath, FAKE_MCP, "--log", log, ...args],
    env: ["REVIEW_TOKEN"],
  });
  if (approve) workspace.approve();
  const calls = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const checkout = workspace.checkout,
    base = git(checkout, "rev-parse", "HEAD"),
    change = (files) => {
      for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(checkout, file)), {
          recursive: true,
        });
        fs.writeFileSync(path.join(checkout, file), text);
      }
      git(checkout, "add", "-A");
      git(checkout, "commit", "-qm", "Change");
      return git(checkout, "rev-parse", "HEAD");
    },
    run = (commit, extra = {}) =>
      runPluginCheck(workspace.check("parity-review"), {
        store: workspace.store,
        repository: workspace.store.get("repositories", "app"),
        root: checkout,
        dir: checkout,
        commit,
        base,
        repo: "acme/api",
        timeoutMs: 30_000,
        secondMs: 10,
        pluginOptions: workspace.options,
        ...extra,
      });
  return { ...workspace, log, calls, change, run, base };
}

test("pk-1.6: an MCP step validates, and a bad one is refused", () => {
  validateManifest(manifestOf(), { id: "acme-checks" }, PLUGIN_FIXTURE);
  refused((m) => (review(m).mcp.server = "other"), /servers does not declare/);
  refused(
    (m) => (m.servers.spare = { about: "Not used" }),
    /server spare is declared but no check uses it/,
  );
  refused(
    (m) => (review(m).mcp.start.args.when = "{today}"),
    /holds \{today\}/,
  );
  refused(
    (m) => (review(m).mcp.result.path = "$.items[?(@.ok)]"),
    /with no filter/,
  );
  refused(
    (m) => (review(m).network = true),
    /key network goes with a run step/,
  );
  refused((m) => (review(m).mcp.start.args.id = "{id}"), /holds \{id\}/);
  assert.deepEqual(readPath({ a: [{ b: 2 }] }, "$.a[0].b"), 2);
  assert.equal(readPath({ a: 1 }, "$.a.b"), undefined);
});

test("pk-1.6: a mapping holds no credential and only a person sets it", (t) => {
  assert.throws(
    () => validateMapping({ command: ["srv"], token: "x" }),
    /looks like a credential/,
  );
  assert.throws(
    () => validateMapping({ command: ["srv", `--key=ghp_${"a".repeat(36)}`] }),
    /looks like a credential/,
  );
  assert.deepEqual(validateMapping({ command: ["srv"] }), {
    command: ["srv"],
    env: [],
  });
  assert.equal(OPERATIONS.get("plugin.map").policy.kind, "person");
  const workspace = mcpWorkspace(t);
  return assert.rejects(
    workspace.ops.execute(
      "plugin.map",
      { id: "acme-checks", alias: "review", command: ["x"] },
      undefined,
      { caller: { sessionKey: "dashboard:agent" } },
    ),
    /Only a person/,
  );
});

test("pk-1.6: no mapping is not run naming the alias; a changed mapping waits for approval", async (t) => {
  const workspace = pluginWorkspace(t, {
      edit: (m) => {
        taskStage(m);
        delete m.checks.parity;
      },
    }),
    check = workspace.check("parity-review"),
    head = git(workspace.checkout, "rev-parse", "HEAD"),
    result = await runPluginCheck(check, {
      store: workspace.store,
      dir: workspace.checkout,
      root: workspace.checkout,
      commit: head,
    });
  assert.equal(result.exitCode, null);
  assert.match(result.notRun, /map server review/);
  const mapped = mcpWorkspace(t);
  assert.ok(mapped.check("parity-review"));
  setMapping(mapped.options, {
    id: "acme-checks",
    alias: "review",
    command: [process.execPath, FAKE_MCP, "--mode", "error"],
  });
  const [plugin] = inspectPlugins(mapped.options);
  assert.equal(plugin.state, "changed");
  assert.match(plugin.reason, /MCP server mapping changed/);
  assert.equal(approvedPluginChecks(mapped.options).length, 0);
});

test("pk-1.6: start, polls and a result pass and fail by pass, with only the text kept", async (t) => {
  const workspace = mcpWorkspace(t, ["--running", "3"]);
  process.env.REVIEW_TOKEN = "r";
  process.env.GH_TOKEN = "g";
  t.after(() => {
    delete process.env.REVIEW_TOKEN;
    delete process.env.GH_TOKEN;
  });
  const same = await workspace.run(
    workspace.change({ "src/api/handler.js": "2\n" }),
  );
  assert.deepEqual([same.exitCode, same.tail], [0, "Same behavior."]);
  const calls = workspace.calls().filter((c) => c.method === "tools/call");
  assert.deepEqual(
    calls.map((c) => c.params.name),
    ["create_review", "get_review", "get_review", "get_review", "get_review"],
  );
  const start = calls[0].params.arguments;
  assert.equal(start.repo, "acme/api");
  assert.match(start.question, /Answer same or/);
  assert.equal(start.from, workspace.base);
  assert.deepEqual(calls[1].params.arguments, { id: "r-1" });
  assert.deepEqual(calls[0].env, {
    REVIEW_TOKEN: "present",
    GH_TOKEN: "absent",
    SSH_AUTH_SOCK: "absent",
    KIROCREW_PROXY_SECRET: "absent",
  });
  const differs = await workspace.run(
    workspace.change({
      "schema/api.json": '{"x": 1}\n',
      "src/api/handler.js": "4\n",
    }),
  );
  assert.equal(differs.exitCode, 1);
  assert.equal(
    differs.tail,
    "The schema changed: the response field list differs.",
  );
});

test("pk-1.6: an MCP error, no JSON, no id, no result and a timeout fail; a missing tool is not run", async (t) => {
  for (const [mode, pattern] of [
    ["error", /MCP error from create_review/],
    ["nojson", /replied with no JSON/],
    ["noid", /gave no id at \$\.review\.id/],
    ["noresult", /no value at \$\.verdict/],
  ]) {
    const workspace = mcpWorkspace(t, ["--mode", mode]),
      result = await workspace.run(workspace.change({ "src/api/a.js": mode }));
    assert.equal(result.exitCode, 1, mode);
    assert.match(result.tail, pattern, mode);
  }
  const slow = mcpWorkspace(t, ["--running", "1000"]),
    late = await slow.run(slow.change({ "src/api/a.js": "slow" }), {
      timeoutMs: 600,
    });
  assert.equal(late.exitCode, 1);
  assert.match(late.tail, /timed out after \d+ s/);
  const missing = mcpWorkspace(t, ["--mode", "notools"]),
    none = await missing.run(missing.change({ "src/api/a.js": "n" }));
  assert.equal(none.exitCode, null);
  assert.match(none.notRun, /lists no tool get_review/);
  assert.equal(
    missing.calls().filter((c) => c.method === "tools/call").length,
    0,
  );
});

test("pk-1.6: a reply naming another tool changes nothing, and no other tool is called", async (t) => {
  const workspace = mcpWorkspace(t, ["--mode", "instruct"]),
    result = await workspace.run(workspace.change({ "src/api/a.js": "i" }));
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    [
      ...new Set(workspace.calls().map((c) => c.params?.name ?? c.method)),
    ].sort(),
    [
      "create_review",
      "get_review",
      "initialize",
      "notifications/initialized",
      "tools/list",
    ],
  );
});

test("pk-1.6: a server that opens a listener is stopped and its plugin marked broken", async (t) => {
  const workspace = mcpWorkspace(t, ["--mode", "listen", "--running", "1000"]),
    result = await workspace.run(workspace.change({ "src/api/a.js": "l" }));
  assert.equal(result.exitCode, 1);
  assert.match(result.violation, /opened a network listener/);
  const [plugin] = inspectPlugins(workspace.options);
  assert.equal(plugin.state, "unapproved");
  assert.match(plugin.reason, /Marked broken/);
});

test("pk-1.6: a cache hit makes no call, and a changed mapping misses", async (t) => {
  const workspace = mcpWorkspace(t),
    commit = workspace.change({ "src/api/a.js": "c" });
  assert.equal((await workspace.run(commit)).exitCode, 0);
  const before = workspace.calls().length,
    again = await workspace.run(commit);
  assert.ok(again.cached);
  assert.equal(workspace.calls().length, before);
  const check = workspace.check("parity-review"),
    key = await contentKey(workspace.checkout, check, {
      commit,
      base: workspace.base,
    });
  assert.notEqual(
    await contentKey(
      workspace.checkout,
      { ...check, mappingHash: "other" },
      { commit, base: workspace.base },
    ),
    key,
  );
});

test("pk-1.6: a backend killed mid-poll resumes the same id; the server saw one start", async (t) => {
  const workspace = mcpWorkspace(t, ["--running", "2"]),
    { ops, store } = workspace;
  await workerDone(ops, "a", "w-1", 1, { "src/api/handler.js": "3\n" });
  await ops.execute("workspace.tick", {
    sessions: [{ target: "w-1", status: "idle" }],
  });
  const [queued] = checkRuns(store);
  // The run was polling review r-1 when its backend died.
  store.put("flow_records", {
    ...queued,
    state: "running",
    pid: 2 ** 22 + 12345,
    mcpIds: { "parity-review": "r-1" },
  });
  await drainCheckRuns(store, { mcp: { secondMs: 10 } });
  const [run] = checkRuns(store),
    result = run.checks.find((c) => c.name === "parity-review");
  assert.equal(run.state, "finished");
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  const named = workspace
    .calls()
    .filter((c) => c.method === "tools/call")
    .map((c) => [c.params.name, c.params.arguments.id ?? null]);
  assert.deepEqual(named, [
    ["get_review", "r-1"],
    ["get_review", "r-1"],
    ["get_review", "r-1"],
  ]);
});
