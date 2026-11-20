import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { fail } from "../store/store.mjs";
import { expandHome } from "../workspace/folder-browse.mjs";
import {
  checksSetting,
  repositoryChecks,
} from "../workspace/repository-checks.mjs";
import { requireDiskSpace } from "../workspace/disk-space.mjs";
import {
  checkOptions,
  containerBlindness,
  isolationSetting,
  prepareChecks,
} from "../workspace/check-isolation.mjs";
import { CLI_FILE, shellQuote } from "../workers/report-command.mjs";
import { currentJob } from "../github/github-jobs.mjs";
import { taskGit } from "./task-git.mjs";
export { taskGit } from "./task-git.mjs";
const exec = promisify(execFile);
function liveLocks(store, repositoryId) {
  const rows = store.db
    .prepare("SELECT * FROM work_locks WHERE repository_id=?")
    .all(repositoryId);
  return rows.filter((row) => {
    try {
      process.kill(row.pid, 0);
      return true;
    } catch (error) {
      if (error.code !== "ESRCH") return true;
      store.db
        .prepare("DELETE FROM work_locks WHERE id=? AND token=?")
        .run(row.id, row.token);
      return false;
    }
  });
}
export async function withWorkLock(store, { id, repositoryId, kind }, fn) {
  const token = crypto.randomUUID();
  store.transaction(() => {
    if (
      liveLocks(store, repositoryId).some(
        (row) =>
          row.id === id || row.kind === "integration" || kind === "integration",
      )
    ) {
      // Contention is transient: the work is valid, the lock is simply held.
      // Callers that run unattended may retry instead of reporting failure.
      const error = Error(
        "Validation or integration already owns this work. Retry after it finishes.",
      );
      error.status = 409;
      error.contention = true;
      throw error;
    }
    store.db
      .prepare("INSERT INTO work_locks VALUES (?,?,?,?,?)")
      .run(id, repositoryId, kind, process.pid, token);
  });
  try {
    return await fn();
  } finally {
    store.db
      .prepare("DELETE FROM work_locks WHERE id=? AND token=?")
      .run(id, token);
  }
}
export async function git(cwd, args, { env } = {}) {
  return (
    await exec("git", args, {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      ...(env ? { env } : {}),
    })
  ).stdout.trim();
}

// The git host Avoozl's GitHub is on: AVOOZL_GIT_URL, or github.com for the
// public API. Another API host with no git host named has none.
export function githubGitUrl(env = process.env) {
  const api = env.GITHUB_API_URL || "https://api.github.com";
  return (
    env.AVOOZL_GIT_URL ||
    (/^https:\/\/api\.github\.com\/?$/.test(api) ? "https://github.com" : "")
  ).replace(/\/$/, "");
}

// The host of a git remote: a URL or the scp form `git@host:path`.
function remoteHost(remote) {
  const scp = /^[^/@:]+@([^/:]+):/.exec(remote);
  if (scp) return scp[1].toLowerCase();
  try {
    return new URL(remote).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// The `owner/name` a GitHub remote names: the last two path parts.
function repositoryOfRemote(remote) {
  const scp = /^[^/@:]+@[^/:]+:(.+)$/.exec(remote);
  let pathname = scp ? scp[1] : null;
  if (!pathname)
    try {
      pathname = new URL(remote).pathname;
    } catch {
      return null;
    }
  const parts = pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : null;
}

// The remote a network command names: its first argument after the
// subcommand that is not an option, as a URL.
function remoteOf(cwd, args, env) {
  const named = args.slice(1).find((arg) => !arg.startsWith("-"));
  if (!named) return null;
  if (/[:/]/.test(named)) return named;
  try {
    return execFileSync("git", ["remote", "get-url", named], {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// The command git runs as its credential helper: this Avoozl's CLI, quoted
// for the POSIX shell git uses on every platform.
const helperCommand = () =>
  `${shellQuote(process.execPath, "linux")} ${shellQuote(CLI_FILE, "linux")} credential`;

// The arguments and environment of one network git command (§D9). For a
// remote on Avoozl's GitHub host, for this command only: every configured
// credential helper is cleared and `avoozl credential` answers, from the
// same provider and job table as the API, for that one repository; the
// host's SSH forms are rewritten to its https form. The token reaches git
// only through the helper's stdout: never its environment, arguments or
// config. Any other remote keeps the person's own git sign-in. `job` is
// the current job unless named.
export function remoteGitSetup(
  cwd,
  args,
  { repository = null, job = currentJob() || "check-in", env, remote } = {},
) {
  const base = env ?? process.env,
    gitUrl = githubGitUrl(process.env),
    plain = { args, env };
  if (!gitUrl) return plain;
  const host = new URL(gitUrl).hostname.toLowerCase(),
    target = remote ?? remoteOf(cwd, args, base);
  if (!target || remoteHost(target) !== host) return plain;
  repository ??= repositoryOfRemote(target);
  if (!repository) return plain;
  // Avoozl's own git, run by this process, is not an agent's: the helper's
  // agent-session check (PC6.7) is for a helper an agent runs itself. A
  // supervisor child keeps AVOOZL_CHILD, so the helper refuses it.
  const { KIROCREW_SPAWNED, KIRO_SESSION_ID, ...own } = base;
  return {
    args: [
      "-c",
      "credential.helper=",
      "-c",
      `credential.helper=!${helperCommand()}`,
      "-c",
      "credential.useHttpPath=true",
      "-c",
      `url.${gitUrl}/.insteadOf=git@${host}:`,
      "-c",
      `url.${gitUrl}/.insteadOf=ssh://git@${host}/`,
      ...args,
    ],
    env: {
      ...own,
      AVOOZL_CREDENTIAL_JOB: job,
      AVOOZL_CREDENTIAL_REPOSITORY: repository,
      AVOOZL_CREDENTIAL_WORKSPACE: cwd,
      GIT_TERMINAL_PROMPT: "0",
    },
  };
}

// The one way Avoozl runs a network git command (push, fetch, ls-remote,
// clone). A test fails on any other in src/app.
export function remoteGit(cwd, args, options = {}) {
  const setup = remoteGitSetup(cwd, args, options);
  return git(cwd, setup.args, { env: setup.env });
}

// The job of a landing push (PC4.7): one that changes a workflow file needs
// `workflows: write`.
export async function landingJob(cwd, from, to) {
  const files = await git(cwd, ["diff", "--name-only", `${from}..${to}`]).catch(
    () => "",
  );
  return files.split("\n").some((file) => file.startsWith(".github/workflows/"))
    ? "land-workflows"
    : "land";
}
// Avoozl's own files in a task worktree, such as a child's
// `.avoozl/result.json` (§4.28), never reach a worker's commit, whatever the
// repository's .gitignore says: Avoozl stages without them, and landing
// refuses a worker commit that holds one.
const AVOOZL_FILES = ":(glob)**/.avoozl/**";
const EXCLUDE_AVOOZL = ":(exclude,glob)**/.avoozl/**";
const isAvoozlPath = (file) =>
  /(^|\/)\.avoozl(\/|$)/.test(file.replaceAll("\\", "/"));
// Changes in the task folder, Avoozl's own files left out. Every git call
// on a task folder goes through taskGit (task-git.mjs), with the
// repository's `checkout`.
export const worktreeChanges = (worktree, checkout) =>
  taskGit(worktree, ["status", "--porcelain", "--", ".", EXCLUDE_AVOOZL], {
    checkout,
  });
// Stage and commit a worker's changes without Avoozl's files; the commit, or
// null when nothing changed. A symbolic link that points outside the folder
// is refused, since it would hand a host file to whoever reads the commit
// (VM5.4).
export async function commitWorkerChanges(worktree, message, { checkout }) {
  const inTask = (args) => taskGit(worktree, args, { checkout });
  await inTask(["add", "-A", "--", ".", EXCLUDE_AVOOZL]);
  // A file the worker staged itself (`git add -f`) is unstaged again.
  await inTask(["reset", "-q", "--", AVOOZL_FILES]);
  if (!(await inTask(["diff", "--cached", "--name-only"]))) return null;
  await refuseOutsideLinks(worktree, inTask);
  await inTask(["commit", "-q", "-m", message]);
  return inTask(["rev-parse", "HEAD"]);
}
// Refuse a staged symbolic link whose target leaves the folder. Only links
// the change adds or alters are read; ones already on the branch stay.
async function refuseOutsideLinks(worktree, inTask) {
  const folder = fs.realpathSync.native(worktree);
  const changed = new Set(
    (
      await inTask([
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--diff-filter=AMT",
      ])
    )
      .split("\0")
      .filter(Boolean),
  );
  for (const line of (await inTask(["ls-files", "-s", "-z"])).split("\0")) {
    const match = /^120000 ([0-9a-f]+) \d\t(.+)$/.exec(line);
    if (!match || !changed.has(match[2])) continue;
    // The link as staged, read from its blob, not from the folder.
    const text = await inTask(["cat-file", "blob", match[1]]),
      at = path.resolve(path.dirname(path.join(folder, match[2])), text);
    let target = at;
    try {
      target = fs.realpathSync.native(at);
    } catch {}
    if (target !== folder && !target.startsWith(folder + path.sep)) {
      await inTask(["reset", "-q"]);
      fail(
        `The worker's change adds ${match[2]}, a link to ${target} outside the task folder; Avoozl does not commit it.`,
        409,
      );
    }
  }
}
// Refuse when any commit in from..to adds, changes or removes a path under
// `.avoozl/`; the worker may have committed one itself.
export async function refuseAvoozlPaths(worktree, from, to, { checkout }) {
  const files = [
    ...new Set(
      (
        await taskGit(
          worktree,
          ["log", "--format=", "--name-only", "--no-renames", `${from}..${to}`],
          { checkout },
        )
      )
        .split("\n")
        .filter((file) => file && isAvoozlPath(file)),
    ),
  ];
  if (files.length)
    fail(
      `Worker commits hold Avoozl's own files (${files.slice(0, 5).join(", ")}${files.length > 5 ? ` and ${files.length - 5} more` : ""}); Avoozl never lands a path under .avoozl/. Remove them from the branch's commits, then retry.`,
      409,
    );
}
// The real path of a Git checkout root, refused in plain words when the
// folder is missing, is not a checkout, or is inside one.
export async function checkoutRoot(root, label) {
  if (typeof root !== "string" || !root) fail(`Name the ${label} folder.`);
  let real;
  try {
    real = fs.realpathSync.native(root);
  } catch {
    fail(`The ${label} folder ${root} does not exist.`);
  }
  // An empty prefix means the root; comparing --show-toplevel paths breaks
  // on Windows, where Git and Node spell the same folder differently.
  let prefix;
  try {
    prefix = await git(real, ["rev-parse", "--show-prefix"]);
  } catch {
    fail(`The ${label} folder ${real} is not a Git checkout.`);
  }
  if (prefix) fail(`The ${label} must be the Git checkout root.`);
  return real;
}
export function githubRepositoryFromRemote(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/,
    );
  return match ? `${match[1]}/${match[2]}` : null;
}
// The GitHub repository a checkout's origin names, or null. Synchronous for
// callers that resolve paths without awaiting.
export function originRepositorySync(root) {
  try {
    return githubRepositoryFromRemote(
      execFileSync("git", ["remote", "get-url", "origin"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}
export async function repositoryGitHubRemote(store, input = {}) {
  const repository = store.get("repositories", input.repositoryId);
  if (!repository) fail("Choose a registered repository.");
  const remote = input.remote || "origin";
  let remoteUrl;
  try {
    remoteUrl = await git(repository.root, ["remote", "get-url", remote]);
  } catch {
    fail(`Repository ${repository.id} has no ${remote} Git remote.`);
  }
  const github = githubRepositoryFromRemote(remoteUrl);
  if (!github)
    fail(
      `Repository ${repository.id}'s ${remote} remote is not a GitHub repository.`,
    );
  return {
    repositoryId: repository.id,
    repositoryRoot: repository.root,
    remote,
    remoteUrl,
    repository: github,
  };
}
async function remoteRepository(root, remote = "origin") {
  try {
    return githubRepositoryFromRemote(
      await git(root, ["remote", "get-url", remote]),
    );
  } catch {
    return null;
  }
}
async function effectiveGitIdentity(root) {
  try {
    const [name, email] = await Promise.all([
      git(root, ["config", "--get", "user.name"]),
      git(root, ["config", "--get", "user.email"]),
    ]);
    return name && email ? { name, email } : null;
  } catch {
    return null;
  }
}
async function configureWorktreeIdentity(root, worktree) {
  const identity = await effectiveGitIdentity(root);
  if (!identity) return;
  // OpenHands may isolate its process-level Git configuration. Preserve the
  // repository's effective identity in this run only instead of copying it
  // into Avoozl state or changing the user's other checkouts.
  await git(root, ["config", "extensions.worktreeConfig", "true"]);
  for (const [key, value] of [
    ["user.name", identity.name],
    ["user.email", identity.email],
  ])
    await taskGit(worktree, ["config", "--worktree", key, value], {
      checkout: root,
    });
}
// How a repository lands verified work (R87.1). Unset keeps the local
// fast-forward. shortcut: R87.1's default `off` until setup writes another
// is not applied, so existing workspaces keep landing; upgrade with 42.7.
export const LANDINGS = Object.freeze(["direct", "pr", "off"]);
export async function repositoryConfig({
  id,
  root,
  baseBranch = "main",
  integrationBranch,
  worktreeRoot,
  checks = [],
  checksEnv,
  worktreeHelper,
  landing,
  isolation,
}) {
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(id || ""))
    fail("Choose a stable repository ID.");
  if (landing !== undefined && !LANDINGS.includes(landing))
    fail("landing must be direct, pr or off.");
  root = await checkoutRoot(root, "repository root");
  // A leading dash would reach git as an option.
  if (typeof baseBranch !== "string" || baseBranch.startsWith("-"))
    fail("Name a valid base branch.");
  try {
    await git(root, ["rev-parse", "--verify", baseBranch + "^{commit}"]);
  } catch {
    fail(
      `Branch ${baseBranch} has no commit in ${root}. Pass --branch BRANCH.`,
    );
  }
  // The repository's named checks; the older list of argv arrays loads too.
  checks = checksSetting(checks, "checks");
  // The isolation its checks run under; a person sets it here.
  isolation = isolationSetting(isolation, "isolation");
  // An opt-in allowlist of environment variable names for check processes
  // (R83.5) and the hash of the scripts/worktree helper a person approved
  // (R83.4).
  if (
    checksEnv !== undefined &&
    (!Array.isArray(checksEnv) ||
      checksEnv.some((n) => typeof n !== "string" || !ENV_NAME.test(n)))
  )
    fail("checksEnv must be a list of environment variable names.");
  if (
    worktreeHelper !== undefined &&
    !(
      typeof worktreeHelper === "string" &&
      /^[0-9a-f]{64}$/.test(worktreeHelper)
    )
  )
    fail("worktreeHelper must be the helper's SHA-256 hash.");
  worktreeRoot = path.resolve(
    worktreeRoot || path.join(path.dirname(root), ".avoozl-worktrees"),
  );
  if (worktreeRoot === root || worktreeRoot.startsWith(root + path.sep))
    fail("Place worktrees outside the repository checkout.");
  if (integrationBranch !== undefined) {
    if (
      typeof integrationBranch !== "string" ||
      integrationBranch === baseBranch
    )
      fail("Name an integration branch other than the base branch.");
    try {
      await git(root, ["check-ref-format", "--branch", integrationBranch]);
    } catch {
      fail("Name a valid integration branch.");
    }
  }
  return {
    id,
    root,
    baseBranch,
    ...(integrationBranch === undefined ? {} : { integrationBranch }),
    worktreeRoot,
    checks,
    ...(checksEnv === undefined ? {} : { checksEnv: [...checksEnv] }),
    ...(worktreeHelper === undefined ? {} : { worktreeHelper }),
    ...(landing === undefined ? {} : { landing }),
    ...(isolation === undefined ? {} : { isolation }),
    github: await remoteRepository(root),
    createdAt: new Date().toISOString(),
  };
}
// `git worktree add` writes refs and administrative files in repository.root, the
// same checkout integration fast-forwards. Hold a lock that excludes
// integration, and that integration excludes, for the duration of the add.
// Worktree adds for different runs still proceed concurrently.
// A task passes `branch`, `worktree` and `start` to cut its own branch; a
// task that already has the branch passes `existing` and gets a plain add.
export async function createWorktree(store, repository, runId, task = {}) {
  return withWorkLock(
    store,
    { id: "worktree:" + runId, repositoryId: repository.id, kind: "worktree" },
    async () => {
      const branch = task.branch || "plans/" + runId,
        worktree = task.worktree || path.join(repository.worktreeRoot, runId);
      fs.mkdirSync(path.dirname(worktree), { recursive: true });
      if (fs.existsSync(worktree)) fail("Run worktree already exists.", 409);
      // Room first: a full volume holds the work instead of a half-made add.
      requireDiskSpace(store, path.dirname(worktree), `The worktree ${runId}`);
      const helper = path.join(repository.root, "scripts/worktree");
      if (task.existing)
        await git(repository.root, ["worktree", "add", worktree, branch]);
      else if (fs.existsSync(helper)) {
        // Repository-owned code that runs on every worktree add: a person
        // approves this exact content first (R83.4).
        const seen = helperHash(helper);
        if (repository.worktreeHelper !== seen)
          fail(
            `${helper} runs every time a worktree is added. Read it, then approve ` +
              `this exact version by setting worktreeHelper to ${seen} for repository ` +
              `${repository.id}` +
              (repository.worktreeHelper
                ? " (the approved version differs)."
                : "."),
            409,
          );
        await exec(
          helper,
          [branch, worktree, task.start || repository.baseBranch],
          {
            cwd: repository.root,
            env: repositoryEnvironment(),
            maxBuffer: 8 * 1024 * 1024,
          },
        );
      } else
        await git(repository.root, [
          "worktree",
          "add",
          "-b",
          branch,
          worktree,
          task.start || repository.baseBranch,
        ]);
      await configureWorktreeIdentity(repository.root, worktree);
      return {
        branch,
        worktree,
        baseCommit: await taskGit(worktree, ["rev-parse", "HEAD"], {
          checkout: repository.root,
        }),
      };
    },
  );
}
// The worktrees git knows for `root`: path -> branch ref (or null if detached).
async function listWorktrees(root) {
  const entries = new Map();
  let current = null;
  for (const line of (
    await git(root, ["worktree", "list", "--porcelain"])
  ).split("\n")) {
    if (line.startsWith("worktree ")) {
      // Real path, so git's C:/ form matches node's (8.3 names, slashes).
      current = path.resolve(line.slice(9));
      try {
        current = fs.realpathSync.native(current);
      } catch {}
      entries.set(current, null);
    } else if (line.startsWith("branch ") && current)
      entries.set(current, line.slice(7));
  }
  return entries;
}

// One task's worktree on its own branch. A retry finds the same worktree, or
// re-adds it on the existing branch so earlier commits are kept. Nothing is
// ever removed or reset here.
export async function prepareTaskWorktree(
  store,
  repository,
  { branch, name, start: chosen = null },
) {
  return withWorkLock(
    store,
    { id: "prepare:" + name, repositoryId: repository.id, kind: "worktree" },
    async () => {
      const base = path.resolve(
        repository.worktreeRoot ||
          path.join(path.dirname(repository.root), ".avoozl-worktrees"),
      );
      fs.mkdirSync(base, { recursive: true });
      // git prints real paths, so a linked temporary directory must compare equal.
      const worktree = path.join(fs.realpathSync.native(base), name),
        ref = "refs/heads/" + branch;
      const listed = await listWorktrees(repository.root),
        holder = [...listed].find(([, value]) => value === ref)?.[0];
      let created = false,
        started = null;
      if (listed.has(worktree)) {
        if (listed.get(worktree) !== ref)
          fail(`Worktree ${worktree} is not on branch ${branch}.`, 409);
        if (!fs.existsSync(worktree))
          fail(
            `Worktree ${worktree} is registered but missing. Run git worktree prune in ${repository.root}.`,
            409,
          );
      } else if (holder)
        fail(`Branch ${branch} is checked out at ${holder}.`, 409);
      else if (fs.existsSync(worktree))
        fail(`${worktree} exists and is not this task's worktree.`, 409);
      else {
        let exists = true;
        try {
          await git(repository.root, ["rev-parse", "--verify", "--quiet", ref]);
        } catch {
          exists = false;
        }
        // A dependent starts from the work already integrated: the spec base
        // the caller resolved (spec-base.mjs), else the integration branch
        // when the repository has one and it exists, else the base branch.
        let start = chosen || repository.baseBranch || "main";
        if (!chosen && repository.integrationBranch)
          try {
            await git(repository.root, [
              "rev-parse",
              "--verify",
              "--quiet",
              "refs/heads/" + repository.integrationBranch,
            ]);
            start = repository.integrationBranch;
          } catch {
            // Not created yet: the first integration creates it from the base.
          }
        const made = await createWorktree(store, repository, "task-" + name, {
          branch,
          worktree,
          start,
          existing: exists,
        });
        created = true;
        // The exact commit a new branch started from.
        if (!exists) started = { branch: start, commit: made.baseCommit };
      }
      return {
        branch,
        worktree,
        created,
        ...(started ? { started } : {}),
        head: await taskGit(worktree, ["rev-parse", "HEAD"], {
          checkout: repository.root,
        }),
      };
    },
  );
}

// The environment for repository code Avoozl runs (declared checks, a
// scripts/worktree helper). That code can be a worker's, so it never gets the
// Kiro Crew gateway credentials the backend holds: with the proxy secret it
// could sign requests as the owner.
const GATEWAY_SECRETS = [
  "KIROCREW_PROXY_SECRET",
  "KIROCREW_GATEWAY_ORIGIN_PROOF",
];
export function repositoryEnvironment(env = process.env, allow) {
  const out = { ...env };
  for (const name of GATEWAY_SECRETS) delete out[name];
  if (!allow) return out;
  // Opt-in allowlist (R83.5): only what a process needs to start, plus the
  // names a person listed. The gateway secrets stay out even when listed.
  // Windows names compare without case.
  const same = (a, b) =>
    process.platform === "win32"
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
  const wanted = [...BASE_ENV, ...allow],
    kept = {};
  for (const key of Object.keys(out))
    if (
      wanted.some((name) => same(name, key)) &&
      !GATEWAY_SECRETS.some((name) => same(name, key))
    )
      kept[key] = out[key];
  return kept;
}
// Push and GitHub credentials an agent process must never hold: tokens,
// askpass helpers, the SSH agent and git config injected by environment.
const PUSH_CREDENTIALS = [
  /^GH_TOKEN$/i,
  /^GITHUB_TOKEN$/i,
  /^GH_ENTERPRISE_TOKEN$/i,
  /^GITHUB_ENTERPRISE_TOKEN$/i,
  /^AVOOZL_GITHUB_TOKEN$/i,
  /^GIT_ASKPASS$/i,
  /^SSH_ASKPASS$/i,
  /^SSH_AUTH_SOCK$/i,
  /^GIT_SSH$/i,
  /^GIT_SSH_COMMAND$/i,
  /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/i,
  /^GIT_CREDENTIAL/i,
  // The git credential helper's job, repository and workspace (§D9).
  /^AVOOZL_CREDENTIAL_/i,
];
export function withoutPushCredentials(env = process.env) {
  const out = {};
  for (const [name, value] of Object.entries(env))
    if (!PUSH_CREDENTIALS.some((pattern) => pattern.test(name)))
      out[name] = value;
  out.GIT_TERMINAL_PROMPT = "0";
  return out;
}
const BASE_ENV = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "ComSpec",
  "PATHEXT",
];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The environment a repository check runs with: only what a process needs
// to start (BASE_ENV) and the names the repository lists in `checksEnv`,
// whether or not it lists any. The gateway secrets and the push and GitHub
// credentials never reach a check, even when listed.
export function checkEnvironment(env = process.env, allow = []) {
  const kept = repositoryEnvironment(env, allow);
  for (const name of Object.keys(kept))
    if (PUSH_CREDENTIALS.some((pattern) => pattern.test(name)))
      delete kept[name];
  return kept;
}
export const helperHash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// `isolate(argv, env)` (check-isolation.mjs) wraps a repository check in its
// repository's isolation: {argv, env, isolation, cleanup?}, or {refused}.
// The record names the isolation it ran under.
export async function commandEvidence(
  cwd,
  argv,
  { timeoutMs = 120000, onStart, env: allow, isolate } = {},
) {
  if (
    !Array.isArray(argv) ||
    !argv.length ||
    argv.some((x) => typeof x !== "string")
  )
    fail("Use a command argument array.");
  const startedAt = new Date().toISOString(),
    environment = checkEnvironment(process.env, allow),
    wrapped = isolate ? isolate(argv, environment) : null;
  if (wrapped?.refused)
    return {
      argv,
      startedAt,
      endedAt: startedAt,
      exitCode: null,
      stdout: "",
      stderr: wrapped.refused,
      isolation: null,
    };
  const run = wrapped?.argv ?? argv,
    shown = wrapped
      ? {
          isolation: wrapped.isolation,
          ...(wrapped.runtime ? { runtime: wrapped.runtime } : {}),
          ...(wrapped.note ? { isolationNote: wrapped.note } : {}),
        }
      : {};
  onStart?.();
  try {
    const { stdout, stderr } = await exec(run[0], run.slice(1), {
      cwd,
      env: wrapped?.env ?? environment,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      argv,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: 0,
      stdout,
      stderr,
      ...shown,
    };
  } catch (error) {
    // A sandbox that could not start the command says so on its first line
    // and exits; that is a check that did not start, not one that failed.
    const unstarted =
      wrapped &&
      /^(?:sandbox-exec: execvp\(\)|bwrap: execvp)/.test(
        String(error.stderr || ""),
      );
    return {
      argv,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: Number.isInteger(error.code) && !unstarted ? error.code : null,
      signal: error.signal || null,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
      ...shown,
    };
  } finally {
    wrapped?.cleanup?.();
  }
}
// `source` is the integration entry of a Kiro Crew delivery (delivery.mjs).
export async function validateUnlocked(
  store,
  runId,
  { phase = "validation", source } = {},
) {
  const run = source;
  if (!run?.worktree) fail("Run has no worktree.");
  // A stranger's task runs its checks under the stranger rule (VM6.4).
  // Read here, not imported at the top: stranger-input.mjs reads git.mjs.
  const { withStrangerChecks } = await import("../intake/stranger-input.mjs");
  const repository = withStrangerChecks(
    store,
    store.get("repositories", run.repositoryId),
    store.read().tasks.find((task) => task.id === run.taskId),
  );
  if (!repository) fail("Repository configuration is missing.");
  const inRun = (args) =>
    taskGit(run.worktree, args, { checkout: repository.root });
  const head = await inRun(["rev-parse", "HEAD"]),
    dirty = await worktreeChanges(run.worktree, repository.root);
  if (dirty)
    fail(
      "Commit the worktree changes before recording acceptance checks.",
      409,
    );
  const checks = repositoryChecks(repository);
  if (!checks.length)
    fail("Configure the repository's checks before validation.");
  const results = [];
  const ready = await prepareChecks(repository, run.worktree);
  if (ready && ready.exitCode !== 0)
    fail(
      `The repository's prepare step failed: ${String(ready.stderr || "")
        .split("\n")[0]
        .slice(0, 200)}`,
    );
  const blind = await containerBlindness(repository, run.worktree);
  if (blind) fail(blind, 409);
  for (const { name, argv } of checks) {
    store.event(runId, "validation.started", { argv, name, phase });
    const record = await commandEvidence(
      run.worktree,
      argv,
      checkOptions(repository, run.worktree),
    );
    // Each record names the commit and the phase it ran in, so the checks that
    // ran on the rebased base are distinguishable from the earlier ones rather
    // than reading as duplicates of the same work.
    const evidence = {
      ...record,
      name,
      id: crypto.randomUUID(),
      taskId: run.taskId,
      runId,
      kind: "command",
      phase,
      commit: head,
    };
    store.put("evidence", evidence);
    store.event(runId, "validation.result", { evidence });
    results.push(evidence);
    if (record.exitCode !== 0) break;
  }
  const unchanged =
    head === (await inRun(["rev-parse", "HEAD"])) &&
    !(await worktreeChanges(run.worktree, repository.root));
  const passed =
    unchanged &&
    results.length === checks.length &&
    results.every((r) => r.exitCode === 0);
  store.mutate("Record validation for " + run.taskId, (data) => {
    const task = data.tasks.find((t) => t.id === run.taskId);
    if (task) {
      task.evidence = [
        ...new Set([
          ...(task.evidence || []),
          ...results.map((r) => "workspace:evidence/" + r.id),
        ]),
      ];
      if (passed) {
        task.status = "implemented";
        task.needsReview = false;
      }
      task.updatedAt = new Date().toISOString();
    }
  });
  if (passed) {
    const entry = {
      id: runId,
      runId,
      taskId: run.taskId,
      repositoryId: repository.id,
      branch: run.branch,
      worktree: run.worktree,
      commit: head,
      baseCommit: run.baseCommit,
      state: "ready",
      evidenceIds: results.map((r) => r.id),
      createdAt: new Date().toISOString(),
    };
    store.put("integration", entry);
    store.event(runId, "integration.ready", { entry });
  }
  return { passed, unchanged, commit: head, results };
}
// Refuse when the worktree holding the integration branch has changes a
// fast-forward could touch: any staged or unstaged change, or an untracked
// file at a path the incoming commits write. The message names the worktree
// and the files, and becomes the delivery's decision (delivery.mjs).
async function refuseBusyHolder(holder, target, { from, to } = {}) {
  const names = async (args) =>
      (await git(holder, args)).split("\n").filter(Boolean),
    changed = [
      ...new Set([
        ...(await names(["diff", "--name-only"])),
        ...(await names(["diff", "--cached", "--name-only"])),
      ]),
    ],
    written = to
      ? new Set(await names(["diff", "--name-only", from, to]))
      : null,
    untracked = (
      await names(["ls-files", "--others", "--exclude-standard"])
    ).filter((file) => !written || written.has(file)),
    shown = (files) =>
      files.slice(0, 5).join(", ") +
      (files.length > 5 ? ` and ${files.length - 5} more` : "");
  if (changed.length)
    fail(
      `Integration branch ${target} is checked out at ${holder}, which has uncommitted changes (${shown(changed)}); integration is left queued. Commit or clear them there, then retry.`,
      409,
    );
  if (written && untracked.length)
    fail(
      `Integration branch ${target} is checked out at ${holder}, which has untracked files the fast-forward would overwrite (${shown(untracked)}); integration is left queued. Move them there, then retry.`,
      409,
    );
}
export async function integrateRun(store, { id, expectedCommit }) {
  const entry = store.get("integration", id);
  if (!entry) fail("Integration not found.", 404);
  return withWorkLock(
    store,
    {
      id: "integration:" + entry.repositoryId,
      repositoryId: entry.repositoryId,
      kind: "integration",
    },
    () => integrateUnlocked(store, { id, expectedCommit }),
  );
}
async function integrateUnlocked(store, { id, expectedCommit }) {
  const entry = store.get("integration", id);
  if (!entry || entry.state !== "ready") fail("Integration is not ready.", 409);
  const repository = store.get("repositories", entry.repositoryId);
  if (entry.commit !== expectedCommit)
    fail("Review the current integration head.", 409);
  // An integration branch keeps the user's checkout untouched: the work lands
  // by moving that branch's ref. When a worktree has the branch checked out,
  // the work lands there with merge --ff-only, and only while that worktree
  // has nothing the fast-forward could touch; it is never stashed or reset.
  const target = repository.integrationBranch || repository.baseBranch,
    separate = Boolean(repository.integrationBranch);
  let holder = null;
  if (separate) {
    const ref = "refs/heads/" + target;
    holder =
      [...(await listWorktrees(repository.root))].find(
        ([, branch]) => branch === ref,
      )?.[0] || null;
    if (holder) await refuseBusyHolder(holder, target);
    try {
      await git(repository.root, ["rev-parse", "--verify", "--quiet", ref]);
    } catch {
      await git(repository.root, ["branch", target, repository.baseBranch]);
    }
  } else {
    if (
      (await git(repository.root, ["branch", "--show-current"])) !==
      repository.baseBranch
    )
      fail(
        "The originating checkout is not on its configured base branch.",
        409,
      );
    // Untracked files do not block: Kiro Crew writes `.kiro/settings` into a
    // session's project directory, and `merge --ff-only` still refuses to
    // overwrite an untracked file.
    if (
      await git(repository.root, [
        "status",
        "--porcelain",
        "--untracked-files=no",
      ])
    )
      fail(
        "The originating checkout has changes; integration is left queued.",
        409,
      );
  }
  const inEntry = (args) =>
    taskGit(entry.worktree, args, { checkout: repository.root });
  if (await worktreeChanges(entry.worktree, repository.root))
    fail("Run worktree has uncommitted changes.", 409);
  if ((await inEntry(["rev-parse", "HEAD"])) !== expectedCommit)
    fail("Run branch changed after validation.", 409);
  store.event(id, "integration.started", { commit: entry.commit });
  // Other runs on this repository may be working while this merge proceeds. What
  // makes that safe is here: the work is rebased onto the branch it is about to
  // land on and revalidated at that exact base, and a failure refuses the
  // merge. `entry.state === "ready"` records an older validation against an
  // older base; never skip this step by trusting it.
  const before = await git(repository.root, ["rev-parse", target]);
  // Work already merged forward onto the target (R77.5) keeps its merge;
  // anything else is rebased here as before.
  const forward = await inEntry([
    "merge-base",
    "--is-ancestor",
    target,
    "HEAD",
  ]).then(
    () => true,
    () => false,
  );
  if (!forward) await inEntry(["rebase", target]);
  await refuseAvoozlPaths(entry.worktree, target, "HEAD", {
    checkout: repository.root,
  });
  const revalidated = await validateUnlocked(store, id, {
    phase: "integration",
    source: { ...entry, state: "integrating" },
  });
  if (!revalidated.passed)
    fail("Rebased work did not pass acceptance checks.", 409);
  const head = await inEntry(["rev-parse", "HEAD"]);
  if (holder) {
    // Checks ran meanwhile: look again, then fast-forward only from the
    // value read before the rebase.
    if ((await git(holder, ["rev-parse", "HEAD"])) !== before)
      fail(
        `Integration branch ${target} moved in ${holder} during integration; integration is left queued.`,
        409,
      );
    await refuseBusyHolder(holder, target, { from: before, to: head });
    await git(holder, ["merge", "--ff-only", head]);
  } else if (separate)
    // Fast-forward only, and only from the value read before the rebase.
    await git(repository.root, [
      "update-ref",
      "refs/heads/" + target,
      head,
      before,
    ]);
  else await git(repository.root, ["merge", "--ff-only", entry.branch]);
  entry.state = "integrated";
  entry.integratedCommit = head;
  entry.into = target;
  entry.integratedAt = new Date().toISOString();
  entry.revalidatedEvidenceIds = revalidated.results.map((r) => r.id);
  store.put("integration", entry);
  store.mutate("Integrate " + entry.taskId, (data) => {
    const task = data.tasks.find((t) => t.id === entry.taskId);
    if (task)
      task.integration = {
        commit: head,
        branch: entry.branch,
        into: target,
        at: entry.integratedAt,
      };
  });
  store.event(id, "integration.completed", { entry });
  store.event(null, "repository.base.moved", {
    repositoryId: repository.id,
    baseBranch: target,
    commit: head,
  });
  // Remove only the exact worktree created for this run, after its branch landed.
  if (
    path.dirname(entry.worktree) === repository.worktreeRoot &&
    path.basename(entry.worktree) === id
  ) {
    // Avoozl's own files (a child's result file) go with the worktree.
    await inEntry(["clean", "-fdq", "--", AVOOZL_FILES]);
    await git(repository.root, ["worktree", "remove", entry.worktree]);
  } else await removeLandedTaskWorktree(store, repository, entry, target, head);
  return entry;
}

// A task's own worktree and local branch go once its head has landed (R88.6).
// The work is already on the target, so a failure here only leaves them kept.
export async function removeLandedTaskWorktree(
  store,
  repository,
  entry,
  target,
  head,
) {
  const records = store
    .list("task_worktrees")
    .filter((r) => r.path === entry.worktree && r.repository === repository.id);
  if (!records.length) return;
  try {
    await taskGit(entry.worktree, ["clean", "-fdq", "--", AVOOZL_FILES], {
      checkout: repository.root,
    });
    await git(repository.root, ["worktree", "remove", entry.worktree]);
    store.transaction(() => {
      for (const r of records) store.remove("task_worktrees", r.id);
    });
    // The head is on the target, so the branch has nothing the target lacks.
    await git(repository.root, ["merge-base", "--is-ancestor", head, target]);
    await git(repository.root, ["branch", "-D", entry.branch]);
  } catch {}
}

// What adding a checkout would register, read from the folder alone (read
// only): its root, the branch tasks land on (origin's default, else the
// current branch), its GitHub remote, and a suggested ID. A leading `~` is
// the home folder, as in a shell.
export async function detectCheckout(folder, home = os.homedir()) {
  const wanted = typeof folder === "string" ? expandHome(folder, home) : "";
  if (!path.isAbsolute(wanted))
    fail("Give the folder as an absolute path, or one that starts with ~/.");
  let root;
  try {
    root = fs.realpathSync.native(wanted);
  } catch {
    fail("That folder does not exist.");
  }
  let top;
  try {
    // git prints C:/ forward-slash paths on Windows; return node's form.
    top = fs.realpathSync.native(
      await git(root, ["rev-parse", "--show-toplevel"]),
    );
  } catch {
    fail("That folder is not a Git checkout.");
  }
  const quiet = (args) => git(top, args).catch(() => "");
  const originHead = (
    await quiet(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
  ).replace(/^origin\//, "");
  const current = await quiet(["branch", "--show-current"]);
  const remoteUrl = await quiet(["remote", "get-url", "origin"]);
  const github = remoteUrl ? githubRepositoryFromRemote(remoteUrl) : null;
  const id =
    path
      .basename(top)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^[^a-z]+|-+$/g, "")
      .slice(0, 61) || null;
  return {
    root: top,
    baseBranch: originHead || current || "main",
    currentBranch: current || null,
    remote: remoteUrl ? "origin" : null,
    github,
    id: id && /^[a-z][a-z0-9-]{1,60}$/.test(id) ? id : null,
  };
}
