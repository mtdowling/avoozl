---
category: Flow
---

# Requirements: OpenTelemetry recording and export of task timing

## Introduction

Avoozl records each task's timing as OpenTelemetry spans and metric points,
through one recording API. Two exporters receive what is recorded. The SQLite
exporter is built in and always on: it writes Avoozl's local store, and
Insights and Flow read from it. The OTLP exporter is a second, opt-in exporter beside it: it
sends the same data to any backend that takes OTLP, such as Grafana,
Honeycomb, Datadog or CloudWatch, so a team that runs Avoozl on several
machines can follow the flow of work in one place.

OTLP export is off by default, set only in machine config, best effort, and
never slows delivery. It sends one trace per task and metrics for lead time,
first-pass rate, tokens, credits and stop-the-line events, and nothing that
says what the work was. Avoozl holds no code for any one backend.

### Words

| Term | Meaning |
| --- | --- |
| Recording API | The functions in `src/app/telemetry/record.ts` that every writer of timing calls: `span`, `dropSpan`, `point` and `finishTask` |
| Exporter | A sink the recording API hands each recorded span and point to |
| SQLite exporter | The built-in exporter. It writes `telemetry_spans` and `telemetry_points` in Avoozl's database |
| OTLP exporter | The opt-in exporter. It sends OTLP/HTTP JSON to an endpoint |
| OTLP | The OpenTelemetry protocol: the JSON body a backend or collector accepts at `/v1/traces` and `/v1/metrics` |
| Point | One observation of a metric: a name, a value, a time and attributes |
| Stage | One of the names in `STAGES`: `queued`, `coding`, `tests`, `commands`, `checks`, `ci-wait`, `review`, `rework`, `merge`, `waiting` |
| Stage span | A span for one stage of one task attempt, a child of the task's root span |
| Finished task | A task that landed, or a manual task a person marked done |
| Machine config | The `config.json` in this machine's Avoozl config folder, which `.avoozl.json` cannot set |
| Collector | An OpenTelemetry Collector or a vendor agent that takes OTLP and forwards it |

### Scope

In scope: the recording API, the local tables and their retention, the
Insights reads, the OTLP exporter and its machine setting, status in Settings and the
CLI, and tests. Out of scope: logs, a pull-based metrics endpoint, protobuf
or gRPC, sampling, and any exporter other than these two.

## Requirements

### Requirement OT1: One recording path

**User story:** As a maintainer, I want every timing record to go through one
API, so that the local store and any exporter see the same data.

#### Acceptance criteria

1. Avoozl SHALL record timing only through the recording API. No other code
   SHALL write `telemetry_spans` or `telemetry_points`, keep a table of its
   own for spans or usage, or call an exporter.
2. The API SHALL hand each recorded span and point to every registered
   exporter. The SQLite exporter SHALL be registered when the database
   opens, before any other, and no setting SHALL turn it off.
3. `span` SHALL record a span by a stable key, with `endedAt` unset while the
   stage is open, and SHALL replace the span of that key when called again.
   `dropSpan` SHALL remove one by key. `point` SHALL record one observation by
   a stable ID. `finishTask` SHALL record the task's root span and its
   task-level points.
4. Recording the same span key with the same values, or the same point ID
   twice, SHALL change nothing and SHALL reach no other exporter.
5. The API SHALL accept only the fields in the allowlist (§D8). It SHALL
   refuse a field that is not in it, and a string that is not allowed for
   its field.
6. A failure in an exporter other than the SQLite exporter SHALL NOT make a
   call to the API throw or wait. A SQLite write failure SHALL throw to the
   caller, as a database write does.

### Requirement OT2: The local store

**User story:** As someone who reads Insights, I want timing kept on this
machine without any setup, so that Insights works before anyone has heard of
OTLP.

#### Acceptance criteria

1. The SQLite exporter SHALL write two generic tables, `telemetry_spans` and
   `telemetry_points`, with the columns §D3 gives: spans keyed by span ID,
   with trace ID, parent, task ID, stage and times; points keyed by ID, with
   name, kind, value, time, task ID and stage.
2. A span row SHALL hold the check or command name a stage ran in `detail`,
   and the OTLP exporter SHALL NOT send it.
3. Avoozl SHALL delete a finished trace whose newest time is older than 90
   days, and a point older than 90 days.
4. WHEN a table holds more than its cap THEN Avoozl SHALL delete the oldest
   finished traces, or the oldest points, until the table is at 90 percent of
   the cap. The caps are 200,000 spans and 1,000,000 points. It SHALL NOT
   delete a trace that has an open span and was active in the last 7 days.
5. Pruning SHALL run when the database opens and then after 500 writes, at
   most once in 10 minutes, and SHALL NOT run inside a write's transaction.
6. `avoozl rebuild` SHALL give a database whose spans and points tables are
   empty. Avoozl SHALL NOT recreate timing from git, GitHub or sessions.
7. The retention and caps SHALL be fixed values in code with no setting.

### Requirement OT3: Insights reads the local store

**User story:** As someone who reads Insights, I want its numbers to come from
the same records an exporter sends, so that a backend and Insights agree.

#### Acceptance criteria

1. Insights' finished tasks, lead time, time per stage, review rounds and
   first-pass rate SHALL be queries on `telemetry_spans` and
   `telemetry_points`. These are the Insights view, the `insights.view`
   operation on MCP, and `avoozl insights`.
2. Flow's `listSpans` and `taskTiming`, which `flow.view` and `avoozl flow`
   read, SHALL read `telemetry_spans` through `listStageSpans`, and Flow's
   tests SHALL seed spans only through the recording API.
3. Stop-the-line state SHALL stay in `flow_stops`. Each stop and each resume
   SHALL also be recorded as a point.
4. Flow SHALL write no timing of its own. A Flow pass that finds a finished
   task calls `finishTask`.

### Requirement OT4: OTLP export is off by default

**User story:** As a person who has not asked for telemetry, I want Avoozl to
send nothing off this machine, so that I never have to check.

#### Acceptance criteria

1. WHEN machine config has no `telemetry` key THEN the OTLP exporter SHALL not
   be registered, SHALL open no network connection and SHALL build no OTLP
   body. The SQLite exporter SHALL still record.
2. WHEN `telemetry.enabled` is `true` and no endpoint is set in the
   environment or machine config THEN the OTLP exporter SHALL stay idle and
   Settings SHALL show **Recording locally · export waiting for an
   endpoint**.
3. WHEN `telemetry.enabled` is `false` or removed THEN a running OTLP
   exporter SHALL stop at its next pass and drop its queue without sending.
4. Enabling SHALL send only what is recorded after it is enabled. Avoozl SHALL
   NOT read the local tables to send earlier records.

### Requirement OT5: Machine config only

**User story:** As a person who runs Avoozl for a team, I want only the owner
of this machine to turn export on, so that a repository, a plugin or an agent
cannot start sending data out.

#### Acceptance criteria

1. The `telemetry` key SHALL be read from machine config only. A `telemetry`
   key in `.avoozl.json`, at the workspace or in a repository, SHALL be a
   configuration error that names the file and the machine config path.
2. A plugin part SHALL NOT read, write or declare telemetry settings, and
   plugin lint SHALL refuse a manifest that names one.
3. The operation that writes `telemetry` SHALL be person-only: MCP calls and
   app tokens SHALL be refused, as for every person-only operation.
4. The `telemetry` object SHALL take the keys `enabled` (`true` or
   `false`), `endpoint` (an endpoint OT12.1 allows, with no user, password,
   query or fragment), `protocol` (`http/json`) and `headers` (a list of at
   most 20 header names). It SHALL refuse any other key and any other value,
   and a header list entry that holds a value.
5. No agent prompt, brief or skill SHALL tell an agent how to change the
   setting.

### Requirement OT6: Endpoint and headers from machine config and the OTLP environment

**User story:** As someone who already points other tools at a collector, I
want the standard OTLP variables to work, and as someone who starts Avoozl
from a desktop app, I want to save the endpoint in Settings, so that I
configure one place.

#### Acceptance criteria

1. The OTLP exporter SHALL read `OTEL_EXPORTER_OTLP_ENDPOINT`,
   `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
   `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
   `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_OTLP_TIMEOUT`,
   `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`, with the meaning the
   OpenTelemetry specification gives them. A signal's own endpoint SHALL beat
   the shared endpoint, and only the shared endpoint gets `/v1/traces` or
   `/v1/metrics` appended.
2. A variable that is set SHALL beat the saved `telemetry.endpoint` and
   `telemetry.protocol`. With no endpoint variable, the saved endpoint SHALL
   be the shared endpoint.
3. The exporter SHALL support the protocol `http/json` only. It SHALL treat an
   unset protocol as `http/json`, and SHALL treat `grpc` and `http/protobuf`
   as unsupported: Settings SHALL show **Recording locally · export protocol
   not supported** and the exporter SHALL send nothing.
4. Header values SHALL come from `OTEL_EXPORTER_OTLP_HEADERS` on each start.
   Avoozl SHALL NOT write them to machine config, the database, a log, a
   receipt, a status reply or a test fixture.
5. WHEN `telemetry.headers` names a header that `OTEL_EXPORTER_OTLP_HEADERS`
   does not hold THEN the exporter SHALL send nothing and Settings SHALL show
   **Recording locally · export waiting for header values** and the missing
   name.
6. Settings, the status operation and the CLI SHALL show header names and
   never header values, and the endpoint as scheme, host and port only.
7. `OTEL_SERVICE_NAME` SHALL default to `avoozl`. `service.instance.id` SHALL
   be a random identifier Avoozl makes once per machine (§D2), so flow from
   several machines stays apart.
8. A process that Avoozl starts for an agent SHALL NOT receive any `OTEL_`
   variable from Avoozl's own environment, so a coding agent's own tools do
   not send to the team's backend by accident.

### Requirement OT7: One trace per task

**User story:** As a lead, I want to open one trace for a task and see where
its time went, so that I find the slow stage without a database.

#### Acceptance criteria

1. Avoozl SHALL record, for each task attempt, one stage span per stage the
   attempt ran, named `avoozl.stage.<stage>`, and WHEN the task finishes THEN
   `finishTask` SHALL record a root span `avoozl.task` from the task's
   earliest stage start to its finish, the parent of every stage span.
2. WHEN `finishTask` records a root span for the first time and the OTLP
   exporter is registered THEN the exporter SHALL queue one trace: the root
   and the task's stage spans.
3. The trace ID SHALL be derived from the repository, spec folder and task ID
   alone, and each span ID from the machine's instance ID and the span's key,
   so a trace sent twice replaces the earlier one in a backend that merges by
   ID, and two machines that worked on one task add to one trace.
4. The root span SHALL carry `avoozl.repo`, `avoozl.spec`, `avoozl.task.id`,
   `avoozl.outcome` (`landed` or `done`), `avoozl.first_pass` (boolean) and
   `avoozl.attempts`.
5. A stage span SHALL carry `avoozl.repo`, `avoozl.spec`, `avoozl.task.id`,
   `avoozl.stage`, `avoozl.role`, `avoozl.attempt`, `avoozl.harness`,
   `avoozl.model` and `avoozl.source` (how Avoozl measured it:
   `tool-calls`, `markers` or `events`). An attribute with no recorded value
   SHALL be left out, not sent empty.
6. A task with no stage span in this machine's database SHALL send nothing
   from this machine.
7. Every span SHALL have status `unset`. Avoozl SHALL set no `error` status,
   because a slow stage is not an error.

### Requirement OT8: Metrics

**User story:** As a lead, I want lead time, first-pass rate, token and
credit use, and stop-the-line events as numbers over time, so that I chart
them next to everything else.

#### Acceptance criteria

1. Avoozl SHALL record these metrics as points, and the OTLP exporter SHALL
   send them as these instruments:

   | Name | Kind | Unit | Attributes |
   | --- | --- | --- | --- |
   | `avoozl.task.lead_time` | histogram | `s` | repo, spec, outcome |
   | `avoozl.stage.duration` | histogram | `s` | repo, spec, stage, role |
   | `avoozl.tasks.finished` | sum | `{task}` | repo, spec, outcome, first_pass |
   | `avoozl.tokens` | sum | `{token}` | repo, spec, stage, role, harness, model, direction |
   | `avoozl.credits` | sum | `{credit}` | repo, spec, stage, role, harness, model |
   | `avoozl.stop_the_line.events` | sum | `{event}` | repo, scope, kind, event |

2. First-pass rate SHALL be the ratio of `avoozl.tasks.finished` with
   `first_pass` `true` to all of it. Avoozl SHALL NOT send a rate, so the
   backend computes it over any window and across machines.
3. An exported metric SHALL carry no task ID and no other attribute with more
   values than a repository, spec, stage, role, harness and model give. The
   local table keeps the task ID.
4. Metrics SHALL use delta temporality. Each point is sent once.
5. A manual task SHALL count in `avoozl.tasks.finished` and
   `avoozl.task.lead_time` with outcome `done`, and SHALL carry no
   `first_pass`, because first-pass rate leaves a person's step out.
6. `direction` SHALL be `input` or `output`. Avoozl SHALL read a session's
   token and credit rows from its executor and record each as a point once,
   by the row's session and time. WHEN the executor reports no rows THEN no
   token or credit point SHALL exist for that session. A point SHALL take the
   stage of the stage span that holds its time, or `unattributed`.
7. A stop-the-line event SHALL be recorded when a line stops (`event` is
   `pulled`, `kind` is `check` for Avoozl's own stop and `manual` for a
   person's or an agent's) and when it resumes (`event` is `resumed`). The
   stop's check name and reason SHALL NOT be recorded as a point attribute.

### Requirement OT9: What is never sent

**User story:** As someone who owns the code, I want a short list of what
leaves the machine and a guarantee on the rest, so that I can approve the
export once.

#### Acceptance criteria

1. Every field the recording API accepts SHALL be in the allowlist (§D8), and
   every attribute the OTLP exporter sends SHALL be built from it.
2. Avoozl SHALL NOT record or export a prompt, a message, model output, a
   diff, a file's contents, a task title, a task's done text, a commit
   message, a command line, an issue or pull request text, or a person's name
   or email. It SHALL NOT export a check name, a span's `detail` or a branch
   name.
3. A file path SHALL NOT be recorded or exported. The spec folder's name SHALL
   be the only path-derived value, and a spec name that holds a character
   outside `A-Z a-z 0-9 . _ -` SHALL be refused.
4. The repository attribute SHALL be the repository's ID in Avoozl. A string
   value longer than 128 characters or with a control character SHALL be
   refused.
5. A test SHALL seed a task whose title, done text, branch, worktree path,
   session text and token-looking string each hold a canary, run recording
   and an export, and fail when any table row, request body, log line or
   status reply holds a canary. Another SHALL do the same with a canary in a
   span's `detail` and check only the OTLP body.

### Requirement OT10: Best effort

**User story:** As someone who delivers with Avoozl, I want a dead collector
to cost me nothing, so that telemetry never becomes the reason work stalls.

#### Acceptance criteria

1. The OTLP exporter's hooks SHALL queue in memory and SHALL do no I/O. Sending
   SHALL run on the exporter's own timer in the process that runs the tick.
   The tick, a worker, a check and landing SHALL NOT await it or read its
   state.
2. A request SHALL time out after `OTEL_EXPORTER_OTLP_TIMEOUT` (default 10
   seconds, at most 30), and Avoozl SHALL run at most one request at a time.
3. The queue SHALL hold at most 500 items, where an item is one trace or up
   to 100 points. WHEN it is full THEN the exporter SHALL drop the oldest
   item and add its tasks or points to the dropped count.
4. WHEN a request fails with a network error, a timeout, `429`, `502`, `503`
   or `504` THEN the exporter SHALL retry with backoff from 1 second to 60
   seconds with jitter, SHALL honor `Retry-After`, and SHALL drop a batch
   after 5 attempts and count it.
5. WHEN a request gets any other status THEN the exporter SHALL drop that
   batch, count it as rejected, and NOT retry it.
6. The queue SHALL be in memory only. Items unsent at exit are lost, and
   Avoozl SHALL NOT replay them from the local tables.
7. A failing OTLP exporter SHALL NOT throw into the tick, SHALL NOT write a
   Needs you item, and SHALL NOT notify. Its failure SHALL show in Settings
   only.
8. The OTLP exporter SHALL write nothing to SQLite.

### Requirement OT11: Settings and status

**User story:** As the machine's owner, I want to see whether telemetry is on
and whether it works, so that I notice a wrong endpoint without a backend.

#### Acceptance criteria

1. **Settings** SHALL have a box titled **Telemetry** whose first row,
   **Local store**, reads **On, always** with the local span and point
   counts, the 90-day retention and both row caps.
2. The status SHALL lead with **Recording locally ·** and then name the
   export: **export off**, **export waiting for an endpoint**, **export
   protocol not supported**, **export endpoint not allowed**, **export
   waiting for header values**, **exporting**, or **export backing off**
   with the failure's kind (`timeout`, `refused`, `tls`, `dns` or
   `http <status>`).
3. WHEN export is on THEN the box SHALL show the endpoint's scheme, host and
   port with where it came from, the protocol, each header name with where
   its value comes from, counts of sent, queued, dropped and rejected items
   and the time of the last success. Counts of items start at zero when
   Avoozl starts.
4. The box SHALL say that the `OTEL_EXPORTER_OTLP_*` environment of the
   process that runs Avoozl beats what is saved, that header values come only
   from `OTEL_EXPORTER_OTLP_HEADERS`, and that a process a desktop app starts
   may not inherit a shell's variables.
5. A **Set up export** button (**Change export** when export is on) SHALL
   open three steps: **What is recorded**, which lists what is recorded and
   says it is kept on this computer; **Export**, with an on/off switch, the
   endpoint, the protocol and the header names; and **Review and save**.
   **Save** SHALL call `telemetry.configure` once. The form SHALL refuse a
   header entry that holds a value, and an endpoint OT5.4 refuses, before it
   sends.
6. The heading and labels SHALL NOT say "OpenTelemetry" or "OTel". The word
   MAY appear once, in the protocol's help line.
7. `avoozl telemetry status` SHALL print the same status and counts.
   `avoozl telemetry enable` and `avoozl telemetry disable` SHALL write
   `telemetry.enabled` and keep the other keys, as a person-only
   operation.
8. A failure message SHALL name a kind from the list in criterion 2 and
   SHALL NOT hold a URL, a header value or a response body.

### Requirement OT12: Transport and credentials

**User story:** As a security reviewer, I want the data to travel only over a
channel I can name, so that I can sign off.

#### Acceptance criteria

1. The OTLP exporter SHALL send only to an `https` endpoint, or to an `http`
   endpoint whose host is `localhost`, `127.0.0.1` or `::1`. Any other
   endpoint SHALL give **Endpoint not allowed** and send nothing.
2. The exporter SHALL verify the server's certificate with the system trust
   store, and SHALL NOT offer an option that turns verification off.
3. The exporter SHALL NOT follow a redirect.
4. The exporter SHALL log the endpoint's host and port when it starts, and
   SHALL log no header, no body and no URL with a user, a password or a query.
5. A request SHALL carry the headers from `OTEL_EXPORTER_OTLP_HEADERS`,
   `Content-Type: application/json` and a `User-Agent` of
   `avoozl/<version>`, and no other header.
6. The exporter SHALL make no other network call: no DNS lookup of any name
   but the endpoint's, no update check, and no call home.

### Requirement OT13: Telemetry stands apart from Flow

**User story:** As a maintainer, I want the telemetry code to depend on as
little as possible, so that a change to Flow or Insights cannot break it.

#### Acceptance criteria

1. Code under `src/app/telemetry/` SHALL import nothing from `src/app/flow/`.
   Flow SHALL import the recording API and the reads from it. `STAGES` SHALL
   live in `src/app/telemetry/stages.ts`.
2. Code under `src/app/telemetry/` SHALL import, outside itself, only the
   session bindings, the telemetry settings validator and the store, and
   SHALL get the executor's usage rows from a reader its caller passes.
4. WHEN a stage is added to or removed from `STAGES` THEN recording and export
   SHALL follow it with no other change, and a test SHALL fail when a recorded
   stage name is not in `STAGES`.

### Requirement OT14: No vendor code and no dependency

**User story:** As a maintainer, I want the export to stay small and neutral,
so that it costs nothing to carry.

#### Acceptance criteria

1. Avoozl SHALL add no runtime dependency for recording or export, and its
   package files SHALL gain no `@opentelemetry/*` package.
2. Avoozl SHALL hold no code, constant, URL or setting for any one backend.
   Docs MAY name Grafana, Honeycomb, Datadog and CloudWatch as example
   backends and show their endpoint variables as `OTEL_EXPORTER_OTLP_*`
   values.
3. The OTLP exporter SHALL use Node's built-in `fetch` and `crypto`, and SHALL
   work on Linux, macOS and Windows.
4. The test suite SHALL check each OTLP body against the structure the
   OpenTelemetry specification gives, with a local fake collector.
