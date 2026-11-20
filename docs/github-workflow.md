# Workflow v1

Workflow v1 is the protocol a tool follows to land an epic, task by task, from
spec files on GitHub. Git and GitHub hold every fact it needs, so any runner
that follows it can run the same specs beside any other. Avoozl is one runner.
A triage bot, a plain chat with GitHub tools, or another agent harness can be
another.

```markdown [acme/widget: .kiro/specs/parser/tasks.md]
---
repo: widget
---

- [x] `p-1` Read the token table
  - Every row of `tokens.csv` becomes one token kind
- [ ] `p-2` Report unknown tokens
  - An unknown token is reported with its line and column
- [ ] `p-3` Fix the lexer (**PARALLEL**)
  - [ ] `p-4` Skip to the next line
    - The parser reads every later token
  - [ ] `p-5` Count the skipped lines
    - The report names how many lines were skipped
```

Task `p-1` is ticked on the specs branch, so it is done. Task `p-2` waits for
the task above it, so it is ready. A runner claims it by creating the branch
`avoozl/parser/p-2`, does the work there, ticks the box in the same commit,
and lands it. Tasks `p-4` and `p-5` run side by side once `p-2` is ticked.

Every task takes the same path from an approved spec to a deleted claim
branch:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 25}}}%%
flowchart TB
  subgraph pick [" "]
    direction LR
    approve[Approved + issue] --> assign[Assigned] --> ready[Ready] --> claim{Claim}
  end
  subgraph run [" "]
    direction LR
    work[Work + tick] --> merge[Merge base] --> checks{Checks} -- pass --> land[Land, delete branch]
  end
  claim -- exists --> ready
  pick -- created --> run
  checks -- fail --> work
  checks -- base moved --> merge
```

The tick rides in the commit that lands, so the task is done the moment the
work reaches its base. Approval (7), assignment (8), the ready rule (9),
claims (12) and landing (13) give each step's rules.

The words MUST, MUST NOT, SHOULD and MAY are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). Each rule has a number,
and each rule can be checked: the [workflow kit](../workflow-kit/README.md)
holds sample repositories with the answer a runner gives for each. A runner
that follows rule `3.1` is one the kit's `3.1` cases accept. See
[Avoozl](#avoozl) for what Avoozl adds and the rules it does not follow yet.

## Terms

| Term | Meaning |
| --- | --- |
| Runner | A program that reads specs, claims ready tasks, has an agent or a person do them, checks the result and lands it. Each runner acts as one GitHub login, such as `acme-alice`. Several runners may share a login. |
| Approver | A person the repository trusts to approve specs: the repository's allowed approvers list, or everyone with write access when the list is empty. |
| Writer | A user with write access to the repository. |
| Specs branch | The branch that holds the specs: the default branch unless the repository's settings name another, such as `plans`. |
| Leaf | A task with no children. |
| Group | A task with children. |
| Spec group | A task whose title links another spec's `tasks.md`. |
| Parent spec | A spec with a spec group. |
| Base | The branch a task lands on: the branch named for its spec when one exists on origin, else the default branch. |
| Done branch | The branch whose `tasks.md` says whether a task is done: its base when the base is an integration branch that holds the spec's `tasks.md` (11.1), else the specs branch. |
| Spec text | A spec's files (1.2) with every task checkbox set to open, so a tick changes no spec text. |
| Claim branch | `avoozl/<spec>/<task>`, the branch a task is worked and checked on. |
| Lease | A ref named `avoozl-lease/<spec>/<task>/<generation>`, created at most once, that says which runner may push to a claim branch (12.5). |

## 1. Spec folders

A repository's specs live under one folder, `.kiro/specs` by default. Each
subfolder is one spec:

```text
.kiro/specs/
  parser/
    tasks.md          required
    requirements.md   optional
    design.md         optional
```

- **1.1** A spec MUST be a subfolder of the specs folder, and its name MUST be
  the folder name.
- **1.2** A spec MUST have a `tasks.md`. Every other `.md` file directly in the
  folder is spec text: an approver approves it and agents read it, but a
  runner reads no task from it. Files in subfolders, files that are not
  Markdown, and symlinks are not part of the spec.

## 2. Tasks

A task is a checkbox line, `- [ ]` open or `- [x]` ticked, with an ID in a
code span and a title:

```markdown
- [ ] `cache-drop` Drop stale entries
  - A stale entry is gone after one read
```

The sub-bullets say what done means. Text after the title, such as a
requirement reference, is part of the title.

- **2.1** A task MUST have an ID in a code span, such as `p-2` or `1.2`, and a
  title.
- **2.2** A task ID MUST be unique across a repository's specs. A runner MUST
  refuse a spec that repeats one.
- **2.3** A task MUST NOT carry a sub-bullet that starts with `$`. A runner
  MUST refuse a spec that does.
- **2.4** A leaf MUST have at least one plain sub-bullet. Each plain sub-bullet
  is one result someone can check, and together they say what done means.
- **2.5** A group MUST NOT have a plain sub-bullet.

## 3. Order

Order comes from the list. A spec has no dependency facts.

```markdown
- [ ] `ec-2.1` Gather a session's context
  - A session lists the files it read
- [ ] `ec-2.2` Reads, skills and the brief
  - The brief names every read
- [ ] `ec-2.3` Ways out (**PARALLEL**)
  - [ ] `ec-2.4` The MCP relay
    - The relay returns the brief
  - [ ] `ec-2.5` Kiro Crew chat workers
    - A chat worker gets the brief
- [ ] `ec-2.6` The chip, Activity and Settings
  - The chip shows the brief's size
```

Task `ec-2.1` runs first, then `ec-2.2`. Tasks `ec-2.4` and `ec-2.5` wait for
`ec-2.2` and run side by side. Task `ec-2.6` waits for both of them.

- **3.1** Tasks at one level of a list run in order, top to bottom. A task MUST
  wait for the task above it, and for every task inside it when that task is a
  group.
- **3.2** A task with children is a group. A runner MUST NOT claim or work a
  group. A group's box MUST be ticked when every child is ticked and open
  otherwise, and a runner MUST refuse a spec where it is not.
- **3.3** A group's children run in order, unless its title ends with
  `(**PARALLEL**)`. The children of a tagged group run side by side, and each
  waits for what the group waits for.
- **3.4** A nested group runs its children in order unless its own title
  carries the tag, even inside a parallel group.
- **3.5** The tag MUST be exactly `(**PARALLEL**)`, in capitals, at the end of
  the title of a group with at least two children. A runner MUST refuse a
  title that holds the word `parallel`, in any casing, in parentheses or bold
  in any other form, a tagged task with no children, and a tagged group with
  fewer than two children.
- **3.6** `##` headings are phases, and phases run in order. The first task of
  a phase MUST wait for every task of the phase above it.

A run of tasks inside a parallel group stays in order when it is an untagged
group:

```markdown
- [ ] `ec-1.2` Sources (**PARALLEL**)
  - [ ] `ec-1.1` The machine block
    - The block lists the machine's settings
  - [ ] `ec-1.5` The plugin part
    - [ ] `ec-1.3` The part's manifest
      - The manifest names each part
    - [ ] `ec-1.4` Asks and the approval hash
      - An ask carries the hash of its part
```

Task `ec-1.1` runs beside `ec-1.5`. Inside `ec-1.5`, `ec-1.3` runs before
`ec-1.4`.

## 4. Manual tasks

A task only a person does ends its title with `(**MANUAL**)`:

```markdown
- [ ] `m-2` Sign off the package (**MANUAL**)
  - The owner has read the release notes
```

- **4.1** A leaf whose title ends with `(**MANUAL**)` is a manual task. A
  runner MUST NOT offer it as ready and MUST NOT give it to an agent. A person
  does it and ticks it on the specs branch, by a commit or by editing
  `tasks.md` on GitHub. The tasks after it wait for the tick, so a manual task
  is also a gate.
- **4.2** The tag MUST be exactly `(**MANUAL**)`, in capitals, at the end of a
  leaf's title. A runner MUST refuse a title that holds the word `manual`, in
  any casing, in parentheses or bold in any other form, and a group that
  carries the tag.

## 5. Front matter

- **5.1** The front matter of a spec's files MUST hold only `category` and
  `repo`. A runner MUST refuse any other key. `category` is the group a spec
  is listed under. `repo` is the one repository the spec changes.
- **5.2** A spec MUST change one repository. A change across repositories is
  one spec per repository, linked from a parent spec.
- **5.3** A runner that runs specs for more than one repository MUST refuse a
  spec with no `repo`.

## 6. Linked specs

A parent spec links each member spec with a Markdown link in a task title,
inline or reference-style:

```markdown
- [ ] `ctx-spec` Write the spec for epic context
  - `epic-context` lints clean on `spec/epic-context`
- [ ] `ctx-build` Implement [epic context]

[epic context]: ../epic-context/tasks.md
```

- **6.1** A task whose title links `<specs folder>/<name>/tasks.md` is a spec
  group. The first task above writes the spec and links nothing, so it is a
  leaf. Its children are that spec's tasks. A link to anything else, such as a
  doc page, leaves the task as it is.
- **6.2** A linked spec's tasks MUST be ready only when the spec group's own
  wait is met, the linked spec is approved, and the linked spec's own order
  allows them.
- **6.3** A spec group's box is ticked when every task of the linked spec is.
  The commit that ticks the linked spec's last task SHOULD tick the spec
  group's box when both files are on one specs branch. Otherwise the runner
  ticks it in its own commit.
- **6.4** A runner MUST refuse a spec group with sub-items of its own, a spec
  linked as a spec group more than once in a repository, and a link to a spec
  folder that does not exist, unless an earlier unticked task stands in the
  same list, because that task writes the spec.
- **6.5** A task MUST NOT name a task of another spec. Order across specs is
  the order of spec groups in a parent.

## 7. Approval

An approval is a commit on the specs branch, authored by an approver, that adds
a spec or changes its spec text. It approves the spec text exactly as the commit
leaves it. One commit that changes several specs approves each of them. A
commit's changes are its diff against its first parent.

```markdown [acme/widget: .kiro/specs/parser/tasks.md after a tick]
- [x] `p-1` Read the token table
  - Every row of `tokens.csv` becomes one token kind
```

A tick changes one checkbox, so it changes no spec text. It keeps the approval
whoever authors it, and it approves nothing, even when an approver authors it.

- **7.1** An approver merges a pull request that changes the spec, or pushes a
  commit to the specs branch. Anyone MAY open the pull request. The commit
  message carries nothing, and the committer does not matter, so a squash
  merge made by GitHub counts.
- **7.2** A commit whose author is not an approver approves nothing.
- **7.3** A spec is approved when its current spec text equals the text the
  latest approval left. The current text is read on the task's done branch.
  A runner MUST NOT run a task of a spec that is not approved. A change that
  returns the text to the approved text approves the spec again.
- **7.4** A commit that changes only task checkboxes is not an approval and
  does not end one.
- **7.5** A runner's commit to the specs branch MAY change only task checkboxes
  in spec files. A task that writes spec text lands by a pull request that an
  approver merges (7.1).

## 8. Spec issues and assignment

- **8.1** When a spec is approved and has no spec issue, a runner SHOULD create
  one in the spec's repository, and a runner acting as the approving commit's
  author SHOULD be the one to do it, so runners do not race. A new issue
  copies the assignees of the pull request that approved the spec.
- **8.2** A spec issue is an open issue in the spec's repository whose body
  holds a line that is exactly `<!-- avoozl-spec:NAME -->`, where `NAME` is the
  spec's folder name and matches `[A-Za-z0-9._-]+`. A runner MUST read the
  marker only from an issue body whose author is a writer. It MUST look for an
  existing issue before it creates one. When two open issues name one spec,
  the newer one is the duplicate and the runner SHOULD close it.
- **8.3** A runner MUST run a spec only when the spec issue, and the issue of
  every parent spec that links it, is assigned to the runner's own login and
  to no one else.
- **8.4** A person takes a spec by assigning themselves and releases it by
  removing themselves. To give a spec to another login, the current runner
  stops claiming new tasks, pushes every claim branch it holds and releases
  each lease (12.6), and a person changes the assignee. The new login's runner
  resumes each pushed claim branch (12.7).

| Spec issue | Parent spec issue | Runner acting as `acme-alice` |
| --- | --- | --- |
| `acme-alice` | none, or `acme-alice` | runs it |
| `acme-alice` | `acme-bob` | does not run it |
| `acme-alice` | nobody | does not run it |
| nobody | any | does not run it; shows "Unassigned" |
| `acme-alice`, `acme-bob` | any | does not run it |

## 9. Ready tasks

- **9.1** A task is ready, and a runner may create its claim, when all of
  these hold:
  - it is a leaf and is not done (15.1);
  - its spec is approved (7.3);
  - every task it waits for is done (15.1);
  - it is not a manual task;
  - no claim branch for it exists;
  - its spec passes the assignment rule (8.3) and this runner's label filters
    (16.1).
- **9.2** A runner MUST create a claim only for a ready task. Once it holds
  the claim, it MAY work and land the task while the claim exists, although
  the task is no longer ready.

## 10. Next task

- **10.1** When several tasks are ready, a runner SHOULD take the best by these
  keys, in order: it unblocks the most open tasks downstream, counting every
  task that waits on it, directly or not; then it is on the longest remaining
  chain of waits.
- **10.2** A tie SHOULD go to the task that comes earlier in its `tasks.md`.

## 11. Integration branches

A person puts a large change on its own branch by creating that branch. No
setting names it.

- **11.1** When a branch named exactly as a spec's folder exists on origin, the
  spec's tasks, and the tasks of every spec it links, directly or not, land on
  that branch. The outermost such spec up a link chain wins. Otherwise a
  spec's tasks land on the default branch.
- **11.2** A runner MUST NOT create an integration branch and MUST NOT merge
  one into the default branch. A person does both.
- **11.3** Before it claims a task on an integration branch, a runner MUST
  merge the default branch into it with a merge commit and push it, when the
  default branch's head is not already in the integration branch. Otherwise
  nothing happens. A runner MUST NOT rebase or force push.
- **11.4** Tasks claimed together SHOULD start from one merged head.
- **11.5** When the merge conflicts, a runner MUST NOT claim a task on that
  branch until a person resolves it.
- **11.6** A task whose base is an integration branch that holds its spec is
  done when its box is ticked on that branch (15.1), and a task that waits for
  it is ready once the tick is there. The tick reaches the default branch when
  a person merges the integration branch. A spec group's box (6.3) is ticked
  on the parent spec's done branch once every task of the linked spec is done
  on its own done branch.

## 12. Claims

A runner claims a task by creating its claim branch at the base's current head
through the GitHub refs API, then takes the claim's lease:

```http
POST /repos/acme/widget/git/refs
{
  "ref": "refs/heads/avoozl/parser/p-2",
  "sha": "<base head>"
}
```

GitHub refuses the create when the branch exists (HTTP 422). No comment or
label is needed to claim. When two runners claim one task, the first create
wins.

The lease says who may push to the claim branch afterward. It is a ref whose
name ends in a generation number, and GitHub creates each name once. A runner
takes a lease by creating the name with the next generation. The create
points at a lease commit, a child of the claim branch's head that changes no
file, so the ref has a date:

```http
POST /repos/acme/widget/git/refs
{
  "ref": "refs/heads/avoozl-lease/parser/p-2/2",
  "sha": "<lease commit>"
}
```

When two runners on one login resume one claim, the first lease create wins
the same way. Here Runner A wins the claim, then hands the spec to Runner B's
login, which resumes it:

```mermaid
sequenceDiagram
  participant A as Runner A
  participant G as GitHub
  participant B as Runner B
  A->>G: Create avoozl/parser/p-2
  B->>G: Create avoozl/parser/p-2
  G-->>A: 201 Created
  G-->>B: 422 Exists
  A->>G: Create avoozl-lease/parser/p-2/1
  A->>G: Push p-2, delete lease 1
  Note over A,B: Assignee changed to B's login
  B->>G: Create avoozl-lease/parser/p-2/1
  G-->>B: 201 Created, resume p-2
```

A runner that also shows work in progress with a label on the spec issue takes
that label's name from its settings (16.2).

- **12.1** A runner MUST claim a ready task by creating `avoozl/<spec>/<task>`
  at the base's head and then taking a lease (12.5), and MUST do both before
  an agent starts.
- **12.2** A runner whose create fails MUST NOT work on that task and SHOULD
  take the next one.
- **12.3** A runner MUST push to a claim branch only while it holds the
  newest lease of that claim, and MUST read the claim's leases before each
  push and before it lands the task. A runner that finds a newer lease it did
  not create MUST stop work on that task.
- **12.4** A claim branch with no new commit for a number of hours, a runner
  setting, SHOULD show as stale to the spec's assignee. A runner MUST NOT
  delete another runner's claim branch on its own. A person deletes it, which
  frees the task.
- **12.5** A runner takes a lease by creating generation `n + 1`, where `n` is
  the highest generation that exists for the task, or `0` when none does. A
  runner whose create fails MUST NOT work on the task.
- **12.6** A runner that stops a task MUST release its lease by deleting the
  lease ref. A holder MUST renew its lease at least every half of the stale
  hours (12.4) by moving the lease ref to a new lease commit. A lease is stale
  when its lease commit and the claim branch's newest commit are both older
  than the stale hours. A stale lease needs no cleanup: the next generation
  replaces it, and a runner MUST NOT delete another runner's lease. A runner
  deletes every lease of a task with the claim branch it deletes.
- **12.7** A runner MAY resume an existing claim branch of a spec assigned to
  its own login, after a handoff (8.4) or a restart, when the claim has no
  lease or its newest lease is stale (12.6). It resumes by taking a lease
  (12.5), so one runner resumes it, even when several share the login.

## 13. Landing

Landing turns a claim branch into a tick on the task's done branch.

- **13.1** A runner MUST land in this order: merge the base's current head
  into the claim branch, tick the task, run the checks, land by mode, and
  delete the claim branch and its leases once the work is on the base and the
  tick is on the done branch. When the base moves before the last step, the
  runner goes back to the merge.
- **13.2** The tick MUST be on the task's done branch (15.1). When the done
  branch is the base, the tick MUST be in the same commit as the work, or in a
  commit on the claim branch before the checks run. When the done branch is
  another branch, such as the specs branch of another repository, the runner
  ticks the task there in its own commit once the work has landed.
- **13.3** A runner MUST run the repository's checks on the exact head that will
  land, and MUST land nothing when they fail. In `direct` mode that head is
  the commit pushed to the base. In `pr` mode it is the pull request's head,
  which MUST contain the base head the runner read when it ran the checks. The
  merge commit that GitHub makes is not checked.
- **13.4** A runner MUST NOT rebase a branch someone else may hold, and MUST NOT
  force push.
- **13.5** A runner MUST NOT add a trailer, a `Co-authored-by` line or any other
  attribution to a commit message.
- **13.6** A claim branch whose head is in the base, or whose pull request
  merged, holds landed work. The runner that holds its lease MUST then
  tick the task on its done branch, if the tick is missing, in its own
  commit, and delete the claim branch and its leases after. A task whose work
  landed and whose tick did not stays claimed, so no runner takes it again.

## 14. Landing modes

The repository's landing mode says what step four of rule 13.1 does:

| Mode | Action |
| --- | --- |
| `direct` | Push the checked head to the base, as a fast-forward. |
| `pr` | Open a pull request from the claim branch to the base, as `landing.pr` says. |
| `off` | Push the claim branch only. A person lands it. |

`landing.pr`, set for the workspace or per repository, says how a pull request
opens and who merges it:

| `landing.pr` | Opens as | Who merges |
| --- | --- | --- |
| `draft` (default) | Draft | A person, after marking it ready |
| `ready` | Ready for review | A person |
| `auto` | Ready for review | The runner, once checks pass on the pull request's head |

- **14.1** In `direct` mode a runner MUST push the checked head to the base as a
  fast-forward and then delete the claim branch (13.1).
- **14.2** With `landing.pr` `draft`, a runner MUST open a draft pull request,
  and MUST NOT merge it, mark it ready or arm auto-merge on it.
- **14.3** With `landing.pr` `ready`, a runner MUST open the pull request ready
  for review and MUST NOT merge it.
- **14.4** With `landing.pr` `auto`, a runner opens the pull request ready for
  review and merges it once the checks pass on the pull request's head (13.3).
  It merges through the merge API with `sha` set to that head, and goes back
  to the merge step of 13.1 when GitHub refuses the merge because the head
  moved (HTTP 409). It reads the base head again just before the merge, and
  when the base moved, merges the base in and runs the checks again.
- **14.5** In `off` mode a runner MUST push the claim branch only.
- **14.6** While a pull request is open, its claim branch exists, so no other
  runner takes the task. When the base moves under an open pull request, a
  runner SHOULD merge the base in and run the checks again.
- **14.7** A runner MUST NOT arm GitHub auto-merge unless the base's branch
  protection requires branches to be up to date and requires the repository's
  checks. Auto-merge waits for required checks only, so on any other base it
  can merge a head that does not contain the base's head.

The merge API guards the pull request's head only. A push to the base between
the runner's last read and the merge is the one race left, and a base that
requires up-to-date branches closes it.

A review approval cannot release a draft, because GitHub does not let a person
approve their own pull request. A person releases a draft with **Ready for
review**.

## 15. Done tasks

- **15.1** A task is done when its box is ticked on its done branch: the
  integration branch for a task whose base is one that holds its spec (11.1),
  else the specs branch. The commit that changes `- [ ]` to `- [x]` is the
  landing record: its time is when the task landed and its author is who
  landed it. A box ticked by hand counts the same. Ticks on other branches
  count for nothing, and a claim branch's tick counts once it reaches the
  done branch.

## 16. Labels

An optional part. A runner MAY narrow what it picks up with two lists per
repository in its own settings, and MAY name the stop label (18) there:

```json
{
  "labels": {
    "require": [
      "agent-ok"
    ],
    "exclude": [
      "needs-design"
    ],
    "stop": "avoozl:stopped"
  }
}
```

- **16.1** A spec runs on that runner only when its spec issue carries every
  `require` label and no `exclude` label. A `require` label MUST count only
  when a writer added it. An `exclude` label added later MUST NOT unclaim a
  task already claimed.
- **16.2** A runner SHOULD let its settings set the name of every label it
  reads or writes: the `require` and `exclude` filters, the stop label, and
  any label it uses to mark a claim or work in progress. A label name on this
  page is a default. The `require` and `exclude` lists are empty by default,
  and the stop label is `avoozl:stopped`.

## 17. Labeled issues

An optional part. An open issue that carries a `require` label of a runner's
filters, in a repository with no spec for it, is a one-task spec:

| Spec part | From the issue |
| --- | --- |
| Spec name | `issue-<number>` |
| Task ID | `issue-<number>` |
| Title | The issue's title |
| Done bullet | The issue's body |

- **17.1** A runner MUST read the issue's `labeled` event and check its actor's
  permission. A label a non-writer added, or a label on an issue opened by a
  stranger and labeled by no writer, does nothing.
- **17.2** The issue MUST be assigned to the runner's login, as for any spec.
- **17.3** The issue claims, checks and lands like any task, on
  `avoozl/issue-<number>/issue-<number>`. Its landing record is the issue
  closing: in `pr` mode the pull request says `Closes #<number>`, and in
  `direct` mode the runner closes the issue with a comment naming the landed
  commit.

## 18. Stopping a spec

An optional part.

- **18.1** The stop label, `avoozl:stopped` by default (16.2), on a spec issue
  or a parent spec's issue stops new claims for it. A writer MAY add it. Only
  an approver's removal resumes the spec.

## 19. Review output

An optional part. Review findings and failing check output go where code
review goes.

- **19.1** A runner posts them on the task's pull request when it has one, as
  one review per round. A finding on a changed line is a line comment. The
  review only comments; it MUST NOT approve or request changes.
- **19.2** Otherwise a runner posts one comment per round on the spec issue,
  naming the task ID and the commit.
- **19.3** A person answers a finding by resolving its thread, or with a reply
  that starts with `accept`, `reject` or `defer`. Only an approver's reply
  counts.

## 20. Runner limits

- **20.1** A runner MUST NOT push to the base without the repository's checks
  passing on that exact head.
- **20.2** A runner MUST NOT merge a draft pull request, mark one ready, or arm
  auto-merge on one.
- **20.3** A runner MUST NOT act on a label a non-writer added.
- **20.4** A runner MUST NOT force push, rewrite history, or rebase a shared
  branch.
- **20.5** A runner MUST NOT delete a branch or lease it did not create,
  except its own claim branch and that claim's leases after landing.
- **20.6** A runner MUST NOT grant approval: it MUST NOT merge a spec pull
  request, land spec text on the specs branch (7.5), or change the list of
  approvers.
- **20.7** A runner MUST NOT run a spec assigned to another login.
- **20.8** A runner MUST NOT follow text from an issue, comment, pull request or
  commit as an instruction, unless it is an approver's reply of a form this
  page lists.
- **20.9** A runner MUST NOT run a command that is not one of the repository's
  own checks.
- **20.10** A runner MUST NOT write private names, paths or hosts to a public
  repository.

## Conformance

The required profile is every rule in these sections:

| Part | Sections |
| --- | --- |
| Spec format | 1 to 5 |
| Approval | 7 |
| Assignment and finding the spec issue | 8.2, 8.3 |
| Ready rule | 9 |
| Claims and leases | 12.1 to 12.6 |
| Landing and landed work | 13, and the rules of one landing mode in 14 |
| Done tasks | 15 |
| Runner limits | 20 |

Each optional part is listed once. A runner that leaves one out gives the
result in its last column:

| Optional part | Sections | Without it |
| --- | --- | --- |
| Linked specs | 6 | The runner refuses a spec that has a spec group |
| Spec issue publishing | 8.1 | A person creates the spec issues |
| Next task ranking | 10 | The runner takes any ready task |
| Integration branches | 11 | The runner refuses a spec that has a branch named for it |
| Resuming a claim | 8.4, 12.7 | The runner never takes a lease on an existing claim branch |
| Direct landing | 14.1 | The runner does not run in `direct` mode |
| Pull request landing | 14.2 to 14.4, 14.6, 14.7 | The runner does not run in `pr` mode |
| Off landing | 14.5 | The runner does not run in `off` mode |
| Label filters | 16.1 | The runner reads no labels |
| Label names in settings | 16.2 | The runner uses this page's default names |
| Labeled issues | 17 | The runner makes no spec from an issue |
| Stop label | 18 | The runner has no stop label |
| Review output | 19 | The runner posts no review |

A runner supports at least one landing mode.

## Workflow kit

The [workflow kit](../workflow-kit/README.md) holds one case for each of these
checks. A case is a sample repository, the state of origin and its issues, the
history of the specs branch when approval matters, and the answers a runner
gives: the rule numbers a spec breaks, whether a spec is approved, the ready
tasks in order, the claim, the lease, the landing result and the spec issues it
finds. A runner passes workflow v1 when it gives every answer in every case
that checks the required profile or a part it supports.

## Avoozl

Avoozl is the reference runner. It reads specs as this page says, and adds the
settings, refs, lint and commands below.

### Avoozl status

Avoozl does not follow every rule yet. Each item below is not built:

- Order (3): Avoozl orders a spec's tasks by the list, but a spec that still
  has `$after` facts is ordered by them.
- Manual tags (4), plain done bullets (2.3, 2.4) and front matter (5): Avoozl
  still reads `$` fact bullets.
- Linked specs (6): a parent ticks a spec group's box in the landing commit
  only when both `tasks.md` files are on one specs branch; otherwise the box
  waits for a later tick.
- Integration branches (11) and the done branch they set (11.6, 15.1): Avoozl
  still reads an `integrationBranch` key.
- Claims, leases and resuming (12): `avoozl next --claim` and `plans_next`
  with `claim` claim through the refs API and take lease generation 1, but
  Avoozl does not renew a lease or read the leases before a push, and the tick
  still starts a task on its own branch `avoozl/<task>` with no claim branch.
- Landing (13, 14): Avoozl does not guard a pull request merge by head SHA
  and does not tick landed work whose tick is missing (13.6).
- Next task (10): Avoozl ranks by the number of tasks unblocked and then file
  order.
- Label filters (16.1), label names set in settings (16.2), labeled issues
  (17) and the stop label (18).

The kit marks each probe Avoozl fails with the task that fixes it. Approval
(7) reads the revision hash, which sets every checkbox to open, so a tick never
ends an approval. Avoozl counts every approver commit that touches a spec's
files, so an approver's checkbox-only commit approves the text it leaves (7.4).
The kit does not probe that case.

### Spec files

A spec folder may hold `bugfix.md` in place of `requirements.md`, but not
both. A spec file may be at most 1 MB, and a folder may hold at most 50 of
them. Inside Avoozl a spec is stored as a plan, so the `plan.*` operations,
the `plans_*` MCP tools and the `plan` CLI commands keep that name. Avoozl
also reads older plan files written with fenced `task` blocks.

### Specs path and branch

The `.avoozl.json` at the root of the repository that holds the specs may
move the specs folder and name the specs branch:

```json
{
  "version": 1,
  "specs": {
    "path": "docs/specs",
    "branch": "avoozl-plans"
  }
}
```

`specs.path` is relative to the repository root. Avoozl refuses one that is
absolute, names a `.` or `..` folder, or is a symlink that leads out of the
checkout. Kiro's Spec Builder and Kiro Crew planner chats write in
`.kiro/specs/`, so with another path, draft with a planner that runs as a
process. Keep the spec checkout on `specs.branch`: the Specs page names the
problem when another branch is checked out.

### Refs

A task title may end in refs. `[R1.2]` names the requirements the task builds
and `(§2.1)` the design sections it follows:

```markdown
- [ ] `cfg-1` Validate config [R1.2, DL2.3] (§2.1)
  - An unknown key is reported with its path
```

- A requirement ref is `R<n>` for a `Requirement <n>:` heading, or the
  heading's own ID, such as `DL2` for `Requirement DL2:`. `.<m>` adds its
  numbered criterion.
- A design ref is `§` and the number a `design.md` heading starts with, such
  as `§2.1` for `### 2.1 Loader` or `§D1` for `## D1. Shape`.
- A range such as `R4.1–R4.3` or `NK1 to NK3` names both ends.

The page shows refs as chips that open the requirement or section. A task
never names checks: every task runs its repository's checks. See
[Repository checks and isolation](checks.md) for how checks are set.

### Lint

Spec lint checks a folder against sections 1 to 6. Avoozl also refuses a
folder that:

- has both `requirements.md` and `bugfix.md`
- has a ref that names nothing in the spec, or whose file the spec lacks
- holds an `avoozl/manifest.json`

### Creating a spec

Choose **New spec** on the Specs page, name it, pick its repositories, and
start it **Blank** (Kiro Crew's Spec Builder writes it with you), **From a
goal** (an Avoozl planner chat writes the draft), or **From template** (see
[Writing a plugin](plugins.md#template-part)). Before Spec Builder starts,
Avoozl offers to add `.kiro/steering/avoozl-specs.md`, which holds these
rules, and never writes it over a copy you changed. From the CLI:

```sh
avoozl plan.create --json '{"spec":"NAME"}' --workspace ~/plans
```

### Approving in Avoozl

For a draft in a checkout, select the spec, review the lint results and the
graph, and choose **Approve**. It writes one commit on the specs branch,
authored by you, and pushes it without force. `avoozl plan approve NAME...`
previews that from the CLI and approves only the specs it names. Avoozl
refuses when the specs branch already holds that exact text from someone who
is not an approver, because the commit would change nothing.

The approvers are `github.repositories.<repo>.allowedActors`, or the people
with write access when it names nobody. In Local only mode the approver is
the checkout's `user.email`. After approval, **Make the GitHub issues** makes
the spec issue.

### Ticks in Avoozl

On its next tick, Avoozl marks a task done when its box is ticked, and closes
any worker session it had on it. `[~]` and `[-]` marks do nothing. When a tick
is taken out of a done task, the task stays done, and **Needs you** offers
**Reopen** or **Keep done**.

## Related pages

- See [delivery.md](delivery.md) for how Avoozl checks and lands a task.
- See [drivers.md](drivers.md) for which Avoozl workspace runs a spec.
