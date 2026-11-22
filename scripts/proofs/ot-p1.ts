#!/usr/bin/env node
// Proof ot-p1 (otel-export): a fake OTLP collector on 127.0.0.1 receives the
// timing of tasks a scratch repository lands. Everything runs on this machine
// in temporary folders: a bare `origin`, a checkout, an isolated Avoozl home,
// machine config and state folder, and a two-task spec `acme-cache` seeded
// as an approved plan. A scripted worker commit stands in for the harness
// (fixtures.mjs verifiedTask); Avoozl's own direct landing, Flow pass,
// recording API and OTLP exporter do the rest. Prints one JSON line per
// observation and writes the receipt; exits 1 on a failed expectation.
//
//   node scripts/proofs/ot-p1.ts <receipt file>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanupList } from "./machine.ts";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ot-p1-")));
process.env.XDG_CONFIG_HOME = path.join(root, "xdg");
process.env.XDG_STATE_HOME = path.join(root, "state");
for (const name of Object.keys(process.env))
  if (/^(OTEL_|KIROCREW_|AVOOZL_)/.test(name)) delete process.env[name];
const [receipt] = process.argv.slice(2);
if (!receipt) {
  console.error("Usage: ot-p1.ts <receipt file>");
  process.exit(2);
}

const { digest } = await import("../../src/model.ts");
const { Store } = await import("../../src/app/store/store.ts");
const { Operations } = await import("../../src/app/api/operations.ts");
const { integrateVerified } = await import(
  "../../src/app/delivery/delivery.ts"
);
const { landDirect } = await import("../../src/app/landing/direct-landing.ts");
const { syncSpans, taskTiming, listSpans } = await import(
  "../../src/app/flow/flow.ts"
);
const { startTelemetry } = await import("../../src/app/telemetry/index.ts");
const { snapshot, verifiedTask } = await import(
  "../../src/app/test/fixtures.ts"
);
const { startCollector } = await import(
  "../../src/app/telemetry/test/fake-collector.ts"
);

const { found } = await import("../../src/app/test/view-shapes.ts");
const { messageOf } = await import("../../src/app/executors/supervisor.ts");
type Collector = Awaited<ReturnType<typeof startCollector>>;
type StoreOf = InstanceType<typeof Store>;

// A field of a parsed OTLP body: a list, a text, or a value.
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const field = (value: unknown, key: string): unknown =>
  isObject(value) ? value[key] : undefined;
const listAt = (value: unknown, key: string): unknown[] => {
  const found = field(value, key);
  return Array.isArray(found) ? found : [];
};
const textAt = (value: unknown, key: string) => {
  const found = field(value, key);
  return typeof found === "string" ? found : undefined;
};

const { cleanups, t } = cleanupList();
const results: { n: number; what: string; ok: boolean; detail: string }[] = [];
const observe = (
  n: number,
  what: string,
  ok: unknown,
  detail: unknown = "",
) => {
  results.push({ n, what, ok: Boolean(ok), detail: String(detail) });
  console.log(JSON.stringify({ n, what, ok: Boolean(ok), detail }));
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Text that must never leave the machine: a task title, its done text, its
// branch name, its worktree path, a session's text and a token-looking value.
const CANARY = "CANARY-OTP1";
const TOKEN = "ghp_CANARYOTP10123456789abcdefghijklmnopq";
const leaf = (id: string) => ({
  id,
  title: `${CANARY} title ${id}`,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [`${CANARY} done text ${id}`],
  repository: "app",
  planId: "acme-cache",
});

// One scratch workspace: bare origin, checkout, store, machine config and a
// state folder. `enabled` writes telemetry.enabled into the machine config.
function world(name: string, enabled: boolean, collector: Collector) {
  const base = path.join(root, name),
    origin = path.join(base, "origin.git"),
    checkout = path.join(base, "app"),
    configDirectory = path.join(base, "machine-config"),
    stateDirectory = path.join(base, "machine-state");
  fs.mkdirSync(configDirectory, { recursive: true });
  git(root, "init", "--bare", "-q", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  git(checkout, "config", "user.name", "Proof");
  git(checkout, "config", "user.email", "proof@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  const writeConfig = (on: boolean) =>
    fs.writeFileSync(
      path.join(configDirectory, "config.json"),
      JSON.stringify(
        on ? { version: 1, telemetry: { enabled: true } } : { version: 1 },
        null,
        2,
      ),
    );
  writeConfig(enabled);
  const dbPath = path.join(base, "workspace.sqlite");
  const store = new Store(dbPath);
  store.initialize({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2"), leaf("t3")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "direct",
    checks: [[process.execPath, "-e", "process.exit(0)"]],
    worktreeRoot: path.join(base, "wt"),
  });
  store.put("plans", {
    id: "acme-cache",
    spec: "acme-cache",
    hash: digest("plan acme-cache"),
  });
  const env = {
    OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    OTEL_EXPORTER_OTLP_HEADERS: `authorization=${TOKEN}`,
    OTEL_EXPORTER_OTLP_TIMEOUT: "1500",
  };
  const logs: string[] = [];
  const telemetry = startTelemetry({
    store,
    configDirectory,
    stateDirectory,
    env,
    version: "proof",
    log: (line) => logs.push(line),
    intervalMs: 60_000,
  });
  const ops = new Operations(store, {
    workspaceRoot: base,
    configDirectory,
  });
  const w = {
    base,
    origin,
    checkout: fs.realpathSync.native(checkout),
    root: base,
    store,
    ops,
    dbPath,
    configDirectory,
    stateDirectory,
    telemetry,
    logs,
    writeConfig,
  };
  t.after(() => {
    try {
      telemetry.stop();
      store.close();
    } catch {}
  });
  return w;
}

// Land one task the way the tick does: a worker session bound and reported
// done (its commit is the scripted harness's), then integration, the direct
// landing on origin, and Flow's pass.
async function land(w: ReturnType<typeof world>, id: string, startMs: number) {
  const at = (m: number) => new Date(startMs + m * 60_000).toISOString();
  const { commit } = verifiedTask(w, id, `${id}.txt`, {
    binding: () => ({
      source: "tick",
      boundAt: at(0),
      status: "idle",
      text: `${CANARY} session text`,
    }),
  });
  const binding = found(
    w.store.get<{ id: string; [key: string]: unknown }>(
      "session_bindings",
      `slot-${id}`,
    ),
    id,
  );
  w.store.put("session_bindings", {
    ...binding,
    report: { kind: "done", at: at(20), commit },
  });
  syncSpans(w.store, { now: startMs + 21 * 60_000 });
  await integrateVerified(w.store, { now: startMs + 22 * 60_000 });
  const landed = await landDirect(w.store, {
    workspaceRoot: w.base,
    rounds: 2,
    machine: {},
  });
  syncSpans(w.store, { now: startMs + 30 * 60_000 });
  return { commit, landed };
}

const rows = (store: StoreOf, sql: string, ...args: string[]) =>
  store.db.prepare(sql).all(...args);
const finished = (w: ReturnType<typeof world>, id: string) =>
  w.store.read().tasks.find((task) => task.id === id)?.integration?.at;

let failed: unknown = null;
try {
  const collector = await startCollector(t);
  // Work starts three hours ago, so each landing (stamped now) ends it.
  const T0 = Date.now() - 3 * 3_600_000;

  // 1. Telemetry off: Avoozl records locally and sends nothing.
  const off = world("off", false, collector);
  for (const [i, id] of ["t1", "t2"].entries())
    await land(off, id, T0 + i * 3_600_000);
  await off.telemetry.flush(2000);
  observe(
    1,
    "off: both tasks landed on origin",
    finished(off, "t1") && finished(off, "t2"),
  );
  observe(
    2,
    "off: the collector received no request",
    collector.requests.length === 0,
    collector.requests.length,
  );
  for (const id of ["t1", "t2"]) {
    const stored = rows(
      off.store,
      "SELECT * FROM telemetry_spans WHERE task_id=? AND parent_span_id IS NOT NULL",
      id,
    );
    const timing = taskTiming(
      off.store,
      found(
        off.store.read().tasks.find((task) => task.id === id),
        id,
      ),
    );
    const listed = listSpans(off.store, { taskId: id });
    observe(
      3,
      `off: taskTiming for ${id} reads its spans from telemetry_spans`,
      stored.length > 0 && listed.length === stored.length && timing.leadMs > 0,
      `${stored.length} stage spans, lead ${Math.round(timing.leadMs / 60_000)} min`,
    );
  }
  observe(
    4,
    "off: the status is off",
    (await off.ops.execute<{ status?: string }>("telemetry.status", {}))
      .status === "off",
  );

  // 2. Telemetry on: one trace per task, both tasks' metrics, no canary.
  const on = world("on", true, collector);
  await on.telemetry.step();
  for (const [i, id] of ["t1", "t2"].entries())
    await land(on, id, T0 + i * 3_600_000);
  await on.telemetry.flush(5000);
  const traces = collector.requests.filter((r) => r.url === "/v1/traces");
  const metrics = collector.requests.filter((r) => r.url === "/v1/metrics");
  const spans = traces.flatMap((r) =>
    listAt(r.body, "resourceSpans").flatMap((rs) =>
      listAt(rs, "scopeSpans").flatMap((s) => listAt(s, "spans")),
    ),
  );
  const roots = spans.filter((s) => textAt(s, "name") === "avoozl.task");
  const taskOf = (span: unknown) =>
    textAt(
      field(
        listAt(span, "attributes").find(
          (a) => textAt(a, "key") === "avoozl.task.id",
        ),
        "value",
      ),
      "stringValue",
    );
  observe(
    5,
    "on: one root span for each task",
    roots.length === 2 && new Set(roots.map(taskOf)).size === 2,
    roots.map(taskOf).join(","),
  );
  for (const root of roots) {
    const id = taskOf(root) ?? "";
    const children = spans.filter(
      (s) => textAt(s, "parentSpanId") === textAt(root, "spanId"),
    );
    const stored = rows(
      on.store,
      "SELECT * FROM telemetry_spans WHERE task_id=? AND parent_span_id IS NULL",
      id,
    )[0];
    const nanos = (iso: unknown) =>
      (BigInt(Date.parse(String(iso))) * 1_000_000n).toString();
    observe(
      6,
      `on: ${id}'s trace holds its stage spans as children`,
      children.length > 0 &&
        children.every((c) => textAt(c, "traceId") === textAt(root, "traceId")),
      children.map((c) => textAt(c, "name")).join(","),
    );
    observe(
      7,
      `on: ${id}'s root times equal the stored root's`,
      textAt(root, "startTimeUnixNano") === nanos(stored.started_at) &&
        textAt(root, "endTimeUnixNano") === nanos(stored.ended_at),
      `${stored.started_at} to ${stored.ended_at}`,
    );
  }
  const names = new Set(
    metrics.flatMap((r) =>
      listAt(r.body, "resourceMetrics").flatMap((rm) =>
        listAt(rm, "scopeMetrics").flatMap((s) =>
          listAt(s, "metrics").map((m) => textAt(m, "name")),
        ),
      ),
    ),
  );
  const finishedPoints = metrics.flatMap((r) =>
    listAt(r.body, "resourceMetrics").flatMap((rm) =>
      listAt(rm, "scopeMetrics").flatMap((s) =>
        listAt(s, "metrics")
          .filter((m) => textAt(m, "name") === "avoozl.tasks.finished")
          .flatMap((m) => listAt(field(m, "sum"), "dataPoints")),
      ),
    ),
  );
  observe(
    8,
    "on: metrics for both tasks",
    names.has("avoozl.task.lead_time") &&
      names.has("avoozl.stage.duration") &&
      finishedPoints.length === 2,
    [...names].join(","),
  );
  const sent = collector.requests.map((r) => r.text).join("\n");
  observe(
    9,
    "on: no canary, branch, path or token in any request body",
    ![CANARY, TOKEN, "avoozl/t1", on.base].some((text) => sent.includes(text)),
  );
  observe(
    10,
    "on: the header reached the collector and no log line",
    collector.requests.every((r) => r.headers.authorization === TOKEN) &&
      !on.logs.join("\n").includes(TOKEN),
    on.logs.join(" | "),
  );

  // 3. A collector that holds its reply: landing does not wait on it.
  collector.behave = () => "hold";
  const before = collector.requests.length;
  const startedAt = Date.now();
  const point = (await import("../../src/app/telemetry/record.ts")).point;
  point(on.store, {
    id: "proof:pending",
    name: "avoozl.tokens",
    kind: "sum",
    value: 1,
    at: new Date().toISOString(),
  });
  const pending = on.telemetry.step();
  await sleep(200);
  const inflight = collector.requests.length > before;
  await land(on, "t3", T0 + 2 * 3_600_000);
  const landedWhileHeld = finished(on, "t3") && collector.inflight > 0;
  observe(
    11,
    "held: t3 landed while the collector's request was unanswered",
    inflight && landedWhileHeld,
    `landing took ${Date.now() - startedAt} ms with ${collector.inflight} request open`,
  );
  await pending;
  collector.behave = () => 503;
  for (
    let i = 0;
    i < 20 &&
    (await on.ops.execute<{ failure?: string }>("telemetry.status", {}))
      .failure !== "http 503";
    i++
  ) {
    await sleep(500);
    await on.telemetry.step();
  }
  const status = await on.ops.execute<{
    status?: string;
    failure?: string;
    endpoint?: string;
  }>("telemetry.status", {});
  observe(
    12,
    "503: telemetry.status says backing-off with http 503",
    status.status === "backing-off" && status.failure === "http 503",
    JSON.stringify({
      status: status.status,
      failure: status.failure,
      endpoint: status.endpoint,
    }),
  );
  observe(
    13,
    "503: the status holds no header value",
    !JSON.stringify(status).includes(TOKEN),
  );

  // 4. Rebuild: points empty, spans only from the landing trailers, the
  // instance ID kept.
  const idFile = path.join(on.stateDirectory, "telemetry.json");
  const instance = fs.readFileSync(idFile, "utf8");
  on.telemetry.stop();
  on.store.close();
  for (const name of fs.readdirSync(on.base))
    if (name.startsWith("workspace.sqlite"))
      fs.rmSync(path.join(on.base, name));
  const fresh = new Store(on.dbPath);
  t.after(() => fresh.close());
  fresh.initialize({ ...snapshot(), tasks: [], edges: [] });
  fresh.put("repositories", {
    id: "app",
    root: on.checkout,
    baseBranch: "main",
    landing: "direct",
    worktreeRoot: path.join(on.base, "wt"),
  });
  const ops = new Operations(fresh, {
    workspaceRoot: on.base,
    configDirectory: on.configDirectory,
  });
  let rebuilt: { error?: string; landed?: { task: string }[] } | null = null;
  try {
    rebuilt = await ops.execute<{ landed?: { task: string }[] }>(
      "workspace.rebuild",
      {},
    );
  } catch (error) {
    rebuilt = { error: messageOf(error) };
  }
  const points = rows(fresh, "SELECT COUNT(*) AS n FROM telemetry_points")[0].n;
  const rootsAfter = rows(
    fresh,
    "SELECT COUNT(*) AS n FROM telemetry_spans WHERE parent_span_id IS NULL",
  )[0].n;
  const spansAfter = rows(fresh, "SELECT COUNT(*) AS n FROM telemetry_spans")[0]
    .n;
  const trailers = git(on.origin, "log", "main", "--format=%B")
    .split("\n")
    .filter((line) => line.startsWith("Avoozl-Span:")).length;
  observe(
    14,
    "rebuild: the points table is empty, no root is made, and the spans are the landing trailers'",
    !rebuilt?.error &&
      points === 0 &&
      rootsAfter === 0 &&
      spansAfter === trailers,
    `${points} points, ${rootsAfter} roots, ${spansAfter} spans from ${trailers} Avoozl-Span trailers, rebuild ${JSON.stringify(rebuilt?.error ?? (rebuilt?.landed ?? []).map((l) => l.task))}`,
  );
  observe(
    15,
    "rebuild: the instance ID is unchanged",
    fs.readFileSync(idFile, "utf8") === instance,
  );
} catch (error) {
  failed = error;
  observe(
    0,
    "proof ran to the end",
    false,
    error instanceof Error ? error.stack : String(error),
  );
} finally {
  for (const fn of cleanups.reverse())
    try {
      await fn();
    } catch {}
}

const ok = !failed && results.every((r) => r.ok);
if (ok) {
  const lines = [
    "# Proof ot-p1: a fake collector receives a scratch repository's tasks",
    "",
    `Run on ${new Date().toISOString()} by \`node scripts/proofs/ot-p1.ts\` on ${process.platform}, Node ${process.version}.`,
    "Everything ran in a temporary folder: a bare origin, a checkout, an isolated machine config and state folder, and a fake OTLP collector on 127.0.0.1. A scripted worker commit stood in for the harness; Avoozl's direct landing, Flow pass, recording API and OTLP exporter did the rest.",
    "",
    "| # | Observation | Result | Detail |",
    "| --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.n} | ${r.what} | ${r.ok ? "pass" : "fail"} | ${r.detail.replaceAll("|", "/").replaceAll("\n", " ")} |`,
    ),
    "",
  ];
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  fs.writeFileSync(receipt, lines.join("\n"));
  console.log(`receipt: ${receipt}`);
}
process.exit(ok ? 0 : 1);
