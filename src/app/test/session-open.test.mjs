// Open chat on the standalone page (SW7): `session.open` makes a read-only
// `process` session in the workspace root from a message, a person only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drainProcessRequests } from "../executors/process.mjs";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.mjs";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../command-dispatch.mjs";
import { childRecord, openSupervisorDatabase } from "../supervisor.mjs";
import { roleFor } from "../session-open.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function machine(t, { approve = true, roles } = {}) {
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
  const preview = await m.ops.execute("session.open", { preview: true });
  assert.equal(preview.available, false);
  assert.match(preview.reason, /No harness definition is approved/);
  await assert.rejects(
    m.ops.execute("session.open", { message: "Help" }),
    /No harness definition is approved/,
  );
  assert.equal(m.store.list("session_requests").length, 0);
});

test("Start records one read-only process request in the workspace root with the message as its brief", async (t) => {
  const m = machine(t);
  const preview = await m.ops.execute("session.open", {
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
  const opened = await m.ops.execute("session.open", {
    message: "Why was my plan refused?",
    agent: "avoozl-planner",
  });
  const rows = m.store.list("session_requests");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].executor, "process");
  assert.equal(rows[0].state, "pending");
  assert.equal(rows[0].request.role, "assist");
  assert.equal(rows[0].request.permissionClass, "read");
  assert.equal(rows[0].request.worktree, m.workspaceRoot);
  assert.equal(rows[0].request.brief, "Why was my plan refused?");
  assert.equal(rows[0].request.harness, "fake-cli");
  assert.equal(
    (await m.ops.execute("session.view", { id: opened.id })).state,
    "queued",
  );
  // The drain starts the child with the assistant's prompt over the message.
  const drained = await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops: m.ops,
  });
  assert.deepEqual(drained.errors, []);
  const slot = m.store.list("session_bindings")[0].slot;
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
  const view = await m.ops.execute("session.view", { id: opened.id });
  assert.equal(view.slot, slot);
  assert.ok(["working", "ended"].includes(view.state));
});

test("a message goes to the opened session with Send message", async (t) => {
  const m = machine(t);
  const opened = await m.ops.execute("session.open", { message: "Hello" });
  await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops: m.ops,
  });
  const { slot } = await m.ops.execute("session.view", { id: opened.id });
  const sent = await m.ops.execute("session.send", {
    slot,
    text: "And this too",
  });
  assert.equal(sent.state, "queued");
});

test("a harness picked for the role in Settings › Models is the one used, or refused when not approved", async (t) => {
  const named = machine(t, { roles: { assist: { harness: "fake-cli" } } });
  assert.equal(
    (await named.ops.execute("session.open", { preview: true })).harness,
    "fake-cli",
  );
  const missing = machine(t, { roles: { assist: { harness: "other-cli" } } });
  const refused = await missing.ops.execute("session.open", { preview: true });
  assert.equal(refused.available, false);
  assert.match(refused.reason, /other-cli.*not approved/);
  const crew = machine(t, { roles: { assist: { harness: "kirocrew" } } });
  assert.match(
    (await crew.ops.execute("session.open", { preview: true })).reason,
    /needs Kiro Crew/,
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
      caller: { slot: "x" },
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
