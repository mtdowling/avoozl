// 56.9: idempotent task-issue offboarding export (R102.19, R91.2, R103.6).
// Fake GitHub and an isolated temporary workspace only.
import assert from "node:assert/strict";
import test from "node:test";
import { AVOOZL_CREW_LABEL, ownedIssueInput } from "../github.mjs";
import { guardGitHub } from "../content-rules.mjs";
import { driverHeldTaskIds, readOnlyPlanIds } from "../driver-scope.mjs";
import {
  applyExport,
  exportOf,
  exportedPlanIds,
  previewExport,
} from "../issue-export.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";

const REPO = "example/code";

// The real client's label rule, applied to the fake's create.
class ExportGitHub extends FakeGitHub {
  constructor() {
    super();
    this.creates = [];
    this.blockerCalls = [];
  }
  createIssue(repository, input) {
    const owned = ownedIssueInput(input);
    this.creates.push(owned);
    if (this.failAt === this.creates.length) {
      this.failAt = null;
      return Promise.reject(Error("GitHub said no"));
    }
    const made = super.createIssue(repository, owned);
    if (this.loseAnswerAt === this.creates.length) {
      this.loseAnswerAt = null;
      return made.then(() => Promise.reject(Error("connection reset")));
    }
    return made;
  }
  addIssueBlocker(...args) {
    this.blockerCalls.push(args.slice(1));
    return super.addIssueBlocker(...args);
  }
}

// Plan p: a done, b and c open (b needs a, c needs b), d already projected
// as #9 and open; plan q is untouched. The spec issue is #5.
function workspace(t) {
  const { store } = fixture(t),
    github = new ExportGitHub();
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    projectId: "code",
  });
  store.put("plans", { id: "p", state: "approved", title: "Plan p" });
  store.put("receipts", {
    id: "github-parent:plan:p",
    kind: "github-parent",
    level: "plan",
    planId: "p",
    repository: REPO,
    number: 5,
  });
  store.mutate("Seed", (data) => {
    const leaf = (id, extra = {}) => ({
      id,
      title: "Task " + id,
      scope: "catalog",
      status: "planned",
      track: "catalog",
      kind: "leaf",
      repository: "code",
      planId: "p",
      acceptance: [id + " works"],
      ...extra,
    });
    data.tasks.push(
      leaf("a", { status: "accepted" }),
      leaf("b"),
      leaf("c"),
      leaf("d", {
        github: {
          repository: REPO,
          number: 9,
          nodeId: "I_9",
          origin: "design",
        },
      }),
      leaf("other", { planId: "q" }),
    );
    data.edges.push(
      { id: "a:requires:b", from: "a", to: "b", kind: "requires" },
      { id: "b:requires:c", from: "b", to: "c", kind: "requires" },
    );
  });
  const task = (id) => store.read().tasks.find((x) => x.id === id);
  return { store, github, task };
}

test("export creates only incomplete task issues and links, then marks Exported", async (t) => {
  const { store, github } = workspace(t);
  const preview = previewExport(store, { planId: "p" });
  assert.deepEqual(
    preview.create.map((x) => x.taskId),
    ["b", "c"],
  );
  assert.deepEqual(preview.reuse, [{ taskId: "d", number: 9 }]);
  assert.deepEqual(preview.links, [{ blocker: "b", blocked: "c" }]);
  assert.deepEqual(github.creates, [], "a preview writes nothing");
  assert.equal(exportOf(store, "p"), null);

  const result = await applyExport(store, { github, planId: "p" });
  assert.equal(result.state, "exported");
  assert.equal(result.created, 2);
  assert.equal(result.linked, 1);
  assert.deepEqual(Object.keys(result.bindings).sort(), ["b", "c", "d"]);
  assert.equal(result.bindings.d.number, 9);
  assert.equal(result.bindings.d.reused, true);
  // c is blocked by b, by b's database ID.
  assert.deepEqual(github.blockerCalls, [
    [result.bindings.c.number, result.bindings.b.databaseId],
  ]);
  assert.deepEqual(
    github.comments.map((c) => [c.number, c.body.split(".")[0]]),
    [[5, "Status: Exported"]],
  );
  // The exported spec is no longer driven: no dispatch, no landing.
  assert.ok(exportedPlanIds(store).has("p"));
  assert.ok(readOnlyPlanIds(store).has("p"));
  const held = driverHeldTaskIds(store);
  for (const id of ["a", "b", "c", "d"]) assert.ok(held.has(id), id);
  assert.equal(held.has("other"), false);
});

test("no export create request carries crew:avoozl", async (t) => {
  const { store, github } = workspace(t);
  await applyExport(store, { github, planId: "p" });
  assert.equal(github.creates.length, 2);
  for (const input of github.creates) {
    assert.equal(input.withoutCrewLabel, undefined);
    assert.equal(
      (input.labels || []).some(
        (label) => String(label).toLowerCase() === AVOOZL_CREW_LABEL,
      ),
      false,
    );
  }
  for (const issue of github.created)
    assert.deepEqual(issue.labels, [], `#${issue.number}`);
});

test("a retry creates no duplicate issues or links", async (t) => {
  const { store, github } = workspace(t);
  await applyExport(store, { github, planId: "p" });
  const counts = [
    github.created.length,
    github.blockerCalls.length,
    github.comments.length,
  ];
  const again = await applyExport(store, { github, planId: "p" });
  assert.equal(again.created, 0);
  assert.deepEqual(
    [github.created.length, github.blockerCalls.length, github.comments.length],
    counts,
  );
});

test("a partial failure stays held and a retry resumes safely", async (t) => {
  const { store, github } = workspace(t);
  // The second create fails: b is made, c is not.
  github.failAt = 2;
  await assert.rejects(applyExport(store, { github, planId: "p" }), /said no/);
  const held = exportOf(store, "p");
  assert.equal(held.state, "exporting");
  assert.match(held.error, /said no/);
  assert.deepEqual(Object.keys(held.bindings).sort(), ["b"]);
  // Held: nothing dispatches or lands for the spec while it is stopped.
  assert.ok(readOnlyPlanIds(store).has("p"));
  assert.ok(driverHeldTaskIds(store).has("c"));

  const done = await applyExport(store, { github, planId: "p" });
  assert.equal(done.state, "exported");
  assert.equal(github.created.length, 2);
  assert.equal(github.blockerCalls.length, 1);
});

test("a create whose answer was lost is found again by its marker", async (t) => {
  const { store, github } = workspace(t);
  github.loseAnswerAt = 1;
  await assert.rejects(
    applyExport(store, { github, planId: "p" }),
    /connection reset/,
  );
  assert.equal(github.created.length, 1, "GitHub made b's issue");
  const done = await applyExport(store, { github, planId: "p" });
  assert.equal(done.state, "exported");
  assert.equal(github.created.length, 2, "b is not made twice");
  assert.equal(done.bindings.b.number, github.created[0].number);
});

test("export writes pass the content scan; a blocked write makes nothing and stays held", async (t) => {
  const { store, github } = workspace(t);
  store.mutate("A leak", (data) => {
    data.tasks.find((x) => x.id === "b").summary =
      "Built on /Users/someone/projects/secret";
  });
  const guarded = guardGitHub(github, store);
  await assert.rejects(
    applyExport(store, { github: guarded, planId: "p" }),
    /Content rules blocked/,
  );
  assert.equal(github.created.length, 0);
  assert.equal(exportOf(store, "p").state, "exporting");
});

test("spec.exportIssues previews, exports with confirm, and refuses agents", async (t) => {
  const { Operations } = await import("../operations.mjs");
  const { temporaryDirectory } = await import("./temporary.mjs");
  const { store, github } = workspace(t);
  const ops = new Operations(store, {
    github,
    workspaceRoot: temporaryDirectory(),
  });
  await assert.rejects(
    ops.execute(
      "spec.exportIssues",
      { planId: "p", confirm: true },
      undefined,
      {
        mcp: true,
      },
    ),
    /Only a person/,
  );
  const preview = await ops.execute("spec.exportIssues", { planId: "p" });
  assert.equal(preview.create.length, 2);
  assert.equal(github.created.length, 0);
  const done = await ops.execute("spec.exportIssues", {
    planId: "p",
    confirm: true,
  });
  assert.equal(done.state, "exported");
  assert.equal(github.created.length, 2);
});

test("the CLI maps spec export-issues and refuses it in an agent session", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { initializeWorkspace } = await import("../workspace.mjs");
  const { temporaryDirectory } = await import("./temporary.mjs");
  const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
    root = temporaryDirectory("avoozl-export-cli-");
  initializeWorkspace(root, { name: "t" });
  const run = (args, env = {}) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
      encoding: "utf8",
      env: {
        ...process.env,
        KIROCREW_SPAWNED: "",
        KIRO_SESSION_ID: "",
        ...env,
      },
    });
  const wrong = run(["spec", "nope"]);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /spec export-issues/);
  const missing = run(["spec", "export-issues"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /SPEC/);
  const agent = run(["spec", "export-issues", "p", "--confirm"], {
    KIRO_SESSION_ID: "s1",
  });
  assert.notEqual(agent.status, 0);
  assert.match(agent.stderr, /agent session/);
  // A person reaches the operation: an unknown plan is its own refusal.
  const person = run(["spec", "export-issues", "nope"]);
  assert.notEqual(person.status, 0);
  assert.match(person.stderr, /Plan not found/);
});
