// Agent tool scope (R56.3): every Avoozl tool an agent names is registered,
// and an agent never gets a grouped tool with write actions where it could
// widen what runs unprompted or what a read-only role can do.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { handleMcp } from "../mcp/mcp.ts";
import { GROUPED_TOOLS } from "../mcp/mcp-tools.ts";
import { classifyOperation } from "../api/operation-table.ts";
import { Operations } from "../api/operations.ts";
import { fixture } from "./fixtures.ts";

// One agent in roles.json: the tools it names and the ones it runs unprompted.
interface Agent {
  name: string;
  tools: string[];
  allowedTools: string[];
}
const agents: Agent[] = JSON.parse(
  fs.readFileSync(new URL("../../../roles.json", import.meta.url), "utf8"),
);
const OWN = "@avoozl:avoozl/";
// Agents that change no file and write nothing beyond their one report.
const READ_ONLY = new Set(["avoozl-responder", "avoozl-reviewer"]);
const writes = (name: string) =>
  Object.hasOwn(GROUPED_TOOLS, name) &&
  Object.values(GROUPED_TOOLS[name].actions).some(
    ([operation]) => classifyOperation(operation) !== "observe",
  );

test("each agent names only registered tools, and read-only roles get no grouped write tool", async (t) => {
  const { store } = fixture(t),
    reply = await handleMcp(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      new Operations(store),
    ),
    { tools } = reply.body?.result as { tools: { name: string }[] },
    listed = new Set(tools.map((tool) => tool.name));
  for (const name of READ_ONLY)
    assert.ok(
      agents.some((agent) => agent.name === name),
      `${name} ships`,
    );
  for (const agent of agents) {
    const own = (list: string[]) =>
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
