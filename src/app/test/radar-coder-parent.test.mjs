// rc-1.3: after a plan from a source issue is projected, the source issue is
// the parent of the projected issues, carries no ready label, and its
// needs-human label is left for the person to clear. Avoozl removes the
// planning label only when `radar.clearPlanLabel` is on. Fake GitHub only.
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

const NAMESPACE = "avz_radarparent00001",
  REPO = "example/code",
  SOURCE = 7,
  READY = "ready",
  CLAIM = "crew: in progress",
  HUMAN = "crew: needs human";

// The fake GitHub plus one source issue (#7) and a search that answers with
// the issues that carry a label Avoozl reads.
class SourceGitHub extends FakeGitHub {
  constructor(labels) {
    super();
    this.created.push({
      id: 7007,
      node_id: "issue-source",
      number: SOURCE,
      repository: REPO,
      state: "open",
      labels: labels.map((name) => ({ name })),
      title: "Plan the loader",
      body: "Please plan this.",
      html_url: `https://example.test/${REPO}/issues/${SOURCE}`,
      user: { login: "owner" },
      assignees: [],
    });
    this.events.set(SOURCE, [
      {
        event: "labeled",
        label: { name: "to plan" },
        actor: { login: "owner" },
      },
    ]);
    this.permissions.set("owner", "admin");
    this.searches = 0;
  }
  repository(value) {
    const id =
      typeof value === "string" ? value : `${value.owner}/${value.repo}`;
    return Promise.resolve({
      node_id: "repo-node",
      full_name: id,
      private: true,
      default_branch: "main",
    });
  }
  async graphql(query, variables) {
    if (!/search\(/.test(query)) return {};
    this.searches += 1;
    const wanted = ["to plan", HUMAN, CLAIM],
      found = variables.q.includes("is:pr")
        ? []
        : this.created.filter((issue) =>
            issue.labels.some((label) => wanted.includes(label.name)),
          );
    return {
      search: {
        issueCount: found.length,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: found.map((issue) => ({
          __typename: "Issue",
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          createdAt: "2026-11-14T05:00:00Z",
          author: { login: issue.user?.login ?? "owner" },
          labels: { nodes: issue.labels },
          assignees: { nodes: [] },
          comments: { totalCount: 0 },
        })),
      },
    };
  }
  async listIssueComments() {
    return [];
  }
  sourceLabels() {
    return this.created
      .find((issue) => issue.number === SOURCE)
      .labels.map((label) => label.name)
      .sort();
  }
}

async function projected(
  t,
  { clearPlanLabel, coder = "issue-radar", source = true } = {},
) {
  const root = temporaryDirectory("avoozl-parent-"),
    code = temporaryDirectory("avoozl-parent-code-"),
    github = new SourceGitHub(["to plan", HUMAN]);
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
            coder,
            managedLabels: { managed: "avoozl:managed", ready: READY },
            ...(clearPlanLabel === undefined
              ? {}
              : { radar: { clearPlanLabel } }),
          },
        },
      },
    }),
  );
  writeSpec(code, "loader");
  const store = new Store(
    path.join(temporaryDirectory("avoozl-parent-db-"), "workspace.sqlite"),
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
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  return { ops, store, github, plan };
}

// Labels written to the source issue, from the fake's record.
// Approval itself writes the approval label and the claim label (RC18.4,
// RC19.1); those are covered in radar-coder-approval.test.mjs.
const APPROVAL_WRITES = ["plan approved", CLAIM];
const sourceWrites = (github) =>
  github.labels.filter(
    ([, number, label]) =>
      number === SOURCE && !APPROVAL_WRITES.includes(label),
  );

const rows = async (ops) =>
  (await ops.execute("conflicts.view", {})).items.filter((item) =>
    String(item.id).startsWith("radar-source:"),
  );

test("the source issue is the parent of the projected issues, with no plan issue", async (t) => {
  const { ops, github, plan } = await projected(t);
  await ops.execute("github.project", { planId: plan.id });
  const children = github.created.filter((issue) => issue.number !== SOURCE);
  // The package and its two leaves; no extra plan issue.
  assert.equal(children.length, 3);
  const package_ = children.find((issue) =>
    /^Load and validate/.test(issue.title),
  );
  assert.deepEqual(
    github.subIssues.filter(([parent]) => parent === SOURCE),
    [[SOURCE, package_.id]],
  );
  // The source never gets the ready label.
  assert.ok(!github.sourceLabels().includes(READY));
  // Projecting again links nothing twice.
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(
    github.subIssues.filter(([parent]) => parent === SOURCE).length,
    1,
  );
});

test("Avoozl writes no label on the source by default", async (t) => {
  const { ops, github, plan } = await projected(t);
  await ops.execute("github.project", { planId: plan.id });
  await ops.execute("workspace.tick", { sessions: [] });
  assert.deepEqual(sourceWrites(github), []);
  assert.deepEqual(
    github.sourceLabels().filter((name) => !APPROVAL_WRITES.includes(name)),
    ["crew: needs human", "to plan"],
  );
});

test("clearPlanLabel on removes only the planning label, once", async (t) => {
  const { ops, github, plan } = await projected(t, { clearPlanLabel: true });
  for (let round = 0; round < 3; round++) {
    await ops.execute("github.project", { planId: plan.id });
    await ops.execute("workspace.tick", { sessions: [] });
  }
  assert.deepEqual(sourceWrites(github), [["remove", SOURCE, "to plan"]]);
  // The claim and needs-human labels are never written.
  assert.deepEqual(
    github.sourceLabels().filter((name) => !APPROVAL_WRITES.includes(name)),
    [HUMAN],
  );
});

test("one Needs you row says to clear the needs-human label, once across three ticks", async (t) => {
  const { ops, github, plan } = await projected(t);
  await ops.execute("github.project", { planId: plan.id });
  for (let tick = 0; tick < 3; tick++) {
    await ops.execute("workspace.tick", { sessions: [] });
    const found = await rows(ops);
    assert.equal(found.length, 1, `tick ${tick + 1}`);
    assert.match(found[0].title, /clear its needs-human label/);
    assert.equal(found[0].issue.number, SOURCE);
  }
  // The planned source is not offered for planning again, nor listed twice.
  const view = await ops.execute("untriaged.view", {});
  assert.deepEqual([view.items.length, view.withRadar.length], [0, 0]);
  // The person clears the label; the row goes and Avoozl wrote nothing.
  github.created.find((issue) => issue.number === SOURCE).labels = [
    { name: "to plan" },
  ];
  await ops.execute("untriaged.view", { refresh: true });
  assert.deepEqual(await rows(ops), []);
  assert.deepEqual(sourceWrites(github), []);
});

test("a plan with no source, or a worker-coded repository, keeps its plan issue", async (t) => {
  for (const options of [{ source: false }, { coder: "worker" }]) {
    const { ops, github, plan } = await projected(t, options);
    await ops.execute("github.project", { planId: plan.id });
    const titles = github.created
      .filter((issue) => issue.number !== SOURCE)
      .map((issue) => issue.title);
    assert.equal(titles.length, 4, JSON.stringify(options));
    assert.deepEqual(
      github.subIssues.filter(([parent]) => parent === SOURCE),
      [],
    );
    assert.equal((await rows(ops)).length, 0);
  }
});
