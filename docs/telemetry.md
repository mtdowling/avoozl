# Telemetry

Avoozl always records each task's timing as OpenTelemetry spans and metric
points in its own database on this machine. It can also export them to any
backend that takes OTLP over HTTP JSON, when this machine's owner turns that
on.

```sh
avoozl telemetry status
```

## Setting up export

**Settings › Workspaces › Telemetry** shows the local store first, then the
status, such as **Recording locally · export off**. Its **Set up export**
button opens three steps:

1. **What is recorded**: what Avoozl keeps on this computer.
2. **Export**: an on/off switch, the endpoint, the protocol and the header
   names.
3. **Review and save**: **Save** writes the machine config.

The form saves this to the machine config, `config.json` in Avoozl's config
folder, `~/.config/avoozl/` on Linux and macOS:

```json
{
  "telemetry": {
    "enabled": true,
    "endpoint": "https://otlp.example:4318",
    "protocol": "http/json",
    "headers": [
      "authorization"
    ]
  }
}
```

`headers` holds names only. Each value comes from `OTEL_EXPORTER_OTLP_HEADERS`
in the environment of the process that runs the tick, and is never saved:

```sh
export OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer ${OTLP_TOKEN}"
```

A saved name with no value there holds the export, and Settings shows
**Recording locally · export waiting for header values**. A process a desktop
app starts may not inherit a shell's variables, so set them where that
process reads its environment.

The standard variables beat what is saved:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example:4318
avoozl telemetry enable
avoozl telemetry status
```

`avoozl telemetry enable` and `avoozl telemetry disable` write
`telemetry.enabled` and keep the rest of the object. Saving and both commands
are a person's: an MCP call, an agent, the tick or an app token cannot change
the setting.

A `telemetry` key in a `.avoozl.json` is refused with the file and the
machine config path. A plugin manifest that names `telemetry` fails plugin
lint. The `telemetry` object takes only `enabled` (`true` or `false`),
`endpoint` (no user, password or query), `protocol` (`http/json`) and
`headers` (up to 20 names).

Export starts when the setting is on. Records from before that are not sent.

## Local records

Avoozl always records, with no setting. Flow reads these tables.

| Table | Holds | Age limit | Cap | Pruned to |
| --- | --- | --- | --- | --- |
| `telemetry_spans` | One span per stage of each task attempt, and one root span per finished task | 90 days | 200,000 rows | 180,000 rows |
| `telemetry_points` | Lead time, time per stage, finished tasks, tokens, credits and stop-the-line events | 90 days | 1,000,000 rows | 900,000 rows |

Spans are pruned by trace, so a task's stage spans go with its root. A trace
with an open span that was active in the last 7 days is kept. Pruning runs
when the database opens and after every 500 writes, at most once in 10
minutes. The limits are fixed in code.

A stage span holds the check or command name the stage ran, as Flow shows it.
That name stays here and is never exported.

`avoozl rebuild` makes a fresh database from git. The spans and points
tables start empty, and fill again as new work runs.

## Export

With export on and an endpoint saved or set, the process that runs the tick
sends:

- **One trace per finished task**: a root span `avoozl.task` from the
  earliest stage start to the finish, with a child span `avoozl.stage.STAGE`
  for each stage. Every span carries `repo`, `spec` and `task.id`; the root
  adds `outcome`, `first_pass` and `attempts`, and a stage span adds `stage`,
  `role`, `attempt`, `harness`, `model` and `source`. A task with no finished
  stage span on this machine sends no trace.
- **Metrics**, all with delta temporality:

| Name | Kind | Attributes |
| --- | --- | --- |
| `avoozl.task.lead_time` | histogram, seconds | repo, spec, outcome |
| `avoozl.stage.duration` | histogram, seconds | repo, spec, stage, role |
| `avoozl.tasks.finished` | sum | repo, spec, outcome, first_pass |
| `avoozl.tokens` | sum | repo, spec, stage, role, harness, model, direction |
| `avoozl.credits` | sum | repo, spec, stage, role, harness, model |
| `avoozl.stop_the_line.events` | sum | repo, scope, kind, event |

First-pass rate is `avoozl.tasks.finished` with `first_pass` true over all of
it. Avoozl sends no rate, so the backend computes it over any window. A
manual task counts with outcome `done` and no `first_pass`.

Histograms use the same bounds in seconds everywhere: 30, 60, 120, 300, 600,
1800, 3600, 7200, 14400, 28800 and 86400.

A Prometheus-style backend needs cumulative totals. Put a collector in front
with its `deltatocumulative` processor. Avoozl holds no code for any one
backend.

### Never sent

Avoozl never records or sends prompts, messages, model output, diffs, file
contents, task titles, done text, commit messages, command lines, issue or
pull request text, file paths, branch names, or people's names and emails.
It never sends a check or command name, a span's `detail`, a header value or
a token. A metric carries no task ID.

A private repository's ID and spec folder name are sent, because the export
is no use without them.

## Transport

| Rule | Value |
| --- | --- |
| Protocol | `http/json` only; `grpc` and `http/protobuf` need a collector in front |
| Endpoint | `https`, or `http` to `localhost`, `127.0.0.1` or `[::1]` |
| Certificates | The system trust store, with no setting that skips it |
| Redirects | Not followed; a redirect is rejected |
| Headers | `Content-Type`, `User-Agent: avoozl/VERSION` and the headers in `OTEL_EXPORTER_OTLP_HEADERS` |
| Timeout | `OTEL_EXPORTER_OTLP_TIMEOUT` milliseconds, default 10 seconds, at most 30 |

Avoozl reads `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`,
`OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_PROTOCOL`,
`OTEL_EXPORTER_OTLP_TIMEOUT`, `OTEL_SERVICE_NAME` and
`OTEL_RESOURCE_ATTRIBUTES`. Only the shared endpoint gets `/v1/traces` and
`/v1/metrics` added. A variable that is set beats the saved endpoint or
protocol. An agent process Avoozl starts gets none of these
variables.

## Status

`avoozl telemetry status` prints the same fields the Settings box shows:

```json
{
  "status": "backing-off",
  "failure": "http 503",
  "endpoint": "https://otlp.example:4318",
  "endpointFrom": "machine",
  "protocol": "http/json",
  "headerNames": [
    "authorization"
  ],
  "missingHeaders": [],
  "saved": {
    "endpoint": "https://otlp.example:4318",
    "protocol": "http/json",
    "headers": [
      "authorization"
    ]
  },
  "sent": 41,
  "queued": 3,
  "dropped": 0,
  "rejected": 0,
  "lastSuccessAt": "2026-11-20T03:12:09.000Z",
  "local": {
    "spans": 5120,
    "points": 48210,
    "days": 90,
    "spanCap": 200000,
    "pointCap": 1000000
  }
}
```

Settings shows each status after **Recording locally ·**:

| `status` | Settings shows |
| --- | --- |
| `off` | export off |
| `no-endpoint` | export waiting for an endpoint |
| `protocol` | export protocol not supported |
| `endpoint-not-allowed` | export endpoint not allowed |
| `bad-headers` | export headers are not written as name=value |
| `missing-headers` | export waiting for header values |
| `ready` | export ready; the process that runs the tick sends |
| `sending` | exporting |
| `backing-off` | export backing off, with the failure in brackets: `timeout`, `refused`, `tls`, `dns` or `http STATUS` |

The endpoint shows scheme, host and port only. Header values never show. The
counts start at zero when the process starts, and live only in the process
that runs the tick; another process shows the setting and the local row
counts.

## Limits

Sending is best effort and never slows delivery. Items wait in memory, at
most 500, and the oldest goes when the queue is full. A failed request is
tried again after 1, 2, 4 and 8 seconds, plus up to a quarter more, or after
`Retry-After`; the fifth failure drops it. That covers a network error, a
timeout, `429`, `502`, `503` and `504`. Any other status, a redirect
included, is rejected and not tried again.
Items not sent when Avoozl stops, or during a long outage, are lost. Avoozl
does not send them again from the local tables.

A request that timed out after the endpoint got it can be sent twice. A
backend that merges traces by ID shows the trace once; a delta metric counts
it twice.
