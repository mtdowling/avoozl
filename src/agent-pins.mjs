export function agentPins(
  items,
  { start = 0, end = 1, width = 1, gap = 38, maxPins = 120, maxRows = 3 } = {},
) {
  const capacity = Math.max(1, Math.floor(width / gap));
  maxPins = Math.max(1, Math.min(maxPins, capacity * maxRows));
  let visible = items
    .filter((item) => item.index >= start && item.index < end)
    .sort((a, b) => a.index - b.index);
  if (visible.length > maxPins) {
    const size = Math.ceil(visible.length / maxPins);
    visible = Array.from(
      { length: Math.ceil(visible.length / size) },
      (_, i) => {
        const items = visible.slice(i * size, (i + 1) * size);
        return { ...items[Math.floor(items.length / 2)], items };
      },
    );
  }
  const span = Math.max(1, end - start),
    rowCount = Math.max(1, Math.ceil(visible.length / capacity)),
    pins = [];
  for (let row = 0; row < rowCount; row++) {
    const group = visible.filter((_, i) => i % rowCount === row),
      positions = group.map((item) =>
        Math.max(
          16,
          Math.min(width - 16, ((item.index - start + 0.5) / span) * width),
        ),
      );
    for (let i = 1; i < positions.length; i++)
      positions[i] = Math.max(positions[i], positions[i - 1] + gap);
    if (positions.length && positions.at(-1) > width - 16) {
      positions[positions.length - 1] = width - 16;
      for (let i = positions.length - 2; i >= 0; i--)
        positions[i] = Math.min(positions[i], positions[i + 1] - gap);
    }
    for (let i = 0; i < group.length; i++)
      pins.push({
        ...group[i],
        anchor: Math.max(
          0,
          Math.min(width, ((group[i].index - start + 0.5) / span) * width),
        ),
        x: positions[i],
        row,
        y: 22 + row * 42,
      });
  }
  return pins;
}
