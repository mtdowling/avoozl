// Shared setup for the tracker gate tests: an approved spec with a gate task
// and the test-only fake gate plugin, run by the real plugin loader.
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../operations.mjs";
import { gateStep } from "../gate-step.mjs";
import { pluginHost, writePluginSettings } from "../plugins.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins");
export const ours = (tasks) =>
  tasks.map((task) => task.id).filter((id) => id.startsWith("sdk."));
export const T0 = Date.parse("2026-11-14T12:00:00.000Z");
export const at = (minutes) => () => new Date(T0 + minutes * 60_000);

const TASKS = [
  "# Tasks",
  "",
  "- [ ] 1 Wait for the review to ship",
  "- [ ] 2 Cut over",
  "",
].join("\n");
const manifest = {
  tasks: {
    1: {
      kind: "leaf",
      repository: "code",
      acceptance: ["The review shipped to the live release"],
      completion: "tracker",
      tracker: {
        plugin: "fake-gate",
        item: "REV-1",
        done: "the review shipped",
      },
    },
    2: {
      kind: "leaf",
      repository: "code",
      acceptance: ["Cut over"],
      checks: ["npm test"],
      completion: "integrated",
      requires: ["1"],
    },
  },
};

export async function workspace(
  t,
  { rules = false, tasks = TASKS, tree = manifest } = {},
) {
  const { root, store } = fixture(t),
    stateFile = path.join(root, "fake-gate.json"),
    settingsFile = path.join(root, "config", "plugins.json");
  fs.writeFileSync(stateFile, JSON.stringify({ items: {} }));
  writePluginSettings(settingsFile, {
    plugins: [
      {
        id: "fake-gate",
        path: path.join(FIXTURE, "fake-gate"),
        contract: 1,
        config: { stateFile },
      },
    ],
  });
  if (rules) {
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, contentRules: { sets: [{ id: "priv" }] } }),
    );
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "priv.txt"), "forbidden: forbiddenword\n");
  }
  store.put("projects", {
    id: "code",
    root: temporaryDirectory(),
    baseBranch: "main",
    checks: ["npm test"],
  });
  writeSpec(root, "sdk", {
    "tasks.md": tasks,
    "avoozl/manifest.json": JSON.stringify(tree),
  });
  const ops = new Operations(store, {
    workspaceRoot: root,
    pluginSettingsFile: settingsFile,
  });
  const listed = await ops.execute("plugins.list", {});
  await ops.execute("plugin.approve", {
    id: "fake-gate",
    hash: listed.plugins[0].hash,
  });
  const plan = await ops.execute("plan.create", { spec: "sdk" }),
    preview = await ops.execute("plan.preview", { id: "sdk" });
  await ops.execute("plan.approve", {
    id: "sdk",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  const host = pluginHost({ workspaceRoot: root, settingsFile });
  const outside = (patch) => {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    fs.writeFileSync(stateFile, JSON.stringify({ ...state, ...patch }));
  };
  const calls = () =>
    (JSON.parse(fs.readFileSync(stateFile, "utf8")).calls ?? []).length;
  // One tick's gate step at `minutes` after T0.
  const tick = async (minutes, options = {}) => {
    const session = host.open();
    try {
      return await gateStep(store, session, { now: at(minutes), ...options });
    } finally {
      await session.close();
    }
  };
  const item = (state, evidence = "seen", link) =>
    outside({ items: { "REV-1": { state, evidence, link } } });
  return { root, store, ops, tick, item, outside, calls };
}
