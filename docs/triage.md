# Triage agent

The triage agent reads new issues and pull requests in a repository where it is
on, and answers, reproduces, reviews or hands each one to you. A new workspace,
or a repository you have only registered, has the agent off.

```json [.avoozl.json]
{
  "github": {
    "mode": "single-repo",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "triage": {
          "agent": "on",
          "existing": "skip",
          "dailyRuns": 50,
          "fullReviewMaxLines": 300,
          "labels": "suggest",
          "reviews": "post"
        }
      }
    }
  }
}
```

Avoozl takes no GitHub issue by itself, and no label is an order. Work starts
in one of three ways: a person approves a spec, a person starts a fix, or the
triage agent acts on a new issue or pull request. Turn the agent on per
repository in **Settings › Repository setup**, or under
`github.repositories.<owner/repo>.triage` in `.avoozl.json`.

## Triage runs

The tick reads new and changed issues and pull requests with one conditional
list per repository, and starts one short triage run per new item. A run gets a
snapshot of the item and has no network and no credentials. It sets the item's
class with a one-line reason, and the class decides what happens next:

- `question`: Avoozl posts an answer that cites files in the repository. An
  answer that cites none goes to you as a draft.
- `bug` and `optimization`: the run writes a test that shows the problem. When
  the test fails without a fix and the fix is bounded, Avoozl starts a fix whose
  first commit is the test.
- `pull-request`: Avoozl posts a comment review with line comments. Past
  `fullReviewMaxLines` the review is partial and says so in its first line.
- `feature` and `unclear`: the item goes to you with the reason.

A fix for a collaborator's issue lands by the repository's `landing` setting.
Anyone else's waits as **Fix ready** for you to land. A bug that lacks detail
gets one comment asking for it. Everything the agent could not settle is in the
owner queue: **Needs you › From the agent**, and the owner-queue filter on
**GitHub › Issues** and **GitHub › Pull requests**.

## Triage settings

| Key                  | Values           | Default   | Meaning                                                                   |
| -------------------- | ---------------- | --------- | ------------------------------------------------------------------------- |
| `agent`              | `on`, `off`      | `off`     | Whether the tick starts triage runs here                                  |
| `existing`           | `take`, `skip`   | `skip`    | Whether open items from before the agent was on get a run                 |
| `dailyRuns`          | 1 to 1000        | 50        | Runs a day; past it new items wait for the next day and Needs you says so |
| `fullReviewMaxLines` | 1 to 100000      | 300       | The largest change that gets a full review                                |
| `labels`             | `suggest`, `add` | `suggest` | Whether the agent's labels are suggestions or added                       |
| `reviews`            | `post`, `draft`  | `post`    | Whether a review is posted or kept for you to edit and post               |

The agent treats item text as data. Every write passes the
[content rules](content-rules.md) first. It never closes an item, never
approves or requests changes, and adds only labels the repository already has.
Only a comment by the item's author or a collaborator starts a new run.

The **GitHub › Triage agent** page shows the runs, their writes, the daily cap
left and the calls used today. It has **Pause** per repository and **Stop all**,
and Stop the line stops triage runs in its scope.

## Fixes

A fix is one task with no spec files: its text, its repository and two
acceptance lines. The first says it does what the text asks, and the second says
the repository's checks pass on the exact head that lands.

```sh
avoozl fix "Reject an empty config key" --repo app
```

Start one with **Fix** on an issue, **New fix** beside **New spec**, or
`avoozl fix`. Starting it is the approval. A fix from an issue keeps its record
on that issue, and **Make this a spec** turns a fix that grew into a spec
folder.

## Who counts

`allowedActors` and `minimumPermission` (`write` when a repository names
neither) decide whose pull-request reviews count as the
[review gate](github.md#pull-request-reviews) and whose discussions get a reply.
They never turn a label into an order.

::: info See also
- [GitHub](github.md) for repository roles and modes
- [Content rules](content-rules.md) for the check on every write
:::
