#!/usr/bin/env node
// Native clicked-control acceptance (VSC-05).
//
// This is the one check that cannot be automated: it needs a person to click
// Allow and then Cancel in the editor's own chat UI. The script does
// everything else — builds a disposable workspace, starts an agent host whose
// provider runs real child processes, serves the site and the editor facade,
// installs the packaged extension into an isolated profile, opens the editor,
// and starts a run that stops on a permission request.
//
// It then waits, printing what it is waiting for, and verifies three things
// that together mean a real native control did the work:
//
//   1. The approving and cancelling actions arrived from a connected editor
//      client, named in the facade's dispatch audit trail — not from this
//      script, which never dispatches anything.
//   2. An actual child process started, identified by the PID it wrote
//      itself, and then actually died.
//   3. The resulting records are honest: the tool is completed-unsuccessful
//      rather than skipped, and the run is interrupted rather than failed.
//
//   node scripts/vscode-native-check.mjs [--keep] [--timeout 600]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork, execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createFixture } from "./vscode-fixture.mjs";
import { startServer } from "../src/app/server.mjs";
import { ensureAgentHost } from "../src/app/remote-manager.mjs";
import { startAhpFacade } from "../src/app/ahp/facade.mjs";
import { agentProviderId } from "../src/app/ahp/projection.mjs";
import { localClient, CLIENT_API_VERSION } from "../src/app/client.mjs";
import { loadTokens } from "../src/app/ahp/main.mjs";

const repositoryRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
// A person has to click through this, so the default wait is generous. The
// editor is never touched before the wait ends: an earlier version killed it
// on timeout while the operator was still signing in, which looked exactly
// like a crash.
const timeoutSeconds = Number(argv[argv.indexOf("--timeout") + 1] || 1800);
// With --no-launch the operator opens the editor themselves; the script still
// prints the profile and the settings it prepared.
const launchEditor = !argv.includes("--no-launch");
// With --server DIR the browser editor from an extracted VS Code Server
// package is used, bridged so this facade becomes the editor's own agent host
// rather than an additional remote one. On the desktop application a remote
// host gets a session list but no chat editor, so there is nothing to click;
// the bridge is the shape that registers one.
const serverIndex = argv.indexOf("--server");
const serverRoot = serverIndex === -1 ? null : argv[serverIndex + 1];
const outFile = path.join(
  repositoryRoot,
  "docs/evidence/vscode/native-controls.json",
);

const say = (text) => process.stdout.write(text + "\n");
const step = (n, text) => say("  " + n + ". " + text);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const fixture = await createFixture({ name: "VS Code native check" });
const redact = (value) =>
  JSON.parse(
    JSON.stringify(value).replaceAll(fixture.root, "<disposable-fixture>"),
  );

let host, server, facade, editor;
const cleanup = async () => {
  if (editor)
    for (const pid of editorPids()) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
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
  if (!keep) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(editorRoot, { recursive: true, force: true });
  } else
    say(
      "\nFixture kept at " + fixture.root + "\nEditor profile at " + editorRoot,
    );
};
function editorPids() {
  try {
    return execFileSync("/bin/ps", ["-eo", "pid,args"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.includes(profile))
      .map((line) => Number(line.trim().split(/\s+/)[0]))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// The editor's IPC socket lives inside its user data directory, and a unix
// socket path cannot exceed 103 characters. The system temporary directory is
// already long enough on macOS to break that on its own, so the isolated
// profile gets a deliberately short root of its own.
const editorRoot = fs.mkdtempSync(
  path.join(fs.existsSync("/tmp") ? "/tmp" : os.tmpdir(), "aic-vsc-"),
);
const profile = path.join(editorRoot, "p");
const extensions = path.join(editorRoot, "x");

try {
  // ── Everything that does not need a person ───────────────────────────────
  host = fork(
    path.join(repositoryRoot, "scripts/vscode-fixture-host.mjs"),
    [fixture.root],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  const hostLog = fs.createWriteStream(path.join(fixture.root, "host.log"));
  host.stdout.pipe(hostLog);
  host.stderr.pipe(hostLog);
  const hostManifest = path.join(
    path.dirname(fixture.dbPath),
    "agent-host.json",
  );
  while (!fs.existsSync(hostManifest)) await delay(50);
  const manager = await ensureAgentHost({
    dbPath: fixture.dbPath,
    manifestPath: hostManifest,
  });

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

  const facadeManifest = path.join(
    path.dirname(fixture.dbPath),
    "ahp-facade.json",
  );
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
    manifestPath: facadeManifest,
    models: async () => {
      const catalog = await ops.execute("models", { provider: "claude" });
      return ["claude", "codex"].map((provider) => ({
        provider: agentProviderId(provider),
        displayName: "Avoozl " + provider,
        description: "Fixture provider; real child processes.",
        models: catalog.models.map((m) => ({
          id: m.id,
          provider: agentProviderId(provider),
          name: m.label || m.id,
        })),
        protectedResources: [],
      }));
    },
  });
  await facade.listening;
  const editorClient = JSON.parse(fs.readFileSync(facadeManifest, "utf8"))
    .clients.editor;

  // The packaged extension, in a profile of its own.
  execFileSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts/package-extension.mjs"),
      "--out",
      path.join(fixture.root, "build"),
    ],
    { stdio: "ignore" },
  );
  const vsix = fs
    .readdirSync(path.join(fixture.root, "build"))
    .find((name) => name.endsWith(".vsix"));
  fs.mkdirSync(extensions, { recursive: true });
  fs.mkdirSync(path.join(profile, "User"), { recursive: true });
  execFileSync("unzip", [
    "-q",
    path.join(fixture.root, "build", vsix),
    "-d",
    path.join(fixture.root, "unpacked"),
  ]);
  fs.renameSync(
    path.join(fixture.root, "unpacked", "extension"),
    path.join(extensions, "mtdowling.avoozl-0.1.0"),
  );
  fs.writeFileSync(
    path.join(profile, "User", "settings.json"),
    JSON.stringify(
      {
        "avoozl.endpoint": endpoint,
        "avoozl.facadeManifest": facadeManifest,
        "chat.remoteAgentHostsEnabled": true,
        "chat.remoteAgentHosts": [
          {
            address: editorClient.address,
            name: "Avoozl native check",
            connectionToken: editorClient.connectionToken,
          },
        ],
        "chat.remoteAgentHostsAutoConnect": true,
        // The sessions a host owns are listed in the Agent Sessions viewer,
        // which is off by default: an empty chat panel otherwise looks like a
        // host that advertised nothing.
        "chat.viewSessions.enabled": true,
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoUpdate": false,
        "workbench.startupEditor": "none",
      },
      null,
      2,
    ),
  );

  // A run that stops on a permission request for the authored slow command.
  const ready = await ops.execute("query", { scope: "all", q: "ready:true" });
  const submitted = await ops.execute("intent.submit", {
    action: "run",
    prompt:
      "Run the authored fixture command and wait for its result. Do not retry if it is cancelled.",
    submissionId: "native-check-1",
    title: "Native control check",
    provider: "claude",
    projectId: fixture.projectId,
    model: "fixture-fast",
    approvalMode: "manual",
    context: { selected: ready[0]?.id },
  });
  const runId = submitted.run.id;
  while (store.get("runs", runId)?.state !== "waiting-approval")
    await delay(50);
  const requestRecord = store
    .list("requests")
    .find((r) => r.runId === runId && r.state === "pending");
  const channels = facade.projection.resourcesFor(runId);

  // Launch the application binary rather than the `code` launcher. The
  // launcher asks macOS to open the app, which activates an already-running
  // instance and silently ignores a different --user-data-dir; starting the
  // binary gives this check a genuinely isolated editor even when another
  // VS Code window is open.
  const appBinary = (() => {
    const candidates = [
      "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
      "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders",
      path.join(
        os.homedir(),
        "Applications/Visual Studio Code.app/Contents/MacOS/Code",
      ),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || "code";
  })();
  if (serverRoot) {
    const binary = path.join(serverRoot, "bin", "code-server");
    if (!fs.existsSync(binary))
      throw Error(
        "No code-server at " +
          binary +
          ". Extract a VS Code Server package there first.",
      );
    const tokenFile = path.join(editorRoot, "connection-token");
    const browserToken = randomUUID();
    fs.writeFileSync(tokenFile, browserToken, { mode: 0o600 });
    // A fresh port per run, not a fixed one. The browser stores the
    // connection token against the origin, so reusing a port makes the next
    // run fail with "auth mismatch" against a stale cookie while still
    // showing the previous session's cached UI.
    const webPort = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
    say("");
    say("Starting the bridged browser editor. Its license terms are accepted");
    say("by this run, as agreed. It listens on loopback and requires the");
    say("connection token below.");
    editor = spawn(
      binary,
      [
        "--accept-server-license-terms",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--connection-token-file",
        tokenFile,
        "--server-data-dir",
        path.join(editorRoot, "s"),
        "--user-data-dir",
        profile,
        "--extensions-dir",
        extensions,
        // The facade becomes this editor's agent host, rather than an extra
        // remote one. That is the shape that registers a chat editor.
        "--agent-host-bridge-host",
        "127.0.0.1",
        "--agent-host-bridge-port",
        String(facade.port),
        "--agent-host-bridge-connection-token",
        editorClient.connectionToken,
        fixture.repository,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const serverLog = fs.createWriteStream(
      path.join(fixture.root, "server.log"),
    );
    editor.stdout.pipe(serverLog);
    editor.stderr.pipe(serverLog);
    editor.on("error", (error) =>
      say("  ! could not start the browser editor: " + error.message),
    );
    say("");
    say("Open this in a browser:");
    say(
      "  http://127.0.0.1:" +
        webPort +
        "/?tkn=" +
        browserToken +
        "&folder=" +
        encodeURIComponent(fixture.repository),
    );
  } else if (!launchEditor) {
    say("");
    say("Editor not launched (--no-launch). Open it yourself with:");
    say(
      "  " +
        JSON.stringify(appBinary) +
        " --user-data-dir " +
        profile +
        " --extensions-dir " +
        extensions +
        " --disable-workspace-trust " +
        fixture.repository,
    );
  }
  editor = editor
    ? editor
    : launchEditor
      ? spawn(
          appBinary,
          [
            "--user-data-dir",
            profile,
            "--extensions-dir",
            extensions,
            "--disable-workspace-trust",
            fixture.repository,
          ],
          { stdio: ["ignore", "pipe", "pipe"], detached: false },
        )
      : null;
  if (editor) {
    const editorLog = fs.createWriteStream(path.join(fixture.root, "code.log"));
    editor.stdout?.pipe(editorLog);
    editor.stderr?.pipe(editorLog);
    editor.on("error", (error) =>
      say("  ! could not launch the editor: " + error.message),
    );
  }

  say("");
  say("─".repeat(72));
  say("An isolated VS Code window is opening. Nothing outside this fixture is");
  say("touched, and your own profile and extensions are not used.");
  say("");
  say("VS Code may first ask you to sign in to GitHub. That is VS Code's own");
  say("gate on its chat UI, not something this facade asks for: the session");
  say("itself is a Claude or Codex session owned by Avoozl. The profile");
  say(
    "is a throwaway, and this script will not touch the window for " +
      Math.round(timeoutSeconds / 60) +
      " minutes.",
  );
  say("");
  say("Please click, in this order:");
  step(1, "Open the Agents or Chat view and pick the conversation named");
  say('     "' + (store.get("runs", runId).title || runId) + '".');
  say("     The Avoozl sidebar also lists it under Conversations, where");
  say('     "Open This Task\'s Conversation" will try the native command.');
  step(2, 'The agent is asking to run a command. Click "Allow once".');
  step(3, "Wait until its output shows FIXTURE_SLOW_COMMAND_STARTED.");
  step(4, "Click the chat's Cancel or Stop control.");
  say("");
  say("This script dispatches nothing. It is watching the facade's audit");
  say("trail, the real process, and the durable records.");
  say("─".repeat(72));
  say("");

  const deadline = Date.now() + timeoutSeconds * 1000;
  const waitUntil = async (label, predicate) => {
    let announced = false;
    for (;;) {
      const value = await predicate();
      if (value) {
        say("  ✓ " + label);
        return value;
      }
      if (!announced) {
        say("  … waiting: " + label);
        announced = true;
      }
      if (Date.now() > deadline) throw Error("Timed out waiting for: " + label);
      await delay(250);
    }
  };

  const nativeClients = () =>
    facade
      .dispatches({ limit: 500 })
      .filter((entry) => entry.accepted && entry.clientId);

  await waitUntil("an editor connects to the facade", () => {
    const launchLog = path.join(fixture.root, "code.log");
    const text = fs.existsSync(launchLog)
      ? fs.readFileSync(launchLog, "utf8")
      : "";
    if (/is longer than 103 chars|EINVAL/.test(text))
      throw Error(
        "The editor could not create its IPC socket. Its profile path is too long: " +
          profile,
      );
    return [...facade.clients.values()].some((c) => c.ready);
  });
  await waitUntil("the editor opens this conversation's transcript", () =>
    [...facade.clients.values()].some((c) => c.subs.has(channels.chat)),
  );
  const approval = await waitUntil(
    "the approval is confirmed from the editor",
    () =>
      nativeClients().find(
        (entry) =>
          entry.action === "chat/toolCallConfirmed" &&
          entry.channel === channels.chat,
      ),
  );
  await waitUntil("the provider records the decision", () => {
    const current = store.get("requests", requestRecord.id);
    return current && current.state !== "pending" ? current : null;
  });
  const answered = store.get("requests", requestRecord.id);
  if (answered.state !== "allowed")
    throw Error(
      "The request was " +
        answered.state +
        ". This check needs Allow once, so the command actually runs.",
    );
  const marker = await waitUntil(
    "an actual process starts and writes its PID",
    () => {
      const found = fs
        .readdirSync(fixture.markers)
        .filter((name) => name.endsWith(".started"));
      return found.length ? path.join(fixture.markers, found[0]) : null;
    },
  );
  const started = JSON.parse(fs.readFileSync(marker, "utf8"));
  const prefix = marker.replace(/\.started$/, "");
  if (!alive(started.pid))
    throw Error("The started process was gone before cancellation.");
  say("    process " + started.pid + " is running");

  const cancellation = await waitUntil(
    "the turn is cancelled from the editor",
    () =>
      nativeClients().find(
        (entry) =>
          entry.action === "chat/turnCancelled" &&
          entry.channel === channels.chat &&
          Date.parse(entry.at) >= Date.parse(approval.at),
      ),
  );
  await waitUntil("that actual process stops", () => !alive(started.pid));
  await waitUntil("the turn reaches a terminal state", () => {
    const state = facade.projection.channelState(channels.chat);
    return state?.turns.length ? state : null;
  });

  // ── Verify the records, not just the UI ──────────────────────────────────
  const checks = [];
  const check = (name, condition, detail) => {
    checks.push({
      name,
      passed: Boolean(condition),
      ...(detail ? { detail } : {}),
    });
    return condition;
  };
  const chat = facade.projection.channelState(channels.chat);
  const turn = chat.turns.at(-1);
  const tool = turn.responseParts.find((p) => p.kind === "toolCall")?.toolCall;
  const run = store.get("runs", runId);
  const connectedNames = facade
    .dispatches({ limit: 500 })
    .filter((entry) => entry.accepted)
    .map((entry) => entry.clientName);

  check(
    "the approval came from a connected editor client",
    Boolean(approval.clientId),
    "client " +
      approval.clientId +
      " (" +
      (approval.clientName || "unnamed") +
      ")",
  );
  check(
    "the cancellation came from the same editor client",
    cancellation.clientId === approval.clientId,
    cancellation.clientId,
  );
  check("the approval was recorded as allowed", answered.state === "allowed");
  check(
    "an actual process ran",
    Number.isInteger(started.pid),
    "pid " + started.pid,
  );
  check("that actual process stopped", !alive(started.pid));
  check(
    "the command did not reach normal completion",
    !fs.existsSync(prefix + ".completed"),
  );
  check(
    "the command recorded the signal it received",
    fs.existsSync(prefix + ".interrupted"),
    fs.existsSync(prefix + ".interrupted")
      ? fs.readFileSync(prefix + ".interrupted", "utf8")
      : "absent",
  );
  check("the turn is cancelled", turn.state === "cancelled");
  check(
    "a tool that ran is completed, not skipped",
    tool?.status === "completed",
    "status " + tool?.status,
  );
  check("its result is unsuccessful", tool?.success === false);
  check(
    "the result says it had started before it was stopped",
    /after it had started/.test(JSON.stringify(tool?.pastTenseMessage)),
    JSON.stringify(tool?.pastTenseMessage),
  );
  check(
    "the run is interrupted, not failed",
    run.state === "interrupted",
    "state " + run.state,
  );
  check("an intentional stop records no error", run.error === undefined);
  check(
    "the provider's diagnostic is preserved separately",
    Boolean(run.providerDiagnostic),
    run.providerDiagnostic,
  );

  const receipt = {
    at: new Date().toISOString(),
    acceptance: "VSC-05 native clicked controls",
    scope:
      "Isolated VS Code profile and extensions directory, disposable workspace, fixture provider running real child processes, loopback facade. No personal profile, no provider account.",
    operator:
      "A person clicked Allow once and then Cancel in the editor's own chat UI. This script dispatched no protocol action.",
    editor: (() => {
      try {
        const lines = execFileSync("code", ["--version"], {
          encoding: "utf8",
        }).split("\n");
        return { version: lines[0], commit: lines[1] };
      } catch {
        return null;
      }
    })(),
    versions: { node: process.version, clientApi: CLIENT_API_VERSION },
    nativeDispatches: [approval, cancellation].map((entry) => ({
      at: entry.at,
      action: entry.action,
      clientName: entry.clientName,
      grant: entry.grant,
      accepted: entry.accepted,
    })),
    observedClientNames: [...new Set(connectedNames)].filter(Boolean),
    run: {
      provider: run.provider,
      requestedModel: run.requestedModel,
      state: run.state,
      error: run.error ?? null,
      providerDiagnostic: run.providerDiagnostic ?? null,
      cancellation: run.cancellation ?? null,
    },
    request: {
      providerRequestId: requestRecord.providerRequestId,
      toolUseId: requestRecord.payload.toolUseId,
      offered: (requestRecord.options || []).map((o) => o.id),
      state: answered.state,
      answeredBy: answered.answeredBy ?? null,
      optionId: answered.optionId ?? null,
    },
    actualExecution: { pid: started.pid, at: started.at },
    processOutcome: {
      stopped: !alive(started.pid),
      signalRecordedByCommand: fs.existsSync(prefix + ".interrupted")
        ? fs.readFileSync(prefix + ".interrupted", "utf8")
        : null,
      normalCompletionMarker: fs.existsSync(prefix + ".completed"),
    },
    transcript: {
      turnState: turn.state,
      toolStatus: tool?.status,
      toolSuccess: tool?.success,
      toolPastTense: tool?.pastTenseMessage,
    },
    checks,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(redact(receipt), null, 2) + "\n");
  const failed = checks.filter((entry) => !entry.passed);
  say("");
  for (const entry of checks)
    say(
      (entry.passed ? "  ✓ " : "  ✗ ") +
        entry.name +
        (entry.detail ? " — " + entry.detail : ""),
    );
  say("");
  say(
    failed.length
      ? failed.length + " check(s) failed. Receipt: " + outFile
      : "All " + checks.length + " checks passed. Receipt: " + outFile,
  );
  if (failed.length) process.exitCode = 1;
} catch (error) {
  say("");
  say("Native check did not complete: " + error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
