# Design: the triage agent and the GitHub pages

Status: Draft

`TA` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`; `NK` numbers are in
`.kiro/specs/without-kirocrew/`. Labels are as in the requirements: **V**
read in the file cited at `e519494`, **A** assumed.

## D1. Parts that exist, and what is new

| Need                          | Exists today                                                                 | New here                                           |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Read issues and pull requests | Triage reads each repository at most every 10 minutes (V: `UNTRIAGED_INTERVAL_MS`, `src/app/untriaged.mjs:25`) | A conditional list since a cursor (D7)             |
| Answer a question             | The responder role (V: `src/app/github-respond.mjs`, 490 lines)              | Started per item, citations required (TA2)         |
| Decide one fix or more        | The breakdown planner's classification (V: `src/app/github-breakdown.mjs`)   | Six classes, one run (D3)                          |
| Fix and land                  | `Deliver this` and its bounded fix (V: `boundedFix`, `src/app/github-intake.mjs:51`), verify, landing | Reproduction first; fixes without issues (TA9)     |
| Review a pull request         | Review drafts and the code review chat (V: `src/app/review-draft.mjs`, `src/app/pr-review.mjs`) | Posted reviews, full or partial (TA4)              |
| Hand items to the owner       | Triage and Needs you                                                         | The owner queue as a page filter (TA5)             |
| See and stop                  | Activity, Flow, task timelines, Stop the line                                | The Triage agent page, Pause, Stop all (TA6)       |
| Throttle GitHub               | The write pacer, the conditional cache, the rate pause (V: `src/app/github-pacer.mjs`, `src/app/github-rate.mjs`) | GraphQL detail and batched counts (D7)             |

## D2. One run per item, started by the tick

The tick is code and stays the scheduler. Each tick, for each repository
with `triage.agent: on`:

1. Read what changed (D7). New items get a row on the item table.
2. For each new item, oldest first, within the daily cap and the rate
   budget, write one session request with role `triage`. A new comment
   starts a run only when its author is the item's author or a collaborator
   (TA1.5, TA7.8); the tick reads the author's permission with the comment.
   Anyone else's comment waits on the item as data for its next run.
3. When a run's result arrives, carry out its writes through the client
   (D7) after the content rules pass, and record them on the item.
4. For each run in progress, read its item's state with the changes of
   step 1. An item closed or merged since the run started stops the run,
   and its writes are dropped, never sent (TA6.4).

There is no long-running agent and no self-scheduled wake. A run gets the
context a long-running agent would remember in its brief: the last 20
triage decisions in the repository and up to five open items with similar
titles.

The `triage` role runs on either executor. On `process` it follows the
pattern NK1 to NK4 describe: a snapshot folder it can only read, a result
file, and for a review an output file. It has no network and no
credentials; every GitHub write is Avoozl's.

## D3. The result of a run

One result shape for every class, checked by one validator:

```json
{
  "class": "bug",
  "reason": "nupp run fails on Windows when …",
  "labels": ["bug"],
  "duplicateOf": null,
  "answer": null,
  "reproduction": { "path": "tests/regress_122.nupp" },
  "fix": { "bounded": true, "why": "the loader reuses a stale check; one function" },
  "review": null,
  "toOwner": null
}
```

| Class          | What the run fills                           | What Avoozl does next                                                   |
| -------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `question`     | `answer` with `citations`                    | Post it if it cites a repository file; else owner queue with the draft   |
| `bug`, `optimization` | `reproduction`, `fix.bounded`, `fix.why` | Run the reproduction; start a fix (D4) or ask for information or send to the owner |
| `feature`      | `toOwner`                                    | Owner queue                                                             |
| `pull-request` | `review` (body, line comments, `partial`, `notCovered`) in an output file | Post as a comment review; owner queue if TA4.4 holds |
| `unclear`      | `toOwner`                                    | Owner queue                                                             |

Suggested `labels` are only labels the repository has. They are added when
the repository's setting `triage.labels` is `add`, and shown as suggestions
when it is `suggest` (default).

## D4. Reproduce, then fix

A run proposes a reproduction as a file; Avoozl does not take the run's
word for it, and runs no command the run names. In a clean worktree at the
base branch it runs the repository's configured checks twice, without the
file and with it, under the `process` executor's sandbox (NK1): no network,
no credentials. A file under a protected path is refused.

- **Pass without, fail with:** reproduced. With `fix.bounded`, Avoozl
  starts a fix (TA9) whose first commit is the file, so the repository's
  checks, which landing runs, fail until the fix makes them pass.
- **Pass both times:** not reproduced. The run is told once, by resume, and
  may try again; after that, TA3.4 or TA3.5.
- **Fail without the file, or cannot run:** owner queue.

Who may land without the owner is decided by the author's permission, read
from GitHub when the item is first read (TA7.3), not by anything the item
says.

## D5. Fixes without files (TA9)

The bounded fix record that **Deliver this** writes today becomes the one
kind of fix:

```
task.fix = {
  v: 2,
  source: { issue: {repository, number} } | { text, by },
  snapshot: digest(title + body)  | digest(text),
  acceptance: [ "Does what the text asks.", "The repository's checks pass on the exact head that lands." ],
  definition: digest(canonical(above)),
}
```

`v: 1` records (`kind: "bounded-fix"`) load as `v: 2` with `source.issue`.
A fix with no issue keeps its record in the workspace database; the
journal of a fix with an issue stays on that issue, as today. **Make this a
spec** writes `.kiro/specs/fix-<n>/` with the text as `requirements.md` and
one task, and archives the fix with a link to the spec.

## D6. Reviews (TA4)

The run reads the snapshot (NK4: title, body, files, diff, checks, review
comments) and writes the review to an output file (NK3): a body, line
comments on lines in the diff, and `partial` with `notCovered`.

- Full when the diff's added and removed lines are at most
  `triage.fullReviewMaxLines` and it touches no protected path.
- Partial otherwise: the first line says "Partial review: …" and lists
  what it did not cover.

Avoozl posts it as one review with event `COMMENT` and its line comments,
the call review drafts already use (V: `pullRequestReviews` and the reviews
endpoint, `src/app/github.mjs:2064` to `:2090`). A line comment outside the
diff is dropped, as for a draft today. **Edit review** on the page edits a
review before it is posted, when the repository sets `triage.reviews:
draft`; the default is `post`.

## D7. GitHub traffic

GitHub's limits that matter here, as GitHub documents them (A: from
GitHub's documentation, not measured here): REST 5,000 calls an hour for a
user token, with a 304 answer to a conditional request not counted; the
search API 30 calls a minute; GraphQL 5,000 points an hour, with no
conditional requests; content-creating writes about 80 a minute and 500 an
hour. Avoozl already paces writes at 60 a minute and 400 an hour (V:
`src/app/github-pacer.mjs:12`), caches GET answers for conditional requests,
and stretches reads when fewer than 200 calls are left (V:
`src/app/github-rate.mjs`).

**Finding changes: REST, conditional.** Per repository, one call:
`GET /repos/{owner}/{repo}/issues?state=open&sort=updated&direction=desc&since=<cursor>&per_page=100`,
with the cached ETag. It returns issues and pull requests together. An
unchanged repository answers 304 and costs nothing. A busy one costs one
call per 100 changed items. The search API is not used: it has its own
small limit and no conditional requests.

**List counts: GraphQL, batched.** For the pull requests in that answer, one
query asks for each one's `statusCheckRollup`, `changedFiles`, `additions`,
`deletions`, `isDraft`, `reviewDecision` and author association, up to 50
pull requests a query. GraphQL suits this: one query replaces two or three
REST calls per pull request, and costs about one point.

**Detail: GraphQL, cached by `updatedAt`.** Opening an item, or building a
run's snapshot, makes one query for body, labels, assignees, reviewers,
checks, branches, counts, and the last 30 timeline events with their
comments. The answer is cached with the item's `updatedAt` from the list,
so a second open of an unchanged item makes no call. A pull request's diff
for a run is one REST call, also cached by head commit.

**Writes.** Every write goes through the pacer, counted in its journal,
person's writes and agent's writes alike. A triage run's writes are a few
at most: a comment, a review, labels.

**Budget.** Triage yields: a tick with fewer than the low mark of calls
left starts no triage run and reads for triage only when no landing,
verification or projection read waits. The daily cap bounds runs, and so
the writes they make. The Triage agent page shows calls by REST, GraphQL
and writes, from the counts the client keeps.

## D8. The pages (TA8)

One list-detail layout for Issues and Pull requests, drawn with Kiro Crew's
components (`ui-components`), and the same inside Kiro Crew and on the
standalone page.

| Part         | From                                                                 |
| ------------ | -------------------------------------------------------------------- |
| List rows    | The item table (D2) and the batched counts (D7)                      |
| Detail       | The cached detail query (D7)                                         |
| Agent panel  | The item's runs and their results (D3)                               |
| Actions      | One operation each; person-only where TA8.5 says                     |

The owner queue is the list filtered to items with `toOwner`, a held fix,
or an unposted draft; Home and Needs you show its count.

## D9. What goes

| Goes                                              | Lines (V unless marked)           |
| ------------------------------------------------- | --------------------------------- |
| `radar-*.mjs` (20 modules)                        | 3,063                             |
| `public-signoff.mjs`, and `public-crews.mjs` except the content hook | 309, and about 440 (A: split by its exports) |
| Trigger-rule actions, Who counts for orders, managed and plan labels | Inside `github-policy.mjs`, `github-sync.mjs`, `tick.mjs` (A: not measured) |
| The label-triggered steps of planner and responder | Their tick wiring; the roles stay |
| `.kiro/specs/radar-coder/`                         | 5,203 lines of spec               |

Kept and renamed: the content hook moves to `src/app/content-hook.mjs`.

## D10. Decisions for the owner

| #   | Decision                                   | Default                                              | The other choice                                    |
| --- | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| 1   | Who may get a fix landed without you       | Collaborators' issues only                           | Anyone's, or no one's (every fix waits for you)     |
| 2   | Posting answers                            | Post when it cites a repository file                 | Always draft for you                                |
| 3   | Posting reviews                            | Post as a comment review                             | Draft for you to edit and post                      |
| 4   | Adding labels                              | Suggest only                                         | Add                                                 |
| 5   | Old open items when turning it on          | Ask                                                  | Only new items                                      |
| 6   | Issue Radar                                | Removed                                              | Keep Send to Issue Radar beside the agent           |

## D11. Risks

| Risk                                                       | Guard                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| A hostile issue steers the agent                           | TA7: text is data; no network or credentials; Avoozl writes; content rules; collaborators only for unattended landing |
| A wrong answer posted in your name                         | Citation required; "written by an agent" line; D10.2                      |
| A fix that passes checks but is wrong                      | The reproduction is a check; protected paths need you; landing's own checks |
| A stranger's issue steers what Avoozl runs | A run names files, never commands; only the configured checks run, sandboxed (TA7.7) |
| GitHub limits hit by a busy repository                     | Conditional lists, batched counts, cached detail, the daily cap, triage yields |
| An item gets runs over and over                            | A new run only on a person's ask or an answer to its question (TA1.5)   |
| A stranger's comments start runs                           | Only the item's author or a collaborator starts one; other comments are data (TA7.8) |
