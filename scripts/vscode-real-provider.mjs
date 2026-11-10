#!/usr/bin/env node
// Opt-in real-provider acceptance.
//
// The interruption contract in src/app/providers/cancellation.mjs was written
// without relying on any provider's diagnostic text, precisely so it would not
// depend on one observation. This check tests it against the real thing: it
// starts an actual Claude and/or Codex session, lets the provider ask
// permission to run the authored fixture command, approves it, confirms a real
// child process started, interrupts, and then records how that provider
// classified the turn.
//
// It uses the production adapters, the production run manager, and the real
// agent host. The only fixture is the repository and the harmless command.
//
// This costs provider quota. It is opt in:
//
//   RUN_REAL_PROVIDER=1 node scripts/vscode-real-provider.mjs [--providers claude,codex]
//
// Each Claude query is bounded to a $0.50 list-price budget and 12 turns. That
// is a bound on this script's own request, not a promise about how your
// subscription is billed. Set CLAUDE_MODEL / CODEX_MODEL to choose models your
// accounts can actually use, and CODEX_COMMAND if the Codex CLI is not on PATH.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createFixture } from "./vscode-fixture.mjs";
import { startAgentHost } from "../src/app/agent-host.mjs";
import { Store } from "../src/app/store.mjs";
import { CodexAdapter } from "../src/app/providers/codex.mjs";
import { ClaudeAdapter } from "../src/app/providers/claude.mjs";
import { startAhpFacade } from "../src/app/ahp/facade.mjs";
import { localClient, CLIENT_API_VERSION } from "../src/app/client.mjs";

// Imported up front: the adapter uses the object `query` returns immediately,
// so the factory cannot be async.
const { query: claudeQuery } = await import("@anthropic-ai/claude-agent-sdk");

if (process.env.RUN_REAL_PROVIDER !== "1") {
  console.error(
    "This starts real provider sessions and uses your account quota.\n" +
      "Opt in explicitly:\n\n" +
      "  RUN_REAL_PROVIDER=1 node scripts/vscode-real-provider.mjs\n",
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const providers = (argv[argv.indexOf("--providers") + 1] || "claude,codex")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => ["claude", "codex"].includes(name));
const perProviderSeconds = Number(argv[argv.indexOf("--seconds") + 1] || 300);
const repositoryRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outFile = path.join(
  repositoryRoot,
  "docs/evidence/vscode/real-providers.json",
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

const fixture = await createFixture({ name: "Real provider check" });
const redact = (value) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll(fixture.root, "<disposable-fixture>")
      .replaceAll(process.env.HOME || "\0none\0", "<home>"),
  );

// A prompt tight enough that the provider's only authorized action is the
// authored command, and explicit that it must not retry after a cancellation.
const promptFor = (provider, marker) =>
  [
    "This is a small, controlled permission and cancellation check.",
    "You are authorized to run exactly one command and then wait for its result.",
    "Do not inspect files, call any MCP tool, edit code, create plans, or commit.",
    "",
    "Run exactly this command:",
    "",
    process.execPath + " slow-command.mjs " + marker + " 600",
    "",
    provider === "codex"
      ? "Use exec_command with sandbox_permissions=require_escalated so the command asks for approval, and yield_time_ms=1000."
      : "Use the Bash tool and request permission normally. Set timeout=240000 and do not use run_in_background.",
    "If the command is cancelled or denied, do not retry it and do not run anything else.",
    "If it finishes on its own, reply exactly FIXTURE_FINISHED.",
  ].join("\n");

let server, facade, store;
const cleanup = async () => {
  try {
    await facade?.close();
  } catch {}
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      setTimeout(resolve, 8000);
    });
    // The agent host closes the store from its own close handler. Give that a
    // moment rather than closing it here and racing the handler.
    await delay(500);
  }
  if (!keep) fs.rmSync(fixture.root, { recursive: true, force: true });
  else say("\nFixture kept at " + fixture.root);
};

const results = {};
try {
  // The production host, with the production adapters. Claude's query is
  // wrapped only to add a spend bound.
  server = startAgentHost({
    dbPath: fixture.dbPath,
    manifestPath: path.join(path.dirname(fixture.dbPath), "agent-host.json"),
    port: 0,
    factories: {
      codex: (options) =>
        new CodexAdapter({
          ...options,
          command: process.env.CODEX_COMMAND || "codex",
        }),
      claude: (options) =>
        new ClaudeAdapter({
          ...options,
          // Wrapped only to bound what this check can spend.
          query: (args) =>
            claudeQuery({
              ...args,
              options: { ...args.options, maxBudgetUsd: 0.5, maxTurns: 12 },
            }),
        }),
    },
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const { store: hostStore, ops, manager } = server.agentHost;
  store = hostStore;

  // The facade too, so the receipt can show the projected transcript for a
  // real provider's tool identifiers rather than only the run record.
  facade = startAhpFacade({
    store,
    client: localClient(ops),
    file: path.join(path.dirname(fixture.dbPath), "ahp.sqlite"),
    port: 0,
    pollIntervalMs: 50,
    tokens: { "real-provider-check": { name: "editor", scope: "full" } },
    models: async () => [],
  });
  await facade.listening;

  const ready = await ops.execute("query", { scope: "all", q: "ready:true" });
  let taskIndex = 0;

  for (const provider of providers) {
    const marker = path.join(fixture.markers, "real-" + provider);
    const runId = "run-real-" + provider;
    const record = { provider, steps: [], checks: [] };
    const check = (name, condition, detail) => {
      record.checks.push({
        name,
        passed: Boolean(condition),
        ...(detail !== undefined ? { detail } : {}),
      });
      return condition;
    };
    const note = (text) => {
      record.steps.push({ at: new Date().toISOString(), text });
      say("  " + provider + ": " + text);
    };
    try {
      const catalog = await ops.execute("models", { provider });
      // No model unless the operator names one. A catalog entry is not a
      // promise that the backend will serve it: Codex advertised a default its
      // own endpoint then answered 404 for, so letting each provider choose is
      // both more honest and more likely to work.
      const model =
        provider === "claude"
          ? process.env.CLAUDE_MODEL
          : process.env.CODEX_MODEL;
      record.model = model || "provider default";
      record.catalogSize = catalog.models.length;
      record.catalogDefault =
        catalog.models.find((m) => m.isDefault)?.id || null;
      note(
        "catalog has " +
          catalog.models.length +
          " model(s); using " +
          record.model,
      );

      const task = ready[taskIndex++]?.id || ready[0]?.id;
      await ops.execute("run.start", {
        id: runId,
        taskId: task,
        projectId: fixture.projectId,
        provider,
        ...(model ? { model } : {}),
        mode: "implement",
        approvalMode: "manual",
        title: provider + " interruption check",
        prompt: promptFor(provider, marker),
      });
      note("session started");

      const deadline = Date.now() + perProviderSeconds * 1000;
      const waitFor = async (label, predicate) => {
        for (;;) {
          const value = await predicate();
          if (value) return value;
          if (Date.now() > deadline)
            throw Error("timed out waiting for " + label);
          await delay(250);
        }
      };

      const request = await waitFor(
        "the provider to ask permission",
        () =>
          store
            .list("requests")
            .find((r) => r.runId === runId && r.state === "pending") || null,
      );
      record.request = {
        providerRequestId: String(request.providerRequestId),
        kind: request.kind,
        method: request.method,
        toolUseId: request.payload?.toolUseId ?? null,
        itemId: request.payload?.itemId ?? null,
        providerOptions: request.providerOptions ?? null,
      };
      check(
        "the provider asked permission before running anything",
        request.kind === "approval",
        request.method,
      );
      note("permission requested: " + request.method);

      await ops.execute("run.answer", { id: request.id, decision: "allow" });
      note("approved");

      const started = await waitFor("the command to start", () =>
        fs.existsSync(marker + ".started")
          ? JSON.parse(fs.readFileSync(marker + ".started", "utf8"))
          : null,
      );
      record.actualExecution = started;
      check(
        "an actual process started",
        alive(started.pid),
        "pid " + started.pid,
      );
      note("process " + started.pid + " running");

      const acknowledgement = await ops.execute("run.interrupt", {
        id: runId,
        reason: "real-provider-check",
      });
      record.interrupt = acknowledgement;
      note("interrupt acknowledged");

      // Whether the provider's interruption reaches a command it already
      // spawned is the thing under test, not an assumption. Give it a bounded
      // window and record what actually happened either way.
      const stopWindowEnds = Date.now() + 20000;
      while (alive(started.pid) && Date.now() < stopWindowEnds)
        await delay(250);
      record.spawnedWorkStopped = !alive(started.pid);
      note(
        record.spawnedWorkStopped
          ? "the spawned process stopped"
          : "the spawned process is STILL RUNNING after the interrupt",
      );
      const terminal = await waitFor("a terminal turn state", () => {
        const run = store.get("runs", runId);
        return ["completed", "interrupted", "failed", "disconnected"].includes(
          run?.state,
        )
          ? run
          : null;
      });

      record.run = {
        state: terminal.state,
        error: terminal.error ?? null,
        providerDiagnostic: terminal.providerDiagnostic ?? null,
        cancellation: terminal.cancellation ?? null,
        requestedModel: terminal.requestedModel ?? null,
        actualModel: terminal.actualModel ?? null,
        providerSessionId: terminal.providerSessionId ? "<redacted>" : null,
      };
      record.processOutcome = {
        stopped: !alive(started.pid),
        signalRecordedByCommand: fs.existsSync(marker + ".interrupted")
          ? fs.readFileSync(marker + ".interrupted", "utf8")
          : null,
        normalCompletionMarker: fs.existsSync(marker + ".completed"),
      };

      check(
        "the command did not reach normal completion",
        !fs.existsSync(marker + ".completed"),
      );
      // Not a pass/fail: what this provider's interruption actually reaches.
      record.observedInterruptionScope = record.spawnedWorkStopped
        ? "turn and spawned command"
        : "turn only; the spawned command kept running";
      check(
        "the host reports honestly what the interruption reached",
        (terminal.cancellation?.spawnedWork === "stopped") ===
          record.spawnedWorkStopped ||
          terminal.cancellation?.spawnedWork === "unknown",
        "declared " +
          String(terminal.cancellation?.spawnedWork) +
          ", observed " +
          (record.spawnedWorkStopped ? "stopped" : "keeps-running"),
      );
      // The point of the whole contract.
      check(
        "the run is interrupted, not failed",
        terminal.state === "interrupted",
        "state " + terminal.state,
      );
      check(
        "an intentional stop records no error",
        terminal.error === undefined || terminal.error === null,
        terminal.error ?? null,
      );
      check(
        "the cancellation is attributed",
        Boolean(terminal.cancellation?.source),
        terminal.cancellation?.source,
      );
      if (provider === "codex")
        check(
          "Codex reports the interruption itself",
          terminal.cancellation?.source === "provider",
          terminal.cancellation?.source,
        );
      if (provider === "claude")
        check(
          "Claude's error result is classified as a stop, with its diagnostic kept",
          terminal.cancellation?.source === "client" && terminal.error == null,
          terminal.providerDiagnostic ?? "no diagnostic reported",
        );

      // The projected transcript, keyed by the provider's real tool ID.
      facade.pump();
      const channels = facade.projection.resourcesFor(runId);
      const chat = facade.projection.channelState(channels.chat);
      const turn = chat?.turns.at(-1);
      const tool = turn?.responseParts.find(
        (p) => p.kind === "toolCall",
      )?.toolCall;
      record.transcript = {
        turnState: turn?.state ?? null,
        toolCallId: tool?.toolCallId ? "<provider-tool-id>" : null,
        toolStatus: tool?.status ?? null,
        toolSuccess: tool?.success ?? null,
        toolPastTense: tool?.pastTenseMessage ?? null,
      };
      check(
        "the turn is cancelled in the transcript",
        turn?.state === "cancelled",
        turn?.state,
      );
      check(
        "a tool that ran is completed, not skipped",
        tool?.status === "completed",
        tool?.status,
      );
    } catch (error) {
      record.error = error.message;
      say("  " + provider + ": did not complete — " + error.message);
      const run = store.get("runs", runId);
      if (run)
        record.run = {
          state: run.state,
          error: run.error ?? null,
          providerDiagnostic: run.providerDiagnostic ?? null,
          cancellation: run.cancellation ?? null,
        };
      // A run that failed for the provider's own reasons still tests half the
      // contract: a real failure must stay a failure. Record that rather than
      // discarding the run as merely incomplete.
      if (run?.state === "failed") {
        record.negativePath = true;
        check(
          "a genuine provider failure is recorded as failed",
          run.state === "failed",
          run.state,
        );
        check(
          "the provider's own message is preserved",
          Boolean(run.error),
          String(run.error || "").slice(0, 160),
        );
        check(
          "no cancellation is attributed to a failure nobody requested",
          !run.cancellation,
          JSON.stringify(run.cancellation ?? null),
        );
        check(
          "a failure carries no interruption diagnostic",
          run.providerDiagnostic == null,
          JSON.stringify(run.providerDiagnostic ?? null),
        );
      }
      record.providerLog = store
        .events({ runId })
        .filter((event) =>
          [
            "provider.error",
            "provider.log",
            "disconnected",
            "run.failed",
          ].includes(event.kind),
        )
        .slice(-4)
        .map((event) => ({
          kind: event.kind,
          text: String(event.message || event.text || "").slice(0, 400),
        }));
    } finally {
      try {
        await manager.interrupt(runId).catch(() => {});
      } catch {}
      // Never leave a fixture process behind, even when the provider's own
      // interruption does not reach it.
      for (const name of fs.existsSync(fixture.markers)
        ? fs.readdirSync(fixture.markers)
        : [])
        if (name.endsWith(".started"))
          try {
            const { pid } = JSON.parse(
              fs.readFileSync(path.join(fixture.markers, name), "utf8"),
            );
            if (alive(pid)) process.kill(pid, "SIGTERM");
          } catch {}
      results[provider] = record;
    }
  }

  const receipt = {
    at: new Date().toISOString(),
    acceptance: "Opt-in real-provider interruption classification",
    scope:
      "Disposable workspace and Git repository, one authored harmless command, real provider sessions on the operator's own accounts. Claude bounded to a $0.50 list-price budget and 12 turns.",
    method:
      "Production adapters and run manager. The approval was delivered through the shared operations, not by clicking a native control: this check is about how each provider classifies an interrupted turn, not about the editor UI.",
    versions: { node: process.version, clientApi: CLIENT_API_VERSION },
    providers: results,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(redact(receipt), null, 2) + "\n");
  say("");
  for (const [provider, record] of Object.entries(results)) {
    const failed = record.checks.filter((entry) => !entry.passed);
    say(
      provider +
        ": " +
        (record.error
          ? "incomplete — " + record.error
          : failed.length
            ? failed.length + " of " + record.checks.length + " checks failed"
            : "all " + record.checks.length + " checks passed"),
    );
    for (const entry of record.checks)
      say(
        (entry.passed ? "  ✓ " : "  ✗ ") +
          entry.name +
          (entry.detail !== undefined && entry.detail !== null
            ? " — " + entry.detail
            : ""),
      );
  }
  say("\nReceipt: " + outFile);
  if (
    Object.values(results).some(
      (record) => record.error || record.checks.some((entry) => !entry.passed),
    )
  )
    process.exitCode = 1;
} catch (error) {
  say("Real-provider check failed to set up: " + error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
