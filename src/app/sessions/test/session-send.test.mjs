// Send message on a `process` session (R98.2): session.send queues a `send`
// request that the process drain hands to the supervisor; only a person
// sends, and only to a live process session.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { classifyOperation } from "../../api/operation-table.mjs";
import { mcpRefusal } from "../../mcp/mcp-policy.mjs";
import { bindSession } from "../session-bindings.mjs";
import {
  enqueueSessionRequests,
  pendingSessionRequests,
  takeSessionRequest,
} from "../session-requests.mjs";
import {
  PERSON_MESSAGE_HEAD,
  personMessage,
  queueSessionSend,
  SEND_MAX_CHARS,
} from "../session-send.mjs";
import { processSteps } from "../../delivery/delivery.mjs";
import {
  openSupervisorDatabase,
  requestChild,
} from "../../executors/supervisor.mjs";
import { drainProcessRequests } from "../../executors/process.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { Store } from "../../store/store.mjs";

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-send-"));
  const store = new Store(path.join(root, "workspace.sqlite"));
  // One hook, store first: Windows cannot remove an open database file.
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  store.importSnapshot(snapshot());
  return { root, store };
}

// A bound `process` worker session, as the drain leaves one.
function processSession(store, slot = "process-1") {
  const worktree = path.join(os.tmpdir(), "avoozl-send-wt");
  enqueueSessionRequests(store, {
    starts: [
      {
        executor: "process",
        role: "worker",
        task: "sample-task",
        brief: "Work.",
        worktree,
        permissionClass: "write",
      },
    ],
  });
  const [pending] = pendingSessionRequests(store, "process");
  const { request, claimToken } = takeSessionRequest(store, pending, {
    executor: "process",
    consumer: "supervisor",
  });
  bindSession(
    store,
    {
      slot,
      taskId: "sample-task",
      role: "worker",
      attempt: 1,
      source: "tick",
      permissionClass: "write",
      worktree,
      executor: "process",
      requestId: request.id,
      claimToken,
    },
    { consumer: "supervisor" },
  );
  return slot;
}

test("a person's message is queued as a process send", (t) => {
  const { store } = workspace(t);
  const slot = processSession(store);
  const queued = queueSessionSend(store, { slot, text: "  Add a test.  " });
  assert.equal(queued.state, "queued");
  assert.equal(queued.taskId, "sample-task");
  const sends = pendingSessionRequests(store, "process").filter(
    (r) => r.operation === "send",
  );
  assert.equal(sends.length, 1);
  assert.equal(sends[0].slot, slot);
  // P60: framed, so the child knows the person sent it.
  assert.equal(sends[0].text, `${PERSON_MESSAGE_HEAD}\n\nAdd a test.`);
  assert.equal(sends[0].id, queued.id);
  // Two messages are two sends, in order.
  queueSessionSend(store, { slot, text: "And a second." });
  assert.equal(
    pendingSessionRequests(store, "process").filter(
      (r) => r.operation === "send",
    ).length,
    2,
  );
});

test("an empty, long, unknown, chat or ended session send is refused", (t) => {
  const { store } = workspace(t);
  const slot = processSession(store);
  const status = (fn) => {
    try {
      fn();
    } catch (error) {
      return error.status;
    }
    return null;
  };
  assert.equal(
    status(() => queueSessionSend(store, { slot, text: " " })),
    422,
  );
  assert.equal(
    status(() =>
      queueSessionSend(store, { slot, text: "x".repeat(SEND_MAX_CHARS + 1) }),
    ),
    422,
  );
  assert.equal(
    status(() => queueSessionSend(store, { slot: "process-x", text: "hi" })),
    404,
  );
  store.put("session_bindings", {
    ...store.get("session_bindings", slot),
    id: "chat-1",
    slot: "chat-1",
    executor: "kirocrew",
  });
  assert.equal(
    status(() => queueSessionSend(store, { slot: "chat-1", text: "hi" })),
    409,
  );
  store.put("session_bindings", {
    ...store.get("session_bindings", slot),
    status: "closed",
  });
  assert.equal(
    status(() => queueSessionSend(store, { slot, text: "hi" })),
    409,
  );
});

test("session.send is a person's write: MCP and agent sessions are refused", async (t) => {
  const { root, store } = workspace(t);
  const slot = processSession(store);
  assert.equal(classifyOperation("session.send"), "execute");
  assert.match(mcpRefusal("session.send", {}), /^Only a person/);
  const ops = new Operations(store, { workspaceRoot: root });
  for (const context of [{ mcp: true }, { caller: { sessionKey: "chat-9" } }])
    await assert.rejects(
      ops.execute("session.send", { slot, text: "hi" }, undefined, context),
      (error) => error.status === 403,
    );
  const result = await ops.execute("session.send", { slot, text: "hi" });
  assert.equal(result.state, "queued");
  assert.equal(
    store.list("session_requests").filter((r) => r.kind === "send").length,
    1,
  );
});

test("the drain hands a queued message to the supervisor", async (t) => {
  const { root, store } = workspace(t);
  const stateDirectory = path.join(root, "state");
  const db = openSupervisorDatabase(stateDirectory);
  const slot = requestChild(db, {
    executor: "process",
    role: "worker",
    task: "sample-task",
    worktree: root,
    harness: "fake-cli",
    permissionClass: "write",
    brief: "Work.",
  });
  // One run has finished, so a message resumes it.
  db.prepare(
    "UPDATE children SET state = 'exited', exit_code = 0, runs = 1 WHERE session_id = ?",
  ).run(slot);
  db.close();
  processSession(store, slot);
  queueSessionSend(store, { slot, text: "One more thing." });
  const { errors } = await drainProcessRequests(store, { stateDirectory });
  assert.deepEqual(errors, []);
  assert.equal(
    store.list("session_requests").find((r) => r.kind === "send").state,
    "sent",
  );
  const check = openSupervisorDatabase(stateDirectory);
  const messages = check
    .prepare("SELECT text, state FROM messages WHERE session_id = ?")
    .all(slot)
    .map((row) => ({ ...row }));
  check.close();
  assert.deepEqual(messages, [
    { text: personMessage("One more thing."), state: "queued" },
  ]);
});

// P60: an unframed message read as relayed text, and the child refused it.
test("the process brief names the person's message line", () => {
  const steps = processSteps({ id: "7.1" }).join("\n");
  assert.ok(steps.includes(`"${PERSON_MESSAGE_HEAD}"`));
  assert.match(steps, /person's own and may change your task/);
});
