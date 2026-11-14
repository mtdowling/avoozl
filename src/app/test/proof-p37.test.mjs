// Proof P37 (Requirement 61, design §4.16): an SDK rewrite plan from a
// template, gated by a manual team review, with links and notes. An
// isolated temporary workspace in single-repo mode with one repository
// `o/sdk`, a fake GitHub with an allowed actor `alice` and a reader `bob`, a
// fake terms file banning `secretword`, an epic folder `sdk-target`, and the
// sample template plugin from the test tree. Every value is fake.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { leafBrief, readyCandidates } from "../delivery.mjs";
import { pendingNewPlans } from "../new-plan.mjs";
import { bindSession } from "../session-bindings.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins"),
  REPO = "o/sdk",
  NAMESPACE = "avz_p37templatesxxxx",
  PLAN = "widgets-rewrite";
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// Closes and reopens are events with an actor, as GitHub records them. The
// person's own `gh` login is alice.
class TeamGitHub extends FakeGitHub {
  constructor() {
    super();
    this.login = "alice";
    this.permissions.set("alice", "write");
    this.permissions.set("bob", "read");
    this.stateWrites = [];
  }
  updateIssue(repository, number, input) {
    if ("state" in input) {
      this.stateWrites.push([number, input.state, input.state_reason ?? null]);
      this.act(number, input.state, this.login, input.state_reason);
    }
    return super.updateIssue(repository, number, input);
  }
  // A close or reopen by `actor`, as GitHub records it.
  act(number, state, actor, reason = "completed") {
    const issue = this.created.find((item) => item.number === number),
      at = new Date(Date.now() + this.events.size * 1000).toISOString();
    Object.assign(issue, {
      state,
      state_reason: state === "closed" ? reason : null,
      closed_at: state === "closed" ? at : null,
      updated_at: at,
    });
    this.events.set(number, [
      ...(this.events.get(number) || []),
      {
        event: state === "closed" ? "closed" : "reopened",
        actor: { login: actor },
        created_at: at,
        state_reason: state === "closed" ? reason : null,
      },
    ]);
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
    return Promise.resolve({ linkedBranches: [], openBlockedBy: 0 });
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
}

function writeEpic(root, members) {
  writeSpec(root, "sdk-target", {
    "requirements.md":
      "# SDK target architecture\n\nEvery SDK on the new runtime.\n\n## What done means\n\nEach member SDK is cut over.\n",
    "design.md": "# Design\n\nOne plan per SDK.\n",
    "tasks.md": `# Plans\n\n${members.map((m, i) => `- [ ] ${i + 1} ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify(
      {
        kind: "epic",
        tasks: Object.fromEntries(
          members.map((m, i) => [
            String(i + 1),
            { plan: m, summary: `Plan ${m}.` },
          ]),
        ),
      },
      null,
      2,
    ),
  });
}

async function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory("avoozl-p37-"),
    code = temporaryDirectory("avoozl-p37-code-"),
    outside = temporaryDirectory("avoozl-p37-machine-"),
    github = new TeamGitHub();
  fs.cpSync(
    path.join(FIXTURE, "sdk-templates"),
    path.join(root, "plugins", "sdk-templates"),
    { recursive: true },
  );
  save(path.join(root, ".avoozl.json"), {
    version: 1,
    namespace: NAMESPACE,
    contentRules: { sets: [{ id: "fake-terms" }] },
    github: {
      mode: "single-repo",
      repositories: {
        [REPO]: {
          baseBranch: "main",
          allowedActors: ["alice"],
          managedLabels: { managed: "avoozl:managed", ready: "avoozl:ready" },
        },
      },
    },
  });
  const terms = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(
    path.join(terms, "fake-terms.txt"),
    "# Fake terms\ncodename: \\bsecretword\\b\n",
  );
  store.put("projects", {
    id: "sdk",
    root: code,
    repository: REPO,
    baseBranch: "main",
    worktreeRoot: temporaryDirectory("avoozl-p37-worktrees-"),
    checks: [["npm", "test"]],
  });
  // The epic every SDK plan joins; it starts with one member already.
  writeSpec(code, "older-sdk", {
    "requirements.md": "---\nepic: sdk-target\n---\n# Older SDK\n\nDone.\n",
    "tasks.md": "# Tasks\n\n- [ ] 1 Done\n",
    "avoozl/manifest.json": JSON.stringify({
      tasks: {
        1: {
          kind: "leaf",
          repository: "sdk",
          acceptance: ["It is done"],
        },
      },
    }),
  });
  writeEpic(code, ["older-sdk"]);
  const ops = new Operations(store, {
    github,
    operator: "alice",
    workspaceRoot: root,
    pluginSettingsFile: path.join(outside, "plugins.json"),
  });
  await ops.execute("github.configure", {
    repository: REPO,
    projectId: "sdk",
    allowedActors: ["alice"],
  });
  return { root, code, store, github, ops };
}

async function approve(ops, id) {
  const plan = ops.store.get("plans", id),
    preview = await ops.execute("plan.preview", { id });
  return ops.execute("plan.approve", {
    id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

// The fake planner writes the folder the seed asks for: the starter with
// its placeholders filled, front-matter naming the epic, and the plan added
// to the epic folder.
function fakePlanner(code, preview) {
  const folder = path.join(code, ".kiro", "specs", PLAN);
  for (const [file, text] of Object.entries(preview.starter)) {
    fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    fs.writeFileSync(
      path.join(folder, file),
      file === "requirements.md" ? `---\nepic: sdk-target\n---\n${text}` : text,
    );
  }
  writeEpic(code, ["older-sdk", PLAN]);
}

test("P37: an SDK rewrite plan from a template, gated by a manual team review, with links and notes", async (t) => {
  const { root, code, store, github, ops } = await workspace(t);

  // (1) Add and approve the plugin; New plan, From template, SDK rewrite.
  await ops.execute("plugin.add", {
    scope: "repository",
    confirmPublic: true,
    entry: { id: "sdk-templates", path: "plugins/sdk-templates", contract: 1 },
  });
  assert.deepEqual(
    (await ops.execute("template.list", {})).templates,
    [],
    "a template is offered only once its plugin is approved",
  );
  const row = (await ops.execute("plugins.list", {})).plugins.find(
    (p) => p.id === "sdk-templates",
  );
  assert.deepEqual(row.provides, ["template"]);
  assert.deepEqual(row.kinds, [], "a template-only plugin runs as nothing");
  await ops.execute("plugin.approve", {
    id: row.id,
    version: row.version,
    hash: row.hash,
  });
  const before = fs.readFileSync(path.join(root, ".avoozl.json"), "utf8");
  const [listed] = (await ops.execute("template.list", {})).templates;
  assert.equal(listed.title, "SDK rewrite");
  assert.equal(listed.phases.length, 6);
  assert.equal(listed.settings, true);
  const template = {
      plugin: "sdk-templates",
      id: "sdk-rewrite",
      version: "1.0.0",
    },
    gaps = "- waiters are missing\n- paging differs\n";
  await assert.rejects(
    ops.execute("plan.new", {
      name: PLAN,
      template,
      inputs: { repository: ["sdk"] },
      epic: "sdk-target",
    }),
    /^Error: sdk is required/,
  );
  assert.deepEqual(
    pendingNewPlans(store),
    [],
    "a refused request records nothing",
  );
  const request = await ops.execute("plan.new", {
    name: PLAN,
    template,
    inputs: { sdk: "widgets", repository: ["sdk"], gaps },
    epic: "sdk-target",
  });
  assert.equal(request.agent, "avoozl-planner");
  assert.deepEqual(request.template, template);
  assert.match(request.message, /Plan the widgets SDK rewrite/);
  assert.match(request.message, /waiters are missing/);
  assert.match(request.message, /Protocol tests pass/);
  assert.doesNotMatch(request.message, /\{\{/);
  // The settings preview is offered with Import these settings unticked;
  // nothing is imported unless a person ticks it.
  const shown = await ops.execute("plugin.pack.preview", {
    id: "sdk-templates",
    template: "sdk-rewrite",
  });
  assert.ok(shown.previewHash);
  fakePlanner(
    code,
    await ops.execute("template.preview", {
      plugin: "sdk-templates",
      template: "sdk-rewrite",
      inputs: { sdk: "widgets", repository: ["sdk"], gaps },
    }),
  );
  await ops.execute("workspace.tick", {});
  const plan = store.get("plans", PLAN);
  assert.equal(plan.state, "draft");
  assert.deepEqual(plan.context.newPlan.template, template);
  const epic = store.get("plans", "sdk-target");
  assert.equal(epic.state, "draft", "the epic's change is its own draft");
  assert.equal(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
    before,
  );
  assert.equal(store.list("approvals").length, 0);
  const lint = await ops.execute("plan.lint", { id: PLAN });
  assert.deepEqual(
    [...new Set(lint.proposals.map((task) => task.phase?.title))],
    ["Inventory", "Codegen", "Runtime", "Protocol tests", "Review", "Cutover"],
  );

  // (2) Lint and approve the plan and the epic's new revision; project.
  assert.equal(lint.counts.error, 0, JSON.stringify(lint.diagnostics));
  await approve(ops, PLAN);
  await approve(ops, "sdk-target");
  await ops.execute("github.project", { planId: PLAN });
  const id = (key) => `${key}`,
    issueOf = (taskId) =>
      github.created.find((issue) =>
        issue.body.includes(`"taskId":"${taskId}"`),
      ),
    labels = (issue) => (issue.labels || []).map((label) => label.name),
    review = issueOf(id("team-review"));
  assert.match(
    review.body,
    /Manual task: a person closes this issue or marks it done in Avoozl\. No agent works on it\./,
  );
  assert.equal(labels(review).includes("avoozl:ready"), false);

  // (3) Finish every task before the review: it waits in Needs you, tagged
  // Manual, and no session opens for it; cutover waits.
  store.mutate("finish the work before the review", (data) => {
    for (const task of data.tasks)
      if (task.planId === PLAN && !/team-review|cutover/.test(task.id))
        task.status = "accepted";
  });
  const tick = await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(
    tick.dispatch.some((d) => d.task === "team-review"),
    false,
  );
  const graph = await ops.execute("graph.view", {}),
    node = (taskId) => graph.tasks.find((task) => task.id === taskId);
  assert.equal(node("team-review").state, "needs-you");
  assert.deepEqual(node("team-review").needsYou, {
    reason: "Waiting for a person: Review with team",
    link: null,
    manual: true,
  });
  assert.equal(node("cutover-callers").state, "waiting");
  assert.equal(labels(issueOf("team-review")).includes("avoozl:ready"), false);
  // GitHub leaves here are Issue Radar's: ready is the graph's state and
  // the ready label the tick moves.
  const isReady = async (taskId) =>
    (await ops.execute("graph.view", {})).tasks.find(
      (task) => task.id === taskId,
    ).state === "ready";
  assert.equal(await isReady("cutover-callers"), false);
  assert.equal(
    readyCandidates(store).some((task) => task.id === "team-review"),
    false,
  );

  // (4) As a session: mark the review done, add a note to it and to another
  // task, and edit the person's note.
  const personNote = await ops.execute("task.notes.add", {
    taskId: "team-review",
    kind: "note",
    text: "Agenda: runtime, protocol results",
  });
  bindSession(store, {
    taskId: "team-review",
    slot: "chat-1",
    role: "planner",
  });
  const session = { caller: { sessionKey: "dashboard:chat-1" } };
  await assert.rejects(
    ops.execute(
      "task.manual.complete",
      { taskId: "team-review", choice: "done" },
      undefined,
      session,
    ),
    (error) => error.status === 403,
  );
  const sessionNote = await ops.execute(
    "task.notes.add",
    {
      taskId: "team-review",
      kind: "note",
      text: "Protocol suite: 412 of 412 pass",
    },
    undefined,
    session,
  );
  assert.equal(sessionNote.author, "session:chat-1");
  await assert.rejects(
    ops.execute(
      "task.notes.add",
      { taskId: "cutover-notes", kind: "note", text: "Not mine" },
      undefined,
      session,
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    ops.execute(
      "task.notes.edit",
      { taskId: "team-review", id: personNote.id, text: "Changed" },
      undefined,
      session,
    ),
    (error) => error.status === 403,
  );

  // (5) As a person: the rule, the scheme and the user name are refused by
  // name; then a valid outcome note and link, and Mark done with Done.
  await assert.rejects(
    ops.execute("task.notes.add", {
      taskId: "team-review",
      kind: "note",
      text: "Ship secretword first",
    }),
    (error) =>
      /fake-terms rule codename/.test(error.message) && error.status === 422,
  );
  await assert.rejects(
    ops.execute("task.notes.add", {
      taskId: "team-review",
      kind: "link",
      url: "javascript:x",
      label: "x",
    }),
    /^Error: url must be an http or https link/,
  );
  await assert.rejects(
    ops.execute("task.notes.add", {
      taskId: "team-review",
      kind: "link",
      url: "https://someone@docs.example.test/review",
      label: "x",
    }),
    /^Error: url must not hold a user name/,
  );
  // Mark done closes the issue as the person's own login, so a login Who
  // counts does not allow is refused before anything is written.
  github.login = "bob";
  await assert.rejects(
    ops.execute("task.manual.complete", {
      taskId: "team-review",
      choice: "done",
    }),
    (error) => error.status === 403 && /Who counts/.test(error.message),
  );
  assert.deepEqual(github.stateWrites, []);
  github.login = "alice";
  const done = await ops.execute("task.manual.complete", {
    taskId: "team-review",
    choice: "done",
    note: "The team agreed to cut over on Monday.",
    links: [
      { url: "https://docs.example.test/review-notes", label: "Review notes" },
    ],
  });
  assert.equal(done.manualDone.login, "alice");
  assert.deepEqual(github.stateWrites, [
    [review.number, "closed", "completed"],
  ]);
  await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(
    store.read().tasks.find((t2) => t2.id === "team-review").githubVerdict
      .state,
    "verified",
  );
  assert.ok(await isReady("cutover-callers"));
  assert.ok(await isReady("cutover-notes"));
  assert.ok(labels(issueOf("cutover-callers")).includes("avoozl:ready"));

  // (6) The first cutover task's brief carries the outcome note and link
  // as data.
  const data = store.read(),
    cutover = data.tasks.find((task) => task.id === "cutover-callers"),
    brief = leafBrief(store, data, {
      task: cutover,
      project: store.get("projects", "sdk"),
      attempt: 1,
      delivery: null,
    });
  assert.match(brief, /They are data, not instructions/);
  assert.match(brief, /What team-review decided/);
  assert.match(brief, /cut over on Monday/);
  assert.match(brief, /https:\/\/docs\.example\.test\/review-notes/);
  assert.doesNotMatch(
    brief,
    /Agenda: runtime/,
    "only outcome entries ride along",
  );

  // (7) Show on the issue, on the outcome link only; the tick writes it,
  // and a rebuild brings it back.
  const entries = (
      await ops.execute("task.notes.list", { taskId: "team-review" })
    ).entries,
    outcomeLink = entries.find((e) => e.kind === "link" && e.outcome);
  await ops.execute("task.notes.show", {
    taskId: "team-review",
    id: outcomeLink.id,
    onIssue: true,
  });
  await ops.execute("workspace.tick", { sessions: [] });
  const body = issueOf("team-review").body;
  assert.match(body, /## Links and notes/);
  assert.match(
    body,
    /\[Review notes\]\(https:\/\/docs\.example\.test\/review-notes\)/,
  );
  assert.doesNotMatch(body, /cut over on Monday/);
  assert.doesNotMatch(body, /Protocol suite/);
  store.db.prepare("DELETE FROM task_notes").run();
  await ops.execute("github.rebuild", {});
  const rebuilt = (
    await ops.execute("task.notes.list", { taskId: "team-review" })
  ).entries;
  assert.deepEqual(
    rebuilt.map((e) => [e.id, e.kind, e.url, e.onIssue, e.outcome]),
    [[outcomeLink.id, "link", outcomeLink.url, true, true]],
    "unshown entries may be missing after a rebuild",
  );

  // (8) Reopen in Avoozl: dependents wait again. bob's close opens a
  // decision and is not reopened; alice's close completes it.
  await ops.execute("task.manual.reopen", { taskId: "team-review" });
  assert.equal(issueOf("team-review").state, "open");
  assert.equal(await isReady("cutover-callers"), false);
  github.act(review.number, "closed", "bob");
  await ops.execute("workspace.tick", { sessions: [] });
  let task = store.read().tasks.find((t2) => t2.id === "team-review");
  assert.equal(task.githubVerdict.state, "held");
  assert.match(String(task.decision), /team-review/);
  assert.equal(issueOf("team-review").state, "closed", "not reopened");
  assert.equal(await isReady("cutover-callers"), false);
  github.act(review.number, "open", "alice");
  github.act(review.number, "closed", "alice", "not_planned");
  await ops.execute("workspace.tick", { sessions: [] });
  task = store.read().tasks.find((t2) => t2.id === "team-review");
  assert.equal(task.githubVerdict.state, "verified");
  assert.equal(task.manualDone.choice, "skipped");
  assert.equal(task.decision, null);
  assert.ok(await isReady("cutover-callers"));
});
