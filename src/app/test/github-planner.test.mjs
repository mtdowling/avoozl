// The tick starts the planner for an issue a deliver rule matched (the gap
// proof P12 found): one breakdown session per trigger event, one critique per
// drafted revision, none for a leaf, and none twice across ticks or restarts.
// GitHub and Kiro Crew are fakes; the fake Kiro Crew does what
// kirocrew-app/crons/tick.py does with each dispatch.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { issueSpecName, PLANNER_AGENT } from "../github-planner.mjs";
import { readSpecFolder } from "../spec-plans.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const REPO = "example/code",
  TRIGGER = "agent:build",
  SPEC = issueSpecName(REPO, 7);
let clock = Date.now() + 60_000;
const later = () => new Date((clock += 60_000)).toISOString();

function labelEvent(github, number, id) {
  const events = github.events.get(number) || [];
  events.push({
    id,
    node_id: `label-${number}-${id}`,
    event: "labeled",
    label: { name: TRIGGER },
    actor: { login: "maintainer" },
    created_at: later(),
  });
  github.events.set(number, events);
}

function setup(t) {
  const root = temporaryDirectory("avoozl-planner-"),
    code = temporaryDirectory("avoozl-planner-code-"),
    file = path.join(temporaryDirectory("avoozl-planner-db-"), "w.sqlite"),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_plannerplannerp1",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            managedLabels: { managed: "agent:managed", ready: "agent:ready" },
            rules: [
              {
                id: "build",
                action: "deliver",
                labelsAll: [TRIGGER],
                autoPublishChildren: true,
              },
            ],
          },
        },
      },
    }),
  );
  github.permissions.set("maintainer", "write");
  github.closingPullRequests = async () => [];
  github.checkRuns = async () => [];
  github.commitStatus = async () => ({ statuses: [] });
  const issue = {
    id: 7,
    node_id: "issue-node-7",
    number: 7,
    repository: REPO,
    state: "open",
    title: "Ship configuration loading",
    body: "Load and validate config.json.",
    html_url: `https://example.test/${REPO}/issues/7`,
    assignees: [],
    labels: [{ name: TRIGGER }],
  };
  github.created.push(issue);
  github.issues = [issue];
  labelEvent(github, 7, 99);
  const state = { store: null, ops: null };
  // A fresh Store and Operations on the same database file: a restart.
  state.open = async () => {
    state.store?.close();
    state.store = new Store(file);
    state.ops = new Operations(state.store, {
      github,
      operator: "Operator",
      workspaceRoot: root,
    });
  };
  t.after(() => state.store?.close());
  return { state, github, code, root };
}

async function openWorkspace(t) {
  const workspace = setup(t),
    { state, code } = workspace;
  await state.open();
  state.store.importSnapshot(snapshot());
  state.store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  await state.ops.execute("github.configure", {
    repository: REPO,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  return workspace;
}

// Kiro Crew keys a session by its title and hands back the existing one.
function fakeKiroCrew(state) {
  const sessions = new Map();
  return {
    sessions,
    async tick({ bind = true } = {}) {
      const roster = [...sessions.values()].map((s) => ({
          target: s.slot,
          status: s.status,
        })),
        intents = await state.ops.execute("workspace.tick", {
          sessions: roster,
        });
      if (!bind) return intents;
      for (const d of intents.dispatch) {
        let session = sessions.get(d.title);
        if (!session) {
          session = {
            slot: `slot-${sessions.size + 1}`,
            agent: d.agent,
            status: "working",
            briefs: [],
          };
          sessions.set(d.title, session);
        }
        await state.ops.execute("session.bind", {
          taskId: d.task,
          slot: session.slot,
          title: d.title,
          source: "tick",
          role: d.role,
          attempt: d.attempt,
        });
        session.briefs.push(d.brief);
      }
      return intents;
    },
  };
}

const planners = (intents) =>
  intents.dispatch.filter((d) => d.role === "planner");
const sourceTask = (store) =>
  store.read().tasks.find((task) => task.github?.number === 7);
const caller = (session) => ({
  caller: { sessionKey: `dashboard:${session.slot}` },
});

test("a matched issue gets one planner, then one critique, then publishes", async (t) => {
  const { state, github, code } = await openWorkspace(t),
    crew = fakeKiroCrew(state);

  let intents = await crew.tick();
  const [start] = planners(intents);
  assert.equal(planners(intents).length, 1);
  assert.equal(start.agent, PLANNER_AGENT);
  assert.equal(start.checkout, code);
  assert.match(start.title, /^avoozl:\S+ plan example\/code#7$/);
  assert.match(start.brief, /Mode: breakdown\./);
  assert.match(start.brief, new RegExp(`\\.kiro/specs/${SPEC}/`));
  assert.match(start.brief, /Ship configuration loading/);
  assert.equal(sourceTask(state.store).dispatch.ready, false, "held");
  assert.equal(sourceTask(state.store).dispatch.state, "classifying");

  // The next tick starts nothing new.
  intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(crew.sessions.size, 1);

  // The planner session classifies and drafts its own issue.
  const [planner] = crew.sessions.values();
  await state.ops.execute(
    "github.breakdown.classify",
    {
      repository: REPO,
      number: 7,
      kind: "broad",
      reason: "Two leaves: reading and validating.",
    },
    undefined,
    caller(planner),
  );
  writeSpec(code, SPEC);
  await state.ops.execute(
    "github.breakdown.draft",
    { repository: REPO, number: 7, spec: SPEC },
    undefined,
    caller(planner),
  );

  // Waiting for a critique: one isolated critique session for this revision.
  intents = await crew.tick();
  const { hash } = readSpecFolder(code, SPEC),
    [critic] = planners(intents);
  assert.equal(planners(intents).length, 1);
  assert.match(critic.brief, /Mode: critique\./);
  assert.ok(critic.brief.includes(hash), "names the revision");
  assert.notEqual(critic.title, start.title, "a new session");
  intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(crew.sessions.size, 2);

  fs.writeFileSync(
    path.join(code, ".kiro", "specs", SPEC, "avoozl", "critique.md"),
    `Reviewed: .kiro/specs/${SPEC}/ ${hash}\n\nNo findings.\n`,
  );
  intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(github.subIssues.length, 2, "children published");

  // A published child is a leaf of the plan: a trigger on it starts nothing.
  const child = github.created[1];
  child.labels.push({ name: TRIGGER });
  labelEvent(github, child.number, 500);
  intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(crew.sessions.size, 2);
});

test("a bounded answer starts no critique, and a classified issue no planner", async (t) => {
  const { state } = await openWorkspace(t),
    crew = fakeKiroCrew(state);
  await crew.tick();
  const [planner] = crew.sessions.values();
  await state.ops.execute(
    "github.breakdown.classify",
    { repository: REPO, number: 7, kind: "bounded", reason: "One leaf." },
    undefined,
    caller(planner),
  );
  const intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(crew.sessions.size, 1);
  assert.equal(sourceTask(state.store).dispatch.ready, true, "its own leaf");
});

test("an issue already classified gets no planner", async (t) => {
  const { state } = await openWorkspace(t),
    crew = fakeKiroCrew(state);
  await state.ops.execute("github.sync");
  await state.ops.execute("github.breakdown.classify", {
    repository: REPO,
    number: 7,
    kind: "bounded",
    reason: "One leaf.",
  });
  const intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(crew.sessions.size, 0);
});

test("a restart starts no second planner, bound or not", async (t) => {
  const { state } = await openWorkspace(t),
    crew = fakeKiroCrew(state);
  // The cron dies after the tick returns, before it opens anything.
  const first = await crew.tick({ bind: false });
  assert.equal(planners(first).length, 1);
  await state.open();
  // The start repeats until bound, under the same title: one session.
  let intents = await crew.tick();
  assert.deepEqual(
    planners(intents).map((d) => d.title),
    planners(first).map((d) => d.title),
  );
  assert.equal(crew.sessions.size, 1);
  await state.open();
  intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(crew.sessions.size, 1);
});

test("a planner may classify only its own issue", async (t) => {
  const { state, github } = await openWorkspace(t),
    crew = fakeKiroCrew(state);
  const other = {
    ...structuredClone(github.created[0]),
    id: 8,
    node_id: "issue-node-8",
    number: 8,
    title: "Another issue",
  };
  github.created.push(other);
  github.issues.push(other);
  labelEvent(github, 8, 98);
  await crew.tick();
  const first = [...crew.sessions.values()][0],
    task = state.store
      .read()
      .tasks.find(
        (entry) =>
          entry.id ===
          state.store
            .list("session_bindings")
            .find((b) => b.slot === first.slot).taskId,
      ),
    foreign = task.github.number === 7 ? 8 : 7;
  await assert.rejects(
    state.ops.execute(
      "github.breakdown.classify",
      { repository: REPO, number: foreign, kind: "broad", reason: "No." },
      undefined,
      caller(first),
    ),
    /only the issue it was started for/,
  );
});

test("a planner that ends without classifying asks once and holds the issue", async (t) => {
  const { state, github } = await openWorkspace(t),
    crew = fakeKiroCrew(state);
  await crew.tick();
  const [planner] = crew.sessions.values();
  planner.status = "closed";
  let intents = await crew.tick();
  assert.deepEqual(planners(intents), []);
  assert.equal(
    intents.notify.filter((n) => n.channel === "decision").length,
    1,
  );
  assert.equal(sourceTask(state.store).dispatch.ready, false);
  intents = await crew.tick();
  assert.deepEqual(intents.notify, [], "asked once");
  assert.deepEqual(planners(intents), []);

  // A new trigger event plans it again, in a new session.
  github.events.set(7, []);
  labelEvent(github, 7, 200);
  intents = await crew.tick();
  assert.equal(planners(intents).length, 1);
  assert.equal(crew.sessions.size, 2);
});
