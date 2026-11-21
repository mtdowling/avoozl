# Workflow kit

The kit is a set of sample repositories with the answers a runner must give for
each, and scenarios that check what runners do over time. Any runner can read
it, because a case is plain files and one JSON document. The
[scenarios page](../docs/github-workflow-scenarios.md) shows every case as
Given, When and Then.

```text
workflow-kit/cases/serial-list-next/
  case.json
  repo/.kiro/specs/parser/tasks.md
```

`repo/` is the specs branch's tree. `case.json` holds the rest:

```json
{
  "title": "A task waits for the one above it",
  "rules": [
    "3.1",
    "12.1",
    "15.1"
  ],
  "runner": {
    "login": "acme-alice",
    "defaultBranch": "main"
  },
  "origin": {
    "branches": [
      "main"
    ],
    "behind": []
  },
  "issues": {
    "parser": [
      "acme-alice"
    ]
  },
  "expect": {
    "ready": [
      "parser/p-2"
    ],
    "claim": {
      "branch": "avoozl/parser/p-2",
      "base": "main",
      "mergeBase": false
    }
  },
  "expectFail": {
    "ready": "sim-2.1",
    "claim": "sim-1.1"
  }
}
```

| Field | Meaning |
| --- | --- |
| `rules` | The numbered rules of workflow v1 the case checks |
| `runner` | The login the runner acts as, and the repository's default branch |
| `origin.branches` | Every branch on origin, claim branches and lease refs included |
| `origin.behind` | Integration branches that do not yet hold the default branch's head |
| `origin.leases` | Each task's leases as `{generation, ageHours}`, by `spec/task`, with `released: true` on a released lease |
| `origin.claimAgeHours` | Hours since each claim branch's newest commit, by `spec/task` |
| `origin.graph` | The commits a case names, as `{commit: [parents]}` |
| `origin.heads` | The head commit of each branch the case reads, by branch name |
| `origin.taskFiles` | For an integration branch, the specs whose task file it holds. A branch missing here holds every spec's |
| `origin.mergedPullHeads` | Head ref names of merged pull requests, claim branches GitHub deleted included |
| `issues` | Each spec's issue assignees, by spec name. A spec missing here has no issue |
| `stops` | The specs whose issue carries a writer's stop label |
| `issueList` | Present on marker cases: each issue's `number`, `state`, `author` and `body` |
| `writers` | The logins with write access, when a case needs to tell them from strangers |
| `approvers` | The logins that may approve a spec, with `history` |
| `approvalTrust` | `github` (unset) or `branch-protection`, the repository's setting for rule 7.2 |
| `history` | The specs branch's commits, oldest first, each `{commit, author}` and, when GitHub says so, `mergedBy` (who merged its pull request) and `signer` (who signed it with a verified signature). `author` is the login the commit's author email names, which proves nothing under `github`. The files a commit changes are under `commits/<commit>/` |
| `land` | Present on landing cases: the task, the landing `mode`, `pr`, whether `checks` pass, whether the base moved, and the `claim` as `{start, head, pull}`, where `pull` is `{merged, head}` for a merged pull request of the claim branch |
| `push` | Present on takeover cases: the claim `branch` and each runner's push, `{runner, head}` |
| `revision` | Present on revision cases: the `task` and the `lease` text it recorded, `{title, acceptance}` |
| `manual` | Present on manual task cases: the `task` |
| `actions` | Present on section 20 cases: the actions a runner is asked to take |
| `resume` | Present on resume cases: the task, and the runners that act as one login and try to take its claim, in the order their creates reach GitHub |
| `expect` | The probes the runner answers |
| `expectFail` | A probe the runner is known to fail, with the task that fixes it |
| `runners` | Present on scenarios: each runner's name and the login it acts as |
| `landing` | Present on scenarios: the landing `mode`, and `pr` for `pr` mode |
| `repository` | Present on scenarios: `deleteBranchOnMerge`, whether GitHub deletes a pull request's head branch when it merges |
| `steps` | Present on scenarios: what the runners do, in order |
| `then` | Present on scenarios: the state the steps end in, in place of `expect` |
| `variants` | Other inputs for the same case, by name, each holding the fields it replaces |

A box marked `x` in `repo/` is ticked on the specs branch. `runner.specsBranch`
names the specs branch when it is not the default branch, and
`runner.staleHours` sets the hours after which a claim or lease is stale.

A case with no `history` has every spec approved. A case with a `history` has
the commits it lists, and `repo/` holds the files as the last commit leaves
them. A spec is approved as rule 7.3 says, with the authors in `approvers`.

## Probes

| Probe | A runner answers with |
| --- | --- |
| `violations` | For each spec name, the sorted rule numbers its text breaks |
| `approved` | For each spec name, whether its current text is approved |
| `ready` | The ready tasks as `spec/task`, the one to take first at the front |
| `claim` | The claim branch for the first ready task, the branch it starts from, and whether the default branch is merged in first |
| `resume` | For the `resume` task, the `holder` runner that gets the lease or `null`, the `lease` ref it creates or `null`, and the runners that `stopped` |
| `landed` | Whether the `land` claim holds landed work, from its graph |
| `push` | For each runner of `push`, `accepted` or `rejected` |
| `revision` | `land` when the lease's text is the task's current approved text, else `redo-or-stop` |
| `manualTick` | The `branch` a person ticks the `manual` task on |
| `limits` | For each of `actions`, the section 20 rule it breaks, or `null` |
| `landing` | The `action`, `base`, `tick`, `mergeBase` and `deleteClaimBranch` for the `land` task, and `mergeGuard` `head-sha` when the runner merges a pull request, or only `{"action": "none"}` when checks fail |
| `specIssues` | For each spec name, the number of the issue that is its spec issue, or `null` |
| `duplicates` | The numbers of the issues the runner closes as duplicates, in order |

A case checks only the probes in its `expect`. `landing.action` is one of
`fast-forward-base`, `open-draft-pull-request`, `open-pull-request`,
`open-and-merge-pull-request`, `push-claim-branch`, `tick-landed-work` or
`none`. For `tick-landed-work`, `base` is the done branch that gets the tick.

A case belongs to the required profile unless one of its `rules` is in an
optional part of the workflow page's optional parts table. A runner runs the
cases of the required profile and of each optional part it supports.

## Scenarios

A scenario has `steps` and `then` in place of `expect`. Each step names a
runner and one of the actions in the [adapter contract](#adapter-contract), and
the runners take turns in the order the steps list. Two runners race for one
task like this:

```json
{
  "runners": {
    "A": "acme-alice",
    "B": "acme-alice"
  },
  "steps": [
    {
      "runner": "A",
      "do": "next"
    },
    {
      "runner": "B",
      "do": "next"
    },
    {
      "runner": "A",
      "do": "claim",
      "expect": {
        "claimed": "avoozl/parser/p-2"
      }
    },
    {
      "runner": "B",
      "do": "claim",
      "expect": {
        "claimed": null
      }
    }
  ],
  "then": {
    "claims": {
      "A": "parser/p-2",
      "B": null
    },
    "leaseHolder": {
      "parser/p-2": "A"
    }
  }
}
```

A step's `expect` lists keys of its own result, and the scenario fails at the
first step that differs. A step with `"pause": true` leaves its runner idle
while the steps after it run, until the runner's next step. A scenario fails
when a paused runner never acts again.

`then` lists the probes of the final state. Each is judged like a snapshot
probe, and `expectFail` can mark one.

| Probe | The final state |
| --- | --- |
| `claims` | For each runner that claimed, the task it holds or `null` |
| `leaseHolder` | For each listed task, the runner that made its newest lease |
| `leases` | For each listed task, the lease generations on origin |
| `branches` | The claim branches on origin, sorted |
| `rejectedPushes` | The runners with a push that GitHub rejected, sorted |
| `ticked` | The tasks ticked on their done branches, sorted |
| `pullRequests` | For each pull request's head branch, its `state`, who merged it and whether the merge has a verified signature |
| `ready` | The ready tasks, as `next` answers them at the end |

A case with `variants` is also run once per variant. A variant replaces the
fields it names, such as `runners`, `steps` and `then`, and adds its `title`
after the case's.

## Adapter contract

A runner takes part in a scenario by implementing the actions below. Each takes
the step's arguments, acts as the step's runner against the repository and
GitHub, and returns the keys listed. The runner decides each action as the
[workflow](../docs/github-workflow.md) says, so a rule it does not follow
shows as a failed probe.

| `do` | Arguments | The runner | Returns |
| --- | --- | --- | --- |
| `next` | | Reads the specs and GitHub, and ranks the ready tasks (13) | `ready` |
| `claim` | `task` (default: the first of `next`) | Creates the claim branch and the first lease (15.1) | `claimed`, the branch or `null`, and `base` and `lease` |
| `readLeases` | `task` | Reads the generations of the task's leases (15.3) | `generations` |
| `takeOver` | `task`, `afterHours` | Takes the next lease of a claim, which the clock `afterHours` after its last commit makes stale, and pushes its takeover commit (15.7, 15.8) | `holder`, whether it took the lease, and `lease` |
| `push` | `task` or `branch`, `files` | Pushes a commit to the task's claim branch, or to `branch`, never forced | `push`, `accepted` or `rejected` |
| `land` | `task`, `mode`, `pr`, `checks`, `interrupt` | Decides the landing from the mode and the checks, ticks, and lands (16, 17). `interrupt: "before-tick"` stops after the work reaches the base and before the tick | `action`, and `landed` or `pull` |
| `recover` | `task` | Reads whether the claim holds landed work, then ticks it on its done branch and deletes the claim branch and leases (16.5) | `action` and `landed` |
| `mergePr` | `task` | Merges the task's open pull request at its head, as the step's runner (a person, in the scenarios) | `merged` |
| `deleteBranch` | `task` or `branch` | Deletes a claim branch with its leases, as a person does (15.4) | `deleted` |

A `push` with `branch` and `files` writes each file, so a scenario changes
an approved task text this way. A `land` step first compares the task text its
lease recorded with the text now approved (15.10), and returns `action: "none"`
with `revision: "redo-or-stop"` when they differ.

### Avoozl's adapter

Avoozl's adapter is `src/app/test/workflow-kit-scenario.mjs`. It calls Avoozl's
own claim, lease, landing and tick code, and runs it against a bare local git
repository with a fake GitHub API over it (`workflow-kit-world.mjs`). The fake
API keeps pull requests, merges with `merged_by`, deletes a head branch when
the repository says so, and signs the commits it makes. A rejected push is
git's own answer. Nothing uses a network or a real GitHub, so the scenarios run
in CI as they do on a laptop.

Avoozl has no takeover push, so `takeOver` takes the lease and pushes
nothing, and the stale holder scenario marks `rejectedPushes` with
`expectFail`.

## Running it

`load.ts` exports `readCases()`, which returns each case with its `files`, and
`judge(case, got)`, which compares a runner's answers with `expect` and returns
`pass`, `fail`, `expected-fail` or `unexpected-pass` for each probe.

Avoozl runs the kit in `src/app/test/workflow-kit.test.mjs` as part of its
tests, and the same test fails when the scenarios page is out of date. Run
`npm run kit:docs` to write it again. A probe with `expectFail` passes while Avoozl gets it wrong. The test
fails once Avoozl gets it right, or once the named task is ticked in
`.kiro/specs/simplify/tasks.md`, and the mark is then removed.
