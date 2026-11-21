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
import { found } from "../../test/view-shapes.ts";

// The team-context manifest, as a test edits it.
export interface ContextManifest {
  context: {
    reads?: { id: string; about?: string; path?: string }[];
    ask?: Record<string, string>;
    mcp?: string;
    contentSets?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
type PluginSettings = ReturnType<typeof readPluginSettings>;

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
}: {
  edit?: (manifest: ContextManifest) => ContextManifest | void;
  declare?: string;
  approve?: boolean;
  answer?: boolean;
  map?: boolean;
  settingsFolder?: string | null;
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
    manifest: ContextManifest = JSON.parse(fs.readFileSync(file, "utf8"));
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
  const approveNow = () => {
    const inspected = found(plugin(), "team-context");
    if (!("hash" in inspected))
      throw Error(`team-context did not load: ${inspected.reason}`);
    return approvePlugin(options, {
      id: "team-context",
      version: inspected.version,
      hash: inspected.hash,
    });
  };
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
    write: (edit: (settings: PluginSettings) => void) => {
      const settings = readPluginSettings(settingsFile);
      edit(settings);
      writePluginSettings(settingsFile, settings);
    },
  };
}
