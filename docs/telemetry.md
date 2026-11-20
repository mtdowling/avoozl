# Telemetry

Avoozl records each task's timing as OpenTelemetry spans and metric points in
its own database. It can also send them to any backend that takes OTLP over
HTTP JSON, when this machine's owner turns that on.

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

That key goes in the machine config: `config.json` in Avoozl's config folder,
`~/.config/avoozl/` on Linux and macOS. The
endpoint and any headers come from the standard environment of the process
that runs the tick:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example:4318
export OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer ${OTLP_TOKEN}"
avoozl telemetry enable
avoozl telemetry status
```

A process a desktop app starts may not inherit a shell's variables. Set them
where that process reads its environment.

## Turning it on and off

`avoozl telemetry enable` and `avoozl telemetry disable` write
`telemetry.enabled` and keep the rest of the file. **Settings › Workspaces ›
Telemetry** has the same switch, **Send task timing over OpenTelemetry**.
Both are a person's: an MCP call or an app token is refused.

A `telemetry` key in a `.avoozl.json` is refused with the file and the
machine config path. A plugin manifest that names `telemetry` fails plugin
lint. The `telemetry` object takes only `enabled`, `true` or `false`.

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

`avoozl rebuild` makes a fresh database from git. The points table starts
empty. The spans table gets the stage spans each landing commit carries in
its `Avoozl-Span` trailers, and Flow's next pass records those tasks' roots
and task points again.

## Export

With the setting on and an endpoint set, the process that runs the tick
sends:

- **One trace per finished task**: a root span `avoozl.task` from the
  earliest stage start to the finish, with a child span `avoozl.stage.STAGE`
  for each stage. A task with no stage span on this machine sends nothing.
- **Metrics**, all with delta temporality:

| Name | Kind | Attributes |
| --- | --- | --- |
| `avoozl.task.lead_time` | histogram, seconds | repo, spec, outcome |
| `avoozl.stage.duration` | histogram, seconds | repo, spec, stage, role |
| `avoozl.tasks.finished` | sum | repo, spec, outcome, first_pass |
| `avoozl.tokens` | sum | repo, spec, stage, role, model, direction |
| `avoozl.credits` | sum | repo, spec, stage, role, model |
| `avoozl.stop_the_line.events` | sum | repo, scope, kind, event |

First-pass rate is `avoozl.tasks.finished` with `first_pass` true over all of
it. Avoozl sends no rate, so the backend computes it over any window. A
manual task counts with outcome `done` and no `first_pass`.

Histograms use the same bounds in seconds everywhere: 30, 60, 120, 300, 600,
1800, 3600, 7200, 14400, 28800 and 86400.

A Prometheus-style backend needs cumulative totals. Put a collector in front
with its `deltatocumulative` processor. Grafana, Honeycomb, Datadog and
CloudWatch are example backends; Avoozl holds no code for any of them.

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
| Redirects | Not followed; a redirect counts as a failure |
| Headers | `Content-Type`, `User-Agent: avoozl/VERSION` and the names in `OTEL_EXPORTER_OTLP_HEADERS` |
| Timeout | `OTEL_EXPORTER_OTLP_TIMEOUT` milliseconds, default 10 seconds, at most 30 |

Avoozl reads `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`,
`OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_PROTOCOL`,
`OTEL_EXPORTER_OTLP_TIMEOUT`, `OTEL_SERVICE_NAME` and
`OTEL_RESOURCE_ATTRIBUTES`. Only the shared endpoint gets `/v1/traces` and
`/v1/metrics` added. An agent process Avoozl starts gets none of these
variables.

## Status

`avoozl telemetry status` prints the same fields the Settings box shows:

```json
{
  "status": "backing-off",
  "failure": "http 503",
  "endpoint": "https://otlp.example:4318",
  "protocol": "http/json",
  "headerNames": [
    "authorization"
  ],
  "sent": 41,
  "queued": 3,
  "dropped": 0,
  "rejected": 0,
  "lastSuccessAt": "2026-11-20T03:12:09.000Z",
  "local": {
    "spans": 5120,
    "points": 48210
  }
}
```

| `status` | Settings shows |
| --- | --- |
| `off` | Off |
| `no-endpoint` | Waiting for an endpoint |
| `protocol` | Protocol not supported |
| `endpoint-not-allowed` | Endpoint not allowed |
| `bad-headers` | Headers are not written as name=value |
| `ready` | Ready, in a process that does not send |
| `sending` | Sending |
| `backing-off` | Backing off, with the failure: `timeout`, `refused`, `tls`, `dns` or `http STATUS` |

The endpoint shows scheme, host and port only. Header values never show. The
counts start at zero when the process starts, and live only in the process
that runs the tick; another process shows the setting and the local row
counts.

## Limits

Sending is best effort and never slows delivery. Items wait in memory, at
most 500, and the oldest goes when the queue is full. A failed request is
tried again after 1, 2, 4, 8 and 16 seconds, or after `Retry-After`; the
fifth failure drops it. That covers a network error, a timeout, `429`, `502`,
`503` and `504`; any other status is rejected and not tried again.
Items not sent when Avoozl stops, or during a long outage, are lost. Avoozl
does not send them again from the local tables.

A request that timed out after the endpoint got it can be sent twice. A
backend that merges traces by ID shows the trace once; a delta metric counts
it twice.
