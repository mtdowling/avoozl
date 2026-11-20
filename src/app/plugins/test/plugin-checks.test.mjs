// Checks from a plugin (plugin-checks pk-1.1 to pk-1.3): the checks part
// in the manifest, one check list with the repository's own, running a
// plugin check as outside code, and the result cache. Real git, the
// example plugin from the test tree, and Avoozl's own check runner.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  approvePlugin,
  inspectPlugins,
  validateManifest,
  writePluginSettings,
} from "../plugins.mjs";
import {
  approvedPluginChecks,
  pluginCheckNeedsYou,
  validateChecksPart,
} from "../plugin-checks.mjs";
import {
  cachedResult,
  contentKey,
  runPluginCheck,
  storeResult,
} from "../plugin-check-run.mjs";
import {
  pluginCheckConflicts,
  repositoryChecks,
  selectedChecks,
} from "../../workspace/repository-checks.mjs";
import { checkRuns, drainCheckRuns } from "../../delivery/check-runs.mjs";
import { directSteps } from "../../landing/merge-batch.mjs";
import { sandboxKind } from "../../executors/sandbox.mjs";
import { git, workerDone } from "../../test/delivery-fixture.mjs";
import {
  PLUGIN_FIXTURE,
  manifestOf,
  refused,
  copyPlugin,
  pluginWorkspace,
  taskStage,
} from "../../test/plugin-checks-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const tick = (ops, slots = []) =>
  ops.execute("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });
const api = { "src/api/handler.js": "export const x = 2;\n" };

test("pk-1.1: the checks part validates, and each bad key is refused naming the plugin, check and key", (t) => {
  const manifest = manifestOf();
  assert.deepEqual(
    Object.keys(validateChecksPart(manifest, PLUGIN_FIXTURE)).sort(),
    ["license-scan", "parity", "parity-review"],
  );
  const parity = (edit) => (m) => edit(m.checks.parity);
  for (const [key, edit] of [
    ["repos", (c) => (c.repos = [])],
    ["repos", (c) => (c.repos = Array(51).fill("acme/*"))],
    ["paths", (c) => (c.paths = [])],
    ["run", (c) => (c.run = "bin/parity.mjs")],
    ["env", (c) => (c.env = ["NOT-A-NAME"])],
    ["network", (c) => (c.network = "yes")],
    ["timeout", (c) => (c.timeout = 0)],
    ["timeout", (c) => (c.timeout = 7201)],
    ["decide", (c) => (c.decide = "ask.txt")],
    ["decideAt", (c) => (c.decideAt = ["approve", "approve"])],
    ["stage", (c) => (c.stage = "later")],
    ["colour", (c) => (c.colour = "red")],
  ])
    refused(
      parity(edit),
      new RegExp(`Plugin acme-checks check parity key ${key}\\b`),
    );
  // run[0] and decide outside the folder, absolute or missing.
  for (const file of ["../escape.mjs", "/bin/sh", "bin/missing.mjs"])
    refused(
      parity((c) => (c.run = [file])),
      /inside the plugin|not in the plugin/,
    );
  refused(
    parity((c) => (c.decide = "../prompt.md")),
    /inside the plugin/,
  );
  refused(
    parity((c) => {
      delete c.run;
    }),
    /exactly one step/,
  );
  refused(
    parity((c) => (c.mcp = manifestOf().checks["parity-review"].mcp)),
    /exactly one step/,
  );
  refused(
    parity((c) => {
      delete c.decide;
    }),
    /decideAt goes with decide/,
  );
  refused((m) => (m.provides = ["pack"]), /provides must list checks/);
  refused((m) => {
    for (let i = 0; i < 20; i++)
      m.checks[`extra-${i}`] = {
        repos: ["acme/*"],
        run: ["bin/license-scan.sh"],
      };
  }, /more than 20 checks/);
  refused((m) => (m.entry = "index.mjs"), /runs no code; remove entry/);

  // An invalid part makes the plugin invalid, and it cannot be approved.
  const root = temporaryDirectory("avoozl-pk-invalid-"),
    folder = copyPlugin(path.join(root, "acme-checks"), (m) => {
      m.checks.parity.timeout = 0;
    }),
    settingsFile = path.join(root, "plugins.json"),
    options = { workspaceRoot: root, settingsFile };
  writePluginSettings(settingsFile, {
    plugins: [{ id: "acme-checks", path: folder, contract: 1 }],
  });
  const [plugin] = inspectPlugins(options);
  assert.equal(plugin.state, "invalid");
  assert.match(plugin.reason, /check parity key timeout/);
  assert.throws(
    () => approvePlugin(options, { id: "acme-checks", hash: "x" }),
    (error) => error.status === 409,
  );
});

test("pk-1.1: an approved plugin carries its checks; an unapproved one has none", (t) => {
  const workspace = pluginWorkspace(t, { approve: false });
  assert.deepEqual(approvedPluginChecks(workspace.options), []);
  workspace.approve();
  const checks = approvedPluginChecks(workspace.options);
  assert.deepEqual(
    checks.map((c) => [c.name, c.step, c.stage]),
    [
      ["license-scan", "run", "task"],
      ["parity", "run", "task"],
      ["parity-review", "mcp", "task"],
    ],
  );
  assert.equal(checks[1].plugin.id, "acme-checks");
  assert.deepEqual(checks[1].env, ["PARITY_TOKEN"]);
});

test("pk-1.2: one check list filters by repository, shadows and holds clashes", (t) => {
  const workspace = pluginWorkspace(t),
    plugins = approvedPluginChecks(workspace.options),
    names = (repository) =>
      repositoryChecks(repository, plugins).map((c) => `${c.source}:${c.name}`);
  assert.deepEqual(
    names({ id: "x", github: "acme/api", checks: { test: ["t"] } }),
    ["repository:test", "plugin:parity", "plugin:parity-review"],
  );
  assert.deepEqual(names({ id: "web", github: "acme/web-shop" }), [
    "plugin:license-scan",
    "plugin:parity",
    "plugin:parity-review",
  ]);
  assert.deepEqual(names({ id: "other", github: "octo/api" }), []);
  // A repository with no GitHub name matches by its ID.
  assert.deepEqual(names({ id: "acme/tools" }).length, 2);
  // A repository check of the same name wins; the plugin's is shadowed.
  const shadow = { id: "x", github: "acme/api", checks: { parity: ["t"] } };
  assert.deepEqual(names(shadow), [
    "repository:parity",
    "plugin:parity-review",
  ]);
  assert.deepEqual(pluginCheckConflicts(shadow, plugins).shadowed, [
    { name: "parity", plugin: "acme-checks" },
  ]);
  // Paths pick as for repository checks; stages are apart.
  const repository = { id: "x", github: "acme/api" };
  assert.deepEqual(
    selectedChecks(repository, ["docs/a.md"], plugins).map((c) => c.name),
    [],
  );
  assert.deepEqual(
    selectedChecks(repository, ["schema/a.json"], plugins).map((c) => c.name),
    ["parity"],
  );
  assert.deepEqual(selectedChecks(repository, null, plugins, "phase"), []);

  // A second plugin with the same name: both held, one Needs you row.
  const second = copyPlugin(path.join(workspace.root, "acme-two"), (m) => {
    taskStage(m);
    m.id = "acme-two";
  });
  const settings = workspace.settings();
  settings.plugins.push({ id: "acme-two", path: second, contract: 1 });
  writePluginSettings(workspace.settingsFile, settings);
  workspace.approve("acme-two");
  const both = approvedPluginChecks(workspace.options);
  assert.deepEqual(
    repositoryChecks(repository, both).map((c) => c.name),
    [],
    "every name both define is held",
  );
  const rows = pluginCheckNeedsYou(workspace.store, both);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["plugin-check-clash:app:parity", "plugin-check-clash:app:parity-review"],
  );
  assert.match(rows[0].title, /acme-checks and acme-two/);
  assert.deepEqual(
    pluginCheckNeedsYou(workspace.store, both).map((r) => r.id),
    rows.map((r) => r.id),
    "a second read raises no second row",
  );
});

test("pk-1.2: a task-stage plugin check runs in the check run with its placeholders and filtered environment", async (t) => {
  const workspace = pluginWorkspace(t, {
    edit: (m) => {
      taskStage(m);
      delete m.checks["parity-review"];
      delete m.servers;
      m.checks.parity.env = [
        "PARITY_TOKEN",
        "GH_TOKEN",
        "SSH_AUTH_SOCK",
        "KIROCREW_PROXY_SECRET",
      ];
    },
  });
  const saved = { ...process.env };
  t.after(() => {
    for (const name of [
      "PARITY_TOKEN",
      "GH_TOKEN",
      "SSH_AUTH_SOCK",
      "KIROCREW_PROXY_SECRET",
    ])
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
  });
  Object.assign(process.env, {
    PARITY_TOKEN: "p",
    GH_TOKEN: "g",
    SSH_AUTH_SOCK: "/tmp/agent",
    KIROCREW_PROXY_SECRET: "s",
  });
  const { ops, store } = workspace,
    commit = await workerDone(ops, "a", "w-1", 1, api);
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store),
    parity = run.checks.find((c) => c.name === "parity");
  assert.deepEqual(run.selected, ["git status", "parity"]);
  assert.equal(parity.exitCode, 0, parity.tail);
  assert.equal(parity.plugin, "acme-checks");
  const base = git(workspace.checkout, "merge-base", "main", commit);
  assert.match(
    parity.tail,
    new RegExp(`repo=acme/api from=${base} to=${commit}`),
  );
  assert.match(parity.tail, /env PARITY_TOKEN=present/);
  for (const name of ["GH_TOKEN", "SSH_AUTH_SOCK", "KIROCREW_PROXY_SECRET"])
    assert.match(parity.tail, new RegExp(`env ${name}=absent`));
  await tick(ops, ["w-1"]);
  assert.equal(store.get("task_deliveries", "a").state, "integrated");
});

test("pk-1.2: paths skip a plugin check, and a failing one fails the writer's attempt", async (t) => {
  const workspace = pluginWorkspace(t, {
      edit: (m) => {
        taskStage(m);
        delete m.checks["parity-review"];
        delete m.servers;
      },
    }),
    { ops, store } = workspace;
  await workerDone(ops, "a", "w-1", 1, { "docs/readme.md": "hi\n" });
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.deepEqual(run.selected, ["git status"]);
  assert.deepEqual(run.skipped, [
    { name: "parity", plugin: "acme-checks", filter: "paths" },
  ]);

  const failing = pluginWorkspace(t, {
    edit: (m) => {
      taskStage(m);
      delete m.checks["parity-review"];
      delete m.servers;
    },
  });
  await workerDone(failing.ops, "a", "w-1", 1, { "schema/api.json": "{}\n" });
  await tick(failing.ops, ["w-1"]);
  await drainCheckRuns(failing.store);
  await tick(failing.ops, ["w-1"]);
  const delivery = failing.store.get("task_deliveries", "a");
  assert.equal(delivery.state, "failed");
  assert.match(delivery.attempts[0].cause, /check `parity` exited 1/);
});

test("pk-1.2: a local plugin edited after approval does not run", async (t) => {
  const workspace = pluginWorkspace(t),
    check = workspace.check("parity");
  fs.appendFileSync(
    path.join(workspace.folder, "bin", "parity.mjs"),
    "\n// edited\n",
  );
  const result = await runPluginCheck(check, {
    store: workspace.store,
    repository: workspace.store.get("repositories", "app"),
    dir: workspace.checkout,
    commit: git(workspace.checkout, "rev-parse", "HEAD"),
    timeoutMs: 30_000,
  });
  assert.equal(result.exitCode, null);
  assert.match(result.notRun, /changed after it was approved/);
  assert.equal(
    inspectPlugins(workspace.options).find((p) => p.id === "acme-checks").state,
    "changed",
  );
});

test("pk-1.2: a check whose child listens is stopped, failed and its plugin marked broken", async (t) => {
  const workspace = pluginWorkspace(t, {
    edit: (m) => {
      taskStage(m);
      m.checks.parity.run = ["bin/listen.mjs"];
      m.checks.parity.network = true;
    },
    scripts: {
      "bin/listen.mjs": [
        'import { spawn } from "node:child_process";',
        "const child = spawn(process.execPath, ['-e', \"require('net').createServer().listen(0, '127.0.0.1'); setTimeout(() => {}, 60000)\"], { stdio: 'inherit' });",
        "setTimeout(() => {}, 60000);",
      ].join("\n"),
    },
  });
  const started = Date.now(),
    result = await runPluginCheck(workspace.check("parity"), {
      store: workspace.store,
      repository: {
        id: "app",
        root: workspace.checkout,
        isolation: { run: "unconfined" },
      },
      dir: workspace.checkout,
      commit: git(workspace.checkout, "rev-parse", "HEAD"),
      timeoutMs: 50_000,
      pluginOptions: workspace.options,
      // The machine's unconfined opt-in is not what is tested here.
      run: (dir, argv, options) =>
        import("../../git/git.mjs").then(({ commandEvidence }) =>
          commandEvidence(dir, argv, { ...options, isolate: undefined }),
        ),
    });
  assert.ok(Date.now() - started < 40_000, "stopped well before its timeout");
  assert.equal(result.exitCode, 1);
  assert.match(result.violation, /opened a network listener/);
  const [plugin] = inspectPlugins(workspace.options);
  assert.equal(plugin.state, "unapproved");
  assert.match(plugin.reason, /Marked broken: .*listener/);
  assert.deepEqual(
    workspace.store
      .list("flow_records")
      .filter((r) => r.kind === "check-cache"),
    [],
    "a stopped check is never cached",
  );
});

test("pk-1.2: network false runs offline even where the repository's isolation has the network on", {
  skip: !sandboxKind() && "no process sandbox here",
}, async (t) => {
  const server = (await import("node:net")).createServer((s) => s.end("hi"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const port = server.address().port,
    workspace = pluginWorkspace(t, {
      edit: (m) => {
        taskStage(m);
        m.checks.parity.run = ["bin/reach.mjs", String(port)];
        m.checks.parity.network = false;
      },
      repository: { isolation: { network: "on" } },
      scripts: {
        "bin/reach.mjs":
          "import('node:net').then(({ connect }) => { const s = connect(Number(process.argv[2]), '127.0.0.1'); s.on('data', () => { console.log('reached'); process.exit(0); }); s.on('error', (e) => { console.log('blocked ' + e.code); process.exit(1); }); });\n",
      },
    });
  const result = await runPluginCheck(workspace.check("parity"), {
    store: workspace.store,
    repository: workspace.store.get("repositories", "app"),
    dir: workspace.checkout,
    commit: git(workspace.checkout, "rev-parse", "HEAD"),
    timeoutMs: 30_000,
  });
  assert.equal(result.isolation, "sandbox");
  assert.doesNotMatch(result.tail ?? "", /reached/);
  assert.equal(result.exitCode, 1);
});

test("pk-1.2: a merge batch candidate runs the task-stage plugin checks", async (t) => {
  const workspace = pluginWorkspace(t),
    checkout = workspace.checkout,
    base = git(checkout, "rev-parse", "HEAD");
  fs.mkdirSync(path.join(checkout, "schema"), { recursive: true });
  fs.writeFileSync(path.join(checkout, "schema", "api.json"), "{}\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Schema");
  const candidate = git(checkout, "rev-parse", "HEAD"),
    steps = directSteps({
      root: checkout,
      url: checkout,
      branch: "main",
      repository: "acme/api",
      repositoryId: "app",
      checks: [workspace.check("parity")],
      intent: () => ({}),
      scan: async () => [],
      store: workspace.store,
    }),
    verdict = await steps.check(candidate, [], base);
  assert.equal(verdict.ok, false);
  assert.deepEqual(
    verdict.checks.map((c) => [c.name, c.exitCode]),
    [["parity", 1]],
  );
  assert.match(verdict.checks[0].tail, /schema changed/);
});

test("pk-1.2: every caller of repositoryChecks names its plugin list", () => {
  const root = path.join(import.meta.dirname, "..", "..", ".."),
    out = execFileSync(
      "git",
      ["grep", "-n", "repositoryChecks(", "--", "app"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
  const bare = out
    .split("\n")
    .filter((line) => line && !/\/test\//.test(line))
    .filter((line) => !/function repositoryChecks\(/.test(line))
    // A call whose arguments close on the same line with one argument.
    .filter((line) =>
      /repositoryChecks\(\s*[^,()]*(?:\([^()]*\))?[^,()]*\)/.test(line),
    );
  assert.deepEqual(bare, []);
});

// ---- The result cache (pk-1.3) ---------------------------------------

function cacheRepo(t) {
  const workspace = pluginWorkspace(t, {
      edit: (m) => {
        taskStage(m);
        m.checks.parity.run = ["bin/count.mjs", "{commit}"];
      },
      files: {
        "src/api/a.js": "a\n",
        "docs/readme.md": "docs\n",
      },
      scripts: (root) => ({
        "bin/count.mjs": `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(path.join(root, "count.txt"))}, "x"); process.exit(fs.existsSync("src/api/bad.js") ? 1 : 0);\n`,
      }),
    }),
    counter = path.join(workspace.root, "count.txt");
  const checkout = workspace.checkout,
    commit = (files) => {
      for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(checkout, file)), {
          recursive: true,
        });
        if (text === null) fs.rmSync(path.join(checkout, file));
        else fs.writeFileSync(path.join(checkout, file), text);
      }
      git(checkout, "add", "-A");
      git(checkout, "commit", "-qm", "Change");
      return git(checkout, "rev-parse", "HEAD");
    },
    runs = () =>
      fs.existsSync(counter) ? fs.readFileSync(counter, "utf8").length : 0,
    run = (check, at, extra = {}) =>
      runPluginCheck(check, {
        store: workspace.store,
        repository: {
          id: "app",
          root: checkout,
          isolation: { run: "unconfined" },
        },
        dir: checkout,
        commit: at,
        timeoutMs: 30_000,
        run: (dir, argv, options) =>
          import("../../git/git.mjs").then(({ commandEvidence }) =>
            commandEvidence(dir, argv, { ...options, isolate: undefined }),
          ),
        ...extra,
      });
  return { workspace, commit, runs, run, checkout };
}

test("pk-1.3: the same content of the matched paths reuses a passed or failed result, marked cached", async (t) => {
  const { workspace, commit, runs, run } = cacheRepo(t),
    check = workspace.check("parity"),
    first = commit({ "src/api/b.js": "b\n" }),
    a = await run(check, first);
  assert.equal(a.exitCode, 0);
  assert.equal(a.cached, undefined);
  // A change outside paths hits the cache, with the first commit.
  const second = commit({ "docs/readme.md": "more\n" }),
    b = await run(check, second);
  assert.equal(runs(), 1);
  assert.deepEqual([b.exitCode, b.cached?.firstCommit], [0, first]);
  // One inside misses; a failed result is cached as well.
  const bad = commit({ "src/api/bad.js": "x\n" }),
    c = await run(check, bad);
  assert.deepEqual([c.exitCode, runs()], [1, 2]);
  const again = commit({ "docs/readme.md": "again\n" }),
    d = await run(check, again);
  assert.deepEqual([d.exitCode, d.cached?.firstCommit, runs()], [1, bad, 2]);
  // A rerun (the merge batch's) runs the command and replaces the entry.
  const fresh = await run(check, again, { fresh: true });
  assert.deepEqual([fresh.cached, runs()], [undefined, 3]);
  const key = await contentKey(workspace.checkout, check, { commit: again });
  assert.equal(cachedResult(workspace.store, key).firstCommit, again);
  // A new plugin version misses.
  assert.notEqual(
    await contentKey(
      workspace.checkout,
      { ...check, plugin: { ...check.plugin, version: "1.5.0" } },
      { commit: again },
    ),
    key,
  );
});

test("pk-1.3: no paths keys every tracked file, {base} keys the base, and not run is never stored", async (t) => {
  const { workspace, commit } = cacheRepo(t),
    check = { ...workspace.check("parity"), paths: null },
    one = commit({ "docs/readme.md": "1\n" }),
    two = commit({ "docs/readme.md": "2\n" });
  assert.notEqual(
    await contentKey(workspace.checkout, check, { commit: one }),
    await contentKey(workspace.checkout, check, { commit: two }),
  );
  const withBase = {
      ...workspace.check("parity"),
      argv: ["bin/count.mjs", "{base}"],
    },
    root = git(workspace.checkout, "rev-list", "--max-parents=0", "HEAD"),
    moved = commit({ "src/api/a.js": "moved\n" }),
    head = commit({ "docs/readme.md": "3\n" });
  assert.notEqual(
    await contentKey(workspace.checkout, withBase, {
      commit: head,
      base: moved,
    }),
    await contentKey(workspace.checkout, withBase, {
      commit: head,
      base: root,
    }),
  );
  const store = workspace.store;
  storeResult(store, "k-notrun", {
    check,
    result: { exitCode: null, notRun: "timed out" },
    commit: two,
  });
  assert.equal(cachedResult(store, "k-notrun"), null);
});

test("pk-1.3: the cache keeps at most 5,000 entries and none older than 30 days", (t) => {
  const { workspace } = cacheRepo(t),
    store = workspace.store,
    check = workspace.check("parity"),
    now = Date.parse("2026-11-19T12:00:00Z");
  store.transaction(() => {
    for (let i = 0; i < 5000; i++)
      store.put("flow_records", {
        id: `check-cache:k${i}`,
        kind: "check-cache",
        key: `k${i}`,
        result: { exitCode: 0 },
        at: new Date(now - (5000 - i) * 1000).toISOString(),
      });
    store.put("flow_records", {
      id: "check-cache:old",
      kind: "check-cache",
      key: "old",
      result: { exitCode: 0 },
      at: new Date(now - 31 * 86400_000).toISOString(),
    });
  });
  storeResult(store, "k5001", {
    check,
    result: { exitCode: 0 },
    commit: "c",
    now,
  });
  const kept = store
    .list("flow_records")
    .filter((r) => r.kind === "check-cache");
  assert.equal(kept.length, 5000);
  assert.equal(store.get("flow_records", "check-cache:old"), null);
  assert.equal(
    store.get("flow_records", "check-cache:k0"),
    null,
    "the oldest goes",
  );
  assert.ok(store.get("flow_records", "check-cache:k5001"));
});
