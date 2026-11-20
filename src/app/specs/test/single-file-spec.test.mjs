// A spec in one file: its `## Tasks` section is the task list, read the same
// way tasks.md is (spec-tasks.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { lintSpec, parseSpec, specHash } from "../spec-plans.mjs";
import { tickedText, ticksOf } from "../spec-ticks.mjs";
import { addTaskLines, specTasks, taskFile } from "../spec-tasks.mjs";
import { linkDefinitions, linkedSpecOf } from "../order.mjs";

const TASKS = `---
repo: app
---

## Load

- [ ] \`c-1\` Read the file
  - A file with every key loads
- [ ] \`c-2\` Report unknown keys
  - An unknown key is reported with its path

## Use

- [ ] \`c-3\` Apply the settings
  - Every key reaches its module
`;

// The same spec as one file: prose, then the tasks, then more prose.
const SINGLE = `---
repo: app
---

# Config

Settings load from one file.

- [ ] A prose checkbox, not a task

## Tasks

### Load

- [ ] \`c-1\` Read the file
  - A file with every key loads
- [ ] \`c-2\` Report unknown keys
  - An unknown key is reported with its path

### Use

- [ ] \`c-3\` Apply the settings
  - Every key reaches its module

## Notes

Unknown keys never stop a load.
`;

const parse = (files) => parseSpec({ name: "config", exists: true, files });
const shape = (files) =>
  parse(files).proposals.map((task) => ({
    id: task.id,
    title: task.title,
    phase: task.phase?.title ?? null,
    acceptance: task.acceptance,
    requires: task.requires ?? [],
  }));

test("a ## Tasks section reads as tasks.md does", () => {
  const single = { "config.md": SINGLE };
  assert.deepEqual(parse(single).diagnostics, []);
  assert.deepEqual(shape(single), shape({ "tasks.md": TASKS }));
  assert.deepEqual(
    shape(single).map((task) => task.phase),
    ["Load", "Load", "Use"],
  );
  // Lines are the file's own lines.
  assert.equal(
    SINGLE.split("\n")[parse(single).proposals[0].lineStart - 1],
    "- [ ] `c-1` Read the file",
  );
  assert.equal(taskFile(single), "config.md");
  assert.equal(taskFile({ "tasks.md": TASKS }), "tasks.md");
});

test("tasks.md beside a ## Tasks section is a lint error naming both", () => {
  const result = lintSpec({
    spec: {
      name: "config",
      exists: true,
      files: { "tasks.md": TASKS, "config.md": SINGLE },
    },
    plan: { id: "config" },
  });
  const twice = result.diagnostics.find(
    (item) => item.code === "spec.tasks-twice",
  );
  assert.ok(twice);
  assert.equal(twice.file, "config.md");
  assert.match(twice.message, /tasks\.md and config\.md/);
  assert.equal(result.canApprove, false);
  // Two single files are refused too.
  assert.ok(
    parse({ "a.md": SINGLE, "b.md": SINGLE }).diagnostics.some(
      (item) => item.code === "spec.tasks-twice",
    ),
  );
  // No task list at all names both ways to add one.
  const none = parse({ "config.md": "# Config\n" }).diagnostics;
  assert.match(none[0].message, /tasks\.md, or a ## Tasks section/);
});

test("a tick changes no spec text; the prose does", () => {
  const files = { "config.md": SINGLE },
    ticked = { "config.md": SINGLE.replace("- [ ] `c-1`", "- [x] `c-1`") },
    prose = { "config.md": SINGLE.replace("one file.", "two files.") },
    outside = {
      "config.md": SINGLE.replace("- [ ] A prose", "- [x] A prose"),
    };
  assert.equal(specHash(ticked), specHash(files));
  assert.notEqual(specHash(prose), specHash(files));
  // A checkbox outside ## Tasks is spec text.
  assert.notEqual(specHash(outside), specHash(files));
});

test("a tick writes the single file's own line", () => {
  const { text, ticked } = tickedText("config", SINGLE, ["c-2"], "config.md");
  assert.deepEqual(ticked, ["c-2"]);
  assert.equal(
    text,
    SINGLE.replace("- [ ] `c-2`", "- [x] `c-2`"),
    "only the task's mark changes",
  );
  const read = ticksOf("config", specTasks({ "config.md": text }).text);
  assert.deepEqual([...read.ticked.keys()], ["c-2"]);
});

test("a proposed task goes at the end of the ## Tasks section", () => {
  const added = addTaskLines("config.md", SINGLE, [
    "- [ ] `c-4` Watch the file",
    "  - An edit reloads",
  ]);
  const tasks = parse({ "config.md": added }).proposals.map((task) => task.id);
  assert.deepEqual(tasks, ["c-1", "c-2", "c-3", "c-4"]);
  assert.ok(added.endsWith("## Notes\n\nUnknown keys never stop a load.\n"));
  assert.equal(
    addTaskLines("tasks.md", "a", ["b"]),
    "a\nb\n",
    "tasks.md gets the lines at its end",
  );
});

test("a spec link may target a single file, and its definition is kept", () => {
  const none = new Map();
  assert.equal(
    linkedSpecOf("settings", "Build [c](../config/config.md)", none),
    "config",
  );
  assert.equal(
    linkedSpecOf("settings", "Build [c](../config/tasks.md)", none),
    "config",
  );
  assert.equal(
    linkedSpecOf("settings", "Read [c](../config/design.md)", none),
    null,
  );
  // A reference definition below the section still reads.
  const file = `# Settings\n\n## Tasks\n\n- [ ] \`s-1\` Build [config]\n\n## Notes\n\n[config]: ../config/config.md\n`;
  const text = specTasks({ "settings.md": file }).text;
  assert.equal(
    linkedSpecOf("settings", "Build [config]", linkDefinitions(text)),
    "config",
  );
});
