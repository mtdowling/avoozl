// Repository policy in `.avoozl.json` (design §4.4): GitHub mode, task
// authority, the Project, and per-repository rules that map labels to fixed
// actions. No label name is built in. Validation is deterministic; the one
// check that needs GitHub (base branch) is `requireDefaultBranch`.
import { loadLayeredConfig } from "./layered-config.mjs";
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import { parseMatch } from "./issue-match.mjs";

// The rule keys `match` replaces (§4.4); still read when `match` is absent.
const LEGACY_MATCH_KEYS = ["labelsAll", "labelsAny", "labelsNone", "assignee"];

export const RULE_ACTIONS = Object.freeze([
  "respond",
  "plan",
  "deliver",
  "execute",
  "pause",
  "resume",
  "quarantine",
]);
export const MANAGED_LABEL_KEYS = Object.freeze([
  "managed",
  "responding",
  "planning",
  "ready",
  "stale",
  "decision",
]);
export const STATUS_VALUE_KEYS = Object.freeze([
  "todo",
  "inProgress",
  "done",
  "deferred",
]);
export const FIELD_KEYS = Object.freeze([
  "status",
  "release",
  "wave",
  "iteration",
  "avoozlState",
  // A text field Avoozl owns like Wave: each task's phase (R59.8).
  "phase",
]);
// GitHub links at most 100 sub-issues under one parent, closed ones
// included (design §6.9 Limits).
export const SUB_ISSUE_CAP = 100;
export const PERMISSIONS = Object.freeze([
  "read",
  "triage",
  "write",
  "maintain",
  "admin",
]);
export const MODES = Object.freeze(["plans-repo", "single-repo"]);
// `local` names Local only on purpose: no GitHub mode, every task stays in
// the workspace database. It normalizes to a null mode, and the GitHub
// settings stored beside it are kept but not used, so switching back
// restores them (owner decision 2026-11-12).
export const LOCAL_MODE = "local";
export const MODE_CHOICES = Object.freeze([LOCAL_MODE, ...MODES]);
// Issue Radar's own labels, which Avoozl reads and never writes (§6.4). The
// defaults are Issue Radar's: its fixed claim label and the default of its
// per-repository `needs_human_label` setting.
export const CREW_LABEL_KEYS = Object.freeze(["claim", "needsHuman"]);
export const CREW_LABEL_DEFAULTS = Object.freeze({
  claim: "crew: in progress",
  needsHuman: "crew: needs human",
});
// Issue Radar's own page route (its app.json), where a user scopes a crew
// (R17.4).
export const ISSUE_RADAR_PATH = "/issue-radar";
export const CODERS = Object.freeze(["worker", "issue-radar"]);
const LEGACY_KEYS = ["issueIntake", "queue"];
// The `github` keys the Settings view edits; the legacy keys stay as written.
export const POLICY_KEYS = Object.freeze([
  "mode",
  "planningRepository",
  "defaultAuthority",
  "project",
  "epicIssueType",
  "subIssues",
  "repositories",
]);
// Who may give Avoozl orders when a repository names nobody.
export const DEFAULT_PERMISSION = "write";
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RULE_ID = /^[a-z][a-z0-9-]{0,60}$/;

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

// `github.subIssues.maxPerParent` (R59.15): how many sub-issues Avoozl links
// under one parent issue, default GitHub's own limit.
function subIssuesInput(value) {
  if (value === undefined || value === null)
    return { maxPerParent: SUB_ISSUE_CAP };
  onlyKeys(value, ["maxPerParent"], "github.subIssues");
  const cap = value.maxPerParent ?? SUB_ISSUE_CAP;
  if (!Number.isSafeInteger(cap) || cap < 1)
    fail("github.subIssues.maxPerParent must be a whole number of at least 1.");
  return { maxPerParent: cap };
}

function projectInput(value) {
  if (value === undefined || value === null) return null;
  onlyKeys(
    value,
    ["owner", "number", "fields", "statusValues"],
    "github.project",
  );
  if (!Number.isSafeInteger(value.number) || value.number < 1)
    fail("github.project.number must be a positive whole number.");
  const fields = onlyKeys(
      value.fields ?? {},
      FIELD_KEYS,
      "github.project.fields",
    ),
    statusValues = onlyKeys(
      value.statusValues ?? {},
      STATUS_VALUE_KEYS,
      "github.project.statusValues",
    );
  return {
    owner: name(value.owner, "github.project.owner"),
    number: value.number,
    fields: Object.fromEntries(
      FIELD_KEYS.filter((key) => Object.hasOwn(fields, key)).map((key) => [
        key,
        name(fields[key], `github.project.fields.${key}`, { optional: true }),
      ]),
    ),
    statusValues: Object.fromEntries(
      STATUS_VALUE_KEYS.filter((key) => Object.hasOwn(statusValues, key)).map(
        (key) => [
          key,
          name(statusValues[key], `github.project.statusValues.${key}`),
        ],
      ),
    ),
  };
}

function ruleInput(value, label) {
  onlyKeys(
    value,
    [
      "id",
      "action",
      "match",
      "labelsAll",
      "labelsAny",
      "labelsNone",
      "assignee",
      "author",
      "autoPublishChildren",
    ],
    label,
  );
  if (typeof value.id !== "string" || !RULE_ID.test(value.id))
    fail(`${label}.id must be a lowercase rule ID.`);
  if (!RULE_ACTIONS.includes(value.action))
    fail(`${label}.action must be one of ${RULE_ACTIONS.join(", ")}.`);
  // `match` (a GitHub search line) replaces the legacy label keys; a rule
  // with both would have two answers, so it is refused.
  const legacy = LEGACY_MATCH_KEYS.filter((key) => value[key] !== undefined);
  if (value.match !== undefined && legacy.length)
    fail(`${label} has both match and ${legacy.join(", ")}; use only match.`);
  const fields =
    value.match !== undefined
      ? parseMatch(value.match, `${label}.match`)
      : {
          labelsAll: names(value.labelsAll, `${label}.labelsAll`),
          labelsAny: names(value.labelsAny, `${label}.labelsAny`),
          labelsNone: names(value.labelsNone, `${label}.labelsNone`),
          assignee: name(value.assignee, `${label}.assignee`, {
            optional: true,
          }),
          unassigned: false,
          source: null,
        };
  // Avoozl writes nothing to a non-GitHub source yet (R50.20).
  if (fields.source && value.action === "respond")
    fail(
      `${label} is a respond rule, which cannot use source:; Avoozl answers on GitHub only.`,
    );
  const rule = {
    id: value.id,
    action: value.action,
    match: value.match !== undefined ? value.match.trim() : null,
    ...fields,
    author: name(value.author, `${label}.author`, { optional: true }),
    autoPublishChildren: value.autoPublishChildren === true,
  };
  // A rule with no positive label would match every open issue.
  if (!rule.labelsAll.length && !rule.labelsAny.length)
    fail(`${label} needs labelsAll or labelsAny.`);
  const positive = new Set([...rule.labelsAll, ...rule.labelsAny].map(lower));
  if (rule.labelsNone.some((label) => positive.has(lower(label))))
    fail(`${label} names one label as both required and excluded.`);
  return rule;
}

// GitHub pull-request reviews as a GitHub leaf's review verdict (task 9.10,
// R36.13). Present means on; `approvals` is how many allowed approvals the
// head commit needs.
function reviewsInput(value, label) {
  if (value === undefined || value === null) return null;
  onlyKeys(value, ["approvals"], label);
  const approvals = value.approvals ?? 1;
  if (!Number.isSafeInteger(approvals) || approvals < 1 || approvals > 10)
    fail(`${label}.approvals must be a whole number from 1 to 10.`);
  return { approvals };
}

// Comment-mention steering (task 8.2, R27.13): off unless present. A comment
// on a running GitHub leaf's issue that names `mention`, by an actor the
// policy allows, is relayed to the leaf's worker session.
const MENTION =
  /^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9._-]{1,100})?$/;
function steeringInput(value, label) {
  if (value === undefined || value === null) return null;
  onlyKeys(value, ["mention"], label);
  if (typeof value.mention !== "string" || !MENTION.test(value.mention))
    fail(`${label}.mention must be a GitHub @name or @org/team.`);
  return { mention: value.mention };
}

// Discussions answering (task 8.2, R27.13): off unless present. Only
// discussions in `categories` whose author the policy allows get one reply.
function discussionsInput(value, label) {
  if (value === undefined || value === null) return null;
  onlyKeys(value, ["categories"], label);
  const categories = names(value.categories, `${label}.categories`);
  if (!categories.length)
    fail(`${label}.categories must name at least one category.`);
  return { categories };
}

function repositoryInput(value, id, mode) {
  const label = `github.repositories.${id}`;
  onlyKeys(
    value,
    [
      "checkout",
      "folder",
      "baseBranch",
      "coder",
      "allowedActors",
      "minimumPermission",
      "requiredChecks",
      "pullRequestReviews",
      "concurrency",
      "dependencyText",
      "priority",
      "priorityLabels",
      "waitingLabels",
      "managedLabels",
      "crewLabels",
      "rules",
      "stackedPullRequests",
      "commentSteering",
      "discussions",
      "untriaged",
    ],
    label,
  );
  if (
    value.stackedPullRequests !== undefined &&
    typeof value.stackedPullRequests !== "boolean"
  )
    fail(`${label}.stackedPullRequests must be true or false.`);
  const coder =
    value.coder ?? (mode === "single-repo" ? "issue-radar" : "worker");
  if (!CODERS.includes(coder))
    fail(`${label}.coder must be worker or issue-radar.`);
  // A crew opens pull requests only in its own repository (R27.14).
  if (coder === "issue-radar" && mode === "plans-repo")
    fail(`${label}.coder cannot be issue-radar in plans-repo mode.`);
  const baseBranch = name(value.baseBranch, `${label}.baseBranch`, {
    optional: true,
  });
  // GitHub closes issues only from merges into the default branch (R16.5).
  if (mode && !baseBranch)
    fail(`${label}.baseBranch must name the repository's default branch.`);
  if (
    value.concurrency !== undefined &&
    (!Number.isSafeInteger(value.concurrency) ||
      value.concurrency < 1 ||
      value.concurrency > 100)
  )
    fail(`${label}.concurrency must be a whole number from 1 to 100.`);
  if (
    value.dependencyText !== undefined &&
    typeof value.dependencyText !== "boolean"
  )
    fail(`${label}.dependencyText must be true or false.`);
  const managedLabels = onlyKeys(
      value.managedLabels ?? {},
      MANAGED_LABEL_KEYS,
      `${label}.managedLabels`,
    ),
    managed = Object.fromEntries(
      MANAGED_LABEL_KEYS.filter((key) => Object.hasOwn(managedLabels, key)).map(
        (key) => [
          key,
          name(managedLabels[key], `${label}.managedLabels.${key}`),
        ],
      ),
    ),
    managedNames = new Set(Object.values(managed).map(lower));
  if (managedNames.size !== Object.keys(managed).length)
    fail(`${label}.managedLabels must use a different label for each state.`);
  if (value.rules !== undefined && !Array.isArray(value.rules))
    fail(`${label}.rules must be a list.`);
  const rules = (value.rules || []).map((rule, index) =>
      ruleInput(rule, `${label}.rules[${index}]`),
    ),
    ruleIds = new Set();
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) fail(`${label} repeats rule ID ${rule.id}.`);
    ruleIds.add(rule.id);
    for (const trigger of [...rule.labelsAll, ...rule.labelsAny])
      if (managedNames.has(lower(trigger)))
        fail(
          `${label} rule ${rule.id} uses managed label ${trigger} as a trigger.`,
        );
  }
  // Avoozl shows a responder at work with this label (R27.2).
  if (rules.some((rule) => rule.action === "respond") && !managed.responding)
    fail(
      `${label} has a respond rule, so managedLabels.responding must name its label.`,
    );
  // `priorityLabels` is the newer name for `priority`; both are one list.
  if (value.priority !== undefined && value.priorityLabels !== undefined)
    fail(
      `${label} has both priority and priorityLabels; use only priorityLabels.`,
    );
  const priorityKey =
      value.priorityLabels !== undefined ? "priorityLabels" : "priority",
    priority = names(value[priorityKey], `${label}.${priorityKey}`),
    // Labels that mean "waiting on someone outside": the task waits with
    // the reason "Waiting on the author" while one is on its item.
    waitingLabels = names(value.waitingLabels, `${label}.waitingLabels`);
  for (const entry of [...priority, ...waitingLabels])
    if (managedNames.has(lower(entry)))
      fail(
        `${label}.${priority.includes(entry) ? priorityKey : "waitingLabels"} cannot use managed label ${entry}.`,
      );
  const crewInput = onlyKeys(
      value.crewLabels ?? {},
      CREW_LABEL_KEYS,
      `${label}.crewLabels`,
    ),
    crewLabels = Object.fromEntries(
      CREW_LABEL_KEYS.map((key) => [
        key,
        Object.hasOwn(crewInput, key)
          ? name(crewInput[key], `${label}.crewLabels.${key}`)
          : CREW_LABEL_DEFAULTS[key],
      ]),
    );
  if (lower(crewLabels.claim) === lower(crewLabels.needsHuman))
    fail(`${label}.crewLabels must use a different label for each state.`);
  for (const entry of Object.values(crewLabels))
    if (managedNames.has(lower(entry)))
      fail(`${label}.crewLabels cannot use managed label ${entry}.`);
  // A crew writes these with the owner's login, so they must never start
  // Avoozl work (R52.9).
  const crewNames = new Set(Object.values(crewLabels).map(lower));
  for (const rule of rules)
    for (const trigger of [...rule.labelsAll, ...rule.labelsAny])
      if (crewNames.has(lower(trigger)))
        fail(
          `${label} rule ${rule.id} uses Issue Radar's label ${trigger} as a trigger; crews write it with your login.`,
        );
  const allowedActors = names(value.allowedActors, `${label}.allowedActors`),
    // A repository that names nobody defaults to people with write access
    // (owner decision 2026-11-12, R10.2): the same people who can push could
    // start the work by hand. Naming actors or a permission replaces it.
    minimumPermission =
      permission(value.minimumPermission, `${label}.minimumPermission`) ??
      (allowedActors.length ? null : DEFAULT_PERMISSION);
  const pullRequestReviews = reviewsInput(
    value.pullRequestReviews,
    `${label}.pullRequestReviews`,
  );
  const commentSteering = steeringInput(
      value.commentSteering,
      `${label}.commentSteering`,
    ),
    discussions = discussionsInput(value.discussions, `${label}.discussions`),
    untriaged = untriagedInput(
      value.untriaged,
      `${label}.untriaged`,
      managedNames,
    );
  return {
    checkout: name(value.checkout, `${label}.checkout`, { optional: true }),
    folder: name(value.folder, `${label}.folder`, { optional: true }),
    baseBranch,
    coder,
    allowedActors,
    minimumPermission,
    requiredChecks: names(value.requiredChecks, `${label}.requiredChecks`),
    pullRequestReviews,
    concurrency: value.concurrency ?? 1,
    dependencyText: value.dependencyText === true,
    priority,
    waitingLabels,
    managedLabels: managed,
    crewLabels,
    // GitHub's rules; a rule with source: matches only that intake
    // source's items (design §4.12), so GitHub code never sees it.
    rules: rules.filter((rule) => !rule.source),
    // Set only when a rule names a source, so a policy without one keeps
    // its old shape.
    ...(rules.some((rule) => rule.source)
      ? { sourceRules: rules.filter((rule) => rule.source) }
      : {}),
    // Deferred features (task 8.2), each off by default.
    stackedPullRequests: value.stackedPullRequests === true,
    commentSteering,
    discussions,
    untriaged,
  };
}

// The Untriaged list's settings (design §8.5, R49.3-R49.5), each optional.
export const UNTRIAGED_MAX_DAYS = 3650;
function untriagedInput(value, label, managedNames) {
  const input = onlyKeys(
    value ?? {},
    ["filter", "triageLabels", "ignoreOlderThanDays", "notify"],
    label,
  );
  let filter = null;
  if (input.filter !== undefined && input.filter !== null) {
    if (typeof input.filter !== "string")
      fail(`${label}.filter must be a GitHub search line.`);
    filter = input.filter.trim() || null;
    if (filter) parseMatch(filter, `${label}.filter`, { needLabel: false });
  }
  const triageLabels = names(input.triageLabels, `${label}.triageLabels`);
  for (const entry of triageLabels)
    if (managedNames.has(lower(entry)))
      fail(`${label}.triageLabels cannot use managed label ${entry}.`);
  const days = input.ignoreOlderThanDays ?? null;
  if (
    days !== null &&
    (!Number.isSafeInteger(days) || days < 1 || days > UNTRIAGED_MAX_DAYS)
  )
    fail(
      `${label}.ignoreOlderThanDays must be a whole number from 1 to ${UNTRIAGED_MAX_DAYS}.`,
    );
  if (input.notify !== undefined && typeof input.notify !== "boolean")
    fail(`${label}.notify must be true or false.`);
  return {
    filter,
    triageLabels,
    ignoreOlderThanDays: days,
    notify: input.notify === true,
  };
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

// The crews a user must configure in Issue Radar: one per single-repo
// repository it codes, scoped to exactly that repository's ready label
// (R17.4). Avoozl never reads or writes the crew records themselves (F23).
export function issueRadarCrews(policy) {
  if (policy?.mode !== "single-repo") return [];
  return Object.entries(policy.repositories || {})
    .filter(([, repository]) => repository.coder === "issue-radar")
    .map(([repository, entry]) => ({
      repository,
      label: entry.managedLabels?.ready ?? null,
      link: ISSUE_RADAR_PATH,
    }));
}

// The `github` block of `.avoozl.json`. `issueIntake` and `queue` are the
// older settings; repository-settings.mjs validates them.
export function normalizeGitHubPolicy(value) {
  if (value === undefined || value === null) value = {};
  onlyKeys(value, [...LEGACY_KEYS, ...POLICY_KEYS], "github");
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
  const defaultAuthority = local
    ? "local"
    : (value.defaultAuthority ?? (mode ? "github" : "local"));
  if (!["github", "local"].includes(defaultAuthority))
    fail("github.defaultAuthority must be github or local.");
  if (defaultAuthority === "github" && !mode)
    fail("github.defaultAuthority github needs a github.mode.");
  const repositories = value.repositories ?? {};
  if (!record(repositories))
    fail("github.repositories must contain a JSON object.");
  return {
    mode,
    planningRepository,
    defaultAuthority,
    project: projectInput(value.project),
    epicIssueType: name(value.epicIssueType, "github.epicIssueType", {
      optional: true,
    }),
    subIssues: subIssuesInput(value.subIssues),
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

// Authority for a task a plan approval creates (§3.2, R28.2–R28.3).
export function newTaskAuthority(policy, requested) {
  if (requested === "local") return "local";
  if (typeof requested === "string" && requested.startsWith("plugin:"))
    return requested;
  return policy?.mode && policy.defaultAuthority !== "local"
    ? "github"
    : "local";
}

// A registered repository from before the policy: its single ready label
// becomes one deliver rule with the same assignee and actor checks.
export function legacyRepositoryPolicy(config) {
  return {
    baseBranch: null,
    allowedActors: [...(config.allowedActors || [])],
    minimumPermission: config.minimumPermission || "write",
    managedLabels: config.managedLabel ? { managed: config.managedLabel } : {},
    rules: [
      {
        id: "intake",
        action: "deliver",
        labelsAll: [config.label || "avoozl:ready"],
        labelsAny: [],
        labelsNone: [],
        assignee: config.assignee || null,
        author: null,
        autoPublishChildren: false,
      },
    ],
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

// Whether `login`, holding `held` permission, may trigger rules in this
// repository. Both checks apply when both are set; with neither, nobody may.
export function actorAllowed(repository, login, held) {
  if (!login)
    return { allowed: false, reason: "The trigger event has no actor." };
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

const labelName = (label) => (typeof label === "string" ? label : label?.name);

function eventKey(event) {
  return String(event.node_id || event.id || "");
}

// Rules whose labels, assignee and author hold on the issue now, each with
// the newest event that made it true. Pure: the actor check is separate.
export function matchingRules(repository, issue, events = []) {
  const labels = new Set(
      (issue.labels || []).map(labelName).filter(Boolean).map(lower),
    ),
    assignees = new Set(
      (issue.assignees || [])
        .map((entry) => entry?.login)
        .filter(Boolean)
        .map(lower),
    ),
    author = issue.user?.login ? lower(issue.user.login) : null,
    ordered = events
      .map((event, index) => ({ event, index }))
      .sort(
        (left, right) =>
          String(left.event.created_at || "").localeCompare(
            String(right.event.created_at || ""),
          ) || left.index - right.index,
      )
      .map(({ event }) => event);
  // Issue Radar's labels: a crew adds and removes them with the owner's
  // login, so their events never make a rule true (R52.9).
  const crew = new Set(
      Object.values(repository.crewLabels || CREW_LABEL_DEFAULTS).map(lower),
    ),
    matches = [];
  for (const rule of repository.rules || []) {
    const all = rule.labelsAll.map(lower),
      any = rule.labelsAny.map(lower),
      none = rule.labelsNone.map(lower);
    if (!all.every((label) => labels.has(label))) continue;
    if (any.length && !any.some((label) => labels.has(label))) continue;
    if (none.some((label) => labels.has(label))) continue;
    if (rule.assignee && !assignees.has(lower(rule.assignee))) continue;
    if (rule.unassigned && assignees.size) continue;
    if (rule.author && author !== lower(rule.author)) continue;
    // Only events whose effect still holds count: a label still present, an
    // excluded label still absent, an assignee still assigned.
    const positive = new Set([...all, ...any]),
      trigger = ordered.findLast((event) => {
        const label = event.label?.name ? lower(event.label.name) : null;
        if (label && crew.has(label)) return false;
        if (event.event === "labeled") return positive.has(label);
        if (event.event === "unlabeled") return none.includes(label);
        if (event.event === "assigned")
          return (
            Boolean(rule.assignee) &&
            lower(event.assignee?.login || "") === lower(rule.assignee)
          );
        return false;
      });
    matches.push({
      rule: rule.id,
      action: rule.action,
      eventId: trigger ? eventKey(trigger) : "",
      actor: trigger?.actor?.login || "",
      at: trigger?.created_at || "",
    });
  }
  return matches;
}

// Matching rules with the actor check applied. `permissionOf(login)` returns
// the actor's repository permission name; it is called once per actor, and
// only when the permission decides: not with no minimumPermission, and not
// for an actor allowedActors already refuses. Reading another person's
// permission needs push access; GitHub's 403 there makes the match
// `unchecked` (never allowed) instead of failing the whole read.
export async function evaluateRules(repository, issue, events, permissionOf) {
  const held = new Map(),
    result = [];
  for (const match of matchingRules(repository, issue, events)) {
    const actors = repository.allowedActors || [],
      reads =
        match.eventId &&
        match.actor &&
        repository.minimumPermission &&
        (!actors.length ||
          actors.some((actor) => lower(actor) === lower(match.actor)));
    if (reads && !held.has(match.actor))
      held.set(
        match.actor,
        await Promise.resolve(permissionOf(match.actor)).catch((error) => {
          if (error?.status === 403) return UNCHECKED;
          throw error;
        }),
      );
    const value = reads ? held.get(match.actor) : null;
    if (value === UNCHECKED) {
      result.push({
        ...match,
        permission: null,
        allowed: false,
        unchecked: true,
        reason: uncheckedReason(repository, match.actor),
      });
      continue;
    }
    const permission = reads ? value || "none" : null,
      check = match.eventId
        ? actorAllowed(repository, match.actor, permission)
        : { allowed: false, reason: "No event made this rule true." };
    result.push({ ...match, permission, ...check });
  }
  return result;
}

const UNCHECKED = Symbol("unchecked");

// Why an actor's permission could not be checked: GitHub shows another
// person's permission only to a sign-in with push access.
export function uncheckedReason(repository, actor) {
  return `Avoozl's GitHub sign-in needs write access to this repository to check who counts (minimumPermission ${repository.minimumPermission} for ${actor}). Give it write access, or name the people in allowedActors and clear minimumPermission.`;
}
