// Avoozl's spec rules as a Kiro steering file's text: the `steering.specs`
// prompt (prompts.mjs) that a workspace may override.

export const STEERING_TEXT = `---
inclusion: always
---

# Avoozl spec rules

Avoozl delivers specs from the folder set by \`specs.path\` in the repository's
\`.avoozl.json\`. The default is \`.kiro/specs\`. Avoozl wrote this file. Edit it
to set rules for your team. Avoozl preserves your edits.

## Files

- Write a single-file spec as a Markdown file directly under \`specs.path\`. Put its
  tasks under \`## Tasks\`. For a split spec, use its own folder with
  \`requirements.md\` (or \`bugfix.md\` for a bug fix), \`design.md\` and
  \`tasks.md\`.
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

- Every task checklist item starts with its task ID as a code
  span, then its title: \`\`- [ ] \`1.2\` Validate config\`\` or
  \`\`- [ ] \`cache-invalidation\` Drop stale entries\`\`.
- An ID is letters, digits, \`.\`, \`_\` and \`-\`, starting with a letter or
  digit. IDs compare exactly. A bare ID with no code span is no ID, and lint
  refuses the item.
- Each ID appears once. Never reuse an ID for other work, and never
  renumber an item that exists.
- Use \`###\` phase headings under \`## Tasks\` or \`##\` headings in \`tasks.md\`.
- End a title with the requirements it builds in brackets, then the design
  sections it follows in parentheses: \`\`- [ ] \`1.2\` Validate config
  [R1.2] (§2.1)\`\`. \`R1.2\` is criterion 2 of \`Requirement 1\` (\`DL1.2\` under
  \`Requirement DL1\`), \`§2.1\` the design heading that starts with \`2.1\`
  (\`§D1\` for \`## D1.\`). Lint refuses a ref the spec does not define.

## Tasks

- A task holds no facts: never write a bullet that starts with \`$\`.
- Tasks run in list order, top to bottom. An item with sub-items is a group:
  its tasks run in order, or side by side when its title ends with
  \`(**PARALLEL**)\`. A group has no bullets of its own; its box follows its
  tasks. Each phase waits for the phase above it.
- Every other item is one task for one agent session. Its plain bullets say
  what is done, one result each that someone can check.
- Put \`repo: app\` in the front matter of the file with tasks to name the
  repository the spec changes.
- Never write \`checks\`: every task runs its repository's checks, which a
  person sets in Avoozl.
- A step only a person does ends its title with \`(**MANUAL**)\`, before its
  refs. A person ticks it.
- Kiro's \`_Requirements: 1.2_\` line is a note. Keep it.

  \`\`\`markdown
  ---
  repo: app
  ---
  - [ ] \`1.2\` Validate config
    - An unknown key is reported with its path
  \`\`\`

## Stop after tasks

Avoozl delivers this spec. Do not run its tasks or start a build from Spec
Builder. Avoozl imports the spec as a draft plan; a person approves it in
Avoozl.
`;
