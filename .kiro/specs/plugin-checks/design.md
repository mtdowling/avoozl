# Design: checks from a plugin

`PK` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

## D1. The part in a manifest

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

## D2. Where the code goes

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

## D3. One list of checks

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

## D4. Running a plugin check

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

## D5. The filter order, and the decide call

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

## D6. The result cache

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

## D7. Stages

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

## D8. Required by name, and never posted

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

## D9. Security

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

## D10. Page views

| Where | Shows |
| --- | --- |
| Task > Checks | Each check, its source (plugin id), result or skip reason, **cached** with its first commit |
| Task > Checks, decide | Each answer: point, `needed`, reason, **Run it** / **Skip it** (person only) |
| Epics > phase, branch | The `phase` and `branch` check results beside the phase and the head |
| Settings > Plugins > view | Per check: the PK7.2 fields and the prompt text; shadowed and clashing repositories |
| Needs you | A clash (PK2.4), no machine for a required name (PK6.4), a failed phase check (PK4.3) |

## D11. Risks

| Risk | Guard |
| --- | --- |
| A cache hit hides a change outside `paths` that matters | The key hashes every tracked file when `paths` is absent; the author picks `paths` |
| The decide call says no too often | Bad output and failures count as yes; the answer shows on the task; a person can flip |
| A slow `task` plugin check slows every landing | Filters first; the author can choose `phase` or `branch` instead |
| Answers and flips are lost on `avoozl rebuild` | They are a cache (PK3.6); a lost answer is asked again |
| A `phase` failure is found after its tasks landed | That is the stage's point; the fix lands like any task and the check runs again |
| Engineers without the plugin cannot land a repository requiring it | PK6.4's Needs you item names the check; the repository chose to require it |

## D12. Rules

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

## D13. MCP steps

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
