// Qualified working heads, fork checkpoints and verified integration
// (Requirement 102.6-102.8 and 102.15, design §4.32.3 and §4.32.3a, task
// 56.3).
//
// - A reference is never a branch name alone. Every working head and task
//   checkpoint names its source repository, branch and exact commit, apart
//   from the target repository and base it lands on. Two forks with the
//   same branch name are two references.
// - Sources are registered by trusted repository setup only (`sources`: the
//   repository identity and where to fetch it). A pull request or a journal
//   record may name a registered repository; neither can add a fetch URL,
//   local path or command. A fork needs no upstream copy of its branch.
// - Avoozl's driver makes every ref move and push. A task's unfinished work
//   lives on its own checkpoint ref; only a task whose exact commit passed
//   its checks enters the spec's working branch, one at a time, by a merge
//   commit and a guarded ref update. Nothing here force pushes.
// - Content checks run before every push, checkpoint or not; the acceptance
//   gate applies only to integration. Agents get no push credentials
//   (`withoutPushCredentials` in git.mjs, used by the supervisor).
// - A fetched head that moved, was rewritten or vanished holds the work. The
//   last verified commit is kept under a private local ref so the work can be
//   recovered after a fork is deleted or the database is lost.
import { createHash } from "node:crypto";
import { git, landingJob, remoteGit } from "../git/git.mjs";
import { currentJob } from "../github/github-jobs.mjs";
export { withoutPushCredentials } from "../git/git.mjs";
import { branchNameProblem } from "../epics/integration-branch.mjs";
import { enforce, pushLines } from "../content/content-rules.mjs";
import { globalAvoozlConfigPath } from "../settings/layered-config.mjs";
import { privacyHits, privacyRules } from "../content/privacy.mjs";
import { fail } from "../store/store.mjs";

const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PRIVATE = "refs/avoozl";

const lower = (value) => String(value).toLowerCase();
const short = (sha) => sha.slice(0, 12);
const hash = (value) =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

// An opaque identifier for public branch names and records: the same parts
// always give the same id, and the id names none of them.
export const opaqueId = (...parts) =>
  createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);

function repositoryOf(value, label) {
  if (
    typeof value !== "string" ||
    !REPOSITORY.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    fail(`The ${label} repository must be owner/name.`, 400);
  return value;
}

function branchOf(value, label) {
  const problem = branchNameProblem(value);
  if (problem) fail(`The ${label} branch is not usable: ${problem}`, 400);
  return value;
}

function segmentOf(value, label) {
  if (typeof value !== "string" || !SEGMENT.test(value))
    fail(`The ${label} must be letters, digits and . _ - only.`, 400);
  return value;
}

// A fully qualified reference: {source: {repository, branch, commit},
// target: {repository, base}}. Refuses anything else, so a URL, path or
// command can never stand in for a repository or branch.
export function qualifiedRef(input = {}) {
  const { source = {}, target = {} } = input;
  if (typeof source.commit !== "string" || !SHA.test(source.commit))
    fail("A reference needs the exact 40-character commit.", 400);
  return {
    source: {
      repository: repositoryOf(source.repository, "source"),
      branch: branchOf(source.branch, "source"),
      commit: source.commit,
    },
    target: {
      repository: repositoryOf(target.repository, "target"),
      base: branchOf(target.base, "target base"),
    },
    ...(Number.isSafeInteger(input.pr) && input.pr > 0 ? { pr: input.pr } : {}),
  };
}

// The identity of a reference without its commit: source repository and
// branch plus target repository and base. Repository names compare without
// case, as GitHub does.
export const refKey = (ref) =>
  `${lower(ref.source.repository)}:${ref.source.branch}>${lower(ref.target.repository)}:${ref.target.base}`;

// The spec's working branch and a task's checkpoint branch, by opaque ids
// (public branch names carry no spec or task names).
export const workingBranch = (spec) =>
  `avoozl/${segmentOf(spec, "spec id")}/work`;
export const checkpointBranch = (spec, task) =>
  `avoozl/${segmentOf(spec, "spec id")}/task/${segmentOf(task, "task id")}`;

// The trusted registry of fetchable repositories, from repository setup only:
// {"owner/name": {url, parent?}}. `parent` names the target a fork belongs
// to when GitHub cannot be asked. Returns a lookup by repository identity.
export function sourceRegistry(sources = {}) {
  const entries = new Map();
  for (const [repository, entry] of Object.entries(sources)) {
    repositoryOf(repository, "registered");
    const url = entry?.url;
    if (typeof url !== "string" || !url.trim() || url.startsWith("-"))
      fail(`Registered repository ${repository} needs a fetch location.`, 400);
    if (entry.parent !== undefined) repositoryOf(entry.parent, "parent");
    entries.set(lower(repository), {
      repository,
      url,
      parent: entry.parent ?? null,
    });
  }
  return {
    get(repository) {
      const found = entries.get(lower(repository));
      if (!found)
        fail(
          `${repository} is not a registered repository. Add it in repository setup first; a pull request or record cannot add one.`,
          403,
        );
      return found;
    },
    has: (repository) => entries.has(lower(repository)),
  };
}

// Whether the source may land in the target: the same repository, a fork
// the registry names as the target's, or a fork GitHub says belongs to it.
export async function verifyRelationship(github, ref, registry) {
  const { repository } = registry.get(ref.source.repository);
  registry.get(ref.target.repository);
  if (lower(repository) === lower(ref.target.repository)) return "same";
  const parent = registry.get(repository).parent;
  if (parent && lower(parent) === lower(ref.target.repository)) return "fork";
  const remote = github ? await github.repository(repository) : null,
    family = [remote?.parent?.full_name, remote?.source?.full_name].filter(
      Boolean,
    );
  if (
    remote?.fork &&
    family.some((name) => lower(name) === lower(ref.target.repository))
  )
    return "fork";
  fail(
    `${repository} is not ${ref.target.repository} or a fork of it, so its work cannot land there.`,
    403,
  );
}

const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };
const fetchedRef = (ref) => `${PRIVATE}/fetched/${hash(refKey(ref))}`;
const baseRef = (ref) =>
  `${PRIVATE}/bases/${hash(`${lower(ref.target.repository)}:${ref.target.base}`)}`;
const verifiedRef = (spec, ref) =>
  `${PRIVATE}/verified/${segmentOf(spec, "spec id")}/${hash(refKey(ref))}`;

async function revParse(root, name) {
  try {
    return await git(root, [
      "rev-parse",
      "--verify",
      "--quiet",
      `${name}^{commit}`,
    ]);
  } catch {
    return null;
  }
}

const hasCommit = async (root, sha) => Boolean(await revParse(root, sha));

async function isAncestor(root, older, newer) {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
}

// Fetches one reference from its registered location into Avoozl's private
// namespace and checks it against the exact commit it names, and that it
// shares history with the target base. States:
// - exact: the branch is at the commit.
// - advanced: the branch moved forward; the newer head is an unverified
//   checkpoint until the driver verifies it.
// - rewritten: the branch no longer contains the commit (held).
// - unavailable: the repository or branch cannot be fetched (held).
// `retained` says whether the named commit is still here to recover from.
export async function fetchExact(root, ref, registry, { env } = {}) {
  const source = registry.get(ref.source.repository),
    target = registry.get(ref.target.repository),
    environment = { ...(env ?? process.env), ...NO_PROMPT },
    into = fetchedRef(ref),
    // Avoozl's private local refs only; nothing here writes a remote.
    fetch = (url, branch, local) =>
      remoteGit(
        root,
        [
          "fetch",
          "--no-tags",
          "--quiet",
          url,
          `+refs/heads/${branch}:${local}`,
        ],
        { env: environment },
      );
  try {
    await fetch(target.url, ref.target.base, baseRef(ref));
  } catch {
    return {
      state: "unavailable",
      reason: "target-unreadable",
      retained: await hasCommit(root, ref.source.commit),
    };
  }
  try {
    await fetch(source.url, ref.source.branch, into);
  } catch {
    return {
      state: "unavailable",
      reason: "source-unreadable",
      retained: await hasCommit(root, ref.source.commit),
    };
  }
  const head = await revParse(root, into),
    base = await revParse(root, baseRef(ref)),
    retained = await hasCommit(root, ref.source.commit);
  let related = false;
  try {
    related = Boolean(await git(root, ["merge-base", base, head]));
  } catch {}
  if (!related) return { state: "unrelated", head, base, retained };
  if (head === ref.source.commit)
    return { state: "exact", head, base, retained: true };
  if (retained && (await isAncestor(root, ref.source.commit, head)))
    return { state: "advanced", head, base, retained };
  return { state: "rewritten", head, base, retained };
}

// Keeps a verified commit under a private local ref, so it survives a
// deleted fork, a rewritten branch and a lost database.
export async function retainVerified(root, spec, ref) {
  await git(root, ["update-ref", verifiedRef(spec, ref), ref.source.commit]);
  return verifiedRef(spec, ref);
}

// The acceptance gate for integration: evidence for this exact commit, every
// check passed and none missing, and paths inside the task's rules. A
// checkpoint is never evidence.
export function verifiedEvidence(evidence, commit) {
  if (!evidence || evidence.commit !== commit)
    return "there is no verification for this exact commit";
  const checks = evidence.checks;
  if (!Array.isArray(checks) || !checks.length)
    return "no declared check was reported";
  const failed = checks.filter(
    (check) => !(check.exitCode === 0 || check.conclusion === "success"),
  );
  if (failed.length) return `${failed.length} check(s) did not pass`;
  if (evidence.paths?.outside?.length || evidence.paths?.protected?.length)
    return "its paths are outside the task's rules or protected";
  return null;
}

// Guarded local ref move: from `old` (or absent when null) to `next`.
async function moveRef(root, name, next, old) {
  try {
    await git(root, ["update-ref", name, next, old ?? ""]);
  } catch {
    fail(
      `${name.replace(/^refs\/heads\//, "")} moved while Avoozl was updating it. Retry.`,
      409,
    );
  }
}

// The spec's working branch in one repository's local checkout, created at
// the target base commit when absent. One per spec and affected repository:
// `repository` is where the branch is pushed (the target or a fork).
export async function ensureWorkingBranch(
  root,
  { spec, repository, target, baseCommit },
) {
  const branch = workingBranch(spec),
    name = `refs/heads/${branch}`,
    current = await revParse(root, name);
  if (!current && !SHA.test(baseCommit ?? ""))
    fail("Name the exact base commit.", 400);
  if (!current) await moveRef(root, name, baseCommit, null);
  const commit = current ?? baseCommit;
  return {
    created: !current,
    ref: qualifiedRef({
      source: { repository, branch, commit },
      target,
    }),
  };
}

// One integration at a time per checkout and working branch, in this
// process. `lock` wraps the ref move for a cross-process lock (withWorkLock
// kind integration); checks never run inside it.
const queues = new Map();
function serial(key, fn) {
  const before = queues.get(key) ?? Promise.resolve(),
    run = before.then(fn, fn);
  queues.set(
    key,
    run.catch(() => {}),
  );
  return run;
}

// Integrates one verified task commit into the spec's working branch with a
// merge commit and a guarded ref update. Refuses an unverified commit, and a
// conflict without touching the branch. An already integrated commit is a
// no-op, so a retry is safe.
export async function integrateVerified(
  root,
  { spec, task, commit, evidence, lock = (fn) => fn() },
) {
  const problem = SHA.test(commit ?? "")
    ? verifiedEvidence(evidence, commit)
    : "the commit is not exact";
  if (problem)
    fail(
      `Task ${task} is not verified at ${String(commit).slice(0, 7)}: ${problem}. An unfinished checkpoint never enters the working branch.`,
      409,
    );
  const branch = workingBranch(spec),
    name = `refs/heads/${branch}`;
  return serial(`${root}\0${name}`, async () => {
    const head = await revParse(root, name);
    if (!head) fail(`The working branch ${branch} does not exist yet.`, 409);
    if (!(await hasCommit(root, commit)))
      fail(`Commit ${commit.slice(0, 7)} has not been fetched here.`, 409);
    if (await isAncestor(root, commit, head))
      return { branch, head, task, commit, integrated: false };
    let tree;
    try {
      tree = (
        await git(root, [
          "merge-tree",
          "--write-tree",
          "--no-messages",
          head,
          commit,
        ])
      ).split("\n")[0];
    } catch (error) {
      const files = String(error.stdout ?? "")
        .split("\n")
        .slice(1)
        .map((line) => line.split("\t")[1])
        .filter(Boolean);
      fail(
        `Task ${task} at ${commit.slice(0, 7)} conflicts with ${branch}${files.length ? ` in ${[...new Set(files)].slice(0, 5).join(", ")}` : ""}. The working branch is unchanged.`,
        409,
      );
    }
    const merged = await git(root, [
      "commit-tree",
      tree,
      "-p",
      head,
      "-p",
      commit,
      "-m",
      `Integrate task ${task} at ${short(commit)}`,
    ]);
    await lock(() => moveRef(root, name, merged, head));
    return { branch, head: merged, task, commit, integrated: true };
  });
}

// The privacy scan of an outgoing range: added lines in the code scope,
// commit messages and ref names in the text scope (privacy.mjs). Returns
// [{target, line, rule}], never the matched text.
export function privacyScan(root, { base, head, refs, machine, configFile }) {
  const lines = pushLines(root, base, head, refs),
    options = {
      machine: machine ?? null,
      configFile: configFile ?? globalAvoozlConfigPath(),
    },
    code = privacyRules({ ...options, scope: "code" }),
    text = privacyRules({ ...options, scope: "text" }),
    isText = (entry) => /^(?:commit|ref):/.test(entry.target),
    scanned = (rules, picked) =>
      privacyHits(
        picked.map((entry) => entry.text),
        rules,
      ).map((hit) => ({
        target: picked[hit.index].target,
        line: picked[hit.index].line,
        rule: hit.rule,
      }));
  return [
    ...scanned(
      code,
      lines.filter((entry) => !isText(entry)),
    ),
    ...scanned(text, lines.filter(isText)),
  ];
}

// Pushes an exact commit to a branch of a registered source repository,
// checkpoint or working head alike. The content scan runs first over
// everything the remote does not have; any hit refuses the push before it is
// made. With `store`, the workspace's content rules at the diff boundary
// check the same range, commit messages and ref name (R102.12), so a
// private plan's names never reach a pushed branch. A plain push only: a non-fast-forward is refused by git, never
// forced. Avoozl's own process pushes; agents have no credentials for it.
export async function pushHead(
  root,
  { repository, branch, commit },
  registry,
  { scan = privacyScan, since, env, machine, configFile, store } = {},
) {
  const { url } = registry.get(repository);
  branchOf(branch, "pushed");
  if (!SHA.test(commit ?? "")) fail("Name the exact commit to push.", 400);
  let remote = null;
  try {
    const listed = await remoteGit(
      root,
      ["ls-remote", "--heads", url, `refs/heads/${branch}`],
      {
        env: { ...(env ?? process.env), ...NO_PROMPT },
      },
    );
    remote = listed.split(/\s+/)[0] || null;
  } catch {
    fail(`${repository} cannot be read, so nothing was pushed.`, 503);
  }
  if (remote === commit) return { repository, branch, commit, pushed: false };
  // Scan everything the remote branch lacks; a new branch is scanned from
  // `since`, the target base it starts from.
  const base = remote && (await hasCommit(root, remote)) ? remote : since;
  if (!SHA.test(base ?? ""))
    fail(
      "Name the base commit the pushed range starts from, so the scan covers all of it.",
      400,
    );
  const hits = await scan(root, {
    base,
    head: commit,
    refs: [branch],
    machine,
    configFile,
  });
  if (hits.length)
    fail(
      `The content scan refused this push, nothing was pushed: rule ${[...new Set(hits.map((hit) => hit.rule))].join(", ")} in ${[...new Set(hits.map((hit) => hit.target))].slice(0, 5).join(", ")}.`,
      422,
    );
  // Throws 422 naming the rule, never the text, on a match.
  if (store)
    enforce(
      store,
      {
        boundary: "diff",
        repository,
        target: `push:${repository}:${branch}`,
        added: pushLines(root, base, commit, [branch]),
      },
      { mode: "refuse" },
    );
  try {
    await remoteGit(
      root,
      ["push", "--quiet", url, `${commit}:refs/heads/${branch}`],
      {
        env: { ...(env ?? process.env), ...NO_PROMPT },
        // A landing whose range changes a workflow file needs
        // workflows: write (PC4.7); a checkpoint keeps its own job.
        ...(currentJob() === "land"
          ? { job: await landingJob(root, base, commit) }
          : {}),
      },
    );
  } catch {
    fail(
      `${repository} refused the push of ${branch}; it is not a fast-forward or Avoozl may not write there. Nothing was forced.`,
      409,
    );
  }
  return { repository, branch, commit, pushed: true };
}

// Source push rights and target merge rights are separate (R102.8). A
// contributor may checkpoint to a fork with no upstream write access; the
// target's own maintainer lands, and Avoozl observes when it cannot merge.
const WRITE = ["admin", "maintain", "write"];
export async function landingRights(github, ref, login) {
  const role = async (repository) =>
      String(
        (await github.permission(repository, login))?.permission ?? "none",
      ),
    [source, target] = await Promise.all([
      role(ref.source.repository),
      lower(ref.source.repository) === lower(ref.target.repository)
        ? null
        : role(ref.target.repository),
    ]),
    targetRole = target ?? source;
  return {
    checkpoint: WRITE.includes(source),
    land: WRITE.includes(targetRole) ? "merge" : "observe",
  };
}
