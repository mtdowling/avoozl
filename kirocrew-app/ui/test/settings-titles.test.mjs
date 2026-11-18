// Settings page titles: pages of the selected workspace name it, the machine's
// own page does not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { settingsTitle } from "../src/settings-api.ts";

const PAGES = {
  repositories: "Repository setup",
  github: "GitHub",
  radar: "Issue Radar",
  plugins: "Plugins",
  content: "Content rules",
  flow: "Flow",
  models: "Models",
  delivery: "Delivery",
};

test("per-workspace pages carry the workspace name", () => {
  for (const [key, label] of Object.entries(PAGES))
    assert.equal(settingsTitle(key, label, "Nupp"), `Nupp: ${label}`);
  assert.equal(
    settingsTitle("repositories", "Repository setup", "Nupp"),
    "Nupp: Repository setup",
  );
});

test("the Workspaces page keeps its plain title", () => {
  assert.equal(settingsTitle("workspaces", "Workspaces", "Nupp"), "Workspaces");
});

test("no workspace name means the plain title", () => {
  assert.equal(settingsTitle("flow", "Flow", undefined), "Flow");
  assert.equal(settingsTitle("flow", "Flow", ""), "Flow");
});

test("the app passes the selected workspace's name", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(
    app,
    /workspaceName=\{list\?\.items\.find\(\(w\) => w\.id === active\)\?\.name\}/,
  );
});
