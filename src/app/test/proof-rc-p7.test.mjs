// Proof rc-p7 on a fake GitHub: a scratch repository with nothing configured,
// Set up with the sdk-team pack, then the Radar steps by hand with the shown
// values, then the re-read. Temporary workspace, fake GitHub and fake Radar
// only. The live run is the owner's.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
const REPO = "o/sdk";

// A stateful fake GitHub: what `gh` would change for the four write steps.
function fakeGitHub() {
  const state = { labels: [], rules: [], autoMerge: false, writes: [] };
  return {
    state,
    available: () => true,
    repository: async () => ({
      default_branch: "main",
      allow_auto_merge: state.autoMerge,
      permissions: { admin: true, push: true },
    }),
    listLabels: async () => state.labels.map((name) => ({ name })),
    ensureLabel: async (_repository, label) => {
      state.writes.push(["label", label.name]);
      state.labels.push(label.name);
      return label;
    },
    request: async (method, pathname, { body } = {}) => {
      if (method === "GET" && pathname.endsWith("/contents/AGENTS.md"))
        return {
          sha: "s1",
          content: Buffer.from("# Rules\n").toString("base64"),
        };
      if (method === "GET") return { object: { sha: "base" } };
      state.writes.push([method, pathname]);
      if (pathname.endsWith("/pulls")) {
        state.pull = body;
        state.pulled = true;
        return { number: 7 };
      }
      if (method === "POST" && pathname.endsWith("/rulesets"))
        state.rules.push(
          ...body.rules[0].parameters.required_status_checks.map(
            (c) => c.context,
          ),
        );
      else if (method === "PATCH") state.autoMerge = body.allow_auto_merge;
      return {};
    },
    branch: async () => ({ protected: true }),
    branchRules: async () =>
      state.rules.length
        ? [
            {
              type: "required_status_checks",
              parameters: {
                required_status_checks: state.rules.map((context) => ({
                  context,
                })),
              },
            },
          ]
        : [],
    branchProtection: async () => null,
    listCommits: async () => [],
    listPullRequests: async () => (state.pulled ? [{ number: 7 }] : []),
    checkRuns: async () => [],
    commitStatus: async () => ({ statuses: [] }),
  };
}

test("Set up end to end: pack preview and import, Radar steps by confirm, owner enters the shown values, re-read ticks", async (t) => {
  // A scratch repository with nothing configured but its registration.
  const root = temporaryDirectory("avoozl-p7-"),
    outside = temporaryDirectory("avoozl-p7-machine-"),
    folder = path.join(root, "plugins", "sdk-team");
  fs.cpSync(
    path.join(import.meta.dirname, "fixtures", "plugins", "sdk-team"),
    folder,
    { recursive: true },
  );
  // The pack under test is the shipped example.
  fs.copyFileSync(
    path.join(
      import.meta.dirname,
      "../../../examples/sdk-team/avoozl-pack.json",
    ),
    path.join(folder, "avoozl-pack.json"),
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_proofrcp70000001",
      github: {
        mode: "single-repo",
        project: { owner: "o", number: 1 },
        repositories: {
          [REPO]: {
            baseBranch: "main",
            coder: "issue-radar",
            requiredChecks: ["build"],
          },
        },
      },
    }),
  );
  Object.assign(process.env, {
    SDK_TEAM_TERMS: path.join(outside, "terms.json"),
    SDK_TEAM_INTAKE: path.join(outside, "intake.json"),
    SDK_TEAM_STATE: path.join(outside, "records.json"),
  });
  fs.writeFileSync(process.env.SDK_TEAM_INTAKE, JSON.stringify({ items: [] }));
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.db.isOpen && store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });

  // Fake Radar: no crew yet. The owner adds it by hand later.
  let radar = { status: 200, body: { settings: {}, crews: [] } };
  const github = fakeGitHub(),
    ops = new Operations(store, {
      github,
      workspaceRoot: root,
      pluginSettingsFile: path.join(outside, "plugins.json"),
      crewReader: async () => radar,
    });
  const policyFile = path.join(root, ".avoozl.json"),
    entry = () =>
      JSON.parse(fs.readFileSync(policyFile, "utf8")).github.repositories[REPO];

  // 1. Install the pack, preview it, import after the exact preview.
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
        stateFileEnv: "SDK_TEAM_STATE",
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
  const before = fs.readFileSync(policyFile, "utf8"),
    preview = await ops.execute("plugin.pack.preview", { id: "sdk-team" });
  assert.equal(
    fs.readFileSync(policyFile, "utf8"),
    before,
    "preview writes nothing",
  );
  await ops.execute("plugin.pack.import", {
    id: "sdk-team",
    previewHash: preview.previewHash,
    confirmPublic: true,
  });
  assert.equal(entry().radar.crew.count, 2);
  assert.equal(entry().radar.planLabel, "to plan");
  assert.equal(
    github.state.writes.length,
    0,
    "the pack wrote nothing to GitHub",
  );

  // 2. Set up: preview, then each Radar step by its own confirm.
  const shown = await ops.execute("radar.setup", { repository: REPO });
  assert.deepEqual(
    shown.steps.map((s) => [s.id, s.status]),
    [
      ["labels", "change"],
      ["branch-rule", "change"],
      ["auto-merge", "change"],
      ["agents-pr", "change"],
      ["project", "ok"],
    ],
  );
  assert.equal(github.state.writes.length, 0, "a preview writes nothing");
  for (const step of shown.steps.filter((s) => s.status === "change")) {
    const done = await ops.execute("radar.setup", {
      repository: REPO,
      step: step.id,
      confirm: true,
      previewHash: step.previewHash,
    });
    assert.equal(done.applied.status, "done", step.id);
  }
  const after = await ops.execute("radar.setup", { repository: REPO });
  assert.ok(after.steps.every((s) => s.status === "ok"));
  assert.deepEqual(github.state.labels, ["to plan", "ready", "merge conflict"]);
  assert.equal(github.state.autoMerge, true);
  assert.deepEqual(github.state.rules, ["build"]);
  assert.equal(github.state.pull.base, "main");

  // 3. The values screen: Copy-able values from the pack, nothing ticked
  // while Radar has no crew.
  const empty = await ops.execute("radar.values", { repository: REPO }),
    item = (result, id) => result.items.find((i) => i.id === id);
  assert.equal(item(empty, "model").value, "model-a");
  assert.equal(item(empty, "scope").value, "ready");
  assert.equal(item(empty, "crew-name").status, "differs");
  // Radar answered for the repository, so it counts as connected.
  assert.equal(item(empty, "repository").status, "ok");
  assert.equal(item(empty, "scope").status, "cannot-verify");

  // 4. The owner enters the shown values in Radar by hand; the re-read ticks.
  radar = {
    status: 200,
    body: {
      settings: { needs_human_label: item(empty, "needs-human").value },
      crews: [
        {
          id: "c1",
          name: item(empty, "crew-name").value,
          labels: [item(empty, "scope").value],
          agent: item(empty, "agent").value,
          model: item(empty, "model").value,
          extra_prompt: item(empty, "prompt").value,
        },
      ],
    },
  };
  radar.body.settings.claim_ttl_hours = Number(
    item(empty, "claim-limit").value,
  );
  const ticked = await ops.execute("radar.values", { repository: REPO });
  // All eight tick when Radar's read returns them (RC7.3).
  assert.equal(ticked.items.length, 8);
  assert.ok(ticked.items.every((i) => i.status === "ok"));
});
