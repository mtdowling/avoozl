import {
  Activity,
  Bot,
  Boxes,
  CheckCircle2,
  CircleDot,
  FileCode2,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  Network,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { command, get, submissionId } from "./api";
import { loadState, loadWorkspace, useRemote, useWorkspaceEvents } from "./hooks";
import type { DocumentRecord, PlanSummary, RunSummary, State, Task, Workspace } from "./types";

const Conversation = lazy(() => import("./Chat").then((module) => ({ default: module.Conversation })));
const PlanEditor = lazy(() => import("./Editors").then((module) => ({ default: module.PlanEditor })));
const DocumentEditor = lazy(() => import("./Editors").then((module) => ({ default: module.DocumentEditor })));

type View = "overview" | "tasks" | "conversations" | "plans" | "documents" | "graph" | "settings";

const views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Now", icon: Activity },
  { id: "tasks", label: "Task tree", icon: ListTodo },
  { id: "conversations", label: "Steer", icon: MessageSquare },
  { id: "plans", label: "Plan drafts", icon: FileCode2 },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "graph", label: "Dependency graph", icon: Network },
  { id: "settings", label: "Settings", icon: Settings },
];

function initialLocation() {
  const query = new URLSearchParams(location.search);
  const requested = query.get("view") as View | null;
  return {
    view: views.some((item) => item.id === requested) ? requested! : (query.get("run") ? "conversations" : query.get("plan") ? "plans" : query.get("document") ? "documents" : "overview"),
    runId: query.get("run"),
    planId: query.get("plan"),
    documentId: query.get("document"),
  };
}

function stateLabel(run: RunSummary) {
  return run.state === "waiting-input" ? "Needs answer" :
    run.state === "waiting-approval" ? "Needs approval" :
    run.state === "running" ? "Running" :
    run.state === "starting" ? "Starting" :
    run.state;
}

function Empty({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return <div className="empty-state"><Icon size={26} /><h3>{title}</h3><p>{children}</p></div>;
}

function LoadingSurface({ label }: { label: string }) {
  return <div className="center-state"><RefreshCw className="spin" size={22} /><p>{label}</p></div>;
}

function Overview({ workspace, state, openRun, openTask }: { workspace: Workspace; state: State; openRun: (id: string) => void; openTask: (task: Task) => void }) {
  const queue = useRemote(() => command<any>("queue", { limit: 12 }), [workspace.revision]);
  const attention = workspace.runs.filter((run) => ["waiting-input", "waiting-approval", "failed", "disconnected"].includes(run.state));
  return (
    <section className="screen">
      <header className="view-heading">
        <div><h1>Now</h1><p>Work that needs attention or can move next.</p></div>
        <span>{state.tasks.length} tasks</span>
      </header>
      <div className="metric-grid">
        <article><span>Ready</span><strong>{queue.data?.summary?.ready ?? "—"}</strong></article>
        <article><span>Blocked</span><strong>{queue.data?.summary?.blocked ?? "—"}</strong></article>
        <article><span>Active</span><strong>{queue.data?.summary?.active ?? workspace.runs.filter((r) => ["starting", "running"].includes(r.state)).length}</strong></article>
        <article><span>Plans</span><strong>{workspace.planTotal}</strong></article>
      </div>
      <div className="dashboard-grid">
        <section className="panel attention-panel">
          <header><h2>Needs attention</h2><ShieldAlert size={16} /></header>
          {attention.length ? attention.slice(0, 8).map((run) => (
            <button className="attention-row" key={run.id} onClick={() => openRun(run.id)}>
              <span className={`status-dot state-${run.state}`} />
              <span><strong>{run.title || run.id}</strong><small>{stateLabel(run)} · {run.provider}</small></span>
              <span>Open →</span>
            </button>
          )) : <Empty icon={CheckCircle2} title="Nothing is waiting">Agents can continue without an operator decision.</Empty>}
        </section>
        <section className="panel">
          <header><h2>Ready work</h2><Activity size={16} /></header>
          {(queue.data?.ready || []).slice(0, 8).map((task: Task) => (
            <button className="task-row" key={task.id} onClick={() => openTask(task)}>
              <span><strong>{task.title}</strong><small>{task.id} · {task.status}</small></span>
              <span>{task.nextAction || "Inspect"}</span>
            </button>
          ))}
          {!queue.data?.ready?.length && <Empty icon={CircleDot} title="No ready tasks">Approve a plan or resolve blocked work to populate the execution queue.</Empty>}
        </section>
      </div>
      {!!queue.data?.blocked?.length && (
        <section className="panel blocked-panel">
          <header><h2>Blocked work</h2><GitBranch size={16} /></header>
          <div className="card-grid">
            {queue.data.blocked.slice(0, 6).map((item: any) => (
              <article key={item.id}><strong>{item.title}</strong><small>{item.id}</small><p>{item.nextAction || item.summary || "Waiting on prerequisites."}</p><div>{item.blockers.map((b: any) => <button key={b.id} onClick={() => openTask(state.tasks.find((t) => t.id === b.id)!)}>{b.title}</button>)}</div></article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function NewConversation({ workspace, onCreated }: { workspace: Workspace; onCreated: (id: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState(workspace.providers[0]?.id || workspace.providers[0]?.name || "codex");
  const [projectId, setProjectId] = useState(workspace.projects[0]?.id || "");
  const [action, setAction] = useState<"ask" | "run" | "draft">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const id = submissionId();
      const result = await command<any>("intent.submit", {
        action,
        prompt,
        provider: provider || undefined,
        projectId: projectId || undefined,
        approvalMode: "manual",
        submissionId: id,
        runId: "run-" + id,
        context: {},
      });
      if (result.run) onCreated(result.run.id);
      else if (result.plan) location.href = `/?view=plans&plan=${encodeURIComponent(result.plan.id)}`;
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="new-conversation">
      <h1>Start a conversation</h1>
      <p>Ask a question, implement scoped work, or draft a plan.</p>
      <form onSubmit={submit}>
        <textarea autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the outcome, question, or decision…" required maxLength={20000} />
        <div className="new-conversation-controls">
          <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            <option value="ask">Ask</option><option value="run">Implement</option><option value="draft">Draft plan</option>
          </select>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {workspace.providers.map((item) => { const id = item.id || item.name || ""; return <option value={id} key={id}>{item.label || item.name || id}</option>; })}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No execution project</option>
            {workspace.projects.map((item) => <option value={item.id} key={item.id}>{item.name || item.id}</option>)}
          </select>
          <button className="button primary" disabled={busy || !prompt.trim()}><Sparkles size={17} /> Start</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

function Tasks({ state, openTask }: { state: State; openTask: (task: Task) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("remaining");
  const complete = new Set(state.statuses.filter((item) => item.complete).map((item) => item.id));
  const tasks = state.tasks.filter((task) => {
    const matchesText = !query || `${task.id} ${task.title} ${task.summary || ""} ${(task.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || (status === "remaining" ? !complete.has(task.status) : task.status === status);
    return matchesText && matchesStatus;
  });
  return (
    <section className="screen tasks-screen">
      <header className="screen-heading">
        <div><h1>Task tree</h1><p>Workspace tasks and their current delivery state.</p></div>
        <span>{tasks.length} of {state.tasks.length}</span>
      </header>
      <div className="task-filters">
        <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, ID, summary, or tag" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="remaining">Remaining work</option>
          <option value="all">All statuses</option>
          {state.statuses.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div className="task-table" role="table" aria-label="Workspace tasks">
        <div className="task-table-head" role="row"><span>Task</span><span>Status</span><span>Area</span><span>Next action</span></div>
        {tasks.map((task) => (
          <button className="task-table-row" role="row" key={task.id} onClick={() => openTask(task)}>
            <span><strong>{task.title}</strong><small>{task.id}</small></span>
            <span><i className={`status-dot status-${task.status}`} /> {state.statuses.find((item) => item.id === task.status)?.label || task.status}</span>
            <span>{state.epics.find((item) => item.id === task.epic)?.title || task.epic || "—"}</span>
            <span>{task.nextAction || task.summary || "Inspect task"}</span>
          </button>
        ))}
        {!tasks.length && <Empty icon={ListTodo} title="No matching tasks">Change the filters or approve a plan that proposes new work.</Empty>}
      </div>
    </section>
  );
}

function Conversations({ workspace, selected, select, refresh }: { workspace: Workspace; selected: string | null; select: (id: string | null) => void; refresh: () => void }) {
  const [query, setQuery] = useState("");
  const runs = workspace.runs.filter((run) => !query || (run.title || run.id).toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="split-screen conversations-screen">
      <aside className="collection-sidebar">
        <header><h2>Conversations</h2><button className="icon-button" onClick={() => select(null)} title="New conversation"><Plus size={19} /></button></header>
        <label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a conversation" /></label>
        <div className="collection-list">
          {runs.map((run) => <button key={run.id} className={selected === run.id ? "collection-item selected" : "collection-item"} onClick={() => select(run.id)}><span className={`status-dot state-${run.state}`} /><span><strong>{run.title || run.id}</strong><small>{stateLabel(run)} · {run.provider || "agent"}</small></span></button>)}
        </div>
      </aside>
      <main className="detail-pane">
        {selected ? <Suspense fallback={<LoadingSurface label="Opening conversation…" />}><Conversation runId={selected} onRefresh={refresh} /></Suspense> : <NewConversation workspace={workspace} onCreated={(id) => { select(id); refresh(); }} />}
      </main>
    </section>
  );
}

function Plans({ workspace, selected, select, refresh }: { workspace: Workspace; selected: string | null; select: (id: string) => void; refresh: () => void }) {
  return (
    <section className="split-screen">
      <aside className="collection-sidebar">
        <header><h2>Plans</h2><span>{workspace.planTotal}</span></header>
        <div className="collection-list">{workspace.plans.map((plan) => <button key={plan.id} className={selected === plan.id ? "collection-item selected" : "collection-item"} onClick={() => select(plan.id)}><FileCode2 size={17} /><span><strong>{plan.title}</strong><small>{plan.state || "draft"} · revision {plan.revision || 1}</small></span></button>)}</div>
      </aside>
      <main className="detail-pane">{selected ? <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><PlanEditor id={selected} onSaved={refresh} /></Suspense> : <Empty icon={FileCode2} title="Choose a plan">Edit Markdown in Monaco, inspect its diff, render a preview, then approve the exact reviewed revision.</Empty>}</main>
    </section>
  );
}

function Documents({ selected, select, refresh }: { selected: string | null; select: (id: string) => void; refresh: () => void }) {
  const docs = useRemote(() => get<{ documents: DocumentRecord[]; total: number }>("/api/documents"), []);
  return (
    <section className="split-screen">
      <aside className="collection-sidebar">
        <header><h2>Documents</h2><span>{docs.data?.total || 0}</span></header>
        <div className="collection-list">{docs.data?.documents.map((doc) => <button key={doc.id} className={selected === doc.id ? "collection-item selected" : "collection-item"} onClick={() => select(doc.id)}><FileText size={17} /><span><strong>{doc.title}</strong><small>{doc.path}</small></span></button>)}</div>
      </aside>
      <main className="detail-pane">{selected ? <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><DocumentEditor id={selected} onSaved={() => { void docs.reload(); refresh(); }} /></Suspense> : <Empty icon={FileText} title="Choose a document">Monaco provides source editing, keyboard depth, a rendered Markdown preview, and revision-safe saves.</Empty>}</main>
    </section>
  );
}

function Graph({ state, openTask }: { state: State; openTask: (task: Task) => void }) {
  const tasks = state.tasks.slice(0, 80);
  const positions = useMemo(() => new Map(tasks.map((task, index) => [task.id, { x: 110 + (index % 4) * 250, y: 90 + Math.floor(index / 4) * 120 }])), [tasks]);
  const width = Math.max(1000, 110 + Math.min(4, tasks.length) * 250);
  const height = Math.max(620, 150 + Math.ceil(tasks.length / 4) * 120);
  return (
    <section className="screen graph-screen">
      <header className="screen-heading"><div><h1>Dependency graph</h1><p>Prerequisite and sequencing relationships.</p></div><span>{tasks.length} tasks · {state.edges.length} relationships</span></header>
      <div className="graph-canvas"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Task dependency graph">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
        {state.edges.map((edge, index) => { const from = positions.get(edge.from), to = positions.get(edge.to); return from && to ? <line key={edge.id || index} x1={from.x + 82} y1={from.y} x2={to.x - 82} y2={to.y} markerEnd="url(#arrow)" className={`edge edge-${edge.kind}`} /> : null; })}
        {tasks.map((task) => { const point = positions.get(task.id)!; return <g key={task.id} transform={`translate(${point.x - 82} ${point.y - 32})`} onClick={() => openTask(task)} role="button" tabIndex={0}><rect width="164" height="64" rx="12" className={`graph-node status-${task.status}`} /><text x="12" y="24">{task.title.slice(0, 22)}</text><text x="12" y="45" className="node-meta">{task.status} · {task.id.slice(0, 18)}</text></g>; })}
      </svg></div>
    </section>
  );
}

function TaskDrawer({ task, state, close, refresh }: { task: Task; state: State; close: () => void; refresh: () => void }) {
  const [status, setStatus] = useState(task.status);
  const [nextAction, setNextAction] = useState(task.nextAction || "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await command("task.update", { id: task.id, status, nextAction }, state.revision); refresh(); close(); }
    finally { setBusy(false); }
  }
  return <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><aside className="task-drawer"><header><div><span className="eyebrow">Task</span><h2>{task.title}</h2></div><button className="icon-button" onClick={close}><X size={20} /></button></header><code>{task.id}</code><p>{task.summary || "No summary recorded."}</p><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{state.statuses.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Next action<textarea value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>{!!task.acceptance?.length && <section><h3>Acceptance</h3><ul>{task.acceptance.map((item) => <li key={item}>{item}</li>)}</ul></section>}<button className="button primary" disabled={busy} onClick={save}>Save task</button></aside></div>;
}

function SettingsView({ workspace, state }: { workspace: Workspace; state: State }) {
  return <section className="screen settings-screen"><header className="screen-heading"><div><h1>Settings</h1><p>Workspace, provider, and execution configuration.</p></div></header><div className="settings-grid"><article className="panel"><Boxes size={18} /><h2>{state.project?.workspaceName || state.project?.title || state.project?.name || "Avoozl"}</h2><dl><dt>Storage revision</dt><dd>{workspace.revision}</dd><dt>Mode</dt><dd>{workspace.mode || "local"}</dd><dt>Agent host</dt><dd>{workspace.agentHost?.connected ? "Connected" : "Offline"}</dd><dt>Publication queue</dt><dd>{workspace.publication?.pending?.length || 0}</dd></dl></article><article className="panel"><Bot size={18} /><h2>Providers</h2>{workspace.providers.map((provider) => <p key={provider.id || provider.name}><strong>{provider.label || provider.name || provider.id}</strong></p>)}</article><article className="panel"><GitBranch size={18} /><h2>Execution projects</h2>{workspace.projects.map((project) => <p key={project.id}><strong>{project.name || project.id}</strong><br /><small>{project.root || project.path}</small></p>)}</article></div></section>;
}

export function App() {
  const initial = useMemo(initialLocation, []);
  const [view, setView] = useState<View>(initial.view);
  const [runId, setRunId] = useState<string | null>(initial.runId);
  const [planId, setPlanId] = useState<string | null>(initial.planId);
  const [documentId, setDocumentId] = useState<string | null>(initial.documentId);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const workspace = useRemote(loadWorkspace, []);
  const state = useRemote(loadState, []);
  const refresh = () => { void Promise.all([workspace.reload(), state.reload()]); };
  useWorkspaceEvents(refresh);

  useEffect(() => {
    const query = new URLSearchParams();
    query.set("view", view);
    if (view === "conversations" && runId) query.set("run", runId);
    if (view === "plans" && planId) query.set("plan", planId);
    if (view === "documents" && documentId) query.set("document", documentId);
    history.replaceState(null, "", "?" + query);
  }, [view, runId, planId, documentId]);

  function navigate(next: View) { setView(next); setNavOpen(false); }
  function openRun(id: string) { setRunId(id); navigate("conversations"); }
  function openPlan(id: string) { setPlanId(id); navigate("plans"); }
  function openDocument(id: string) { setDocumentId(id); navigate("documents"); }

  if (!workspace.data || !state.data) return <div className="boot-screen"><div className="brand-mark"><Sparkles /></div><h1>Avoozl</h1><p>{workspace.error?.message || state.error?.message || "Opening workspace…"}</p></div>;
  const workspaceData = workspace.data;
  const stateData = state.data;
  const workspaceName = stateData.project?.workspaceName || stateData.project?.title || stateData.project?.name || "Avoozl";
  const currentView = views.find((item) => item.id === view)!;
  return (
    <div className="app-shell">
      <aside className={navOpen ? "app-nav open" : "app-nav"}>
        <div className="brand"><div className="brand-mark">a</div><strong title={workspaceName}>{workspaceName}</strong><button className="mobile-close" onClick={() => setNavOpen(false)}><PanelLeftClose size={17} /></button></div>
        <nav>{views.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={16} /><span>{label}</span>{id === "conversations" && workspaceData.requests.length > 0 && <b>{workspaceData.requests.length}</b>}</button>)}</nav>
        <div className="nav-foot"><button className="mcp-button">MCP</button><span className={workspaceData.agentHost?.connected ? "live-light connected" : "live-light"} title={workspaceData.agentHost?.connected ? "Agent host connected" : "Agent host offline"} /><button onClick={refresh} title="Refresh"><RefreshCw size={14} /></button></div>
      </aside>
      <main className="app-main">
        <header className="app-toolbar"><button className="mobile-menu" onClick={() => setNavOpen(true)}><Menu size={18} /></button><strong>{currentView.label}</strong><span className="toolbar-rule" /><span>{stateData.tasks.length} tasks</span><div className="toolbar-spacer" /><span className={workspaceData.agentHost?.connected ? "live-light connected" : "live-light"} /><span>{workspaceData.agentHost?.connected ? "Connected" : "Offline"}</span><button onClick={refresh} title="Refresh"><RefreshCw size={14} /></button></header>
        {view === "overview" && <Overview workspace={workspaceData} state={stateData} openRun={openRun} openTask={setDrawerTask} />}
        {view === "tasks" && <Tasks state={stateData} openTask={setDrawerTask} />}
        {view === "conversations" && <Conversations workspace={workspaceData} selected={runId} select={setRunId} refresh={refresh} />}
        {view === "plans" && <Plans workspace={workspaceData} selected={planId} select={openPlan} refresh={refresh} />}
        {view === "documents" && <Documents selected={documentId} select={openDocument} refresh={refresh} />}
        {view === "graph" && <Graph state={stateData} openTask={setDrawerTask} />}
        {view === "settings" && <SettingsView workspace={workspaceData} state={stateData} />}
      </main>
      {drawerTask && <TaskDrawer task={drawerTask} state={stateData} close={() => setDrawerTask(null)} refresh={refresh} />}
    </div>
  );
}
