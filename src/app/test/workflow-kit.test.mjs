// Runs the workflow kit (`workflow-kit/`) against Avoozl. Each case lists the
// probes a runner answers (`violations`, `ready`, `claim`, `landing`). A probe
// Avoozl does not pass yet carries `expectFail` with the simplify task that
// makes it pass; the case fails when that task is ticked or the probe passes,
// so the mark is removed when the task lands.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { judge, readCases } from "../../../workflow-kit/load.mjs";
import { lintSpec, parseSpec } from "../specs/spec-plans.mjs";
import { unblockCounts } from "../specs/release-ranking.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file) => fs.readFileSync(root + file, "utf8");

// The rule number in docs/github-workflow.md that each lint code enforces.
// A code with no entry is reported as itself, so the case shows it.
const RULE = {
  "task.duplicate-id": "2.2",
  "task.repeated-id": "2.2",
  "facts.removed-key": "2.3",
  "done.missing": "2.4",
  "group.bullets": "2.5",
  "group.box": "3.2",
  "parallel.size": "3.5",
  "parallel.leaf": "3.5",
  "parallel.tag": "3.5",
  "manual.tag": "4.2",
  "manual.group": "4.2",
  "frontmatter.removed-key": "5.1",
  "frontmatter.repo": "5.3",
  "link.missing": "6.4",
  "link.twice": "6.4",
  "link.children": "6.4",
};

const specsOf = (files) => {
  const specs = {};
  for (const [file, text] of Object.entries(files)) {
    const match = /^\.kiro\/specs\/([^/]+)\/(.+)$/.exec(file);
    if (match) (specs[match[1]] ??= {})[match[2]] = text;
  }
  return specs;
};

function violations(specs) {
  const out = {};
  for (const [name, files] of Object.entries(specs)) {
    const { diagnostics } = lintSpec({ spec: { name, exists: true, files } });
    out[name] = [
      ...new Set(
        diagnostics
          .filter((item) => item.severity === "error")
          .map((item) => RULE[item.code] ?? item.code),
      ),
    ].sort();
  }
  return out;
}

// Ready tasks as `spec/task`, best first. Avoozl's parser reads each spec and
// its ranking function counts the tasks each one unblocks. Claims, assignees
// and ticks are applied here, as the repository's state names them.
function ready(testCase, specs) {
  const login = testCase.runner.login,
    branches = new Set(testCase.origin.branches),
    leaves = [],
    ticked = new Set(),
    edges = [];
  for (const name of Object.keys(specs).sort()) {
    const parsed = parseSpec({ name, exists: true, files: specs[name] });
    for (const item of parsed.items) if (item.mark === "x") ticked.add(item.id);
    for (const task of parsed.proposals) {
      if (task.kind !== "leaf") continue;
      leaves.push({ ...task, spec: name });
      for (const from of task.requires ?? []) edges.push({ from, to: task.id });
    }
  }
  const counts = unblockCounts(edges, (id) => !ticked.has(id)),
    assigned = (name) => {
      const who = testCase.issues?.[name];
      return who?.length === 1 && who[0] === login;
    };
  return leaves
    .map((task, index) => ({ task, index }))
    .filter(
      ({ task }) =>
        !ticked.has(task.id) &&
        !task.manual &&
        (task.requires ?? []).every((id) => ticked.has(id)) &&
        !branches.has(`avoozl/${task.spec}/${task.id}`) &&
        assigned(task.spec),
    )
    .sort(
      (a, b) =>
        (counts.get(b.task.id) ?? 0) - (counts.get(a.task.id) ?? 0) ||
        a.index - b.index,
    )
    .map(({ task }) => `${task.spec}/${task.id}`);
}

// Claims and landing run through operations the simplify spec adds, so the
// adapter leaves those probes out until each simplify task lands.
function avoozl(testCase) {
  const specs = specsOf(testCase.files),
    got = {};
  if (testCase.expect.violations) got.violations = violations(specs);
  if (testCase.expect.ready || testCase.expect.claim)
    got.ready = ready(testCase, specs);
  return got;
}

const simplify = read(".kiro/specs/simplify/tasks.md");
const tickedTask = (id) =>
  new RegExp(`^\\s*- \\[x\\] \`${id.replace(/\./g, "\\.")}\``, "m").test(
    simplify,
  );
const openTask = (id) =>
  new RegExp(`^\\s*- \\[ \\] \`${id.replace(/\./g, "\\.")}\``, "m").test(
    simplify,
  );

const rules = new Set();
const doc = read("docs/github-workflow.md");
if (/^# Workflow v1$/m.test(doc))
  for (const match of doc.matchAll(/^- \*\*(\d+\.\d+)\*\*/gm))
    rules.add(match[1]);

for (const testCase of readCases()) {
  test(`workflow kit: ${testCase.name}`, () => {
    for (const [probe, task] of Object.entries(testCase.expectFail ?? {})) {
      assert.ok(probe in testCase.expect, `${probe} is not an expected probe`);
      assert.ok(
        !tickedTask(task),
        `${task} is ticked: remove expectFail.${probe} from ${testCase.name}`,
      );
      assert.ok(openTask(task), `${task} is not a simplify task`);
    }
    if (rules.size)
      for (const rule of testCase.rules)
        assert.ok(rules.has(rule), `rule ${rule} is not in the workflow doc`);
    const verdicts = judge(testCase, avoozl(testCase));
    for (const [probe, verdict] of Object.entries(verdicts))
      assert.ok(
        verdict === "pass" || verdict === "expected-fail",
        `${probe}: ${verdict}${
          verdict === "unexpected-pass"
            ? `, remove expectFail.${probe} from ${testCase.name}`
            : ""
        }`,
      );
  });
}

test("workflow kit: every case has a title, rules and probes", () => {
  const cases = readCases();
  assert.ok(cases.length > 0);
  for (const testCase of cases) {
    assert.ok(testCase.title && testCase.rules?.length, testCase.name);
    assert.ok(Object.keys(testCase.expect).length, testCase.name);
    assert.ok(Object.keys(testCase.files).length, testCase.name);
  }
});
