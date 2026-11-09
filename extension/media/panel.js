// Webview front-end for the graph, progress, and timeline views.
//
// Layout and grouping come from the workspace's own model modules, fetched
// from the server that owns the data, so this file does not keep a second copy
// of that logic. Rendering is bounded by the page the extension sends and all
// drawing stops while the panel is hidden.
const vscode = acquireVsCodeApi();
const body = document.body;
const origin = body.dataset.origin;
const view = body.dataset.view;
const surface = document.getElementById("surface");
const summary = document.getElementById("summary");
const paging = document.getElementById("paging");
const detail = document.getElementById("detail");

let models = null;
let current = null;
let selected = null;

async function loadModels() {
  if (models) return models;
  try {
    // The website already serves these modules; reusing them keeps one
    // implementation of readiness, grouping, and progress.
    const [workbench, progress] = await Promise.all([
      import(origin + "/workbench-model.mjs").catch(() => null),
      import(origin + "/progress-model.mjs").catch(() => null),
    ]);
    models = { workbench, progress };
  } catch {
    models = { workbench: null, progress: null };
  }
  return models;
}

function signalsFor(task, data) {
  const workbench = models?.workbench;
  if (!workbench?.taskSignals) return null;
  try {
    return workbench.taskSignals(
      {
        tasks: data.tasks,
        edges: data.edges,
        statuses: data.statuses || [],
        documents: {},
        epics: [],
        tracks: [],
      },
      task,
    );
  } catch {
    return null;
  }
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function render(data) {
  current = data;
  clear(surface);
  summary.textContent =
    data.tasks.length + " of " + data.total + " tasks · read " + data.at;
  renderPaging(data);
  if (view === "graph") renderGraph(data);
  else if (view === "progress") renderProgress(data);
  else renderStrip(data);
}

function renderPaging(data) {
  clear(paging);
  if (data.total <= data.limit) return;
  const label = document.createElement("span");
  label.textContent =
    "showing " +
    (data.offset + 1) +
    "–" +
    Math.min(data.offset + data.limit, data.total);
  paging.appendChild(label);
  for (const [text, offset] of [
    ["Previous", Math.max(0, data.offset - data.limit)],
    ["Next", data.offset + data.limit],
  ]) {
    if (offset === data.offset || offset >= data.total) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () =>
      vscode.postMessage({ kind: "page", offset }),
    );
    paging.appendChild(button);
  }
}

function describe(task, data) {
  const signals = signalsFor(task, data);
  const run = data.runs.find((r) => r.taskId === task.id);
  const bits = [task.status];
  if (signals?.blockers?.length)
    bits.push("blocked by " + signals.blockers.join(", "));
  if (run) bits.push(run.state);
  return bits.join(" · ");
}

function select(task, data) {
  selected = task.id;
  clear(detail);
  const heading = document.createElement("strong");
  heading.textContent = task.title || task.id;
  const meta = document.createElement("span");
  meta.textContent = " " + describe(task, data);
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Open task";
  open.addEventListener("click", () =>
    vscode.postMessage({ kind: "selectTask", taskId: task.id }),
  );
  const chat = document.createElement("button");
  chat.type = "button";
  chat.textContent = "Open conversation";
  chat.addEventListener("click", () =>
    vscode.postMessage({ kind: "openConversation", taskId: task.id }),
  );
  detail.append(heading, meta, open, chat);
  for (const node of surface.querySelectorAll("[data-task]"))
    node.setAttribute(
      "aria-selected",
      node.dataset.task === task.id ? "true" : "false",
    );
}

// Dependency layers, so a graph reads as a dependency order rather than a
// cloud of boxes.
function layers(data) {
  const incoming = new Map(data.tasks.map((task) => [task.id, 0]));
  const byId = new Map(data.tasks.map((task) => [task.id, task]));
  const relevant = data.edges.filter(
    (edge) =>
      ["requires", "sequence"].includes(edge.kind) &&
      byId.has(edge.from) &&
      byId.has(edge.to),
  );
  const depth = new Map();
  const visit = (id, seen) => {
    if (depth.has(id)) return depth.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = relevant.filter((edge) => edge.to === id);
    const value = parents.length
      ? Math.max(...parents.map((edge) => visit(edge.from, seen) + 1))
      : 0;
    depth.set(id, value);
    seen.delete(id);
    return value;
  };
  for (const task of data.tasks) visit(task.id, new Set());
  const grouped = new Map();
  for (const task of data.tasks) {
    const key = depth.get(task.id) || 0;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  }
  return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
}

function renderGraph(data) {
  const list = document.createElement("div");
  list.className = "layers";
  for (const [depth, tasks] of layers(data)) {
    const column = document.createElement("section");
    column.className = "layer";
    const heading = document.createElement("h2");
    heading.textContent = depth === 0 ? "No prerequisites" : "After " + depth;
    column.appendChild(heading);
    const items = document.createElement("div");
    items.className = "nodes";
    items.setAttribute("role", "listbox");
    for (const task of tasks) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "node status-" + task.status;
      node.dataset.task = task.id;
      node.setAttribute("role", "option");
      node.setAttribute("aria-selected", String(selected === task.id));
      node.title = describe(task, data);
      const title = document.createElement("span");
      title.className = "node-title";
      title.textContent = task.title || task.id;
      const sub = document.createElement("span");
      sub.className = "node-meta";
      sub.textContent = describe(task, data);
      node.append(title, sub);
      node.addEventListener("click", () => select(task, data));
      items.appendChild(node);
    }
    column.appendChild(items);
    list.appendChild(column);
  }
  surface.appendChild(list);
}

function renderProgress(data) {
  const byEpic = new Map();
  for (const task of data.tasks) {
    const key = task.epic || "inbox";
    if (!byEpic.has(key)) byEpic.set(key, []);
    byEpic.get(key).push(task);
  }
  const container = document.createElement("div");
  container.className = "tracks";
  for (const [epic, tasks] of [...byEpic.entries()].sort()) {
    const done = tasks.filter((task) =>
      ["accepted", "implemented"].includes(task.status),
    ).length;
    const row = document.createElement("section");
    row.className = "track";
    const heading = document.createElement("h2");
    heading.textContent = epic;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      epic + ": " + done + " of " + tasks.length + " complete",
    );
    for (const task of tasks) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell status-" + task.status;
      cell.dataset.task = task.id;
      cell.title = (task.title || task.id) + " — " + describe(task, data);
      cell.setAttribute("aria-label", cell.title);
      cell.addEventListener("click", () => select(task, data));
      bar.appendChild(cell);
    }
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = done + " / " + tasks.length;
    row.append(heading, bar, count);
    container.appendChild(row);
  }
  surface.appendChild(container);
}

function renderStrip(data) {
  const ordered = [...data.tasks].sort((a, b) =>
    String(a.updatedAt || a.createdAt || "").localeCompare(
      String(b.updatedAt || b.createdAt || ""),
    ),
  );
  const strip = document.createElement("ol");
  strip.className = "strip";
  for (const task of ordered) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip status-" + task.status;
    button.dataset.task = task.id;
    button.textContent = task.title || task.id;
    button.title = describe(task, data);
    button.addEventListener("click", () => select(task, data));
    const when = document.createElement("time");
    when.textContent = (task.updatedAt || task.createdAt || "").slice(0, 10);
    item.append(button, when);
    strip.appendChild(item);
  }
  surface.appendChild(strip);
}

surface.addEventListener("keydown", (event) => {
  if (!current) return;
  const nodes = [...surface.querySelectorAll("[data-task]")];
  if (!nodes.length) return;
  const index = nodes.findIndex((node) => node.dataset.task === selected);
  let next = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    next = Math.min(nodes.length - 1, index + 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    next = Math.max(0, index - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = nodes.length - 1;
  else if (event.key === "Enter" && selected) {
    vscode.postMessage({ kind: "selectTask", taskId: selected });
    return;
  } else return;
  event.preventDefault();
  const task = current.tasks.find((t) => t.id === nodes[next].dataset.task);
  if (task) {
    select(task, current);
    nodes[next].focus();
  }
});

window.addEventListener("message", async (event) => {
  const message = event.data;
  if (message.kind !== "state") return;
  await loadModels();
  render(message);
});

loadModels().then(() => vscode.postMessage({ kind: "ready" }));
