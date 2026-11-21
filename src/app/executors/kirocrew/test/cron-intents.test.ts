// The Kiro Crew cron's tick call (MS1.3, MS12.1): it starts this machine's
// tick pass, records what the cron observed, and returns what an earlier pass
// released without waiting for repository work.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { McpMessage } from "../../../../mcp.ts";
import { Operations } from "../../../api/operations.ts";
import { listSessionBindings } from "../../../sessions/session-bindings.ts";
import {
  enqueueSessionRequests,
  type RequestRow,
  type SessionRequest,
} from "../../../sessions/session-requests.ts";
import { workspaceConfig } from "../../../settings/config.ts";
import { WorkspaceRegistry } from "../../../settings/host-config.ts";
import { Store } from "../../../store/store.ts";
import { recordReleased, tickHealth } from "../../../tick/tick.ts";
import { initializeWorkspace } from "../../../workspace/workspace.ts";
import { temporaryDirectory } from "../../../test/temporary.ts";
import { createAppMcp } from "../app-mcp.ts";
import { ownMachineEnv } from "../../../test/own-machine.ts";
import { found } from "../../../test/view-shapes.ts";

type StartPass = NonNullable<
  NonNullable<Parameters<typeof createAppMcp>[0]>["startPass"]
>;
type StartPassOptions = Parameters<StartPass>[0];
type ToolReply = {
  result: { content: { text: string }[]; isError?: boolean };
};
type RoutedRequest = RequestRow & { _avoozlWorkspaceId: string };
type ClaimedStart = {
  request: SessionRequest;
  claimToken: string;
};

// The cron's tick names its cron caller; `caller: null` sends none.
const tickCall = (
  input: Record<string, unknown>,
  cron = true,
  caller: string | null = cron ? "cron:test-job" : null,
) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "plans_maintain",
    arguments: {
      action: "tick",
      input: { ...(cron ? { cron } : {}), ...input },
    },
    ...(caller
      ? {
          _meta: {
            "kirocrew.caller": { schemaVersion: 1, sessionKey: caller },
          },
        }
      : {}),
  },
});

const cronCall = (
  id: number,
  name: string,
  action: string,
  input: Record<string, unknown>,
): McpMessage => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: {
    name,
    arguments: { action, input },
    _meta: {
      "kirocrew.caller": {
        schemaVersion: 1,
        sessionKey: "cron:test-job",
      },
    },
  },
});

async function scratch() {
  const dir = temporaryDirectory("avoozl-cron-intents-"),
    root = path.join(dir, "ws");
  initializeWorkspace(root, { name: "ws" });
  const config = workspaceConfig({ workspace: root });
  const store = new Store(config.dbPath);
  const ops = new Operations(store, { workspaceRoot: root });
  await ops.execute("task.update", {
    id: "task-1",
    create: true,
    title: "task-1",
  });
  await ops.execute("task.update", {
    id: "task-2",
    create: true,
    title: "task-2",
  });
  await ops.execute("session.bind", { taskId: "task-2", slot: "slot-2" });
  const start = (task: string) => ({
    executor: "kirocrew",
    role: "worker",
    task,
    title: `avoozl:${task} work`,
    brief: "Do the work.",
    worktree: null,
    model: "fake-model",
    permissionClass: "write",
  });
  const { starts } = enqueueSessionRequests(store, {
    starts: [start("task-1")],
  });
  // A machine of its own, whose catalog does not list this workspace.
  const env = ownMachineEnv(path.join(dir, "machine"));
  return { config, store, request: starts[0], env, dir };
}

const answer = async (
  { config, env }: Awaited<ReturnType<typeof scratch>>,
  input: Record<string, unknown>,
  cron = true,
  startPass: StartPass = () => 123,
) => {
  const mcp = createAppMcp({ fallback: config, env, startPass });
  try {
    // A JSON-RPC reply: the tool's answer is its first text content.
    const reply = (await mcp.handle(tickCall(input, cron))) as {
      result: { content: { text: string }[] };
    } | null;
    return JSON.parse(found(reply).result.content[0].text);
  } finally {
    mcp.close();
  }
};

test("the cron starts a machine pass, returns released work, and records observations", async () => {
  const w = await scratch();
  const started: StartPassOptions[] = [];
  try {
    // Nothing is released until a tick says so.
    let intents = await answer(w, {}, true, (options) => {
      started.push(options);
      return 123;
    });
    assert.deepEqual(intents.dispatch, []);
    assert.equal(started.length, 1);
    assert.equal(
      found(started[0]).stateDirectory,
      path.join(found(w.env.XDG_STATE_HOME, "machine state home"), "avoozl"),
    );

    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    intents = await answer(
      w,
      {
        sessions: [{ target: "slot-2", status: "idle" }],
      },
      true,
      (options) => {
        started.push(options);
        return 124;
      },
    );
    assert.deepEqual(
      intents.dispatch.map((d: { id: string }) => d.id),
      [w.request.id],
    );
    assert.deepEqual(intents.observe, [
      { slot: "slot-2", taskId: "task-2", role: "worker" },
    ]);
    const bound = listSessionBindings(w.store).find((b) => b.slot === "slot-2");
    assert.equal(bound?.status, "idle");
    assert.equal(started.length, 2);
    // This workspace is not in the machine's catalog, so no tick ran on it.
    assert.equal(tickHealth(w.store).lastRun, null);
  } finally {
    w.store.close();
  }
});

test("a claimed start is never offered again, even to the cron that took it", async () => {
  const w = await scratch();
  let mcp: ReturnType<typeof createAppMcp> | undefined;
  try {
    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    mcp = createAppMcp({
      fallback: w.config,
      env: w.env,
      startPass: () => 123,
    });
    const first = await mcp.handle(
      cronCall(1, "plans_maintain", "tick", { cron: true }),
    );
    const firstBody = JSON.parse(
      found((first as ToolReply | null)?.result.content[0]).text,
    ) as { dispatch: RoutedRequest[] };
    assert.ok(Array.isArray(firstBody.dispatch), JSON.stringify(firstBody));
    const [request] = firstBody.dispatch;
    const claimed = await mcp.handle(
      cronCall(2, "plans_executor", "take", {
        id: request.id,
        version: request.version,
      }),
    );
    assert.ok(
      JSON.parse(found((claimed as ToolReply | null)?.result.content[0]).text)
        .claimToken,
    );

    // The open's outcome is unknown once a start is claimed: a chat may
    // exist. So a restarted cron is not handed it again, and a second take
    // gets nothing.
    recordReleased(w.store, { dispatch: [], messages: [] });
    const again = await mcp.handle(
      cronCall(3, "plans_maintain", "tick", { cron: true }),
    );
    assert.deepEqual(
      JSON.parse(found((again as ToolReply | null)?.result.content[0]).text)
        .dispatch,
      [],
    );
    const retaken = await mcp.handle(
      cronCall(4, "plans_executor", "take", {
        id: request.id,
        version: request.version,
      }),
    );
    assert.equal(
      JSON.parse(found((retaken as ToolReply | null)?.result.content[0]).text),
      null,
    );
    assert.equal(
      w.store.get<RequestRow>("session_requests", request.id)?.state,
      "claimed",
    );
  } finally {
    mcp?.close();
    w.store.close();
  }
});

test("only a cron caller's tick reaches every workspace", async () => {
  const w = await scratch();
  const started: StartPassOptions[] = [];
  try {
    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    for (const caller of [null, "chat-1"]) {
      const mcp = createAppMcp({
        fallback: w.config,
        env: w.env,
        startPass(options) {
          started.push(options);
          return 123;
        },
      });
      try {
        const reply = (await mcp.handle(
          tickCall({}, true, caller),
        )) as ToolReply | null;
        const body = JSON.parse(found(reply).result.content[0].text);
        assert.equal(body.dispatch, undefined, `caller ${caller}`);
      } finally {
        mcp.close();
      }
    }
    assert.equal(started.length, 0, "no machine pass for a non-cron caller");
  } finally {
    w.store.close();
  }
});

test("a machine pass that cannot start is reported, not thrown", async () => {
  const w = await scratch();
  try {
    recordReleased(w.store, { dispatch: [w.request], messages: [] });
    const intents = await answer(w, {}, true, () => {
      throw Error("state directory is read-only");
    });
    assert.deepEqual(
      intents.dispatch.map((d: { id: string }) => d.id),
      [w.request.id],
    );
    assert.equal(intents.passError, "state directory is read-only");
  } finally {
    w.store.close();
  }
});

test("a chat's tick call runs one pass for its own workspace", async () => {
  const w = await scratch();
  try {
    const results = await answer(w, {}, false);
    assert.deepEqual(
      results
        .filter((r: { root?: string }) => r.root)
        .map((r: { root: string; tick: string }) => [r.root, r.tick]),
      [[w.config.workspaceRoot, "ran"]],
    );
    assert.notEqual(tickHealth(w.store).lastRun, null);
  } finally {
    w.store.close();
  }
});

test("the cron returns and routes intents for every enabled workspace", async () => {
  const dir = temporaryDirectory("avoozl-cron-workspaces-"),
    env = ownMachineEnv(path.join(dir, "machine")),
    roots = new Map<string, string>(),
    stores = new Map<string, Store>();
  let mcp: ReturnType<typeof createAppMcp> | undefined;
  try {
    const registry = new WorkspaceRegistry({ env });
    try {
      for (const id of ["alpha", "beta"]) {
        const root = path.join(dir, id);
        initializeWorkspace(root, { name: id });
        registry.add(id, { root });
        roots.set(id, root);
      }
      const saved = JSON.parse(fs.readFileSync(registry.configPath, "utf8"));
      saved.loop = { run: ["specs"] };
      fs.writeFileSync(
        registry.configPath,
        JSON.stringify(saved, null, 2) + "\n",
      );
    } finally {
      registry.close();
    }
    for (const [id, root] of roots) {
      const store = new Store(workspaceConfig({ workspace: root, env }).dbPath);
      stores.set(id, store);
      const ops = new Operations(store, { workspaceRoot: root });
      await ops.execute("task.update", {
        id: "shared-task",
        create: true,
        title: `${id} task`,
      });
      const { starts } = enqueueSessionRequests(store, {
        starts: [
          {
            executor: "kirocrew",
            role: "worker",
            task: "shared-task",
            title: `avoozl:shared-task ${id}`,
            brief: `Work in ${id}.`,
            worktree: null,
            model: "fake-model",
            permissionClass: "write",
          },
        ],
      });
      recordReleased(store, { dispatch: starts, messages: [] });
    }

    const started: StartPassOptions[] = [];
    mcp = createAppMcp({
      fallback: workspaceConfig({
        workspace: found(roots.get("alpha"), "alpha workspace"),
        env,
      }),
      env,
      startPass(options) {
        started.push(options);
        return 123;
      },
    });
    const warm = await mcp.handle(
      cronCall(0, "plans_task", "sessions", { id: "shared-task" }),
    );
    assert.equal((warm as ToolReply | null)?.result.isError, undefined);
    const tick = await mcp.handle(tickCall({}));
    const intents = JSON.parse(
      found((tick as ToolReply | null)?.result.content[0]).text,
    ) as { dispatch: RoutedRequest[] };
    assert.equal(started.length, 1);
    assert.deepEqual(
      intents.dispatch.map((request) => request._avoozlWorkspaceId).sort(),
      ["alpha", "beta"],
    );

    const claims = new Map<string, ClaimedStart>();
    for (const [index, request] of intents.dispatch.entries()) {
      const workspaceId = request._avoozlWorkspaceId;
      const take = await mcp.handle(
        cronCall(index + 2, "plans_executor", "take", {
          id: request.id,
          version: request.version,
          _avoozlWorkspaceId: workspaceId,
        }),
      );
      assert.equal((take as ToolReply | null)?.result.isError, undefined);
      const claimed = JSON.parse(
        found((take as ToolReply | null)?.result.content[0]).text,
      ) as ClaimedStart;
      claims.set(workspaceId, claimed);
      assert.equal(claimed.request.title, `avoozl:shared-task ${workspaceId}`);
      assert.equal(
        found(stores.get(workspaceId), `${workspaceId} store`).get<RequestRow>(
          "session_requests",
          request.id,
        )?.state,
        "claimed",
      );
    }

    const beta = found(claims.get("beta"), "beta claim");
    const bind = await mcp.handle(
      cronCall(4, "plans_session", "bind", {
        taskId: "shared-task",
        slot: "beta-slot",
        title: "avoozl:shared-task beta",
        role: "worker",
        attempt: 1,
        model: "fake-model",
        permissionClass: "write",
        executor: "kirocrew",
        requestId: beta.request.id,
        claimToken: beta.claimToken,
        _avoozlWorkspaceId: "beta",
      }),
    );
    assert.equal((bind as ToolReply | null)?.result.isError, undefined);
    assert.equal(
      found(stores.get("beta"), "beta store").get<{ taskId: string }>(
        "session_bindings",
        "beta-slot",
      )?.taskId,
      "shared-task",
    );
    assert.equal(
      found(stores.get("alpha"), "alpha store").get(
        "session_bindings",
        "beta-slot",
      ),
      null,
    );
  } finally {
    mcp?.close();
    for (const store of stores.values()) store.close();
  }
});
