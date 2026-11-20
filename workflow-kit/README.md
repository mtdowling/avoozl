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
| `origin.branches` | Every branch on origin, claim branches included |
| `origin.behind` | Integration branches that do not yet hold the default branch's head |
| `issues` | Each spec's issue assignees, by spec name. A spec missing here has no issue |
| `land` | Present on landing cases: the task, the landing `mode`, `pr`, whether `checks` pass and whether the base moved |
| `expect` | The probes the runner answers |
| `expectFail` | A probe the runner is known to fail, with the task that fixes it |

A box marked `x` in `repo/` is ticked on the specs branch, and every spec in
`repo/` is approved.

## Probes

| Probe | A runner answers with |
| --- | --- |
| `violations` | For each spec name, the sorted rule numbers its text breaks |
| `ready` | The ready tasks as `spec/task`, the one to take first at the front |
| `claim` | The claim branch for the first ready task, the branch it starts from, and whether the default branch is merged in first |
| `landing` | The `action`, `base`, `tick`, `mergeBase` and `deleteClaimBranch` for the `land` task, or only `{"action": "none"}` when checks fail |

A case checks only the probes in its `expect`. `landing.action` is one of
`fast-forward-base`, `open-draft-pull-request`, `open-pull-request`,
`open-and-merge-pull-request`, `push-claim-branch` or `none`.

## Running it

`load.mjs` exports `readCases()`, which returns each case with its `files`, and
`judge(case, got)`, which compares a runner's answers with `expect` and returns
`pass`, `fail`, `expected-fail` or `unexpected-pass` for each probe.

Avoozl runs the kit in `src/app/test/workflow-kit.test.mjs` as part of its
tests. A probe with `expectFail` passes while Avoozl gets it wrong. The test
fails once Avoozl gets it right, or once the named task is ticked in
`.kiro/specs/simplify/tasks.md`, and the mark is then removed.
