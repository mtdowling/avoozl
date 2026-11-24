// Tasks hold no facts. A task is its title and the plain
// bullets under it; the list orders it (order.mjs), `(**MANUAL**)` in its
// title marks a person's task, and the front matter's `repo` names the one
// repository the spec changes. Every `$key:` bullet is the lint error
// `facts.removed-key` with its fix, and nothing reads it. This turns the
// front matter and the items into the object parseSpec checks, `{tasks}`.
//
//   ---
//   repo: avoozl
//   ---
//   - [ ] `q-1.2` Queue table
//     - The migration runs twice with no change
//
// A task's kind: an item with sub-items, or one that links a spec, is a
// package, and the rest are leaves. Its phase is the `##` heading above it.
//
// This module imports nothing from spec-plans.mjs: callers pass the checklist
// items, so the two files do not import each other.

// A checklist item as specItems reads it (spec-plans.mjs passes them).
export interface FactItem {
  key: string | null;
  line: number;
  mark?: string;
  parent?: { key: string | null } | null;
  title?: string;
  spec?: unknown;
}
// How one key reads: the field it fills and its value's type.
interface KeySpec {
  as: string;
  type: string;
  item?: (value: string) => unknown;
}
// One problem with its line, for lint.
export interface FactProblem {
  code: string;
  line: number;
  message: string;
  key?: string | null;
}
// One task's facts, by field.
type Entry = Record<string, unknown>;
// The object parseSpec checks.
export interface Manifest {
  version: number;
  kind?: string;
  tasks: Record<string, Entry>;
  [key: string]: unknown;
}
// A bullet: its line and its text.
type Nested = { line: number; text: string };
// The front-matter block, as readFront reads it.
interface Front {
  lines: number;
  values: Record<string, unknown>;
  problems: FactProblem[];
  at: Record<string, number>;
}

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^(\s*)[-*+][ \t]+(.*?)\s*$/;
// A task fact: a bullet that reads `$key: value`.
const FACT = /^\$([A-Za-z][A-Za-z0-9]*):[ \t]*(.*)$/;
// A note that reads like a fact with its `$` left off.
const NOTE = /^([A-Za-z][A-Za-z0-9]*):/;
const OPEN = /^\uFEFF?---[ \t]*$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const STATUS = /^Status:/;
const ONE_LINE = (key: string) =>
  `A fact is one bullet on one line. Write another "$${key}:" bullet for each value, and nothing under it.`;

// No fact is read: every `$key:` bullet is gone (REMOVED_FACTS).
const KEYS: Record<string, KeySpec> = {};
const FACT_KEYS = Object.keys(KEYS);

const GONE = "Avoozl no longer reads it; delete this line.";
// Facts that are gone, and what to do with a line that still has one. Each
// is the lint error `facts.removed-key` at its line.
const REMOVED_FACTS: Record<string, string> = {
  done: "Write the result as a plain bullet under the task: delete `$done:` and keep the text.",
  after:
    "Order tasks by the list; tag a group `(**PARALLEL**)` for tasks that run side by side. Delete this line.",
  manual:
    "End the task's title with `(**MANUAL**)`, before its refs, and delete this line.",
  repo: "A spec changes one repository, its front matter's `repo`. Split a spec that changes two into one spec per repository, linked from a parent, and delete this line.",
  paths: GONE,
  investigate:
    "Split the task: an investigation task whose bullets name `findings/<id>.md`, then the task whose bullets name that file. Delete this line.",
  type: GONE,
  plan: "Link the member spec's tasks.md from the task's title, which makes it a spec group, and delete this line.",
  step: "Write the spec in a task of its own above the spec group, or add a `(**MANUAL**)` review task, and delete this line.",
  summary:
    "A task's summary is its own bullets under the item. Delete this line.",
  checks: "Every task runs the repository's checks; delete this line.",
  kind: "A task with sub-items is a package and the rest are leaves; delete this line.",
  phase:
    "A task's phase is the ## heading above it; delete this line and put the task under its heading.",
  batch:
    "Batches are gone: the agent groups its own work. Delete this line and the batch-<id> front-matter.",
  completion:
    "A task completes when it lands, and a person's task ends its title with `(**MANUAL**)`; delete this line.",
  sequence:
    "Order tasks by the list; tag a group `(**PARALLEL**)` for tasks that run side by side. Delete this line.",
  repositoryId:
    "A spec changes one repository, its front matter's `repo`. Delete this line.",
  built:
    "The commit that ticks a task records its landing; delete this line, or write a plain `Built:` note.",
  session:
    "Pick the agent, model and harness for a role in Settings; delete this line.",
  verify:
    "A repository with no checks is judged by its reviewers only; set checks in Settings and delete this line.",
  ship: "The repository's landing setting says how work ships; delete this line.",
  taskId: GONE,
  nextAction: GONE,
  labels: GONE,
  milestone: GONE,
  iteration: GONE,
  scope: GONE,
  resources: GONE,
  needs: GONE,
  tags: GONE,
  supports: GONE,
  unblocks: GONE,
  authority: GONE,
  route: GONE,
  track: GONE,
  source: GONE,
  distinctReason: GONE,
  acceptFrom: GONE,
};

// Front-matter: a default for a leaf, and values for the whole spec.
const DEFAULTS: Record<string, KeySpec> = {
  repo: { as: "repository", type: "text" },
};
const SPEC_KEYS: string[] = [];
const FRONT_KEYS = [...Object.keys(DEFAULTS), ...SPEC_KEYS];
// Front-matter keys the list form removed: the lint error
// `frontmatter.removed-key`.
const REMOVED_SPEC_FRONT: Record<string, string> = {
  kind: "A spec is a list of tasks; a parent links its member specs from task titles. Delete this line.",
  epic: "A parent spec links its member specs from task titles. Delete this line.",
  integrationBranch:
    "An integration branch is the branch named for the spec's folder. Rename the branch or the folder, and delete this line.",
  integrationSync:
    "Avoozl merges the default branch into an integration branch before each claim on it. Delete this line.",
};
// Front-matter keys that are gone. `phase-<id>` and `batch-<id>` are matched
// by their prefix.
const REMOVED_FRONT: Record<string, string> = {
  completion:
    "A task completes when it lands, and a person's task ends its title with `(**MANUAL**)`; delete this line.",
  ship: "The repository's landing setting says how work ships; delete this line.",
  forwardTarget: "Delete this line; the spec names no mirror target.",
  publicBranch: "Delete this line; the spec names no mirror branch.",
  checks: "Every task runs the repository's checks; delete this line.",
  "phase-<id>":
    "A phase's title is its ## heading in tasks.md; delete this line.",
  "batch-<id>":
    "Batches are gone: the agent groups its own work. Delete this line and every `$batch` bullet.",
};
const removedFront = (key: string) => {
  const named = /^(phase|batch)-./.exec(key);
  return Object.hasOwn(REMOVED_FRONT, key)
    ? REMOVED_FRONT[key]
    : named && REMOVED_FRONT[`${named[1]}-<id>`];
};

// The order a task's keys have in the text the revision hash reads.
const ORDER = ["kind", "repository", "acceptance", "requires", "manual"];
const TOP_ORDER = [
  "version",
  "kind",
  "integrationBranch",
  "integrationSync",
  "tasks",
];

const indentOf = (raw: string) => (/^\s*/.exec(raw)?.[0] ?? "").length;

function problem(
  code: string,
  line: number,
  message: string,
  extra: { key?: string | null } = {},
): FactProblem {
  return { code, line, message, ...extra };
}

// A list's items: its text split on commas outside backticks, so
// `src/{a,b}.js` stays one item.
function split(value: string) {
  const parts = [""];
  let quoted = false;
  for (const char of value) {
    if (char === "`") quoted = !quoted;
    if (char === "," && !quoted) parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Read one key: `inline` is the text after the colon, `nested` the child
// bullets as [{line, text}]. Returns {value} or {error}.
function readValue(
  key: string,
  spec: KeySpec,
  inline: string,
  nested: Nested[],
): { value?: unknown; error?: string } {
  const loose = spec.type === "list";
  if (!loose && nested.length)
    return { error: `${key} takes one value on its line, not a list.` };
  if (loose && inline && nested.length)
    return { error: `${key} is a list: write it inline or as nested bullets.` };
  if (loose) {
    const items = nested.length
      ? nested.map((item) => item.text)
      : split(inline);
    // A dependency is a task ID: completion levels are gone.
    const level = key === "after" && items.find((item) => item.includes(":"));
    if (level)
      return {
        error: `"${level}" names a completion level, and levels are gone. Write the task ID alone.`,
      };
    const each = spec.item;
    return { value: each ? items.map((item) => each(item)) : items };
  }
  if (!inline) return { error: `${key} needs a value.` };
  if (spec.type === "bool") {
    if (inline !== "true" && inline !== "false")
      return { error: `${key} is true or false.` };
    return { value: inline === "true" };
  }
  return { value: inline };
}

// The front-matter block of tasks.md: {lines: how many, values, problems,
// at: key -> line}. A `Status:` line the approval commit adds is not a fact.
function readFront(rows: string[]): Front {
  const out: Front = { lines: 0, values: {}, problems: [], at: {} };
  if (!rows.length || !OPEN.test(rows[0])) return out;
  const end = rows.findIndex((row, index) => index > 0 && CLOSE.test(row));
  if (end < 0) {
    out.problems.push(
      problem(
        "facts.front",
        1,
        "Front-matter starts with --- on line 1 but has no closing --- line. Close it, or remove the opening ---.",
      ),
    );
    return out;
  }
  out.lines = end + 1;
  for (let index = 1; index < end; index++) {
    const row = rows[index];
    if (!row.trim() || /^\s*#/.test(row) || STATUS.test(row)) continue;
    const match = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*?)\s*$/.exec(row);
    if (!match) {
      out.problems.push(
        problem(
          "facts.front",
          index + 1,
          "Write front-matter as key: value lines.",
        ),
      );
      continue;
    }
    const [, key, inline] = match,
      nested: Nested[] = [];
    while (index + 1 < end && /^\s+[-*+]\s+/.test(rows[index + 1])) {
      index++;
      nested.push({
        line: index + 1,
        text: BULLET.exec(rows[index])?.[2] ?? "",
      });
    }
    const line = index + 1 - nested.length;
    if (out.at[key] !== undefined) {
      out.problems.push(
        problem(
          "facts.duplicate-key",
          line,
          `Front-matter names ${key} twice.`,
        ),
      );
      continue;
    }
    out.at[key] = line;
    if (Object.hasOwn(REMOVED_SPEC_FRONT, key)) {
      out.problems.push(
        problem(
          "frontmatter.removed-key",
          line,
          `Front-matter key "${key}" is gone. ${REMOVED_SPEC_FRONT[key]}`,
          { key },
        ),
      );
      continue;
    }
    const gone = removedFront(key);
    if (gone) {
      out.problems.push(
        problem(
          "facts.removed-key",
          line,
          `Front-matter key "${key}" is gone. ${gone}`,
          { key },
        ),
      );
      continue;
    }
    let spec: KeySpec | undefined = DEFAULTS[key];
    if (!spec && SPEC_KEYS.includes(key)) spec = { as: key, type: "text" };
    if (!spec) {
      out.problems.push(
        problem(
          "facts.unknown-key",
          line,
          `Unknown front-matter key "${key}". Known keys: ${FRONT_KEYS.join(", ")}.`,
          { key },
        ),
      );
      continue;
    }
    const read = readValue(key, spec, inline, nested);
    if (read.error) out.problems.push(problem("facts.value", line, read.error));
    else out.values[key] = read.value;
  }
  return out;
}

// Facts of one tasks.md. `items` are specItems(name, text): {key, line,
// mark, parent, title}. Returns
//   manifest     the object parseSpec checks, `tasks` keyed by item key
//   problems     [{code, line, message, key?}] in file order
//   lineOf(key)  the line of the key's first fact, else its item line
//   lineOfFact(key, fact)
//   isEpic
//   factLines    the tasks.md line numbers a revision hash leaves out
export function readFacts(text: unknown, items: FactItem[]) {
  const rows = String(text)
      .split("\n")
      .map((row) => row.replace(/\r$/, "")),
    front = readFront(rows),
    problems = [...front.problems],
    byLine = new Map(items.map((item) => [item.line, item])),
    skip = new Set<number>();
  for (let at = 0; at < front.lines; at++) skip.add(at + 1);
  // shortcut: epic folders are gone with the `kind` key; the epic paths
  // below are unreachable until they are deleted with the epic code.
  const isEpic = false;

  // Each item's facts: its direct child bullets that read `$key: value`. A
  // sub-item's bullets are its own, and a fenced block holds none.
  const fenced = new Set<number>();
  let fence = false;
  rows.forEach((raw, index) => {
    if (FENCE.test(raw)) {
      fence = !fence;
      fenced.add(index + 1);
    } else if (fence) fenced.add(index + 1);
  });
  const tasks: Record<string, Entry> = {},
    lines = new Map<string | null, number>(),
    factLine = new Map<string, number>();
  for (const item of items) {
    const base = indentOf(rows[item.line - 1] ?? ""),
      entry: Entry = {},
      seen = new Map<string, number>();
    let child: number | null = null,
      fact: { key: string; nested: boolean } | null = null;
    for (let at = item.line; at < rows.length; at++) {
      const raw = rows[at],
        line = at + 1;
      if (!raw.trim()) continue;
      const indent = indentOf(raw);
      if (indent <= base && !fenced.has(line)) break;
      if (fenced.has(line)) {
        fact = null;
        continue;
      }
      child ??= indent;
      if (indent > child) {
        // A fact is one line: what is nested under it is reported once.
        if (fact) {
          skip.add(line);
          if (!fact.nested) {
            fact.nested = true;
            problems.push(
              problem("facts.value", line, ONE_LINE(fact.key), {
                key: item.key,
              }),
            );
          }
        }
        continue;
      }
      fact = null;
      const bullet = BULLET.exec(raw);
      if (!bullet || byLine.has(line)) continue;
      const match = FACT.exec(bullet[2]);
      if (!match) {
        const note = NOTE.exec(bullet[2])?.[1];
        if (note && Object.hasOwn(KEYS, note))
          problems.push(
            problem(
              "facts.stray",
              line,
              `"${note}:" reads as a fact. Write it as "$${note}:", or rename this note.`,
              { key: item.key },
            ),
          );
        continue;
      }
      skip.add(line);
      fact = { key: match[1], nested: false };
      if (!lines.has(item.key)) lines.set(item.key, line);
      const [, key, inline] = match,
        spec = Object.hasOwn(KEYS, key) ? KEYS[key] : null;
      if (Object.hasOwn(REMOVED_FACTS, key)) {
        problems.push(
          problem(
            "facts.removed-key",
            line,
            `"$${key}" is gone. ${REMOVED_FACTS[key]}`,
            { key: item.key },
          ),
        );
        continue;
      }
      if (!spec) {
        problems.push(
          problem(
            "facts.unknown-key",
            line,
            `Unknown fact "$${key}". Known facts: ${FACT_KEYS.map((name) => `$${name}`).join(", ")}.`,
            { key: item.key },
          ),
        );
        continue;
      }
      const list = spec.type === "list";
      if (seen.has(key) && !list) {
        problems.push(
          problem(
            "facts.duplicate-key",
            line,
            `Fact "$${key}" is written twice (lines ${seen.get(key)} and ${line}). Keep one.`,
            { key: item.key },
          ),
        );
        continue;
      }
      // `$done` is one result per bullet, so a comma in it is text.
      const value = inline.trim(),
        read =
          key === "done"
            ? value
              ? { value: [value] }
              : { error: "$done needs a result someone can check." }
            : readValue(key, spec, value, []);
      if (read.error) {
        problems.push(
          problem("facts.value", line, read.error, { key: item.key }),
        );
        continue;
      }
      // A list fact written again adds to the list.
      if (seen.has(key)) {
        entry[spec.as] = [
          ...(entry[spec.as] as unknown[]),
          ...(read.value as unknown[]),
        ];
        continue;
      }
      seen.set(key, line);
      entry[spec.as] = read.value;
      factLine.set(`${item.key}\0${spec.as}`, line);
    }
    // Every task item has an entry: a leaf may give its results as plain
    // bullets (parseSpec). An epic row needs its `$plan`.
    if (
      item.key &&
      tasks[item.key] === undefined &&
      (lines.has(item.key) || !isEpic)
    )
      tasks[item.key] = entry;
  }

  // A fact bullet that is not a direct child of a task item.
  rows.forEach((raw, index) => {
    const line = index + 1,
      bullet = BULLET.exec(raw),
      match = bullet && FACT.exec(bullet[2]);
    if (!match || line <= front.lines || fenced.has(line) || skip.has(line))
      return;
    problems.push(
      problem(
        "facts.misplaced",
        line,
        `"$${match[1]}:" is a task fact. Write it as a bullet directly under its task item.`,
      ),
    );
  });

  // An item with sub-items is a package; the rest are leaves. The repo
  // default fills a leaf; a package takes none. A task keeps its facts in
  // the order its bullets list them, and a filled-in key goes where `ORDER`
  // puts it among them.
  // A spec group (an item whose title links a spec) is a package too.
  const parents = new Set([
    ...items.map((item) => item.parent?.key).filter(Boolean),
    ...items.filter((item) => item.spec).map((item) => item.key),
  ]);
  if (!isEpic)
    for (const [key, entry] of Object.entries(tasks)) {
      const fill: Entry = { kind: parents.has(key) ? "package" : "leaf" };
      if (fill.kind === "leaf")
        for (const [name, spec] of Object.entries(DEFAULTS))
          if (front.values[name] !== undefined && entry[spec.as] === undefined)
            fill[spec.as] = structuredClone(front.values[name]);
      tasks[key] = withDefaults(entry, fill);
    }

  const spec: Record<string, unknown> = {};
  for (const key of SPEC_KEYS)
    if (key !== "kind" && front.values[key] !== undefined)
      spec[key] = front.values[key];
  const manifest: Manifest = {
    version: 1,
    ...(isEpic ? { kind: "epic" } : {}),
    ...spec,
    tasks,
  };

  return {
    manifest,
    problems: problems.sort((a, b) => a.line - b.line),
    isEpic,
    skip,
    front,
    lineOf: (key: string | null) => lineOfItem(items, key, lines),
    lineOfFact: (key: string | null, fact: string) =>
      factLine.get(`${key}\0${fact}`) ?? lineOfItem(items, key, lines),
    frontLine: (key: string) => front.at[key] ?? 1,
  };
}

// The description bullets of each item in tasks.md: its child bullets other
// than its facts, nested checklist items and a `Done when:` bullet,
// each with its nested lines, as written. Returns item line ->
// [{line, text}], for items that have any. They are not facts: the revision
// hash reads them only as tasks.md text.
export function itemBullets(text: unknown, items: FactItem[]) {
  const rows = String(text)
      .split("\n")
      .map((row) => row.replace(/\r$/, "")),
    itemLines = new Set(items.map((item) => item.line)),
    out = new Map<number, Nested[]>();
  for (const item of items) {
    const base = indentOf(rows[item.line - 1] ?? ""),
      kept: { line: number; lines: string[] }[] = [];
    let child: number | null = null,
      own: { line: number; lines: string[] } | null = null,
      fenced = false;
    for (let at = item.line; at < rows.length; at++) {
      const raw = rows[at],
        indent = indentOf(raw);
      if (!fenced && !raw.trim()) continue;
      if (!fenced && indent <= base) break;
      if (!fenced && (child === null || indent <= child)) {
        child ??= indent;
        const bullet = BULLET.exec(raw);
        own =
          bullet &&
          !itemLines.has(at + 1) &&
          !FACT.test(bullet[2]) &&
          !/^Done when:/.test(bullet[2])
            ? { line: at + 1, lines: [] }
            : null;
        if (own) kept.push(own);
      }
      if (own)
        own.lines.push(raw.slice(Math.min(indent, child ?? indent)).trimEnd());
      if (FENCE.test(raw)) fenced = !fenced;
    }
    if (kept.length)
      out.set(
        item.line,
        kept.map(({ line, lines }) => ({ line, text: lines.join("\n") })),
      );
  }
  return out;
}

// `entry` with each key of `fill` placed before the first key of `entry` that
// ORDER ranks after it.
function withDefaults(entry: Entry, fill: Entry) {
  const out: [string, unknown][] = [],
    pending = Object.entries(fill).sort(
      ([a], [b]) => rank(ORDER, a) - rank(ORDER, b),
    );
  for (const pair of Object.entries(entry)) {
    while (pending.length && rank(ORDER, pending[0][0]) < rank(ORDER, pair[0]))
      out.push(pending.shift() as [string, unknown]);
    out.push(pair);
  }
  return Object.fromEntries([...out, ...pending]);
}

const rank = (order: string[], key: string) => {
  const at = order.indexOf(key);
  return at < 0 ? order.length : at;
};

function lineOfItem(
  items: FactItem[],
  key: string | null,
  lines: Map<string | null, number>,
) {
  return lines.get(key) ?? items.find((item) => item.key === key)?.line ?? 1;
}

// tasks.md without its facts: the front-matter block and every fact bullet,
// so the text is what the file said before they were added. Line numbers are not kept: the revision hash reads this.
export function withoutFacts(text: unknown, items: FactItem[]) {
  const { skip } = readFacts(text, items);
  return String(text)
    .split("\n")
    .filter((_, index) => !skip.has(index + 1))
    .join("\n");
}

// The text a revision hash reads for the facts: spec-wide keys in a fixed
// order, then each task's keys in their order (see readFacts).
export function factsText(manifest: Manifest) {
  const out = Object.fromEntries(
    Object.entries(manifest).sort(
      ([a], [b]) => rank(TOP_ORDER, a) - rank(TOP_ORDER, b),
    ),
  );
  return JSON.stringify(out, null, 2) + "\n";
}

const FACT_OF = Object.fromEntries(
  Object.entries(KEYS).map(([fact, spec]) => [spec.as, fact]),
);

// The fact name a parsed key is written as, such as repo for repository.
export const factName = (key: string) => FACT_OF[key] ?? key;
