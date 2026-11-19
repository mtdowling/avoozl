// What needs Kiro Crew says so (without-kirocrew nk-7.1, NK8): one table, a
// Needs you item per waiting role on a headless tick, a person-only Run on,
// and no Kiro Crew reader called outside the table.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { workspaceStatus } from "../workspace-status.mjs";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.mjs";
import { tickWorkspace } from "../headless-tick.mjs";
import {
  KIROCREW_READERS,
  NEEDS_KIROCREW,
  markKirocrewSeen,
  needsKirocrewStep,
} from "../needs-kirocrew.mjs";
import { Operations } from "../operations.mjs";
import { ROLE_TABLE } from "../role-table.mjs";
import { sandboxKind } from "../sandbox.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

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
  const open = (use) => {
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

// A task summary the page asked for: the tick queues it for Kiro Crew.
async function askSummary(m) {
  const store = new Store(m.db);
  try {
    await new Operations(store, {
      workspaceRoot: m.directory,
      configDirectory: m.paths.configDirectory,
    }).execute("task.summary.request", { id: "b" });
  } finally {
    store.close();
  }
}

const items = (store) =>
  Object.values(store.getMeta("needs-kirocrew.items") ?? {});

test("a kirocrew start on a headless tick opens one item across three ticks and starts nothing", async () => {
  const m = machine();
  await askSummary(m);
  for (let i = 0; i < 3; i += 1) await tickWorkspace(m.directory, m.paths);
  const store = new Store(m.db);
  try {
    const open = items(store);
    assert.equal(open.length, 1);
    assert.equal(open[0].role, "taskSummary");
    assert.equal(open[0].requests.length, 1);
    assert.equal(store.list("session_bindings").length, 0, "nothing started");
    assert.deepEqual(
      store
        .list("session_requests")
        .filter((r) => r.state === "pending")
        .map((r) => r.executor),
      ["kirocrew"],
    );
    // Needs you shows it with the approved harnesses for Run on.
    const view = await new Operations(store, {
      workspaceRoot: m.directory,
      configDirectory: m.paths.configDirectory,
    }).execute("conflicts.view", {});
    const row = view.items.find((i) => i.kind === "needs-kirocrew");
    assert.equal(row.role, "taskSummary");
    assert.deepEqual(row.choices, ["fake-cli"]);
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
  assert.equal(status.kirocrew.reachable, false);
  assert.deepEqual(
    status.kirocrew.waiting.map((w) => [w.role, w.sessions]),
    [["taskSummary", 1]],
  );
  // With Kiro Crew back, the item goes.
  m.open((store) => {
    markKirocrewSeen(store);
    needsKirocrewStep(store);
    assert.deepEqual(items(store), []);
  });
});

test("Run on from a person moves the role, and the next tick starts it on that harness", async () => {
  const m = machine();
  await askSummary(m);
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
        { role: "taskSummary", harness: "fake-cli" },
        undefined,
        { mcp: true },
      ),
      (error) => error.status === 403,
    );
    await assert.rejects(
      ops.execute("needskirocrew.runon", {
        role: "taskSummary",
        harness: "not-here",
      }),
      /not an approved harness/,
    );
    await ops.execute("needskirocrew.runon", {
      role: "taskSummary",
      harness: "fake-cli",
    });
    const saved = JSON.parse(
      fs.readFileSync(path.join(m.directory, ".avoozl.json"), "utf8"),
    );
    assert.equal(saved.roles.taskSummary.harness, "fake-cli");
    assert.deepEqual(items(store), []);
  } finally {
    store.close();
  }
  await tickWorkspace(m.directory, m.paths);
  m.open((store) => {
    const [binding] = store.list("session_bindings");
    assert.equal(binding?.role, "task-summary");
    assert.equal(binding.executor, "process");
    assert.deepEqual(items(store), []);
  });
});

test("no module calls a Kiro Crew reader for an operation outside the table", () => {
  const file = fileURLToPath(new URL("../operations.mjs", import.meta.url)),
    lines = fs.readFileSync(file, "utf8").split("\n");
  let operation = null;
  const seen = [];
  for (const line of lines) {
    const name = /name === "([a-z][\w.]*)"/.exec(line);
    if (name) operation = name[1];
    for (const [, reader] of line.matchAll(
      /this\.(crewReader|sessionsReader|sessionStopper)\b/g,
    )) {
      if (/^\s*this\.\w+ = \w+;/.test(line)) continue;
      seen.push(operation);
      assert.ok(
        KIROCREW_READERS[operation]?.includes(reader),
        `${operation} calls ${reader}, which needs-kirocrew.mjs does not list`,
      );
    }
  }
  assert.ok(seen.length > 0, "the scan found the readers");
});

test("the table holds the four parts, then each role that is still a chat", () => {
  const parts = NEEDS_KIROCREW.filter((row) => !row.role).map((row) => row.id);
  assert.deepEqual(parts, [
    "issue-radar",
    "spec-builder",
    "kirocrew-chat",
    "side-panel",
  ]);
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
