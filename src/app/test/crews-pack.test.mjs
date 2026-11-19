// rc-7.5: the team pack's `crews` section (RC7.4, RC7.5, design D9). Fake
// repositories and fake terms only. A pack creates no crew; applying shows a
// preview and writes only after the exact preview is confirmed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { packPreview, validatePack } from "../plugin-pack.mjs";
import { validateManifest } from "../plugins.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const EXAMPLE = path.join(import.meta.dirname, "../../../examples/sdk-team");
const REPO = "o/sdk";
const example = () =>
  JSON.parse(fs.readFileSync(path.join(EXAMPLE, "avoozl-pack.json"), "utf8"));
const refused = (mutate, pattern) => {
  const pack = example();
  mutate(pack.settings.crews);
  assert.throws(() => validatePack(pack), pattern);
};

test("the shipped sdk-team example validates and names no agent or prompt", () => {
  const pack = validatePack(example());
  assert.equal(pack.settings.crews.agent, undefined);
  assert.equal(pack.settings.crews.prompt, undefined);
});

test("a crews section with a bad value is refused by name", () => {
  refused((c) => (c.agent = "avoozl-crew"), /crews\.agent/);
  refused((c) => (c.prompt = "run anything"), /crews\.prompt/);
  refused((c) => (c.surprise = true), /crews\.surprise/);
  refused((c) => (c.labels.extra = "x"), /labels\.extra/);
  refused((c) => (c.labels.plan = c.labels.ready), /./);
  refused((c) => (c.count = 2), /crews\.count/);
  refused((c) => (c.reviewRules = "x"), /crews\.reviewRules/);
});

const plugin = { id: "sdk-team", version: "1.0.0", hash: "h" };
const current = (extra = {}) => ({
  version: 1,
  github: {
    mode: "single-repo",
    repositories: { [REPO]: { baseBranch: "main", ...extra } },
  },
});

test("the preview lists each label as a setting and creates nothing in Radar", () => {
  const pack = validatePack(example()),
    preview = packPreview({ plugin, pack, current: current() });
  const names = preview.changes.map((c) => c.setting);
  assert.deepEqual(names, [
    `github.repositories.${REPO}.managedLabels.ready`,
    `github.repositories.${REPO}.radar.planLabel`,
    `github.repositories.${REPO}.radar.conflictLabel`,
  ]);
  assert.ok(preview.changes.every((c) => c.action === "create"));
  // Nothing in the preview asks for a crew, a model price or a prompt write.
  assert.equal(
    names.some((name) => /prompt|price/i.test(name)),
    false,
  );
});

test("with no repository chosen the crews values are skipped and say why", () => {
  const pack = validatePack(example()),
    preview = packPreview({
      plugin,
      pack,
      current: { version: 1 },
      repositories: [],
    });
  assert.ok(preview.changes.length > 0);
  assert.ok(preview.changes.every((c) => c.action === "skip"));
  assert.match(preview.changes[0].reason, /No GitHub repository/);
});

test("the same pack again keeps every value", () => {
  const pack = validatePack(example()),
    first = packPreview({ plugin, pack, current: current() }),
    again = packPreview({ plugin, pack, current: first.next });
  assert.ok(again.changes.every((c) => c.action === "keep"));
});

function setup(t, rules) {
  const root = temporaryDirectory("avoozl-crews-"),
    outside = temporaryDirectory("avoozl-crews-machine-"),
    folder = path.join(root, "plugins", "sdk-team");
  fs.cpSync(
    path.join(import.meta.dirname, "fixtures", "plugins", "sdk-team"),
    folder,
    { recursive: true },
  );
  const pack = example();
  Object.assign(pack.settings.crews, rules);
  fs.writeFileSync(
    path.join(folder, "avoozl-pack.json"),
    JSON.stringify(pack, null, 2),
  );
  // A private term, as a local terms file the repository never holds.
  const termsDir = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(termsDir, { recursive: true });
  fs.writeFileSync(path.join(termsDir, "names.txt"), "name: zebra\n");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_crewspackxxxxxxx",
      contentRules: { sets: [{ id: "names" }] },
      github: {
        mode: "single-repo",
        project: { owner: "o", number: 1 },
        repositories: { [REPO]: { baseBranch: "main" } },
      },
    }),
  );
  Object.assign(process.env, {
    SDK_TEAM_TERMS: path.join(outside, "terms.json"),
    SDK_TEAM_INTAKE: path.join(outside, "intake.json"),
  });
  fs.writeFileSync(process.env.SDK_TEAM_INTAKE, JSON.stringify({ items: [] }));
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.db.isOpen && store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  const ops = new Operations(store, {
    workspaceRoot: root,
    pluginSettingsFile: path.join(outside, "plugins.json"),
  });
  return { root, ops };
}

async function install(ops) {
  await ops.execute("plugin.add", {
    scope: "repository",
    confirmPublic: true,
    entry: {
      id: "sdk-team",
      path: "plugins/sdk-team",
      contract: 1,
      config: {
        intakeFileEnv: "SDK_TEAM_INTAKE",
        termsFileEnv: "SDK_TEAM_TERMS",
      },
    },
  });
  const row = (await ops.execute("plugins.list", {})).plugins.find(
    (p) => p.id === "sdk-team",
  );
  await ops.execute("plugin.approve", {
    id: row.id,
    version: row.version,
    hash: row.hash,
  });
}

test("a pack with a private name is refused, and a clean one imports only after its preview", async (t) => {
  const bad = setup(t, {
    labels: { plan: "zebra", ready: "ready", conflict: "merge conflict" },
  });
  await install(bad.ops);
  await assert.rejects(
    bad.ops.execute("plugin.pack.preview", { id: "sdk-team" }),
    (error) =>
      error.status === 422 &&
      /names\//.test(error.message) &&
      !/zebra/.test(error.message),
  );
  const before = fs.readFileSync(path.join(bad.root, ".avoozl.json"), "utf8");
  await assert.rejects(
    bad.ops.execute("plugin.pack.import", {
      id: "sdk-team",
      previewHash: "0".repeat(64),
      confirmPublic: true,
    }),
    (error) => error.status === 422,
  );
  assert.equal(
    fs.readFileSync(path.join(bad.root, ".avoozl.json"), "utf8"),
    before,
  );

  const good = setup(t, {});
  await install(good.ops);
  const preview = await good.ops.execute("plugin.pack.preview", {
    id: "sdk-team",
  });
  assert.ok(preview.changes.some((c) => c.setting.endsWith("radar.planLabel")));
  const file = path.join(good.root, ".avoozl.json"),
    untouched = fs.readFileSync(file, "utf8");
  assert.equal(
    JSON.parse(untouched).github.repositories[REPO].radar,
    undefined,
  );
  await good.ops.execute("plugin.pack.import", {
    id: "sdk-team",
    previewHash: preview.previewHash,
    confirmPublic: true,
  });
  const entry = JSON.parse(fs.readFileSync(file, "utf8")).github.repositories[
    REPO
  ];
  assert.equal(entry.radar.planLabel, "to plan");
  assert.equal(entry.managedLabels.ready, "ready");
  // Only settings were written; no crew exists anywhere to create.
  assert.equal(entry.radar.crew, undefined);
});

test("the shipped sdk-team example folder has a manifest plugins add accepts", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(EXAMPLE, "avoozl-plugin.json"), "utf8"),
  );
  assert.doesNotThrow(() =>
    validateManifest(manifest, { id: "sdk-team", contract: 1 }),
  );
  assert.deepEqual(manifest.provides, ["pack"]);
  assert.equal(manifest.pack, "avoozl-pack.json");
});
