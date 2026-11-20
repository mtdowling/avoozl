# Proof ot-p1: a fake collector receives a scratch repository's tasks

Run on 2026-11-20T16:08:27.820Z by `node scripts/proofs/ot-p1.mjs` on linux, Node v24.22.3.
Everything ran in a temporary folder: a bare origin, a checkout, an isolated machine config and state folder, and a fake OTLP collector on 127.0.0.1. A scripted worker commit stood in for the harness; Avoozl's direct landing, Flow pass, recording API and OTLP exporter did the rest.

| # | Observation | Result | Detail |
| --- | --- | --- | --- |
| 1 | off: both tasks landed on origin | pass |  |
| 2 | off: the collector received no request | pass | 0 |
| 3 | off: taskTiming for t1 reads its spans from telemetry_spans | pass | 1 stage spans, lead 180 min |
| 3 | off: taskTiming for t2 reads its spans from telemetry_spans | pass | 1 stage spans, lead 120 min |
| 4 | off: the status is off | pass |  |
| 5 | on: one root span for each task | pass | t1,t2 |
| 6 | on: t1's trace holds its stage spans as children | pass | avoozl.stage.coding |
| 7 | on: t1's root times equal the stored root's | pass | 2026-11-20T13:08:22.787Z to 2026-11-20T16:08:23.940Z |
| 6 | on: t2's trace holds its stage spans as children | pass | avoozl.stage.coding |
| 7 | on: t2's root times equal the stored root's | pass | 2026-11-20T14:08:22.787Z to 2026-11-20T16:08:24.360Z |
| 8 | on: metrics for both tasks | pass | avoozl.task.lead_time,avoozl.stage.duration,avoozl.tasks.finished |
| 9 | on: no canary, branch, path or token in any request body | pass |  |
| 10 | on: the header reached the collector and no log line | pass | OpenTelemetry export to 127.0.0.1:45397 |
| 11 | held: t3 landed while the collector's request was unanswered | pass | landing took 662 ms with 1 request open |
| 12 | 503: telemetry.status says backing-off with http 503 | pass | {"status":"backing-off","failure":"http 503","endpoint":"http://127.0.0.1:45397"} |
| 13 | 503: the status holds no header value | pass |  |
| 14 | rebuild: the points table is empty, no root is made, and the spans are the landing trailers' | pass | 0 points, 0 roots, 3 spans from 3 Avoozl-Span trailers, rebuild ["t1","t2","t3"] |
| 15 | rebuild: the instance ID is unchanged | pass |  |
