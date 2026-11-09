#!/usr/bin/env node
// Produces a compact, reproducible evidence receipt for the VS Code client.
//
// It stands up a disposable workspace, a fixture agent host that runs real
// child processes, the workspace server, and the agent host facade; then
// drives the whole approval-to-cancellation path over the real Agent Host
// Protocol using Microsoft's own client library — the same wire messages a
// VS Code editor sends.
//
// What this proves:
//   * The facade negotiates a protocol version a real editor offers.
//   * An approval reaches the provider through the protocol and an actual
//     child process starts, identified by the PID it wrote itself.
//   * A protocol cancellation stops that actual process.
//   * The transcript reports a tool that ran and was stopped as a completed
//     unsuccessful tool, not as a skipped one, and the run as interrupted
//     rather than failed, while keeping the provider's own diagnostic.
//
// What it does not prove: that a human clicking the native buttons produces
// these messages. Clicked-control acceptance needs a person at the editor.
// Nor does it prove how Claude or Codex classify a turn; that needs the
// opt-in real-provider run.
//
//   node scripts/vscode-evidence.mjs [--keep] [--out FILE]
import fs from "node:fs";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@microsoft/agent-host-protocol";
import { createFixture } from "./vscode-fixture.mjs";
import { startServer } from "../src/app/server.mjs";
import { ensureAgentHost } from "../src/app/remote-manager.mjs";
import { startAhpFacade } from "../src/app/ahp/facade.mjs";
import { localClient } from "../src/app/client.mjs";
import { loadTokens } from "../src/app/ahp/main.mjs";
import { CLIENT_API_VERSION } from "../src/app/client.mjs";

// The versions the installed VS Code desktop offers. Recorded so a change is
// visible in the receipt rather than discovered in an editor.
const EDITOR_OFFER = ["0.9.0", "0.7.0", "0.6.0", "0.5.2", "0.5.1"];
const repositoryRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const outIndex = argv.indexOf("--out");
const outFile =
  outIndex === -1
    ? path.join(repositoryRoot, "docs/evidence/vscode/tool-roundtrip.json")
    : argv[outIndex + 1];

const checks = [];
function check(name, condition, detail) {
  checks.push({
    name,
    passed: Boolean(condition),
    ...(detail ? { detail } : {}),
  });
  if (!condition) throw Error("Check failed: " + name + " — " + (detail || ""));
  return condition;
}
async function until(
  predicate,
  { timeoutMs = 20000, label = "condition" } = {},
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw Error("Timed out waiting for " + label);
    await delay(50);
  }
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const fixture = await createFixture({ name: "VS Code evidence fixture" });
const redact = (value) =>
  JSON.parse(
    JSON.stringify(value).replaceAll(fixture.root, "<disposable-fixture>"),
  );

let host, server, facade, client, transport;
const cleanup = async () => {
  try {
    await client?.shutdown();
  } catch {}
  try {
    await facade?.close();
  } catch {}
  try {
    server?.close();
  } catch {}
  if (host) {
    host.kill("SIGTERM");
    await new Promise((resolve) => host.once("exit", resolve));
  }
  if (!keep) fs.rmSync(fixture.root, { recursive: true, force: true });
};

try {
  // 1. A host that owns provider processes, separate from the web process.
  host = fork(
    path.join(repositoryRoot, "scripts/vscode-fixture-host.mjs"),
    [fixture.root],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const hostLog = fs.createWriteStream(path.join(fixture.root, "host.log"));
  host.stdout.pipe(hostLog);
  host.stderr.pipe(hostLog);
  const manifestPath = path.join(
    path.dirname(fixture.dbPath),
    "agent-host.json",
  );
  await until(() => fs.existsSync(manifestPath), { label: "the agent host" });
  const manager = await ensureAgentHost({
    dbPath: fixture.dbPath,
    manifestPath,
  });

  // 2. The workspace server, exactly as the website uses it.
  server = startServer({
    dbPath: fixture.dbPath,
    port: 0,
    projectionRoot: path.join(fixture.workspace, "plans"),
    sourceRoot: path.join(fixture.workspace, "plans"),
    manager,
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = "http://127.0.0.1:" + server.address().port;
  const { store, ops } = server.workspace;

  // 3. The facade: a client of that server, never a second writer.
  facade = startAhpFacade({
    store,
    client: localClient(ops),
    file: path.join(path.dirname(fixture.dbPath), "ahp.sqlite"),
    port: 0,
    pollIntervalMs: 50,
    workspaceEndpoint: endpoint,
    tokens: loadTokens(
      path.join(path.dirname(fixture.dbPath), "ahp-tokens.json"),
    ),
    manifestPath: path.join(path.dirname(fixture.dbPath), "ahp-facade.json"),
    models: async () => {
      const catalog = await ops.execute("models", { provider: "claude" });
      return [
        {
          provider: "claude",
          displayName: "AICommander claude",
          description: "Fixture provider; real child processes.",
          models: catalog.models.map((m) => ({
            id: m.id,
            provider: "claude",
            name: m.label || m.id,
          })),
          protectedResources: [],
        },
      ];
    },
  });
  await facade.listening;
  const editorToken = [...facade.grants.entries()].find(
    ([, grant]) => grant.name === "editor",
  )[0];

  // 4. Start the work the way a user does: through the shared operations.
  // A ready task, chosen from the workspace's own readiness rule rather than
  // assumed, so the example pack can change without breaking this.
  const ready = await ops.execute("query", { scope: "all", q: "ready:true" });
  const task = ready[0]?.id;
  check("the example pack offers a ready task", Boolean(task));
  const submitted = await ops.execute("intent.submit", {
    action: "run",
    prompt: "Run the authored fixture command and wait for its result.",
    submissionId: "evidence-1",
    provider: "claude",
    projectId: fixture.projectId,
    model: "fixture-fast",
    approvalMode: "manual",
    context: { selected: task },
  });
  const runId = submitted.run.id;
  await until(() => store.get("runs", runId)?.state === "waiting-approval", {
    label: "the provider's permission request",
  });

  // 5. Connect as an editor would, using the protocol library's own client.
  transport = await WebSocketTransport.connect(
    facade.url + "/?token=" + encodeURIComponent(editorToken),
  );
  client = new AhpClient(transport);
  client.connect();
  const initialized = await client.initialize({
    clientId: "evidence-client",
    protocolVersions: EDITOR_OFFER,
    clientInfo: { name: "aicommander-evidence", version: "1.0.0" },
  });
  check(
    "the facade negotiates a version the editor offered",
    EDITOR_OFFER.includes(initialized.protocolVersion),
    "selected " + initialized.protocolVersion,
  );

  // The protocol library's client does not wrap `listSessions`, so the
  // catalog is read from the facade that serves it. The wire method itself is
  // covered by the facade's own tests.
  const session = facade.projection
    .sessionSummaries()
    .find((item) => item._meta?.["aicommander.runId"] === runId);
  check("the owned session appears in the host catalog", Boolean(session));
  const chatChannel = session.defaultChat;
  const actions = [];
  const { result: subscribed, subscription } =
    await client.subscribe(chatChannel);
  (async () => {
    for await (const event of subscription)
      if (event.type === "action") actions.push(event.params);
  })().catch(() => {});

  // 6. The permission request, with the authored command visible.
  const pending = check(
    "the transcript shows a tool awaiting confirmation",
    toolCall(subscribed.snapshot.state),
  );
  check(
    "the tool call is keyed by the provider's own tool identifier",
    pending.toolCallId.startsWith("tool-"),
    pending.toolCallId,
  );
  check(
    "the confirmation shows the command that would run",
    JSON.stringify(pending.invocationMessage).includes("slow-command.mjs"),
  );
  check(
    "only the decisions this host can deliver are offered",
    JSON.stringify((pending.options || []).map((o) => o.id)) ===
      JSON.stringify(["allow-once", "deny"]),
  );
  const requestRecord = store
    .list("requests")
    .find((r) => r.runId === runId && r.state === "pending");

  // 7. Approve through the protocol.
  const approvedAt = new Date().toISOString();
  client.dispatch(chatChannel, {
    type: "chat/toolCallConfirmed",
    turnId: pending.turnId || currentTurn(subscribed.snapshot.state),
    toolCallId: pending.toolCallId,
    approved: true,
    confirmed: "user-action",
    selectedOptionId: "allow-once",
  });
  await until(
    () => store.get("requests", requestRecord.id)?.state === "allowed",
    { label: "the approval to reach the provider" },
  );

  // 8. A real process started and said so itself.
  const marker = await until(
    () => {
      const files = fs
        .readdirSync(fixture.markers)
        .filter((name) => name.endsWith(".started"));
      return files.length ? path.join(fixture.markers, files[0]) : null;
    },
    { label: "the fixture command to start" },
  );
  const started = JSON.parse(fs.readFileSync(marker, "utf8"));
  const prefix = marker.replace(/\.started$/, "");
  check(
    "the approved command really started",
    alive(started.pid),
    "pid " + started.pid,
  );
  check(
    "the transcript shows the tool running",
    toolCall(facade.projection.channelState(chatChannel))?.status === "running",
  );

  // 9. Cancel through the protocol.
  const cancelledAt = new Date().toISOString();
  client.dispatch(chatChannel, {
    type: "chat/turnCancelled",
    turnId: currentTurn(facade.projection.channelState(chatChannel)),
    duration: 0,
  });
  await until(() => !alive(started.pid), {
    label: "the actual process to stop",
  });
  check(
    "the actual process stopped",
    !alive(started.pid),
    "pid " + started.pid,
  );
  check(
    "the command did not reach its normal completion",
    !fs.existsSync(prefix + ".completed"),
  );
  check(
    "the command recorded the signal it received",
    fs.existsSync(prefix + ".interrupted"),
    fs.existsSync(prefix + ".interrupted")
      ? fs.readFileSync(prefix + ".interrupted", "utf8")
      : "absent",
  );

  // 10. The honest terminal record.
  const finished = await until(
    () => {
      const state = facade.projection.channelState(chatChannel);
      return state.turns.length ? state : null;
    },
    { label: "the turn to end" },
  );
  const turn = finished.turns.at(-1);
  const finalTool = turn.responseParts.find(
    (p) => p.kind === "toolCall",
  )?.toolCall;
  check("the turn is recorded as cancelled", turn.state === "cancelled");
  check(
    "a tool that ran is completed, not skipped",
    finalTool.status === "completed",
    "status " + finalTool.status,
  );
  check(
    "its result is unsuccessful rather than absent",
    finalTool.success === false,
  );
  check(
    "the result says it had started before it was stopped",
    /after it had started/.test(JSON.stringify(finalTool.pastTenseMessage)),
    JSON.stringify(finalTool.pastTenseMessage),
  );
  const run = store.get("runs", runId);
  check(
    "the run is interrupted, not failed",
    run.state === "interrupted",
    "state " + run.state,
  );
  check(
    "an intentional stop records no error",
    run.error === undefined,
    JSON.stringify(run.error),
  );
  check(
    "the provider's own diagnostic is preserved",
    Boolean(run.providerDiagnostic),
    run.providerDiagnostic,
  );
  check(
    "the cancellation is attributed to the client that asked",
    run.cancellation?.source === "client",
  );
  check(
    "the diagnostic is marked as observed during an intentional stop",
    turn.responseParts.some(
      (part) =>
        part.kind === "systemNotification" &&
        part._meta?.["aicommander.diagnosticDuringInterruption"],
    ),
  );

  // 11. A stale approval cannot be answered a second time.
  let staleRefusal = null;
  try {
    await ops.execute("run.answer", {
      id: requestRecord.id,
      decision: "allow",
    });
  } catch (error) {
    staleRefusal = { message: error.message, status: error.status };
  }
  check(
    "an answered request cannot be answered again",
    staleRefusal?.status === 409,
    staleRefusal?.message,
  );

  const receipt = {
    at: new Date().toISOString(),
    scope:
      "Disposable workspace, fixture provider running real child processes, loopback facade. No provider account, no personal workspace, no network.",
    applicationCommit: process.env.GIT_COMMIT || null,
    versions: {
      node: process.version,
      clientApi: CLIENT_API_VERSION,
      ahpPackage: "1.0.0",
      facadeProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      editorOffer: EDITOR_OFFER,
      negotiated: initialized.protocolVersion,
    },
    workspaceId: facade.projection.workspaceId,
    run: {
      id: runId,
      provider: run.provider,
      requestedModel: run.requestedModel,
      state: run.state,
      cancellation: run.cancellation,
      providerDiagnostic: run.providerDiagnostic,
      error: run.error ?? null,
    },
    request: {
      id: requestRecord.id,
      providerRequestId: requestRecord.providerRequestId,
      toolUseId: requestRecord.payload.toolUseId,
      offered: (requestRecord.options || []).map((o) => o.id),
      answeredThroughProtocol: true,
      approvedAt,
    },
    actualExecution: { pid: started.pid, at: started.at },
    cancellation: {
      dispatchedAt: cancelledAt,
      action: "chat/turnCancelled",
      channel: chatChannel,
      processStopped: true,
      signalRecordedByCommand: fs.existsSync(prefix + ".interrupted")
        ? fs.readFileSync(prefix + ".interrupted", "utf8")
        : null,
      normalCompletionMarker: fs.existsSync(prefix + ".completed"),
    },
    transcript: {
      turnState: turn.state,
      toolStatus: finalTool.status,
      toolSuccess: finalTool.success,
      toolPastTense: finalTool.pastTenseMessage,
    },
    staleApprovalRefusal: staleRefusal,
    protocolActionsObserved: actions.map((entry) => entry.action.type),
    checks,
    notEstablished: [
      "A human clicking the native approval and cancel controls. These messages were sent by the protocol's own client library, which is what the editor sends on the wire, but no click was exercised.",
      "How Claude or Codex classify an interrupted turn. That needs the opt-in real-provider run.",
      "Remote routing of this facade through a tunnel selection gateway.",
      "Any physical-phone behaviour.",
    ],
    sqliteIntegrity: store.db.prepare("PRAGMA integrity_check").get(),
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(redact(receipt), null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        receipt: outFile,
        checks: checks.length,
        passed: checks.filter((c) => c.passed).length,
        negotiated: initialized.protocolVersion,
        pid: started.pid,
        ...(keep ? { fixture: fixture.root } : {}),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Evidence run failed: " + error.message);
  console.error(JSON.stringify(checks, null, 2));
  process.exitCode = 1;
} finally {
  await cleanup();
}

function currentTurn(state) {
  return state?.activeTurn?.id;
}
function toolCall(state) {
  const part = state?.activeTurn?.responseParts.find(
    (entry) => entry.kind === "toolCall",
  );
  if (!part) return null;
  return { ...part.toolCall, turnId: state.activeTurn.id };
}
