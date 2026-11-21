// Loaded into every test process by scripts/test/run-tests.ts (NODE_OPTIONS
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
const norm = (p: string) => (fold ? p.toLowerCase() : p);
const guarded: string[] = [];
for (const dir of JSON.parse(process.env.AVOOZL_TEST_GUARD || "[]")) {
  guarded.push(norm(path.resolve(dir)));
  try {
    guarded.push(norm(fs.realpathSync.native(dir)));
  } catch {}
}

export function isGuarded(target: unknown) {
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

const refuse = (target: unknown) => {
  throw Error(
    `A test wrote under the real Avoozl folder: ${target}. Use a temporary folder (XDG_CONFIG_HOME, XDG_STATE_HOME or an explicit configFile).`,
  );
};
const writes = (flags: unknown) =>
  flags != null &&
  (typeof flags === "number"
    ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) !== 0
    : /[wa+]/.test(String(flags)));

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
  // fs's methods by name, so each can be replaced by a guarded one.
  type Methods = Record<string, (...args: unknown[]) => unknown>;
  type Changed = (args: unknown[]) => unknown[];
  const wrap = (target: object, name: string, changed: Changed) => {
    const methods = target as Methods;
    const original = methods[name];
    if (typeof original !== "function") return;
    methods[name] = function (this: unknown, ...args: unknown[]) {
      for (const file of changed(args)) if (isGuarded(file)) refuse(file);
      return original.apply(this, args);
    };
  };
  const first: Changed = (args) => [args[0]],
    destination: Changed = (args) => [args[1]],
    both: Changed = (args) => [args[0], args[1]];
  for (const [base, changed] of [
    ...one.map((name): [string, Changed] => [name, first]),
    ...two.map((name): [string, Changed] => [
      name,
      name === "rename" ? both : destination,
    ]),
  ]) {
    wrap(fs, base, changed);
    wrap(fs, `${base}Sync`, changed);
    wrap(fs.promises, base, changed);
  }
  for (const name of ["open", "openSync", "createWriteStream"]) {
    const methods = fs as unknown as Methods,
      original = methods[name];
    methods[name] = function (
      this: unknown,
      file: unknown,
      flags: unknown,
      ...rest: unknown[]
    ) {
      const mode =
        name === "createWriteStream"
          ? ((typeof flags === "object"
              ? (flags as { flags?: unknown } | null)?.flags
              : flags) ?? "w")
          : flags;
      if (writes(mode) && isGuarded(file)) refuse(file);
      return original.call(this, file, flags, ...rest);
    };
  }
  const promises = fs.promises as unknown as Methods,
    open = promises.open;
  promises.open = function (
    this: unknown,
    file: unknown,
    flags: unknown,
    ...rest: unknown[]
  ) {
    if (writes(flags) && isGuarded(file)) refuse(file);
    return open.call(this, file, flags, ...rest);
  };
  syncBuiltinESMExports();
}
