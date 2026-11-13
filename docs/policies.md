# Trigger rules and example policies

Avoozl ships with no trigger rule. A new workspace, or a repository you have
only registered, takes no GitHub issue until its `.avoozl.json` names a rule.
Labels alone never start work: the person who added the label must also pass
the repository's **Who counts** check, `allowedActors` or a
`minimumPermission`. A repository that names neither counts anyone with
`write` permission. The same applies to public and private repositories.

Rules live under `github.repositories.<owner/repo>.rules` in the repository
root `.avoozl.json`. Each rule maps a `match` line to one fixed action:

| Action       | What the tick does with a matching issue                    |
| ------------ | ----------------------------------------------------------- |
| `respond`    | Opens a responder session that answers on the issue         |
| `plan`       | Records the issue for planning; nothing runs                |
| `deliver`    | Classifies the issue, then delivers it as a leaf or a graph |
| `execute`    | Delivers the issue, as `deliver` does                       |
| `pause`      | Stops new dispatch for the issue                            |
| `resume`     | Lifts a pause                                               |
| `quarantine` | Removes the ready label and holds the issue for a person    |

A rule's `match` is one line of GitHub's own issue-search syntax. Avoozl
reads only these qualifiers:

| Term                       | Matches an issue that                    |
| -------------------------- | ---------------------------------------- |
| `label:x`                  | has `x`; repeat it to need all of them   |
| `label:a,b`                | has `a` or `b` (one such group per rule) |
| `-label:x` or `-label:a,b` | has none of them                         |
| `assignee:login`           | is assigned to `login`                   |
| `no:assignee`              | is assigned to nobody                    |
| `source:id`                | is an item from intake source `id`       |

Quote a name with spaces or commas: `label:"needs triage"`. Labels compare
without case, as GitHub search does. Any other term (`is:`, `repo:`,
`author:`, free text, another qualifier) is refused with an error that names
it, so a rule never matches more than its line says. A rule needs at least
one `label:` term. A rule without `source:` matches GitHub issues only, and a
`respond` rule cannot use `source:`. Paste a line without `source:` into an
issue search on GitHub to see the same issues; Settings shows the open
issues it matches now.

Who may trigger a rule is not part of `match`: search cannot say whose label
counts, so `allowedActors` and `minimumPermission` stay separate, under
**Who counts** in Settings. The same check applies to a board drag and to a
close. A rule's `author` key narrows it to issues one login opened.

Label names are yours to choose; no name needs a particular prefix. Labels
Avoozl writes are set in `managedLabels` and cannot be used as triggers, and
neither can Issue Radar's crew labels (see [Work beside Issue Radar
crews](#work-beside-issue-radar-crews)).

Older rules use `labelsAll`, `labelsAny`, `labelsNone`, and `assignee` in
place of `match`. They still work unchanged. A rule with both `match` and one
of those keys is refused as ambiguous. Settings saves `match`.

Edit these blocks in the Avoozl page under **Settings**, or in the file
directly. Settings validates the file the same way the tick does.

## Deliver issues you label and assign to yourself

One repository, issues delivered as pull requests in that repository.

```json
{
  "github": {
    "mode": "single-repo",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "coder": "worker",
        "allowedActors": ["your-login"],
        "managedLabels": { "ready": "agent:ready" },
        "rules": [
          {
            "id": "deliver",
            "action": "deliver",
            "match": "label:agent:go assignee:your-login"
          }
        ]
      }
    }
  }
}
```

## Let maintainers trigger work, with a hold label

Anyone with `maintain` permission can start delivery with two labels. A
`hold` label stops a match, and a `pause` rule stops dispatch on an issue
already in flight.

```json
{
  "github": {
    "mode": "single-repo",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "minimumPermission": "maintain",
        "requiredChecks": ["test"],
        "managedLabels": { "ready": "agent:ready", "stale": "agent:stale" },
        "rules": [
          {
            "id": "build",
            "action": "deliver",
            "match": "label:agent label:area:core -label:hold"
          },
          { "id": "hold", "action": "pause", "match": "label:hold" }
        ]
      }
    }
  }
}
```

## Answer questions without writing code

A `respond` rule needs a `responding` label, which Avoozl sets while its
responder works.

```json
{
  "github": {
    "mode": "single-repo",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "allowedActors": ["your-login"],
        "managedLabels": { "responding": "agent:answering" },
        "rules": [
          { "id": "ask", "action": "respond", "match": "label:question" }
        ]
      }
    }
  }
}
```

## Specs in one repository, code in others

Plans-repo mode keeps issues and Kiro specs in a planning repository and
opens pull requests in the code repositories. This example triggers nothing:
work comes only from approved specs.

```json
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example-org/plans",
    "project": { "owner": "example-org", "number": 1 },
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "checkout": "../app",
        "allowedActors": ["your-login"]
      }
    }
  }
}
```

## Ban private terms from everything Avoozl writes

Content rules keep private names, hostnames, repositories and paths out of
spec files, issues, pull request text, comments, Project fields, session
briefs and worker diffs. `.avoozl.json` names the rule sets; the rules live
outside Git, so the list itself never lands in a repository.

```json
{
  "contentRules": {
    "sets": [
      { "id": "company-terms" },
      {
        "id": "trial-hostnames",
        "action": "report",
        "boundaries": ["github", "diff"]
      }
    ]
  }
}
```

- Each set reads `.avoozl/local/content-rules/<id>.txt`, or the path this
  machine's `~/.config/avoozl/config.json` gives in `contentRules.terms.<id>`.
  One `rule: regex` per line, `#` comments, matched per line ignoring case.
  Avoozl refuses a terms file Git tracks or does not ignore.
- To let a false match through every time, add an allow line to the same
  file: `allow: regex` cancels any rule's match on that line, and
  `allow <rule>: regex` cancels only that rule's. It counts only when it
  matches the same line the rule matched. For example, with
  `codename: \bzebra\b`, the line `allow: \bzebra-ui\b` lets "the zebra-ui
  package" through and still blocks "zebra ships Friday". Built-in sets
  ignore allow lines; use Allow once for those. The release scan reads the
  same lines for its own terms file.
- `action` is `block` (the default) or `report`. A block writes nothing and
  asks you in the Conflicts tab, where you can allow that exact content once
  with a reason. A session's own write is refused in its call instead, so it
  can fix the text.
- `boundaries` narrows a set to some of `plan`, `github`, `brief` and `diff`;
  `repositories` to some registered repositories.
- `remote` is `allow` or `forbid`: whether tasks this set covers may run on a
  remote crew. A set that covers `diff` forbids it by default, because its
  pre-push hook exists only on this machine.
- A set this machine does not have blocks everything it covers until you add
  its terms file. A findings message names the set, rule and line, never the
  matched text.
- `.avoozl.json` never holds a rule: `terms`, `patterns` and `rules` keys are
  refused there.

Avoozl installs a `pre-push` hook in each task worktree it prepares, so a
matching line stops the push. It cannot stop a merge on GitHub; a required
commit status would.

## Use GitHub pull-request reviews as the review gate

For a GitHub leaf, GitHub owns the review. With `pullRequestReviews` set,
Avoozl reads the reviews on the pull request's head commit and releases
dependents only when that commit has enough approvals.

```json
{
  "github": {
    "mode": "single-repo",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "minimumPermission": "write",
        "pullRequestReviews": { "approvals": 1 }
      }
    }
  }
}
```

- A review counts when it is `APPROVED` or `CHANGES_REQUESTED`, on the head
  commit, by a reviewer that `allowedActors` and `minimumPermission` allow
  (the same check as trigger labels). `approvals` defaults to 1.
- One allowed change request on the head holds the leaf, whatever the
  approvals.
- `COMMENTED` and dismissed reviews count for nothing. A review on an older
  commit is stale once the head moves. Reviews by anyone else are shown as
  ignored.
- A merged pull request without its approvals holds the leaf's dependents
  and opens a decision. The Delivery view shows the verdict and links to the
  pull request.
- Local review roles (`delivery.reviewers`) apply only to local leaves.
  Branch protection's required reviews still gate the merge itself.

## Work beside Issue Radar crews

An Issue Radar crew works one repository. Each turn it lists the open
issues, keeps those that carry a label it watches (every open issue when it
watches none), skips any issue that already has a `crew:` label, and claims
one by adding `crew: in progress`. When it needs a person it adds the
repository's "needs human" label (`crew: needs human` unless Issue Radar's
settings say otherwise). Crews use your `gh` login, so on GitHub their
labels and closes look like yours.

**Send to Issue Radar.** In the Intake tab, select issues from one
repository and press **Send selected to Issue Radar**, or use the row's
crew button. Pick a crew, check the label and the issues, then press **Add
label**. Avoozl checks your login against the repository's `allowedActors`
or `minimumPermission`, passes the label through content rules, adds it to
each issue, and records who sent what. Those issues then show under **With
Issue Radar**, with any issue a crew already holds. Avoozl refuses a label
that starts with `crew:`, is a managed or crew label, or starts one of the
repository's rules. A crew that watches no label takes every open issue, so
Avoozl writes nothing for it and only records the hand-off. To undo a send,
remove the label on GitHub before a crew claims the issue.

Avoozl lists the crews when Kiro Crew lets the app read Issue Radar. When it
can't, the dialog says why and you type the label the crew watches.

**Rules for working side by side.** Avoozl tells a crew's work apart from
yours by label, not by login:

- For a repository whose `coder` is `issue-radar`, the crew watches the
  `ready` label. Avoozl adds it only to a ready leaf and takes it off when
  the leaf is blocked again, for example when its blocker is reopened.
- A close on an issue that carries `crew: in progress` counts as done only
  when a closing pull request merged. Otherwise Avoozl holds the dependents
  and opens a decision, even when the closer is allowed. Any other allowed
  close is still an order.
- Adding or removing a crew label never makes a rule true, and a rule may
  not use a crew label as a trigger.
- The "needs human" label shows under **Needs you** with a link to the
  issue, both for Avoozl tasks and for issues sent from Intake.

Labels a crew watches are set in Issue Radar. Labels it writes are set under
`crewLabels` (`claim`, `needsHuman`) when yours differ from the defaults.

## Bring in work from other trackers and scripts

GitHub is one source of incoming items. A tracker plugin with `poll` is
another (see the Intake part in `docs/plugins.md`), and so is anything you
script, through MCP. Every item lands in the **Intake** tab with its
source; **Untriaged** is that tab's default filter.

Declare a script's source with `via: mcp`, here in this machine's
`plugins.json` so the name stays off a public repository:

```json
{
  "intake": {
    "sources": {
      "script": { "via": "mcp", "repository": "example/app" }
    }
  }
}
```

A Kiro Crew cron job that reads a system no plugin covers then sends what
it found with the `plans_intake` tool, action `submit_items`:

```json
{
  "action": "submit_items",
  "input": {
    "source": "script",
    "items": [
      {
        "id": "Q-17",
        "kind": "ticket",
        "link": "https://tickets.example.test/Q-17",
        "title": "Export fails on an empty sheet",
        "body": "Steps to reproduce ...",
        "labels": ["hold"],
        "state": "open",
        "updatedAt": "2026-11-12T20:01:00Z"
      }
    ]
  }
}
```

The reply has one result per item: `created`, `updated`, `unchanged`,
`stale` (older than the stored one) or `refused` with the field it broke.
The same items from the command line: `avoozl intake submit --source script
--file items.json`.

An MCP caller is you, on this computer, but Avoozl cannot tell who wrote an
item at its source, and a chat may be passing on text it read. So its
items are listed, may meet `pause` and `quarantine` rules (`label:hold
source:script`), and never start work by themselves. Press **Deliver this**
or **Plan this** on the item in the Intake tab, or run `avoozl intake
deliver script Q-17`. MCP cannot submit to `github` or to a plugin's source,
and a close it reports holds the item's dependents for you to decide.

Avoozl writes nothing back to these sources. A closed item that no task
holds is deleted 30 days after it closed.

## Later GitHub features, each off by default

Three settings on a repository entry turn on features that were held back
until the core loop was proved. Each is off unless set, and each has its own
proof against a fake GitHub (`src/app/test/proof-*.test.mjs`). The GitHub
proofs that need a scratch organization have not run yet, so treat these
as early.

```json
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example-org/plans",
    "repositories": {
      "example-org/app": {
        "baseBranch": "main",
        "allowedActors": ["your-login"],
        "stackedPullRequests": true,
        "commentSteering": { "mention": "@your-bot" },
        "discussions": { "categories": ["Q&A"] }
      }
    }
  }
}
```

- `stackedPullRequests` (plans-repo leaves and single-repo `coder: worker`
  leaves): a leaf whose only unfinished blocker is another such leaf with an
  open pull request starts early. Its branch is cut from the blocker's
  branch, its pull request targets that branch, and its worker moves it to
  `baseBranch` and turns on auto-merge only after the blocker merged. Labels
  and the Project still show it as waiting.
- `commentSteering`: while a worker session Avoozl opened runs a GitHub
  leaf, a new comment on the leaf's issue that names `mention`, by someone
  `allowedActors` and `minimumPermission` allow, is sent to that session once,
  quoted as data. Avoozl writes nothing to GitHub for it. Workers a Crew Mode
  conductor started are not steered.
- `discussions`: each open, unanswered, unlocked discussion in one of
  `categories` whose author the policy allows gets one responder session and
  at most one reply, screened like a `respond` reply. Discussions must be
  turned on for the repository, and the repository needs a local checkout.
- `commentSteering` and `discussions` use the repository's Who counts check
  (`write` when it names nobody).
