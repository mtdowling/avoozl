// Approvals live in git (design §4.42). An approval is a commit on the spec
// repository's main branch that changes the spec's files and whose AUTHOR
// email is on the repository's approvers list (`allowedActors`). It
// approves the spec as that commit's tree holds it: Avoozl hashes the files
// there itself. The commit message carries nothing; the committer neither
// grants nor blocks an approval, so a squash merge (committer GitHub) or a
// commit made on the author's behalf counts the same as the author's own.
//
// Every commit is made with the checkout's own git identity. An agent's spec
// draft stays on a spec branch, and Approve squashes it onto main as the
// person clicking, so a draft reaches main only through an approval.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./git.mjs";
import { actorAllowed } from "../github/github-policy.mjs";
import {
  isSpecFile,
  revisionFiles,
  specHash,
  specName,
} from "../specs/spec-plans.mjs";
import { specsPath } from "../specs/specs-path.mjs";
import { fail } from "../store/store.mjs";

const lower = (value) => String(value ?? "").toLowerCase();
const specPath = (root, spec) => `${specsPath(root)}/${specName(spec)}`;

// The checkout's top folder, or null when `dir` is not in a git work tree.
export async function gitTop(dir) {
  try {
    return await git(dir, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

// Who a commit made here now is authored by: git's own resolution of
// user.name and user.email (and GIT_AUTHOR_*).
export async function gitAuthor(root) {
  const ident = await git(root, ["var", "GIT_AUTHOR_IDENT"]).catch(() => "");
  const match = /^(.*?)\s*<([^>]*)>/.exec(ident);
  if (!match || !match[2])
    fail(
      "Approving makes a git commit as you, and git has no user.email here. Run `git config user.email you@example.com`, then approve again.",
      409,
    );
  return { name: match[1], email: match[2] };
}

// GitHub's private address for a login: 123+login@users.noreply.github.com
// or login@users.noreply.github.com.
export const noreplyLogin = (email) =>
  /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec(
    String(email ?? ""),
  )?.[1] ?? null;

// Whether an author email may approve, as an async (email, commit) -> bool.
//
// - `repository` is the repository's policy entry (allowedActors,
//   minimumPermission), or null when no GitHub policy names it.
// - An email named in allowedActors approves. So does a login named there
//   when the email is that login's GitHub address, or GitHub reports the
//   commit's author as that login (one read per email).
// - A repository that names nobody falls back to its minimumPermission,
//   which needs the author's login and permission from GitHub.
// - With no policy at all (a local workspace) the one approver is this
//   checkout's own git user.email, `localEmail`.
export function approverCheck({
  repository = null,
  localEmail = null,
  github = null,
  repositoryName = null,
}) {
  const known = new Map();
  // `login`, when given, is who GitHub says the author is (the signed-in
  // person clicking Approve); otherwise the commit is read.
  return async (email, commit, login = null) => {
    const key = lower(email);
    if (!key && !login) return false;
    if (!repository) return Boolean(localEmail) && key === lower(localEmail);
    const actors = (repository.allowedActors || []).map(lower);
    if (key && actors.includes(key)) return true;
    const quick = noreplyLogin(email) ?? login,
      cached = key || `login:${lower(quick)}`;
    if (quick && actors.includes(lower(quick)) && !repository.minimumPermission)
      return true;
    if (known.has(cached)) return known.get(cached);
    let allowed = false;
    if (github?.available?.() && repositoryName && (quick || commit))
      try {
        const login =
          quick ?? (await github.commit(repositoryName, commit))?.author?.login;
        if (login) {
          const held = repository.minimumPermission
            ? (await github.permission(repositoryName, login))?.permission
            : null;
          allowed = actorAllowed(repository, login, held).allowed;
        }
      } catch {
        allowed = false;
      }
    known.set(cached, allowed);
    return allowed;
  };
}

// The branch approvals land on and the commit it is at: origin's default
// branch, fetched, when the checkout has an origin; else local main, else
// the branch checked out. {branch, head, remote}.
export async function approvalBase(root) {
  const remote = await git(root, ["remote", "get-url", "origin"]).then(
    () => "origin",
    () => null,
  );
  let branch = null;
  if (remote) {
    branch =
      (
        await git(root, [
          "symbolic-ref",
          "-q",
          "refs/remotes/origin/HEAD",
        ]).catch(() => "")
      ).replace(/^refs\/remotes\/origin\//, "") || "main";
    await git(root, ["fetch", "--quiet", "origin", branch], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return {
      branch,
      head: await git(root, ["rev-parse", "FETCH_HEAD"]),
      remote,
    };
  }
  for (const name of ["main", null]) {
    const ref = name
      ? `refs/heads/${name}`
      : await git(root, ["symbolic-ref", "-q", "HEAD"]).catch(() => "");
    if (!ref) continue;
    const head = await git(root, ["rev-parse", "-q", "--verify", ref]).catch(
      () => "",
    );
    if (head)
      return { branch: ref.replace(/^refs\/heads\//, ""), head, remote };
  }
  // A checkout with no commit yet: the first commit is the approval.
  const unborn = await git(root, ["symbolic-ref", "-q", "HEAD"]).catch(
    () => "",
  );
  if (unborn)
    return { branch: unborn.replace(/^refs\/heads\//, ""), head: null, remote };
  fail("The spec checkout has no branch to approve on.", 409);
}

// One commit on the base branch that sets each path to its text (null
// removes it), parented on the branch head, then pushed (never forced) and
// the local branch moved. `env` sets who authors it. Returns {commit,
// branch}, or null when the tree would not change.
//
// `replace` names folders whose spec files the commit replaces: one of them
// the new files leave out is removed.
export async function commitOnMain(
  root,
  files,
  { message, env = {}, replace = [] },
) {
  files = { ...files };
  const base = await approvalBase(root),
    index = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-main-")),
      "index",
    ),
    indexEnv = { ...process.env, GIT_INDEX_FILE: index };
  try {
    await git(
      root,
      base.head ? ["read-tree", base.head] : ["read-tree", "--empty"],
      { env: indexEnv },
    );
    for (const folder of replace) {
      const listed = await git(root, ["ls-files", "-z", "--", `${folder}/`], {
        env: indexEnv,
      });
      for (const target of listed.split("\0"))
        if (
          target &&
          !(target in files) &&
          isSpecFile(target.slice(folder.length + 1))
        )
          files[target] = null;
    }
    for (const [target, text] of Object.entries(files)) {
      if (typeof text !== "string") {
        await git(root, ["update-index", "--force-remove", "--", target], {
          env: indexEnv,
        });
        continue;
      }
      const blob = await gitInput(root, ["hash-object", "-w", "--stdin"], text);
      await git(
        root,
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${target}`],
        { env: indexEnv },
      );
    }
    const tree = await git(root, ["write-tree"], { env: indexEnv });
    if (
      base.head &&
      tree === (await git(root, ["rev-parse", `${base.head}^{tree}`]))
    )
      return null;
    const commit = await gitInput(
      root,
      ["commit-tree", tree, ...(base.head ? ["-p", base.head] : []), "-F", "-"],
      `${message}\n`,
      { ...process.env, ...env },
    );
    if (base.remote)
      await git(
        root,
        ["push", "--quiet", "origin", `${commit}:refs/heads/${base.branch}`],
        { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      );
    await moveLocal(root, base.branch, commit, Object.keys(files));
    return { commit, branch: base.branch };
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

// The approval commit: each spec's files set to the reviewed revision,
// authored by the person git names here. This is the squash of a spec
// branch: drafts never reach main before it (design §4.42). Refuses when
// main already holds exactly this text, since git keeps no record of an
// empty commit under a path. Returns {commit, author, branch}.
export async function commitApproval(root, files, { message } = {}) {
  const specs = Object.keys(files),
    author = await gitAuthor(root);
  const paths = {};
  for (const spec of specs)
    for (const file of revisionFiles(files[spec]))
      if (typeof files[spec][file] === "string")
        paths[`${specPath(root, spec)}/${file}`] = files[spec][file];
  const made = await commitOnMain(root, paths, {
    replace: specs.map((spec) => specPath(root, spec)),
    message:
      message ??
      (specs.length === 1
        ? `Approve spec ${specs[0]}`
        : `Approve ${specs.length} specs`),
  });
  if (!made)
    fail(
      `${specs.join(", ")} on main already holds this text, committed by someone who is not an approver. Edit it through a spec branch, then approve.`,
      409,
    );
  return { ...made, author };
}

// The local branch follows the approval when it only moves forward. A
// checked-out branch also has the spec paths of its index reset to the new
// commit; the files in the work tree are never touched.
async function moveLocal(root, branch, commit, paths) {
  const ref = `refs/heads/${branch}`,
    old = await git(root, ["rev-parse", "-q", "--verify", ref]).catch(() => "");
  if (old) {
    const forward = await git(root, [
      "merge-base",
      "--is-ancestor",
      old,
      commit,
    ]).then(
      () => true,
      () => false,
    );
    if (!forward) return;
    await git(root, ["update-ref", ref, commit, old]);
  } else await git(root, ["update-ref", ref, commit, ""]);
  const current = await git(root, ["symbolic-ref", "-q", "HEAD"]).catch(
    () => "",
  );
  if (current === ref)
    await git(root, ["reset", "-q", "--", ...paths]).catch(() => {});
}

// `git args` with `text` on standard input; its trimmed output.
function gitInput(root, args, text, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd: root, env }, (error, stdout) =>
      error ? reject(error) : resolve(stdout.trim()),
    );
    child.stdin.end(text);
  });
}

// `git cat-file --batch` over `objects` (commit:path): path -> text, a
// missing object left out.
function catFiles(root, objects) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"], { cwd: root }),
      chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(Error(`git cat-file exited ${code}`));
      const out = Buffer.concat(chunks),
        texts = new Map();
      let at = 0;
      for (const object of objects) {
        const end = out.indexOf(10, at),
          header = out.subarray(at, end).toString();
        at = end + 1;
        if (/ missing$/.test(header)) continue;
        const size = Number(header.split(" ")[2]);
        texts.set(object, out.subarray(at, at + size).toString("utf8"));
        at += size + 1;
      }
      resolve(texts);
    });
    child.stdin.end(objects.map((o) => `${o}\n`).join(""));
  });
}

// Every approval commit on `ref`, newest first: one entry per spec a commit
// by an approver changed, with the spec's files and hash at that commit.
// `allowed(email, commit)` decides each author once per commit.
export async function approvalCommits(
  root,
  { allowed, ref = "HEAD", specs = null },
) {
  let log;
  try {
    log = await git(root, [
      "log",
      "--no-renames",
      "--format=%x1e%H%x1f%ae%x1f%an%x1f%aI",
      "--name-only",
      ref,
      "--",
      ...(specs
        ? specs.map((spec) => specPath(root, spec))
        : [specsPath(root)]),
    ]);
  } catch {
    return [];
  }
  const found = [],
    prefix = `${specsPath(root)}/`,
    // Every spec file name each spec's history touched. A file in a commit's
    // tree was added by a commit in this log, so these are all the names a
    // spec folder ever held.
    // shortcut: a file that reached the folder only through a merge commit
    // (whose --name-only lists nothing) is missed; list the tree per commit
    // if specs ever arrive that way.
    names = new Map();
  for (const block of log.split("\x1e").filter((b) => b.trim())) {
    const [head, ...files] = block.split("\n"),
      [commit, email, name, at] = head.split("\x1f"),
      touched = new Set();
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      const [spec, ...rest] = file.slice(prefix.length).split("/");
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(spec)) continue;
      if (specs && !specs.includes(spec)) continue;
      touched.add(spec);
      if (rest.length === 1 && isSpecFile(rest[0])) {
        if (!names.has(spec)) names.set(spec, new Set());
        names.get(spec).add(rest[0]);
      }
    }
    if (!touched.size || !(await allowed(email, commit))) continue;
    for (const spec of touched) found.push({ spec, commit, email, name, at });
  }
  const object = (commit, spec, file) =>
      `${commit}:${specPath(root, spec)}/${file}`,
    objects = found.flatMap(({ spec, commit }) =>
      [...(names.get(spec) ?? [])].map((file) => object(commit, spec, file)),
    ),
    texts = objects.length ? await catFiles(root, objects) : new Map();
  return found
    .map((entry) => {
      const files = {};
      for (const file of names.get(entry.spec) ?? []) {
        const text = texts.get(object(entry.commit, entry.spec, file));
        if (text !== undefined) files[file] = text;
      }
      return Object.keys(files).length
        ? { ...entry, files, hash: specHash(files) }
        : null;
    })
    .filter(Boolean);
}
