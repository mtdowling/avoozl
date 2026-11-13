// Demo mode (Requirement 75, design §6.11): the sample installs once and
// all at once, keeps edits on a second start, answers every change with a
// preview, never writes to GitHub or starts an agent, and leaves the
// person's own workspace and settings exactly as they were.
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { APP_OPERATIONS, startAppBackend } from "../app-backend.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import {
  DEMO_RECEIPT,
  DEMO_WORKSPACE_ID,
  GITHUB_WRITE_METHODS,
  buildDemo,
  demoGitHub,
  demoOperations,
  demoReceipt,
  installDemo,
} from "../demo.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

// One sample for the read-only tests; each test that edits builds its own.
let shared = null;
async function sample() {
  shared ||= (await installDemo(path.join(temporaryDirectory(), "demo"))).root;
  return shared;
}

const observe = (name) => {
  try {
    return classifyOperation(name) === "observe";
  } catch {
    return false;
  }
};

test("the sample has an epic, specs, phases, states, GitHub and history", async () => {
  const demo = demoOperations(await sample());
  try {
    const data = demo.store.read(),
      status = (id) => data.tasks.find((t) => t.id === id)?.status;
    assert.deepEqual(
      data.epics.map((e) => [e.id, e.plans]),
      [["recipe-box", ["recipe-import", "meal-planner", "shopping-list"]]],
    );
    assert.equal(data.tasks.length, 10);
    assert.ok(data.tasks.every((t) => t.phase?.id));
    assert.equal(status("recipe-import.1.1"), "accepted");
    assert.equal(status("shopping-list.1.2"), "blocked");
    assert.equal(
      data.tasks.find((t) => t.id === "recipe-import.2.2").completion,
      "answered",
    );
    assert.ok(data.tasks.every((t) => t.github?.number));
    const graph = await demo.execute("graph.view", {});
    assert.ok(graph.tasks.some((t) => t.ready));
    const draft = (await demo.execute("plan.specs", {})).items.find(
      (s) => s.name === "pantry-photos",
    );
    assert.equal(draft.plan.approved, false);
    assert.equal((await demo.execute("intake.list", {})).total, 3);
    assert.equal((await demo.execute("lessons.view", {})).lessons.length, 2);
    assert.ok((await demo.execute("activity.list", {})).items.length >= 8);
    assert.ok(
      (await demo.execute("conflicts.view", {})).items.some(
        (i) => i.kind === "decision",
      ),
    );
    const flow = await demo.execute("flow.view", {});
    assert.ok(JSON.stringify(flow).includes("recipe-import.1.1"));
    const delivery = await demo.execute("delivery.view", {});
    assert.match(JSON.stringify(delivery), /example\/recipe-box\/pull\/22/);
    // Stored paths name the final folder, never the staging one.
    const dump = fs.readFileSync(demoConfigPath(await sample()), "latin1");
    assert.doesNotMatch(dump, /\.staging-/);
  } finally {
    demo.close();
  }
});

const demoConfigPath = (root) =>
  path.join(root, ".avoozl", "local", "workspace.sqlite");

test("install is once: a second start keeps the sample and its edits", async () => {
  const root = path.join(temporaryDirectory(), "demo"),
    first = await installDemo(root);
  assert.equal(first.existing, false);
  const demo = demoOperations(root);
  demo.store.mutate("Edit the sample", (data) => {
    data.tasks.find((t) => t.id === "meal-planner.1.2").title = "Edited";
  });
  demo.close();
  const second = await installDemo(root);
  assert.equal(second.existing, true);
  assert.deepEqual(second.receipt, first.receipt);
  const again = demoOperations(root);
  try {
    assert.equal(
      again.store.read().tasks.find((t) => t.id === "meal-planner.1.2").title,
      "Edited",
    );
  } finally {
    again.close();
  }
});

test("a failed install leaves nothing, and the next start builds it whole", async () => {
  const parent = temporaryDirectory(),
    root = path.join(parent, "demo");
  await assert.rejects(
    installDemo(root, {
      build: async (staging, options) => {
        await buildDemo(staging, options);
        throw Error("power cut");
      },
    }),
    /power cut/,
  );
  assert.deepEqual(fs.readdirSync(parent), []);
  assert.equal(demoReceipt(root), null);
  const done = await installDemo(root);
  assert.equal(done.existing, false);
  assert.equal(done.receipt.id, DEMO_RECEIPT);
  assert.deepEqual(fs.readdirSync(parent), ["demo"]);
});

test("a folder in the way is never overwritten", async () => {
  const root = path.join(temporaryDirectory(), "demo");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "keep.txt"), "mine");
  await assert.rejects(installDemo(root), /holds no finished demo/);
  assert.equal(fs.readFileSync(path.join(root, "keep.txt"), "utf8"), "mine");
});

test("every change previews; no GitHub write or agent start is reachable", async () => {
  const demo = demoOperations(await sample());
  try {
    const before = fs.readFileSync(demoConfigPath(await sample())),
      rows = () =>
        ["session_bindings", "session_requests", "app_notifications"].map(
          (kind) => demo.store.list(kind).length,
        ),
      startRows = rows();
    const changes = [...APP_OPERATIONS].filter((name) => !observe(name));
    assert.ok(changes.includes("workspace.tick"));
    assert.ok(changes.includes("task.start"));
    for (const name of changes)
      await assert.rejects(
        demo.execute(name, { id: "recipe-import.2.1", taskId: "x" }),
        (error) =>
          error.demo === true &&
          error.status === 409 &&
          /^Demo mode: in your own workspace this would .+\. Nothing changed here\.$/.test(
            error.message,
          ),
        name,
      );
    // Reads run against the sample and the fake GitHub only.
    for (const name of [...APP_OPERATIONS].filter(observe))
      await demo.execute(name, {}).catch(() => undefined);
    const writes = demo.github.calls.filter((name) =>
      GITHUB_WRITE_METHODS.includes(name),
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(rows(), startRows);
    assert.ok(fs.readFileSync(demoConfigPath(await sample())).length > 0);
    assert.ok(before.length > 0);
  } finally {
    demo.close();
  }
});

test("the fake GitHub refuses every write and any method it does not know", async () => {
  const github = demoGitHub();
  for (const name of [...GITHUB_WRITE_METHODS, "somethingNew"])
    await assert.rejects(github[name]("example/recipe-box", 1), (error) => {
      return error.demo === true && /wrote nothing/.test(error.message);
    });
  const subs = await github.listSubIssues("example/recipe-box", 1);
  assert.equal(subs.length, 10);
  const pulls = await github.listPullRequests("example/recipe-box");
  assert.deepEqual(
    pulls.map((p) => [p.number, p.checks.map((c) => c.conclusion).join()]),
    [
      [20, "SUCCESS"],
      [21, "SUCCESS"],
      [22, "FAILURE,SUCCESS"],
      [23, ""],
    ],
  );
  assert.equal((await github.projectItems()).length, 13);
});

const SECRET = "test-proxy-secret";
function sign(body) {
  const issuedAt = Math.floor(Date.now() / 1000),
    claim = {
      issuedAt,
      kind: "owner-session",
      ownerId: "owner",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"),
    signature = createHmac("sha256", SECRET)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(issuedAt),
          "POST",
          "/api/command",
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

// Every file under `dir`, with its hash.
function hashes(dir) {
  const out = {};
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        out[path.relative(dir, file)] = createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

test("the demo never touches the real workspace, catalog or settings", async (t) => {
  const root = temporaryDirectory(),
    served = path.join(root, "served"),
    machine = path.join(root, "machine"),
    env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  initializeWorkspace(served, { name: "Real work" });
  const server = startAppBackend({
    config: workspaceConfig({ workspace: served, env }),
    secret: SECRET,
    registryOptions: {
      configPath: path.join(machine, "config.json"),
      catalogPath: path.join(machine, "catalog.sqlite"),
    },
    demoRoot: path.join(root, "tmp", "demo"),
    notifier: null,
    slotReader: null,
    rowReader: null,
    usageReader: null,
    modelSwitcher: null,
    crewReader: null,
    sessionStopper: null,
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (operation, input = {}, workspaceId) => {
    const body = JSON.stringify({ operation, input, workspaceId }),
      response = await fetch(base + "/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KiroCrew-Principal": sign(body),
        },
        body,
      });
    return { status: response.status, body: await response.json() };
  };
  // The real workspace has one task and a read before the demo opens.
  assert.equal((await call("graph.view")).status, 200);
  const realFiles = () => ({
    served: hashes(served),
    machine: hashes(machine),
    config: hashes(path.join(root, "config")),
  });
  const before = realFiles();
  assert.ok(Object.keys(before.served).some((f) => f.endsWith(".sqlite")));
  assert.ok(Object.keys(before.served).includes(".avoozl.json"));

  assert.equal((await call("graph.view", {}, DEMO_WORKSPACE_ID)).status, 409);
  const started = await call("demo.start");
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.result.workspaceId, DEMO_WORKSPACE_ID);
  const graph = await call("graph.view", {}, DEMO_WORKSPACE_ID);
  assert.equal(graph.status, 200);
  assert.equal(graph.body.result.tasks.length, 10);
  for (const [operation, input] of [
    ["workspace.tick", {}],
    ["task.start", { taskId: "meal-planner.1.2" }],
    ["flow.stop", { scope: "all", reason: "demo" }],
    ["github.setup", {}],
    ["plan.approve", { id: "pantry-photos" }],
    ["intake.plan", {}],
  ]) {
    const reply = await call(operation, input, DEMO_WORKSPACE_ID);
    assert.equal(reply.status, 409, operation);
    assert.equal(reply.body.demo, true, operation);
    assert.match(reply.body.error, /^Demo mode:/, operation);
  }
  assert.equal((await call("demo.start")).body.result.existing, true);
  assert.equal((await call("demo.exit")).body.result.active, false);
  assert.equal((await call("graph.view", {}, DEMO_WORKSPACE_ID)).status, 409);
  // Exit returns to the real workspace, unchanged to the byte.
  assert.deepEqual(realFiles(), before);
  assert.equal((await call("graph.view")).status, 200);
  // The demo's own catalog entry never reaches the machine catalog.
  const listed = (await call("workspaces.list")).body.result;
  assert.ok(!listed.items.some((w) => w.id === DEMO_WORKSPACE_ID));
});
