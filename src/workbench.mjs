import {
  taskTree,
  nowBoard,
  taskSignals,
  taskIndex,
  taskSession,
  activeRunStates,
  recentLandings,
} from "./workbench-model.mjs";
import { createVirtualList } from "./virtual-list.mjs";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Now keeps one queue on screen at a time. Decisions stay pinned above the
// tabs: a pending question is never hidden behind a tab the operator must find.
// Task / status / owner / next action / blocked by / connections.
const TREE_COLUMNS = 6;
const NOW_TABS = [
  { id: "working", label: "In flight" },
  { id: "ready", label: "Up next" },
  { id: "blocked", label: "Blocked" },
  { id: "review", label: "Review" },
];
export function createWorkbench({
  tasksElement,
  nowElement,
  nowScrollElement = nowElement,
  nowChanged = () => {},
  badge,
  epicName,
  trackName,
  refresh,
  setCount,
  // Attaching an external transcript is Claude-only and needs a host that
  // installs the session picker. Callers without one must not be offered it.
  canLinkSession = false,
  // Defaults match the legacy page, whose cells clamp to two or three lines.
  rowHeights = { group: 52, task: 62, taskWithBlockers: 74 },
}) {
  const prefs = { completed: false, inventory: false, nowTab: "working" };
  try {
    Object.assign(
      prefs,
      JSON.parse(localStorage.getItem("nupp-plans-workbench-v1") || "{}"),
    );
  } catch {}
  if (!NOW_TABS.some((t) => t.id === prefs.nowTab)) prefs.nowTab = "working";
  const expanded = new Map(),
    nowExpanded = new Set(),
    pages = new Map(),
    sessionStates = new Map();
  let current,
    virtual = null,
    treeScroll = 0,
    nowScroll = 0,
    nowPayload = null,
    nowAt = 0,
    nowTimer,
    nowRequest = null,
    requestController;
  const save = () => {
    try {
      localStorage.setItem("nupp-plans-workbench-v1", JSON.stringify(prefs));
    } catch {}
  };
  function groupName(key, group) {
    return group === "epic"
      ? epicName(key)
      : group === "track"
        ? trackName(key)
        : group === "status"
          ? current.data.statuses.find((s) => s.id === key)?.label || key
          : "#" + key;
  }
  function age(value) {
    const seconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(value)) / 1000),
    );
    return !Number.isFinite(seconds)
      ? "No check-in"
      : seconds < 60
        ? "Just now"
        : seconds < 3600
          ? Math.floor(seconds / 60) + "m ago"
          : seconds < 86400
            ? Math.floor(seconds / 3600) + "h ago"
            : Math.floor(seconds / 86400) + "d ago";
  }
  function blockers(task) {
    const signals = taskSignals(current.data, task),
      index = taskIndex(current.data);
    return signals.blockers.length
      ? `<div class="task-blockers"><span>Blocked by</span> ${signals.blockers
          .slice(0, 3)
          .map(
            (id) =>
              `<button data-task="${esc(id)}">${esc(index.tasks.get(id)?.title || id)}</button>`,
          )
          .join(
            "<span> · </span>",
          )}${signals.blockers.length > 3 ? ' <button data-task="' + esc(task.id) + '">+' + (signals.blockers.length - 3) + " more</button>" : ""}</div>`
      : task.status === "blocked"
        ? '<div class="task-blockers unspecified"><span>Blocked · no specific prerequisite recorded</span></div>'
        : "";
  }
  function taskRow(task) {
    const signals = taskSignals(current.data, task),
      owner = task.activity?.owner || task.owner;
    return `<tr class="tree-task" data-workbench-task="${esc(task.id)}"><th class="tree-title-cell" scope="row"><button class="tree-task-open" title="${esc(task.title)}" data-task="${esc(task.id)}"><span class="tree-task-title">${esc(task.title)}</span></button><small title="${esc(task.id)}">${esc(epicName(task.epic))} · ${esc(trackName(task.track))}</small></th><td class="tree-state-cell">${badge(task.status)}${signals.activity === "active" ? '<small class="tree-live">● In flight</small>' : signals.ready ? "<small>Ready</small>" : ""}</td><td class="tree-owner-cell">${esc(owner || "—")}</td><td class="tree-next-cell" title="${esc(task.nextAction || task.summary || "")}">${esc(task.nextAction || task.summary || "—")}</td><td class="tree-blocker-cell">${blockers(task) || '<span class="muted">—</span>'}</td><td class="tree-graph-cell"><button class="tree-graph" data-focus-task="${esc(task.id)}" aria-label="Connections for ${esc(task.title)}" title="Connections">↗</button></td></tr>`;
  }
  function groupRow(row, group) {
    return `<tr class="tree-group-row"><th class="tree-group-cell" colspan="${TREE_COLUMNS}" scope="rowgroup"><button class="tree-group-toggle" data-tree-group="${esc(row.key)}" aria-expanded="${expanded.get(row.key)}"><span class="tree-chevron">${expanded.get(row.key) ? "⌄" : "›"}</span><span><strong>${esc(groupName(row.root.key, group))}</strong><small>${row.root.tasks.length} tasks · ${row.root.complete} / ${row.root.total} complete</small></span><span class="tree-percent">${Math.round((row.root.complete / row.root.total) * 100)}%</span></button></th></tr>`;
  }
  // Windowing reserves each row's height before it is painted, so these must
  // match whatever CSS is in play. The compact single-line table and the
  // legacy page's clamped multi-line rows size differently, so the caller
  // states which it is rather than the two silently drifting apart.
  function taskHeight(task) {
    return taskSignals(current.data, task).blockers.length > 1
      ? rowHeights.taskWithBlockers
      : rowHeights.task;
  }

  function flattened(roots) {
    const rows = [];
    for (const root of roots) {
      const key = current.group + ":" + root.key;
      if (!expanded.has(key))
        expanded.set(
          key,
          Boolean(
            (current.narrow && roots.length < 8) ||
            root.tasks.some((t) => t.id === current.selected),
          ),
        );
      rows.push({
        id: "root:" + key,
        type: "root",
        root,
        key,
        height: rowHeights.group,
      });
      if (expanded.get(key))
        for (const child of root.children) {
          for (const task of child.tasks)
            rows.push({
              id: key + ":" + task.id,
              type: "task",
              task,
              height: taskHeight(task),
            });
        }
    }
    return rows;
  }
  function renderTasks(input) {
    current = { ...input, view: "tasks" };
    clearTimeout(nowTimer);
    const roots = taskTree(input.data, input.rows, {
        ...prefs,
        group: input.group,
      }),
      visible = new Set(roots.flatMap((r) => r.tasks.map((t) => t.id))).size;
    setCount(
      visible.toLocaleString() + " tasks",
      "Groups expand into windowed task rows",
    );
    treeScroll =
      tasksElement.querySelector(".task-tree-window")?.scrollTop ?? treeScroll;
    virtual?.destroy();
    tasksElement.innerHTML = `<div class="workbench-controls"><label><input type="checkbox" aria-label="Show completed tasks" data-workbench-pref="completed" ${prefs.completed ? "checked" : ""}> Completed</label><label><input type="checkbox" aria-label="Include imported tasks" data-workbench-pref="inventory" ${prefs.inventory ? "checked" : ""}> Imported</label><button class="icon-button" data-tree-expand aria-label="Expand all groups" title="Expand all groups"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 6 5 6-5m-12 7 6 5 6-5"/></svg></button><button class="icon-button" data-tree-collapse aria-label="Collapse all groups" title="Collapse all groups"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 11 6-5 6 5m-12 7 6-5 6 5"/></svg></button></div><p class="tree-scroll-heading">${visible.toLocaleString()} tasks · select a task for its plan and evidence.</p><div class="task-tree-window"></div>`;
    const viewport = tasksElement.querySelector(".task-tree-window");
    virtual = createVirtualList(viewport, {
      items: flattened(roots),
      height: (r) => r.height,
      key: (r) => r.id,
      label: "Task tree",
      table: {
        className: "tree-table",
        columns: TREE_COLUMNS,
        head: '<tr class="tree-table-heading"><th scope="col">Task / epic / track</th><th scope="col">Status</th><th scope="col">Owner / agent</th><th scope="col">Next action</th><th scope="col">Blocked by</th><th scope="col"><span class="sr-only">Connections</span></th></tr>',
      },
      render: (r) => (r.type === "task" ? taskRow(r.task) : groupRow(r, input.group)),
    });
    viewport.scrollTop = treeScroll;
  }
  function person(task) {
    return task.activity?.owner || task.owner || "Unassigned";
  }
  // An activity check-in records an owner and a session ID, never an agent
  // brand. The provider is only known once a transcript has been attached, so
  // an unattached worker is described by who reported it.
  function reportedAgent(task) {
    const id = task.activity?.connection?.provider;
    return id ? { claude: "Claude", codex: "Codex" }[id] || id : "";
  }
  function sessionNote(task) {
    if (!nowExpanded.has("session:" + task.id)) return "";
    const state = sessionStates.get(task.id),
      loading = state?.status === "loading",
      agent = reportedAgent(task),
      facts = [
        ["Reported by", person(task)],
        ["Session", task.activity?.sessionId || "Not reported"],
        ...(task.activity?.branch ? [["Branch", task.activity.branch]] : []),
        ...(agent ? [["Agent", agent]] : []),
      ],
      body = loading
        ? ""
        : state?.error
          ? "<p>" + esc(state.error) + "</p>"
          : "<p>This worker reports progress from outside this site’s agent host, so there is no transcript to read here. Updating the direction records it on the task; it does not send the worker a message.</p>" +
            (canLinkSession
              ? ""
              : "<p class=\"hub-session-hint\">Attaching an existing transcript is supported for Claude sessions, through the CLI or MCP.</p>");
    return `<div class="hub-session-note" role="status"><p class="hub-session-title"><strong>${loading ? "Checking connected sessions…" : state?.error ? "Could not check this session" : "External check-in · transcript not connected"}</strong></p>${body}<dl class="hub-session-facts">${facts
      .map(
        ([label, value]) =>
          `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`,
      )
      .join(
        "",
      )}</dl><div class="hub-session-actions">${canLinkSession ? `<button class="button subtle" data-link-session="${esc(task.id)}">Attach Claude transcript</button>` : ""}<button class="text-button" data-reported-close="${esc(task.id)}" aria-label="Close session explanation">Close</button></div></div>`;
  }
  function taskSummary(task, { running = false } = {}) {
    const signals = taskSignals(current.data, task),
      linked = running ? taskSession(nowPayload?.runs || [], task) : null,
      open = linked
        ? 'data-open-run="' + esc(linked.id) + '"'
        : running
          ? 'data-reported-task="' + esc(task.id) + '"'
          : 'data-task="' + esc(task.id) + '"';
    return `<article class="hub-work-row" data-workbench-task="${esc(task.id)}" ${running && !linked ? 'data-reported-task="' + esc(task.id) + '"' : ""}><div class="hub-work-marker ${running ? "is-working" : signals.blockers.length ? "is-blocked" : ""}"></div><div class="hub-work-copy"><button class="hub-task-name" ${open}>${esc(task.title)}</button><p>${esc(running ? task.activity?.summary || task.nextAction || "Work reported" : task.nextAction || task.summary || "Open the task for context.")}</p>${blockers(task)}<small>${esc(person(task))} · ${esc(epicName(task.epic))}${task.activity ? " · " + age(task.activity.heartbeatAt) : ""}${running && !linked ? " · External check-in" : ""}</small>${running && !linked ? sessionNote(task) : ""}</div><div class="hub-row-actions">${linked ? '<button class="button subtle" data-open-run="' + esc(linked.id) + '">Open session</button>' : '<button class="button subtle" data-edit="' + esc(task.id) + '">Update direction</button>'}${signals.blockers.length ? '<button class="text-button" data-ask-task="' + esc(task.id) + '">Help unblock</button>' : ""}<button class="text-button" data-task="${esc(task.id)}">Details ↗</button></div></article>`;
  }
  function runSummary(run) {
    const task = run.taskId
        ? taskIndex(current.data).tasks.get(run.taskId)
        : null,
      title = task?.title || run.title || run.taskId || "Untitled session",
      direction = task?.nextAction || task?.summary,
      state =
        run.state === "starting"
          ? "Connecting to the agent…"
          : run.state === "waiting-approval"
            ? "Waiting for approval"
            : run.state === "waiting-input"
              ? "Waiting for your answer"
              : "Agent is working",
      metadata = [
        run.provider || "Agent",
        run.model,
        run.projectId,
        age(run.lastObservedAt || run.updatedAt || run.createdAt),
      ].filter(Boolean);
    return `<article class="hub-work-row hub-session-row" data-open-run="${esc(run.id)}"><div class="hub-work-marker is-working" aria-label="Active session"></div><div class="hub-work-copy"><button class="hub-task-name" data-open-run="${esc(run.id)}">${esc(title)}</button><p><strong>${esc(state)}</strong>${direction ? " · " + esc(direction) : " · Live transcript and message queue"}</p><small>${esc(metadata.join(" · "))}${task ? " · Working on " + esc(task.id) : ""}</small></div><div class="hub-row-actions"><button class="button" data-open-run="${esc(run.id)}">Open session</button>${task ? '<button class="text-button" data-task="' + esc(task.id) + '">Task ↗</button>' : ""}</div></article>`;
  }
  function completedRunSummary(run) {
    const task = run.taskId
        ? taskIndex(current.data).tasks.get(run.taskId)
        : null,
      title = task?.title || run.title || run.taskId || "Completed session",
      metadata = [
        run.provider || "Agent",
        run.model,
        run.projectId,
        "Completed " + age(run.updatedAt || run.lastObservedAt || run.createdAt),
      ].filter(Boolean);
    return `<article class="hub-work-row hub-session-row is-complete" data-open-run="${esc(run.id)}"><div class="hub-work-marker is-complete" aria-label="Completed session">✓</div><div class="hub-work-copy"><button class="hub-task-name" data-open-run="${esc(run.id)}">${esc(title)}</button><p>Session completed${task?.nextAction ? " · " + esc(task.nextAction) : " · Transcript and results are available"}</p><small>${esc(metadata.join(" · "))}${task ? " · " + esc(task.id) : ""}</small></div><div class="hub-row-actions"><button class="button subtle" data-open-run="${esc(run.id)}">Open session</button>${task ? '<button class="text-button" data-task="' + esc(task.id) + '">Task ↗</button>' : ""}</div></article>`;
  }
  async function openReportedSession(id) {
    if (!current || current.view !== "now") return;
    const task = taskIndex(current.data).tasks.get(id);
    if (!task) return;
    // A second click on an open entry closes it, the same as its Close button.
    if (nowExpanded.has("session:" + id)) {
      nowExpanded.delete("session:" + id);
      sessionStates.delete(id);
      paintNow();
      return;
    }
    const linked = taskSession(nowPayload?.runs || [], task);
    if (linked) {
      window.dispatchEvent(
        new CustomEvent("nupp-open-session", {
          detail: { id: linked.id, steer: false },
        }),
      );
      return;
    }
    const saved = sessionStates.get(id);
    if (
      saved?.sessionId === task.activity?.sessionId &&
      saved.status === "loading"
    )
      return;
    sessionStates.set(id, {
      sessionId: task.activity?.sessionId,
      status: "loading",
    });
    nowExpanded.add("session:" + id);
    paintNow();
    try {
      const r = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "task.sessions", input: { id } }),
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error || "Sessions unavailable. Try again.");
      const run = taskSession(body.result || [], task);
      sessionStates.set(id, {
        sessionId: task.activity?.sessionId,
        status: run ? "connected" : "external",
      });
      if (current?.view !== "now") return;
      if (run)
        window.dispatchEvent(
          new CustomEvent("nupp-open-session", {
            detail: { id: run.id, steer: false },
          }),
        );
      else paintNow();
    } catch (error) {
      sessionStates.set(id, {
        sessionId: task.activity?.sessionId,
        status: "error",
        error: error.message,
      });
      paintNow();
    }
  }
  const conversations = () =>
    (nowPayload?.runs || [])
      .filter((r) => r.state === "completed" && r.mode === "ask")
      .slice(0, 4);
  const conversationSummary = (r) =>
    `<button class="hub-conversation" data-open-run="${esc(r.id)}">${esc(r.title || r.taskId)}<span>Open chat →</span></button>`;
  function paged(tasks, key, render, size = 8) {
    const page = Math.min(
        pages.get(key) || 0,
        Math.max(0, Math.ceil(tasks.length / size) - 1),
      ),
      start = page * size;
    return (
      tasks
        .slice(start, start + size)
        .map(render)
        .join("") +
      (tasks.length > size
        ? `<div class="list-pager"><button class="button subtle" data-now-page="${key}" data-page="${Math.max(0, page - 1)}" ${page === 0 ? "disabled" : ""}>Previous</button><small>${start + 1}–${Math.min(tasks.length, start + size)} of ${tasks.length}</small><button class="button subtle" data-now-page="${key}" data-page="${page + 1}" ${start + size >= tasks.length ? "disabled" : ""}>Next</button></div>`
        : "")
    );
  }
  function fold(key, title, tasks, render) {
    return `<details class="hub-fold" data-now-fold="${key}" ${nowExpanded.has(key) ? "open" : ""}><summary>${title}<span>${tasks.length}</span></summary><div>${nowExpanded.has(key) ? paged(tasks, key, render) : ""}</div></details>`;
  }
  function selectNowTab(id, { focus = false } = {}) {
    if (!NOW_TABS.some((t) => t.id === id)) return;
    if (prefs.nowTab !== id) {
      prefs.nowTab = id;
      save();
    }
    paintNow();
    const button = nowElement.querySelector('[data-now-tab="' + id + '"]');
    if (focus) button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function paintNow() {
    if (!current || current.view !== "now" || nowScrollElement.hidden) return;
    const { data, rows } = current,
      lanes = nowBoard(data, rows, prefs),
      w = nowPayload || { runs: [], requests: [], integrations: [] },
      active = w.runs.filter((r) => activeRunStates.has(r.state)),
      completed = w.runs
        .filter((r) => r.state === "completed")
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.lastObservedAt || b.createdAt || 0) -
            new Date(a.updatedAt || a.lastObservedAt || a.createdAt || 0),
        )
        .slice(0, 6),
      external = lanes.reported.filter((t) => !taskSession(active, t)),
      requests = w.requests || [],
      ready = [...lanes.ready].sort(
        (a, b) =>
          taskSignals(data, b).dependents.length -
          taskSignals(data, a).dependents.length,
      ),
      inProgress = active.length + external.length,
      landings = recentLandings(data, rows, w.recentIntegrations || []);
    setCount(
      inProgress + " in flight",
      requests.length ? requests.length + " waiting for you" : "",
    );
    nowScroll = nowScrollElement.scrollTop;
    nowChanged({ runs: w.runs, landings });
    const counts = {
        working: inProgress,
        ready: ready.length,
        blocked: lanes.blocked.length,
        review: lanes.attention.length,
      },
      tab = NOW_TABS.some((t) => t.id === prefs.nowTab)
        ? prefs.nowTab
        : "working",
      panel =
        tab === "ready"
          ? `<div class="section-heading"><h2>Up next</h2><span>Ready work with the most dependent tasks first</span></div>${paged(ready, "ready", (t) => taskSummary(t)) || '<p class="hub-empty">No matching tasks are ready.</p>'}`
          : tab === "blocked"
            ? `<div class="section-heading"><h2>Blocked work</h2><button class="button primary" data-ask-blockers>Ask about blockers</button></div>${paged(lanes.blocked, "blocked", (t) => taskSummary(t)) || '<p class="hub-empty">Nothing matching is blocked.</p>'}`
            : tab === "review"
              ? `<div class="section-heading"><h2>Check-ins &amp; context to review</h2><span>Reported progress and changed plan prose</span></div>${paged(lanes.attention, "checkins", (t) => taskSummary(t)) || '<p class="hub-empty">Nothing is waiting on a review.</p>'}${fold("completed", "Recently updated completed work", lanes.completed, (t) => taskSummary(t))}${conversations().length ? fold("conversations", "Recent conversations", conversations(), conversationSummary) : ""}`
              : `<div class="section-heading"><h2>In flight</h2><span>${nowPayload ? "Updated " + age(new Date(nowAt).toISOString()) : "Loading connected sessions…"}</span></div>${active.map(runSummary).join("")}${paged(external, "working", (t) => taskSummary(t, { running: true }))}${!inProgress ? '<p class="hub-empty">No work is currently reported. Unreported external work may still be running.</p>' : ""}${completed.length ? `<div class="hub-completed-sessions"><div class="section-heading"><h2>Recently completed</h2><span>Latest finished sessions</span></div>${completed.map(completedRunSummary).join("")}</div>` : ""}`;
    nowElement.innerHTML = `<section class="hub-section hub-decisions" id="hub-decisions" ${requests.length || (w.integrations || []).length ? "" : "hidden"}>${requests.length ? `<div class="section-heading"><h2>Needs your input</h2><span>${requests.length} pending</span></div>` : ""}${
      requests.length
        ? requests
            .slice(0, 12)
            .map((q) => {
              const run = w.runs.find((r) => r.id === q.runId);
              return `<article class="hub-decision"><div><small>${q.kind === "input" ? "Question" : "Approval"} · ${esc(run?.provider || "Agent")}</small><h3>${esc(run?.title || q.method)}</h3><p>${q.kind === "input" ? "The agent needs an answer to continue." : "Review the requested action before the agent continues."}</p></div><button class="button primary" data-open-run="${esc(q.runId)}">Review & respond</button></article>`;
            })
            .join("")
        : ""
    }${(w.integrations || []).length ? `<button class="hub-integration-link" data-open-integration>${w.integrations.length} validated ${w.integrations.length === 1 ? "branch is" : "branches are"} ready to review and integrate →</button>` : ""}</section>
 <div class="hub-tabs" role="tablist" aria-label="Work queues">${NOW_TABS.map((t) => `<button role="tab" id="hub-tab-${t.id}" data-now-tab="${t.id}" aria-controls="hub-panel" aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}">${t.label}<span>${counts[t.id]}</span></button>`).join("")}</div>
 <section class="hub-section hub-panel" id="hub-panel" role="tabpanel" aria-labelledby="hub-tab-${tab}" tabindex="-1">${panel}</section>`;
    nowScrollElement.scrollTop = nowScroll;
  }
  async function updateNow() {
    if (
      nowRequest ||
      current?.view !== "now" ||
      nowScrollElement.hidden ||
      document.hidden
    )
      return;
    requestController = new AbortController();
    nowRequest = fetch("/api/workspace", { signal: requestController.signal })
      .then((r) => {
        if (!r.ok) throw Error("Sessions unavailable");
        return r.json();
      })
      .then((w) => {
        nowPayload = w;
        nowAt = Date.now();
        paintNow();
      })
      .catch(() => {})
      .finally(() => {
        nowRequest = null;
        clearTimeout(nowTimer);
        if (current?.view === "now" && !document.hidden)
          nowTimer = setTimeout(updateNow, 10000);
      });
    return nowRequest;
  }
  function renderNow(input) {
    virtual?.destroy();
    virtual = null;
    current = { ...input, view: "now" };
    paintNow();
    if (Date.now() - nowAt > 5000) updateNow();
  }
  tasksElement.addEventListener("click", (e) => {
    const group = e.target.closest("[data-tree-group]");
    if (group) {
      const key = group.dataset.treeGroup;
      expanded.set(key, !expanded.get(key));
      refresh();
    }
    if (
      e.target.closest("[data-tree-expand]") ||
      e.target.closest("[data-tree-collapse]")
    ) {
      const open = Boolean(e.target.closest("[data-tree-expand]"));
      for (const root of taskTree(current.data, current.rows, {
        ...prefs,
        group: current.group,
      }))
        expanded.set(current.group + ":" + root.key, open);
      refresh();
    }
  });
  for (const el of [tasksElement, nowElement])
    el.addEventListener("change", (e) => {
      if (e.target.dataset.workbenchPref) {
        prefs[e.target.dataset.workbenchPref] = e.target.checked;
        save();
        refresh();
      }
    });
  nowElement.addEventListener(
    "toggle",
    (e) => {
      const key = e.target.dataset.nowFold;
      if (!key || !e.target.isConnected) return;
      if (e.target.open) nowExpanded.add(key);
      else nowExpanded.delete(key);
      const tasks =
        key === "conversations"
          ? conversations()
          : nowBoard(current.data, current.rows, prefs)[key];
      e.target.querySelector("div").innerHTML = e.target.open
        ? paged(
            tasks,
            key,
            key === "conversations"
              ? conversationSummary
              : (t) => taskSummary(t),
          )
        : "";
    },
    true,
  );
  nowElement.addEventListener("keydown", (e) => {
    const tab = e.target.closest("[data-now-tab]");
    if (!tab) return;
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : e.key === "Home"
            ? -NOW_TABS.length
            : e.key === "End"
              ? NOW_TABS.length
              : 0;
    if (!step) return;
    e.preventDefault();
    const at = NOW_TABS.findIndex((t) => t.id === tab.dataset.nowTab);
    selectNowTab(
      NOW_TABS[Math.max(0, Math.min(NOW_TABS.length - 1, at + step))].id,
      { focus: true },
    );
  });
  nowElement.addEventListener("click", (e) => {
    const link = e.target.closest("[data-link-session]");
    if (link) {
      window.dispatchEvent(
        new CustomEvent("nupp-link-session", {
          detail: { taskId: link.dataset.linkSession },
        }),
      );
      return;
    }
    const open = e.target.closest("[data-open-run]"),
      reported = e.target.closest("[data-reported-task]"),
      close = e.target.closest("[data-reported-close]"),
      page = e.target.closest("[data-now-page]"),
      pick = e.target.closest("[data-now-tab]");
    if (close) {
      nowExpanded.delete("session:" + close.dataset.reportedClose);
      paintNow();
    } else if (
      reported &&
      !e.target.closest("[data-task],[data-edit],.hub-session-note")
    )
      openReportedSession(reported.dataset.reportedTask);
    if (open)
      window.dispatchEvent(
        new CustomEvent("nupp-open-session", {
          detail: { id: open.dataset.openRun, steer: false },
        }),
      );
    if (page) {
      pages.set(page.dataset.nowPage, Number(page.dataset.page));
      paintNow();
    }
    if (pick) selectNowTab(pick.dataset.nowTab);
    const ask = e.target.closest("[data-ask-task]");
    if (ask)
      window.dispatchEvent(
        new CustomEvent("nupp-ask-context", {
          detail: {
            taskId: ask.dataset.askTask,
            prompt:
              "What blocks this task, and do you need a decision from me?",
          },
        }),
      );
    if (e.target.closest("[data-ask-blockers]"))
      window.dispatchEvent(
        new CustomEvent("nupp-ask-context", {
          detail: {
            prompt:
              "What tasks are blocked and do I need to weigh in to unblock them?",
          },
        }),
      );
    if (e.target.closest("[data-open-integration]"))
      window.dispatchEvent(new CustomEvent("nupp-open-integration"));
  });
  return {
    renderTasks,
    renderNow,
    select(id) {
      if (current) current.selected = id;
      for (const row of document.querySelectorAll("[data-workbench-task]"))
        row.classList.toggle("selected", row.dataset.workbenchTask === id);
    },
    suspend() {
      if (current?.view === "tasks")
        treeScroll =
          tasksElement.querySelector(".task-tree-window")?.scrollTop ||
          treeScroll;
      virtual?.destroy();
      virtual = null;
      clearTimeout(nowTimer);
      requestController?.abort();
      current = null;
      tasksElement.replaceChildren();
      nowElement.replaceChildren();
    },
  };
}
