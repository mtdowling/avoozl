import { createPanMomentum } from "./pan-momentum.mjs";
import { epicProgress, taskProgress } from "./progress-model.mjs";
import { statusComplete } from "./query.mjs";
import { opacityPrefix, paintBand } from "./band-paint.mjs";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const color = (c) => (/^#[\da-f]{6}$/i.test(c || "") ? c : "#a7b8ff");
export function createEpicProgress(root, { select, changeZoom }) {
  let current,
    rows = [],
    zoom = 100,
    frame = 0,
    viewport,
    chart,
    observer;
  const momentum = createPanMomentum({
    move(dx, dy) {
      if (!viewport || !current || root.hidden) return false;
      const x = viewport.scrollLeft,
        y = viewport.scrollTop;
      viewport.scrollLeft -= dx;
      viewport.scrollTop -= dy;
      return { x: viewport.scrollLeft - x, y: viewport.scrollTop - y };
    },
  });
  const rowHeight = 144,
    axisHeight = 88; // Scrolling title (64px) and axis (24px).
  function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function paint() {
    frame = 0;
    if (!current || root.hidden || !viewport) return;
    const labelWidth = viewport.clientWidth < 600 ? 150 : 220,
      bandView = Math.max(120, viewport.clientWidth - labelWidth),
      maxTasks = rows.reduce((max, r) => Math.max(max, r.total), 0),
      bandWidth = (bandView * zoom) / 100,
      left = viewport.scrollLeft,
      start = Math.max(
        0,
        Math.floor((viewport.scrollTop - axisHeight) / rowHeight) - 1,
      ),
      end = Math.min(
        rows.length,
        start + Math.ceil(viewport.clientHeight / rowHeight) + 3,
      );
    chart.style.width = Math.max(bandView, bandWidth) + labelWidth + "px";
    chart.style.height = axisHeight + rows.length * rowHeight + "px";
    for (const header of chart.querySelectorAll(
      ".epic-scroll-heading,.epic-axis",
    )) {
      header.style.left = left + "px";
      header.style.width = viewport.clientWidth + "px";
    }
    const keep = new Set();
    for (let index = start; index < end; index++) {
      const row = rows[index],
        id = String(index);
      keep.add(id);
      let el = chart.querySelector('[data-virtual-epic="' + id + '"]');
      if (!el) {
        el = document.createElement("section");
        el.className = "epic-window-row";
        el.dataset.virtualEpic = id;
        el.style.top = axisHeight + index * rowHeight + "px";
        el.innerHTML = `<div class="epic-window-label"><button data-progress-epic="${esc(row.id)}"><small>${esc(row.id.startsWith("doc:") ? "PLAN" : row.id)}</small><strong>${esc(row.title)}</strong></button><span>${row.complete} / ${row.total} · <b>${row.percent}%</b></span><div class="epic-mini"><i style="width:${row.percent}%"></i></div></div><div class="epic-window-band"><canvas></canvas><div class="epic-window-tasks"></div></div>`;
        chart.append(el);
      }
      el.style.width = bandWidth + labelWidth + "px";
      const label = el.querySelector(".epic-window-label");
      label.style.width = labelWidth + "px";
      label.style.left = left + "px";
      const band = el.querySelector(".epic-window-band");
      band.style.left = left + labelWidth + "px";
      band.style.width = bandView + "px";
      const canvas = band.querySelector("canvas"),
        dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = bandView * dpr;
      canvas.height = 112 * dpr;
      canvas.style.width = bandView + "px";
      canvas.style.height = "112px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const unit = bandWidth / Math.max(1, row.total);
      paintBand(ctx, row.prefix, {
        offset: -left,
        unit,
        width: bandView,
        y: 8,
        height: 92,
        color: color(row.color),
      });
      const first = Math.max(0, Math.floor(left / unit)),
        last = Math.min(row.total, Math.ceil((left + bandView) / unit)),
        names = unit >= 27;
      let html = "";
      if (names)
        for (let i = first; i < last; i++) {
          const t = row.tasks[i],
            done = statusComplete(current.data, t.status);
          html += `<button class="epic-window-task ${current.selected === t.id ? "selected" : ""}" data-progress-task="${esc(t.id)}" style="left:${i * unit - left}px;width:${Math.max(1, unit - 2)}px;opacity:${(current.matchingIds.has(t.id) ? 1 : 0.3) * Math.min(1, Math.max(0, (unit - 26) / 30))}" title="${esc(t.title)}"><small>${i + 1}</small><strong>${esc(t.title)}</strong>${unit > 100 ? `<span>${esc(current.data.statuses.find((s) => s.id === t.status)?.label || t.status)}</span><i style="--progress:${taskProgress(current.data, t) * 100}%"></i>` : ""}</button>`;
        }
      el.querySelector(".epic-window-tasks").innerHTML = html;
      canvas.dataset.row = String(index);
      canvas.dataset.unit = String(unit);
      canvas.dataset.left = String(left);
      canvas.setAttribute("role", "button");
      canvas.tabIndex = 0;
      canvas.setAttribute(
        "aria-label",
        row.title + " task bar; zoom in for individual task names",
      );
      const selected = row.tasks.findIndex((t) => t.id === current.selected);
      if (selected >= first && selected < last) {
        ctx.strokeStyle = "#eaf6f0";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          selected * unit - left + 1,
          9,
          Math.max(2, unit - 3),
          90,
        );
      }
    }
    for (const el of chart.querySelectorAll("[data-virtual-epic]"))
      if (!keep.has(el.dataset.virtualEpic)) el.remove();
  }
  function render(input) {
    if (!input) return;
    momentum.stop();
    gestures.reset();
    const left = viewport?.scrollLeft || 0,
      top = viewport?.scrollTop || 0;
    current = input;
    zoom = input.zoom || 100;
    rows = epicProgress(input.data, {
      scope: input.scope,
      matchingIds: input.matchingIds,
    }).map((r) => ({
      ...r,
      prefix: opacityPrefix(input.data, r.tasks, input.matchingIds, {
        partial: 0.5,
        open: 0.25,
        filtered: 0.22,
      }),
    }));
    observer?.disconnect();
    root.innerHTML = `<div class="epic-controls" role="group" aria-label="Epic zoom controls"><div class="epic-zoom"><button class="button subtle" data-epic-zoom="100">Fit</button><div class="epic-scale"><button data-epic-factor=".8" aria-label="Zoom epic bars out">−</button><input type="range" min="0" max="14" step="0.01" value="${Math.log2(zoom)}" aria-label="Epic zoom"><button data-epic-factor="1.25" aria-label="Zoom epic bars in">＋</button><output>${zoom < 1000 ? zoom.toFixed(1) : Math.round(zoom)}%</output></div></div></div><div class="epic-scroll" tabindex="0" aria-label="Epic progress chart. Pinch to zoom; drag in any direction."><div class="epic-chart-window"><header class="epic-scroll-heading"><h2>Progress by epic</h2><p>${rows.length} epics · pinch to zoom, drag in any direction.</p></header><div class="epic-axis"><span>0% · plan order →</span><span>100% of scope</span></div></div></div>`;
    viewport = root.querySelector(".epic-scroll");
    chart = root.querySelector(".epic-chart-window");
    const labelWidth = viewport.clientWidth < 600 ? 150 : 220,
      bandView = Math.max(120, viewport.clientWidth - labelWidth);
    chart.style.width =
      Math.max(bandView, (bandView * zoom) / 100) + labelWidth + "px";
    chart.style.height = axisHeight + rows.length * rowHeight + "px";
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
    viewport.addEventListener("scroll", schedule, { passive: true });
    observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    schedule();
  }
  function captureCamera(clientX) {
    const labelWidth = viewport.clientWidth < 600 ? 150 : 220,
      bandView = Math.max(120, viewport.clientWidth - labelWidth),
      anchor =
        clientX == null
          ? bandView / 2
          : Math.max(
              0,
              Math.min(
                bandView,
                clientX - viewport.getBoundingClientRect().left - labelWidth,
              ),
            );
    return {
      zoom,
      fraction: (viewport.scrollLeft + anchor) / ((bandView * zoom) / 100),
      top: viewport.scrollTop,
      anchor,
      bandView,
      labelWidth,
    };
  }
  function setZoom(value, clientX, camera = {}) {
    momentum.stop();
    if (!viewport) return;
    const { anchor, bandView, labelWidth } = captureCamera(clientX),
      next = zoomEpicCamera(
        { zoom, left: viewport.scrollLeft, width: bandView, anchor },
        value,
        camera.fraction,
      );
    zoom = next.zoom;
    changeZoom(zoom);
    current.zoom = zoom;
    root.querySelector("input[type=range]").value = Math.log2(zoom);
    root.querySelector("output").textContent =
      (zoom < 1000 ? zoom.toFixed(1) : Math.round(zoom)) + "%";
    chart.style.width =
      Math.max(bandView, (bandView * zoom) / 100) + labelWidth + "px";
    viewport.scrollLeft = next.left;
    if (camera.top !== undefined) viewport.scrollTop = Math.max(0, camera.top);
    schedule();
  }
  const gestures = installEpicGestures(root, {
    getViewport: () => viewport,
    captureCamera,
    setZoom,
    momentum,
  });

  root.addEventListener("click", (e) => {
    if (gestures.consumeClick(e)) return;
    const b = e.target.closest("button");
    if (b?.dataset.progressTask) select(b.dataset.progressTask);
    else if (b?.dataset.progressEpic) select("epic:" + b.dataset.progressEpic);
    else if (b?.dataset.epicZoom) setZoom(b.dataset.epicZoom);
    else if (b?.dataset.epicFactor)
      setZoom(zoom * Number(b.dataset.epicFactor));
    else if (e.target.matches("canvas[data-row]")) {
      const row = rows[Number(e.target.dataset.row)],
        i = Math.floor(
          (e.clientX -
            e.target.getBoundingClientRect().left +
            Number(e.target.dataset.left)) /
            Number(e.target.dataset.unit),
        );
      if (row.tasks[i]) select(row.tasks[i].id);
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches("input[type=range]"))
      setZoom(2 ** Number(e.target.value));
  });

  return {
    render,
    setSelection(id) {
      if (current) current.selected = id;
      schedule();
    },
    suspend() {
      momentum.stop();
      gestures.reset();
      cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      current = null;
      rows = [];
      root.replaceChildren();
      viewport = null;
      chart = null;
    },
  };
}

// Keep pointer, wheel and Safari trackpad gestures on the same chart camera.
export function installEpicGestures(
  root,
  { getViewport, captureCamera, setZoom, momentum },
) {
  const pointers = new Map();
  let pan = null,
    pinch = null,
    safari = null,
    suppressClick = false,
    wheelBlockedUntil = 0;
  const midpoint = (points) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  });
  const distance = (points) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  function reset() {
    pointers.clear();
    pan = pinch = safari = null;
    suppressClick = false;
    wheelBlockedUntil = 0;
    getViewport()?.classList.remove("panning");
  }
  function rebase(time) {
    const viewport = getViewport(),
      points = [...pointers.values()];
    pan = pinch = null;
    if (!viewport) return;
    if (points.length >= 2) {
      safari = null;
      const middle = midpoint(points);
      pinch = {
        ...captureCamera(middle.x),
        y: middle.y,
        distance: Math.max(1, distance(points)),
      };
      suppressClick = true;
      momentum.stop();
      viewport.classList.remove("panning");
      for (const id of pointers.keys())
        if (!viewport.hasPointerCapture(id)) viewport.setPointerCapture(id);
    } else if (points.length) {
      const [id, point] = [...pointers][0];
      pan = {
        id,
        ...point,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
        moved: false,
      };
      momentum.begin(point.x, point.y, time);
    }
  }
  root.addEventListener("pointerdown", (e) => {
    momentum.stop();
    if (e.button !== 0 || !e.target.closest(".epic-scroll") || !getViewport())
      return;
    if (!pointers.size) suppressClick = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase(e.timeStamp);
  });
  root.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const viewport = getViewport();
    if (!viewport) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const points = [...pointers.values()],
        middle = midpoint(points);
      setZoom((pinch.zoom * distance(points)) / pinch.distance, middle.x, {
        fraction: pinch.fraction,
        top: pinch.top - (middle.y - pinch.y),
      });
      return;
    }
    if (pan?.id !== e.pointerId) return;
    const dx = e.clientX - pan.x,
      dy = e.clientY - pan.y;
    if (Math.hypot(dx, dy) > 7) {
      pan.moved = true;
      suppressClick = true;
      viewport.classList.add("panning");
      if (!viewport.hasPointerCapture(e.pointerId))
        viewport.setPointerCapture(e.pointerId);
    }
    if (pan.moved) {
      viewport.scrollLeft = pan.left - dx;
      viewport.scrollTop = pan.top - dy;
      momentum.sample(e.clientX, e.clientY, e.timeStamp);
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    const moved = pan?.moved;
    pointers.delete(e.pointerId);
    getViewport()?.classList.remove("panning");
    if (e.type !== "pointerup") {
      reset();
      suppressClick = true;
      momentum.stop();
      return;
    }
    if (pointers.size) {
      rebase(e.timeStamp);
      return;
    }
    pan = pinch = null;
    if (moved) momentum.release(e.timeStamp);
    else momentum.stop();
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    root.addEventListener(type, pointerEnd);
  root.addEventListener(
    "wheel",
    (e) => {
      momentum.stop();
      if ((!e.ctrlKey && !e.metaKey) || !getViewport()) return;
      e.preventDefault();
      if (safari || pointers.size >= 2 || e.timeStamp < wheelBlockedUntil)
        return;
      const unit =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? getViewport().clientHeight
            : 1;
      setZoom(
        captureCamera(e.clientX).zoom *
          Math.exp(-Math.max(-80, Math.min(80, e.deltaY * unit)) * 0.004),
        e.clientX,
      );
    },
    { passive: false },
  );
  function gesturePoint(e) {
    const viewport = getViewport(),
      rect = viewport.getBoundingClientRect();
    return {
      x: Number.isFinite(e.clientX)
        ? e.clientX
        : rect.left + viewport.clientWidth / 2,
      y: Number.isFinite(e.clientY)
        ? e.clientY
        : rect.top + viewport.clientHeight / 2,
    };
  }
  root.addEventListener(
    "gesturestart",
    (e) => {
      if (!getViewport()) return;
      e.preventDefault();
      momentum.stop();
      suppressClick = true;
      if (pointers.size >= 2) return;
      const point = gesturePoint(e);
      safari = {
        ...captureCamera(point.x),
        y: point.y,
        scale: e.scale > 0 ? e.scale : 1,
      };
    },
    { passive: false },
  );
  root.addEventListener(
    "gesturechange",
    (e) => {
      if (!getViewport()) return;
      e.preventDefault();
      if (!safari || pointers.size >= 2) return;
      const point = gesturePoint(e);
      if (Number.isFinite(e.scale) && e.scale > 0)
        setZoom((safari.zoom * e.scale) / safari.scale, point.x, {
          fraction: safari.fraction,
          top: safari.top - (point.y - safari.y),
        });
    },
    { passive: false },
  );
  root.addEventListener(
    "gestureend",
    (e) => {
      if (!getViewport()) return;
      e.preventDefault();
      safari = null;
      wheelBlockedUntil = e.timeStamp + 80;
      momentum.stop();
    },
    { passive: false },
  );
  root.addEventListener("keydown", () => momentum.stop());
  return {
    reset,
    consumeClick(event) {
      if (
        event &&
        (!event.target.closest(".epic-scroll") || event.detail === 0)
      )
        return false;
      const ignored = suppressClick;
      suppressClick = false;
      return ignored;
    },
  };
}

export function zoomEpicCamera(
  { zoom, left, width, anchor },
  value,
  fraction = (left + anchor) / ((width * zoom) / 100),
) {
  const requested = Number(value),
    next = Math.max(
      1,
      Math.min(16384, Number.isFinite(requested) ? requested : 100),
    );
  return {
    zoom: next,
    left: Math.max(0, (fraction * width * next) / 100 - anchor),
  };
}
