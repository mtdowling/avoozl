import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { importApp } from "./app-source.mjs";
const { Store } = await importApp("store.mjs");
const root = process.argv[2];
if (!root || !path.basename(root).startsWith("aicommander-vscode-probe-"))
  throw Error("Pass the disposable probe root");
const setup = JSON.parse(
  fs.readFileSync(path.join(root, "tool-roundtrip-setup.json")),
);
const store = new Store(path.join(root, "workspace.sqlite")),
  db = new DatabaseSync(path.join(root, "ahp.sqlite"));
const trace = JSON.parse(
  fs.readFileSync(path.join(root, "managed-bridge.json")),
).trace;
const report = { at: new Date().toISOString(), ...setup, checks: {} };
for (const provider of ["claude", "codex"]) {
  const id = setup.runs[provider].id,
    run = store.get("runs", id),
    events = store.events({ runId: id, limit: 1000 });
  const request = events.find((e) => e.kind === "request.answered")?.request;
  assert.equal(request?.state, "allowed");
  const started = JSON.parse(
    fs.readFileSync(path.join(root, "markers", provider + ".started")),
  );
  let alive;
  try {
    process.kill(started.pid, 0);
    alive = true;
  } catch {
    alive = false;
  }
  const normal = fs.existsSync(
    path.join(root, "markers", provider + ".completed"),
  );
  assert.equal(alive, false);
  assert.equal(normal, false);
  const nativeApproval = trace.find(
    (t) =>
      t.action === "chat/toolCallConfirmed" &&
      t.toolCallId === request.id &&
      t.approved === true,
  );
  assert.ok(nativeApproval);
  const nativeCancel = trace.find(
    (t) => t.action === "chat/turnCancelled" && t.turnId === "initial-" + id,
  );
  assert.ok(nativeCancel);
  assert.ok(Date.parse(nativeApproval.at) < Date.parse(started.at));
  assert.ok(Date.parse(started.at) < Date.parse(nativeCancel.at));
  const terminal = events.findLast((e) => e.kind === "turn.completed");
  assert.ok(terminal);
  report.checks[provider] = {
    providerSessionId: run.providerSessionId,
    request,
    approvedThroughNativeUI: true,
    actualExecution: started,
    nativeCancel,
    processStopped: true,
    normalCompletionMarker: false,
    signal: fs.existsSync(path.join(root, "markers", provider + ".interrupted"))
      ? fs.readFileSync(
          path.join(root, "markers", provider + ".interrupted"),
          "utf8",
        )
      : null,
    sourceTerminal: terminal,
    runState: run.state,
    cleanCancellationStatus: run.state === "interrupted",
  };
}
report.ahpStates = db
  .prepare("SELECT body FROM state")
  .all()
  .map((r) => JSON.parse(r.body));
report.nativeActions = trace.filter((t) =>
  ["chat/toolCallConfirmed", "chat/turnCancelled"].includes(t.action),
);
report.sqliteIntegrity = store.db
  .prepare("PRAGMA integrity_check")
  .get().integrity_check;
store.close();
db.close();
fs.writeFileSync(
  path.join(root, "tool-roundtrip.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    claude: report.checks.claude.runState,
    codex: report.checks.codex.runState,
    bothCommandsStopped: true,
    sqliteIntegrity: report.sqliteIntegrity,
  }),
);
