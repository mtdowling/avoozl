import { statusComplete } from "./query.mjs";
export function opacityPrefix(
  data,
  tasks,
  matches,
  { partial = 0.6, open = 0.36, filtered = 0.25 } = {},
) {
  const prefix = new Float64Array(tasks.length + 1);
  for (let i = 0; i < tasks.length; i++)
    prefix[i + 1] =
      prefix[i] +
      (statusComplete(data, tasks[i].status)
        ? 1
        : tasks[i].status === "partial"
          ? partial
          : open) *
        (matches.has(tasks[i].id) ? 1 : filtered);
  return prefix;
}
export function paintBand(
  ctx,
  prefix,
  { offset = 0, unit, width, y, height, color },
) {
  const count = prefix.length - 1;
  ctx.fillStyle = color;
  if (unit < 2) {
    for (
      let x = Math.max(0, Math.floor(offset));
      x < Math.min(width, offset + count * unit);
      x += 2
    ) {
      const start = Math.max(
          0,
          Math.min(count - 1, Math.floor((x - offset) / unit)),
        ),
        end = Math.max(
          start + 1,
          Math.min(count, Math.ceil((x + 2 - offset) / unit)),
        );
      ctx.globalAlpha = (prefix[end] - prefix[start]) / (end - start);
      ctx.fillRect(x, y, 2, height);
    }
  } else
    for (
      let i = Math.max(0, Math.floor(-offset / unit));
      i < Math.min(count, Math.ceil((width - offset) / unit));
      i++
    ) {
      ctx.globalAlpha = prefix[i + 1] - prefix[i];
      ctx.fillRect(
        offset + i * unit,
        y,
        Math.max(0.1, unit - (unit > 9 ? 2 : 0)),
        height,
      );
    }
  ctx.globalAlpha = 1;
}
