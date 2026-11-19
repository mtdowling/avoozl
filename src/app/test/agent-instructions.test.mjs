import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../operations.mjs";
import {
  matchingAgentInstructions,
  parseAgentInstructions,
  synchronizeAgentInstructions,
  workflowCategory,
} from "../agent-instructions.mjs";

import { fixture, snapshot } from "./fixtures.mjs";

const policy = {
  version: 1,
  agentInstructions: {
    rules: [
      {
        id: "shared-task-policy",
        title: "Keep work scoped",
        appliesTo: ["task"],
        instruction:
          "Do not turn incidental observations into unrelated edits.",
      },
      {
        id: "record-required-cleanup",
        title: "Record required cleanup",
        appliesTo: ["task.implement"],
        when: {
          tracks: ["catalog"],
          tagsNone: ["skip-follow-up"],
        },
        instruction:
          "Propose clearly required cleanup with plans_propose_work.",
      },
    ],
  },
};

test(".avoozl.json rules parse workflow categories and selectors", () => {
  const rules = parseAgentInstructions(policy, {
    path: ".avoozl.json",
    repositoryId: "plans",
  });
  assert.deepEqual(
    rules.map((rule) => rule.id),
    ["shared-task-policy", "record-required-cleanup"],
  );
  assert.deepEqual(rules[1].appliesTo, ["task.implement"]);
  assert.deepEqual(rules[1].when, {
    tracks: ["catalog"],
    tagsNone: ["skip-follow-up"],
  });
  assert.deepEqual(rules[1].source, {
    path: ".avoozl.json",
    repositoryId: "plans",
    pointer: "/agentInstructions/rules/1",
    hash: rules[1].source.hash,
  });
});

test("workflow categories inherit and local overrides only disable configured rules", async (t) => {
  const { store } = fixture(t),
    data = store.read();
  synchronizeAgentInstructions(data, policy);
  store.write(data);
  const task = store.read().tasks[0];
  assert.deepEqual(
    matchingAgentInstructions(store.read(), "task.implement", task).map(
      (item) => item.id,
    ),
    ["shared-task-policy", "record-required-cleanup"],
  );
  task.tags.push("skip-follow-up");
  assert.deepEqual(
    matchingAgentInstructions(store.read(), "task.implement", task).map(
      (item) => item.id,
    ),
    ["shared-task-policy"],
  );
  const ops = new Operations(store);
  await ops.execute("agent.instructions.toggle", {
    id: "shared-task-policy",
    enabled: false,
  });
  const refreshed = structuredClone(store.read());
  synchronizeAgentInstructions(refreshed, policy);
  store.write(refreshed);
  assert.equal(
    store
      .read()
      .agentInstructions.find((item) => item.id === "shared-task-policy")
      .enabled,
    false,
  );
  assert.equal(
    workflowCategory({
      mode: "ask",
      context: { conversationPurpose: "new-task", scoped: true },
    }),
    "task.create.scoped",
  );
  assert.equal(
    workflowCategory({
      mode: "ask",
      context: { conversationPurpose: "pull-request-review" },
    }),
    "github.pr.review",
  );
  assert.equal(
    workflowCategory({
      mode: "ask",
      context: { conversationPurpose: "review" },
    }),
    "task.review",
  );
  assert.equal(
    workflowCategory({
      mode: "ask",
      extraction: { planId: "design" },
      context: {},
    }),
    "plan.extract",
  );
});

test("extraction instructions inherit plan policy and honor repository paths", () => {
  const data = { agentInstructions: [] };
  synchronizeAgentInstructions(data, {
    agentInstructions: {
      rules: [
        {
          id: "all-design-guidance",
          title: "All design guidance",
          appliesTo: ["all"],
          instruction: "Keep citations exact.",
        },
        {
          id: "plan-design-guidance",
          title: "Plan design guidance",
          appliesTo: ["plan"],
          instruction: "Report missing decisions as gaps.",
        },
        {
          id: "rfc-extraction-guidance",
          title: "RFC extraction guidance",
          appliesTo: ["plan.extract"],
          when: { paths: ["docs/rfc/**"] },
          instruction: "Treat the Checks table as acceptance.",
        },
      ],
    },
  });
  assert.deepEqual(
    matchingAgentInstructions(data, "plan.extract", {
      path: "docs/rfc/imports.md",
    }).map((rule) => rule.id),
    ["all-design-guidance", "plan-design-guidance", "rfc-extraction-guidance"],
  );
  assert.deepEqual(
    matchingAgentInstructions(data, "plan.extract", {
      path: "docs/research/imports.md",
    }).map((rule) => rule.id),
    ["all-design-guidance", "plan-design-guidance"],
  );
});

test("invalid, unknown, or duplicate Avoozl rules fail closed", () => {
  assert.throws(
    () =>
      parseAgentInstructions({
        agentInstructions: {
          rules: [
            {
              ...policy.agentInstructions.rules[0],
              appliesTo: ["task.unknown"],
            },
          ],
        },
      }),
    /Unknown Avoozl instruction workflow/,
  );
  assert.throws(
    () =>
      parseAgentInstructions({
        agentInstructions: {
          rules: [
            {
              ...policy.agentInstructions.rules[0],
              undocumented: true,
            },
          ],
        },
      }),
    /Unknown Avoozl instruction/,
  );
  assert.throws(
    () =>
      parseAgentInstructions({
        agentInstructions: {
          rules: [
            policy.agentInstructions.rules[0],
            policy.agentInstructions.rules[0],
          ],
        },
      }),
    /Duplicate/,
  );
  assert.deepEqual(parseAgentInstructions({}), []);
  assert.deepEqual(snapshot().agentInstructions, undefined);
});
