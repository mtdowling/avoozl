// A generated workspace the size of a large planning repository: 41 specs,
// about 527 tasks and 931 edges. Every value is fake.
export const BIG = { specs: 41, tasks: 527, edges: 931 };

export function bigSnapshot(base, size = BIG) {
  const data = { ...base, tasks: [], edges: [], epics: [] };
  const perSpec = Math.ceil(size.tasks / size.specs);
  for (let i = 0; i < size.tasks; i += 1) {
    const spec = `spec-${String(Math.floor(i / perSpec)).padStart(2, "0")}`;
    data.tasks.push({
      id: `${spec}-t${i}`,
      title: `Task ${i} of ${spec}`,
      scope: "catalog",
      status: "planned",
      track: "catalog",
      tags: [],
      acceptance: [`Task ${i} passes its checks.`],
      plan: { id: spec },
    });
  }
  // Edges point from a task to an earlier one, so the graph has no cycle.
  const seen = new Set();
  for (let i = 1; data.edges.length < size.edges; i += 1) {
    const to = i % data.tasks.length,
      from = (i * 7 + 3) % to || 0;
    if (from === to || to === 0) continue;
    const id = `${data.tasks[from].id}:requires:${data.tasks[to].id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    data.edges.push({
      id,
      from: data.tasks[from].id,
      to: data.tasks[to].id,
      kind: "requires",
    });
    if (i > size.edges * 50) break;
  }
  return data;
}
