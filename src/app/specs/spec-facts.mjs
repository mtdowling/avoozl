// Task facts in tasks.md (Requirement 111, design §4.40). A task's facts are
// `$key: value` bullets directly under its item; spec-wide values are
// front-matter at the top of the file. This turns both into the object the
// manifest used to hold, `{tasks, ...}`, plus the line of every bullet, so
// parseSpec checks them as it always did.
//
//   ---
//   repo: avoozl
//   ---
//   - [ ] 1.2 Queue table
//     - $after: 1.1
//     - $done: The migration runs twice with no change
//     - Add the queue table and its migration.
//
// A task's kind is not a fact: an item with sub-items is a package, and the
// rest are leaves. Its phase is the `##` heading above it (spec-plans.mjs).
//
// This module imports nothing from spec-plans.mjs: callers pass the checklist
// items, so the two files do not import each other.

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^(\s*)[-*+][ \t]+(.*?)\s*$/;
// A task fact: a bullet that reads `$key: value`.
const FACT = /^\$([A-Za-z][A-Za-z0-9]*):[ \t]*(.*)$/;
// A note that reads like a fact with its `$` left off.
const NOTE = /^([A-Za-z][A-Za-z0-9]*):/;
const OPEN = /^\uFEFF?---[ \t]*$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const STATUS = /^Status:/;
const ONE_LINE = (key) =>
  `A fact is one bullet on one line. Write another "$${key}:" bullet for each value, and nothing under it.`;

// Fact key -> {as: the manifest key it is stored under, type}.
const KEYS = {
  repo: { as: "repository", type: "text" },
  done: { as: "acceptance", type: "list" },
  after: { as: "requires", type: "list" },
  manual: { as: "manual", type: "bool" },
  paths: { as: "paths", type: "list", item: (text) => pathOf(text) },
  investigate: { as: "investigate", type: "bool" },
  type: { as: "type", type: "text" },
  // An epic folder's rows (Requirement 59.1).
  plan: { as: "plan", type: "text" },
  step: { as: "step", type: "text" },
};
// docs/avoozl-specs.md has a row for each (spec-facts-docs.test.mjs).
export const FACT_KEYS = Object.keys(KEYS);

const GONE = "Avoozl no longer reads it; delete this line.";
// Facts that are gone, and what to do with a line that still has one. Each
// is the lint error `facts.removed-key` at its line.
export const REMOVED_FACTS = {
  summary:
    "A task's summary is its own bullets under the item. Delete this line.",
  checks: "Every task runs the repository's checks; delete this line.",
  kind: "A task with sub-items is a package and the rest are leaves; delete this line.",
  phase:
    "A task's phase is the ## heading above it; delete this line and put the task under its heading.",
  batch:
    "Batches are gone: the agent groups its own work. Delete this line and the batch-<id> front-matter.",
  completion:
    "A task completes when it lands, and a person's task is `$manual: true`; delete this line.",
  sequence: "Name the task in `$after`, and delete this line.",
  repositoryId: "Write `$repo`, and delete this line.",
  built:
    "The commit that ticks a task records its landing; delete this line, or write a plain `Built:` note.",
  session:
    "Pick the agent, model and harness for a role in Settings; delete this line.",
  verify:
    "A repository with no checks gets a verifier chat; set checks in Settings and delete this line.",
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
const DEFAULTS = {
  repo: { as: "repository", type: "text" },
};
const SPEC_KEYS = ["integrationBranch", "integrationSync", "kind"];
export const FRONT_KEYS = [...Object.keys(DEFAULTS), ...SPEC_KEYS];
// Front-matter keys that are gone. `phase-<id>` and `batch-<id>` are matched
// by their prefix.
export const REMOVED_FRONT = {
  completion:
    "A task completes when it lands, and a person's task is `$manual: true`; delete this line.",
  ship: "The repository's landing setting says how work ships; delete this line.",
  forwardTarget: "Delete this line; the spec names no mirror target.",
  publicBranch: "Delete this line; the spec names no mirror branch.",
  checks: "Every task runs the repository's checks; delete this line.",
  "phase-<id>":
    "A phase's title is its ## heading in tasks.md; delete this line.",
  "batch-<id>":
    "Batches are gone: the agent groups its own work. Delete this line and every `$batch` bullet.",
};
const removedFront = (key) => {
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

const indentOf = (raw) => /^\s*/.exec(raw)[0].length;

function problem(code, line, message, extra = {}) {
  return { code, line, message, ...extra };
}

// A list's items: its text split on commas outside backticks, so
// `src/{a,b}.js` stays one item.
function split(value) {
  const parts = [""];
  let quoted = false;
  for (const char of value) {
    if (char === "`") quoted = !quoted;
    if (char === "," && !quoted) parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

// A path as a task's Files note writes it, such as `src/a.nupp` (new): the
// backticks, a note in parentheses after it and a sentence's closing period
// are not part of the path.
function pathOf(item) {
  const text = item.trim().replace(/([^./])\.$/, "$1"),
    quoted = /^`([^`]+)`(?:\s*\([^)]*\))?$/.exec(text);
  return quoted ? quoted[1] : text.replace(/\s+\([^)]*\)$/, "");
}

// Read one key: `inline` is the text after the colon, `nested` the child
// bullets as [{line, text}]. Returns {value} or {error}.
function readValue(key, spec, inline, nested) {
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
    return { value: spec.item ? items.map(spec.item) : items };
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
function readFront(rows) {
  const out = { lines: 0, values: {}, problems: [], at: {} };
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
      nested = [];
    while (index + 1 < end && /^\s+[-*+]\s+/.test(rows[index + 1])) {
      index++;
      nested.push({
        line: index + 1,
        text: BULLET.exec(rows[index])[2],
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
    let spec = DEFAULTS[key];
    if (!spec && SPEC_KEYS.includes(key)) spec = { type: "text" };
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
export function readFacts(text, items) {
  const rows = String(text)
      .split("\n")
      .map((row) => row.replace(/\r$/, "")),
    front = readFront(rows),
    problems = [...front.problems],
    byLine = new Map(items.map((item) => [item.line, item])),
    skip = new Set();
  for (let at = 0; at < front.lines; at++) skip.add(at + 1);
  const isEpic = front.values.kind === "epic";
  if (front.values.kind !== undefined && front.values.kind !== "epic")
    problems.push(
      problem(
        "facts.value",
        front.at.kind,
        'Front-matter kind is "epic" for an epic folder, and is left out otherwise.',
      ),
    );

  // Each item's facts: its direct child bullets that read `$key: value`. A
  // sub-item's bullets are its own, and a fenced block holds none.
  const fenced = new Set();
  let fence = false;
  rows.forEach((raw, index) => {
    if (FENCE.test(raw)) {
      fence = !fence;
      fenced.add(index + 1);
    } else if (fence) fenced.add(index + 1);
  });
  const tasks = {},
    lines = new Map(),
    factLine = new Map();
  for (const item of items) {
    const base = indentOf(rows[item.line - 1] ?? ""),
      entry = {},
      seen = new Map();
    let child = null,
      fact = null;
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
        entry[spec.as] = [...entry[spec.as], ...read.value];
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
  const parents = new Set(
    items.map((item) => item.parent?.key).filter(Boolean),
  );
  if (!isEpic)
    for (const [key, entry] of Object.entries(tasks)) {
      const fill = { kind: parents.has(key) ? "package" : "leaf" };
      if (fill.kind === "leaf")
        for (const [name, spec] of Object.entries(DEFAULTS))
          if (front.values[name] !== undefined && entry[spec.as] === undefined)
            fill[spec.as] = structuredClone(front.values[name]);
      tasks[key] = withDefaults(entry, fill);
    }

  const manifest = { version: 1 };
  if (isEpic) manifest.kind = "epic";
  for (const key of SPEC_KEYS)
    if (key !== "kind" && front.values[key] !== undefined)
      manifest[key] = front.values[key];
  manifest.tasks = tasks;

  return {
    manifest,
    problems: problems.sort((a, b) => a.line - b.line),
    isEpic,
    skip,
    front,
    lineOf: (key) => lineOfItem(items, key, lines),
    lineOfFact: (key, fact) =>
      factLine.get(`${key}\0${fact}`) ?? lineOfItem(items, key, lines),
    frontLine: (key) => front.at[key] ?? 1,
  };
}

// The description bullets of each item in tasks.md: its child bullets other
// than its facts, nested checklist items and a `Done when:` bullet,
// each with its nested lines, as written. Returns item line ->
// [{line, text}], for items that have any. They are not facts: the revision
// hash reads them only as tasks.md text.
export function itemBullets(text, items) {
  const rows = String(text)
      .split("\n")
      .map((row) => row.replace(/\r$/, "")),
    itemLines = new Set(items.map((item) => item.line)),
    out = new Map();
  for (const item of items) {
    const base = indentOf(rows[item.line - 1] ?? ""),
      kept = [];
    let child = null,
      own = null,
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
      if (own) own.lines.push(raw.slice(Math.min(indent, child)).trimEnd());
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

// A task's summary as bullets under its item at column `indent`: lines that
// are already bullets stay as written, and other text becomes one bullet.
export function summaryLines(summary, { indent = 2 } = {}) {
  const text = typeof summary === "string" ? summary.trim() : "";
  if (!text) return [];
  const pad = " ".repeat(indent);
  return /^[-*+][ \t]/.test(text)
    ? text.split(/\r?\n/).map((line) => pad + line)
    : text
        .split(/\r?\n/)
        .map((line, at) => (at ? `${pad}  ${line}` : `${pad}- ${line}`));
}

// `entry` with each key of `fill` placed before the first key of `entry` that
// ORDER ranks after it.
export function withDefaults(entry, fill) {
  const out = [],
    pending = Object.entries(fill).sort(
      ([a], [b]) => rank(ORDER, a) - rank(ORDER, b),
    );
  for (const pair of Object.entries(entry)) {
    while (pending.length && rank(ORDER, pending[0][0]) < rank(ORDER, pair[0]))
      out.push(pending.shift());
    out.push(pair);
  }
  return Object.fromEntries([...out, ...pending]);
}

const rank = (order, key) => {
  const at = order.indexOf(key);
  return at < 0 ? order.length : at;
};

function lineOfItem(items, key, lines) {
  return lines.get(key) ?? items.find((item) => item.key === key)?.line ?? 1;
}

// tasks.md without its facts: the front-matter block and every fact bullet,
// so the text is what the file said before they were added. Line numbers are not kept: the revision hash reads this.
export function withoutFacts(text, items) {
  const { skip } = readFacts(text, items);
  return String(text)
    .split("\n")
    .filter((_, index) => !skip.has(index + 1))
    .join("\n");
}

// The text a revision hash reads for the facts: spec-wide keys in a fixed
// order, then each task's keys in their order (see readFacts).
export function factsText(manifest) {
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
export const factName = (key) => FACT_OF[key] ?? key;

// The fact bullets for one entry in the manifest's key names, as lines at
// column `indent`. `kind` is left out: nesting says it. A short list of plain items is
// one bullet; any other list, and `done` always, is one bullet per item.
export function factsLines(entry, { indent = 2 } = {}) {
  const pad = `${" ".repeat(indent)}- $`,
    out = [],
    keys = Object.keys(entry);
  for (const key of keys) {
    if (key === "kind") continue;
    const fact = FACT_OF[key],
      value = entry[key];
    if (!fact) throw Error(`"${key}" is not a task fact.`);
    const spec = KEYS[fact],
      line = (text) => {
        if (/[\r\n]/.test(text))
          throw Error(`${fact} must be one line of text.`);
        return text;
      };
    if (spec.type === "list") {
      const items = value;
      if (
        fact === "done" ||
        items.some((item) => !item || /,/.test(item)) ||
        items.join(", ").length > 80
      ) {
        if (!items.length && fact !== "done") out.push(`${pad}${fact}:`);
        for (const item of items) out.push(`${pad}${fact}: ${line(item)}`);
      } else out.push(`${pad}${fact}: ${items.join(", ")}`);
    } else out.push(`${pad}${fact}: ${line(String(value))}`);
  }
  return out;
}
