import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { Operations } from "../operations.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { Store } from "../store.mjs";
import { recordPlanReviewWriter } from "../plan-review-authorship.mjs";
import { mcpRefusal, cliRefusal } from "../mcp-policy.mjs";
import { NARROW_TOOLS, handleMcp } from "../mcp.mjs";
import { groupedCall } from "../mcp-tools.mjs";
const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const plan = {
  id: "p",
  spec: "synthetic",
  hash: "h",
  state: "draft",
  files: { "design.md": "x" },
};

test("current revision reads exclude old findings, and MCP aliases preserve bound answer enforcement", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  store.put("plans", plan);
  store.put("review_threads", {
    id: "old",
    source: "plan-review",
    planId: "p",
    revisionHash: "old",
  });
  store.put("review_threads", {
    id: "current",
    source: "plan-review",
    planId: "p",
    revisionHash: "h",
  });
  assert.deepEqual(
    (await ops.execute("plan.review.get", { spec: "synthetic" })).findings.map(
      (f) => f.id,
    ),
    ["current"],
  );
  assert.equal(NARROW_TOOLS.plans_plan_review[0], "plan.review.findings");
  assert.equal(NARROW_TOOLS.plans_answer_review[0], "plan.review.answer");
  assert.equal(
    groupedCall("plans_review", { action: "answer", input: {} }).operation,
    "plan.review.answer",
  );
  const result = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "plans_answer_review",
        arguments: { input: { planId: "p", roundId: "r", answers: [] } },
      },
    },
    ops,
  );
  assert.equal(result.body.result.isError, true);
  assert.match(JSON.stringify(result.body.result), /Only the bound planner/);
  assert.match(
    mcpRefusal("plan.review.decide", { action: "review", unproven: true }),
    /Only a person/,
  );
  assert.match(
    cliRefusal("plan.review.decide", {}, { env: { AVOOZL_CHILD: "1" } }),
    /supervisor started/,
  );
});
test("CLI reads current review and queues an inherited reviewer only as a person; known same model is refused", () => {
  const root = temporaryDirectory("avoozl-review-cli-"),
    xdg = temporaryDirectory("avoozl-review-config-");
  const config = initializeWorkspace(root, { name: "test" }),
    db = config.dbPath || path.join(root, ".avoozl/local/workspace.sqlite");
  fs.mkdirSync(path.join(xdg, "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(xdg, "avoozl", "config.json"),
    JSON.stringify({
      version: 1,
      roles: { planReviewer: { model: "fake-reviewer" } },
      planReview: { mode: "auto" },
    }),
  );
  const store = new Store(db);
  store.put("plans", plan);
  store.close();
  const run = (args, env = {}) =>
    spawnSync(
      process.execPath,
      [cli, "plan", "review", "synthetic", "--workspace", root, ...args],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          XDG_CONFIG_HOME: xdg,
          KIROCREW_SPAWNED: "",
          KIRO_SESSION_ID: "",
          ...env,
        },
      },
    );
  const read = run(["--json"]);
  assert.equal(read.status, 0, read.stderr);
  assert.equal(JSON.parse(read.stdout).revisionHash, "h");
  const child = run(["--start"], { AVOOZL_CHILD: "1" });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /supervisor started/);
  const start = run(["--start", "--json"]);
  assert.equal(start.status, 0, start.stderr);
  assert.equal(JSON.parse(start.stdout).queued.unproven, true);
  const history = new Store(db);
  history.put("review_rounds", {
    id: "older-skip",
    planId: "p",
    spec: "synthetic",
    revisionHash: "h",
    state: "skipped",
    pass: 1,
    round: 1,
    reviewerModel: "fake-reviewer",
    writerModel: null,
  });
  history.close();
  for (const state of ["running", "done"]) {
    const seeded = new Store(db);
    seeded.put("review_rounds", {
      id: "existing",
      planId: "p",
      spec: "synthetic",
      revisionHash: "h",
      state,
      pass: 2,
      round: 1,
      reviewerModel: "fake-reviewer",
    });
    const choices = seeded.list("receipts").length;
    seeded.close();
    const repeated = run(["--start", "--json"]);
    assert.equal(repeated.status, 0, repeated.stderr);
    const value = JSON.parse(repeated.stdout);
    assert.equal(value.queued, undefined);
    assert.equal(value.start.state, state);
    assert.equal(value.start.existing, true);
    assert.doesNotMatch(run(["--start"]).stdout, /Review queued/);
    assert.match(
      run(["--start"], { AVOOZL_CHILD: "1" }).stderr,
      /supervisor started/,
    );
    const unchanged = new Store(db);
    assert.equal(unchanged.list("receipts").length, choices);
    unchanged.close();
  }
  const same = new Store(db);
  same.db.prepare("DELETE FROM review_rounds").run();
  same.put("session_bindings", {
    id: "writer",
    slot: "writer",
    role: "planner",
    taskId: "draft",
    status: "idle",
    served: { model: "fake-reviewer" },
  });
  recordPlanReviewWriter(same, plan, {
    caller: { sessionKey: "dashboard:writer" },
  });
  same.close();
  const refused = run(["--start"]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /same as/);
});

test("the public answer tool accepts only the bound planner and leaves disposition to the person", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  store.put("plans", { ...plan, state: "approved" });
  store.put("review_rounds", {
    id: "r",
    planId: "p",
    spec: "synthetic",
    state: "done",
    revisionHash: "h",
  });
  store.put("review_threads", {
    id: "finding",
    source: "plan-review",
    planId: "p",
    roundId: "r",
    revisionHash: "h",
    state: "open",
  });
  store.put("session_bindings", {
    id: "answer",
    slot: "answer",
    role: "plan-answer",
    taskId: "r",
    planAnswer: { planId: "p", roundId: "r", revisionHash: "h" },
  });
  store.put("receipts", {
    id: "plan-answer:r",
    state: "running",
    slot: "answer",
    permissionClass: "read",
  });
  const call = (name, input, slot) =>
    handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name,
          arguments: { input },
          _meta: {
            "kirocrew.caller": {
              schemaVersion: 1,
              sessionKey: "dashboard:" + slot,
            },
          },
        },
      },
      ops,
      { attestedCaller: true },
    );
  const read = await call(
    "plans_plan_review",
    { planId: "p", roundId: "r" },
    "answer",
  );
  assert.notEqual(read.body.result.isError, true);
  const input = {
    planId: "p",
    roundId: "r",
    answers: [
      {
        id: "finding",
        action: "answered",
        text: "The existing acceptance covers this case.",
      },
    ],
  };
  assert.equal(
    (await call("plans_answer_review", input, "other")).body.result.isError,
    true,
  );
  assert.notEqual(
    (await call("plans_answer_review", input, "answer")).body.result.isError,
    true,
  );
  assert.equal(store.get("receipts", "plan-answer:r").state, "done");
  assert.equal(store.get("review_threads", "finding").state, "open");
});
