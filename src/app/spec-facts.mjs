// Task facts in tasks.md (Requirement 111, design §4.40). Each task item
// carries one `Facts:` bullet as its first child; spec-wide values are
// front-matter at the top of the file. This turns both into the object the
// manifest used to hold, `{tasks, ship, phases, batches, ...}`, plus the line
// of every bullet, so parseSpec checks them as it always did.
//
//   ---
//   repo: avoozl
//   checks: npm test, git diff --check
//   ---
//   - [ ] 1.2 Queue table
//     - Facts:
//       - after: 1.1
//       - done:
//         - The migration runs twice with no change
//
// This module imports nothing from spec-plans.mjs: callers pass the checklist
// items, so the two files do not import each other.

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^(\s*)[-*+][ \t]+(.*?)\s*$/;
const FACTS = /^Facts:$/;
const OPEN = /^\uFEFF?---[ \t]*$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const STATUS = /^Status:/;

// Fact key -> {as: the manifest key it is stored under, type}. `after` is a
// list of task IDs, each with an optional `:<completion>`.
const KEYS = {
  kind: { as: "kind", type: "text" },
  repo: { as: "repository", type: "text" },
  done: { as: "acceptance", type: "list" },
  completion: { as: "completion", type: "text" },
  checks: { as: "checks", type: "list" },
  after: { as: "requires", type: "after" },
  sequence: { as: "sequence", type: "list" },
  supports: { as: "supports", type: "list" },
  // A private task's reverse edge into a public one (RC25.9).
  unblocks: { as: "unblocks", type: "list" },
  manual: { as: "manual", type: "bool" },
  investigate: { as: "investigate", type: "bool" },
  phase: { as: "phase", type: "text" },
  batch: { as: "batch", type: "text" },
  authority: { as: "authority", type: "text" },
  route: { as: "route", type: "text" },
  type: { as: "type", type: "text" },
  milestone: { as: "milestone", type: "text" },
  iteration: { as: "iteration", type: "text" },
  scope: { as: "scope", type: "text" },
  track: { as: "track", type: "text" },
  projectId: { as: "projectId", type: "text" },
  taskId: { as: "taskId", type: "text" },
  nextAction: { as: "nextAction", type: "text" },
  distinctReason: { as: "distinctReason", type: "text" },
  acceptFrom: { as: "acceptFrom", type: "text" },
  verify: { as: "verify", type: "text" },
  ship: { as: "ship", type: "text" },
  tags: { as: "tags", type: "list" },
  resources: { as: "resources", type: "list" },
  paths: { as: "paths", type: "list" },
  labels: { as: "labels", type: "list" },
  needs: { as: "needs", type: "list" },
  session: { as: "session", type: "json" },
  // An epic folder's rows (Requirement 59.1).
  plan: { as: "plan", type: "text" },
  step: { as: "step", type: "text" },
};
const FACT_KEYS = Object.keys(KEYS);
// A person's task is `manual: true`; `completion: person` is not written.
const PERSON =
  "A task a person does is `manual: true`, which completes by a person. Write that, and delete this line.";
// Facts that are gone, and what to do with a line that still has one.
const REMOVED = {
  summary:
    "The summary fact is gone: a task's summary is its own bullets under the item. Delete this line.",
};

// Front-matter: defaults for a leaf, and values for the whole spec.
const DEFAULTS = {
  repo: { as: "repository", type: "text" },
  checks: { as: "checks", type: "list" },
  completion: { as: "completion", type: "text" },
};
const SPEC_KEYS = [
  "ship",
  "integrationBranch",
  "integrationSync",
  "forwardTarget",
  "publicBranch",
  "kind",
];
const FRONT_KEYS = [...Object.keys(DEFAULTS), ...SPEC_KEYS];

// The order a task's keys have in the text the revision hash reads. It is the
// order the manifest files had, so a converted spec hashes as it did.
const ORDER = [
  "kind",
  "repository",
  "acceptance",
  "completion",
  "checks",
  "requires",
  "manual",
];
const TOP_ORDER = [
  "version",
  "kind",
  "ship",
  "integrationBranch",
  "integrationSync",
  "forwardTarget",
  "publicBranch",
  "phases",
  "batches",
  "tasks",
];

const indentOf = (raw) => /^\s*/.exec(raw)[0].length;

function problem(code, line, message, extra = {}) {
  return { code, line, message, ...extra };
}

const split = (value) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

// Read one key: `inline` is the text after the colon, `nested` the child
// bullets as [{line, text}]. Returns {value} or {error}.
function readValue(key, spec, inline, nested) {
  const loose = spec.type === "list" || spec.type === "after";
  if (!loose && nested.length)
    return { error: `${key} takes one value on its line, not a list.` };
  if (loose && inline && nested.length)
    return { error: `${key} is a list: write it inline or as nested bullets.` };
  if (loose) {
    const items = nested.length
      ? nested.map((item) => item.text)
      : split(inline);
    if (spec.type === "list") return { value: items };
    return {
      value: items.map((item) => {
        const at = item.indexOf(":");
        return at < 0
          ? item
          : {
              task: item.slice(0, at).trim(),
              condition: item.slice(at + 1).trim(),
            };
      }),
    };
  }
  if (!inline) return { error: `${key} needs a value.` };
  if (spec.type === "bool") {
    if (inline !== "true" && inline !== "false")
      return { error: `${key} is true or false.` };
    return { value: inline === "true" };
  }
  if (spec.type === "json") {
    try {
      return { value: JSON.parse(inline) };
    } catch {
      return { error: `${key} is one line of JSON.` };
    }
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
    const named = /^(phase|batch)-(.+)$/.exec(key);
    let spec = DEFAULTS[key];
    if (!spec && SPEC_KEYS.includes(key)) spec = { type: "text" };
    if (named) spec = { type: "text" };
    if (!spec) {
      out.problems.push(
        problem(
          "facts.unknown-key",
          line,
          `Unknown front-matter key "${key}". Known keys: ${FRONT_KEYS.join(", ")}, phase-<id>, batch-<id>.`,
          { key },
        ),
      );
      continue;
    }
    const read = readValue(key, spec, inline, nested);
    if (read.error) out.problems.push(problem("facts.value", line, read.error));
    else if (key === "completion" && read.value === "person")
      out.problems.push(problem("facts.person-completion", line, PERSON));
    else out.values[key] = read.value;
  }
  return out;
}

// Facts of one tasks.md. `items` are specItems(name, text): {key, line,
// mark, parent, title}. Returns
//   manifest     the object parseSpec checks, `tasks` keyed by item key
//   problems     [{code, line, message, key?}] in file order
//   lineOf(key)  the line of the key's Facts bullet, else its item line
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
    skip = new Set(),
    facts = new Map(),
    accepted = new Set();
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

  // The Facts bullet of each item: the first non-blank line after it, when it
  // is a deeper bullet that reads `Facts:`.
  for (const item of items) {
    let at = item.line;
    while (at < rows.length && !rows[at].trim()) at++;
    if (at >= rows.length) continue;
    const bullet = BULLET.exec(rows[at]);
    if (
      !bullet ||
      !FACTS.test(bullet[2]) ||
      bullet[1].length <= indentOf(rows[item.line - 1])
    )
      continue;
    accepted.add(at + 1);
    facts.set(item.line, { line: at + 1, indent: bullet[1].length, item });
  }

  // Read each block.
  const tasks = {},
    lines = new Map(),
    factLine = new Map();
  for (const { line, indent, item } of facts.values()) {
    let end = line;
    const children = [];
    for (let at = line; at < rows.length; at++) {
      if (!rows[at].trim()) continue;
      if (indentOf(rows[at]) <= indent) break;
      end = at + 1;
      children.push(at);
    }
    for (let at = line; at < end; at++) skip.add(at + 1);
    skip.add(line);
    const entry = {},
      seen = new Map();
    let childIndent = null;
    for (let n = 0; n < children.length; n++) {
      const at = children[n],
        bullet = BULLET.exec(rows[at]);
      if (!bullet) {
        problems.push(
          problem(
            "facts.value",
            at + 1,
            "Write each fact as a bullet, key: value.",
            {
              key: item.key,
            },
          ),
        );
        continue;
      }
      childIndent ??= bullet[1].length;
      if (bullet[1].length !== childIndent) continue;
      const nested = [];
      while (
        n + 1 < children.length &&
        indentOf(rows[children[n + 1]]) > childIndent
      ) {
        n++;
        const inner = BULLET.exec(rows[children[n]]);
        nested.push({
          line: children[n] + 1,
          text: inner ? inner[2] : rows[children[n]].trim(),
        });
      }
      const match = /^([A-Za-z][A-Za-z0-9]*):[ \t]*(.*)$/.exec(bullet[2]);
      if (!match) {
        problems.push(
          problem("facts.value", at + 1, "Write each fact as key: value.", {
            key: item.key,
          }),
        );
        continue;
      }
      const [, key, inline] = match,
        spec = Object.hasOwn(KEYS, key) ? KEYS[key] : null;
      if (Object.hasOwn(REMOVED, key)) {
        problems.push(
          problem("facts.removed-key", at + 1, REMOVED[key], {
            key: item.key,
          }),
        );
        continue;
      }
      if (!spec) {
        problems.push(
          problem(
            "facts.unknown-key",
            at + 1,
            `Unknown fact key "${key}". Known keys: ${FACT_KEYS.join(", ")}.`,
            { key: item.key },
          ),
        );
        continue;
      }
      if (seen.has(key)) {
        problems.push(
          problem(
            "facts.duplicate-key",
            at + 1,
            `Fact "${key}" is written twice (lines ${seen.get(key)} and ${at + 1}). Keep one.`,
            { key: item.key },
          ),
        );
        continue;
      }
      seen.set(key, at + 1);
      const read = readValue(key, spec, inline.trim(), nested);
      if (read.error) {
        problems.push(
          problem("facts.value", at + 1, read.error, { key: item.key }),
        );
        continue;
      }
      if (key === "completion" && read.value === "person") {
        problems.push(
          problem("facts.person-completion", at + 1, PERSON, {
            key: item.key,
          }),
        );
        continue;
      }
      entry[spec.as] = read.value;
      factLine.set(`${item.key}\0${spec.as}`, at + 1);
    }
    if (item.key && tasks[item.key] === undefined) {
      tasks[item.key] = entry;
      lines.set(item.key, line);
    }
  }

  // A Facts bullet that is not an item's first child, and a fact outside one.
  let fenced = false,
    owner = null,
    misplaced = null;
  rows.forEach((raw, index) => {
    const line = index + 1;
    if (FENCE.test(raw)) fenced = !fenced;
    if (fenced || skip.has(line)) return;
    // The children of a misplaced Facts bullet are reported once, with it.
    if (misplaced !== null && raw.trim() && indentOf(raw) > misplaced) return;
    misplaced = null;
    if (byLine.has(line)) {
      owner = { item: byLine.get(line), indent: indentOf(raw) };
      return;
    }
    if (/^#{1,6}\s/.test(raw)) owner = null;
    const bullet = BULLET.exec(raw);
    if (!bullet) return;
    if (FACTS.test(bullet[2]) && !accepted.has(line)) {
      misplaced = bullet[1].length;
      problems.push(
        problem(
          "facts.misplaced",
          line,
          "Facts: is the first child of a task item, and a task has one. Move it directly under its item.",
        ),
      );
    } else if (
      owner &&
      bullet[1].length > owner.indent &&
      Object.hasOwn(KEYS, /^([A-Za-z][A-Za-z0-9]*):/.exec(bullet[2])?.[1] ?? "")
    )
      problems.push(
        problem(
          "facts.stray",
          line,
          `"${bullet[2].split(":")[0]}:" is a fact. Write it under the task's Facts: bullet, or rename this note.`,
          { key: owner.item.key },
        ),
      );
  });

  // Defaults fill a leaf; a package takes none. A task keeps its facts in the
  // order its bullets list them, and a filled-in key goes where `ORDER` puts
  // it among them, so `factsText` gives back the manifest text it came from.
  if (!isEpic)
    for (const [key, entry] of Object.entries(tasks)) {
      const fill = {};
      if (entry.kind === undefined) fill.kind = "leaf";
      if (entry.kind !== "package")
        // A manual leaf runs no checks (Requirement 61.9) and completes by
        // a person: it takes neither default.
        for (const [name, spec] of Object.entries(DEFAULTS))
          if (
            !(entry.manual === true && name !== "repo") &&
            front.values[name] !== undefined &&
            entry[spec.as] === undefined
          )
            fill[spec.as] = structuredClone(front.values[name]);
      tasks[key] = withDefaults(entry, fill);
    }

  const manifest = { version: 1 };
  if (isEpic) manifest.kind = "epic";
  for (const key of SPEC_KEYS)
    if (key !== "kind" && front.values[key] !== undefined)
      manifest[key] = front.values[key];
  const phases = {},
    reasons = {};
  for (const [key, value] of Object.entries(front.values)) {
    const named = /^(phase|batch)-(.+)$/.exec(key);
    if (named?.[1] === "phase") phases[named[2]] = { title: value };
    if (named?.[1] === "batch") reasons[named[2]] = value;
  }
  if (Object.keys(phases).length) manifest.phases = phases;
  // A batch group is its members' `batch` facts and one reason.
  const batches = {},
    batchLine = {};
  for (const item of items) {
    const group = tasks[item.key]?.batch;
    if (typeof group !== "string") continue;
    (batches[group] ??= { tasks: [], reason: reasons[group] }).tasks.push(
      item.key,
    );
    batchLine[group] ??= factLine.get(`${item.key}\0batch`);
  }
  for (const id of Object.keys(reasons))
    batches[id] ??= { tasks: [], reason: reasons[id] };
  for (const [id, group] of Object.entries(batches)) {
    if (group.reason === undefined)
      problems.push(
        problem(
          "facts.value",
          batchLine[id] ?? 1,
          `Batch "${id}" has no reason. Add "batch-${id}: <reason>" to the front-matter of tasks.md.`,
        ),
      );
  }
  if (Object.keys(batches).length) manifest.batches = batches;
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
    batchLine: (id) => front.at[`batch-${id}`] ?? batchLine[id] ?? 1,
  };
}

// The description bullets of each item in tasks.md: its child bullets other
// than the Facts bullet, nested checklist items and a `Done when:` bullet,
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
          !FACTS.test(bullet[2]) &&
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

// Each item's summary: its description bullets joined, as written.
export const itemSummaries = (text, items) =>
  new Map(
    [...itemBullets(text, items)].map(([line, bullets]) => [
      line,
      bullets.map((bullet) => bullet.text).join("\n"),
    ]),
  );

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

// tasks.md without its facts: the front-matter block and every Facts bullet
// with its children, so the text is what the file said before they were
// added. Line numbers are not kept: the revision hash reads this.
export function withoutFacts(text, items) {
  const { skip } = readFacts(text, items);
  return String(text)
    .split("\n")
    .filter((_, index) => !skip.has(index + 1))
    .join("\n");
}

// The text a revision hash reads for the facts: the manifest file's text as it
// was written, so a spec converted from a manifest keeps its hash. Spec-wide
// keys have a fixed order; a task's keys keep their order (see readFacts).
// A task's `batch` fact is written as the top-level `batches` it came from.
export function factsText(manifest) {
  const out = Object.fromEntries(
    Object.entries(manifest).sort(
      ([a], [b]) => rank(TOP_ORDER, a) - rank(TOP_ORDER, b),
    ),
  );
  out.tasks = Object.fromEntries(
    Object.entries(manifest.tasks ?? {}).map(([key, entry]) => {
      const { batch: _batch, ...rest } = entry;
      return [key, rest];
    }),
  );
  return JSON.stringify(out, null, 2) + "\n";
}

const FACT_OF = Object.fromEntries(
  Object.entries(KEYS).map(([fact, spec]) => [spec.as, fact]),
);

// The fact name a parsed key is written as, such as repo for repository.
export const factName = (key) => FACT_OF[key] ?? key;

// The Facts bullet for one entry in the manifest's key names, as lines. The
// Facts bullet sits at column `indent`. `kind: leaf` is left out. Lists are
// nested bullets, except short inline lists of plain items.
export function factsLines(entry, { indent = 2 } = {}) {
  const pad = " ".repeat(indent),
    out = [`${pad}- Facts:`],
    keys = Object.keys(entry);
  for (const key of keys) {
    const fact = FACT_OF[key],
      value = entry[key];
    if (!fact) throw Error(`"${key}" is not a task fact.`);
    if (key === "kind" && value === "leaf") continue;
    const spec = KEYS[fact],
      line = (text) => {
        if (/[\r\n]/.test(text))
          throw Error(`${fact} must be one line of text.`);
        return text;
      };
    if (spec.type === "list" || spec.type === "after") {
      const items = value.map((item) =>
        typeof item === "string" ? item : `${item.task}:${item.condition}`,
      );
      // Short plain lists go on one line; `done` is always one bullet each.
      if (
        fact !== "done" &&
        items.length &&
        items.every((item) => item && !/[,\r\n]/.test(item)) &&
        items.join(", ").length <= 80
      )
        out.push(`${pad}  - ${fact}: ${items.join(", ")}`);
      else {
        out.push(`${pad}  - ${fact}:`);
        for (const item of items) out.push(`${pad}    - ${line(item)}`);
      }
    } else if (spec.type === "json")
      out.push(`${pad}  - ${fact}: ${JSON.stringify(value)}`);
    else out.push(`${pad}  - ${fact}: ${line(String(value))}`);
  }
  return out;
}
