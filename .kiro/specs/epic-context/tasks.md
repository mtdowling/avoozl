---
repo: avoozl
completion: integrated
---
# Tasks: epic context for the owner's own work

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`EC1` to `EC12`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Some tasks need tasks of other specs, named in their summaries: vm-3.1 (the
stranger marker) and vm-2.4 (the egress proxy) of `vm-harness`, and
Requirement 115 of `spec/spec-assignee-2`. Do not start such a task before
the named work has landed.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, fake executors and fake MCP
servers; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials or personal plans in the repository
(AGENTS.md). Replace the old function or path; add no parallel one. A
session that fails the gate keeps its argv, sandbox, brief and environment
byte for byte (EC11.3). Screen changes need phone and desktop, light and
dark screenshots for owner approval before merge, shown to the owner and
never committed. Examples use only `acme/*`, `research` and `team-context`.

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Task IDs start with `ec-` so
they never collide with the IDs of the other specs.

## Phase 1: The gate and the two sources

- [ ] `ec-1.1` The four tests and their record [EC1.1, EC1.2, EC1.3, EC1.4, EC1.5, EC1.8] (§D2)
  - $done: Tests with real git and a fake GitHub: a task of an approved, driven spec with no stranger input passes all four; each test failing alone gives `given: false` and names that test with its reason; an `intake-` task and a triage fix fail `approved`; a task added to `tasks.md` after approval fails `approved`; an approval commit by a non-approver fails `approver`; "Taken by", "Your other machine", "N assignees" and "Nobody drives" fail `you-drive`, and "You drive" and "Not shared" pass; a set `strangerInput` and a missing field both fail; a git error fails; spec text, an issue body and a `.avoozl.json` key that ask for context change nothing; `$context` and `$epicContext` facts are refused by lint; a batch passes only when every member does.
  - `epicContextGate` in `src/app/workers/epic-context.mjs`, with approval commits cached per spec and hash. Needs vm-3.1 of `vm-harness` and Requirement 115.
- [ ] `ec-1.2` The machine `epicContext` block [EC2] (§D3)
  - $done: Tests: the block loads with `repos`, `reads`, `mcp`, `network` and `contentSets`; an unknown key, a missing `repos`, more than the limits, a wildcard, an IP or a port other than 443, a shell string `command` and a credential-like key or value are each refused naming the key; `.avoozl.json` and layered workspace config refuse `epicContext` naming the file; `context.machine.set` is refused over MCP, for a bound caller and for a child marked `AVOOZL_CHILD`; `avoozl context set` and `avoozl context show` work from a terminal; the schema in `host-config.schema.json` matches.
- [ ] `ec-1.3` The `context` plugin part [EC3] (§D4)
  - $done: Tests: a `team-context` manifest with skills, reads, asks, `mcp/servers.json` and hosts loads; a plugin that provides only `context` and names an `entry` is refused; each EC3.2 key error, an unused or unknown ask, a `SKILL.md` over 64 KB or with a wrong `name`, a servers file with `env` or a credential, a `command` path outside the plugin and a shell string are each refused naming it; `contextSources` returns only approved machine plugins and skips a part `.avoozl.json` declares, which Settings marks "context ignored: declared in .avoozl.json" while its other parts still work.
  - `checkContext` beside `checkPolicy` in `src/app/plugins/plugins.mjs`; `context` joins the data parts.
- [ ] `ec-1.4` Asks, MCP mappings and the approval hash, after `ec-1.3` [EC4] (§D5)
  - $done: Tests: an unanswered ask gives nothing and raises one Needs you item naming the questions; `avoozl plugins answer` stores the answer in `plugins.json`; an alias with no mapping gives nothing; a mapping holds `env` names and an optional `command`, and a credential value is refused; changing an answer or a mapping turns the plugin `changed` until approved again; `readPluginSettings` keeps `context` through plugin edits; answer, map and approve are refused over MCP, for a bound caller, a child and the tick; the approval view lists repos, each skill with its hash, each read as written and filled, each alias with its command and env names, each host and each content set; screenshots of the approval view go to the owner.
  - $after: ec-1.3
  - Reuses PK10's mapping store and hash when `pk-1.6` has landed; otherwise adds it in the shape PK10.2 gives.

## Phase 2: The session

- [ ] `ec-2.1` Gathering a session's context, after `ec-1.2`, `ec-1.4` [EC5] (§D6)
  - $done: Tests: sources whose `repos` match the task's repository are merged without repeats, and others give nothing; a repository with no GitHub remote matches only by its ID; one alias from two sources is dropped from both with one Needs you item naming them; a read that is, holds or is inside a `sandboxSecretPaths` entry, Avoozl's config or state folder, or home itself is left out with its reason; a missing read is left out and named; only the `worker` role gets context.
  - $after: ec-1.2, ec-1.4
  - `sessionContext` in `src/app/workers/epic-context.mjs`. Follows D12, question 3.
- [ ] `ec-2.2` Reads, skills and the brief in a process session, after `ec-1.1`, `ec-2.1` [EC6, EC1.6, EC11.3] (§D6)
  - $done: Tests with a fake harness: a passing session's reads join `readable` and none is writable; a contained session also mounts each read-only at its host path; skills are copied to the session context folder only when each file's hash matches the approval, and a changed file gives no skill; the brief's "Epic context" section lists each skill's name, description and path and each read's `about` and path; the folder is removed when the child exits; a resume runs the gate again and drops context when a test now fails, naming it in Activity; a failing or sourceless session's argv, `confineChild` input, brief and environment are byte for byte as before.
  - $after: ec-1.1, ec-2.1
  - `processExecutor.start` and its resume path in `src/app/executors/process.mjs`. Follows D12, question 2.
- [ ] `ec-2.3` The MCP relay and the harness `context` key, after `ec-2.2` [EC7] (§D6)
  - $done: Tests with a fake MCP server: a harness `context.mcp` argv with `{context_mcp}` loads and passes the same argv refusals as `start`; a harness without it gets no MCP and the record says so; the written MCP config names only the relay and holds no environment value; the relay's socket is `0600` in a `0700` folder and refuses an alias the session was not given and another session's socket; the real server starts on the first connection outside the sandbox with only the basics and its mapped `env` names, in a scratch folder; the worker child's environment holds no mapped name; each tool call's alias, tool, time, bytes and error reach the session's evidence, and no argument or reply does; a server that listens is stopped and its plugin marked broken; servers stop when the session ends; a contained session gets none and says "MCP not given: contained session"; the pull request states, with the Claude Code version and how it checked, that `--mcp-config` with `--strict-mcp-config` loads only that file.
  - $after: ec-2.2
  - `bin/context-relay.mjs`; the broker in `src/app/executors/supervisor.mjs`; the `context` key in `src/app/executors/harness-definitions.mjs` and `examples/harnesses/claude-code.json`. Follows D12, question 1.
- [ ] `ec-2.4` Hosts through the egress proxy, after `ec-2.2` [EC8] (§D7)
  - $done: Tests: a passing session's proxy allows `box.hosts` and the context hosts and refuses every other host; each tunnel's log line names its host's source; a session with no proxy, or on a platform without one, gets no hosts and its record says why; a contained session's box keeps `--network none`; with hosts given, the harness argv of a contained context session drops only the web fetch refusal, and a stranger-input session's argv is unchanged.
  - $after: ec-2.2
  - Needs vm-2.4 of `vm-harness`.
- [ ] `ec-2.5` Kiro Crew chat workers, after `ec-1.1`, `ec-2.1` [EC9] (§D8)
  - $done: Tests with a fake `kirocrew` executor: a passing chat worker's brief names its skills and reads and no MCP server or host, and its binding reads "brief only"; a failing chat worker's brief has no epic context section and is byte for byte as before.
  - $after: ec-1.1, ec-2.1
- [ ] `ec-2.6` Stranger text never reaches a context session, after `ec-2.2` [EC1.7] (§D2)
  - $done: Tests with the fake GitHub: a stranger's review comment on a context task's pull request is not sent to its session; the task gets `strangerInput` with its reason; the session stops at its next safe point and its work is committed as for any stop; the follow-up starts a new session that fails `no-stranger-input` and gets no context; a collaborator's comment is sent as today.
  - $after: ec-2.2
- [ ] `ec-2.7` The chip, Activity, Settings › Epic context and the reads, after `ec-2.2`, `ec-2.5` [EC10] (§D10)
  - $done: Tests: the binding holds `epicContext` with sources, given items and tests; the task row and drawer show **Epic context**, or **Epic context (brief only)** on a chat; one Activity row per start or resume whose repository a source names lists the four tests with their reasons and the given items by name, and no path's contents, MCP argument or environment value; a repository no source names writes no row; a giving source's `contentSets` apply at `diff`, `github` and `brief`, and a set this machine lacks blocks; Settings › Epic context lists the machine block, each plugin part with its state and the last ten context sessions; `avoozl show TASK --json` and the MCP task read return `epicContext`; screenshots of the chip, the Activity row and the Settings page go to the owner.
  - $after: ec-2.2, ec-2.5

## Phase 3: Proof and docs

- [ ] `ec-p1` Proof: context reaches the owner's own spec task and nothing else, after `ec-2.3`, `ec-2.4`, `ec-2.6`, `ec-2.7` [EC1, EC7, EC8, EC10, EC12.2] (§D2, §D6, §D9)
  - $done: Expected: (1) the approval view lists both skills, the read, the `research` alias with its command and env name, and the host; (2) the spec task's session reads the note file, quotes the marker skill's phrase, calls `research` once, and reaches `docs.acme.example` through the proxy; Activity shows four passed tests and the given items, and the task row shows **Epic context**; (3) the fake server's environment holds the marker variable and the worker's does not; (4) the intake task, the stranger's issue fix, the coworker-driven spec and the repository that names `epicContext` or declares the plugin in `.avoozl.json` each get none, and Activity names the failing test or the refusal; (5) a stranger's review comment on the context task starts a new session without context; (6) a diff with an `acme-terms` term is blocked; (7) editing `servers.json` turns the plugin `changed` and the next session gets nothing; (8) `lsof -nP -iTCP -sTCP:LISTEN` shows no new listener but the proxy's loopback line.
  - $done: Expected result observed; receipt under `docs/evidence/`, with no image committed.
  - $manual: true
  - $after: ec-2.3, ec-2.4, ec-2.6, ec-2.7
  - Setup: an isolated Avoozl home and workspace; scratch repositories `acme/widgets` (public) and `acme/tools` with bare remotes and a fake GitHub, or scratch repositories on a test account; a local `team-context` plugin with two skills (one with a marker phrase), a read `{ask:notesRoot}/widgets` holding one note file, a fake stdio MCP server `research` whose one tool echoes a marker and records its environment names, and the host `docs.acme.example:443` served by a local test endpoint behind the proxy; an `acme-terms` content set; a second test login for the coworker; Claude Code as the harness with the `context` key.
  - Action: (1) add, answer, map and approve the plugin; (2) approve a one-task spec on `acme/widgets` and take it over; let its task run with a brief that asks it to read the note, use the marker skill, call `research` and fetch the host; (3) make an intake task, a stranger's issue fix, a spec assigned to the coworker login, and a commit to `acme/tools` that adds `epicContext` to `.avoozl.json` and declares the plugin there, and let each run; (4) post a review comment from the stranger login on the context task's pull request; (5) ask the context task for a change that writes an `acme-terms` term; (6) edit `servers.json`; (7) run `lsof` during the sessions.
  - Failure means: the gate or a source lets context reach work that is not the owner's own, or the relay leaks the server's sign-in.
  - Next decision: whether to give context to the falsifier role (D12, question 3) and to contained sessions (D12, question 1).
- [ ] `ec-3.1` Docs, the example plugin and the plugin skill, after `ec-p1` [EC9.2, EC12.3, EC12.4] (§D3, §D4, §D8, §D9)
  - $done: `node scripts/check/spec-lint.mjs` reports 0 errors; `docs/plugins.md` has a Context part section with the full `team-context` manifest, a `servers.json`, the asks and the mapping; a new `docs/epic-context.md` describes the four tests, the machine block, what a session gets, the relay, the hosts, the Kiro Crew limits in EC9.2's words and D9's threats; `docs/person-only.md` lists the person-only context operations; `examples/plugins/team-context/` loads and matches the docs; the shipped `avoozl-plugin` skill knows the part; a search of the added lines finds only neutral names.
  - $after: ec-p1
