// Runs the workflow kit (`workflow-kit/`) against Avoozl. Each case lists the
// probes a runner answers (`violations`, `ready`, `claim`, `landing`). A probe
// Avoozl does not pass yet carries `expectFail` with the simplify task that
// makes it pass; the case fails when that task is ticked or the probe passes,
// so the mark is removed when the task lands.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { judge, probesOf, readCases } from "../../../workflow-kit/load.ts";
import { avoozl } from "./workflow-kit-adapter.ts";
import { STEPS, scenario } from "./workflow-kit-scenario.ts";
import { currentPage } from "../../../scripts/kit/scenarios-doc.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file: string) => fs.readFileSync(root + file, "utf8");

const simplify = read(".kiro/specs/simplify/tasks.md");
const tickedTask = (id: string) =>
  new RegExp(`^\\s*- \\[x\\] \`${id.replace(/\./g, "\\.")}\``, "m").test(
    simplify,
  );
const openTask = (id: string) =>
  new RegExp(`^\\s*- \\[ \\] \`${id.replace(/\./g, "\\.")}\``, "m").test(
    simplify,
  );

const rules = new Set<string>();
const doc = read("docs/github-workflow.md");
if (/^# Workflow v1$/m.test(doc))
  for (const match of doc.matchAll(/^- \*\*\[?(\d+\.\d+)/gm))
    rules.add(match[1]);

for (const testCase of readCases()) {
  test(`workflow kit: ${testCase.name}`, async () => {
    for (const [probe, task] of Object.entries(testCase.expectFail ?? {})) {
      assert.ok(
        probe in probesOf(testCase),
        `${probe} is not an expected probe`,
      );
      assert.ok(
        !tickedTask(task),
        `${task} is ticked: remove expectFail.${probe} from ${testCase.name}`,
      );
      assert.ok(openTask(task), `${task} is not a simplify task`);
    }
    if (rules.size)
      for (const rule of testCase.rules ?? [])
        assert.ok(rules.has(rule), `rule ${rule} is not in the workflow doc`);
    const verdicts = judge(
      testCase,
      testCase.steps ? await scenario(testCase) : await avoozl(testCase),
    );
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

test("workflow kit: the doc lists exactly the rules no case checks", () => {
  const section = doc.split("\n### Kit coverage\n")[1].split(/\n#{1,3} /, 1)[0],
    listed = new Set(
      section
        .split("\n")
        .map((row) => row.split("|").map((cell) => cell.trim()))
        .filter(
          (cells) => cells.length === 4 && /^[\d.]+(, [\d.]+)*$/.test(cells[1]),
        )
        .flatMap((cells) => cells[1].split(", ")),
    ),
    checked = new Set(readCases().flatMap((testCase) => testCase.rules));
  assert.deepEqual(
    [...rules].filter((rule) => !checked.has(rule)).sort(),
    [...listed].sort(),
  );
});

test("workflow kit: a history ends in the case's repo files", () => {
  for (const testCase of readCases().filter((item) => item.history)) {
    const final = {};
    for (const commit of testCase.history ?? [])
      Object.assign(final, commit.files);
    assert.deepEqual(final, testCase.files, testCase.name);
  }
});

test("workflow kit: every case has a title, rules and probes", () => {
  const cases = readCases();
  assert.ok(cases.length > 0);
  for (const testCase of cases) {
    assert.ok(testCase.title && testCase.rules?.length, testCase.name);
    assert.ok(Object.keys(probesOf(testCase)).length, testCase.name);
    assert.ok(Object.keys(testCase.files).length, testCase.name);
  }
});

test("workflow kit: the scenarios page is current", () => {
  assert.equal(
    read("docs/github-workflow-scenarios.md"),
    currentPage(),
    "run npm run kit:docs",
  );
});

test("workflow kit: a rule links to its scenarios exactly when a case checks it", () => {
  const checked = new Set(
    readCases().flatMap((testCase) => testCase.rules ?? []),
  );
  for (const rule of rules) {
    const bullet = new RegExp(
      `^- \\*\\*\\[${rule.replace(".", "\\.")}\\]\\(github-workflow-scenarios\\.md#rule-${rule.replace(".", "")}\\)\\*\\*`,
      "m",
    );
    assert.equal(bullet.test(doc), checked.has(rule), `rule ${rule}`);
  }
});

test("workflow kit: the adapter contract lists every step", () => {
  const readme = read("workflow-kit/README.md");
  for (const step of STEPS)
    assert.ok(
      readme.includes(`| \`${step}\` |`),
      `${step} is not in the README`,
    );
  for (const testCase of readCases())
    for (const step of testCase.steps ?? [])
      assert.ok(STEPS.includes(step.do), `${testCase.name}: ${step.do}`);
});
