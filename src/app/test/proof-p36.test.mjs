// Proof P36 (Requirement 59, design §6.9): one epic over two member plans,
// and the old forms refused. An isolated temporary workspace in plans-repo
// mode with a fake GitHub; every value is fake. The page's own parts of
// (3) and (8), the Graph levels, Dashboard and Settings, are in
// kirocrew-app/ui/test/epics.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { flowPolicy } from "../flow.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_p36p36p36p36p36p",
  PLANS = "example/plans";

// The shared fake, plus what the tick's completion step reads: closes by
// an allowed actor, with no merged pull request.
class ClosingGitHub extends FakeGitHub {
  constructor() {
    super();
    this.permissions.set("maintainer", "write");
    this.issueTypes = { example: ["Task", "Epic"] };
  }
  closingPullRequests() {
    return Promise.resolve([]);
  }
  pullRequestReviews() {
    return Promise.resolve([]);
  }
  branchPullRequests() {
    return Promise.resolve([]);
  }
  issueLinks() {
    return Promise.resolve([]);
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  close(number) {
    const issue = this.created.find((item) => item.number === number),
      at = "2026-11-13T10:00:00Z";
    Object.assign(issue, {
      state: "closed",
      state_reason: "completed",
      closed_at: at,
      updated_at: at,
    });
    this.events.set(number, [
      ...(this.events.get(number) || []),
      {
        event: "closed",
        actor: { login: "maintainer" },
        state_reason: "completed",
        created_at: at,
      },
    ]);
  }
}

const leaf = (extra = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  repository: "code",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  ...extra,
});

function writePlan(root, name, { front, tasks, entries, extra = {} }) {
  writeSpec(root, name, {
    "requirements.md": `${front ? `---\n${front}\n---\n` : ""}# Plan ${name}\n\nThe goal of ${name}.\n`,
    "tasks.md": `# Tasks\n\n${tasks}`,
    "avoozl/manifest.json": JSON.stringify(
      { tasks: entries, ...extra },
      null,
      2,
    ),
  });
}

function writeEpic(
  root,
  name,
  members,
  entry = (plan) => ({ plan, summary: `Plan ${plan}.` }),
) {
  writeSpec(root, name, {
    "requirements.md": `# Rewrite\n\nRewrite the runtime in two plans.\n\n## What done means\n\nAlpha and beta are done.\n`,
    "design.md": "# Design\n\nAlpha first, then beta.\n",
    "tasks.md": `# Plans\n\n${members.map((m, i) => `- [ ] ${i + 1} ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify(
      {
        kind: "epic",
        tasks: Object.fromEntries(
          members.map((m, i) => [String(i + 1), entry(m)]),
        ),
      },
      null,
      2,
    ),
  });
}

async function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory("avoozl-p36-"),
    github = new ClosingGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "plans-repo",
        planningRepository: PLANS,
        epicIssueType: "Epic",
        subIssues: { maxPerParent: 2 },
        repositories: {
          [PLANS]: { baseBranch: "main", allowedActors: ["maintainer"] },
          "example/code": { baseBranch: "main", allowedActors: ["maintainer"] },
        },
      },
    }),
  );
  // The planning checkout holds the spec folders (Requirement 30.3).
  for (const id of ["plans", "code"])
    store.put("projects", {
      id,
      root: id === "plans" ? root : `/tmp/p36-${id}`,
      ...(id === "plans" ? { planning: true } : { repository: "example/code" }),
      baseBranch: "main",
      worktreeRoot: `/tmp/p36-${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  await ops.execute("github.configure", {
    repository: PLANS,
    projectId: "plans",
    allowedActors: ["maintainer"],
  });
  return { root, store, github, ops };
}

const lint = async (ops, name) =>
  (await ops.execute("plan.specs", {})).items.find(
    (item) => item.name === name,
  );

async function approve(ops, name) {
  const plan =
    ops.store.get("plans", name) ||
    (await ops.execute("plan.create", {
      spec: name,
      context: { projectId: "plans" },
    }));
  const preview = await ops.execute("plan.preview", { id: plan.id });
  return ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

const markerOf = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);

test("P36: one epic over two member plans, and old forms refused", async (t) => {
  const { root, store, github, ops } = await workspace(t);
  writePlan(root, "alpha", {
    front: "epic: rewrite",
    tasks:
      "- [ ] 0 Survey the runtime\n\n## Loader\n\n- [ ] 1 Load it\n\n## Checker\n\n- [ ] 2 Check it\n",
    entries: {
      0: leaf(),
      1: leaf({ requires: ["0"] }),
      2: leaf({ requires: ["1"] }),
    },
  });
  writePlan(root, "beta", {
    front: "epic: rewrite",
    tasks: "- [ ] 1 One\n- [ ] 2 Two\n- [ ] 3 Three\n",
    entries: {
      1: leaf({ phase: "w1" }),
      2: leaf({ phase: "w1" }),
      3: leaf({ phase: "w2" }),
    },
    extra: { phases: { w1: { title: "W1: core" } } },
  });
  writePlan(root, "gamma", {
    front: "epic: rewrite",
    tasks: "- [ ] 1 One\n",
    entries: { 1: leaf() },
  });
  writeEpic(root, "rewrite", ["alpha", "beta"]);

  // (1) Lint and approve: 0 errors; gamma is warned and sits under No epic.
  for (const name of ["rewrite", "alpha", "beta", "gamma"])
    assert.equal((await lint(ops, name)).counts.error, 0, name);
  const gammaLint = await ops.execute("plan.lint", {
    id: (
      await ops.execute("plan.create", {
        spec: "gamma",
        context: { projectId: "plans" },
      })
    ).id,
  });
  assert.deepEqual(
    gammaLint.diagnostics.map((d) => d.code),
    ["spec.epic-unknown"],
  );
  for (const name of ["alpha", "beta", "gamma", "rewrite"])
    await approve(ops, name);
  assert.deepEqual(store.read().epics.find((e) => e.id === "rewrite").plans, [
    "alpha",
    "beta",
  ]);

  // (2) beta named as a member while it names no epic blocks only the epic.
  writePlan(root, "beta", {
    tasks: "- [ ] 1 One\n- [ ] 2 Two\n- [ ] 3 Three\n",
    entries: {
      1: leaf({ phase: "w1" }),
      2: leaf({ phase: "w1" }),
      3: leaf({ phase: "w2" }),
    },
    extra: { phases: { w1: { title: "W1: core" } } },
  });
  const unconfirmed = await lint(ops, "rewrite");
  assert.deepEqual(unconfirmed.counts, { error: 1, warning: 0, info: 0 });
  assert.equal(
    (await lint(ops, "beta")).counts.error,
    0,
    "the plan itself still approves",
  );
  const rewrite = store.get("plans", "rewrite");
  await ops.execute("plan.save", { id: "rewrite", expectedHash: rewrite.hash });
  writeEpic(root, "rewrite", ["alpha", "beta", "gamma"]);
  const saved = await ops.execute("plan.save", {
    id: "rewrite",
    expectedHash: store.get("plans", "rewrite").hash,
  });
  await assert.rejects(
    ops.execute("plan.approve", {
      id: "rewrite",
      expectedHash: saved.hash,
      expectedRevision: (await ops.execute("plan.preview", { id: "rewrite" }))
        .expectedRevision,
    }),
    /spec\.epic-member-unconfirmed/,
  );
  // Restore both folders; the stored revisions never changed.
  writePlan(root, "beta", {
    front: "epic: rewrite",
    tasks: "- [ ] 1 One\n- [ ] 2 Two\n- [ ] 3 Three\n",
    entries: {
      1: leaf({ phase: "w1" }),
      2: leaf({ phase: "w1" }),
      3: leaf({ phase: "w2" }),
    },
    extra: { phases: { w1: { title: "W1: core" } } },
  });
  writeEpic(root, "rewrite", ["alpha", "beta"]);
  await ops.execute("plan.save", {
    id: "rewrite",
    expectedHash: store.get("plans", "rewrite").hash,
  });
  await approve(ops, "rewrite");
  assert.equal((await lint(ops, "rewrite")).counts.error, 0);

  // (3) Reads: the epic lists alpha then beta with computed progress;
  // phases come from headings or manifest values; no doc: group anywhere.
  const epic = await ops.execute("epic.get", { id: "rewrite" });
  assert.deepEqual(
    epic.members.map((m) => [m.plan, m.progress]),
    [
      ["alpha", { done: 0, total: 3 }],
      ["beta", { done: 0, total: 3 }],
    ],
  );
  assert.equal(epic.goal, "Rewrite the runtime in two plans.");
  assert.equal(epic.done, "Alpha and beta are done.");
  assert.deepEqual(
    epic.members[0].phases.map((p) => [p.id, p.title, p.total]),
    [
      ["loader", "Loader", 1],
      ["checker", "Checker", 1],
      [null, null, 1],
    ],
  );
  assert.deepEqual(
    epic.members[1].phases.map((p) => [p.id, p.title, p.total]),
    [
      ["w1", "W1: core", 2],
      ["w2", "w2", 1],
    ],
  );
  const graph = await ops.execute("graph.view", {});
  assert.deepEqual(
    graph.epics.map((e) => [e.id, e.plans, e.count]),
    [["rewrite", ["alpha", "beta"], 6]],
  );
  assert.deepEqual(
    graph.plans
      .filter((p) => ["alpha", "beta", "gamma"].includes(p.id))
      .map((p) => [p.id, p.epic]),
    [
      ["alpha", "rewrite"],
      ["beta", "rewrite"],
      ["gamma", null],
    ],
  );
  const gammaTasks = await ops.execute("graph.view", {
    epic: "(none)",
    plan: "gamma",
  });
  assert.deepEqual(
    gammaTasks.tasks.map((task) => task.id),
    ["gamma.1"],
  );
  const noPhase = await ops.execute("graph.view", {
    plan: "alpha",
    phase: "(none)",
  });
  assert.deepEqual(
    noPhase.tasks.map((task) => task.id),
    ["alpha.0"],
    "the headless task is under No phase",
  );
  const w1 = await ops.execute("graph.view", {
    epic: "rewrite",
    plan: "beta",
    phase: "w1",
  });
  assert.deepEqual(
    w1.tasks.map((task) => task.id),
    ["beta.1", "beta.2"],
  );
  const flow = await ops.execute("flow.view", {
    epic: "rewrite",
    plan: "beta",
  });
  assert.deepEqual(
    flow.epics.map((e) => e.id),
    ["rewrite"],
  );
  assert.deepEqual(
    flow.phases.map((p) => p.id),
    ["w1", "w2"],
  );
  const table = await ops.execute("plan.table", {});
  const rows = Object.fromEntries(table.items.map((row) => [row.spec, row]));
  assert.deepEqual(
    [rows.alpha.epic, rows.beta.epic, rows.gamma.epic, rows.rewrite.kind],
    ["rewrite", "rewrite", null, "epic"],
  );
  assert.equal(rows.alpha.phases, 2);
  const everything = JSON.stringify([
    epic,
    graph,
    flow,
    table,
    await ops.execute("delivery.view", {}),
  ]);
  assert.doesNotMatch(everything, /"doc:/);
  assert.doesNotMatch(everything, /"(?:epic|title)":"[^"]*\.kiro\/specs/);

  // (4) Preview, apply, preview again.
  const preview = await ops.execute("github.project.preview", {
    planId: "beta",
  });
  assert.equal(github.created.length, 0, "a preview writes nothing");
  assert.deepEqual(
    preview.unlinked.map((u) => [u.taskId, u.parent]),
    [["beta.3", "plan.beta"]],
  );
  await ops.execute("github.project", { planId: "alpha" });
  const beta = await ops.execute("github.project", { planId: "beta" });
  const issues = (kind) =>
    github.created.filter((issue) => markerOf(issue).kind === kind);
  assert.equal(issues("epic").length, 1, "one epic issue");
  const [epicIssue] = issues("epic"),
    planIssues = issues("plan");
  assert.equal(epicIssue.type.name, "Epic");
  assert.equal(epicIssue.repository, PLANS);
  assert.match(epicIssue.body, /## Member plans\n\n- Plan alpha\n- Plan beta/);
  assert.deepEqual(
    planIssues.map((issue) => markerOf(issue).taskId),
    ["plan.alpha", "plan.beta"],
  );
  for (const issue of planIssues) {
    assert.equal(issue.type, undefined, "a plan issue has no type");
    assert.equal(markerOf(issue).parent, "epic.rewrite");
    assert.ok(
      !issue.labels.some((label) => label.name === "avoozl:ready"),
      "never ready",
    );
  }
  const under = (issue) =>
    github.subIssues
      .filter(([parent]) => parent === issue.number)
      .map(([, id]) => id);
  assert.deepEqual(
    under(epicIssue),
    planIssues.map((issue) => issue.id),
  );
  const taskIssue = (id) =>
    github.created.find((issue) => markerOf(issue).taskId === id);
  // The cap is 2: alpha's three tasks and beta's three leave one out each.
  assert.deepEqual(under(planIssues[0]), [
    taskIssue("alpha.0").id,
    taskIssue("alpha.1").id,
  ]);
  assert.deepEqual(under(planIssues[1]), [
    taskIssue("beta.1").id,
    taskIssue("beta.2").id,
  ]);
  assert.equal(
    markerOf(taskIssue("beta.3")).parent,
    "plan.beta",
    "the unlinked child names its parent",
  );
  assert.deepEqual(beta.unlinked, [
    {
      taskId: "beta.3",
      parent: "plan.beta",
      reason: "Over the sub-issue limit; group these tasks in packages.",
    },
  ]);
  assert.match(taskIssue("beta.1").body, /Phase: W1: core/);
  assert.match(taskIssue("alpha.1").body, /Phase: Loader/);
  const delivery = await ops.execute("delivery.view", {});
  const card = delivery.items.find((item) => item.id === "beta.3");
  assert.deepEqual(
    [card.epic, card.planId, card.phase, card.subIssue.reason],
    [
      "rewrite",
      "beta",
      { id: "w2", title: "w2" },
      "Over the sub-issue limit; group these tasks in packages.",
    ],
  );
  const writes =
    github.created.length + github.updated.length + github.subIssues.length;
  const again = await ops.execute("github.project.preview", { planId: "beta" });
  assert.deepEqual(
    again.writes.filter((write) => write.action !== "read"),
    [],
    "the second preview writes nothing",
  );
  assert.equal(
    github.created.length + github.updated.length + github.subIssues.length,
    writes,
  );

  // (5) Close every alpha and beta task issue: the tick closes both plan
  // issues, then the epic issue.
  for (const id of [
    "alpha.0",
    "alpha.1",
    "alpha.2",
    "beta.1",
    "beta.2",
    "beta.3",
  ])
    github.close(taskIssue(id).number);
  await ops.execute("workspace.tick", { sessions: [] });
  const state = (issue) =>
    github.created.find((item) => item.number === issue.number).state;
  assert.deepEqual(planIssues.map(state), ["closed", "closed"]);
  if (state(epicIssue) !== "closed")
    await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(state(epicIssue), "closed");
  assert.equal(
    (await ops.execute("epic.get", { id: "rewrite" })).complete,
    true,
  );

  // (6) The old forms are errors naming each entry; neither folder approves.
  writePlan(root, "old", {
    tasks: "- [ ] 1 Parent\n  - [ ] 1.1 Child\n- [ ] 2 Grouped\n",
    entries: {
      1: { kind: "epic", summary: "Goal.", requires: ["1.1"] },
      1.1: leaf(),
      2: leaf({ epic: "W1" }),
    },
    extra: { epics: ["W1"] },
  });
  writeEpic(root, "old-epic", ["alpha"], (plan) => ({ memberPlan: plan }));
  const old = await lint(ops, "old"),
    oldEpic = await lint(ops, "old-epic");
  const quality = async (name) =>
    ops.execute("plan.lint", {
      id: (
        await ops.execute("plan.create", {
          spec: name,
          context: { projectId: "plans" },
        })
      ).id,
    });
  const oldCodes = (await quality("old")).diagnostics.filter(
    (d) => d.severity === "error",
  );
  assert.deepEqual(oldCodes.map((d) => [d.code, d.entry ?? null]).sort(), [
    ["spec.entry-epic", null],
    ["spec.entry-epic", "2"],
    ["spec.kind-epic", "1"],
  ]);
  const epicCodes = (await quality("old-epic")).diagnostics.filter(
    (d) => d.severity === "error",
  );
  assert.deepEqual(
    epicCodes.map((d) => [d.code, d.entry]),
    [["spec.epic-task-fields", "1"]],
  );
  assert.ok(old.counts.error > 0 && oldEpic.counts.error > 0);
  for (const name of ["old", "old-epic"])
    await assert.rejects(approve(ops, name), /Resolve plan diagnostic spec\./);

  // (7) The batch key "epic" is refused naming "phase".
  assert.throws(
    () => flowPolicy({ flow: { batch: { by: "epic" } } }),
    /"phase"/,
  );
  const settings = await ops.execute("flow.settings.get", {});
  await assert.rejects(
    ops.execute("flow.settings.update", {
      flow: { batch: { by: "epic" } },
      expectedHash: settings.hash,
    }),
    /"phase"/,
  );
});
