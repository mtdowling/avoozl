// The grouped MCP tools (R56): every operation has an MCP route or a written
// reason it has none, and no MCP call performs a person-only operation by any
// tool name, old or new.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { handleMcp, OLD_TOOLS } from "../mcp.mjs";
import { NOT_ON_MCP, PERSON_ONLY } from "../mcp-policy.mjs";
import { GROUPED_TOOLS, groupedCall } from "../mcp-tools.mjs";
import { MOVED_OPERATIONS } from "../moved-operations.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

// Every operation name Operations.perform handles or operation-kinds.mjs
// classifies, read from the sources so a new one cannot be missed.
function allOperations() {
  const read = (file) =>
    fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const names = new Set(MOVED_OPERATIONS.keys());
  for (const [, name] of read("operations.mjs").matchAll(/name === "([a-zA-Z.]+)"/g))
    names.add(name);
  for (const [, name] of read("operation-kinds.mjs").matchAll(/^\s+"([a-zA-Z.]+)",$/gm))
    names.add(name);
  return [...names].sort();
}

const routes = new Map(),
  grouped = new Map();
for (const [tool, { actions }] of Object.entries(GROUPED_TOOLS))
  for (const [action, [operation]] of Object.entries(actions)) {
    grouped.set(operation, [...(grouped.get(operation) || []), `${tool}.${action}`]);
    routes.set(operation, [...(routes.get(operation) || []), `${tool}.${action}`]);
  }
for (const [name, [operation]] of Object.entries(OLD_TOOLS))
  routes.set(operation, [...(routes.get(operation) || []), name]);

const call = (ops, name, args) =>
  handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    ops,
  ).then((response) => response.body.result);

test("every operation has an MCP route or a written reason it has none", () => {
  const operations = allOperations();
  assert.ok(operations.length > 200, "the scan found the operations");
  const missing = operations.filter(
    (name) => !routes.has(name) && !PERSON_ONLY.has(name) && !NOT_ON_MCP.has(name),
  );
  assert.deepEqual(missing, [], "add an action, or a reason in mcp-policy.mjs");
  for (const [name, rule] of PERSON_ONLY) {
    assert.match(rule.reason, /^Only a person .+ Do it in the Avoozl app\.$/, name);
    // No grouped action reaches a person-only operation, except where the
    // refusal depends on the input (a setup preview). Old names that do stay
    // listed and are refused (the next tests).
    if (grouped.has(name)) assert.ok(rule.when, `${name} is routed: ${grouped.get(name)}`);
  }
  for (const [name, reason] of NOT_ON_MCP) {
    assert.match(reason, /\S/, name);
    assert.equal(routes.has(name), false, `${name} has a reason and a route`);
  }
  for (const operation of routes.keys())
    assert.ok(operations.includes(operation), `${operation} is a real operation`);
});

test("about a dozen grouped tools, each with an action enum", async (t) => {
  const { store } = fixture(t),
    tools = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, new Operations(store))).body
      .result.tools,
    grouped = tools.filter((tool) => Object.hasOwn(GROUPED_TOOLS, tool.name));
  assert.ok(grouped.length >= 12 && grouped.length <= 15, String(grouped.length));
  for (const tool of grouped)
    assert.deepEqual(
      tool.inputSchema.properties.action.enum,
      Object.keys(GROUPED_TOOLS[tool.name].actions),
    );
  // Old names stay listed (R24.5) and point at their replacement.
  const old = tools.find((tool) => tool.name === "plans_update_task");
  assert.match(old.description, /^Deprecated: use plans_task \{action: "update"\}\./);
  assert.match(
    tools.find((tool) => tool.name === "plans_approve_plan").description,
    /^Person only: refused over MCP/,
  );
  // A tool an agent may hold as read-only stays read-only.
  assert.equal(tools.find((tool) => tool.name === "plans_workspace").annotations.readOnlyHint, true);
});

test("every person-only operation is refused for an MCP or session call", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    before = store.read().revision;
  for (const [name, rule] of PERSON_ONLY) {
    const input = rule.when ? { confirm: true, previewHash: "x" } : { id: "x" };
    for (const context of [{ mcp: true }, { caller: { sessionKey: "dashboard:s" } }])
      await assert.rejects(
        ops.execute(name, input, undefined, context),
        (error) => error.status === 403 && /^Only a person/.test(error.message),
        name,
      );
  }
  assert.equal(store.read().revision, before);
});

test("no MCP name reaches a person-only operation, and nearby inputs fail closed", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    before = store.read().revision;
  // Every old name whose operation is person-only.
  const old = Object.entries(OLD_TOOLS).filter(([, [operation]]) => PERSON_ONLY.has(operation));
  assert.ok(old.some(([name]) => name === "plans_approve_plan"));
  for (const [name, [operation]] of old) {
    const input = PERSON_ONLY.get(operation).when ? { confirm: true, previewHash: "x" } : { id: "x" };
    const result = await call(ops, name, { input });
    assert.equal(result.isError, true, name);
    assert.match(result.content[0].text, /^Only a person/, name);
  }
  // No grouped action is a person-only one, and asking for one by name fails.
  for (const [tool, action] of [
    ["plans_plan", "approve"],
    ["plans_plan", "delete"],
    ["plans_plugins", "approve"],
    ["plans_content", "allow"],
    ["plans_conflicts", "resolve"],
    ["plans_github", "setup"],
    ["plans_repos", "configure"],
  ]) {
    const result = await call(ops, tool, { action, input: { id: "x" } });
    assert.equal(result.isError, true, `${tool}.${action}`);
    assert.match(result.content[0].text, /^Unknown action/);
  }
  // An unknown action, a missing action, a prototype key, and a bad input.
  for (const [args, pattern] of [
    [{ action: "nope" }, /^Unknown action "nope" for plans_task\. Choose one of: get,/],
    [{}, /^Name an action for plans_task/],
    [{ action: "constructor" }, /^Unknown action/],
    [{ action: "toString" }, /^Unknown action/],
    [{ action: "get", input: [] }, /^input must be an object/],
  ]) {
    const result = await call(ops, "plans_task", args);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(result.content[0].text, pattern);
  }
  // An action with missing fields reaches its operation, which refuses it.
  const missing = await call(ops, "plans_task", { action: "update", input: {} });
  assert.equal(missing.isError, true);
  // A setup preview never applies, even when the call says confirm.
  assert.deepEqual(groupedCall("plans_github", {
    action: "setup_preview",
    input: { confirm: true, previewHash: "x", mode: "single-repo" },
  }), { operation: "github.setup", input: { previewHash: "x", mode: "single-repo" } });
  assert.equal(store.read().revision, before, "nothing was written");
});

test("grouped calls run their operation, and plans_workspace keeps its old shape", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const task = await call(ops, "plans_task", { action: "get", input: { id: "sample-task" } });
  assert.equal(task.isError, undefined);
  assert.equal(task.structuredContent.id ?? task.structuredContent.task?.id, "sample-task");
  // The old plans_workspace call sent only {input}.
  const old = await call(ops, "plans_workspace", { input: {} });
  assert.equal(old.isError, undefined);
  const current = await call(ops, "plans_workspace", { action: "get" });
  assert.deepEqual(Object.keys(old.structuredContent), Object.keys(current.structuredContent));
  assert.equal(classifyOperation("workspace"), "observe");
});
