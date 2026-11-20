// One graph builder (simplify sim-2.3, §D8): graphOf and its text and
// Mermaid printers, and the same output from graph.view and plans_graph.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  GRAPH_END,
  GRAPH_START,
  graphMermaid,
  graphOf,
  graphText,
  withGraphBlock,
} from "../graph.mjs";
import { linkedReader } from "../order.mjs";
import { Operations } from "../../api/operations.mjs";
import { handleMcp } from "../../mcp/mcp.mjs";
import {
  createSpecPlan,
  lintSpec,
  parseSpec,
  readSpecFolder,
} from "../spec-plans.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";

const PARSER = [
  "## Phase 1: Tokens",
  "",
  "- [x] `p-1` Read the token table [R1] (§D1)",
  "  - Done",
  "- [ ] `p-2` Report and recover (**PARALLEL**)",
  "  - [ ] `p-2.1` Report unknown tokens",
  "    - Done",
  "  - [ ] `p-2.2` Recover after an unknown `token`",
  "    - Done",
  "- [ ] `p-3` Report the recovery count",
  "  - Done",
  "",
  "## Phase 2: Sign-off",
  "",
  "- [ ] `p-4` The owner signs off (**MANUAL**)",
  "  - Signed",
  "",
].join("\n");
const STATES = {
  "p-1": "landed",
  "p-2.1": "claimed",
  "p-2.2": "ready",
  "p-3": "waiting",
  "p-4": "manual",
};
const parser = () =>
  graphOf([{ name: "parser", text: PARSER }], { stateOf: (id) => STATES[id] });

test("the text prints by phase in list order with state and indentation, in 80 columns", () => {
  const text = graphText(parser());
  assert.equal(
    text,
    [
      "parser                    5 tasks: 1 landed 1 claimed 1 ready 1 waiting 1 manual",
      "Phase 1: Tokens",
      "  landed   p-1    Read the token table",
      "  group    p-2    Report and recover (PARALLEL)",
      "  claimed    p-2.1  Report unknown tokens",
      "  ready      p-2.2  Recover after an unknown token",
      "  waiting  p-3    Report the recovery count",
      "Phase 2: Sign-off",
      "  manual   p-4    The owner signs off (MANUAL)",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(text, /\u001b/);
  const long = graphText(
    graphOf([
      { name: "x", text: `- [ ] \`x-1\` ${"word ".repeat(30)}\n  - Done\n` },
    ]),
  );
  for (const line of long.trimEnd().split("\n")) assert.ok(line.length <= 80);
  assert.match(long, /\.\.\.$/m);
});

test("Mermaid prints a flowchart with a subgraph per phase and group and one edge per wait", () => {
  const mermaid = graphMermaid(parser());
  assert.equal(
    mermaid,
    [
      "flowchart TD",
      '  subgraph s1["Phase 1: Tokens"]',
      '    p_1["p-1 Read the token table"]',
      '    subgraph g_p_2["p-2 Report and recover (PARALLEL)"]',
      '      p_2_1["p-2.1 Report unknown tokens"]',
      '      p_2_2["p-2.2 Recover after an unknown token"]',
      "    end",
      '    p_3["p-3 Report the recovery count"]',
      "  end",
      '  subgraph s2["Phase 2: Sign-off"]',
      '    p_4["p-4 The owner signs off (MANUAL)"]',
      "  end",
      "  p_1 --> p_2_1",
      "  p_1 --> p_2_2",
      "  p_2_1 --> p_3",
      "  p_2_2 --> p_3",
      "  p_3 --> p_4",
      "",
    ].join("\n"),
  );
  assert.match(graphMermaid(parser(), { state: true }), /classDef landed/);
  // Two IDs that map to one node ID get distinct ones, in file order.
  const clash = graphMermaid(
    graphOf([
      {
        name: "c",
        text: '- [ ] `a.b` One "quoted"\n  - Done\n- [ ] `a-b` Two\n  - Done\n',
      },
    ]),
  );
  assert.match(clash, /a_b\["a\.b One #quot;quoted#quot;"\]/);
  assert.match(clash, /a_b_2\["a-b Two"\]/);
  assert.match(clash, /a_b --> a_b_2/);
});

test("a parent spec prints the specs it links inside their groups", () => {
  const parent =
      "- [ ] `ctx-1` Build [epic context](../ec/tasks.md)\n- [ ] `ctx-2` Ship\n  - Shipped\n",
    child = "- [ ] `ec-1` Gather\n  - Done\n",
    linked = linkedReader([
      { name: "ctx", text: parent },
      { name: "ec", text: child },
    ]),
    text = graphText(graphOf([{ name: "ctx", text: parent }], { linked }));
  assert.match(text, /group {4}ctx-1 {2}Build \[epic context\]/);
  assert.match(text, /\n {2}waiting {4}ec-1 {3}Gather/);
});

test("graph.view and plans_graph give the CLI's text and Mermaid for one scope", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  writeSpec(root, "parser", { "tasks.md": PARSER });
  createSpecPlan(store, { id: "parser" }, readSpecFolder(root, "parser"));
  const view = await ops.execute("graph.view", { spec: "parser" });
  assert.match(view.text, /^parser /);
  assert.match(view.text, /p-2\.2 {2}Recover after an unknown token/);
  assert.match(view.mermaid, /^flowchart TD/);
  const reply = await handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "plans_graph",
          arguments: { input: { spec: "parser" } },
        },
      },
      ops,
    ),
    tool = reply.body.result.structuredContent;
  assert.equal(tool.text, view.text);
  assert.equal(tool.mermaid, view.mermaid);
  fs.rmSync(path.join(root, ".kiro"), { recursive: true, force: true });
});

// The graph block (sim-2.4, §D9).
const graphCodes = (text) =>
  lintSpec({
    spec: { name: "parser", exists: true, files: { "tasks.md": text } },
  })
    .diagnostics.filter((d) => d.code.startsWith("graph."))
    .map((d) => d.code);

test("lint checks the graph block: none is clean, a stale one or bad markers are errors", () => {
  assert.deepEqual(graphCodes(PARSER), []);
  const written = withGraphBlock("parser", PARSER);
  assert.ok(written.trimEnd().endsWith(GRAPH_END));
  assert.deepEqual(graphCodes(written), []);
  // Writing again replaces the block in place.
  assert.equal(withGraphBlock("parser", written), written);
  // A tick changes no line of the block.
  const ticked = written.replace("- [ ] `p-3`", "- [x] `p-3`");
  assert.deepEqual(graphCodes(ticked), []);
  // An edit to the list makes it stale.
  const edited = written.replace(
    "Report the recovery count",
    "Count the recoveries",
  );
  assert.deepEqual(graphCodes(edited), ["graph.stale"]);
  assert.deepEqual(graphCodes(`${PARSER}\n${GRAPH_START}\n`), [
    "graph.markers",
  ]);
  assert.deepEqual(
    graphCodes(
      `${written}\n${withGraphBlock("parser", PARSER).slice(PARSER.trimEnd().length)}`,
    ),
    ["graph.markers"],
  );
  // The task parser skips the block's lines.
  const ids = (text) =>
    parseSpec({
      name: "parser",
      exists: true,
      files: { "tasks.md": text },
    }).proposals.map((p) => p.id);
  assert.deepEqual(ids(written), ids(PARSER));
});

test("spec.graph.write writes the block, and spec.lint then passes", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  writeSpec(root, "parser", { "tasks.md": PARSER });
  const file = path.join(root, ".kiro", "specs", "parser", "tasks.md");
  fs.appendFileSync(file, `\n${GRAPH_START}\nold\n${GRAPH_END}\n`);
  const stale = await ops.execute("spec.lint", { spec: "parser" });
  assert.ok(stale.specs[0].diagnostics.some((d) => d.code === "graph.stale"));
  const wrote = await ops.execute("spec.graph.write", { spec: "parser" });
  assert.equal(wrote.changed, true);
  assert.equal(fs.readFileSync(file, "utf8"), withGraphBlock("parser", PARSER));
  const clean = await ops.execute("spec.lint", { spec: "parser" });
  assert.deepEqual(
    clean.specs[0].diagnostics.filter((d) => d.code.startsWith("graph.")),
    [],
  );
  assert.equal(
    (await ops.execute("spec.graph.write", { spec: "parser" })).changed,
    false,
  );
});
