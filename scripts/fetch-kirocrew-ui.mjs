#!/usr/bin/env node
// Fetches the Kiro Crew source the standalone page builds on, at the release
// named in kirocrew-app/ui/kirocrew-pin.json, into a cache outside git, and
// checks its digest before anything reads a file. No Kiro Crew file is ever
// committed (SW12.1), and a fetched file is never edited (SW12.3).
//
//   node scripts/fetch-kirocrew-ui.mjs           print the cache folder
//   node scripts/fetch-kirocrew-ui.mjs --digest  print the digest of a fetched tree
//
// AVOOZL_KIROCREW_SOURCE names a folder that already holds the source (a
// checkout of the same layout); its digest is checked the same way.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PIN_FILE = path.join(root, "kirocrew-app", "ui", "kirocrew-pin.json");

// What the build reads from Kiro Crew. Each entry is a file or a folder; the
// digest covers exactly these.
export const KEEP = [
  "LICENSE",
  "NOTICE",
  "THIRD-PARTY-NOTICES",
  "website/package.json",
  "website/package-lock.json",
  "website/public/fonts",
  "website/src",
];

export const readPin = (file = PIN_FILE) =>
  JSON.parse(fs.readFileSync(file, "utf8"));

function* files(base, relative) {
  const full = path.join(base, relative);
  let stat;
  try {
    stat = fs.lstatSync(full);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(full).sort())
      yield* files(base, `${relative}/${name}`);
  } else if (stat.isFile()) yield relative;
}

// sha256 over "<file sha256>  <path>" lines, paths sorted, forward slashes.
export function treeDigest(folder) {
  const all = KEEP.flatMap((entry) => [...files(folder, entry)]).sort(),
    sum = createHash("sha256");
  for (const file of all)
    sum.update(
      `${createHash("sha256").update(fs.readFileSync(path.join(folder, file))).digest("hex")}  ${file}\n`,
    );
  return `sha256:${sum.digest("hex")}`;
}

export function cacheRoot(env = process.env) {
  return path.join(
    env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "avoozl",
    "kirocrew-ui",
  );
}

export function checkDigest(folder, pin) {
  const found = treeDigest(folder);
  if (found !== pin.digest)
    throw new Error(
      `The Kiro Crew source in ${folder} does not match the pin (${pin.tag}): digest ${found}, wanted ${pin.digest}.`,
    );
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

// A partial, sparse checkout of the pinned commit: only the kept paths.
function download(pin, into) {
  fs.mkdirSync(into, { recursive: true });
  git(["init", "-q"], into);
  git(["remote", "add", "origin", pin.repository], into);
  git(["config", "core.sparseCheckout", "true"], into);
  // Hash the bytes git stores, whatever the platform's line-ending setting.
  git(["config", "core.autocrlf", "false"], into);
  fs.writeFileSync(
    path.join(into, ".git", "info", "sparse-checkout"),
    KEEP.map((entry) => `/${entry}`).join("\n") + "\n",
  );
  git(["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", pin.commit], into);
  git(["checkout", "-q", "FETCH_HEAD"], into);
  if (git(["rev-parse", "HEAD"], into) !== pin.commit)
    throw new Error(`The fetched commit is not the pinned ${pin.commit}.`);
}

// Returns the folder that holds the verified source. Throws, naming the
// reason, when it cannot be had.
export function fetchKiroCrewUi({
  pin = readPin(),
  env = process.env,
  cache = cacheRoot(env),
} = {}) {
  if (env.AVOOZL_KIROCREW_SOURCE) {
    checkDigest(env.AVOOZL_KIROCREW_SOURCE, pin);
    return env.AVOOZL_KIROCREW_SOURCE;
  }
  const folder = path.join(cache, pin.commit);
  if (fs.existsSync(folder))
    try {
      checkDigest(folder, pin);
      return folder;
    } catch {
      // A cache that fails its digest is fetched again beside it, not trusted.
      fs.renameSync(folder, `${folder}.bad-${Date.now()}`);
    }
  const staging = `${folder}.part-${process.pid}`;
  try {
    download(pin, staging);
    checkDigest(staging, pin);
    fs.renameSync(staging, folder);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error(
      `The Kiro Crew source for the standalone page could not be had: ${error.message.split("\n")[0]}`,
    );
  }
  return folder;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--digest"))
      console.log(treeDigest(fetchFolder()));
    else console.log(fetchKiroCrewUi());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function fetchFolder() {
  const given = process.env.AVOOZL_KIROCREW_SOURCE;
  if (!given) throw new Error("Set AVOOZL_KIROCREW_SOURCE to a folder to digest.");
  return given;
}
