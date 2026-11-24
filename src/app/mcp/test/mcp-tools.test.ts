// The grouped MCP tools (R56): every operation has an MCP route or a written
// reason it has none. An agent tool reaches every approval, setting, setup
// step and delete; a delete needs confirm: true, and Activity names the
// caller.
import assert from "node:assert/strict";
import test from "node:test";
import { handleMcp, NARROW_TOOLS } from "../mcp.ts";
import { createAppMcp } from "../../executors/kirocrew/app-mcp.ts";
import { NOT_ON_MCP } from "../mcp-policy.ts";
import { GROUPED_TOOLS } from "../mcp-tools.ts";
import { OPERATIONS, classifyOperation } from "../../api/operation-table.ts";
import { Operations } from "../../api/operations.ts";
import { listActivity } from "../../store/activity-log.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { answerResult, at, toolResult } from "../../test/mcp-result.ts";
import type { Refusal } from "../../test/refusal.ts";
import { found } from "../../test/view-shapes.ts";

// One tools/list entry, for the fields these tests read.
interface ListedTool {
  name: string;
  description: string;
  inputSchema: { properties: { action: { enum: string[] } } };
  annotations: { readOnlyHint?: boolean };
}
// A tool result's first text.
const textOf = (result: { content: { text?: string }[] }) =>
  String(result.content[0]?.text);

// Every registered operation name (operation-table.mjs).
const allOperations = () => [...OPERATIONS.keys()].sort();

const routes = new Map<string, string[]>(),
  grouped = new Map<string, string[]>();
for (const [tool, { actions }] of Object.entries(GROUPED_TOOLS))
  for (const [action, [operation]] of Object.entries(actions)) {
    grouped.set(operation, [
      ...(grouped.get(operation) || []),
      `${tool}.${action}`,
    ]);
    routes.set(operation, [
      ...(routes.get(operation) || []),
      `${tool}.${action}`,
    ]);
  }
for (const [name, [operation]] of Object.entries(NARROW_TOOLS))
  routes.set(operation, [...(routes.get(operation) || []), name]);

const call = (ops: Operations, name: string, args: unknown) =>
  handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "kirocrew.caller": { schemaVersion: 1, sessionKey: "dashboard:a" },
        },
      },
    },
    ops,
    { attestedCaller: true },
  ).then(toolResult);

// The tools that hold approvals, settings, setup and deletes.
const ADMIN = new Set([
  "plans_autopilot",
  "plans_settings",
  "plans_setup",
  "plans_plugin_admin",
  "plans_content_admin",
  "plans_control",
]);
const audited = [...OPERATIONS.values()].filter((entry) => entry.policy.audit);
const CONFIRM_REFUSAL = /Pass confirm: true \(MCP\) or --yes \(CLI\)/;

test("every operation has an MCP route or a written reason it has none", () => {
  const operations = allOperations();
  assert.ok(operations.length > 150, "the scan found the operations");
  const missing = operations.filter(
    (name) => !routes.has(name) && !NOT_ON_MCP.has(name),
  );
  assert.deepEqual(missing, [], "add an action, or a reason in mcp-policy.mjs");
  // An audited operation has an action on an admin tool, and no older
  // grouped tool gains it: stop_line drops `full` before it calls.
  for (const { name } of audited) {
    const actions = grouped.get(name) || [];
    assert.ok(
      actions.some((action) => ADMIN.has(action.split(".")[0])),
      `${name} has an admin action`,
    );
    for (const action of actions)
      if (!ADMIN.has(action.split(".")[0]))
        assert.equal(action, "plans_session.stop_line", name);
  }
  assert.deepEqual(
    GROUPED_TOOLS.plans_session.actions.stop_line[2]?.({
      full: true,
      scope: "all",
    }),
    { scope: "all" },
  );
  for (const [name, reason] of NOT_ON_MCP) {
    assert.match(reason, /\S/, name);
    assert.equal(routes.has(name), false, `${name} has a reason and a route`);
  }
  for (const operation of routes.keys())
    assert.ok(
      operations.includes(operation),
      `${operation} is a real operation`,
    );
});

test("each grouped tool lists its actions as an enum", async (t) => {
  const { store } = fixture(t),
    listed = at(
      (
        await handleMcp(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          new Operations(store),
        )
      ).body,
      "result",
      "tools",
    );
  assert.ok(Array.isArray(listed));
  const tools: ListedTool[] = listed,
    grouped = tools.filter((tool) => Object.hasOwn(GROUPED_TOOLS, tool.name));
  assert.deepEqual(
    grouped.map((tool) => tool.name).sort(),
    Object.keys(GROUPED_TOOLS).sort(),
  );
  for (const tool of grouped)
    assert.deepEqual(
      tool.inputSchema.properties.action.enum,
      Object.keys(found(GROUPED_TOOLS[tool.name]).actions),
    );
  // The deprecated one-tool-per-operation names are gone (R56.3).
  assert.deepEqual(
    tools.filter((tool) => /^Deprecated/.test(tool.description)),
    [],
  );
  for (const name of ["plans_update_task", "plans_tick", "plans_relay"])
    assert.ok(!tools.some((tool) => tool.name === name), name);
  assert.doesNotMatch(
    found(tools.find((tool) => tool.name === "plans_approve_plan")).description,
    /refused/,
  );
  // A tool an agent may hold as read-only stays read-only.
  assert.equal(
    found(tools.find((tool) => tool.name === "plans_workspace")).annotations
      .readOnlyHint,
    true,
  );
});

test("an agent tool reaches every audited operation over MCP", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  for (const { name, policy } of audited) {
    const [tool, action] = found(
      grouped.get(name)?.find((route) => ADMIN.has(route.split(".")[0])),
    ).split(".");
    // A delete is confirmed here; the next test leaves it out.
    const result = await call(ops, tool, {
      action,
      input: policy.confirm ? { id: "x", confirm: true } : { id: "x" },
    });
    // Nothing refuses the caller: any error is about the input or the state.
    if (result.isError)
      assert.doesNotMatch(
        textOf(result),
        /Only a person|person's|refused over MCP|in the Avoozl (app|page)|Pass confirm/,
        name,
      );
  }
});

test("a delete over MCP or the CLI is refused without confirm: true", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    before = store.read().revision;
  const deletes = audited.filter((entry) => entry.policy.confirm);
  assert.deepEqual(deletes.map((entry) => entry.name).sort(), [
    "catalog.remove",
    "claim.delete",
    "github.job.confirm",
    "intake.source.remove",
    "plugin.remove",
    "report.delete",
    "repositories.remove",
    "repository.remove",
  ]);
  for (const { name } of deletes) {
    const [tool, action] = found(
      grouped.get(name)?.find((route) => ADMIN.has(route.split(".")[0])),
    ).split(".");
    for (const input of [{ id: "x" }, { id: "x", confirm: "yes" }]) {
      const result = await call(ops, tool, { action, input });
      assert.equal(result.isError, true, name);
      assert.match(textOf(result), CONFIRM_REFUSAL, name);
    }
    // The CLI's call, and one inside Avoozl, need it too.
    for (const context of [{ local: true, person: true }, {}])
      await assert.rejects(
        ops.execute(name, { id: "x" }, undefined, context),
        CONFIRM_REFUSAL,
        name,
      );
  }
  assert.equal(store.read().revision, before, "nothing was written");
  // The owner's page session confirms in the page.
  await assert.rejects(
    ops.execute("report.delete", { id: "x" }, undefined, { person: true }),
    (error: Error) => !CONFIRM_REFUSAL.test(error.message),
  );
});

test("an agent turns Autopilot on and off, and Activity names the agent", async (t) => {
  const { root, store } = fixture(t),
    configDirectory = temporaryDirectory("avoozl-machine-"),
    ops = new Operations(store, { workspaceRoot: root, configDirectory });
  const status = await call(ops, "plans_autopilot", { action: "status" });
  assert.equal(status.isError, undefined, textOf(status));
  assert.equal(status.structuredContent?.on, false);
  const on = await call(ops, "plans_autopilot", {
    action: "set",
    input: { on: true },
  });
  assert.equal(on.isError, undefined, textOf(on));
  assert.equal(on.structuredContent?.on, true);
  assert.equal(on.structuredContent?.delivery, true);
  assert.deepEqual(on.structuredContent?.loop, { run: ["specs"] });
  const off = await call(ops, "plans_autopilot", {
    action: "set",
    input: { on: false },
  });
  assert.equal(off.structuredContent?.on, false);
  // Off removes the loop and keeps the delivery block, as the page does.
  assert.equal(off.structuredContent?.delivery, true);
  assert.equal(off.structuredContent?.loop, null);
  const rows = listActivity(store).items.filter((row) =>
    row.summary.startsWith("Ran autopilot.set"),
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.summary, "Ran autopilot.set (by agent tool)");
    assert.equal(row.source, "mcp");
    assert.equal(row.actor, "session:dashboard:a");
  }
  const bad = await call(ops, "plans_autopilot", {
    action: "set",
    input: { on: "yes" },
  });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /on: true or on: false/);
});

test("old names reach their operations, and unknown actions fail closed", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    before = store.read().revision;
  for (const name of ["plans_approve_plan", "plans_take_task"]) {
    const result = await call(ops, name, { input: { id: "x", taskId: "x" } });
    assert.equal(result.isError, true, name);
    assert.doesNotMatch(textOf(result), /Only a person/, name);
  }
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
    assert.match(textOf(result), /^Unknown action/);
  }
  // An unknown action, a missing action, a prototype key, and a bad input.
  const bad: [Record<string, unknown>, RegExp][] = [
    [
      { action: "nope" },
      /^Unknown action "nope" for plans_task\. Choose one of: get,/,
    ],
    [{}, /^Name an action for plans_task/],
    [{ action: "constructor" }, /^Unknown action/],
    [{ action: "toString" }, /^Unknown action/],
    [{ action: "get", input: [] }, /^input must be an object/],
  ];
  for (const [args, pattern] of bad) {
    const result = await call(ops, "plans_task", args);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(textOf(result), pattern);
  }
  // An action with missing fields reaches its operation, which refuses it.
  const missing = await call(ops, "plans_task", {
    action: "update",
    input: {},
  });
  assert.equal(missing.isError, true);
  assert.equal(store.read().revision, before, "nothing was written");
});

test("grouped calls run their operation, and an action is required", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const task = await call(ops, "plans_task", {
    action: "get",
    input: { id: "sample-task" },
  });
  assert.equal(task.isError, undefined);
  assert.equal(
    task.structuredContent?.id ?? at(task.structuredContent, "task", "id"),
    "sample-task",
  );
  const missing = await call(ops, "plans_workspace", { input: {} });
  assert.equal(missing.isError, true);
  assert.match(textOf(missing), /Name an action for plans_workspace/);
  const current = await call(ops, "plans_workspace", { action: "get" });
  assert.equal(current.isError, undefined);
  assert.equal(classifyOperation("workspace"), "observe");
});

// A session that leaves out a field gets a message it can act on, never a
// SQLite binding error or a message naming `undefined`.
test("every MCP name answers an empty input with a clear message", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  // Writes the person's global git ignore file.
  const skip = new Set(["local.ignore.fix"]);
  const calls: [string, Record<string, unknown>][] = [];
  for (const [tool, { actions }] of Object.entries(GROUPED_TOOLS))
    for (const [action, [operation]] of Object.entries(actions))
      if (!skip.has(operation)) calls.push([tool, { action, input: {} }]);
  for (const [name, [operation]] of Object.entries(NARROW_TOOLS))
    if (!skip.has(operation)) calls.push([name, { input: {} }]);
  const unclear: string[] = [];
  for (const [name, args] of calls) {
    const result = await call(ops, name, args),
      text = result.content.map((item) => item.text).join("\n");
    if (
      result.isError &&
      /SQLite|\bundefined\b|\n\s+at |\bChoose a [aeiou]/.test(text)
    )
      unclear.push(`${name} ${String(args.action ?? "")}: ${text}`);
  }
  assert.deepEqual(unclear, []);
  // The workspace's saved settings are readable over MCP.
  const settings = await call(ops, "plans_workspace", {
    action: "configuration",
  });
  assert.equal(settings.isError, undefined, textOf(settings));
  assert.equal(settings.structuredContent?.scope, "repository");
});

test("a single-operation tool refuses an input that is not an object", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    before = store.read().revision;
  for (const input of ["x", [1], 0])
    for (const name of ["plans_get_plan", "plans_next"]) {
      const result = await call(ops, name, { input });
      assert.equal(result.isError, true, `${name} ${JSON.stringify(input)}`);
      assert.equal(textOf(result), "input must be an object.");
    }
  assert.equal(store.read().revision, before);
});

test("the cron's tick with no workspace is a skip, not an error", async () => {
  // A second crew home with nothing in it: no catalog, no default workspace.
  // The script cron's server knows its job only from its environment.
  const server = createAppMcp({
    env: {
      KIROCREW_HOME: temporaryDirectory("avoozl-crew-home-"),
      KIROCREW_SESSION_KEY: "cron:test-job",
    },
  });
  const call = (name: string, args: Record<string, unknown>) =>
    server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
  try {
    const result = answerResult(
      await call("plans_maintain", { action: "tick", input: { cron: true } }),
    );
    assert.equal(result.isError, undefined);
    const answer: { skipped?: boolean } = JSON.parse(textOf(result));
    assert.equal(answer.skipped, true);
    // Anyone else still hears why nothing ran.
    const plain = answerResult(
      await call("plans_maintain", { action: "tick", input: {} }),
    );
    assert.equal(plain.isError, true);
    assert.match(textOf(plain), /has no workspace/);
  } finally {
    server.close();
  }
});

test("the app's MCP server answers a non-object request as Invalid Request", async () => {
  const server = createAppMcp({ env: {} });
  try {
    // A batch array, as it arrives on the wire.
    const batch: Parameters<typeof server.handle>[0] = JSON.parse("[]");
    assert.deepEqual(at(await server.handle(batch), "error", "code"), -32600);
  } finally {
    server.close();
  }
});

test("the app's MCP server meets protocol 2026-07-28 result rules", async () => {
  const server = createAppMcp({ env: {} });
  const modern = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  try {
    const list = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: modern },
    });
    assert.equal(at(list, "result", "resultType"), "complete");
    assert.equal(at(list, "result", "ttlMs"), 0);
    assert.equal(at(list, "result", "cacheScope"), "private");
    const resources = await server.handle({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/list",
      params: { _meta: modern },
    });
    assert.equal(at(resources, "result", "resultType"), "complete");
    assert.equal(at(resources, "result", "cacheScope"), "private");
    // No workspace: the refusal is a result too.
    const call = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { _meta: modern, name: "plans_workspace", arguments: {} },
    });
    assert.equal(at(call, "result", "isError"), true);
    assert.equal(at(call, "result", "resultType"), "complete");
    assert.equal(at(call, "result", "ttlMs"), undefined);
    // Kiro Crew's gateway primes a shared server's list with no revision and
    // hands it to 2026-07-28 clients, so a list without one carries the fields.
    const primed = await server.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });
    assert.equal(at(primed, "result", "resultType"), "complete");
    assert.equal(at(primed, "result", "ttlMs"), 0);
    assert.equal(at(primed, "result", "cacheScope"), "private");
    const ping = await server.handle({
      jsonrpc: "2.0",
      id: 5,
      method: "ping",
      params: {},
    });
    assert.equal(at(ping, "result", "resultType"), "complete");
    assert.equal(at(ping, "result", "ttlMs"), undefined);
  } finally {
    server.close();
  }
});
