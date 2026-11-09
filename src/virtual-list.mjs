export function rowOffsets(items, height = 76) {
  const offsets = new Float64Array(items.length + 1);
  for (let i = 0; i < items.length; i++)
    offsets[i + 1] =
      offsets[i] +
      (typeof height === "function" ? height(items[i], i) : height);
  return offsets;
}
function lowerBound(values, value) {
  let lo = 0,
    hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function visibleRange(offsets, top, height, overscan = 4) {
  const total = offsets.length - 1,
    start = Math.max(0, lowerBound(offsets, Math.max(0, top)) - 1 - overscan),
    end = Math.min(
      total,
      lowerBound(offsets, Math.max(0, top) + Math.max(1, height)) + overscan,
    );
  return { start, end, totalHeight: offsets[total] || 0 };
}
export function createVirtualList(
  viewport,
  {
    items = [],
    render,
    height = 76,
    key = (item, i) => item.id ?? i,
    label = "Items",
  } = {},
) {
  let offsets = rowOffsets(items, height),
    frame = 0,
    disposed = false;
  const mounted = new Map(),
    content = document.createElement("div");
  content.className = "virtual-content";
  viewport.classList.add("virtual-viewport");
  viewport.setAttribute("aria-label", label);
  viewport.tabIndex = 0;
  viewport.replaceChildren(content);
  content.style.height = (offsets.at(-1) || 0) + "px";
  function paint() {
    frame = 0;
    if (disposed || !viewport.isConnected || viewport.closest("[hidden]"))
      return;
    const { start, end, totalHeight } = visibleRange(
      offsets,
      viewport.scrollTop,
      viewport.clientHeight,
    );
    content.style.height = totalHeight + "px";
    const keep = new Set();
    for (let i = start; i < end; i++) {
      const id = String(key(items[i], i));
      keep.add(id);
      let row = mounted.get(id);
      if (!row) {
        row = document.createElement("div");
        row.className = "virtual-row";
        row.dataset.virtualKey = id;
        row.innerHTML = render(items[i], i);
        mounted.set(id, row);
        content.append(row);
      }
      row.style.top = offsets[i] + "px";
      row.style.height = offsets[i + 1] - offsets[i] + "px";
      row.setAttribute("aria-posinset", String(i + 1));
      row.setAttribute("aria-setsize", String(items.length));
    }
    for (const [id, row] of mounted)
      if (!keep.has(id)) {
        row.remove();
        mounted.delete(id);
      }
  }
  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(paint);
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(viewport);
  viewport.addEventListener("scroll", schedule, { passive: true });
  schedule();
  return {
    setItems(next) {
      items = next;
      offsets = rowOffsets(items, height);
      mounted.clear();
      content.replaceChildren();
      content.style.height = (offsets.at(-1) || 0) + "px";
      schedule();
    },
    refresh: schedule,
    scrollToIndex(index) {
      viewport.scrollTop =
        offsets[Math.max(0, Math.min(items.length - 1, index))] || 0;
      schedule();
    },
    destroy() {
      disposed = true;
      observer.disconnect();
      viewport.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
      mounted.clear();
      items = [];
      offsets = new Float64Array();
      viewport.replaceChildren();
    },
  };
}
