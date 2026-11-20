import assert from "node:assert/strict";
import test from "node:test";
import { rankReady, unblockCounts } from "../ranking.mjs";
import { waitsOf } from "../order.mjs";

const open = () => true;

test("unblock count counts every open task downstream, once", () => {
  const counts = unblockCounts(
    [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "d", to: "c" },
    ],
    (id) => id !== "b",
  );
  assert.equal(counts.get("a"), 1);
  assert.equal(counts.get("d"), 1);
  assert.equal(unblockCounts([{ from: "a", to: "b" }], open).get("a"), 1);
});

// rankReady (simplify sim-1.2, §D3.1): each key breaks the tie the one
// before it leaves, over the waits the list derives.
const ranked = (text, ready) =>
  rankReady(
    ready.map((id) => ({ id })),
    { edges: waitsOf("s", text), open: () => true },
  ).map(({ task, unblocks, chain, position }) => [
    task.id,
    unblocks,
    chain,
    position,
  ]);

test("rankReady: a task that opens a parallel group of five counts all five, and a tie goes to file order", () => {
  const text = [
    "- [ ] `a-1` Opens five (**PARALLEL**)",
    "  - [ ] `a-0` Opener",
    "    - Done",
    "  - [ ] `a-x` Other",
    "    - Done",
    "- [ ] `a-2` Five side by side (**PARALLEL**)",
    ...[1, 2, 3, 4, 5].flatMap((n) => [
      `  - [ ] \`p-${n}\` Part ${n}`,
      "    - Done",
    ]),
    "",
  ].join("\n");
  const rows = ranked(text, ["a-x", "a-0"]);
  assert.equal(rows[0][1], 5);
  // A tie on the count goes to file order.
  assert.deepEqual(
    rows.map((row) => row[0]),
    ["a-x", "a-0"],
  );
});

test("rankReady: a longer chain breaks a tie on the count, then file order", () => {
  // b-1 is followed by a chain of two; c-1 by a group of two side by side:
  // two waiting each, chain 2 against 1.
  const text = [
    "- [ ] `g-1` Two starts (**PARALLEL**)",
    "  - [ ] `c-0` First start",
    "    - [ ] `c-1` Wide",
    "      - Done",
    "    - [ ] `c-2` Two after (**PARALLEL**)",
    "      - [ ] `c-3` One",
    "        - Done",
    "      - [ ] `c-4` Two",
    "        - Done",
    "  - [ ] `b-0` Second start",
    "    - [ ] `b-1` Deep",
    "      - Done",
    "    - [ ] `b-2` Next",
    "      - Done",
    "    - [ ] `b-3` Last",
    "      - Done",
    "",
  ].join("\n");
  assert.deepEqual(ranked(text, ["c-1", "b-1"]), [
    ["b-1", 2, 2, 1],
    ["c-1", 2, 1, 0],
  ]);
  assert.deepEqual(
    ranked("- [ ] `x-1` A\n  - Done\n", ["x-1"]).map((row) => row[0]),
    ["x-1"],
  );
});
