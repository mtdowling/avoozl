// Agent tool scope (R56.3): every Avoozl tool an agent names is registered,
// and an agent never gets a grouped tool with write actions where it could
// widen what runs unprompted or what a read-only role can do.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { handleMcp } from "../mcp.mjs";
import { GROUPED_TOOLS } from "../mcp-tools.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const agents = JSON.parse(
  fs.readFileSync(
    new URL("../executors/kirocrew/agent-metadata.json", import.meta.url),
    "utf8",
  ),
);
const OWN = "@avoozl:avoozl/";
// Agents that change no file and write nothing beyond their one report.
const READ_ONLY = new Set([
  "avoozl-code-review",
  "avoozl-falsifier",
  "avoozl-plan-answer-read",
  "avoozl-plan-review",
  "avoozl-responder",
  "avoozl-review-draft",
  "avoozl-reviewer",
  "avoozl-task-summary",
  "avoozl-verifier",
]);
const writes = (name) =>
  Object.hasOwn(GROUPED_TOOLS, name) &&
  Object.values(GROUPED_TOOLS[name].actions).some(
    ([operation]) => classifyOperation(operation) !== "observe",
  );

test("each agent names only registered tools, and read-only roles get no grouped write tool", async (t) => {
  const { store } = fixture(t),
    listed = new Set(
      (
        await handleMcp(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          new Operations(store),
        )
      ).body.result.tools.map((tool) => tool.name),
    );
  for (const name of READ_ONLY)
    assert.ok(
      agents.some((agent) => agent.name === name),
      `${name} ships`,
    );
  for (const agent of agents) {
    const own = (list) =>
      list
        .filter((ref) => ref.startsWith(OWN))
        .map((ref) => ref.slice(OWN.length));
    for (const name of [...own(agent.tools), ...own(agent.allowedTools)])
      assert.ok(listed.has(name), `${agent.name}: ${name} is registered`);
    for (const name of own(agent.allowedTools)) {
      assert.ok(agent.tools.includes(OWN + name), `${agent.name}: ${name}`);
      assert.equal(writes(name), false, `${agent.name} auto-allows ${name}`);
    }
    if (READ_ONLY.has(agent.name))
      for (const name of own(agent.tools))
        assert.equal(writes(name), false, `${agent.name} gets ${name}`);
  }
  // The check itself: grouped write tools are caught, narrow ones are not.
  assert.equal(writes("plans_plan"), true);
  assert.equal(writes("plans_session"), true);
  assert.equal(writes("plans_report"), false);
});
