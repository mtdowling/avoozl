// Set up triage (triage-agent TA12): the one way the agent goes on, a
// person's only, and a machine plugin that blocks it. A fake GitHub that
// logs label writes and temporary plugin settings; nothing live.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Operations } from "../../api/operations.mjs";
import { mcpRefusal } from "../../mcp/mcp-policy.mjs";
import {
  approvePlugin,
  inspectPlugins,
  validateManifest,
  writePluginSettings,
} from "../../plugins/plugins.mjs";
import { workspaceConfig } from "../../settings/config.mjs";
import { Store } from "../../store/store.mjs";
import { fixture, snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { triageBlockedNeedsYou, triageStep } from "../triage.mjs";

const REPO = "example/app";

function workspace(t, { triage, block = false } = {}) {
  const { root, store } = fixture(t),
    config = temporaryDirectory("avoozl-triage-setup-"),
    settingsFile = path.join(config, "plugins.json"),
    filename = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    filename,
    `${JSON.stringify({ version: 1, github: { mode: "single-repo", repositories: { [REPO]: { baseBranch: "main", ...(triage ? { triage } : {}) } } } }, null, 2)}\n`,
  );
  const labels = new Set(["bug"]),
    made = [],
    github = {
      available: () => true,
      listLabels: async () => [...labels].map((name) => ({ name })),
      ensureLabel: async (_repo, { name }) => {
        made.push(name);
        labels.add(name);
      },
    };
  writePluginSettings(settingsFile, { plugins: [] });
  if (block) {
    const folder = path.join(config, "team-policy");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "avoozl-plugin.json"),
      JSON.stringify({
        id: "team-policy",
        version: "1.0.0",
        contract: 1,
        provides: ["policy"],
        policy: { triage: "blocked", reason: "We triage by hand." },
      }),
    );
    writePluginSettings(settingsFile, {
      plugins: [{ id: "team-policy", path: folder, contract: 1 }],
    });
    const options = { workspaceRoot: root, settingsFile },
      [plugin] = inspectPlugins(options);
    approvePlugin(options, { id: plugin.id, hash: plugin.hash });
  }
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    pluginSettingsFile: settingsFile,
  });
  const file = () => JSON.parse(fs.readFileSync(filename, "utf8"));
  return { ops, store, made, file, settingsFile, root };
}

const choice = {
  repository: REPO,
  confirm: true,
  existing: "skip",
  dailyRuns: 20,
  fullReviewMaxLines: 200,
  createLabels: ["bug", "question"],
};

test("Set up triage previews, then makes only missing labels and turns the agent on", async (t) => {
  const w = workspace(t),
    preview = await w.ops.execute("triage.setup", { repository: REPO });
  assert.deepEqual(w.made, [], "the preview writes nothing");
  assert.equal(w.file().github.repositories[REPO].triage, undefined);
  assert.deepEqual(
    preview.labels.map((label) => [label.name, label.exists]),
    [
      ["bug", true],
      ["question", false],
      ["enhancement", false],
      ["performance", false],
    ],
  );
  assert.deepEqual(preview.harnesses.slice(0, 2), ["auto", "kirocrew"]);
  const done = await w.ops.execute("triage.setup", choice);
  assert.deepEqual(w.made, ["question"], "bug was there already");
  assert.deepEqual(done.created, ["question"]);
  assert.deepEqual(w.file().github.repositories[REPO].triage, {
    existing: "skip",
    dailyRuns: 20,
    fullReviewMaxLines: 200,
    agent: "on",
  });
  assert.equal((await w.ops.execute("triage.view")).repositories[0].on, true);
});

test("triage.settings never turns the agent on; Turn off leaves labels alone", async (t) => {
  const w = workspace(t);
  await assert.rejects(
    w.ops.execute("triage.settings", { repository: REPO, agent: "on" }),
    /Set up triage/,
  );
  assert.equal(w.file().github.repositories[REPO].triage, undefined);
  await assert.rejects(
    w.ops.execute("triage.setup", { ...choice, existing: undefined }),
    /take|skip/,
  );
  await w.ops.execute("triage.setup", choice);
  const made = w.made.length;
  await w.ops.execute("triage.off", { repository: REPO });
  assert.equal(w.file().github.repositories[REPO].triage.agent, "off");
  assert.equal(w.made.length, made, "Turn off makes and removes no label");
});

test("MCP and bound callers cannot set up triage or turn it off", async (t) => {
  const w = workspace(t);
  for (const name of ["triage.setup", "triage.off"]) {
    assert.ok(mcpRefusal(name, choice), name);
    await assert.rejects(
      w.ops.execute(name, choice, undefined, { mcp: true }),
      /person/,
    );
    await assert.rejects(
      w.ops.execute(name, choice, undefined, { caller: { slot: "s" } }),
      /person/,
    );
  }
  assert.equal(w.file().github.repositories[REPO].triage, undefined);
  assert.deepEqual(w.made, []);
});

test("a machine plugin's block refuses setup and treats an agent that is on as off", async (t) => {
  const w = workspace(t, {
    triage: { agent: "on", existing: "skip" },
    block: true,
  });
  await assert.rejects(
    w.ops.execute("triage.setup", choice),
    /blocked on this machine by plugin team-policy: We triage by hand\./,
  );
  assert.deepEqual(w.made, []);
  const view = await w.ops.execute("triage.view");
  assert.deepEqual(view.blocked, {
    plugin: "team-policy",
    reason: "We triage by hand.",
  });
  assert.equal(view.repositories[0].on, false);
  assert.equal(view.repositories[0].settings.agent, "on");
  const needs = (await w.ops.execute("conflicts.view")).items.filter(
    (item) => item.reason === "triage-blocked",
  );
  assert.equal(needs.length, 1);
  assert.match(needs[0].detail, /team-policy/);
  // The tick reads nothing for a blocked repository.
  const policy = { repositories: { [REPO]: { triage: { agent: "on" } } } },
    github = new Proxy(
      {},
      {
        get() {
          throw Error("A blocked triage must not call GitHub.");
        },
      },
    );
  assert.deepEqual(
    await triageStep(w.store, github, {
      policy,
      block: { plugin: "p", reason: "r" },
    }),
    { dispatch: [], notify: [] },
  );
  // Turn off still works, writes only the repository's own file, and
  // clears the row.
  await w.ops.execute("triage.off", { repository: REPO });
  assert.equal(w.file().github.repositories[REPO].triage.agent, "off");
  assert.deepEqual(
    triageBlockedNeedsYou(
      { repositories: { [REPO]: { triage: { agent: "off" } } } },
      view.blocked,
    ),
    [],
  );
});

test("a policy part is data only and checked; a repository plugin sets no machine block", async (t) => {
  const base = { id: "p", version: "1", contract: 1, provides: ["policy"] };
  assert.doesNotThrow(() =>
    validateManifest(
      { ...base, policy: { triage: "blocked", reason: "No." } },
      { id: "p" },
    ),
  );
  for (const policy of [
    undefined,
    { triage: "on", reason: "x" },
    { triage: "blocked" },
    { triage: "blocked", reason: "x", other: 1 },
  ])
    assert.throws(() => validateManifest({ ...base, policy }, { id: "p" }));
  assert.throws(
    () =>
      validateManifest(
        { ...base, policy: { triage: "blocked", reason: "x" }, entry: "a.mjs" },
        { id: "p" },
      ),
    /runs no code/,
  );
  // Declared in .avoozl.json and approved here: not a machine policy.
  const w = workspace(t);
  const folder = path.join(w.root, "team-policy");
  fs.mkdirSync(folder);
  fs.writeFileSync(
    path.join(folder, "avoozl-plugin.json"),
    JSON.stringify({
      ...base,
      id: "team-policy",
      policy: { triage: "blocked", reason: "x" },
    }),
  );
  const value = w.file();
  value.plugins = [{ id: "team-policy", path: "team-policy", contract: 1 }];
  fs.writeFileSync(path.join(w.root, ".avoozl.json"), JSON.stringify(value));
  const options = { workspaceRoot: w.root, settingsFile: w.settingsFile },
    [plugin] = inspectPlugins(options);
  assert.equal(
    approvePlugin(options, { id: plugin.id, hash: plugin.hash }).state,
    "approved",
  );
  assert.equal((await w.ops.execute("triage.view")).blocked, null);
});

test("avoozl triage off turns it off; triage setup is refused inside a supervisor child", (t) => {
  const root = temporaryDirectory("avoozl-triage-cli-"),
    cli = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url)),
    { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  const filename = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: { baseBranch: "main", triage: { agent: "on" } },
        },
      },
    }),
  );
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^AVOOZL_|^PORT$|^GH_TOKEN$|^GITHUB_TOKEN$/.test(name))
      delete env[name];
  const run = (args, extra = {}) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
      encoding: "utf8",
      env: { ...env, ...extra },
    });
  const off = run(["triage", "off", REPO]);
  assert.equal(off.status, 0, off.stderr);
  assert.equal(
    JSON.parse(fs.readFileSync(filename, "utf8")).github.repositories[REPO]
      .triage.agent,
    "off",
  );
  const child = run(
    ["triage", "setup", REPO, "--existing", "skip", "--confirm"],
    {
      AVOOZL_CHILD: "1",
    },
  );
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /sets up the triage agent/);
  assert.notEqual(run(["triage", "on", REPO]).status, 0);
});
