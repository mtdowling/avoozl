// Test helper for checks from a plugin (plugin-checks): a delivery
// workspace whose repository is acme/api, the example acme-checks plugin
// copied beside it with its manifest edited per test, declared in this
// workspace's own machine plugin settings, and approved on request.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import type { Task } from "../../types.ts";
import { deliveryWorkspace } from "./delivery-fixture.ts";
import { found } from "./view-shapes.ts";
import {
  approvePlugin,
  validateManifest,
  inspectPlugins,
  readPluginSettings,
  writePluginSettings,
} from "../plugins/plugins.ts";
import { approvedPluginChecks } from "../plugins/plugin-checks.ts";

export const PLUGIN_FIXTURE = path.join(
  import.meta.dirname,
  "fixtures",
  "plugins",
  "acme-checks",
);
export const FAKE_MCP = path.join(
  import.meta.dirname,
  "fixtures",
  "fake-review-mcp.ts",
);

// The example plugin's manifest, and a check that `edit` of it is refused
// with an error matching `pattern`.
export const manifestOf = (): Manifest =>
  JSON.parse(
    fs.readFileSync(path.join(PLUGIN_FIXTURE, "avoozl-plugin.json"), "utf8"),
  );
// The example plugin's manifest, for the parts these helpers touch; a test
// may edit any other part.
interface PluginCheck {
  stage?: string;
  decide?: unknown;
  decideAt?: unknown;
  network?: boolean;
  // An MCP step: its server and fixed tool calls.
  mcp?: {
    server: string;
    start: { args: Record<string, string> };
    poll: { everySeconds: number };
    result: { path: string };
  };
  [key: string]: unknown;
}
export interface Manifest {
  checks: Record<string, PluginCheck>;
  servers?: Record<string, { about: string }>;
  [key: string]: unknown;
}
type Edit = (manifest: Manifest) => Manifest | void;

export function refused(edit: Edit, pattern: RegExp) {
  const manifest = manifestOf();
  edit(manifest);
  assert.throws(
    () => validateManifest(manifest, { id: "acme-checks" }, PLUGIN_FIXTURE),
    pattern,
  );
}

// A copy of the example plugin at `folder`, its manifest passed through
// `edit(manifest)` (which may change it in place or return a new one).
export function copyPlugin(
  folder: string,
  edit: Edit = (m) => m,
  scripts: Record<string, string> = {},
) {
  fs.cpSync(PLUGIN_FIXTURE, folder, { recursive: true });
  for (const [file, text] of Object.entries(scripts))
    fs.writeFileSync(path.join(folder, file), text);
  const file = path.join(folder, "avoozl-plugin.json"),
    manifest: Manifest = JSON.parse(fs.readFileSync(file, "utf8")),
    edited = edit(manifest) ?? manifest;
  fs.writeFileSync(file, JSON.stringify(edited, null, 2));
  return folder;
}

// The manifest's checks set to task stage, decide off, so one check runs
// by itself on each task: the shape most tests start from.
export const taskStage = (manifest: Manifest) => {
  for (const check of Object.values(manifest.checks)) {
    check.stage = "task";
    delete check.decide;
    delete check.decideAt;
  }
  return manifest;
};

export function pluginWorkspace(
  t: TestContext,
  {
    edit = taskStage,
    files = { "src/api/handler.js": "export const x = 1;\n" },
    tasks,
    repository = {},
    mcp = null,
    approve = true,
    // More files in the plugin folder (path -> text, or a function of the
    // workspace root giving them), written before approval.
    scripts = {},
  }: {
    edit?: Edit;
    files?: Record<string, string>;
    tasks?: Task[];
    repository?: Record<string, unknown>;
    mcp?: unknown;
    approve?: boolean;
    scripts?:
      | Record<string, string>
      | ((root: string) => Record<string, string>);
  } = {},
) {
  let settingsFile = "";
  const workspace = deliveryWorkspace(t, {
    prefix: "avoozl-pk-",
    ...(tasks ? { tasks } : {}),
    files,
    repository: { github: "acme/api", ...repository },
    operations: (root) => {
      settingsFile = path.join(root, "machine", "plugins.json");
      return { pluginSettingsFile: settingsFile };
    },
  });
  const folder = copyPlugin(
      path.join(workspace.root, "acme-checks"),
      edit,
      typeof scripts === "function" ? scripts(workspace.root) : scripts,
    ),
    options = { workspaceRoot: workspace.root, settingsFile };
  writePluginSettings(settingsFile, {
    plugins: [{ id: "acme-checks", path: folder, contract: 1 }],
    approvals: {},
    disabled: [],
    pins: {},
    ...(mcp ? { mcp: { "acme-checks": mcp } } : {}),
  });
  const approveNow = (id = "acme-checks") => {
    const plugin = found(
      inspectPlugins(options).find((p) => p.id === id),
      id,
    );
    assert.ok("version" in plugin && "hash" in plugin, `${id} has no hash`);
    return approvePlugin(options, {
      id,
      version: plugin.version,
      hash: plugin.hash,
    });
  };
  if (approve) approveNow();
  return {
    ...workspace,
    folder,
    settingsFile,
    options,
    approve: approveNow,
    settings: () => readPluginSettings(settingsFile),
    check: (name: string) =>
      approvedPluginChecks(options).find(
        (c: { name: string }) => c.name === name,
      ),
  };
}
