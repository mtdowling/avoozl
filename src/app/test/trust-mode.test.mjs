import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Requirement 88.1, task 40.3: a fake Kiro Crew that drops every chat's mode
// on restart. tick.py sets a worker chat's trust mode when it opens it and
// again on the next tick, once per chat, through the kirocrew executor.
const cronPath = fileURLToPath(
  new URL("../../../kirocrew-app/crons/tick.py", import.meta.url),
);
const ticks = (steps) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import importlib.util, json, sys
s = importlib.util.spec_from_file_location("tick", sys.argv[1])
tick = importlib.util.module_from_spec(s); s.loader.exec_module(tick)
class Crew:
    def __init__(self): self.open, self.modes, self.calls = [], {}, []
    def restart(self): self.modes.clear()
crew = Crew()
class Ctx:
    def __init__(self, intents): self.intents = intents
    def session_status(self): return {"sessions": [{"target": t, "status": "idle"} for t in crew.open]}
    def list_session_folders(self): return []
    def create_session_folder(self, name, parent_id=""): return {"id": name, "name": name}
    def call_tool(self, server, tool, args):
        return json.dumps(self.intents if tool == "plans_maintain" else {"ok": True})
    def open_session(self, name, **kwargs):
        crew.open.append("slot-%d" % (len(crew.open) + 1)); return crew.open[-1]
    def send_to_session(self, slot, text): return {"ok": True}
    def set_session_mode(self, slot, mode):
        crew.calls.append([slot, mode]); crew.modes[slot] = mode
out = []
for step in json.loads(sys.argv[2]):
    if step == "restart":
        crew.restart(); out.append({"restart": crew.modes.copy()}); continue
    crew.calls = []
    try: tick.run(Ctx(step))
    except tick.Skip: pass
    out.append({"calls": crew.calls, "modes": crew.modes.copy()})
print(json.dumps(out))
`,
        cronPath,
        JSON.stringify(steps),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    ),
  );

const start = (task, role, extra = {}) => ({
  task,
  role,
  title: `avoozl:${task}`,
  brief: "Synthetic brief",
  project: false,
  ...extra,
});

test("a worker chat is trusted at open and again on the tick after a restart, once per chat", () => {
  const [opened, restarted, next, later] = ticks([
    { dispatch: [start("a", "worker"), start("b", "verifier")] },
    "restart",
    {
      observe: [
        { slot: "slot-1", taskId: "a", role: "worker" },
        { slot: "slot-1", taskId: "a", role: "worker" },
        { slot: "slot-2", taskId: "b", role: "verifier" },
      ],
    },
    {
      observe: [{ slot: "slot-1", taskId: "a", role: "worker" }],
      dispatch: [start("c", "worker")],
    },
  ]);
  assert.deepEqual(opened.calls, [["slot-1", "trust"]]);
  assert.deepEqual(restarted.restart, {});
  assert.deepEqual(next.calls, [["slot-1", "trust"]]);
  assert.deepEqual(next.modes, { "slot-1": "trust" });
  assert.deepEqual(later.calls, [
    ["slot-1", "trust"],
    ["slot-3", "trust"],
  ]);
});

test("a runner-mode worker keeps its own opt-in mode", () => {
  const [run] = ticks([
    {
      dispatch: [
        start("off", "worker", { remote: true }),
        start("reads", "worker", { remote: true, mode: "trust_reads" }),
      ],
    },
  ]);
  assert.deepEqual(run.calls, [["slot-2", "trust_reads"]]);
});
