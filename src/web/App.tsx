import {
  Activity,
  BookOpen,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileCode2,
  FileText,
  Filter,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { command, get, submissionId } from "./api";
import { loadState, loadWorkspace, useRemote, useWorkspaceEvents } from "./hooks";
import type { DocumentRecord, PlanSummary, RunSummary, State, Task, Workspace } from "./types";

const Conversation = lazy(() => import("./Chat").then((module) => ({ default: module.Conversation })));
const PlanEditor = lazy(() => import("./Editors").then((module) => ({ default: module.PlanEditor })));
const DocumentEditor = lazy(() => import("./Editors").then((module) => ({ default: module.DocumentEditor })));
const MarkdownPreview = lazy(() => import("./Editors").then((module) => ({ default: module.MarkdownPreview })));

type View = "overview" | "tasks" | "strip" | "epics" | "graph" | "documents" | "conversations" | "plans" | "settings";

const views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Now", icon: Activity },
  { id: "tasks", label: "Task tree", icon: ListTodo },
  { id: "strip", label: "Single strip", icon: GitBranch },
  { id: "epics", label: "Epic progress", icon: Boxes },
  { id: "graph", label: "Dependency graph", icon: Network },
  { id: "documents", label: "Plans", icon: FileText },
];

const internalViews = new Set<View>(["conversations", "plans", "settings"]);

function initialLocation() {
  const query = new URLSearchParams(location.search);
  const requested = query.get("view") as View | null;
  return {
    view: (views.some((item) => item.id === requested) || (requested && internalViews.has(requested))) ? requested! : (query.get("run") ? "conversations" : query.get("plan") ? "plans" : query.get("document") ? "documents" : "overview"),
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

function storedNumber(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function useStoredSize(key: string, fallback: number, min: number, max: number) {
  const [size, setRawSize] = useState(() => storedNumber(key, fallback));
  const setSize = useCallback((value: number) => {
    const next = Math.max(min, Math.min(max, value));
    setRawSize(next);
    try { localStorage.setItem(key, String(next)); } catch {}
  }, [key, max, min]);
  return [size, setSize] as const;
}

function ResizeHandle({ value, setValue, min, max, label, invert = false, className = "" }: {
  value: number;
  setValue: (value: number) => void;
  min: number;
  max: number;
  label: string;
  invert?: boolean;
  className?: string;
}) {
  function start(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startValue = value;
    const move = (next: PointerEvent) => setValue(startValue + (next.clientX - startX) * (invert ? -1 : 1));
    const stop = () => {
      document.body.classList.remove("resizing-panels");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    document.body.classList.add("resizing-panels");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }
  return <div
    className={`resize-handle ${className}`}
    role="separator"
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(value)}
    tabIndex={0}
    onPointerDown={start}
    onKeyDown={(event) => {
      if (event.key === "ArrowLeft") setValue(value + (invert ? 16 : -16));
      if (event.key === "ArrowRight") setValue(value + (invert ? -16 : 16));
      if (event.key === "Home") setValue(min);
      if (event.key === "End") setValue(max);
    }}
  />;
}

function SplitScreen({ storageKey, className = "", sidebar, children }: {
  storageKey: string;
  className?: string;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [width, setWidth] = useStoredSize(storageKey, 260, 190, 520);
  return <section className={`split-screen ${className}`} style={{ "--collection-width": `${width}px` } as React.CSSProperties}>
    {sidebar}
    <ResizeHandle value={width} setValue={setWidth} min={190} max={520} label="Resize side panel" />
    <main className="detail-pane">{children}</main>
  </section>;
}

function Empty({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return <div className="empty-state"><Icon size={26} /><h3>{title}</h3><p>{children}</p></div>;
}

function LoadingSurface({ label }: { label: string }) {
  return <div className="center-state"><RefreshCw className="spin" size={22} /><p>{label}</p></div>;
}

function Overview({ workspace, state, openRun, openTask }: { workspace: Workspace; state: State; openRun: (id: string) => void; openTask: (task: Task) => void }) {
  const [asking, setAsking] = useState(false);
  const activeStates = new Set(["starting", "running", "waiting-input", "waiting-approval"]);
  const activeRuns = workspace.runs.filter((run) => activeStates.has(run.state));
  const complete = new Set(state.statuses.filter((status) => status.complete).map((status) => status.id));
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const ready = state.tasks.filter((task) => !complete.has(task.status) && task.status !== "blocked" && !activeRuns.some((run) => run.taskId === task.id));
  const reported = state.tasks.filter((task) => task.activity?.status === "active" && !activeRuns.some((run) => run.taskId === task.id));
  const completed = state.tasks.filter((task) => complete.has(task.status)).slice(-8).reverse();
  const taskRow = (task: Task) => <button className="hub-work-row" key={task.id} onClick={() => openTask(task)}>
    <span className={`hub-work-marker status-${task.status}`} />
    <span className="hub-work-copy"><strong className="hub-task-name">{task.title}</strong><small>{task.id} · {state.statuses.find((status) => status.id === task.status)?.label || task.status}</small>{(task.nextAction || task.summary) && <span>{task.nextAction || task.summary}</span>}</span>
    <span className="hub-row-actions">Open →</span>
  </button>;
  const runRow = (run: RunSummary) => <button className="hub-work-row" key={run.id} onClick={() => openRun(run.id)}>
    <span className={`hub-work-marker state-${run.state}`} />
    <span className="hub-work-copy"><strong className="hub-task-name">{run.title || state.tasks.find((task) => task.id === run.taskId)?.title || run.id}</strong><small>{stateLabel(run)} · {run.provider || "agent"}</small>{run.error && <span>{typeof run.error === "string" ? run.error : run.error.message}</span>}</span>
    <span className="hub-row-actions">Open →</span>
  </button>;
  async function askAboutBlockers() {
    setAsking(true);
    try {
      const id = submissionId();
      const result = await command<any>("intent.submit", {
        action: "ask",
        prompt: "Review the current workspace and explain what is blocked, why it is blocked, and the most useful operator decisions or next actions.",
        provider: workspace.providers[0]?.id || workspace.providers[0]?.name,
        approvalMode: "manual",
        submissionId: id,
        runId: "run-" + id,
        context: {},
      });
      if (result.run?.id) openRun(result.run.id);
    } finally {
      setAsking(false);
    }
  }
  return (
    <section className="screen hub-screen">
      <header className="hub-heading"><div><span className="hub-date">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span><h1>Now</h1><p>Current work, decisions, and delivery state.</p></div><button className="button primary" disabled={asking} onClick={askAboutBlockers}>{asking ? "Starting…" : "Ask about blockers"}</button></header>
      <div className="hub-pulse" style={{ "--hub-pulse-columns": workspace.requests.length ? 4 : 3 } as React.CSSProperties}>
        <button onClick={() => document.getElementById("hub-working")?.scrollIntoView()}><strong>{activeRuns.length + reported.length}</strong><span>In progress</span></button>
        {!!workspace.requests.length && <button onClick={() => document.getElementById("hub-decisions")?.scrollIntoView()}><strong>{workspace.requests.length}</strong><span>Need your input</span></button>}
        <button onClick={() => document.getElementById("hub-blocked")?.scrollIntoView()}><strong>{blocked.length}</strong><span>Blocked</span></button>
        <button onClick={() => document.getElementById("hub-ready")?.scrollIntoView()}><strong>{ready.length}</strong><span>Ready next</span></button>
      </div>
      {!!workspace.requests.length && <section className="hub-section" id="hub-decisions"><header><div><span className="hub-kicker">Decisions</span><h2>Needs your input</h2></div><span>{workspace.requests.length}</span></header>{workspace.requests.map((request) => {
        const run = workspace.runs.find((item) => item.id === request.runId);
        return <button className="hub-decision-row" key={request.id} onClick={() => openRun(request.runId)}><ShieldAlert size={15} /><span><strong>{run?.title || request.runId}</strong><small>{request.kind === "approval" ? "Approval requested" : "Answer requested"}</small></span><span>Review →</span></button>;
      })}</section>}
      <section className="hub-section" id="hub-working"><header><div><span className="hub-kicker">Working</span><h2>In progress</h2></div><span>{activeRuns.length + reported.length}</span></header>{activeRuns.map(runRow)}{reported.map(taskRow)}{!activeRuns.length && !reported.length && <p className="hub-empty">No work is active.</p>}</section>
      <section className="hub-section" id="hub-ready"><header><div><span className="hub-kicker">Up next</span><h2>Ready to start</h2></div><span>{ready.length}</span></header>{ready.slice(0, 12).map(taskRow)}{!ready.length && <p className="hub-empty">No work is ready.</p>}</section>
      <details className="hub-fold" id="hub-blocked" open={blocked.length > 0 || undefined}><summary><span><span className="hub-kicker">Blocked</span><strong>Blocked work</strong></span><small>{blocked.length}</small><ChevronDown size={15} /></summary><div>{blocked.map(taskRow)}{!blocked.length && <p className="hub-empty">No blocked work.</p>}</div></details>
      {!!completed.length && <details className="hub-fold"><summary><span><span className="hub-kicker">Completed</span><strong>Recently updated completed work</strong></span><small>{completed.length}</small><ChevronDown size={15} /></summary><div>{completed.map(taskRow)}</div></details>}
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

type TaskFilters = {
  query: string;
  scopes: string[];
  work: string[];
  statuses: string[];
  epics: string[];
  tracks: string[];
  tags: string[];
  activity: string[];
  historical: boolean;
};
type TaskArrayFilterKey = "scopes" | "work" | "statuses" | "epics" | "tracks" | "tags" | "activity";

const emptyTaskFilters: TaskFilters = {
  query: "",
  scopes: [],
  work: [],
  statuses: [],
  epics: [],
  tracks: [],
  tags: [],
  activity: [],
  historical: false,
};

function FacetGroup({ title, values, selected, toggle, searchable = false, open = false }: {
  title: string;
  values: Array<{ id: string; label: string; count: number }>;
  selected: string[];
  toggle: (id: string) => void;
  searchable?: boolean;
  open?: boolean;
}) {
  const [find, setFind] = useState("");
  const shown = values.filter((item) => !find || item.label.toLowerCase().includes(find.toLowerCase()));
  return <details className="shopping-facet" open={open || undefined}>
    <summary>{title}</summary>
    <div className="facet-body">
      {searchable && <input className="facet-find" type="search" value={find} onChange={(event) => setFind(event.target.value)} placeholder={`Find ${title.toLowerCase()}…`} />}
      <div className="facet-options">
        {shown.map((item) => <label className={`facet-option ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
          <span>{item.label}</span><small>{item.count}</small>
        </label>)}
        {!shown.length && <p className="facet-empty">No matching values.</p>}
      </div>
    </div>
  </details>;
}

function TaskFacets({ state, filters, setFilters, count }: {
  state: State;
  filters: TaskFilters;
  setFilters: React.Dispatch<React.SetStateAction<TaskFilters>>;
  count: number;
}) {
  const complete = new Set(state.statuses.filter((item) => item.complete).map((item) => item.id));
  const countFor = (key: "scope" | "status" | "epic" | "track" | "tag", value: string) =>
    state.tasks.filter((task) => key === "tag" ? task.tags?.includes(value) : (task[key] || (key === "scope" ? "runtime" : "")) === value).length;
  const toggle = (key: TaskArrayFilterKey, value: string, exclusive = false) =>
    setFilters((current) => ({ ...current, [key]: exclusive ? (current[key].includes(value) ? [] : [value]) : current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  const chips = ([
    ["scopes", "Collection"],
    ["work", "Work"],
    ["statuses", "Status"],
    ["epics", "Epic"],
    ["tracks", "Track"],
    ["tags", "Tag"],
    ["activity", "Check-in"],
  ] as const).flatMap(([key, label]) => filters[key].map((value) => ({ key, label, value })));
  return <aside className="facet-sidebar" aria-label="Filters">
    <label className="search-label" htmlFor="task-search">Search tasks</label>
    <div className="query-box"><textarea id="task-search" rows={2} value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search title, ID, summary, or tag…" /></div>
    {!!chips.length && <div className="applied-filters">
      <div className="applied-heading"><span>Applied filters</span><button onClick={() => setFilters(emptyTaskFilters)}>Clear all</button></div>
      {chips.map((chip) => <button className="applied-filter" key={`${chip.key}:${chip.value}`} onClick={() => toggle(chip.key, chip.value)}><span>{chip.label}:</span> {chip.value} ×</button>)}
    </div>}
    <div className="facet-bank">
      <FacetGroup title="Collection" open selected={filters.scopes} toggle={(value) => toggle("scopes", value, true)} values={[
        { id: "all", label: "All plans", count: state.tasks.length },
        { id: "runtime", label: "Runtime delivery", count: state.tasks.filter((task) => !task.scope || task.scope === "runtime").length },
      ]} />
      <FacetGroup title="Work state" open selected={filters.work} toggle={(value) => toggle("work", value)} values={[
        { id: "ready", label: "Ready to start", count: state.tasks.filter((task) => !complete.has(task.status) && task.status !== "blocked" && task.activity?.status !== "active").length },
        { id: "inflight", label: "In progress", count: state.tasks.filter((task) => task.activity?.status === "active" || task.status === "in-progress").length },
        { id: "review", label: "Needs review", count: state.tasks.filter((task) => task.status.includes("review")).length },
      ]} />
      <FacetGroup title="Status" open selected={filters.statuses} toggle={(value) => toggle("statuses", value)} values={state.statuses.map((item) => ({ id: item.id, label: item.label, count: countFor("status", item.id) }))} />
      <FacetGroup title="Epic" open searchable selected={filters.epics} toggle={(value) => toggle("epics", value)} values={state.epics.map((item) => ({ id: item.id, label: item.title, count: countFor("epic", item.id) }))} />
      <FacetGroup title="Track" searchable selected={filters.tracks} toggle={(value) => toggle("tracks", value)} values={state.tracks.map((item) => ({ id: item.id, label: item.label, count: countFor("track", item.id) }))} />
      <FacetGroup title="Tags" searchable selected={filters.tags} toggle={(value) => toggle("tags", value)} values={[...new Set(state.tasks.flatMap((task) => task.tags || []))].sort().map((tag) => ({ id: tag, label: tag, count: countFor("tag", tag) }))} />
      <FacetGroup title="Check-in" selected={filters.activity} toggle={(value) => toggle("activity", value)} values={[
        { id: "active", label: "Fresh", count: state.tasks.filter((task) => task.activity?.status === "active").length },
        { id: "stale", label: "Expired", count: state.tasks.filter((task) => task.activity?.status === "stale").length },
        { id: "paused", label: "Paused", count: state.tasks.filter((task) => task.activity?.status === "paused").length },
      ]} />
      <section className="history-facet"><label className="facet-option"><input type="checkbox" checked={filters.historical} onChange={(event) => setFilters((current) => ({ ...current, historical: event.target.checked }))} /><span>Include historical records</span><small>{state.tasks.filter((task) => task.tags?.includes("historical")).length}</small></label></section>
    </div>
    <p className="facet-result-count">{count} matching tasks</p>
  </aside>;
}

function filteredTasks(state: State, filters: TaskFilters) {
  const complete = new Set(state.statuses.filter((item) => item.complete).map((item) => item.id));
  return state.tasks.filter((task) => {
    const text = `${task.id} ${task.title} ${task.summary || ""} ${(task.tags || []).join(" ")}`.toLowerCase();
    if (filters.query && !text.includes(filters.query.toLowerCase())) return false;
    if (filters.scopes.length && !filters.scopes.includes("all") && !filters.scopes.includes(task.scope || "runtime")) return false;
    if (filters.statuses.length && !filters.statuses.includes(task.status)) return false;
    if (filters.epics.length && !filters.epics.includes(task.epic || "")) return false;
    if (filters.tracks.length && !filters.tracks.includes(task.track || "")) return false;
    if (filters.tags.length && !filters.tags.some((tag) => task.tags?.includes(tag))) return false;
    if (filters.activity.length && !filters.activity.includes(task.activity?.status || "")) return false;
    if (!filters.historical && task.tags?.includes("historical")) return false;
    if (filters.work.includes("inflight") && !(task.activity?.status === "active" || task.status === "in-progress")) return false;
    if (filters.work.includes("review") && !task.status.includes("review")) return false;
    if (filters.work.includes("ready") && (complete.has(task.status) || task.status === "blocked" || task.activity?.status === "active")) return false;
    return true;
  });
}

function FacetedWorkbench({ state, filters, setFilters, children }: {
  state: State;
  filters: TaskFilters;
  setFilters: React.Dispatch<React.SetStateAction<TaskFilters>>;
  children: (tasks: Task[]) => React.ReactNode;
}) {
  const tasks = filteredTasks(state, filters);
  return <section className="faceted-screen"><TaskFacets state={state} filters={filters} setFilters={setFilters} count={tasks.length} /><div className="faceted-main">{children(tasks)}</div></section>;
}

function Tasks({ state, tasks, openTask }: { state: State; tasks: Task[]; openTask: (task: Task) => void }) {
  return (
      <section className="screen tasks-screen">
        <header className="screen-heading">
          <div><h1>Task tree</h1><p>Workspace tasks and their current delivery state.</p></div>
          <span>{tasks.length} of {state.tasks.length}</span>
        </header>
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
          {!tasks.length && <Empty icon={ListTodo} title="No matching tasks">Change or clear the filters.</Empty>}
        </div>
      </section>
  );
}

function Conversations({ workspace, selected, select, refresh }: { workspace: Workspace; selected: string | null; select: (id: string | null) => void; refresh: () => void }) {
  const [query, setQuery] = useState("");
  const runs = workspace.runs.filter((run) => !query || (run.title || run.id).toLowerCase().includes(query.toLowerCase()));
  return (
    <SplitScreen storageKey="avoozl-conversation-list-width" className="conversations-screen" sidebar={
      <aside className="collection-sidebar">
        <header><h2>Conversations</h2><button className="icon-button" onClick={() => select(null)} title="New conversation"><Plus size={19} /></button></header>
        <label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a conversation" /></label>
        <div className="collection-list">
          {runs.map((run) => <button key={run.id} className={selected === run.id ? "collection-item selected" : "collection-item"} onClick={() => select(run.id)}><span className={`status-dot state-${run.state}`} /><span><strong>{run.title || run.id}</strong><small>{stateLabel(run)} · {run.provider || "agent"}</small></span></button>)}
        </div>
      </aside>
    }>
      {selected ? <Suspense fallback={<LoadingSurface label="Opening conversation…" />}><Conversation runId={selected} onRefresh={refresh} /></Suspense> : <NewConversation workspace={workspace} onCreated={(id) => { select(id); refresh(); }} />}
    </SplitScreen>
  );
}

function Plans({ workspace, selected, select, refresh }: { workspace: Workspace; selected: string | null; select: (id: string) => void; refresh: () => void }) {
  return (
    <SplitScreen storageKey="avoozl-plan-list-width" sidebar={
      <aside className="collection-sidebar">
        <header><h2>Plans</h2><span>{workspace.planTotal}</span></header>
        <div className="collection-list">{workspace.plans.map((plan) => <button key={plan.id} className={selected === plan.id ? "collection-item selected" : "collection-item"} onClick={() => select(plan.id)}><FileCode2 size={17} /><span><strong>{plan.title}</strong><small>{plan.state || "draft"} · revision {plan.revision || 1}</small></span></button>)}</div>
      </aside>
    }>{selected ? <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><PlanEditor id={selected} onSaved={refresh} /></Suspense> : <Empty icon={FileCode2} title="Choose a plan">Edit Markdown in Monaco, inspect its diff, render a preview, then approve the exact reviewed revision.</Empty>}</SplitScreen>
  );
}

function DocumentDetail({ id, close, refresh }: { id: string; close: () => void; refresh: () => void }) {
  const remote = useRemote(() => command<DocumentRecord>("document.get", { id }), [id]);
  const [editing, setEditing] = useState(false);
  return <div className="inspector-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <aside className={`document-inspector ${editing ? "editing" : ""}`}>
      <header className="document-heading">
        <div><span className="eyebrow">Plan</span><h1>{remote.data?.title || id}</h1><small>{remote.data?.path || id}</small></div>
        <div className="document-heading-actions">
          {remote.data && <button className="button subtle" onClick={() => setEditing((value) => !value)}><Pencil size={14} /> {editing ? "Read plan" : "Edit Markdown"}</button>}
          <button className="icon-button" onClick={close} aria-label="Close plan"><X size={18} /></button>
        </div>
      </header>
      {!remote.data ? <LoadingSurface label={remote.error?.message || "Opening plan…"} /> : editing ?
        <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><DocumentEditor id={id} onSaved={() => { void remote.reload(); refresh(); }} /></Suspense> :
        <div className="document-page">
          {!!remote.data.taskIds?.length && <details className="doc-links"><summary>{remote.data.taskIds.length} linked tasks</summary>{remote.data.taskIds.map((taskId) => <code key={taskId}>{taskId}</code>)}</details>}
          <Suspense fallback={<LoadingSurface label="Rendering plan…" />}><MarkdownPreview text={remote.data.text || ""} /></Suspense>
        </div>}
    </aside>
  </div>;
}

function Documents({ workspace, state, selected, select, selectedPlan, selectPlan, refresh }: {
  workspace: Workspace;
  state: State;
  selected: string | null;
  select: (id: string | null) => void;
  selectedPlan: string | null;
  selectPlan: (id: string | null) => void;
  refresh: () => void;
}) {
  const docs = useRemote(() => get<{ documents: DocumentRecord[]; total: number }>("/api/documents"), [workspace.revision]);
  const [section, setSection] = useState<"library" | "proposals">(selectedPlan ? "proposals" : "library");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"category" | "branch" | "status" | "folder">("category");
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>([]);
  useEffect(() => { if (selectedPlan) setSection("proposals"); }, [selectedPlan]);
  const records = docs.data?.documents || [];
  const filtered = records.filter((doc) => {
    if (query && !`${doc.title} ${doc.id} ${doc.path} ${doc.summary || ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (visibleStatuses.length && !visibleStatuses.includes(doc.status || "active")) return false;
    return true;
  });
  const groupName = (doc: DocumentRecord) => group === "folder" ? (doc.path || doc.id).split("/")[0] :
    group === "status" ? (doc.status || "Active") :
    group === "branch" ? ((doc as any).targetBranch || "Unassigned") :
    ((doc as any).category || "Uncategorized");
  const grouped = [...new Set(filtered.map(groupName))].sort().map((name) => ({ name, docs: filtered.filter((doc) => groupName(doc) === name) }));
  const statuses = [...new Set(records.map((doc) => doc.status || "active"))].sort();
  return <section className="plans-screen">
    <header className="plans-toolbar">
      <div className="plans-sections" role="tablist" aria-label="Plans sections">
        <button role="tab" aria-selected={section === "library"} onClick={() => { setSection("library"); selectPlan(null); }}>Library</button>
        <button role="tab" aria-selected={section === "proposals"} onClick={() => setSection("proposals")}>Proposals</button>
      </div>
      {section === "library" && <div className="plans-controls">
        <label className="plan-search-label"><span className="sr-only">Search plans</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans…" /></label>
        <button className="icon-button" title="Write plan" aria-label="Write plan" onClick={() => setSection("proposals")}><Plus size={17} /></button>
        <details className="library-filter-menu">
          <summary title="Plan filters" aria-label="Plan filters"><Filter size={17} /></summary>
          <div className="library-filter-options">
            <label>Group <select value={group} onChange={(event) => setGroup(event.target.value as typeof group)}><option value="category">Feature area</option><option value="branch">Target branch</option><option value="status">Status</option><option value="folder">Folder</option></select></label>
            <div className="library-statuses">{statuses.map((status) => <button key={status} aria-pressed={visibleStatuses.includes(status)} onClick={() => setVisibleStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status])}>{status.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())}<span>({records.filter((doc) => (doc.status || "active") === status).length})</span></button>)}</div>
          </div>
        </details>
      </div>}
    </header>
    {section === "library" ? <div className="library-window">
      <div className="library-scroll-heading"><h2>Plan library</h2><p>{filtered.length} plans{query ? ` matching “${query}”` : ""}</p></div>
      {grouped.map((item) => <section className="library-group" key={item.name}><h3 className="virtual-group-heading">{item.name} <span>{item.docs.length}</span></h3>{item.docs.map((doc) => {
        const linked = doc.taskIds?.length || 0;
        const done = doc.taskIds?.filter((id) => state.statuses.find((status) => status.id === state.tasks.find((task) => task.id === id)?.status)?.complete).length || 0;
        const percent = linked ? Math.round(done / linked * 100) : 0;
        return <button className="doc-card" key={doc.id} onClick={() => select(doc.id)}><div><b>{doc.title}</b><small>{(doc as any).targetBranch || doc.path}</small></div><div className="doc-card-progress"><span>{doc.status || "Active"} · {percent}%</span><div className="plan-meter"><i style={{ width: `${percent}%` }} /></div></div></button>;
      })}</section>)}
      {!filtered.length && <Empty icon={BookOpen} title="No matching plans">Change the search or plan filters.</Empty>}
    </div> : <div className="proposal-browser">
      {selectedPlan ? <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><PlanEditor id={selectedPlan} onSaved={refresh} /></Suspense> : <>
        <div className="library-heading"><h2>Proposals</h2><button className="button subtle"><Plus size={14} /> Write plan</button></div>
        <div className="proposal-list">{workspace.plans.map((plan) => <button className="proposal-row" key={plan.id} onClick={() => selectPlan(plan.id)}><span><b>{plan.title}</b><small>Revision {plan.revision || 1}</small></span><span>{plan.state || "draft"}</span></button>)}</div>
        {!workspace.plans.length && <p className="muted">No proposals yet.</p>}
      </>}
    </div>}
    {selected && <DocumentDetail id={selected} close={() => select(null)} refresh={() => { void docs.reload(); refresh(); }} />}
  </section>;
}

function SingleStrip({ state, openTask }: { state: State; openTask: (task: Task) => void }) {
  const statusOrder = state.statuses.map((status) => status.id);
  return <section className="screen strip-screen">
    <header className="screen-heading"><div><h1>Single strip</h1><p>Work arranged across delivery stages.</p></div><span>{state.tasks.length} tasks</span></header>
    <div className="delivery-strip">{state.statuses.map((status) => {
      const tasks = state.tasks.filter((task) => task.status === status.id);
      return <section className="strip-stage-column" key={status.id}><header><span className={`status-dot status-${status.id}`} /><strong>{status.label}</strong><small>{tasks.length}</small></header><div>{tasks.map((task) => <button key={task.id} onClick={() => openTask(task)}><strong>{task.title}</strong><small>{task.id}</small></button>)}</div></section>;
    })}</div>
    {!statusOrder.length && <Empty icon={GitBranch} title="No delivery stages">Configure task statuses to populate the strip.</Empty>}
  </section>;
}

function EpicProgress({ state, openTask }: { state: State; openTask: (task: Task) => void }) {
  const complete = new Set(state.statuses.filter((status) => status.complete).map((status) => status.id));
  return <section className="screen epics-screen">
    <header className="screen-heading"><div><h1>Epic progress</h1><p>Completion and remaining work by epic.</p></div><span>{state.epics.length} epics</span></header>
    <div className="epic-list">{state.epics.map((epic) => {
      const tasks = state.tasks.filter((task) => task.epic === epic.id);
      const done = tasks.filter((task) => complete.has(task.status)).length;
      const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      return <details className="epic-progress-card" key={epic.id}><summary><div><small>{epic.id}</small><h2>{epic.title}</h2><span>{tasks.length - done} remaining · {tasks.length} total tasks</span></div><div className="epic-meter"><strong>{percent}%</strong><div className="plan-meter"><i style={{ width: `${percent}%` }} /></div></div></summary><div className="epic-task-list">{tasks.map((task) => <button key={task.id} onClick={() => openTask(task)}><span>{task.title}</span><small>{state.statuses.find((status) => status.id === task.status)?.label || task.status}</small></button>)}</div></details>;
    })}</div>
  </section>;
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
  const [workbenchFilters, setWorkbenchFilters] = useState<TaskFilters>(emptyTaskFilters);
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem("nupp-navigation-collapsed") === "true"; } catch { return false; }
  });
  const [navWidth, setNavWidth] = useStoredSize("avoozl-navigation-width", 196, 160, 360);
  const workspace = useRemote(loadWorkspace, []);
  const state = useRemote(loadState, []);
  const refresh = () => { void Promise.all([workspace.reload(), state.reload()]); };
  useWorkspaceEvents(refresh);

  useEffect(() => {
    const query = new URLSearchParams();
    query.set("view", view);
    if (view === "conversations" && runId) query.set("run", runId);
    if (view === "plans" && planId) query.set("plan", planId);
    if (view === "documents") {
      if (documentId) query.set("document", documentId);
      if (planId) query.set("plan", planId);
    }
    history.replaceState(null, "", "?" + query);
  }, [view, runId, planId, documentId]);

  function navigate(next: View) { setView(next); setNavOpen(false); }
  function openRun(id: string) { setRunId(id); navigate("conversations"); }
  function openPlan(id: string) { setPlanId(id); navigate("plans"); }
  function openDocument(id: string) { setDocumentId(id); navigate("documents"); }
  function toggleNavigation() {
    if (matchMedia("(max-width: 760px)").matches) setNavOpen((value) => !value);
    else setNavCollapsed((value) => {
      const next = !value;
      try { localStorage.setItem("nupp-navigation-collapsed", String(next)); } catch {}
      return next;
    });
  }

  if (!workspace.data || !state.data) return <div className="boot-screen"><div className="brand-mark"><Sparkles /></div><h1>Avoozl</h1><p>{workspace.error?.message || state.error?.message || "Opening workspace…"}</p></div>;
  const workspaceData = workspace.data;
  const stateData = state.data;
  const workspaceName = stateData.project?.workspaceName || stateData.project?.title || stateData.project?.name || "Avoozl";
  const currentView = views.find((item) => item.id === view) || {
    id: view,
    icon: LayoutDashboard,
    label: view === "conversations" ? "Conversation" : view === "plans" ? "Proposal" : "Settings",
  };
  return (
    <div className={`app-shell ${navCollapsed ? "nav-collapsed" : ""}`} style={{ "--nav-width": `${navCollapsed ? 44 : navWidth}px` } as React.CSSProperties}>
      <aside className={navOpen ? "app-nav open" : "app-nav"}>
        <div className="site-brand-row"><a className="brand" href="/" aria-label="Avoozl home"><div className="brand-mark">a</div><span className="brand-label"><strong title={workspaceName}>{workspaceName}</strong><small>Live delivery map</small></span></a><button className="nav-toggle" onClick={toggleNavigation} aria-expanded={!navCollapsed} aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"} title={navCollapsed ? "Expand navigation" : "Collapse navigation"}><Menu size={18} /></button></div>
        <nav>{views.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={16} /><span>{label}</span>{id === "conversations" && workspaceData.requests.length > 0 && <b>{workspaceData.requests.length}</b>}</button>)}</nav>
        <div className="nav-foot"><span className={workspaceData.agentHost?.connected ? "live-light connected" : "live-light"} title={workspaceData.agentHost?.connected ? "Agent host connected" : "Agent host offline"} /><span className="connection-label">{workspaceData.agentHost?.connected ? "Live" : "Offline"}</span><button className="mcp-button">MCP</button><button onClick={() => navigate("settings")} title="Settings"><Settings size={14} /></button><button onClick={refresh} title="Check for updates"><RefreshCw size={14} /></button></div>
        {!navCollapsed && <ResizeHandle value={navWidth} setValue={setNavWidth} min={160} max={360} label="Resize navigation" className="nav-resize-handle" />}
      </aside>
      {navOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <main className="app-main">
        <header className="app-toolbar"><button className="mobile-menu" onClick={toggleNavigation}><Menu size={18} /></button><strong>{currentView.label}</strong><span className="toolbar-rule" /><span>{stateData.tasks.length} tasks</span><div className="toolbar-spacer" /><span className={workspaceData.agentHost?.connected ? "live-light connected" : "live-light"} /><span>{workspaceData.agentHost?.connected ? "Connected" : "Offline"}</span><button onClick={refresh} title="Refresh"><RefreshCw size={14} /></button></header>
        {view === "overview" && <Overview workspace={workspaceData} state={stateData} openRun={openRun} openTask={setDrawerTask} />}
        {view === "tasks" && <FacetedWorkbench state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters}>{(tasks) => <Tasks state={stateData} tasks={tasks} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "strip" && <FacetedWorkbench state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters}>{(tasks) => <SingleStrip state={{ ...stateData, tasks }} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "epics" && <FacetedWorkbench state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters}>{(tasks) => <EpicProgress state={{ ...stateData, tasks }} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "conversations" && <Conversations workspace={workspaceData} selected={runId} select={setRunId} refresh={refresh} />}
        {view === "plans" && <Plans workspace={workspaceData} selected={planId} select={openPlan} refresh={refresh} />}
        {view === "documents" && <Documents workspace={workspaceData} state={stateData} selected={documentId} select={(id) => id ? openDocument(id) : setDocumentId(null)} selectedPlan={planId} selectPlan={setPlanId} refresh={refresh} />}
        {view === "graph" && <FacetedWorkbench state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters}>{(tasks) => <Graph state={{ ...stateData, tasks }} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "settings" && <SettingsView workspace={workspaceData} state={stateData} />}
      </main>
      {drawerTask && <TaskDrawer task={drawerTask} state={stateData} close={() => setDrawerTask(null)} refresh={refresh} />}
    </div>
  );
}
