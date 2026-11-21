// @ts-nocheck: typing debt
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EXECUTOR_CONTRACT } from "../executors.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

const adapter = fileURLToPath(
  new URL("../../../../hosts/kirocrew/executors/kirocrew.py", import.meta.url),
);
const run = (body) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import importlib.util, inspect, json, sys
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
calls = []
class Ctx:
    roster = {"ok": True, "sessions": []}
    folders = [{"id": "parent", "name": "Avoozl", "project_dir": "/repo"}, {"id": "child", "name": "app", "parent_id": "parent"}]
    def list_session_folders(self): return list(self.folders)
    def create_session_folder(self, name, parent_id=""):
        row = {"id": "new-" + name, "name": name, "parent_id": parent_id}
        self.folders.append(row); return row
    def open_session(self, name, **kwargs):
        calls.append(["open", name, kwargs]); return "session-one"
    def send_to_session(self, sessionId, text):
        calls.append(["send", sessionId, text]); return {"ok": True}
    def set_session_mode(self, sessionId, mode): calls.append(["mode", sessionId, mode])
    def session_status(self): return self.roster
ctx = Ctx()
e = m.KiroCrewExecutor(ctx, lambda binding: calls.append(["bind", binding]))
${body}
`,
        adapter,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    ),
  );

test("the Python adapter implements the same start, send and status parameters", () => {
  const methods = run(
    `print(json.dumps({name: list(inspect.signature(getattr(e, name)).parameters) for name in ("start", "send", "status")}))`,
  );
  for (const name of ["start", "send", "status"])
    assert.deepEqual(methods[name], EXECUTOR_CONTRACT[name]);
});

test("the real adapter inherits a project and binds before mode and first message", () => {
  const result = run(`
d = {"task": "task-one", "role": "worker", "title": "avoozl:task-one work", "folder": "Avoozl/app", "agent": "worker-agent", "model": "model-one", "brief": "Do the work", "mode": "trust_reads", "attempt": 2, "commit": "a" * 40}
args = e.arguments(d)
slot = e.start(*args)
print(json.dumps({"slot": slot, "calls": calls, "observations": e.observations()}))`);
  assert.equal(result.slot, "session-one");
  assert.deepEqual(
    result.calls.map((row) => row[0]),
    ["open", "bind", "mode", "send"],
  );
  assert.deepEqual(result.calls[0], [
    "open",
    "avoozl:task-one work",
    { folder_id: "child", agent: "worker-agent", model: "model-one" },
  ]);
  assert.equal(result.calls[1][1].attempt, 2);
  assert.equal(result.calls[1][1].commit, "a".repeat(40));
  assert.deepEqual(result.calls[2], ["mode", "session-one", "trust_reads"]);
  assert.deepEqual(result.observations.folders, {
    Avoozl: true,
    "Avoozl/app": true,
  });
});

test("a missing project or unsupported remote dispatch refuses without opening locally", () => {
  assert.deepEqual(
    run(`
ctx.folders = []
args = e.arguments({"task": "task-one", "folder": "Avoozl/app", "title": "one", "brief": "Work"})
try: e.start(*args)
except m.StartRefused: pass
print(json.dumps(calls))`),
    [],
  );
  assert.deepEqual(
    run(`
def unsupported(name, folder_id="", agent="", model=""):
    calls.append(["local-open"])
ctx.open_session = unsupported
args = e.arguments({"task": "task-one", "title": "one", "brief": "Work", "crew": "remote", "project": False})
try: e.start(*args)
except m.StartRefused: pass
print(json.dumps(calls))`),
    [],
  );
});

test("two prepared requests retain their own private configuration", () => {
  const result = run(`
a = e.arguments({"task": "one", "title": "first", "brief": "A", "project": False, "agent": "agent-a"})
b = e.arguments({"task": "two", "title": "second", "brief": "B", "project": False, "agent": "agent-b"})
e.start(*a); e.start(*b)
print(json.dumps([row for row in calls if row[0] == "open"]))`);
  assert.deepEqual(
    result.map((row) => [row[1], row[2].agent]),
    [
      ["first", "agent-a"],
      ["second", "agent-b"],
    ],
  );
});

test("a binding failure leaves the opened session unsent", () => {
  assert.deepEqual(
    run(`
def refuse(binding): raise RuntimeError("binding refused")
e._bind = refuse
args = e.arguments({"task": "one", "title": "first", "brief": "A", "project": False})
try: e.start(*args)
except RuntimeError: pass
print(json.dumps([row[0] for row in calls]))`),
    ["open"],
  );
});

test("status preserves the shared vocabulary and raw observations retain terminal detail", () => {
  const result = run(`
out = []
for state in ("working", "idle", "queued", "closed", "lost", "gone", "exited 0", "exited -15"):
    ctx.roster = {"sessions": [{"target": "one", "status": state}]}
    out.append([state, e.status("one"), e.observations()["sessions"][0]["status"]])
ctx.roster = {"sessions": []}
out.append(["absent", e.status("one")])
print(json.dumps(out))`);
  assert.deepEqual(result, [
    ["working", "working", "working"],
    ["idle", "idle", "idle"],
    ["queued", "working", "queued"],
    ["closed", "gone", "closed"],
    ["lost", "gone", "lost"],
    ["gone", "gone", "gone"],
    ["exited 0", "exited 0", "exited 0"],
    ["exited -15", "exited -15", "exited -15"],
    ["absent", "gone"],
  ]);
});

test("an unavailable, malformed or unknown roster never becomes gone", () => {
  const result = run(`
out = []
for response in ({}, {"sessions": False}, {"sessions": None}, {"ok": False}, {"sessions": "bad"}, {"sessions": [{"target": "one"}]}, {"sessions": [{"target": "one", "status": "unknown"}]}, {"sessions": [{"target": "one", "status": "exited 9007199254740992"}]}):
    ctx.roster = response
    try: out.append(e.status("one"))
    except m.ObservationUnavailable: out.append("unavailable")
def unreadable(): raise RuntimeError("gateway unavailable")
ctx.session_status = unreadable
try: out.append(e.status("one"))
except m.ObservationUnavailable: out.append("unavailable")
ctx.session_status = None
try: out.append(e.status("one"))
except m.ObservationUnavailable: out.append("unavailable")
print(json.dumps(out))`);
  assert.deepEqual(result, Array(10).fill("unavailable"));
});

test("the cron contains orchestration but no native session or project calls", () => {
  const source = fs.readFileSync(
    new URL("../../../../hosts/kirocrew/crons/tick.py", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /\.(open_session|send_to_session|set_session_mode|list_session_folders|create_session_folder)\b|folder_id|project_dir/,
  );
});

test("the installed adapter reads its shipped contract without a source checkout", () => {
  const app = path.join(
      temporaryDirectory("avoozl-installed-executor-"),
      "app",
    ),
    file = path.join(app, "executors", "kirocrew.py"),
    contract = path.join(app, "bin", "lib", "src", "executor-contract.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.dirname(contract), { recursive: true });
  fs.copyFileSync(adapter, file);
  fs.writeFileSync(contract, JSON.stringify(EXECUTOR_CONTRACT));
  const actual = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('adapter',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.CONTRACT))",
        file,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    ),
  );
  assert.deepEqual(actual, EXECUTOR_CONTRACT);
});

test("a lane chat opens once by its header, is cleared before each later task, and waits while busy", () => {
  // Nearby inputs: a lane with no chat yet, a known lane chat that clears,
  // one with a turn running (409), one Kiro Crew no longer has (404), and a
  // reviewer lane, which gets trust like a worker lane.
  const result = run(`
resets = []
answers = []
def _post(path, body):
    resets.append([path, body])
    return answers.pop(0) if answers else {"slot": "x", "reset": True}
ctx._post = _post
lane = {"id": "worker-1", "header": "Avoozl · ws · worker 1"}
d = {"task": "one", "role": "worker", "title": "avoozl:one", "folder": "Avoozl/app", "project": False, "brief": "A", "lane": lane}
first = e.start(*e.arguments(d))
second = e.start(*e.arguments({**d, "task": "two", "brief": "B", "lane": {**lane, "slot": "session-one"}}))
answers.append({"error": "HTTP 409", "status_code": 409, "code": "turn_in_flight"})
try:
    e.start(*e.arguments({**d, "task": "three", "lane": {**lane, "slot": "session-one"}}))
    busy = False
except m.StartRefused as refusal:
    busy = refusal.before_open
answers.append({"error": "HTTP 404", "status_code": 404})
gone = e.start(*e.arguments({**d, "task": "four", "lane": {**lane, "slot": "old"}}))
review = e.start(*e.arguments({**d, "task": "five", "role": "review:review", "lane": {"id": "reviewer-1", "header": "Avoozl · ws · reviewer", "slot": "session-r"}}))
print(json.dumps({"calls": calls, "resets": resets, "busy": busy, "slots": [first, second, gone, review]}))`);
  // The first task opens the chat by its header in the lane folder.
  assert.deepEqual(result.calls[0], [
    "open",
    "Avoozl · ws · worker 1",
    { folder_id: "child", agent: "" },
  ]);
  const binds = result.calls.filter((row) => row[0] === "bind");
  assert.deepEqual(
    binds.map((row) => [row[1].taskId, row[1].slot, row[1].lane]),
    [
      ["one", "session-one", "worker-1"],
      ["two", "session-one", "worker-1"],
      ["four", "session-one", "worker-1"],
      ["five", "session-r", "reviewer-1"],
    ],
  );
  assert.equal(binds[0][1].title, "Avoozl · ws · worker 1");
  // Every later task clears the known chat with replay off; the first
  // reset follows the open of a header Kiro Crew may already hold.
  assert.deepEqual(
    result.resets.map(([route, body]) => [route, body]),
    [
      ["/api/chat/slots/session-one/reset-conversation", { replay: false }],
      ["/api/chat/slots/session-one/reset-conversation", { replay: false }],
      ["/api/chat/slots/session-one/reset-conversation", { replay: false }],
      ["/api/chat/slots/old/reset-conversation", { replay: false }],
      ["/api/chat/slots/session-one/reset-conversation", { replay: false }],
      ["/api/chat/slots/session-r/reset-conversation", { replay: false }],
    ],
  );
  assert.equal(result.busy, true, "a busy lane chat releases the request");
  assert.equal(
    result.calls.filter((row) => row[0] === "open").length,
    2,
    "only a lane with no known chat, or a gone one, opens",
  );
  assert.deepEqual(
    result.calls
      .filter((row) => row[0] === "mode")
      .map((row) => [row[1], row[2]]),
    [
      ["session-one", "trust"],
      ["session-one", "trust"],
      ["session-one", "trust"],
      ["session-r", "trust"],
    ],
  );
});

test("the cron keeps trust on a reviewer lane chat as on a worker chat", () => {
  const result = run(`
e.keep_trust([{"slot": "w", "role": "worker"}, {"slot": "r", "role": "review:review", "lane": "reviewer-1"}, {"slot": "v", "role": "verifier"}])
print(json.dumps(calls))`);
  assert.deepEqual(result, [
    ["mode", "w", "trust"],
    ["mode", "r", "trust"],
  ]);
});

test("a review round on the same task continues in its lane chat with no clear", () => {
  const result = run(`
resets = []
ctx._post = lambda path, body: resets.append(path) or {"reset": True}
d = {"task": "one", "role": "worker", "title": "avoozl:one", "folder": "Avoozl/app", "project": False, "brief": "Round 2", "attempt": 2, "lane": {"id": "worker-1", "header": "h", "slot": "lane-chat", "resume": True}}
slot = e.start(*e.arguments(d))
print(json.dumps({"slot": slot, "resets": resets, "kinds": [row[0] for row in calls]}))`);
  assert.deepEqual(result, {
    slot: "lane-chat",
    resets: [],
    kinds: ["bind", "mode", "send"],
  });
});
