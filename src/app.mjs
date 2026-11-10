const workspaceActive = () =>
  location.pathname === "/workspace" ||
  document.body.classList.contains("execution-open");
import { updateOnboarding } from "./onboarding.mjs";
import {
  NODE_W,
  NODE_H,
  dependencyLayout,
  dependencyPath,
} from "./graph-layout.mjs";
import { createPanMomentum } from "./pan-momentum.mjs";
import { resolveTaskId, taskSourceRefs, randomUUID } from "./task-identity.mjs";
import { createVirtualList } from "./virtual-list.mjs";
import { browseRows, includeHistorical } from "./browse-model.mjs";
import { documentPages } from "./document-pages.mjs";
import { createFacetSearch, queryTerms } from "./facets.mjs";
import { activityState } from "./activity.mjs";
import { createWorkbench } from "./workbench.mjs";
import { taskSignals, focusedNeighborhood } from "./workbench-model.mjs";
import { documentHeadings } from "./markdown.mjs";
import { renderMarkdown, copyMarkdown, copyIcon } from "./markdown.mjs";
import { planSummaries, PLAN_STATUSES } from "./plan-model.mjs";
import { createSingleStrip } from "./strip.mjs";
import { createEpicProgress } from "./progress.mjs";
import { queryTasks, graphNeighbors, statusComplete } from "./query.mjs";
const $ = (id) => document.getElementById(id),
  esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const params = new URLSearchParams(location.search),
  state = {
    historical: params.get("historical") === "true",
    view: params.get("view") || "activity",
    focusTask: params.get("focusTask") || "",
    q: params.get("q") || "",
    scope: params.get("scope") || "all",
    activity: params.get("activity") || "",
    status: params.get("status") || "",
    epic: params.get("epic") || "",
    track: params.get("track") || "",
    tag: params.get("tag") || "",
    relation: params.get("relation") || "",
    selected: params.get("node") || "",
    document: params.get("document") || "",
    group: params.get("group") || "track",
    detail: params.get("detail") || "overview",
    page: 0,
    epicZoom: Math.max(
      1,
      Math.min(16384, Number(params.get("epicZoom")) || 100),
    ),
    stripScale: Math.max(1, Number(params.get("stripZoom")) || 1),
    stripCenter: Math.max(0, Math.min(1, Number(params.get("stripAt")) || 0.5)),
    stripFocus: "",
    stripFocusToken: "",
    stripOrder:
      params.get("stripOrder") === "progress" ? "progress" : "chronological",
    taskIds: [],
    visualization: params.get("visualization") || "",
  };
if (["report", "home", "queue", "strip"].includes(state.view))
  state.view = "activity";
let planSearch = params.get("planSearch") || "",
  planSearchIds = null,
  planSearchTimer,
  planSearchController,
  libraryScroll = 0;
let planSection =
    params.get("planSection") === "proposals" ? "proposals" : "library",
  proposalOffset = Math.max(0, Number(params.get("proposalAt")) || 0),
  proposalVersion = 0,
  proposalTimer;
if (state.view === "tasks" && !params.has("group")) state.group = "epic";
let activityExpiryTimer = 0,
  browserWorker = randomUUID();
try {
  browserWorker = sessionStorage.getItem("nupp-plan-worker") || browserWorker;
  sessionStorage.setItem("nupp-plan-worker", browserWorker);
} catch {}
let data,
  etag = "",
  pollTimer,
  loading = false,
  lastRequest = 0,
  failed = 0,
  rows = [],
  nodeById = new Map(),
  edgeSet = [],
  graphNodes = [],
  graphLinks = [],
  positions = {},
  transform = { x: 0, y: 0, k: 1 },
  frame = 0,
  fitPending = true,
  lastGraphKey = "",
  lastSelected = "",
  positionMode = "",
  positionLayouts = {},
  editEtag = "",
  editingTask = null,
  editingDocument = null;
const planDrafts = new Map(),
  documentCache = new Map(),
  documentRequests = new Map();
let viewList = null,
  lastRenderedView = "",
  documentPage = 0,
  documentPageId = "",
  plainSearch = "",
  searchTaskIds = null,
  searchDocumentIds = null,
  searchController;
let lookupData, lookups;
function lookup() {
  if (lookupData !== data) {
    lookupData = data;
    lookups = {
      tasks: new Map(data.tasks.map((t) => [t.id, t])),
      epics: new Map(data.epics.map((e) => [e.id, e])),
      tracks: new Map(data.tracks.map((t) => [t.id, t])),
    };
  }
  return lookups;
}
async function ensureDocument(id) {
  const doc = data.documents[id];
  if (!doc) throw Error("Document not found");
  if (typeof doc.text === "string") return doc;
  const cached = documentCache.get(id);
  if (cached?.hash === doc.hash) {
    doc.text = cached.text;
    documentCache.delete(id);
    documentCache.set(id, cached);
    return doc;
  }
  if (documentRequests.has(id)) return documentRequests.get(id);
  const promise = fetch("/api/document?id=" + encodeURIComponent(id))
    .then(async (r) => {
      const full = await r.json();
      if (!r.ok) throw Error(full.error);
      if (data.documents[id]?.hash === full.hash) {
        data.documents[id].text = full.text;
        documentCache.set(id, { hash: full.hash, text: full.text });
        while (documentCache.size > 4) {
          const old = documentCache.keys().next().value;
          documentCache.delete(old);
          if (data.documents[old]) delete data.documents[old].text;
        }
      }
      return full;
    })
    .finally(() => documentRequests.delete(id));
  documentRequests.set(id, promise);
  return promise;
}
function remoteSearch() {
  const text = queryTerms(state.q)
    .filter((t) => !t.includes(":"))
    .join(" ");
  if (text === plainSearch) return;
  plainSearch = text;
  searchTaskIds = null;
  searchDocumentIds = null;
  state.searchIds = null;
  searchController?.abort();
  if (!text) return;
  searchController = new AbortController();
  const signal = searchController.signal;
  Promise.all([
    fetch("/api/query?scope=all&idsOnly=true&q=" + encodeURIComponent(text), {
      signal,
    }).then((r) => r.json()),
    fetch("/api/documents?idsOnly=true&q=" + encodeURIComponent(text), {
      signal,
    }).then((r) => r.json()),
  ])
    .then(([tasks, docs]) => {
      if (text !== plainSearch) return;
      searchTaskIds = new Set(tasks.ids);
      searchDocumentIds = new Set(docs.ids);
      state.searchIds = tasks.ids;
      refreshViews();
      facetSearch.render();
    })
    .catch((e) => {
      if (e.name !== "AbortError")
        toast("Search could not refresh. Showing local matches.");
    });
}
function clearInactiveView() {
  if ($("documents-view").querySelector(".library-window"))
    libraryScroll =
      $("documents-view").querySelector(".library-window").scrollTop;
  graphMomentum.stop();
  clearTimeout(proposalTimer);
  proposalVersion++;
  viewList?.destroy();
  viewList = null;
  workbench.suspend();
  singleStrip.suspend?.();
  epicChart.suspend?.();
  for (const id of ["tasks", "documents"]) $(id + "-view").replaceChildren();
  $("nodes").replaceChildren();
  $("edges").replaceChildren();
  $("lanes").replaceChildren();
  graphNodes = [];
  graphLinks = [];
}
let captureDraft = null,
  documentGroup = params.get("docGroup") || "category",
  showAbandoned = params.get("abandoned") === "true",
  documentStatus = params.get("docStatus") || "",
  documentStatuses = new Set(
    params.has("docStatus")
      ? params.get("docStatus").split(",").filter(Boolean)
      : ["not-started", "started"],
  ),
  tourWasFullscreen = false,
  tourTransition = 0;
const compactLayout = matchMedia("(max-width:900px)");
const panelPrefs = { left: true, right: true };
try {
  Object.assign(
    panelPrefs,
    JSON.parse(localStorage.getItem("nupp-plan-panels") || "{}"),
  );
} catch {}
let detailOpen = Boolean(
  (state.selected || state.document) && !params.has("tour"),
);
let lastActivation = "",
  lastPresentation = "",
  initialView = true,
  tour = null,
  tourStep = 0,
  tourPlaying = false,
  tourTimer = 0,
  cameraTimer = 0;
const singleStrip = createSingleStrip($("strip-view"), {
  select,
  interact: pauseTour,
  changeOrder(order) {
    pauseTour();
    state.stripOrder = order;
    state.stripScale = 1;
    state.stripCenter = 0.5;
    state.stripFocus = "";
    state.stripFocusToken = String(Date.now());
    refreshViews();
  },
  changeCamera({ scale, center }) {
    state.stripScale = scale;
    state.stripCenter = center;
    clearTimeout(cameraTimer);
    cameraTimer = setTimeout(() => {
      urlState();
      if (tour) positionTourCue();
    }, 100);
  },
});
const epicChart = createEpicProgress($("epics-view"), {
  select,
  changeZoom(value) {
    state.epicZoom = value;
    urlState();
  },
});
const selectionTrail = [];
const facetSearch = createFacetSearch({
  state,
  getData: () => data,
  change: (fn) => {
    stopTour();
    fn();
    if (!state.taskIds.length) state.visualization = "";
    controls();
    refreshViews({ fit: true });
  },
  promptResult: (view) => {
    applyVisualization(view);
    controls();
    refreshViews({ fit: true });
  },
});
function applyVisualization(view) {
  state.focusTask = "";
  detailOpen = false;
  for (const key of [
    "q",
    "status",
    "activity",
    "epic",
    "track",
    "tag",
    "relation",
  ])
    state[key] = view.filters?.[key] || "";
  state.scope = view.filters?.scope || "all";
  state.view = ["report", "strip"].includes(view.view) ? "activity" : view.view;
  state.selected = view.selected || view.filters?.node || "";
  state.document = "";
  state.group = view.group || "epic";
  state.detail = view.detail || "all";
  state.epicZoom = view.zoom || 100;
  state.taskIds = view.taskIds || [];
  state.visualization = view.id;
  state.stripOrder = view.stripOrder || "chronological";
  state.stripScale = view.stripZoom || 1;
  state.stripCenter = view.stripAt ?? 0.5;
  state.stripFocus = view.focus || "";
  state.stripFocusToken = String(Date.now());
  $("inspector").classList.toggle("open", Boolean(state.selected));
}
// Deleting a saved visualization removes display configuration only; tasks,
// plans and their evidence are never touched.
function removeRow(kind, id, title) {
  return `<button class="icon-button visualization-remove" data-remove-visualization="${esc(id)}" data-remove-kind="${kind}" title="Delete ${esc(title)}" aria-label="Delete ${esc(title)}">×</button>`;
}
const VISUALIZATION_TABS = [
  { id: "views", label: "Saved views" },
  { id: "tours", label: "Presentations" },
];
let visualizationTab = "views";
try {
  const stored = localStorage.getItem("avoozl-visualization-tab");
  if (VISUALIZATION_TABS.some((t) => t.id === stored))
    visualizationTab = stored;
} catch {}
function presentSavedViews() {
  const views = data.presentation?.views || [],
    tours = data.presentation?.tours || [],
    saved = $("saved-views");
  if (!saved) return;
  const counts = { views: views.length, tours: tours.length },
    tab = VISUALIZATION_TABS.some((t) => t.id === visualizationTab)
      ? visualizationTab
      : "views",
    rows =
      tab === "tours"
        ? tours
            .map(
              (t) =>
                `<div class="visualization-row"><button data-presentation="${esc(t.id)}" ${tour?.id === t.id ? 'aria-current="true"' : ""}><strong>${esc(t.title)}</strong>${t.steps?.length ? `<span>${t.steps.length} ${t.steps.length === 1 ? "step" : "steps"}</span>` : ""}</button>${removeRow("tour", t.id, t.title)}</div>`,
            )
            .join("")
        : views
            .map(
              (v) =>
                `<div class="visualization-row"><button data-visualization="${esc(v.id)}" ${!tour && state.visualization === v.id ? 'aria-current="true"' : ""}><strong>${esc(v.title)}</strong>${v.caption ? `<span>${esc(v.caption)}</span>` : ""}</button>${removeRow("view", v.id, v.title)}</div>`,
            )
            .join("");
  saved.innerHTML =
    '<div class="hub-tabs" role="tablist" aria-label="Saved visualizations">' +
    VISUALIZATION_TABS.map(
      (t) =>
        `<button role="tab" id="visualization-tab-${t.id}" data-visualization-tab="${t.id}" aria-controls="visualization-panel" aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}">${t.label}<span>${counts[t.id]}</span></button>`,
    ).join("") +
    `</div><section id="visualization-panel" role="tabpanel" aria-labelledby="visualization-tab-${tab}">` +
    '<p class="visualization-note">' +
    (tab === "tours"
      ? "A presentation plays a narrated sequence of saved views. Deleting one removes the sequence; the views it points at stay."
      : "Saved views restore a filter, camera and layout. Deleting one removes the saved configuration only, never tasks or plans.") +
    "</p>" +
    (rows
      ? '<div class="visualization-rows">' + rows + "</div>"
      : '<p class="muted">' +
        (tab === "tours" ? "No presentations yet." : "No saved views yet.") +
        " Agents create them through the plans MCP tools.</p>") +
    "</section>";
}
function selectVisualizationTab(id, { focus = false } = {}) {
  if (!VISUALIZATION_TABS.some((t) => t.id === id)) return;
  visualizationTab = id;
  try {
    localStorage.setItem("avoozl-visualization-tab", id);
  } catch {}
  presentSavedViews();
  if (focus)
    $("saved-views")
      .querySelector('[data-visualization-tab="' + id + '"]')
      ?.focus();
}
try {
  positionLayouts = JSON.parse(
    localStorage.getItem("avoozl-plan-layouts-v3") || "{}",
  );
} catch {}
const badge = (id) => {
  const s = data.statuses.find((s) => s.id === id) || {
    label: id,
    color: "#aabbcc",
  };
  return `<span class="badge" style="--status:${s.color}"><span>●</span>${esc(s.label)}</span>`;
};
const epicName = (id) =>
  lookup().epics.get(id)?.title ||
  data.documents[id?.replace(/^doc:/, "")]?.title ||
  id ||
  "Unassigned";
const trackName = (id) => lookup().tracks.get(id)?.label || id;
const workbench = createWorkbench({
  tasksElement: $("tasks-view"),
  nowElement: $("now-content"),
  nowScrollElement: $("activity-view"),
  nowChanged: (snapshot) => singleStrip.updateActivity(snapshot),
  badge,
  epicName,
  trackName,
  refresh: () => refreshViews(),
  renderCards,
  setCount: (text, note) => {
    $("result-count").textContent = text;
    $("filter-note").textContent = note;
  },
});
if (state.selected) {
  panelPrefs.right = true;
  $("inspector").classList.add("open");
}
function task(id) {
  return lookup().tasks.get(resolveTaskId(data, id));
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function urlState() {
  const p = new URLSearchParams();
  for (const key of [
    "view",
    "q",
    "scope",
    "status",
    "activity",
    "epic",
    "track",
    "tag",
    "relation",
    "detail",
    "group",
  ])
    if (
      state[key] !== "" &&
      !(key === "scope" && state[key] === "all") &&
      !(key === "detail" && state[key] === "overview")
    )
      p.set(key, state[key]);
  if (state.epicZoom !== 100) p.set("epicZoom", state.epicZoom);
  if (state.view === "activity") {
    if (state.stripOrder === "progress") p.set("stripOrder", "progress");
    if (state.stripScale > 1.001 || state.visualization)
      p.set("stripZoom", Number(state.stripScale.toFixed(4)));
    if (Math.abs(state.stripCenter - 0.5) > 0.0001)
      p.set("stripAt", Number(state.stripCenter.toFixed(6)));
  }
  if (state.historical) p.set("historical", "true");
  if (state.focusTask && state.view === "graph")
    p.set("focusTask", state.focusTask);
  if (state.visualization) p.set("visualization", state.visualization);
  if (state.selected) p.set("node", state.selected);
  if (state.document) p.set("document", state.document);
  if (tour) {
    p.set("tour", tour.id);
    p.set("step", tourStep);
  }
  if (state.view === "documents") {
    p.set("planSection", planSection);
    if (planSearch) p.set("planSearch", planSearch);
    if (planSection === "proposals" && proposalOffset)
      p.set("proposalAt", proposalOffset);
    p.set("docGroup", documentGroup);
    p.set("docStatus", [...documentStatuses].join(","));
  }
  history.replaceState(null, "", "/?" + p);
}
function options() {
  return {
    scope: state.scope,
    q: state.q,
    activity: state.activity,
    status: state.status,
    epic: state.epic,
    track: state.track,
    tag: state.tag,
    node: state.selected,
    relation: state.selected.startsWith("epic:") ? "" : state.relation,
  };
}
function controls() {
  $("graph-stage").title = data.project.dependencyNote || "";
  updateOnboarding(data);
  $("brand-title").textContent =
    data.project.workspaceName || data.project.name || "Avoozl";
  document.title = $("brand-title").textContent + " · Avoozl";
  document
    .querySelector(".brand")
    .setAttribute("aria-label", $("brand-title").textContent + " home");
  $("brand-subtitle").textContent = "Live delivery map";
  presentSavedViews();
  for (const id of ["scope", "status", "activity", "epic", "track", "tag"])
    $(id).innerHTML =
      '<option value="' +
      esc(state[id]) +
      '">' +
      esc(state[id] || "All") +
      "</option>";
  for (const id of ["group", "detail", "relation"]) $(id).value = state[id];
  facetSearch.render();
}
function syncNavigation() {
  const managed = document.body.classList.contains("execution-open"),
    shell = $("execution-workspace");
  document.body.dataset.view = state.view;
  for (const b of document.querySelectorAll("#nav button")) {
    const active = managed
      ? shell.classList.contains("plan-mode")
        ? b.dataset.view === "documents"
        : shell.dataset.tab === "metrics"
          ? b.id === "open-usage"
          : b.id === "open-workspace"
      : b.dataset.view === state.view;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  const active = document.querySelector("#nav [aria-current=page]");
  $("page-title").textContent =
    active?.getAttribute("aria-label") || active?.textContent || "Avoozl";
}
window.addEventListener("nupp-workspace-navigation", () => {
  if (document.body.classList.contains("execution-open")) {
    clearInactiveView();
    lastRenderedView = "";
    detailOpen = false;
    $("detail-dialog").close();
    $("inspector-body").replaceChildren();
  } else refreshViews();
  syncNavigation();
});
function refreshViews({ fit = false } = {}) {
  if (!data) return;
  if (state.view === "strip") state.view = "activity";
  state.selected = resolveTaskId(data, state.selected);
  state.focusTask = resolveTaskId(data, state.focusTask);
  state.taskIds = [
    ...new Set(state.taskIds.map((id) => resolveTaskId(data, id))),
  ];
  if (document.body.classList.contains("execution-open")) {
    updateActivityPresence();
    return;
  }
  applyPanels();
  if (lastRenderedView !== state.view) {
    clearInactiveView();
    lastRenderedView = state.view;
  }
  remoteSearch();
  const visibleTasks = browseRows(data, data.tasks, {
      historical: includeHistorical(state),
    }),
    viewData = { ...data, tasks: visibleTasks };
  document.body.classList.toggle(
    "documents-active",
    state.view === "documents",
  );
  document.body.classList.toggle("activity-active", state.view === "activity");
  document.body.classList.toggle(
    "workbench-active",
    ["activity", "tasks"].includes(state.view),
  );
  presentSavedViews();
  rows = queryTasks(data, {
    ...options(),
    q: searchTaskIds
      ? queryTerms(state.q)
          .filter((t) => t.includes(":"))
          .join(" ")
      : state.q,
  });
  if (searchTaskIds) rows = rows.filter((t) => searchTaskIds.has(t.id));
  const visibleIds = new Set(visibleTasks.map((t) => t.id));
  rows = rows.filter(
    (t) =>
      visibleIds.has(t.id) ||
      (state.view === "activity" &&
        ["active", "stale", "paused"].includes(activityState(t))),
  );
  if (state.view === "graph" && state.focusTask) {
    const ids = new Set(focusedNeighborhood(data, state.focusTask));
    rows = rows.filter((t) => ids.has(t.id));
  }
  if (state.taskIds.length)
    rows = rows.filter((t) => state.taskIds.includes(t.id));
  if (state.relation && state.selected.startsWith("epic:")) {
    const connected = graphNeighbors(
      { edges: data.epicEdges || [] },
      state.selected,
      state.relation,
      true,
    );
    rows = rows.filter((t) => connected.has("epic:" + t.epic));
  }
  const savedViewCount =
    (data.presentation?.views?.length || 0) +
    (data.presentation?.tours?.length || 0);
  $("result-count").textContent =
    state.view === "documents"
      ? Object.values(data.documents).filter((d) => !d.removed).length +
        " documents"
      : state.view === "visualizations"
        ? savedViewCount +
          (savedViewCount === 1 ? " saved view" : " saved views")
        : rows.length + " matching " + (rows.length === 1 ? "task" : "tasks");
  $("filter-note").textContent = includeHistorical(state)
    ? "Historical records included"
    : "Historical records hidden";
  for (const view of [
    "epics",
    "graph",
    "tasks",
    "activity",
    "documents",
    "visualizations",
  ])
    $(view + "-view").hidden = state.view !== view;
  syncNavigation();
  $("group-control").hidden = !["graph", "tasks"].includes(state.view);
  $("detail-control").hidden = state.view !== "graph";
  $("fullscreen").hidden = false;
  if (state.view === "activity") {
    singleStrip.render({
      data: viewData,
      historical: includeHistorical(state),
      matchingIds: new Set(rows.map((t) => t.id)),
      scope: state.scope,
      selected: state.selected,
      order: state.stripOrder,
      scale: state.stripScale,
      center: state.stripCenter,
      focusMatches: state.stripFocus === "matches",
      focusToken: state.stripFocusToken,
    });
    workbench.renderNow({ data, rows, selected: state.selected });
  } else if (state.view === "epics")
    epicChart.render({
      data: viewData,
      matchingIds: new Set(rows.map((t) => t.id)),
      scope: state.scope,
      selected: state.selected,
      zoom: state.epicZoom,
    });
  else if (state.view === "graph") renderGraph(fit);
  else if (state.view === "tasks")
    workbench.renderTasks({
      data,
      rows,
      group: state.group,
      selected: state.selected,
      narrow: Boolean(
        state.q ||
        state.epic ||
        state.track ||
        state.tag ||
        state.status ||
        state.activity,
      ),
    });
  else if (state.view === "visualizations") presentSavedViews();
  else renderDocuments();
  renderInspector();
  renderTour();
  applyPanels();
  updateActivityPresence();
  $("show-toc").hidden = state.view !== "documents" || !state.document;
  urlState();
}
function select(id, { open = true, center = false, remember = true } = {}) {
  if (!id) return;
  if (remember && state.selected && state.selected !== id)
    selectionTrail.push(state.selected);
  if (selectionTrail.length > 30) selectionTrail.shift();
  state.selected = id;
  workbench.select(id);
  singleStrip.setSelection(id);
  epicChart.setSelection(id);
  state.document = "";
  if (open) {
    detailOpen = true;
    panelPrefs.right = true;
    $("inspector").classList.add("open");
    applyPanels();
  }
  if (state.view === "graph") {
    renderGraph(false);
    if (center && graphNodes.some((n) => n.id === id)) {
      const p = positions[id];
      transform.x =
        $("graph-stage").clientWidth / 2 - (p.x + NODE_W / 2) * transform.k;
      transform.y =
        $("graph-stage").clientHeight / 2 - (p.y + NODE_H / 2) * transform.k;
      scheduleTransform();
    }
  }
  renderInspector();
  urlState();
}
function taskCard(t) {
  return `<button class="task-card" data-task="${esc(t.id)}">${badge(t.status)}${activityBadge(t)}<h3>${esc(t.title)}</h3><p>${esc(t.summary || "Open the source plan context and linked work.")}</p><div class="card-meta"><span>${esc(t.epic.startsWith("doc:") ? "PLAN" : t.epic)} · ${esc(trackName(t.track))}</span><span>${t.needsReview ? "Review context" : "↗"}</span></div></button>`;
}
function renderCards(target, cardRows = rows) {
  const groups = new Map();
  for (const t of cardRows) {
    const keys =
      state.group === "tag"
        ? t.tags?.length
          ? t.tags
          : ["untagged"]
        : [t[state.group] || "Unassigned"];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
  }
  const names = (key) =>
    state.group === "status"
      ? data.statuses.find((s) => s.id === key)?.label
      : state.group === "epic"
        ? epicName(key)
        : state.group === "track"
          ? trackName(key)
          : key;
  let html = "";
  let shown = 0;
  const limit = 160,
    totalCards = [...groups.values()].reduce(
      (sum, list) => sum + list.length,
      0,
    );
  for (const [key, list] of groups) {
    const visible = list.slice(0, Math.max(0, limit - shown));
    shown += visible.length;
    if (!visible.length) continue;
    html += `<h3 class="group-heading">${esc(names(key) || key)} <span>${list.length}</span></h3><div class="task-grid">${visible.map(taskCard).join("")}</div>`;
  }
  if (!html)
    html = '<div class="empty">No tasks match. Try clearing a filter.</div>';
  if (totalCards > limit)
    html += `<p class="query-note">Showing up to ${limit} cards. Use search, epic, status or tags to narrow${rows.length} results. The JSON API returns the full result set.</p>`;
  target.innerHTML = html;
}

function documentLink(id, label) {
  return `<button class="detail-link" data-document="${esc(id)}">${esc(label || data.documents[id]?.title || id)}<small>${esc(id)}</small></button>`;
}
function contextSection(source, title = "Source plan context") {
  if (!source || !data.documents[source.document]) return "";
  if (source.approvedSource?.text)
    return (
      '<details class="context"><summary>' +
      esc(title) +
      '</summary><div class="context-prose">' +
      markdown(source.approvedSource.text.slice(0, 60000), source.document) +
      "</div></details>"
    );
  return (
    '<details class="context" data-lazy-context="' +
    esc(source.document) +
    '" data-line-start="' +
    source.lineStart +
    '" data-line-end="' +
    source.lineEnd +
    '"><summary>' +
    esc(title) +
    " · lines " +
    source.lineStart +
    "–" +
    source.lineEnd +
    '</summary><div class="context-prose">Expand to load source context.</div></details>'
  );
}
function renderInspector() {
  $("inspector-body").classList.remove("document-detail");
  if (!data) return;
  if (!detailOpen) {
    $("inspector-body").replaceChildren();
    syncDetailModal();
    return;
  }
  if (state.document && !state.selected) {
    renderDocumentDetail();
    syncDetailModal();
    return;
  }
  $("inspector").setAttribute("aria-label", "Task details");
  const panel = $("inspector-body"),
    scroll = $("inspector").scrollTop,
    expandedSections = new Map(
      [...$("inspector-body").querySelectorAll("details")].map((el) => [
        el.querySelector("summary")?.textContent,
        el.open,
      ]),
    );
  let html = "";
  const close = `<div class="inspector-nav"><button class="button subtle" data-task-back ${selectionTrail.length ? "" : "disabled"} aria-label="Back to previous task">← Back</button><button class="button subtle" data-copy-task-link>Copy link</button><button class="button subtle" data-close-inspector aria-label="Close task details">×</button></div>`;
  if (state.selected.startsWith("epic:")) {
    const id = state.selected.slice(5),
      e =
        data.epics.find((e) => e.id === id) ||
        (id.startsWith("doc:") && data.documents[id.slice(4)]
          ? { id, title: epicName(id), summary: "Tasks linked to this plan." }
          : null);
    if (e) {
      const children = data.tasks.filter(
        (t) =>
          t.epic === id && (state.scope === "all" || t.scope === state.scope),
      );
      html = `${close}<span class="eyebrow">${id} / WORKSTREAM</span><h2>${esc(e.title)}</h2><p>${esc(e.summary)}</p><button class="button primary" data-epic="${id}">Explore ${children.length} tasks →</button><h3>Remaining work</h3>${children
        .filter((t) => !statusComplete(data, t.status))
        .slice(0, 30)
        .map(
          (t) =>
            `<button class="detail-link" data-task="${t.id}">${esc(t.title)}<small>${esc(data.statuses.find((s) => s.id === t.status)?.label)}</small></button>`,
        )
        .join("")}<h3>Implemented / accepted</h3>${children
        .filter((t) => statusComplete(data, t.status))
        .slice(0, 30)
        .map(
          (t) =>
            `<button class="detail-link" data-task="${t.id}">${esc(t.title)}</button>`,
        )
        .join("")}${contextSection(e.context, "Complete epic plan")}`;
    }
  } else {
    const t = task(state.selected);
    if (t) {
      const incoming = data.edges.filter((e) => e.to === t.id),
        outgoing = data.edges.filter((e) => e.from === t.id);
      const related = (edges, direction) =>
        edges
          .map((e) => {
            const other = task(direction === "in" ? e.from : e.to);
            return other
              ? `<button class="detail-link" data-task="${other.id}">${esc(other.title)}<small>${e.kind === "requires" ? "Prerequisite" : esc(e.kind)} · ${esc(e.reason)}</small></button>`
              : "";
          })
          .join("");
      html = `${close}<span class="eyebrow">${esc(t.epic.startsWith("doc:") ? "PLAN INVENTORY" : t.epic)} / ${esc(trackName(t.track))}</span>${badge(t.status)}<h2>${esc(t.title)}</h2><span class="id">${esc(t.id)}</span>${taskAtAGlance(t)}${t.needsReview ? '<p class="notice">The source plan context changed. The authored status is preserved. Review the new context, then mark reviewed.</p>' : ""}${t.source?.removed ? '<p class="notice">The original checklist item or source document was removed. Its database record is retained for review.</p>' : ""}<p>${esc(t.summary || "Source context is available below.")}</p><div class="tags">${(t.tags || []).map((tag) => `<button class="tag" data-tag="${esc(tag)}">#${esc(tag)}</button>`).join("")}</div>${activityDetails(t)}${t.capture ? captureDetails(t) : ""}${t.owner ? `<h3>Owner</h3><p>${esc(t.owner)}</p>` : ""}${t.notes ? `<h3>Implementation notes</h3><p>${esc(t.notes).replace(/\n/g, "<br>")}</p>` : ""}<div class="inspector-actions"><button class="button primary" data-edit="${t.id}">Edit task</button>${t.needsReview ? `<button class="button subtle" data-reviewed="${t.id}">Mark reviewed</button>` : ""}<button class="button subtle" data-explore="${t.id}">Graph ↗</button></div>${incoming.length ? `<h3>Depends on / supported by</h3>${related(incoming, "in")}` : ""}${outgoing.length ? `<h3>Enables / connects to</h3>${related(outgoing, "out")}` : ""}${taskSourceRefs(
        t,
      )
        .map((ref) =>
          contextSection(
            ref,
            ref.document === t.source?.document
              ? "Source plan context"
              : "Also described in " + ref.document,
          ),
        )
        .join("")}${
        t.contextDocuments?.length
          ? `<h3>Additional plan context</h3>${t.contextDocuments
              .filter((id) => data.documents[id])
              .map((id) => documentLink(id))
              .join("")}`
          : ""
      }${
        t.evidence?.length
          ? `<h3>Evidence & receipts</h3>${t.evidence
              .slice(0, 40)
              .map((p) =>
                p.startsWith("workspace:evidence/")
                  ? `<button class="detail-link" data-evidence="${esc(p.slice(19))}">Inspect validation evidence ↗</button>`
                  : p.startsWith("evidence/")
                    ? `<a class="detail-link" href="/source?path=${encodeURIComponent(p)}" target="_blank" rel="noopener">${esc(p)} ↗</a>`
                    : `<p>${esc(p)}</p>`,
              )
              .join("")}`
          : ""
      }${
        t.mergeReceipts?.length
          ? '<details class="context"><summary>Consolidated task · ' +
            taskSourceRefs(t).length +
            " source references</summary><p>Earlier task links resolve to this record. Original task states and relationship evidence are retained in " +
            t.mergeReceipts.length +
            " merge receipts.</p>" +
            t.mergeReceipts
              .map(
                (id) =>
                  '<button class="detail-link" data-evidence="' +
                  esc(id) +
                  '">Inspect consolidation receipt ↗</button>',
              )
              .join("") +
            "<p>" +
            Object.keys(data.taskAliases || {})
              .filter((id) => resolveTaskId(data, id) === t.id)
              .map(esc)
              .join("<br>") +
            "</p></details>"
          : ""
      }<h3>Record provenance</h3><p>${t.scope === "catalog" && t.source ? "Imported checklist context; not a claim of runtime acceptance. " : ""}Status maintained in SQLite. ${t.source ? "The source checkbox is reference context. " : ""}Updated ${esc(new Date(t.updatedAt || data.updatedAt).toLocaleString("en-US"))}.</p>`;
    }
  }
  panel.innerHTML =
    html ||
    `<span class="eyebrow">EXPLORE THE PLAN</span><h2>Connected work, toward delivery.</h2><p>Select a node or task to inspect dependencies, implementation notes, full plan context and evidence.</p><button class="button subtle" data-open-graph>Open the delivery map</button>`;
  if (lastSelected === state.selected) {
    for (const el of panel.querySelectorAll("details")) {
      const key = el.querySelector("summary")?.textContent;
      if (expandedSections.has(key)) el.open = expandedSections.get(key);
    }
  }
  if (lastSelected === state.selected) $("inspector").scrollTop = scroll;
  else $("inspector").scrollTop = 0;
  lastSelected = state.selected;
  syncDetailModal();
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-evidence]");
  if (!b) return;
  const response = await fetch(
      "/api/evidence/" + encodeURIComponent(b.dataset.evidence),
    ),
    record = await response.json();
  if (!response.ok) {
    toast(record.error);
    return;
  }
  $("evidence-body").textContent = JSON.stringify(record, null, 2);
  $("evidence-dialog").showModal();
});
$("evidence-close").onclick = () => $("evidence-dialog").close();
function inline(text, docId) {
  let s = esc(text);
  s = s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const raw = href.replace(/&amp;/g, "&");
    if (/^https?:\/\//.test(raw))
      return `<a href="${esc(raw)}" target="_blank" rel="noopener">${label} ↗</a>`;
    if (raw.startsWith("#")) return `<a href="${esc(raw)}">${label}</a>`;
    const resolved = new URL(raw, "http://plans/" + docId).pathname.slice(1);
    if (data.documents[resolved])
      return `<a href="/?view=documents&document=${encodeURIComponent(resolved)}" data-document="${esc(resolved)}">${label}</a>`;
    if (!raw.startsWith("javascript:") && !resolved.startsWith("../"))
      return `<a href="/source?path=${encodeURIComponent(resolved)}" target="_blank" rel="noopener">${label} ↗</a>`;
    return label;
  });
}
function markdown(text, docId, options = {}) {
  return renderMarkdown(text, undefined, {
    ...options,
    rewriteHref(raw) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) return raw;
      const resolved = new URL(raw, "http://plans/" + docId),
        id = resolved.pathname.slice(1);
      if (data.documents[id])
        return (
          "/?view=documents&document=" + encodeURIComponent(id) + resolved.hash
        );
      return "/source?path=" + encodeURIComponent(id) + resolved.hash;
    },
  });
}

function renderDocuments() {
  const target = $("documents-view");
  let toolbar = $("plans-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.id = "plans-toolbar";
    toolbar.className = "plans-toolbar";
    toolbar.innerHTML =
      '<div class="plans-sections" role="tablist" aria-label="Plans sections"><button role="tab" data-plan-section="library">Library</button><button role="tab" data-plan-section="proposals">Proposals</button></div><div id="plans-controls"></div>';
    $("page-tools").append(toolbar);
    for (const button of toolbar.querySelectorAll("[data-plan-section]"))
      button.onclick = () => {
        planSection = button.dataset.planSection;
        renderDocuments();
        urlState();
      };
  }
  for (const button of toolbar.querySelectorAll("[data-plan-section]")) {
    const selected = button.dataset.planSection === planSection;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  if (target.dataset.section !== planSection || !$("plans-section-content")) {
    const old = target.querySelector(".library-window");
    if (old) libraryScroll = old.scrollTop;
    viewList?.destroy();
    viewList = null;
    target.dataset.section = planSection;
    target.innerHTML =
      '<section id="plans-section-content" role="tabpanel" aria-label="' +
      (planSection === "library" ? "Plan library" : "Plan proposals") +
      '"></section>';
    $("plans-controls").replaceChildren();
  }
  if (planSection === "proposals") renderProposals($("plans-section-content"));
  else renderPlanLibrary($("plans-section-content"));
}

async function renderProposals(target) {
  clearTimeout(proposalTimer);
  const version = ++proposalVersion;
  if (!target.dataset.proposalKey)
    target.innerHTML = '<p class="muted" role="status">Loading proposals…</p>';
  try {
    const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "plan.list",
          input: { offset: proposalOffset, limit: 24 },
        }),
      }),
      body = await response.json();
    if (!response.ok) throw Error(body.error || "Proposals unavailable");
    if (version !== proposalVersion || !target.isConnected) return;
    const page = body.result,
      key = JSON.stringify(page);
    if (target.dataset.proposalKey !== key) {
      target.dataset.proposalKey = key;
      target.innerHTML =
        '<div class="library-heading"><button class="button subtle" data-proposal-write>＋ Write plan</button><button class="button subtle" data-proposal-agent>Plan with agent</button></div><div class="proposal-list">' +
        page.items
          .map(
            (p) =>
              '<button class="proposal-row" data-open-proposal="' +
              esc(p.id) +
              '"><span><b>' +
              esc(p.title) +
              "</b><small>Revision " +
              p.revision +
              "</small></span><span>" +
              esc(p.state) +
              "</span></button>",
          )
          .join("") +
        "</div>" +
        (!page.items.length
          ? '<p class="muted">No proposals yet. Write a plan or develop one with an agent.</p>'
          : "") +
        (page.total > page.limit
          ? '<div class="list-pager"><button class="button" data-proposal-page="' +
            Math.max(0, page.offset - page.limit) +
            '" ' +
            (page.offset === 0 ? "disabled" : "") +
            ">Previous</button><span>" +
            (page.offset + 1) +
            "–" +
            Math.min(page.total, page.offset + page.limit) +
            " of " +
            page.total +
            '</span><button class="button" data-proposal-page="' +
            (page.offset + page.limit) +
            '" ' +
            (page.offset + page.limit >= page.total ? "disabled" : "") +
            ">Next</button></div>"
          : "");
      $("result-count").textContent = page.total + " proposals";
    }
  } catch (error) {
    if (version === proposalVersion && target.isConnected) {
      delete target.dataset.proposalKey;
      target.innerHTML =
        '<p role="status">' +
        esc(error.message) +
        '</p><button class="button" data-proposals-retry>Retry</button>';
    }
  }
  if (version === proposalVersion && target.isConnected && !document.hidden)
    proposalTimer = setTimeout(() => {
      if (
        state.view === "documents" &&
        planSection === "proposals" &&
        !document.hidden &&
        !document.body.classList.contains("execution-open")
      )
        renderProposals(target);
    }, 15000);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(
    "[data-open-proposal],[data-proposal-write],[data-proposal-agent],[data-proposal-page],[data-proposals-retry]",
  );
  if (!b) return;
  if (b.dataset.openProposal)
    window.dispatchEvent(
      new CustomEvent("nupp-open-plan", {
        detail: { id: b.dataset.openProposal },
      }),
    );
  else if (b.hasAttribute("data-proposal-write"))
    window.dispatchEvent(new Event("nupp-write-plan"));
  else if (b.hasAttribute("data-proposal-agent"))
    window.dispatchEvent(new Event("nupp-plan-with-agent"));
  else {
    if (b.dataset.proposalPage !== undefined)
      proposalOffset = Number(b.dataset.proposalPage);
    renderProposals($("plans-section-content"));
    urlState();
  }
});
window.addEventListener("nupp-show-view", (e) => {
  if (!data) return;
  state.view = e.detail.view;
  state.document = "";
  state.selected = "";
  if (e.detail.planSection) planSection = e.detail.planSection;
  controls();
  refreshViews();
});
function renderDocumentDetail() {
  const target = $("inspector-body"),
    doc = data.documents[state.document];
  if (!doc) {
    target.innerHTML = "<p>Document not found.</p>";
    return;
  }
  if (typeof doc.text !== "string") {
    target.innerHTML = '<p class="muted">Loading document…</p>';
    const id = doc.id;
    ensureDocument(id)
      .then(() => {
        if (detailOpen && state.document === id) {
          renderDocumentDetail();
          syncDetailModal();
        }
      })
      .catch((e) => {
        if (state.document === id) target.textContent = e.message;
      });
    return;
  }
  if (documentPageId !== doc.id) {
    documentPageId = doc.id;
    documentPage = 0;
  }
  const pages = documentPages(doc.text);
  documentPage = Math.max(0, Math.min(pages.length - 1, documentPage));
  const page = pages[documentPage],
    inbound = Object.values(data.documents).filter((d) =>
      d.links?.includes(doc.id),
    ),
    tasks = data.tasks.filter(
      (t) =>
        t.source?.document === doc.id || t.contextDocuments?.includes(doc.id),
    );
  let body = markdown(page.text.slice(0, 60000), doc.id, {
    headingIds: page.headings,
  });
  const firstTitle =
    documentPage === 0 &&
    page.headings[0]?.level === 1 &&
    page.headings[0].title === doc.title
      ? page.headings[0].id
      : "";
  if (firstTitle) body = body.replace(/^<h1[^>]*>[\s\S]*?<\/h1>\n?/, "");
  target.classList.add("document-detail");
  target.innerHTML =
    '<div class="document-page"><section class="document-reading"><header class="document-heading"><h1' +
    (firstTitle ? ' id="' + esc(firstTitle) + '"' : "") +
    ">" +
    esc(doc.title) +
    '</h1><div class="doc-toolbar"><button class="copy-markdown" data-copy-plan="' +
    esc(doc.id) +
    '" aria-label="Copy plan Markdown" title="Copy plan Markdown">' +
    copyIcon +
    '</button><button class="button subtle" data-edit-document="' +
    esc(doc.id) +
    '">Edit Markdown</button><a class="button subtle" href="/source?path=' +
    encodeURIComponent(doc.id) +
    '" target="_blank" rel="noopener">Raw ↗</a></div></header>' +
    planMetadataForm(doc) +
    '<details class="doc-links"><summary>' +
    tasks.length +
    " linked tasks</summary>" +
    tasks
      .slice(0, 24)
      .map(
        (t) =>
          '<button class="detail-link" data-task="' +
          esc(t.id) +
          '">' +
          esc(t.title) +
          "</button>",
      )
      .join("") +
    (tasks.length > 24
      ? '<button class="button subtle" data-doc-tasks="' +
        esc(doc.id) +
        '">Browse all ' +
        tasks.length +
        " tasks</button>"
      : "") +
    "</details>" +
    (pages.length > 1
      ? '<div class="document-pages"><button class="button subtle" data-document-page="' +
        (documentPage - 1) +
        '" ' +
        (documentPage === 0 ? "disabled" : "") +
        ">Previous section</button><span>Section " +
        (documentPage + 1) +
        " of " +
        pages.length +
        '</span><button class="button subtle" data-document-page="' +
        (documentPage + 1) +
        '" ' +
        (documentPage === pages.length - 1 ? "disabled" : "") +
        ">Next section</button></div>"
      : "") +
    '<article class="doc-content">' +
    body +
    '</article><details class="doc-links"><summary>Linked plans & backlinks</summary>' +
    inbound
      .slice(0, 30)
      .map((d) => documentLink(d.id))
      .join("") +
    (doc.links || [])
      .slice(0, 30)
      .map((id) => documentLink(id))
      .join("") +
    '</details></section><aside class="document-contents"><details class="modal-toc" ' +
    (matchMedia("(min-width:1000px)").matches ? "open" : "") +
    "><summary>Contents</summary>" +
    documentToc(doc) +
    "</details></aside></div>";
}

function overviewNodes() {
  return data.epics
    .filter((e) => !state.epic || e.id === state.epic)
    .map((e) => {
      const children = rows.filter((t) => t.epic === e.id);
      if (!children.length) return null;
      const all = data.tasks.filter(
          (t) => t.scope === "runtime" && t.epic === e.id,
        ),
        remaining = all.filter((t) => !statusComplete(data, t.status));
      return {
        id: "epic:" + e.id,
        title: e.title,
        epic: e.id,
        track: {
          W1: "frontend",
          W2: "storage",
          W3: "services",
          W4: "images",
          W5: "library",
          W6: "delivery",
          W7: "performance",
        }[e.id],
        status: remaining.some((t) => t.status === "blocked")
          ? "blocked"
          : remaining.length
            ? "partial"
            : "implemented",
        summary:
          remaining.length + " remaining · " + all.length + " total tasks",
        kind: "epic",
        rank: e.id === "W6" ? 1 : e.id === "W7" ? 2 : 0,
        layout: e.layout,
      };
    })
    .filter(Boolean);
}
function graphData() {
  const overview =
    !state.activity &&
    state.detail === "overview" &&
    !state.q &&
    !state.epic &&
    !state.tag &&
    !state.track &&
    (!state.relation || state.selected.startsWith("epic:")) &&
    state.scope === "runtime";
  if (overview) {
    const nodes = overviewNodes(),
      ids = new Set(nodes.map((n) => n.id));
    return {
      nodes,
      links: (data.epicEdges || []).filter(
        (e) => ids.has(e.from) && ids.has(e.to),
      ),
      overview: true,
      total: nodes.length,
    };
  }
  const nodes = rows.slice(0, 180),
    ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    links: data.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    overview: false,
    total: rows.length,
  };
}
function graphPosition(nodes) {
  const groupKey = (t) =>
    state.group === "status"
      ? t.status
      : state.group === "epic"
        ? t.epic
        : state.group === "tag"
          ? t.tags?.[0] || "untagged"
          : t.track;
  positions = {
    ...dependencyLayout(nodes, graphLinks, groupKey),
    ...Object.fromEntries(
      Object.entries(positionLayouts[positionMode] || {}).filter(([id]) =>
        nodeById.has(id),
      ),
    ),
  };
}
function wrap(text, max = 29) {
  const words = text.split(" "),
    lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  if (lines.length > 2)
    lines[1] =
      lines
        .slice(1)
        .join(" ")
        .slice(0, max - 1) + "…";
  return lines.slice(0, 2);
}
function edgePath(e) {
  return dependencyPath(e, positions, graphLinks);
}
function renderGraph(fit = false) {
  const g = graphData();
  $("graph-focus-bar").hidden = !state.focusTask;
  $("graph-focus-bar").innerHTML = state.focusTask
    ? `<span><b>One connection away</b> · ${esc(task(state.focusTask)?.title || state.focusTask)}</span><button class="button subtle" data-expand-neighborhood>Expand connected work</button><button class="button subtle" data-clear-neighborhood>Whole collection</button>`
    : "";
  graphNodes = g.nodes;
  graphLinks = g.links;
  nodeById = new Map(graphNodes.map((n) => [n.id, n]));
  const mode = g.overview
    ? "overview"
    : state.scope + ":" + state.group + ":" + state.epic;
  positionMode = mode;
  graphPosition(graphNodes);
  const near =
    state.selected.startsWith("epic:") || !nodeById.has(state.selected)
      ? new Set()
      : graphNeighbors(data, state.selected, "both", false);
  const key =
    graphNodes.map((n) => n.id).join("|") +
    "|" +
    state.group +
    "|" +
    g.overview;
  $("nodes").innerHTML = graphNodes
    .map((n) => {
      const p = positions[n.id],
        s = data.statuses.find((s) => s.id === n.status),
        track = data.tracks.find((t) => t.id === n.track),
        lines = wrap(n.title);
      return `<g class="graph-node${n.kind === "epic" ? " epic-node" : ""}${n.id === state.selected ? " selected" : ""}${near.size && near.has(state.selected) && !near.has(n.id) ? " dim" : ""}" data-node="${esc(n.id)}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" aria-label="${esc(n.title)}. ${esc(s?.label)}. Open details."><title>${esc(n.title)} — ${esc(s?.label)}. ${esc(n.summary)}</title><rect class="node-bg" width="${NODE_W}" height="${NODE_H}" rx="8"/><rect x="0" y="16" width="3" height="74" fill="${track?.color || "#8899aa"}" rx="2"/><text class="node-track" x="16" y="20">${esc(n.epic.startsWith("doc:") ? "PLAN" : n.epic)} · ${esc(n.kind === "epic" ? "WORKSTREAM" : track?.label?.toUpperCase() || "TASK")}</text>${lines.map((line, i) => `<text class="node-title" x="16" y="${42 + i * 16}">${esc(line)}</text>`).join("")}<circle cx="20" cy="84" r="3" fill="${s?.color || "#8899aa"}"/><text class="node-status" x="29" y="87" fill="${s?.color || "#8899aa"}">${esc(n.kind === "epic" ? n.summary : s?.label || n.status)}</text><text class="node-badge" x="232" y="86" text-anchor="end">↗</text></g>`;
    })
    .join("");
  $("edges").innerHTML = graphLinks
    .map(
      (e) =>
        `<path class="edge ${esc(e.kind)}${e.from === state.selected || e.to === state.selected ? " highlight" : ""}" d="${edgePath(e)}"><title>${esc(e.kind + ": " + e.reason)}</title></path>`,
    )
    .join("");
  $("lanes").innerHTML = "";
  $("graph-count").textContent = g.overview
    ? `${graphNodes.length} workstreams · select one to expand its tasks`
    : `${graphNodes.length} of ${g.total} matching tasks · ${graphLinks.length} connections${g.total > 180 ? " · narrow your query to show more" : ""}`;
  $("graph-empty").hidden = graphNodes.length > 0;
  $("graph-empty").textContent = "No tasks match these graph filters.";
  if (fit || key !== lastGraphKey || fitPending) {
    fitGraph();
    fitPending = false;
  } else scheduleTransform();
  lastGraphKey = key;
}
function fitGraph() {
  graphMomentum.stop();
  if (!graphNodes.length) return;
  const xs = graphNodes.map((n) => positions[n.id].x),
    ys = graphNodes.map((n) => positions[n.id].y),
    minX = Math.min(...xs) - 110,
    maxX = Math.max(...xs) + NODE_W + 110,
    minY = Math.min(...ys) - 55,
    maxY = Math.max(...ys) + NODE_H + 55;
  const overlay = 0;
  const w = $("graph-stage").clientWidth - overlay,
    h = $("graph-stage").clientHeight;
  if (!w || !h) {
    fitPending = true;
    return;
  }
  const k = Math.min(1.25, w / (maxX - minX), h / (maxY - minY));
  transform = {
    k: Math.max(0.01, k),
    x: (w - (maxX - minX) * k) / 2 - minX * k,
    y: (h - (maxY - minY) * k) / 2 - minY * k,
  };
  scheduleTransform();
}
function scheduleTransform() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    $("world").setAttribute(
      "transform",
      `translate(${transform.x},${transform.y}) scale(${transform.k})`,
    );
    $("zoom-value").textContent = Math.round(transform.k * 100) + "%";
  });
}
function zoomAt(
  factor,
  x = $("graph-stage").clientWidth / 2,
  y = $("graph-stage").clientHeight / 2,
) {
  graphMomentum.stop();
  const next = Math.max(0.01, Math.min(3, transform.k * factor)),
    ratio = next / transform.k;
  transform.x = x - (x - transform.x) * ratio;
  transform.y = y - (y - transform.y) * ratio;
  transform.k = next;
  scheduleTransform();
}
function savePositions(id) {
  try {
    if (id) (positionLayouts[positionMode] ??= {})[id] = positions[id];
    else delete positionLayouts[positionMode];
    localStorage.setItem(
      "avoozl-plan-layouts-v3",
      JSON.stringify(positionLayouts),
    );
  } catch {}
}
const graphMomentum = createPanMomentum({
  move(dx, dy) {
    if (
      state.view !== "graph" ||
      document.body.classList.contains("execution-open")
    )
      return false;
    transform.x += dx;
    transform.y += dy;
    scheduleTransform();
  },
});
const pointers = new Map();
let drag = null,
  pinch = null;
$("graph-stage").addEventListener("pointerdown", (e) => {
  if (e.target.closest(".graph-controls") || e.button > 0) return;
  graphMomentum.stop();
  const box = $("graph-stage").getBoundingClientRect(),
    point = { x: e.clientX - box.left, y: e.clientY - box.top };
  pointers.set(e.pointerId, point);
  $("graph-stage").setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    const p = [...pointers.values()],
      mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    pinch = {
      distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
      scale: transform.k,
      world: {
        x: (mid.x - transform.x) / transform.k,
        y: (mid.y - transform.y) / transform.k,
      },
    };
    drag = null;
    return;
  }
  const id = e.target.closest("[data-node]")?.dataset.node;
  if (!id) graphMomentum.begin(point.x, point.y, e.timeStamp);
  drag = {
    id,
    point,
    start: { x: transform.x, y: transform.y },
    position: id ? { ...positions[id] } : null,
    moved: false,
  };
  $("graph-stage").classList.add("dragging");
});
$("graph-stage").addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const box = $("graph-stage").getBoundingClientRect(),
    point = { x: e.clientX - box.left, y: e.clientY - box.top };
  pointers.set(e.pointerId, point);
  if (pinch && pointers.size === 2) {
    const p = [...pointers.values()],
      mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    transform.k = Math.max(
      0.01,
      Math.min(
        3,
        (pinch.scale * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)) /
          Math.max(1, pinch.distance),
      ),
    );
    transform.x = mid.x - pinch.world.x * transform.k;
    transform.y = mid.y - pinch.world.y * transform.k;
    scheduleTransform();
    return;
  }
  if (!drag) return;
  const dx = point.x - drag.point.x,
    dy = point.y - drag.point.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (drag.id) {
    positions[drag.id] = {
      x: drag.position.x + dx / transform.k,
      y: drag.position.y + dy / transform.k,
    };
    const el = document.querySelector(`[data-node="${CSS.escape(drag.id)}"]`);
    el?.setAttribute(
      "transform",
      `translate(${positions[drag.id].x},${positions[drag.id].y})`,
    );
    document
      .querySelectorAll("#edges path")
      .forEach((path, i) => path.setAttribute("d", edgePath(graphLinks[i])));
  } else {
    transform.x = drag.start.x + dx;
    transform.y = drag.start.y + dy;
    graphMomentum.sample(point.x, point.y, e.timeStamp);
    scheduleTransform();
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const wasPinch = Boolean(pinch);
  pointers.delete(e.pointerId);
  if (drag?.id) {
    if (!drag.moved && e.type === "pointerup") select(drag.id);
    else if (drag.moved) savePositions(drag.id);
  } else if (drag?.moved && !wasPinch && e.type === "pointerup")
    graphMomentum.release(e.timeStamp);
  else graphMomentum.stop();
  drag = null;
  pinch = null;
  $("graph-stage").classList.remove("dragging");
  if (pointers.size === 1 && e.type === "pointerup") {
    const point = [...pointers.values()][0];
    drag = { point, start: { x: transform.x, y: transform.y }, moved: false };
    graphMomentum.begin(point.x, point.y, e.timeStamp);
  }
}
$("graph-stage").addEventListener("pointerup", endPointer);
$("graph-stage").addEventListener("pointercancel", endPointer);
$("graph-stage").addEventListener("lostpointercapture", (e) => {
  if (pointers.has(e.pointerId)) endPointer(e);
});
$("graph-stage").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    graphMomentum.stop();
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey)
    ) {
      const unit =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? $("graph-stage").clientWidth
            : 1;
      transform.x -= (e.deltaX || e.deltaY) * unit;
      transform.y -= e.deltaX ? e.deltaY * unit : 0;
      scheduleTransform();
      return;
    }
    const b = $("graph-stage").getBoundingClientRect();
    zoomAt(
      Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.003),
      e.clientX - b.left,
      e.clientY - b.top,
    );
  },
  { passive: false },
);
$("graph-stage").addEventListener("keydown", (e) => {
  graphMomentum.stop();
  const id = e.target.closest("[data-node]")?.dataset.node;
  if (id && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    select(id);
  } else if (e.key === "+" || e.key === "=") zoomAt(1.2);
  else if (e.key === "-") zoomAt(1 / 1.2);
  else if (e.key === "0") fitGraph();
});
$("zoom-in").onclick = () => zoomAt(1.25);
$("zoom-out").onclick = () => zoomAt(0.8);
$("fit").onclick = fitGraph;
$("reset-layout").onclick = () => {
  positions = {};
  savePositions();
  renderGraph(true);
};
new ResizeObserver(() => {
  if (data && state.view === "graph") scheduleTransform();
}).observe($("graph-stage"));
function openEditor(id) {
  pauseTour();
  const existing = id ? task(id) : null;
  editingTask = existing;
  editEtag = etag;
  const form = $("edit-form");
  form.reset();
  form.elements.id.value = existing?.id || "";
  form.elements.id.readOnly = Boolean(existing);
  $("editor-title").textContent = existing ? "Edit task" : "New task";
  for (const key of ["status", "epic", "track"]) {
    const list =
      key === "status"
        ? data.statuses
        : key === "epic"
          ? data.epics
          : data.tracks;
    form.elements[key].innerHTML = list
      .map((x) => `<option value="${x.id}">${esc(x.label || x.title)}</option>`)
      .join("");
    if (key === "epic" && existing?.epic.startsWith("doc:"))
      form.elements[key].insertAdjacentHTML(
        "beforeend",
        `<option value="${esc(existing.epic)}">${esc(epicName(existing.epic))}</option>`,
      );
    form.elements[key].value =
      existing?.[key] ||
      { status: "planned", epic: "W1", track: "frontend" }[key];
  }
  for (const key of ["title", "summary", "nextAction", "notes", "owner"])
    form.elements[key].value = existing?.[key] || "";
  form.elements.tags.value = existing?.tags?.join(", ") || "";
  form.elements.requires.value = data.edges
    .filter((e) => e.to === existing?.id && e.kind === "requires")
    .map((e) => e.from)
    .join(", ");
  form.elements.acceptance.value = existing?.acceptance?.join("\n") || "";
  form.elements.overview.checked = Boolean(existing?.overview);
  $("edit-warning").hidden = !existing?.needsReview;
  $("edit-warning").textContent =
    "Source context changed; review it before saving an updated status.";
  $("edit-message").textContent = "";
  $("editor").showModal();
}
$("editor-close").onclick = () => $("editor").close();
function closeDocumentEditor() {
  if (editingDocument?.dirty && !confirm("Discard the unsaved changes?"))
    return;
  $("doc-editor").close();
}
$("doc-editor-close").onclick = closeDocumentEditor;
$("doc-editor").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDocumentEditor();
});
async function mutate(route, method, payload, version = etag) {
  const response = await fetch(route, {
    method,
    headers: { "Content-Type": "application/json", "If-Match": version },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = Error(result.error || "Save failed");
    error.status = response.status;
    throw error;
  }
  await poll(true);
  return result;
}
$("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target,
    payload = {};
  for (const key of [
    "id",
    "title",
    "summary",
    "status",
    "epic",
    "track",
    "nextAction",
    "notes",
    "owner",
  ])
    payload[key] = f.elements[key].value;
  for (const key of ["tags", "requires"])
    payload[key] = f.elements[key].value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  payload.acceptance = f.elements.acceptance.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  payload.overview = f.elements.overview.checked;
  payload.needsReview = false;
  const button = f.querySelector("[type=submit]");
  button.disabled = true;
  try {
    await mutate(
      "/api/task",
      editingTask ? "PATCH" : "POST",
      payload,
      editEtag,
    );
    $("editor").close();
    select(payload.id);
    toast("Saved to database.json");
  } catch (error) {
    $("edit-message").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
async function editDocument(id) {
  pauseTour();
  let doc;
  try {
    doc = await ensureDocument(id);
  } catch (e) {
    toast(e.message);
    return;
  }
  editingDocument = { id, hash: doc.hash, etag, dirty: false };
  $("doc-editor-title").textContent = "Edit " + doc.path;
  $("doc-text").value = doc.text;
  $("doc-edit-message").textContent = "";
  $("doc-editor").showModal();
  paintDocumentPreview();
}
$("doc-edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    await mutate(
      "/api/document",
      "PUT",
      {
        id: editingDocument.id,
        text: $("doc-text").value,
        expectedHash: editingDocument.hash,
      },
      editingDocument.etag,
    );
    $("doc-editor").close();
    editingDocument.dirty = false;
    toast("Plan saved; linked task context marked for review");
  } catch (error) {
    $("doc-edit-message").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
function setFilter(key, value) {
  detailOpen = false;
  stopTour();
  state.stripFocus = "";
  state.stripFocusToken = "";
  state[key] = value;
  state.visualization = "";
  state.taskIds = [];
  state.page = 0;
  if (
    [
      "relation",
      "epic",
      "scope",
      "q",
      "track",
      "tag",
      "status",
      "activity",
    ].includes(key)
  )
    state.focusTask = "";
  if (key !== "group") state.document = "";
  if (key === "group" && state.view === "graph") {
    state.detail = "all";
    $("detail").value = "all";
  }
  if (key === "epic" && value) state.detail = "all";
  if (key === "scope") {
    state.stripScale = 1;
    state.stripCenter = 0.5;
    state.epic = "";
    state.track = "";
    state.tag = "";
    controls();
  } else if ($(key)) $(key).value = value;
  refreshViews({ fit: true });
}
for (const id of [
  "scope",
  "status",
  "activity",
  "epic",
  "track",
  "tag",
  "group",
  "detail",
  "relation",
])
  $(id).addEventListener("change", () => setFilter(id, $(id).value));
$("clear-filters").onclick = () => {
  Object.assign(state, {
    historical: false,
    q: "",
    status: "",
    activity: "",
    epic: "",
    track: "",
    tag: "",
    relation: "",
    detail: "overview",
    document: "",
    page: 0,
    taskIds: [],
    focusTask: "",
    visualization: "",
  });
  controls();
  refreshViews({ fit: true });
};
$("quick-task").onclick = openPrompt;
$("refresh").onclick = () => poll(true);
$("nav").onclick = (e) => {
  stopTour();
  const v = e.target.closest("[data-view]")?.dataset.view;
  if (v) {
    closeDetails();
    if (v === "documents") {
      $("inspector").classList.remove("open");
      state.selected = "";
    }
    // Opening the Visualizations page keeps whichever view is applied marked.
    if (v !== "visualizations") state.visualization = "";
    if (v !== "documents") state.document = "";
    state.view = v;
    controls();
    refreshViews({ fit: true });
  }
};
document.addEventListener("keydown", (e) => {
  if (
    (e.metaKey || e.ctrlKey) &&
    e.key.toLowerCase() === "k" &&
    !document.body.classList.contains("execution-open")
  ) {
    e.preventDefault();
    if (
      state.view === "documents" &&
      planSection === "library" &&
      $("plan-search")
    ) {
      $("plan-search").focus();
      return;
    }
    if (state.view === "activity") {
      state.view = "tasks";
      controls();
      refreshViews();
    }
    panelPrefs.left = true;
    savePanels();
    applyPanels();
    $("search").focus();
  }
  if (e.key === "Escape") $("inspector").classList.remove("open");
});
document.addEventListener("click", async (e) => {
  const el = e.target.closest(
    "[data-task],[data-epic],[data-tag],[data-document],[data-edit],[data-explore],[data-reviewed],[data-edit-document],[data-track],[data-query],[data-open-graph],[data-doc-list],[data-doc-tasks],[data-status-view],[data-close-inspector]",
  );
  if (!el) return;
  e.preventDefault();
  const a = el.dataset;
  if (a.task) select(a.task, { center: true });
  else if (a.epic) {
    state.view = "graph";
    setFilter("epic", a.epic);
    state.selected = "epic:" + a.epic;
    renderInspector();
    urlState();
  } else if (a.tag) setFilter("tag", a.tag);
  else if (a.track) setFilter("track", a.track);
  else if (a.query) {
    if (state.view === "activity") {
      state.view = "tasks";
      state.activity = "";
    }
    $("search").value = a.query;
    setFilter("q", a.query);
  } else if (a.document) {
    state.selected = "";
    state.document = a.document;
    detailOpen = true;
    renderInspector();
    $("inspector").scrollTop = 0;
    urlState();
  } else if (a.edit) openEditor(a.edit);
  else if (a.explore) {
    focusTask(a.explore);
  } else if (a.reviewed) {
    try {
      await mutate("/api/task", "PATCH", {
        id: a.reviewed,
        needsReview: false,
      });
      toast("Source context reviewed");
    } catch (error) {
      toast(error.message);
    }
  } else if (a.editDocument) editDocument(a.editDocument);
  else if (Object.hasOwn(a, "openGraph")) {
    state.view = "graph";
    state.focusTask = "";
    state.document = "";
    refreshViews({ fit: true });
  } else if (Object.hasOwn(a, "docList")) {
    state.document = "";
    state.q = "";
    $("search").value = "";
    refreshViews();
  } else if (a.docTasks) {
    detailOpen = false;
    state.document = "";
    state.scope = "all";
    state.epic = "doc:" + a.docTasks;
    state.status = "";
    state.view = "tasks";
    controls();
    refreshViews();
  } else if (Object.hasOwn(a, "statusView")) {
    state.status = a.statusView;
    state.view = "tasks";
    controls();
    refreshViews();
  } else if (Object.hasOwn(a, "closeInspector")) {
    closeDetails();
  }
});
async function poll(force = false) {
  clearTimeout(pollTimer);
  if (document.hidden && !force) return;
  if (loading) return;
  loading = true;
  lastRequest = Date.now();
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/view-state", {
      headers: etag && !force ? { "If-None-Match": etag } : {},
      cache: "no-cache",
      signal: controller.signal,
    });
    if (response.status === 200) {
      const next = await response.json();
      const changed = !data || data.revision !== next.revision;
      etag = response.headers.get("ETag") || "";
      data = next;
      for (const [id, cached] of documentCache)
        if (data.documents[id]?.hash === cached.hash)
          data.documents[id].text = cached.text;
      if (changed) {
        const active = data.presentation?.activeVisualization;
        const requested =
          initialView && state.visualization
            ? data.presentation?.views?.find(
                (v) => v.id === state.visualization,
              )
            : null;
        const incoming =
          active && active.token !== lastActivation
            ? data.presentation?.views?.find((v) => v.id === active.id)
            : null;
        if (requested) {
          applyVisualization(requested);
          for (const key of [
            "q",
            "scope",
            "status",
            "epic",
            "track",
            "tag",
            "activity",
            "group",
            "detail",
          ])
            if (params.has(key)) state[key] = params.get(key);
          if (params.has("stripZoom")) {
            state.stripScale = Math.max(
              1,
              Number(params.get("stripZoom")) || 1,
            );
            state.stripCenter = Number(params.get("stripAt") ?? 0.5);
            state.stripFocus = "";
          }
        } else if (incoming && !workspaceActive() && !initialView) {
          stopTour();
          applyVisualization(incoming);
        }
        if (active) lastActivation = active.token;
        const requestedTour =
          initialView && params.get("tour")
            ? data.presentation?.tours?.find((t) => t.id === params.get("tour"))
            : null;
        const presenting = data.presentation?.activeTour;
        if (requestedTour && !workspaceActive())
          startTour(requestedTour, false, Number(params.get("step")) || 0);
        else if (presenting?.token !== lastPresentation && presenting) {
          lastPresentation = presenting.token;
          const saved = data.presentation?.tours?.find(
            (t) => t.id === presenting.id,
          );
          if (saved && !initialView && !workspaceActive())
            startTour(saved, presenting.autoplay);
        }
        initialView = false;
        controls();
        refreshViews({ fit: !lastGraphKey });
        if (
          $("editor").open ||
          $("doc-editor").open ||
          $("task-prompt-dialog").open
        )
          toast(
            "Database updated. Your editor draft is preserved; saving checks its original revision.",
          );
      }
    } else if (response.status !== 304) throw Error("HTTP" + response.status);
    failed = 0;
    $("sync-state").textContent = "Live · r" + data.revision;
    $("live-dot").className = "live";
  } catch (error) {
    failed++;
    $("sync-state").textContent = data
      ? "Offline · last snapshot"
      : "Server unavailable";
    $("live-dot").className = "error";
    if (!data) $("graph-empty").hidden = false;
    if (!data)
      $("graph-empty").textContent =
        "Start the local server with node cli.mjs serve, then refresh. " +
        error.message;
  } finally {
    clearTimeout(timeout);
    loading = false;
    if (!document.hidden)
      pollTimer = setTimeout(
        () => poll(),
        Math.min(
          60000,
          (data?.project.pollIntervalMs || 10000) * Math.max(1, failed),
        ),
      );
  }
}
document.addEventListener("visibilitychange", () => {
  clearTimeout(pollTimer);
  if (document.hidden) {
    if (tourPlaying) {
      tourPlaying = false;
      clearTimeout(tourTimer);
      renderTour();
    }
  } else poll(true);
});
window.addEventListener("online", () => poll(true));
poll();

$("saved-views").addEventListener("keydown", (e) => {
  const tab = e.target.closest("[data-visualization-tab]");
  if (!tab) return;
  const step =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : e.key === "Home"
          ? -VISUALIZATION_TABS.length
          : e.key === "End"
            ? VISUALIZATION_TABS.length
            : 0;
  if (!step) return;
  e.preventDefault();
  const at = VISUALIZATION_TABS.findIndex(
    (t) => t.id === tab.dataset.visualizationTab,
  );
  selectVisualizationTab(
    VISUALIZATION_TABS[
      Math.max(0, Math.min(VISUALIZATION_TABS.length - 1, at + step))
    ].id,
    { focus: true },
  );
});
$("saved-views").addEventListener("click", async (e) => {
  const button = e.target.closest("button");
  if (!button || !data) return;
  if (button.dataset.visualizationTab) {
    selectVisualizationTab(button.dataset.visualizationTab);
    return;
  }
  const remove = button.dataset.removeVisualization;
  if (remove) {
    const kind = button.dataset.removeKind === "tour" ? "tour" : "view",
      label =
        kind === "tour"
          ? data.presentation?.tours?.find((t) => t.id === remove)?.title
          : data.presentation?.views?.find((v) => v.id === remove)?.title;
    if (
      !confirm(
        "Delete the saved " +
          (kind === "tour" ? "presentation" : "view") +
          " “" +
          (label || remove) +
          "”? Tasks and plans are not affected.",
      )
    )
      return;
    button.disabled = true;
    try {
      const response = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "visualization.delete",
            input: { id: remove, kind },
          }),
        }),
        body = await response.json();
      if (!response.ok) throw Error(body.error || "Delete failed");
      if (kind === "tour" && tour?.id === remove) stopTour();
      if (kind === "view" && state.visualization === remove)
        state.visualization = "";
      await poll(true);
      toast("Deleted the saved " + (kind === "tour" ? "presentation" : "view"));
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
    return;
  }
  if (button.dataset.presentation) {
    const saved = data.presentation?.tours?.find(
      (t) => t.id === button.dataset.presentation,
    );
    if (saved) startTour(saved);
    return;
  }
  const view = data.presentation?.views?.find(
    (v) => v.id === button.dataset.visualization,
  );
  if (view) {
    stopTour();
    applyVisualization(view);
    controls();
    refreshViews({ fit: true });
    animateView();
  }
});
const workspace = document.querySelector(".workspace");
new ResizeObserver(() =>
  workspace.style.setProperty(
    "--presentation-height",
    $("presentation-bar").hidden
      ? "0px"
      : $("presentation-bar").getBoundingClientRect().height + "px",
  ),
).observe($("presentation-bar"));
function fullscreenState() {
  applyPanels();
  const full = workspace.classList.contains("theater");
  $("fullscreen").innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="' +
    (full
      ? "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"
      : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5") +
    '"/></svg>';
  $("fullscreen").title = full ? "Exit full screen" : "Full screen";
  $("fullscreen").setAttribute("aria-label", $("fullscreen").title);
  $("fullscreen").setAttribute("aria-pressed", String(full));
  if (state.view === "graph") setTimeout(fitGraph, 0);
}
$("fullscreen").onclick = () => {
  if (tour) {
    stopTour();
    workspace.classList.remove("theater");
    urlState();
  } else workspace.classList.toggle("theater");
  fullscreenState();
};
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    !document.querySelector("dialog[open]") &&
    workspace.classList.contains("theater")
  ) {
    workspace.classList.remove("theater");
    fullscreenState();
  }
});
$("mcp-info").onclick = () => {
  $("mcp-url").textContent = location.origin + "/mcp";
  $("mcp-dialog").showModal();
};
$("mcp-close").onclick = () => $("mcp-dialog").close();

function animateView(direction = 1) {
  const el = $(state.view + "-view");
  el.style.setProperty("--tour-direction", direction);
  el.classList.remove("view-enter");
  void el.offsetWidth;
  el.classList.add("view-enter");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    $("inspector-body").animate(
      [
        { opacity: 0.25, transform: "translateX(18px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 650, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    $("presentation-caption").animate([{ opacity: 0.2 }, { opacity: 1 }], {
      duration: 500,
    });
  }
}
function stopTour() {
  clearTimeout(tourTimer);
  document
    .querySelectorAll(".tour-highlight")
    .forEach((e) => e.classList.remove("tour-highlight"));
  const wasTour = Boolean(tour);
  tour = null;
  tourPlaying = false;
  document.body.classList.remove("tour-active");
  if (wasTour && !tourWasFullscreen) {
    workspace.classList.remove("theater");
    fullscreenState();
  }
  renderTour();
}
function renderTour() {
  const view = data?.presentation?.views?.find(
    (v) => v.id === state.visualization,
  );
  $("presentation-bar").hidden = !tour;
  $("tour-arrows").toggleAttribute("hidden", !tour);
  $("tour-cue").hidden = !tour;
  if (!tour) {
    document
      .querySelectorAll(".tour-highlight")
      .forEach((e) => e.classList.remove("tour-highlight"));
    return;
  }
  document.querySelector(".presentation-actions").hidden = false;
  $("presentation-title").textContent = tour.title;
  $("presentation-caption").textContent = "";
  $("presentation-up-next").textContent = "";
  $("presentation-count").textContent =
    tourStep + 1 + " / " + tour.steps.length;
  $("presentation-prev").disabled = tourStep === 0;
  $("presentation-next").disabled = tourStep === tour.steps.length - 1;
  const play = $("presentation-play");
  play.innerHTML = tourPlaying
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>';
  play.title = tourPlaying ? "Pause walkthrough" : "Play walkthrough";
  play.setAttribute("aria-label", play.title);
  $("tour-cue").innerHTML =
    "<small>" +
    esc(tour.title) +
    " · " +
    (tourStep + 1) +
    " / " +
    tour.steps.length +
    "</small><p>" +
    esc(tour.steps[tourStep].caption || view?.caption || view?.title || "") +
    "</p><span>Use ← → to move between steps</span>";
  requestAnimationFrame(positionTourCue);
}
function positionTourCue() {
  if (!tour) return;
  const cue = $("tour-cue"),
    step = tour.steps[tourStep],
    view = $(state.view + "-view");
  let target;
  const anchors = {
    search: $("search-facets"),
    filters: $("filters-panel"),
    chart:
      state.view === "graph"
        ? $("graph-stage")
        : state.view === "activity"
          ? document.querySelector(".strip-stage")
          : document.querySelector(".epic-scroll"),
    tasks: $("tasks-view"),
    documents: $("documents-view"),
  };
  if (step.target && step.target !== "selection") target = anchors[step.target];
  if (!target && state.selected) {
    const id = CSS.escape(state.selected);
    target = view?.querySelector(
      '[data-node="' +
        id +
        '"],[data-strip-task="' +
        id +
        '"],[data-progress-task="' +
        id +
        '"],[data-workbench-task="' +
        id +
        '"]',
    );
  }
  let rect = target?.getBoundingClientRect();
  if (
    !rect ||
    rect.width < 1 ||
    rect.bottom < 80 ||
    rect.top > innerHeight - 80
  ) {
    target = anchors.chart || view;
    rect = target?.getBoundingClientRect();
  }
  if (!rect) return;
  document
    .querySelectorAll(".tour-highlight")
    .forEach((e) => e.classList.remove("tour-highlight"));
  target.classList.add("tour-highlight");
  const width = Math.min(370, innerWidth - 32);
  cue.style.width = width + "px";
  const height = cue.getBoundingClientRect().height,
    tx = Math.max(20, Math.min(innerWidth - 20, rect.left + rect.width / 2)),
    ty = Math.max(
      90,
      Math.min(innerHeight - 100, rect.top + Math.min(rect.height / 2, 100)),
    );
  let x = rect.right + 24,
    y = ty - height / 2;
  if (x + width > innerWidth - 16) {
    x = tx - width / 2;
    y = ty + 34;
  }
  if (y + height > innerHeight - 86) y = ty - height - 34;
  x = Math.max(16, Math.min(innerWidth - width - 16, x));
  y = Math.max(85, Math.min(innerHeight - height - 86, y));
  cue.style.left = x + "px";
  cue.style.top = y + "px";
  const sx = Math.max(x + 12, Math.min(x + width - 12, tx)),
    sy = ty < y ? y : y + height;
  $("tour-arrows").setAttribute(
    "viewBox",
    "0 0 " + innerWidth + " " + innerHeight,
  );
  $("tour-arrow-path").setAttribute(
    "d",
    "M " +
      sx +
      " " +
      sy +
      " Q " +
      sx +
      " " +
      (sy + ty) / 2 +
      " " +
      tx +
      " " +
      ty,
  );
}
window.addEventListener("resize", () => {
  if (tour) requestAnimationFrame(positionTourCue);
});
document.addEventListener(
  "scroll",
  () => {
    if (tour) requestAnimationFrame(positionTourCue);
  },
  { capture: true, passive: true },
);
function queueTour() {
  clearTimeout(tourTimer);
  if (tourPlaying && !document.hidden)
    tourTimer = setTimeout(() => {
      if (tourStep + 1 < tour.steps.length) showTourStep(tourStep + 1);
      else {
        tourPlaying = false;
        renderTour();
      }
    }, tour.steps[tourStep].durationMs || 6000);
}
function showTourStep(index) {
  if (!tour) return;
  index = Math.max(0, Math.min(tour.steps.length - 1, index));
  const direction = index < tourStep ? -1 : 1;
  tourStep = index;
  const view = data.presentation.views.find(
    (v) => v.id === tour.steps[index].viewId,
  );
  if (!view) {
    stopTour();
    return;
  }
  applyVisualization(view);
  controls();
  refreshViews({ fit: true });
  animateView(direction);
  renderTour();
  queueTour();
}
function pauseTour() {
  if (tourPlaying) {
    tourPlaying = false;
    clearTimeout(tourTimer);
    renderTour();
  }
}
function startTour(record, autoplay = false, index = 0) {
  if (!tour) tourWasFullscreen = workspace.classList.contains("theater");
  tour = record;
  tourPlaying = Boolean(autoplay) && !document.hidden;
  workspace.classList.add("theater");
  document.body.classList.add("tour-active");
  fullscreenState();
  showTourStep(Math.max(0, Math.min(record.steps.length - 1, index)));
}
function stepTour(delta) {
  if (!tour) return;
  tourPlaying = false;
  clearTimeout(tourTimer);
  const index = Math.max(0, Math.min(tour.steps.length - 1, tourStep + delta));
  if (index !== tourStep) showTourStep(index);
  else renderTour();
}
$("presentation-prev").onclick = () => stepTour(-1);
$("presentation-next").onclick = () => stepTour(1);
$("presentation-play").onclick = () => {
  tourPlaying = !tourPlaying;
  if (tourPlaying && tourStep === tour.steps.length - 1) showTourStep(0);
  renderTour();
  queueTour();
};
$("presentation-close").onclick = () => {
  stopTour();
  state.visualization = "";
  presentSavedViews();
  renderTour();
  urlState();
};
// Capture before the strip/minimap consume arrow keys. Never steal text editing.
document.addEventListener(
  "keydown",
  (e) => {
    if (
      workspaceActive() ||
      !tour ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      document.querySelector("dialog[open]") ||
      e.target.closest('input,textarea,select,[contenteditable="true"]')
    )
      return;
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      stepTour(e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      stopTour();
      workspace.classList.remove("theater");
      fullscreenState();
      urlState();
    }
  },
  true,
);

function captureContext() {
  return {
    revision: data.revision,
    view: state.view,
    stripOrder: state.stripOrder,
    filters: options(),
    selected: state.selected,
    document: state.document,
    taskIds: [...state.taskIds],
    visualization: state.visualization,
    tour: tour?.id || "",
    step: tourStep,
    camera: {
      stripScale: state.stripScale,
      stripCenter: state.stripCenter,
      epicZoom: state.epicZoom,
    },
    url: location.pathname + location.search,
  };
}
function openPrompt() {
  pauseTour();
  if (!captureDraft) {
    captureDraft = { submissionId: randomUUID(), context: captureContext() };
    $("task-prompt").value = "";
  }
  const c = captureDraft.context,
    selected = task(c.selected),
    doc = data.documents[c.document];
  $("task-prompt-context").textContent = [
    c.view + " view",
    c.filters.epic
      ? epicName(c.filters.epic)
      : doc?.title ||
        (selected && epicName(selected.epic)) ||
        (c.filters.scope === "runtime" ? "Runtime delivery" : "All plans"),
    selected?.title,
    c.filters.q && "Search: " + c.filters.q,
    c.filters.track && trackName(c.filters.track),
    c.filters.tag && "#" + c.filters.tag,
  ]
    .filter(Boolean)
    .join(" · ");
  $("task-prompt-message").textContent = "";
  $("task-prompt-dialog").showModal();
  $("task-prompt").focus();
}
$("task-prompt-close").onclick = () => $("task-prompt-dialog").close();
$("task-prompt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("[type=submit]");
  button.disabled = true;
  const payload = { ...captureDraft, prompt: $("task-prompt").value };
  try {
    let result;
    try {
      result = await mutate("/api/task/prompt", "POST", payload);
    } catch (error) {
      if (error.status !== 409) throw error;
      await poll(true);
      result = await mutate("/api/task/prompt", "POST", payload);
    }
    captureDraft = null;
    $("task-prompt-dialog").close();
    stopTour();
    Object.assign(state, {
      view: "tasks",
      scope: "all",
      q: "id:" + result.task.id,
      status: "",
      epic: "",
      track: "",
      tag: "",
      relation: "",
      taskIds: [],
      visualization: "",
    });
    controls();
    refreshViews();
    select(result.task.id);
    toast("Task added with your current view and original prompt.");
  } catch (error) {
    $("task-prompt-message").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
function captureDetails(t) {
  const c = t.capture.context;
  return `<details class="context"><summary>Original request & captured view</summary><p>${esc(t.prompt)}</p><p>${esc(c.view)} · database r${c.revision}</p>${c.selected ? `<button class="detail-link" data-task="${esc(c.selected)}">Selected context: ${esc(task(c.selected)?.title || c.selected)}</button>` : ""}${c.url ? `<a href="${esc(c.url)}">Return to the captured view ↗</a>` : ""}<pre>${esc(JSON.stringify(c.filters, null, 2))}</pre></details>`;
}
function planBadge(p) {
  return `<span class="plan-status plan-${p.status}">${PLAN_STATUSES[p.status]}</span><strong class="plan-percent" title="${esc(p.basis)}">${p.percent}%</strong>`;
}
function planMetadataForm(doc) {
  const p = planSummaries(data).find((p) => p.doc.id === doc.id),
    m = planDrafts.get(doc.id)?.values || doc.plan || {};
  return `<div class="plan-summary">${planBadge(p)}<span>${esc(p.category)} · ${esc(p.branch)} · ${esc(p.basis)}</span></div><details class="plan-classification" ${planDrafts.has(doc.id) ? "open" : ""}><summary>Plan classification</summary><form data-plan-metadata="${esc(doc.id)}"><div class="form-row"><label>Status<select name="planStatus"><option value="">Automatic from tasks / archive</option>${Object.entries(
    PLAN_STATUSES,
  )
    .map(
      ([id, label]) =>
        `<option value="${id}" ${m.status === id ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Completion estimate (%)<input name="progressPercent" type="number" min="0" max="100" step="any" placeholder="Automatic" value="${m.progressPercent ?? ""}"></label></div><div class="form-row"><label>Feature area<input name="category" value="${esc(m.category || "")}" placeholder="${esc(p.category)}"></label><label>Target branch<input name="targetBranch" value="${esc(m.targetBranch || "")}" placeholder="Unassigned"></label></div><button class="button primary" type="submit">Save classification</button><span class="plan-save-message" role="status"></span></form></details>`;
}
function renderPlanLibrary(target) {
  const words = queryTerms(state.q)
      .filter((t) => !t.includes(":"))
      .map((t) => t.toLowerCase()),
    localWords = planSearch.toLowerCase().trim().split(/\s+/).filter(Boolean),
    summaries = planSummaries(data),
    matching = new Set(rows.map((t) => t.id)),
    candidates = summaries.filter(
      (p) =>
        (includeHistorical(state) ||
          !p.doc.historical ||
          ["done", "abandoned"].includes(p.status)) &&
        (!words.length ||
          (searchDocumentIds
            ? searchDocumentIds.has(p.doc.id)
            : words.every((w) =>
                (p.doc.title + " " + p.doc.id + " " + p.category)
                  .toLowerCase()
                  .includes(w),
              ))) &&
        (!localWords.length ||
          localWords.every((w) =>
            (p.doc.title + " " + p.doc.id + " " + p.category + " " + p.branch)
              .toLowerCase()
              .includes(w),
          ) ||
          planSearchIds?.has(p.doc.id)) &&
        (!(
          state.status ||
          state.epic ||
          state.track ||
          state.tag ||
          state.scope === "runtime" ||
          state.taskIds.length ||
          queryTerms(state.q).some((t) => t.includes(":"))
        ) ||
          p.tasks.some((t) => matching.has(t.id))),
    ),
    counts = new Map(
      Object.keys(PLAN_STATUSES).map((id) => [
        id,
        candidates.filter((p) => p.status === id).length,
      ]),
    ),
    docs = candidates.filter((p) => documentStatuses.has(p.status)),
    groups = new Map();
  for (const p of docs) {
    const key =
      documentGroup === "status"
        ? PLAN_STATUSES[p.status]
        : documentGroup === "folder"
          ? p.doc.id.split("/")[0]
          : documentGroup === "branch"
            ? p.branch
            : p.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const list = [{ id: "library-heading", type: "heading", count: docs.length }];
  for (const [name, items] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    list.push({
      id: "group:" + name,
      name,
      count: items.length,
      type: "group",
    });
    for (const p of items.sort((a, b) =>
      a.doc.title.localeCompare(b.doc.title),
    ))
      list.push({ ...p, id: p.doc.id, type: "document" });
  }
  const controls = $("plans-controls");
  if (!controls.querySelector("#plan-search")) {
    controls.innerHTML =
      '<label class="plan-search-label"><span class="sr-only">Search plans</span><input type="search" id="plan-search" placeholder="Search plans…" aria-label="Search plans"></label><button class="icon-button" id="write-plan" title="Write plan" aria-label="Write plan">＋</button><details class="library-filter-menu"><summary title="Plan filters" aria-label="Plan filters">☷</summary><div class="library-filter-options"><label>Group <select id="document-group"><option value="category">Feature area</option><option value="branch">Target branch</option><option value="status">Status</option><option value="folder">Folder</option></select></label><div class="library-statuses" role="group" aria-label="Plan status filters">' +
      Object.entries(PLAN_STATUSES)
        .map(
          ([id, label]) =>
            '<button class="button subtle" data-document-status="' +
            id +
            '">' +
            label.toLowerCase().replace(/\b[a-z]/g, (x) => x.toUpperCase()) +
            " <span></span></button>",
        )
        .join("") +
      "</div></div></details>";
    $("plan-search").value = planSearch;
    $("plan-search").oninput = (e) => {
      planSearch = e.target.value;
      planSearchIds = null;
      libraryScroll = 0;
      planSearchController?.abort();
      clearTimeout(planSearchTimer);
      renderPlanLibrary(target);
      urlState();
      if (planSearch.trim()) planSearchTimer = setTimeout(searchPlans, 220);
    };
    $("document-group").onchange = (e) => {
      documentGroup = e.target.value;
      libraryScroll = 0;
      renderPlanLibrary(target);
      urlState();
    };
    $("write-plan").onclick = () =>
      window.dispatchEvent(new Event("nupp-write-plan"));
    for (const button of controls.querySelectorAll("[data-document-status]"))
      button.onclick = () => {
        const id = button.dataset.documentStatus;
        if (documentStatuses.has(id)) documentStatuses.delete(id);
        else documentStatuses.add(id);
        libraryScroll = 0;
        renderPlanLibrary(target);
        urlState();
      };
  }
  $("document-group").value = documentGroup;
  for (const button of controls.querySelectorAll("[data-document-status]")) {
    button.setAttribute(
      "aria-pressed",
      String(documentStatuses.has(button.dataset.documentStatus)),
    );
    button.querySelector("span").textContent =
      "(" + counts.get(button.dataset.documentStatus) + ")";
  }
  const old = target.querySelector(".library-window");
  if (old && libraryScroll !== 0) libraryScroll = old.scrollTop;
  viewList?.destroy();
  target.innerHTML = '<div class="library-window"></div>';
  const viewport = target.firstElementChild;
  viewList = createVirtualList(viewport, {
    items: list,
    height: (item) =>
      item.type === "heading"
        ? 34
        : item.type === "group"
          ? 36
          : compactLayout.matches
            ? 90
            : 66,
    label: "Plan library",
    render: (p) =>
      p.type === "heading"
        ? '<div class="library-scroll-heading"><p role="status">' +
          p.count +
          " plans" +
          (planSearch ? " matching “" + esc(planSearch) + "”" : "") +
          "</p></div>"
        : p.type === "group"
          ? '<h3 class="virtual-group-heading">' +
            esc(p.name) +
            " <span>" +
            p.count +
            "</span></h3>"
          : '<button class="doc-card" data-document="' +
            esc(p.doc.id) +
            '"><div><b>' +
            esc(p.doc.title) +
            "</b><small>" +
            esc(p.branch) +
            '</small></div><div class="doc-card-progress">' +
            planBadge(p) +
            '<div class="plan-meter"><i style="width:' +
            p.percent +
            '%"></i></div></div></button>',
  });
  viewport.scrollTop = libraryScroll;
  viewport.addEventListener(
    "scroll",
    () => {
      libraryScroll = viewport.scrollTop;
    },
    { passive: true },
  );
  $("result-count").textContent = docs.length + " plans";
}
async function searchPlans() {
  const query = planSearch.trim();
  planSearchController = new AbortController();
  try {
    const r = await fetch(
      "/api/documents?idsOnly=true&q=" + encodeURIComponent(query),
      { signal: planSearchController.signal },
    );
    if (!r.ok) throw Error("Plan search unavailable");
    const result = await r.json();
    if (query !== planSearch.trim()) return;
    planSearchIds = new Set(
      result.ids || result.documents?.map((d) => d.id) || result,
    );
    if (
      state.view === "documents" &&
      planSection === "library" &&
      $("plans-section-content")
    )
      renderPlanLibrary($("plans-section-content"));
  } catch (error) {
    if (error.name !== "AbortError") toast(error.message);
  }
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-plan-metadata]");
  if (!form) return;
  e.preventDefault();
  const button = form.querySelector("[type=submit]"),
    version = planDrafts.get(form.dataset.planMetadata)?.etag || etag,
    payload = {
      id: form.dataset.planMetadata,
      status: form.elements.planStatus.value,
      category: form.elements.category.value.trim(),
      targetBranch: form.elements.targetBranch.value.trim(),
      progressPercent:
        form.elements.progressPercent.value === ""
          ? null
          : Number(form.elements.progressPercent.value),
    };
  button.disabled = true;
  try {
    await mutate("/api/plan", "PATCH", payload, version);
    planDrafts.delete(payload.id);
    renderDocuments();
    toast("Plan classification saved to the database.");
  } catch (error) {
    form.querySelector(".plan-save-message").textContent = error.message;
    button.disabled = false;
  }
});

function rememberPlanDraft(e) {
  const f = e.target.closest("[data-plan-metadata]");
  if (!f) return;
  const id = f.dataset.planMetadata;
  planDrafts.set(id, {
    etag: planDrafts.get(id)?.etag || etag,
    values: {
      status: f.elements.planStatus.value,
      category: f.elements.category.value,
      targetBranch: f.elements.targetBranch.value,
      progressPercent: f.elements.progressPercent.value,
    },
  });
}
document.addEventListener("input", rememberPlanDraft);
document.addEventListener("change", rememberPlanDraft);

function savePanels() {
  try {
    localStorage.setItem("nupp-plan-panels", JSON.stringify(panelPrefs));
  } catch {}
}
function syncDetailModal() {
  const modal = $("detail-dialog");
  if (detailOpen && (state.selected || state.document)) {
    if (!modal.open) modal.showModal();
  } else if (modal.open) modal.close();
}
function closeDetails() {
  detailOpen = false;
  $("inspector-body").replaceChildren();
  $("detail-dialog").close();
  state.document = "";
  state.selected = "";
  urlState();
}
$("detail-modal-close").onclick = closeDetails;
$("detail-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDetails();
});
$("detail-dialog").addEventListener("click", (e) => {
  if (e.target === $("detail-dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDetails();
  }
});
function applyPanels() {
  // Now and Visualizations have nothing the task filters apply to.
  const available = !["activity", "visualizations"].includes(state.view);
  $("toggle-left").hidden = !available;
  const w = document.querySelector(".workspace"),
    left = available && panelPrefs.left;
  w.classList.toggle("left-collapsed", !left);
  w.classList.toggle("left-expanded", left);
  $("toggle-left").title = left ? "Collapse filters" : "Expand filters";
  $("toggle-left").setAttribute("aria-expanded", String(left));
  $("filter-scrim").hidden = true;
  $("main").inert = false;
  document.querySelector(".header").inert = false;
  $("site-topbar").inert = false;
  const panel = $("filters-panel");
  panel.removeAttribute("role");
  panel.removeAttribute("aria-modal");
  if (tour) requestAnimationFrame(positionTourCue);
}
function closeMobileFilters() {
  panelPrefs.left = false;
  savePanels();
  applyPanels();
  $("toggle-left").focus();
}
$("close-filters").onclick = closeMobileFilters;
$("filter-scrim").onclick = closeMobileFilters;
$("apply-mobile-filters").onclick = closeMobileFilters;
$("filters-panel").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && compactLayout.matches && panelPrefs.left) {
    e.preventDefault();
    e.stopPropagation();
    closeMobileFilters();
  }
});
compactLayout.addEventListener("change", () => {
  applyPanels();
  if (data) refreshViews();
});
$("toggle-left").onclick = () => {
  panelPrefs.left = !panelPrefs.left;
  applyPanels();
  savePanels();
  if (compactLayout.matches && panelPrefs.left) $("close-filters").focus();
};
$("show-toc").onclick = () => {
  detailOpen = true;
  renderInspector();
};
function documentToc(doc) {
  return '<div class="toc-body" data-document-toc="' + esc(doc.id) + '"></div>';
}
function populateToc(el) {
  const doc = data.documents[el.dataset.documentToc];
  if (!doc?.text) return;
  el.innerHTML =
    '<input type="search" data-toc-search placeholder="Find a section…" aria-label="Find a document section"><nav class="document-toc" aria-label="Document contents"></nav>';
  filterToc(el, "");
}
function filterToc(el, q) {
  const headings = documentHeadings(
    data.documents[el.dataset.documentToc].text,
  ).filter((h) => h.title.toLowerCase().includes(q.toLowerCase()));
  el.querySelector("nav").innerHTML =
    headings
      .slice(0, 80)
      .map(
        (h) =>
          '<a href="#' +
          esc(h.id) +
          '" data-doc-heading="' +
          esc(h.id) +
          '" style="--toc-depth:' +
          Math.max(0, h.level - 1) +
          '">' +
          esc(h.title) +
          "</a>",
      )
      .join("") +
    (headings.length > 80
      ? "<small>Showing 80 of " +
        headings.length +
        " sections. Search to narrow.</small>"
      : "");
}
document.addEventListener("input", (e) => {
  if (e.target.hasAttribute("data-toc-search"))
    filterToc(e.target.closest("[data-document-toc]"), e.target.value);
});
document.addEventListener(
  "toggle",
  (e) => {
    if (!e.target.matches(".modal-toc") || !e.target.isConnected) return;
    const body = e.target.querySelector("[data-document-toc]");
    if (e.target.open) populateToc(body);
    else body.replaceChildren();
  },
  true,
);
document.addEventListener("click", (e) => {
  const page = e.target.closest("[data-document-page]");
  if (page) {
    documentPage = Number(page.dataset.documentPage);
    renderDocumentDetail();
    $("inspector").scrollTop = 0;
  }
  const link = e.target.closest("[data-doc-heading]");
  if (!link) return;
  e.preventDefault();
  const doc = data.documents[state.document],
    pages = documentPages(doc.text),
    index = pages.findIndex((p) =>
      p.headings.some((h) => h.id === link.dataset.docHeading),
    );
  if (index >= 0 && index !== documentPage) {
    documentPage = index;
    renderDocumentDetail();
  }
  const target = $("inspector-body").querySelector(
    '[id="' + CSS.escape(link.dataset.docHeading) + '"]',
  );
  target?.scrollIntoView({ behavior: "instant", block: "start" });
});
document.addEventListener(
  "toggle",
  async (e) => {
    const el = e.target;
    if (!el.dataset.lazyContext || !el.isConnected) return;
    if (!el.open) {
      el.querySelector(".context-prose").replaceChildren();
      return;
    }
    el.querySelector(".context-prose").textContent = "Loading source context…";
    try {
      const doc = await ensureDocument(el.dataset.lazyContext);
      if (el.open && el.isConnected) {
        const text = doc.text
          .split("\n")
          .slice(
            Number(el.dataset.lineStart) - 1,
            Math.min(
              Number(el.dataset.lineEnd),
              Number(el.dataset.lineStart) + 350,
            ),
          )
          .join("\n");
        el.querySelector(".context-prose").innerHTML =
          markdown(text, doc.id) +
          '<p><button class="detail-link" data-document="' +
          esc(doc.id) +
          '">Open the complete plan →</button></p>';
      }
    } catch (error) {
      el.querySelector(".context-prose").textContent = error.message;
    }
  },
  true,
);
window.addEventListener("nupp-show-task", (e) => select(e.detail.id));

new ResizeObserver(() =>
  workspace.style.setProperty(
    "--toolbar-height",
    document.querySelector(".toolbar").getBoundingClientRect().height + "px",
  ),
).observe(document.querySelector(".toolbar"));

function activityBadge(t) {
  const state = activityState(t);
  return state === "active"
    ? '<span class="activity-badge">● In flight</span>'
    : state === "stale"
      ? '<span class="activity-badge stale">Needs check-in</span>'
      : "";
}
function activityTime(value) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}
function activityDetails(t) {
  const a = t.activity,
    state = activityState(t),
    own = a?.sessionId === browserWorker,
    live = state === "active";
  return (
    '<section class="task-activity"><h3>Activity</h3>' +
    activityBadge(t) +
    (a
      ? "<p><b>" +
        esc(a.owner) +
        "</b> · " +
        esc(
          state === "active"
            ? "In flight"
            : state === "stale"
              ? "Check-in expired"
              : state,
        ) +
        "</p>" +
        (a.summary ? "<p>" + esc(a.summary) + "</p>" : "") +
        (a.branch ? "<p>Branch <code>" + esc(a.branch) + "</code></p>" : "") +
        (a.worktree
          ? '<p class="activity-path">' + esc(a.worktree) + "</p>"
          : "") +
        "<small>Last check-in " +
        esc(activityTime(a.heartbeatAt)) +
        " · " +
        (live ? "fresh until " : state === "stale" ? "expired " : "ended ") +
        esc(activityTime(live || state === "stale" ? a.expiresAt : a.endedAt)) +
        "</small>"
      : "<p>No current work session reported.</p>") +
    '<div class="activity-actions">' +
    (!live
      ? '<button class="button subtle" data-activity-action="start" data-activity-task="' +
        esc(t.id) +
        '">Start work</button>'
      : "") +
    (own && a.state !== "finished"
      ? '<button class="button subtle" data-activity-action="heartbeat" data-activity-task="' +
        esc(t.id) +
        '">Check in</button><button class="button subtle" data-activity-action="pause" data-activity-task="' +
        esc(t.id) +
        '">Pause</button><button class="button subtle" data-activity-action="finish" data-activity-task="' +
        esc(t.id) +
        '">Finish session</button>'
      : "") +
    "</div></section>"
  );
}
function updateActivityPresence() {
  clearTimeout(activityExpiryTimer);
  if (!data) return;
  const now = Date.now(),
    active = data.tasks.filter((t) => activityState(t, now) === "active");
  // The count rides the Now entry in the rail; zero reports nothing at all.
  const badge = $("inflight-count");
  badge.textContent = active.length;
  badge.hidden = !active.length;
  badge.setAttribute(
    "aria-label",
    active.length +
      (active.length === 1 ? " task in flight" : " tasks in flight"),
  );
  const next = Math.min(...active.map((t) => Date.parse(t.activity.expiresAt)));
  if (Number.isFinite(next) && !document.hidden)
    activityExpiryTimer = setTimeout(
      () => refreshViews(),
      Math.min(2147483647, Math.max(1, next - now + 25)),
    );
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(activityExpiryTimer);
  else if (data) refreshViews();
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-activity-action]");
  if (!b) return;
  const t = task(b.dataset.activityTask),
    action = b.dataset.activityAction,
    payload = { id: t.id, action };
  if (action === "start")
    Object.assign(payload, {
      owner: "Browser session",
      sessionId: browserWorker,
      summary: "Working on " + t.title,
    });
  else payload.leaseId = t.activity?.leaseId;
  b.disabled = true;
  try {
    await mutate("/api/activity", "POST", payload);
    toast(
      action === "finish"
        ? "Work session finished; task progress is unchanged."
        : "Activity updated.",
    );
  } catch (error) {
    toast(error.message);
  } finally {
    b.disabled = false;
  }
});

function focusTask(id) {
  if (!task(id)) return;
  detailOpen = false;
  $("detail-dialog").close();
  stopTour();
  Object.assign(state, {
    view: "graph",
    scope: "all",
    q: "",
    status: "",
    activity: "",
    epic: "",
    track: "",
    tag: "",
    selected: id,
    relation: "",
    detail: "all",
    taskIds: [],
    focusTask: id,
    visualization: "",
  });
  controls();
  refreshViews({ fit: true });
}
function taskAtAGlance(t) {
  const s = taskSignals(data, t),
    links = s.blockers.map((id) => task(id)).filter(Boolean);
  return (
    '<section class="task-at-glance">' +
    (t.nextAction
      ? "<h3>Next action</h3><p>" +
        esc(t.nextAction).replace(/\n/g, "<br>") +
        "</p>"
      : "") +
    (s.blockers.length
      ? "<h3>Unfinished prerequisites</h3>" +
        links
          .map(
            (t) =>
              '<button class="detail-link" data-task="' +
              esc(t.id) +
              '">' +
              esc(t.title) +
              "</button>",
          )
          .join("")
      : s.ready
        ? '<span class="ready-signal">Prerequisites satisfied</span>'
        : "") +
    (t.acceptance?.length
      ? '<details class="acceptance-list" open><summary>Acceptance · ' +
        t.acceptance.length +
        "</summary><ul>" +
        t.acceptance.map((a) => "<li>" + esc(a) + "</li>").join("") +
        "</ul></details>"
      : "") +
    '<div class="task-context-actions"><button class="button subtle" data-followup-task="' +
    esc(t.id) +
    '">＋ Add follow-up</button><button class="button subtle" data-focus-task="' +
    esc(t.id) +
    '">Focus connections ↗</button></div></section>'
  );
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest(
    "[data-focus-task],[data-expand-neighborhood],[data-clear-neighborhood],[data-task-back],[data-copy-task-link],[data-followup-task]",
  );
  if (!b) return;
  e.preventDefault();
  if (b.dataset.focusTask) focusTask(b.dataset.focusTask);
  else if (b.hasAttribute("data-expand-neighborhood")) {
    state.focusTask = "";
    state.relation = "both";
    controls();
    refreshViews({ fit: true });
  } else if (b.hasAttribute("data-clear-neighborhood")) {
    state.focusTask = "";
    state.relation = "";
    controls();
    refreshViews({ fit: true });
  } else if (b.hasAttribute("data-task-back")) {
    const id = selectionTrail.pop();
    if (id) select(id, { remember: false, center: true });
  } else if (b.hasAttribute("data-copy-task-link")) {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link to this task and view copied.");
    } catch {
      toast("Copy the current address to share this task and view.");
    }
  } else if (b.dataset.followupTask) {
    select(b.dataset.followupTask);
    openPrompt();
  }
});

new MutationObserver(() => {
  $("mcp-info").title =
    $("sync-state").textContent + " · Connect an agent to Avoozl";
  $("mcp-info").setAttribute("aria-label", $("mcp-info").title);
}).observe($("sync-state"), {
  childList: true,
  characterData: true,
  subtree: true,
});

let documentPreviewTimer;
function paintDocumentPreview() {
  const text = $("doc-text").value,
    page = documentPages(text)[0];
  $("document-edit-preview").innerHTML =
    markdown(page.text.slice(0, 60000), editingDocument.id) +
    (documentPages(text).length > 1
      ? '<p class="muted">Preview shows the first section. The entire document is saved.</p>'
      : "");
}
$("doc-text").addEventListener("input", () => {
  editingDocument.dirty = true;
  clearTimeout(documentPreviewTimer);
  documentPreviewTimer = setTimeout(paintDocumentPreview, 220);
});

window.addEventListener("beforeunload", (e) => {
  if ($("doc-editor").open && editingDocument?.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function sizeApplication() {
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale === 1)
    document.documentElement.style.setProperty(
      "--app-height",
      (viewport?.height || innerHeight) + "px",
    );
  document.documentElement.style.setProperty(
    "--header-height",
    $("site-topbar").getBoundingClientRect().height + "px",
  );
}
new ResizeObserver(sizeApplication).observe($("site-topbar"));
window.visualViewport?.addEventListener("resize", sizeApplication, {
  passive: true,
});
window.addEventListener("resize", sizeApplication, { passive: true });
sizeApplication();
const siteNavigation = $("site-navigation"),
  navToggle = $("toggle-site-nav");
let navigationCollapsed = false;
try {
  navigationCollapsed =
    localStorage.getItem("nupp-navigation-collapsed") === "true";
} catch {}
function setNavigation(open) {
  const mobile = compactLayout.matches,
    collapsed = mobile ? !open : navigationCollapsed;
  document.body.classList.toggle("nav-collapsed", collapsed);
  document.body.classList.toggle("nav-open", mobile && open);
  $("site-nav-scrim").hidden = true;
  navToggle.setAttribute("aria-expanded", String(!collapsed));
  navToggle.setAttribute(
    "aria-label",
    collapsed ? "Expand navigation" : "Collapse navigation",
  );
  navToggle.title = navToggle.getAttribute("aria-label");
  siteNavigation.inert = false;
  siteNavigation.removeAttribute("role");
  siteNavigation.removeAttribute("aria-modal");
}
navToggle.onclick = () => {
  if (compactLayout.matches)
    setNavigation(!document.body.classList.contains("nav-open"));
  else {
    navigationCollapsed = !navigationCollapsed;
    try {
      localStorage.setItem(
        "nupp-navigation-collapsed",
        String(navigationCollapsed),
      );
    } catch {}
    setNavigation(false);
  }
};
$("site-nav-scrim").onclick = () => {
  setNavigation(false);
  navToggle.focus();
};
siteNavigation.addEventListener(
  "click",
  (e) => {
    if (
      !e.target.closest("#toggle-site-nav") &&
      e.target.closest("button,a") &&
      compactLayout.matches
    )
      queueMicrotask(() => setNavigation(false));
  },
  { capture: true },
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setNavigation(false);
      navToggle.focus();
    }
  },
  { capture: true },
);
compactLayout.addEventListener("change", () => setNavigation(false));
$("page-tools").append(document.querySelector(".toolbar"));
setNavigation(false);
if (planSearch) searchPlans();
matchMedia("(min-width:600px)").addEventListener("change", () => {
  if (data && compactLayout.matches && state.view === "tasks") refreshViews();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(proposalTimer);
  else if (
    state.view === "documents" &&
    planSection === "proposals" &&
    !document.body.classList.contains("execution-open") &&
    $("plans-section-content")
  )
    renderProposals($("plans-section-content"));
});

document.addEventListener("keydown", (e) => {
  if (
    !e.target.matches("[data-plan-section]") ||
    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
  )
    return;
  e.preventDefault();
  planSection =
    e.key === "Home"
      ? "library"
      : e.key === "End"
        ? "proposals"
        : planSection === "library"
          ? "proposals"
          : "library";
  renderDocuments();
  document.querySelector("[data-plan-section=" + planSection + "]").focus();
  urlState();
});

document.addEventListener("click", (e) => {
  const menu = document.querySelector(".library-filter-menu[open]");
  if (menu && !menu.contains(e.target)) menu.open = false;
});

document.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-copy-plan]");
  if (!button) return;
  try {
    const doc = await ensureDocument(button.dataset.copyPlan);
    await copyMarkdown(doc.text, button);
  } catch (error) {
    toast(error.message);
  }
});
for (const type of ["selectstart", "dragstart"])
  document.addEventListener(type, (e) => {
    if (
      e.target.closest?.("#graph-stage,.strip-stage,.epic-scroll") &&
      !e.target.closest("input,textarea")
    )
      e.preventDefault();
  });
