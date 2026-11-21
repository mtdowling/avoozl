// ot-5.2: canary and credential tests (OT9.2, OT9.5, OT6.4, OT12.4).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Store } from "../../store/store.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { startTelemetry } from "../index.ts";
import { finishTask, point, span } from "../record.ts";
import { type Collector, startCollector } from "./fake-collector.ts";

const CANARIES = {
  title: "CANARY-TITLE",
  doneText: "CANARY-DONE-TEXT",
  branch: "CANARY-BRANCH",
  worktree: "/home/CANARY-WORKTREE",
  session: "CANARY-SESSION-TEXT",
  token: "ghp_CANARYTOKEN0123456789abcdefghijklmnop",
};

// Everything a person could read after the run, as one string.
function everything(store: Store, extra: unknown[]) {
  const rows = ["telemetry_spans", "telemetry_points"].map((table) =>
    store.db.prepare(`SELECT * FROM ${table}`).all(),
  );
  return JSON.stringify([rows, ...extra]);
}

function setup(t: TestContext, collector: Collector, headers?: string) {
  const configDirectory = temporaryDirectory("avoozl-config-");
  const stateDirectory = temporaryDirectory("avoozl-state-");
  fs.writeFileSync(
    path.join(configDirectory, "config.json"),
    JSON.stringify({ telemetry: { enabled: true } }),
  );
  const store = new Store(":memory:");
  t.after(() => store.close());
  const logs: string[] = [];
  const handle = startTelemetry({
    store,
    configDirectory,
    stateDirectory,
    log: (line) => logs.push(line),
    env: {
      OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
      OTEL_EXPORTER_OTLP_TIMEOUT: "300",
      ...(headers ? { OTEL_EXPORTER_OTLP_HEADERS: headers } : {}),
    },
  });
  t.after(() => handle.stop());
  return { store, handle, logs, stateDirectory };
}

const stage = (extra = {}) => ({
  key: "a1:1:coding",
  taskId: "a1",
  repo: "acme/app",
  spec: "acme-cache",
  stage: "coding",
  attempt: 1,
  startedAt: "2025-11-20T03:00:00.000Z",
  endedAt: "2025-11-20T03:10:00.000Z",
  ...extra,
});
const done = {
  taskId: "a1",
  repo: "acme/app",
  spec: "acme-cache",
  finishedAt: "2025-11-20T03:30:00.000Z",
  outcome: "landed",
  firstPass: true,
};

test("a task full of canaries records and exports with none of them anywhere", async (t) => {
  const collector = await startCollector(t);
  const s = setup(t, collector);
  // The task's own text reaches the recorder only as fields the allowlist
  // does not have, so each is refused by name.
  for (const [field, value] of Object.entries(CANARIES))
    assert.throws(
      () => span(s.store, stage({ [field]: value })),
      new RegExp(field),
    );
  assert.throws(() =>
    point(s.store, {
      id: "x",
      name: "avoozl.tokens",
      kind: "sum",
      value: 1,
      at: done.finishedAt,
      prompt: CANARIES.session,
    }),
  );
  // Free text in an allowed field is refused or never leaves.
  assert.throws(
    () => span(s.store, stage({ spec: CANARIES.worktree })),
    /spec/,
  );
  span(s.store, stage());
  finishTask(s.store, done);
  await s.handle.flush();
  assert.ok(collector.requests.length >= 2);
  const seen = everything(s.store, [
    collector.requests.map((r) => r.text),
    s.logs,
    s.handle.status(),
    fs
      .readdirSync(s.stateDirectory)
      .map((name) =>
        fs.readFileSync(path.join(s.stateDirectory, name), "utf8"),
      ),
  ]);
  for (const canary of Object.values(CANARIES))
    assert.ok(!seen.includes(canary), canary);
});

test("a canary in a span's detail is in the local row and in no OTLP body", async (t) => {
  const collector = await startCollector(t);
  const s = setup(t, collector);
  span(s.store, stage({ detail: "CANARY-DETAIL" }));
  finishTask(s.store, done);
  await s.handle.flush();
  assert.ok(everything(s.store, []).includes("CANARY-DETAIL"));
  assert.ok(collector.requests.length >= 2);
  for (const request of collector.requests)
    assert.ok(!request.text.includes("CANARY-DETAIL"));
});

test("a header value is in the request and in no log, state file, status, error or table", async (t) => {
  const collector = await startCollector(t);
  collector.behave = () => 503;
  const value = "CANARY-HEADER-VALUE";
  const s = setup(t, collector, `authorization=${value}`);
  span(s.store, stage());
  finishTask(s.store, done);
  await s.handle.flush(1000);
  assert.equal(collector.requests[0].headers.authorization, value);
  const seen = everything(s.store, [
    s.logs,
    s.handle.status(),
    fs
      .readdirSync(s.stateDirectory)
      .map((name) =>
        fs.readFileSync(path.join(s.stateDirectory, name), "utf8"),
      ),
  ]);
  assert.ok(!seen.includes(value));
  // A pair with no value shows its name only.
  const bad = setup(t, collector, "no-equals-sign");
  assert.equal(bad.handle.status().status, "bad-headers");
});
