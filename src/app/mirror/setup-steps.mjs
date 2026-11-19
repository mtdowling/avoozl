// The GitHub writes of private mirror setup (mirror-setup.mjs): a branch
// rule that requires the CI check, and the repository's auto-merge setting.
import { parseRepository } from "../github/github.mjs";

const RULESET_NAME = "avoozl-required-check";

export async function writeSetupStep(github, repository, step) {
  const { owner, repo } = parseRepository(repository);
  if (step.id === "branch-rule")
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
