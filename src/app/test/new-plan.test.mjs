// New plan (Plans page): plan.new checks the fields, runs content rules on
// the seed and records the request; the tick imports the folder as a draft
// once it lints clean. It never approves, starts work or pushes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { newPlanStarts, newPlanTask, pendingNewPlans } from "../new-plan.mjs";
import { planReviewWriter } from "../plan-review-authorship.mjs";
import { recordSessionStatus } from "../session-bindings.mjs";
import { fixture } from "./fixtures.mjs";
import { legacySpecFiles, specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

function workspace(
  t,
  { repositories = ["app"], contentRules, epic = false } = {},
) {
  const { root, store } = fixture(t);
  // An epic folder New plan may name (Requirement 59.11).
  if (epic)
    writeSpec(root, "rewrite", {
      "tasks.md": "---\nkind: epic\n---\n# Plans\n",
    });
  if (contentRules) {
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, contentRules: contentRules.policy }),
    );
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    for (const [id, text] of Object.entries(contentRules.terms))
      fs.writeFileSync(path.join(dir, `${id}.txt`), text);
  }
  for (const id of repositories)
    store.put("projects", {
      id,
      name: id,
      root: temporaryDirectory(`avoozl-repo-${id}-`),
    });
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const request = (overrides = {}) => ({
  name: "cache-invalidation",
  category: "Runtime",
  phases: ["Phase 1", "Phase 2"],
  repositories: ["app"],
  goal: "Invalidate the cache when config changes.",
  context: "See issue 12.",
  ...overrides,
});

// Every repository-named leaf, so the folder lints clean for project `app`.
function cleanSpec() {
  return {
    "tasks.md": `---\nrepo: app\n---\n${specFiles()["tasks.md"]}`,
  };
}

const approvals = (store) => store.list("approvals").length;
const sessions = (store) => {
  try {
    return store.list("session_bindings").length;
  } catch {
    return 0;
  }
};

test("plan.new returns a planner seed with Avoozl's spec rules and records the request", async (t) => {
  const { root, store, ops } = workspace(t);
  const result = await ops.execute("plan.new", request());
  assert.equal(result.agent, "avoozl-planner");
  assert.equal(result.name, "cache-invalidation");
  assert.equal(
    result.folder,
    path.join(root, ".kiro", "specs", "cache-invalidation"),
  );
  for (const needle of [
    "Mode: draft.",
    `Write only inside: ${result.folder}/.`,
    "requirements.md",
    "design.md",
    "tasks.md",
    "Facts: bullet",
    "Never write avoozl/manifest.json",
    "unique task ID",
    "category: Runtime",
    "Repositories: app.",
    "Do not approve it",
    "Invalidate the cache when config changes.",
    "- Phase 2",
    "See issue 12.",
  ])
    assert.ok(result.message.includes(needle), needle);
  assert.deepEqual(
    pendingNewPlans(store).map((entry) => entry.name),
    ["cache-invalidation"],
  );
  // Asking again for the same name replaces the request.
  await ops.execute("plan.new", request({ goal: "Second try." }));
  assert.deepEqual(
    pendingNewPlans(store).map((entry) => entry.goal),
    ["Second try."],
  );
  assert.equal(store.list("plans").filter((p) => p.spec).length, 0);
});

test("plan.new refuses bad names, duplicates, missing repositories and an empty goal", async (t) => {
  const { root, store, ops } = workspace(t);
  const refuses = (input, pattern, status = 400) =>
    assert.rejects(
      ops.execute("plan.new", request(input)),
      (error) => pattern.test(error.message) && error.status === status,
    );
  await refuses({ name: "has spaces" }, /lowercase letters/);
  await refuses({ name: "a/b" }, /lowercase letters/);
  await refuses({ name: "../escape" }, /lowercase letters/);
  await refuses({ name: "" }, /lowercase letters/);
  await refuses({ goal: "  " }, /What you want is required/);
  await refuses({ repositories: [] }, /at least one repository/);
  await refuses({ repositories: ["nope"] }, /not a registered repository/, 404);
  await refuses({ category: "a: b" }, /Category may not use/);
  await refuses({ phases: ["two\nlines"] }, /one line/);
  // The old free-text list is refused, and an epic must be an epic folder.
  await refuses({ epics: ["W1"] }, /Name one epic in epic/);
  await refuses({ epic: "missing" }, /not an epic/, 404);
  writeSpec(root, "taken");
  await refuses({ name: "taken" }, /already exists/, 409);
  await ops.execute("plan.create", { spec: "taken" });
  await refuses({ name: "taken" }, /spec named taken already exists/, 409);
  assert.deepEqual(pendingNewPlans(store), []);
});

test("plan.new with no registered repository says to register one", async (t) => {
  const { ops } = workspace(t, { repositories: [] });
  await assert.rejects(
    ops.execute("plan.new", request()),
    (error) =>
      /Register a repository/.test(error.message) && error.status === 409,
  );
});

test("plan.new is the page's alone: agents and MCP are refused", async (t) => {
  const { ops } = workspace(t);
  for (const context of [{ caller: "agent" }, { mcp: true }])
    await assert.rejects(
      ops.perform("plan.new", request(), undefined, context),
      (error) => error.status === 403,
    );
});

test("content rules run on the seed: a blocked term refuses and records nothing", async (t) => {
  const { store, ops } = workspace(t, {
    contentRules: {
      policy: { sets: [{ id: "fake-terms" }] },
      terms: { "fake-terms": "# fake\ncodename: \\bzorblat\\b\n" },
    },
  });
  await assert.rejects(
    ops.execute("plan.new", request({ goal: "Ship zorblat next week." })),
    (error) => error.status === 422,
  );
  assert.deepEqual(pendingNewPlans(store), []);
  await ops.execute("plan.new", request());
  assert.equal(pendingNewPlans(store).length, 1);
});

test("the tick imports a requested folder as a draft once it lints clean, and never approves or starts work", async (t) => {
  const { root, store, ops } = workspace(t);
  await ops.execute("plan.new", request());
  const before = { approvals: approvals(store), sessions: sessions(store) };

  // No folder yet: the request waits.
  await ops.execute("workspace.tick", {});
  assert.equal(store.get("plans", "cache-invalidation"), null);

  // Half written (no Facts yet): still waits, with the reason.
  writeSpec(root, "cache-invalidation", {
    "tasks.md": legacySpecFiles()["tasks.md"],
    "avoozl/manifest.json": null,
  });
  await ops.execute("workspace.tick", {});
  assert.equal(store.get("plans", "cache-invalidation"), null);
  assert.ok(pendingNewPlans(store)[0].lastError);

  writeSpec(root, "cache-invalidation", cleanSpec());
  await ops.execute("workspace.tick", {});
  const plan = store.get("plans", "cache-invalidation");
  assert.equal(plan.state, "draft");
  assert.equal(plan.spec, "cache-invalidation");
  assert.equal(plan.prompt, request().goal);
  assert.deepEqual(pendingNewPlans(store), []);
  assert.equal(approvals(store), before.approvals, "never approves");
  assert.equal(sessions(store), before.sessions, "starts no session");
  assert.ok(
    !store.read().tasks.some((task) => task.planId === "cache-invalidation"),
    "an unapproved draft adds no tasks",
  );
});

test("the tick opens New plan's planner chat and credits its draft to that chat", async (t) => {
  // Nearby inputs: a bound chat, a second ask, a page-era request, Spec Builder.
  const { root, store, ops } = workspace(t);
  await ops.execute("plan.new", request());
  const [start] = newPlanStarts(store, { model: "fake-planner" });
  assert.deepEqual(
    {
      role: start.role,
      task: start.task,
      worktree: start.worktree,
      model: start.model,
      permissionClass: start.permissionClass,
      attempt: start.attempt,
      context: start.context,
    },
    {
      role: "planner",
      task: newPlanTask("cache-invalidation"),
      worktree: root,
      model: "fake-planner",
      permissionClass: "write",
      attempt: 1,
      context: { newPlan: "cache-invalidation" },
    },
  );
  assert.ok(start.brief.includes("Mode: draft."));
  assert.ok(start.title.startsWith("avoozl:new-plan:cache-invalidation "));
  // A second ask opens a new attempt; a page-era entry (no brief) opens none.
  await ops.execute("plan.new", request({ goal: "Second try." }));
  const second = newPlanStarts(store, {})[0];
  assert.equal(second.attempt, 2);
  assert.notEqual(
    second.title,
    start.title,
    "a second attempt gets its own chat",
  );
  store.setMeta("newPlans", [
    ...pendingNewPlans(store),
    { name: "old-page-chat", goal: "x", repositories: ["app"] },
  ]);
  assert.equal(newPlanStarts(store, {}).length, 1);

  await ops.execute("session.bind", {
    taskId: start.task,
    slot: "avoozl_np",
    role: "planner",
    attempt: 2,
    source: "tick",
  });
  assert.deepEqual(
    newPlanStarts(store, {}),
    [],
    "a bound chat is not reopened",
  );
  recordSessionStatus(
    store,
    { slot: "avoozl_np", status: "idle" },
    {
      served: {
        requested: "fake-planner",
        model: "fake-planner",
        withheld: false,
        changed: false,
      },
    },
  );
  writeSpec(root, "cache-invalidation", cleanSpec());
  await ops.execute("workspace.tick", {});
  const plan = store.get("plans", "cache-invalidation"),
    writer = planReviewWriter(store, plan.id, plan.hash);
  assert.equal(writer.slot, "avoozl_np");
  assert.equal(writer.actualModel, "fake-planner");
});

// Spec Builder hand-off: plan.new returns the create body, the steering
// file is written only when asked and never over a changed copy, and the
// tick imports Spec Builder's tasks.md once it lints clean.
const steeringPath = (root) =>
  path.join(root, ".kiro", "steering", "avoozl-specs.md");
const builderRequest = (overrides = {}) =>
  request({ handoff: "spec-builder", epic: "rewrite", ...overrides });

test("plan.new preview says whether the steering file is there and records nothing", async (t) => {
  const { root, store, ops } = workspace(t, { epic: true });
  const preview = await ops.execute(
    "plan.new",
    builderRequest({ preview: true }),
  );
  assert.equal(preview.steering.state, "missing");
  assert.equal(preview.steering.path, steeringPath(root));
  assert.match(preview.steering.text, /Never write `avoozl\/manifest.json`/);
  assert.deepEqual(pendingNewPlans(store), []);
  assert.equal(fs.existsSync(steeringPath(root)), false);
  // The same field checks run.
  await assert.rejects(
    ops.execute(
      "plan.new",
      builderRequest({ preview: true, epic: "Bad Epic" }),
    ),
    /epic by its spec folder/,
  );
});

test("plan.new for Spec Builder writes the steering file when asked and returns the create body", async (t) => {
  const { root, store, ops } = workspace(t, { epic: true });
  const result = await ops.execute(
    "plan.new",
    builderRequest({ writeSteering: true }),
  );
  assert.equal(result.handoff, "spec-builder");
  assert.equal(result.steering.state, "current");
  assert.ok(
    fs.readFileSync(steeringPath(root), "utf8").includes("# Avoozl spec rules"),
  );
  const body = result.specBuilder;
  assert.equal(body.name, "cache-invalidation");
  assert.equal(body.working_dir, root);
  assert.equal(body.spec_type, "feature");
  for (const needle of [
    "Follow the spec rules in .kiro/steering/avoozl-specs.md.",
    "---\ncategory: Runtime\nepic: rewrite\n---",
    "Phases, as ## headings in tasks.md:\n- Phase 1\n- Phase 2",
    "Repositories in scope",
    "app (",
    "What I want:\nInvalidate the cache when config changes.",
    "Links and context:\nSee issue 12.",
  ])
    assert.ok(body.description.includes(needle), needle);
  assert.equal(pendingNewPlans(store)[0].handoff, "spec-builder");
});

test("a changed steering file is never overwritten, and a declined one puts the rules in the description", async (t) => {
  const { root, ops } = workspace(t, { epic: true });
  const declined = await ops.execute("plan.new", builderRequest());
  assert.equal(fs.existsSync(steeringPath(root)), false);
  assert.ok(declined.specBuilder.description.includes("## Task IDs"));
  assert.ok(!declined.specBuilder.description.includes("inclusion: always"));

  fs.mkdirSync(path.dirname(steeringPath(root)), { recursive: true });
  fs.writeFileSync(steeringPath(root), "# Our own rules\n");
  const kept = await ops.execute(
    "plan.new",
    builderRequest({ writeSteering: true }),
  );
  assert.equal(kept.steering.state, "changed");
  assert.equal(
    fs.readFileSync(steeringPath(root), "utf8"),
    "# Our own rules\n",
  );
  assert.ok(kept.specBuilder.description.includes("Follow the spec rules in"));
});

// What Spec Builder writes under the steering file: prose and tasks.md
// with Facts bullets. Avoozl writes nothing into the folder.
const builderTasks = [
  "---",
  "repo: app",
  "checks: npm test",
  "---",
  "# Tasks",
  "",
  "## Phase 1",
  "",
  "- [ ] 1. Load and validate configuration",
  "  - Facts:",
  "    - kind: package",
  "    - after: 1.1, 1.2",
  "  - Load and validate configuration",
  "  - [ ] 1.1 Read the config file",
  "    - Facts:",
  "      - done:",
  "        - A missing file yields defaults.",
  "    - _Requirements: 1.1_",
  "  - [ ] 1.2 Validate loaded config",
  "    - Facts:",
  "      - after: 1.1",
  "      - done:",
  "        - An unknown key is reported with its path.",
  "",
].join("\n");
const builderFiles = (tasks = builderTasks) => ({
  "tasks.md": tasks,
  "avoozl/manifest.json": null,
});

test("the tick imports Spec Builder's folder as a draft and writes no manifest", async (t) => {
  const { root, store, ops } = workspace(t, { epic: true });
  await ops.execute("plan.new", builderRequest());
  const before = { approvals: approvals(store), sessions: sessions(store) },
    folder = path.join(root, ".kiro", "specs", "cache-invalidation");
  writeSpec(root, "cache-invalidation", builderFiles());
  const tasksBefore = fs.readFileSync(path.join(folder, "tasks.md"), "utf8");
  await ops.execute("workspace.tick", {});
  const plan = store.get("plans", "cache-invalidation");
  assert.equal(plan.state, "draft");
  assert.equal(approvals(store), before.approvals, "never approves");
  assert.equal(sessions(store), before.sessions, "starts no session");
  assert.equal(
    fs.existsSync(path.join(folder, "avoozl", "manifest.json")),
    false,
  );
  assert.equal(
    fs.readFileSync(path.join(folder, "tasks.md"), "utf8"),
    tasksBefore,
  );
  const lint = await ops.execute("plan.lint", { id: "cache-invalidation" });
  assert.deepEqual(
    lint.proposals.map((p) => [
      p.specKey,
      p.repository ?? null,
      p.checks ?? null,
    ]),
    [
      ["1", null, null],
      ["1.1", "app", ["npm test"]],
      ["1.2", "app", ["npm test"]],
    ],
  );
});
