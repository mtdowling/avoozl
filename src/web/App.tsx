import {
  Activity,
  BarChart3,
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
  Maximize2,
  Menu,
  MessageSquare,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEpicProgress } from "../progress.mjs";
import { createSingleStrip } from "../strip.mjs";
import { createWorkbench } from "../workbench.mjs";
import { dependencyLayout, dependencyPath, NODE_H, NODE_W } from "../graph-layout.mjs";
import { renderUsage } from "../app/ui/usage-charts.mjs";
import { command, get, submissionId } from "./api";
import { loadState, loadWorkspace, useRemote, useWorkspaceEvents } from "./hooks";
import type { DocumentRecord, PlanSummary, RunSummary, SavedView, State, Task, Workspace } from "./types";

const Conversation = lazy(() => import("./Chat").then((module) => ({ default: module.Conversation })));
const PlanEditor = lazy(() => import("./Editors").then((module) => ({ default: module.PlanEditor })));
const DocumentEditor = lazy(() => import("./Editors").then((module) => ({ default: module.DocumentEditor })));
const MarkdownPreview = lazy(() => import("./Editors").then((module) => ({ default: module.MarkdownPreview })));

type View = "overview" | "tasks" | "epics" | "graph" | "documents" | "visualizations" | "conversations" | "insights" | "plans" | "settings";

const views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Now", icon: Activity },
  { id: "tasks", label: "Tree", icon: ListTodo },
  { id: "epics", label: "Epics", icon: Boxes },
  { id: "graph", label: "Graph", icon: Network },
  { id: "documents", label: "Plans", icon: FileText },
  { id: "visualizations", label: "Visualizations", icon: GitBranch },
  { id: "conversations", label: "Steer", icon: MessageSquare },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

const internalViews = new Set<View>(["conversations", "plans", "settings"]);
const pageDescriptions: Partial<Record<View, string>> = {
  overview: "See work in flight, up next, blocked, and waiting for review.",
  tasks: "Browse the task hierarchy with status, ownership, next actions, and blockers.",
  epics: "Compare completed and remaining work across epics.",
  graph: "Explore dependencies and focus on connected tasks and epics.",
  documents: "Read, search, and manage the Markdown plans that define the work.",
  visualizations: "Build and revisit focused views of the project.",
  conversations: "Chat with agents to explore, plan, and carry out work.",
  insights: "Review agent activity and reported usage over time.",
};

const PROGRESS_PROMPT = "How is the work going? Summarize what is in flight, what is blocked and why, what is waiting on review, and anything that needs a decision from me.";

function initialLocation() {
  const query = new URLSearchParams(location.search);
  const rawView = query.get("view");
  const requested = (rawView === "activity" ? "overview" : rawView) as View | null;
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

// 0 means the operator has not chosen a width yet, so the stylesheet's own
// default still applies -- which matters where that default differs by state.
function useOptionalStoredSize(key: string, min: number, max: number) {
  const [size, setRawSize] = useState(() => storedNumber(key, 0));
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

function NewConversation({ workspace, onCreated, initialPrompt = "" }: { workspace: Workspace; onCreated: (id: string) => void; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
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
        {shown.map((item) => <label className={`facet-option ${selected.includes(item.id) ? "selected" : ""} ${item.count === 0 ? "disabled" : ""}`} key={item.id}>
          <input type="checkbox" checked={selected.includes(item.id)} disabled={item.count === 0} onChange={() => toggle(item.id)} />
          <span>{item.label}</span><small>{item.count}</small>
        </label>)}
        {!shown.length && <p className="facet-empty">No matching values.</p>}
      </div>
    </div>
  </details>;
}

function TaskFacets({ workspace, state, filters, setFilters, count, applyPromptView }: {
  workspace: Workspace;
  state: State;
  filters: TaskFilters;
  setFilters: React.Dispatch<React.SetStateAction<TaskFilters>>;
  count: number;
  applyPromptView: (view: SavedView) => void;
}) {
  const complete = new Set(state.statuses.filter((item) => item.complete).map((item) => item.id));
  const savedPromptConfiguration = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("nupp-workspace-session-v1") || "{}"); }
    catch { return {}; }
  }, []);
  const [promptProvider, setPromptProvider] = useState(savedPromptConfiguration.provider || workspace.providers[0]?.id || workspace.providers[0]?.name || "codex");
  const [promptProject, setPromptProject] = useState(savedPromptConfiguration.project || workspace.projects[0]?.id || "");
  const [promptPending, setPromptPending] = useState(false);
  const [promptFeedback, setPromptFeedback] = useState("");
  const promptMode = /^\/prompt(?:\s|$)/.test(filters.query);
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

  async function submitPrompt() {
    if (promptPending) return;
    const prompt = filters.query.replace(/^\/prompt\s*/, "").trim();
    if (!prompt) {
      setPromptFeedback("Describe the tasks you want to find.");
      return;
    }
    setPromptPending(true);
    setPromptFeedback(`Searching with ${promptProvider}…`);
    try {
      const run = await command<{ id: string }>("search.prompt", {
        prompt,
        provider: promptProvider,
        projectId: promptProject,
        model: savedPromptConfiguration.models?.[promptProvider],
        submissionId: submissionId(),
        context: {
          view: "activity",
          group: "epic",
          filters: { scope: filters.scopes[0] || "all", q: filters.query },
        },
      });
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const result = await command<{ pending?: boolean; view?: SavedView; explanation?: string }>("search.result", { id: run.id });
        if (result.pending) continue;
        if (!result.view) throw new Error("Prompt search returned no view.");
        applyPromptView(result.view);
        setPromptFeedback(result.explanation || "Prompt search applied.");
        break;
      }
    } catch (error) {
      setPromptFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptPending(false);
    }
  }

  return <aside className={`facet-sidebar ${promptMode ? "prompt-search" : ""}`} aria-label="Filters">
    <label className="search-label" htmlFor="task-search">Search or /prompt <span>⌘ K</span></label>
    <div className="query-box"><textarea
      id="task-search"
      rows={promptMode ? 2 : 1}
      value={filters.query}
      onChange={(event) => {
        setPromptFeedback("");
        setFilters((current) => ({ ...current, query: event.target.value }));
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        if (promptMode) void submitPrompt();
        else event.currentTarget.blur();
      }}
      placeholder="Search tasks or type /prompt…"
      aria-label="Search tasks or enter /prompt"
    /></div>
    {promptMode && <div className="prompt-search-controls">
      <label>Agent<select value={promptProvider} onChange={(event) => setPromptProvider(event.target.value)}>
        {workspace.providers.map((provider) => {
          const id = provider.id || provider.name || "";
          return <option value={id} key={id}>{provider.label || provider.name || id}</option>;
        })}
      </select></label>
      <label>Project<select value={promptProject} onChange={(event) => setPromptProject(event.target.value)}>
        {workspace.projects.length ? workspace.projects.map((project) => <option value={project.id} key={project.id}>{project.id}</option>) : <option value="">Configure a project</option>}
      </select></label>
      <button className="button primary" disabled={promptPending} onClick={() => void submitPrompt()}>{promptPending ? "Searching…" : "Find tasks"}</button>
      {!!promptFeedback && <p className="prompt-search-state" role="status">{promptFeedback}</p>}
    </div>}
    {!!chips.length && <div className="applied-filters">
      <div className="applied-heading"><span>Applied filters</span><button onClick={() => setFilters(emptyTaskFilters)}>Clear all</button></div>
      {chips.map((chip) => <button className="applied-filter" key={`${chip.key}:${chip.value}`} onClick={() => toggle(chip.key, chip.value)}><span>{chip.label}:</span> {chip.value} ×</button>)}
    </div>}
    <div className="facet-bank">
      <FacetGroup title="Collection" open selected={filters.scopes.length ? filters.scopes : ["all"]} toggle={(value) => toggle("scopes", value, true)} values={[
        { id: "all", label: "All plans", count: state.tasks.length },
        { id: "runtime", label: "Runtime tasks", count: state.tasks.filter((task) => !task.scope || task.scope === "runtime").length },
      ]} />
      <FacetGroup title="Work state" selected={filters.work} toggle={(value) => toggle("work", value)} values={[
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
    if (filters.query && !/^\/prompt(?:\s|$)/.test(filters.query) && !text.includes(filters.query.toLowerCase())) return false;
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

function FacetedWorkbench({ workspace, state, filters, setFilters, filtersOpen = true, applyPromptView, children }: {
  workspace: Workspace;
  state: State;
  filters: TaskFilters;
  setFilters: React.Dispatch<React.SetStateAction<TaskFilters>>;
  filtersOpen?: boolean;
  applyPromptView: (view: SavedView) => void;
  children: (tasks: Task[]) => React.ReactNode;
}) {
  const tasks = filteredTasks(state, filters);
  const [width, setWidth] = useStoredSize("avoozl-facet-width", 260, 210, 480);
  return <section className={`faceted-screen ${filtersOpen ? "" : "filters-hidden"}`} style={{ "--facet-width": `${width}px` } as React.CSSProperties}><TaskFacets workspace={workspace} state={state} filters={filters} setFilters={setFilters} count={tasks.length} applyPromptView={applyPromptView} /><ResizeHandle value={width} setValue={setWidth} min={210} max={480} label="Resize filters" className="facet-resize-handle" /><div className="faceted-main">{children(tasks)}</div></section>;
}

function RecentTree({ state, tasks, openTask }: { state: State; tasks: Task[]; openTask: (task: Task) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const nowSink = useRef<HTMLDivElement>(null);
  const controller = useRef<WorkbenchController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openTaskRef = useRef(openTask);
  openTaskRef.current = openTask;
  const [group, setGroup] = useState("epic");
  const [renderVersion, repaint] = useState(0);

  useEffect(() => {
    if (!root.current || !nowSink.current || controller.current) return;
    controller.current = createWorkbench({
      tasksElement: root.current,
      nowElement: nowSink.current,
      badge(id: string) {
        const status = stateRef.current.statuses.find((item) => item.id === id);
        return `<span class="badge" style="--status:${status?.color || "#aabbcc"}"><span>●</span>${status?.label || id}</span>`;
      },
      epicName(id: string) {
        return stateRef.current.epics.find((item) => item.id === id)?.title || stateRef.current.documents[id?.replace(/^doc:/, "")]?.title || id || "Unassigned";
      },
      trackName(id: string) {
        return stateRef.current.tracks.find((item) => item.id === id)?.label || id;
      },
      refresh() {
        repaint((value) => value + 1);
      },
      setCount() {},
      // This skin keeps every cell on one line, so rows are a fixed height.
      rowHeights: { group: 46, task: 38, taskWithBlockers: 38 },
    });
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      const id = target.closest<HTMLElement>("[data-task]")?.dataset.task || target.closest<HTMLElement>("[data-focus-task]")?.dataset.focusTask;
      const task = id ? stateRef.current.tasks.find((item) => item.id === id) : undefined;
      if (task) openTaskRef.current(task);
    };
    root.current.addEventListener("click", click);
    return () => {
      root.current?.removeEventListener("click", click);
      controller.current?.suspend();
    };
  }, []);

  useEffect(() => {
    controller.current?.renderTasks({
      data: state,
      rows: tasks,
      group,
      selected: "",
      narrow: tasks.length !== state.tasks.length,
    });
  }, [group, renderVersion, state, tasks]);

  return <section className="recent-tree">
    <div className="tree-group-control"><label>Group by <select value={group} onChange={(event) => setGroup(event.target.value)}><option value="epic">Epic</option><option value="track">Track</option><option value="status">Status</option><option value="tag">Tag</option></select></label></div>
    <div id="tasks-view" ref={root} />
    <div hidden ref={nowSink} />
  </section>;
}

function Conversations({ workspace, selected, select, refresh, initialPrompt = "" }: { workspace: Workspace; selected: string | null; select: (id: string | null) => void; refresh: () => void; initialPrompt?: string }) {
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
      {selected ? <Suspense fallback={<LoadingSurface label="Opening conversation…" />}><Conversation runId={selected} onRefresh={refresh} /></Suspense> : <NewConversation key={initialPrompt} workspace={workspace} initialPrompt={initialPrompt} onCreated={(id) => { select(id); refresh(); }} />}
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
  const [width, setWidth] = useOptionalStoredSize("avoozl-document-inspector-width", 420, 2000);
  return <div className="inspector-backdrop" style={width ? ({ "--inspector-width": `${width}px` } as React.CSSProperties) : undefined} onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <ResizeHandle value={width || (editing ? 1400 : 920)} setValue={setWidth} min={420} max={2000} invert label="Resize plan panel" className="inspector-resize-handle" />
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
        return <button className="plan-table-row" key={doc.id} onClick={() => select(doc.id)}>
          <b title={doc.title}>{doc.title}</b>
          <span title={(doc as any).targetBranch || doc.path}>{(doc as any).targetBranch || doc.path}</span>
          <span className={`plan-state state-${doc.status || "active"}`}>{doc.status || "Active"}</span>
          <span>{done} / {linked} tasks</span>
          <span className="plan-percent">{percent}%<i><em style={{ width: `${percent}%` }} /></i></span>
        </button>;
      })}</section>)}
      {!filtered.length && <Empty icon={BookOpen} title="No matching plans">Change the search or plan filters.</Empty>}
    </div> : <div className="proposal-browser">
      {selectedPlan ? <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><PlanEditor id={selectedPlan} onSaved={refresh} /></Suspense> : <>
        <div className="library-heading"><h2>Proposals</h2><button className="button subtle"><Plus size={14} /> Write plan</button></div>
        <div className="proposal-list">{workspace.plans.map((plan) => <button className="proposal-row" key={plan.id} onClick={() => selectPlan(plan.id)}><b>{plan.title}</b><span>Revision {plan.revision || 1}</span><span>{plan.state || "draft"}</span></button>)}</div>
        {!workspace.plans.length && <p className="muted">No proposals yet.</p>}
      </>}
    </div>}
    {selected && <DocumentDetail id={selected} close={() => select(null)} refresh={() => { void docs.reload(); refresh(); }} />}
  </section>;
}

type StripController = ReturnType<typeof createSingleStrip>;
type EpicController = ReturnType<typeof createEpicProgress>;
type WorkbenchController = ReturnType<typeof createWorkbench>;

function RecentNow({ state, matchingTasks, openTask }: { state: State; matchingTasks: Task[]; openTask: (task: Task) => void }) {
  const root = useRef<HTMLElement>(null);
  const stripRoot = useRef<HTMLDivElement>(null);
  const nowRoot = useRef<HTMLDivElement>(null);
  const taskSink = useRef<HTMLDivElement>(null);
  const strip = useRef<StripController | null>(null);
  const workbench = useRef<WorkbenchController | null>(null);
  const camera = useRef({ scale: 1, center: 0.5 });
  const [order, setOrder] = useState("chronological");
  const [, repaint] = useState(0);
  const matchingIds = useMemo(() => new Set(matchingTasks.map((task) => task.id)), [matchingTasks]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openTaskRef = useRef(openTask);
  openTaskRef.current = openTask;

  useEffect(() => {
    if (!root.current || !stripRoot.current || !nowRoot.current || !taskSink.current || strip.current) return;
    strip.current = createSingleStrip(stripRoot.current, {
      select(id: string) {
        const task = stateRef.current.tasks.find((item) => item.id === id);
        if (task) openTaskRef.current(task);
      },
      changeOrder(next: string) {
        camera.current = { scale: 1, center: 0.5 };
        setOrder(next);
      },
      changeCamera(next: { scale: number; center: number }) {
        camera.current = next;
      },
    });
    workbench.current = createWorkbench({
      tasksElement: taskSink.current,
      nowElement: nowRoot.current,
      nowScrollElement: root.current,
      nowChanged(snapshot: unknown) {
        strip.current?.updateActivity?.(snapshot);
      },
      badge(id: string) {
        const status = stateRef.current.statuses.find((item) => item.id === id);
        return `<span class="badge" style="--status:${status?.color || "#aabbcc"}"><span>●</span>${status?.label || id}</span>`;
      },
      epicName(id: string) {
        return stateRef.current.epics.find((item) => item.id === id)?.title || stateRef.current.documents[id?.replace(/^doc:/, "")]?.title || id || "Unassigned";
      },
      trackName(id: string) {
        return stateRef.current.tracks.find((item) => item.id === id)?.label || id;
      },
      refresh() {
        repaint((value) => value + 1);
      },
      setCount() {},
    });
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      const taskTarget = target.closest<HTMLElement>("[data-task],[data-edit]");
      const id = taskTarget?.dataset.task || taskTarget?.dataset.edit;
      const task = id ? stateRef.current.tasks.find((item) => item.id === id) : undefined;
      if (task) openTaskRef.current(task);
    };
    nowRoot.current.addEventListener("click", click);
    return () => {
      nowRoot.current?.removeEventListener("click", click);
      workbench.current?.suspend();
      strip.current?.suspend();
    };
  }, []);

  useEffect(() => {
    strip.current?.render({
      data: state,
      historical: true,
      matchingIds,
      scope: "all",
      selected: "",
      order,
      ...camera.current,
      focusMatches: false,
      focusToken: "",
    });
    workbench.current?.renderNow({ data: state, rows: matchingTasks, selected: "" });
  }, [matchingIds, order, state]);

  return <section className="content-view recent-now" id="activity-view" ref={root}>
    <div className="strip-view" id="strip-view" aria-label="Work across the plans" ref={stripRoot} />
    <div id="now-content" ref={nowRoot} />
    <div hidden ref={taskSink} />
  </section>;
}

function EpicProgress({ state, matchingTasks, openTask }: { state: State; matchingTasks: Task[]; openTask: (task: Task) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<EpicController | null>(null);
  const zoom = useRef(100);
  const matchingIds = useMemo(() => new Set(matchingTasks.map((task) => task.id)), [matchingTasks]);
  const openTaskRef = useRef(openTask);
  openTaskRef.current = openTask;

  useEffect(() => {
    if (!root.current || controller.current) return;
    controller.current = createEpicProgress(root.current, {
      select(id: string) {
        const task = state.tasks.find((item) => item.id === id);
        if (task) openTaskRef.current(task);
      },
      changeZoom(next: number) {
        zoom.current = next;
      },
    });
    return () => controller.current?.suspend();
  }, [state.tasks]);

  useEffect(() => {
    controller.current?.render({
      data: state,
      matchingIds,
      scope: "all",
      selected: "",
      zoom: zoom.current,
    });
  }, [matchingIds, state]);

  return <div className="legacy-visualization epic-view" ref={root} />;
}

function Graph({ state, matchingTasks, openTask }: { state: State; matchingTasks: Task[]; openTask: (task: Task) => void }) {
  const baseTasks = useMemo(() => matchingTasks.slice(0, 180), [matchingTasks]);
  const [selected, setSelected] = useState("");
  const [relation, setRelation] = useState("");
  const baseLinks = useMemo(() => {
    const ids = new Set(baseTasks.map((task) => task.id));
    return state.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  }, [baseTasks, state.edges]);
  const connected = useMemo(() => {
    const ids = new Set<string>();
    if (!selected || !relation) return ids;
    const queue = [selected];
    ids.add(selected);
    while (queue.length) {
      const id = queue.shift()!;
      for (const edge of baseLinks) {
        const next =
          (relation === "downstream" || relation === "both") && edge.from === id ? edge.to :
          (relation === "upstream" || relation === "both") && edge.to === id ? edge.from : "";
        if (next && !ids.has(next)) {
          ids.add(next);
          queue.push(next);
        }
      }
    }
    return ids;
  }, [baseLinks, relation, selected]);
  const tasks = useMemo(() => relation && selected ? baseTasks.filter((task) => connected.has(task.id)) : baseTasks, [baseTasks, connected, relation, selected]);
  const links = useMemo(() => {
    const ids = new Set(tasks.map((task) => task.id));
    return baseLinks.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  }, [baseLinks, tasks]);
  const positions = useMemo(() => dependencyLayout(tasks, links, (task: Task) => task.epic || ""), [links, tasks]);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeDrag, setNodeDrag] = useState<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const movedNode = useRef(false);
  const displayPositions = useMemo(() => ({ ...positions, ...manualPositions }), [manualPositions, positions]);
  const bounds = useMemo(() => {
    const points = Object.values(positions);
    const minX = Math.min(0, ...points.map((point) => point.x)) - 110;
    const minY = Math.min(0, ...points.map((point) => point.y)) - 55;
    const maxX = Math.max(NODE_W, ...points.map((point) => point.x + NODE_W)) + 110;
    const maxY = Math.max(NODE_H, ...points.map((point) => point.y + NODE_H)) + 55;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [positions]);
  const fit = useCallback(() => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const scale = Math.max(.05, Math.min(1.25, box.width / bounds.width, box.height / bounds.height));
    setCamera({
      scale,
      x: (box.width - bounds.width * scale) / 2 - bounds.minX * scale,
      y: (box.height - bounds.height * scale) / 2 - bounds.minY * scale,
    });
  }, [bounds]);
  useEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) });
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);
  function zoom(factor: number, clientX?: number, clientY?: number) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const anchorX = clientX == null ? box.width / 2 : clientX - box.left;
    const anchorY = clientY == null ? box.height / 2 : clientY - box.top;
    setCamera((current) => {
      const scale = Math.max(.05, Math.min(3, current.scale * factor));
      const ratio = scale / current.scale;
      return { scale, x: anchorX - (anchorX - current.x) * ratio, y: anchorY - (anchorY - current.y) * ratio };
    });
  }
  return (
    <section className="graph-view">
      <div className="graph-top"><span><i className="legend-line" /> prerequisite → dependent <i className="legend-line dashed" /> supports / sequence</span><select aria-label="Explore selected task relationships" value={relation} onChange={(event) => setRelation(event.target.value)}><option value="">Whole matching graph</option><option value="upstream">All prerequisites of selected</option><option value="downstream">Everything selected unblocks</option><option value="both">Connected to selected</option></select></div>
      <div id="graph-stage" className={drag ? "dragging" : ""} ref={stage} tabIndex={0}
        onPointerDown={(event) => {
          if ((event.target as Element).closest(".graph-controls, .graph-html-node")) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y });
        }}
        onPointerMove={(event) => drag && setCamera((current) => ({ ...current, x: drag.cameraX + event.clientX - drag.x, y: drag.cameraY + event.clientY - drag.y }))}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onWheel={(event) => { event.preventDefault(); zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .003), event.clientX, event.clientY); }}
        onKeyDown={(event) => { if (event.key === "+" || event.key === "=") zoom(1.2); else if (event.key === "-") zoom(1 / 1.2); else if (event.key === "0") fit(); }}>
        <svg id="graph" role="group" aria-label="Task dependency graph"
          viewBox={`${-camera.x / camera.scale} ${-camera.y / camera.scale} ${stageSize.width / camera.scale} ${stageSize.height / camera.scale}`}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8" fill="currentColor" /></marker>
          </defs>
          <g>
            {links.map((edge, index) => <path key={edge.id || index} className={`edge ${edge.kind}`} d={dependencyPath(edge, displayPositions, links)}><title>{edge.kind}: {edge.reason}</title></path>)}
          </g>
        </svg>
        <div className="graph-node-layer">
          {tasks.map((task) => {
            const point = displayPositions[task.id];
            const status = state.statuses.find((item) => item.id === task.status);
            const track = state.tracks.find((item) => item.id === task.track);
            const group = task.epic?.startsWith("doc:") ? "PLAN" : task.epic || "TASK";
            return <button className={`graph-html-node ${selected === task.id ? "selected" : ""}`} key={task.id}
              style={{
                left: camera.x + point.x * camera.scale,
                top: camera.y + point.y * camera.scale,
                width: NODE_W * camera.scale,
                height: NODE_H * camera.scale,
                "--track-color": track?.color || "#8899aa",
                "--node-scale": camera.scale,
              } as React.CSSProperties}
              title={`${task.title} — ${status?.label || task.status}. ${task.summary}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                movedNode.current = false;
                event.currentTarget.setPointerCapture(event.pointerId);
                setNodeDrag({ id: task.id, x: event.clientX, y: event.clientY, startX: point.x, startY: point.y });
              }}
              onPointerMove={(event) => {
                if (!nodeDrag || nodeDrag.id !== task.id) return;
                const dx = (event.clientX - nodeDrag.x) / camera.scale;
                const dy = (event.clientY - nodeDrag.y) / camera.scale;
                if (Math.abs(dx) + Math.abs(dy) > 3) movedNode.current = true;
                setManualPositions((current) => ({ ...current, [task.id]: { x: nodeDrag.startX + dx, y: nodeDrag.startY + dy } }));
              }}
              onPointerUp={() => setNodeDrag(null)}
              onPointerCancel={() => setNodeDrag(null)}
              onClick={() => {
                if (movedNode.current) {
                  movedNode.current = false;
                  return;
                }
                setSelected(task.id);
                openTask(task);
              }}>
              <span className="graph-html-track">{group} · {track?.label?.toUpperCase() || "TASK"}</span>
              <strong>{task.title}</strong>
              <span className="graph-html-status" style={{ color: status?.color || "#8899aa" }}><i style={{ background: status?.color || "#8899aa" }} />{status?.label || task.status}</span>
              <span className="graph-html-open">↗</span>
            </button>;
          })}
        </div>
        <div className="graph-controls"><button onClick={() => zoom(.8)} aria-label="Zoom out">−</button><output>{Math.round(camera.scale * 100)}%</output><button onClick={() => zoom(1.25)} aria-label="Zoom in">＋</button><button onClick={fit}>Fit</button><button onClick={() => { setManualPositions({}); requestAnimationFrame(fit); }}>Reset layout</button></div>
        <div className="graph-instructions">Drag nodes to arrange · drag canvas to pan · scroll / pinch to zoom · click to inspect</div>
      </div>
      <div className="graph-footer"><span>{tasks.length} matching tasks · {links.length} connections</span><span>Positions stay in this browser. Task data comes from the workspace.</span></div>
    </section>
  );
}

function Visualizations({ state, applyView, refresh }: { state: State; applyView: (view: SavedView) => void; refresh: () => void }) {
  const [tab, setTab] = useState<"views" | "tours">(() => {
    try { return localStorage.getItem("avoozl-visualization-tab") === "tours" ? "tours" : "views"; } catch { return "views"; }
  });
  const views = state.presentation?.views || [];
  const tours = state.presentation?.tours || [];
  const rows = tab === "views" ? views : tours;
  const changeTab = (next: "views" | "tours") => {
    setTab(next);
    try { localStorage.setItem("avoozl-visualization-tab", next); } catch {}
  };
  async function remove(kind: "view" | "tour", id: string, title: string) {
    if (!confirm(`Delete the saved ${kind === "tour" ? "presentation" : "view"} “${title}”? Tasks and plans are not affected.`)) return;
    await command("visualization.delete", { id, kind });
    refresh();
  }
  return <section className="screen visualization-list">
    <div className="hub-tabs" role="tablist" aria-label="Saved visualizations">
      <button role="tab" aria-selected={tab === "views"} onClick={() => changeTab("views")}>Saved views <span>{views.length}</span></button>
      <button role="tab" aria-selected={tab === "tours"} onClick={() => changeTab("tours")}>Presentations <span>{tours.length}</span></button>
    </div>
    <section role="tabpanel">
      <p className="visualization-note">{tab === "views" ? "Saved views restore a filter, camera and layout. Deleting one removes the saved configuration only, never tasks or plans." : "A presentation plays a narrated sequence of saved views. Deleting one removes the sequence; the views it points at stay."}</p>
      {rows.length ? <div className="visualization-rows">{rows.map((item) => <div className="visualization-row" key={item.id}>
        <button onClick={() => {
          if (tab === "views") applyView(item as SavedView);
          else {
            const step = "steps" in item ? item.steps?.[0] : undefined;
            const id = step?.view || step?.visualization || step?.visualizationId;
            const view = views.find((candidate) => candidate.id === id);
            if (view) applyView(view);
          }
        }}><strong>{item.title}</strong>{"caption" in item && item.caption ? <span>{item.caption}</span> : "steps" in item && item.steps?.length ? <span>{item.steps.length} {item.steps.length === 1 ? "step" : "steps"}</span> : null}</button>
        <button className="visualization-remove" aria-label={`Delete ${item.title}`} title={`Delete ${item.title}`} onClick={() => void remove(tab === "views" ? "view" : "tour", item.id, item.title)}>×</button>
      </div>)}</div> : <p className="muted">{tab === "views" ? "No saved views yet." : "No presentations yet."} Agents create them through the plans MCP tools.</p>}
    </section>
  </section>;
}

function TaskDrawer({ task, state, close, refresh }: { task: Task; state: State; close: () => void; refresh: () => void }) {
  const [status, setStatus] = useState(task.status);
  const [nextAction, setNextAction] = useState(task.nextAction || "");
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useStoredSize("avoozl-task-drawer-width", 344, 280, 760);
  async function save() {
    setBusy(true);
    try { await command("task.update", { id: task.id, status, nextAction }, state.revision); refresh(); close(); }
    finally { setBusy(false); }
  }
  return <div className="drawer-backdrop" style={{ "--drawer-width": `${width}px` } as React.CSSProperties} onMouseDown={(e) => e.target === e.currentTarget && close()}><ResizeHandle value={width} setValue={setWidth} min={280} max={760} invert label="Resize task panel" className="drawer-resize-handle" /><aside className="task-drawer"><header><div><span className="eyebrow">Task</span><h2>{task.title}</h2></div><button className="icon-button" onClick={close}><X size={20} /></button></header><code>{task.id}</code><p>{task.summary || "No summary recorded."}</p><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{state.statuses.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Next action<textarea value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>{!!task.acceptance?.length && <section><h3>Acceptance</h3><ul>{task.acceptance.map((item) => <li key={item}>{item}</li>)}</ul></section>}<button className="button primary" disabled={busy} onClick={save}>Save task</button></aside></div>;
}

function Insights() {
  const [days, setDays] = useState(30);
  const [provider, setProvider] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setError("");
    void command<any>("metrics", { groupBy: "provider", days, provider: provider || undefined })
      .then((value) => { if (current) setResult(value); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { current = false; };
  }, [days, provider]);

  return <section className="screen insights-screen">
    <section className="usage-heading">
      <p>Agent activity and reported usage over time.</p>
      <div>
        <label>Period<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
        <label>Agent<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">All agents</option><option value="codex">Codex</option><option value="claude">Claude</option></select></label>
      </div>
    </section>
    {error ? <p className="muted">{error}</p> : result ? <div className="usage-charts" dangerouslySetInnerHTML={{ __html: renderUsage(result) }} /> : <LoadingSurface label="Loading usage…" />}
  </section>;
}

const SETTINGS_TABS = [
  { id: "workspace", label: "Workspace", icon: Boxes },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "projects", label: "Projects", icon: GitBranch },
  { id: "github", label: "GitHub", icon: CircleDot },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

// Read-only rows are stated as text. A disabled input that can never be filled
// in reads as a broken field, so only a real write operation gets a control.
function ReadOnlyRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <dl className="form-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

type PlanUsage = {
  provider: string;
  available: boolean;
  subscription?: string | null;
  reason?: string;
  windows?: Array<{ id: string; label: string; utilization: number; resetsAt: string | null }>;
  extraUsage?: { utilization: number | null; monthlyLimit: number | null; usedCredits: number | null; currency: string | null } | null;
};

function resetLabel(at: string | null) {
  if (!at) return "";
  const seconds = Math.round((Date.parse(at) - Date.now()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds <= 0) return "resets now";
  if (seconds < 3600) return `resets in ${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `resets in ${Math.round(seconds / 3600)}h`;
  return `resets in ${Math.round(seconds / 86400)}d`;
}

// Utilization is what the plan reports, so remaining is its complement. A
// window with no utilization is omitted upstream rather than shown as zero.
function UsageMeter() {
  const remote = useRemote(() => command<PlanUsage>("usage.limits", { provider: "claude" }), []);
  if (remote.loading) return <p className="form-note">Reading plan usage…</p>;
  if (remote.error) return <p className="form-note">Plan usage unavailable: {remote.error.message}</p>;
  const usage = remote.data;
  if (!usage?.available) return <p className="form-note">{usage?.reason || "Plan usage unavailable."}</p>;
  return <div className="usage-meters">
    <p className="form-note">{usage.subscription ? `Claude ${usage.subscription} plan` : "Claude plan"} · {Math.max(0, 100 - Math.max(...usage.windows!.map((w) => w.utilization), 0)).toFixed(0)}% left in the tightest window</p>
    {usage.windows!.map((window) => {
      const used = Math.max(0, Math.min(100, window.utilization));
      return <div className="usage-meter" key={window.id}>
        <div className="usage-meter-head"><span>{window.label}</span><strong>{(100 - used).toFixed(0)}% left</strong></div>
        <div className="usage-meter-track" role="meter" aria-label={`${window.label} plan usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)}>
          <i className={used >= 90 ? "critical" : used >= 75 ? "warning" : ""} style={{ width: `${used}%` }} />
        </div>
        <small>{used.toFixed(0)}% used{window.resetsAt ? ` · ${resetLabel(window.resetsAt)}` : ""}</small>
      </div>;
    })}
    {usage.extraUsage && <p className="form-note">Extra usage enabled{usage.extraUsage.utilization !== null ? ` · ${usage.extraUsage.utilization.toFixed(0)}% of the monthly limit used` : ""}.</p>}
    <button className="button" onClick={() => void remote.reload()}>Refresh</button>
  </div>;
}

function ProjectForm({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState("");
  const [root, setRoot] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [worktreeRoot, setWorktreeRoot] = useState("");
  const [checks, setChecks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      // One command per line, split on whitespace: `project.configure` wants
      // arrays of arguments, never a string it would have to shell out to run.
      const parsed = checks.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\s+/));
      await command("project.configure", { id: id.trim(), root: root.trim(), baseBranch: baseBranch.trim() || "main", worktreeRoot: worktreeRoot.trim() || undefined, checks: parsed });
      setSaved(`Saved ${id.trim()}.`);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return <form className="settings-form" onSubmit={submit}>
    <label>Project ID<input value={id} onChange={(event) => setId(event.target.value)} placeholder="avoozl" required /><small>Lower case letters, digits and dashes. Stable: runs reference it.</small></label>
    <label>Git checkout root<input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/Users/you/projects/avoozl" required /><small>Must be the root of the checkout, not a subdirectory.</small></label>
    <label>Base branch<input value={baseBranch} onChange={(event) => setBaseBranch(event.target.value)} placeholder="main" /></label>
    <label>Worktree root<input value={worktreeRoot} onChange={(event) => setWorktreeRoot(event.target.value)} placeholder="Defaults to .avoozl-worktrees beside the checkout" /><small>Kept outside the checkout so worktree adds never write into it.</small></label>
    <label>Checks<textarea value={checks} onChange={(event) => setChecks(event.target.value)} rows={3} placeholder={"npm test\nnpm run format:check"} /><small>One command per line. Run against a task worktree before integration.</small></label>
    {error && <p className="error">{error}</p>}
    {saved && <p className="form-note">{saved}</p>}
    <div className="form-actions"><button className="button primary" disabled={busy || !id.trim() || !root.trim()}>{busy ? "Saving…" : "Save project"}</button></div>
  </form>;
}

function GitHubSettings({ workspace, refresh }: { workspace: Workspace; refresh: () => void }) {
  const [repository, setRepository] = useState("");
  const [projectId, setProjectId] = useState(workspace.projects[0]?.id || "");
  const [assignee, setAssignee] = useState("");
  const [provider, setProvider] = useState(workspace.providers[0]?.id || workspace.providers[0]?.name || "");
  const [allowedActors, setAllowedActors] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [workspaceBranch, setWorkspaceBranch] = useState("avoozl-workspace");
  const [workspaceDirectory, setWorkspaceDirectory] = useState(".avoozl");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function act(label: string, operation: string, input: Record<string, unknown> = {}) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      const result = await command<any>(operation, input);
      setMessage(
        operation === "github.sync"
          ? `Synchronized ${result.repositories?.length || 0} repositories; ${result.authorized?.length || 0} ready, ${result.quarantined?.length || 0} quarantined.`
          : `${label} complete.`,
      );
      refresh();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function configure(event: React.FormEvent) {
    event.preventDefault();
    await act("Registration", "github.configure", {
      repository: repository.trim(),
      projectId,
      assignee: assignee.trim() || undefined,
      provider: provider || undefined,
      autoStart,
      allowedActors: allowedActors.split(",").map((value) => value.trim()).filter(Boolean),
    });
  }

  async function configureWorkspace(event: React.FormEvent) {
    event.preventDefault();
    await act("Workspace registration", "workspace.repository.configure", {
      root: workspaceRoot.trim(),
      branch: workspaceBranch.trim(),
      directory: workspaceDirectory.trim(),
    });
  }

  async function start(taskId: string) {
    const run = await act("Start", "github.start", { taskId });
    if (run?.id) location.href = `/?view=conversations&run=${encodeURIComponent(run.id)}`;
  }

  const github = workspace.github;
  return <div className="github-settings">
    <div className="settings-actions">
      <button className="button" disabled={Boolean(busy)} onClick={() => void act("Sync", "github.sync")}>
        <RefreshCw size={14} />{busy === "Sync" ? "Syncing…" : "Sync now"}
      </button>
      <span>{github?.machine ? `${github.machine.name} · ${github.machine.id}` : "Machine identity unavailable"}</span>
    </div>
    {error && <p className="error">{error}</p>}
    {message && <p className="form-note">{message}</p>}
    <h3>Registered repositories</h3>
    {github?.repositories?.length
      ? <ReadOnlyRows rows={github.repositories.map((repo) => [
          repo.id,
          `${repo.projectId} · ${repo.assignee} · ${repo.label}${repo.autoStart ? ` · auto-start via ${repo.provider}` : ""}`,
        ])} />
      : <p className="form-note">No GitHub repository is registered.</p>}
    <h3>Ready and quarantined issues</h3>
    {github?.issues?.length
      ? <div className="github-issue-list">{github.issues.map((issue) => <article key={issue.id}>
          <div><strong>{issue.repository}#{issue.number} · {issue.title}</strong><small>{issue.state}{issue.reason ? ` — ${issue.reason}` : ""}</small></div>
          <div>
            {issue.state === "authorized" && <button className="button" disabled={Boolean(busy)} onClick={() => void start(issue.taskId)}>Start</button>}
            {(issue.state === "pending" || issue.state === "quarantined") && <button className="button" disabled={Boolean(busy)} onClick={() => void act("Confirmation", "github.authorize", { repository: issue.repository, id: issue.id, bodyHash: issue.bodyHash, labelEventId: issue.labelEventId })}>Confirm exact snapshot</button>}
          </div>
        </article>)}</div>
      : <p className="form-note">No matching issues have been observed.</p>}
    <h3>Register a repository</h3>
    <form className="settings-form" onSubmit={configure}>
      <label>Repository<input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" required /></label>
      <label>Execution project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Choose a project</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name || project.id}</option>)}</select></label>
      <label>Assignee<input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Defaults to the authenticated GitHub user" /></label>
      <label>Allowed label actors<input value={allowedActors} onChange={(event) => setAllowedActors(event.target.value)} placeholder="comma,separated,logins" /><small>Empty permits any collaborator with write permission or above.</small></label>
      <label>Agent<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">Choose at start</option>{workspace.providers.map((item) => { const id = item.id || item.name || ""; return <option key={id} value={id}>{item.label || id}</option>; })}</select></label>
      <label className="checkbox-row"><input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} />Start newly authorized issues automatically on this active machine</label>
      <div className="form-actions"><button className="button primary" disabled={Boolean(busy) || !repository.trim() || !projectId}>{busy === "Registration" ? "Registering…" : "Register repository"}</button></div>
    </form>
    <p className="form-note">Credentials are read from <code>gh auth</code> or process environment and are never stored in the workspace or projected to Git.</p>
    <h3>Portable planning repository</h3>
    {workspace.workspaceRepository?.configuration
      ? <>
          <ReadOnlyRows rows={[
            ["Repository", workspace.workspaceRepository.configuration.repository || workspace.workspaceRepository.configuration.root],
            ["Location", `${workspace.workspaceRepository.configuration.branch}:${workspace.workspaceRepository.configuration.directory}`],
            ["Last published", workspace.workspaceRepository.publication?.commit?.slice(0, 12) || "Never"],
            ["Last synchronized", workspace.workspaceRepository.import?.commit?.slice(0, 12) || "Never"],
          ]} />
          <div className="settings-actions">
            <button className="button" disabled={Boolean(busy)} onClick={() => void act("Publication", "workspace.repository.publish")}>Publish</button>
            <button className="button" disabled={Boolean(busy)} onClick={() => void act("Synchronization", "workspace.repository.sync")}>Pull and hydrate</button>
          </div>
        </>
      : <p className="form-note">Not configured. This may be a separate private repository or a dedicated branch/directory in a private code repository.</p>}
    <form className="settings-form" onSubmit={configureWorkspace}>
      <label>Local Git checkout root<input value={workspaceRoot} onChange={(event) => setWorkspaceRoot(event.target.value)} placeholder="/path/to/private/workspace-checkout" required /></label>
      <label>Workspace branch<input value={workspaceBranch} onChange={(event) => setWorkspaceBranch(event.target.value)} /></label>
      <label>Managed directory<input value={workspaceDirectory} onChange={(event) => setWorkspaceDirectory(event.target.value)} /></label>
      <div className="form-actions"><button className="button primary" disabled={Boolean(busy) || !workspaceRoot.trim()}>{busy === "Workspace registration" ? "Registering…" : "Register planning repository"}</button></div>
    </form>
  </div>;
}

function SettingsView({ workspace, state, refresh }: { workspace: Workspace; state: State; refresh: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("workspace");
  const workspaceName = state.project?.workspaceName || state.project?.title || state.project?.name || "Avoozl";
  return <section className="screen settings-screen">
    <header className="screen-heading"><div><h1>Settings</h1><p>Workspace, agent, and execution configuration.</p></div></header>
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">
      {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} role="tab" id={`settings-tab-${id}`} aria-selected={tab === id} aria-controls={`settings-panel-${id}`} className={tab === id ? "settings-tab active" : "settings-tab"} onClick={() => setTab(id)}><Icon size={15} />{label}</button>
      ))}
    </div>
    {tab === "workspace" && <div className="settings-panel" role="tabpanel" id="settings-panel-workspace" aria-labelledby="settings-tab-workspace">
      <h2>{workspaceName}</h2>
      <ReadOnlyRows rows={[
        ["Storage revision", workspace.revision],
        ["Mode", workspace.mode || "local"],
        ["Agent host", workspace.agentHost?.draining ? "Draining" : workspace.agentHost?.connected ? "Connected" : "Offline"],
        ["Publication queue", workspace.publication?.pending?.length || 0],
      ]} />
      <p className="form-note">These describe the running workspace. Change them through the CLI or the workspace configuration file.</p>
    </div>}
    {tab === "agents" && <div className="settings-panel" role="tabpanel" id="settings-panel-agents" aria-labelledby="settings-tab-agents">
      <h2>Configured agents</h2>
      {workspace.providers.length
        ? <ReadOnlyRows rows={workspace.providers.map((provider) => [provider.label || provider.name || provider.id || "Agent", `${provider.models?.length || 0} models`] as [string, React.ReactNode])} />
        : <p className="form-note">No agents are configured for this workspace.</p>}
      <p className="form-note">Agent credentials live with each agent's own CLI, never in this workspace.</p>
      <h3>Plan usage</h3>
      <UsageMeter />
    </div>}
    {tab === "projects" && <div className="settings-panel" role="tabpanel" id="settings-panel-projects" aria-labelledby="settings-tab-projects">
      <h2>Execution projects</h2>
      {workspace.projects.length
        ? <ReadOnlyRows rows={workspace.projects.map((project) => [project.name || project.id, project.root || project.path || ""] as [string, React.ReactNode])} />
        : <p className="form-note">No execution repository is configured yet.</p>}
      <h3>Add or update a project</h3>
      <ProjectForm onSaved={refresh} />
    </div>}
    {tab === "github" && <div className="settings-panel" role="tabpanel" id="settings-panel-github" aria-labelledby="settings-tab-github">
      <h2>GitHub work intake</h2>
      <GitHubSettings workspace={workspace} refresh={refresh} />
    </div>}
  </section>;
}

export function App() {
  const initial = useMemo(initialLocation, []);
  const [view, setView] = useState<View>(initial.view);
  const [runId, setRunId] = useState<string | null>(initial.runId);
  const [planId, setPlanId] = useState<string | null>(initial.planId);
  const [documentId, setDocumentId] = useState<string | null>(initial.documentId);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [workbenchFilters, setWorkbenchFilters] = useState<TaskFilters>(emptyTaskFilters);
  const [filtersOpen, setFiltersOpen] = useState(() => {
    try { return localStorage.getItem("avoozl-filters-open") !== "false"; } catch { return true; }
  });
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem("nupp-navigation-collapsed") === "true"; } catch { return false; }
  });
  const [navWidth, setNavWidth] = useStoredSize("avoozl-navigation-width", 176, 160, 360);
  const workspace = useRemote(loadWorkspace, []);
  const state = useRemote(loadState, []);
  const refresh = () => { void Promise.all([workspace.reload(), state.reload()]); };
  useWorkspaceEvents(refresh);

  useEffect(() => {
    const query = new URLSearchParams();
    query.set("view", view === "overview" ? "activity" : view);
    if (view === "conversations" && runId) query.set("run", runId);
    if (view === "plans" && planId) query.set("plan", planId);
    if (view === "documents") {
      if (documentId) query.set("document", documentId);
      if (planId) query.set("plan", planId);
    }
    history.replaceState(null, "", "?" + query);
  }, [view, runId, planId, documentId]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (!(view === "overview" || view === "tasks" || view === "epics" || view === "graph")) navigate("overview");
      setFiltersOpen(true);
      requestAnimationFrame(() => document.getElementById("task-search")?.focus());
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [view]);

  useEffect(() => {
    const openSession = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) openRun(id);
    };
    const askContext = async (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt) return;
      const id = submissionId();
      const provider = workspace.data?.providers[0];
      const result = await command<any>("intent.submit", {
        action: "ask",
        prompt,
        provider: provider?.id || provider?.name,
        approvalMode: "manual",
        submissionId: id,
        runId: "run-" + id,
        context: {},
      });
      if (result.run?.id) openRun(result.run.id);
    };
    window.addEventListener("nupp-open-session", openSession);
    window.addEventListener("nupp-ask-context", askContext);
    return () => {
      window.removeEventListener("nupp-open-session", openSession);
      window.removeEventListener("nupp-ask-context", askContext);
    };
  }, [workspace.data]);

  function navigate(next: View) { setView(next); setNavOpen(false); }
  // Opens the composer holding the question rather than submitting it, so the
  // agent and project are still the operator's to choose before a run starts.
  function askAgent(prompt: string) { setDraftPrompt(prompt); setRunId(null); navigate("conversations"); }
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
  function toggleFilters() {
    setFiltersOpen((value) => {
      const next = !value;
      try { localStorage.setItem("avoozl-filters-open", String(next)); } catch {}
      return next;
    });
  }
  function applyVisualization(view: SavedView) {
    const split = (value?: string) => value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
    setWorkbenchFilters({
      query: view.filters?.q || "",
      scopes: view.filters?.scope && view.filters.scope !== "all" ? split(view.filters.scope) : [],
      work: [],
      statuses: split(view.filters?.status),
      epics: split(view.filters?.epic),
      tracks: split(view.filters?.track),
      tags: split(view.filters?.tag),
      activity: split(view.filters?.activity),
      historical: false,
    });
    const next = view.view === "strip" || view.view === "report" || view.view === "activity" ? "overview" :
      view.view === "tree" ? "tasks" :
      view.view === "epic" ? "epics" :
      view.view === "documents" ? "documents" :
      view.view === "graph" ? "graph" : "overview";
    navigate(next);
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
  const facetedView = view === "overview" || view === "tasks" || view === "epics" || view === "graph";
  const activeRunStates = new Set(["starting", "running", "waiting-input", "waiting-approval"]);
  const activeRuns = workspaceData.runs.filter((run) => activeRunStates.has(run.state));
  const activeTaskCount = stateData.tasks.filter((task) => task.activity?.status === "active").length;
  const externalActiveCount = stateData.tasks.filter((task) =>
    task.activity?.status === "active" && !activeRuns.some((run) => run.taskId === task.id)).length;
  const inFlightCount = activeRuns.length + externalActiveCount;
  const matchingCount = filteredTasks(stateData, workbenchFilters).length;
  const toolbarCount = view === "overview" ? `${inFlightCount} in flight` :
    facetedView ? `${matchingCount} ${matchingCount === 1 ? "task" : "tasks"}` :
    view === "conversations" ? `${workspaceData.runTotal} ${workspaceData.runTotal === 1 ? "session" : "sessions"}` :
    view === "documents" ? `${Object.keys(stateData.documents).length} plans` :
    view === "visualizations" ? `${(stateData.presentation?.views?.length || 0) + (stateData.presentation?.tours?.length || 0)} saved views` :
    view === "insights" ? "Usage trends" :
    `${stateData.tasks.length} tasks`;
  return (
    <div className={`app-shell ${navCollapsed ? "nav-collapsed" : ""}`} style={{ "--nav-width": `${navCollapsed ? 44 : navWidth}px` } as React.CSSProperties}>
      <aside className={navOpen ? "app-nav open" : "app-nav"}>
        <div className="site-brand-row"><a className="brand" href="/" aria-label="Avoozl home"><div className="brand-mark">A</div><span className="brand-label"><strong title={workspaceName}>{workspaceName}</strong><small>Live delivery map</small></span></a><button className="nav-toggle" onClick={toggleNavigation} aria-expanded={!navCollapsed} aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"} title={navCollapsed ? "Expand navigation" : "Collapse navigation"}><Menu size={18} /></button></div>
        <nav>{views.map(({ id, label, icon: Icon }) => <button key={id} className={`${view === id ? "active " : ""}${id === "overview" ? "live-view" : ""}`.trim()} onClick={() => navigate(id)}><Icon size={16} /><span>{label}</span>{id === "overview" && activeTaskCount > 0 && <b aria-label={`${activeTaskCount} ${activeTaskCount === 1 ? "task" : "tasks"} in flight`}>{activeTaskCount}</b>}{id === "conversations" && workspaceData.requests.length > 0 && <b>{workspaceData.requests.length}</b>}</button>)}</nav>
        <div className="nav-foot"><button className="mcp-button">MCP</button><button onClick={() => navigate("settings")} title="Settings"><Settings size={14} /></button><button onClick={refresh} title="Check for updates"><RefreshCw size={14} /></button></div>
        {!navCollapsed && <ResizeHandle value={navWidth} setValue={setNavWidth} min={160} max={360} label="Resize navigation" className="nav-resize-handle" />}
      </aside>
      {navOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <main className="app-main">
        <header className="app-toolbar"><button className="mobile-menu" onClick={toggleNavigation}><Menu size={18} /></button><strong>{currentView.label}</strong>{pageDescriptions[view] && <span className="page-help" tabIndex={0} aria-label={`About ${currentView.label}`} aria-describedby="page-help-tip">?<span className="page-help-tip" id="page-help-tip" role="tooltip">{pageDescriptions[view]}</span></span>}<span className="toolbar-rule" /><span>{toolbarCount}</span><div className="toolbar-spacer" />
          {facetedView && <button className={filtersOpen ? "toolbar-action active" : "toolbar-action"} onClick={toggleFilters} title={filtersOpen ? "Collapse filters" : "Show filters"} aria-expanded={filtersOpen}><Filter size={17} /></button>}
          <button className="toolbar-action" onClick={() => askAgent(PROGRESS_PROMPT)} title="Ask an agent about progress"><MessageSquare size={17} /></button>
          <button className="toolbar-action" onClick={() => { setRunId(null); navigate("conversations"); }} title="New task"><Plus size={17} /></button>
          <button className="toolbar-action" onClick={() => document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen()} title="Full screen"><Maximize2 size={17} /></button>
          <button className="toolbar-action" onClick={() => setWorkbenchFilters({ ...emptyTaskFilters })} title="Reset filters"><RotateCcw size={17} /></button>
        </header>
        {view === "overview" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <RecentNow state={stateData} matchingTasks={tasks} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "tasks" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <RecentTree state={stateData} tasks={tasks} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "epics" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <EpicProgress state={stateData} matchingTasks={tasks} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "conversations" && <Conversations workspace={workspaceData} selected={runId} select={setRunId} refresh={refresh} initialPrompt={draftPrompt} />}
        {view === "plans" && <Plans workspace={workspaceData} selected={planId} select={openPlan} refresh={refresh} />}
        {view === "documents" && <Documents workspace={workspaceData} state={stateData} selected={documentId} select={(id) => id ? openDocument(id) : setDocumentId(null)} selectedPlan={planId} selectPlan={setPlanId} refresh={refresh} />}
        {view === "graph" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <Graph state={stateData} matchingTasks={tasks} openTask={setDrawerTask} />}</FacetedWorkbench>}
        {view === "visualizations" && <Visualizations state={stateData} applyView={applyVisualization} refresh={refresh} />}
        {view === "insights" && <Insights />}
        {view === "settings" && <SettingsView workspace={workspaceData} state={stateData} refresh={refresh} />}
      </main>
      {drawerTask && <TaskDrawer task={drawerTask} state={stateData} close={() => setDrawerTask(null)} refresh={refresh} />}
    </div>
  );
}
