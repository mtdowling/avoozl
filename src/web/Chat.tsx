import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Archive, ArrowDown, Bot, ChevronUp, CircleStop, Download, Play, Send, UserRound } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { command, submissionId } from "./api";
import { useRemote, useWorkspaceEvents } from "./hooks";
import type { RequestRecord, Run, RunEvent } from "./types";

const activeStates = new Set(["starting", "running", "waiting-input", "waiting-approval"]);
const OpenHandsSurface = lazy(() => import("./OpenHandsSurface"));

function eventMessages(run: Run): ThreadMessageLike[] {
  const result: ThreadMessageLike[] = [];
  if (run.prompt && !run.hasEarlier)
    result.push({
      id: `${run.id}:prompt`,
      role: "user",
      content: run.prompt,
      createdAt: run.createdAt ? new Date(run.createdAt) : undefined,
    });

  let stream = "";
  let streamStart: RunEvent | undefined;
  for (const event of run.events || []) {
    if (event.kind === "message.delta") {
      streamStart ||= event;
      stream += event.text || "";
      continue;
    }
    if (event.kind === "message") {
      stream = "";
      streamStart = undefined;
      result.push({
        id: `${run.id}:event:${event.seq}`,
        role: event.role === "user" ? "user" : "assistant",
        content: event.text || "",
        createdAt: event.at ? new Date(event.at) : undefined,
        ...(event.role === "user"
          ? {}
          : { status: { type: "complete", reason: "stop" } as const }),
      });
      continue;
    }
    if (event.kind === "delivery.queued" && event.delivery) {
      result.push({
        id: `${run.id}:delivery:${event.delivery.id || event.seq}`,
        role: "user",
        content: event.delivery.text,
        createdAt: event.at ? new Date(event.at) : undefined,
        metadata: { custom: { deliveryState: event.delivery.state || "queued" } },
      });
      continue;
    }
    if (event.kind === "tool.activity") {
      result.push({
        id: `${run.id}:tool:${event.seq}`,
        role: "assistant",
        content: `> Tool activity: **${event.tool || "Agent tool"}**`,
        createdAt: event.at ? new Date(event.at) : undefined,
        status: { type: "complete", reason: "stop" },
      });
      continue;
    }
    if (["run.failed", "provider.error", "disconnected"].includes(event.kind)) {
      result.push({
        id: `${run.id}:error:${event.seq}`,
        role: "assistant",
        content: `**${event.message || event.kind}**`,
        createdAt: event.at ? new Date(event.at) : undefined,
        status: { type: "incomplete", reason: "error", error: event.message || event.kind },
      });
    }
  }
  if (stream.trim()) {
    result.push({
      id: `${run.id}:stream:${streamStart?.seq || "active"}`,
      role: "assistant",
      content: stream,
      createdAt: streamStart?.at ? new Date(streamStart.at) : undefined,
      status: { type: "running" },
      metadata: { runId: run.id },
    });
  }
  return result;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="message message-user">
      <div className="message-icon"><UserRound size={16} /></div>
      <div className="message-body">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="message message-assistant">
      <div className="message-icon"><Bot size={17} /></div>
      <div className="message-body">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function MarkdownText() {
  return <MarkdownTextPrimitive className="aui-markdown" />;
}

function requestQuestions(request: RequestRecord) {
  return (
    request.payload?.questions ||
    request.payload?.params?.questions ||
    request.payload?.input?.questions ||
    []
  ) as Array<{
    id?: string;
    header?: string;
    question?: string;
    options?: Array<{ label?: string; description?: string } | string>;
  }>;
}

function RequestCard({
  request,
  run,
  onAnswered,
}: {
  request: RequestRecord;
  run: Run;
  onAnswered: () => void;
}) {
  const questions = requestQuestions(request);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answer(decision: "allow" | "deny") {
    if (decision === "allow" && questions.some((_, index) => !answers[index]?.trim())) {
      setError("Answer each question before sending.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const responseAnswers = Object.fromEntries(
        questions.map((question, index) => [
          run.provider === "claude" ? question.question : question.id || question.question,
          run.provider === "claude" ? answers[index] : { answers: [answers[index]] },
        ]),
      );
      await command("run.answer", {
        id: request.id,
        runId: run.id,
        decision,
        ...(questions.length ? { answers: responseAnswers } : {}),
        ...(decision === "allow" && request.kind === "approval" ? { optionId: "allow-once" } : {}),
      });
      onAnswered();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = request.payload?.input || request.payload?.params || request.payload || {};
  const commandText = input.command || input.command_line || input.file_path || input.path;

  return (
    <article className="request-card">
      <div>
        <span className="eyebrow">{request.kind === "input" ? "Agent question" : "Approval required"}</span>
        <h3>{request.method || (request.kind === "input" ? "The agent needs your answer" : "Review this action")}</h3>
      </div>
      {questions.map((question, index) => (
        <fieldset key={question.id || index}>
          <legend>{question.question || question.header || "Question"}</legend>
          <div className="option-grid">
            {(question.options || []).map((option) => {
              const label = typeof option === "string" ? option : option.label || "";
              return (
                <button
                  type="button"
                  className={answers[index] === label ? "choice selected" : "choice"}
                  key={label}
                  onClick={() => setAnswers((old) => ({ ...old, [index]: label }))}
                >
                  {label}
                  {typeof option !== "string" && option.description && <small>{option.description}</small>}
                </button>
              );
            })}
          </div>
          <input
            value={answers[index] || ""}
            onChange={(event) => setAnswers((old) => ({ ...old, [index]: event.target.value }))}
            placeholder={question.options?.length ? "Or type an answer…" : "Your answer…"}
          />
        </fieldset>
      ))}
      {!questions.length && commandText && <pre className="request-command">{String(commandText)}</pre>}
      <details>
        <summary>Request details</summary>
        <pre>{JSON.stringify(request.payload, null, 2)}</pre>
      </details>
      {error && <p className="error">{error}</p>}
      <div className="button-row">
        <button className="button primary" disabled={busy} onClick={() => answer("allow")}>
          {request.kind === "input" ? "Send answer" : "Allow once"}
        </button>
        <button className="button quiet" disabled={busy} onClick={() => answer("deny")}>Decline</button>
      </div>
    </article>
  );
}

function ConversationRuntime({
  run,
  reload,
  loadEarlier,
}: {
  run: Run;
  reload: () => Promise<unknown>;
  loadEarlier: () => Promise<void>;
}) {
  const [deliveryMode, setDeliveryMode] = useState<"queue" | "steer">("queue");
  const [error, setError] = useState("");
  const messages = useMemo(() => eventMessages(run), [run]);
  const isRunning = activeStates.has(run.state);

  async function send(message: AppendMessage) {
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!text) return;
    setError("");
    try {
      await command("run.send", {
        id: run.id,
        text,
        submissionId: submissionId(),
        delivery: deliveryMode,
      });
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
      throw cause;
    }
  }

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message) => message,
    isRunning,
    isDisabled: Boolean(run.external),
    hasEarlier: run.hasEarlier,
    onLoadEarlier: loadEarlier,
    onNew: send,
    onCancel: async () => {
      await command("run.interrupt", { id: run.id, reason: "Stopped from web UI" });
      await reload();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread">
        <ThreadPrimitive.Viewport className="thread-viewport">
          <ThreadPrimitive.Empty>
            <div className="thread-empty"><Bot size={28} /><p>This conversation has no messages yet.</p></div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.LoadEarlier className="load-earlier">
            <ChevronUp size={16} /> Load earlier messages
          </ThreadPrimitive.LoadEarlier>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          <ThreadPrimitive.ScrollToBottom className="scroll-bottom" aria-label="Scroll to latest">
            <ArrowDown size={18} />
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
        {(run.requests || []).map((request) => (
          <RequestCard key={request.id} request={request} run={run} onAnswered={() => void reload()} />
        ))}
        {!run.external && (
          <ComposerPrimitive.Root className="composer">
            <ComposerPrimitive.Input
              className="composer-input"
              placeholder="Reply, ask a question, or give direction…"
              maxLength={100000}
              rows={1}
            />
            <div className="composer-controls">
              {isRunning && run.provider === "codex" && (
                <label className="steer-toggle">
                  <input
                    type="checkbox"
                    checked={deliveryMode === "steer"}
                    onChange={(event) => setDeliveryMode(event.target.checked ? "steer" : "queue")}
                  />
                  Steer this turn
                </label>
              )}
              {isRunning && run.provider !== "codex" && <span className="muted">Queues after this turn</span>}
              <span className="composer-spacer" />
              <ThreadPrimitive.If running>
                <ComposerPrimitive.Cancel className="icon-button danger" aria-label="Stop agent">
                  <CircleStop size={20} />
                </ComposerPrimitive.Cancel>
              </ThreadPrimitive.If>
              <ComposerPrimitive.Send className="icon-button send" aria-label="Send message">
                <Send size={19} />
              </ComposerPrimitive.Send>
            </div>
            {error && <p className="error">{error}</p>}
          </ComposerPrimitive.Root>
        )}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

export function Conversation({
  runId,
  onRefresh,
}: {
  runId: string;
  onRefresh: () => void;
}) {
  const remote = useRemote(() => command<Run>("run.get", { id: runId, compact: true, limit: 200 }), [runId]);
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [surface, setSurface] = useState<"chat" | "workspace">("chat");
  useWorkspaceEvents(() => {
    void remote.reload().then(onRefresh).catch(() => {});
  }, runId);

  if (remote.loading && !remote.data) return <div className="center-state">Opening conversation…</div>;
  if (remote.error && !remote.data) return <div className="center-state error">{remote.error.message}</div>;
  const run = remote.data!;
  async function loadEarlier() {
    const before = run.events[0]?.seq;
    if (!before) return;
    const page = await command<Run>("run.get", { id: run.id, compact: true, limit: 200, before });
    remote.setData({
      ...run,
      ...page,
      events: [...page.events, ...run.events],
      deliveries: run.deliveries,
      requests: run.requests,
    });
  }
  const status =
    run.state === "running" ? "Responding" :
    run.state === "waiting-input" ? "Waiting for your answer" :
    run.state === "waiting-approval" ? "Waiting for approval" :
    run.state === "starting" ? "Connecting" :
    run.state;

  async function runAction(action: () => Promise<unknown>) {
    setActionBusy(true);
    setActionError("");
    try {
      await action();
      await remote.reload();
      onRefresh();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function downloadHandoff() {
    setActionBusy(true);
    setActionError("");
    try {
      const handoff = await command("handoff", { id: run.id });
      const url = URL.createObjectURL(new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${run.id}-handoff.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <section className="conversation">
      <header className="conversation-header">
        <div>
          <span className={`status-dot state-${run.state}`} />
          <span>{status}</span>
        </div>
        <div className="conversation-actions">
          {run.provider === "openhands" && run.providerSessionId && (
            <span className="segmented conversation-surface-switch">
              <button className={surface === "chat" ? "active" : ""} onClick={() => setSurface("chat")}>Chat</button>
              <button className={surface === "workspace" ? "active" : ""} onClick={() => setSurface("workspace")}>Workspace</button>
            </span>
          )}
          {!run.external && (
            <select
              aria-label="Conversation approval mode"
              disabled={actionBusy}
              value={run.approvalMode || "manual"}
              onChange={(event) => void runAction(() => command("run.approvals", { id: run.id, approvalMode: event.target.value }))}
            >
              <option value="manual">Ask when needed</option>
              <option value="automatic">Automatic review</option>
            </select>
          )}
          {run.state === "disconnected" && <button className="header-action" disabled={actionBusy} onClick={() => void runAction(() => command("run.resume", { id: run.id }))}><Play size={15} /> Resume</button>}
          <button className="header-action" disabled={actionBusy} onClick={() => void downloadHandoff()} title="Download durable handoff"><Download size={15} /></button>
          <button className="header-action" disabled={actionBusy} onClick={() => void runAction(() => command(run.archivedAt ? "run.unarchive" : "run.archive", { id: run.id }))} title={run.archivedAt ? "Restore conversation" : "Archive conversation"}><Archive size={15} /></button>
          <span className="conversation-meta">{run.provider} · {run.actualModel || run.model || "default model"}</span>
        </div>
      </header>
      {actionError && <p className="conversation-error">{actionError}</p>}
      {surface === "workspace" && run.provider === "openhands" ? (
        <Suspense fallback={<div className="center-state">Loading workspace UI…</div>}>
          <OpenHandsSurface runId={run.id} />
        </Suspense>
      ) : (
        <ConversationRuntime run={run} reload={remote.reload} loadEarlier={loadEarlier} />
      )}
    </section>
  );
}
