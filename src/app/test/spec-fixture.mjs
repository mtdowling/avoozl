import fs from "node:fs";
import path from "node:path";
import {
  factsLines,
  summaryLines,
  withDefaults,
} from "../specs/spec-facts.mjs";
import { specItems, taskToken } from "../specs/spec-plans.mjs";
import { repeatsTitle } from "../tasks/title-repeat.mjs";

// Fixture shorthand: tests may describe a spec's facts as one object under
// this key, in the shape `specFacts` returns. `withFacts` writes them into
// tasks.md as `$key:` bullets, the only layout Avoozl reads, and drops the
// key. A tasks.md that already has `$` bullets keeps its own.
const MANIFEST = "avoozl/manifest.json";

export function withFacts(files) {
  const tasks = files["tasks.md"];
  if (
    files[MANIFEST] === undefined ||
    files[MANIFEST] === null ||
    typeof tasks !== "string" ||
    /^\s*[-*+] \$[A-Za-z][A-Za-z0-9]*:/m.test(tasks)
  ) {
    const { [MANIFEST]: _gone, ...rest } = files;
    return rest;
  }
  const facts = JSON.parse(files[MANIFEST]),
    epic = facts.kind === "epic",
    entries = {},
    front = epic ? ["kind: epic"] : [];
  for (const [id, entry] of Object.entries(facts.tasks ?? {})) {
    const own = withDefaults({}, entry);
    // Every task runs its repository's checks.
    delete own.checks;
    if (own.manual === true && own.completion === "person")
      delete own.completion;
    if (!epic && own.kind === "leaf") delete own.kind;
    entries[id] = own;
  }
  for (const field of [
    "ship",
    "integrationBranch",
    "integrationSync",
    "forwardTarget",
    "publicBranch",
  ])
    if (facts[field] !== undefined) front.push(`${field}: ${facts[field]}`);
  for (const [id, phase] of Object.entries(facts.phases ?? {}))
    front.push(`phase-${id}: ${phase.title}`);
  for (const [id, group] of Object.entries(facts.batches ?? {})) {
    front.push(`batch-${id}: ${group.reason}`);
    for (const task of group.tasks) entries[task].batch = id;
  }
  const items = new Map(
      specItems("x", tasks)
        .filter((item) => item.key)
        .map((item) => [item.line, item]),
    ),
    out = [];
  tasks.split("\n").forEach((row, index) => {
    out.push(row);
    const item = items.get(index + 1),
      entry = item && entries[item.key];
    if (!entry) return;
    const { summary, ...own } = entry,
      indent = /^\s*/.exec(row)[0].length + 2;
    out.push(
      ...factsLines(own, { indent }),
      ...(repeatsTitle(summary, item.title)
        ? []
        : summaryLines(summary, { indent })),
    );
  });
  const { [MANIFEST]: _gone, ...rest } = files;
  rest["tasks.md"] =
    (front.length ? ["---", ...front, "---", ""].join("\n") : "") +
    out.join("\n");
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
