// Proof P36 (Requirement 59, design §6.9): one epic over two member plans,
// and the old forms refused. An isolated temporary workspace in plans-repo
// mode with a fake GitHub; every value is fake. The page's own parts of
// (3) and (8), the Graph levels, Dashboard and Settings, are in
// kirocrew-app/ui/test/epics.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import { flowPolicy } from "../flow/flow.mjs";
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
        repositories: {
          [PLANS]: { baseBranch: "main", allowedActors: ["maintainer"] },
          "example/code": { baseBranch: "main", allowedActors: ["maintainer"] },
        },
      },
    }),
  );
  // The planning checkout holds the spec folders (Requirement 30.3).
  for (const id of ["plans", "code"])
    store.put("repositories", {
      id,
      root: id === "plans" ? root : `/tmp/p36-${id}`,
      ...(id === "plans" ? { planning: true } : { github: "example/code" }),
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
    repositoryId: "plans",
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
      context: { repositoryId: "plans" },
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
    tasks:
      "## W1: core\n\n- [ ] 1 One\n- [ ] 2 Two\n\n## W2\n\n- [ ] 3 Three\n",
    entries: { 1: leaf(), 2: leaf(), 3: leaf() },
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
        context: { repositoryId: "plans" },
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
    tasks:
      "## W1: core\n\n- [ ] 1 One\n- [ ] 2 Two\n\n## W2\n\n- [ ] 3 Three\n",
    entries: { 1: leaf(), 2: leaf(), 3: leaf() },
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
    tasks:
      "## W1: core\n\n- [ ] 1 One\n- [ ] 2 Two\n\n## W2\n\n- [ ] 3 Three\n",
    entries: { 1: leaf(), 2: leaf(), 3: leaf() },
  });
  writeEpic(root, "rewrite", ["alpha", "beta"]);
  await ops.execute("plan.save", {
    id: "rewrite",
    expectedHash: store.get("plans", "rewrite").hash,
  });
  await approve(ops, "rewrite");
  assert.equal((await lint(ops, "rewrite")).counts.error, 0);

  // (3) Reads: the epic lists alpha then beta with computed progress;
  // phases come from headings; no doc: group anywhere.
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
      ["w1-core", "W1: core", 2],
      ["w2", "W2", 1],
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
    phase: "w1-core",
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
    ["w1-core", "w2"],
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

  // (6) The old forms are errors; neither folder approves.
  writeSpec(root, "old", {
    "requirements.md": "# Plan old\n\nThe goal of old.\n",
    "tasks.md": [
      "---",
      "epics: W1",
      "completion: integrated",
      "---",
      "# Tasks",
      "",
      "- [ ] 1 Parent",
      "  - $kind: epic",
      "  - $after: 1.1",
      "  - [ ] 1.1 Child",
      "    - $done: It works",
      "- [ ] 2 Grouped",
      "  - $epic: W1",
      "  - $done: It works",
      "",
    ].join("\n"),
  });
  writeSpec(root, "old-epic", {
    "requirements.md": "# Old epic\n\nThe goal.\n",
    "tasks.md":
      "---\nkind: epic\n---\n# Plans\n\n- [ ] 1 alpha\n  - $plan: alpha\n  - $repo: plans\n",
  });
  const old = await lint(ops, "old"),
    oldEpic = await lint(ops, "old-epic");
  const quality = async (name) =>
    ops.execute("plan.lint", {
      id: (
        await ops.execute("plan.create", {
          spec: name,
          context: { repositoryId: "plans" },
        })
      ).id,
    });
  const oldCodes = (await quality("old")).diagnostics.filter(
    (d) => d.severity === "error",
  );
  assert.deepEqual(oldCodes.map((d) => [d.code, d.entry ?? null]).sort(), [
    ["facts.removed-key", null],
    ["facts.removed-key", null],
    ["facts.unknown-key", null],
    ["facts.unknown-key", null],
  ]);
  const epicCodes = (await quality("old-epic")).diagnostics.filter(
    (d) => d.severity === "error",
  );
  assert.deepEqual(
    epicCodes.map((d) => [d.code, d.entry]),
    [
      ["spec.epic-task-fields", "1"],
      ["spec.epic-member-unconfirmed", "1"],
    ],
  );
  assert.ok(old.counts.error > 0 && oldEpic.counts.error > 0);
  for (const name of ["old", "old-epic"])
    await assert.rejects(
      approve(ops, name),
      /Resolve plan diagnostic (spec|facts)\./,
    );

  // (7) Changed 2026-11-18 (R108.8): batching has no setting, so a batch
  // key is refused.
  assert.throws(
    () => flowPolicy({ flow: { batch: { by: "epic" } } }),
    /flow\.batch is not a flow setting/,
  );
});
