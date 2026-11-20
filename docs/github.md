# GitHub

GitHub is optional: a workspace can keep spec issues and land pull requests on
GitHub, or run entirely on local Git. The `github.mode` setting decides which.
Branch rules and labels are the repository owner's to set on GitHub; Avoozl
reads branch rules and follows them.

## How Avoozl signs in

For each owner on a GitHub host, Avoozl signs in with:

1. the [credentials plugin](plugins.md#credentials-part) that claims that
   owner, when one is approved on this machine;
2. else `env`: the token in `AVOOZL_GITHUB_TOKEN`, when it is set;
3. else `gh`: `gh auth token --hostname <host>`.

A credentials plugin is declared only in this machine's `plugins.json`; a
repository's `.avoozl.json` never chooses who Avoozl signs in as. An owner a
plugin claims never falls back to `env` or `gh`, even while the plugin
fails. `GH_TOKEN` and `GITHUB_TOKEN` are `gh`'s to read.

Comments, reviews, labels, pull requests and pushes made with a plugin's
token show the token's login on GitHub, such as `acme-bot[bot]`. Commits
keep the person's git author and committer (`user.name`, `user.email`),
and approvals still count by the commit's author email. **Settings ›
GitHub › GitHub calls** shows one sign-in line per provider in use, and the
calls of the last hour by login.

Each GitHub write that sets up a repository or deletes on GitHub is high
risk: Avoozl shows the repository, the action and the exact permissions, and
waits for **Allow** (or `--yes` in the CLI) before it asks for a token. Avoozl
never makes a label as part of other work; a missing label waits in Needs you
with **Create labels**.

## GitHub modes

`github.mode` gives the workspace one of these modes, and
`github.planningRepository` names the planning repository in plans-repo mode.

| Mode | `github.mode` | Spec issues live in | Pull requests |
| --- | --- | --- | --- |
| Local only | `local` | No issues | None; local merge |
| Plans repository | `plans-repo` | The planning repository | Code repositories |
| Single repository | `single-repo` | The code repository | The same repository |

Local only is the default. Switching to Local only keeps your GitHub settings
in the file, unused, so switching back restores them. In plans-repo mode a
leak screen keeps the planning repository's name out of branches, pull
requests, and comments in the code repositories.

The planning repository's specs may live on a branch other than its base
branch, such as `avoozl-plans`. Name it with `specs.branch`; see
[The specs branch](avoozl-specs.md#the-specs-branch).

### Plans repository

Plans-repo mode keeps spec issues and Kiro specs in a planning repository and
lands code in the code repositories. This example triggers nothing, because work
comes only from approved specs.

```json [.avoozl.json]
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example-org/plans",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "checkout": "../app",
        "allowedActors": [
          "your-login"
        ]
      }
    }
  }
}
```

## Issues

Tasks always live in the workspace database. A task never gets a GitHub
issue, and it completes when its work lands. **Publish issue** gives a spec
one issue. Its assignee drives the spec.

## Setting up GitHub

Give each repository a role, then use **Set up GitHub** under **Settings ›
GitHub**. For a new folder, use **Add repository** and then **Set up GitHub and
import specs**. Both read GitHub first and preview every write, such as the
epic issue type, and nothing is written until you confirm. Public and private
repositories both work.

## Fixes

No label is an order. A fix is one task with no spec files. Start one with
**Deliver this** on an incoming issue, **New fix**, or
`avoozl fix "TEXT" --repo ID`; starting it is the approval.

Avoozl does not triage issues or review other people's pull requests. Any
agent runner, such as Issue Radar or glorp, can do that with the skills
Avoozl ships; see [Agent skills](agent-skills.md).

## Pull-request reviews

GitHub owns the review of a task that lands as a pull request. When the base
branch's ruleset or branch protection requires approving reviews, Avoozl reads
the reviews on the pull request's head commit and releases dependents only when
that commit has as many approvals as the rule asks. There is no Avoozl setting
for it, so change the rule on GitHub.

- A review counts when it is `APPROVED` or `CHANGES_REQUESTED`, on the head
  commit, by a reviewer that `allowedActors` and `minimumPermission` allow.
- One allowed change request on the head holds the task, whatever the approvals.
- `COMMENTED` and dismissed reviews count for nothing. A review on an older
  commit is stale once the head moves. Reviews by anyone else show as ignored.
- A merged pull request without its approvals holds the task's dependents and
  opens a decision. The Delivery view shows the verdict and links to the pull
  request.
- Local review roles (`delivery.reviewers`) apply only to local tasks. Branch
  protection's required reviews still gate the merge itself.

## Discussions

The `discussions` setting on a repository entry turns on replies to GitHub
Discussions. It is off unless set, and it is tested against a fake GitHub only,
so treat it as early.

```json [.avoozl.json]
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example-org/plans",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "allowedActors": [
          "your-login"
        ],
        "discussions": {
          "categories": [
            "Q&A"
          ]
        }
      }
    }
  }
}
```

Each open, unanswered, unlocked discussion in one of `categories` whose author
the policy allows gets one responder session and at most one reply, screened by
the [content rules](content-rules.md) like every post. Discussions must be
turned on for the repository, and the repository needs a local checkout. The
check uses the repository's `allowedActors` and `minimumPermission` (`write`
when it names nobody).

## GitHub rate limit

Every chat and the tick share one GitHub login. See
[GitHub rate limit](rate-limit.md) for how Avoozl stays under its limits.
