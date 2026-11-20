# Workflow kit

The kit is a set of sample repositories with the answers a runner must give for
each. Any runner can read it, because a case is plain files and one JSON
document.

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
    "9.1",
    "12.1"
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
| `origin.leases` | Each task's leases as `{generation, ageHours}`, by `spec/task` |
| `origin.claimAgeHours` | Hours since each claim branch's newest commit, by `spec/task` |
| `origin.graph` | The commits a case names, as `{commit: [parents]}` |
| `origin.heads` | The head commit of each branch the case reads, by branch name |
| `origin.mergedPullHeads` | Head ref names of merged pull requests, claim branches GitHub deleted included |
| `issues` | Each spec's issue assignees, by spec name. A spec missing here has no issue |
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
optional part of the workflow page's conformance table. A runner runs the
cases of the required profile and of each optional part it supports.

## Running it

`load.mjs` exports `readCases()`, which returns each case with its `files`, and
`judge(case, got)`, which compares a runner's answers with `expect` and returns
`pass`, `fail`, `expected-fail` or `unexpected-pass` for each probe.

Avoozl runs the kit in `src/app/test/workflow-kit.test.mjs` as part of its
tests. A probe with `expectFail` passes while Avoozl gets it wrong. The test
fails once Avoozl gets it right, or once the named task is ticked in
`.kiro/specs/simplify/tasks.md`, and the mark is then removed.
