---
repo: avoozl
category: Planning
---

# Checks from a plugin

## Requirements

### Introduction

The `checks` plugin part lets an organization run the same extra checks on
certain repositories from every engineer's machine, without writing them
into those repositories. A privately hosted plugin (Requirement 34.12) ships
check definitions, their scripts and optional decide prompts. A check's step
is either a script in the plugin (a run step) or a fixed sequence of calls to
an outside service's MCP server (an MCP step): open a task, poll it, read the
answer. A person on each machine adds and approves the plugin once, and maps
each MCP server it names to a server command on that machine. Nothing of the
plugin is written to the repositories the checks run on.

Each plugin check filters itself cheaply before it runs: by repository, by
changed paths, by an optional decide prompt that a small read-only model
call answers, and by a result cache. A check also names its stage: a task's
landing, a phase's combined changes, or the head of an integration branch.

#### Scope

- The `checks` part: its manifest shape, loading, approval and running.
- Two step kinds: a run step (a script in the plugin) and an MCP step.
- Three stages: `task`, `phase` and `branch`.
- The decide prompt, the result cache, and `requiredChecks` naming a
  plugin check.

#### Out of scope

- Checks a model runs with tools. The decide call only answers yes or no.
- Posting plugin check results to GitHub in any form (PK6.6).
- A model choosing MCP tools or arguments. An MCP step's calls are fixed in
  the manifest (PK10).
- MCP servers reached any way but a local stdio process.
- Sharing the result cache between machines.

#### Words

| Word | Meaning |
| --- | --- |
| Plugin check | One check a plugin's `checks` part defines |
| Repository check | One check in a repository's own `checks` setting |
| Decide prompt | A Markdown file in the plugin that asks whether a check is needed |
| Decide call | One read-only model call with the decide prompt, answering `{needed, reason}` |
| Run step | A check step that runs a script inside the plugin folder |
| MCP step | A check step of fixed MCP tool calls: start, poll, result |
| Server alias | A name a plugin gives an MCP server it needs; this machine maps it to a server command |
| Stage | When a plugin check runs and what it blocks: `task`, `phase` or `branch` |
| Result cache | This machine's record of a plugin check's result for one content key |
| Content key | A hash of the check's identity and the content of the files its `paths` match |


#### Requirement PK1: The checks part

**User story:** As an organization's tools owner, I want to ship checks in
the same plugin my engineers already install, so that one install and one
approval carries them.

##### Acceptance criteria

1. `checks` SHALL be one of the plugin parts in `PARTS`
   (`src/app/plugins/plugins.ts`). A manifest MAY list `checks` in
   `provides` with any other part. The part SHALL run as no Node child and
   needs no `entry`; its commands run as checks (PK7).
2. The manifest's `checks` key SHALL map a check name to its definition.
   It SHALL be refused when `provides` does not list `checks`, and a
   `provides` that lists `checks` SHALL have at least one check.
3. A check's name SHALL be lowercase letters, digits and dashes, starting
   with a letter, at most 40 characters. A plugin SHALL hold at most 20
   checks.
4. A definition SHALL hold `repos` and exactly one step, `run` or `mcp`
   (PK10), and MAY hold `paths`, `env`, `network`, `timeout`, `decide`,
   `decideAt` and `stage`. Any other key SHALL be refused naming the key.
   - `repos`: 1 to 50 globs over `owner/name`, such as `acme/*`.
   - `paths`: 1 to 50 path globs, matched as repository check `paths` are.
   - `run`: an argv list. The first item SHALL be a relative path to a file
     inside the plugin folder, with no `..` and no absolute path, and never
     a bare command name looked up on `PATH`. A `.mjs` or `.js` file SHALL
     run with Avoozl's own Node; any other file SHALL run directly. Later
     items MAY hold `{commit}`, `{base}` and `{repo}`.
   - `env`: environment variable names. Run steps only; an MCP server's
     environment is the machine's mapping (PK10.2).
   - `network`: `true` or `false`, default `false`. Run steps only; it
     SHALL be refused on an MCP step.
   - `timeout`: whole seconds, 1 to 7200.
   - `decide`: a relative path to a `.md` file inside the plugin folder.
   - `decideAt`: a list of `approve` and `diff`, each once. Default
     `["diff"]`. It SHALL be refused without `decide`.
   - `stage`: `task`, `phase` or `branch`. Default `task`.
5. Every file a definition names SHALL exist in the plugin folder, and so
   SHALL be covered by the plugin's content hash (Requirement 34.4).
6. An invalid `checks` part SHALL make the whole plugin invalid, with the
   reason, and it SHALL NOT be approvable.

#### Requirement PK2: Which repositories and changes

**User story:** As an engineer, I want a plugin check to run only on the
repositories and files it is meant for, so that it costs nothing elsewhere.

##### Acceptance criteria

1. A plugin check SHALL apply to a repository only when the repository's
   GitHub `owner/name` matches one of its `repos` globs. A repository with
   no GitHub name SHALL match by its Avoozl repository ID.
2. A plugin check with `paths` SHALL apply to a change only when the
   change's diff touches one of them, by the same rule as repository checks.
3. A plugin check whose name equals a repository check's name in that
   repository SHALL NOT run there. The repository check SHALL run, and the
   plugin check SHALL show as shadowed in Settings, naming the repository.
4. Two approved plugins that define the same check name for one repository
   SHALL both be held there, with one Needs you item naming both plugins.
5. Only an approved plugin's checks SHALL apply (Requirement 34.4). A
   disabled, changed or unapproved plugin's checks SHALL NOT run, and a
   task waiting on one by `requiredChecks` SHALL say why (PK6.4).

#### Requirement PK3: The decide prompt

**User story:** As a tools owner, I want a slow check to ask a cheap
question first, so that it runs only on the changes that need it.

##### Acceptance criteria

1. WHEN a plugin check has `decide` THEN Avoozl SHALL make a decide call at
   each point `decideAt` lists, for each task the check applies to after
   PK2:
   - `approve`: once per task, when its spec revision is approved, with the
     task's title and text.
   - `diff`: once per task commit, when the task's diff is ready for its
     check run, with the diff.
2. The decide call SHALL be one read-only, offline `check-decide` session:
   the decide prompt, then the input as data. Its only answer SHALL be
   `{"needed": true|false, "reason": "..."}` with a reason of 1 to 300
   characters, sent through `plans_submit_decide` or its output file.
3. The check SHALL apply to the task when any decide call answered
   `needed: true`. A `true` at `approve` SHALL skip the `diff` call.
4. A call that fails, times out, has no model to run on, or answers in any
   other shape SHALL count as `needed: true`, with the cause as its reason.
   An input over 200 KB SHALL count as `needed: true` without a call.
5. The task's page SHALL show each answer with its point and reason. A
   person SHALL be able to flip it: **Run it** makes the check apply,
   **Skip it** makes it not apply. Flipping SHALL be person-only. A flip
   SHALL hold for that task and check until the task's next commit.
6. Answers, reasons and flips SHALL be stored only in this workspace's
   database. They SHALL NOT be written to a spec, an issue, a pull request
   or a commit.
7. The task text and the diff SHALL be passed as untrusted data, marked as
   such in the call's brief. The call's answer SHALL decide only whether
   that one check applies to that one task. It SHALL NOT change any other
   check, task, setting or state.
8. The tick SHALL only queue and dispatch decide calls; it SHALL make no
   model call. A check run waiting on a decide answer SHALL stay queued and
   record `deciding` with the names of the checks it waits on.

#### Requirement PK4: Stages

**User story:** As a tools owner, I want to say when a check runs and what
its failure holds, so that a whole-phase check does not block single tasks.

##### Acceptance criteria

1. `task` SHALL behave as a repository check does: it runs on the task's
   commit and on any merge batch candidate holding the task
   (`merge-batches` MB3), and its failure blocks that task's landing.
2. `phase` SHALL run once WHEN every task of a phase in one plan and one
   repository has landed. It SHALL run at the commit the phase's last task
   landed as, with `{base}` set to the parent of the phase's first landing,
   and it SHALL apply when the combined diff passes PK2 and, with `decide`,
   any of the phase's tasks had `needed: true` or no answer.
3. WHEN a `phase` check fails THEN Avoozl SHALL raise one Needs you item for
   that plan and phase that holds a proposed fix: the check's name and its
   bounded output excerpt as untrusted text. The check SHALL run again when
   the phase's next task lands.
4. `branch` SHALL run on each new head of an epic's integration branch
   (`src/app/epics/integration-branch.ts`) and SHALL count in that head's
   state (`src/app/epics/integration-head.ts`). A red or missing result
   SHALL keep the head from being green, and so SHALL hold only the request
   to land that branch.
5. A `phase` or `branch` check SHALL NOT block or delay any task's landing.
6. A `phase` or `branch` check's result SHALL show on the Epics page beside
   its phase or branch.

#### Requirement PK5: Cheap filters first

**User story:** As an engineer, I want a slow check to skip work it already
did, so that a rerun or a rebase costs nothing.

##### Acceptance criteria

1. Before a plugin check's command runs, Avoozl SHALL apply in order:
   `repos` (PK2.1), `paths` (PK2.2), the decide answer (PK3), then the
   result cache. A filter that rules the check out SHALL skip the later ones.
2. The content key SHALL hash the plugin's id, version and content hash,
   the check's name, and the path and blob ID of every file at the checked
   commit that the check's `paths` match (every tracked file without
   `paths`). WHEN the step uses `{base}` or `{diff_path}` THEN the key SHALL
   also hash the same at the base commit.
3. WHEN the cache holds a passed or failed result for the content key THEN
   Avoozl SHALL use it without running the command, and the record SHALL say
   **cached** with the commit it was first made at. A not-run result SHALL
   never be cached.
4. A merge batch's rerun of a failed check (`merge-batches` MB4) SHALL run
   the command, and its result SHALL replace the cached one.
5. The cache SHALL be local to this machine, SHALL keep at most 5,000
   entries, oldest dropped first, and SHALL drop entries older than 30 days.

#### Requirement PK6: Nothing in the repository

**User story:** As a repository maintainer, I want an organization's checks
to leave my repository as it is, so that their scripts and prompts stay
private and my files stay mine.

##### Acceptance criteria

1. No file, setting, prompt, script, path or URL of a plugin check SHALL be
   written to a repository, a branch, a commit, a pull request or an issue.
2. Pull request text, check summaries and Activity SHALL show a plugin check
   only by its name and its result. The pre-push content rule (Requirement
   40) SHALL scan that name as it scans the rest of the text.
3. A repository MAY list a plugin check's name in `requiredChecks`. The
   entry SHALL stay a name only. On a machine where an approved plugin
   provides that name, a head SHALL count as checked for it only when the
   local result of that plugin check passed on that exact head; a GitHub
   check of the same name SHALL NOT count. Under `pr` landing, Avoozl SHALL
   turn on auto-merge only after that.
4. WHEN no approved plugin on the machine that lands provides a required
   name and GitHub shows no check of that name on the head after its other
   checks finished THEN the task SHALL wait, with one Needs you item that
   names the check and says no machine here can run it.
6. Plugin check results SHALL never be posted to GitHub: no commit status,
   no check run, no comment, no review, under any setting. The check runs on
   one person's machine with that person's credentials, so posting would put
   the plugin's check name and output on a possibly public repository. A
   test SHALL assert that no GitHub write carries a plugin check's result.

#### Requirement PK7: Outside code, held as such

**User story:** As an engineer, I want a plugin check held to the same trust
as other plugin code, so that installing one does not hand it my
credentials or my network.

##### Acceptance criteria

1. A plugin check SHALL run only after a person approved the plugin's id,
   version, content hash and, for git, commit (Requirements 34.4, 34.14).
   Any change SHALL ask again. A local-folder plugin SHALL be hashed again
   just before each run.
2. The approval view SHALL show, per check: its name, `repos`, `paths`,
   its step (`run` with `env` and `network`, or `mcp` with every tool, its
   arguments and the full text of each `{file:NAME}` it sends), `timeout`,
   `stage`, and the decide prompt's full text. For each server alias it
   SHALL show `about` and this machine's mapping.
3. A plugin check SHALL see only the check environment basics plus the
   names in its `env`. Push and GitHub credentials, the gateway's secrets
   and Avoozl's own tokens SHALL never reach it, even when listed, as for
   repository checks.
4. A run step SHALL run in the repository's `isolation` (`sandbox` or
   `unconfined`), with the plugin folder readable and not writable. Its
   network SHALL be off unless its own `network` is `true`. An MCP step's
   server runs as PK10.11 says.
5. A plugin check, and any process it starts, SHALL NOT open a network
   listener. One that does SHALL be stopped, recorded as failed with that
   reason, and its plugin marked broken until approved again.
6. Approving, disabling and removing a plugin, and flipping a decide answer,
   SHALL be person-only operations (refused over MCP and for app tokens).
7. A plugin check's output SHALL be stored only as the bounded, redacted
   excerpt repository checks keep (`outputTail`), and SHALL be treated as
   untrusted data in every brief and view (Requirement 34.6).
8. The decide call SHALL run under the read-only, offline role rules every
   unattended child has (`docs/person-only.md`). For a Kiro Crew chat
   executor this SHALL be documented as a speed bump, not a sandbox.

#### Requirement PK8: Visible

**User story:** As an engineer, I want to see which plugin checks ran, which
were skipped and why, so that I can trust the result.

##### Acceptance criteria

1. A task's check results SHALL list each plugin check with its plugin id,
   its result (`passed`, `failed`, `not run`, `cached`, `skipped`), and for
   `skipped` the filter that skipped it (`repos`, `paths`, `decide`).
2. `avoozl show TASK --json` and the MCP task read SHALL return the same.
3. Settings > Plugins SHALL list each plugin's checks with their stage and
   the repositories they apply to on this workspace.
4. Flow SHALL count plugin check time in the `checks` stage, and decide
   calls in the same stage, by name.

#### Requirement PK9: Documented

**User story:** As a tools owner, I want one guide for writing a checks
part, so that I can ship one without reading Avoozl's code.

##### Acceptance criteria

1. `docs/plugins.md` SHALL have a Checks part section with a complete
   example manifest, a decide prompt, a script, an MCP step and its machine
   mapping, using only neutral names.
2. `docs/checks.md` SHALL say that checks may also come from a plugin, and
   link the section.
3. The shipped `avoozl-plugin` skill SHALL know the part.

#### Requirement PK10: MCP steps

**User story:** As a tools owner, I want a check to open a task on our
review service through its MCP server, wait for it and read the answer, so
that I ship no script and no model picks what is called.

##### Acceptance criteria

1. A plugin MAY declare the MCP servers its checks need in the manifest's
   `servers` key: an alias (the check name rule) mapped to `{about}`, one
   line of 1 to 200 characters saying what the server is for. An MCP step
   SHALL name only a declared alias. A declared alias no step uses SHALL be
   refused.
2. This machine's plugin settings (`plugins.json`, never committed) SHALL
   map each alias of an approved plugin to `{command, env}`: `command` an
   argv list for a local stdio MCP server, `env` the environment variable
   names the server may read. The mapping SHALL hold no credential value;
   credential-like keys and values SHALL be refused. Neither the plugin nor
   any repository SHALL hold it.
3. Only a person SHALL set a mapping, in Settings > Plugins or with
   `avoozl plugins map`. The plugin's approval SHALL bind a hash of its
   mappings. WHEN a mapping changes THEN the plugin SHALL need a new approval
   before its checks run, as for a content hash change (Requirement 34.4). A
   check whose alias has no mapping SHALL be not run, naming the alias.
4. An MCP step SHALL be
   `{"mcp": {"server", "start", "poll"?, "result"}}`:
   - `start`: `{tool, args, id?}`. Avoozl SHALL call `tool` once with
     `args`, and `id` SHALL be a path into its reply naming the task id.
     `id` is required when the step polls.
   - `poll`: `{tool, args, everySeconds, until}`. Avoozl SHALL call `tool`
     every `everySeconds` (5 to 3600, default 30) until `until` holds or the
     check's timeout fires. `until` SHALL be `{path, in: [values]}`. Without
     `poll`, `start`'s reply SHALL be the result.
   - `result`: `{path, pass: [values], text?}`. The check SHALL pass only
     when the value at `path` in the last reply is one of `pass`. `text`
     names the value shown as the check's output.
5. Arguments SHALL be JSON values in which strings MAY hold `{repo}`,
   `{commit}`, `{base}`, `{diff_path}` (a file Avoozl writes with the
   change's diff), `{id}` (poll only) and `{file:NAME}` (the text of a
   file of at most 64 KB inside the plugin folder, such as
   `{file:ask.md}`). Any other placeholder SHALL be refused at validation.
6. A path SHALL be `$` followed by `.key` and `[index]` parts only. Avoozl
   SHALL read a reply's `structuredContent`, else the first text content
   parsed as JSON.
7. A reply that is an MCP error, not JSON, missing the `id`, `until` or
   `result` value, or whose result value is not in `pass` SHALL make the
   check fail. A failure SHALL go back to the worker or person exactly as a
   failing run step does. A timeout SHALL fail with the time spent. A server
   that does not start, or does not list a tool the step names in
   `tools/list`, SHALL make the check not run, with the reason
   (Requirement 38).
8. Avoozl SHALL make every call itself, with no model in the loop. It SHALL
   call only the tools the step names, and only in the order start, poll,
   result. No reply, diff or file content SHALL choose a tool, an argument
   name or the next step.
9. The output a person sees and Avoozl stores SHALL be only the `text`
   value, as a string, through the bounded, redacted excerpt check output
   uses (`outputTail`). Raw replies SHALL NOT be stored or shown.
10. Repository and path filters, the decide prompt, the result cache, the
    stages and the check's timeout SHALL apply to an MCP step as to a run
    step. The content key SHALL also hash the step and the alias's mapping.
11. The MCP server SHALL run outside the worker sandbox, as a child of the
    check runner, started for one check and stopped after it. It SHALL get
    the check environment basics plus its mapping's `env` names, never push
    or GitHub credentials or the gateway secrets, a scratch folder as its
    working folder, and network access. It SHALL NOT open a network
    listener; one that does SHALL be stopped and its plugin marked broken
    (PK7.5).
12. A started task's id SHALL be stored on the check run record, so that a
    backend restart resumes polling that task and does not start a second.

## Design

`PK` numbers are in [Requirements](#requirements); `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

### D1. The part in a manifest

```json [avoozl-plugin.json]
{
  "id": "acme-checks",
  "version": "1.4.0",
  "contract": 1,
  "provides": [
    "checks"
  ],
  "servers": {
    "review": {
      "about": "The acme review service, which compares API behavior"
    }
  },
  "checks": {
    "parity": {
      "repos": [
        "acme/*"
      ],
      "paths": [
        "src/api/**",
        "schema/**"
      ],
      "run": [
        "bin/parity.mjs",
        "--repo",
        "{repo}",
        "--from",
        "{base}",
        "--to",
        "{commit}"
      ],
      "env": [
        "PARITY_TOKEN"
      ],
      "network": true,
      "timeout": 1800,
      "decide": "prompts/parity.md",
      "decideAt": [
        "approve",
        "diff"
      ],
      "stage": "phase"
    },
    "license-scan": {
      "repos": [
        "acme/web-*"
      ],
      "run": [
        "bin/license-scan.sh"
      ]
    },
    "parity-review": {
      "repos": [
        "acme/*"
      ],
      "paths": [
        "src/api/**"
      ],
      "timeout": 3600,
      "stage": "branch",
      "mcp": {
        "server": "review",
        "start": {
          "tool": "create_review",
          "args": {
            "repo": "{repo}",
            "from": "{base}",
            "to": "{commit}",
            "diff": "{diff_path}",
            "question": "{file:ask.md}"
          },
          "id": "$.review.id"
        },
        "poll": {
          "tool": "get_review",
          "args": {
            "id": "{id}"
          },
          "everySeconds": 60,
          "until": {
            "path": "$.state",
            "in": [
              "done",
              "error"
            ]
          }
        },
        "result": {
          "path": "$.verdict",
          "pass": [
            "same"
          ],
          "text": "$.summary"
        }
      }
    }
  }
}
```

This machine's `plugins.json` maps the alias. Only a person writes it, and
the plugin's approval binds its hash (PK10.3):

```json [plugins.json]
{
  "mcp": {
    "acme-checks": {
      "review": {
        "command": [
          "/opt/acme/bin/review-mcp",
          "--stdio"
        ],
        "env": [
          "REVIEW_TOKEN"
        ]
      }
    }
  }
}
```

The plugin folder holds the manifest, `bin/parity.mjs`,
`bin/license-scan.sh`, `prompts/parity.md` and `ask.md`, beside each other. The
content hash covers every file in the folder (`contentHash` in
`src/app/plugins/plugins.ts`), so approving the plugin approves the scripts
and the prompt. A plugin that also ships `rules` keeps its `entry`; a plugin
of `checks` only, or of `checks` with data parts, has none.

A decide prompt is plain Markdown:

```markdown [prompts/parity.md]
Answer whether this change can alter the public API of the service:
request or response shapes, error codes, or the published schema.
Changes only to tests, docs, comments or internal helpers do not.
```

### D2. Where the code goes

| Module | Job |
| --- | --- |
| `src/app/plugins/plugins.ts` | `PARTS` lists `checks`; `validateManifest` calls the part's validator; `inspectPlugins` carries the parsed checks |
| `src/app/plugins/plugin-checks.ts` | `validateChecksPart(manifest, folder)`; `approvedPluginChecks(options)` and `pluginChecksOf(store)`; the mappings and `mappingHash` |
| `src/app/plugins/mcp-steps.ts` | A stdio MCP client (initialize, `tools/list`, `tools/call`) over JSON lines, the path reader and D13's start/poll/result loop |
| `src/app/plugins/plugin-check-run.ts` | Running one plugin check: the result cache (D6), then its run step or MCP step |
| `src/app/plugins/check-decide.ts` | The decide calls, their answers and flips (D5) |
| `src/app/plugins/check-stages.ts` | The `phase` and `branch` stages, the required-name reads and the task's plugin check view (D7, D8) |
| `src/app/plugins/child-io.ts` | The line reader and listener watch shared with plugin children and the epic context broker |
| `src/app/workspace/repository-checks.ts` | `repositoryChecks(repository, plugins)` returns repository and plugin checks in one list, each with `source` and `stage` (D3) |
| `src/app/delivery/check-runs.ts` | Check-run records with a `scope` (`task`, `phase`, `branch`); `runOne` applies D5's filter order |
| `src/app/agents/role-table.ts`, `prompts/check-decide.md` | The `checkDecide` role and its prompt (D5) |
| `src/app/epics/integration-head.ts` | The head's state reads local `branch` plugin results beside GitHub checks (D7) |
| `src/app/landing/pr-landing.ts`, `landing-pulls.ts` | A required name an approved plugin check provides is read locally (D8) |
| `src/app/ops/plugins.ts` | The decide flip and mapping operations, person-only; the stage results read |

Phase and branch runs are `check-run` records with a different `scope`;
decide answers and cache entries are `flow_records` kinds beside them.

### D3. One list of checks

`repositoryChecks(repository, plugins)` takes `plugins` from
`approvedPluginChecks(options)`, loaded once per run or view. Every caller
passes it; a caller that runs only the repository's own commands passes an
empty list. Each entry:

```text
{ name, argv, paths, source: "repository" | "plugin", plugin?: {id, folder, hash},
  stage: "task" | "phase" | "branch", env?, network?, timeoutSeconds?, decide?, decideAt? }
```

Order: the repository's checks as written, then plugin checks by plugin id
and name. The `repos` glob (PK2.1) is applied against the repository's
`owner/name` from its GitHub settings, else its ID. A plugin name equal to a
repository check name is left out and reported as shadowed (PK2.3). Two
plugins with one name for one repository are both left out and reported as
a clash (PK2.4), and one Needs you item is raised per name and repository.

`selectedChecks(repository, files, plugins, stage = "task")` keeps entries of
that stage that pass `checkApplies`.

### D4. Running a plugin check

`argv[0]` resolves against the plugin folder. A `.mjs` or `.js` file becomes
`[process.execPath, file, ...rest]`, the same Node that runs plugin children,
so a check runs the same on macOS, Linux and Windows. Any other file runs
directly. The working folder is the worktree at the checked commit, as for
repository checks.

Placeholders are replaced inside each later argument, never in `argv[0]`:

| Placeholder | Value | Shape checked before use |
| --- | --- | --- |
| `{commit}` | The checked commit | 40 hex characters |
| `{base}` | The base commit of the change (D7) | 40 hex characters |
| `{repo}` | `owner/name`, else the repository ID | `[A-Za-z0-9._/-]{1,200}` |

There is no shell, so a value cannot become a second command.

Environment: the repository check environment with the check's `env` as its
allowlist, then without push credentials, the same filter repository checks
use.

Isolation: `isolatedCheck` in `src/app/workspace/check-isolation.ts`, with
the plugin folder readable. `network` comes from the check, never from the
repository's `isolation.network`: a plugin check with `network: false` runs
offline even in a repository whose isolation has the network on. Under
`unconfined` no limit holds, and the record says "not sandboxed".

Listener watch: while the check runs, Avoozl lists the check's process and
its descendants every 2 seconds and calls `listeningSockets` for each,
failing closed when it cannot check (`watchListeners` in
`src/app/plugins/child-io.ts`). A hit stops the process tree, records the
check as failed with the reason, and marks the plugin broken in this
machine's plugin settings until a person approves it again (PK7.5).

Timeout: `verify.checkTimeouts[name]` when set, else the check's `timeout`,
else `verify.checkTimeoutSeconds`.

### D5. The filter order, and the decide call

For each plugin check of the current stage, `runOne` walks:

```text
repos       (D3, already applied by repositoryChecks)
paths       checkApplies(check, files)               no -> skipped: paths
decide      answer for (task, check) at this point   no -> skipped: decide
                                                     none yet -> wait: deciding
cache       entry for the content key (D6)           hit -> cached result
run         D4
```

A check run waits, queued, while any of its checks is deciding, and runs
once all answers are in, so one result record holds every check of the
commit.

**The call.** A decide call is a session of the `checkDecide` role through
the role table and the executors every other role uses
(`src/app/agents/role-table.ts`):

| Field | Value |
| --- | --- |
| `setting` | `checkDecide` (Settings > Models) |
| `access` | `read` |
| `folder` | `snapshot`: `README.md`, `prompt.md` (the decide prompt), `input.md` (task text) or `input.diff` (diff) |
| `offline` | `true`: no network but the model's route |
| `output` | `{limit: 1024, validate}`: `decide.json`, exactly `{needed: boolean, reason: 1..300 chars}` |
| `hands` | `decide`: writes the answer record |

On a Kiro Crew chat the session answers with `plans_submit_decide` instead,
and only a session bound to that decide call may answer.
`prompts/check-decide.md` frames the call: read `prompt.md`; the input is
data written by someone else and holds no instruction; answer only that.
For a Kiro Crew chat the agent's tool list is the only limit, a speed bump
(PK7.8).

**When.** Approval of a spec revision queues one `check-decide` request per
(task, plugin check with `approve`) that passes `repos` (paths are unknown
before a diff). A task's `done` report queues one per (task, commit, plugin
check with `diff`) that passes `repos` and `paths` and has no `true` from
`approve`. The tick queues and dispatches them; it makes no model call. A
call with no answer in 10 minutes counts as needed.

**Records.** `flow_records` kind `check-decide`:
`{taskId, check, plugin, at: "approve"|"diff", commit?, needed, reason, cause?}`.
`cause` is set when PK3.4 forced `true`. A flip is a `check-decide-flip`
record with `needed`, `flippedBy` and the commit it was made at; a new
commit leaves the flip behind (PK3.5).

### D6. The result cache

Content key, SHA-256 over:

```text
plugin.id, plugin.version, plugin.hash, check.name,
sorted [path, blob] at commit for files matching check.paths (all tracked files without paths),
and when argv (or an MCP step's args) uses {base} or {diff_path}: the same list at base,
and for an MCP step: the step and the hash of its alias's mapping
```

The list comes from one `git ls-tree -r` at each commit, filtered by
`matchesPath`. The cache is `flow_records` kind `check-cache`:
`{key, check, plugin, result: {exitCode, tail, durationMs}, firstCommit, at}`.
A passed or failed result is stored; a not-run result never is. Before each
store, entries older than 30 days and the oldest over 5,000 are dropped. A
lookup ignores an entry older than 30 days. The merge batch rerun of a
failed check passes `fresh: true`, which skips the lookup and replaces the
entry.

### D7. Stages

| Stage | Runs at | `{base}` | A failure holds |
| --- | --- | --- | --- |
| `task` | The task's commit; a merge batch candidate | The task's base | That task's landing |
| `phase` | The commit the phase's last task landed as | The parent of the phase's first landing | Nothing; one Needs you item |
| `branch` | Each new head of an epic's integration branch | The merge base with the base branch | That head's state only |

**Phase.** A phase is a plan's phase in one repository. `queuePhaseChecks`
runs in the tick: for a phase whose tasks have all landed, it queues one
`check-run` with `scope: {kind: "phase", plan, phase, title, first, tasks}`,
once per (phase, last landing commit). A failure raises one Needs you item,
`phaseNeedsYou`, holding the proposed fix: the check name and the bounded
excerpt inside an untrusted block, made in a chat by a person. When the
phase's next task lands, its last landing commit changes, so the tick queues
the phase check again.

**Branch.** `branchChecks`, called from the integration-head read
(`src/app/epics/integration-head.ts`), queues one `check-run` with
`scope: {kind: "branch", repository, branch, head, tasks}` for each new head
and returns each applicable `branch` plugin check as `{name, done, ok}` for
the head's state: not run yet is pending, failed is red. A red head
withholds the request to land the branch; nothing else changes.

**Applies.** For `phase` and `branch`, `paths` match the combined diff from
`{base}`; a decide check applies when any of the run's tasks has a `true`
answer or no answer, and waits while any is pending.

`stageResults` gives the Epics page the newest run per phase and per branch,
with each check's result (PK4.6).

### D8. Required by name, and never posted

Plugin check results never go to GitHub: no commit status, no check run, no
comment, no review, and no setting turns this on (PK6.6). The GitHub client
is not passed to the check-run path, and a test runs a plugin check through a
recording fake GitHub and asserts no write names it.

`requiredChecks` stays a list of names. For a name an approved plugin check
on this machine provides, a head is checked only when the local result of
that check (its run, or the cache hit it used) passed on that exact head
(`localCheckResult` and `localRequired` in `check-stages.ts`); a GitHub
check of the same name does not count. `pr-landing.ts` reads the local
result for such a name, so auto-merge for a `pr` head waits for it. Any
other name is read from GitHub. A name with no local provider, no GitHub
check after the head's checks finished, and no result gets one Needs you
item (`requiredCheckNeedsYou`) that says no machine here runs the check. The
task waits; nothing fails.

### D9. Security

Read with `docs/checks.md` and `docs/person-only.md`.

| Threat | Guard |
| --- | --- |
| A changed script or prompt runs without review | Content hash and, for git, commit bound to the approval; re-hash before each local-folder run (PK7.1) |
| A check reads push or GitHub credentials | The shared env filter strips them after the allowlist (PK7.3) |
| A check calls out where it should not | Network off unless the check's own `network: true`, shown in the approval view (PK7.2, PK7.4) |
| A check opens a port others can reach | Listener watch over the process tree; stop and mark broken (PK7.5) |
| A check writes into the repository's worktree or the plugin | Isolation's write roots; the plugin folder read-only (PK7.4) |
| A diff talks the decide call into skipping a check | Data marked untrusted; the answer can only skip that one check for that one task; bad output means run; a person can flip (PK3) |
| A diff talks the decide call into doing something else | Read-only and offline, one 1 KB output file checked by shape (PK3.2) |
| Check output carries a secret or a path into a PR | `outputTail` redaction; PR text shows the name and result only; the pre-push content rule (PK6.2) |
| An MCP step's server is swapped for another command | The mapping is person-only and its hash is bound to the approval (PK10.3) |
| A reply or a diff steers which MCP tool runs | Tools, order and argument names are fixed in the manifest; no model in the loop (PK10.8) |
| An MCP reply carries more than the answer into a view | Only the `text` value, bounded and redacted, is kept (PK10.9) |
| A plugin check's name or output reaches a public repository | Results are never posted to GitHub (PK6.6, D8) |
| An agent approves a plugin or flips an answer | Person-only operations, refused over MCP and app tokens (PK7.6) |
| A shared `.avoozl.json` plugin entry adds a check silently | The entry declares; only this machine's approval loads it (R34.4) |

The plugin's own service credential (`PARITY_TOKEN` above) is named in
`env` and read from the environment the person sets; it is never in the
manifest or the entry (R34.2).

### D10. Page views

| Where | Shows |
| --- | --- |
| Task > Checks | Each check, its source (plugin id), result or skip reason, **cached** with its first commit |
| Task > Checks, decide | Each answer: point, `needed`, reason, **Run it** / **Skip it** (person only) |
| Epics > phase, branch | The `phase` and `branch` check results beside the phase and the head |
| Settings > Plugins > view | Per check: the PK7.2 fields and the prompt text; shadowed and clashing repositories |
| Needs you | A clash (PK2.4), no machine for a required name (PK6.4), a failed phase check (PK4.3) |

### D11. Risks

| Risk | Guard |
| --- | --- |
| A cache hit hides a change outside `paths` that matters | The key hashes every tracked file when `paths` is absent; the author picks `paths` |
| The decide call says no too often | Bad output and failures count as yes; the answer shows on the task; a person can flip |
| A slow `task` plugin check slows every landing | Filters first; the author can choose `phase` or `branch` instead |
| Answers and flips are lost on `avoozl rebuild` | They are a cache (PK3.6); a lost answer is asked again |
| A `phase` failure is found after its tasks landed | That is the stage's point; the fix lands like any task and the check runs again |
| Engineers without the plugin cannot land a repository requiring it | PK6.4's Needs you item names the check; the repository chose to require it |

### D12. Rules

1. `run[0]` is always a file inside the plugin, never a bare `PATH` name
   (PK1.4).
2. Results never post to GitHub (PK6.6, D8).
3. A decide `no` may skip a check that `requiredChecks` names. It is
   recorded as `skipped: decide` and counted as checked; the author wrote
   the prompt, and a person can flip it.
4. A phase fix does not start on its own. Its text is outside output, so a
   person makes it, which keeps an outside service from steering a write
   worker.
5. PK6.4 looks only at the machine that lands.

### D13. MCP steps

An MCP step is a fixed program of at most three kinds of call, which Avoozl
runs itself. Nothing in it is chosen at run time.

```text
resolve alias -> this machine's mapping (none -> not run, naming the alias)
start server: argv from the mapping, cwd a scratch folder, env basics + mapping env
initialize; tools/list must hold every tool the step names (else not run)
id    = record.mcpIds[check] ?? path(call(start.tool, fill(start.args)), start.id)
        store id on the check-run record                     (PK10.12)
loop  while poll and not timed out:
        wait everySeconds
        reply = call(poll.tool, fill(poll.args, {id}))
        break when path(reply, until.path) in until.in
result = path(last reply, result.path) in result.pass ? passed : failed
output = string(path(last reply, result.text)) through outputTail
stop server; remove scratch folder and the diff file
```

**Filling arguments.** `fill` walks the JSON value and replaces
placeholders inside strings only; keys are never filled. `{diff_path}` is a
file in the scratch folder holding the diff from `{base}` to `{commit}`.
`{file:NAME}` reads a file inside the plugin folder by the same path rule as
`run[0]`, at most 64 KB. `{commit}`, `{base}` and `{repo}` have D4's shape
checks.

**Reading replies.** A reply's `structuredContent` when present, else the
first `text` item parsed as JSON, else nothing. A path is `$`, then
`.key` or `[index]` parts; there are no filters or wildcards, so a reply
cannot make the path do work. A value is compared to `in` and `pass` by
JSON equality.

**Outcomes.**

| What happened | Result |
| --- | --- |
| The mapping is missing, or the server does not start or initialize | not run |
| `tools/list` lacks a tool the step names | not run |
| A call returns an MCP error, or a reply has no JSON | failed |
| `start` has no value at `id` | failed |
| The timeout fires before `until` holds | failed, with the time spent |
| The result value is missing or not in `pass` | failed |
| The result value is in `pass` | passed |

A failed MCP step goes back to the worker (task stage), raises the phase
item (phase stage) or reds the head (branch stage), the same as a failed run
step. Each call has a 60 second limit inside the check's timeout.

**Where it runs.** The server is a child of the check runner, outside the
worker sandbox and outside the repository's check isolation, because it must
reach the outside service. It gets the check environment basics plus the
mapping's `env` names, the same filter as run steps (D4). The listener watch
of D4 covers it. It is started for one check and stopped after it.

**Restart.** The check-run record holds `mcpIds` once `start` answered. A
backend that restarts mid-poll requeues the record (`requeueOrphans` in
`src/app/delivery/check-runs.ts`), and the step skips `start` and polls
that id, so a restart never opens a second task on the service.

**The queue.** A long poll holds its repository's check queue, as a long
run step does (one run at a time per repository, `drainRepository`). A tools
owner who expects long reviews picks the `phase` or `branch` stage.

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`PK1` to `PK10`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
`.kiro/specs/avoozl/avoozl.md#requirements`.

Phase 1 makes `task` plugin checks run with every filter, as run steps
and as MCP steps. Phase 2 adds the
`phase` and `branch` stages. Phase 3 shows them and documents them. `pk-p1`
proves the whole path on a scratch repository.

Tests use isolated temporary workspaces, real git with a bare remote, fake
executors and only fake plugins kept in the test tree (R34.11). Examples use
neutral names such as `acme/*` and `parity`. Screen changes need phone and
desktop, light and dark screenshots for owner approval before merge
(R92.12); screenshots are shown to the owner and never committed
(AGENTS.md).

Task IDs start with `pk-` so
they never collide with the IDs of the other specs.

### Phase 1: Task-stage plugin checks

- [x] `pk-1.1` The checks part in the manifest [PK1] (§D1, §D2)
  - Tests: D1's manifest validates and `inspectPlugins` carries its checks; each PK1.4 key out of range is refused with an error naming the plugin, check and key; a `run[0]` or `decide` outside the folder, with `..`, absolute or missing is refused; `decideAt` without `decide`, `checks` without `provides: checks`, and a 21st check are refused; a checks-only plugin with an `entry` is refused; an invalid part makes the plugin invalid and it cannot be approved.
  - `PARTS` lists `checks`; `src/app/plugins/plugin-checks.ts` holds `validateChecksPart` and `approvedPluginChecks`; `validateManifest` calls the validator; `docs/plugins.md`'s manifest table names the key.
- [x] `pk-1.2` One check list and running a plugin check, after pk-1.1 [PK2, PK4.1, PK7.1, PK7.3, PK7.4, PK7.5, PK7.7] (§D3, §D4)
  - Tests with a fake plugin and real git: a `task` plugin check runs on a matching repository and not on another; `paths` skip it as for repository checks; a name equal to a repository check is shadowed; two plugins with one name are both held with one Needs you item; placeholders become the commit, base and `owner/name`; a `.mjs` script runs with Avoozl's Node on all three CI platforms; `GH_TOKEN`, `SSH_AUTH_SOCK` and the gateway secrets never reach the script even when listed in `env`; `network: false` runs offline in a sandbox whose repository isolation has the network on; a script that starts a child which listens on a port is stopped, failed with the reason and its plugin marked broken; a local-folder plugin edited after approval does not run; a merge batch candidate runs the task plugin checks; every caller of `repositoryChecks` passes the plugin list (a test greps for a call without it).
  - `repositoryChecks(repository, plugins)` and `selectedChecks(..., stage)` return one list with `source` and `stage`; `src/app/plugins/plugin-check-run.ts` resolves `run[0]`, fills placeholders, filters the environment with the shared code, and runs under `isolatedCheck` with per-check `network` and the read-only plugin folder; the listener watch covers the process tree.
- [x] `pk-1.3` The result cache, after pk-1.2 [PK5] (§D5, §D6)
  - Tests: a second task with the same content of the matched paths reuses a passed and a failed result, marked cached with the first commit; a change outside `paths` hits the cache and one inside misses; a check without `paths` misses on any tracked change; with `{base}` in `run` a different base misses; a not-run result is never stored; the merge batch rerun runs the command and replaces the entry; entry 5,001 drops the oldest, and an entry older than 30 days is dropped; a new plugin version misses.
  - `flow_records` kind `check-cache` keyed by D6's content key from `git ls-tree -r`; checked after the decide answer and before the command; `fresh: true` on the rerun.
- [x] `pk-1.4` The decide call, after pk-1.2 [PK3, PK7.6, PK7.8] (§D5)
  - Tests with a fake executor: approval queues one `approve` call per applicable task and a `true` there skips the `diff` call; a `done` report queues one `diff` call per commit; `needed: false` records `skipped: decide`; output that is not exactly `{needed, reason}`, a failed call, a timeout, no model, and an input over 200 KB each count as `true` with the cause; a diff holding instructions to change other checks changes nothing but that answer; the run waits while a check is deciding and then holds every check in one record; **Run it** and **Skip it** are refused over MCP and for an app token and accepted from a person; a new commit drops the flip; no answer appears in a spec file, issue body, pull request body or commit; the tick makes no model call.
  - The `checkDecide` row in `src/app/agents/role-table.ts` (read, snapshot, offline, a 1 KB `decide.json`, hands `decide`) and `prompts/check-decide.md`; `check-decide` records in `src/app/plugins/check-decide.ts`; queuing at approval and at `done`; the flip operation, person-only; Settings > Models lists the role.
- [x] `pk-1.5` A required plugin check, after pk-1.2 [PK6] (§D8)
  - Tests: a repository whose `requiredChecks` names `parity` waits for the local result on that exact head and lands after it passes; under `pr` landing auto-merge is armed only after it; a passing GitHub check named `parity` does not satisfy it while the plugin provides the name; with the plugin absent the task waits with one Needs you item naming the check, and a second tick opens none; the pull request body and Activity hold the check's name and result and none of the plugin's paths, prompt or script text; a run, MCP, phase and branch plugin check through a recording fake GitHub makes no commit status, check run, comment or review.
  - One reader for a required name's result (`localRequired` in `src/app/plugins/check-stages.ts`), used by `pr-landing.ts`: the local plugin result for a name a plugin provides, GitHub for any other; the Needs you item; PR text from name and result only; the check-run path gets no GitHub client.
- [x] `pk-1.6` MCP steps, after pk-1.3, pk-1.4 [PK10, PK1.4, PK7.2] (§D1, §D6, §D13)
  - Tests with a fake stdio MCP server in the test tree: D1's `parity-review` validates, and a step naming an undeclared alias, an unused alias, an unknown placeholder, a path with a filter, or `network` on an MCP step is refused; a mapping with a credential-like key or value is refused, and setting one is refused over MCP and for an app token; a changed mapping stops the check until the plugin is approved again; with no mapping the check is not run naming the alias; start, three polls and a result pass and fail by `pass`; an MCP error, a reply with no JSON, a missing `id`, a missing result value and a timeout each fail; a tool missing from `tools/list` is not run; a reply naming another tool or holding instructions changes nothing and no tool outside the step is called (the fake server records every call); the stored output is only the `text` value, bounded and redacted; the server sees its mapping's `env` and never `GH_TOKEN`, `SSH_AUTH_SOCK` or the gateway secrets; a server that opens a listener is stopped and its plugin marked broken; a backend killed mid-poll resumes the same id and the fake server saw one `start`; a cache hit makes no call, and a changed mapping misses; the decide prompt and stages apply as for a run step.
  - `src/app/plugins/mcp-steps.ts`: the stdio client, the path reader and D13's loop, with the line reader and listener check shared through `src/app/plugins/child-io.ts`; `servers` and `mcp` in `validateChecksPart`; the `mcp` mapping in `plugins.json`, person-only, its hash bound to the approval; `mcpIds` on the check-run record.

### Phase 2: Phase and branch stages

- [x] `pk-2.1` The `phase` stage, after pk-1.3, pk-1.4 [PK4.2, PK4.3, PK4.5] (§D7)
  - Tests with real git and a bare remote: a two-task phase runs its `phase` check once, after both landed, at the last landing commit with `{base}` the parent of the first; no task waited on it; a decide check applies when either task had `true`; a failure opens one Needs you item with the proposed fix text in an untrusted block; a phase whose combined diff misses `paths` runs nothing.
  - `check-run` records with `scope: {kind: "phase", ...}`; `queuePhaseChecks` in the tick queues one per phase and last landing commit; `phaseNeedsYou` raises the item.
- [x] `pk-2.2` The `branch` stage, after pk-1.3, pk-1.4 [PK4.4, PK4.5] (§D7)
  - Tests: each new integration branch head queues one `branch` check run; a pending result keeps the head pending, a failure makes it red, and a pass with green CI makes it green; no task landing into the branch waits on it; a head the check's `paths` miss is not held by it.
  - `check-run` records with `scope: {kind: "branch", ...}`; `branchChecks`, read by `src/app/epics/integration-head.ts` beside GitHub checks.

### Phase 3: Visible and documented

- [x] `pk-3.1` Plugin checks on the page and in reads, after pk-1.5, pk-1.6, pk-2.1, pk-2.2 [PK7.2, PK8, PK4.6] (§D10)
  - UI and CLI tests from fixture records: a task's checks list each plugin check with its plugin, result, skip filter and cached mark; decide answers show with Run it and Skip it; the Epics page shows phase and branch results; Settings > Plugins shows each check's PK7.2 fields, the prompt text, each MCP step's tools, arguments and sent files, each alias with its mapping and a Set mapping action, and shadowed and clashing repositories; `avoozl show TASK --json` and the MCP task read return the same fields; Flow counts plugin check and decide time in `checks`.
  - Task > Checks, Epics, Settings > Plugins and the approval view, from stored records only (`hosts/kirocrew/ui/src/PluginChecks.tsx`).
- [x] `pk-3.2` Docs and the plugin skill, after pk-3.1 [PK9] (§D1, §D9)
  - `docs/plugins.md` has a Checks part section with D1's manifest, prompt, a script, the MCP step and its `plugins.json` mapping, and says results never post to GitHub; `docs/checks.md` links it; the `avoozl-plugin` skill names the part.
  - The guide states the speed-bump limit for Kiro Crew chat executors (PK7.8).

- [x] `pk-p1` Proof: a slow outside check on a scratch repository, after pk-1.5, pk-1.6, pk-2.1, pk-2.2, pk-3.1 [PK1 to PK10] (§D5, §D6, §D7, §D8, §D13) (**MANUAL**)
  - Expected result observed; receipt at `docs/evidence/pk-p1.md`, with no image committed.
  - Setup: an isolated workspace; a scratch repository `acme/api` with a bare remote; a fake review service the proof script starts on `127.0.0.1` that answers each request after 60 seconds and fails any change to `schema/`; a local-folder plugin `acme-checks` with check `parity` (`repos: ["acme/*"]`, `paths: ["src/api/**", "schema/**"]`, `network: true`, a decide prompt, `decideAt: ["approve", "diff"]`, `stage: "task"`), added in this machine's `plugins.json` and approved in Settings; `requiredChecks: ["parity"]` on the repository; one spec with four tasks: a docs edit, a `src/api` refactor the prompt calls internal, a `src/api` change to a response field, and a `schema/` change. For the MCP leg: a fake stdio MCP server the proof script ships, whose `create_review` returns an id at once and whose `get_review` reports `running` for 90 seconds and then a verdict (`same`, or `differs` for any change to `schema/`), logging every call; check `parity-review` from D1 as `stage: "task"`, with the alias mapped in this machine's `plugins.json`.
  - Action: (1) approve the spec and run the tick until the queue is empty; (2) rerun the third task's check on the same content; (3) edit the plugin's script and run one more tick; (4) switch the check to `stage: "phase"`, approve again and run a two-task phase; (5) MCP leg: enable `parity-review`, run the field change and the schema change, and restart the app backend once mid-poll; (6) change the alias's mapping and run one more tick.
  - Expected: (1) the docs task lands with `parity` skipped by paths; the refactor lands with `skipped: decide` and its reason; the field change waits about 60 seconds and lands; the schema change fails and goes back to its worker; nothing of the plugin is in the repository, its branches or pull request text but the name `parity`; (2) the rerun is cached and takes under a second; (3) no check runs until the plugin is approved again; (4) both tasks land without waiting, the phase check runs once after the second, and its failure opens one Needs you item holding the proposed fix; (5) the field change passes after about 90 seconds and the schema change fails and goes back to its worker with the review's summary as its only output; the server's log shows one `create_review` per change despite the restart, and no tool but `create_review`, `get_review` and `tools/list`; (6) no MCP step runs until the plugin is approved again; across every leg the bare remote and GitHub hold no commit status, check run or comment from a plugin check.
  - Failure means: a plugin check runs where its filters say no, a cache hit is wrong, the plugin or a result reaches the repository or GitHub, an MCP step calls a tool it does not name or starts twice, or a phase check blocks a task.
  - Next decision: none.
