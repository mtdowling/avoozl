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
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createEpicProgress } from "../progress.mjs";
import { createSingleStrip } from "../strip.mjs";
import { createWorkbench } from "../workbench.mjs";
import { dependencyLayout, dependencyPath, NODE_H, NODE_W } from "../graph-layout.mjs";
import { renderUsage } from "../app/ui/usage-charts.mjs";
import { apiUrl, command, get, submissionId } from "./api";
import { McpDialog, TaskInspector, type CaptureContext } from "./ControlPlane";
import { EnhancedGraph } from "./EnhancedGraph";
import { loadState, loadWorkspace, useRemote, useWorkspaceEvents } from "./hooks";
import type { DocumentPlanSummary, DocumentRecord, PlanSummary, Run, RunSummary, SavedSearch, SavedView, State, Task, Workspace } from "./types";

const PlanEditor = lazy(() => import("./Editors").then((module) => ({ default: module.PlanEditor })));
const DocumentEditor = lazy(() => import("./Editors").then((module) => ({ default: module.DocumentEditor })));
const MarkdownPreview = lazy(() => import("./Editors").then((module) => ({ default: module.MarkdownPreview })));
const MarkdownContent = lazy(() => import("./MarkdownContent"));

type View = "overview" | "tasks" | "epics" | "graph" | "documents" | "reports" | "insights" | "plans" | "settings";

const views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Now", icon: Activity },
  { id: "tasks", label: "Tree", icon: ListTodo },
  { id: "epics", label: "Epics", icon: Boxes },
  { id: "graph", label: "Graph", icon: Network },
  { id: "documents", label: "Plans", icon: FileText },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

const internalViews = new Set<View>(["plans", "settings"]);
const pageDescriptions: Partial<Record<View, string>> = {
  overview: "See work in flight, up next, blocked, and waiting for review.",
  tasks: "Browse the task hierarchy with status, ownership, next actions, and blockers.",
  epics: "Compare completed and remaining work across epics.",
  graph: "Explore dependencies and focus on connected tasks and epics.",
  documents: "Read, search, and manage the Markdown plans that define the work.",
  reports: "Save named searches and reopen a live report of matching work.",
  insights: "Review agent activity and reported usage over time.",
};

const CONTEXT_CHAT_PROMPT = "Help with the current Avoozl context. Start with one brief, useful question or response. Do not inventory the workspace, repeat the attached context, or narrate setup and tool use unless I ask.";
const PROJECT_CHAT_PROMPT = "Help with this Avoozl project. Start with one brief, useful question or response. Do not inventory the repository or plans, repeat the attached context, or narrate setup and tool use unless I ask.";
const NEW_TASK_PROMPT = "Help me define one concrete new task. Ask focused questions about the outcome, scope, and acceptance criteria. Do not invent extra work or nitpick. Once we agree, record the request for review.";

function initialLocation() {
  const query = new URLSearchParams(location.search);
  const rawView = query.get("view");
  const requested = (rawView === "activity" ? "overview" : rawView) as View | null;
  const canvasHost =
    query.get("canvas") === "1" || window.self !== window.top;
  const view = (views.some((item) => item.id === requested) || (requested && internalViews.has(requested))) ? requested! : (query.get("plan") ? "plans" : query.get("document") ? "documents" : "overview");
  return {
    canvasHost,
    view,
    planId: query.get("plan"),
    documentId: query.get("document"),
    taskId: query.get("task"),
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
    const root = event.currentTarget.getRootNode();
    const resizeOwner = root instanceof ShadowRoot
      ? root.querySelector<HTMLElement>(".avoozl-canvas-root")
      : document.body;
    const startX = event.clientX;
    const startValue = value;
    const move = (next: PointerEvent) => setValue(startValue + (next.clientX - startX) * (invert ? -1 : 1));
    const stop = () => {
      resizeOwner?.classList.remove("resizing-panels");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    resizeOwner?.classList.add("resizing-panels");
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

function AvoozlLoading({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`center-state avoozl-loading ${className}`} role="status">
    <div className="avoozl-loader" aria-hidden="true"><span>A</span></div>
    <p>{label}</p>
  </div>;
}

function Overview({ workspace, state, openRun, openTask }: { workspace: Workspace; state: State; openRun: (id: string, run?: Run) => void; openTask: (task: Task) => void }) {
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
      if (result.run?.id) openRun(result.run.id, result.run);
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
  const facetCounts = useMemo(() => {
    const counts = {
      scope: new Map<string, number>(),
      status: new Map<string, number>(),
      epic: new Map<string, number>(),
      track: new Map<string, number>(),
      tag: new Map<string, number>(),
    };
    const add = (key: keyof typeof counts, value: string) =>
      counts[key].set(value, (counts[key].get(value) || 0) + 1);
    for (const task of state.tasks) {
      add("scope", task.scope || "runtime");
      add("status", task.status);
      add("epic", task.epic || "");
      add("track", task.track || "");
      for (const tag of task.tags || []) add("tag", tag);
    }
    return counts;
  }, [state.tasks]);
  const savedPromptConfiguration = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("nupp-workspace-session-v1") || "{}"); }
    catch { return {}; }
  }, []);
  const [promptProvider, setPromptProvider] = useState(savedPromptConfiguration.provider || workspace.providers[0]?.id || workspace.providers[0]?.name || "codex");
  const [promptProject, setPromptProject] = useState(savedPromptConfiguration.project || workspace.projects[0]?.id || "");
  const [promptPending, setPromptPending] = useState(false);
  const [promptFeedback, setPromptFeedback] = useState("");
  const promptMode = /^\/prompt(?:\s|$)/.test(filters.query);
  const countFor = (key: keyof typeof facetCounts, value: string) => facetCounts[key].get(value) || 0;
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
      <FacetGroup title="Tags" searchable selected={filters.tags} toggle={(value) => toggle("tags", value)} values={[...facetCounts.tag.keys()].sort().map((tag) => ({ id: tag, label: tag, count: countFor("tag", tag) }))} />
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

const PLAN_STATUS_LABELS: Record<string, string> = {
  "not-started": "Not started",
  started: "Started",
  done: "Done",
  abandoned: "Abandoned",
};

type MarkdownHeading = { title: string; level: number; line: number; id: string };

function headingId(title: string, counts: Map<string, number>) {
  const base = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "section";
  const count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return `${base}${count ? `-${count}` : ""}`;
}

function markdownHeadings(text: string) {
  const counts = new Map<string, number>();
  return text.split("\n").flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) return [];
    const title = match[2].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*_]/g, "");
    return [{ title, level: match[1].length, line: index, id: headingId(title, counts) }];
  });
}

function markdownPages(text: string, maxLines = 350) {
  const lines = text.split("\n");
  const headings = markdownHeadings(text);
  const starts = [0];
  for (const heading of headings) {
    const previous = starts.at(-1) || 0;
    if (heading.line - previous >= maxLines) starts.push(heading.line);
  }
  return starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? lines.length,
    text: lines.slice(start, starts[index + 1] ?? lines.length).join("\n"),
  }));
}

function DocumentMarkdown({ text }: { text: string }) {
  return <article className="markdown-preview prose"><Suspense fallback={<p className="muted">Rendering Markdown…</p>}><MarkdownContent text={text} anchored /></Suspense></article>;
}

function DocumentDetail({ id, state, summary, close, refresh, openTask, openDocument }: {
  id: string;
  state: State;
  summary?: DocumentPlanSummary;
  close: () => void;
  refresh: () => void;
  openTask: (task: Task) => void;
  openDocument: (id: string) => void;
}) {
  const remote = useRemote(() => command<DocumentRecord>("document.get", { id }), [id]);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [classification, setClassification] = useState({ status: "", progressPercent: "", category: "", targetBranch: "" });
  const [width, setWidth] = useOptionalStoredSize("avoozl-document-inspector-width", 420, 2000);
  useEffect(() => {
    setPage(0);
    setMessage("");
  }, [id]);
  useEffect(() => {
    if (!remote.data) return;
    setClassification({
      status: remote.data.plan?.status || "",
      progressPercent: remote.data.plan?.progressPercent?.toString() || "",
      category: remote.data.plan?.category || "",
      targetBranch: remote.data.plan?.targetBranch || "",
    });
  }, [remote.data]);
  const pages = useMemo(() => markdownPages(remote.data?.text || ""), [remote.data?.text]);
  const headings = useMemo(() => markdownHeadings(remote.data?.text || ""), [remote.data?.text]);
  async function saveClassification() {
    setSavingClass(true);
    setMessage("");
    try {
      await command("plan.classify", {
        id,
        status: classification.status || null,
        progressPercent: classification.progressPercent === "" ? null : Number(classification.progressPercent),
        category: classification.category || null,
        targetBranch: classification.targetBranch || null,
      }, state.revision);
      await remote.reload();
      refresh();
      setMessage("Plan classification saved.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setSavingClass(false);
    }
  }
  function openHeading(item: MarkdownHeading) {
    const nextPage = pages.findIndex((candidate) => item.line >= candidate.start && item.line < candidate.end);
    setPage(Math.max(0, nextPage));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(item.id)?.scrollIntoView({ block: "start" })));
  }
  return <div className="inspector-backdrop" style={width ? ({ "--inspector-width": `${width}px` } as React.CSSProperties) : undefined} onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <ResizeHandle value={width || (editing ? 1400 : 920)} setValue={setWidth} min={420} max={2000} invert label="Resize plan panel" className="inspector-resize-handle" />
    <aside className={`document-inspector ${editing ? "editing" : ""}`}>
      <header className="document-heading">
        <div><span className="eyebrow">Plan</span><h1>{remote.data?.title || id}</h1><small>{remote.data?.path || id}</small></div>
        <div className="document-heading-actions">
          {remote.data && <button className="button subtle" onClick={() => void navigator.clipboard.writeText(remote.data?.text || "").then(() => setMessage("Markdown copied."))}>Copy Markdown</button>}
          {remote.data && <a className="button subtle" href={apiUrl(`/source?path=${encodeURIComponent(remote.data.id)}`)} target="_blank" rel="noopener">Raw ↗</a>}
          {remote.data && <button className="button subtle" onClick={() => setEditing((value) => !value)}><Pencil size={14} /> {editing ? "Read plan" : "Edit Markdown"}</button>}
          <button className="icon-button" onClick={close} aria-label="Close plan"><X size={18} /></button>
        </div>
      </header>
      {!remote.data ? <LoadingSurface label={remote.error?.message || "Opening plan…"} /> : editing ?
        <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><DocumentEditor id={id} onSaved={() => { void remote.reload(); refresh(); }} /></Suspense> :
        <div className="document-page rich-document-page">
          <div className="document-reading">
            <section className="plan-summary-card">
              <div><span className={`plan-state state-${summary?.status || "not-started"}`}>{PLAN_STATUS_LABELS[summary?.status || "not-started"]}</span><strong>{summary?.percent || 0}%</strong></div>
              <div className="plan-meter"><i style={{ width: `${summary?.percent || 0}%` }} /></div>
              <p>{summary?.category || "Uncategorized"} · {summary?.branch || "Unassigned branch"} · {summary?.basis || "No tracked tasks"}</p>
            </section>
            <details className="plan-classification">
              <summary>Plan classification</summary>
              <div className="classification-grid">
                <label>Status<select value={classification.status} onChange={(event) => setClassification({ ...classification, status: event.target.value })}><option value="">Automatic from tasks and archive</option>{Object.entries(PLAN_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Completion estimate (%)<input type="number" min={0} max={100} value={classification.progressPercent} onChange={(event) => setClassification({ ...classification, progressPercent: event.target.value })} placeholder="Automatic" /></label>
                <label>Feature area<input value={classification.category} onChange={(event) => setClassification({ ...classification, category: event.target.value })} placeholder={summary?.category || "Uncategorized"} /></label>
                <label>Target branch<input value={classification.targetBranch} onChange={(event) => setClassification({ ...classification, targetBranch: event.target.value })} placeholder="Unassigned" /></label>
              </div>
              <button className="button primary" disabled={savingClass} onClick={() => void saveClassification()}>Save classification</button>
            </details>
            {!!remote.data.taskIds?.length && <details className="doc-links"><summary>{remote.data.taskIds.length} linked tasks</summary>{remote.data.taskIds.slice(0, 40).map((taskId) => {
              const task = state.tasks.find((item) => item.id === taskId);
              return <button className="document-link-row" key={taskId} onClick={() => task && openTask(task)}><strong>{task?.title || taskId}</strong><small>{task?.status || "Task"}</small></button>;
            })}</details>}
            {pages.length > 1 && <div className="document-pages"><button className="button subtle" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous section</button><span>Section {page + 1} of {pages.length}</span><button className="button subtle" disabled={page >= pages.length - 1} onClick={() => setPage((value) => Math.min(pages.length - 1, value + 1))}>Next section</button></div>}
            <DocumentMarkdown text={pages[page]?.text || remote.data.text || ""} />
            {!![...(remote.data.backlinks || []), ...(remote.data.links || [])].length && <details className="doc-links"><summary>Linked plans and backlinks</summary>{[...new Set([...(remote.data.backlinks || []), ...(remote.data.links || [])])].map((documentId) => <button className="document-link-row" key={documentId} onClick={() => openDocument(documentId)}><strong>{state.documents[documentId]?.title || documentId}</strong><small>{documentId}</small></button>)}</details>}
            {message && <p className="document-message" role="status">{message}</p>}
          </div>
          {!!headings.length && <aside className="document-contents"><strong>Contents</strong>{headings.map((heading) => <button key={`${heading.id}:${heading.line}`} style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 10}px` }} onClick={() => openHeading(heading)}>{heading.title}</button>)}</aside>}
        </div>}
    </aside>
  </div>;
}

function ProposalsBrowser({ workspace, selectedPlan, selectPlan, refresh, planWithAgent }: {
  workspace: Workspace;
  selectedPlan: string | null;
  selectPlan: (id: string | null) => void;
  refresh: () => void;
  planWithAgent: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [writing, setWriting] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const page = useRemote(() => command<{ items: PlanSummary[]; total: number; offset: number; limit: number }>("plan.list", { offset, limit: 24 }), [offset, version, workspace.revision]);
  useEffect(() => {
    if (selectedPlan) return;
    const timer = window.setInterval(() => setVersion((value) => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, [selectedPlan]);
  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const plan = await command<PlanSummary>("plan.create", { prompt });
      setWriting(false);
      setPrompt("");
      selectPlan(plan.id);
      refresh();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (selectedPlan) return <Suspense fallback={<LoadingSurface label="Loading Monaco…" />}><PlanEditor id={selectedPlan} onSaved={refresh} /></Suspense>;
  return <div className="proposal-browser">
    <div className="library-heading"><h2>Proposals</h2><div><button className="button subtle" onClick={() => setWriting(true)}><Plus size={14} /> Write plan</button><button className="button subtle" onClick={planWithAgent}><Bot size={14} /> Plan with agent</button></div></div>
    {writing && <form className="proposal-create" onSubmit={createPlan}><label>What should this plan accomplish?<textarea autoFocus value={prompt} onChange={(event) => setPrompt(event.target.value)} required maxLength={20000} /></label><div><button type="button" className="button subtle" onClick={() => setWriting(false)}>Cancel</button><button className="button primary" disabled={busy || !prompt.trim()}>{busy ? "Creating…" : "Create draft"}</button></div></form>}
    {!page.data ? <LoadingSurface label={page.error?.message || "Loading proposals…"} /> : <>
      <div className="proposal-list">{page.data.items.map((plan) => <button className="proposal-row" key={plan.id} onClick={() => selectPlan(plan.id)}><b>{plan.title}</b><span>Revision {plan.revision || 1}</span><span>{plan.state || "draft"}</span></button>)}</div>
      {!page.data.items.length && <p className="muted">No proposals yet. Write a plan or develop one with an agent.</p>}
      {page.data.total > page.data.limit && <div className="list-pager"><button className="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - page.data!.limit))}>Previous</button><span>{offset + 1}–{Math.min(page.data.total, offset + page.data.limit)} of {page.data.total}</span><button className="button" disabled={offset + page.data.limit >= page.data.total} onClick={() => setOffset(offset + page.data!.limit)}>Next</button></div>}
    </>}
    {message && <p className="error">{message}</p>}
  </div>;
}

function Documents({ workspace, state, filters, clearTaskFilters, selected, select, selectedPlan, selectPlan, refresh, openTask, planWithAgent }: {
  workspace: Workspace;
  state: State;
  filters: TaskFilters;
  clearTaskFilters: () => void;
  selected: string | null;
  select: (id: string | null) => void;
  selectedPlan: string | null;
  selectPlan: (id: string | null) => void;
  refresh: () => void;
  openTask: (task: Task) => void;
  planWithAgent: () => void;
}) {
  const [section, setSection] = useState<"library" | "proposals">(selectedPlan ? "proposals" : "library");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"category" | "branch" | "status" | "folder">("category");
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const docs = useRemote(() => get<{ documents: DocumentRecord[]; total: number }>(`/api/documents${search ? `?q=${encodeURIComponent(search)}` : ""}`), [workspace.revision, search]);
  const planSummary = useRemote(() => get<{ plans: DocumentPlanSummary[] }>("/api/plan-summary?abandoned=true"), [workspace.revision]);
  useEffect(() => { if (selectedPlan) setSection("proposals"); }, [selectedPlan]);
  const records = docs.data?.documents || [];
  const summaries = new Map((planSummary.data?.plans || []).map((item) => [item.id, item]));
  const taskFiltersActive = filters.query.trim() !== "" || filters.historical || (["scopes", "work", "statuses", "epics", "tracks", "tags", "activity"] as TaskArrayFilterKey[]).some((key) => filters[key].length > 0);
  const matchingTaskIds = new Set(taskFiltersActive ? filteredTasks(state, filters).map((task) => task.id) : []);
  const filtered = records.filter((doc) => {
    const status = summaries.get(doc.id)?.status || doc.plan?.status || "not-started";
    if (visibleStatuses.length && !visibleStatuses.includes(status)) return false;
    if (taskFiltersActive && !doc.taskIds?.some((id) => matchingTaskIds.has(id))) return false;
    return true;
  });
  const groupName = (doc: DocumentRecord) => group === "folder" ? (doc.path || doc.id).split("/")[0] :
    group === "status" ? PLAN_STATUS_LABELS[summaries.get(doc.id)?.status || "not-started"] :
    group === "branch" ? (summaries.get(doc.id)?.branch || "Unassigned branch") :
    (summaries.get(doc.id)?.category || "Uncategorized");
  const grouped = [...new Set(filtered.map(groupName))].sort().map((name) => ({ name, docs: filtered.filter((doc) => groupName(doc) === name) }));
  const statuses = Object.keys(PLAN_STATUS_LABELS);
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
            <div className="library-statuses">{statuses.map((status) => <button key={status} aria-pressed={visibleStatuses.includes(status)} onClick={() => setVisibleStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status])}>{PLAN_STATUS_LABELS[status]}<span>({records.filter((doc) => (summaries.get(doc.id)?.status || "not-started") === status).length})</span></button>)}</div>
          </div>
        </details>
      </div>}
    </header>
    {section === "library" ? !docs.data ? <AvoozlLoading className="plans-loading" label={docs.error?.message || "Loading plans…"} /> : <div className="library-window">
      <div className="library-scroll-heading"><h2>Plan library</h2><p>{filtered.length} plans{query ? ` matching “${query}”` : ""}</p>{taskFiltersActive && <button className="active-plan-filter" onClick={clearTaskFilters}>Task filters are also applied · clear</button>}</div>
      {grouped.map((item) => <section className="library-group" key={item.name}><h3 className="virtual-group-heading">{item.name} <span>{item.docs.length}</span></h3>{item.docs.map((doc) => {
        const summary = summaries.get(doc.id);
        const linked = summary?.total ?? doc.taskIds?.length ?? 0;
        const done = summary?.done ?? 0;
        const percent = summary?.percent ?? 0;
        return <button className="plan-table-row" key={doc.id} onClick={() => select(doc.id)}>
          <b title={doc.title}>{doc.title}</b>
          <span title={summary?.branch || doc.path}>{summary?.branch || doc.path}</span>
          <span className={`plan-state state-${summary?.status || "not-started"}`}>{PLAN_STATUS_LABELS[summary?.status || "not-started"]}</span>
          <span>{done} / {linked} tasks</span>
          <span className="plan-percent" title={summary?.basis}>{percent}%<i><em style={{ width: `${percent}%` }} /></i></span>
        </button>;
      })}</section>)}
      {!filtered.length && <Empty icon={BookOpen} title="No matching plans">Change the search or plan filters.</Empty>}
    </div> : <ProposalsBrowser workspace={workspace} selectedPlan={selectedPlan} selectPlan={selectPlan} refresh={refresh} planWithAgent={planWithAgent} />}
    {selected && <DocumentDetail id={selected} state={state} summary={summaries.get(selected)} close={() => select(null)} refresh={() => { void Promise.all([docs.reload(), planSummary.reload()]); refresh(); }} openTask={openTask} openDocument={(documentId) => select(documentId)} />}
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
  const stage = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }> | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeDrag, setNodeDrag] = useState<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const movedNode = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setPositions(null);
    setLayoutReady(false);
    setManualPositions({});
    const timer = window.setTimeout(() => {
      const next = dependencyLayout(tasks, links, (task: Task) => task.epic || "");
      if (!cancelled) setPositions(next);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [links, tasks]);
  const displayPositions = useMemo(() => ({ ...(positions || {}), ...manualPositions }), [manualPositions, positions]);
  const bounds = useMemo(() => {
    const points = Object.values(positions || {});
    const minX = Math.min(0, ...points.map((point) => point.x)) - 110;
    const minY = Math.min(0, ...points.map((point) => point.y)) - 55;
    const maxX = Math.max(NODE_W, ...points.map((point) => point.x + NODE_W)) + 110;
    const maxY = Math.max(NODE_H, ...points.map((point) => point.y + NODE_H)) + 55;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [positions]);
  const fit = useCallback(() => {
    if (!positions) return;
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const scale = Math.max(.05, Math.min(1.25, box.width / bounds.width, box.height / bounds.height));
    setCamera({
      scale,
      x: (box.width - bounds.width * scale) / 2 - bounds.minX * scale,
      y: (box.height - bounds.height * scale) / 2 - bounds.minY * scale,
    });
  }, [bounds, positions]);
  useLayoutEffect(() => {
    if (!positions) return;
    fit();
    setLayoutReady(true);
  }, [fit, positions]);
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
      <div id="graph-stage" className={!layoutReady ? "loading" : drag ? "dragging" : ""} ref={stage} tabIndex={0}
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
        {!layoutReady ? <AvoozlLoading className="graph-loading" label="Laying out task graph…" /> : <><svg id="graph" role="group" aria-label="Task dependency graph"
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
        </>}
      </div>
      {layoutReady && <div className="graph-footer"><span>{tasks.length} matching tasks · {links.length} connections</span><span>Positions stay in this browser. Task data comes from the workspace.</span></div>}
    </section>
  );
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

function reportFilters(value: SavedSearch["filters"]): TaskFilters {
  return {
    query: value.query || "",
    scopes: value.scopes || [],
    work: value.work || [],
    statuses: value.statuses || [],
    epics: value.epics || [],
    tracks: value.tracks || [],
    tags: value.tags || [],
    activity: value.activity || [],
    historical: value.historical || false,
  };
}

function Reports({ state, filters, sourceView, apply, openTask, refresh }: {
  state: State;
  filters: TaskFilters;
  sourceView: View;
  apply: (report: SavedSearch) => void;
  openTask: (task: Task) => void;
  refresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const reports = state.savedSearches || [];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await command("report.save", {
        title,
        view: ["overview", "tasks", "epics", "graph", "documents"].includes(sourceView) ? sourceView : "tasks",
        filters,
      }, state.revision);
      setTitle("");
      refresh();
      setMessage("Report saved.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(report: SavedSearch) {
    if (!confirm(`Delete the saved report “${report.title}”? Tasks and plans are not affected.`)) return;
    await command("report.delete", { id: report.id }, state.revision);
    refresh();
  }
  return <section className="screen reports-screen">
    <header className="screen-heading"><div><h1>Reports</h1><p>Named searches stay live as task state changes.</p></div></header>
    <form className="report-save" onSubmit={save}>
      <label>Save the current task filters<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Report name" required maxLength={160} /></label>
      <span>{filteredTasks(state, filters).length} tasks currently match</span>
      <button className="button primary" disabled={busy || !title.trim()}>Save report</button>
    </form>
    {message && <p className="report-message">{message}</p>}
    <div className="report-grid">{reports.map((report) => {
      const matching = filteredTasks(state, reportFilters(report.filters));
      const counts = state.statuses.map((status) => ({ status, count: matching.filter((task) => task.status === status.id).length })).filter((item) => item.count);
      return <article className="report-card" key={report.id}>
        <header><div><span>{report.view}</span><h2>{report.title}</h2></div><strong>{matching.length}</strong></header>
        <div className="report-breakdown">{counts.map(({ status, count }) => <span key={status.id}><i style={{ background: status.color || "#8899aa" }} />{status.label} {count}</span>)}</div>
        <div className="report-preview">{matching.slice(0, 5).map((task) => <button key={task.id} onClick={() => openTask(task)}><strong>{task.title}</strong><small>{task.id}</small></button>)}{!matching.length && <p>No tasks currently match.</p>}</div>
        <footer><button className="button primary" onClick={() => apply(report)}>Open live report</button><button className="button subtle" onClick={() => void remove(report)}>Delete</button></footer>
      </article>;
    })}</div>
    {!reports.length && <Empty icon={BarChart3} title="No saved reports">Set task filters in Now, Tree, Epics, or Graph, then save them here.</Empty>}
  </section>;
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

function GitHubSettings({ workspace, refresh, openRun }: { workspace: Workspace; refresh: () => void; openRun: (id: string, run?: Run) => void }) {
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
    if (run?.id) openRun(run.id, run);
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

function SettingsView({ workspace, state, refresh, openRun }: { workspace: Workspace; state: State; refresh: () => void; openRun: (id: string, run?: Run) => void }) {
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
      <GitHubSettings workspace={workspace} refresh={refresh} openRun={openRun} />
    </div>}
  </section>;
}

export type CanvasHost = {
  serverUrl: string;
  navigate: (path: string) => void;
};

export function App({ canvas }: { canvas?: CanvasHost } = {}) {
  const initial = useMemo(
    () =>
      canvas
        ? {
            canvasHost: true,
            view: "overview" as View,
            planId: null,
            documentId: null,
            taskId: null,
          }
        : initialLocation(),
    [canvas],
  );
  const canvasHost = Boolean(canvas) || initial.canvasHost;
  const [view, setView] = useState<View>(initial.view);
  const [planId, setPlanId] = useState<string | null>(initial.planId);
  const [documentId, setDocumentId] = useState<string | null>(initial.documentId);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [workbenchFilters, setWorkbenchFilters] = useState<TaskFilters>(emptyTaskFilters);
  const [reportSourceView, setReportSourceView] = useState<SavedSearch["view"]>(() =>
    ["overview", "tasks", "epics", "graph", "documents"].includes(initial.view)
      ? initial.view as SavedSearch["view"]
      : "tasks",
  );
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
    if (!initial.taskId || !state.data || drawerTask) return;
    const task = state.data.tasks.find((item) => item.id === initial.taskId);
    if (task) setDrawerTask(task);
  }, [drawerTask, initial.taskId, state.data]);

  useEffect(() => {
    if (canvas) return;
    const query = new URLSearchParams();
    if (canvasHost) query.set("canvas", "1");
    query.set("view", view === "overview" ? "activity" : view);
    if (view === "plans" && planId) query.set("plan", planId);
    if (view === "documents") {
      if (documentId) query.set("document", documentId);
      if (planId) query.set("plan", planId);
    }
    if (drawerTask) query.set("task", drawerTask.id);
    history.replaceState(null, "", "?" + query);
  }, [canvas, canvasHost, view, planId, documentId, drawerTask]);

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
    if (!canvasHost || canvas) return;
    const allowed = new Set([
      "--bg", "--panel", "--panel-2", "--panel-3", "--line", "--border", "--muted", "--text",
      "--bright", "--accent", "--accent-2", "--selected", "--danger", "--on", "--landed",
    ]);
    const applyCanvasTheme = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "avoozl:canvas-theme" || !event.data.theme || typeof event.data.theme !== "object") return;
      for (const [name, value] of Object.entries(event.data.theme)) {
        if (allowed.has(name) && typeof value === "string" && CSS.supports("color", value)) {
          document.documentElement.style.setProperty(name, value);
        }
      }
    };
    window.addEventListener("message", applyCanvasTheme);
    return () => window.removeEventListener("message", applyCanvasTheme);
  }, [canvas, canvasHost]);

  useEffect(() => {
    const openSession = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) void openRun(id);
    };
    const askContext = async (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt) return;
      await startOpenHandsIntent("ask", prompt, { purpose: "project-chat", scoped: true });
    };
    window.addEventListener("nupp-open-session", openSession);
    window.addEventListener("nupp-ask-context", askContext);
    return () => {
      window.removeEventListener("nupp-open-session", openSession);
      window.removeEventListener("nupp-ask-context", askContext);
    };
  }, [workspace.data]);

  function navigate(next: View) {
    if (
      next === "reports" &&
      ["overview", "tasks", "epics", "graph", "documents"].includes(view)
    )
      setReportSourceView(view as SavedSearch["view"]);
    setView(next);
    setNavOpen(false);
  }
  async function startOpenHandsIntent(
    action: "ask" | "draft",
    prompt: string,
    { purpose, scoped = true }: { purpose?: "new-task" | "project-chat"; scoped?: boolean } = {},
  ) {
    const context = captureContext({ purpose, scoped });
    const projectId = context.projectId;
    if (action === "draft" && !projectId) {
      window.alert("Configure an execution project before opening OpenHands.");
      return;
    }
    const id = submissionId();
    try {
      const result = await command<any>("intent.submit", {
        action,
        prompt,
        provider: "openhands",
        projectId,
        approvalMode: "manual",
        submissionId: id,
        runId: "run-" + id,
        context,
        title: `Avoozl · ${drawerTask?.title || workspace.data?.plans.find((plan) => plan.id === planId)?.title || views.find((item) => item.id === view)?.label || "Workspace"}`,
      });
      if (result.run?.id) await openRun(result.run.id, result.run);
      else if (result.plan?.id) openPlan(result.plan.id);
    } catch (error) {
      window.alert((error as Error).message);
    }
  }
  async function startTaskInOpenHands(task: Task) {
    const projectId =
      task.projectId ||
      workspace.data?.runs.find((run) => run.taskId === task.id)?.projectId ||
      workspace.data?.projects[0]?.id;
    if (!projectId) {
      window.alert("Configure an execution project before starting this task.");
      return;
    }
    try {
      const run = await command<Run>("run.start", {
        taskId: task.id,
        provider: "openhands",
        projectId,
        mode: "implement",
        approvalMode: "manual",
      });
      setDrawerTask(null);
      refresh();
      await openRun(run.id, run);
    } catch (error) {
      window.alert((error as Error).message);
    }
  }
  async function openRun(id: string, startedRun?: Run) {
    let run: Run | RunSummary | undefined = startedRun || workspace.data?.runs.find((candidate) => candidate.id === id);
    if (!run || run.provider === "openhands") {
      for (let attempt = 0; attempt < 40 && !run?.providerSessionId && run?.state !== "failed"; attempt++) {
        if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 250));
        try {
          run = await command<Run>("run.get", { id, compact: true, limit: 1 });
        } catch {
          break;
        }
      }
      if (run?.provider === "openhands" && run.providerSessionId) {
        if (canvas) {
          canvas.navigate(
            `/conversations/${encodeURIComponent(run.providerSessionId)}`,
          );
          return;
        }
        let target = "*";
        try {
          if (document.referrer) target = new URL(document.referrer).origin;
        } catch {}
        window.parent.postMessage({
          type: "avoozl:openhands-conversation",
          conversationId: run.providerSessionId,
        }, target);
        return;
      }
      if (run?.provider === "openhands") {
        window.alert(typeof run.error === "string" ? run.error : run.error?.message || "The OpenHands conversation is still starting. Try opening it again in a moment.");
        refresh();
        return;
      }
    }
    window.alert("This is not an OpenHands conversation. Avoozl no longer renders provider chat.");
  }
  function openPlan(id: string) { setPlanId(id); navigate("plans"); }
  function openDocument(id: string) { setDocumentId(id); navigate("documents"); }
  function openTask(task: Task) { setDrawerTask(task); }
  function exploreTask(task: Task) {
    setWorkbenchFilters({ ...emptyTaskFilters, query: `id:${task.id}` });
    setDrawerTask(null);
    navigate("graph");
  }
  function captureContext(
    { purpose, scoped = true }: { purpose?: "new-task" | "project-chat"; scoped?: boolean } = {},
  ): CaptureContext {
    const visibleTasks = filteredTasks(stateData, workbenchFilters);
    const configuredProjectIds = new Set(
      workspaceData.projects.map((project) => project.id),
    );
    const visibleProjectIds = [
      ...new Set(
        visibleTasks
          .map((task) => task.projectId)
          .filter(
            (projectId): projectId is string =>
              Boolean(projectId && configuredProjectIds.has(projectId)),
          ),
      ),
    ] as string[];
    const selectedPlan = workspaceData.plans.find((plan) => plan.id === planId);
    const projectId =
      (drawerTask?.projectId &&
      configuredProjectIds.has(drawerTask.projectId)
        ? drawerTask.projectId
        : undefined) ||
      (selectedPlan?.projectId &&
      configuredProjectIds.has(selectedPlan.projectId)
        ? selectedPlan.projectId
        : undefined) ||
      (visibleProjectIds.length === 1 ? visibleProjectIds[0] : undefined) ||
      (workspaceData.projects.length === 1
        ? workspaceData.projects[0].id
        : undefined);
    const filterStrings = {
      scope: workbenchFilters.scopes.join(","),
      q: workbenchFilters.query,
      status: workbenchFilters.statuses.join(","),
      activity: workbenchFilters.activity.join(","),
      epic: workbenchFilters.epics.join(","),
      track: workbenchFilters.tracks.join(","),
      tag: workbenchFilters.tags.join(","),
      relation: "",
    };
    return {
      revision: stateData.revision,
      view: scoped ? (view === "overview" ? "activity" : view === "epics" ? "epics" : ["tasks", "graph", "documents"].includes(view) ? view : "tasks") : "project",
      selected: scoped ? drawerTask?.id : undefined,
      document: scoped ? documentId : null,
      planId: scoped ? planId : null,
      projectId,
      taskIds: scoped ? visibleTasks.slice(0, 500).map((task) => task.id) : [],
      filters: scoped ? Object.fromEntries(Object.entries(filterStrings).filter(([, value]) => value)) : {},
      url: scoped ? `/?view=${encodeURIComponent(view === "overview" ? "activity" : view)}${drawerTask ? `&task=${encodeURIComponent(drawerTask.id)}` : ""}${documentId ? `&document=${encodeURIComponent(documentId)}` : ""}` : "/",
      conversationPurpose: purpose,
    };
  }
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

  if (!canvasHost) return <div className="boot-screen embedded-only"><div className="brand-mark">A</div><h1>Avoozl runs in OpenHands</h1><p>Open the Avoozl Canvas extension to plan, route, and inspect work. OpenHands owns conversations, terminals, files, and browsers.</p></div>;
  if (!workspace.data || !state.data) return <div className="boot-screen"><div className="brand-mark"><Sparkles /></div><h1>Avoozl</h1><p>{workspace.error?.message || state.error?.message || "Opening workspace…"}</p></div>;
  const workspaceData = workspace.data;
  const stateData = state.data;
  const visibleViews = views;
  const workspaceName = stateData.project?.workspaceName || stateData.project?.title || stateData.project?.name || "Avoozl";
  const currentView = views.find((item) => item.id === view) || {
    id: view,
    icon: LayoutDashboard,
    label: view === "plans" ? "Proposal" : "Settings",
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
    view === "documents" ? `${Object.keys(stateData.documents).length} plans` :
    view === "reports" ? `${stateData.savedSearches?.length || 0} saved reports` :
    view === "insights" ? "Usage trends" :
    `${stateData.tasks.length} tasks`;
  const canvasServer = canvas?.serverUrl || window.location.origin;
  return (
    <div className={`app-shell ${canvasHost ? "canvas-host " : ""}${navCollapsed ? "nav-collapsed" : ""}`} style={{ "--nav-width": `${navCollapsed ? 44 : navWidth}px` } as React.CSSProperties}>
      <aside className={navOpen ? "app-nav open" : "app-nav"}>
        <div className="site-brand-row">{canvas ? <button className="brand" onClick={() => navigate("overview")} aria-label="Avoozl home"><div className="brand-mark">A</div><span className="brand-label"><strong title={workspaceName}>{workspaceName}</strong><small>Live delivery map</small></span></button> : <a className="brand" href={canvasHost ? "/?canvas=1" : "/"} aria-label="Avoozl home"><div className="brand-mark">A</div><span className="brand-label"><strong title={workspaceName}>{workspaceName}</strong><small>Live delivery map</small></span></a>}<button className="nav-toggle" onClick={toggleNavigation} aria-expanded={!navCollapsed} aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"} title={navCollapsed ? "Expand navigation" : "Collapse navigation"}><Menu size={18} /></button></div>
        <nav>{visibleViews.map(({ id, label, icon: Icon }) => <button key={id} className={`${view === id ? "active " : ""}${id === "overview" ? "live-view" : ""}`.trim()} onClick={() => navigate(id)}><Icon size={16} /><span>{label}</span>{id === "overview" && activeTaskCount > 0 && <b aria-label={`${activeTaskCount} ${activeTaskCount === 1 ? "task" : "tasks"} in flight`}>{activeTaskCount}</b>}</button>)}</nav>
        <div className="nav-foot"><button className="mcp-button" onClick={() => setMcpOpen(true)}>MCP</button><button onClick={() => navigate("settings")} title="Settings"><Settings size={14} /></button><button onClick={refresh} title="Check for updates"><RefreshCw size={14} /></button></div>
        {!navCollapsed && <ResizeHandle value={navWidth} setValue={setNavWidth} min={160} max={360} label="Resize navigation" className="nav-resize-handle" />}
      </aside>
      {navOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <main className="app-main">
        <header className="app-toolbar"><button className="mobile-menu" onClick={toggleNavigation}><Menu size={18} /></button>
          {canvasHost ? <nav className="canvas-view-tabs" aria-label="Avoozl views">{visibleViews.map(({ id, label }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)} aria-current={view === id ? "page" : undefined}>{label}</button>)}</nav> : <><strong>{currentView.label}</strong>{pageDescriptions[view] && <span className="page-help" tabIndex={0} aria-label={`About ${currentView.label}`} aria-describedby="page-help-tip">?<span className="page-help-tip" id="page-help-tip" role="tooltip">{pageDescriptions[view]}</span></span>}</>}
          {(!canvasHost || view !== "insights") && <><span className="toolbar-rule" /><span>{toolbarCount}</span></>}
          <div className="toolbar-spacer" />
          {canvasHost && <button className="canvas-connection" onClick={() => setMcpOpen(true)} aria-label="Avoozl instance is live" aria-describedby="canvas-connection-tip"><i aria-hidden="true" /><span className="canvas-connection-tip" id="canvas-connection-tip" role="tooltip"><strong>Avoozl is live</strong><span>Avoozl server <code>{canvasServer}</code></span><span>MCP server <code>{canvasServer}/mcp</code></span><span>Workspace <code>{workspaceName}</code></span><span>Surface <code>OpenHands Canvas</code></span></span></button>}
          {facetedView && <button className={filtersOpen ? "toolbar-action active" : "toolbar-action"} onClick={toggleFilters} title={filtersOpen ? "Collapse filters" : "Show filters"} aria-expanded={filtersOpen}><Filter size={17} /></button>}
          <details className="toolbar-new-menu">
            <summary className="toolbar-new-trigger" title="Start with OpenHands"><MessageSquare size={16} /><span>New</span><ChevronDown size={13} /></summary>
            <div className="toolbar-new-options">
              <button onClick={() => void startOpenHandsIntent("ask", NEW_TASK_PROMPT, { purpose: "new-task", scoped: false })}><strong>New task</strong><small>Shape work from project context</small></button>
              <button onClick={() => void startOpenHandsIntent("ask", NEW_TASK_PROMPT, { purpose: "new-task", scoped: true })}><strong>New scoped task</strong><small>Include this view and selection</small></button>
              <button onClick={() => void startOpenHandsIntent("ask", PROJECT_CHAT_PROMPT, { purpose: "project-chat", scoped: false })}><strong>Project chat</strong><small>Discuss the repository and plans</small></button>
              <button onClick={() => void startOpenHandsIntent("ask", CONTEXT_CHAT_PROMPT, { purpose: "project-chat", scoped: true })}><strong>Scoped chat</strong><small>Include this view and selection</small></button>
            </div>
          </details>
          <button className="toolbar-action" onClick={() => navigate("settings")} title="Avoozl settings"><Settings size={17} /></button>
          <button className="toolbar-action" onClick={() => document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen()} title="Full screen"><Maximize2 size={17} /></button>
          <button className="toolbar-action" onClick={() => setWorkbenchFilters({ ...emptyTaskFilters })} title="Reset filters"><RotateCcw size={17} /></button>
        </header>
        {view === "overview" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <RecentNow state={stateData} matchingTasks={tasks} openTask={openTask} />}</FacetedWorkbench>}
        {view === "tasks" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <RecentTree state={stateData} tasks={tasks} openTask={openTask} />}</FacetedWorkbench>}
        {view === "epics" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <EpicProgress state={stateData} matchingTasks={tasks} openTask={openTask} />}</FacetedWorkbench>}
        {view === "plans" && <Plans workspace={workspaceData} selected={planId} select={openPlan} refresh={refresh} />}
        {view === "documents" && <Documents workspace={workspaceData} state={stateData} filters={workbenchFilters} clearTaskFilters={() => setWorkbenchFilters({ ...emptyTaskFilters })} selected={documentId} select={(id) => id ? openDocument(id) : setDocumentId(null)} selectedPlan={planId} selectPlan={setPlanId} refresh={refresh} openTask={openTask} planWithAgent={() => void startOpenHandsIntent("draft", "Develop a design plan for the outcome below. Ask clarifying questions where needed, then produce a reviewable Markdown plan with explicit deliverables and acceptance criteria.", { scoped: true })} />}
        {view === "graph" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{(tasks) => <EnhancedGraph state={stateData} matchingTasks={tasks} openTask={openTask} />}</FacetedWorkbench>}
        {view === "reports" && <FacetedWorkbench workspace={workspaceData} state={stateData} filters={workbenchFilters} setFilters={setWorkbenchFilters} filtersOpen={filtersOpen} applyPromptView={applyVisualization}>{() => <Reports state={stateData} filters={workbenchFilters} sourceView={reportSourceView} apply={(report) => { setWorkbenchFilters(reportFilters(report.filters)); navigate(report.view); }} openTask={openTask} refresh={refresh} />}</FacetedWorkbench>}
        {view === "insights" && <Insights />}
        {view === "settings" && <SettingsView workspace={workspaceData} state={stateData} refresh={refresh} openRun={openRun} />}
      </main>
      {drawerTask && <TaskInspector key={drawerTask.id} task={drawerTask} state={stateData} close={() => setDrawerTask(null)} refresh={refresh} openDocument={(id) => { setDrawerTask(null); openDocument(id); }} openRun={(id) => { setDrawerTask(null); void openRun(id); }} startRun={startTaskInOpenHands} exploreGraph={exploreTask} filterTag={(tag) => { setWorkbenchFilters({ ...emptyTaskFilters, tags: [tag] }); setDrawerTask(null); navigate("tasks"); }} />}
      {mcpOpen && <McpDialog serverUrl={canvasServer} workspace={workspaceData} close={() => setMcpOpen(false)} />}
    </div>
  );
}
