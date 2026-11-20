---
repo: avoozl
---
# Tasks: OpenTelemetry recording and export of task timing

Requirement refs (`OT1` to `OT14`) are in `requirements.md`. `§D` refs are
sections of `design.md`. Task IDs start with `ot-`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and a fake collector on `127.0.0.1`, and make no call to a real
backend; no real workspace data, machine configuration, credentials or
personal plans in the repository (AGENTS.md); never force push; add no
runtime dependency. Every task runs the repository's checks. Docs follow
`.kiro/skills/writing-documentation/SKILL.md`, and a JSON block in a doc or
spec is pretty-printed across lines. Screen changes need phone and desktop,
light and dark screenshots for the owner before merge, shown in chat and never
committed.

A group tagged `(**PARALLEL**)` holds tasks that share no file and may run at
the same time. The two tasks that edit Flow's code wait on `sim-4.4`, the
`simplify` task that cuts Flow's extras, so Flow is edited once. A task ID in
another spec cannot be a `$after` here, so `ot-2.1` says it in a bullet.

## Phase 1: Recording API and local store

- [x] `ot-1` Store and setting (**PARALLEL**)
  - [x] `ot-1.1` Local tables and the SQLite exporter [OT2.1, OT2.2, OT2.6] (§D3)
    - `src/app/telemetry/sqlite-exporter.mjs` creates `telemetry_spans` and `telemetry_points` with the columns and indexes of §D3 when the database opens, and writes and reads them
    - Tests: a span upserts by key and is `false` the second time with equal values; a point inserts by ID and ignores a repeat; a stage span's `parent_span_id` is set before its root exists
    - Tests: a database made by `avoozl rebuild` holds both tables empty
  - [x] `ot-1.2` The machine setting [OT4.1, OT4.3, OT5.1, OT5.2, OT5.4] (§D6)
    - Tests: `validateTelemetry` accepts `{"enabled": true}` and `{}` and refuses another key, a non-boolean `enabled` and a non-object, each with a message that names the key
    - Tests: a `telemetry` key in a workspace or repository `.avoozl.json` fails with the file and the machine config path, as `serve` does; a plugin manifest with a `telemetry` key fails plugin lint
    - Tests: with no `telemetry` key, `readTelemetryConfig` returns status `off`
- [x] `ot-1.3` The recording API and allowlist [OT1.1, OT1.2, OT1.3, OT1.4, OT1.5, OT1.6, OT9.1, OT9.3, OT9.4, OT13.1, OT13.2, OT13.4] (§D2, §D8)
  - $after: ot-1.1
  - `src/app/telemetry/record.mjs` holds `span`, `dropSpan`, `point`, `finishTask` and the exporter list, with the SQLite exporter registered first and no way to unregister it; `stages.mjs` holds `STAGES`
  - Tests: an unknown field, a stage outside `STAGES`, a spec name with a space or a slash, a string over 128 characters, a control character and a non-scalar are each refused; an equal repeat reaches no other exporter
  - Tests: a fake second exporter that throws or never returns does not make `span` or `point` throw or wait; a SQLite write failure throws to the caller
  - Tests: `finishTask` records the root span from the earliest stage start to the finish, one lead time, one duration per stage with time and one finished-task point; a second call records nothing; a manual task has outcome `done` and no `first_pass`
  - A test reads each file under `src/app/telemetry/` and checks it imports nothing from `src/app/flow/`

## Phase 2: Flow on the recording path

- [ ] `ot-2.1` Every span writer calls the API [OT1.1, OT1.3, OT1.7, OT3.4] (§D4)
  - $after: ot-1.3
  - Starts after `sim-4.4` is on main, so Flow's cut and this move do not edit `flow.mjs` at once
  - Flow's report, decision, tool-call and sync paths, the check runs, the plugin check decision, the manual task and the worker's phase mark call `telemetry.span` and `telemetry.dropSpan` with the key they already build; `putSpan`, `deleteSpan`, the `flow_spans` schema and its other readers are gone
  - Flow's pass over finished tasks calls `telemetry.finishTask` with the task's outcome and first-pass result from `taskTiming`
  - Tests: Flow's span and timing tests pass with their seeding going through the API; a search of `src/` for `putSpan`, `deleteSpan` and `flow_spans` finds nothing
- [ ] `ot-2.2` Usage and stop events as points [OT8.6, OT8.7, OT3.3] (§D4, §D9)
  - $after: ot-2.1
  - `src/app/telemetry/usage.mjs` reads each task session's turn rows with `gatewayUsageTurns` and records `avoozl.tokens` (input and output) and `avoozl.credits` points with the ID `<slot>@<ts>:<name>:<direction>`; the usage reads of Flow, the `flow_usage` schema and its other readers are gone
  - `flow-line.mjs` records an `avoozl.stop_the_line.events` point when a stop opens and when it closes, with `scope`, `kind` and `event`, and no check name; `flow_stops` stays as it is
  - Tests: a turn row read twice records once; a point takes the stage of the span that holds its time and `unattributed` otherwise; a session with no usage call records none; a stop and its resume give one `pulled` and one `resumed` point
  - A search of `src/` for `flow_usage` finds nothing
- [ ] `ot-2.3` Flow reads the local tables [OT3.1, OT3.2] (§D4)
  - $after: ot-2.2
  - `listSpans`, `taskTiming`, the usage totals and the first-pass rate read `telemetry_spans` and `telemetry_points`; the Flow numbers MCP call and the CLI return what they returned
  - Tests: Flow's existing tests for lead time, time per stage, first-pass rate, tokens and credits pass on the tables, with the seeding changed and no assertion changed
- [x] `ot-2.4` Retention and size cap [OT2.3, OT2.4, OT2.5, OT2.7] (§D5)
  - $after: ot-1.1
  - `sqlite-exporter.mjs` prunes at open and after every 500 writes, at most once in 10 minutes, outside the write's transaction, by the rules and numbers of §D5
  - Tests with small caps passed in: a finished trace older than 90 days goes with its root and children; over the cap the oldest finished traces go until the table is at 90 percent; a trace with an open span active in the last 7 days stays; points go by age and then oldest first; pruning does not run inside a write

## Phase 3: OTLP exporter

- [x] `ot-3` Bodies and environment (**PARALLEL**)
  - [x] `ot-3.1` The environment and the endpoint check [OT6.1, OT6.2, OT6.3, OT6.4, OT12.1, OT12.5] (§D6)
    - $after: ot-1.2
    - Tests: a shared endpoint gets `/v1/traces` and `/v1/metrics` appended and a signal endpoint does not; a signal endpoint beats the shared one
    - Tests: protocol unset is `http/json`; `grpc` and `http/protobuf` give status `protocol`; an `http` endpoint on a non-loopback host gives `endpoint-not-allowed`, and `http://localhost`, `http://127.0.0.1` and `http://[::1]` pass
    - Tests: `OTEL_EXPORTER_OTLP_HEADERS` parses `a=1,b=2` into names and values, a malformed pair is refused by name, and `status()` holds names and never values; the endpoint shows scheme, host and port only
    - `state.mjs` makes the instance ID once and returns it after; a file that cannot be read gives a fresh ID
  - [x] `ot-3.2` Trace and metric bodies [OT7.1, OT7.3, OT7.4, OT7.5, OT7.6, OT7.7, OT8.1, OT8.2, OT8.3, OT8.4, OT8.5] (§D7, §D9)
    - $after: ot-1.3
    - `otlp.mjs` builds `resourceSpans` for one trace and `resourceMetrics` for up to 100 points, from recorded rows, through the export allowlist
    - Tests: the same trace built twice gives equal bodies; two instance IDs give equal trace IDs and different span IDs; a stage span's `parentSpanId` is the root's ID; IDs are lowercase hex of 32 and 16 characters; times are decimal strings; no span has status `error`
    - Tests: a first-pass task and a reworked one give two `avoozl.tasks.finished` data points that differ only in `first_pass`; a manual task has outcome `done` and no `first_pass`; no metric data point holds a task ID; histograms use the bounds of §D9 and delta temporality
    - Tests: `avoozl.model` is sent only when the token points inside a stage span name one model; a span's `detail` is never in a body
- [x] `ot-3.3` Queue, send and retry [OT10.2, OT10.3, OT10.4, OT10.5, OT10.6, OT10.8, OT12.2, OT12.3, OT12.4, OT12.6] (§D10)
  - $after: ot-3.1, ot-3.2
  - Tests against the fake collector: a batch posts one traces request and one metrics request, each with `Content-Type: application/json`, a `User-Agent` of `avoozl/<version>` and the owner's header names
  - Tests: `503`, `429` with `Retry-After`, a reset connection and a timeout retry with backoff and fake timers; the fifth failure drops the batch and adds to `dropped`; a `400` adds to `rejected` and is not retried; a `302` is a failure of kind `http 302` and is not followed
  - Tests: with 501 items queued, the oldest is dropped and `dropped` counts it; only one request is in flight at a time; a stop of the exporter loses the queue and sends nothing from the tables
  - Tests: the log holds the endpoint's host and port at start, and holds no header value, body or full URL, checked with a canary header value
- [x] `ot-3.4` Register the exporter beside the tick [OT4.2, OT4.4, OT6.6, OT7.2, OT10.1, OT10.7] (§D6)
  - $after: ot-3.3, ot-2.2
  - `startTelemetry` registers the SQLite exporter when the database opens; in the process that runs the tick it also starts the 5-second `unref`'d timer that registers or unregisters the OTLP exporter from machine config and sends; no other process registers it
  - The code that builds an agent process's environment drops every `OTEL_` variable, and a test starts a fake harness and reads its environment
  - Tests: with the setting off nothing is registered and no connection opens; turning it on registers the exporter and sees only later records; turning it off empties the queue without sending; an exporter that throws or whose collector never answers leaves a tick's result unchanged, writes no Needs you item and sends no notification
  - The tick, workers, checks and landing import nothing from `src/app/telemetry/` except the recording API

## Phase 4: Surfaces

- [ ] `ot-4` Surfaces (**PARALLEL**)
  - [x] `ot-4.1` Operations and CLI [OT5.3, OT5.5, OT11.5, OT11.6] (§D6, §D11)
    - $after: ot-3.4
    - Two entries in `src/app/ops/telemetry.mjs`: `telemetry.status` (`observe`, not on MCP) and `telemetry.configure` (person-only); and the CLI entries `avoozl telemetry status`, `enable` and `disable` in `src/app/commands/`
    - Tests: `telemetry.configure` called over MCP or with an app token is refused as person-only; an MCP tool list holds no telemetry tool; `enable` writes only `telemetry.enabled` to machine config and keeps its other keys; `status` prints the status, the counts and the local row counts and never a header value or a URL's path
    - No prompt, brief or skill under `prompts/` or `.kiro/` names the setting, checked by a test that reads them
  - [ ] `ot-4.2` The Telemetry box in Settings [OT11.1, OT11.2, OT11.3, OT11.4] (§D11)
    - $after: ot-3.4
    - A titled box **Telemetry** in **Settings** with the switch **Send task timing over OpenTelemetry**, the endpoint, protocol, header names, status text, the four counts, the last success time, the local span and point counts, and the one sentence about the environment
    - UI tests: each status of §D6 and each failure kind shows its words; the switch calls `telemetry.configure`; no header value, URL path or response text is in the rendered box
    - Phone and desktop, light and dark screenshots are shown to the owner in chat

## Phase 5: Docs and proof

- [ ] `ot-5.1` Docs [OT6.1, OT8.4, OT9.2, OT12.1, OT14.2] (§D5, §D12, §D13)
  - $after: ot-4.1, ot-4.2, ot-2.4
  - `docs/telemetry.md` opens with the machine setting and the two environment variables, then lists what Avoozl records locally and for how long, the caps, that a rebuild empties the tables, what OTLP exports, what is never sent, the transport rules, delta metrics with the collector step for Prometheus-style backends, and the limit that a stop or an outage loses unsent items; it names Grafana, Honeycomb, Datadog and CloudWatch only as example backends
  - `docs/README.md` lists the page, `docs/flow.md` links to it from Timing, and `docs/glossary.md` defines OTLP and exporter; the docs link and JSON tests pass
- [ ] `ot-5.2` Canary and credential tests [OT9.2, OT9.5, OT6.3, OT12.4] (§D8, §D12)
  - $after: ot-3.4
  - Tests: a task whose title, done text, branch, worktree path, session text and token-looking string each hold a canary records and exports; no table row, request body, log line, status reply or state file holds one
  - Tests: a canary in a span's `detail` is in the local row and absent from every OTLP body
  - Tests: a header value set to a canary is absent from the log, the state file, the status reply, an error message and every table
- [ ] `ot-p1` Proof: a fake collector receives a scratch-repository task [OT4.1, OT3.1, OT7.2, OT8.1, OT10.1, OT11.2, OT2.6] (§D14)
  - $after: ot-5.1, ot-5.2
  - A script under `scripts/proofs/` makes a scratch repository with a bare remote, writes a two-task spec, and lands both tasks with a fake harness, first with telemetry off and then with it enabled in a temporary machine config and `OTEL_EXPORTER_OTLP_ENDPOINT` set to a fake collector on `127.0.0.1`
  - With it off, the collector received nothing and `taskTiming` for each task reads from `telemetry_spans`
  - With it on, the collector received one trace for each task with a root and its stage spans, the metrics for both tasks, and no canary; the root's times equal the stored spans'
  - With the collector holding its reply open, a third task lands before the collector answers; after the collector answers `503`, `avoozl telemetry status` prints `backing-off`
  - `avoozl rebuild` leaves both tables empty and the instance ID unchanged
  - A receipt under `docs/evidence/` records the run, written only after the checks pass
