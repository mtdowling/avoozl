// Set up steps Avoozl can do through `gh` for an Issue Radar repository
// (RC7.1, design D9): the three labels, a branch rule that requires the CI
// check, the repository's auto-merge setting, a pull request that adds the
// review rules to AGENTS.md, and the Project. Each step is a preview and
// a confirm. A step the token cannot do writes nothing and names the
// permission it needs. After a write the step reads GitHub back and reports
// what it saw. The Project itself is made by Set up GitHub (Requirement 29);
// this step only reads that it exists.
import { createHash } from "node:crypto";
import { ruleBranch, seenCheckNames } from "./github-branch-rules.mjs";
import { READY_LABEL_DEFAULT, RADAR_DEFAULTS } from "./github-policy.mjs";
import { parseRepository } from "./github.mjs";
import { inspectAgentsPr, writeAgentsPr } from "./radar-agents-pr.mjs";
import { fail } from "./store.mjs";

export const SETUP_STEPS = Object.freeze([
  "labels",
  "branch-rule",
  "auto-merge",
  "agents-pr",
  "project",
]);
const RULESET_NAME = "avoozl-required-check",
  COLORS = {
    plan: "5319e7",
    ready: "0e8a16",
    conflict: "d93f0b",
    approval: "1d76db",
    review: "fbca04",
    drafted: "c5def5",
  },
  lower = (value) => String(value).toLocaleLowerCase();

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

function labelsWanted(settings) {
  const radar = { ...RADAR_DEFAULTS, ...settings.radar };
  return [
    { name: radar.planLabel, color: COLORS.plan },
    {
      name: settings.managedLabels?.ready ?? READY_LABEL_DEFAULT,
      color: COLORS.ready,
    },
    { name: radar.conflictLabel, color: COLORS.conflict },
    { name: radar.approvalLabel, color: COLORS.approval },
    { name: radar.reviewLabel, color: COLORS.review },
    { name: radar.draftedLabel, color: COLORS.drafted },
  ];
}

// One step: { id, status, detail, permission?, write?, readBack }.
//   ok       nothing to change
//   change   a confirm writes `write` (a plain description)
//   blocked  the token lacks `permission`; nothing is written
//   input    a value is missing; `detail` names it
//   error    GitHub could not be read; nothing is guessed
async function inspect(github, repository, settings, context = {}) {
  const target = parseRepository(repository),
    steps = [];
  let remote = null,
    error = null;
  try {
    remote = await github.repository(target);
  } catch (reason) {
    error = `GitHub could not be read: ${reason.message}`;
  }
  if (error || !remote)
    return SETUP_STEPS.map((id) => ({
      id,
      status: "error",
      detail: error ?? `${repository} was not found.`,
    }));
  const can = remote.permissions ?? {},
    admin = can.admin === true,
    push = can.admin === true || can.maintain === true || can.push === true;

  // Labels.
  const wanted = labelsWanted(settings),
    have = new Set(
      ((await github.listLabels(target).catch(() => [])) ?? []).map((label) =>
        lower(label.name),
      ),
    ),
    missing = wanted.filter((label) => !have.has(lower(label.name)));
  steps.push(
    !missing.length
      ? {
          id: "labels",
          status: "ok",
          detail: `${wanted.map((l) => l.name).join(", ")} exist.`,
        }
      : !push
        ? {
            id: "labels",
            status: "blocked",
            permission: "Write access to the repository (Issues: write)",
            detail: `Missing labels: ${missing.map((l) => l.name).join(", ")}.`,
          }
        : {
            id: "labels",
            status: "change",
            detail: `Create ${missing.map((l) => l.name).join(", ")}.`,
            write: { create: missing },
          },
  );

  // Branch rule that requires the named CI check(s).
  const named = settings.requiredChecks ?? [];
  let branchStep;
  try {
    const branch = await ruleBranch(github, repository, settings),
      required = (await seenCheckNames(github, repository, branch)).required,
      absent = named.filter((name) => !required.includes(name));
    branchStep = !named.length
      ? {
          id: "branch-rule",
          status: "input",
          detail: `Name the CI check in ${repository}'s requiredChecks setting.`,
        }
      : !absent.length
        ? {
            id: "branch-rule",
            status: "ok",
            detail: `${branch} requires ${named.join(", ")}.`,
          }
        : !admin
          ? {
              id: "branch-rule",
              status: "blocked",
              permission:
                "Administration on the repository (Repository administration: write)",
              detail: `${branch} does not require ${absent.join(", ")}.`,
            }
          : {
              id: "branch-rule",
              status: "change",
              branch,
              detail: `Add the ${RULESET_NAME} ruleset: ${branch} requires ${absent.join(", ")}.`,
              write: { branch, checks: absent },
            };
  } catch (reason) {
    branchStep = {
      id: "branch-rule",
      status: "error",
      detail: `GitHub could not be read: ${reason.message}`,
    };
  }
  steps.push(branchStep);

  // The repository's auto-merge setting.
  steps.push(
    remote.allow_auto_merge === true
      ? {
          id: "auto-merge",
          status: "ok",
          detail: "The repository allows auto-merge.",
        }
      : !admin
        ? {
            id: "auto-merge",
            status: "blocked",
            permission:
              "Administration on the repository (Repository administration: write)",
            detail: "Auto-merge is off.",
          }
        : {
            id: "auto-merge",
            status: "change",
            detail: `Turn on "Allow auto-merge" in ${repository}.`,
            write: { allow_auto_merge: true },
          },
  );

  // The review-rules pull request.
  try {
    steps.push(
      await inspectAgentsPr(github, repository, settings, {
        branch: await ruleBranch(github, repository, settings),
        push,
        check: context.check,
      }),
    );
  } catch (reason) {
    steps.push({
      id: "agents-pr",
      status: "error",
      detail: `GitHub could not be read: ${reason.message}`,
    });
  }

  // The Project is read only here: Set up GitHub makes it and its fields.
  steps.push(
    context.project
      ? {
          id: "project",
          status: "ok",
          detail: `The Project is ${context.project.owner}#${context.project.number}.`,
        }
      : {
          id: "project",
          status: "input",
          detail:
            "No Project is set. Create it and its fields with Set up GitHub.",
        },
  );
  return steps;
}

async function write(github, repository, step) {
  const { owner, repo } = parseRepository(repository);
  if (step.id === "labels")
    for (const label of step.write.create)
      await github.ensureLabel(repository, label);
  else if (step.id === "branch-rule")
    await github.request("POST", `/repos/${owner}/${repo}/rulesets`, {
      body: {
        name: RULESET_NAME,
        target: "branch",
        enforcement: "active",
        conditions: {
          ref_name: {
            include: [`refs/heads/${step.write.branch}`],
            exclude: [],
          },
        },
        rules: [
          {
            type: "required_status_checks",
            parameters: {
              strict_required_status_checks_policy: false,
              required_status_checks: step.write.checks.map((context) => ({
                context,
              })),
            },
          },
        ],
      },
    });
  else if (step.id === "agents-pr")
    await writeAgentsPr(github, repository, step);
  else
    await github.request("PATCH", `/repos/${owner}/${repo}`, {
      body: { allow_auto_merge: true },
    });
}

// Preview every step, or confirm one: `{ step, confirm: true, previewHash }`.
// Returns { repository, steps: [{id, status, detail, permission?, previewHash?}],
// applied?: {id, status, detail} }. A confirm re-reads first, and writes only
// when the step still shows the change the preview hash named.
export async function radarSetup(
  github,
  repository,
  settings,
  input = {},
  context = {},
) {
  const steps = (await inspect(github, repository, settings, context)).map(
    (step) => ({
      ...step,
      ...(step.status === "change"
        ? { previewHash: digest([step.id, step.write]) }
        : {}),
    }),
  );
  const view = steps.map(
    ({ write: _write, branch: _branch, ...shown }) => shown,
  );
  if (input.confirm !== true) return { repository, steps: view };
  const step = steps.find((entry) => entry.id === input.step);
  if (!step) fail(`Name a step to apply: ${SETUP_STEPS.join(", ")}.`, 400);
  if (step.status === "blocked")
    return {
      repository,
      steps: view,
      applied: {
        id: step.id,
        status: "blocked",
        detail: `Nothing changed. ${step.permission} is needed.`,
      },
    };
  if (step.status !== "change")
    fail(`${step.id} has nothing to change (${step.status}).`, 409);
  if (input.previewHash !== step.previewHash)
    fail(
      "GitHub or the request changed since the preview. Preview again, then confirm.",
      409,
    );
  await write(github, repository, step);
  const now = await inspect(github, repository, settings, context),
    after = now.find((entry) => entry.id === step.id);
  return {
    repository,
    steps: now.map(({ write: _write, branch: _branch, ...shown }) => shown),
    applied: {
      id: step.id,
      status: after?.status === "ok" ? "done" : "unverified",
      detail:
        after?.status === "ok"
          ? `Read back: ${after.detail}`
          : `Written, but GitHub does not show it yet: ${after?.detail ?? "unreadable"}`,
    },
  };
}
