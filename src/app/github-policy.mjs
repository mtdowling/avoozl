import { kirocrewSessionSettings } from "./executors/kirocrew.mjs";
import { LANDING_MODES } from "./landing-config.mjs";
// Repository policy in `.avoozl.json` (design §4.4): GitHub mode, task
// authority, the Project, and per-repository settings. No label is an
// order: the triage agent (triage-agent) is the one way an issue becomes
// work. Validation is deterministic; the one check that needs GitHub (base
// branch) is `requireDefaultBranch`.
import { loadLayeredConfig } from "./layered-config.mjs";
import { fail } from "./store.mjs";
import { MAX_WRITES_PER_HOUR, MAX_WRITES_PER_MINUTE } from "./github-pacer.mjs";
import { parseRepository } from "./github.mjs";
import { mirrorInput } from "./mirror-policy.mjs";
import { ROLES, deriveGitHubKeys, resolveRoles } from "./repository-roles.mjs";

export const PERMISSIONS = Object.freeze([
  "read",
  "triage",
  "write",
  "maintain",
  "admin",
]);
export { ROLES };
export const MODES = Object.freeze(["plans-repo", "single-repo"]);
// `local` names Local only on purpose: no GitHub mode, every task stays in
// the workspace database. It normalizes to a null mode, and the GitHub
// settings stored beside it are kept but not used, so switching back
// restores them (owner decision 2026-11-12).
const LOCAL_MODE = "local";
export const MODE_CHOICES = Object.freeze([LOCAL_MODE, ...MODES]);
// The `github` keys the Settings view edits.
export const POLICY_KEYS = Object.freeze([
  "mode",
  "planningRepository",
  "epicIssueType",
  "cacheSeconds",
  "writesPerMinute",
  "writesPerHour",
  "specReviewers",
  "repositories",
]);
// The keys each block under `github` accepts, by place. The validators below
// read them, and a test holds src/avoozl-config.schema.json to the same lists.
export const GITHUB_BLOCK_KEYS = Object.freeze({
  discussions: ["categories"],
  repository: [
    "checkout",
    "folder",
    "baseBranch",
    "role",
    "allowedActors",
    "minimumPermission",
    "requiredChecks",
    "priorityLabels",
    "waitingLabels",
    "buildReceipts",
    "discussions",
    "mirror",
    "conflicts",
    "landing",
    "triage",
  ],
  conflicts: ["maxAttempts"],
  landing: ["mode", "autoMerge", "method", "mergeBatch", "commitPrefix"],
  triage: [
    "agent",
    "existing",
    "dailyRuns",
    "fullReviewMaxLines",
    "labels",
    "reviews",
  ],
});
// Who counts when a repository names nobody.
export const DEFAULT_PERMISSION = "write";
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const lower = (value) => value.toLocaleLowerCase();

function onlyKeys(value, allowed, label) {
  if (!record(value)) fail(`${label} must contain a JSON object.`);
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`Unknown setting ${label}.${key}.`);
  return value;
}

function name(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || !value.trim())
    fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function names(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be a list of names.`);
  const seen = new Map();
  for (const item of value) {
    const text = name(item, label);
    seen.set(lower(text), text);
  }
  return [...seen.values()];
}

function repositoryName(value, label) {
  if (typeof value !== "string" || !REPOSITORY.test(value))
    fail(`${label} must be an owner/repository name.`);
  return value;
}

function permission(value, label) {
  if (value === undefined || value === null) return null;
  if (!PERMISSIONS.includes(value))
    fail(`${label} must be one of ${PERMISSIONS.join(", ")}.`);
  return value;
}

// `github.specReviewers` (R102.18): the GitHub logins asked to review each
// spec's approval pull request, by spec folder name. With none for a spec,
// the repository's own CODEOWNERS and rules decide; Avoozl adds no rule.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SPEC_FOLDER = /^[a-z0-9][a-z0-9-]{0,79}$/;
function specReviewersInput(value) {
  if (!record(value)) fail("github.specReviewers must be a JSON object.");
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([spec, logins]) => {
        const where = `github.specReviewers.${spec}`;
        if (!SPEC_FOLDER.test(spec))
          fail("Each github.specReviewers key must be a spec folder name.");
        if (
          !Array.isArray(logins) ||
          logins.length > 10 ||
          !logins.every(
            (login) => typeof login === "string" && LOGIN.test(login),
          ) ||
          new Set(logins.map(lower)).size !== logins.length
        )
          fail(`${where} must be a list of at most 10 distinct GitHub logins.`);
        return [spec, [...logins]];
      }),
  );
}

// Discussions answering (task 8.2, R27.13): off unless present. Only
// discussions in `categories` whose author the policy allows get one reply.
function discussionsInput(value, label) {
  if (value === undefined || value === null) return null;
  onlyKeys(value, GITHUB_BLOCK_KEYS.discussions, label);
  const categories = names(value.categories, `${label}.categories`);
  if (!categories.length)
    fail(`${label}.categories must name at least one category.`);
  return { categories };
}

// How long GitHub answers stay fresh, in seconds; 0 turns the cache off.
const CACHE_SECONDS_MAX = 3600;
function cacheSecondsInput(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > CACHE_SECONDS_MAX)
    fail(`${label} must be a whole number of seconds from 0 to 3600.`);
  return value;
}

// How many GitHub writes Avoozl makes (github-pacer.mjs). Null follows the
// built-in 60 a minute and 400 an hour; GitHub's own ceilings are 80 and 500.
function writesInput(value, label, max) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    fail(`${label} must be a whole number from 1 to ${max}.`);
  return value;
}

function repositoryInput(value, id, mode) {
  const label = `github.repositories.${id}`;
  onlyKeys(value, GITHUB_BLOCK_KEYS.repository, label);
  const baseBranch = name(value.baseBranch, `${label}.baseBranch`, {
    optional: true,
  });
  // GitHub closes issues only from merges into the default branch (R16.5).
  if (mode && !baseBranch)
    fail(`${label}.baseBranch must name the repository's default branch.`);
  const priority = names(value.priorityLabels, `${label}.priorityLabels`),
    // Labels that mean "waiting on someone outside": the task waits with
    // the reason "Waiting on the author" while one is on its item.
    waitingLabels = names(value.waitingLabels, `${label}.waitingLabels`);
  const allowedActors = names(value.allowedActors, `${label}.allowedActors`),
    // A repository that names nobody defaults to people with write access
    // (owner decision 2026-11-12, R10.2). Naming actors or a permission
    // replaces it.
    minimumPermission =
      permission(value.minimumPermission, `${label}.minimumPermission`) ??
      (allowedActors.length ? null : DEFAULT_PERMISSION);
  return {
    checkout: name(value.checkout, `${label}.checkout`, { optional: true }),
    ...kirocrewSessionSettings(value, label, name),
    baseBranch,
    allowedActors,
    minimumPermission,
    requiredChecks: names(value.requiredChecks, `${label}.requiredChecks`),
    // The code repository has bin/build-receipt (RC32.8).
    buildReceipts: value.buildReceipts === true,
    priorityLabels: priority,
    waitingLabels,
    // Deferred features (task 8.2), each off by default.
    discussions: discussionsInput(value.discussions, `${label}.discussions`),
    conflicts: conflictsInput(value.conflicts, `${label}.conflicts`),
    ...(value.triage === undefined || value.triage === null
      ? {}
      : { triage: triageInput(value.triage, `${label}.triage`) }),
    // One landing block (design §4.25).
    landing: landingInput(value.landing, `${label}.landing`),
    ...(value.mirror === undefined || value.mirror === null
      ? {}
      : { mirror: mirrorInput(value.mirror, `${label}.mirror`, baseBranch) }),
  };
}

const MAX_ATTEMPTS = 10;
// How many times a landing conflict goes back to the worker (R87.6); unset
// is 2.
function conflictsInput(value, label) {
  const input = onlyKeys(value ?? {}, GITHUB_BLOCK_KEYS.conflicts, label);
  const count = input.maxAttempts ?? null;
  if (
    count !== null &&
    (!Number.isSafeInteger(count) || count < 0 || count > MAX_ATTEMPTS)
  )
    fail(
      `${label}.maxAttempts must be a whole number from 0 to ${MAX_ATTEMPTS}.`,
    );
  return { maxAttempts: count };
}

// How a pull request lands: `squash` (one commit per pull request on the base) or `merge`.
export const MERGE_METHODS = Object.freeze(["squash", "merge"]);
export const MERGE_METHOD_DEFAULT = "squash";
// GitHub's repository setting for each method, and its name on screen.
export const MERGE_METHOD_SETTING = Object.freeze({
  squash: { key: "allow_squash_merge", name: "Allow squash merging" },
  merge: { key: "allow_merge_commit", name: "Allow merge commits" },
});
// `landing` {mode, autoMerge, method, mergeBatch, commitPrefix}, unset values null and
// the method defaulted. Null reads as unset, so a normalized policy
// normalizes to itself.
function landingInput(value, label) {
  const block = onlyKeys(value ?? {}, GITHUB_BLOCK_KEYS.landing, label);
  if (block.mode != null && !LANDING_MODES.includes(block.mode))
    fail(`${label}.mode must be direct, pr or off.`);
  if (block.autoMerge != null && typeof block.autoMerge !== "boolean")
    fail(`${label}.autoMerge must be true or false.`);
  if (
    block.mergeBatch != null &&
    block.mergeBatch !== "auto" &&
    !(
      Number.isInteger(block.mergeBatch) &&
      block.mergeBatch >= 1 &&
      block.mergeBatch <= 16
    )
  )
    fail(`${label}.mergeBatch must be "auto" or a whole number 1-16.`);
  if (
    block.commitPrefix != null &&
    (typeof block.commitPrefix !== "string" ||
      block.commitPrefix.length > 40 ||
      /[\r\n]/.test(block.commitPrefix))
  )
    fail(`${label}.commitPrefix must be one line of at most 40 characters.`);
  if (block.method != null && !MERGE_METHODS.includes(block.method))
    fail(`${label}.method must be squash or merge.`);
  return {
    mode: block.mode ?? null,
    autoMerge: block.autoMerge ?? null,
    method: block.method ?? MERGE_METHOD_DEFAULT,
    mergeBatch: block.mergeBatch ?? null,
    commitPrefix: block.commitPrefix ?? null,
  };
}
// The method a repository's settings merge a pull request with.
export const mergeMethod = (settings) =>
  settings?.landing?.method ?? MERGE_METHOD_DEFAULT;

// The triage agent's settings (triage-agent TA1.1, TA4.2, TA7.4, design
// §D3, §D6). Only the keys a repository sets are kept; triage.mjs fills in
// the defaults.
const TRIAGE_CHOICES = {
  agent: ["on", "off"],
  existing: ["take", "skip"],
  labels: ["suggest", "add"],
  reviews: ["post", "draft"],
};
function triageInput(value, label) {
  const input = onlyKeys(value ?? {}, GITHUB_BLOCK_KEYS.triage, label),
    out = {};
  for (const [key, choices] of Object.entries(TRIAGE_CHOICES))
    if (input[key] !== undefined) {
      if (!choices.includes(input[key]))
        fail(`${label}.${key} must be ${choices.join(" or ")}.`);
      out[key] = input[key];
    }
  for (const [key, max] of [
    ["dailyRuns", 1000],
    ["fullReviewMaxLines", 100000],
  ])
    if (input[key] !== undefined) {
      if (
        !Number.isSafeInteger(input[key]) ||
        input[key] < 1 ||
        input[key] > max
      )
        fail(`${label}.${key} must be a whole number from 1 to ${max}.`);
      out[key] = input[key];
    }
  return out;
}

// A leaf's place in the repository's priority list: the best (lowest) index
// of any priority label it carries, compared without case; a leaf with none
// of them, or only labels the list does not name, sorts after all of them.
export function priorityRank(priority, labels) {
  const names = new Set(
    (labels || [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean)
      .map(lower),
  );
  const list = Array.isArray(priority) ? priority : [],
    index = list.findIndex(
      (entry) => typeof entry === "string" && names.has(lower(entry)),
    );
  return index < 0 ? list.length : index;
}

// The `github` block of `.avoozl.json`.
export function normalizeGitHubPolicy(value) {
  if (value === undefined || value === null) value = {};
  onlyKeys(value, POLICY_KEYS, "github");
  // Roles decide the mode (R105.2); a block with none is read as written.
  try {
    resolveRoles(value);
  } catch (error) {
    fail(error.message);
  }
  value = deriveGitHubKeys(value);
  const named = value.mode ?? null;
  if (named !== null && !MODE_CHOICES.includes(named))
    fail("github.mode must be local, plans-repo or single-repo.");
  const local = named === LOCAL_MODE,
    mode = local ? null : named;
  const stored =
    value.planningRepository === undefined || value.planningRepository === null
      ? null
      : repositoryName(value.planningRepository, "github.planningRepository");
  if (mode === "plans-repo" && !stored)
    fail("github.mode plans-repo needs github.planningRepository.");
  // Kept for a switch back, used only in plans-repo mode.
  const planningRepository = mode === "plans-repo" ? stored : null;
  const repositories = value.repositories ?? {};
  if (!record(repositories))
    fail("github.repositories must contain a JSON object.");
  return {
    mode,
    planningRepository,
    epicIssueType: name(value.epicIssueType, "github.epicIssueType", {
      optional: true,
    }),
    cacheSeconds: cacheSecondsInput(value.cacheSeconds, "github.cacheSeconds"),
    writesPerMinute: writesInput(
      value.writesPerMinute,
      "github.writesPerMinute",
      MAX_WRITES_PER_MINUTE,
    ),
    writesPerHour: writesInput(
      value.writesPerHour,
      "github.writesPerHour",
      MAX_WRITES_PER_HOUR,
    ),
    ...(value.specReviewers === undefined || value.specReviewers === null
      ? {}
      : { specReviewers: specReviewersInput(value.specReviewers) }),
    repositories: Object.fromEntries(
      Object.entries(repositories)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, entry]) => [
          repositoryName(id, "Each github.repositories key"),
          repositoryInput(entry, id, mode),
        ]),
    ),
  };
}

// The policy keys of a Settings edit, with null or absent values dropped so
// that clearing a field removes it from `.avoozl.json`.
export function policySection(value) {
  onlyKeys(value, POLICY_KEYS, "github");
  return Object.fromEntries(
    POLICY_KEYS.filter(
      (key) => value[key] !== undefined && value[key] !== null,
    ).map((key) => [key, structuredClone(value[key])]),
  );
}

// The policy this workspace runs under: global, repository and local layers
// merged, so an instance may override a repository's defaults (R11.1).
export function readGitHubPolicy(workspaceRoot) {
  if (!workspaceRoot) return normalizeGitHubPolicy({});
  return normalizeGitHubPolicy(
    loadLayeredConfig({ workspaceRoot }).config.github,
  );
}

// The same policy for a read that must not fail on an invalid file: null.
export function readGitHubPolicyOrNull(workspaceRoot) {
  try {
    return readGitHubPolicy(workspaceRoot);
  } catch {
    return null;
  }
}

// A registered repository the policy does not name: the default actor
// check.
export function legacyRepositoryPolicy() {
  return {
    baseBranch: null,
    allowedActors: [],
    minimumPermission: DEFAULT_PERMISSION,
  };
}

// GitHub closes issues only from merges into the default branch (R16.5).
export function requireDefaultBranch(repository, remote, id) {
  if (
    repository.baseBranch &&
    remote?.default_branch &&
    repository.baseBranch !== remote.default_branch
  )
    fail(
      `.avoozl.json github.repositories.${id}.baseBranch is ${repository.baseBranch}, but the default branch of ${id} is ${remote.default_branch}. GitHub closes issues only from merges into the default branch.`,
      409,
    );
}

// The same check for every repository of a policy with a mode, for a
// Settings edit. A repository GitHub cannot read now is skipped; sync
// checks it again before it reads issues there.
export async function requireDefaultBranches(policy, github) {
  if (!policy?.mode) return;
  for (const [id, repository] of Object.entries(policy.repositories || {})) {
    if (!repository.baseBranch) continue;
    let remote;
    try {
      remote = await github.repository(parseRepository(id));
    } catch {
      continue;
    }
    requireDefaultBranch(repository, remote, id);
  }
}

const RANK = new Map([
  ["none", 0],
  ...PERMISSIONS.map((value, index) => [value, index + 1]),
]);

// Whether `login`, holding `held` permission, counts in this repository
// (approvals, replies). Both checks apply when both are set; with neither, nobody may.
export function actorAllowed(repository, login, held) {
  if (!login) return { allowed: false, reason: "No one is named." };
  const actors = repository.allowedActors || [],
    minimum = repository.minimumPermission;
  if (!actors.length && !minimum)
    return {
      allowed: false,
      reason: "The repository policy names no allowed actor or permission.",
    };
  if (actors.length && !actors.some((actor) => lower(actor) === lower(login)))
    return { allowed: false, reason: `${login} is not an allowed actor.` };
  if (minimum && (RANK.get(held || "none") ?? 0) < RANK.get(minimum))
    return {
      allowed: false,
      reason: `${login} needs ${minimum} permission.`,
    };
  return { allowed: true, reason: "" };
}
