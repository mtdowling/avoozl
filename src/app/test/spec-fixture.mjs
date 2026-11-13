import fs from "node:fs";
import path from "node:path";

// One small feature spec: a package and two dependent leaves.
export const specFiles = () => ({
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
    files = { ...specFiles(), ...overrides };
  fs.mkdirSync(path.join(directory, "avoozl"), { recursive: true });
  for (const [file, text] of Object.entries(files))
    if (text !== null) fs.writeFileSync(path.join(directory, file), text);
  return directory;
}
