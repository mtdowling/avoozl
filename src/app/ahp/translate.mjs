// Translation from AICommander's durable execution events to AHP actions.
//
// Rules this module exists to enforce:
//
//   * A tool call is keyed by the provider's own tool identifier. The
//     permission request identifier is a different identifier, correlated to
//     it, never confused with it.
//   * Whichever event arrives first creates the tool call, because providers
//     do not agree on whether the permission request or the tool item comes
//     first.
//   * A tool that actually executed is never left to become a skipped,
//     never-executed tool. Every non-terminal tool call is given a truthful
//     terminal result before the turn ends, because the protocol reducer
//     otherwise forces them to `cancelled`/`skipped`.
//   * Interruption, failure, disconnection, waiting for input, and waiting
//     for approval stay distinct, and a provider diagnostic recorded during
//     an intentional interruption is shown as such rather than as a failure.
import { ACTION_INTRODUCED_IN, compareProtocolVersions } from "@microsoft/agent-host-protocol";

// Session status bit flags (AHP `SessionStatus`).
export const STATUS = {
  idle: 1,
  error: 2,
  inProgress: 8,
  inputNeeded: 24,
  isRead: 32,
  isArchived: 64,
};

const ACTIVE_RUN_STATES = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

export function runStatus(run, { archived = false, read = false } = {}) {
  let status;
  if (run.state === "waiting-input" || run.state === "waiting-approval")
    status = STATUS.inputNeeded;
  else if (run.state === "starting" || run.state === "running")
    status = STATUS.inProgress;
  else if (run.state === "failed" || run.state === "disconnected")
    status = STATUS.error;
  else status = STATUS.idle;
  if (archived) status |= STATUS.isArchived;
  if (read) status |= STATUS.isRead;
  return status;
}

const DISPLAY_NAMES = {
  Bash: "Run in terminal",
  BashOutput: "Read terminal output",
  Read: "Read file",
  Write: "Write file",
  Edit: "Edit file",
  NotebookEdit: "Edit notebook",
  Glob: "Find files",
  Grep: "Search files",
  WebFetch: "Fetch web page",
  WebSearch: "Search the web",
  Task: "Delegate to subagent",
  TodoWrite: "Update task list",
  AskUserQuestion: "Ask the user",
  commandExecution: "Run in terminal",
  fileChange: "Change files",
  patchApply: "Apply patch",
  mcpToolCall: "Call MCP tool",
  webSearch: "Search the web",
  todoList: "Update task list",
  reasoning: "Reasoning",
};
export function displayName(name) {
  return DISPLAY_NAMES[name] || name || "Tool";
}

export function emptyCorrelation() {
  return {
    activeTurnId: null,
    providerTurns: {},
    epoch: 0,
    streamed: {},
    tools: {},
    requests: {},
    inputs: {},
    pendingApprovals: {},
    queued: {},
    background: {},
  };
}

function clamp(value, limit = 12000) {
  const text = typeof value === "string" ? value : JSON.stringify(value) || "";
  return text.length > limit
    ? text.slice(0, limit) + "\n… truncated (" + text.length + " characters)"
    : text;
}

function userMessage(text) {
  return { text: String(text ?? ""), origin: { kind: "user" } };
}

// ─── Translator ──────────────────────────────────────────────────────────────

export class Translator {
  // `emit(channel, action)` must apply the action to the channel state and
  // record it before returning, so later decisions in the same event see the
  // state the earlier actions produced.
  constructor({ emit, chatState, protocolVersion, uris, run, correlation, at }) {
    this.emitAction = emit;
    this.chatState = chatState;
    this.protocolVersion = protocolVersion;
    this.uris = uris;
    this.run = run;
    this.c = correlation;
    // Timing comes from the durable event's own timestamp, never the host
    // clock, so replaying the log rebuilds byte-identical state.
    this.at = at || new Date().toISOString();
  }
  // Actions introduced after the negotiated version must not be sent. Dropping
  // them silently is better than sending an action the client cannot reduce,
  // but a client never sees a feature advertised that it then cannot receive.
  supports(type) {
    const introduced = ACTION_INTRODUCED_IN[type];
    if (!introduced) return false;
    return compareProtocolVersions(this.protocolVersion, introduced) >= 0;
  }
  chat(action) {
    if (!this.supports(action.type)) return false;
    this.emitAction(this.uris.chat, action);
    return true;
  }
  session(action) {
    if (!this.supports(action.type)) return false;
    this.emitAction(this.uris.session, action);
    return true;
  }
  state() {
    return this.chatState();
  }
  activeTurn() {
    return this.state()?.activeTurn;
  }

  // ─── Turns ─────────────────────────────────────────────────────────────────

  startTurn(turnId, text, { queuedMessageId, origin } = {}) {
    const state = this.state();
    if (state?.activeTurn?.id === turnId) return turnId;
    if (state?.turns?.some((t) => t.id === turnId)) return turnId;
    // One turn at a time per chat. An unterminated previous turn means the
    // host lost track of its end; close it truthfully before starting another.
    if (state?.activeTurn)
      this.endTurn({
        state: "disconnected",
        reason:
          "A new turn started while this one was still open. The host did not observe its end.",
      });
    this.chat({
      type: "chat/turnStarted",
      turnId,
      startedAt: this.at,
      message: origin || userMessage(text),
      ...(queuedMessageId ? { queuedMessageId } : {}),
    });
    this.c.activeTurnId = turnId;
    this.c.epoch = 0;
    return turnId;
  }

  // Give every tool call that has not reached a terminal state a truthful
  // terminal transition. The protocol reducer would otherwise rewrite them all
  // as `cancelled`/`skipped`, which would claim a tool never ran when it did.
  terminateOpenTools(reason) {
    const turn = this.activeTurn();
    if (!turn) return;
    for (const part of turn.responseParts) {
      if (part.kind !== "toolCall") continue;
      const call = part.toolCall;
      if (call.status === "completed" || call.status === "cancelled") continue;
      const tracked = Object.values(this.c.tools).find(
        (t) => t.toolCallId === call.toolCallId,
      );
      const executed = Boolean(tracked?.executed);
      if (!executed) {
        // Never confirmed, so never executed. Recording it as denied/skipped
        // is accurate and does not imply work happened.
        this.chat({
          type: "chat/toolCallConfirmed",
          turnId: turn.id,
          toolCallId: call.toolCallId,
          approved: false,
          reason: "skipped",
          reasonMessage: reason.notExecuted,
        });
        if (tracked) tracked.status = "cancelled";
        continue;
      }
      // It did run. Complete it with an unsuccessful result instead of
      // cancelling it, so the transcript keeps the fact that it executed.
      this.chat({
        type: "chat/toolCallComplete",
        turnId: turn.id,
        toolCallId: call.toolCallId,
        result: {
          success: false,
          pastTenseMessage: reason.executed,
          ...(tracked?.content
            ? { content: [{ type: "text", text: clamp(tracked.content) }] }
            : {}),
          error: { message: reason.executed, code: reason.code },
        },
      });
      if (tracked) tracked.status = "completed";
    }
  }

  endTurn(outcome) {
    const turn = this.activeTurn();
    if (!turn) return;
    const turnId = turn.id;
    if (outcome.state === "interrupted")
      this.terminateOpenTools({
        notExecuted:
          "Cancelled before this tool was confirmed; it did not run.",
        executed:
          "Stopped by cancellation after it had started running. Any partial effects remain.",
        code: "interrupted",
      });
    else if (outcome.state === "failed")
      this.terminateOpenTools({
        notExecuted:
          "Not confirmed before the turn failed; this tool did not run.",
        executed: "Running when the turn failed. Its result is unknown.",
        code: "turn-failed",
      });
    else if (outcome.state === "disconnected")
      this.terminateOpenTools({
        notExecuted:
          "The session disconnected before this tool was confirmed; it did not run.",
        executed:
          "Running when the session disconnected. Its result is unknown until the session resumes.",
        code: "disconnected",
      });
    else
      this.terminateOpenTools({
        notExecuted:
          "The turn ended before this tool was confirmed; it did not run.",
        executed:
          "Started, but the provider reported no result before the turn ended.",
        code: "no-result",
      });
    for (const id of Object.keys(this.c.inputs)) this.clearInputNeeded(id);
    const started = Date.parse(turn.startedAt);
    const duration = Math.max(
      0,
      (Number.isFinite(started) ? Date.parse(this.at) - started : 0) || 0,
    );
    if (outcome.state === "interrupted") {
      // An intentional stop is a cancellation, not an error. The provider's
      // own wording is kept as a visible notification so a reader can see what
      // the provider said without the run being labelled a failure.
      if (outcome.providerDiagnostic)
        this.chat({
          type: "chat/responsePart",
          turnId,
          part: {
            kind: "systemNotification",
            content: {
              markdown:
                "Cancelled at your request. The provider additionally reported: `" +
                clamp(outcome.providerDiagnostic, 600) +
                "`",
            },
            _meta: {
              "aicommander.diagnosticDuringInterruption": true,
              "aicommander.cancellation": outcome.cancellation || null,
            },
          },
        });
      if (outcome.cancellation?.completionRace === "possible")
        this.chat({
          type: "chat/responsePart",
          turnId,
          part: {
            kind: "systemNotification",
            content: {
              markdown:
                "This provider reports no interruption status of its own, so the host cannot tell whether the turn finished just before your cancellation landed.",
            },
            _meta: { "aicommander.completionRace": "possible" },
          },
        });
      this.chat({ type: "chat/turnCancelled", turnId, duration });
    } else if (outcome.state === "failed" || outcome.state === "disconnected") {
      this.chat({
        type: "chat/error",
        turnId,
        duration,
        part: {
          kind: "error",
          error: {
            errorType:
              outcome.state === "disconnected"
                ? "SessionDisconnected"
                : "ProviderTurnFailed",
            message:
              outcome.reason ||
              outcome.error ||
              "The provider reported a failure.",
          },
          // Only a disconnection is resumable through an explicit resume; a
          // provider failure needs the user to decide what to do next.
          resumable: outcome.state === "disconnected",
        },
      });
    } else this.chat({ type: "chat/turnComplete", turnId, duration });
    this.c.activeTurnId = null;
    this.c.epoch = 0;
    this.c.streamed = {};
    this.chat({ type: "chat/activityChanged", activity: undefined });
  }

  // ─── Text and reasoning ────────────────────────────────────────────────────

  appendText(kind, { text, itemId, subagent }) {
    const turn = this.activeTurn();
    if (!turn || !text) return;
    const partId =
      (kind === "reasoning" ? "reasoning:" : "text:") +
      turn.id +
      ":" +
      this.c.epoch +
      ":" +
      (itemId ?? "0");
    if (!this.c.streamed[partId]) {
      this.chat({
        type: "chat/responsePart",
        turnId: turn.id,
        part: {
          kind: kind === "reasoning" ? "reasoning" : "markdown",
          id: partId,
          content: "",
        },
        ...(subagent ? { _meta: subagentMeta(subagent) } : {}),
      });
      this.c.streamed[partId] = 0;
    }
    this.chat({
      type: kind === "reasoning" ? "chat/reasoning" : "chat/delta",
      turnId: turn.id,
      partId,
      content: text,
      ...(subagent ? { _meta: subagentMeta(subagent) } : {}),
    });
    this.c.streamed[partId] += text.length;
    return partId;
  }

  // A completed message. If the same content already streamed, do not repeat
  // it; otherwise this is the only copy and must be added.
  completeMessage({ text, itemId, subagent }) {
    const turn = this.activeTurn();
    if (!turn || !text) return;
    const streamedHere = Object.entries(this.c.streamed).filter(
      ([id, length]) =>
        length > 0 &&
        id.startsWith("text:" + turn.id + ":" + this.c.epoch + ":"),
    );
    if (!streamedHere.length) this.appendText("markdown", { text, itemId, subagent });
    // Close the block so the next message starts fresh part identifiers.
    this.c.epoch += 1;
  }

  // ─── Tool calls ────────────────────────────────────────────────────────────

  tool(providerToolId) {
    return this.c.tools[providerToolId];
  }

  // Create the tool call if this is the first thing seen about it, regardless
  // of whether that was the provider's tool item or its permission request.
  ensureTool(
    providerToolId,
    { name, subagent, intention, contributor } = {},
  ) {
    const turn = this.activeTurn();
    if (!turn || !providerToolId) return null;
    let tracked = this.c.tools[providerToolId];
    if (tracked) {
      if (name && tracked.name !== name) {
        tracked.name = name;
        tracked.displayName = displayName(name);
      }
      return tracked;
    }
    tracked = {
      toolCallId: providerToolId,
      turnId: turn.id,
      name: name || "tool",
      displayName: displayName(name),
      status: "streaming",
      executed: false,
      confirmed: null,
      requestId: null,
      content: "",
      subagent: subagent || null,
      startedAt: this.at,
    };
    this.c.tools[providerToolId] = tracked;
    this.chat({
      type: "chat/toolCallStart",
      turnId: turn.id,
      toolCallId: providerToolId,
      toolName: tracked.name,
      displayName: tracked.displayName,
      ...(intention ? { intention } : {}),
      ...(contributor ? { contributor } : {}),
      ...(subagent ? { _meta: subagentMeta(subagent) } : {}),
    });
    return tracked;
  }

  readyTool(
    providerToolId,
    { invocationMessage, toolInput, confirmation, edits, intention },
  ) {
    const tracked = this.c.tools[providerToolId];
    if (!tracked) return;
    const turnId = tracked.turnId;
    if (invocationMessage) tracked.invocationMessage = invocationMessage;
    const action = {
      type: "chat/toolCallReady",
      turnId,
      toolCallId: providerToolId,
      invocationMessage:
        invocationMessage || tracked.invocationMessage || tracked.displayName,
      ...(toolInput ? { toolInput } : {}),
      ...(intention ? { intention } : {}),
      ...(edits ? { edits } : {}),
    };
    if (confirmation) {
      // Awaiting a real decision: offer only the options this host can deliver.
      action.confirmationTitle = confirmation.title;
      action.options = confirmation.options;
      if (confirmation.riskAssessment)
        action.riskAssessment = confirmation.riskAssessment;
      tracked.status = "pending-confirmation";
      tracked.requestId = confirmation.requestId;
      // A permission request supersedes any earlier assumption that this tool
      // needed none, so it has not executed until the decision is delivered.
      tracked.executed = false;
      tracked.confirmed = null;
    } else {
      // No permission was required, so the tool goes straight to running and
      // therefore really executes.
      action.confirmed = "not-needed";
      tracked.status = "running";
      tracked.executed = true;
      tracked.confirmed = "not-needed";
    }
    this.chat(action);
    if (confirmation) this.setToolConfirmationNeeded(tracked);
  }

  completeTool(providerToolId, result) {
    const tracked = this.c.tools[providerToolId];
    if (!tracked) return;
    if (tracked.status === "completed" || tracked.status === "cancelled") return;
    if (tracked.status === "pending-confirmation") {
      // A result for an unconfirmed tool means the provider resolved it
      // without our decision. Say so rather than inventing an approval.
      this.chat({
        type: "chat/toolCallConfirmed",
        turnId: tracked.turnId,
        toolCallId: providerToolId,
        approved: false,
        reason: "skipped",
        reasonMessage:
          "The provider resolved this tool call before a decision was delivered.",
      });
      tracked.status = "cancelled";
      this.clearToolConfirmationNeeded(tracked);
      return;
    }
    this.chat({
      type: "chat/toolCallComplete",
      turnId: tracked.turnId,
      toolCallId: providerToolId,
      result,
    });
    tracked.status = "completed";
    this.clearToolConfirmationNeeded(tracked);
    if (this.c.background[providerToolId]) {
      this.chat({
        type: "chat/backgroundWorkRemoved",
        id: "subagent:" + providerToolId,
      });
      delete this.c.background[providerToolId];
    }
  }

  // ─── Session-level attention ───────────────────────────────────────────────

  setToolConfirmationNeeded(tracked) {
    const turn = this.activeTurn();
    const part = turn?.responseParts.find(
      (p) => p.kind === "toolCall" && p.toolCall.toolCallId === tracked.toolCallId,
    );
    if (!part || part.toolCall.status !== "pending-confirmation") return;
    const id = "tool:" + tracked.toolCallId;
    this.session({
      type: "session/inputNeededSet",
      request: {
        id,
        kind: "toolConfirmation",
        chat: this.uris.chat,
        turnId: tracked.turnId,
        toolCall: part.toolCall,
      },
    });
    this.c.inputs[id] = { kind: "toolConfirmation" };
  }
  setChatInputNeeded(request) {
    const id = "input:" + request.id;
    this.session({
      type: "session/inputNeededSet",
      request: {
        id,
        kind: "chatInput",
        chat: this.uris.chat,
        request,
      },
    });
    this.c.inputs[id] = { kind: "chatInput" };
  }
  clearToolConfirmationNeeded(tracked) {
    this.clearInputNeeded("tool:" + tracked.toolCallId);
  }
  clearInputNeeded(id) {
    if (!this.c.inputs[id]) return;
    this.session({ type: "session/inputNeededRemoved", id });
    delete this.c.inputs[id];
  }
}

function subagentMeta(subagent) {
  // Attribution for work a delegating tool call performed, so nested output is
  // not presented as the main agent's own.
  return {
    "aicommander.subagent": { parentToolUseId: subagent },
  };
}

export function toolResultFromClaude({ isError, content, displayName: label }) {
  return {
    success: !isError,
    pastTenseMessage: isError ? (label || "Tool") + " failed" : (label || "Tool") + " finished",
    ...(content ? { content: [{ type: "text", text: clamp(content) }] } : {}),
    ...(isError
      ? { error: { message: clamp(content || "The tool reported an error.", 2000) } }
      : {}),
  };
}

export { clamp, userMessage };
