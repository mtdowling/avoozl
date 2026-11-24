// Order from the list: waitsOf derives every wait
// from the list, and lint checks the list's groups and tags.
import assert from "node:assert/strict";
import test from "node:test";
import { waitsOf } from "../order.ts";
import { lintSpec, parseSpec } from "../spec-plans.ts";

const spec = (tasks: string) => ({
  name: "ec",
  exists: true,
  files: { "tasks.md": tasks },
});
const pairs = (text: string) =>
  waitsOf("ec", text)
    .map(({ from, to }) => `${from}>${to}`)
    .sort();
const codes = (text: string) =>
  lintSpec({ spec: spec(text) })
    .diagnostics.filter(
      (item) =>
        item.severity === "error" && /^(group|parallel)\./.test(item.code),
    )
    .map((item) => [item.code, item.taskId]);

const OWNER_EXAMPLE = [
  "- [ ] `ec-2.1` Gather a session's context",
  "  - Done",
  "- [ ] `ec-2.2` Reads, skills and the brief",
  "  - Done",
  "- [ ] `ec-2.3` Ways out [EC7] (§D6) (**PARALLEL**)",
  "  - [ ] `ec-2.4` The MCP relay",
  "    - Done",
  "  - [ ] `ec-2.5` Kiro Crew chat workers",
  "    - Done",
  "  - [ ] `ec-2.6` Comments that do not count never reach it",
  "    - Done",
  "- [ ] `ec-2.7` The chip, Activity and Settings",
  "  - Done",
  "",
].join("\n");

test("the owner's example: ec-2.1, then ec-2.2, then ec-2.4 to ec-2.6 side by side, then ec-2.7", () => {
  assert.deepEqual(pairs(OWNER_EXAMPLE), [
    "ec-2.1>ec-2.2",
    "ec-2.2>ec-2.4",
    "ec-2.2>ec-2.5",
    "ec-2.2>ec-2.6",
    "ec-2.4>ec-2.7",
    "ec-2.5>ec-2.7",
    "ec-2.6>ec-2.7",
  ]);
  // The tag after refs parses, and the group is never a leaf to start.
  const { proposals } = parseSpec(spec(OWNER_EXAMPLE)),
    byId = new Map(proposals.map((p) => [p.id, p]));
  assert.notEqual(byId.get("ec-2.3")?.kind, "leaf");
  assert.equal(byId.get("ec-2.3")?.requires, undefined);
  assert.deepEqual(byId.get("ec-2.7")?.requires?.sort(), [
    "ec-2.4",
    "ec-2.5",
    "ec-2.6",
  ]);
  assert.deepEqual(byId.get("ec-2.4")?.requires, ["ec-2.2"]);
  assert.deepEqual(codes(OWNER_EXAMPLE), []);
});

test("an untagged child group of a parallel group runs its children in order", () => {
  const text = [
    "- [ ] `ec-1.2` Sources (**PARALLEL**)",
    "  - [ ] `ec-1.1` The machine block",
    "    - Done",
    "  - [ ] `ec-1.5` The plugin part",
    "    - [ ] `ec-1.3` The part's manifest",
    "      - Done",
    "    - [ ] `ec-1.4` Asks and the approval hash",
    "      - Done",
    "- [ ] `ec-1.6` After",
    "  - Done",
    "",
  ].join("\n");
  assert.deepEqual(pairs(text), [
    "ec-1.1>ec-1.6",
    "ec-1.3>ec-1.4",
    "ec-1.4>ec-1.6",
  ]);
});

test("the first item of a phase waits for the phase above", () => {
  const text = [
    "## Phase 1",
    "",
    "- [x] `x-a` One",
    "  - Done",
    "- [ ] `x-b` Two (**PARALLEL**)",
    "  - [ ] `x-b1` Two a",
    "    - Done",
    "  - [ ] `x-b2` Two b",
    "    - Done",
    "",
    "## Phase 2",
    "",
    "- [ ] `x-c` Three",
    "  - Done",
    "",
  ].join("\n");
  assert.deepEqual(pairs(text), [
    "x-a>x-b1",
    "x-a>x-b2",
    "x-b1>x-c",
    "x-b2>x-c",
  ]);
});

test("lint reports group.box, parallel.size, parallel.leaf and parallel.tag", () => {
  const text = [
    "- [x] `x-g1` Ticked with an open task",
    "  - [ ] `x-g1a` Open",
    "    - Done",
    "- [ ] `x-g2` Open with every task ticked",
    "  - [x] `x-g2a` Ticked",
    "    - Done",
    "- [ ] `x-g3` One child (**PARALLEL**)",
    "  - [ ] `x-g3a` Only",
    "    - Done",
    "- [ ] `x-l1` A leaf (**PARALLEL**)",
    "  - Done",
    "- [ ] `x-t1` Lower (**parallel**)",
    "  - Done",
    "- [ ] `x-t2` Plain (PARALLEL)",
    "  - Done",
    "- [ ] `x-t3` Bold **PARALLEL**",
    "  - Done",
    "- [ ] `x-t4` Early (**PARALLEL**) then text",
    "  - Done",
    "- [ ] `x-t5` Before refs (**PARALLEL**) [X1] (§D1)",
    "  - [ ] `x-t5a` One",
    "    - Done",
    "  - [ ] `x-t5b` Two",
    "    - Done",
    "- [ ] `x-ok` Runs in parallel with nothing, said in words",
    "  - Done",
    "",
  ].join("\n");
  assert.deepEqual(codes(text).sort(), [
    ["group.box", "x-g1"],
    ["group.box", "x-g2"],
    ["parallel.leaf", "x-l1"],
    ["parallel.size", "x-g3"],
    ["parallel.tag", "x-t1"],
    ["parallel.tag", "x-t2"],
    ["parallel.tag", "x-t3"],
    ["parallel.tag", "x-t4"],
    ["parallel.tag", "x-t5"],
  ]);
});

test("a $after fact is refused with its fix, and the list still orders the tasks", () => {
  const text = [
    "- [ ] `x-a` One",
    "  - Done",
    "- [ ] `x-b` Two",
    "  - $after: x-a",
    "  - Done",
    "",
  ].join("\n");
  const parsed = parseSpec(spec(text));
  assert.deepEqual(
    parsed.diagnostics.map((d) => d.code),
    ["facts.removed-key"],
  );
  assert.match(parsed.diagnostics[0].message, /Order tasks by the list/);
  assert.deepEqual(parsed.proposals[1].requires, ["x-a"]);
});
