// A task's summary adds context or is not there: one that mostly says what
// its title says is a lint error in a spec (spec-plans.mjs) and never
// reaches a brief, an issue or the page.

// The share of a text's words its title already holds, at which the text
// only repeats it.
export const REPEAT_SHARE = 0.8;
const SHORT_WORD = 2;

const words = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9<>]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > SHORT_WORD);

// The title's own words: without requirement brackets, `(§…)` references
// and an `after …` tail.
const titleWords = (title) =>
  new Set(
    words(
      String(title ?? "")
        .replace(/\s*\[[^\]]*\]\s*/g, " ")
        .replace(/\s*\(§[^)]*\)\s*/g, " ")
        .replace(/,?\s+after\s+[A-Za-z0-9., -]+$/i, ""),
    ),
  );

// Whether `text` (one description bullet, or a whole summary) mostly
// restates `title`. Bullet markers are not words.
export function repeatsTitle(text, title) {
  const own = words(String(text ?? "").replace(/^\s*[-*+]\s+/gm, " "));
  if (!own.length) return true;
  const known = titleWords(title);
  return (
    own.filter((word) => known.has(word)).length / own.length >= REPEAT_SHARE
  );
}

// A task's summary when it adds to its title, else null.
export function ownSummary(task) {
  const text = typeof task?.summary === "string" ? task.summary.trim() : "";
  return text && !repeatsTitle(text, task.title) ? text : null;
}

// The brief's `Summary:` line for a task, or null. A summary of several
// lines (its bullets as written) starts on the next line.
export function summaryLine(task) {
  const text = ownSummary(task);
  if (!text) return null;
  return text.includes("\n") ? `Summary:\n${text}` : `Summary: ${text}`;
}
