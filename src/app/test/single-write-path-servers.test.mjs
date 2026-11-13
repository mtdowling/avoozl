// One SQLite write path, servers' half: the app backend, the stdio MCP server,
// and the tick cron (which calls plans_tick on that MCP server) change the
// workspace database only inside an Operations call.
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInsideOperations,
  dbPath,
  dump,
  mcpLine,
  seeded,
  setup,
  startBackend,
} from "./write-path.mjs";

test("the stdio MCP server and the tick it serves write only inside Operations", () => {
  const context = setup(),
    { workspace, avoozl, writes } = context;
  seeded(context);
  const before = writes().length,
    result = avoozl(
      ["mcp", "--workspace", workspace],
      [
        mcpLine(1, "plans_update_task", { id: "sample-task", title: "Via MCP" }),
        mcpLine(2, "plans_tick", {}),
        mcpLine(3, "plans_bind_session", {
          taskId: "sample-task",
          slot: "chat-1",
          title: "avoozl:sample-task Implement fixture",
        }),
      ].join("\n") + "\n",
    );
  assert.equal(result.status, 0, result.stderr);
  for (const line of result.stdout.trim().split("\n"))
    assert.notEqual(JSON.parse(line).result?.isError, true, line);
  assert.ok(writes().length > before, "MCP calls wrote");
  assertInsideOperations(writes().slice(before), "MCP");

  const denied = setup({ deny: true }),
    snapshotBefore = dump(dbPath(workspace)),
    refused = denied.avoozl(
      ["mcp", "--workspace", workspace],
      mcpLine(1, "plans_update_task", { id: "sample-task", title: "Bypass" }) +
        "\n" +
        mcpLine(2, "plans_tick", {}) +
        "\n",
    );
  for (const line of refused.stdout.trim().split("\n")) {
    const response = JSON.parse(line);
    assert.ok(
      response.error || response.result?.isError,
      "a refused Operations call is an MCP error",
    );
  }
  assert.deepEqual(dump(dbPath(workspace)), snapshotBefore);
});

test("the app backend writes only inside Operations", async (t) => {
  const context = setup(),
    { writes } = context;
  seeded(context);
  const before = writes().length,
    command = await startBackend(t, context);
  for (const value of [
    {
      operation: "task.update",
      input: { id: "sample-task", title: "Via backend" },
    },
    { operation: "workspace.tick" },
  ]) {
    const response = await command(value);
    assert.equal(response.status, 200, await response.text());
  }
  assert.ok(writes().length > before, "backend calls wrote");
  assertInsideOperations(writes().slice(before), "app backend");
});

test("the app backend cannot write when Operations refuses", async (t) => {
  const allowed = setup();
  seeded(allowed);
  const denied = setup({ deny: true }),
    context = { ...denied, workspace: allowed.workspace },
    before = dump(dbPath(allowed.workspace)),
    command = await startBackend(t, context),
    response = await command({
      operation: "task.update",
      input: { id: "sample-task", title: "Bypass" },
    });
  assert.equal(response.status, 500);
  assert.deepEqual(dump(dbPath(allowed.workspace)), before);
});
