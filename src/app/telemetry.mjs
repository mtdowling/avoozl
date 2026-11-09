import { digest } from "../model.mjs";
import { canonical } from "./store.mjs";
const numeric = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);
const fields = [
  "inputTokens",
  "uncachedInputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
  "estimatedCostUsd",
];
export function normalizeUsage(provider, report) {
  if (provider === "codex") {
    const t = report.tokenUsage?.total || report.total;
    if (!t) return [];
    const input = numeric(t.inputTokens),
      cached = numeric(t.cachedInputTokens),
      output = numeric(t.outputTokens);
    return [
      {
        model: report.model || "unspecified",
        inputTokens: input,
        uncachedInputTokens: Math.max(0, input - cached),
        cacheReadTokens: cached,
        cacheWriteTokens: null,
        outputTokens: output,
        reasoningTokens: numeric(t.reasoningOutputTokens),
        totalTokens: numeric(t.totalTokens) || input + output,
        estimatedCostUsd: null,
        coverage: "provider thread totals; cache writes and cost not reported",
      },
    ];
  }
  // modelUsage includes subagents and compaction; message.usage is main-loop-only.
  return Object.entries(report.modelUsage || {}).map(([model, t]) => {
    const input = numeric(t.inputTokens),
      read = numeric(t.cacheReadInputTokens),
      write = numeric(t.cacheCreationInputTokens),
      output = numeric(t.outputTokens);
    return {
      model: t.canonicalModel || model,
      inputTokens: input + read + write,
      uncachedInputTokens: input,
      cacheReadTokens: read,
      cacheWriteTokens: write,
      outputTokens: output,
      reasoningTokens: numeric(t.thinkingTokens),
      totalTokens: input + read + write + output,
      estimatedCostUsd: Number.isFinite(t.costUSD) ? t.costUSD : null,
      coverage:
        "provider cumulative model totals; excludes helpers outside the query pipeline",
      costBasis: t.costBasis || "provider-estimate",
    };
  });
}
export function recordUsage(store, run, report) {
  return store.transaction(() => {
    const at = new Date().toISOString(),
      samples = [];
    for (const totals of normalizeUsage(run.provider, report)) {
      const counterId = [
          run.id,
          run.providerSessionId || "pending",
          totals.model,
        ].join(":"),
        previousRow = store.db
          .prepare("SELECT body FROM usage_counters WHERE id=?")
          .get(counterId),
        previous = previousRow
          ? JSON.parse(previousRow.body)
          : { epoch: 0, totals: {} };
      const fingerprint = digest(
        canonical({ counterId, reportId: report.reportId || null, totals }),
      );
      if (
        store.db
          .prepare("SELECT id FROM usage_samples WHERE id=?")
          .get(fingerprint)
      )
        continue;
      // Zeroed fatal startup results are not a new accounting epoch.
      if (!totals.totalTokens && previous.totals.totalTokens && !report.reset)
        continue;
      const reset = Boolean(
          report.reset ||
            totals.totalTokens < numeric(previous.totals.totalTokens),
        ),
        epoch = previous.epoch + (reset ? 1 : 0),
        baseline = reset ? {} : previous.totals,
        delta = {};
      for (const field of fields)
        delta[field] =
          totals[field] === null
            ? null
            : Math.max(0, numeric(totals[field]) - numeric(baseline[field]));
      const sample = {
        id: fingerprint,
        runId: run.id,
        taskId: run.taskId,
        provider: run.provider,
        providerSessionId: run.providerSessionId,
        model: totals.model,
        at,
        epoch,
        reset,
        delta,
        totals,
        raw: report,
      };
      store.db
        .prepare("INSERT INTO usage_samples VALUES (?,?,?,?,?)")
        .run(fingerprint, run.id, run.taskId, at, JSON.stringify(sample));
      store.db
        .prepare(
          "INSERT INTO usage_counters VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        )
        .run(counterId, JSON.stringify({ epoch, totals }));
      samples.push(sample);
    }
    return samples;
  });
}
export function runTime(store, run, now = Date.now(), observe = () => {}) {
  const events = store.db
    .prepare("SELECT * FROM events WHERE run_id=? ORDER BY seq")
    .all(run.id)
    .map((r) => ({
      kind: r.kind,
      at: Date.parse(r.at),
      ...JSON.parse(r.body),
    }));
  let phase = "startup",
    cursor = Date.parse(run.createdAt),
    last = cursor;
  const phases = {
      startup: 0,
      agent: 0,
      approval: 0,
      input: 0,
      idle: 0,
      disconnected: 0,
      validation: 0,
      integration: 0,
    },
    tools = new Map();
  let toolMs = 0;
  const transition = (next, at) => {
    if (Number.isFinite(cursor) && at >= cursor) {
      phases[phase] = (phases[phase] || 0) + at - cursor;
      observe(phase, cursor, at);
    }
    phase = next;
    cursor = at;
  };
  for (const event of events) {
    if (!Number.isFinite(event.at)) continue;
    last = event.at;
    if (
      (event.kind === "state" && event.state === "running") ||
      (event.kind === "delivery.updated" &&
        ["accepted", "submitted"].includes(event.delivery?.state)) ||
      event.kind === "request.answered"
    )
      transition("agent", event.at);
    else if (event.kind === "request.created")
      transition(
        event.request.kind === "input" ? "input" : "approval",
        event.at,
      );
    else if (event.kind === "turn.completed") transition("idle", event.at);
    else if (event.kind === "disconnected")
      transition("disconnected", event.at);
    else if (event.kind === "run.recovered") {
      const observed = Date.parse(event.lastObservedAt);
      if (Number.isFinite(observed) && observed >= cursor)
        transition("disconnected", observed);
      transition("disconnected", event.at);
    } else if (event.kind === "validation.started")
      transition("validation", event.at);
    else if (event.kind === "validation.result") transition("idle", event.at);
    else if (event.kind === "integration.started")
      transition("integration", event.at);
    else if (event.kind === "integration.completed")
      transition("idle", event.at);
    const id = event.item?.id || event.id;
    if (
      (event.kind === "tool.activity" &&
        id &&
        event.method === "item/started") ||
      (event.kind === "tool.started" && id)
    )
      tools.set(id, event.at);
    if (
      ((event.kind === "tool.activity" && event.method === "item/completed") ||
        event.kind === "tool.finished") &&
      tools.has(id)
    ) {
      toolMs += event.at - tools.get(id);
      tools.delete(id);
    }
  }
  const active = [
      "starting",
      "running",
      "waiting-input",
      "waiting-approval",
    ].includes(run.state),
    end = active ? now : last;
  if (end >= cursor) transition(phase, end);
  const commandMs = store
    .list("evidence")
    .filter((e) => e.runId === run.id)
    .reduce(
      (sum, e) =>
        sum + Math.max(0, Date.parse(e.endedAt) - Date.parse(e.startedAt) || 0),
      0,
    );
  return {
    wallMs: Math.max(0, end - Date.parse(run.createdAt) || 0),
    phases,
    toolMs,
    validationCommandMs: commandMs,
    active,
    meaning:
      "Observed session wall time; tools overlap agent time. This is not human effort or model compute time.",
  };
}
export function metrics(
  store,
  {
    taskId,
    runId,
    provider,
    from,
    to,
    groupBy = "task",
    days = 30,
    now = Date.now(),
  } = {},
) {
  const dayMs = 86400000,
    count = Math.max(1, Math.min(90, Number(days) || 30)),
    today = Math.floor(now / dayMs) * dayMs,
    start = today - (count - 1) * dayMs,
    buckets = new Map(
      Array.from({ length: count }, (_, i) => {
        const day = new Date(start + i * dayMs).toISOString().slice(0, 10);
        return [
          day,
          {
            day,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: null,
            agentMs: 0,
            waitingMs: 0,
            otherMs: 0,
            sessions: 0,
          },
        ];
      }),
    );
  const samples = store.db
    .prepare("SELECT body FROM usage_samples ORDER BY at")
    .all()
    .map((r) => JSON.parse(r.body))
    .filter(
      (s) =>
        (!taskId || s.taskId === taskId) &&
        (!runId || s.runId === runId) &&
        (!provider || s.provider === provider) &&
        (!from || s.at >= from) &&
        (!to || s.at <= to),
    );
  for (const sample of samples) {
    const row = buckets.get(sample.at.slice(0, 10));
    if (!row) continue;
    for (const key of ["inputTokens", "outputTokens", "totalTokens"])
      row[key] += sample.delta[key] || 0;
    if (sample.delta.estimatedCostUsd !== null)
      row.estimatedCostUsd =
        (row.estimatedCostUsd || 0) + sample.delta.estimatedCostUsd;
  }
  const observe = (phase, a, b) => {
    for (let cursor = Math.max(a, start); cursor < Math.min(b, now); ) {
      const end = Math.min(b, Math.floor(cursor / dayMs) * dayMs + dayMs, now),
        row = buckets.get(new Date(cursor).toISOString().slice(0, 10));
      if (row)
        row[
          phase === "agent"
            ? "agentMs"
            : ["approval", "input"].includes(phase)
              ? "waitingMs"
              : "otherMs"
        ] += end - cursor;
      cursor = end;
    }
  };
  const groups = new Map();
  for (const sample of samples) {
    const key =
      groupBy === "day"
        ? sample.at.slice(0, 10)
        : groupBy === "model"
          ? sample.model
          : groupBy === "provider"
            ? sample.provider
            : sample.taskId;
    let row = groups.get(key);
    if (!row) {
      row = {
        key,
        inputTokens: 0,
        uncachedInputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: null,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: null,
        reports: 0,
        costReports: 0,
      };
      groups.set(key, row);
    }
    for (const field of fields) {
      if (sample.delta[field] !== null)
        row[field] = (row[field] || 0) + sample.delta[field];
    }
    if (sample.delta.estimatedCostUsd !== null) row.costReports++;
    row.reports++;
    row.costCoverage =
      row.costReports === row.reports
        ? "reported"
        : row.costReports
          ? "partial"
          : "not-reported";
  }
  const runs = store
    .list("runs")
    .filter(
      (r) =>
        !r.deletedAt &&
        (!taskId || r.taskId === taskId) &&
        (!runId || r.id === runId) &&
        (!provider || r.provider === provider),
    )
    .map((r) => ({
      id: r.id,
      taskId: r.taskId,
      provider: r.provider,
      state: r.state,
      createdAt: r.createdAt,
      time: runTime(store, r, now, observe),
      usage: samples
        .filter((s) => s.runId === r.id)
        .reduce(
          (a, s) => {
            a.totalTokens += s.delta.totalTokens;
            a.outputTokens += s.delta.outputTokens;
            return a;
          },
          { totalTokens: 0, outputTokens: 0 },
        ),
    }));
  for (const run of runs) {
    const row = buckets.get(run.createdAt?.slice(0, 10));
    if (row) row.sessions++;
  }
  return {
    series: [...buckets.values()],
    period: {
      from: new Date(start).toISOString(),
      to: new Date(now).toISOString(),
      days: count,
    },
    groupBy,
    groups: [...groups.values()],
    runs,
    samples: samples.length,
    coverage:
      "Only usage reported after instrumentation is counted. Legacy tasks and disconnected gaps have no reconstructed token or effort history. Costs are provider estimates, not bills. Reasoning tokens are already included in output.",
  };
}
