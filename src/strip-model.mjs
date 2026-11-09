import { epicProgress } from "./progress-model.mjs";
import { statusComplete } from "./query.mjs";
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function stripLayout(data, options = {}) {
  if (options.order === "progress") {
    let offset = 0;
    const groups = [],
      sections = [],
      epics = epicProgress(data, options);
    const progress = (t) =>
      statusComplete(data, t.status)
        ? "done"
        : t.status === "partial" || (t.progressPercent || 0) > 0
          ? "partial"
          : "remaining";
    for (const [id, title] of [
      ["done", "Done"],
      ["partial", "Partly done"],
      ["remaining", "Not started"],
    ]) {
      const section = { id, title, start: offset };
      for (const group of epics) {
        const tasks = group.tasks.filter((t) => progress(t) === id);
        if (!tasks.length) continue;
        const start = offset;
        offset += tasks.length;
        groups.push({
          ...group,
          key: id + ":" + group.id,
          tasks,
          total: tasks.length,
          start,
          end: offset,
          section: id,
        });
      }
      section.end = offset;
      section.total = offset - section.start;
      if (section.total) sections.push(section);
    }
    return {
      groups,
      sections,
      total: offset,
      tasks: groups.flatMap((group) =>
        group.tasks.map((task, i) => ({ task, group, index: group.start + i })),
      ),
    };
  }
  let offset = 0;
  const groups = epicProgress(data, options).map((group) => {
    const start = offset;
    offset += group.total;
    return { ...group, start, end: offset };
  });
  return {
    groups,
    sections: [],
    total: offset,
    tasks: groups.flatMap((group) =>
      group.tasks.map((task, i) => ({ task, group, index: group.start + i })),
    ),
  };
}
export function cameraRange(total, scale = 1, center = 0.5) {
  const span = total / Math.max(1, scale),
    start = clamp(center * total - span / 2, 0, Math.max(0, total - span));
  return {
    start,
    end: start + span,
    span,
    center: total ? (start + span / 2) / total : 0.5,
  };
}
export function zoomCamera(total, scale, center, nextScale, anchor = 0.5) {
  const old = cameraRange(total, scale, center),
    point = old.start + old.span * anchor;
  return cameraRange(
    total,
    nextScale,
    total ? (point + (total / nextScale) * (0.5 - anchor)) / total : 0.5,
  );
}
export function focusCamera(total, indices, padding = 0.15) {
  if (!indices.length || !total) return { scale: 1, center: 0.5 };
  let start = Infinity,
    end = -Infinity;
  for (const index of indices) {
    start = Math.min(start, index);
    end = Math.max(end, index + 1);
  }
  const span = Math.min(total, Math.max(1, end - start) * (1 + padding * 2));
  return { scale: total / span, center: (start + end) / (2 * total) };
}
