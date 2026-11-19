# GitHub

GitHub is optional: a workspace can keep spec issues and land pull requests on
GitHub, or run entirely on local Git. Each repository's role decides which, and
the workspace's GitHub mode follows from the roles.

```sh
avoozl setup OWNER/REPO --repo app --landing pr
avoozl setup OWNER/REPO --repo app --landing pr --yes
```

The first command previews the setup, and `--yes` applies it.

## Repository roles

Each repository has a role, chosen in **Settings › Repository setup**, in
**Edit** or in **Add repository**. Only a repository with a GitHub remote can
take a role other than `local`.

| Role | Issues live in | Pull requests land in | Needs a GitHub remote |
| --- | --- | --- | --- |
| `local` | The workspace database | The repository | No |
| `code` | The planning repository | The repository | Yes |
| `planning` | The repository itself | None | Yes |
| `both` | The repository itself | The repository | Yes |

**Edit** and **Add repository** also offer **Private mirror of a public
repository**, a private copy the work happens in. A mirror keeps its private
specs on an orphan plans branch, and approval pull requests target that
branch.

## GitHub modes

The roles give the workspace one of these modes. Nothing else sets it, and
Avoozl never writes `github.mode` or `github.planningRepository`.

| Mode | `github.mode` | Spec issues live in | Pull requests |
| --- | --- | --- | --- |
| Local only | `local` | No issues | None; local merge |
| Plans repository | `plans-repo` | The planning repository | Code repositories |
| Single repository | `single-repo` | The code repository | The same repository |

Local only is the default. Switching to Local only keeps your GitHub settings
in the file, unused, so switching back restores them. In plans-repo mode a
leak screen keeps the planning repository's name out of branches, pull
requests, and comments in the code repositories.

An `.avoozl.json` with no `role` keys is read through its stored
`github.mode`.

## Issues

Tasks always live in the workspace database. A task never gets a GitHub
issue, and it completes when its work lands. **Publish issue** gives a spec
one issue, its journal.

## Setting up GitHub

Give each repository a role, then use **Set up GitHub** under **Settings ›
GitHub**. For a new folder, use **Add repository** and then **Set up GitHub and
import specs**. Both read GitHub first and preview every write, such as the
epic issue type, and nothing is written until you confirm. Public and private
repositories both work.

## Triage and fixes

No label is an order. With the triage agent on for a repository
(`triage.agent`, off by default), each new issue and pull request gets one
short run with no network. The agent answers a question from the docs,
reproduces a bug and starts a fix, reviews someone else's pull request, or
hands the item to you with a reason. It never closes, approves, or requests
changes.

**GitHub › Issues** and **GitHub › Pull requests** show each item, what the
agent did, and the actions left. **GitHub › Triage agent** shows every run and
has **Pause** and **Stop all**. **Needs you › From the agent** is your queue.

A fix is one task with no spec files. Start one with **Fix** on an issue,
**New fix**, or `avoozl fix "TEXT" --repo ID`; starting it is the approval.

See [policies.md](policies.md) for the triage agent, fixes, and example
policies.
