// Line diffs for retro prompt and skill proposals (design §4.18): make a
// unified diff, apply one strictly to the exact text it was made against,
// and merge an override onto a changed built-in text (three-way).
// shortcut: an LCS table of size a×b lines; fine for prompt sections and
// skill files of a few hundred lines, replace with Myers if texts grow.

const lines = (text) => {
  const out = String(text ?? "").split("\n");
  return out;
};

// Edit script from a to b: [{op: "=", "-", "+", line}].
function script(a, b) {
  const n = a.length,
    m = b.length,
    table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
  const out = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ op: "=", line: a[i] });
      i++;
      j++;
    } else if (j < m && (i === n || table[i][j + 1] >= table[i + 1][j])) {
      out.push({ op: "+", line: b[j] });
      j++;
    } else {
      out.push({ op: "-", line: a[i] });
      i++;
    }
  }
  return out;
}

// A unified diff of `before` to `after` with `context` lines around each
// change, without file headers. Equal texts give "".
export function unifiedDiff(before, after, { context = 3 } = {}) {
  const ops = script(lines(before), lines(after));
  // Each step's old and new line number before it is taken (1-based).
  let o = 1,
    n = 1;
  for (const step of ops) {
    step.old = o;
    step.new = n;
    if (step.op !== "+") o++;
    if (step.op !== "-") n++;
  }
  const changes = ops.flatMap((s, i) => (s.op === "=" ? [] : [i]));
  if (!changes.length) return "";
  const groups = [];
  for (const i of changes) {
    const last = groups.at(-1);
    if (last && i - last.to <= context * 2 + 1) last.to = i;
    else groups.push({ from: i, to: i });
  }
  return groups
    .map(({ from, to }) => {
      const start = Math.max(0, from - context),
        end = Math.min(ops.length - 1, to + context),
        body = ops.slice(start, end + 1),
        oldCount = body.filter((s) => s.op !== "+").length,
        newCount = body.filter((s) => s.op !== "-").length,
        // An empty side starts at the line before it, as diff(1) writes.
        oldStart = oldCount ? body[0].old : body[0].old - 1,
        newStart = newCount ? body[0].new : body[0].new - 1;
      return [
        `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
        ...body.map((s) => (s.op === "=" ? " " : s.op) + s.line),
      ].join("\n");
    })
    .join("\n");
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

// Parse a unified diff body into hunks; null when it is not one. File
// headers (`---`, `+++`) are skipped.
export function parseDiff(diff) {
  if (typeof diff !== "string" || !diff.trim() || diff.length > 100_000)
    return null;
  const hunks = [];
  let current = null;
  for (const raw of diff.replace(/\n$/, "").split("\n")) {
    if (!current && (raw.startsWith("--- ") || raw.startsWith("+++ ")))
      continue;
    const head = HUNK.exec(raw);
    if (head) {
      current = {
        oldStart: Number(head[1]),
        oldCount: head[2] === undefined ? 1 : Number(head[2]),
        newStart: Number(head[3]),
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) return null;
    if (raw === "\\ No newline at end of file") continue;
    const op = raw[0] ?? " ";
    if (![" ", "-", "+"].includes(op)) return null;
    current.lines.push({ op: op === " " ? "=" : op, line: raw.slice(1) });
  }
  if (!hunks.length) return null;
  for (const h of hunks) {
    if (!h.lines.some((l) => l.op !== "=")) return null;
    if (h.lines.filter((l) => l.op !== "+").length !== h.oldCount) return null;
  }
  return hunks;
}

// Apply a diff to exactly the text it was made against: every context and
// removed line must sit at its stated line. Returns the new text, or null.
export function applyDiff(text, diff) {
  const hunks = parseDiff(diff);
  if (!hunks) return null;
  const source = lines(text),
    out = [];
  let at = 0;
  for (const h of hunks) {
    const start = h.oldCount === 0 ? h.oldStart : h.oldStart - 1;
    if (start < at || start > source.length) return null;
    out.push(...source.slice(at, start));
    let i = start;
    for (const step of h.lines) {
      if (step.op === "+") out.push(step.line);
      else {
        if (source[i] !== step.line) return null;
        if (step.op === "=") out.push(step.line);
        i++;
      }
    }
    at = i;
  }
  out.push(...source.slice(at));
  return out.join("\n");
}

// The diff that undoes `diff` on its result.
export function reverseDiff(diff) {
  const hunks = parseDiff(diff);
  if (!hunks) return null;
  return hunks
    .map((h) => {
      const body = h.lines.map(
          (l) => (l.op === "=" ? " " : l.op === "-" ? "+" : "-") + l.line,
        ),
        oldCount = body.filter((l) => l[0] !== "+").length,
        newCount = body.filter((l) => l[0] !== "-").length;
      return [
        `@@ -${h.newStart},${oldCount} +${h.oldStart},${newCount} @@`,
        ...body,
      ].join("\n");
    })
    .join("\n");
}

// The added lines of a diff, for checks such as "adds no heading".
export const addedLines = (diff) =>
  (parseDiff(diff) || []).flatMap((h) =>
    h.lines.filter((l) => l.op === "+").map((l) => l.line),
  );

// Three-way merge: replay base→ours onto theirs. Each hunk of ours is found
// by its old lines in theirs (once); a hunk not found, or found twice, is a
// conflict. Returns {text, conflict}.
export function merge3(base, ours, theirs) {
  if (ours === base) return { text: theirs, conflict: false };
  if (theirs === base || theirs === ours)
    return { text: ours, conflict: false };
  const hunks = parseDiff(unifiedDiff(base, ours, { context: 0 })) || [],
    baseLines = lines(base);
  let target = lines(theirs);
  for (const h of hunks) {
    let old = h.lines.filter((l) => l.op !== "+").map((l) => l.line),
      next = h.lines.filter((l) => l.op !== "-").map((l) => l.line);
    // A pure insert anchors on the base line before it (or after, at 0).
    if (!old.length) {
      const anchor = h.oldStart > 0 ? baseLines[h.oldStart - 1] : baseLines[0];
      if (anchor === undefined) return { text: null, conflict: true };
      old = [anchor];
      next = h.oldStart > 0 ? [anchor, ...next] : [...next, anchor];
    }
    const found = [];
    for (let i = 0; i + old.length <= target.length; i++)
      if (old.every((line, k) => target[i + k] === line)) found.push(i);
    if (found.length !== 1) return { text: null, conflict: true };
    target = [
      ...target.slice(0, found[0]),
      ...next,
      ...target.slice(found[0] + old.length),
    ];
  }
  return { text: target.join("\n"), conflict: false };
}
