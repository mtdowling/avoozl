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
// `table` turns the list into a real <table>: the caller's render returns one
// <tr>, and the rows outside the window are represented by a sized spacer row
// above and below rather than by absolute positioning. Screen readers get the
// true row count through aria-rowcount, since only the window is in the DOM.
export function createVirtualList(
  viewport,
  {
    items = [],
    render,
    height = 76,
    key = (item, i) => item.id ?? i,
    label = "Items",
    table = null,
  } = {},
) {
  let offsets = rowOffsets(items, height),
    frame = 0,
    disposed = false;
  const mounted = new Map(),
    columns = table?.columns || 1;
  let content, element, lead, trail;
  viewport.classList.add("virtual-viewport");
  viewport.setAttribute("aria-label", label);
  viewport.tabIndex = 0;
  function spacer() {
    const row = document.createElement("tr");
    row.className = "virtual-spacer";
    row.setAttribute("aria-hidden", "true");
    row.innerHTML = `<td colspan="${columns}"></td>`;
    return row;
  }
  function countRows() {
    element.setAttribute(
      "aria-rowcount",
      String(items.length + (table.head ? 1 : 0)),
    );
  }
  if (table) {
    element = document.createElement("table");
    element.className = ["virtual-table", table.className]
      .filter(Boolean)
      .join(" ");
    element.innerHTML =
      (table.head ? "<thead>" + table.head + "</thead>" : "") +
      "<tbody></tbody>";
    content = element.querySelector("tbody");
    lead = spacer();
    trail = spacer();
    content.append(lead, trail);
    countRows();
    viewport.replaceChildren(element);
  } else {
    content = document.createElement("div");
    content.className = "virtual-content";
    viewport.replaceChildren(content);
    content.style.height = (offsets.at(-1) || 0) + "px";
  }
  function paint() {
    frame = 0;
    if (disposed || !viewport.isConnected || viewport.closest("[hidden]"))
      return;
    const { start, end, totalHeight } = visibleRange(
      offsets,
      viewport.scrollTop,
      viewport.clientHeight,
    );
    const keep = new Set();
    if (table) {
      lead.style.height = offsets[start] + "px";
      trail.style.height = Math.max(0, totalHeight - offsets[end]) + "px";
      let previous = lead;
      for (let i = start; i < end; i++) {
        const id = String(key(items[i], i));
        keep.add(id);
        let row = mounted.get(id);
        if (!row) {
          // Parsed against the tbody so the <tr> is not dropped as stray markup.
          trail.insertAdjacentHTML("beforebegin", render(items[i], i));
          row = trail.previousElementSibling;
          row.dataset.virtualKey = id;
          mounted.set(id, row);
        }
        if (previous.nextElementSibling !== row)
          content.insertBefore(row, previous.nextElementSibling);
        row.style.height = offsets[i + 1] - offsets[i] + "px";
        row.setAttribute("aria-rowindex", String(i + 1 + (table.head ? 1 : 0)));
        previous = row;
      }
    } else {
      content.style.height = totalHeight + "px";
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
      if (table) {
        content.replaceChildren(lead, trail);
        countRows();
      } else {
        content.replaceChildren();
        content.style.height = (offsets.at(-1) || 0) + "px";
      }
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
