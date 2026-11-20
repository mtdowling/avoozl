// Order from the list (simplify §D19): the one function that derives which
// task waits for which. Siblings run top to bottom; a task with children is a
// group; a group whose title ends with `(**PARALLEL**)` runs its children
// side by side; `##` phases run in order. The ready rule, ranking and lint
// read the waits from here.
import path from "node:path";
import { headingPhases, specItems } from "./spec-plans.mjs";

export const PARALLEL_TAG = "(**PARALLEL**)";
const TAGGED = /\(\*\*PARALLEL\*\*\)$/;

export const isParallel = (title) => TAGGED.test(String(title ?? "").trim());

// Linked specs (§D19.2): a task title's Markdown link, inline or
// reference-style, to another spec folder's tasks.md makes the task a spec
// group. `definitions` are the file's `[label]: target` lines.
const INLINE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const REFERENCE = /\[([^\]]+)\](?![(:])/g;
const DEFINITION = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/;

export function linkDefinitions(text) {
  const definitions = new Map();
  for (const line of String(text ?? "").split("\n")) {
    const match = DEFINITION.exec(line);
    if (match) definitions.set(match[1].toLowerCase(), match[2]);
  }
  return definitions;
}

// The spec a link target names, from the tasks.md of spec `name`, or null.
function specOfTarget(name, target) {
  const file = target.split("#")[0];
  if (!file || /^[a-z][a-z0-9+.-]*:/i.test(file)) return null;
  const at = path.posix.normalize(path.posix.join("S", name, file)),
    match = /^S\/([^/]+)\/tasks\.md$/.exec(at);
  return match && match[1] !== name ? match[1] : null;
}

// The spec a task title links as a spec group, or null.
export function linkedSpecOf(name, title, definitions) {
  const text = String(title ?? "");
  for (const match of text.matchAll(INLINE)) {
    const spec = specOfTarget(name, match[1]);
    if (spec) return spec;
  }
  for (const match of text.matchAll(REFERENCE)) {
    const target = definitions.get(match[1].toLowerCase()),
      spec = target && specOfTarget(name, target);
    if (spec) return spec;
  }
  return null;
}

// Whether the item at `line` (1-based) has a plain sub-bullet of its own:
// a task with one is a leaf whatever its title links (§D19.2's
// "Write the spec for [epic context]").
function hasBullets(lines, line) {
  const indent = /^\s*/.exec(lines[line - 1] ?? "")[0].length;
  for (let at = line; at < lines.length; at++) {
    const row = lines[at];
    if (!row.trim()) continue;
    const own = /^\s*/.exec(row)[0].length;
    if (own <= indent) return false;
    if (/^\s*[-*+] \[[ xX~-]\]/.test(row)) return false;
    if (/^\s*[-*+] /.test(row)) return true;
  }
  return false;
}

// The spec an item is a spec group for: its title links one and it has no
// plain sub-bullet. Null otherwise.
export function specGroupOf(name, item, definitions, lines) {
  const spec = linkedSpecOf(name, item.title, definitions);
  return spec && !hasBullets(lines, item.line) ? spec : null;
}

// Every spec each spec links, and the specs that link each one, over
// [{name, text}]: what a parse needs to reach into a linked spec and back.
export function linkedReader(specs) {
  const texts = new Map(specs.map((spec) => [spec.name, spec.text])),
    groups = new Map();
  for (const { name, text } of specs) {
    const definitions = linkDefinitions(text),
      lines = text.split("\n");
    for (const item of specItems(name, text)) {
      const linked = item.key && specGroupOf(name, item, definitions, lines);
      if (linked) groups.set(linked, [...(groups.get(linked) ?? []), name]);
    }
  }
  return {
    read: (name) => texts.get(name) ?? null,
    exists: (name) => texts.has(name),
    // Each parent once per link, so a spec linked twice shows twice.
    linkers: (name) => groups.get(name) ?? [],
    parents: (name) =>
      [...new Set(groups.get(name) ?? [])].map((parent) => ({
        name: parent,
        text: texts.get(parent),
      })),
  };
}

// The task tree of one tasks.md: each item with an ID, its children, and
// the phases its top-level items fall under, in file order. With `linked`
// (linkedReader), a spec group's children are its linked spec's phases.
export function taskTree(name, text, linked = null, seen = new Set([name])) {
  const items = specItems(name, text).filter((item) => item.key),
    headings = headingPhases(text),
    definitions = linkDefinitions(text),
    lines = text.split("\n"),
    nodes = new Map(),
    phases = new Map();
  // specItems copies each item, so a parent is found by its line.
  for (const item of items)
    nodes.set(item.line, {
      item,
      id: item.id,
      children: [],
      spec: specGroupOf(name, item, definitions, lines),
    });
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
  // A spec group reaches into its spec; one not there yet stays a leaf, so
  // what follows it waits.
  for (const node of nodes.values()) {
    const child = node.spec && !seen.has(node.spec) && linked?.read(node.spec);
    if (!child || node.children.length) continue;
    const tree = taskTree(
      node.spec,
      child,
      linked,
      new Set([...seen, node.spec]),
    );
    node.children = tree.phases.map((list) => groupOf(list));
    node.parallel = false;
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
// With `linked`, the waits reach into linked specs, and a linked spec also
// gets the waits its parents give its first tasks.
export function waitsOf(name, text, linked = null) {
  const own = treeWaits(name, text, linked);
  if (!linked) return own;
  const ids = new Set(taskTree(name, text).nodes.map((node) => node.id)),
    keys = new Set(own.map(({ from, to }) => `${from}\0${to}`));
  for (const parent of linked.parents(name))
    for (const edge of treeWaits(parent.name, parent.text, linked))
      if (ids.has(edge.to) && !keys.has(`${edge.from}\0${edge.to}`)) {
        keys.add(`${edge.from}\0${edge.to}`);
        own.push(edge);
      }
  return own;
}

function treeWaits(name, text, linked) {
  const { phases } = taskTree(name, text, linked),
    edges = new Map(),
    walk = (list, parallel) => {
      if (!parallel)
        for (let i = 1; i < list.length; i++)
          for (const from of last(list[i - 1]))
            // A spec linked twice in one list would wait on itself.
            for (const to of first(list[i]))
              if (from !== to) edges.set(`${from}\0${to}`, { from, to });
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

// Linked spec lint (§D19.3): link.children, and with `linked` (the other
// specs) link.missing and link.twice, over specItems marked with `spec`.
export function linkProblems(items, linked) {
  const keyed = items.filter((item) => item.key),
    problems = [],
    add = (code, item, message) =>
      problems.push({ code, line: item.line, message, taskId: item.id });
  for (const item of keyed) {
    if (!item.spec) continue;
    if (keyed.some((other) => other.parent?.line === item.line))
      add(
        "link.children",
        item,
        `Task "${item.key}" links spec ${item.spec}, so its tasks come from that spec. Move the tasks under it into ${item.spec}.`,
      );
    if (!linked) continue;
    // A missing spec is fine while an earlier task of the same list, such
    // as the one that writes it, is still open.
    const earlier = keyed.some(
      (other) =>
        other.line < item.line &&
        other.parent?.line === item.parent?.line &&
        other.mark !== "x",
    );
    if (!linked.exists(item.spec) && !earlier)
      add(
        "link.missing",
        item,
        `Task "${item.key}" links spec ${item.spec}, which has no folder. Write it first, or fix the link.`,
      );
    if (linked.linkers(item.spec).length > 1)
      add(
        "link.twice",
        item,
        `Spec ${item.spec} is linked as a spec group more than once. Link it from one task.`,
      );
  }
  return problems;
}
