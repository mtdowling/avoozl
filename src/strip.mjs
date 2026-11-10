import { createPanMomentum } from "./pan-momentum.mjs";
import { taskSession } from "./workbench-model.mjs";
import { agentPins, stripActivityMarkers } from "./agent-pins.mjs";
import { opacityPrefix, paintBand } from "./band-paint.mjs";
import {
  stripLayout,
  cameraRange,
  zoomCamera,
  focusCamera,
  clamp,
} from "./strip-model.mjs";
import { statusComplete } from "./query.mjs";
import { taskProgress } from "./progress-model.mjs";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const color = (c) => (/^#[\da-f]{6}$/i.test(c || "") ? c : "#8edabb");
export function stripOverlayParent(root) {
  const treeRoot = root.getRootNode?.();
  return treeRoot?.nodeType === 11 ? treeRoot : root.ownerDocument.body;
}
export function createSingleStrip(
  root,
  { select, changeCamera, interact = () => {}, changeOrder = () => {} },
) {
  let input,
    layout = { groups: [], tasks: [], total: 0 },
    scale = 1,
    center = 0.5,
    width = 1,
    height = 300,
    raf = 0,
    tween = 0,
    dragged = false,
    focusToken = "",
    scope = "",
    activeItems = [],
    markers = [],
    activity = { runs: [], landings: [] },
    showLandings = true,
    landedClusters = new Map(),
    workerClusters = new Map(),
    pinIndex = new Map(),
    popoverAnchor = "",
    activityTask = "",
    workerRequest = 0,
    bandTop = 66,
    bandHeight = 72;
  const pointers = new Map();
  try {
    showLandings = localStorage.getItem("avoozl-strip-landings") !== "false";
  } catch {}
  let gesture;
  root.innerHTML = `<div class="strip-heading"><div class="strip-scope"><div class="strip-level" aria-live="polite" title="Strip zoom"><svg class="strip-level-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.4 16.4 4.1 4.1"/></svg><span class="strip-level-scale"></span></div><div class="strip-progress-summary" hidden></div></div><div class="strip-zoom"><div class="strip-orders" role="group" aria-label="Strip ordering"><button class="button" data-strip-order="chronological">Chronological</button><button class="button" data-strip-order="progress">Done first</button></div><button class="button" data-focus-workers>In flight</button><button class="button" data-strip-fit>All</button><button class="button" data-strip-matches aria-label="Focus matches"><span class="strip-match-full">Focus matches</span><span class="strip-match-short">Matches</span></button><div class="strip-magnification"><button class="button" data-strip-out aria-label="Zoom strip out">−</button><input type="range" min="0" max="16" step="0.01" value="0" aria-label="Strip zoom"><button class="button" data-strip-in aria-label="Zoom strip in">＋</button></div></div></div><div class="strip-stage" tabindex="0" role="group" aria-label="All tasks in one strip. Pinch or Ctrl-scroll to zoom, drag sideways to pan, double-click to zoom. Plus and minus zoom; arrow keys pan; Home fits all."><canvas class="strip-canvas" aria-hidden="true"></canvas><div class="strip-labels"></div><div class="strip-workers" aria-label="Agents working on this strip"></div><div class="strip-empty" hidden>No tasks in this collection.</div></div><div class="strip-bottom"><div class="strip-legend"><span><i></i>Complete</span><span><i></i>Remaining</span><span>Filters fade tasks; positions and scope stay fixed.</span></div><div class="strip-minimap" tabindex="0" role="slider" aria-label="Position within all tasks" aria-valuemin="0" aria-valuemax="100"><canvas aria-hidden="true"></canvas><div class="strip-window"></div></div><div class="strip-help"><span class="strip-location"></span><span>Pinch / Ctrl-scroll to zoom · drag sideways to pan · click an epic to zoom into it · click a task for context</span></div></div>`;
  const landedToggle = document.createElement("button");
  landedToggle.className = "button";
  landedToggle.dataset.toggleLandings = "";
  landedToggle.title = "Show recently landed work from the last 30 days";
  root
    .querySelector(".strip-zoom")
    .insertBefore(landedToggle, root.querySelector(".strip-magnification"));
  // Keep overlays outside the clipping stage but inside the UI's style root.
  // Canvas mounts Avoozl in a ShadowRoot, so document.body would leave these
  // elements unstyled and allow their contents to shift the host page.
  const popover = document.createElement("div");
  popover.className = "strip-worker-popover";
  popover.hidden = true;
  const hoverCard = document.createElement("div");
  hoverCard.className = "strip-pin-hover";
  hoverCard.hidden = true;
  hoverCard.setAttribute("aria-hidden", "true");
  stripOverlayParent(root).append(popover, hoverCard);
  const stage = root.querySelector(".strip-stage"),
    canvas = root.querySelector(".strip-canvas"),
    labels = root.querySelector(".strip-labels"),
    minimap = root.querySelector(".strip-minimap"),
    miniCanvas = minimap.querySelector("canvas"),
    windowBox = minimap.querySelector(".strip-window"),
    slider = root.querySelector("input"),
    level = root.querySelector(".strip-level"),
    levelScale = root.querySelector(".strip-level-scale");
  const momentum = createPanMomentum({
    move(dx) {
      if (!input || root.hidden) return false;
      const previous = center;
      center = cameraRange(
        layout.total,
        scale,
        center - dx / width / scale,
      ).center;
      schedule();
      return center !== previous;
    },
    end: () => notify(),
  });
  const maxScale = () => Math.max(1, (layout.total * 230) / Math.max(1, width));
  function notify() {
    changeCamera({ scale, center });
  }
  function schedule() {
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
      });
  }
  function stopTween() {
    if (tween) cancelAnimationFrame(tween);
    tween = 0;
  }
  function move(nextScale, nextCenter, { animate = false } = {}) {
    momentum.stop();
    stopTween();
    nextScale = clamp(nextScale, 1, maxScale());
    nextCenter = cameraRange(layout.total, nextScale, nextCenter).center;
    if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scale = nextScale;
      center = nextCenter;
      schedule();
      notify();
      return;
    }
    const fromScale = scale,
      fromCenter = center,
      at = performance.now();
    function step(now) {
      const p = clamp((now - at) / 500, 0, 1),
        t = 1 - Math.pow(1 - p, 3);
      scale = Math.exp(
        Math.log(fromScale) + (Math.log(nextScale) - Math.log(fromScale)) * t,
      );
      center = fromCenter + (nextCenter - fromCenter) * t;
      draw();
      if (p < 1) tween = requestAnimationFrame(step);
      else {
        tween = 0;
        notify();
      }
    }
    tween = requestAnimationFrame(step);
  }
  function zoom(factor, anchor = 0.5) {
    const next = clamp(scale * factor, 1, maxScale()),
      range = zoomCamera(layout.total, scale, center, next, anchor);
    move(next, range.center);
  }
  function fitIndices(indices) {
    const target = focusCamera(layout.total, indices);
    move(target.scale, target.center, { animate: true });
  }
  function fitMatches() {
    fitIndices(
      layout.tasks
        .filter(({ task }) => input.matchingIds.has(task.id))
        .map((t) => t.index),
    );
  }
  function context(canvas, w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }
  function drawBand(ctx, w, y, h, start, span) {
    const unit = w / span;
    for (const group of layout.groups) {
      if (group.end < start || group.start > start + span) continue;
      paintBand(ctx, group.prefix, {
        offset: (group.start - start) * unit,
        unit,
        width: w,
        y,
        height: h,
        color: color(group.color),
      });
    }
  }
  function draw() {
    if (!input || root.hidden) return;
    const bounds = stage.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(180, bounds.height);
    scale = clamp(scale, 1, maxScale());
    const range = cameraRange(layout.total, scale, center);
    center = range.center;
    const ctx = context(canvas, width, height),
      unit = width / Math.max(1, range.span),
      detail = unit >= 112,
      taskLabels = unit >= 32,
      bandY = input.order === "progress" ? 92 : 66,
      maxPinRows = Math.max(
        1,
        Math.min(3, Math.floor((height - bandY - 81) / 42) + 1),
      ),
      pinRows = Math.min(
        maxPinRows,
        Math.ceil(
          markers.filter((i) => i.index >= range.start && i.index < range.end)
            .length / Math.max(1, Math.floor(width / 38)),
        ),
      ),
      pinSpace = markers.length ? 55 + Math.max(0, pinRows - 1) * 42 : 15,
      bandH = detail
        ? Math.max(32, Math.min(190, height - bandY - pinSpace))
        : Math.max(26, Math.min(72, height - bandY - pinSpace));
    bandTop = bandY;
    bandHeight = bandH;
    root.classList.toggle("progress-order", input.order === "progress");
    stage.classList.toggle("compact", height < 290);
    root.dataset.stripLevel = detail
      ? "details"
      : taskLabels
        ? "tasks"
        : scale > 1.1
          ? "epics"
          : "all";
    if (layout.total) {
      drawBand(ctx, width, bandY, bandH, range.start, range.span);
      ctx.strokeStyle = "#394960";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, bandY - 1);
      ctx.lineTo(width, bandY - 1);
      ctx.stroke();
    }
    const focusedTask = document.activeElement?.dataset.stripTask;
    let html = "";
    for (const section of layout.sections || []) {
      const x = Math.max(0, (section.start - range.start) * unit),
        right = Math.min(width, (section.end - range.start) * unit);
      if (right > x && right - x > 40)
        html += `<button class="strip-section" data-strip-section="${section.id}" style="left:${x}px;width:${right - x}px" title="${section.title}: ${section.total} tasks">${section.title} <span>${section.total}</span></button>`;
    }
    const visibleGroups = layout.groups.filter(
      (g) => g.end > range.start && g.start < range.end,
    );
    for (const group of visibleGroups) {
      const x = Math.max(0, (group.start - range.start) * unit),
        right = Math.min(width, (group.end - range.start) * unit),
        w = right - x;
      if (w > 65)
        html += `<button class="strip-epic" data-strip-epic="${esc(group.key || group.id)}" style="left:${x}px;width:${w}px;--epic-color:${color(group.color)}" title="Zoom into ${esc(group.title)}"><span>${esc(group.id.startsWith("doc:") ? "PLAN" : group.id)} · ${group.percent}%</span><strong>${esc(group.title)}</strong></button>`;
    }
    if (taskLabels) {
      const start = Math.max(0, Math.floor(range.start)),
        end = Math.min(layout.total, Math.ceil(range.end));
      for (let i = start; i < end; i++) {
        const { task, group } = layout.tasks[i],
          x = (i - range.start) * unit,
          match = input.matchingIds.has(task.id),
          done = statusComplete(input.data, task.status);
        const status =
          input.data.statuses.find((s) => s.id === task.status)?.label ||
          task.status;
        html += `<button class="strip-task ${detail ? "strip-task-detail" : ""} ${done ? "complete" : ""} ${match ? "" : "filtered"} ${input.selected === task.id ? "selected" : ""}" data-strip-task="${esc(task.id)}" style="left:${x}px;top:${bandY}px;width:${Math.max(1, unit - 2)}px;height:${bandH}px;--epic-color:${color(group.color)}" aria-label="${esc(task.title)}. ${esc(status)}${match ? "" : ". Outside filters"}" title="${esc(task.title)} · ${esc(status)}"><small>${i + 1} · ${esc(group.id.startsWith("doc:") ? "PLAN" : group.id)}</small><strong>${esc(task.title)}</strong>${detail ? `<span>${esc(status)}</span><p>${esc((task.nextAction || task.summary || "Click for full plan context.").slice(0, 180))}</p><i class="strip-task-progress"><b style="width:${taskProgress(input.data, task) * 100}%"></b></i>` : ""}</button>`;
      }
    }
    const pins = agentPins(markers, {
      start: range.start,
      end: range.end,
      width,
      maxRows: maxPinRows,
    });
    workerClusters = new Map(
      pins
        .filter((p) => p.kind === "working")
        .map((p) => [p.task.id, p.items || [p]]),
    );
    landedClusters = new Map(
      pins
        .filter((p) => p.kind === "landed")
        .flatMap((p) =>
          (p.items || [p]).map((item) => [item.task.id, p.items || [p]]),
        ),
    );
    pinIndex = new Map(pins.map((p) => [p.kind + ":" + p.task.id, p]));
    const workerLayer = root.querySelector(".strip-workers");
    // Stems begin on the task band itself. Leaving a gap here made an active
    // worker look like a detached pointer even though its SVG path existed.
    workerLayer.style.top = bandY + bandH + "px";
    workerLayer.style.height =
      Math.max(1, ...pins.map((p) => p.row + 1)) * 42 + 35 + "px";
    workerLayer.innerHTML =
      '<svg class="agent-pin-stems" width="' +
      width +
      '" height="100%" aria-hidden="true">' +
      pins
        .map(
          (p) =>
            '<path class="' +
            p.kind +
            '" d="M' +
            p.anchor +
            " 0 L" +
            p.x +
            " " +
            p.y +
            '"/><circle class="' +
            p.kind +
            '" cx="' +
            p.anchor +
            '" cy="0" r="2"/>',
        )
        .join("") +
      "</svg>" +
      pins
        .map(
          (p) =>
            '<button class="agent-pin ' +
            p.kind +
            '" data-strip-' +
            (p.kind === "landed" ? "landed" : "worker") +
            '="' +
            esc(p.task.id) +
            '" style="left:' +
            (p.x - 14) +
            "px;top:" +
            p.y +
            'px" aria-label="' +
            esc(
              p.kind === "landed"
                ? "Recently landed: " + p.task.title
                : p.owner + " working on " + p.task.title,
            ) +
            '"><span>' +
            (p.items?.length > 1
              ? p.items.length
              : p.kind === "landed"
                ? "✓"
                : "A") +
            "</span></button>",
        )
        .join("");

    labels.innerHTML = html;
    if (focusedTask)
      labels
        .querySelector('[data-strip-task="' + CSS.escape(focusedTask) + '"]')
        ?.focus({ preventScroll: true });
    // The selected task stays visible in the blended layer without thousands of DOM nodes.
    const chosen = layout.tasks.find((t) => t.task.id === input.selected);
    if (chosen && chosen.index >= range.start - 1 && chosen.index < range.end) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        (chosen.index - range.start) * unit + 1,
        bandY + 1,
        Math.max(2, unit - 3),
        bandH - 2,
      );
    }
    slider.max = Math.log2(maxScale());
    slider.value = Math.log2(scale);
    const name = detail
      ? "Task details"
      : taskLabels
        ? "Task names"
        : scale > 1.1
          ? "Epic neighborhoods"
          : "All plans";
    // The badge reads as a zoom control, so the scope name is its label rather
    // than text that changes under the operator as they zoom.
    const factor = `${scale < 10 ? scale.toFixed(1) : Math.round(scale)}×`;
    levelScale.textContent = factor;
    level.title = `${name} · ${factor}`;
    level.setAttribute("aria-label", `Strip zoom: ${name} · ${factor}`);
    const mw = minimap.clientWidth,
      mh = 32,
      mctx = context(miniCanvas, mw, mh);
    if (layout.total) drawBand(mctx, mw, 5, 22, 0, layout.total);
    windowBox.style.left =
      (layout.total ? (range.start / layout.total) * 100 : 0) + "%";
    windowBox.style.width = 100 / scale + "%";
    minimap.setAttribute("aria-valuenow", String(Math.round(center * 100)));
    root.querySelector(".strip-location").textContent = layout.total
      ? `Tasks ${Math.floor(range.start) + 1}–${Math.min(layout.total, Math.ceil(range.end))} of ${layout.total} · 100% of scope at the right edge`
      : "";
    root.querySelector(".strip-empty").hidden = Boolean(layout.total);
    // Panning and zooming move the pin the popover points at.
    placePopover();
  }
  function placePopover() {
    if (popover.hidden) return;
    const pin = popoverAnchor ? root.querySelector(popoverAnchor) : null,
      anchor = (pin || stage).getBoundingClientRect(),
      box = popover.getBoundingClientRect(),
      margin = 8,
      below = anchor.bottom + 12,
      room = window.innerHeight - margin - box.height;
    popover.style.left =
      Math.max(
        margin,
        Math.min(
          window.innerWidth - box.width - margin,
          anchor.left + anchor.width / 2 - box.width / 2,
        ),
      ) + "px";
    popover.style.top =
      Math.max(
        margin,
        below <= room ? below : Math.min(room, anchor.top - box.height - 12),
      ) + "px";
  }
  function openPopover(selector, html) {
    hideHover();
    popoverAnchor = selector;
    popover.innerHTML = html;
    popover.hidden = false;
    placePopover();
    return popover;
  }
  function pinHover(button) {
    const landed = button.classList.contains("landed"),
      id = landed ? button.dataset.stripLanded : button.dataset.stripWorker,
      pin = pinIndex.get((landed ? "landed" : "working") + ":" + id);
    if (!pin) return "";
    const more = pin.items?.length > 1 ? pin.items.length - 1 : 0,
      extra = more
        ? `<em>+${more} more ${landed ? "landed" : "in flight"} here · click to list</em>`
        : `<em>Click for ${landed ? "the landing receipt" : "sessions and blockers"}</em>`;
    return landed
      ? `<small>RECENTLY LANDED</small><strong>${esc(pin.task.title)}</strong><span>${esc(pin.receipt.commit.slice(0, 9))}${pin.receipt.branch ? " · " + esc(pin.receipt.branch) : ""} · ${esc(new Date(pin.receipt.at).toLocaleString())}</span>${extra}`
      : `<small>IN FLIGHT</small><strong>${esc(pin.task.title)}</strong><span>${esc(pin.owner)}${pin.summary ? " · " + esc(pin.summary) : ""}</span>${extra}`;
  }
  function showHover(button) {
    const html = pinHover(button);
    if (!html || !popover.hidden) return;
    hoverCard.innerHTML = html;
    hoverCard.hidden = false;
    const anchor = button.getBoundingClientRect(),
      box = hoverCard.getBoundingClientRect(),
      margin = 8,
      below = anchor.bottom + 10;
    hoverCard.style.left =
      Math.max(
        margin,
        Math.min(
          window.innerWidth - box.width - margin,
          anchor.left + anchor.width / 2 - box.width / 2,
        ),
      ) + "px";
    // Below the pin by preference: the task band above stays readable.
    hoverCard.style.top =
      (below + box.height + margin <= window.innerHeight
        ? below
        : Math.max(margin, anchor.top - box.height - 10)) + "px";
  }
  function hideHover() {
    hoverCard.hidden = true;
  }
  function showLanding(id) {
    const cluster = landedClusters.get(id);
    if (!cluster) return;
    workerRequest++;
    activityTask = "";
    const { task, receipt } =
        cluster.find((p) => p.task.id === id) || cluster[0],
      acceptance =
        receipt.acceptance === "accepted"
          ? "Accepted"
          : receipt.acceptance === "component"
            ? "Component accepted"
            : "Acceptance pending";
    openPopover(
      '.agent-pin[data-strip-landed="' + CSS.escape(id) + '"]',
      `<button class="worker-close" data-close-worker aria-label="Close landing details">×</button><small>RECENTLY LANDED</small><h3>${esc(task.title)}</h3><p><code>${esc(receipt.commit.slice(0, 9))}</code>${receipt.branch ? " · " + esc(receipt.branch) : ""} · ${esc(new Date(receipt.at).toLocaleString())}</p><p>${acceptance}</p>${
        cluster.length > 1
          ? '<div class="worker-neighbors"><small>Also landed in this area</small>' +
            cluster
              .filter((p) => p.task.id !== id)
              .map(
                (p) =>
                  `<button class="button subtle" data-strip-landed="${esc(p.task.id)}">${esc(p.task.title)}</button>`,
              )
              .join("") +
            "</div>"
          : ""
      }<button class="button subtle" data-worker-task="${esc(task.id)}">Task & evidence</button>${receipt.runId ? `<button class="button subtle" data-worker-run="${esc(receipt.runId)}">Open landing session</button>` : ""}`,
    );
  }
  async function awaitWorker(id) {
    const request = ++workerRequest;
    activityTask = id;
    const item = activeItems.find((i) => i.task.id === id);
    if (!item) return;
    if (item.run) {
      popoverClose();
      window.dispatchEvent(
        new CustomEvent("nupp-open-session", {
          detail: { id: item.run.id, steer: false },
        }),
      );
      return;
    }
    const task = item.task;
    openPopover(
      '[data-strip-worker="' + CSS.escape(id) + '"]',
      '<button class="worker-close" data-close-worker aria-label="Close agent activity">×</button><small>IN FLIGHT</small><h3>' +
        esc(task.title) +
        "</h3><p>" +
        esc(item.owner) +
        "</p><p>" +
        esc(item.summary) +
        "</p>" +
        (workerClusters.get(id)?.length > 1
          ? '<div class="worker-neighbors"><small>Also working in this area</small>' +
            workerClusters
              .get(id)
              .filter((i) => i.task.id !== id)
              .slice(0, 20)
              .map(
                (i) =>
                  '<button class="button subtle" data-strip-worker="' +
                  esc(i.task.id) +
                  '">' +
                  esc(i.owner) +
                  " · " +
                  esc(i.task.title) +
                  "</button>",
              )
              .join("") +
            "</div>"
          : "") +
        '<div class="worker-sessions">Loading linked sessions…</div><button class="button subtle" data-worker-task="' +
        esc(id) +
        '">Task & blockers</button>',
    );
    try {
      const response = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "task.sessions", input: { id } }),
        }),
        result = await response.json();
      if (request !== workerRequest || activityTask !== id || !input) return;
      if (!response.ok) throw Error(result.error || "Sessions unavailable");
      const run = taskSession(result.result || [], task);
      if (run) {
        popoverClose();
        window.dispatchEvent(
          new CustomEvent("nupp-open-session", {
            detail: { id: run.id, steer: false },
          }),
        );
        return;
      }
      popover.querySelector(".worker-sessions").innerHTML =
        '<p class="muted">No transcript linked yet.</p><button class="button" data-link-session="' +
        esc(id) +
        '">Link Claude session</button>';
      placePopover();
    } catch {
      if (request === workerRequest && activityTask === id) {
        popover.querySelector(".worker-sessions").textContent =
          "Could not load sessions. Task activity is still available.";
        placePopover();
      }
    }
  }
  function popoverClose() {
    popover.hidden = true;
    popoverAnchor = "";
  }
  function pointTask(x) {
    const range = cameraRange(layout.total, scale, center);
    return layout.tasks[
      clamp(
        Math.floor(range.start + (x / width) * range.span),
        0,
        layout.total - 1,
      )
    ];
  }
  function onClick(e) {
    if (dragged) {
      dragged = false;
      return;
    }
    interact();
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-toggle-landings")) {
      showLandings = !showLandings;
      try {
        localStorage.setItem("avoozl-strip-landings", String(showLandings));
      } catch {}
      refreshMarkers();
      workerRequest++;
      popoverClose();
      schedule();
      return;
    }
    if (b.dataset.stripLanded) {
      showLanding(b.dataset.stripLanded);
      return;
    }
    if (b.dataset.stripWorker) {
      awaitWorker(b.dataset.stripWorker);
      return;
    }
    if (b.dataset.workerRun) {
      window.dispatchEvent(
        new CustomEvent("nupp-open-session", {
          detail: { id: b.dataset.workerRun },
        }),
      );
      return;
    }
    if (b.dataset.linkSession) {
      workerRequest++;
      popoverClose();
      window.dispatchEvent(
        new CustomEvent("nupp-link-session", {
          detail: { taskId: b.dataset.linkSession },
        }),
      );
      return;
    }
    if (b.dataset.workerTask) {
      workerRequest++;
      popoverClose();
      select(b.dataset.workerTask);
      return;
    }
    if (b.hasAttribute("data-close-worker")) {
      workerRequest++;
      popoverClose();
      return;
    }
    if (b.hasAttribute("data-focus-workers")) {
      fitIndices(activeItems.map((i) => i.index));
      return;
    }
    if (b.dataset.stripOrder) {
      changeOrder(b.dataset.stripOrder);
      return;
    }
    if (b.dataset.stripSection) {
      const section = layout.sections.find(
        (s) => s.id === b.dataset.stripSection,
      );
      if (section) fitIndices([section.start, section.end - 1]);
      return;
    }
    if (b.hasAttribute("data-strip-fit")) move(1, 0.5, { animate: true });
    else if (b.hasAttribute("data-strip-matches")) fitMatches();
    else if (b.hasAttribute("data-strip-in")) zoom(2);
    else if (b.hasAttribute("data-strip-out")) zoom(0.5);
    else if (b.dataset.stripTask) select(b.dataset.stripTask);
    else if (b.dataset.stripEpic) {
      const g = layout.groups.find(
        (g) => (g.key || g.id) === b.dataset.stripEpic,
      );
      if (g) fitIndices([g.start, g.end - 1]);
    }
  }
  root.addEventListener("click", onClick);
  // The popover sits outside the strip, so it needs the same actions wired.
  popover.addEventListener("click", onClick);
  popover.addEventListener("wheel", (e) => e.stopPropagation());
  for (const type of ["mouseover", "focusin"])
    root.addEventListener(type, (e) => {
      const pin = e.target.closest?.(".agent-pin");
      if (pin) showHover(pin);
      else hideHover();
    });
  for (const type of ["mouseout", "focusout"])
    root.addEventListener(type, (e) => {
      if (e.target.closest?.(".agent-pin")) hideHover();
    });
  root.addEventListener("pointerdown", () => hideHover(), { capture: true });
  // Closing on an outside press keeps the overlay from trapping the page.
  document.addEventListener("pointerdown", (e) => {
    const path = e.composedPath?.() || [e.target];
    if (
      !popover.hidden &&
      !path.includes(popover) &&
      !path.some((target) => target?.classList?.contains("agent-pin"))
    ) {
      workerRequest++;
      popoverClose();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    hideHover();
    if (!popover.hidden) {
      workerRequest++;
      popoverClose();
    }
  });
  for (const type of ["scroll", "resize"])
    window.addEventListener(
      type,
      () => {
        hideHover();
        placePopover();
      },
      { passive: true, capture: type === "scroll" },
    );
  root.addEventListener("pointerdown", () => momentum.stop(), {
    capture: true,
  });
  slider.addEventListener("input", () => {
    interact();
    move(2 ** Number(slider.value), center);
  });
  stage.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX))
        return;
      interact();
      e.preventDefault();
      const box = stage.getBoundingClientRect();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey)
        move(scale, center + e.deltaX / width / scale);
      else
        zoom(
          Math.exp(-clamp(e.deltaY, -120, 120) * 0.007),
          (e.clientX - box.left) / width,
        );
    },
    { passive: false },
  );
  stage.addEventListener("dblclick", (e) => {
    e.preventDefault();
    zoom(2, (e.clientX - stage.getBoundingClientRect().left) / width);
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    interact();
    momentum.stop();
    stopTween();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.values()];
    momentum.begin(e.clientX, 0, e.timeStamp);
    gesture = {
      x: e.clientX,
      center,
      scale,
      distance:
        points.length === 2
          ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
          : 0,
    };
    dragged = false;
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.values()];
    if (points.length === 2 && gesture.distance > 0) {
      momentum.stop();
      const distance = Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y,
        ),
        anchor =
          ((points[0].x + points[1].x) / 2 -
            stage.getBoundingClientRect().left) /
          width,
        next = clamp(
          (gesture.scale * distance) / gesture.distance,
          1,
          maxScale(),
        );
      const range = zoomCamera(
        layout.total,
        gesture.scale,
        gesture.center,
        next,
        anchor,
      );
      scale = next;
      center = range.center;
      dragged = true;
      schedule();
    } else {
      const dx = e.clientX - gesture.x;
      if (Math.abs(dx) > 5) {
        dragged = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("panning");
        center = cameraRange(
          layout.total,
          scale,
          gesture.center - dx / width / scale,
        ).center;
        momentum.sample(e.clientX, 0, e.timeStamp);
        schedule();
      }
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    const wasPinch = pointers.size > 1;
    pointers.delete(e.pointerId);
    stage.classList.remove("panning");
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture = { x: p.x, center, scale, distance: 0 };
      momentum.begin(p.x, 0, e.timeStamp);
    } else if (e.type === "pointerup" && dragged && !wasPinch) {
      if (!momentum.release(e.timeStamp)) notify();
    } else {
      momentum.stop();
      notify();
    }
  }
  stage.addEventListener("pointerup", pointerEnd);
  stage.addEventListener("pointercancel", (e) => {
    pointerEnd(e);
    dragged = false;
  });
  stage.addEventListener("lostpointercapture", (e) => {
    if (e.target !== stage || stage.hasPointerCapture(e.pointerId)) return;
    if (pointers.has(e.pointerId)) {
      pointerEnd(e);
      dragged = false;
    }
  });
  stage.addEventListener("click", (e) => {
    if (e.target !== canvas || dragged) return;
    const y = e.clientY - stage.getBoundingClientRect().top;
    if (y >= bandTop && y <= bandTop + bandHeight) {
      const item = pointTask(e.clientX - stage.getBoundingClientRect().left);
      if (item) {
        if (width / (layout.total / scale) < 32)
          fitIndices([item.group.start, item.group.end - 1]);
        else select(item.task.id);
      }
    }
  });
  stage.addEventListener("keydown", (e) => {
    if (e.target !== stage) return;
    if (["+", "=", "-", "ArrowLeft", "ArrowRight", "Home"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "Home") move(1, 0.5, { animate: true });
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        move(scale, center + (e.key === "ArrowLeft" ? -0.2 : 0.2) / scale);
      else zoom(e.key === "-" ? 0.5 : 2);
    }
  });
  let miniDrag = false;
  const miniMove = (e) => {
    const b = minimap.getBoundingClientRect();
    move(scale, (e.clientX - b.left) / b.width);
  };
  minimap.addEventListener("pointerdown", (e) => {
    interact();
    miniDrag = true;
    minimap.setPointerCapture(e.pointerId);
    miniMove(e);
  });
  minimap.addEventListener("pointermove", (e) => {
    if (miniDrag) miniMove(e);
  });
  minimap.addEventListener("pointerup", () => {
    miniDrag = false;
  });
  minimap.addEventListener("pointercancel", () => {
    miniDrag = false;
  });
  minimap.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      move(
        scale,
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 1
            : center + (e.key === "ArrowLeft" ? -0.1 : 0.1) / scale,
      );
    }
  });
  new ResizeObserver(() => schedule()).observe(stage);
  function refreshMarkers() {
    const all = stripActivityMarkers(layout.tasks, activity);
    activeItems = all.filter((p) => p.kind === "working");
    markers = all.filter((p) => p.kind !== "landed" || showLandings);
    landedToggle.textContent =
      "Recently landed · " + all.filter((p) => p.kind === "landed").length;
    landedToggle.setAttribute("aria-pressed", String(showLandings));
    const workers = root.querySelector("[data-focus-workers]");
    workers.textContent = "In flight · " + activeItems.length;
    workers.disabled = !activeItems.length;
  }
  return {
    updateActivity(next) {
      activity = next;
      if (input) {
        refreshMarkers();
        schedule();
      }
    },
    render(next) {
      input = next;
      layout = stripLayout(next.data, {
        scope: next.scope,
        matchingIds: next.matchingIds,
        order: next.order,
      });
      refreshMarkers();
      for (const group of layout.groups)
        group.prefix = opacityPrefix(next.data, group.tasks, next.matchingIds);
      const summary = root.querySelector(".strip-progress-summary");
      summary.hidden = next.order !== "progress";
      summary.innerHTML = layout.sections
        .map(
          (s) =>
            `<button data-strip-section="${s.id}">${s.title} <b>${s.total}</b></button>`,
        )
        .join("");
      for (const b of root.querySelectorAll("[data-strip-order]"))
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.stripOrder === (next.order || "chronological")),
        );
      if (scope !== next.scope) {
        scope = next.scope;
        scale = next.scale || 1;
        center = next.center ?? 0.5;
      }
      if (next.focusToken && next.focusToken !== focusToken) {
        focusToken = next.focusToken;
        if (next.focusMatches) fitMatches();
        else move(next.scale || 1, next.center ?? 0.5, { animate: true });
      } else {
        if (!tween && !momentum.running) {
          scale = next.scale || scale;
          center = next.center ?? center;
        }
        schedule();
      }
    },
    suspend() {
      momentum.stop();
      pointers.clear();
      gesture = null;
      stopTween();
      cancelAnimationFrame(raf);
      raf = 0;
      input = null;
      activeItems = [];
      markers = [];
      workerRequest++;
      activityTask = "";
      root.querySelector(".strip-workers").replaceChildren();
      pinIndex = new Map();
      hideHover();
      popoverClose();
      layout = { groups: [], tasks: [], total: 0 };
      labels.replaceChildren();
      canvas.width = 0;
      miniCanvas.width = 0;
    },
    setSelection(id) {
      if (input) input.selected = id;
      schedule();
    },
  };
}
