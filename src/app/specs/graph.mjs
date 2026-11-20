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
