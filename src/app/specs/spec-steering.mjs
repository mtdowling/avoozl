// Avoozl's spec rules as a Kiro steering file. New plan hands a plan idea
// to Spec Builder, whose chat runs the default Kiro Crew agent in the spec's
// repository; that agent loads `.kiro/steering/**/*.md` from there. So the
// rules travel as a steering file in the repository, written only when a
// person agrees, and never over a copy someone changed.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fail } from "../store/store.mjs";

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
- Never write \`avoozl/manifest.json\`. Avoozl refuses a folder that has one.
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
  lowercase named ID with a hyphen or period in it. Write a named ID as a
  code span:
  \`\`- [ ] \`cache-invalidation\` Drop stale entries\`\`.
- Each ID appears once. Never reuse an ID for other work, and never
  renumber an item that exists.
- Group phases under \`##\` headings.
- End a title with the requirements it builds in brackets, then the design
  sections it follows in parentheses: \`- [ ] 1.2 Validate config [R1.2]
  (§2.1)\`. \`R1.2\` is criterion 2 of \`Requirement 1\` (\`DL1.2\` under
  \`Requirement DL1\`), \`§2.1\` the design heading that starts with \`2.1\`
  (\`§D1\` for \`## D1.\`). Lint refuses a ref the spec does not define.

## Tasks

- A task holds no facts: never write a bullet that starts with \`$\`.
- Tasks run in list order, top to bottom. An item with sub-items is a group:
  its tasks run in order, or side by side when its title ends with
  \`(**PARALLEL**)\`. A group has no bullets of its own; its box follows its
  tasks. A \`##\` phase waits for the phase above it.
- Every other item is one task for one agent session. Its plain bullets say
  what is done, one result each that someone can check.
- Front matter at the top of \`tasks.md\` names the one repository the spec
  changes: \`repo: app\`.
- Never write \`checks\`: every task runs its repository's checks, which a
  person sets in Avoozl.
- A step only a person does ends its title with \`(**MANUAL**)\`, before its
  refs. A person ticks it.
- Kiro's \`_Requirements: 1.2_\` line is a note. Keep it.

  \`\`\`markdown
  ---
  repo: app
  ---
  - [ ] 1.2 Validate config
    - An unknown key is reported with its path
  \`\`\`

## Stop after tasks

Avoozl delivers this spec. Do not run its tasks or start a build from Spec
Builder. Avoozl imports the spec as a draft plan; a person approves it in
Avoozl.
`;

// The sha256 of each text Avoozl shipped before, so a repository's
// unchanged copy is offered the current one (older texts taught marker
// bullets, then `Facts:` blocks, Requirement 111).
const OLDER_STEERING_HASHES = new Set([
  "b16a9f6d252b380c74033fc553296724710fc104c4435b020f205606afab2e07",
  "85d87bd6870f8ac9721ba42f30c6d0713d2149c39f6ed27f8dff74a3c4b6d122",
  "6d4a6d30b8bd0f88cb71c476e01e26f6a392b18ea63a42f65eeffaf7a6639d88",
  "39a7d455120e65b3dc35b097c9b7f70eebe413c098d26945f63bf8ffd34b3fdf",
  "40566c57d79fd2800164002811dafde36f58374d4dcb7a2d9280fa07b0ccff2d",
  "f781a3ce6da5348ba85c480c8d1e1b54384d43a71c072c6da6f0f36dd4c7eb1d",
  "dd29090a99dd0c1d46c698a4f2140966835c64b51d6ceedb6d006490631a7c17",
  "dfdc80a30250940506d743e7337629b2add17517bb6baa07a6107143bc8c8e1d",
]);
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Where the steering file lives in `root`, and whether it is missing, the
// current text, an `older` text Avoozl wrote before (offered again), or a
// changed copy. `text` is this workspace's current text (a local override
// may replace the one above, design §4.18); `older` lists earlier ones.
export function steeringStatus(
  root,
  { text: current = STEERING_TEXT, older = [] } = {},
) {
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
  return {
    path: file,
    state:
      text === current
        ? "current"
        : older.includes(text) || OLDER_STEERING_HASHES.has(sha256(text))
          ? "older"
          : "changed",
  };
}

// Write the steering file only where none exists, or over a copy equal to
// an older Avoozl text. Returns the new status.
export function writeSteering(root, options = {}) {
  const status = steeringStatus(root, options),
    text = options.text ?? STEERING_TEXT;
  if (status.state === "older") {
    // Replaced whole, so a copy changed since the check is never mixed.
    const temp = `${status.path}.${process.pid}.tmp`;
    fs.writeFileSync(temp, text);
    if (steeringStatus(root, options).state === "older")
      fs.renameSync(temp, status.path);
    else fs.rmSync(temp, { force: true });
    return steeringStatus(root, options);
  }
  if (status.state !== "missing") return status;
  fs.mkdirSync(path.dirname(status.path), { recursive: true });
  try {
    // `wx`: a file written since the check above is kept, not replaced.
    fs.writeFileSync(status.path, text, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST")
      fail(`Could not write ${STEERING_FILE}: ${error.message}`, 500);
  }
  return steeringStatus(root, options);
}
