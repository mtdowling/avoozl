import fs from "node:fs";
import path from "node:path";
import { foldManifest } from "./legacy-facts.mjs";

const MANIFEST = "avoozl/manifest.json";

// Tests may still describe facts as a manifest object: this folds it into
// tasks.md as Facts bullets (Requirement 111), the only layout Avoozl reads.
// A tasks.md that already has Facts bullets, or none, keeps no manifest.
export function withFacts(files) {
  const tasks = files["tasks.md"];
  if (
    files[MANIFEST] === undefined ||
    files[MANIFEST] === null ||
    typeof tasks !== "string" ||
    /^\s*[-*+] Facts:\s*$/m.test(tasks)
  ) {
    const { [MANIFEST]: _gone, ...rest } = files;
    return rest;
  }
  return foldManifest(files, { exact: false, defaults: false }).files;
}

// One small feature spec: a package and two dependent leaves.
export const specFiles = () => withFacts(legacySpecFiles());

// The same spec with its facts still in a manifest object.
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
export const tasksWithFacts = (
  tasks,
  manifest = legacySpecFiles()[MANIFEST],
) =>
  withFacts({ "tasks.md": tasks, [MANIFEST]: manifest })["tasks.md"];

// The fixture's tasks.md line of a text.
export const lineIn = (text, needle) =>
  text.slice(0, text.indexOf(needle)).split("\n").length;
