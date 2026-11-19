// Phase 5 of triage-agent (TA11): label commands, the Issue Radar
// integration, public crews and review drafts are gone, with no backward
// compatibility. Their operations and commands answer as unknown ones, their
// modules are deleted and nothing imports them, and the app asks for no
// Issue Radar grant. Removed settings fail as unknown in
// github-settings.test.mjs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OPERATIONS } from "../operation-table.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI = path.join(ROOT, "cli.mjs");

const REMOVED_OPERATIONS = [
  "untriaged.view",
  "untriaged.crews",
  "untriaged.plan",
  "untriaged.handoff",
  "radar.crews",
  "radar.flow",
  "radar.releasestep",
  "review.drafts",
  "reviewdraft.post",
  "github.crewlabel.backfill",
  "github.trigger.preview",
  "github.issues",
  "github.sync",
  "github.authorize",
  "demo.fixtures",
];
const REMOVED_MODULES = [
  "radar-handoff",
  "radar-crews",
  "radar-plan-me",
  "radar-source",
  "radar-flow",
  "demo-radar",
  "crew-label-backfill",
  "approval-label",
  "radar-coder-release",
  "untriaged",
  "review-draft",
  "issue-match",
  "head-checks",
  "flow-github",
];

const cli = (workspace, ...args) =>
  spawnSync(process.execPath, [CLI, ...args, "--workspace", workspace], {
    encoding: "utf8",
    env: { ...process.env, AVOOZL_SERVER: "" },
  });
const said = (run) => `${run.stdout}${run.stderr}`.trim().split("\n").at(-1);

test("a removed operation is not in the table", () => {
  for (const name of REMOVED_OPERATIONS)
    assert.equal(OPERATIONS.has(name), false, name);
});

test("a removed operation or command answers as an unknown one", () => {
  const workspace = temporaryDirectory();
  assert.equal(spawnSync(process.execPath, [CLI, "init", workspace]).status, 0);
  const unknown = said(cli(workspace, "nonsense.view"));
  assert.match(unknown, /^Unknown command or operation nonsense\.view\./);
  for (const name of ["untriaged.view", "radar.crews", "review.drafts"])
    assert.equal(
      said(cli(workspace, name)),
      unknown.replace("nonsense.view", name),
    );
  // `review drafts` falls through to an operation named `review`.
  assert.match(
    said(cli(workspace, "review", "drafts")),
    /^Unknown command or operation review\./,
  );
  const sync = cli(workspace, "github", "sync");
  assert.notEqual(sync.status, 0);
  assert.match(sync.stderr, /Choose github status, configure or setup./);
});

test("no removed module is left, and no source names one", () => {
  const app = path.join(ROOT, "src/app");
  for (const name of REMOVED_MODULES)
    assert.equal(fs.existsSync(path.join(app, `${name}.mjs`)), false, name);
  const pattern = new RegExp(`["'/](${REMOVED_MODULES.join("|")})\\.mjs["']`);
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory())
        return entry.name === "node_modules" || entry.name === "dist"
          ? []
          : walk(full);
      return /\.(mjs|ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  for (const file of [
    ...walk(path.join(ROOT, "src")),
    ...walk(path.join(ROOT, "kirocrew-app")),
  ])
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), pattern, file);
});

test("the app asks for no Issue Radar grant", () => {
  const manifest = fs.readFileSync(
    path.join(ROOT, "kirocrew-app/app.json"),
    "utf8",
  );
  assert.doesNotMatch(manifest, /issue-radar/);
});
