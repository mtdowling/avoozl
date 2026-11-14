import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCOPE_RULE, SCOPE_STATEMENT } from "../../work-split.mjs";

// rc-13.1: one source string; the README and Set up show the same words.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the statement names epics, the other tools, and any coder", () => {
  assert.match(SCOPE_STATEMENT, /epics/);
  assert.match(SCOPE_STATEMENT, /Maintenance, triage and one-off pull request/);
  assert.match(SCOPE_STATEMENT, /any coder/);
  assert.match(SCOPE_RULE, /fits in one pull request/);
  assert.match(SCOPE_RULE, /needs a plan with an order/);
});

test("the README shows the same words", () => {
  const readme = read("../../../README.md").replace(/\s+/g, " ");
  assert.ok(readme.includes(SCOPE_STATEMENT));
  assert.ok(readme.includes(SCOPE_RULE));
});

test("Set up imports the string and does not repeat it", () => {
  const source = read("../../../kirocrew-app/ui/src/SetupWizard.tsx");
  assert.match(source, /SCOPE_STATEMENT/);
  assert.match(source, /SCOPE_RULE/);
  assert.ok(!source.includes("maintenance, triage"));
});

// rc-13.2: the one-pull-request hint reads the proposal and never refuses.
import { checkProposal, runPlannerChat } from "../quick-goal.mjs";
import { onePullRequestHint } from "../../work-split.mjs";

const proposal = (tasks, edges = []) =>
  checkProposal(
    {
      tasks: tasks.map((id) => ({
        id,
        title: `Task ${id}`,
        evidence: { file: "a.mjs", line: 1 },
      })),
      edges,
    },
    { depth: "look" },
  );

test("one task and no edge gets the hint with Plan it anyway", () => {
  const hint = onePullRequestHint(proposal(["T1"]));
  assert.equal(
    hint.text,
    "This fits one pull request. A crew or your coder can take it without a plan.",
  );
  assert.equal(hint.action, "Plan it anyway");
});

test("two tasks, or an edge, get no hint", () => {
  assert.equal(onePullRequestHint(proposal(["T1", "T2"])), null);
  assert.equal(
    onePullRequestHint(proposal(["T1", "T2"], [{ from: "T1", to: "T2" }])),
    null,
  );
});

test("the chat still proposes a one-task goal, with the hint", async () => {
  const one = {
    tasks: [{ id: "T1", title: "One", evidence: { file: "a.mjs", line: 1 } }],
  };
  const result = await runPlannerChat({
    agent: { turn: async () => ({ proposal: one }) },
    request: { depth: "look", budget: { turns: 3, minutes: 5 }, goal: "g" },
  });
  assert.equal(result.status, "proposed");
  assert.equal(result.hint.action, "Plan it anyway");
});
