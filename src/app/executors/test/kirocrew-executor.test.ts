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
// What the Python fake records: an open, a bind, a mode change or a send.
interface Binding {
  taskId?: string;
  slot?: string;
  lane?: string;
  title?: string;
  attempt?: number;
  commit?: string;
}
type Open = ["open", string, Record<string, string>];
type Bind = ["bind", Binding];
type Call = Open | Bind | ["mode", string, string] | ["send", string, string];
const isBind = (row: Call): row is Bind => row[0] === "bind";
const isOpen = (row: Call): row is Open => row[0] === "open";

// Run `body` against the adapter and parse what it prints as T.
const run = <T>(body: string): T =>
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
    def call_tool(self, server, tool, arguments):
        calls.append(["tool", server, tool, arguments])
        request = arguments.get("input", {})
        return json.dumps({
            "request": {
                "id": request.get("id"),
                "version": request.get("version"),
                "executor": "kirocrew",
                "task": "task-one",
                "role": "worker",
                "title": "avoozl:task-one work",
                "brief": "Do the work",
                "worktree": None,
                "model": "model-one",
                "permissionClass": "write",
            },
            "claimToken": "claim-one",
            "configuration": {
                "folder": "Avoozl/app",
                "agent": "worker-agent",
            },
        })
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
  const methods = run<Record<string, string[]>>(
    `print(json.dumps({name: list(inspect.signature(getattr(e, name)).parameters) for name in ("start", "send", "status")}))`,
  );
  for (const name of ["start", "send", "status"] as const)
    assert.deepEqual(methods[name], EXECUTOR_CONTRACT[name]);
});

test("the real adapter inherits a project and binds before mode and first message", () => {
  const result = run<{
    slot: string;
    calls: Call[];
    observations: { folders: Record<string, boolean> };
  }>(`
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
  const [[, binding]] = result.calls.filter(isBind);
  assert.equal(binding.attempt, 2);
  assert.equal(binding.commit, "a".repeat(40));
  assert.deepEqual(result.calls[2], ["mode", "session-one", "trust_reads"]);
  assert.deepEqual(result.observations.folders, {
    Avoozl: true,
    "Avoozl/app": true,
  });
});

test("the real adapter carries a dispatch's workspace through take and bind", () => {
  const result = run(`
d = {
    "id": "start:one",
    "version": "version-one",
    "_avoozlWorkspaceId": "workspace-two",
    "task": "task-one",
    "role": "worker",
    "title": "avoozl:task-one work",
    "brief": "Do the work",
}
e.start(*e.arguments(d))
print(json.dumps(calls))`);
  const take = result.find(
    (row) => row[0] === "tool" && row[2] === "plans_executor",
  );
  assert.equal(take[3].input._avoozlWorkspaceId, "workspace-two");
  const bind = result.find((row) => row[0] === "bind");
  assert.equal(bind[1]._avoozlWorkspaceId, "workspace-two");
});

test("a title owned by an old cron opens under a stable recovery title", () => {
  const result = run(`
original_open = ctx.open_session
def ownership_aware(name, **kwargs):
    if name == "avoozl:task-one work":
        calls.append(["open", name, kwargs])
        raise RuntimeError("HTTP 403: not_creator")
    return original_open(name, **kwargs)
ctx.open_session = ownership_aware
d = {
    "id": "start:one",
    "version": "version-one",
    "task": "task-one",
    "role": "worker",
    "title": "avoozl:task-one work",
    "brief": "Do the work",
}
slot = e.start(*e.arguments(d))
print(json.dumps({"slot": slot, "calls": calls}))`);
  assert.equal(result.slot, "session-one");
  const opens = result.calls.filter((row) => row[0] === "open");
  assert.equal(opens.length, 2);
  assert.equal(opens[0][1], "avoozl:task-one work");
  assert.match(opens[1][1], /^avoozl:task-one work retry-[0-9a-f]{8}$/);
  assert.equal(
    result.calls.find((row) => row[0] === "bind")[1].title,
    opens[1][1],
  );
  assert.doesNotMatch(opens[1][1], /claim-one/);
});

test("a lane title owned by an old cron opens a replacement lane chat", () => {
  const result = run(`
original_open = ctx.open_session
header = "Avoozl · workspace · worker 1"
def ownership_aware(name, **kwargs):
    if name == header:
        calls.append(["open", name, kwargs])
        raise RuntimeError("HTTP 403: not_creator")
    return original_open(name, **kwargs)
ctx.open_session = ownership_aware
ctx._post = lambda path, body: {"reset": True}
d = {
    "id": "start:one",
    "version": "version-one",
    "_claim": "claim-one",
    "task": "task-one",
    "role": "worker",
    "title": "avoozl:task-one work",
    "brief": "Do the work",
    "project": False,
    "lane": {"id": "worker-1", "header": header},
}
e._requests[("worker", "task-one")] = d
slot = e.start("worker", "task-one", None, "Do the work", None, "write")
print(json.dumps({"slot": slot, "calls": calls}))`);
  assert.equal(result.slot, "session-one");
  const opens = result.calls.filter((row) => row[0] === "open");
  assert.equal(opens.length, 2);
  assert.equal(opens[0][1], "Avoozl · workspace · worker 1");
  assert.match(
    opens[1][1],
    /^Avoozl · workspace · worker 1 retry-[0-9a-f]{8}$/,
  );
  const binding = result.calls.find((row) => row[0] === "bind")[1];
  assert.equal(binding.title, "Avoozl · workspace · worker 1");
  assert.equal(binding.lane, "worker-1");
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
  const result = run<Open[]>(`
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
  const result = run<string[][]>(`
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
  const result = run<string[]>(`
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
  const result = run<{
    calls: Call[];
    resets: [string, unknown][];
    busy: boolean;
    slots: string[];
  }>(`
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
  const binds = result.calls.filter(isBind);
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
    result.calls.filter(isOpen).length,
    2,
    "only a lane with no known chat, or a gone one, opens",
  );
  assert.deepEqual(
    result.calls.flatMap((row) =>
      row[0] === "mode" ? [[row[1], row[2]]] : [],
    ),
    [
      ["session-one", "trust"],
      ["session-one", "trust"],
      ["session-one", "trust"],
      ["session-r", "trust"],
    ],
  );
});

test("the cron keeps trust on a reviewer lane chat as on a worker chat", () => {
  const result = run<Call[]>(`
e.keep_trust([{"slot": "w", "role": "worker"}, {"slot": "r", "role": "review:review", "lane": "reviewer-1"}, {"slot": "v", "role": "verifier"}])
print(json.dumps(calls))`);
  assert.deepEqual(result, [
    ["mode", "w", "trust"],
    ["mode", "r", "trust"],
  ]);
});

test("a review round on the same task continues in its lane chat with no clear", () => {
  const result = run<{ slot: string; resets: string[]; kinds: string[] }>(`
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
