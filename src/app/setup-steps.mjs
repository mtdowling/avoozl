// The GitHub writes of private mirror setup (mirror-setup.mjs): the labels
// Avoozl uses, a branch rule that requires the CI check, and the
// repository's auto-merge setting.
import {
  RADAR_DEFAULTS,
  RADAR_FIXED_LABELS,
  READY_LABEL_DEFAULT,
} from "./github-policy.mjs";
import { parseRepository } from "./github.mjs";

const RULESET_NAME = "avoozl-required-check",
  COLORS = {
    plan: "5319e7",
    ready: "0e8a16",
    conflict: "d93f0b",
    approval: "1d76db",
    review: "fbca04",
    drafted: "c5def5",
  };

export function labelsWanted(settings) {
  const radar = { ...RADAR_DEFAULTS, ...settings.radar };
  return [
    { name: radar.planLabel, color: COLORS.plan },
    {
      name: settings.managedLabels?.ready ?? READY_LABEL_DEFAULT,
      color: COLORS.ready,
    },
    { name: RADAR_FIXED_LABELS.conflict, color: COLORS.conflict },
    { name: RADAR_FIXED_LABELS.approval, color: COLORS.approval },
    { name: radar.reviewLabel, color: COLORS.review },
    { name: radar.draftedLabel, color: COLORS.drafted },
  ];
}

export async function writeSetupStep(github, repository, step) {
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
  else
    await github.request("PATCH", `/repos/${owner}/${repo}`, {
      body: { allow_auto_merge: true },
    });
}
