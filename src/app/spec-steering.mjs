// Avoozl's spec rules as a Kiro steering file. New plan hands a plan idea
// to Spec Builder, whose chat runs the default Kiro Crew agent in the spec's
// repository; that agent loads `.kiro/steering/**/*.md` from there. So the
// rules travel as a steering file in the repository, written only when a
// person agrees, and never over a copy someone changed.
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";

export const STEERING_FILE = path.join(".kiro", "steering", "avoozl-specs.md");

export const STEERING_TEXT = `---
inclusion: always
---

# Avoozl spec rules

Avoozl delivers the specs in \`.kiro/specs/\`. Follow these rules whenever you
write or change a spec there. Avoozl wrote this file; edit it if your team
wants other rules. Avoozl never overwrites a changed copy.

## Files

- Write \`.kiro/specs/<name>/requirements.md\` (or \`bugfix.md\` for a bug fix,
  never both), \`design.md\` and \`tasks.md\`.
- Do not write \`avoozl/manifest.json\`. Avoozl writes it from \`tasks.md\`.
- When you are given a category, start \`requirements.md\` (or \`bugfix.md\`)
  with this front-matter. Add the \`epic:\` line only when you are given an
  epic. Keep the block exactly as written; never add or change it otherwise.

  \`\`\`markdown
  ---
  category: <category>
  epic: <epic>
  ---
  \`\`\`

## Task IDs

- Every checklist item in \`tasks.md\` starts with its task ID, then its
  title: \`- [ ] 1. Read the config file\` or \`- [ ] 1.2 Validate config\`.
- Use Kiro's numbers (\`1\`, \`1.1\`, \`1.2\`; a trailing period is fine), or a
  lowercase named ID with a hyphen or period in it, such as
  \`cache-invalidation\`.
- Each ID appears once. Never reuse an ID for other work, and never
  renumber an item that exists.
- Group phases under \`##\` headings.

## Tasks

- An item with sub-items is a group. It is done when its sub-items are.
- Every other item is one task for one agent session in one repository.
  Under it, write bullet lines. Avoozl reads them:
  - \`_Repository: <id>_\`: the one repository it changes. Needed when
    more than one repository is in scope.
  - \`_Requires: 1.1, 2_\`: task IDs that must finish first.
  - \`\` _Checks: \`npm test\`_ \`\`: commands that prove it. Leave it out to
    use the repository's own checks.
  - \`_Requirements: 1.2_\`: Kiro's link to the requirements. Keep it.
  - Every other bullet is acceptance: a result someone can check.
- A step only a person does is a manual task. Add \`_Manual_\` under it,
  write what the person checks as its acceptance, and give it no checks.

## Stop after tasks

Avoozl delivers this spec. Do not run its tasks or start a build from Spec
Builder. Avoozl imports the spec as a draft plan; a person approves it in
Avoozl.
`;

// Where the steering file lives in `root`, and whether it is missing, the
// text above, or a changed copy.
export function steeringStatus(root) {
  const file = path.join(root, STEERING_FILE);
  let text;
  try {
    const stat = fs.lstatSync(file);
    // A symlink or folder is a change someone made; it is never written.
    if (!stat.isFile()) return { path: file, state: "changed" };
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { path: file, state: "missing" };
    throw error;
  }
  return { path: file, state: text === STEERING_TEXT ? "current" : "changed" };
}

// Write the steering file only where none exists. Returns the new status.
export function writeSteering(root) {
  const status = steeringStatus(root);
  if (status.state !== "missing") return status;
  fs.mkdirSync(path.dirname(status.path), { recursive: true });
  try {
    // `wx`: a file written since the check above is kept, not replaced.
    fs.writeFileSync(status.path, STEERING_TEXT, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST")
      fail(`Could not write ${STEERING_FILE}: ${error.message}`, 500);
  }
  return steeringStatus(root);
}
