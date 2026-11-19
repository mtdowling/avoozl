// Where a repository keeps its spec folders: `specs.path` in the
// `.avoozl.json` at the root of the checkout that holds them, else
// `.kiro/specs`. The value is a relative path inside the repository with no
// `..`, and the folder it names may not be a symlink out of the checkout.
import fs from "node:fs";
import path from "node:path";
import { fail } from "../store/store.mjs";

export const DEFAULT_SPECS_PATH = ".kiro/specs";
const SEGMENT = /^[A-Za-z0-9._-]+$/;

// Why `value` is not a specs path, or null. Checks the text only.
export function specsPathProblem(value) {
  if (typeof value !== "string" || !value.length || value.length > 200)
    return "specs.path is a relative folder of 1 to 200 characters, such as .kiro/specs.";
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value))
    return "specs.path must be relative to the repository root.";
  const parts = value.replace(/\/+$/, "").split("/");
  if (parts.some((part) => part === ".." || part === "."))
    return "specs.path may not name . or .. folders.";
  if (parts.some((part) => !SEGMENT.test(part)))
    return "specs.path folders use letters, digits, '.', '_' and '-', separated by '/'.";
  return null;
}

// The setting as written in `<root>/.avoozl.json`, or undefined. A missing
// or unreadable file is unset; layered-config reports a broken one.
function setting(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, ".avoozl.json"), "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text)?.specs?.path;
  } catch {
    return undefined;
  }
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

// The checked specs path of the checkout at `root`, with `/` separators and
// no trailing slash. With no root it is the default.
export function specsPath(root) {
  const value = root ? setting(root) : undefined;
  if (value === undefined) return DEFAULT_SPECS_PATH;
  const problem = specsPathProblem(value);
  if (problem) fail(`${path.join(root, ".avoozl.json")}: ${problem}`, 409);
  const clean = value.replace(/\/+$/, "");
  // A symlink anywhere on the path may not lead out of the checkout: the
  // deepest folder of it that exists must resolve inside the root.
  let real = null;
  for (
    let at = clean.split("/");
    at.length && real === null;
    at = at.slice(0, -1)
  )
    try {
      real = fs.realpathSync.native(path.join(root, ...at));
    } catch {
      // Not there yet; try its parent.
    }
  if (real !== null && !inside(fs.realpathSync.native(root), real))
    fail(
      `${path.join(root, ".avoozl.json")}: specs.path ${clean} leads outside the repository.`,
      409,
    );
  return clean;
}

// The specs folder on disk.
export const specsDirectory = (root) => path.join(root, specsPath(root));

// One spec folder as a repository path with a trailing slash, such as
// `.kiro/specs/<name>/`.
export const specFolderPath = (root, name) => `${specsPath(root)}/${name}/`;

// The specs path of a repository read over GitHub: its registered checkout's
// setting (by ID or `owner/name`), else the default.
export function specsPathOf(store, repository) {
  const root = store
    ?.list?.("repositories")
    .find(
      (entry) => entry.id === repository || entry.github === repository,
    )?.root;
  return specsPath(root ?? null);
}
