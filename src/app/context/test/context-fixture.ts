// @ts-nocheck: typing debt
// Test helper for epic context: the example team-context plugin copied into
// a temporary machine, declared in its plugins.json, with the notes folder
// asked for, and approved on request.
import fs from "node:fs";
import path from "node:path";
import {
  approvePlugin,
  inspectPlugins,
  readPluginSettings,
  writePluginSettings,
} from "../../plugins/plugins.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

export const EXAMPLE = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "examples",
  "plugins",
  "team-context",
);

export function contextMachine({
  edit = (m) => m,
  declare = "machine",
  approve = false,
  answer = true,
  map = true,
  // Where plugins.json lives, when the test's machine has its own folder.
  settingsFolder = null,
} = {}) {
  const root = temporaryDirectory("avoozl-ctx-"),
    workspaceRoot = path.join(root, "workspace"),
    folder = path.join(root, "team-context"),
    settingsFile = path.join(
      settingsFolder ?? path.join(root, "machine"),
      "plugins.json",
    ),
    notes = path.join(root, "notes");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(path.join(notes, "widgets"), { recursive: true });
  fs.writeFileSync(path.join(notes, "widgets", "note.md"), "A note.\n");
  fs.cpSync(EXAMPLE, folder, { recursive: true });
  const file = path.join(folder, "avoozl-plugin.json"),
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify(edit(manifest) ?? manifest, null, 2));
  const entry = { id: "team-context", path: folder, contract: 1 };
  if (declare === "repository")
    fs.writeFileSync(
      path.join(workspaceRoot, ".avoozl.json"),
      JSON.stringify({ version: 1, plugins: [entry] }),
    );
  writePluginSettings(settingsFile, {
    plugins: declare === "machine" ? [entry] : [],
    approvals: {},
    disabled: [],
    pins: {},
    ...(answer
      ? { context: { "team-context": { answers: { notesRoot: notes } } } }
      : {}),
    ...(map
      ? { mcp: { "team-context": { research: { env: ["RESEARCH_TOKEN"] } } } }
      : {}),
  });
  const options = { workspaceRoot, settingsFile };
  const plugin = () =>
    inspectPlugins(options).find((p) => p.id === "team-context");
  const approveNow = () =>
    approvePlugin(options, {
      id: "team-context",
      version: plugin().version,
      hash: plugin().hash,
    });
  if (approve) approveNow();
  return {
    root,
    workspaceRoot,
    folder,
    notes,
    settingsFile,
    options,
    plugin,
    approve: approveNow,
    settings: () => readPluginSettings(settingsFile),
    write: (edit) => {
      const settings = readPluginSettings(settingsFile);
      edit(settings);
      writePluginSettings(settingsFile, settings);
    },
  };
}
