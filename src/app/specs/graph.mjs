// One graph builder (simplify §D8): the specs as phases of items in list
// order, each leaf's state, and the waits §D19 derives. The page's Graph,
// `avoozl graph` and `plans_graph` read it; two printers turn it into text
// and Mermaid.
import {
  isManual,
  isParallel,
  taskTree,
  waitsOf,
  withoutManual,
} from "./order.mjs";
import { headingPhases } from "./spec-plans.mjs";
import { splitRefs } from "./spec-refs.mjs";

const PARALLEL = /\s*\(\*\*PARALLEL\*\*\)$/;

// A title as the graph shows it: no refs or backticks, tags in plain words.
function label(title) {
  const plain = splitRefs(String(title ?? "")).title.replace(/`/g, "");
  if (isParallel(plain)) return `${plain.replace(PARALLEL, "")} (PARALLEL)`;
  if (isManual(plain)) return `${withoutManual(plain)} (MANUAL)`;
  return plain;
}

// The graph of `specs` ([{name, text}]): `stateOf(id, leaf)` gives a leaf's
// state (landed, claimed, ready, waiting or manual); `linked` (a
// linkedReader) reaches into linked specs.
export function graphOf(
  specs,
  { stateOf = () => "waiting", linked = null, scope = null } = {},
) {
  const out = [],
    edges = [];
  for (const { name, text } of specs) {
    const { phases } = taskTree(name, text, linked),
      headings = headingPhases(text),
      titleOf = (node) => headings.get(node.item?.line)?.title ?? null,
      itemOf = (node) => {
        const title = label(node.item?.title);
        if (node.children.length)
          return {
            id: node.id,
            title,
            state: "group",
            parallel: isParallel(String(node.item?.title ?? "").trim()),
            items: node.children.flatMap((child) =>
              child.item ? [itemOf(child)] : child.children.map(itemOf),
            ),
          };
        const manual = isManual(String(node.item?.title ?? "").trim());
        return {
          id: node.id,
          title,
          state: stateOf(node.id, { manual, mark: node.item?.mark }),
          manual,
        };
      };
    out.push({
      name,
      phases: phases.map((items) => ({
        title: titleOf(items[0]),
        items: items.map(itemOf),
      })),
    });
    edges.push(...waitsOf(name, text, linked));
  }
  // Edges in file order of the task they lead to, then the one they leave.
  const order = new Map();
  const visit = (items) => {
    for (const item of items) {
      order.set(item.id, order.size);
      if (item.items) visit(item.items);
    }
  };
  for (const spec of out) for (const phase of spec.phases) visit(phase.items);
  const at = (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  edges.sort((a, b) => at(a.to) - at(b.to) || at(a.from) - at(b.from));
  return { scope, specs: out, edges };
}

const leavesOf = (items) =>
  items.flatMap((item) => (item.items ? leavesOf(item.items) : [item]));

const cut = (text, width) =>
  text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`;

// The graph as plain text, at most `width` columns, no escape codes: one
// line per item in list order, children indented under their group.
export function graphText(graph, { width = 80 } = {}) {
  const lines = [];
  for (const spec of graph.specs) {
    const leaves = spec.phases.flatMap((phase) => leavesOf(phase.items)),
      counts = {};
    for (const leaf of leaves)
      counts[leaf.state] = (counts[leaf.state] ?? 0) + 1;
    const summary = `${leaves.length} tasks: ${[
      "landed",
      "claimed",
      "ready",
      "waiting",
      "manual",
    ]
      .filter((state) => counts[state])
      .map((state) => `${counts[state]} ${state}`)
      .join(" ")}`;
    const gap = Math.max(1, width - spec.name.length - summary.length);
    lines.push(cut(`${spec.name}${" ".repeat(gap)}${summary}`, width));
    const idWidth = Math.max(
      0,
      ...leaves.map((leaf) => leaf.id.length),
      ...spec.phases.flatMap((phase) =>
        phase.items.map((item) => item.id.length),
      ),
    );
    const walk = (items, depth) => {
      for (const item of items) {
        const pad = "  ".repeat(depth),
          head = `  ${item.state.padEnd(9)}${pad}${item.id.padEnd(idWidth)}  `;
        lines.push(cut(`${head}${item.title}`, width));
        if (item.items) walk(item.items, depth + 1);
      }
    };
    for (const phase of spec.phases) {
      if (phase.title) lines.push(cut(phase.title, width));
      walk(phase.items, 0);
    }
  }
  return lines.join("\n") + "\n";
}

// Node IDs: each character outside [A-Za-z0-9] as `_`; a later ID that
// maps to a taken one gets `_2`, `_3`.
function nodeIds(graph) {
  const ids = new Map(),
    used = new Set(),
    add = (id) => {
      if (ids.has(id)) return;
      const base = id.replace(/[^A-Za-z0-9]/g, "_");
      let name = base;
      for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
      used.add(name);
      ids.set(id, name);
    };
  const walk = (items) => {
    for (const item of items) {
      add(item.id);
      if (item.items) walk(item.items);
    }
  };
  for (const spec of graph.specs)
    for (const phase of spec.phases) walk(phase.items);
  return ids;
}

const quote = (text) => `"${text.replace(/"/g, "#quot;")}"`;
const STATES = ["landed", "claimed", "ready", "waiting", "manual"];

// The graph as a Mermaid flowchart: one subgraph per phase and per group,
// one edge per wait. With `state`, classDef lines color each leaf.
export function graphMermaid(graph, { state = false } = {}) {
  const ids = nodeIds(graph),
    lines = ["flowchart TD"];
  let phaseNumber = 0;
  const walk = (items, indent) => {
    for (const item of items) {
      const text = `${item.id} ${item.title}`;
      if (item.items) {
        lines.push(`${indent}subgraph g_${ids.get(item.id)}[${quote(text)}]`);
        walk(item.items, `${indent}  `);
        lines.push(`${indent}end`);
      } else
        lines.push(
          `${indent}${ids.get(item.id)}[${quote(text)}]${state ? `:::${item.state}` : ""}`,
        );
    }
  };
  for (const spec of graph.specs)
    for (const phase of spec.phases) {
      phaseNumber++;
      lines.push(
        `  subgraph s${phaseNumber}[${quote(phase.title ?? spec.name)}]`,
      );
      walk(phase.items, "    ");
      lines.push("  end");
    }
  for (const { from, to } of graph.edges)
    if (ids.has(from) && ids.has(to))
      lines.push(`  ${ids.get(from)} --> ${ids.get(to)}`);
  if (state)
    for (const name of STATES)
      lines.push(`  classDef ${name} stroke-width:2px`);
  return lines.join("\n") + "\n";
}

// The graph of the stored specs, with each leaf's state from the store:
// `scope` names one spec, or none for every spec no other spec links. A
// spec group shows the spec it links inside it (§D19.2), so no spec is
// listed twice.
export function storeGraph(
  store,
  { scope = null, linked, ready, busy, complete },
) {
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    texts = new Map(
      store
        .list("plans")
        .filter(
          (plan) => plan.spec && !plan.deletedAt && plan.files?.["tasks.md"],
        )
        .map((plan) => [plan.spec, plan.files["tasks.md"]]),
    ),
    names = scope
      ? [scope].filter((name) => texts.has(name))
      : [...texts.keys()]
          .filter((name) => !linked?.parents(name).length)
          .sort();
  const stateOf = (id, { manual, mark }) => {
    const task = tasks.get(id);
    if (mark === "x" || (task && complete(task.status))) return "landed";
    if (busy.has(id)) return "claimed";
    if (manual) return "manual";
    return ready.has(id) ? "ready" : "waiting";
  };
  return graphOf(
    names.map((name) => ({ name, text: texts.get(name) })),
    { stateOf, linked, scope },
  );
}

// The graph block (simplify §D9): the builder's Mermaid, with no state,
// between two markers at the end of tasks.md. It is optional; when present
// it must match.
export const GRAPH_START = "<!-- avoozl:graph start -->";
export const GRAPH_END = "<!-- avoozl:graph end -->";

// The block text for one spec's tasks.md.
export function graphBlock(name, text, linked = null) {
  const mermaid = graphMermaid(
    graphOf([{ name, text: withoutGraphBlock(text) }], { linked }),
  );
  return `${GRAPH_START}\n\`\`\`mermaid\n${mermaid}\`\`\`\n${GRAPH_END}`;
}

// Where the block is: {start, end} line indexes (0-based, inclusive), or
// null; `problem` names a second block or an unclosed one.
function findBlock(text) {
  const rows = String(text ?? "").split("\n"),
    starts = [],
    ends = [];
  rows.forEach((row, index) => {
    if (row.trim() === GRAPH_START) starts.push(index);
    if (row.trim() === GRAPH_END) ends.push(index);
  });
  if (!starts.length && !ends.length) return null;
  if (starts.length > 1 || ends.length > 1)
    return { problem: "second", line: (starts[1] ?? ends[1]) + 1 };
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0])
    return { problem: "unclosed", line: (starts[0] ?? ends[0]) + 1 };
  return { start: starts[0], end: ends[0] };
}

// tasks.md without its graph block (and the blank line before it).
export function withoutGraphBlock(text) {
  const found = findBlock(text);
  if (!found || found.problem) return text;
  const rows = text.split("\n"),
    before = rows.slice(0, found.start);
  while (before.length && !before.at(-1).trim()) before.pop();
  return [...before, ...rows.slice(found.end + 1)]
    .join("\n")
    .replace(/\n*$/, "\n");
}

// tasks.md with the current block in place of the old one, or at the end.
export function withGraphBlock(name, text, linked = null) {
  return `${withoutGraphBlock(text).replace(/\n*$/, "")}\n\n${graphBlock(name, text, linked)}\n`;
}

// graph.markers and graph.stale, as {code, line, message}.
export function graphBlockProblems(name, text, linked = null) {
  const found = findBlock(text);
  if (!found) return [];
  if (found.problem)
    return [
      {
        code: "graph.markers",
        line: found.line,
        message:
          found.problem === "second"
            ? "tasks.md holds a second graph block. Keep one, between one start and one end marker."
            : "The graph block has no matching start or end marker. Run avoozl graph SPEC --write.",
      },
    ];
  const rows = text.split("\n"),
    current = rows.slice(found.start, found.end + 1).join("\n");
  return current === graphBlock(name, text, linked)
    ? []
    : [
        {
          code: "graph.stale",
          line: found.start + 1,
          message:
            "The graph block differs from the task list. Run avoozl graph SPEC --write to make it again.",
        },
      ];
}
