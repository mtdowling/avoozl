import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../operations.mjs";
import { RunManager } from "../manager.mjs";
import {
  matchingAgentInstructions,
  parseAgentInstructions,
  synchronizeAgentInstructions,
  workflowCategory,
} from "../agent-instructions.mjs";
import { reconcileAgentInstructions } from "../source-sync.mjs";
import { fixture, snapshot } from "./fixtures.mjs";

const agents = `# Working here

Ordinary repository instructions.

## Avoozl

### Agent instructions

#### Shared task policy
- ID: \`shared-task-policy\`
- Applies to: \`task\`
- Filter: \`all\`

Do not turn incidental observations into unrelated edits.

#### Record required cleanup
- ID: \`record-required-cleanup\`
- Applies to: \`task.implement\`
- Filter: \`track:catalog\`

Propose clearly required cleanup with plans_propose_work.

## Other policy

This is not part of the Avoozl section.
`;

test("AGENTS.md Avoozl sections parse workflow categories and filters", () => {
  const rules = parseAgentInstructions(agents);
  assert.deepEqual(
    rules.map((rule) => rule.id),
    ["shared-task-policy", "record-required-cleanup"],
  );
  assert.equal(rules[1].category, "task.implement");
  assert.deepEqual(rules[1].selector, {
    kind: "track",
    value: "catalog",
  });
  assert.equal(rules[1].source.path, "AGENTS.md");
  assert.equal(rules[1].source.line, 16);
});

test("workflow instruction categories inherit and local overrides only disable parsed rules", async (t) => {
  const { store } = fixture(t),
    data = store.read();
  synchronizeAgentInstructions(data, agents);
  store.write(data);
  const task = store.read().tasks[0];
  assert.deepEqual(
    matchingAgentInstructions(store.read(), "task.implement", task).map(
      (item) => item.id,
    ),
    ["shared-task-policy", "record-required-cleanup"],
  );
  const ops = new Operations(store);
  await ops.execute("agent.instructions.toggle", {
    id: "record-required-cleanup",
    enabled: false,
  });
  assert.deepEqual(
    matchingAgentInstructions(store.read(), "task.implement", task).map(
      (item) => item.id,
    ),
    ["shared-task-policy"],
  );
  const refreshed = structuredClone(store.read());
  synchronizeAgentInstructions(refreshed, agents);
  store.write(refreshed);
  assert.equal(
    store
      .read()
      .agentInstructions.find((item) => item.id === "record-required-cleanup")
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
});

test("the planning source watcher re-syncs AGENTS.md without indexing it as a design", (t) => {
  const { root, store } = fixture(t),
    file = path.join(root, "AGENTS.md");
  fs.writeFileSync(file, agents);
  const result = reconcileAgentInstructions(store, root);
  assert.equal(result.instructions, 2);
  assert.equal(store.read().documents["AGENTS.md"], undefined);
  assert.equal(store.read().agentInstructionSource.path, "AGENTS.md");
  fs.writeFileSync(
    file,
    agents.replace(
      "Propose clearly required cleanup with plans_propose_work.",
      "Record required cleanup as proposed work.",
    ),
  );
  reconcileAgentInstructions(store, root);
  assert.match(
    store
      .read()
      .agentInstructions.find((item) => item.id === "record-required-cleanup")
      .instruction,
    /proposed work/,
  );
  fs.unlinkSync(file);
  reconcileAgentInstructions(store, root);
  assert.deepEqual(store.read().agentInstructions, []);
});

test("matching AGENTS.md instructions are injected without changing capabilities", async (t) => {
  const { store } = fixture(t),
    data = store.read();
  synchronizeAgentInstructions(data, agents);
  store.write(data);
  const manager = new RunManager(store, { recover: false });
  t.after(() => manager.close());
  const prompt = manager.context({
    id: "run-instructions",
    taskId: "sample-task",
    mode: "implement",
    context: {},
    handoffPath: "/tmp/handoff.json",
  });
  assert.match(prompt, /Workspace agent instructions for task\.implement/);
  assert.match(prompt, /plans_propose_work/);
  assert.match(
    prompt,
    /do not expand the run-scoped MCP capability allowlist/i,
  );
});

test("invalid or duplicate Avoozl rules fail closed", () => {
  assert.throws(
    () =>
      parseAgentInstructions(
        agents.replace("track:catalog", "project:unknown"),
      ),
    /Invalid filter/,
  );
  assert.throws(
    () =>
      parseAgentInstructions(
        agents.replace("record-required-cleanup", "shared-task-policy"),
      ),
    /Duplicate/,
  );
  assert.deepEqual(parseAgentInstructions("# No Avoozl policy\n"), []);
  assert.deepEqual(snapshot().agentInstructions, undefined);
});
