---
repo: avoozl
---
# Tasks: epic context for the owner's own work

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`EC1` to `EC11`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, fake executors and fake MCP
servers; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials or personal plans in the repository
(AGENTS.md). Replace the old function or path; add no parallel one. A
session that fails the gate keeps its argv, sandbox, brief and environment
byte for byte (EC10.3). Screen changes need phone and desktop, light and
dark screenshots for owner approval before merge, shown to the owner and
never committed. Examples use only `acme/*`, `research` and `team-context`.

Task IDs start with `ec-` so
they never collide with the IDs of the other specs.

## Phase 1: The gate and the two sources

- [x] `ec-1.1` The three tests and their record [EC1.1, EC1.2, EC1.3, EC1.4, EC1.5] (§D2)
  - Tests with real git and a fake GitHub: a task of an approved, driven spec passes all three; each test failing alone gives `given: false` and names that test with its reason; an `intake-` task and a fix fail `approved`; a task added to `tasks.md` after approval fails `approved`; an approval commit by a non-approver fails `approver`; "Taken by", "N assignees", "Nobody drives" and an unread driver fail `you-drive`, and "This workspace drives it" and "Not shared" pass; a git error fails; spec text, an issue body and a `.avoozl.json` key that ask for context change nothing; `$context` and `$epicContext` facts are refused by lint.
  - `epicContextGate` in `src/app/workers/epic-context.mjs`, with approval commits cached per spec and hash.
- [x] `ec-1.2` The machine `epicContext` block [EC2] (§D3)
  - Tests: the block loads with `repos`, `reads`, `mcp` and `contentSets`; an unknown key (`network` among them), a missing `repos`, more than the limits, a shell string `command` and a credential-like key or value are each refused naming the key; `.avoozl.json` and layered workspace config refuse `epicContext` naming the file; `context.machine.set` is refused over MCP, for a bound caller and for a child marked `AVOOZL_CHILD`; `avoozl context set` and `avoozl context show` work from a terminal; the schema in `host-config.schema.json` matches.
- [x] `ec-1.3` The `context` plugin part [EC3] (§D4)
  - Tests: a `team-context` manifest with skills, reads, asks and `mcp/servers.json` loads; a plugin that provides only `context` and names an `entry` is refused; each EC3.2 key error, an unused or unknown ask, a `SKILL.md` over 64 KB or with a wrong `name`, a servers file with `env` or a credential, a `command` path outside the plugin and a shell string are each refused naming it; `contextSources` returns only approved machine plugins and skips a part `.avoozl.json` declares, which Settings marks "context ignored: declared in .avoozl.json" while its other parts still work.
  - `checkContext` beside `checkPolicy` in `src/app/plugins/plugins.mjs`; `context` joins the data parts.
- [x] `ec-1.4` Asks, MCP mappings and the approval hash, after `ec-1.3` [EC4] (§D5)
  - Tests: an unanswered ask gives nothing and raises one Needs you item naming the questions; `avoozl plugins answer` stores the answer in `plugins.json`; an alias with no mapping gives nothing; a mapping holds `env` names and an optional `command`, and a credential value is refused; changing an answer or a mapping turns the plugin `changed` until approved again; `readPluginSettings` keeps `context` through plugin edits; answer, map and approve are refused over MCP, for a bound caller, a child and the tick; the approval view lists repos, each skill with its hash, each read as written and filled, each alias with its command and env names, and each content set; screenshots of the approval view go to the owner.
  - Reuses PK10's mapping store (`mcp` in `plugins.json`) and its `mappingHash`.

## Phase 2: The session

- [x] `ec-2.1` Gathering a session's context, after `ec-1.2`, `ec-1.4` [EC5] (§D6)
  - Tests: sources whose `repos` match the task's repository are merged without repeats, and others give nothing; a repository with no GitHub remote matches only by its ID; one alias from two sources is dropped from both with one Needs you item naming them; a read that is, holds or is inside a `sandboxSecretPaths` entry, Avoozl's config or state folder, or home itself is left out with its reason; a missing read is left out and named; only the `worker` role gets context.
  - `sessionContext` in `src/app/workers/epic-context.mjs`. Follows D11, question 2.
- [x] `ec-2.2` Reads, skills and the brief in a process session, after `ec-1.1`, `ec-2.1` [EC6, EC1.6, EC10.3] (§D6)
  - Tests with a fake harness: a passing session's reads join `readable` and none is writable; skills are copied to the session context folder only when each file's hash matches the approval, and a changed file gives no skill; the brief's "Epic context" section lists each skill's name, description and path and each read's `about` and path; the folder is removed when the child exits; a resume runs the gate again and drops context when a test now fails, naming it in Activity; a failing or sourceless session's argv, `confineChild` input, brief and environment are byte for byte as before.
  - `processExecutor.start` and its resume path in `src/app/executors/process.mjs`. Follows D11, question 1.
- [x] `ec-2.3` The MCP relay and the harness `context` key, after `ec-2.2` [EC7] (§D6)
  - Tests with a fake MCP server: a harness `context.mcp` argv with `{context_mcp}` loads and passes the same argv refusals as `start`; a harness without it gets no MCP and the record says so; the written MCP config names only the relay and holds no environment value; the relay's socket is `0600` in a `0700` folder and refuses an alias the session was not given and another session's socket; the real server starts on the first connection outside the sandbox with only the basics and its mapped `env` names, in a scratch folder; the worker child's environment holds no mapped name; each tool call's alias, tool, time, bytes and error reach the session's evidence, and no argument or reply does; a server that listens is stopped and its plugin marked broken; servers stop when the session ends; the pull request states, with the Claude Code version and how it checked, that `--mcp-config` with `--strict-mcp-config` loads only that file.
  - `src/app/executors/context-relay.mjs`; the broker in `src/app/executors/supervisor.mjs`; the `context` key in `src/app/executors/harness-definitions.mjs` and `examples/harnesses/claude-code.json`.
- [x] `ec-2.5` Kiro Crew chat workers, after `ec-1.1`, `ec-2.1` [EC8] (§D7)
  - Tests with a fake `kirocrew` executor: a passing chat worker's brief names its skills and reads and no MCP server, and its binding reads "brief only"; a failing chat worker's brief has no epic context section and is byte for byte as before.
- [x] `ec-2.6` A comment that does not count never reaches a context session, after `ec-2.2` [EC1.7] (§D2)
  - Tests with the fake GitHub: a message to a context session that names an author (`from`) who does not count under `allowedActors` and `minimumPermission` is not sent; the session stops at its next safe point and its work is committed as for any stop; the follow-up starts a new session, once the first has ended, whose request says `epicContext: false` and gets no context; a counted author's message is sent as today.
- [x] `ec-2.7` The chip, Activity, Settings › Epic context and the reads, after `ec-2.2`, `ec-2.5` [EC9] (§D9)
  - Tests: the binding holds `epicContext` with sources, given items and tests; the task row and drawer show **Epic context**, or **Epic context (brief only)** on a chat; one Activity row per start or resume whose repository a source names lists the three tests with their reasons and the given items by name, and no path's contents, MCP argument or environment value; a repository no source names writes no row; a giving source's `contentSets` apply at `diff`, `github` and `brief`, and a set this machine lacks blocks; Settings › Epic context lists the machine block, each plugin part with its state and the last ten context sessions; `avoozl show TASK --json` and the MCP task read return `epicContext`; screenshots of the chip, the Activity row and the Settings page go to the owner.

## Phase 3: Proof and docs

- [x] `ec-p1` Proof: context reaches the owner's own spec task and nothing else, after `ec-2.3`, `ec-2.6`, `ec-2.7` (**MANUAL**) [EC1, EC7, EC9, EC11.2] (§D2, §D6, §D8)
  - Expected: (1) the approval view lists both skills, the read, and the `research` alias with its command and env name; (2) the spec task's session reads the note file, quotes the marker skill's phrase and calls `research` once; Activity shows three passed tests and the given items, and the task row shows **Epic context**; (3) the fake server's environment holds the marker variable and the worker's does not; (4) the intake task, the coworker-driven spec and the repository that names `epicContext` or declares the plugin in `.avoozl.json` each get none, and Activity names the failing test or the refusal; (5) a message from a login without write access to the context task's session starts a new session without context; (6) a diff with an `acme-terms` term is blocked; (7) editing `servers.json` turns the plugin `changed` and the next session gets nothing; (8) a listing of TCP listeners (`lsof -nP -iTCP -sTCP:LISTEN`, or `ss -ltnp`) shows no new listener of the sessions.
  - Expected result observed; receipt under `docs/evidence/`, with no image committed.
  - Setup: an isolated Avoozl home and workspace; scratch repositories `acme/widgets` (public) and `acme/tools` with bare remotes and a fake GitHub, or scratch repositories on a test account; a local `team-context` plugin with two skills (one with a marker phrase), a read `{ask:notesRoot}/widgets` holding one note file, and a fake stdio MCP server `research` whose one tool echoes a marker and records its environment names; an `acme-terms` content set; a second test login for the coworker; Claude Code as the harness with the `context` key.
  - Action: (1) add, answer, map and approve the plugin; (2) approve a one-task spec on `acme/widgets` and take it over; let its task run with a brief that asks it to read the note, use the marker skill and call `research`; (3) make an intake task, a spec assigned to the coworker login, and a commit to `acme/tools` that adds `epicContext` to `.avoozl.json` and declares the plugin there, and let each run; (4) queue a message to the context task's session from a login without write access; (5) ask the context task for a change that writes an `acme-terms` term; (6) edit `servers.json`; (7) list the listeners after the sessions.
  - Failure means: the gate or a source lets context reach work that is not the owner's own, or the relay leaks the server's sign-in.
  - Next decision: whether to give context to the falsifier role (D11, question 2).
- [x] `ec-3.1` Docs, the example plugin and the plugin skill, after `ec-p1` [EC8.2, EC11.3, EC11.4] (§D3, §D4, §D7, §D8)
  - `node scripts/check/spec-lint.mjs` reports 0 errors; `docs/plugins.md` has a Context part section with the full `team-context` manifest, a `servers.json`, the asks and the mapping; a new `docs/epic-context.md` describes the three tests, the machine block, what a session gets, the relay, the Kiro Crew limits in EC8.2's words and D8's threats; `docs/person-only.md` lists the person-only context operations; `examples/plugins/team-context/` loads and matches the docs; the shipped `avoozl-plugin` skill knows the part; a search of the added lines finds only neutral names.
