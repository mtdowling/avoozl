// Folder paths a person types or picks for a workspace. A leading `~` is
// their home folder, as in a shell. The picker lists folders under home only:
// the app page runs in an iframe with no native folder dialog, and a dialog
// the backend opens would show on whichever machine runs it, not the
// person's screen.
import fs from "node:fs";
import path from "node:path";

const MAX_FOLDERS = 500;

// `~` or `~/x` (and `~\x` on Windows) become paths under `home`. `~user` is
// left alone: it names another person's home, which we do not look up.
export function expandHome(value, home, platform = process.platform) {
  const text = String(value ?? "").trim();
  if (text === "~") return home;
  if (text.startsWith("~/") || (platform === "win32" && text.startsWith("~\\")))
    return path.join(home, text.slice(2));
  return text;
}

const inside = (child, parent) =>
  child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

// One folder's subfolders, for the picker. `at` defaults to home and must
// resolve (after links) to home or a folder inside it.
export function listFolders(at, home) {
  const realHome = fs.realpathSync.native(home);
  const wanted = at ? expandHome(at, home) : home;
  if (!path.isAbsolute(wanted)) throw Error("Choose an absolute folder.");
  let real;
  try {
    real = fs.realpathSync.native(wanted);
  } catch {
    throw Error(`No such folder: ${wanted}`);
  }
  if (!inside(real, realHome))
    throw Error("The folder picker shows folders in your home folder only. Type the path instead.");
  if (!fs.statSync(real).isDirectory()) throw Error(`Not a folder: ${real}`);
  let entries;
  try {
    entries = fs.readdirSync(real, { withFileTypes: true });
  } catch (error) {
    throw Error(`Cannot read ${real}: ${error.code || error.message}`);
  }
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const full = (name) => path.join(real, name);
  return {
    path: real,
    home: realHome,
    parent: real === realHome ? null : path.dirname(real),
    // Whether this folder already holds an Avoozl workspace.
    workspace: fs.existsSync(path.join(real, ".avoozl.json")),
    truncated: folders.length > MAX_FOLDERS,
    folders: folders.slice(0, MAX_FOLDERS).map((name) => ({
      name,
      path: full(name),
      workspace: fs.existsSync(path.join(full(name), ".avoozl.json")),
    })),
  };
}
