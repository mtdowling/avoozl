// `avoozl setup REPO` (task 42.7). A fake GitHub; nothing live.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Store } from "../store.mjs";
import { repositorySetup } from "../repository-setup.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function workspace(t) {
  const root = temporaryDirectory("avoozl-setup-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(
    checkout,
    "remote",
    "add",
    "origin",
    "https://example.invalid/acme/app.git",
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  store.put("projects", { id: "app", root: checkout, baseBranch: "main" });
  return store;
}

// GitHub after a setup write: each write changes what the next read sees.
function fakeGithub() {
  const state = {
      remote: {
        default_branch: "main",
        permissions: { admin: true },
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      },
      rulesets: [],
      variables: [],
    },
    writes = [];
  return {
    writes,
    currentUser: async () => ({ login: "me" }),
    permission: async () => ({ permission: "admin" }),
    repository: async () => structuredClone(state.remote),
    rulesets: async () => structuredClone(state.rulesets),
    listRepoVariables: async () => structuredClone(state.variables),
    createRuleset: async (_repo, body) => {
      writes.push("createRuleset");
      state.rulesets.push({ id: 7, ...body });
    },
    updateRuleset: async () => writes.push("updateRuleset"),
    updateRepository: async (_repo, body) => {
      writes.push("updateRepository");
      Object.assign(state.remote, body);
    },
    setRepoVariable: async (_repo, name, value) => {
      writes.push("setRepoVariable");
      state.variables.push({ name, value });
    },
  };
}

const input = {
  repository: "acme/app",
  project: "app",
  checks: ["build"],
};

test("setup previews without writing, applies on yes, then has nothing to change", async (t) => {
  const store = workspace(t),
    github = fakeGithub(),
    written = [];
  const preview = await repositorySetup(store, github, input);
  assert.equal(preview.applied, false);
  assert.equal(preview.message, null);
  assert.deepEqual(
    preview.github.filter((s) => s.status === "change").map((s) => s.id),
    ["ruleset", "merge-methods", "ci-variable"],
  );
  assert.deepEqual(preview.settings, [
    { key: "landing", before: null, after: "pr" },
  ]);
  assert.deepEqual(github.writes, []);
  assert.equal(store.get("projects", "app").landing, undefined);

  const landings = [];
  const applied = await repositorySetup(
    store,
    github,
    { ...input, confirm: true },
    {
      writeProject: (p) => written.push(p),
      writeLanding: (repository, mode) => landings.push([repository, mode]),
    },
  );
  assert.equal(applied.applied, true);
  assert.deepEqual(github.writes, [
    "createRuleset",
    "updateRepository",
    "setRepoVariable",
  ]);
  assert.equal(store.get("projects", "app").landing, "pr");
  // The mode goes to the repository's landing block, not the project file.
  assert.deepEqual(landings, [[input.repository, "pr"]]);
  assert.equal(written.length, 0);

  const again = await repositorySetup(store, github, {
    ...input,
    confirm: true,
  });
  assert.equal(again.message, "Nothing to change");
  assert.equal(again.applied, false);
  assert.equal(github.writes.length, 3);
});

test("the CLI previews setup and refuses --yes in an agent session", () => {
  const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
    root = temporaryDirectory("avoozl-setup-cli-");
  const run = (args, env = {}) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
      encoding: "utf8",
      env: {
        ...process.env,
        KIROCREW_SPAWNED: "",
        KIRO_SESSION_ID: "",
        ...env,
      },
    });
  const missing = run(["setup"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /setup OWNER\/REPO/);
  const agent = run(["setup", "acme/app", "--project", "app", "--yes"], {
    KIRO_SESSION_ID: "s1",
  });
  assert.notEqual(agent.status, 0);
  assert.match(agent.stderr, /agent session/);
});
