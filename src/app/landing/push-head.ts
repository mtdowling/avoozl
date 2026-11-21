// @ts-nocheck: typing debt
// Pushing a landing's exact commit, and the checks around it (Requirement
// 102.4-102.7, design §4.32.3).
//
// - A reference is never a branch name alone: it names its source repository,
//   branch and exact commit, apart from the target repository and base it
//   lands on. Two forks with the same branch name are two references.
// - Sources are registered by trusted repository setup only (`sources`: the
//   repository identity and where to fetch it). A pull request may name a
//   registered repository; it cannot add a fetch URL, local path or command.
// - Content checks run before every push. Nothing here force pushes, and
//   agents get no push credentials (`withoutPushCredentials` in git.mjs).
import { git, landingJob, remoteGit } from "../git/git.ts";
import { currentJob } from "../github/github-jobs.ts";
import { branchNameProblem } from "../epics/integration-branch.ts";
import { enforce, pushLines } from "../content/content-rules.ts";
import { globalAvoozlConfigPath } from "../settings/layered-config.ts";
import { privacyHits, privacyRules } from "../content/privacy.ts";
import { fail } from "../store/store.ts";

const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

const lower = (value) => String(value).toLowerCase();

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
// check the same range, commit messages and ref name (R102.7), so a
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

// Source push rights and target merge rights are separate (R102.6). A
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
