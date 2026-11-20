// Order from the list (simplify §D19): the one function that derives which
// task waits for which. Siblings run top to bottom; a task with children is a
// group; a group whose title ends with `(**PARALLEL**)` runs its children
// side by side; `##` phases run in order. The ready rule, ranking and lint
// read the waits from here.
import { headingPhases, specItems } from "./spec-plans.mjs";

export const PARALLEL_TAG = "(**PARALLEL**)";
const TAGGED = /\(\*\*PARALLEL\*\*\)$/;

export const isParallel = (title) => TAGGED.test(String(title ?? "").trim());

// The task tree of one tasks.md: each item with an ID, its children, and
// the phases its top-level items fall under, in file order.
export function taskTree(name, text) {
  const items = specItems(name, text).filter((item) => item.key),
    headings = headingPhases(text),
    nodes = new Map(),
    phases = new Map();
  // specItems copies each item, so a parent is found by its line.
  for (const item of items)
    nodes.set(item.line, { item, id: item.id, children: [] });
  for (const item of items) {
    const node = nodes.get(item.line),
      parent = item.parent && nodes.get(item.parent.line);
    if (parent) parent.children.push(node);
    else {
      const phase = headings.get(item.line)?.id ?? null;
      if (!phases.has(phase)) phases.set(phase, []);
      phases.get(phase).push(node);
    }
  }
  return { nodes: [...nodes.values()], phases: [...phases.values()] };
}

const groupOf = (children, parallel = false) => ({ children, parallel });

function first(node) {
  if (!node.children.length) return [node.id];
  if (node.parallel ?? isParallel(node.item?.title))
    return node.children.flatMap(first);
  return first(node.children[0]);
}

function last(node) {
  if (!node.children.length) return [node.id];
  if (node.parallel ?? isParallel(node.item?.title))
    return node.children.flatMap(last);
  return last(node.children.at(-1));
}

// The waits of one spec as [{from, to}] between leaves: for each pair of
// neighbors a, b in an untagged list, every leaf in first(b) waits for every
// leaf in last(a). The children of a tagged group are not neighbors.
export function waitsOf(name, text) {
  const { phases } = taskTree(name, text),
    edges = new Map(),
    walk = (list, parallel) => {
      if (!parallel)
        for (let i = 1; i < list.length; i++)
          for (const from of last(list[i - 1]))
            for (const to of first(list[i]))
              edges.set(`${from}\0${to}`, { from, to });
      for (const node of list)
        if (node.children.length)
          walk(node.children, node.parallel ?? isParallel(node.item?.title));
    };
  // A spec is a group of its phases, each a group of its top-level items.
  walk([groupOf(phases.map((items) => groupOf(items)))], false);
  return [...edges.values()];
}

// A word "parallel" in parentheses or bold that is not the one tag at the
// end of the title.
const STRAY = /\([^)]*parallel[^)]*\)|\*\*[^*]*parallel[^*]*\*\*/i;

// The list's own lint (§D19.3): group.box, parallel.size, parallel.leaf and
// parallel.tag, as {code, line, message, taskId} over specItems.
export function orderProblems(items) {
  const keyed = items.filter((item) => item.key),
    children = new Map(keyed.map((item) => [item.line, []])),
    problems = [],
    add = (code, item, message) =>
      problems.push({ code, line: item.line, message, taskId: item.id });
  for (const item of keyed)
    if (item.parent && children.has(item.parent.line))
      children.get(item.parent.line).push(item);
  for (const item of keyed) {
    const kids = children.get(item.line),
      title = String(item.title ?? "").trim(),
      tagged = isParallel(title);
    if (kids.length) {
      const open = kids.filter((kid) => kid.mark !== "x").length;
      if (item.mark === "x" && open)
        add(
          "group.box",
          item,
          `Group "${item.key}" is ticked while ${open} of its tasks are open. Untick it; its box follows its tasks.`,
        );
      if (item.mark !== "x" && !open)
        add(
          "group.box",
          item,
          `Every task of group "${item.key}" is ticked. Tick the group too; its box follows its tasks.`,
        );
    }
    if (tagged && !kids.length)
      add(
        "parallel.leaf",
        item,
        `Task "${item.key}" has no tasks under it, so ${PARALLEL_TAG} has nothing to run side by side. Remove the tag.`,
      );
    else if (tagged && kids.length < 2)
      add(
        "parallel.size",
        item,
        `Group "${item.key}" runs one task, so ${PARALLEL_TAG} does nothing. Add a task or remove the tag.`,
      );
    const rest = tagged ? title.slice(0, -PARALLEL_TAG.length) : title;
    if (STRAY.test(rest))
      add(
        "parallel.tag",
        item,
        `Write the tag as exactly ${PARALLEL_TAG} at the end of the title of task "${item.key}", before any refs.`,
      );
  }
  return problems;
}
