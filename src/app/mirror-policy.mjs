// The per-repository `mirror` setting (RC24.1, RC24.2, design D29.1). Crews
// work a private mirror of a public repository. Validation here is
// deterministic; the one check that needs GitHub is `requireMirrorsPrivate`.
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";

export const FORWARD_MODES = Object.freeze(["off", "nudge", "auto"]);
export const MIRROR_KEYS = Object.freeze([
  "source",
  "mirror",
  "forwardTo",
  "forward",
  "branchPrefix",
  "squash",
  "trustedPersons",
  "plansBranch",
]);
export const MIRROR_DEFAULTS = Object.freeze({
  forwardTo: "source",
  forward: "nudge",
  branchPrefix: "avoozl/",
  squash: true,
  plansBranch: "avoozl-plans",
});

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PREFIX = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function repositoryName(value, label) {
  if (typeof value !== "string" || !REPOSITORY.test(value))
    fail(`${label} must be an owner/repository name.`);
  return value;
}

// A plain git branch name: no "..", "//", "@{", trailing "/" or ".lock".
const plainBranch = (name) =>
  typeof name === "string" &&
  BRANCH_PREFIX.test(name) &&
  !/\.\.|\/\/|@\{|\/$|\.$|\.lock$/.test(name);

// The normalized mirror of one repository entry, or null when it has none.
// `baseBranch` is the repository's configured default branch, when known.
export function mirrorInput(value, label, baseBranch) {
  if (value === undefined || value === null) return null;
  if (!record(value)) fail(`${label} must contain a JSON object.`);
  for (const key of Object.keys(value))
    if (!MIRROR_KEYS.includes(key)) fail(`Unknown setting ${label}.${key}.`);
  const source = repositoryName(value.source, `${label}.source`),
    mirror = repositoryName(value.mirror, `${label}.mirror`);
  if (source.toLowerCase() === mirror.toLowerCase())
    fail(`${label}.mirror must differ from ${label}.source.`);
  const forwardTo = value.forwardTo ?? MIRROR_DEFAULTS.forwardTo;
  if (forwardTo !== "source") {
    const fork = /^fork:(.+)$/.exec(String(forwardTo))?.[1];
    if (typeof forwardTo !== "string" || !fork || !REPOSITORY.test(fork))
      fail(`${label}.forwardTo must be source or fork:<owner/name>.`);
  }
  const forward = value.forward ?? MIRROR_DEFAULTS.forward;
  if (!FORWARD_MODES.includes(forward))
    fail(`${label}.forward must be off, nudge or auto.`);
  const branchPrefix = value.branchPrefix ?? MIRROR_DEFAULTS.branchPrefix;
  if (
    typeof branchPrefix !== "string" ||
    !BRANCH_PREFIX.test(branchPrefix) ||
    branchPrefix.includes("..") ||
    branchPrefix.includes("//")
  )
    fail(`${label}.branchPrefix must be a plain branch name prefix.`);
  const plansBranch = value.plansBranch ?? MIRROR_DEFAULTS.plansBranch;
  if (!plainBranch(plansBranch))
    fail(`${label}.plansBranch must be a plain branch name.`);
  if (plansBranch === baseBranch)
    fail(`${label}.plansBranch must differ from the default branch.`);
  if (plansBranch.startsWith(branchPrefix))
    fail(
      `${label}.plansBranch must not start with the branch prefix ${branchPrefix}, which task branches use.`,
    );
  const squash = value.squash ?? MIRROR_DEFAULTS.squash;
  if (typeof squash !== "boolean")
    fail(`${label}.squash must be true or false.`);
  const persons = value.trustedPersons ?? [];
  if (
    !Array.isArray(persons) ||
    persons.some((p) => typeof p !== "string" || !p.trim())
  )
    fail(`${label}.trustedPersons must be a list of logins.`);
  const seen = new Map();
  for (const login of persons)
    if (!seen.has(login.trim().toLowerCase()))
      seen.set(login.trim().toLowerCase(), login.trim());
  const trustedPersons = [...seen.values()];
  if (forward === "auto" && !trustedPersons.length)
    fail(
      `${label}.forward auto needs at least one person in ${label}.trustedPersons.`,
    );
  return {
    source,
    mirror,
    forwardTo,
    forward,
    branchPrefix,
    squash,
    trustedPersons,
    plansBranch,
  };
}

// Refuse a mirror that is not private. A visibility that cannot be read
// counts as not private (RC24.2, as RC10.1 does for the source).
export async function requireMirrorsPrivate(policy, github) {
  for (const entry of Object.values(policy?.repositories || {})) {
    if (!entry.mirror) continue;
    const id = entry.mirror.mirror;
    let remote = null;
    try {
      if (github?.available?.())
        remote = await github.repository(parseRepository(id));
    } catch {
      remote = null;
    }
    if (!remote)
      fail(
        `The mirror ${id} could not be read, so it counts as not private. Check the name and Avoozl's GitHub access.`,
        409,
      );
    if (remote.private !== true)
      fail(
        `The mirror ${id} is not private. A mirror must be a private repository.`,
        403,
      );
  }
}

// The mirror's plans branch is an orphan: no merge base with the default
// branch (RC25.1, design D30.1). Refuse a name equal to the default branch
// or sharing its history. With `create`, a missing branch is made once from
// an empty root commit; without it (validation) nothing is written.
export async function requirePlansBranches(
  policy,
  github,
  { create = false } = {},
) {
  for (const entry of Object.values(policy?.repositories || {})) {
    if (!entry.mirror) continue;
    const { mirror, plansBranch } = entry.mirror,
      repository = parseRepository(mirror);
    let remote, existing;
    try {
      remote = await github.repository(repository);
      existing = await github.branch(repository, plansBranch).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      });
    } catch {
      fail(
        `The mirror ${mirror} could not be read, so plansBranch ${plansBranch} cannot be checked.`,
        409,
      );
    }
    const base = remote?.default_branch;
    if (!base) fail(`The default branch of ${mirror} could not be read.`, 409);
    if (plansBranch === base)
      fail(
        `plansBranch ${plansBranch} is the default branch of ${mirror}. Pick another name.`,
      );
    if (!existing) {
      if (create) await github.createOrphanBranch(repository, plansBranch);
      continue;
    }
    let shared;
    try {
      await github.compareCommits(repository, base, plansBranch);
      shared = true;
    } catch (error) {
      if (error.status === 404 && /common ancestor/i.test(error.message || ""))
        shared = false;
      else
        fail(
          `plansBranch ${plansBranch} could not be compared with ${base}: ${error.message}`,
          409,
        );
    }
    if (shared)
      fail(
        `plansBranch ${plansBranch} shares history with ${base} in ${mirror}. It must be a separate branch with no shared history.`,
      );
  }
}
