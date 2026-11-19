import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Operations } from "../operations.mjs";
import { groupedCall } from "../mcp-tools.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import {
  kirocrewRequest,
  persistKirocrewConfiguration,
} from "../executors/kirocrew.mjs";
import { fixture } from "./fixtures.mjs";

const cronPath = fileURLToPath(
  new URL("../../../kirocrew-app/crons/tick.py", import.meta.url),
);
async function cron(ops, intents, { mode = "normal" } = {}) {
  const child = spawn(
    "python3",
    [
      "-c",
      `
import importlib.util,json,sys
s=importlib.util.spec_from_file_location("tick",sys.argv[1]); tick=importlib.util.module_from_spec(s); s.loader.exec_module(tick)
mode=sys.argv[2]
def emit(event): print(json.dumps(event),flush=True)
class Ctx:
    def session_status(self): return {"sessions":[]}
    def list_session_folders(self): return []
    def create_session_folder(self,name,parent_id=""): return {"id":"f","name":name,"parent_id":parent_id}
    def call_tool(self,server,tool,args):
        emit({"rpc":tool,"args":args}); return sys.stdin.readline().strip()
    def open_session(self,name,**args):
        emit({"event":"open","name":name,"args":args})
        if mode=="open-error": raise RuntimeError("the open response was lost")
        return "slot-native"
    def send_to_session(self,slot,text): emit({"event":"send","slot":slot,"text":text}); return {"ok":True}
try: tick.run(Ctx()); emit({"event":"finished"})
except tick.Skip: emit({"event":"skipped"})
except Exception as error: emit({"event":"error","text":str(error)})
`,
      cronPath,
      mode,
    ],
    {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const lines = readline.createInterface({ input: child.stdout }),
    events = [],
    calls = [];
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(stderr || `Python exited ${code}`)),
    );
  });
  try {
    for await (const line of lines) {
      const value = JSON.parse(line);
      if (!value.rpc) {
        if (value.event === "send")
          assert.ok(
            ops.store.get("session_bindings", value.slot),
            "bind must commit before the first brief",
          );
        events.push(value);
        continue;
      }
      calls.push(value);
      let result;
      if (value.rpc === "plans_maintain") result = intents;
      else if (value.rpc === "plans_session")
        result = await ops.execute(
          "session.bind",
          value.args.input,
          undefined,
          { caller: { sessionKey: "cron:transport" } },
        );
      else {
        const route = groupedCall(value.rpc, value.args);
        assert.ok(route?.operation);
        result = await ops.execute(route.operation, route.input, undefined, {
          mcp: true,
          caller: { sessionKey: "cron:transport" },
        });
      }
      child.stdin.write(JSON.stringify(result) + "\n");
    }
    await done;
  } catch (error) {
    child.kill();
    await done.catch(() => {});
    throw error;
  }
  return { events, calls };
}

function setup(t, project = false) {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  const request = kirocrewRequest(store, {
    executor: "kirocrew",
    task: "sample-task",
    role: "worker",
    title: "avoozl:sample-task",
    brief: "Synthetic brief",
    model: "fake-model",
    worktree: null,
    folder: project ? "Avoozl/app" : "",
    project,
    agent: "synthetic-agent",
  });
  persistKirocrewConfiguration(store, request);
  return { store, ops, request };
}

test("the production cron consumes only native starts/messages and stale replay is harmless", async (t) => {
  const { store, ops, request } = setup(t),
    transport = enqueueSessionRequests(store, {
      starts: [request, { ...request, id: undefined, executor: "process" }],
      sends: [
        {
          executor: "kirocrew",
          slot: "slot-native",
          text: "Synthetic feedback",
        },
        { executor: "process", slot: "foreign", text: "Foreign feedback" },
      ],
    });
  const processStart = store.get("session_requests", transport.starts[1].id),
    processSend = store.get("session_requests", transport.sends[1].id),
    intents = {
      dispatch: transport.starts,
      messages: transport.sends,
      notify: [],
    };
  const first = await cron(ops, intents);
  assert.deepEqual(
    first.events
      .filter((event) => event.event === "send")
      .map((event) => event.text),
    ["Synthetic brief", "Synthetic feedback"],
  );
  assert.equal(
    first.events.find((event) => event.event === "open").args.agent,
    "synthetic-agent",
  );
  const replay = await cron(ops, intents);
  assert.ok(
    replay.events.every((event) => !["open", "send"].includes(event.event)),
  );
  assert.deepEqual(
    store.get("session_requests", processStart.id),
    processStart,
  );
  assert.deepEqual(store.get("session_requests", processSend.id), processSend);
});

test("only a definitive pre-open refusal releases a start; an uncertain open stays claimed", async (t) => {
  const before = setup(t, true),
    queued = enqueueSessionRequests(before.store, { starts: [before.request] })
      .starts[0];
  const refused = await cron(before.ops, {
    dispatch: [queued],
    messages: [],
    notify: [],
  });
  assert.equal(
    refused.events.some((event) => event.event === "open"),
    false,
  );
  assert.equal(
    before.store.get("session_requests", queued.id).state,
    "pending",
  );
  const after = setup(t),
    request = enqueueSessionRequests(after.store, { starts: [after.request] })
      .starts[0];
  const uncertain = await cron(
    after.ops,
    { dispatch: [request], messages: [], notify: [] },
    { mode: "open-error" },
  );
  assert.ok(uncertain.events.some((event) => event.event === "error"));
  assert.equal(
    after.store.get("session_requests", request.id).state,
    "claimed",
  );
  const replay = await cron(after.ops, {
    dispatch: [request],
    messages: [],
    notify: [],
  });
  assert.equal(
    replay.events.some((event) => event.event === "open"),
    false,
  );
});
