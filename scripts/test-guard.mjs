// Loaded into every test process by scripts/run-tests.mjs (NODE_OPTIONS
// --import). A write under one of the person's real Avoozl folders, named
// in AVOOZL_TEST_GUARD as a JSON list, throws, so the test that made it
// fails by name. The runner already points XDG_CONFIG_HOME and
// XDG_STATE_HOME at a temporary folder; this catches a test that builds a
// real path some other way.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncBuiltinESMExports } from "node:module";

const fold = process.platform === "win32" || process.platform === "darwin";
const norm = (p) => (fold ? p.toLowerCase() : p);
const guarded = [];
for (const dir of JSON.parse(process.env.AVOOZL_TEST_GUARD || "[]")) {
  guarded.push(norm(path.resolve(dir)));
  try {
    guarded.push(norm(fs.realpathSync.native(dir)));
  } catch {}
}

export function isGuarded(target) {
  if (target == null || typeof target === "number") return false;
  let file =
    target instanceof URL
      ? fileURLToPath(target)
      : Buffer.isBuffer(target)
        ? target.toString()
        : String(target);
  if (file.startsWith("file:")) file = fileURLToPath(file);
  const full = norm(path.resolve(file));
  return guarded.some((dir) => full === dir || full.startsWith(dir + path.sep));
}

const refuse = (target) => {
  throw Error(
    `A test wrote under the real Avoozl folder: ${target}. Use a temporary folder (XDG_CONFIG_HOME, XDG_STATE_HOME or an explicit configFile).`,
  );
};
const writes = (flags) =>
  flags != null &&
  (typeof flags === "number"
    ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) !== 0
    : /[wa+]/.test(flags));

if (guarded.length) {
  // Methods whose first (and, for a move or copy, second) argument is a
  // path they change.
  const one = [
      "writeFile",
      "appendFile",
      "mkdir",
      "rm",
      "rmdir",
      "unlink",
      "truncate",
      "chmod",
      "utimes",
      "mkdtemp",
    ],
    two = ["rename", "copyFile", "cp", "symlink", "link"];
  // `changed(args)` lists the paths a call changes: a move changes both
  // ends, a copy or link only its destination.
  const wrap = (target, name, changed) => {
    const original = target[name];
    if (typeof original !== "function") return;
    target[name] = function (...args) {
      for (const file of changed(args)) if (isGuarded(file)) refuse(file);
      return original.apply(this, args);
    };
  };
  const first = (args) => [args[0]],
    destination = (args) => [args[1]],
    both = (args) => [args[0], args[1]];
  for (const [base, changed] of [
    ...one.map((name) => [name, first]),
    ...two.map((name) => [name, name === "rename" ? both : destination]),
  ]) {
    wrap(fs, base, changed);
    wrap(fs, `${base}Sync`, changed);
    wrap(fs.promises, base, changed);
  }
  for (const name of ["open", "openSync", "createWriteStream"]) {
    const original = fs[name];
    fs[name] = function (file, flags, ...rest) {
      const mode =
        name === "createWriteStream"
          ? ((typeof flags === "object" ? flags?.flags : flags) ?? "w")
          : flags;
      if (writes(mode) && isGuarded(file)) refuse(file);
      return original.call(this, file, flags, ...rest);
    };
  }
  const open = fs.promises.open;
  fs.promises.open = function (file, flags, ...rest) {
    if (writes(flags) && isGuarded(file)) refuse(file);
    return open.call(this, file, flags, ...rest);
  };
  syncBuiltinESMExports();
}
