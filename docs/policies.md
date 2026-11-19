# The triage agent and example policies

Avoozl takes no GitHub issue by itself, and no label is an order. Work
starts in one of three ways: a person approves a spec, a person starts a
fix, or the triage agent acts on a new issue or pull request in a
repository where it is on. A new workspace, or a repository you have only
registered, has the agent off.

## The triage agent

Turn it on per repository in **Settings › Repository setup**, or under
`github.repositories.<owner/repo>.triage` in `.avoozl.json`. The tick reads
new and changed issues and pull requests with one conditional list per
repository, and starts one short triage run per new item. A run gets a
snapshot of the item and has no network and no credentials. It sets the
item's class (`question`, `bug`, `optimization`, `feature`,
`pull-request` or `unclear`) with a one-line reason, then:

| Class                    | What happens                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `question`               | Avoozl posts an answer that cites files in the repository. An answer that cites none goes to you as a draft.                                         |
| `bug`, `optimization`    | The run writes a test that shows the problem. When it fails without a fix and the fix is bounded, Avoozl starts a fix whose first commit is the test. |
| `pull-request`           | Avoozl posts a comment review with line comments. Past `fullReviewMaxLines` the review is partial and says so in its first line.                    |
| `feature`, `unclear`     | The item goes to you with the reason.                                                                                                                |

A fix for a collaborator's issue lands by the repository's `landing`
setting. Anyone else's waits as **Fix ready** for you to land. A bug that
lacks detail gets one comment asking for it. Everything the agent could not
settle is in the owner queue: **Needs you › From the agent**, and the
owner-queue filter on **GitHub › Issues** and **GitHub › Pull requests**.

```json
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

| Key                  | Values             | Default   | Meaning                                                                  |
| -------------------- | ------------------ | --------- | ------------------------------------------------------------------------ |
| `agent`              | `on`, `off`        | `off`     | Whether the tick starts triage runs here                                 |
| `existing`           | `take`, `skip`     | `skip`    | Whether open items from before the agent was on get a run                |
| `dailyRuns`          | 1 to 1000          | 50        | Runs a day; past it new items wait for the next day and Needs you says so |
| `fullReviewMaxLines` | 1 to 100000        | 300       | The largest change that gets a full review                               |
| `labels`             | `suggest`, `add`   | `suggest` | Whether the agent's labels are suggestions or added                      |
| `reviews`            | `post`, `draft`    | `post`    | Whether a review is posted or kept for you to edit and post              |

The agent treats item text as data. Every write passes the content rules
first. It never closes an item, never approves or requests changes, and
adds only labels the repository already has. Only a comment by the item's
author or a collaborator starts a new run. The **GitHub › Triage agent**
page shows the runs, their writes, the daily cap left and the calls used
today; it has Pause per repository and Stop all, and Stop the line stops
triage runs in its scope.

## Fixes

A fix is one task with no spec files: its text, its repository and two
acceptance lines (it does what the text asks, and the repository's checks
pass on the exact head that lands). Start one with **Fix** on an issue,
**New fix** beside **New spec**, or `avoozl fix "TEXT" --repo ID`. Starting it
is the approval. A fix from an issue keeps its record on that issue; **Make
this a spec** turns a fix that grew into a spec folder.

## Who counts

`allowedActors` and `minimumPermission` (`write` when a repository names
neither) decide whose pull-request reviews count as the review gate and
whose discussions get a reply. They never turn a label into an order.

## Older settings

Label commands and the Issue Radar integration were removed on 2026-11-19
with no backward compatibility. A repository entry that still has
`rules`, `managedLabels`, `crewLabels`, `radar`, `release`,
`acceptedLabel` or `untriaged` fails to load with "Unknown setting"; delete
the key.

## Specs in one repository, code in others

Plans-repo mode keeps spec issues and Kiro specs in a planning repository
and lands code in the code repositories. This example triggers nothing:
work comes only from approved specs.

```json
{
  "github": {
    "mode": "plans-repo",
    "planningRepository": "example-org/plans",
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
spec files, issues, pull request text, comments, session
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
- `remote` (`allow` or `forbid`) is still read from older files and does
  nothing: every session runs on this machine.
- A set this machine does not have blocks everything it covers until you add
  its terms file. A findings message names the set, rule and line, never the
  matched text.
- `.avoozl.json` never holds a rule: `terms`, `patterns` and `rules` keys are
  refused there.

Avoozl installs a `pre-push` hook in each task worktree it prepares, so a
matching line stops the push. It cannot stop a merge on GitHub; a required
commit status would.

Every comment, review, review line comment and pull request body goes
through the same write path. When an agent or Avoozl's own automation (the
tick) writes it, the path breaks each `@login` mention with a zero-width
space after the `@` (code spans, fences and HTML comments stay as written)
and adds a hidden `<!-- avoozl:posted -->` marker. Such a post notifies
nobody, and a comment that carries the marker never starts or resumes work:
comment steering and pull request feedback skip it.

A write you start yourself, from the Avoozl page or with a CLI command
outside an agent session, goes out as written: its mentions notify, and it
has no marker. Content rules check every write either way. A write whose caller Avoozl cannot tell is marked.

## Use GitHub pull-request reviews as the review gate

For a GitHub leaf, GitHub owns the review. When the base branch's ruleset or
branch protection requires approving reviews, Avoozl reads the reviews on
the pull request's head commit and releases dependents only when that
commit has as many approvals as the rule asks. There is no Avoozl setting
for it: change the rule on GitHub.

- A review counts when it is `APPROVED` or `CHANGES_REQUESTED`, on the head
  commit, by a reviewer that `allowedActors` and `minimumPermission` allow
  (see [Who counts](#who-counts)).
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

## Manual tasks and task links

Some steps are a person's, such as a team review before a cutover. Mark one
manual in its facts in `tasks.md`:

```markdown
- [ ] team-review Review with the team
  - Facts:
    - manual: true
    - repo: sdk
    - after: protocol-tests-proof
    - done:
      - The team agreed the results are good enough to cut over
```

A manual task needs `done` and a `repo` (where its issue lives). `manual:
true` is the one way to say a person does a task: it completes by a person
and takes no `completion` default. Lint refuses `session`, `batch`,
`paths` and `route` on it, by name, and refuses `completion: person`
anywhere, naming `manual: true` as the fix. No agent
ever runs it: it is never ready, batched, checked, reviewed or merged.
Until its blockers finish it is in **Blocked or waiting**; then it is in
**Needs you**, tagged **Manual**, with "Waiting for a person: <title>". Its dependents wait on it like on any task.

Open it in the task drawer to see its acceptance and **Mark done**. The
dialog takes optional outcome links, and **Done**,
**Skipped** or **Refused**. Done and Skipped release its dependents, and
Skipped stays shown. Refused is a no-go for a go/no-go step: the task
shows **Refused** and sits as Blocked in Needs you, its dependents stay
held, and Flow does not count it as finished. **Reopen** undoes any of
the three. Only a person marks it or reopens it, in the page or with
`avoozl task done TASK [--skipped|--refused]` and `avoozl task reopen
TASK`; MCP refuses both.
Flow counts its time in Needs you as waiting on a person and leaves it out
of first-pass rate.

Every task also has **Links** in the drawer: each an `http` or `https`
URL with no user name, and a label, newest first, with who added each and
when. **Add link** opens the fields for one link. They live in SQLite, not
in the spec, so adding one never changes a plan's revision. A task holds
up to 200. Content rules check each one at the `notes` boundary when it is
saved; a blocked save offers **Allow once** in place. A session may add
one to the task it is bound to, through the `plans_task` tool's
`add_note`; only a person edits, removes or ticks **Show on the issue**. A
removed link stays in the activity log. A worker's brief carries the
newest 20 (at most 8,000 characters) as data, not instructions, and a
dependent's brief carries each blocker's outcome links. Links stay in
Avoozl. From the command line: `avoozl task links TASK
[add|edit|remove|show]`.

This is tested with a fake GitHub (proof P37); it has not run live yet.

## Bring in work from other trackers and scripts

GitHub is one source of incoming items. A plugin that provides `intake` is
another (see the Intake part in `docs/plugins.md`), and so is anything you
script, through MCP. `avoozl intake list` and the `plans_intake` tool list
every item with its source.

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
items are listed and never start work by themselves. Run `avoozl intake
deliver script Q-17` or `avoozl intake plan script Q-17`. MCP cannot submit to `github` or to a plugin's source,
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
        "discussions": { "categories": ["Q&A"] }
      }
    }
  }
}
```

- `discussions`: each open, unanswered, unlocked discussion in one of
  `categories` whose author the policy allows gets one responder session and
  at most one reply, screened by the content rules like every post. Discussions must be
  turned on for the repository, and the repository needs a local checkout.
- `discussions` uses the repository's Who counts check (`write` when it
  names nobody).

## GitHub's rate limit

Every chat and Avoozl's tick use one GitHub login, which GitHub
limits to 5,000 REST calls an hour (GraphQL has its own count). Avoozl does
six things about it:

- **One cache.** Every view, command and MCP tool reads GitHub through one
  client. An answer it holds is reused with no call for `github.cacheSeconds`
  seconds (default 60, 0 turns it off). It is one value for the workspace, in
  Settings > GitHub and in `.avoozl.json`. A write (a comment, a label, a
  merge) makes the answers for its repository stale, not gone, so the next
  read asks with the `ETag` and a 304 is free. While the rate limit holds, a
  stored answer is served at any age. GraphQL queries are kept the same way,
  by their text and variables; mutations and answers with errors are not.
  A read can be up to that many seconds old, including pull-request checks.
- **Paced writes.** GitHub allows about 80 content-creating requests a minute
  and 500 an hour, and repeat hits can get a login banned. Every write goes
  through one serial pacer in the client: at most `github.writesPerMinute`
  (default 60, up to 80) and `github.writesPerHour` (default 400, up to 500),
  counted in a journal in the workspace database, and none while under 10% of
  the primary limit is left. Each mutation counts as one write against the
  limits; Avoozl does not batch mutations into one request.
- **Conditional reads.** Every REST GET stores GitHub's `ETag` and
  `Last-Modified` and the body in the workspace database, and sends them back
  next time. A 304 answer costs nothing against the limit, and Avoozl reuses
  the stored body. The cache holds at most 400 answers of at most 1 MB each
  and drops answers unused for a week.
- **Backoff.** On a 403 or 429 that says no calls are left, names a
  `Retry-After`, or says secondary rate limit, Avoozl makes no GitHub call
  until `x-ratelimit-reset` (or `Retry-After`, or one minute when GitHub names
  no time). A secondary limit holds every resource. The tick skips its
  GitHub steps, so the pending writes run once on the first tick after the
  wait. When fewer than 200 calls are left, GitHub steps run at most every 5
  minutes (every 20 under 50 calls left), and never past the reset.
- **One row.** While limited, Needs you has one row, "GitHub rate limit
  reached, resumes at ...", with the calls left and the resource. It clears
  itself at the reset. There is one notification per limit window.
- **Refresh.** The Refresh button on Home, Graph, Conflicts and Activity
  shows its countdown, `[↻ 32s]`, and reads again at 0. It pauses while the
  page is hidden. While limited it shows the time to the reset, `[↻ 18:51]`.
  Details are in its tooltip.
- **Numbers.** Settings > GitHub shows the last remaining and reset
  numbers and the share of calls GitHub answered with 304.

GraphQL cannot use ETags. GraphQL reads in a tick (discussions, only when
turned on, and pull-request reads) go through the cache above, so they
repeat at most once per `github.cacheSeconds`.

Chats that wait on CI are told to read `gh pr checks <number>` every 2 to 3
minutes, not `gh pr checks --watch`. Avoozl cannot enforce that for chats it
does not start.

## What runs on its own, and who can stop it

Some code Avoozl runs is owned by the repository, not by you. Read it before
you point Avoozl at a repository you do not trust, public ones included.

| Code                                 | When it runs                                  | What guards it                                                                                                                                         |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/worktree` in the repository | Every time Avoozl adds a worktree             | A person approves its SHA-256 hash first. The refusal prints the hash; set `worktreeHelper` on the repository to that hash. A changed file asks again. |
| The repository's `checks`            | On worker commits and on commits Avoozl lands | They are in the repository settings a person edits. Checks never see the gateway, push or GitHub credentials.                                          |
| A local-folder plugin                | When the tick uses it                         | A person approves its hash. Avoozl hashes it again just before it starts and refuses if it changed.                                                    |

A repository's checks are the only checks there are. Every task runs them;
a task never names its own. Each has a name and its command arguments, and
one with `paths` runs only when a commit's diff touches one of them:

```json
{
  "repositories": {
    "code": {
      "checks": {
        "test": ["npm", "test"],
        "diff": ["git", "diff", "--check"],
        "ui": { "run": ["npm", "run", "test:ui"], "paths": ["src/ui/**"] }
      }
    }
  }
}
```

Merge batches run every check whose paths any member's change touches, plus
every check without paths. Records, reruns and bisect steps name a check by
its name, and `verify.checkTimeouts` sets a check's own timeout by its name.
An older list of commands still loads, each check named by its command.

A check sees only the basics a process needs to start (`PATH`, `HOME`, temp
folders) plus the names a repository lists in `checksEnv`:

```json
{ "repositories": { "code": { "checksEnv": ["NODE_OPTIONS"] } } }
```

Push and GitHub credentials (`GH_TOKEN`, `GITHUB_TOKEN`, `SSH_AUTH_SOCK`
and the like) never reach a check, even when listed.

Every check runs in the repository's `isolation`:

```json
{
  "repositories": {
    "code": {
      "isolation": {
        "run": "sandbox",
        "network": "off",
        "writable": ["/var/cache/code-build"],
        "prepare": ["npm", "ci"]
      }
    }
  }
}
```

- `sandbox` (the default): the process sandbox. A check writes only its
  folder, its own temp folder, a per-repository cache folder and
  `writable`; it reads no credential or Avoozl state folder, plus
  `readable` where those would hide a file it needs.
- `container`: `docker` or `podman` runs `image` with the folder mounted
  at the same path, `--network none` unless the network is on, the same
  environment allowlist, and no home folder. Before the checks, Avoozl
  writes a file with random content in the folder and reads it back in the
  same container. A runtime in a VM mounts a folder the VM does not share
  as empty (on a Mac, Colima shares only its `mounts`), so when the content
  does not match, no check runs, and each is recorded as not run because
  the container cannot see the folder.
- `unconfined`: no isolation. Only with this machine's opt-in,
  `"checks": true` in `harness-unconfined.json` in Avoozl's config
  folder. A machine with no sandbox runs a `sandbox` check unconfined too.

`network` is `off` unless set `on`. `prepare` runs once per worktree and
commit before the checks, outside isolation, with the environment
allowlist; when it fails, no check runs. Each check record names its
isolation, and the Landing page and the task's timeline show "not
sandboxed" for one that ran unconfined. Only a person sets `isolation`.

Example only: Nupp's checks drive its Linux and Windows VMs, so it would
use `{ "run": "sandbox", "network": "on" }`.

Before Avoozl makes any worktree (a task's, a check run's, a landing
candidate's, a review session's), the volume that will hold it needs 2 GiB
free. With less, the work waits instead of failing halfway: a check run
stays queued, the landing queue holds, a session start is tried again, and
Needs you shows one row naming the folder and its free space. The row
clears once there is room. The 2 GiB floor is fixed.

### Person-only is not a wall against code running as you

Person-only operations (approve a plan, change plugins, read content-rule
terms) are refused for MCP calls and for app tokens. They do not stop code
that runs as your user. Such code can read the gateway's signing secret from
another process, or call the CLI.

The command line is a person's tool, so the CLI runs a person-only operation
wherever it is typed, inside a Kiro Crew agent session too. There it prints
that it ran in an agent session, and an approval made without a delegate
records it in its receipt. It tells a session by `KIROCREW_SPAWNED=1` (set on
every process Kiro Crew starts for an agent) or `KIRO_SESSION_ID` (set in an
agent's shell). The one place the CLI refuses is a process the supervisor
started (`AVOOZL_CHILD`), where nobody is typing. The `--as-person` flag
that used to get past an agent-session refusal was removed on 2026-11-18; an
old command that still passes it runs as before.

Approval delegation is the way to let an agent approve in its own name. A person runs `approval delegate NAME`; then
`plan approve ... --delegate NAME` and `plan.approve` with `delegate` work
from an agent session and over MCP, approving as that person, and each
receipt records the delegate and the grant. With no active grant the delegate
is refused. Over MCP, granting and revoking are person-only.

For a Kiro Crew chat it stays a speed bump. The chat runs as you, with your
files, your `gh` login and your network, so nothing stops a determined agent
from writing the database or calling `gh` itself.

An unattended `process` child (one the supervisor starts) gets
`AVOOZL_CHILD`, and the same refusal applies. What actually keeps a child from
a person-only act is the sandbox the supervisor wraps it in:

- It can neither read nor write the workspace databases (each catalog
  workspace's `.avoozl` folder), Avoozl's machine config and state folders,
  the Kiro Crew home (`KIROCREW_HOME`, or `~/.kiro/crew`), the `gh` config,
  `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/.ssh`,
  `~/.aws` and, on macOS, the keychain.
- Under your home folder it reads only its task folder, its temp and cache
  folders, the repository's git directory, the harness's own config (the
  definition's `reads`, such as `~/.claude` and `~/.claude.json` for
  Claude Code), `~/.gitconfig`, `~/.config/git` and the repository's
  `isolation.readable` paths. Your other repositories and documents are not
  readable. System and toolchain folders outside home stay readable.
- It writes only to its task folder, its own temp folder and the repository's
  cache folders. Read-only roles write nowhere.
- Its network is off. On macOS a repository can name loopback ports instead
  (`localhost:PORT`, for a proxy).
- Token, key, secret and password variables, `GH_*`, `GITHUB_*`, `AWS_*`,
  `KIROCREW_*` and `SSH_AUTH_SOCK` are removed from its environment, and git
  gets no credential helper.

macOS uses `sandbox-exec`; Linux uses bubblewrap (`bwrap`). A machine with
neither, such as Windows, runs a harness only after you allow that harness on
that machine (the same opt-in that lets it write outside the task folder).

A harness whose own sandbox cannot run inside Avoozl's (Codex on macOS, where
a nested `sandbox-exec` fails) may set `permission.write` to exactly
`danger-full-access`. Avoozl then starts it only inside its own sandbox,
with write roots, and refuses it everywhere else, including on a machine
that opted in. Every other bypass value stays refused.

### Files are private to you

The `.avoozl` folder is created `0700` and the database `0600`. Backups and
`export --output` files are `0600`. On open, Avoozl tightens an existing
workspace's folders and database (migration: nothing to do; a person who
shared the folder with a group loses that access). On Windows, Node cannot set
these modes, so the files keep the access of the folder they are in, which in a
user profile is you, the system and administrators. Move the workspace out of a
shared folder if that matters.
