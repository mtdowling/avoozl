# GitHub

GitHub is optional: a workspace can keep spec issues and land pull requests on
GitHub, or run entirely on local Git. The `github.mode` setting decides which.

```json [.avoozl.json]
{
  "github": {
    "mode": "single-repo",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main"
      }
    }
  }
}
```

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

On the page, **Settings › Repository setup** gives each repository a **Role**:
**Local only**, **Code repository**, **Planning repository** or **Code and
planning**. Saving the roles writes `github.mode` and
`github.planningRepository`.

A repository's `baseBranch` must be its GitHub default branch when a mode is
set, because GitHub closes issues only from merges into the default branch.

### Plans repository

Plans-repo mode keeps spec issues and specs in a planning repository and
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

The planning repository's `.avoozl.json` can set `specs.branch` to a branch
such as `avoozl-plans` and `specs.path` to a repository-relative folder such
as `docs/specs`. The folder defaults to `.kiro/specs`. For the file layout,
see [Spec folders](github-workflow.md#1-spec-folders).

## Setting up GitHub

Add a checkout with `avoozl repository configure ID --root PATH`, link it to
GitHub with `avoozl github configure OWNER/REPO --repo ID`, set `github.mode`
in `.avoozl.json`, then run `avoozl rebuild`. Rebuild reads git and GitHub and
writes nothing to GitHub. Public and private repositories both work.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-sync-desktop-dark.png">
  <img alt="Settings, GitHub tab, Sync pace: cache seconds and write limits" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-sync-desktop-light.png" width="800">
</picture>

```sh
avoozl repository configure app --root ../app
avoozl github configure example-org/app --repo app
avoozl rebuild
```

Branch rules and labels are the repository owner's to set on GitHub; Avoozl
reads branch rules and follows them. Avoozl never creates a label. An issue
write that needs a missing label fails, and the error names the label to
create.

Each GitHub write that sets up a repository or deletes on GitHub is high
risk: Avoozl shows the repository, the action and the exact permissions, and
waits for **Allow** (or `--yes` in the CLI) before it asks for a token.

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
keep the person's git author and committer (`user.name`, `user.email`).
**Settings › GitHub › GitHub calls** shows one sign-in line per provider in
use, and the calls of the last hour by source and by login.

## Spec issues

Tasks always live in the workspace database. A task in a spec never gets a
GitHub issue, and it completes when its work lands. A spec gets one issue: the
tick publishes it once the spec is approved, and its assignee drives the spec.
`avoozl spec publish SPEC` makes the issue again after a failure, and
publishing an issue that exists writes nothing.

## Labeled issues

A label alone is no order. An open issue becomes one task, `issue-<n>`, when a
writer adds every label in the repository's `labels.require` and the issue is
assigned to this runner's login; that label is the approval. The issue's title
is the task's title and its body is its done bullet. The task lands like any
other and closes the issue: `pr` landing writes `Closes #<n>` in the pull
request, and `direct` landing closes the issue with a comment naming the
landed commit.

Avoozl does not triage issues or review other people's pull requests. Any
agent runner, such as Issue Radar, can do that with the skills
Avoozl ships; see [Agent skills](agent-skills.md).

## Stopping a spec

A writer stops a spec by adding the stop label to its spec issue. The default
is `avoozl:stopped`, and `labels.stop` names another. A stop on a parent
spec's issue stops every spec it links, and only a writer's removal clears it.
See [Stopping a spec](github-workflow.md#10-stopping-a-spec).

## Pull-request reviews

GitHub owns the review of a task that lands as a pull request. When the base
branch's ruleset or branch protection requires approving reviews, Avoozl keeps
the pull request waiting until it has as many approvals as the rule asks.
There is no Avoozl setting for it, so change the rule on GitHub.

- Each reviewer's newest `APPROVED`, `CHANGES_REQUESTED` or dismissed review
  decides that reviewer's vote, and only `APPROVED` counts.
- When the rule requires the last push to be approved, only approvals on the
  exact head count. Otherwise an approval counts while GitHub still shows it.
- GitHub's rule decides who may approve when the merge is made.

The review roles in `delivery.reviewers` are Avoozl's own agent reviews. They
judge every task's commit before it lands, and GitHub's required reviews still
gate the merge.

## Discussions

The `discussions` setting on a repository entry turns on replies to GitHub
Discussions. It is off unless set, and it is tested against a fake GitHub
only.

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
