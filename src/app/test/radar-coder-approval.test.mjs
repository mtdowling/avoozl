// rc-18.2, rc-18.3 and rc-19.1: approve on the issue, one approval record with
// write-back, and the claim at approval. Fake GitHub only: nothing is written
// to a real issue and no plan is approved in a real workspace.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_radarapproval001",
  REPO = "example/code",
  SOURCE = 7,
  APPROVAL = "avoozl:plan-approved",
  CLAIM = "crew: in progress";

class ApprovalGitHub extends FakeGitHub {
  constructor() {
    super();
    this.created.push({
      id: 7007,
      node_id: "issue-source",
      number: SOURCE,
      repository: REPO,
      state: "open",
      labels: [{ name: "avoozl:plan" }],
      title: "Plan the loader",
      body: "Please plan this.",
      html_url: `https://example.test/${REPO}/issues/${SOURCE}`,
      user: { login: "owner" },
      assignees: [],
    });
    this.permissions.set("owner", "admin");
    this.failComments = false;
  }
  available() {
    return true;
  }
  listIssueComments(_repository, number) {
    return Promise.resolve(
      structuredClone(this.comments.filter((c) => c.number === number)),
    );
  }
  createIssueComment(repository, number, body) {
    if (this.failComments) return Promise.reject(new Error("comments are off"));
    return super.createIssueComment(repository, number, body);
  }
  labelNames() {
    return this.created
      .find((issue) => issue.number === SOURCE)
      .labels.map((label) => label.name)
      .sort();
  }
  // A person adds the approval label.
  labeledBy(login, label = APPROVAL) {
    this.addLabels(REPO, SOURCE, [label]);
    this.events.set(SOURCE, [
      ...(this.events.get(SOURCE) || []),
      { event: "labeled", label: { name: label }, actor: { login } },
    ]);
  }
  writes() {
    return this.labels.filter(([, number]) => number === SOURCE);
  }
}

function workspace(t, { source = true, spec = {} } = {}) {
  const root = temporaryDirectory("avoozl-approval-"),
    code = temporaryDirectory("avoozl-approval-code-"),
    github = new ApprovalGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["owner"],
            coder: "issue-radar",
            managedLabels: { managed: "avoozl:managed", ready: "ready" },
          },
        },
      },
    }),
  );
  writeSpec(code, "loader", spec);
  const store = new Store(
    path.join(temporaryDirectory("avoozl-approval-db-"), "workspace.sqlite"),
  );
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github,
    operator: "Owner",
    workspaceRoot: root,
  });
  return {
    ops,
    store,
    github,
    async draft() {
      await ops.execute("github.configure", {
        repository: REPO,
        projectId: "code",
        allowedActors: ["owner"],
      });
      const plan = await ops.execute("plan.create", {
        spec: "loader",
        context: {
          projectId: "code",
          ...(source
            ? { newPlan: { source: { repository: REPO, number: SOURCE } } }
            : {}),
        },
      });
      return plan;
    },
    approve: (plan, extra = {}) =>
      ops.execute("plan.approve", {
        id: plan.id,
        expectedHash: plan.hash,
        expectedRevision: store.read().revision,
        ...extra,
      }),
    tick: () => ops.execute("workspace.tick", { sessions: [] }),
    approvals: () => store.list("approvals"),
    rows: async () =>
      (await ops.execute("conflicts.view", {})).items.filter((item) =>
        /^approval-/.test(String(item.id)),
      ),
    markers: () =>
      github.comments.filter((comment) =>
        /<!-- avoozl-approval /.test(comment.body),
      ),
    claims: () =>
      github.comments.filter((comment) =>
        /<!-- kirocrew-crew /.test(comment.body),
      ),
  };
}

test("an allowed labeler approves the plan, and it ends in one record and no write-back", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  w.github.labeledBy("owner");
  for (let round = 0; round < 3; round += 1) await w.tick();
  assert.equal(w.approvals().length, 1);
  assert.equal(w.approvals()[0].planId, plan.id);
  // The label approved it: Avoozl wrote no label (the one add is the person's)
  // and no approval comment.
  assert.equal(
    w.github.writes().filter(([, , label]) => label === APPROVAL).length,
    1,
  );
  assert.equal(w.markers().length, 0);
  assert.deepEqual(await w.rows(), []);
});

test("a stranger's label is removed with one row across three ticks, and approves nothing", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  w.github.labeledBy("stranger");
  for (let round = 0; round < 3; round += 1) await w.tick();
  assert.equal(w.approvals().length, 0);
  assert.equal(w.github.labelNames().includes(APPROVAL), false);
  const rows = await w.rows();
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /stranger/);
  assert.equal(rows[0].issue.number, SOURCE);
  // The same stranger again is the same row.
  w.github.labeledBy("stranger");
  await w.tick();
  assert.equal((await w.rows()).length, 1);
  assert.equal(w.approvals().length, 0);
  assert.ok(plan.id);
});

test("a label whose labeler cannot be read is removed too", async (t) => {
  const w = workspace(t);
  await w.draft();
  w.github.addLabels(REPO, SOURCE, [APPROVAL]);
  await w.tick();
  assert.equal(w.github.labelNames().includes(APPROVAL), false);
  assert.equal((await w.rows()).length, 1);
  assert.equal(w.approvals().length, 0);
});

test("a plan with lint errors is not approved by the label", async (t) => {
  const w = workspace(t, { spec: { "tasks.md": "# Tasks\n" } });
  await w.draft();
  w.github.labeledBy("owner");
  await w.tick();
  assert.equal(w.approvals().length, 0);
  assert.deepEqual(await w.rows(), []);
});

test("removing the label after approval changes nothing", async (t) => {
  const w = workspace(t);
  await w.draft();
  w.github.labeledBy("owner");
  await w.tick();
  assert.equal(w.approvals().length, 1);
  await w.github.removeLabel(REPO, SOURCE, APPROVAL);
  await w.tick();
  await w.tick();
  assert.equal(w.approvals().length, 1);
  assert.deepEqual(await w.rows(), []);
});

test("approving in Avoozl writes the label and one marker comment back, once", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  await w.approve(plan);
  assert.equal(w.approvals().length, 1);
  assert.ok(w.github.labelNames().includes(APPROVAL));
  assert.equal(w.markers().length, 1);
  const body = w.markers()[0].body;
  assert.match(
    body,
    /<!-- avoozl-approval v=1 approver=Owner spec=\.kiro\/specs\/loader commit=none at=\S+ instance=inst-[0-9a-f]{12} -->/,
  );
  // No spec text.
  assert.doesNotMatch(body, /Load configuration|loader, then/);
  // A second approval of the same revision is a no-op.
  const writes = w.github.writes().length,
    comments = w.github.comments.length;
  await w.approve(plan);
  await w.tick();
  assert.equal(w.approvals().length, 1);
  assert.equal(w.github.writes().length, writes);
  assert.equal(w.github.comments.length, comments);
});

test("a failed write-back leaves the approval and raises one row", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  w.github.failComments = true;
  await w.approve(plan);
  for (let round = 0; round < 3; round += 1) await w.tick();
  assert.equal(w.approvals().length, 1);
  const rows = await w.rows();
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /was not updated/);
});

test("a plan with no source issue writes nothing and raises no row", async (t) => {
  const w = workspace(t, { source: false }),
    plan = await w.draft();
  await w.approve(plan);
  await w.tick();
  assert.equal(w.approvals().length, 1);
  assert.deepEqual(w.github.writes(), []);
  assert.equal(w.github.comments.length, 0);
  assert.deepEqual(await w.rows(), []);
});

test("approval claims the parent once, in Radar's format, naming Avoozl", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  await w.approve(plan);
  assert.ok(w.github.labelNames().includes(CLAIM));
  assert.equal(w.claims().length, 1);
  const claim = w.claims()[0].body;
  assert.match(
    claim,
    /<!-- kirocrew-crew v=1 id=avoozl phase=awaiting-merge updated=\S+ -->/,
  );
  await w.approve(plan);
  await w.tick();
  assert.equal(w.claims().length, 1);
  assert.equal(
    w.github.writes().filter(([, , label]) => label === CLAIM).length,
    1,
  );
});

test("a parent a crew already holds gets no claim and one Trace note", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  w.github.comments.push({
    id: 900,
    number: SOURCE,
    body: "👻 **Crew**\n\n<!-- kirocrew-crew v=1 id=crew-9 phase=implementing updated=2026-11-14T10:00:00Z -->",
  });
  await w.approve(plan);
  await w.tick();
  assert.equal(w.claims().length, 1, "only the crew's own comment");
  assert.equal(w.github.labelNames().includes(CLAIM), false);
  const notes = w.store.db
    .prepare("SELECT kind FROM activity_log WHERE kind = ?")
    .all("approval.claim-skipped");
  assert.equal(notes.length, 1);
});

test("a superseded plan removes only Avoozl's own claim", async (t) => {
  const w = workspace(t),
    plan = await w.draft();
  await w.approve(plan);
  assert.ok(w.github.labelNames().includes(CLAIM));
  w.store.put("plans", {
    ...w.store.get("plans", plan.id),
    archivedAt: new Date().toISOString(),
  });
  await w.tick();
  assert.equal(w.github.labelNames().includes(CLAIM), false);
  // A crew's claim that appears later is left alone by a second pass.
  w.github.addLabels(REPO, SOURCE, [CLAIM]);
  w.github.comments.push({
    id: 901,
    number: SOURCE,
    body: "<!-- kirocrew-crew v=1 id=crew-9 phase=implementing updated=2026-11-14T10:00:00Z -->",
  });
  await w.tick();
  assert.ok(w.github.labelNames().includes(CLAIM));
});
