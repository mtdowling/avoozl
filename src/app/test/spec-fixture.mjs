import fs from "node:fs";
import path from "node:path";
import { specItems, taskToken } from "../specs/spec-plans.mjs";

// Fixture shorthand: tests may describe a spec's tasks as one object under
// this key, in the shape `specFacts` once returned. `withFacts` writes them
// into tasks.md in the list form Avoozl reads (simplify §D20): a leaf's
// `acceptance` as plain bullets, `manual` as the `(**MANUAL**)` tag, and the
// leaves' one `repository` as front matter `repo`. Order comes from the list,
// so `requires` is not written. A tasks.md written with `$` bullets is turned
// into the same form.
const MANIFEST = "avoozl/manifest.json";

// tasks.md text with `$done`, `$manual` and `$repo` bullets in list form,
// and every other `$` bullet dropped.
export function listForm(text) {
  const rows = text.split("\n"),
    out = [],
    repos = new Set();
  for (const row of rows) {
    const fact = /^(\s*)[-*+] \$([A-Za-z]+):\s*(.*)$/.exec(row);
    if (!fact) {
      out.push(row);
      continue;
    }
    const [, indent, key, value] = fact;
    if (key === "done") out.push(`${indent}- ${value}`);
    else if (key === "repo") repos.add(value.trim());
    else if (key === "manual" && value.trim() === "true")
      for (let at = out.length - 1; at >= 0; at--)
        if (/^\s*[-*+] \[[ xX~-]\] /.test(out[at])) {
          out[at] = `${out[at]} (**MANUAL**)`;
          break;
        }
  }
  return withRepo(out.join("\n"), repos);
}

function withRepo(text, repos) {
  if (repos.size !== 1 || /^---\n[\s\S]*?\nrepo:/m.test(text)) return text;
  const [repo] = repos;
  return text.startsWith("---\n")
    ? text.replace("---\n", `---\nrepo: ${repo}\n`)
    : `---\nrepo: ${repo}\n---\n${text}`;
}

export function withFacts(files) {
  const tasks = files["tasks.md"];
  if (
    files[MANIFEST] === undefined ||
    files[MANIFEST] === null ||
    typeof tasks !== "string" ||
    /^\s*[-*+] \$[A-Za-z][A-Za-z0-9]*:/m.test(tasks)
  ) {
    const { [MANIFEST]: _gone, ...rest } = files;
    if (typeof rest["tasks.md"] === "string")
      rest["tasks.md"] = listForm(rest["tasks.md"]);
    return rest;
  }
  const facts = JSON.parse(files[MANIFEST]),
    entries = facts.tasks ?? {},
    repos = new Set(),
    items = new Map(
      specItems("x", tasks)
        .filter((item) => item.key)
        .map((item) => [item.line, item]),
    ),
    out = [],
    groups = new Set(
      specItems("x", tasks)
        .map((item) => item.parent?.key)
        .filter(Boolean),
    );
  tasks.split("\n").forEach((row, index) => {
    const item = items.get(index + 1),
      entry = item && entries[item.key];
    if (!entry) {
      out.push(row);
      return;
    }
    const indent = " ".repeat(/^\s*/.exec(row)[0].length + 2);
    out.push(entry.manual ? `${row} (**MANUAL**)` : row);
    if (groups.has(item.key)) return;
    if (entry.repository) repos.add(entry.repository);
    for (const result of entry.acceptance ?? [])
      out.push(`${indent}- ${result}`);
  });
  const { [MANIFEST]: _gone, ...rest } = files;
  rest["tasks.md"] = withRepo(out.join("\n"), repos);
  return rest;
}

// One small feature spec: a package and two dependent leaves.
export const specFiles = () => withFacts(legacySpecFiles());

// The same spec with its facts in the fixture shorthand.
export const legacySpecFiles = () => ({
  "requirements.md":
    "# Load configuration\n\nThe CLI reads and validates config.json.\n",
  "design.md": "# Design\n\nA loader, then a validator that uses it.\n",
  "tasks.md": [
    "# Tasks",
    "",
    "- [ ] 1 Load and validate configuration",
    "  - [ ] 1.1 Read the config file",
    "  - [ ] 1.2 Validate loaded config",
    "",
  ].join("\n"),
  "avoozl/manifest.json":
    JSON.stringify(
      {
        tasks: {
          1: {
            kind: "package",
            summary: "The goal.",
            requires: ["1.1", "1.2"],
            acceptance: ["The CLI reads, validates, and reports its config."],
          },
          1.1: {
            kind: "leaf",
            summary: "Parse config.json from the working directory.",
            acceptance: ["A missing file yields defaults."],
            checks: ["npm test"],
            completion: "integrated",
          },
          1.2: {
            kind: "leaf",
            summary: "Report unknown keys.",
            requires: ["1.1"],
            acceptance: ["An unknown key is reported with its path."],
            checks: ["npm test"],
            completion: "integrated",
          },
        },
      },
      null,
      2,
    ) + "\n",
});

// A synthetic spec's files: one tasks.md item per entry (ticked when its ID
// is in `checked`), with the entries as its facts.
export const syntheticSpecFiles = (entries, checked = []) => ({
  "requirements.md": "# Synthetic requirements\n\nStatus: Draft\n",
  "design.md": "# Synthetic design\n\nStatus: Draft\n",
  "tasks.md":
    "# Tasks\n\nStatus: Draft\n\n" +
    Object.entries(entries)
      .map(
        ([id, task]) =>
          `- [${checked.includes(id) ? "x" : " "}] ${taskToken(id)} ${task.summary}`,
      )
      .join("\n") +
    "\n",
  [MANIFEST]: JSON.stringify({ version: 1, tasks: entries }),
});

// Write a spec folder under root; a file set to null is left out.
export function writeSpec(root, name, overrides = {}) {
  const directory = path.join(root, ".kiro", "specs", name),
    files = withFacts({ ...legacySpecFiles(), ...overrides });
  fs.mkdirSync(path.join(directory, "avoozl"), { recursive: true });
  for (const [file, text] of Object.entries(files))
    if (text !== null) fs.writeFileSync(path.join(directory, file), text);
  return directory;
}

// A tasks.md text with the facts of `manifest` (the fixture's by default)
// folded in, for tests that rewrite tasks.md on disk.
export const tasksWithFacts = (tasks, manifest = legacySpecFiles()[MANIFEST]) =>
  withFacts({ "tasks.md": tasks, [MANIFEST]: manifest })["tasks.md"];

// The fixture's tasks.md line of a text.
export const lineIn = (text, needle) =>
  text.slice(0, text.indexOf(needle)).split("\n").length;

// A files object for a manifest-shaped value: one tasks.md item per task key,
// each with its Facts bullet. For tests that store approvals directly.
export const factsFiles = (manifest) =>
  withFacts({
    "tasks.md": Object.keys(manifest.tasks ?? {})
      .map((key) => `- [ ] ${taskToken(key)} Task ${key}\n`)
      .join(""),
    [MANIFEST]: JSON.stringify(manifest),
  });
