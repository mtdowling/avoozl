// @ts-nocheck: typing debt
// Linked specs (simplify sim-2.5, §D19.2): a task title's link to another
// spec's tasks.md makes a spec group whose children are that spec's tasks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { linkedReader, waitsOf } from "../order.ts";
import { lintSpec, parseSpec } from "../spec-plans.ts";
import { tickEntry } from "../spec-ticks.ts";
import { specCheckout } from "../../test/spec-checkout.ts";
import { Operations } from "../../api/operations.ts";
import { createSpecPlan, readSpecFolder } from "../spec-plans.ts";
import { fixture } from "../../test/fixtures.ts";
import { writeSpec } from "../../test/spec-fixture.ts";

const PARENT = [
  "- [ ] `ctx-spec` Write the spec for [epic context]",
  "  - `epic-context` lints clean on `spec/epic-context`",
  "- [ ] `ctx-build` Implement [epic context]",
  "- [ ] `ctx-docs` Read [the guide](../../../docs/guide.md)",
  "  - The guide is read",
  "- [ ] `ctx-after` Announce it",
  "  - It is announced",
  "",
  "[epic context]: ../epic-context/tasks.md",
  "",
].join("\n");
const CHILD = [
  "- [ ] `ec-1` Gather",
  "  - Done",
  "- [ ] `ec-2` Brief",
  "  - Done",
  "",
].join("\n");

const reader = (specs) =>
  linkedReader(Object.entries(specs).map(([name, text]) => ({ name, text })));
const spec = (name, text, linked) => ({
  name,
  exists: true,
  files: { "tasks.md": text },
  linked,
});
const requires = (parsed) =>
  Object.fromEntries(
    parsed.proposals.map((p) => [p.id, [p.kind, ...(p.requires ?? [])]]),
  );
const errors = (name, text, linked) =>
  lintSpec({ spec: spec(name, text, linked) })
    .diagnostics.filter((d) => /^link\./.test(d.code))
    .map((d) => [d.code, d.taskId]);

test("a linked spec's tasks wait for the task above the group, and the task below waits for them", () => {
  const linked = reader({ ctx: PARENT, "epic-context": CHILD });
  assert.deepEqual(requires(parseSpec(spec("ctx", PARENT, linked))), {
    "ctx-spec": ["leaf"],
    "ctx-build": ["package"],
    // A link to a doc page leaves the task a leaf.
    "ctx-docs": ["leaf", "ec-2"],
    "ctx-after": ["leaf", "ctx-docs"],
  });
  assert.deepEqual(requires(parseSpec(spec("epic-context", CHILD, linked))), {
    "ec-1": ["leaf", "ctx-spec"],
    "ec-2": ["leaf", "ec-1"],
  });
  // The same waits, inline-linked.
  const inline = PARENT.replace(
    "Implement [epic context]",
    "Implement [epic context](../epic-context/tasks.md)",
  );
  assert.deepEqual(
    waitsOf("ctx", inline, reader({ ctx: inline, "epic-context": CHILD })),
    waitsOf("ctx", PARENT, linked),
  );
});

test("lint reports link.missing, link.twice and link.children", () => {
  // Missing, but the open task above writes it.
  assert.deepEqual(errors("ctx", PARENT, reader({ ctx: PARENT })), []);
  const alone = PARENT.replace("- [ ] `ctx-spec`", "- [x] `ctx-spec`");
  assert.deepEqual(errors("ctx", alone, reader({ ctx: alone })), [
    ["link.missing", "ctx-build"],
  ]);
  const other =
    "- [ ] `o-1` Also [epic context]\n\n[epic context]: ../epic-context/tasks.md\n";
  assert.deepEqual(
    errors(
      "ctx",
      PARENT,
      reader({ ctx: PARENT, other, "epic-context": CHILD }),
    ),
    [["link.twice", "ctx-build"]],
  );
  const nested = PARENT.replace(
    "- [ ] `ctx-build` Implement [epic context]\n",
    "- [ ] `ctx-build` Implement [epic context]\n  - [ ] `ctx-build.1` Own task\n    - Done\n",
  );
  assert.deepEqual(
    errors("ctx", nested, reader({ ctx: nested, "epic-context": CHILD })),
    [["link.children", "ctx-build"]],
  );
});

test("the landing that ticks a linked spec's last task ticks the parent's box in the same commit", async () => {
  const { root, run } = specCheckout("avoozl-linked-tick-"),
    write = (name, text) => {
      const file = path.join(root, ".kiro", "specs", name, "tasks.md");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    };
  write("ctx", PARENT);
  write("epic-context", CHILD.replace("- [ ] `ec-1`", "- [x] `ec-1`"));
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "Start"]);
  const plans = {
      "epic-context": {
        spec: "epic-context",
        mapping: { "ec-1": "ec-1", "ec-2": "ec-2" },
      },
    },
    store = { get: (_table, id) => plans[id] };
  await tickEntry(store, root, {
    spec: "epic-context",
    tasks: [{ task: "ec-2" }],
  });
  const staged = execFileSync("git", ["-C", root, "diff", "--cached"], {
    encoding: "utf8",
  });
  assert.match(staged, /\+- \[x\] `ec-2` Brief/);
  assert.match(staged, /\+- \[x\] `ctx-build` Implement \[epic context\]/);
  assert.doesNotMatch(staged, /\+- \[x\] `ctx-spec`/);
});

test("a linked spec's first task waits on the parent's task above it until both specs are approved and it lands", async (t) => {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  const ops = new Operations(store, { workspaceRoot: root }),
    spec = (name, tasks) => {
      writeSpec(root, name, { "tasks.md": `---\nrepo: app\n---\n${tasks}` });
      return createSpecPlan(
        store,
        { id: name, context: { repositoryId: "app" } },
        readSpecFolder(root, name),
      );
    },
    approve = (id) =>
      ops.execute("plan.approve", {
        id,
        expectedHash: store.get("plans", id).hash,
        expectedRevision: store.read().revision,
      }),
    task = (id) => store.read().tasks.find((row) => row.id === id);
  spec("source", "- [ ] `src-1` Build the source\n  - It builds\n");
  spec("consumer", "- [ ] `use-1` Use the source\n  - It is used\n");
  spec(
    "pair",
    "- [ ] `pair-1` Build [source](../source/tasks.md)\n- [ ] `pair-2` Build [consumer](../consumer/tasks.md)\n",
  );
  await approve("consumer");
  assert.deepEqual(
    task("use-1").pendingSpecDependencies.map((ref) => ref.taskId),
    ["src-1"],
  );
  await approve("source");
  assert.equal(task("use-1").pendingSpecDependencies, undefined);
  assert.ok(
    store
      .read()
      .edges.some((edge) => edge.from === "src-1" && edge.to === "use-1"),
  );
});
