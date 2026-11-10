#!/usr/bin/env node
// An agent host for the canned fixture, running a provider adapter that
// executes real processes instead of talking to Claude or Codex.
//
// Its purpose is evidence that needs no provider account: a native approval
// starts an actual child process with a recorded PID, and a native cancel
// stops that actual process. It uses the same interruption contract the real
// adapters use, so the cancellation and error classification under test is the
// production one, not a stand-in.
//
// This is not a substitute for real-provider acceptance. It cannot prove how
// Claude or Codex report a turn; it proves what this host does with a process
// it really started, and that the native controls reach it.
//
//   node scripts/vscode-fixture-host.mjs /path/to/fixture-root
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { startAgentHost } from "../src/app/agent-host.mjs";
import {
  requestInterruption,
  acknowledgeInterruption,
  classifyTurnEnd,
} from "../src/app/providers/cancellation.mjs";

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "fixture.json")))
  throw Error("Pass the fixture root printed by scripts/vscode-fixture.mjs.");
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
);

export const FIXTURE_CAPABILITIES = Object.freeze({
  steer: false,
  steerReason: "The fixture provider has no active-steering API.",
  queue: true,
  interrupt: true,
  resume: true,
  approvals: true,
  approvalOptions: ["allow-once", "deny"],
  models: true,
  liveModelChange: true,
  modelChangeApplies: "next-turn",
  subagents: false,
  toolOutput: "streamed",
});

const MODELS = [
  { id: "fixture-fast", label: "Fixture fast", description: "Deterministic." },
  { id: "fixture-slow", label: "Fixture slow", description: "Deterministic." },
];

class FixtureAdapter {
  constructor({ emit, onRequest }) {
    this.emit = emit;
    this.onRequest = onRequest;
    this.observations = 0;
    this.interruption = null;
    this.permissions = new Map();
    this.capabilities = FIXTURE_CAPABILITIES;
  }
  async start(options) {
    if (options.catalogOnly) return MODELS;
    this.options = options;
    this.model = options.model || MODELS[0].id;
    this.emit("session", {
      providerSessionId: "fixture-" + randomUUID().slice(0, 8),
      model: this.model,
    });
    this.emit("approvals.status", {
      effectiveApprovalMode: options.approvalMode,
      approvalNotice: "",
    });
    if (options.prompt) await this.send(options.prompt);
    return this;
  }
  // One turn: say what it intends to do, ask permission for the authored slow
  // command, and on approval actually run it.
  async send(text) {
    this.interruption = null;
    const turn = ++this.observations;
    this.emit("message.delta", {
      text: "Running the authored fixture command.",
      itemId: String(turn),
    });
    this.emit("message", { text: "Running the authored fixture command." });
    const marker = path.join(
      fixture.markers,
      "native-" + Date.now().toString(36),
    );
    const command =
      JSON.stringify(process.execPath) +
      " slow-command.mjs " +
      JSON.stringify(marker) +
      " 600";
    const toolUseId = "tool-" + randomUUID().slice(0, 8);
    const providerRequestId = randomUUID();
    this.pending = { toolUseId, marker, command, providerRequestId };
    this.emit("tool.started", { tool: "Bash", id: toolUseId });
    this.emit("tool.activity", {
      tool: "Bash",
      id: toolUseId,
      input: {
        command,
        description:
          "Authored fixture command. Writes a start marker with its real PID, then waits.",
      },
    });
    this.onRequest({
      providerRequestId,
      kind: "approval",
      method: "Bash",
      payload: {
        tool: "Bash",
        toolUseId,
        input: { command, timeout: 600000 },
      },
    });
    return { messageId: providerRequestId, delivery: "submitted" };
  }
  async answer({ providerRequestId, decision }) {
    const pending = this.pending;
    if (!pending || pending.providerRequestId !== providerRequestId)
      throw Error("This provider request is no longer pending.");
    this.observations++;
    if (decision !== "allow") {
      this.emit("tool.finished", {
        id: pending.toolUseId,
        isError: true,
        content: "Declined by the user; the command did not run.",
      });
      this.finish({ isError: false });
      return { accepted: true };
    }
    // Really run it. The child writes its own PID, so cancellation can be
    // checked against the process rather than inferred from the UI.
    const child = spawn(
      process.execPath,
      ["slow-command.mjs", pending.marker, "600"],
      { cwd: this.options.cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    this.child = child;
    child.stdout.on("data", (chunk) =>
      this.emit("tool.activity", {
        method: "item/commandExecution/outputDelta",
        itemId: pending.toolUseId,
        delta: chunk.toString(),
      }),
    );
    child.stderr.on("data", (chunk) =>
      this.emit("provider.log", { text: chunk.toString().slice(0, 4000) }),
    );
    child.on("exit", (code, signal) => {
      this.observations++;
      const stopped = Boolean(signal) || this.interruption;
      this.emit("tool.finished", {
        id: pending.toolUseId,
        isError: true,
        content:
          "Exited " +
          (signal ? "on " + signal : "with code " + code) +
          ". Completion marker " +
          (fs.existsSync(pending.marker + ".completed")
            ? "written"
            : "absent") +
          ".",
      });
      // The adapter reports an error result, exactly as Claude does for an
      // interrupted turn. Classification, not the error flag, decides the
      // run's state.
      this.finish({
        isError: true,
        diagnostic: "child exited " + (signal || code),
      });
    });
    return { accepted: true };
  }
  finish({ isError, diagnostic }) {
    const outcome = classifyTurnEnd({
      interruption: this.interruption,
      isError,
      diagnostic: diagnostic || null,
      observation: this.observations,
    });
    this.interruption = null;
    this.emit("turn.completed", outcome);
  }
  async interrupt(reason = "client-cancel") {
    this.interruption = requestInterruption(this.observations, reason);
    if (this.child && this.child.exitCode === null) this.child.kill("SIGTERM");
    acknowledgeInterruption(this.interruption, { api: "fixture SIGTERM" });
    return {
      requested: true,
      acknowledged: true,
      pid: this.child?.pid || null,
      requestedAt: this.interruption.requestedAt,
      acknowledgedAt: this.interruption.acknowledgedAt,
    };
  }
  async setApprovalMode(value) {
    this.options.approvalMode = value;
    return { applies: "session" };
  }
  async setModel(model) {
    this.model = model;
    return { applies: "next-turn", api: "fixture setModel", model };
  }
  async close() {
    if (this.child && this.child.exitCode === null) this.child.kill("SIGTERM");
  }
}

const server = startAgentHost({
  dbPath: fixture.dbPath,
  manifestPath: path.join(path.dirname(fixture.dbPath), "agent-host.json"),
  port: Number(process.env.FIXTURE_HOST_PORT || 0),
  factories: {
    claude: (options) => new FixtureAdapter(options),
    codex: (options) => new FixtureAdapter(options),
  },
});
server.on("listening", () =>
  console.log(
    JSON.stringify({
      fixtureHost: true,
      url: "http://127.0.0.1:" + server.address().port,
      markers: fixture.markers,
      note: "Fixture provider: real child processes, no provider account.",
    }),
  ),
);
const stop = async () => {
  await server.agentHost.manager.close();
  server.close(() => process.exit(0));
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
