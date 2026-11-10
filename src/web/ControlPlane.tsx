import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  GitBranch,
  Network,
  Play,
  Save,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { apiUrl, command, get } from "./api";
import { useRemote } from "./hooks";
import type {
  EvidenceRecord,
  State,
  Task,
  TaskDetail,
  Workspace,
} from "./types";

const MarkdownContent = lazy(() => import("./MarkdownContent"));

function lines(value?: string[]) {
  return (value || []).join("\n");
}

function list(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function date(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed.toLocaleString() : value;
}

function evidenceId(value: string) {
  if (value.startsWith("workspace:evidence/")) return value.slice(19);
  return "";
}

function DetailSection({
  title,
  children,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="task-detail-section" open={open || undefined}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

export function TaskInspector({
  task,
  state,
  close,
  refresh,
  openDocument,
  openRun,
  startRun,
  exploreGraph,
  filterTag,
}: {
  task: Task;
  state: State;
  close: () => void;
  refresh: () => void;
  openDocument: (id: string) => void;
  openRun: (id: string) => void;
  startRun: (task: Task) => Promise<void>;
  exploreGraph: (task: Task) => void;
  filterTag: (tag: string) => void;
}) {
  const [taskId, setTaskId] = useState(task.id);
  const [trail, setTrail] = useState<string[]>([]);
  const remote = useRemote(
    () => command<TaskDetail>("task.get", { id: taskId }),
    [taskId, state.revision],
  );
  const detail = remote.data;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState<EvidenceRecord | null>(null);
  const [form, setForm] = useState({
    title: task.title,
    summary: task.summary || "",
    status: task.status,
    owner: task.owner || "",
    notes: task.notes || "",
    nextAction: task.nextAction || "",
    tags: lines(task.tags),
    acceptance: lines(task.acceptance),
  });

  useEffect(() => {
    if (!detail) return;
    setForm({
      title: detail.title,
      summary: detail.summary || "",
      status: detail.status,
      owner: detail.owner || "",
      notes: detail.notes || "",
      nextAction: detail.nextAction || "",
      tags: lines(detail.tags),
      acceptance: lines(detail.acceptance),
    });
    setEditing(false);
    setMessage("");
  }, [detail]);

  function navigate(id: string) {
    if (id === taskId) return;
    setTrail((current) => [...current, taskId]);
    setTaskId(id);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await command(
        "task.update",
        {
          id: taskId,
          title: form.title,
          summary: form.summary,
          status: form.status,
          owner: form.owner,
          notes: form.notes,
          nextAction: form.nextAction,
          tags: list(form.tags),
          acceptance: list(form.acceptance),
        },
        state.revision,
      );
      await remote.reload();
      refresh();
      setMessage("Task saved.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markReviewed() {
    setBusy(true);
    setMessage("");
    try {
      await command(
        "task.update",
        { id: taskId, needsReview: false },
        state.revision,
      );
      await remote.reload();
      refresh();
      setMessage("Source changes marked reviewed.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inspectEvidence(id: string) {
    setMessage("");
    try {
      setEvidence(await get<EvidenceRecord>(`/api/evidence/${encodeURIComponent(id)}`));
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }

  async function copyLink() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("view", "tasks");
    url.searchParams.set("task", taskId);
    await navigator.clipboard.writeText(url.href);
    setMessage("Task link copied.");
  }

  const relationships = detail?.relationships || [];
  const connectedSessionId =
    detail?.activity?.connection?.runId || detail?.activity?.sessionId;
  const sessionRun =
    detail?.runs?.find(
      (run) =>
        run.provider === "openhands" &&
        (run.id === connectedSessionId ||
          run.providerSessionId === connectedSessionId),
    ) ||
    detail?.runs?.find((run) =>
      run.provider === "openhands" &&
      ["starting", "running", "waiting-input", "waiting-approval"].includes(
        run.state,
      ),
    );
  const sources = useMemo(() => {
    if (!detail) return [];
    const values = [detail.source, ...(detail.sourceReferences || [])].filter(
      (item): item is NonNullable<Task["source"]> => Boolean(item?.document),
    );
    return values.filter(
      (item, index) =>
        values.findIndex(
          (candidate) =>
            candidate.document === item.document &&
            candidate.lineStart === item.lineStart &&
            candidate.lineEnd === item.lineEnd,
        ) === index,
    );
  }, [detail]);

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <aside className="task-drawer task-inspector">
        <nav className="inspector-nav">
          <button
            className="button subtle"
            disabled={!trail.length}
            onClick={() => {
              const previous = trail.at(-1);
              if (!previous) return;
              setTrail((current) => current.slice(0, -1));
              setTaskId(previous);
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button className="button subtle" onClick={() => void copyLink()}>
            <Clipboard size={14} /> Copy link
          </button>
          <button className="icon-button" onClick={close} aria-label="Close task">
            <X size={18} />
          </button>
        </nav>

        {!detail ? (
          <div className="task-inspector-loading">
            {remote.error?.message || "Loading task details…"}
          </div>
        ) : (
          <>
            <header>
              <div>
                <span className="eyebrow">
                  {detail.epic?.startsWith("doc:") ? "Plan inventory" : detail.epic || "Task"}
                  {" / "}
                  {state.tracks.find((item) => item.id === detail.track)?.label || detail.track}
                </span>
                <h2>{detail.title}</h2>
                <code>{detail.id}</code>
              </div>
            </header>

            {detail.needsReview && (
              <p className="task-notice">
                <AlertTriangle size={15} />
                The source plan changed. Review the new context before clearing this warning.
              </p>
            )}
            {detail.source?.removed && (
              <p className="task-notice">
                <AlertTriangle size={15} />
                The original source was removed. This durable task record remains for review.
              </p>
            )}

            <dl className="task-at-glance">
              <div>
                <dt>Status</dt>
                <dd>{state.statuses.find((item) => item.id === detail.status)?.label || detail.status}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{detail.scope || "Unspecified"}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{detail.owner || detail.activity?.owner || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{detail.progressPercent ?? (state.statuses.find((item) => item.id === detail.status)?.complete ? 100 : 0)}%</dd>
              </div>
            </dl>

            <dl className="task-workspace-location">
              <div>
                <dt>Branch</dt>
                <dd><code>{detail.executionLocation?.branch || "Not created yet"}</code></dd>
              </div>
              <div>
                <dt>Worktree</dt>
                <dd title={detail.executionLocation?.worktree || "Not created yet"}>
                  <code>{detail.executionLocation?.worktree || "Not created yet"}</code>
                </dd>
              </div>
            </dl>

            <p className="task-summary">{detail.summary || "No summary recorded."}</p>

            {!!detail.tags?.length && (
              <div className="task-tags">
                {detail.tags.map((tag) => (
                  <button key={tag} onClick={() => filterTag(tag)}>
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            <div className="inspector-actions">
              {sessionRun ? (
                <button className="button primary" onClick={() => openRun(sessionRun.id)}>
                  <Play size={14} /> Open in OpenHands
                </button>
              ) : detail.activity?.status === "active" ? (
                <span className="task-session-note">Active outside OpenHands</span>
              ) : (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void startRun(detail)}
                >
                  <Play size={14} /> Start in OpenHands
                </button>
              )}
              <button className="button primary" onClick={() => setEditing((value) => !value)}>
                {editing ? "Close editor" : "Edit task"}
              </button>
              {detail.needsReview && (
                <button className="button subtle" disabled={busy} onClick={() => void markReviewed()}>
                  <Check size={14} /> Mark reviewed
                </button>
              )}
              <button className="button subtle" onClick={() => exploreGraph(detail)}>
                <Network size={14} /> Graph
              </button>
            </div>

            {editing && (
              <section className="task-edit-form">
                <label>
                  Title
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </label>
                <label>
                  Status
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    {state.statuses.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Summary
                  <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
                </label>
                <label>
                  Owner
                  <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} />
                </label>
                <label>
                  Next action
                  <textarea value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} />
                </label>
                <label>
                  Implementation notes
                  <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                </label>
                <label>
                  Tags, one per line
                  <textarea value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
                </label>
                <label>
                  Acceptance criteria, one per line
                  <textarea value={form.acceptance} onChange={(event) => setForm({ ...form, acceptance: event.target.value })} />
                </label>
                <button className="button primary" disabled={busy} onClick={() => void save()}>
                  <Save size={14} /> Save task
                </button>
              </section>
            )}

            {(detail.activity || detail.nextAction) && (
              <DetailSection title="Current activity" open>
                {detail.activity?.status && <p><strong>{detail.activity.status}</strong></p>}
                {detail.activity?.summary && <p>{detail.activity.summary}</p>}
                {detail.nextAction && <p><strong>Next:</strong> {detail.nextAction}</p>}
                {detail.activity?.branch && <p><GitBranch size={13} /> {detail.activity.branch}</p>}
                {detail.activity?.heartbeatAt && <p>Last report: {date(detail.activity.heartbeatAt)}</p>}
              </DetailSection>
            )}

            {detail.capture && (
              <DetailSection title="Original request and captured view">
                <p>{detail.prompt || detail.summary}</p>
                <p>
                  {detail.capture.context?.view || "Unknown view"} · database revision{" "}
                  {detail.capture.context?.revision ?? "unknown"}
                </p>
                {detail.capture.context?.url && (
                  <a href={detail.capture.context.url}>
                    Return to captured view <ExternalLink size={12} />
                  </a>
                )}
                <pre>{JSON.stringify(detail.capture.context?.filters || {}, null, 2)}</pre>
              </DetailSection>
            )}

            {detail.notes && (
              <DetailSection title="Implementation notes" open>
                <p className="preserve-lines">{detail.notes}</p>
              </DetailSection>
            )}

            {!!detail.acceptance?.length && (
              <DetailSection title="Acceptance criteria" open>
                <ul>{detail.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
              </DetailSection>
            )}

            {!!relationships.length && (
              <DetailSection title="Relationships" open>
                {relationships.map((edge, index) => {
                  const otherId = edge.from === detail.id ? edge.to : edge.from;
                  const other = state.tasks.find((item) => item.id === otherId);
                  return (
                    <button className="task-detail-link" key={edge.id || index} onClick={() => navigate(otherId)}>
                      <strong>{other?.title || otherId}</strong>
                      <small>
                        {edge.from === detail.id ? "Enables" : "Depends on"} · {edge.kind}
                        {edge.reason ? ` · ${edge.reason}` : ""}
                      </small>
                    </button>
                  );
                })}
              </DetailSection>
            )}

            {(detail.context || sources.length > 0) && (
              <DetailSection title="Source plan context" open>
                {detail.context && (
                  <article className="task-source-markdown">
                    <Suspense fallback={<p className="muted">Rendering source…</p>}>
                      <MarkdownContent text={detail.context} />
                    </Suspense>
                  </article>
                )}
                {sources.map((source) => (
                  <button
                    className="task-detail-link"
                    key={`${source.document}:${source.lineStart}:${source.lineEnd}`}
                    onClick={() => source.document && openDocument(source.document)}
                  >
                    <FileText size={14} />
                    <span>
                      <strong>{state.documents[source.document || ""]?.title || source.document}</strong>
                      <small>
                        {source.lineStart ? `Lines ${source.lineStart}${source.lineEnd ? `–${source.lineEnd}` : ""}` : "Open plan"}
                      </small>
                    </span>
                  </button>
                ))}
              </DetailSection>
            )}

            {!!detail.documents?.length && (
              <DetailSection title="Additional plan context">
                {detail.documents.map((document) => (
                  <button className="task-detail-link" key={document.id} onClick={() => openDocument(document.id)}>
                    <FileText size={14} />
                    <span><strong>{document.title}</strong><small>{document.path}</small></span>
                  </button>
                ))}
              </DetailSection>
            )}

            {(!!detail.evidence?.length || !!detail.evidenceRecords?.length || !!detail.integration) && (
              <DetailSection title="Evidence and receipts" open>
                {detail.integration && (
                  <div className="receipt-card">
                    <strong>Integrated {detail.integration.commit?.slice(0, 12)}</strong>
                    <span>{detail.integration.repo} · {detail.integration.branch}</span>
                    <small>{date(detail.integration.at)}</small>
                  </div>
                )}
                {detail.evidence?.map((item) => {
                  const id = evidenceId(item);
                  return id ? (
                    <button className="task-detail-link" key={item} onClick={() => void inspectEvidence(id)}>
                      <strong>{item}</strong><small>Inspect durable evidence</small>
                    </button>
                  ) : item.startsWith("evidence/") ? (
                    <a className="task-detail-link" key={item} href={apiUrl(`/source?path=${encodeURIComponent(item)}`)} target="_blank" rel="noopener">
                      <strong>{item}</strong><small>Open evidence file</small>
                    </a>
                  ) : (
                    <p key={item}>{item}</p>
                  );
                })}
                {detail.evidenceRecords?.map((record) => (
                  <button className="task-detail-link" key={record.id} onClick={() => setEvidence(record)}>
                    <strong>{record.kind || "Evidence"} · {record.id}</strong>
                    <small>{record.argv?.join(" ") || record.commit || date(record.at)}</small>
                  </button>
                ))}
                {detail.mergeReceipts?.map((id) => (
                  <button className="task-detail-link" key={id} onClick={() => void inspectEvidence(id)}>
                    <strong>Consolidation receipt</strong><small>{id}</small>
                  </button>
                ))}
              </DetailSection>
            )}

            <DetailSection title="Code changes" open>
              {detail.github?.url && (
                <a className="task-detail-link" href={detail.github.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />
                  <span><strong>GitHub issue #{detail.github.number}</strong><small>{detail.github.repository}</small></span>
                </a>
              )}
              {detail.codeChanges?.commits.map((commit) =>
                commit.url ? (
                  <a className="task-detail-link" key={commit.sha} href={commit.url} target="_blank" rel="noopener noreferrer">
                    <GitBranch size={13} />
                    <span><strong>Commit {commit.sha.slice(0, 12)}</strong><small>{commit.source || "Associated commit"}</small></span>
                  </a>
                ) : (
                  <div className="task-detail-link" key={commit.sha}>
                    <GitBranch size={13} />
                    <span><strong>Commit {commit.sha.slice(0, 12)}</strong><small>{commit.source || "Associated commit"} · repository URL unavailable</small></span>
                  </div>
                ),
              )}
              {detail.codeChanges?.pullRequests.map((pull) => (
                <a className="task-detail-link" key={pull.nodeId || pull.url} href={pull.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />
                  <span>
                    <strong>{pull.number ? `PR #${pull.number}` : "Pull request"}{pull.title ? ` · ${pull.title}` : ""}</strong>
                    <small>{[pull.repository, pull.state].filter(Boolean).join(" · ") || "Associated pull request"}</small>
                  </span>
                </a>
              ))}
              {!detail.github?.url &&
                !detail.codeChanges?.commits.length &&
                !detail.codeChanges?.pullRequests.length && (
                  <p>No commits or pull requests are associated yet.</p>
                )}
            </DetailSection>

            {!!detail.runs?.some((run) => run.provider === "openhands") && (
              <DetailSection title="OpenHands conversations">
                {detail.runs.filter((run) => run.provider === "openhands").map((run) => (
                  <button className="task-detail-link" key={run.id} onClick={() => openRun(run.id)}>
                    <Play size={13} />
                    <span><strong>{run.title || run.id}</strong><small>{run.state}</small></span>
                  </button>
                ))}
              </DetailSection>
            )}

            <DetailSection title="Record provenance">
              <p>
                Status is maintained in SQLite. Markdown is source context, not runtime acceptance.
                {detail.source ? " This task retains its exact source reference." : ""}
              </p>
              <p>Created {date(detail.createdAt)} · updated {date(detail.updatedAt || state.updatedAt)}</p>
              {detail.requestedId && <p>Resolved from earlier task ID <code>{detail.requestedId}</code>.</p>}
            </DetailSection>

            {message && <p className="task-form-message" role="status">{message}</p>}
          </>
        )}
      </aside>

      {evidence && (
        <div className="evidence-modal" role="dialog" aria-modal="true" aria-label="Evidence record">
          <header><strong>{evidence.kind || "Evidence"}</strong><button className="icon-button" onClick={() => setEvidence(null)}><X size={17} /></button></header>
          <pre>{JSON.stringify(evidence, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export type CaptureContext = {
  revision: number;
  view: string;
  selected?: string;
  document?: string | null;
  planId?: string | null;
  projectId?: string;
  taskIds?: string[];
  filters: Record<string, string>;
  url?: string;
  conversationPurpose?: "new-task" | "project-chat";
};

export function McpDialog({
  serverUrl,
  workspace,
  close,
}: {
  serverUrl: string;
  workspace: Workspace;
  close: () => void;
}) {
  const endpoint = `${serverUrl.replace(/\/$/, "")}/mcp`;
  const [copied, setCopied] = useState("");
  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="mcp-dialog" role="dialog" aria-modal="true" aria-label="Avoozl connection details">
        <header><div><span className="eyebrow">Connection</span><h2>Avoozl is live</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></header>
        <dl>
          <div><dt>Avoozl server</dt><dd><code>{serverUrl}</code><button onClick={() => void copy(serverUrl, "Server")}><Clipboard size={13} /></button></dd></div>
          <div><dt>MCP endpoint</dt><dd><code>{endpoint}</code><button onClick={() => void copy(endpoint, "MCP endpoint")}><Clipboard size={13} /></button></dd></div>
          <div><dt>Agent host</dt><dd>{workspace.agentHost?.draining ? "Draining" : workspace.agentHost?.connected ? "Connected" : "Offline"}</dd></div>
          <div><dt>Storage</dt><dd>SQLite · revision {workspace.revision}</dd></div>
        </dl>
        <p>Clients should connect to the MCP endpoint over HTTP. Credentials and provider secrets remain outside the planning workspace.</p>
        {copied && <p className="success">{copied} copied.</p>}
      </section>
    </div>
  );
}
