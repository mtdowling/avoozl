import { taskSession, conversationSignal } from "/workbench-model.mjs";
import { randomUUID } from "/task-identity.mjs";
import { installSessionLinks } from "./session-links.mjs";
import { renderUsage } from "/usage-charts.mjs";
import { renderMarkdown, copyMarkdown, copyIcon } from "/markdown.mjs";
function chatMarkdown(text) {
  return renderMarkdown(text, undefined, {
    rewriteHref(href) {
      try {
        const url = new URL(href, location.origin);
        if (
          ["127.0.0.1", "localhost"].includes(url.hostname) &&
          url.pathname === "/" &&
          (url.searchParams.has("view") ||
            url.searchParams.has("visualization"))
        )
          return url.pathname + url.search + url.hash;
      } catch {}
      return href;
    },
  });
}
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const activeStates = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);
const button = document.createElement("button");
button.id = "open-workspace";
button.title = "Steer";
button.setAttribute("aria-label", "Steer");
button.innerHTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v12H9l-5 4z"/></svg><span class="nav-label">Steer</span>';
document.querySelector("#nav [data-view=tasks]").after(button);
const shell = document.createElement("section");
shell.id = "execution-workspace";
shell.hidden = true;
shell.setAttribute("aria-label", "Planning and agent workspace");
shell.innerHTML = `<aside class="execution-nav"><div><span class="eyebrow">AVOOZL</span><h2>From intent<br>to delivery.</h2><p id="execution-mode"></p></div><nav aria-label="Workspace sections">${[
  ["sessions", "Agent sessions"],
  ["metrics", "Usage trends"],
]
  .map(([id, label]) => `<button data-workspace-tab="${id}">${label}</button>`)
  .join(
    "",
  )}</nav><button id="close-workspace" class="button subtle">← Back to views</button></aside><div class="execution-body"><header class="execution-heading"><button id="back-to-plans" class="button subtle" hidden>← Plans</button><h1 id="workspace-heading">Agent sessions</h1><span id="workspace-health" role="status"></span></header><form id="intent-form" class="intent-composer" hidden><div class="intent-tabs" role="tablist" aria-label="Start work"><button type="button" role="tab" data-intent-tab="ask">Ask</button><button type="button" role="tab" data-intent-tab="draft">Plan</button><button type="button" role="tab" data-intent-tab="task">Task</button></div><label for="intent-prompt" id="intent-label"></label><textarea id="intent-prompt" rows="3" required maxlength="20000"></textarea><p id="intent-guide"></p><div id="intent-context" class="intent-context"></div><select id="intent-action" hidden><option value="task">Task</option><option value="draft">Plan</option><option value="ask">Ask</option><option value="run">Implement</option></select><div class="intent-controls"><label id="intent-start-label" class="intent-start"><input id="intent-start" type="checkbox"> Start an agent for this task</label><button type="button" class="button subtle" data-agent-settings id="open-agent-settings">Agent settings</button><button class="button primary" type="submit">Add task</button></div><p id="intent-feedback" role="status"></p></form><div id="execution-content"></div></div><div id="execution-toast" role="status" hidden></div>`;
document.body.append(shell);
const usageButton = document.createElement("button");
usageButton.id = "open-usage";
usageButton.title = "Usage trends";
usageButton.setAttribute("aria-label", "Usage trends");
usageButton.innerHTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3v17h17M8 16V9m5 7V5m5 11v-5"/></svg><span class="nav-label">Usage trends</span>';
document.getElementById("nav")?.append(usageButton);
const settings = document.createElement("dialog");
settings.id = "agent-settings";
settings.setAttribute("aria-labelledby", "agent-settings-title");
settings.innerHTML =
  '<header class="dialog-heading"><h2 id="agent-settings-title">Agent settings</h2><button class="button" id="close-agent-settings" aria-label="Close agent settings">×</button></header><label>Agent<select id="intent-provider"><option value="codex">Codex</option><option value="claude">Claude</option></select></label><label>Model<select id="intent-model" aria-label="Model"><option value="">Provider default</option></select></label><label>Project<select id="intent-project"></select></label><label>Approvals<select id="intent-approvals"><option value="automatic">Automatic review</option><option value="manual">Ask when needed</option></select></label><p>Automatic review handles routine tool permissions. Questions and plan approval still come to you.</p>';
document.body.append(settings);
const $ = (id) => document.getElementById(id),
  sessionKey = "nupp-workspace-session-v2";
let workspace = null,
  tab = "sessions",
  contextSelection = "",
  planDraft = null,
  currentRun = null,
  eventSource = null,
  events = [],
  lastEvent = 0,
  refreshTimer,
  renderTimer,
  controller,
  busy = false,
  historyMode = false,
  hasEarlier = false,
  pendingSubmission = null,
  sessionOffset = 0,
  showArchived = false,
  sessionListVersion = 0,
  runList = [],
  runTotal = 0,
  chatDraft = "",
  deliveryMode = "queue",
  messageSubmissionId = randomUUID();
let defaultApprovalMode = "automatic";
try {
  const saved = localStorage.getItem("nupp-agent-approvals");
  if (["automatic", "manual"].includes(saved)) defaultApprovalMode = saved;
} catch {}
$("intent-approvals").value = defaultApprovalMode;
const selectedModels = {},
  intentDrafts = {},
  messageCache = new Map();
let intent = "task",
  modelCatalogProvider = "",
  modelRequest = 0;
const historyWidthKey = "nupp-workspace-history-width";
let historyWidth = 220,
  runRequest = 0,
  resizeHistory = null;
try {
  const saved = Number(localStorage.getItem(historyWidthKey));
  if (saved >= 150 && saved <= 520) historyWidth = saved;
} catch {}
function setHistoryWidth(width, { save = false } = {}) {
  const layout = shell.querySelector(".sessions-layout");
  if (!layout) return;
  const max = Math.max(
    150,
    Math.min(520, window.innerWidth <= 900 ? 520 : layout.clientWidth - 340),
  );
  historyWidth = Math.round(Math.max(150, Math.min(max, width)));
  layout.style.setProperty("--session-history-width", historyWidth + "px");
  const separator = layout.querySelector(".session-resizer");
  separator?.setAttribute("aria-valuenow", String(historyWidth));
  separator?.setAttribute("aria-valuemax", String(max));
  if (save)
    try {
      localStorage.setItem(historyWidthKey, String(historyWidth));
    } catch {}
}
shell.addEventListener("pointerdown", (e) => {
  const separator = e.target.closest(".session-resizer");
  if (!separator || e.button !== 0) return;
  e.preventDefault();
  resizeHistory = {
    id: e.pointerId,
    x: e.clientX,
    width: shell.querySelector(".session-history").getBoundingClientRect()
      .width,
  };
  separator.setPointerCapture(e.pointerId);
  shell.classList.add("resizing-history");
});
shell.addEventListener("pointermove", (e) => {
  if (resizeHistory?.id === e.pointerId)
    setHistoryWidth(resizeHistory.width + e.clientX - resizeHistory.x);
});
function finishHistoryResize(e) {
  if (resizeHistory?.id !== e.pointerId) return;
  resizeHistory = null;
  shell.classList.remove("resizing-history");
  setHistoryWidth(historyWidth, { save: true });
}
shell.addEventListener("pointerup", finishHistoryResize);
shell.addEventListener("pointercancel", finishHistoryResize);
shell.addEventListener("lostpointercapture", finishHistoryResize);
shell.addEventListener("keydown", (e) => {
  if (!e.target.matches(".session-resizer")) return;
  const step = e.shiftKey ? 50 : 10;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  setHistoryWidth(
    e.key === "Home"
      ? 150
      : e.key === "End"
        ? 520
        : historyWidth + (e.key === "ArrowLeft" ? -step : step),
    { save: true },
  );
});
window.addEventListener("resize", () => {
  if (!shell.hidden && tab === "sessions" && window.innerWidth > 900)
    setHistoryWidth(historyWidth);
});
let recovered = {};
try {
  recovered = JSON.parse(
    sessionStorage.getItem(sessionKey) ||
      sessionStorage.getItem("nupp-workspace-session-v1") ||
      "{}",
  );
} catch {}
showArchived = recovered.archived === true;
const labels = {
  review: "Review plan",
  sessions: "Agent sessions",
  integration: "Integration",
  metrics: "Usage trends",
};
const intentModes = {
  ask: {
    label: "Ask about the plan",
    placeholder: "What would you like to understand or explore?",
    guide: "Opens a conversation with the context of your current view.",
    submit: "Ask agent",
  },
  draft: {
    label: "Describe a plan",
    placeholder:
      "What should we build? Include scope, constraints, or what success looks like.",
    guide: "Develop a proposal in chat, then review and approve the plan.",
    submit: "Draft plan",
  },
  task: {
    label: "Describe a task",
    placeholder: "What should change? What will count as done?",
    guide: "Your current selection and filters are included automatically.",
    submit: "Add task",
  },
};
function context() {
  const p = new URLSearchParams(location.search);
  return {
    view: p.get("view") || "strip",
    filters: Object.fromEntries(
      ["scope", "q", "status", "activity", "epic", "track", "tag"].map((k) => [
        k,
        p.get(k) || "",
      ]),
    ),
    selected: contextSelection || p.get("node") || "",
    document: p.get("document") || "",
    visualization: p.get("visualization") || "",
    url: location.pathname + location.search,
    revision: workspace?.revision,
  };
}
function remember() {
  if ($("run-message")) chatDraft = $("run-message").value;
  intentDrafts[intent] = $("intent-prompt").value;
  const value = {
    open: !shell.hidden,
    tab,
    archived: showArchived,
    intent,
    action: intent,
    prompt: $("intent-prompt").value,
    drafts: intentDrafts,
    models: selectedModels,
    provider: $("intent-provider").value,
    project: $("intent-project").value,
    contextSelection,
    runId: currentRun?.id,
    message: chatDraft,
    messageSubmissionId,
    pendingSubmission,
  };
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify(value));
    sessionStorage.setItem("nupp-workspace-session-v1", JSON.stringify(value));
  } catch {}
}
function note(text) {
  $("execution-toast").textContent = text;
  $("execution-toast").hidden = false;
  clearTimeout(note.timer);
  note.timer = setTimeout(() => ($("execution-toast").hidden = true), 5000);
}
async function call(operation, input = {}, expectedRevision) {
  const r = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, input, expectedRevision }),
  });
  const b = await r.json();
  if (!r.ok) {
    const e = Error(b.error || "Request failed");
    e.status = r.status;
    throw e;
  }
  if (workspace) workspace.revision = b.revision;
  return b.result;
}
function status(value) {
  return `<span class="execution-badge state-${esc(value)}">${esc(String(value || "").replaceAll("-", " "))}</span>`;
}
function taskLink(id, label = id) {
  return `<a data-open-task="${esc(id)}" href="/?view=tasks&scope=all&node=${encodeURIComponent(id)}">${esc(label)}</a>`;
}
function duration(ms) {
  if (ms == null) return "Not reported";
  return ms < 60000
    ? Math.round(ms / 1000) + "s"
    : ms < 3600000
      ? (ms / 60000).toFixed(1) + "m"
      : (ms / 3600000).toFixed(1) + "h";
}
function updateAgentLabel() {
  const provider = $("intent-provider").value,
    model =
      selectedModels[provider] || $("intent-model").value || "Default model";
  for (const b of shell.querySelectorAll("[data-agent-settings]")) {
    if (currentRun && b.classList.contains("chat-model")) {
      b.textContent = currentRun.provider === "claude" ? "✳" : "n";
      b.title =
        currentRun.provider +
        " · " +
        (currentRun.actualModel || currentRun.model || "Default model");
      b.setAttribute("aria-label", "Agent settings: " + b.title);
      continue;
    }
    b.textContent = b.classList.contains("chat-model")
      ? provider === "claude"
        ? "✳"
        : "n"
      : provider[0].toUpperCase() + provider.slice(1) + " · " + model + " ▾";
    b.title = provider + " · " + model;
    b.setAttribute("aria-label", "Agent settings: " + b.title);
  }
}
function syncIntent() {
  const key = intent === "run" ? "task" : intent,
    mode = intentModes[key] || intentModes.task;
  $("intent-action").value = intent;
  for (const b of shell.querySelectorAll("[data-intent-tab]")) {
    const selected = b.dataset.intentTab === key;
    b.setAttribute("aria-selected", String(selected));
    b.tabIndex = selected ? 0 : -1;
  }
  $("intent-label").textContent = mode.label;
  $("intent-prompt").placeholder = mode.placeholder;
  $("intent-guide").textContent = mode.guide;
  $("intent-start-label").hidden = key !== "task";
  $("intent-start").checked = intent === "run";
  $("open-agent-settings").hidden = intent === "task";
  $("intent-form").querySelector("[type=submit]").textContent =
    intent === "run" ? "Start task" : mode.submit;
  updateAgentLabel();
}
function setIntent(next, { keep = false } = {}) {
  intentDrafts[intent] = $("intent-prompt").value;
  intent = next;
  if (!keep) $("intent-prompt").value = intentDrafts[next] || "";
  syncIntent();
  remember();
}
async function loadModels() {
  const provider = $("intent-provider").value,
    request = ++modelRequest,
    field = $("intent-model");
  field.disabled = true;
  field.innerHTML = "<option>Loading models…</option>";
  try {
    const result = await call("models", { provider });
    if (request !== modelRequest) return;
    field.innerHTML =
      '<option value="">Provider default</option>' +
      result.models
        .map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`)
        .join("");
    field.value = selectedModels[provider] || "";
    modelCatalogProvider = provider;
  } catch (e) {
    if (request === modelRequest)
      field.innerHTML =
        '<option value="">Default · catalog unavailable</option>';
    note(e.message);
  } finally {
    if (request === modelRequest) {
      field.disabled = false;
      updateAgentLabel();
    }
  }
}
async function openSettings() {
  settings.showModal();
  if (modelCatalogProvider !== $("intent-provider").value) await loadModels();
}
$("close-agent-settings").onclick = () => {
  settings.close();
  remember();
};
settings.onchange = async (e) => {
  if (e.target.id === "intent-provider") await loadModels();
  if (e.target.id === "intent-approvals") {
    defaultApprovalMode = e.target.value;
    try {
      localStorage.setItem("nupp-agent-approvals", defaultApprovalMode);
    } catch {}
  }
  if (e.target.id === "intent-model")
    selectedModels[$("intent-provider").value] = e.target.value;
  updateAgentLabel();
  remember();
};
async function refresh({ paint = true } = {}) {
  if (shell.hidden || document.hidden) return;
  controller?.abort();
  controller = new AbortController();
  try {
    const r = await fetch("/api/workspace", { signal: controller.signal });
    if (!r.ok) throw Error("Workspace unavailable");
    workspace = await r.json();
    $("execution-mode").textContent = "SQLite workspace";
    $("workspace-health").textContent =
      workspace.agentHost?.connected === false
        ? "Reconnecting to agent host…"
        : "Connected";
    const project = $("intent-project"),
      chosen = project.value;
    project.innerHTML =
      workspace.projects
        .map((p) => `<option value="${esc(p.id)}">${esc(p.id)}</option>`)
        .join("") || '<option value="">Configure a project</option>';
    if (workspace.projects.some((p) => p.id === chosen)) project.value = chosen;
    const c = context();
    $("intent-context").textContent = c.selected
      ? "Task: " + c.selected
      : c.document
        ? "Document: " + c.document
        : "Context: " + c.view;
    if (
      paint &&
      !busy &&
      !planDraft &&
      $("intent-form").hidden &&
      !settings.open
    ) {
      if (tab === "sessions") {
        await refreshSessionList();
        if (currentRun) await loadRun(currentRun.id, { full: false });
      } else if (
        !document.activeElement?.matches(
          "#execution-content input,#execution-content textarea,#execution-content select",
        )
      )
        await render();
    }
  } catch (e) {
    if (e.name !== "AbortError") $("workspace-health").textContent = e.message;
  } finally {
    clearTimeout(refreshTimer);
    if (!shell.hidden && !document.hidden)
      refreshTimer = setTimeout(() => refresh(), 10000);
  }
}
function stopEvents() {
  eventSource?.close();
  eventSource = null;
  clearTimeout(renderTimer);
  renderTimer = null;
}
function receive(event) {
  if (event.kind === "server.draining") {
    $("workspace-health").textContent = "Reconnecting · agents keep running";
    return;
  }
  if (!currentRun || event.seq <= lastEvent) return;
  lastEvent = event.seq;
  if (!historyMode) {
    events.push(event);
    if (events.length > 500) events.splice(0, events.length - 500);
  } else $("chat-new-messages")?.removeAttribute("hidden");
  if (event.kind === "state" && event.state) {
    currentRun.state = event.state;
    paintRunControls();
  }
  if (
    [
      "state",
      "session",
      "delivery.updated",
      "request.created",
      "request.answered",
      "turn.completed",
      "run.failed",
      "disconnected",
    ].includes(event.kind)
  )
    loadRun(currentRun.id, { full: false }).catch((e) => note(e.message));
  if (!renderTimer)
    renderTimer = setTimeout(() => {
      renderTimer = null;
      paintMessages();
    }, 100);
}
function streamRun(id) {
  stopEvents();
  if (currentRun?.external || document.hidden || shell.hidden) return;
  const source = new EventSource(
    "/api/events?compact=true&run=" +
      encodeURIComponent(id) +
      "&after=" +
      lastEvent,
  );
  eventSource = source;
  source.onmessage = (e) => {
    if (currentRun?.id === id && eventSource === source)
      receive(JSON.parse(e.data));
  };
  source.onopen = () => {
    if (eventSource === source) $("workspace-health").textContent = "Connected";
  };
  source.onerror = () => {
    if (eventSource === source)
      $("workspace-health").textContent = "Reconnecting…";
  };
}
async function open() {
  shell.hidden = false;
  document.body.classList.add("execution-open");
  window.dispatchEvent(new Event("nupp-workspace-navigation"));
  await refresh({ paint: false });
  if (workspace) await render();
  syncIntent();
  remember();
}
function close() {
  remember();
  runRequest++;
  shell.hidden = true;
  document.body.classList.remove("execution-open");
  window.dispatchEvent(new Event("nupp-workspace-navigation"));
  clearTimeout(refreshTimer);
  stopEvents();
  controller?.abort();
  remember();
}
button.onclick = async (e) => {
  e.stopImmediatePropagation();
  if (planDraft?.dirty && !confirm("Leave this unsaved plan draft?")) return;
  tab = "sessions";
  planDraft = null;
  await open();
};
$("close-workspace").onclick = close;
usageButton.onclick = async (e) => {
  e.stopImmediatePropagation();
  if (planDraft?.dirty && !confirm("Leave this unsaved plan draft?")) return;
  tab = "metrics";
  planDraft = null;
  currentRun = null;
  await open();
};
function leaveView(e) {
  if (!e.target.closest("[data-view],[data-mobile-view]")) return;
  if (planDraft?.dirty && !confirm("Leave this unsaved plan draft?")) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  close();
}
document
  .querySelector("#nav")
  .addEventListener("click", leaveView, { capture: true });
async function switchTab(next) {
  if (planDraft?.dirty && !confirm("Leave this unsaved plan draft?")) return;
  remember();
  runRequest++;
  stopEvents();
  planDraft = null;
  currentRun = null;
  tab = next;
  await render();
  remember();
}
async function render() {
  shell.dataset.tab = tab;
  $("intent-form").hidden = true;
  $("back-to-plans").hidden = tab !== "review";
  $("workspace-heading").textContent = labels[tab];
  shell.classList.toggle("chat-mode", tab === "sessions");
  shell.classList.toggle("plan-mode", tab === "review");
  window.dispatchEvent(new Event("nupp-workspace-navigation"));
  shell
    .querySelectorAll("[data-workspace-tab]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.workspaceTab === tab),
    );
  syncIntent();
  const target = $("execution-content");
  if (tab === "sessions") {
    renderSessions();
    await refreshSessionList();
    if (currentRun) await loadRun(currentRun.id);
    else renderEmptyChat();
    return;
  }
  if (tab === "integration") {
    target.innerHTML = `<section class="execution-card"><h2>Ready to integrate</h2><p>Reviewed commits are rebased, checked again, then fast-forwarded.</p>${workspace.integrations.map((i) => `<article class="execution-row"><div>${taskLink(i.taskId)}<small>${esc(i.branch)} · ${esc(i.commit.slice(0, 12))}</small></div><button class="button primary" data-integrate="${esc(i.id)}" data-head="${esc(i.commit)}">Revalidate & merge</button></article>`).join("") || "<p>No branches are waiting.</p>"}</section>`;
    return;
  }
  if (tab === "metrics") {
    target.innerHTML =
      '<section class="usage-heading"><p>Agent activity and reported usage over time.</p><div><label>Period <select id="usage-days"><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><label>Agent <select id="usage-provider"><option value="">All agents</option><option value="codex">Codex</option><option value="claude">Claude</option></select></label></div></section><div id="usage-charts"></div>';
    await loadUsage();
    return;
  }
}
async function loadUsage() {
  const result = await call("metrics", {
    groupBy: "provider",
    days: Number($("usage-days").value),
    provider: $("usage-provider").value || undefined,
  });
  if ($("usage-charts")) $("usage-charts").innerHTML = renderUsage(result);
}
function usageRows(r) {
  return (
    r.groups
      .slice(0, 100)
      .map(
        (g) =>
          `<article class="execution-row"><div><b>${esc(g.key)}</b><small>${Number(g.inputTokens || 0).toLocaleString()} input · ${Number(g.outputTokens || 0).toLocaleString()} output · ${g.costCoverage}</small></div><strong>${g.estimatedCostUsd == null ? "Cost unreported" : "$" + g.estimatedCostUsd.toFixed(4)}</strong></article>`,
      )
      .join("") || "<p>No usage has been reported.</p>"
  );
}
function pager(kind, offset, limit, total) {
  return total > limit
    ? `<div class="list-pager"><button class="button subtle" data-page="${kind}" data-offset="${Math.max(0, offset - limit)}" ${offset === 0 ? "disabled" : ""}>Previous</button><span>${offset + 1}–${Math.min(total, offset + limit)} of ${total}</span><button class="button subtle" data-page="${kind}" data-offset="${offset + limit}" ${offset + limit >= total ? "disabled" : ""}>Next</button></div>`
    : "";
}
function renderSessions() {
  shell.dataset.tab = "sessions";
  shell.classList.remove("reading-history");
  $("back-to-plans").hidden = true;
  shell.classList.remove("plan-mode");
  window.dispatchEvent(new Event("nupp-workspace-navigation"));
  $("intent-form").hidden = true;
  shell.classList.add("chat-mode");
  $("workspace-heading").textContent = "Agent sessions";
  shell
    .querySelectorAll("[data-workspace-tab]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.workspaceTab === "sessions"),
    );
  const old = $("run-message");
  if (old) chatDraft = old.value;
  $("execution-content").innerHTML =
    '<div class="sessions-layout"><button class="session-history-toggle" data-toggle-history aria-expanded="false" aria-controls="session-history" aria-label="Show conversations" title="Show conversations">☰</button><aside id="session-history" class="session-history" aria-label="Conversations"><div class="section-heading"><h2 id="conversation-list-title">Conversations</h2><div class="session-list-actions"><button id="toggle-archived" type="button" class="session-icon" aria-label="Show archived conversations" title="Show archived conversations" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18v4H3zM5 8v12h14V8m-10 4h6"/></svg></button><button class="button subtle" data-new-chat aria-label="New conversation" title="New conversation">＋</button></div></div><div id="session-workers"></div><div id="session-list"></div></aside><div class="session-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize conversation list" aria-controls="session-history chat-pane" aria-valuemin="150" aria-valuemax="520" aria-valuenow="220" title="Drag to resize conversations. Arrow keys resize; Home and End use the limits."></div><section id="chat-pane" class="chat-pane" aria-label="Agent chat"></section></div>';
  setHistoryWidth(historyWidth);
  setConversationHistory(!matchMedia("(max-width:900px)").matches);
}
const seenReplies = new Map();
try {
  for (const pair of JSON.parse(
    localStorage.getItem("nupp-seen-replies") || "[]",
  ))
    seenReplies.set(...pair);
} catch {}
function sessionIcon(run) {
  const signal = conversationSignal(run, seenReplies.get(run.id)),
    paths = {
      external:
        '<path d="M6 10 10 6M6 4l1-1a3 3 0 0 1 4 4l-1 1m0 4-1 1a3 3 0 0 1-4-4l1-1"/>',
      working: '<circle cx="8" cy="8" r="5" stroke-dasharray="22 10"/>',
      input: '<path d="m8 1 7 7-7 7-7-7zM8 5v4m0 2v1"/>',
      approval: '<path d="M8 1 14 4v5c0 3-6 6-6 6S2 12 2 9V4z"/>',
      unread: '<circle cx="8" cy="8" r="4" fill="currentColor" stroke="none"/>',
      failed: '<circle cx="8" cy="8" r="6"/><path d="m6 6 4 4m0-4-4 4"/>',
      disconnected:
        '<path d="m2 2 12 12M5 3a6 6 0 0 1 8 8M11 13A6 6 0 0 1 3 5"/>',
      read: '<path d="m3 8 3 3 7-7"/>',
      stopped: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    };
  return (
    '<span class="session-signal signal-' +
    signal.kind +
    '" title="' +
    esc(signal.label) +
    '" role="img" aria-label="' +
    esc(signal.label) +
    '"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">' +
    paths[signal.kind] +
    "</svg></span>"
  );
}
function markReplyRead() {
  const log = $("run-transcript");
  if (
    !currentRun ||
    currentRun.state !== "completed" ||
    shell.hidden ||
    document.hidden ||
    historyMode ||
    !log ||
    log.scrollHeight - log.scrollTop - log.clientHeight > 60
  )
    return;
  const stamp = currentRun.updatedAt || currentRun.createdAt;
  if (!stamp || seenReplies.get(currentRun.id) === stamp) return;
  seenReplies.delete(currentRun.id);
  seenReplies.set(currentRun.id, stamp);
  while (seenReplies.size > 1000)
    seenReplies.delete(seenReplies.keys().next().value);
  try {
    localStorage.setItem("nupp-seen-replies", JSON.stringify([...seenReplies]));
  } catch {}
  const row = [...shell.querySelectorAll("[data-run]")].find(
      (b) => b.dataset.run === currentRun.id,
    ),
    icon = row?.querySelector(".session-signal");
  if (icon) icon.outerHTML = sessionIcon(currentRun);
}
function archiveButton(run, className = "session-icon") {
  const archived = Boolean(run.archivedAt),
    label = archived ? "Restore conversation" : "Archive conversation",
    path = archived
      ? "M3 4h18v4H3zM5 8v12h14V8m-7 9v-6m-3 3 3-3 3 3"
      : "M3 4h18v4H3zM5 8v12h14V8m-7 3v6m-3-3 3 3 3-3";
  return (
    '<button type="button" class="' +
    className +
    '" data-archive-run="' +
    esc(run.id) +
    '" data-archived="' +
    archived +
    '" aria-label="' +
    label +
    '" title="' +
    label +
    '"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    path +
    '"/></svg></button>'
  );
}
async function refreshSessionList() {
  if (tab !== "sessions" || !$("session-list")) return;
  const version = ++sessionListVersion,
    archived = showArchived,
    [page, workers] = await Promise.all([
      call("run.list", { offset: sessionOffset, limit: 24, archived }),
      call("query", { scope: "all", activity: "active" }),
    ]);
  if (
    version !== sessionListVersion ||
    tab !== "sessions" ||
    !$("session-list") ||
    archived !== showArchived
  )
    return;
  if (page.total && page.offset >= page.total) {
    sessionOffset = Math.floor((page.total - 1) / 24) * 24;
    return refreshSessionList();
  }
  runList = page.items;
  runTotal = page.total;
  $("conversation-list-title").textContent = archived
    ? "Archived"
    : "Conversations";
  const toggle = $("toggle-archived"),
    label = archived ? "Show conversations" : "Show archived conversations";
  toggle.setAttribute("aria-pressed", String(archived));
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
  const unlinked = workers.filter(
    (t) => !taskSession([...workspace.runs, ...page.items], t),
  );
  $("session-workers").innerHTML =
    !archived && unlinked.length
      ? '<details class="attach-workers"><summary>Unlinked work (' +
        unlinked.length +
        ")</summary>" +
        unlinked
          .slice(0, 40)
          .map(
            (t) =>
              '<button class="session-item" data-attach-task="' +
              esc(t.id) +
              '"><span>' +
              esc(t.title) +
              "</span><small>" +
              esc(t.activity?.owner || t.owner || "External worker") +
              " · Attach transcript</small></button>",
          )
          .join("") +
        "</details>"
      : "";
  $("session-list").innerHTML =
    runList
      .map(
        (r) =>
          '<div class="session-row"><button class="session-item ' +
          (currentRun?.id === r.id ? "selected" : "") +
          '" data-run="' +
          esc(r.id) +
          '" title="' +
          esc(r.title || r.taskId) +
          '">' +
          sessionIcon(r) +
          "<span>" +
          esc(r.title || r.taskId) +
          "</span></button>" +
          archiveButton(r, "session-icon session-archive") +
          "</div>",
      )
      .join("") ||
    '<p class="muted">' +
      (archived
        ? "No archived conversations."
        : "Your conversations appear here.") +
      "</p>";
  $("session-list").insertAdjacentHTML(
    "beforeend",
    pager("sessions", page.offset, page.limit, page.total),
  );
}

function composer() {
  if (currentRun?.external)
    return '<div class="chat-composer external-transcript-note"><span title="Send messages and approvals in the original Claude session.">Read-only Claude transcript</span><button type="button" class="chat-info" data-session-details title="Session details and actions" aria-label="Session details and actions"><svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M10 9v5m0-9v1"/></svg></button></div>';
  return `<form id="run-message-form" class="chat-composer"><label class="sr-only" for="run-message">Message the agent</label><textarea id="run-message" wrap="soft" rows="1" maxlength="20000" required placeholder="Reply, ask a question, or give direction…">${esc(chatDraft)}</textarea><div class="chat-composer-controls"><button type="button" class="chat-model" data-agent-settings>Agent settings</button><span class="chat-delivery">${currentRun?.provider === "codex" && activeStates.has(currentRun?.state) ? `<label><input type="checkbox" id="steer-message" ${deliveryMode === "steer" ? "checked" : ""}> Steer this turn</label>` : currentRun && activeStates.has(currentRun.state) ? "Queue after this turn" : ""}</span><button type="button" class="button subtle" data-chat-stop ${!currentRun || !activeStates.has(currentRun.state) ? "hidden" : ""}>Stop</button>${currentRun ? '<button type="button" class="chat-info" data-session-details title="Session details and actions" aria-label="Session details and actions"><svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M10 9v5m0-9v1"/></svg></button>' : ""}<button class="chat-send" type="submit" aria-label="Send message">↑</button></div><p id="chat-feedback" role="status"></p></form>`;
}
function renderEmptyChat() {
  currentRun = null;
  historyMode = false;
  $("chat-pane").innerHTML =
    `<header class="chat-heading empty-chat-heading"><h2>New conversation</h2></header><div class="chat-welcome"><span class="chat-avatar">n</span><h2>What would you like to explore?</h2><p>Ask about progress, blockers, or the plan. Questions stay conversations.</p><button class="chat-suggestion" data-question="What tasks are blocked and do I need to weigh in to unblock them?">What’s blocked, and where do you need me?</button></div>${composer()}`;
  updateAgentLabel();
  sizeComposer();
}
function setConversationHistory(open) {
  const layout = shell.querySelector(".sessions-layout");
  if (!layout) return;
  const mobile = matchMedia("(max-width:900px)").matches;
  layout.classList.toggle("history-open", mobile && open);
  layout.classList.toggle("history-collapsed", !mobile && !open);
  const toggle = layout.querySelector("[data-toggle-history]");
  toggle?.setAttribute("aria-expanded", String(open));
  if (toggle) {
    toggle.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v12H9l-5 4zM8 8h8m-8 4h6"/></svg>';
    toggle.title = open ? "Hide conversations" : "Show conversations";
    toggle.setAttribute("aria-label", toggle.title);
  }
  const pane = layout.querySelector(".chat-pane");
  if (pane) pane.inert = open && matchMedia("(max-width:900px)").matches;
}
function renderChatFrame(run) {
  $("chat-pane").innerHTML =
    `<header class="chat-heading"><div><h2>${esc(run.title || run.prompt?.split("\n")[0] || "Conversation")}</h2><small id="chat-status" role="status"></small></div><details class="chat-options" ><summary aria-label="Conversation options">⋯</summary><div class="chat-options-menu">${run.external ? "" : `<select data-run-approvals aria-label="Session approvals"><option value="automatic" ${(run.approvalMode || "manual") === "automatic" ? "selected" : ""}>Automatic review</option><option value="manual" ${(run.approvalMode || "manual") === "manual" ? "selected" : ""}>Ask when needed</option></select>`}<div class="chat-option-actions"><button type="button" class="session-icon" data-new-chat aria-label="New conversation" title="New conversation"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg></button>${archiveButton(run)}<button type="button" class="session-icon" data-delete-run="${esc(run.id)}" aria-label="Delete conversation" title="Delete conversation"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></div></div></details></header><div id="run-transcript" class="chat-log" aria-label="Agent conversation" role="log"><div id="chat-history-controls"></div><div id="chat-messages"></div><div id="chat-progress" role="status"></div></div><div id="run-requests"></div><button id="chat-new-messages" class="button subtle" hidden>New messages · Jump to latest ↓</button>${composer()}<dialog id="chat-details" class="chat-details-dialog" aria-label="Session details and actions"><header class="dialog-heading"><h2>Session details</h2><button type="button" data-close-session-details aria-label="Close session details">×</button></header><p>${esc(run.provider)} · ${esc(run.actualModel || run.model || "Default model")}<br><code>${esc(run.id)}</code></p><p>${esc(run.worktree || "Connecting…")}</p><div id="run-actions"></div><div id="run-deliveries"></div></dialog>`;
  updateAgentLabel();
  sizeComposer();
}
async function loadRun(id, { full = true, before } = {}) {
  if (currentRun?.external && currentRun.id === id && !full) {
    if (historyMode) return;
    full = true;
  }
  const request = ++runRequest,
    same = currentRun?.id === id,
    r = await call("run.get", {
      id,
      compact: true,
      limit: 200,
      ...(before ? { before } : !full && same ? { after: lastEvent } : {}),
    });
  if (request !== runRequest || tab !== "sessions" || shell.hidden) return;
  currentRun = r;
  if (r.external && full) messageCache.clear();
  if (!same || full) {
    historyMode = Boolean(before);
    events = r.events;
    hasEarlier = r.hasEarlier;
    lastEvent = Math.max(lastEvent, ...events.map((e) => e.seq));
    if (!same) {
      lastEvent = events.at(-1)?.seq || 0;
      chatDraft = "";
      messageCache.clear();
    }
    if (!$("chat-messages") || !same) renderChatFrame(r);
    paintMessages();
    streamRun(id);
  } else {
    for (const e of r.events) if (e.seq > lastEvent) receive(e);
    paintMessages();
  }
  paintRunControls();
  if (!same) await refreshSessionList();
  remember();
}
function requestQuestions(q) {
  return (
    q.payload?.questions ||
    q.payload?.params?.questions ||
    q.payload?.input?.questions ||
    []
  );
}
function requestMarkup(q) {
  const questions = requestQuestions(q),
    input = q.payload?.input || q.payload?.params || q.payload || {},
    command =
      input.command ||
      input.command_line ||
      input.file_path ||
      input.path ||
      "";
  return `<article class="chat-request" data-request="${esc(q.id)}"><strong>${q.kind === "input" ? "The agent has a question" : "Your approval is needed"}</strong>${questions.length ? questions.map((question, i) => `<fieldset data-question-index="${i}"><legend>${esc(question.question || question.header || "Question")}</legend>${(question.options || []).map((o, j) => `<label class="request-option"><input type="radio" name="answer-${esc(q.id)}-${i}" value="${esc(o.label || o)}"><span>${esc(o.label || o)}${o.description ? "<small>" + esc(o.description) + "</small>" : ""}</span></label>`).join("")}<input data-free-answer="${i}" placeholder="${question.options?.length ? "Or type your response…" : "Your response…"}" aria-label="${esc(question.question || "Your response")}"></fieldset>`).join("") : `<p>${esc(q.method || "Agent request")}</p>${command ? "<pre>" + esc(String(command).slice(0, 6000)) + "</pre>" : ""}`}<details><summary>Request details</summary><pre>${esc(JSON.stringify(q.payload, null, 2).slice(0, 16000))}</pre></details><div class="intent-controls"><button class="button primary" data-answer="${esc(q.id)}" data-decision="allow">${q.kind === "input" ? "Send answer" : "Allow"}</button><button class="button subtle" data-answer="${esc(q.id)}" data-decision="deny">Decline</button></div></article>`;
}
function paintRunControls() {
  const r = currentRun;
  if (r)
    for (const button of shell.querySelectorAll(
      ".chat-options [data-archive-run]",
    ))
      if (button.dataset.archived !== String(Boolean(r.archivedAt)))
        button.outerHTML = archiveButton(r);
  if (!r || !$("chat-status")) return;
  const label = {
    starting: "Connecting to " + r.provider + "…",
    running: "Responding…",
    "waiting-input": "Waiting for your answer",
    "waiting-approval": "Waiting for your approval",
    completed: "",
    disconnected: "Disconnected · your conversation is saved",
    failed:
      typeof r.error === "string"
        ? r.error
        : r.error?.message || "The agent could not finish",
    interrupted: "Stopped",
  };
  $("chat-status").dataset.state = r.state;
  $("chat-status").title = r.external
    ? "External Claude transcript"
    : (label[r.state] ?? r.state);
  $("chat-status").textContent = r.external
    ? "External Claude transcript · updates every 10 seconds"
    : (label[r.state] ?? r.state) +
      (r.approvalNotice ? " · " + r.approvalNotice : "");
  const requests = r.requests || [],
    key = JSON.stringify(requests);
  if ($("run-requests").dataset.key !== key) {
    $("run-requests").dataset.key = key;
    $("run-requests").innerHTML = requests.map(requestMarkup).join("");
  }
  $("run-actions").innerHTML =
    `${r.state === "disconnected" ? '<button class="button" data-resume="' + esc(r.id) + '">Resume saved session</button>' : ""}${r.mode === "implement" && ["completed", "failed", "interrupted"].includes(r.state) ? '<button class="button" data-validate="' + esc(r.id) + '">Run acceptance checks</button>' : ""}<button class="button subtle" data-handoff="${esc(r.id)}">Download handoff</button>${r.mode === "plan" ? '<button class="button" data-adopt-plan="' + esc(r.planId) + '">Review as plan draft</button>' : ""}`;
  $("run-deliveries").innerHTML = (r.deliveries || [])
    .slice(-20)
    .map(
      (d) =>
        `<p>${esc(d.state)} · ${esc(d.text.slice(0, 120))}${d.error ? " · " + esc(d.error) : ""}</p>`,
    )
    .join("");
  const delivery = shell.querySelector(".chat-delivery"),
    deliveryKey = r.provider + ":" + activeStates.has(r.state);
  if (delivery && delivery.dataset.key !== deliveryKey) {
    delivery.dataset.key = deliveryKey;
    delivery.innerHTML = activeStates.has(r.state)
      ? r.provider === "codex"
        ? '<label><input type="checkbox" id="steer-message" ' +
          (deliveryMode === "steer" ? "checked" : "") +
          "> Steer this turn</label>"
        : "Queue after this turn"
      : "";
  }
  const stop = shell.querySelector("[data-chat-stop]");
  if (stop) stop.hidden = !activeStates.has(r.state);
  const progress = $("chat-progress");
  if (progress)
    progress.innerHTML = ["starting", "running"].includes(r.state)
      ? '<span class="chat-thinking" role="img" aria-label="Agent working"><i></i><i></i><i></i></span>'
      : "";
}
function messageCopy(key) {
  return (
    '<footer class="chat-message-actions"><button type="button" class="copy-markdown" data-copy-message="' +
    esc(key) +
    '" aria-label="Copy message Markdown" title="Copy message Markdown">' +
    copyIcon +
    "</button></footer>"
  );
}
function messageMarkup(event) {
  if (messageCache.has(event.seq)) return messageCache.get(event.seq);
  const text = event.text || "";
  if (currentRun.external) {
    const tools = (event.tools || [])
      .map(
        (t, i) =>
          `<details class="chat-tools external-tool-message" data-tool-event="${event.seq}:${i}" data-loaded="true"><summary>${esc(t.tool)}</summary><pre>${esc(t.text)}</pre></details>`,
      )
      .join("");
    if (!text.trim()) return tools;
    if (text.trimStart().startsWith("<task-notification>"))
      return `<details class="chat-tools external-tool-message" data-tool-event="${event.seq}:notification" data-loaded="true"><summary>Background task update</summary><pre>${esc(text)}</pre></details>`;
    const html = `<article class="chat-message ${event.role === "user" ? "user" : "assistant"}">${event.role === "user" ? "" : '<span class="chat-avatar">✳</span>'}<div class="chat-prose">${event.role === "user" ? esc(text).replaceAll("\n", "<br>") : chatMarkdown(text)}${tools}</div>${messageCopy(event.seq)}</article>`;
    messageCache.set(event.seq, html);
    if (messageCache.size > 160)
      messageCache.delete(messageCache.keys().next().value);
    return html;
  }
  const html = `<article class="chat-message assistant"><span class="chat-avatar">${currentRun.provider === "claude" ? "✳" : "n"}</span><div class="chat-prose">${chatMarkdown(text.slice(0, 60000))}${text.length > 60000 ? '<p class="muted">Long response; download the handoff to inspect the complete record.</p>' : ""}</div>${messageCopy(event.seq)}</article>`;
  messageCache.set(event.seq, html);
  if (messageCache.size > 160)
    messageCache.delete(messageCache.keys().next().value);
  return html;
}
function paintMessages() {
  const target = $("chat-messages"),
    log = $("run-transcript");
  if (!target || !currentRun) return;
  const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
  let html = "",
    stream = "",
    tools = [];
  const flushTools = () => {
    if (tools.length) {
      html += `<details class="chat-tools"><summary>${tools.length} tool ${tools.length === 1 ? "activity" : "activities"}</summary>${tools
        .slice(-20)
        .map(
          (e) =>
            `<details data-tool-event="${e.seq}"><summary>${esc(e.tool || "Tool activity")}</summary><pre class="muted">Open to load details</pre></details>`,
        )
        .join("")}</details>`;
      tools = [];
    }
  };
  if (!hasEarlier && !currentRun.external)
    html += `<article class="chat-message user"><div>${esc(currentRun.prompt || "").replaceAll("\n", "<br>")}</div>${messageCopy("prompt")}</article>`;
  for (const e of events) {
    if (e.kind === "message.delta")
      stream = (stream + (e.text || "")).slice(-60000);
    else if (e.kind === "message") {
      stream = "";
      flushTools();
      html += messageMarkup(e);
    } else if (e.kind === "delivery.queued") {
      flushTools();
      html += `<article class="chat-message user"><div>${esc(e.delivery.text).replaceAll("\n", "<br>")}<small>${esc((currentRun.deliveries || []).find((d) => d.id === e.delivery.id)?.state || e.delivery.state || "queued")}</small></div>${messageCopy(e.seq)}</article>`;
    } else if (e.kind === "tool.activity") tools.push(e);
    else if (
      ["run.failed", "provider.error", "disconnected"].includes(e.kind)
    ) {
      flushTools();
      html += `<p class="chat-error">${esc(e.message || e.kind)}</p>`;
    }
  }
  flushTools();
  if (stream)
    html += `<article class="chat-message assistant streaming"><span class="chat-avatar">${currentRun.provider === "claude" ? "✳" : "n"}</span><div class="chat-prose">${chatMarkdown(stream)}</div>${messageCopy("stream")}</article>`;
  const opened = new Set(
    [...target.querySelectorAll("details[open]")].map(
      (el) => el.dataset.toolEvent || el.querySelector("summary")?.textContent,
    ),
  );
  target.innerHTML = html;
  for (const el of target.querySelectorAll("details"))
    if (
      opened.has(
        el.dataset.toolEvent || el.querySelector("summary")?.textContent,
      )
    )
      el.open = true;
  $("chat-history-controls").innerHTML = hasEarlier
    ? '<button class="button subtle" data-earlier>Load earlier messages ↑</button>'
    : "";
  paintRunControls();
  if (nearEnd && !historyMode) log.scrollTop = log.scrollHeight;
  updateReadingMode();
  markReplyRead();
}
function pendingChat(prompt) {
  currentRun = {
    id: pendingSubmission.input.runId,
    title: prompt.split("\n")[0],
    prompt,
    provider: pendingSubmission.input.provider,
    mode: pendingSubmission.input.action === "draft" ? "plan" : "ask",
    state: "starting",
    requests: [],
    deliveries: [],
  };
  historyMode = false;
  hasEarlier = false;
  events = [];
  lastEvent = 0;
  renderChatFrame(currentRun);
  paintMessages();
}
async function submitIntent(action, prompt) {
  if (busy) return;
  busy = true;
  const payload = {
      action,
      prompt,
      provider: action === "task" ? undefined : $("intent-provider").value,
      projectId: $("intent-project").value || undefined,
      model: selectedModels[$("intent-provider").value] || undefined,
      approvalMode: defaultApprovalMode,
    },
    key = JSON.stringify(payload);
  if (!pendingSubmission || pendingSubmission.key !== key) {
    const submissionId = randomUUID();
    pendingSubmission = {
      key,
      input: {
        ...payload,
        submissionId,
        runId: "run-" + submissionId,
        context: context(),
      },
    };
  }
  if (
    action === "ask" ||
    action === "run" ||
    (action === "draft" && payload.provider && payload.projectId)
  ) {
    tab = "sessions";
    planDraft = null;
    currentRun = null;
    renderSessions();
    pendingChat(prompt);
    refreshSessionList();
  }
  remember();
  try {
    const result = await call("intent.submit", pendingSubmission.input);
    if (result.pending) {
      $("chat-status").textContent = "Connecting · submission saved";
      return;
    }
    pendingSubmission = null;
    intentDrafts[intent] = "";
    $("intent-prompt").value = "";
    chatDraft = "";
    if ($("run-message")) $("run-message").value = "";
    if (result.run) {
      tab = "sessions";
      currentRun = null;
      if (!$("chat-pane")) renderSessions();
      await loadRun(result.run.id);
    } else if (result.plan) {
      tab = "review";
      await loadPlan(result.plan.id);
    } else if (result.task) {
      note("Task added");
      close();
      window.dispatchEvent(
        new CustomEvent("nupp-show-task", { detail: { id: result.task.id } }),
      );
    }
    remember();
  } catch (e) {
    const feedback = $("chat-feedback") || $("intent-feedback");
    feedback.textContent = e.message;
    if ($("chat-status")) $("chat-status").textContent = "Could not connect";
    if ($("run-actions"))
      $("run-actions").innerHTML =
        '<button class="button" data-retry-submission>Retry this submission</button>';
    if (pendingSubmission?.input.runId) {
      try {
        const existing = await call("run.get", {
          id: pendingSubmission.input.runId,
          compact: true,
        });
        if (existing.prompt === prompt) {
          pendingSubmission = null;
          currentRun = null;
          await loadRun(existing.id);
        }
      } catch {}
    }
    remember();
  } finally {
    busy = false;
  }
}
async function loadPlan(id) {
  shell.dataset.tab = "review";
  stopEvents();
  currentRun = null;
  const p = await call("plan.get", { id });
  if (p.kind === "conversation") {
    const run = runList.find((r) => r.planId === id);
    if (run) {
      tab = "sessions";
      renderSessions();
      await loadRun(run.id);
    }
    return;
  }
  planDraft = { ...p, dirty: false };
  tab = "review";
  $("back-to-plans").hidden = false;
  shell.classList.add("plan-mode");
  window.dispatchEvent(new Event("nupp-workspace-navigation"));
  $("intent-form").hidden = true;
  shell.classList.remove("chat-mode");
  $("workspace-heading").textContent = "Review plan";
  $("execution-content").innerHTML =
    `<section class="execution-card plan-review"><div class="section-heading"><h2>${esc(p.title)}</h2><button type="button" class="copy-markdown" data-copy-draft aria-label="Copy plan Markdown" title="Copy plan Markdown">${copyIcon}</button>${status(p.state)}${p.state !== "approved" ? '<button class="button subtle" data-delete-plan="' + esc(p.id) + '">Delete draft</button>' : ""}</div><p>Review this proposal. Saving preserves a revision; approving creates its tasks.</p><div class="plan-editor-grid"><label>Markdown<textarea id="plan-source" rows="24" spellcheck="false">${esc(p.text)}</textarea></label><section class="plan-preview doc-content" id="plan-live-preview" aria-label="Plan preview">${chatMarkdown(p.text.slice(0, 50000))}</section></div><div class="intent-controls"><button id="save-draft" class="button">Save revision</button><button id="draft-with-agent" class="button">Develop in chat</button><button class="button subtle" data-agent-settings>Agent settings</button>${p.state === "approved" ? '<button id="execute-approved-plan" class="button">Execute approved tasks</button>' : ""}<button id="approve-draft" class="button primary">Approve this revision & create tasks</button></div><p id="plan-feedback" role="status"></p><details><summary>Approval history</summary>${p.approvals.map((a) => `<p>${esc(a.approvedBy)} · ${esc(a.at)}<br>${esc(a.evidence)}</p>`).join("") || "<p>Not approved.</p>"}</details></section>`;
}
$("intent-form").onsubmit = (e) => {
  e.preventDefault();
  submitIntent(intent, $("intent-prompt").value);
};
shell.addEventListener("submit", async (e) => {
  if (e.target.id === "run-message-form") {
    e.preventDefault();
    const text = $("run-message").value.trim();
    if (!text) return;
    if (!currentRun) {
      await submitIntent("ask", text);
      return;
    }
    const messageKey = currentRun.id + "\0" + text;
    if (messageSubmissionId.key !== messageKey)
      messageSubmissionId = { id: randomUUID(), key: messageKey };
    const submit = e.target.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      const receipt = await call("run.send", {
        id: currentRun.id,
        text,
        mode: $("steer-message")?.checked ? "steer" : "queue",
        submissionId:
          typeof messageSubmissionId === "string"
            ? messageSubmissionId
            : messageSubmissionId.id,
      });
      if (["uncertain", "awaiting-resume"].includes(receipt.state)) {
        await loadRun(currentRun.id, { full: false });
        throw Error(
          "Message saved, but delivery is " +
            receipt.state +
            ". Inspect session details before retrying.",
        );
      }
      messageSubmissionId = randomUUID();
      chatDraft = "";
      $("run-message").value = "";
      await loadRun(currentRun.id, { full: false });
      remember();
    } catch (error) {
      $("chat-feedback").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }
  if (e.target.id === "project-form") {
    e.preventDefault();
    try {
      const f = e.target.elements;
      await call("project.configure", {
        id: f.id.value,
        root: f.root.value,
        baseBranch: f.baseBranch.value,
        worktreeRoot: f.worktreeRoot.value || undefined,
        checks: JSON.parse(f.checks.value),
      });
      await refresh();
      note("Project saved");
    } catch (error) {
      note(error.message);
    }
  }
});
shell.addEventListener("input", (e) => {
  if (e.target.id === "plan-source" && planDraft) {
    planDraft.dirty = true;
    clearTimeout(planPreviewTimer);
    planPreviewTimer = setTimeout(() => {
      if ($("plan-live-preview"))
        $("plan-live-preview").innerHTML = chatMarkdown(
          e.target.value.slice(0, 50000),
        );
    }, 220);
  }
  if (e.target.id === "run-message") {
    chatDraft = e.target.value;
    sizeComposer();
  }
  clearTimeout(remember.timer);
  remember.timer = setTimeout(remember, 180);
});
shell.addEventListener("keydown", (e) => {
  if (
    e.target.id === "run-message" &&
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.isComposing
  ) {
    e.preventDefault();
    $("run-message-form").requestSubmit();
  }
  const t = e.target.closest("[data-intent-tab]");
  if (t && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    const tabs = [...shell.querySelectorAll("[data-intent-tab]")],
      i = tabs.indexOf(t),
      next = tabs[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3];
    setIntent(next.dataset.intentTab);
    next.focus();
  }
});
shell.addEventListener("change", async (e) => {
  if (e.target.id === "steer-message") {
    deliveryMode = e.target.checked ? "steer" : "queue";
    remember();
  }
  if (e.target.id === "intent-start")
    setIntent(e.target.checked ? "run" : "task", { keep: true });
  if (["usage-days", "usage-provider"].includes(e.target.id)) {
    await loadUsage();
    return;
  }
  if (e.target.id === "metrics-group")
    try {
      $("metrics-groups").innerHTML = usageRows(
        await call("metrics", { groupBy: e.target.value }),
      );
    } catch (error) {
      note(error.message);
    }
});
shell.addEventListener(
  "toggle",
  async (e) => {
    const d = e.target;
    if (!d.open || !d.dataset.toolEvent || d.dataset.loaded) return;
    try {
      const value = await call("run.event", {
        id: currentRun.id,
        seq: Number(d.dataset.toolEvent),
      });
      d.querySelector("pre").textContent = JSON.stringify(value, null, 2).slice(
        0,
        24000,
      );
      d.dataset.loaded = "true";
    } catch (error) {
      d.querySelector("pre").textContent = error.message;
    }
  },
  true,
);
shell.addEventListener("click", async (e) => {
  const link = e.target.closest("[data-open-task]");
  if (link) {
    e.preventDefault();
    close();
    window.dispatchEvent(
      new CustomEvent("nupp-show-task", {
        detail: { id: link.dataset.openTask },
      }),
    );
    return;
  }
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.hasAttribute("data-copy-draft")) {
      await copyMarkdown($("plan-source").value, b);
      return;
    }
    if (b.dataset.copyMessage !== undefined) {
      const key = b.dataset.copyMessage,
        event = events.find((e) => String(e.seq) === key);
      let text =
        key === "prompt"
          ? currentRun.prompt
          : (event?.text ?? event?.delivery?.text);
      if (key === "stream") {
        text = "";
        for (const e of events)
          if (e.kind === "message.delta") text += e.text || "";
          else if (e.kind === "message") text = "";
      }
      if (text === undefined)
        throw Error("Message is no longer in the loaded history.");
      await copyMarkdown(text, b);
      return;
    }
    if (b.id === "toggle-archived") {
      showArchived = !showArchived;
      sessionOffset = 0;
      await refreshSessionList();
      remember();
      return;
    }
    if (b.dataset.archiveRun) {
      b.disabled = true;
      const result = await call(
        b.dataset.archived === "true" ? "run.unarchive" : "run.archive",
        { id: b.dataset.archiveRun },
      );
      if (currentRun?.id === result.id) {
        currentRun.archivedAt = result.archivedAt;
        paintRunControls();
      }
      await refreshSessionList();
      note(
        result.archivedAt ? "Conversation archived" : "Conversation restored",
      );
      remember();
      return;
    }
    if (b.hasAttribute("data-session-details")) {
      $("chat-details")?.showModal();
      return;
    }
    if (b.hasAttribute("data-close-session-details")) {
      $("chat-details")?.close();
      return;
    }
    if (b.id === "back-to-plans") {
      if (planDraft?.dirty && !confirm("Leave this unsaved plan draft?"))
        return;
      planDraft = null;
      close();
      window.dispatchEvent(
        new CustomEvent("nupp-show-view", {
          detail: { view: "documents", planSection: "proposals" },
        }),
      );
      return;
    }
    if (b.dataset.workspaceTab) {
      await switchTab(b.dataset.workspaceTab);
      return;
    }
    if (b.dataset.intentTab) {
      setIntent(b.dataset.intentTab);
      return;
    }
    if (b.hasAttribute("data-agent-settings")) {
      await openSettings();
      return;
    }
    if (b.hasAttribute("data-toggle-history")) {
      setConversationHistory(
        matchMedia("(max-width:900px)").matches
          ? !shell
              .querySelector(".sessions-layout")
              .classList.contains("history-open")
          : shell
              .querySelector(".sessions-layout")
              .classList.contains("history-collapsed"),
      );
      if (
        shell
          .querySelector(".sessions-layout")
          .classList.contains("history-open")
      )
        shell.querySelector(".session-item")?.focus();
      return;
    }
    if (b.dataset.attachTask) {
      window.dispatchEvent(
        new CustomEvent("nupp-link-session", {
          detail: { taskId: b.dataset.attachTask },
        }),
      );
      return;
    }
    if (b.dataset.run) {
      if (matchMedia("(max-width:900px)").matches)
        setConversationHistory(false);
      stopEvents();
      planDraft = null;
      currentRun = null;
      tab = "sessions";
      $("intent-form").hidden = true;
      shell.classList.add("chat-mode");
      $("workspace-heading").textContent = "Agent sessions";
      if (!$("chat-pane")) renderSessions();
      await loadRun(b.dataset.run);
      return;
    }
    if (b.hasAttribute("data-new-chat")) {
      showArchived = false;
      sessionOffset = 0;
      await switchTab("sessions");
      chatDraft = "";
      renderEmptyChat();
      $("run-message").focus();
      return;
    }
    if (b.dataset.question) {
      await submitIntent("ask", b.dataset.question);
      return;
    }
    if (b.dataset.newIntent) {
      await switchTab("sessions");
      setIntent(b.dataset.newIntent);
      $("intent-form").hidden = false;
      $("intent-prompt").focus();
      return;
    }
    if (b.dataset.useTask) {
      contextSelection = b.dataset.useTask;
      setIntent("run");
      $("intent-prompt").value =
        "Implement " +
        b.dataset.useTask +
        " according to its plan and acceptance criteria.";
      $("intent-prompt").focus();
      return;
    }
    if (b.dataset.askBlocker) {
      contextSelection = b.dataset.askBlocker;
      await switchTab("sessions");
      chatDraft =
        "What blocks " +
        contextSelection +
        ", and do you need a decision from me?";
      renderEmptyChat();
      $("run-message").focus();
      return;
    }
    if (b.dataset.deleteRun || b.dataset.deletePlan) {
      const kind = b.dataset.deleteRun ? "run" : "plan",
        id = b.dataset.deleteRun || b.dataset.deletePlan;
      if (
        !confirm(
          "Delete this " +
            (kind === "run" ? "conversation" : "draft") +
            "? You can restore it from Settings → Trash.",
        )
      )
        return;
      await call(kind + ".delete", { id });
      currentRun = null;
      planDraft = null;
      chatDraft = "";
      if (kind === "plan") {
        close();
        window.dispatchEvent(
          new CustomEvent("nupp-show-view", {
            detail: { view: "documents", planSection: "proposals" },
          }),
        );
      } else await render();
      remember();
      note("Moved to Trash");
      return;
    }
    if (b.hasAttribute("data-write-plan")) {
      await writePlan();
      return;
    }
    if (b.dataset.plan) {
      await loadPlan(b.dataset.plan);
      return;
    }
    if (b.dataset.page) {
      if (b.dataset.page === "sessions") {
        sessionOffset = Number(b.dataset.offset);
        await refreshSessionList();
      }
      return;
    }
    if (b.hasAttribute("data-retry-submission") && pendingSubmission) {
      await submitIntent(
        pendingSubmission.input.action,
        pendingSubmission.input.prompt,
      );
      return;
    }
    if (b.hasAttribute("data-chat-stop")) {
      await call("run.interrupt", { id: currentRun.id });
      $("chat-status").textContent = "Stopping…";
      return;
    }
    if (b.hasAttribute("data-earlier")) {
      const first = events[0]?.seq;
      await loadRun(currentRun.id, { before: first });
      $("run-transcript").scrollTop = 0;
      return;
    }
    if (b.id === "chat-new-messages") {
      historyMode = false;
      await loadRun(currentRun.id);
      $("chat-new-messages").hidden = true;
      return;
    }
    if (b.dataset.resume) {
      await call("run.resume", { id: b.dataset.resume });
      await loadRun(b.dataset.resume);
      return;
    }
    if (b.dataset.answer) {
      const q = currentRun.requests.find((q) => q.id === b.dataset.answer),
        card = b.closest("[data-request]"),
        answers = {};
      for (const [i, question] of requestQuestions(q).entries()) {
        const value =
          card.querySelector('[data-free-answer="' + i + '"]')?.value.trim() ||
          card.querySelector(
            'input[name="answer-' + q.id + "-" + i + '"]:checked',
          )?.value;
        if (!value && b.dataset.decision === "allow")
          throw Error("Answer the question before sending.");
        answers[
          currentRun.provider === "claude"
            ? question.question
            : question.id || question.question
        ] = currentRun.provider === "claude" ? value : { answers: [value] };
      }
      await call("run.answer", {
        id: q.id,
        decision: b.dataset.decision,
        answers,
      });
      await loadRun(currentRun.id, { full: false });
      return;
    }
    if (b.dataset.validate) {
      b.disabled = true;
      const r = await call("run.validate", { id: b.dataset.validate });
      note(
        r.passed
          ? "Checks passed; integration queued."
          : "Checks failed; evidence saved.",
      );
      await loadRun(currentRun.id, { full: false });
      return;
    }
    if (b.dataset.integrate) {
      b.disabled = true;
      await call("integration.merge", {
        id: b.dataset.integrate,
        expectedCommit: b.dataset.head,
      });
      await refresh();
      note("Revalidated and integrated");
      return;
    }
    if (b.dataset.handoff) {
      const value = await call("handoff", { id: b.dataset.handoff }),
        a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
      a.download = b.dataset.handoff + "-handoff.json";
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (b.id === "save-draft") {
      planDraft = await call("plan.save", {
        id: planDraft.id,
        text: $("plan-source").value,
        expectedHash: planDraft.hash,
      });
      await loadPlan(planDraft.id);
      note("Revision saved");
      return;
    }
    if (b.id === "approve-draft") {
      if (planDraft.dirty)
        throw Error("Save this revision before approving it.");
      const receipt = await call("plan.approve", {
        id: planDraft.id,
        expectedHash: planDraft.hash,
        expectedRevision: workspace.revision,
        approvedBy: "Local user",
        evidence: "Explicit approval of the displayed document revision.",
      });
      await loadPlan(planDraft.id);
      note(receipt.taskIds.length + " tasks created");
      return;
    }
    if (b.id === "draft-with-agent") {
      if (planDraft.dirty) throw Error("Save the draft first.");
      const run = await call("run.start", {
        planId: planDraft.id,
        provider: $("intent-provider").value,
        projectId: $("intent-project").value,
        model: selectedModels[$("intent-provider").value],
        approvalMode: defaultApprovalMode,
        background: true,
      });
      planDraft = null;
      tab = "sessions";
      renderSessions();
      await loadRun(run.id);
      return;
    }
    if (b.id === "execute-approved-plan") {
      if (planDraft.dirty || planDraft.state !== "approved")
        throw Error("Approve the current revision first.");
      await call("batch.start", {
        taskIds: Object.values(planDraft.mapping),
        projectId: $("intent-project").value,
        provider: $("intent-provider").value,
        model: selectedModels[$("intent-provider").value],
        parallelism: 2,
        approvalMode: defaultApprovalMode,
        autoIntegrate: true,
      });
      await switchTab("sessions");
      return;
    }
    if (b.dataset.adoptPlan) {
      const text = events.filter((e) => e.kind === "message").at(-1)?.text;
      if (!text) throw Error("Wait for a complete plan response.");
      const p = await call("plan.get", { id: b.dataset.adoptPlan });
      await call("plan.save", { id: p.id, expectedHash: p.hash, text });
      await loadPlan(p.id);
      return;
    }
  } catch (error) {
    const feedback = $("chat-feedback") || $("plan-feedback");
    if (feedback) feedback.textContent = error.message;
    else note(error.message);
  } finally {
    b.disabled = false;
    remember();
  }
});
window.addEventListener("nupp-open-integration", async () => {
  tab = "integration";
  planDraft = null;
  currentRun = null;
  await open();
});
window.addEventListener("nupp-open-session", async (e) => {
  runRequest++;
  stopEvents();
  deliveryMode = e.detail.steer ? "steer" : "queue";
  tab = "sessions";
  planDraft = null;
  currentRun = null;
  await open();
  await loadRun(e.detail.id);
});
window.addEventListener("nupp-ask-context", async (e) => {
  runRequest++;
  stopEvents();
  contextSelection = e.detail?.taskId || "";
  tab = "sessions";
  planDraft = null;
  currentRun = null;
  chatDraft = e.detail?.prompt || "";
  await open();
  renderEmptyChat();
  $("run-message").value = chatDraft;
  $("run-message").focus();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(refreshTimer);
    stopEvents();
  } else if (!shell.hidden) {
    refresh({ paint: !planDraft });
    if (currentRun) streamRun(currentRun.id);
  }
});
window.addEventListener("beforeunload", (e) => {
  remember();
  if (planDraft?.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    !shell.hidden &&
    !planDraft?.dirty &&
    !settings.open &&
    !$("chat-details")?.open
  ) {
    if (shell.querySelector(".history-open")) {
      setConversationHistory(false);
      shell.querySelector("[data-toggle-history]")?.focus();
    } else if (
      shell.querySelector(".chat-options[open]") &&
      matchMedia("(max-width:900px)").matches
    )
      shell.querySelector(".chat-options").open = false;
    else close();
  }
});
async function restore() {
  Object.assign(selectedModels, recovered.models || {});
  Object.assign(intentDrafts, recovered.drafts || {});
  tab = ["sessions", "metrics"].includes(recovered.tab)
    ? recovered.tab
    : "sessions";
  intent = recovered.intent || recovered.action || "task";
  contextSelection = recovered.contextSelection || "";
  chatDraft = recovered.message || "";
  messageSubmissionId = recovered.messageSubmissionId || messageSubmissionId;
  pendingSubmission = recovered.pendingSubmission || null;
  $("intent-prompt").value = recovered.prompt || "";
  $("intent-provider").value = recovered.provider || "codex";
  syncIntent();
  if (location.pathname === "/workspace" || recovered.open) {
    await open();
    if (
      recovered.project &&
      workspace.projects.some((p) => p.id === recovered.project)
    )
      $("intent-project").value = recovered.project;
    if (recovered.runId && tab === "sessions") {
      try {
        await loadRun(recovered.runId);
        if ($("run-message"))
          $("run-message").value = chatDraft = recovered.message || "";
      } catch (error) {
        if (pendingSubmission) pendingChat(pendingSubmission.input.prompt);
        else note(error.message);
      }
    } else if (pendingSubmission && tab === "sessions") {
      const r = await call("intent.get", {
        submissionId: pendingSubmission.input.submissionId,
      });
      if (r.run) {
        pendingSubmission = null;
        await loadRun(r.run.id);
      } else pendingChat(pendingSubmission.input.prompt);
    }
    remember();
  }
}
restore().catch((error) => note(error.message));

const siteSettings = document.createElement("dialog");
siteSettings.id = "site-settings-dialog";
siteSettings.setAttribute("aria-label", "Site settings");
document.body.append(siteSettings);
$("site-settings").onclick = async () => {
  if (!workspace) await refreshSettings();
  siteSettings.innerHTML = `<header class="dialog-heading"><h2>Settings</h2><button class="button" data-close-site-settings aria-label="Close settings">×</button></header><h3>Agents</h3><p>Choose Codex or Claude and a model for new conversations.</p><button class="button" data-site-agent-settings>Agent & model settings</button><h3>Repositories</h3>${workspace.projects.map((p) => `<details><summary>${esc(p.id)}</summary><p>${esc(p.root)} · ${esc(p.baseBranch)}</p><pre>${esc(JSON.stringify(p.checks, null, 2))}</pre></details>`).join("")}<details><summary>Add repository</summary><form id="project-form"><label>Project ID<input name="id" required></label><label>Checkout root<input name="root" required></label><label>Base branch<input name="baseBranch" value="main" required></label><label>Worktree directory<input name="worktreeRoot"></label><label>Acceptance commands (JSON argument arrays)<textarea name="checks" rows="3">[]</textarea></label><button class="button primary">Save repository</button></form><p id="project-feedback" role="status"></p></details><h3>Examples</h3><p>Explore a fictional product launch. Existing work and edits are preserved.</p><button class="button" data-load-examples>Load examples</button><p class="example-feedback" role="status"></p><h3>Access</h3><p>Local network and VPN access are configured on the server. No public port forwarding is needed.</p><details id="settings-trash"><summary>Trash</summary><div id="trash-content"></div></details>`;
  siteSettings.showModal();
};
async function refreshSettings() {
  workspace = await (await fetch("/api/workspace")).json();
  const project = $("intent-project");
  project.innerHTML = workspace.projects
    .map((p) => '<option value="' + esc(p.id) + '">' + esc(p.id) + "</option>")
    .join("");
}
siteSettings.addEventListener("click", async (e) => {
  if (e.target.closest("[data-close-site-settings]")) siteSettings.close();
  if (e.target.closest("[data-site-agent-settings]")) {
    siteSettings.close();
    await openSettings();
  }
  const b = e.target.closest("[data-restore-record]");
  if (b) {
    await call(b.dataset.kind + ".restore", { id: b.dataset.restoreRecord });
    b.closest("article").remove();
    note("Restored");
  }
});
siteSettings.addEventListener(
  "toggle",
  async (e) => {
    if (e.target.id !== "settings-trash" || !e.target.open) return;
    const r = await call("trash");
    $("trash-content").innerHTML =
      ["runs", "plans"]
        .flatMap((kind) =>
          r[kind].map(
            (row) =>
              '<article class="execution-row"><span>' +
              esc(row.title) +
              '</span><button class="button subtle" data-restore-record="' +
              esc(row.id) +
              '" data-kind="' +
              (kind === "runs" ? "run" : "plan") +
              '">Restore</button></article>',
          ),
        )
        .join("") || "<p>Trash is empty.</p>";
  },
  true,
);
siteSettings.addEventListener("submit", async (e) => {
  if (e.target.id !== "project-form") return;
  e.preventDefault();
  try {
    const f = e.target.elements;
    await call("project.configure", {
      id: f.id.value,
      root: f.root.value,
      baseBranch: f.baseBranch.value,
      worktreeRoot: f.worktreeRoot.value || undefined,
      checks: JSON.parse(f.checks.value),
    });
    await refreshSettings();
    $("project-feedback").textContent = "Repository saved.";
  } catch (error) {
    $("project-feedback").textContent = error.message;
  }
});

let planPreviewTimer;
async function writePlan() {
  tab = "sessions";
  planDraft = null;
  currentRun = null;
  await open();
  const p = await call("plan.create", {
    prompt: "Untitled plan",
    context: context(),
  });
  await loadPlan(p.id);
  $("plan-source").focus();
  remember();
}
window.addEventListener("nupp-write-plan", () =>
  writePlan().catch((e) => note(e.message)),
);

installSessionLinks({
  call,
  openSession: async (id) => {
    window.dispatchEvent(
      new CustomEvent("nupp-open-session", { detail: { id } }),
    );
  },
});

shell.addEventListener("change", async (e) => {
  if (!e.target.matches("[data-run-approvals]") || !currentRun) return;
  const field = e.target,
    id = currentRun.id,
    previous = currentRun.approvalMode || "manual";
  field.disabled = true;
  try {
    const result = await call("run.approvals", {
      id,
      approvalMode: field.value,
    });
    if (currentRun?.id !== id) return;
    currentRun.approvalMode = result.approvalMode;
    note(
      (result.applies === "next-turn"
        ? "Applies from the next turn. "
        : result.applies === "on-resume"
          ? "Saved for the next resume. "
          : "Approval mode updated. ") +
        (result.pendingApprovals
          ? "Existing approval requests still need a decision."
          : ""),
    );
  } catch (error) {
    field.value = previous;
    note(error.message);
  } finally {
    field.disabled = false;
  }
});

matchMedia("(max-width:900px)").addEventListener("change", () =>
  setConversationHistory(false),
);
matchMedia("(max-width:900px)").addEventListener("change", (e) => {
  const menu = shell.querySelector(".chat-options");
  if (menu) menu.open = false;
});

shell.addEventListener("pointerdown", (e) => {
  if (
    !matchMedia("(max-width:900px)").matches ||
    e.target.closest(".chat-options")
  )
    return;
  const menu = shell.querySelector(".chat-options[open]");
  if (menu) menu.open = false;
});

window.addEventListener("nupp-open-plan", async (e) => {
  try {
    tab = "sessions";
    planDraft = null;
    currentRun = null;
    await open();
    await loadPlan(e.detail.id);
  } catch (error) {
    note(error.message);
  }
});
window.addEventListener("nupp-plan-with-agent", async () => {
  tab = "sessions";
  planDraft = null;
  currentRun = null;
  await open();
  setIntent("draft");
  $("intent-form").hidden = false;
  $("intent-prompt").focus();
});

// Reading history gives space back to the transcript; focusing the draft expands it.
function sizeComposer() {
  const input = $("run-message");
  if (!input) return;
  input.style.height = "auto";
  input.style.height =
    Math.min(
      matchMedia("(max-width:900px)").matches ? 100 : 140,
      Math.max(32, input.scrollHeight),
    ) + "px";
}
function updateReadingMode() {
  const log = $("run-transcript");
  if (!log) {
    shell.classList.remove("reading-history");
    return;
  }
  const distance = log.scrollHeight - log.scrollTop - log.clientHeight,
    reading = shell.classList.contains("reading-history");
  if (distance > 140) shell.classList.add("reading-history");
  else if (distance < 50) shell.classList.remove("reading-history");
}
shell.addEventListener(
  "scroll",
  (e) => {
    if (e.target.id === "run-transcript") {
      updateReadingMode();
      markReplyRead();
    }
  },
  true,
);
shell.addEventListener("focusin", (e) => {
  if (e.target.id === "run-message") sizeComposer();
});
shell.addEventListener("focusout", (e) => {
  if (e.target.id === "run-message") updateReadingMode();
});
