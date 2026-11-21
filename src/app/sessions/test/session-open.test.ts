// Open chat on the standalone page (SW7): `session.open` makes a read-only
// `process` session in the workspace root from a message, a person only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { drainProcessRequests } from "../../executors/process.ts";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../../executors/harness-definitions.ts";
import { Operations } from "../../api/operations.ts";
import { principalAllows } from "../../api/command-dispatch.ts";
import {
  childRecord,
  openSupervisorDatabase,
} from "../../executors/supervisor.ts";
import { roleFor } from "../session-open.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import type { RequestRow } from "../session-requests.ts";
import type { SessionBinding } from "../session-bindings.ts";

// session.open's preview, and what it and session.view answer.
interface Preview {
  role: string;
  harness: string;
  permissionClass: string;
  available: boolean;
  reason: string | null;
}
type Opened = { id: string };
type View = { state: string; slot: string };

function machine(
  t: TestContext,
  {
    approve = true,
    roles,
  }: { approve?: boolean; roles?: Record<string, { harness: string }> } = {},
) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    workspaceRoot = path.join(root, "ws"),
    configDirectory = path.join(root, "config"),
    stateDirectory = path.join(root, "state");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, ".avoozl.json"),
    JSON.stringify({ version: 1, ...(roles ? { roles } : {}) }),
  );
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", "{brief_file}"],
    resume: ["node", "{message_file}"],
    permission: { write: "workspace-write", read: "read-only" },
    writeRoots: ["{worktree}", "{tmp}"],
  });
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  if (approve)
    approveHarnessDefinition({
      configDirectory,
      name: "fake-cli",
      hash: harnessDefinitionHash(Buffer.from(bytes)),
    });
  const ops = new Operations(store, { workspaceRoot, configDirectory });
  return { store, ops, workspaceRoot, configDirectory, stateDirectory };
}

test("with no approved harness the preview says so and Start starts nothing", async (t) => {
  const m = machine(t, { approve: false });
  const preview = await m.ops.execute<Preview>("session.open", {
    preview: true,
  });
  assert.equal(preview.available, false);
  assert.match(preview.reason ?? "", /No harness definition is approved/);
  await assert.rejects(
    m.ops.execute("session.open", { message: "Help" }),
    /No harness definition is approved/,
  );
  assert.equal(m.store.list("session_requests").length, 0);
});

test("Start records one read-only process request in the workspace root with the message as its brief", async (t) => {
  const m = machine(t);
  const preview = await m.ops.execute<Preview>("session.open", {
    preview: true,
    agent: "avoozl-planner",
  });
  assert.deepEqual(
    { ...preview },
    {
      role: "assist",
      harness: "fake-cli",
      permissionClass: "read",
      available: true,
      reason: null,
    },
  );
  assert.equal(
    m.store.list("session_requests").length,
    0,
    "a preview writes nothing",
  );
  const opened = await m.ops.execute<Opened>("session.open", {
    message: "Why was my plan refused?",
    agent: "avoozl-planner",
  });
  const rows = m.store.list<RequestRow>("session_requests");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].executor, "process");
  assert.equal(rows[0].state, "pending");
  assert.equal(rows[0].request.role, "assist");
  assert.equal(rows[0].request.permissionClass, "read");
  assert.equal(rows[0].request.worktree, m.workspaceRoot);
  assert.equal(rows[0].request.brief, "Why was my plan refused?");
  assert.equal(rows[0].request.harness, "fake-cli");
  assert.equal(
    (await m.ops.execute<View>("session.view", { id: opened.id })).state,
    "queued",
  );
  // The drain starts the child with the assistant's prompt over the message.
  const drained = await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops: m.ops,
  });
  assert.deepEqual(drained.errors, []);
  const slot = m.store.list<SessionBinding>("session_bindings")[0].slot;
  const db = openSupervisorDatabase(m.stateDirectory);
  try {
    const row = childRecord(db, slot);
    assert.equal(row.role, "assist");
    assert.equal(row.worktree, m.workspaceRoot);
    assert.equal(
      row.permission_class ??
        JSON.parse(row.placeholder_values ?? "{}").permission ??
        "read",
      "read",
    );
    assert.match(row.brief, /read-only/);
    assert.match(row.brief, /Why was my plan refused\?/);
  } finally {
    db.close();
  }
  const view = await m.ops.execute<View>("session.view", { id: opened.id });
  assert.equal(view.slot, slot);
  assert.ok(["working", "ended"].includes(view.state));
});

test("a message goes to the opened session with Send message", async (t) => {
  const m = machine(t);
  const opened = await m.ops.execute<Opened>("session.open", {
    message: "Hello",
  });
  await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops: m.ops,
  });
  const { slot } = await m.ops.execute<View>("session.view", { id: opened.id });
  const sent = await m.ops.execute<{ state: string }>("session.send", {
    slot,
    text: "And this too",
  });
  assert.equal(sent.state, "queued");
});

test("a harness picked for the role in Settings › Models is the one used, or refused when not approved", async (t) => {
  const named = machine(t, { roles: { assist: { harness: "fake-cli" } } });
  assert.equal(
    (await named.ops.execute<Preview>("session.open", { preview: true }))
      .harness,
    "fake-cli",
  );
  const missing = machine(t, { roles: { assist: { harness: "other-cli" } } });
  const refused = await missing.ops.execute<Preview>("session.open", {
    preview: true,
  });
  assert.equal(refused.available, false);
  assert.match(refused.reason ?? "", /other-cli.*not approved/);
  const crew = machine(t, { roles: { assist: { harness: "kirocrew" } } });
  assert.match(
    (await crew.ops.execute<Preview>("session.open", { preview: true }))
      .reason ?? "",
    /needs Kiro Crew/,
  );
});

test("with no harness saved for assist, Run in a chat uses the worker's approved harness", async (t) => {
  const m = machine(t, { roles: { worker: { harness: "worker-cli" } } }),
    bytes = JSON.stringify({
      name: "worker-cli",
      start: ["node", "{brief_file}"],
      resume: ["node", "{message_file}"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}"],
    });
  fs.writeFileSync(
    path.join(m.configDirectory, "harnesses", "worker-cli.json"),
    bytes,
  );
  approveHarnessDefinition({
    configDirectory: m.configDirectory,
    name: "worker-cli",
    hash: harnessDefinitionHash(Buffer.from(bytes)),
  });
  const preview = await m.ops.execute<Preview>("session.open", {
    preview: true,
  });
  assert.deepEqual(
    [preview.role, preview.harness, preview.permissionClass],
    ["assist", "worker-cli", "read"],
  );
});

test("an empty or oversize message is refused, and the role falls back to assist", async (t) => {
  const m = machine(t);
  await assert.rejects(
    m.ops.execute("session.open", { message: "  " }),
    /Write a message/,
  );
  await assert.rejects(
    m.ops.execute("session.open", { message: "x".repeat(8001) }),
    /at most 8000/,
  );
  assert.equal(roleFor("avoozl-verifier"), "assist");
  assert.equal(roleFor(undefined), "assist");
  assert.equal(roleFor("avoozl-assist"), "assist");
});

test("session.open is person-only: MCP and an agent tool are refused", async (t) => {
  const m = machine(t);
  await assert.rejects(
    m.ops.execute("session.open", { message: "Hi" }, undefined, { mcp: true }),
    /Only a person opens a session/,
  );
  await assert.rejects(
    m.ops.execute("session.open", { message: "Hi" }, undefined, {
      caller: { sessionKey: "dashboard:x" },
    }),
    /Only a person opens a session/,
  );
  assert.equal(
    principalAllows({ kind: "owner-session" }, "session.open"),
    true,
  );
  assert.equal(principalAllows({ kind: "agent-tool" }, "session.open"), false);
  assert.equal(principalAllows({ kind: "app-token" }, "session.open"), false);
  assert.equal(m.store.list("session_requests").length, 0);
});
