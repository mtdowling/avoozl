// Git repositories a test file builds once and copies for each test. A copy
// starts no git process, and on a busy machine each git process costs a few
// hundred milliseconds.
import fs from "node:fs";
import path from "node:path";
import { temporaryDirectory } from "./temporary.mjs";

// The spellings of `dir` a git config may hold: as given, with its links
// resolved (macOS /var is /private/var), and escaped or forward-slashed on
// Windows.
function spellings(dir) {
  const all = new Set();
  for (const d of [dir, fs.realpathSync.native(dir)])
    for (const s of [d, d.replaceAll("\\", "/"), d.replaceAll("\\", "\\\\")])
      all.add(s);
  return [...all].sort((a, b) => b.length - a.length);
}

// Copies everything under `from` into `to`. Each repository's config (a
// checkout's .git/config or a bare repository's config) is rewritten so a
// remote that pointed inside `from` points at the same place inside `to`.
function copyRepositories(from, to) {
  const old = spellings(from),
    now = to.replaceAll("\\", "/");
  for (const name of fs.readdirSync(from)) {
    const target = path.join(to, name);
    fs.cpSync(path.join(from, name), target, { recursive: true });
    for (const config of [
      path.join(target, ".git", "config"),
      path.join(target, "config"),
    ]) {
      if (!fs.existsSync(config) || !fs.statSync(config).isFile()) continue;
      let text = fs.readFileSync(config, "utf8");
      for (const s of old) text = text.replaceAll(s, now);
      fs.writeFileSync(config, text);
    }
  }
}

// Moves each string in `value` that starts with `from` to start with `to`.
function moved(value, from, to) {
  if (typeof value === "string")
    return value.startsWith(from) ? to + value.slice(from.length) : value;
  if (Array.isArray(value)) return value.map((v) => moved(v, from, to));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, moved(v, from, to)]),
    );
  return value;
}

// `build(dir)` makes repositories under `dir` and returns facts about them
// (paths, commits), or a promise of them. The returned function copies them
// into a test's `root` and returns the facts with paths moved there. Build
// runs once per test file, on first use; a sync build gives a sync copy.
export function gitTemplate(build) {
  let dir, made;
  const copy = (root, facts) => {
    copyRepositories(dir, root);
    return moved(facts, dir, root);
  };
  return (root) => {
    if (!dir) {
      dir = temporaryDirectory("avoozl-template-");
      made = build(dir);
    }
    return made instanceof Promise
      ? made.then((facts) => copy(root, facts))
      : copy(root, made);
  };
}
