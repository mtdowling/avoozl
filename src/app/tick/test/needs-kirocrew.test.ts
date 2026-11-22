// What needs Kiro Crew says so (without-kirocrew nk-7.1, NK8): one table, a
// Needs you item per waiting role on a headless tick, a person-only Run on,
// and no Kiro Crew reader called outside the table.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../../settings/config.ts";
import { OPERATIONS } from "../../api/operation-table.ts";
import { workspaceStatus } from "../../workspace/workspace-status.ts";
import { withStatus } from "../../test/refusal.ts";
import {
  storedRow,
  type ConflictsView,
  type NeedsYouItem,
} from "../../test/view-shapes.ts";
import type { RequestRow } from "../../sessions/session-requests.ts";

// One open needs-kirocrew item: its role and the starts that wait on it.
type Waiting = { role: string; requests: unknown[] };
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../../executors/harness-definitions.ts";
import { tickWorkspace } from "../tick-pass.ts";
import {
  KIROCREW_READERS,
  NEEDS_KIROCREW,
  markKirocrewSeen,
  needsKirocrewStep,
} from "../needs-kirocrew.ts";
import { Operations } from "../../api/operations.ts";
import { ROLE_TABLE } from "../../agents/role-table.ts";
import { sandboxKind } from "../../executors/sandbox.ts";
import { Store } from "../../store/store.ts";
import { enqueueSessionRequests } from "../../sessions/session-requests.ts";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

// A headless machine: a scratch workspace with one task, its state and
// config folders, and an approved fake harness.
function machine() {
  const root = temporaryDirectory("avoozl-needs-kirocrew-"),
    directory = path.join(root, "workspace"),
    paths = {
      stateDirectory: path.join(root, "state"),
      configDirectory: path.join(root, "config"),
    };
  initializeWorkspace(directory, { name: "Needs Kiro Crew", port: 0 });
  fs.mkdirSync(paths.stateDirectory, { recursive: true });
  fs.mkdirSync(path.join(paths.configDirectory, "harnesses"), {
    recursive: true,
  });
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", "-e", "0", "{session_uuid}"],
    resume: ["node", "-e", "0", "{session_uuid}"],
    promptFrom: "stdin",
    permission: { write: "w", read: "r" },
    writeRoots: ["{worktree}", "{tmp}"],
    // How a read-only child writes its result (NK6.1); the fake ignores it.
    resultAllow: ["--result-file"],
  });
  fs.writeFileSync(
    path.join(paths.configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({
    configDirectory: paths.configDirectory,
    name: "fake-cli",
    hash,
  });
  if (!sandboxKind())
    fs.writeFileSync(
      path.join(paths.configDirectory, "harness-unconfined.json"),
      JSON.stringify({ "fake-cli": hash }),
    );
  const db = workspaceConfig({ workspace: directory }).dbPath;
  const open = <T>(use: (store: Store) => T) => {
    const store = new Store(db);
    try {
      return use(store);
    } finally {
      store.close();
    }
  };
  open((store) =>
    store.write({
      ...structuredClone(store.read()),
      tasks: [
        {
          id: "b",
          title: "Task b",
          scope: "catalog",
          status: "planned",
          epic: "sample",
          track: "catalog",
          tags: [],
          acceptance: ["b is observable."],
        },
      ],
    }),
  );
  return { root, directory, paths, db, open };
}

// A worker start for task b, queued for Kiro Crew as the tick queues one.
function askWorker(m: ReturnType<typeof machine>) {
  m.open((store) =>
    enqueueSessionRequests(store, {
      starts: [
        {
          id: "b:worker:1",
          task: "b",
          role: "worker",
          attempt: 1,
          executor: "kirocrew",
          title: "avoozl:worker b (attempt 1)",
          brief: "Work on b.",
        },
      ],
    }),
  );
}

const items = (store: Store) =>
  Object.values(
    store.getMeta<Record<string, Waiting>>("needs-kirocrew.items") ?? {},
  );

test("a kirocrew start on a headless tick opens one item across three ticks and starts nothing", async () => {
  const m = machine();
  askWorker(m);
  for (let i = 0; i < 3; i += 1) await tickWorkspace(m.directory, m.paths);
  const store = new Store(m.db);
  try {
    const open = items(store);
    assert.equal(open.length, 1);
    assert.equal(open[0].role, "worker");
    assert.equal(open[0].requests.length, 1);
    assert.equal(store.list("session_bindings").length, 0, "nothing started");
    assert.deepEqual(
      store
        .list<RequestRow>("session_requests")
        .filter((r) => r.state === "pending")
        .map((r) => r.executor),
      ["kirocrew"],
    );
    // Needs you shows it with the approved harnesses for Run on.
    const view = await new Operations(store, {
      workspaceRoot: m.directory,
      configDirectory: m.paths.configDirectory,
    }).execute<ConflictsView>("conflicts.view", {});
    const row: NeedsYouItem | undefined = view.items.find(
      (i) => i.kind === "needs-kirocrew",
    );
    assert.equal(row?.role, "worker");
    assert.deepEqual(row?.choices, ["fake-cli"]);
  } finally {
    store.close();
  }
  // avoozl status says Kiro Crew is not reachable, and what waits on it.
  const status = workspaceStatus({
    named: m.directory,
    from: "--workspace",
    config: workspaceConfig({ workspace: m.directory }),
    catalog: { workspaces: [] },
  });
  assert.ok("kirocrew" in status, status.health);
  assert.equal(status.kirocrew.reachable, false);
  assert.deepEqual(
    status.kirocrew.waiting.map((w) => [w.role, w.sessions]),
    [["worker", 1]],
  );
  // With Kiro Crew back, the item goes.
  m.open((store) => {
    markKirocrewSeen(store);
    needsKirocrewStep(store);
    assert.deepEqual(items(store), []);
  });
});

test("Run on from a person moves the role and cancels its waiting kirocrew start", async () => {
  const m = machine();
  askWorker(m);
  await tickWorkspace(m.directory, m.paths);
  const store = new Store(m.db);
  try {
    const ops = new Operations(store, {
      workspaceRoot: m.directory,
      configDirectory: m.paths.configDirectory,
    });
    await assert.rejects(
      ops.execute(
        "needskirocrew.runon",
        { role: "worker", harness: "fake-cli" },
        undefined,
        { mcp: true },
      ),
      withStatus(403),
    );
    await assert.rejects(
      ops.execute("needskirocrew.runon", {
        role: "worker",
        harness: "not-here",
      }),
      /not an approved harness/,
    );
    await ops.execute("needskirocrew.runon", {
      role: "worker",
      harness: "fake-cli",
    });
    const saved = JSON.parse(
      fs.readFileSync(path.join(m.directory, ".avoozl.json"), "utf8"),
    );
    assert.equal(saved.roles.worker.harness, "fake-cli");
    assert.deepEqual(items(store), []);
    // Its waiting kirocrew start is canceled, so the next tick plans it anew.
    assert.notEqual(
      storedRow(store, "session_requests", "b:worker:1").state,
      "pending",
    );
  } finally {
    store.close();
  }
});

test("no module calls a Kiro Crew reader for an operation outside the table", () => {
  const seen = [];
  for (const [operation, { handler }] of OPERATIONS)
    for (const [, reader] of String(handler).matchAll(
      /this\.(crewReader|sessionStopper)\b/g,
    )) {
      seen.push(operation);
      assert.ok(
        KIROCREW_READERS[operation]?.includes(reader),
        `${operation} calls ${reader}, which needs-kirocrew.mjs does not list`,
      );
    }
  assert.ok(seen.length > 0, "the scan found the readers");
});

test("the table holds its one part, then each role that is still a chat", () => {
  const parts = NEEDS_KIROCREW.filter((row) => !row.role).map((row) => row.id);
  assert.deepEqual(parts, ["kirocrew-chat"]);
  const roles = NEEDS_KIROCREW.filter((row) => row.role).map((row) => row.role);
  assert.deepEqual(
    roles,
    Object.values(ROLE_TABLE)
      .filter((row) => !row.process)
      .map((row) => row.setting),
  );
  for (const row of NEEDS_KIROCREW) assert.ok(row.reason, row.id);
  // NK8.4: with nk-2.1 to nk-4.3 landed, every role runs as a child, so the
  // table holds only the four parts.
  assert.deepEqual(roles, []);
});
