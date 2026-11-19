// In flight for `process` sessions (R98.1): status, log tail, cost and an
// attach command, read from the supervisor without changing it.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
  parseHarnessDefinition,
} from "../harness-definitions.mjs";
import {
  openSupervisorDatabase,
  requestChild,
  supervisorPaths,
} from "../supervisor.mjs";
import {
  attachCommand,
  logTail,
  processSessionDetails,
  shellQuote,
} from "../process-view.mjs";
import { deliveryView } from "../../api/page-views.mjs";
import { bindSession } from "../../sessions/session-bindings.mjs";
import {
  enqueueSessionRequests,
  takeSessionRequest,
} from "../../sessions/session-requests.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { Store } from "../../store/store.mjs";

const definition = (extra = {}) => ({
  name: "fake-cli",
  start: ["fake-cli", "--prompt-file", "{brief_file}"],
  resume: ["fake-cli", "--resume", "{session_uuid}"],
  permission: { write: "edit", read: "plan" },
  writeRoots: ["{worktree}", "{tmp}"],
  cost: { from: "output", field: "total_cost_usd" },
  ...extra,
});

function machine(t, extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-process-view-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDirectory = path.join(root, "state");
  const configDirectory = path.join(root, "config");
  const worktree = path.join(root, "work tree");
  fs.mkdirSync(worktree, { recursive: true });
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify(definition(extra));
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  approveHarnessDefinition({
    configDirectory,
    name: "fake-cli",
    hash: harnessDefinitionHash(Buffer.from(bytes)),
  });
  return { root, stateDirectory, configDirectory, worktree };
}

// A child the supervisor started twice (a resume), with its log written.
function child({ stateDirectory, worktree }, log) {
  const db = openSupervisorDatabase(stateDirectory);
  try {
    const sessionId = requestChild(db, {
      executor: "process",
      role: "worker",
      task: "sample-task",
      worktree,
      harness: "fake-cli",
      permissionClass: "write",
      brief: "Work.",
    });
    const file = path.join(
      supervisorPaths(stateDirectory).children,
      sessionId,
      "log",
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, log);
    db.prepare(
      "UPDATE children SET state = 'running', runs = 2, log_file = ? WHERE session_id = ?",
    ).run(file, sessionId);
    return { sessionId, file };
  } finally {
    db.close();
  }
}

test("the log tail drops terminal escapes and keeps the last lines", (t) => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tail-")),
    "log",
  );
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true }));
  const lines = Array.from({ length: 30 }, (_, n) => `line ${n + 1}`);
  fs.writeFileSync(file, `\x1b[31m${lines.join("\r\n")}\x1b[0m\x07\n\n`);
  const tail = logTail(file);
  assert.equal(tail.split("\n").length, 20);
  assert.equal(tail.split("\n")[0], "line 11");
  assert.equal(tail.split("\n").at(-1), "line 30");
  assert.doesNotMatch(tail, /[\x00-\x08\x0b-\x1f\x1b]/);
  assert.equal(logTail(path.join(path.dirname(file), "missing")), null);
});

test("details: status, run, log tail, summed cost and the attach command", (t) => {
  const paths = machine(t, {
    attach: ["fake-cli", "--resume", "{session_uuid}"],
  });
  const { sessionId } = child(
    paths,
    [
      "working on it",
      '{"type":"result","total_cost_usd":0.25}',
      "resumed",
      '{"type":"result","total_cost_usd":0.5}',
      "not json total_cost_usd {",
    ].join("\n") + "\n",
  );
  const details = processSessionDetails([sessionId, "process-unknown"], {
    ...paths,
    platform: "linux",
  });
  assert.deepEqual([...details.keys()], [sessionId]);
  const one = details.get(sessionId);
  assert.equal(one.harness, "fake-cli");
  assert.equal(one.state, "running");
  assert.equal(one.run, 2);
  assert.equal(one.cost, 0.75);
  assert.match(one.logTail, /^working on it\n/);
  assert.equal(
    one.attach,
    `cd '${paths.worktree}' && fake-cli --resume ${sessionId.slice("process-".length)}`,
  );
});

// P60: Claude Code's total_cost_usd on a resume is the session's total so
// far, so `per: "session"` takes the last value instead of summing.
test("a per-session cost is the last value, not the sum", (t) => {
  const paths = machine(t, {
    cost: { from: "output", field: "total_cost_usd", per: "session" },
  });
  const { sessionId } = child(
    paths,
    [
      '{"type":"result","total_cost_usd":0.134}',
      '{"type":"result","total_cost_usd":0.16}',
    ].join("\n") + "\n",
  );
  const one = processSessionDetails([sessionId], paths).get(sessionId);
  assert.equal(one.cost, 0.16);
  assert.throws(
    () =>
      parseHarnessDefinition(
        definition({
          cost: { from: "output", field: "total_cost_usd", per: "turn" },
        }),
      ),
    /cost must be/,
  );
  assert.throws(
    () =>
      parseHarnessDefinition(
        definition({ cost: { from: "file", path: "{tmp}/c", per: "session" } }),
      ),
    /cost must be/,
  );
});

test("no attach in the definition follows the log; no cost field is unknown", (t) => {
  const paths = machine(t, { cost: undefined });
  const { sessionId, file } = child(paths, "hello\n");
  const one = processSessionDetails([sessionId], {
    ...paths,
    platform: "linux",
  }).get(sessionId);
  assert.equal(one.cost, null);
  assert.equal(one.attach, `tail -n 20 -f ${shellQuote(file, "linux")}`);
  const row = {
    log_file: "C:\\it's\\log",
    worktree: "C:\\w",
    session_id: "process-x",
  };
  assert.equal(
    attachCommand(row, null, "win32"),
    "Get-Content -Wait -Tail 20 'C:\\it''s\\log'",
  );
});

test("an unapproved definition shows no cost and still offers the log", (t) => {
  const paths = machine(t);
  fs.appendFileSync(
    path.join(paths.configDirectory, "harnesses", "fake-cli.json"),
    " ",
  );
  const { sessionId } = child(paths, '{"total_cost_usd":1}\n');
  const one = processSessionDetails([sessionId], paths).get(sessionId);
  assert.equal(one.cost, null);
  assert.match(one.attach, /log/);
});

test("no supervisor on this machine: no details and no files made", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-no-sup-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const details = processSessionDetails(["process-a"], {
    stateDirectory: path.join(root, "state"),
    configDirectory: path.join(root, "config"),
  });
  assert.equal(details.size, 0);
  assert.deepEqual(fs.readdirSync(root), []);
});

test("attach must be an argv list naming a CLI, not a shell", () => {
  assert.throws(
    () => parseHarnessDefinition(definition({ attach: "fake-cli --resume" })),
    /shell string/,
  );
  assert.throws(
    () => parseHarnessDefinition(definition({ attach: ["sh", "-c", "x"] })),
    /runs a shell/,
  );
});

test("delivery.view gives a live process session its details and no chat link", (t) => {
  const crew = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-crew-home-"));
  const saved = process.env.KIROCREW_HOME;
  process.env.KIROCREW_HOME = crew;
  let store = null;
  // One hook, store first: Windows cannot remove an open database file.
  t.after(() => {
    store?.close();
    if (saved === undefined) delete process.env.KIROCREW_HOME;
    else process.env.KIROCREW_HOME = saved;
    fs.rmSync(crew, { recursive: true, force: true });
  });
  // machineAvoozlPaths under a separate crew home: <crew>/avoozl{,/state}.
  const configDirectory = path.join(crew, "avoozl");
  const stateDirectory = path.join(configDirectory, "state");
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify(definition());
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  approveHarnessDefinition({
    configDirectory,
    name: "fake-cli",
    hash: harnessDefinitionHash(Buffer.from(bytes)),
  });
  const worktree = path.join(crew, "wt");
  fs.mkdirSync(worktree);
  const { sessionId } = child(
    { stateDirectory, worktree },
    'step one\n{"total_cost_usd":0.1}\n',
  );
  store = new Store(path.join(crew, "workspace.sqlite"));
  store.importSnapshot(snapshot());
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
  const [pending] = store.list("session_requests");
  const { request, claimToken } = takeSessionRequest(store, pending, {
    executor: "process",
    consumer: "supervisor",
  });
  bindSession(
    store,
    {
      slot: sessionId,
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
  const item = deliveryView(store, store.read()).items.find(
    (i) => i.id === "sample-task",
  );
  const [session] = item.sessions;
  assert.equal(session.executor, "process");
  assert.equal(session.link, null);
  assert.equal(session.process.cost, 0.1);
  assert.match(session.process.logTail, /step one/);
  assert.match(session.process.attach, /tail -n 20 -f|Get-Content/);
});
