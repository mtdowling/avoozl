---
category: Core
---

# Requirements: Avoozl as the landing spec's reference runner

## Introduction

`docs/github-workflow.md` is the landing spec: the public protocol any runner
follows to run specs on GitHub. It defines the spec format, approval, the
ready rule, claim branches, next-task ranking, landing, label filters and
labeled issues. Its "Avoozl status" section lists the parts Avoozl does not
do yet.

This spec makes Avoozl that protocol's reference runner and little else.
Avoozl keeps what a runner needs: spec format and lint, the task graph and
next-task ranking, claims, landing, spec issues and assignees, approval as an
approver's commit, a server loop that runs when configured, a CLI and MCP
surface, three plugin parts, skills and a small page. Everything else in
Avoozl is cut or becomes a skill.

Any agent, chat or other harness can drive Avoozl through a skill plus MCP,
and use it only for the graph and the next task. Avoozl's own server loop is
one more caller of the same operations.

`design.md` holds the per-module audit (§D14, §D15), with a keep, cut or
becomes-a-skill verdict and a line count for every `src/app` folder and every
page view.

### Glossary

| Term | Meaning |
| --- | --- |
| Landing spec | `docs/github-workflow.md` |
| Runner | As in the landing spec: a program that reads specs, claims ready tasks, has them done, checks and lands them |
| Claim branch | `avoozl/<spec>/<task>`, as in the landing spec |
| Server loop | Avoozl's own tick, run by the supervisor or the Kiro Crew app backend, that claims and starts tasks without a person |
| Caller | Anything that drives Avoozl through the CLI or MCP: a person, a chat, another harness, or the server loop |
| Graph block | The generated Mermaid block in a spec's `tasks.md` (§D9) |
| Skill | A `SKILL.md` that Avoozl ships, generated from `prompts/skills/<name>.md` |
| Group | A task with children |
| Parallel group | A group whose title ends with `(**PARALLEL**)`; its children run side by side |
| Wait | A task that must be ticked before another can start, derived from the list (§D19) |

### Order

This spec's tasks start after three changes that are open on branches today
and remove code this spec would otherwise touch: the approval cut-down
(branch `spec/approval-cutdown`), the mirror removal (branch
`spec/drop-mirror-5`) and the triage removal (branch `task/drop-triage`).
Task `sim-0` is the manual gate a person ticks once all three are on main.

## Requirements

### Requirement SM1: Reference runner

**User story:** As someone who writes another runner, I want Avoozl to do
every part of the landing spec exactly as written, so that I can read its
code as the example.

#### Acceptance criteria

1. Avoozl SHALL do every part the landing spec's "Optional parts" table lists,
   required and optional.
2. WHEN this spec's tasks are done THEN the landing spec's "Avoozl status"
   section SHALL list nothing.
3. Avoozl's docs SHALL describe Avoozl in the landing spec's terms (runner,
   claim branch, base, specs branch) and SHALL NOT describe a step the landing
   spec forbids a runner.

### Requirement SM2: Claims

**User story:** As a person with several machines on one spec, I want each
task taken by exactly one of them, so that no work is done twice.

#### Acceptance criteria

1. Avoozl SHALL claim a task by creating its claim branch at the base's
   current head through the GitHub refs create call, before any agent or
   person starts on it.
2. WHEN the create is refused because the branch exists THEN Avoozl SHALL NOT
   work on that task and SHALL offer the next ready task.
3. A task SHALL be ready only when no claim branch for it exists, as the
   landing spec's ready rule says.
4. A claim branch with no new commit for `claims.staleHours` hours (default
   24) SHALL show as stale in Needs you for the spec's assignee. Avoozl SHALL
   NOT delete another runner's claim branch; a person deletes it.
5. The claim branch SHALL be the only record of who holds a task. Avoozl SHALL
   keep no driver, generation, grant or offer table.

### Requirement SM3: Next task

**User story:** As a caller with several ready tasks, I want the one that
moves the spec furthest, so that my time unblocks the most work.

#### Acceptance criteria

1. Avoozl SHALL rank ready tasks by three keys, in order: most open tasks
   downstream, longest remaining chain of waits, earlier in `tasks.md`. Both
   counts SHALL read the waits SM16 derives.
2. One ranking function SHALL serve `avoozl next`, the MCP next tool, the
   server loop and the page.
3. `avoozl next` SHALL print each ready task with the key values that ranked
   it, so a caller can see why it came first.

### Requirement SM4: Landing

**User story:** As a repository owner, I want every landed task checked on
the exact head that lands and ticked in the same commit, so that main never
holds unchecked work or a stale task list.

#### Acceptance criteria

1. Landing SHALL follow the landing spec's five steps: merge the base in, tick
   the task in the same commit or one before the checks, run the checks on the
   exact head, land by mode, delete the claim branch once the work is on the
   base.
2. In `direct` mode Avoozl SHALL push the checked head to the base as a
   fast-forward, and SHALL go back to step 1 when the base moved.
3. In `pr` mode Avoozl SHALL open a draft pull request from the claim branch
   and SHALL NOT merge it, mark it ready or arm auto-merge on it. WHEN the
   base moves under it THEN Avoozl SHALL merge the base in and run the checks
   again.
4. Avoozl SHALL never force push, rebase a claim branch or add a trailer or
   attribution to a commit.
5. Review output and evidence SHALL go only where the landing spec's "Review
   output" section says: the pull request, or the spec issue.

### Requirement SM5: Label filters and labeled issues

**User story:** As a person who shares a repository with others, I want my
runner to pick up only the specs and issues labeled for it, so that I can
hand work to agents with one label.

#### Acceptance criteria

1. A repository's settings SHALL accept `labels.require` and `labels.exclude`,
   and Avoozl SHALL run a spec only when its spec issue passes them, as the
   landing spec says.
2. An open issue with a `require` label, in a repository with no spec for it,
   SHALL be a one-task spec named `issue-<number>`, as the landing spec says.
3. Avoozl SHALL read each `labeled` event's actor and count the label only
   when that actor is a writer.
4. A labeled issue whose title or body a non-writer wrote SHALL run with the
   stranger rules of `intake/stranger-input.mjs`: the worker gets network off
   and no plugin context.
5. A labeled issue's landing record SHALL be the issue closing, as the landing
   spec says.

### Requirement SM6: Server loop

**User story:** As a person with a spare machine, I want Avoozl to run my
assigned work by itself when I turn it on, and do nothing when I don't.

#### Acceptance criteria

1. The server loop SHALL be off until this machine's config sets `loop`.
2. `loop.run` SHALL take `specs` (every assigned spec that passes the label
   filters), `epics` (only members of the listed epic folders) and `issues`
   (labeled issues), in any combination.
3. The server loop SHALL claim, start, check and land through the same
   operations the CLI and MCP call, and SHALL hold no state they lack.
4. With the loop off, Avoozl SHALL still answer every read, graph and next
   call, so a caller can use it only for the graph and the next task.

### Requirement SM7: CLI and MCP

**User story:** As an agent in any harness, I want every Avoozl feature
behind a command and an MCP tool, so that a skill can drive it with no page.

#### Acceptance criteria

1. The CLI SHALL offer `avoozl next [--claim]`, `avoozl runner report
   TASK done|blocked`, `avoozl land TASK`, `avoozl graph`, `avoozl status`,
   `avoozl show`, `avoozl query`, `avoozl spec lint` and `avoozl rebuild`.
2. `avoozl next --claim` SHALL claim the top-ranked ready task, prepare its
   worktree on the claim branch, and print the task, the worktree path and
   the brief.
3. Each command SHALL have an MCP tool over the same operation, except the
   person-only acts the operation table marks `person`.
4. Every page action SHALL be an operation an MCP tool or a CLI command
   reaches, with the same person-only rules.
5. A test SHALL check that every operation is reached by a CLI command or an
   MCP tool, or is marked `person`.

### Requirement SM8: Graph output

**User story:** As a person in a terminal or a chat, I want to see the task
graph without the page, so that I can tell what is ready and what waits.

#### Acceptance criteria

1. `avoozl graph [SPEC|EPIC]` SHALL print the graph of one spec, one epic, or
   every spec when none is named.
2. `--format text`, the default, SHALL print tasks by phase with each task's
   state (`landed`, `claimed`, `ready`, `waiting`, `manual`, `group`),
   indented as in the list, in lines of at most 80 columns, with no
   color.
3. `--format mermaid` SHALL print one Mermaid `flowchart` of the same tasks,
   phases, groups and waits.
4. An MCP read tool SHALL return the same text and Mermaid output, so a chat
   can show it.
5. One graph builder SHALL feed the page's Graph, the CLI and the MCP tool.
   No second reader of tasks and edges SHALL exist.

### Requirement SM9: Graph block in tasks.md

**User story:** As an approver, I want each spec to carry a diagram of its
tasks that cannot drift, so that I review the plan's shape with its text.

#### Acceptance criteria

1. The spec-writing skill SHALL write a graph block into `tasks.md` between
   the lines `<!-- avoozl:graph start -->` and `<!-- avoozl:graph end -->`.
2. The block SHALL hold only structure: task IDs, titles, phases, groups and
   waits. It SHALL NOT hold state, so a tick does not change it.
3. WHEN a `tasks.md` has a graph block that differs from what the graph
   builder makes from its tasks THEN spec lint SHALL report `graph.stale` at
   the block's first line.
4. `avoozl graph SPEC --write` SHALL replace the block with the builder's
   output, and add it at the end of `tasks.md` when it is missing.
5. A `tasks.md` with no graph block SHALL lint clean.

### Requirement SM10: Roles and skills

**User story:** As the owner, I want Avoozl to start only the sessions a
runner needs, so that every other agent step is a skill any harness can run.

#### Acceptance criteria

1. The role table SHALL hold two roles: `worker` and `reviewer`. The reviewer
   SHALL be optional per repository and off by default.
2. Avoozl SHALL ship these skills: `avoozl-spec` (write a spec), `avoozl-work`
   (work a task), `avoozl-review` (review a pull request), `avoozl-spec-review`
   (review a spec), `avoozl-retro` (a retrospective over landed work) and
   `avoozl-investigate` (how to write an investigation as a task whose done
   bullets name its findings file).
3. Each skill SHALL be generated from `prompts/skills/<name>.md`, and
   `npm run check:agents` SHALL fail when a generated skill differs from its
   source.
4. The worker brief SHALL name the `avoozl-work` skill's steps, so a Kiro Crew
   chat and a process harness get the same instructions.

### Requirement SM11: Plugins

**User story:** As a tools owner, I want plugins to add checks, credentials,
context and content rules, and nothing that rebuilds a removed feature.

#### Acceptance criteria

1. Plugin `provides` SHALL accept `checks`, `credentials`, `context` and
   `rules`.
2. A manifest that lists `pack`, `intake`, `template` or `policy` SHALL be
   refused, naming the part and saying it is not a plugin part.
3. The `checks` part SHALL be the one `.kiro/specs/plugin-checks/` defines,
   and the `context` part the one `.kiro/specs/epic-context/` defines.

### Requirement SM12: Setup

**User story:** As a new user, I want to point Avoozl at a repository and
have it rebuild everything from git, so that setup is one step.

#### Acceptance criteria

1. `avoozl repository configure ID --root PATH` SHALL add a local checkout,
   and Avoozl SHALL then rebuild its cache from git and GitHub
   (`avoozl rebuild`) with no other step.
2. Avoozl SHALL ship no demo mode, example installer, sample specs, instance
   publish or onboarding wizard.
3. Avoozl SHALL write nothing to GitHub during setup. A high-risk GitHub job
   SHALL keep its confirm popup and CLI prompt.

### Requirement SM13: The page

**User story:** As a person, I want the page to show what runs and what needs
me, and hand everything else to a chat.

#### Acceptance criteria

1. The page SHALL have five views: Plans, Graph, In flight, Needs you and
   Settings, as §D13 describes.
2. Each view SHALL read operations the CLI and MCP also reach, and SHALL write
   only through them.
3. A "Run in a chat" action SHALL open a chat seeded with the matching skill
   and the item's IDs, on Kiro Crew or as a process session.
4. Every view §D15 marks cut SHALL be gone, with its API file and tests.

### Requirement SM14: Cuts

**User story:** As a maintainer, I want each cut module gone with all its
traces, so that no dead code or setting stays behind.

#### Acceptance criteria

1. Each module §D14 marks cut SHALL be deleted with its tests, its operation
   entries, CLI commands, MCP tools, settings keys and schema properties.
2. A settings key that names a cut feature SHALL be refused by config load,
   naming the key.
3. WHEN a cut lowers the clone count THEN `scripts/check/dup-baseline.json`
   SHALL be lowered in the same change.
4. Each module §D14 marks becomes-a-skill SHALL be deleted once its skill
   ships, and the skill SHALL do its job through MCP and the CLI only.

### Requirement SM15: Safety kept

**User story:** As the owner, I want every guard that keeps private data and
person-only acts safe to stay, so that the cut makes Avoozl smaller, not
weaker.

#### Acceptance criteria

1. Content rules, the privacy scan, person-only operations, harness
   refusals, the worker sandbox, the command allow-list and the high-risk
   GitHub confirm SHALL stay, with their tests.
2. A test SHALL check that no cut removes a person-only operation's refusal
   over MCP.

### Requirement SM16: Order from the list

**User story:** As a spec writer, I want the order of the list to say what
runs first, so that I never write or check a dependency fact.

#### Acceptance criteria

1. Every checkbox line SHALL be a task with a backticked ID and a title.
2. Siblings SHALL run in order, top to bottom. A task SHALL wait for the
   sibling above it, and for every task in it when that sibling is a group.
3. A task with children SHALL be a group. A group SHALL never be ready,
   claimed or worked, and its box SHALL be derived from its children.
4. A group's children SHALL run in order, unless its title ends with
   `(**PARALLEL**)`; then they SHALL run side by side. A nested group SHALL
   run its children in order unless its own title carries the tag, even
   inside a parallel parent.
5. Spec lint SHALL report `group.box` WHEN a group's box is ticked while a
   child is open, or open while every child is ticked; `parallel.size` WHEN a
   parallel group has fewer than two children; `parallel.leaf` WHEN a task
   with no children carries the tag; `parallel.tag` WHEN a title holds the
   word `parallel`, in any casing, in parentheses or bold other than exactly
   `(**PARALLEL**)` in capitals at its end; and `facts.removed-key` for
   every `$after` fact.
6. `##` phases SHALL run in order: the first item of a phase SHALL wait for
   every task of the phase above it.
7. Specs linked from a parent spec (SM18) SHALL be ordered by the same
   rules as the parent's tasks. No task SHALL name a task of another spec.
8. A leaf SHALL be ready only when every task it waits for is ticked on the
   specs branch, with the landing spec's other ready conditions.
9. One function SHALL derive the waits, and the ready rule, ranking, the
   graph builder and lint SHALL read only it.
10. Every spec in this repository SHALL use this form, and
    `docs/github-workflow.md` and `docs/specs.md` SHALL describe it.
11. WHEN an old `$after` graph has no exact list form THEN the rewrite SHALL
    add the fewest extra waits that keep every old one, and SHALL list each
    added wait in its commit message.

### Requirement SM17: Tasks hold no facts

**User story:** As a spec writer, I want a task to be a title and the
bullets that say when it is done, so that a spec reads as plain Markdown.

#### Acceptance criteria

1. A task SHALL hold no `$` facts. What done means SHALL be the plain
   sub-bullets under a leaf, one result each.
2. A task only a person does SHALL end its title with `(**MANUAL**)`, in
   capitals, by the rules of the `(**PARALLEL**)` tag: it ends the title and
   comes before any refs. It SHALL never be given to an agent, and a person
   SHALL tick it.
3. A spec SHALL change one repository: its front matter's `repo`. A change
   across repositories SHALL be one spec per repository, linked from a
   parent (SM18).
4. Front matter SHALL hold only `category` and `repo`.
5. Spec lint SHALL report:
   - `facts.removed-key` for every sub-bullet that starts with `$`, with
     its fix (§D20);
   - `frontmatter.removed-key` for a `kind`, `epic`, `integrationBranch`
     or `integrationSync` key;
   - `frontmatter.repo` WHEN `repo` is missing in a workspace with more
     than one repository;
   - `done.missing` WHEN a leaf has no plain sub-bullet;
   - `group.bullets` WHEN a group has a plain sub-bullet;
   - `manual.tag` WHEN a title holds the word `manual`, in any casing, in
     parentheses or bold other than exactly `(**MANUAL**)` at its end;
   - `manual.group` WHEN a group carries `(**MANUAL**)`.
6. Ranking SHALL hold no paths rule, and Avoozl SHALL hold no task back for
   sharing files with a running task. Landing's merge of the base into the
   claim branch SHALL be where two tasks' changes meet.
7. An investigation SHALL be an ordinary task whose done bullets name the
   file it writes, such as `findings/ec-2.0.md`. A task that uses the
   findings SHALL name that file. A decision a person makes on them SHALL be
   a `(**MANUAL**)` task.
8. Flow SHALL keep no fix-work share: no task SHALL be marked fix work, and
   no metric, chart or retro input SHALL count fix work.
9. `docs/github-workflow.md` and `docs/specs.md` SHALL describe tasks with
   no facts, the two tags, and the keys of SM17.4 and no other.

### Requirement SM18: Linked specs

**User story:** As an epic owner, I want to list member specs as tasks with
a link, so that one list orders specs and their own tasks the same way.

#### Acceptance criteria

1. A task whose title holds a Markdown link, inline or reference-style, to
   a spec folder's `tasks.md` SHALL be a spec group whose children are that
   spec's tasks. A spec with a spec group SHALL be a parent, and a parent MAY
   hold tasks of its own.
2. A spec group's linked tasks SHALL be ready only when the spec group's own
   wait is met, the linked spec is approved, and the linked spec's own order
   allows them.
3. A spec group's box SHALL be derived: ticked when every task of the linked
   spec is ticked. The commit that ticks the linked spec's last task SHALL
   tick the spec group's box when both are on one specs branch, and a runner
   SHALL tick it in its own commit otherwise.
4. A "Write the spec" task SHALL be an ordinary task: an agent or a person
   writes the spec on a `spec/<name>` branch, the same branch ticks the task,
   and the approver's merge lands both.
5. Spec lint SHALL report `link.missing` WHEN a spec group links a spec
   folder that does not exist and no earlier unticked task stands in the
   same list; `link.twice` WHEN one spec is linked as a spec group more than
   once in the repository; and `link.children` WHEN a spec group has
   sub-items of its own.
6. A link to anything else, such as a doc page, SHALL leave the task as it
   is.

### Requirement SM19: Integration branches by name

**User story:** As the owner of a large change, I want to put it on its own
branch by creating that branch, so that no setting names it and every member
lands in one place.

#### Acceptance criteria

1. WHEN a branch named exactly as a spec's folder exists on origin THEN
   that spec's tasks, and the tasks of every spec it links, directly or not,
   SHALL land on it; the outermost such spec up a link chain SHALL win.
2. Otherwise a spec's tasks SHALL land on the default branch that the specs
   branch is based on.
3. Avoozl SHALL create no integration branch and SHALL never merge one into
   the default branch; a person creates it and merges it.
4. Integration sync SHALL run at every claim on an integration branch and
   nowhere else: before claiming, WHEN the default branch has moved since
   the integration branch last merged it THEN Avoozl SHALL merge it in with
   a merge commit, never a rebase or force push, and push the clean merge;
   otherwise nothing SHALL happen. Tasks claimed together SHALL share one
   merged head, and a task claimed later MAY start on a newer one.
5. WHEN that merge conflicts THEN Avoozl SHALL raise one Needs you item
   naming the branch and files, and SHALL claim no task on that branch until
   the merge is in.
6. `avoozl-spec-review` SHALL flag a branch on origin whose name equals the
   spec's folder name and that holds work that is not the spec's, and spec
   lint SHALL report the warning `integration.foreign` for it WHEN it can
   read origin.
