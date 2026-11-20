// Setup's GitHub steps for a repository that lands by pull request
// (Requirement 89.3, design §4.26, task 42.3): the base branch's ruleset
// requires the named checks, the repository allows exactly the chosen merge
// methods, and the CI variable says Avoozl lands here. Each head Avoozl
// verified gets the `avoozl/verify` commit status (`postVerified`).
//
// The ruleset step adds only the missing checks. A ruleset on the base that
// already has a required-checks rule gets those checks added to that rule,
// never a second rule or ruleset, whatever its enforcement: a disabled gate
// stays disabled. Only with no such rule is the Avoozl ruleset created.
// Each step is a preview first; a run with nothing to change writes nothing.
//
// shortcut: a ruleset applies to the base only through `~ALL`,
// `~DEFAULT_BRANCH` or the exact `refs/heads/<base>`; glob patterns are not
// matched. Upgrade if a repository names its base by a pattern.
import { parseRepository } from "./github.mjs";
import { fail } from "../store/store.mjs";
import { asJob, confirmStep, withJob } from "./github-jobs.mjs";

export const RULESET_NAME = "avoozl-required-check";
export const LANDING_VARIABLE = { name: "AVOOZL_LANDING", value: "pr" };
export const VERIFY_CONTEXT = "avoozl/verify";
const METHOD_KEYS = Object.freeze({
  merge: "allow_merge_commit",
  squash: "allow_squash_merge",
  rebase: "allow_rebase_merge",
});
const CHECKS = "required_status_checks";

const applies = (ruleset, base, defaultBranch) =>
  (ruleset?.target ?? "branch") === "branch" &&
  (ruleset?.conditions?.ref_name?.include ?? []).some(
    (ref) =>
      ref === "~ALL" ||
      ref === `refs/heads/${base}` ||
      (ref === "~DEFAULT_BRANCH" && base === defaultBranch),
  );

function landingInput({ repository, base, checks, methods }) {
  parseRepository(repository);
  if (typeof base !== "string" || !base.trim() || base.startsWith("-"))
    fail("Setup needs a base branch.", 400);
  if (!Array.isArray(checks) || !checks.length)
    fail(
      "Setup needs the repository's required checks: name them under Edit repository > Landing.",
      400,
    );
  for (const name of checks)
    if (typeof name !== "string" || !name.trim())
      fail("A required check name must be text.", 400);
  if (!Array.isArray(methods) || !methods.length)
    fail("Setup needs at least one merge method.", 400);
  for (const method of methods)
    if (!METHOD_KEYS[method])
      fail(`Merge method ${method} must be merge, squash or rebase.`, 400);
  return { repository, base, checks: [...new Set(checks)], methods };
}

// Steps: [{ id, status: "ok" | "change" | "blocked", detail, write? }].
// Reads only.
export async function previewLanding(github, input) {
  const { repository, base, checks, methods } = landingInput(input),
    remote = await github.repository(repository);
  if (!remote) fail(`${repository} was not found.`, 404);
  const admin = remote.permissions?.admin === true,
    steps = [];
  // Each write is the high-risk landing-setup job (plugin-credentials
  // PC13.3): the confirm lists it with its permissions and allows it.
  const step = (id, changed, detail, write) =>
    steps.push(
      !changed
        ? { id, status: "ok", detail }
        : admin
          ? {
              id,
              status: "change",
              detail,
              write,
              ...confirmStep({
                job: "landing-setup",
                target: repository,
                action: detail,
              }),
            }
          : {
              id,
              status: "blocked",
              detail,
              permission:
                "Administration on the repository (Repository administration: write)",
            },
    );

  // Ruleset: add only what is missing, to the rule that already exists.
  const rulesets = (
      await asJob("rules-read", github).rulesets(repository)
    ).filter((ruleset) => applies(ruleset, base, remote.default_branch)),
    holder = rulesets.find((ruleset) =>
      (ruleset.rules ?? []).some((rule) => rule.type === CHECKS),
    ),
    rule = holder?.rules.find((r) => r.type === CHECKS),
    have = new Set(
      (rule?.parameters?.required_status_checks ?? []).map((c) => c.context),
    ),
    missing = checks.filter((name) => !have.has(name));
  if (holder) {
    const rules = holder.rules.map((r) =>
      r !== rule
        ? r
        : {
            ...r,
            parameters: {
              ...r.parameters,
              required_status_checks: [
                ...r.parameters.required_status_checks,
                ...missing.map((context) => ({ context })),
              ],
            },
          },
    );
    step(
      "ruleset",
      missing.length > 0,
      missing.length
        ? `Add ${missing.join(", ")} to ruleset ${holder.name} on ${base}.`
        : `Ruleset ${holder.name} on ${base} requires ${checks.join(", ")}.`,
      { update: holder.id, body: { rules } },
    );
  } else {
    const own = rulesets.find((ruleset) => ruleset.name === RULESET_NAME),
      added = {
        type: CHECKS,
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: checks.map((context) => ({ context })),
        },
      };
    step(
      "ruleset",
      true,
      `${own ? `Add a required-checks rule to ruleset ${RULESET_NAME}` : `Add the ${RULESET_NAME} ruleset`}: ${base} requires ${checks.join(", ")}.`,
      own
        ? { update: own.id, body: { rules: [...(own.rules ?? []), added] } }
        : {
            create: {
              name: RULESET_NAME,
              target: "branch",
              enforcement: "active",
              conditions: {
                ref_name: { include: [`refs/heads/${base}`], exclude: [] },
              },
              rules: [added],
            },
          },
    );
  }

  // Merge methods: exactly the chosen ones are allowed.
  const want = Object.fromEntries(
      Object.entries(METHOD_KEYS).map(([method, key]) => [
        key,
        methods.includes(method),
      ]),
    ),
    differ = Object.fromEntries(
      Object.entries(want).filter(([key, on]) => remote[key] !== on),
    );
  step(
    "merge-methods",
    Object.keys(differ).length > 0,
    `Allow ${methods.join(", ")} merges only.`,
    { repository: differ },
  );

  // The CI variable.
  const variable = (
    await asJob("rules-read", github).listRepoVariables(repository)
  ).find((v) => v.name === LANDING_VARIABLE.name);
  step(
    "ci-variable",
    variable?.value !== LANDING_VARIABLE.value,
    `Set ${LANDING_VARIABLE.name}=${LANDING_VARIABLE.value}.`,
    { variable: LANDING_VARIABLE },
  );

  // The commit status is posted at landing, not written here.
  steps.push({
    id: "commit-status",
    status: "ok",
    detail: `Each head Avoozl verified gets the ${VERIFY_CONTEXT} status.`,
  });
  return {
    repository,
    steps,
    message: steps.some((s) => s.status !== "ok") ? null : "Nothing to change",
  };
}

// What a repository admin does on GitHub by hand when a write is refused
// (PC13.8), or the permission to grant the sign-in.
const MANUAL = {
  ruleset: (repository, detail) =>
    `On GitHub, open ${repository} › Settings › Rules and do this: ${detail}`,
  "merge-methods": (repository, detail) =>
    `On GitHub, open ${repository} › Settings › General › Pull Requests: ${detail}`,
  "ci-variable": (repository, detail) =>
    `On GitHub, open ${repository} › Settings › Secrets and variables › Actions › Variables: ${detail}`,
};

// Write each `change` step of a preview. Blocked steps write nothing. A
// write the provider refuses, or with no Allow, is skipped with what to do
// by hand, and the other writes still run (PC13.5, PC13.8).
export async function applyLanding(github, preview) {
  const { repository } = preview,
    written = [],
    skipped = [];
  for (const entry of preview.steps) {
    const { id, status, write } = entry;
    if (status !== "change") continue;
    try {
      await withJob("landing-setup", () =>
        write.create
          ? github.createRuleset(repository, write.create)
          : write.update
            ? github.updateRuleset(repository, write.update, write.body)
            : write.repository
              ? github.updateRepository(repository, write.repository)
              : github.setRepoVariable(
                  repository,
                  write.variable.name,
                  write.variable.value,
                ),
      );
      written.push(id);
    } catch (error) {
      skipped.push({
        id,
        reason: error.message,
        manual: [
          MANUAL[id](repository, entry.detail),
          `Or grant the sign-in ${entry.permissionsText ?? "administration: write"} on ${repository}, then run setup again.`,
        ],
      });
    }
  }
  return {
    written,
    skipped,
    message:
      written.length || skipped.length
        ? null
        : (preview.message ?? "Nothing to change"),
  };
}

// Post `avoozl/verify` success on a head Avoozl verified, once: a head that
// already has it gets no second write.
export async function postVerified(github, repository, sha, statuses) {
  const seen =
    statuses ?? (await github.commitStatus(repository, sha)).statuses;
  if (seen.some((s) => s.context === VERIFY_CONTEXT && s.state === "success"))
    return false;
  await asJob("land", github).createCommitStatus(repository, sha, {
    state: "success",
    context: VERIFY_CONTEXT,
    description: "Avoozl verified this head.",
  });
  return true;
}
