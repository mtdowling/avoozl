// Git plugin sources (design §4.8, Requirement 34.12–34.15). A `plugins`
// entry may name `git` (a URL or local repository path), `ref` (a tag,
// branch or full commit) and an optional `subdir`. A branch moves, so a ref
// is never trusted: a person's Add or Update resolves it to one commit, and
// that commit is fetched, shallow, into `<plugins>/git/<id>/<commit>/` with
// the person's own git and credential helpers. Hooks are off, submodules and
// tags are skipped, nothing is installed, and the `.git` folder is removed so
// the plugin folder is plain files. The tick only reads that folder.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const URL_FORM = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCP_FORM = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:(?!\/\/)/;
const GIT_TIMEOUT_MS = 120_000;

// A credential in an error message or a URL is shown masked.
const TOKEN =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,})/g;
export function maskCredentials(text) {
  return String(text)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, "$1***@")
    .replace(TOKEN, "***");
}

export const isGitUrl = (value) => URL_FORM.test(value) || SCP_FORM.test(value);

// The shape checks validateEntry runs for a git entry. No network.
export function validateGitSource(entry, where) {
  const { git, ref, subdir } = entry;
  if (typeof git !== "string" || !git.trim() || git.length > 2048)
    fail(`${where}.git must be a repository URL or path.`);
  if (/[\s\0-\x1f]/.test(git) || git.startsWith("-"))
    fail(`${where}.git must be a repository URL or path.`);
  if (/^[a-z][a-z0-9+.-]*::/i.test(git))
    fail(`${where}.git may not name a git transport helper.`);
  if (URL_FORM.test(git)) {
    let url;
    try {
      url = new URL(git);
    } catch {
      fail(`${where}.git is not a valid URL.`);
    }
    if (!["https:", "http:", "ssh:", "git:", "file:"].includes(url.protocol))
      fail(`${where}.git must use https, ssh, git or file.`);
    // An SSH user (ssh://git@host) names no secret; anything else in the
    // user part, or a query, can carry one.
    if (url.password || (url.username && url.protocol !== "ssh:") || url.search)
      fail(
        `${where}.git must not carry credentials. Use your git credential helper or an SSH key instead.`,
      );
  } else if (/^[^/@]*:[^/@]*@/.test(git))
    fail(
      `${where}.git must not carry credentials. Use your git credential helper or an SSH key instead.`,
    );
  if (git.replace(TOKEN, "***") !== git)
    fail(`${where}.git must not carry credentials.`);
  if (
    typeof ref !== "string" ||
    !/^[A-Za-z0-9_][A-Za-z0-9._/@{}^~+-]{0,254}$/.test(ref) ||
    ref.includes("..") ||
    ref.endsWith("/") ||
    ref.endsWith(".lock")
  )
    fail(`${where}.ref must be a tag, branch or full commit.`);
  if (/^[0-9a-f]{7,39}$/.test(ref))
    // A short commit cannot be resolved without fetching the whole history.
    fail(`${where}.ref must be the full commit, not a short one.`);
  if (subdir !== undefined) {
    if (
      typeof subdir !== "string" ||
      !subdir.trim() ||
      path.isAbsolute(subdir) ||
      /^[A-Za-z]:/.test(subdir) ||
      subdir.split(/[\\/]/).includes("..")
    )
      fail(`${where}.subdir must be a folder inside the repository.`);
  }
}

// The value handed to git: a URL as written, or a local repository path
// resolved against `base` (the workspace for `.avoozl.json`, the settings
// folder for machine entries).
export const gitRemote = (git, base) =>
  isGitUrl(git) ? git : path.resolve(base, git);

function hooksOff(root) {
  const folder = path.join(root, ".hooks-off");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  return folder;
}

// Run the person's git with hooks, submodules, fsmonitor and LFS downloads
// off. Errors come back with credentials masked.
function git(args, { cwd, hooks } = {}) {
  const config = [
    `core.hooksPath=${hooks}`,
    "core.fsmonitor=false",
    "submodule.recurse=false",
    "fetch.recurseSubmodules=false",
    "protocol.ext.allow=never",
    "advice.detachedHead=false",
  ].flatMap((value) => ["-c", value]);
  return new Promise((resolve, reject) =>
    execFile(
      "git",
      [...config, ...args],
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_LFS_SKIP_SMUDGE: "1",
        },
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const message = maskCredentials(
          (stderr || error.message).trim().split("\n").slice(-4).join(" "),
        );
        const refused = Error(`git ${args[0]} failed: ${message}`);
        refused.status = 409;
        reject(refused);
      },
    ),
  );
}

// `ref` to one full commit. A full commit is taken as given; a name must
// match exactly one branch or tag (an annotated tag counts by its commit).
export async function resolveGitRef(remote, ref, { scratch }) {
  if (COMMIT.test(ref)) return ref;
  const hooks = hooksOff(scratch);
  const listing = await git(["ls-remote", "--", remote], { hooks });
  const refs = new Map();
  for (const line of listing.split("\n")) {
    const [sha, name] = line.split("\t");
    if (sha && name) refs.set(name, sha);
  }
  const names = ref.startsWith("refs/")
    ? [ref]
    : ref === "HEAD"
      ? ["HEAD"]
      : [`refs/heads/${ref}`, `refs/tags/${ref}`];
  const found = names
    .filter((name) => refs.has(name))
    .map((name) => refs.get(`${name}^{}`) ?? refs.get(name));
  if (!found.length)
    fail(`No branch or tag named ${ref} in ${maskCredentials(remote)}.`, 409);
  if (new Set(found).size > 1)
    fail(
      `${ref} names both a branch and a tag with different commits. Give refs/heads/${ref}, refs/tags/${ref} or the commit.`,
      409,
    );
  return found[0];
}

const exists = (file) => {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
};

// Avoozl runs no install, so a plugin must ship what its package.json needs.
function checkReadyToRun(folder) {
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(folder, "package.json"), "utf8"),
    );
  } catch {
    return;
  }
  const missing = Object.keys({
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.optionalDependencies ?? {}),
  }).filter((name) => !exists(path.join(folder, "node_modules", name)));
  if (missing.length)
    fail(
      `The plugin lists dependencies it does not ship (${missing.slice(0, 5).join(", ")}). Avoozl runs no npm install: ship the plugin ready to run, bundled or with node_modules committed.`,
      409,
    );
}

// Fetch exactly `commit` into `<root>/<commit>/` and return the plugin
// folder (`subdir` inside it). An existing folder for the same commit is
// reused; the content hash still decides whether it is approved.
export async function fetchGitCommit({ remote, ref, commit, subdir, root }) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, commit);
  if (!exists(target)) {
    const temporary = path.join(
      root,
      `.fetch-${process.pid}-${randomBytes(4).toString("hex")}`,
    );
    const hooks = hooksOff(root);
    try {
      await git(["init", "-q", "--template=", temporary], { hooks });
      const fetch = (what) =>
        git(
          [
            "fetch",
            "-q",
            "--depth",
            "1",
            "--no-tags",
            "--no-recurse-submodules",
            "--",
            remote,
            what,
          ],
          { cwd: temporary, hooks },
        );
      try {
        await fetch(commit);
      } catch (error) {
        // Some servers refuse a want by commit; fetch the ref and check it.
        if (COMMIT.test(ref)) throw error;
        await fetch(ref);
      }
      const fetched = (
        await git(["rev-parse", "FETCH_HEAD^{commit}"], {
          cwd: temporary,
          hooks,
        })
      ).trim();
      if (fetched !== commit)
        fail(
          `${ref} moved while fetching (now ${fetched.slice(0, 12)}). Choose Update again.`,
          409,
        );
      await git(["checkout", "-q", "--detach", commit], {
        cwd: temporary,
        hooks,
      });
      fs.rmSync(path.join(temporary, ".git"), { recursive: true, force: true });
      fs.renameSync(temporary, target);
    } catch (error) {
      fs.rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }
  const folder = subdir ? path.join(target, subdir) : target;
  let real;
  try {
    real = fs.realpathSync(folder);
  } catch {
    fail(`Commit ${commit.slice(0, 12)} has no folder ${subdir}.`, 409);
  }
  const top = fs.realpathSync(target);
  if (real !== top && !real.startsWith(top + path.sep))
    fail(`subdir ${subdir} leaves the repository.`, 409);
  if (!fs.statSync(real).isDirectory())
    fail(`subdir ${subdir} is not a folder.`, 409);
  if (!exists(path.join(folder, "avoozl-plugin.json")))
    fail(
      `Commit ${commit.slice(0, 12)} has no avoozl-plugin.json${subdir ? ` in ${subdir}` : ""}.`,
      409,
    );
  checkReadyToRun(folder);
  return folder;
}
