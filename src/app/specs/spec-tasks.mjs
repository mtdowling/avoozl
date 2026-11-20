// Where a spec's tasks are. A spec folder holds its task list in tasks.md, or
// in the `## Tasks` section of its one other Markdown file. Every reader of
// the task list (the parser, lint, ticks, landing, rebuild and the page) asks
// here, so both layouts read the same way.
//
// The task text of a single-file spec keeps the file's line numbers: its
// front-matter, the section's lines and link definitions stay, every other
// line is blank, and
// each heading under `## Tasks` loses one `#`, so its `###` phases read as
// tasks.md's `##` phases. A diagnostic's line and a tick's line are lines of
// the real file.
export const TASKS_FILE = "tasks.md";
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s/;
const TASKS_HEADING = /^##[ \t]+Tasks[ \t]*#*[ \t]*$/;
// A reference-style link definition, `[label]: target`. A single file's task
// text keeps these lines, so a task title's link reads its target.
export const LINK_DEFINITION = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/;
// A Markdown file directly in a spec folder is part of the spec.
export const SPEC_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.md$/;

// The 1-based line of each `## Tasks` heading outside fences, and the line
// after the section ends: {start, end}, or null when there is none.
export function tasksSection(text) {
  if (typeof text !== "string") return null;
  const lines = text.split("\n");
  let fenced = false,
    start = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r$/, "");
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced) continue;
    const heading = HEADING.exec(line);
    if (start && heading && heading[1].length <= 2)
      return { start, end: index + 1 };
    if (!start && TASKS_HEADING.test(line)) start = index + 1;
  }
  return start ? { start, end: lines.length + 1 } : null;
}

// Every file of `files` that holds a task list: tasks.md, then each other
// spec file with a `## Tasks` section, by name. More than one is a lint
// error (spec-plans.mjs parseSpec).
export function taskFiles(files = {}) {
  return [
    ...(files[TASKS_FILE] === undefined ? [] : [TASKS_FILE]),
    ...Object.keys(files)
      .filter(
        (file) =>
          file !== TASKS_FILE &&
          SPEC_TEXT.test(file) &&
          tasksSection(files[file]),
      )
      .sort(),
  ];
}

// The file that holds the tasks: tasks.md when no file does.
export const taskFile = (files = {}) => taskFiles(files)[0] ?? TASKS_FILE;

// The task text of `file` (see the top of this file).
export function taskText(file, text) {
  if (file === TASKS_FILE || typeof text !== "string") return text;
  const section = tasksSection(text);
  if (!section) return "";
  const lines = text.split("\n");
  let front = 0;
  if (/^\uFEFF?---[ \t]*\r?$/.test(lines[0]))
    front =
      lines.findIndex(
        (row, index) => index > 0 && /^(?:---|\.\.\.)[ \t]*\r?$/.test(row),
      ) + 1;
  let fenced = false;
  return lines
    .map((line, index) => {
      const at = index + 1;
      if (at <= front) return line;
      if (at <= section.start || at >= section.end)
        return LINK_DEFINITION.test(line) ? line : "";
      if (FENCE.test(line)) fenced = !fenced;
      return !fenced && /^#{3,6}\s/.test(line) ? line.slice(1) : line;
    })
    .join("\n");
}

// {file, text} for the spec's task list, or null when it has none.
export function specTasks(files = {}) {
  const file = taskFiles(files)[0];
  return file === undefined
    ? null
    : { file, text: taskText(file, files[file]) };
}

// `text` with `lines` added as the task list's last lines: the end of
// tasks.md, or the end of the `## Tasks` section. `eol` ends each line.
export function addTaskLines(file, text, lines, eol = "\n") {
  const added = lines.map((line) => line + eol).join("");
  if (file === TASKS_FILE)
    return text + (text && !text.endsWith("\n") ? eol : "") + added;
  const section = tasksSection(text),
    rows = text.split("\n");
  if (!section || section.end > rows.length)
    return text + (text && !text.endsWith("\n") ? eol : "") + added;
  // Before the blank lines that close the section.
  let at = section.end - 1;
  while (at > section.start && !rows[at - 1].trim()) at--;
  const before = rows.slice(0, at).join("\n"),
    after = rows.slice(at).join("\n");
  return `${before}${eol}${added}${after}`;
}
