---
category: Planning
---

# Requirements: checks from a plugin

## Introduction

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

### Scope

- The `checks` part: its manifest shape, loading, approval and running.
- Two step kinds: a run step (a script in the plugin) and an MCP step.
- Three stages: `task`, `phase` and `branch`.
- The decide prompt, the result cache, and `requiredChecks` naming a
  plugin check.

### Out of scope

- Checks a model runs with tools. The decide call only answers yes or no.
- Posting plugin check results to GitHub in any form (PK6.6).
- A model choosing MCP tools or arguments. An MCP step's calls are fixed in
  the manifest (PK10).
- MCP servers reached any way but a local stdio process.
- Sharing the result cache between machines.

### Words

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

## Requirements

### Requirement PK1: The checks part

**User story:** As an organization's tools owner, I want to ship checks in
the same plugin my engineers already install, so that one install and one
approval carries them.

#### Acceptance criteria

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

### Requirement PK2: Which repositories and changes

**User story:** As an engineer, I want a plugin check to run only on the
repositories and files it is meant for, so that it costs nothing elsewhere.

#### Acceptance criteria

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

### Requirement PK3: The decide prompt

**User story:** As a tools owner, I want a slow check to ask a cheap
question first, so that it runs only on the changes that need it.

#### Acceptance criteria

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

### Requirement PK4: Stages

**User story:** As a tools owner, I want to say when a check runs and what
its failure holds, so that a whole-phase check does not block single tasks.

#### Acceptance criteria

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

### Requirement PK5: Cheap filters first

**User story:** As an engineer, I want a slow check to skip work it already
did, so that a rerun or a rebase costs nothing.

#### Acceptance criteria

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

### Requirement PK6: Nothing in the repository

**User story:** As a repository maintainer, I want an organization's checks
to leave my repository as it is, so that their scripts and prompts stay
private and my files stay mine.

#### Acceptance criteria

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

### Requirement PK7: Outside code, held as such

**User story:** As an engineer, I want a plugin check held to the same trust
as other plugin code, so that installing one does not hand it my
credentials or my network.

#### Acceptance criteria

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

### Requirement PK8: Visible

**User story:** As an engineer, I want to see which plugin checks ran, which
were skipped and why, so that I can trust the result.

#### Acceptance criteria

1. A task's check results SHALL list each plugin check with its plugin id,
   its result (`passed`, `failed`, `not run`, `cached`, `skipped`), and for
   `skipped` the filter that skipped it (`repos`, `paths`, `decide`).
2. `avoozl show TASK --json` and the MCP task read SHALL return the same.
3. Settings > Plugins SHALL list each plugin's checks with their stage and
   the repositories they apply to on this workspace.
4. Flow SHALL count plugin check time in the `checks` stage, and decide
   calls in the same stage, by name.

### Requirement PK9: Documented

**User story:** As a tools owner, I want one guide for writing a checks
part, so that I can ship one without reading Avoozl's code.

#### Acceptance criteria

1. `docs/plugins.md` SHALL have a Checks part section with a complete
   example manifest, a decide prompt, a script, an MCP step and its machine
   mapping, using only neutral names.
2. `docs/checks.md` SHALL say that checks may also come from a plugin, and
   link the section.
3. The shipped `avoozl-plugin` skill SHALL know the part.

### Requirement PK10: MCP steps

**User story:** As a tools owner, I want a check to open a task on our
review service through its MCP server, wait for it and read the answer, so
that I ship no script and no model picks what is called.

#### Acceptance criteria

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
