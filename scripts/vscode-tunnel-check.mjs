#!/usr/bin/env node
// Authenticated remote route (VSC-07), and the host-side capture for the
// physical-phone checklist (VSC-08).
//
// What this sets up:
//
//   * A disposable workspace, a fixture agent host running real child
//     processes, the workspace server, and the loopback agent host facade.
//   * A VS Code tunnel over Microsoft's relay, authenticated with your GitHub
//     identity through a device login you complete yourself.
//   * Machine-scoped settings inside the tunnel's own server directory, so the
//     remote editor is told where the facade is. The facade itself stays on
//     loopback: the remote extension host runs on this machine, so it reaches
//     127.0.0.1 without anything being published.
//
// What it then records, from the host side only:
//
//   * Which clients actually connected to the facade, what they negotiated,
//     and which channels they subscribed to.
//   * Which dispatches arrived, from which client, and whether each was
//     accepted.
//   * Whether a real child process started and stopped.
//
// It cannot tell a phone from a laptop: in a tunnel the browser talks to the
// VS Code server, and the server's chat talks to the facade, so the facade
// sees one client either way. Device-specific claims therefore come from the
// operator's own checklist answers, recorded as such.
//
// Opening a tunnel makes the fixture repository reachable through Microsoft's
// relay to whoever holds your GitHub identity, for as long as the tunnel runs.
// It is removed when this script exits.
//
//   node scripts/vscode-tunnel-check.mjs [--keep] [--minutes 30]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createFixture } from "./vscode-fixture.mjs";
import { startServer } from "../src/app/server.mjs";
import { ensureAgentHost } from "../src/app/remote-manager.mjs";
import { startAhpFacade } from "../src/app/ahp/facade.mjs";
import { agentProviderId } from "../src/app/ahp/projection.mjs";
import { localClient, CLIENT_API_VERSION } from "../src/app/client.mjs";
import { loadTokens } from "../src/app/ahp/main.mjs";
import { fork } from "node:child_process";

const repositoryRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const minutes = Number(argv[argv.indexOf("--minutes") + 1] || 45);
const outFile = path.join(
  repositoryRoot,
  "docs/evidence/vscode/remote-route.json",
);
const say = (text) => process.stdout.write(text + "\n");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const fixture = await createFixture({ name: "Remote route check" });
// Short, because a tunnel's server directory also holds unix sockets.
const tunnelRoot = fs.mkdtempSync(
  path.join(fs.existsSync("/tmp") ? "/tmp" : os.tmpdir(), "aic-tun-"),
);
const redact = (value) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll(fixture.root, "<disposable-fixture>")
      .replaceAll(tunnelRoot, "<tunnel-root>")
      .replaceAll(process.env.HOME || "\0none\0", "<home>"),
  );

let host, server, facade, tunnel, tunnelName;
const cleanup = async () => {
  if (tunnel) {
    say("\nRemoving the tunnel…");
    tunnel.kill("SIGTERM");
    await new Promise((resolve) => {
      tunnel.once("exit", resolve);
      setTimeout(resolve, 10000);
    });
    try {
      execFileSync(
        "code",
        ["tunnel", "unregister", "--cli-data-dir", tunnelRoot],
        { stdio: "ignore", timeout: 30000 },
      );
      say("Tunnel unregistered.");
    } catch {
      say("Could not unregister automatically. Run:\n  code tunnel unregister");
    }
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
    fs.rmSync(tunnelRoot, { recursive: true, force: true });
  } else
    say("\nFixture kept at " + fixture.root + "\nTunnel data at " + tunnelRoot);
};

try {
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

  // The extension, into the tunnel server's own extensions directory.
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
  const serverData = path.join(tunnelRoot, "s");
  const serverExtensions = path.join(serverData, "extensions");
  const machineSettings = path.join(serverData, "data", "Machine");
  fs.mkdirSync(serverExtensions, { recursive: true });
  fs.mkdirSync(machineSettings, { recursive: true });
  execFileSync("unzip", [
    "-q",
    path.join(fixture.root, "build", vsix),
    "-d",
    path.join(fixture.root, "unpacked"),
  ]);
  fs.cpSync(
    path.join(fixture.root, "unpacked", "extension"),
    path.join(serverExtensions, "mtdowling.avoozl-0.1.0"),
    { recursive: true },
  );
  // Machine-scoped, because that is where a remote server reads settings that
  // describe the machine it runs on — including where the facade listens.
  fs.writeFileSync(
    path.join(machineSettings, "settings.json"),
    JSON.stringify(
      {
        "avoozl.endpoint": endpoint,
        "avoozl.facadeManifest": facadeManifest,
        "chat.remoteAgentHostsEnabled": true,
        "chat.remoteAgentHosts": [
          {
            address: editorClient.address,
            name: "Avoozl remote check",
            connectionToken: editorClient.connectionToken,
          },
        ],
        "chat.remoteAgentHostsAutoConnect": true,
        // The sessions a host owns are listed in the Agent Sessions viewer,
        // which is off by default: an empty chat panel otherwise looks like a
        // host that advertised nothing.
        "chat.viewSessions.enabled": true,
        "telemetry.telemetryLevel": "off",
      },
      null,
      2,
    ),
  );

  // Work for the remote client to find: a run stopped on a permission request.
  const ready = await ops.execute("query", { scope: "all", q: "ready:true" });
  const submitted = await ops.execute("intent.submit", {
    action: "run",
    prompt:
      "Run the authored fixture command and wait for its result. Do not retry if it is cancelled.",
    submissionId: "remote-check-1",
    title: "Remote route check",
    provider: "claude",
    projectId: fixture.projectId,
    model: "fixture-fast",
    approvalMode: "manual",
    context: { selected: ready[0]?.id },
  });
  const runId = submitted.run.id;
  while (store.get("runs", runId)?.state !== "waiting-approval")
    await delay(50);
  const channels = facade.projection.resourcesFor(runId);

  say("");
  say("─".repeat(72));
  say("About to open a VS Code tunnel.");
  say("");
  say("What becomes reachable: the disposable fixture repository at");
  say("  " + fixture.repository);
  say("through Microsoft's relay, to whoever holds your GitHub identity,");
  say("for as long as this script runs. The agent host facade is NOT");
  say("published — it stays on loopback, and the remote extension host");
  say("reaches it from this same machine.");
  say("");
  say("Nothing of yours outside that directory is shared. The tunnel is");
  say("unregistered when this script exits.");
  say("─".repeat(72));
  // Consent is an explicit flag: this runs unattended while the operator
  // works in a browser, so there is no prompt for them to answer.
  if (!argv.includes("--yes"))
    throw Error(
      "Opening a tunnel publishes the fixture repository through Microsoft's relay. Pass --yes to confirm.",
    );

  tunnelName = "avoozl-check-" + Math.random().toString(36).slice(2, 8);
  const tunnelLog = path.join(fixture.root, "tunnel.log");
  const tunnelStream = fs.createWriteStream(tunnelLog);
  tunnel = spawn(
    "code",
    [
      "tunnel",
      "--accept-server-license-terms",
      "--name",
      tunnelName,
      "--cli-data-dir",
      tunnelRoot,
      "--server-data-dir",
      serverData,
      "--extensions-dir",
      serverExtensions,
    ],
    { cwd: fixture.repository, stdio: ["ignore", "pipe", "pipe"] },
  );
  tunnel.stdout.pipe(tunnelStream);
  tunnel.stderr.pipe(tunnelStream);
  let relayed = false;
  const relay = (chunk) => {
    const text = chunk.toString();
    if (!relayed && /device|code\s+[A-Z0-9]{4}-[A-Z0-9]{4}/i.test(text)) {
      relayed = true;
      say("\n>>> GitHub device login required:");
    }
    if (
      /github\.com\/login\/device|code\s+[A-Z0-9]{4}-[A-Z0-9]{4}|Open this link|https:\/\/vscode\.dev/i.test(
        text,
      )
    )
      process.stdout.write(text);
  };
  tunnel.stdout.on("data", relay);
  tunnel.stderr.on("data", relay);

  const deadline = Date.now() + minutes * 60 * 1000;
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
      await delay(500);
    }
  };

  const tunnelUrl = await waitUntil("the tunnel to report its URL", () => {
    const text = fs.existsSync(tunnelLog)
      ? fs.readFileSync(tunnelLog, "utf8")
      : "";
    const match = text.match(/https:\/\/vscode\.dev\/tunnel\/\S+/);
    return match ? match[0].replace(/[.,]$/, "") : null;
  });
  say("");
  say("Tunnel URL: " + tunnelUrl);
  say("");
  say("On a desktop browser first, then on your phone off this network:");
  say("  1. Open that URL and sign in if asked.");
  say("  2. Open the Avoozl view: plans and tasks should load.");
  say('  3. Open the conversation "Remote route check" and see whether the');
  say("     chat lists it at all. This is the part the research could not do.");
  say("  4. If it is there, click Allow once, wait for the command to start,");
  say("     then click Cancel.");
  say("");
  say("I am recording, from this machine only, which clients connect to the");
  say("facade and what they do. Press Enter here when you are finished, or");
  say("after you have established that something is not possible.");
  say("");

  const observed = {
    clients: [],
    dispatches: [],
    extensionReached: false,
    chatSubscribed: false,
    processStarted: null,
    processStopped: null,
  };
  const watcher = setInterval(() => {
    for (const connection of facade.clients.values())
      if (connection.ready) {
        const entry = {
          clientId: connection.clientId,
          clientName: connection.clientInfo?.name || null,
          protocolVersion: connection.protocolVersion,
          grant: connection.grant.name,
          subscriptions: [...connection.subs],
          firstSeen: connection.connectedAt,
        };
        const existing = observed.clients.find(
          (c) => c.clientId === entry.clientId,
        );
        if (existing) existing.subscriptions = entry.subscriptions;
        else observed.clients.push(entry);
        if (connection.subs.has(channels.chat)) observed.chatSubscribed = true;
      }
    observed.dispatches = facade.dispatches({ limit: 200 });
    const started = fs
      .readdirSync(fixture.markers)
      .filter((name) => name.endsWith(".started"));
    if (started.length && !observed.processStarted) {
      observed.processStarted = JSON.parse(
        fs.readFileSync(path.join(fixture.markers, started[0]), "utf8"),
      );
      say(
        "  ✓ an actual process started (pid " +
          observed.processStarted.pid +
          ")",
      );
    }
    if (observed.processStarted && !alive(observed.processStarted.pid))
      observed.processStopped = true;
  }, 1000);

  // Ends when the operator writes the sentinel, or when the window closes.
  const sentinel = path.join(fixture.root, "done");
  say("When you are finished, run:  touch " + sentinel);
  say("Otherwise this stops on its own in " + minutes + " minutes.");
  while (Date.now() < deadline && !fs.existsSync(sentinel)) await delay(1000);
  clearInterval(watcher);

  // What the host cannot see is recorded separately from the operator's
  // own answers, so this receipt never implies the host observed a device
  // it has no way to observe.
  const answers = {
    pending: "merge the operator's answers before publishing",
  };

  const receipt = {
    at: new Date().toISOString(),
    acceptance:
      "Authenticated remote route (VSC-07) and physical-phone checklist (VSC-08)",
    scope:
      "Disposable workspace and Git repository, fixture provider running real child processes, loopback facade, a temporary VS Code tunnel over Microsoft's relay authenticated by the operator's GitHub device login. The tunnel was unregistered afterwards.",
    method:
      "The facade was never published. Machine-scoped settings inside the tunnel's own server directory told the remote editor where it listens on loopback. Everything below marked observed was recorded on the host; everything marked reported comes from the operator, because a facade cannot tell a phone from a laptop in a tunnel.",
    versions: { node: process.version, clientApi: CLIENT_API_VERSION },
    tunnel: { url: tunnelUrl, name: tunnelName },
    observed: {
      facadeClients: observed.clients,
      dispatches: observed.dispatches,
      chatChannelSubscribed: observed.chatSubscribed,
      actualExecution: observed.processStarted,
      processStopped: observed.processStopped,
      normalCompletionMarker: fs
        .readdirSync(fixture.markers)
        .some((name) => name.endsWith(".completed")),
      runState: store.get("runs", runId)?.state ?? null,
      runError: store.get("runs", runId)?.error ?? null,
      runCancellation: store.get("runs", runId)?.cancellation ?? null,
    },
    reported: answers,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(redact(receipt), null, 2) + "\n");
  say("");
  say("Observed on this machine:");
  say(
    "  facade clients: " +
      (observed.clients.length
        ? observed.clients
            .map((c) => (c.clientName || "unnamed") + " @" + c.protocolVersion)
            .join(", ")
        : "none"),
  );
  say("  chat channel subscribed: " + observed.chatSubscribed);
  say(
    "  accepted dispatches: " +
      observed.dispatches.filter((d) => d.accepted).length,
  );
  say("  process started: " + Boolean(observed.processStarted));
  say("  process stopped: " + Boolean(observed.processStopped));
  say("  run state: " + (store.get("runs", runId)?.state ?? "unknown"));
  say("\nReceipt: " + outFile);
} catch (error) {
  say("\nRemote route check did not complete: " + error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
