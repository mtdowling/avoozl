import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { bindContentRules } from "../content-rules.mjs";
import { globalAvoozlConfigPath } from "../layered-config.mjs";
import { recordPlanReviewWriter } from "../plan-review-authorship.mjs";
import { planReviewStep } from "../plan-review-step.mjs";
import { bindSpecReviewRound } from "../plan-reviews.mjs";
import { createSpecPlan, specHash } from "../spec-plans.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.KIRO_HOME = temporaryDirectory("avoozl-review-lifecycle-home-");
process.env.XDG_CONFIG_HOME = temporaryDirectory(
  "avoozl-review-lifecycle-xdg-",
);
const consumer = { mcp: true, caller: { sessionKey: "cron:fake-review" } };

function setup(t) {
  const { root, store } = fixture(t),
    globalFile = globalAvoozlConfigPath(),
    files = {
      "requirements.md": "# Requirements\nRead a file.\n",
      "design.md": "# Design\nRead missing.mjs.\n",
      "tasks.md": "# Tasks\n",
      "avoozl/manifest.json": '{"version":1,"tasks":{}}\n',
    },
    folder = {
      name: "audit",
      root,
      exists: true,
      files,
      hash: specHash(files),
    },
    config = {
      version: 1,
      roles: {
        planner: { model: "fake-writer" },
        planReviewer: { model: "fake-reviewer" },
      },
      planReview: { mode: "auto" },
    },
    plan = createSpecPlan(store, { id: "audit" }, folder),
    counts = { prepared: 0, removed: 0 },
    options = {
      workspaceRoot: root,
      config,
      readSpec: () => folder,
      otherSpecs: () => [],
      prepare: async (_store, _plan, round) => {
        counts.prepared++;
        const ownedRoot = path.join(root, round.id),
          snapshot = path.join(ownedRoot, "snapshot");
        fs.mkdirSync(snapshot, { recursive: true });
        fs.writeFileSync(path.join(snapshot, "revision.txt"), plan.hash);
        return {
          ownedRoot,
          snapshot,
          specFolder: snapshot,
          planningRoot: root,
          views: [],
          commits: {},
        };
      },
      remove: async (_store, resources) => {
        counts.removed++;
        fs.rmSync(resources.ownedRoot, { recursive: true, force: true });
      },
    };
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.writeFileSync(globalFile, JSON.stringify({ version: 1 }));
  const write = () =>
    fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(config));
  write();
  store.put("runs", {
    id: "draft",
    taskId: "plan:audit",
    state: "done",
    actualModel: "fake-writer",
  });
  recordPlanReviewWriter(store, plan, { runId: "draft" });
  const ops = new Operations(store, { workspaceRoot: root, plugins: null }),
    step = () => planReviewStep(store, options),
    job = () =>
      store.list("receipts").find((row) => row.kind === "plan-review-job"),
    queue = async () => {
      await step();
      const out = await step();
      return enqueueSessionRequests(
        store,
        { starts: out.requests },
        { source: "plan-review" },
      ).starts[0];
    },
    take = (request) =>
      ops.execute(
        "executor.kirocrew.take",
        { id: request.id, version: request.version },
        undefined,
        consumer,
      );
  return {
    root,
    store,
    ops,
    plan,
    globalFile,
    options,
    config,
    counts,
    write,
    step,
    job,
    queue,
    take,
  };
}

for (const inherited of [false, true])
  test(`switching ${inherited ? "inherited" : "repository"} mode off fences a queued native take before another step`, async (t) => {
    const env = setup(t),
      request = await env.queue();
    if (inherited) {
      delete env.config.planReview;
      fs.writeFileSync(
        env.globalFile,
        JSON.stringify({ version: 1, planReview: { mode: "off" } }),
      );
    } else env.config.planReview.mode = "off";
    env.write();
    assert.equal(await env.take(request), null);
    assert.equal(
      env.store.get("session_requests", request.id).state,
      "canceled",
    );
    assert.equal(env.counts.prepared, 1);
    assert.equal(
      env.counts.removed,
      0,
      "consumption does not delete a view behind a claim",
    );
    env.options.config = { ...env.config, planReview: { mode: "off" } };
    assert.equal((await env.step()).requests.length, 0);
    const round = env.store.get("review_rounds", request.task);
    assert.equal(round.state, "skipped");
    assert.match(round.note, /off/);
    assert.equal(env.counts.removed, 1);
    assert.equal(env.job().resources, null);
    assert.equal((await env.step()).requests.length, 0);
    assert.equal(env.counts.prepared, 1);
  });

test("an invalid current review mode cannot claim a queued reviewer", async (t) => {
  const env = setup(t),
    request = await env.queue();
  env.config.planReview.mode = "invalid";
  env.write();
  await assert.rejects(env.take(request), /planReview.mode/);
  assert.equal(env.store.get("session_requests", request.id).state, "pending");
  assert.equal(env.counts.removed, 0);
});

test("off cancels only unclaimed reviews; re-enabling queues one fresh start", async (t) => {
  const env = setup(t),
    request = await env.queue();
  env.config.planReview.mode = "off";
  env.write();
  await env.step();
  assert.equal(env.store.get("session_requests", request.id).state, "canceled");
  env.config.planReview.mode = "auto";
  env.write();
  const resumed = await env.step();
  assert.equal(resumed.requests.length, 1);
  assert.notEqual(resumed.requests[0].task, request.task);
  assert.equal((await env.step()).requests.length, 1);
  assert.equal(env.counts.prepared, 2);
  assert.equal(env.counts.removed, 1);
});

test("turning off preserves a claimed review and its later binding without duplicate reopening", async (t) => {
  const env = setup(t),
    request = await env.queue(),
    claim = await env.take(request),
    owned = env.job().resources.ownedRoot;
  env.config.planReview.mode = "off";
  env.write();
  await env.step();
  assert.equal(env.store.get("session_requests", request.id).state, "claimed");
  assert.equal(env.store.get("review_rounds", request.task).state, "running");
  assert.equal(env.counts.removed, 0);
  assert.equal(fs.existsSync(owned), true);
  await env.ops.execute(
    "session.bind",
    {
      slot: "fake-reviewer",
      taskId: request.task,
      role: request.role,
      attempt: request.attempt,
      executor: request.executor,
      permissionClass: request.permissionClass,
      model: request.model,
      worktree: request.worktree,
      context: request.context,
      requestId: request.id,
      claimToken: claim.claimToken,
    },
    undefined,
    consumer,
  );
  await env.step();
  assert.equal(env.store.get("session_requests", request.id).state, "bound");
  assert.equal(env.counts.removed, 0);
  env.config.planReview.mode = "auto";
  assert.equal((await env.step()).requests.length, 0);
  assert.equal(env.counts.prepared, 1);
  assert.equal(fs.existsSync(owned), true);
});

test("turning off also preserves a bound legacy review run", async (t) => {
  const env = setup(t);
  await env.step();
  const [request] = (await env.step()).requests;
  env.store.put("runs", {
    id: "legacy-review",
    taskId: "plan:audit",
    state: "running",
    actualModel: "fake-reviewer",
  });
  bindSpecReviewRound(env.store, {
    roundId: request.task,
    runId: "legacy-review",
  });
  env.config.planReview.mode = "off";
  await env.step();
  assert.equal(env.store.get("review_rounds", request.task).state, "running");
  assert.equal(env.counts.removed, 0);
});

for (const failure of ["other-spec read", "brief construction"])
  test(`a post-prepare ${failure} failure removes its owned view`, async (t) => {
    const env = setup(t);
    let owned,
      recorded = false;
    env.options.otherSpecs = () => {
      const job = env.job();
      owned = job.resources.ownedRoot;
      recorded = true;
      if (failure === "other-spec read")
        throw Error("fake other-spec read failure");
      return [
        {
          get name() {
            throw Error("fake brief construction failure");
          },
        },
      ];
    };
    await env.step();
    assert.equal((await env.step()).requests.length, 0);
    assert.equal(
      recorded,
      true,
      "resource ownership is recorded before constructing the brief",
    );
    assert.equal(env.job().state, "failed");
    assert.equal(env.job().resources, null);
    assert.equal(env.counts.removed, 1);
    assert.equal(fs.existsSync(owned), false);
  });

test("failed post-prepare cleanup retains resources for the next step to retry", async (t) => {
  const env = setup(t),
    remove = env.options.remove;
  let calls = 0;
  env.options.otherSpecs = () => {
    throw Error("fake other-spec failure");
  };
  env.options.remove = async (...args) => {
    if (++calls === 1) throw Error("fake busy view");
    return remove(...args);
  };
  await env.step();
  await env.step();
  const owned = env.job().resources.ownedRoot;
  assert.equal(env.job().state, "failed");
  assert.equal(env.job().cleanupError, true);
  assert.equal(fs.existsSync(owned), true);
  await env.step();
  assert.equal(calls, 2);
  assert.equal(env.job().resources, null);
  assert.equal(fs.existsSync(owned), false);
  await env.step();
  assert.equal(calls, 2);
  assert.equal(env.counts.prepared, 1);
});

test("a persisted preparing job resumes its brief without preparing or opening twice", async (t) => {
  const env = setup(t),
    request = await env.queue(),
    { brief: _brief, ...job } = env.job();
  env.store.remove("session_requests", request.id);
  env.store.put("receipts", { ...job, state: "preparing" });
  env.options.prepare = async () => {
    assert.fail("The persisted view must be reused.");
  };
  const resumed = await env.step();
  assert.equal(resumed.requests.length, 1);
  assert.equal(resumed.requests[0].task, request.task);
  assert.equal(typeof resumed.requests[0].brief, "string");
  assert.equal(env.job().state, "queued");
  assert.equal(env.counts.prepared, 1);
  assert.equal(env.counts.removed, 0);
  assert.equal(fs.existsSync(job.resources.ownedRoot), true);
  const queued = enqueueSessionRequests(
    env.store,
    { starts: resumed.requests },
    { source: "plan-review" },
  );
  assert.equal(queued.starts.length, 1);
  assert.equal((await env.step()).requests[0].brief, resumed.requests[0].brief);
  assert.equal(env.store.list("session_requests").length, 1);
});

test("a blocked brief cannot replace its view while cleanup is still failing", async (t) => {
  const env = setup(t),
    terms = path.join(env.root, ".avoozl/local/content-rules"),
    remove = env.options.remove;
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(path.join(terms, "fake-private.txt"), "missing.mjs\n");
  env.config.contentRules = {
    sets: [{ id: "fake-private", boundaries: ["brief"] }],
  };
  env.write();
  const bind = () =>
    bindContentRules(env.store, {
      workspaceRoot: env.root,
      configFile: path.join(env.root, "fake-config.json"),
    });
  bind();
  let calls = 0;
  env.options.remove = async (...args) => {
    if (++calls <= 2) throw Error("fake busy view");
    return remove(...args);
  };
  await env.step();
  await env.step();
  assert.equal(env.job().state, "blocked");
  const owned = env.job().resources.ownedRoot;
  env.config.contentRules.sets = [];
  env.write();
  bind();
  assert.equal((await env.step()).requests.length, 0);
  assert.equal(env.counts.prepared, 1);
  assert.equal(fs.existsSync(owned), true);
  assert.equal((await env.step()).requests.length, 1);
  assert.equal(calls, 3);
  assert.equal(env.counts.prepared, 2);
  assert.equal(
    fs.existsSync(owned),
    true,
    "the newly prepared view remains owned",
  );
});
