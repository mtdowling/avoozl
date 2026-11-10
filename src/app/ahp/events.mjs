// Maps each Avoozl execution event onto AHP actions through `Translator`.
//
// Every branch here is about the provider event vocabulary. The invariants
// (tool identity, honest terminal results, distinct states) live in
// `translate.mjs`.
import {
  Translator,
  clamp,
  userMessage,
  toolResultFromClaude,
} from "./translate.mjs";

export const INITIAL_TURN = (runId) => "initial:" + runId;
// A client dispatches `chat/turnStarted` with its own turn identifier and the
// facade derives the delivery's submission identifier from it. Reusing that
// identifier here means the turn the client optimistically rendered is the
// same turn the durable transcript records.
export const AHP_SUBMISSION_PREFIX = "ahp:";
export const clientId = (deliveryId) =>
  deliveryId.startsWith(AHP_SUBMISSION_PREFIX)
    ? deliveryId.slice(AHP_SUBMISSION_PREFIX.length)
    : null;
export const DELIVERY_TURN = (deliveryId) =>
  clientId(deliveryId) || "message:" + deliveryId;
// Pending-message identity follows the same rule, so a client that queued a
// message sees its own identifier removed when the host consumes it.
export const PENDING_ID = (deliveryId) => clientId(deliveryId) || deliveryId;

// Codex item types that behave like tool calls in a transcript.
const CODEX_TOOL_ITEMS = new Set([
  "commandExecution",
  "fileChange",
  "patchApply",
  "mcpToolCall",
  "webSearch",
  "todoList",
  "localShellCall",
]);

export function applyEvent(event, context) {
  const t = new Translator(context);
  const run = context.run;
  switch (event.kind) {
    case "run.created":
      if (run.prompt?.trim())
        t.startTurn(INITIAL_TURN(run.id), run.prompt.trim());
      break;

    case "session":
      t.session({ type: "session/ready" });
      break;

    case "state":
      if (event.turnId) {
        const existing = t.c.providerTurns[event.turnId];
        if (!existing) {
          // The provider started a turn the host did not initiate (for
          // example after a resume). Open one rather than attaching its
          // output to an unrelated turn.
          const turnId = t.c.activeTurnId || "provider:" + event.turnId;
          if (!t.c.activeTurnId)
            t.startTurn(turnId, "", {
              origin: {
                text: "Continued by the provider.",
                origin: { kind: "systemNotification" },
              },
            });
          t.c.providerTurns[event.turnId] = turnId;
        }
      }
      if (event.state === "running")
        t.chat({ type: "chat/activityChanged", activity: "Working" });
      break;

    case "message.delta":
      t.appendText("markdown", event);
      break;
    case "reasoning.delta":
      t.appendText("reasoning", event);
      break;
    case "message":
      t.completeMessage(event);
      break;

    case "tool.started": {
      const tracked = t.ensureTool(event.id, {
        name: event.tool,
        subagent: event.subagent,
      });
      if (tracked && event.tool === "Task") {
        // A delegating tool call runs a subagent. Advertise it as background
        // work so nested activity is attributable while it runs.
        if (
          t.chat({
            type: "chat/backgroundWorkSet",
            work: {
              kind: "subagent",
              id: "subagent:" + event.id,
              label: "Subagent via " + tracked.displayName,
              startedAt: tracked.startedAt,
              _meta: { "avoozl.parentToolUseId": event.id },
            },
          })
        )
          t.c.background[event.id] = true;
      }
      break;
    }

    case "tool.activity":
      if (event.method) codexToolActivity(t, event);
      else claudeToolActivity(t, event);
      break;

    case "tool.finished": {
      const result = toolResultFromClaude({
        isError: event.isError,
        content: event.content,
        displayName: t.tool(event.id)?.displayName,
      });
      // A tool that ends while a stop is pending ended because it was asked
      // to. Say that rather than reporting a bare failure, and keep the
      // provider's own output and wording in the result.
      if (t.c.interruptRequestedAt && !result.success)
        t.completeTool(event.id, {
          ...result,
          pastTenseMessage:
            "Stopped by cancellation after it had started running. Any partial effects remain.",
          error: {
            message: result.error?.message || "Stopped by cancellation.",
            code: "interrupted",
          },
        });
      else t.completeTool(event.id, result);
      break;
    }

    case "request.created":
      requestCreated(t, event.request);
      break;

    case "request.answered":
      requestAnswered(t, event.request);
      break;

    case "request.interrupted": {
      const providerToolId =
        t.c.requests[event.providerRequestId] || event.toolUseId;
      const tracked = providerToolId ? t.tool(providerToolId) : null;
      if (tracked && tracked.status === "pending-confirmation") {
        t.chat({
          type: "chat/toolCallConfirmed",
          turnId: tracked.turnId,
          toolCallId: tracked.toolCallId,
          approved: false,
          reason: "skipped",
          reasonMessage:
            event.reason === "cancelled-before-acquisition"
              ? "Cancelled before the decision reached the provider. The tool did not run."
              : "The provider withdrew this request before a decision was delivered. The tool did not run.",
        });
        tracked.status = "cancelled";
        tracked.executed = false;
        t.clearToolConfirmationNeeded(tracked);
      }
      for (const [id, info] of Object.entries(t.c.inputs))
        if (id === "input:" + requestIdOf(t, event.providerRequestId))
          t.clearInputNeeded(id);
      break;
    }

    case "turn.completed":
      t.endTurn(event);
      t.c.interruptRequestedAt = null;
      break;

    case "usage": {
      const turn = t.activeTurn();
      if (turn)
        t.chat({
          type: "chat/usage",
          turnId: turn.id,
          usage: usageInfo(event, run),
        });
      break;
    }

    case "delivery.queued": {
      const delivery = event.delivery;
      const kind = delivery.mode === "steer" ? "steering" : "queued";
      t.chat({
        type: "chat/pendingMessageSet",
        kind,
        id: PENDING_ID(delivery.id),
        message: userMessage(delivery.text),
      });
      t.c.queued[delivery.id] = { kind };
      break;
    }

    case "delivery.updated": {
      const delivery = event.delivery,
        known = t.c.queued[delivery.id],
        kind =
          known?.kind || (delivery.mode === "steer" ? "steering" : "queued");
      if (["accepted", "submitted"].includes(delivery.state)) {
        t.chat({
          type: "chat/pendingMessageRemoved",
          kind,
          id: PENDING_ID(delivery.id),
        });
        delete t.c.queued[delivery.id];
        if (delivery.mode === "steer") {
          // Steering joins the turn already running; it does not start one.
          const turn = t.activeTurn();
          if (turn)
            t.chat({
              type: "chat/responsePart",
              turnId: turn.id,
              part: {
                kind: "systemNotification",
                content: { markdown: "Steered: " + clamp(delivery.text, 400) },
                _meta: { "avoozl.deliveryId": delivery.id },
              },
            });
        } else
          t.startTurn(DELIVERY_TURN(delivery.id), delivery.text, {
            queuedMessageId: delivery.id,
          });
      } else if (delivery.state === "cancelled") {
        t.chat({
          type: "chat/pendingMessageRemoved",
          kind,
          id: PENDING_ID(delivery.id),
        });
        delete t.c.queued[delivery.id];
      } else if (delivery.state === "awaiting-resume")
        t.chat({
          type: "chat/activityChanged",
          activity: "Disconnected — resume to deliver queued messages",
        });
      else if (delivery.state === "uncertain") {
        // The message may or may not have reached the provider. Keep it
        // pending and say so instead of guessing.
        const turn = t.activeTurn();
        if (turn)
          t.chat({
            type: "chat/responsePart",
            turnId: turn.id,
            part: {
              kind: "systemNotification",
              content: {
                markdown:
                  "Delivery of a follow-up is uncertain and was not resent automatically: " +
                  clamp(delivery.error || "no detail", 300),
              },
              _meta: { "avoozl.deliveryId": delivery.id },
            },
          });
      }
      break;
    }

    case "approvals.changed":
      t.session({
        type: "session/configChanged",
        config: context.sessionConfig().values,
      });
      break;

    case "model.changed":
      t.session({
        type: "session/configChanged",
        config: context.sessionConfig().values,
      });
      if (t.activeTurn())
        t.chat({
          type: "chat/responsePart",
          turnId: t.activeTurn().id,
          part: {
            kind: "systemNotification",
            content: {
              markdown:
                "Model change requested: `" +
                event.requested +
                "` (applies " +
                (event.applies || "next turn") +
                "). Last model the provider reported: `" +
                (event.actual || "unknown") +
                "`.",
            },
            _meta: { "avoozl.modelChange": event },
          },
        });
      break;

    case "interrupt.requested":
      // Taken from the ordered event log, not from the run record: by the
      // time an event is folded the record may already have moved on, and a
      // replay must reach the same conclusion.
      t.c.interruptRequestedAt = event.at;
      t.chat({
        type: "chat/activityChanged",
        activity: "Stopping at your request",
      });
      break;

    case "disconnected":
      t.endTurn({ state: "disconnected", reason: event.message });
      break;

    case "run.recovered":
      // Pending approvals were invalidated by the restart. The turn cannot be
      // silently continued; it needs an explicit resume.
      t.endTurn({
        state: "disconnected",
        reason:
          event.message ||
          "The agent host restarted. Resume explicitly; pending prompts were not resent.",
      });
      for (const tracked of Object.values(t.c.tools))
        if (tracked.status === "pending-confirmation")
          tracked.status = "cancelled";
      t.c.requests = {};
      break;

    case "run.failed":
      t.endTurn({ state: "failed", reason: event.message });
      break;

    case "provider.error":
      // A provider error is not automatically a turn failure. Surface it
      // without ending the turn the provider still considers active.
      if (t.activeTurn())
        t.chat({
          type: "chat/responsePart",
          turnId: t.activeTurn().id,
          part: {
            kind: "systemNotification",
            content: {
              markdown: "Provider error: " + clamp(event.message || "", 600),
            },
            _meta: { "avoozl.providerError": true },
          },
        });
      break;

    case "validation.started":
    case "validation.result":
    case "integration.ready":
    case "integration.started":
    case "integration.completed":
      t.session({
        type: "session/metaChanged",
        _meta: context.sessionMeta(),
      });
      break;

    default:
      break;
  }
  return t.c;
}

function requestIdOf(t, providerRequestId) {
  for (const [requestId, info] of Object.entries(t.c.requests))
    if (info === providerRequestId) return requestId;
  return null;
}

function usageInfo(event, run) {
  const main = event.mainLoopUsage || event.usage || {};
  return {
    inputTokens:
      main.input_tokens ?? main.inputTokens ?? event.inputTokens ?? undefined,
    outputTokens:
      main.output_tokens ??
      main.outputTokens ??
      event.outputTokens ??
      undefined,
    cacheReadTokens:
      main.cache_read_input_tokens ?? main.cachedInputTokens ?? undefined,
    model: event.model || run.actualModel || run.model || undefined,
    _meta: {
      ...(event.totalCostUsd !== undefined
        ? { "avoozl.totalCostUsd": event.totalCostUsd }
        : {}),
      ...(event.providerDurationMs !== undefined
        ? { "avoozl.providerDurationMs": event.providerDurationMs }
        : {}),
    },
  };
}

// ─── Permission and question requests ────────────────────────────────────────

function requestCreated(t, request) {
  if (!request) return;
  if (request.kind === "input") {
    t.c.requests[request.id] = request.providerRequestId;
    const normalized = normalizeQuestions(request);
    t.chat({ type: "chat/inputRequested", request: normalized });
    t.setChatInputNeeded(normalized);
    return;
  }
  // An approval always belongs to a provider tool. Correlate by the provider's
  // own tool identifier; the request identifier is kept separately.
  const providerToolId =
    request.payload?.toolUseId ||
    request.payload?.itemId ||
    "request-tool:" + request.id;
  t.c.requests[request.id] = request.providerRequestId;
  const tracked = t.ensureTool(providerToolId, {
    name: toolNameFor(request),
    subagent: request.payload?.parentToolUseId || null,
  });
  if (!tracked) return;
  tracked.requestId = request.id;
  t.readyTool(providerToolId, {
    invocationMessage: { markdown: invocationFor(request) },
    toolInput: clamp(
      JSON.stringify(request.payload?.input ?? request.payload, null, 2),
    ),
    confirmation: {
      requestId: request.id,
      title: confirmationTitleFor(request),
      options: (request.options || []).map((option, index) => ({
        ...option,
        group: index,
      })),
    },
  });
  if (request.providerOptions?.length)
    t.chat({
      type: "chat/responsePart",
      turnId: tracked.turnId,
      part: {
        kind: "systemNotification",
        content: {
          markdown:
            "This provider also offers `" +
            request.providerOptions.join("`, `") +
            "`. This host delivers only allow once and deny; other permission scopes are not wired yet.",
        },
        _meta: { "avoozl.providerOptions": request.providerOptions },
      },
    });
}

function requestAnswered(t, request) {
  if (!request) return;
  if (request.kind === "input") {
    t.chat({
      type: "chat/inputCompleted",
      requestId: request.id,
      response: request.state === "allowed" ? "accept" : "decline",
      ...(request.answers ? { answers: toInputAnswers(request.answers) } : {}),
    });
    t.clearInputNeeded("input:" + request.id);
    return;
  }
  const providerToolId =
    request.payload?.toolUseId ||
    request.payload?.itemId ||
    "request-tool:" + request.id;
  const tracked = t.tool(providerToolId);
  if (!tracked) return;
  const approved = request.state === "allowed";
  t.chat(
    approved
      ? {
          type: "chat/toolCallConfirmed",
          turnId: tracked.turnId,
          toolCallId: providerToolId,
          approved: true,
          confirmed: "user-action",
          ...(request.optionId ? { selectedOptionId: request.optionId } : {}),
        }
      : {
          type: "chat/toolCallConfirmed",
          turnId: tracked.turnId,
          toolCallId: providerToolId,
          approved: false,
          reason: "denied",
          reasonMessage: "Declined.",
          ...(request.optionId ? { selectedOptionId: request.optionId } : {}),
        },
  );
  tracked.status = approved ? "running" : "cancelled";
  // Approval is the point at which the tool really begins to execute.
  tracked.executed = approved;
  tracked.confirmed = approved ? "user-action" : null;
  t.clearToolConfirmationNeeded(tracked);
}

function toolNameFor(request) {
  if (request.payload?.tool) return request.payload.tool;
  if (request.payload?.kind === "command") return "commandExecution";
  return request.method || "tool";
}

function confirmationTitleFor(request) {
  const name = toolNameFor(request);
  if (name === "commandExecution" || name === "Bash") return "Run in terminal";
  if (["Write", "Edit", "NotebookEdit"].includes(name)) return "Write file";
  return "Allow " + name;
}

function invocationFor(request) {
  const payload = request.payload || {};
  if (payload.command)
    return (
      "Run in `" +
      (payload.cwd || "the worktree") +
      "`:\n\n```sh\n" +
      clamp(payload.command, 2000) +
      "\n```" +
      (payload.reason ? "\n\n" + clamp(payload.reason, 600) : "")
    );
  if (payload.input?.command)
    return (
      "Run:\n\n```sh\n" +
      clamp(payload.input.command, 2000) +
      "\n```" +
      (payload.input.description
        ? "\n\n" + clamp(payload.input.description, 600)
        : "")
    );
  if (payload.input?.file_path)
    return (
      "`" + toolNameFor(request) + "` on `" + payload.input.file_path + "`"
    );
  return (
    "`" +
    toolNameFor(request) +
    "`\n\n```json\n" +
    clamp(JSON.stringify(payload.input ?? payload, null, 2), 2000) +
    "\n```"
  );
}

export function normalizeQuestions(request) {
  const payload = request.payload || {},
    raw =
      payload.input?.questions ||
      payload.questions ||
      payload.requestedSchema?.questions ||
      [];
  const questions = raw.map((question, index) => {
    const id =
      question.id || question.header || question.question || String(index);
    const options = question.options || question.choices;
    if (Array.isArray(options) && options.length)
      return {
        id,
        title: question.header || question.title || "Question",
        message: question.question || question.message || question.header || "",
        required: question.required !== false,
        kind: question.multiSelect ? "multi-select" : "single-select",
        options: options.map((option) => ({
          id: option.label ?? option.id ?? String(option),
          label: option.label ?? option.id ?? String(option),
          ...(option.description ? { description: option.description } : {}),
        })),
        allowFreeformInput: true,
      };
    return {
      id,
      title: question.header || question.title || "Question",
      message: question.question || question.message || "",
      required: question.required !== false,
      kind: "text",
    };
  });
  return {
    id: request.id,
    message:
      payload.message ||
      payload.input?.message ||
      (request.method === "AskUserQuestion"
        ? "The agent is asking a question."
        : "The provider is requesting input."),
    ...(questions.length ? { questions } : {}),
  };
}

// Answers recorded on the workspace request are provider-shaped; echo them in
// protocol shape so every client converges on the same transcript.
function toInputAnswers(answers) {
  const result = {};
  for (const [key, value] of Object.entries(answers || {})) {
    const inner = Array.isArray(value?.answers) ? value.answers[0] : value;
    result[key] = {
      state: "submitted",
      value:
        typeof inner === "boolean"
          ? { kind: "boolean", value: inner }
          : typeof inner === "number"
            ? { kind: "number", value: inner }
            : { kind: "text", value: String(inner ?? "") },
    };
  }
  return result;
}

// ─── Provider-specific tool activity ─────────────────────────────────────────

function claudeToolActivity(t, event) {
  const tracked = t.ensureTool(event.id, {
    name: event.tool,
    subagent: event.subagent,
  });
  if (!tracked) return;
  // A pending permission request owns the confirmation. Without one, the tool
  // is already allowed and therefore really executes.
  const pending = tracked.status === "pending-confirmation";
  if (pending) return;
  t.readyTool(event.id, {
    invocationMessage: { markdown: claudeInvocation(event) },
    toolInput: clamp(JSON.stringify(event.input ?? {}, null, 2)),
  });
}

function claudeInvocation(event) {
  const input = event.input || {};
  if (input.command)
    return (
      "```sh\n" +
      clamp(input.command, 2000) +
      "\n```" +
      (input.description ? "\n\n" + clamp(input.description, 400) : "")
    );
  if (input.file_path)
    return "`" + event.tool + "` on `" + input.file_path + "`";
  if (input.pattern)
    return "`" + event.tool + "` for `" + clamp(input.pattern, 200) + "`";
  if (input.prompt)
    return "`" + event.tool + "`\n\n" + clamp(input.prompt, 1200);
  return "`" + event.tool + "`";
}

function codexToolActivity(t, event) {
  if (event.method === "item/commandExecution/outputDelta") {
    const tracked = t.tool(event.itemId);
    if (!tracked) return;
    tracked.content = clamp(
      (tracked.content || "") + (event.delta || ""),
      40000,
    );
    t.chat({
      type: "chat/toolCallContentChanged",
      turnId: tracked.turnId,
      toolCallId: tracked.toolCallId,
      content: [{ type: "text", text: tracked.content }],
    });
    return;
  }
  const item = event.item;
  if (!item) return;
  if (item.type === "reasoning") {
    t.appendText("reasoning", {
      text: item.text || item.summary || "",
      itemId: item.id,
    });
    return;
  }
  if (item.type === "agentMessage") return; // Delivered by the `message` event.
  if (!CODEX_TOOL_ITEMS.has(item.type)) return;
  const tracked = t.ensureTool(item.id, { name: item.type });
  if (!tracked) return;
  if (event.method === "item/started") {
    if (tracked.status === "pending-confirmation") return;
    t.readyTool(item.id, {
      invocationMessage: { markdown: codexInvocation(item) },
      toolInput: clamp(JSON.stringify(item, null, 2)),
    });
    return;
  }
  if (event.method === "item/completed") {
    const failed =
      item.status === "failed" ||
      (item.exitCode !== undefined && item.exitCode !== 0);
    const output =
      item.aggregatedOutput || item.output || tracked.content || "";
    t.completeTool(item.id, {
      success: !failed,
      pastTenseMessage: failed
        ? tracked.displayName +
          " failed" +
          (item.exitCode !== undefined ? " (exit " + item.exitCode + ")" : "")
        : tracked.displayName + " finished",
      ...(output ? { content: [{ type: "text", text: clamp(output) }] } : {}),
      ...(failed
        ? {
            error: {
              message: clamp(item.error || output || "The tool failed.", 2000),
              ...(item.exitCode !== undefined
                ? { code: "exit-" + item.exitCode }
                : {}),
            },
          }
        : {}),
    });
  }
}

function codexInvocation(item) {
  if (item.command)
    return (
      "Run in `" +
      (item.cwd || "the worktree") +
      "`:\n\n```sh\n" +
      clamp(item.command, 2000) +
      "\n```"
    );
  if (item.changes)
    return (
      "Change files:\n\n" +
      Object.keys(item.changes)
        .map((file) => "- `" + file + "`")
        .join("\n")
    );
  return (
    "`" +
    item.type +
    "`\n\n```json\n" +
    clamp(JSON.stringify(item, null, 2), 1500) +
    "\n```"
  );
}
