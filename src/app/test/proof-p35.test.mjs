// Proof P35: one plugin bundles a config pack, content rules, a tracker and
// an intake source (tasks.md Phase 16, design §4.14, Requirement 55). An
// isolated temporary workspace in single-repo mode with one repository; the
// sample `sdk-team` plugin from the test tree, shared with the repository.
// It installs, previews, refuses an import before approval, is approved,
// imports its pack, and polls its fake intake source. Then the invariants:
// a pack never runs code, a pack with an unknown key is refused by name, a
// pack cannot lower who counts without it showing and being accepted, and
// a new version needs a new approval.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { readGitHubPolicy } from "../github-policy.mjs";
import { inspectPlugins, pluginHost, validateManifest } from "../plugins.mjs";
import { validatePack } from "../plugin-pack.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins");
const REPO = "o/sdk";
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

function setup(t, { github } = {}) {
  const root = temporaryDirectory("avoozl-p35-"),
    outside = temporaryDirectory("avoozl-p35-machine-"),
    folder = path.join(root, "plugins", "sdk-team"),
    settingsFile = path.join(outside, "plugins.json"),
    intakeFile = path.join(outside, "intake.json"),
    termsFile = path.join(outside, "terms.json"),
    stateFile = path.join(outside, "records.json");
  fs.cpSync(path.join(FIXTURE, "sdk-team"), folder, { recursive: true });
  save(path.join(root, ".avoozl.json"), {
    version: 1,
    namespace: "avz_p35bundlesxxxxxx",
    github: github ?? {
      mode: "single-repo",
      project: { owner: "o", number: 1 },
      repositories: { [REPO]: { baseBranch: "main" } },
    },
  });
  save(intakeFile, {
    items: [
      {
        id: "T1",
        kind: "ticket",
        title: "Paginator skips the last page",
        link: "https://tickets.example.test/T1",
        labels: ["needs-triage"],
        author: "alice",
        state: "open",
        updatedAt: "2026-11-13T00:00:00Z",
      },
      {
        id: "T2",
        kind: "ticket",
        title: "Bad link",
        link: "javascript:alert(1)",
        state: "open",
        updatedAt: "2026-11-13T00:00:00Z",
      },
      {
        id: "T3",
        kind: "issue",
        title: "Retry storm on throttling",
        link: "https://tickets.example.test/T3",
        labels: ["p1"],
        state: "closed",
        closeReason: "completed",
        closedBy: "bob",
        updatedAt: "2026-11-13T00:01:00Z",
      },
    ],
  });
  save(termsFile, {
    sets: [
      {
        id: "team-terms",
        version: "1",
        rules: [{ id: "codename", pattern: "\\bzebra\\b" }],
      },
    ],
  });
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.db.isOpen && store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  const ops = new Operations(store, {
    workspaceRoot: root,
    pluginSettingsFile: settingsFile,
  });
  const run = (name, input) => ops.execute(name, input);
  const row = async (id = "sdk-team") =>
    (await run("plugins.list", {})).plugins.find((p) => p.id === id);
  // Each computer's own paths, named by the shared entry's config.
  Object.assign(process.env, {
    SDK_TEAM_INTAKE: intakeFile,
    SDK_TEAM_TERMS: termsFile,
    SDK_TEAM_STATE: stateFile,
  });
  const config = {
    intakeFileEnv: "SDK_TEAM_INTAKE",
    termsFileEnv: "SDK_TEAM_TERMS",
    stateFileEnv: "SDK_TEAM_STATE",
  };
  return {
    root,
    folder,
    settingsFile,
    ops,
    run,
    row,
    config,
    avoozl: () => json(path.join(root, ".avoozl.json")),
    editManifest: (fn) => {
      const file = path.join(folder, "avoozl-plugin.json"),
        value = json(file);
      fn(value);
      save(file, value);
    },
    editPack: (fn) => {
      const file = path.join(folder, "avoozl-pack.json"),
        value = json(file);
      fn(value);
      save(file, value);
    },
  };
}

async function install(env) {
  const found = await env.run("plugin.preview", {
    path: "plugins/sdk-team",
    scope: "repository",
  });
  // Add plugin's What step lists every part and what the pack sets.
  assert.deepEqual(found.provides, ["pack", "rules", "tracker", "intake"]);
  assert.deepEqual(found.kinds, ["tracker", "rules"]);
  assert.ok(found.pack.settings.repositories.rules.length);
  await env.run("plugin.add", {
    scope: "repository",
    confirmPublic: true,
    entry: {
      id: "sdk-team",
      path: "plugins/sdk-team",
      contract: 1,
      config: env.config,
    },
  });
}

const approve = async (env) => {
  const row = await env.row();
  return env.run("plugin.approve", {
    id: row.id,
    version: row.version,
    hash: row.hash,
  });
};

test("P35: the sdk-team plugin installs, previews, imports, approves and polls", async (t) => {
  const env = setup(t);
  await install(env);

  // Shared with the repo: the entry is committed in .avoozl.json, and this
  // computer still has to approve it.
  assert.equal(env.avoozl().plugins[0].id, "sdk-team");
  let row = await env.row();
  assert.equal(row.state, "unapproved");
  assert.equal(row.source, "repository");
  assert.deepEqual(row.provides, ["pack", "rules", "tracker", "intake"]);
  assert.deepEqual(row.pack.groups, [
    "repositories",
    "project",
    "contentRules",
    "delivery",
    "flow",
  ]);
  assert.equal(row.pack.imported, null);
  assert.equal(row.pack.offer, true);

  // Preview: every setting as create, nothing written.
  const before = fs.readFileSync(path.join(env.root, ".avoozl.json"), "utf8");
  const preview = await env.run("plugin.pack.preview", { id: "sdk-team" });
  assert.deepEqual(preview.repositories, [REPO]);
  const byName = new Map(preview.changes.map((c) => [c.setting, c]));
  assert.equal(
    byName.get(`github.repositories.${REPO}.rules`).action,
    "create",
  );
  assert.equal(
    byName.get(`github.repositories.${REPO}.untriaged`).to.filter,
    "label:needs-triage",
  );
  assert.equal(byName.get("github.project.fields.status").action, "create");
  assert.equal(byName.get("contentRules.sets.team-terms").action, "create");
  assert.equal(byName.get("flow.batch.max").to, 2);
  assert.deepEqual(preview.warnings, []);
  assert.equal(
    fs.readFileSync(path.join(env.root, ".avoozl.json"), "utf8"),
    before,
  );

  // Nothing from a pack is applied before approval.
  await assert.rejects(
    env.run("plugin.pack.import", {
      id: "sdk-team",
      previewHash: preview.previewHash,
    }),
    /Approve plugin sdk-team version 1.0.0 before importing/,
  );
  // An agent session can preview but never import or approve.
  await assert.rejects(
    env.ops.execute(
      "plugin.pack.import",
      { id: "sdk-team", previewHash: preview.previewHash },
      undefined,
      { caller: { sessionKey: "dashboard:agent" } },
    ),
    /Only a person changes plugins/,
  );

  const approved = await approve(env);
  assert.equal(approved.state, "approved");
  // The approval lists each part.
  assert.deepEqual(json(env.settingsFile).approvals["sdk-team"].provides, [
    "pack",
    "rules",
    "tracker",
    "intake",
  ]);

  // A stale preview hash is refused.
  await assert.rejects(
    env.run("plugin.pack.import", {
      id: "sdk-team",
      previewHash: "0".repeat(64),
    }),
    /changed since that preview/,
  );
  const imported = await env.run("plugin.pack.import", {
    id: "sdk-team",
    previewHash: preview.previewHash,
  });
  assert.equal(imported.imported.version, "1.0.0");
  const file = env.avoozl();
  assert.equal(file.packs["sdk-team"].version, "1.0.0");
  assert.ok(
    file.packs["sdk-team"].settings.includes(
      `github.repositories.${REPO}.rules`,
    ),
  );
  const policy = readGitHubPolicy(env.root);
  assert.deepEqual(
    policy.repositories[REPO].rules.map((r) => r.id),
    ["plan", "deliver", "pause", "quarantine"],
  );
  assert.equal(policy.repositories[REPO].minimumPermission, "write");
  assert.deepEqual(policy.project.fields, {
    status: "Status",
    release: "Release",
    wave: "Wave",
  });
  assert.equal(file.contentRules.sets[0].plugin, "sdk-team");
  // The pack holds no rule text, so none reached .avoozl.json.
  assert.doesNotMatch(JSON.stringify(file), /zebra/);
  row = await env.row();
  assert.equal(row.pack.offer, false);

  // Import is once: the same pack again is all keep.
  const again = await env.run("plugin.pack.preview", { id: "sdk-team" });
  assert.ok(again.changes.every((c) => c.action === "keep"));

  // Rules supplied at run time, intake polled in pages through the tracker
  // kind's poll; the bad item is refused by field and the rest count.
  const session = pluginHost({
    workspaceRoot: env.root,
    settingsFile: env.settingsFile,
  }).open();
  try {
    const { sets } = await session.call("sdk-team", "rules", "ruleSets", {});
    assert.equal(sets[0].id, "team-terms");
    const first = await session.call("sdk-team", "tracker", "poll", {
      cursor: null,
      limit: 2,
    });
    assert.deepEqual(
      first.items.map((i) => i.id),
      ["T1"],
    );
    assert.equal(first.refused[0].id, "T2");
    assert.match(first.refused[0].reason, /link must be an http or https URL/);
    assert.equal(first.cursor, "2");
    assert.equal(first.more, true);
    const second = await session.call("sdk-team", "tracker", "poll", {
      cursor: first.cursor,
      limit: 2,
    });
    assert.deepEqual(
      second.items.map((i) => [i.id, i.state, i.closedBy]),
      [["T3", "closed", "bob"]],
    );
    assert.equal(second.more, false);
  } finally {
    await session.close();
  }

  // A new version needs a new approval before anything runs or imports.
  env.editManifest((m) => (m.version = "1.1.0"));
  env.editPack((p) => {
    p.settings.repositories.untriaged.triageLabels.push("guidance");
    p.settings.repositories.minimumPermission = "triage";
  });
  row = await env.row();
  assert.equal(row.state, "changed");
  assert.match(row.reason, /approve it again/);
  assert.equal(row.pack.offer, true);
  const blocked = pluginHost({
    workspaceRoot: env.root,
    settingsFile: env.settingsFile,
  }).open();
  await assert.rejects(
    blocked.call("sdk-team", "tracker", "poll", { cursor: null, limit: 1 }),
    /approve it again/,
  );
  await blocked.close();
  const newer = await env.run("plugin.pack.preview", { id: "sdk-team" });
  await assert.rejects(
    env.run("plugin.pack.import", {
      id: "sdk-team",
      previewHash: newer.previewHash,
    }),
    /Approve plugin sdk-team version 1.1.0/,
  );
  await assert.rejects(
    env.run("plugin.approve", {
      id: "sdk-team",
      version: "1.0.0",
      hash: row.hash,
    }),
    /Review it again/,
  );
  await approve(env);

  // The newer version offers its diff. Lowering who counts shows in the
  // preview, on the setting and as a warning, and needs acceptance.
  const diff = new Map(newer.changes.map((c) => [c.setting, c]));
  assert.equal(
    diff.get(`github.repositories.${REPO}.untriaged`).action,
    "change",
  );
  assert.equal(diff.get(`github.repositories.${REPO}.rules`).action, "keep");
  const permission = diff.get(`github.repositories.${REPO}.minimumPermission`);
  assert.equal(permission.action, "change");
  assert.match(permission.warning, /write access becomes triage access/);
  assert.match(newer.warnings[0], /Lowers who counts on o\/sdk/);
  await assert.rejects(
    env.run("plugin.pack.import", {
      id: "sdk-team",
      previewHash: newer.previewHash,
    }),
    (error) => error.code === "pack-lowers-who-counts" && error.status === 409,
  );
  assert.equal(
    readGitHubPolicy(env.root).repositories[REPO].minimumPermission,
    "write",
  );
  await env.run("plugin.pack.import", {
    id: "sdk-team",
    previewHash: newer.previewHash,
    acceptLowered: true,
  });
  assert.equal(
    readGitHubPolicy(env.root).repositories[REPO].minimumPermission,
    "triage",
  );
  assert.equal(env.avoozl().packs["sdk-team"].version, "1.1.0");
});

test("P35: a pack is refused by name for an unknown key and never runs code", async (t) => {
  const env = setup(t);
  await install(env);

  // Unknown keys, at each level, are refused naming the key.
  env.editPack((p) => (p.settings.repositories.autoMerge = true));
  let row = await env.row();
  assert.equal(row.state, "invalid");
  assert.match(
    row.reason,
    /settings\.repositories\.autoMerge is not a pack setting/,
  );
  await assert.rejects(
    env.run("plugin.approve", { id: "sdk-team", hash: "x" }),
    /cannot be approved/,
  );
  await assert.rejects(
    env.run("plugin.pack.preview", { id: "sdk-team" }),
    /autoMerge is not a pack setting/,
  );
  for (const [pack, name] of [
    [
      { settings: { repositories: {} }, install: "npm i" },
      /pack\.install is not/,
    ],
    [{ settings: { orgMinimums: {} } }, /settings\.orgMinimums is not/],
    [{ settings: { follow: true } }, /settings\.follow is not/],
    [
      { settings: { repositories: { untriaged: { scope: "org" } } } },
      /settings\.repositories\.untriaged\.scope/,
    ],
    [
      { settings: { project: { owner: "o", fields: {} } } },
      /settings\.project\.owner is not/,
    ],
    [
      { settings: { delivery: { runner: "tick", hooks: [] } } },
      /settings\.delivery\.hooks is not/,
    ],
    [
      { settings: { contentRules: { sets: [{ id: "a", patterns: ["x"] }] } } },
      /settings\.contentRules\.sets\.0\.patterns/,
    ],
    [
      { settings: { repositories: { allowedActors: ["a"], apiToken: "x" } } },
      /secret-like key settings\.repositories\.apiToken/,
    ],
    [{ settings: {} }, /at least one setting/],
  ])
    assert.throws(() => validatePack(pack), name);

  // A pack-only plugin has no entry and never starts a process.
  env.editPack((p) => delete p.settings.repositories.autoMerge);
  env.editManifest((m) => {
    m.provides = ["pack"];
    delete m.capabilities;
    delete m.entry;
  });
  fs.writeFileSync(
    path.join(env.folder, "index.mjs"),
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(path.join(env.root, "ran"))}, "1");`,
  );
  row = await env.row();
  assert.equal(row.state, "unapproved");
  assert.deepEqual(row.kinds, []);
  await approve(env);
  const preview = await env.run("plugin.pack.preview", { id: "sdk-team" });
  await env.run("plugin.pack.import", {
    id: "sdk-team",
    previewHash: preview.previewHash,
  });
  const session = pluginHost({
    workspaceRoot: env.root,
    settingsFile: env.settingsFile,
  }).open();
  for (const kind of ["route", "tracker", "rules"])
    await assert.rejects(
      session.call("sdk-team", kind, "list", {}),
      /does not declare the kind/,
    );
  await session.close();
  assert.equal(fs.existsSync(path.join(env.root, "ran")), false);
  // A pack-only manifest that names an entry is refused.
  assert.throws(
    () =>
      validateManifest(
        {
          id: "p",
          version: "1",
          contract: 1,
          provides: ["pack"],
          entry: "index.mjs",
        },
        { id: "p" },
      ),
    /runs no code; remove entry/,
  );
  // provides intake needs the poll capability; kinds must match provides.
  assert.throws(
    () =>
      validateManifest(
        {
          id: "p",
          version: "1",
          contract: 1,
          provides: ["intake"],
          entry: "i.mjs",
        },
        { id: "p" },
      ),
    /capabilities\.tracker must list poll/,
  );
  assert.throws(
    () =>
      validateManifest(
        {
          id: "p",
          version: "1",
          contract: 1,
          provides: ["rules"],
          kinds: ["route"],
          entry: "i.mjs",
        },
        { id: "p" },
      ),
    /kinds must be rules to match provides/,
  );
  assert.throws(
    () =>
      validateManifest(
        { id: "p", version: "1", contract: 1, provides: ["pack", "hooks"] },
        { id: "p" },
      ),
    /provides must list/,
  );
});

test("P35: nearby who-counts inputs show in the preview", async (t) => {
  const cases = [
    // [repository entry before, pack settings, expected warning or null]
    [{}, { minimumPermission: "write" }, null],
    [{}, { minimumPermission: "maintain" }, null],
    [{}, { minimumPermission: "read" }, /write access becomes read access/],
    [
      { allowedActors: ["lead"] },
      { minimumPermission: "admin" },
      /named people only becomes admin access/,
    ],
    [
      { allowedActors: ["lead"] },
      { allowedActors: ["lead", "bot"] },
      /Adds people who count on o\/sdk: bot/,
    ],
    [{ allowedActors: ["Lead"] }, { allowedActors: ["lead"] }, null],
    // Naming people replaces the write default; each new name still shows.
    [{}, { allowedActors: ["lead"] }, /Adds people who count/],
    [{ minimumPermission: "triage" }, { minimumPermission: "write" }, null],
  ];
  for (const [entry, settings, warning] of cases) {
    const env = setup(t, {
      github: {
        mode: "single-repo",
        repositories: { [REPO]: { baseBranch: "main", ...entry } },
      },
    });
    await install(env);
    env.editPack((p) => (p.settings = { repositories: settings }));
    const preview = await env.run("plugin.pack.preview", { id: "sdk-team" });
    if (warning) assert.match(preview.warnings.join(" "), warning);
    else assert.deepEqual(preview.warnings, [], JSON.stringify(settings));
  }
});

test("P35: settings that cannot apply here are shown as skip", async (t) => {
  const env = setup(t, { github: { mode: "single-repo", repositories: {} } });
  await install(env);
  const preview = await env.run("plugin.pack.preview", { id: "sdk-team" });
  const skips = preview.changes.filter((c) => c.action === "skip");
  assert.ok(skips.some((c) => /No GitHub repository/.test(c.reason)));
  assert.ok(skips.some((c) => /No GitHub Project/.test(c.reason)));
  await assert.rejects(
    env.run("plugin.pack.preview", {
      id: "sdk-team",
      repositories: ["o/other"],
    }),
    /o\/other is not a repository in \.avoozl\.json/,
  );
  // A machine-only plugin's import names it in .avoozl.json, so it asks.
  const machine = setup(t);
  await machine.run("plugin.add", {
    scope: "machine",
    entry: {
      id: "sdk-team",
      path: machine.folder,
      contract: 1,
      config: machine.config,
    },
  });
  await approve(machine);
  const shown = await machine.run("plugin.pack.preview", { id: "sdk-team" });
  await assert.rejects(
    machine.run("plugin.pack.import", {
      id: "sdk-team",
      previewHash: shown.previewHash,
    }),
    (error) => error.code === "plugin-public-repository",
  );
  await machine.run("plugin.pack.import", {
    id: "sdk-team",
    previewHash: shown.previewHash,
    confirmPublic: true,
  });
  assert.equal(
    inspectPlugins({
      workspaceRoot: machine.root,
      settingsFile: machine.settingsFile,
    })[0].state,
    "approved",
  );
});
