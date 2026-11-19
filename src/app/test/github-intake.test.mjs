// GitHub intake (Requirement 102.19, design §4.32.11): a person's Plan this
// and Deliver this on a GitHub issue, against a fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { fixRecord } from "../fix.mjs";
import {
  INTAKE_MARKER,
  closingLine,
  initialWrites,
  reusableInput,
  startGitHubItem,
  statusComment,
  watchInputs,
} from "../github-intake.mjs";
import { linkedItems } from "../untriaged.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const REPOSITORY = "o/app";

function setup(t, { checkout = true } = {}) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    policy = normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: { [REPOSITORY]: { baseBranch: "main" } },
    });
  if (checkout)
    store.put("projects", {
      id: "app",
      root: temporaryDirectory(),
      repository: REPOSITORY,
      baseBranch: "main",
      checks: [["npm", "test"]],
    });
  const open = (number, extra = {}) => {
    const issue = {
      id: number,
      node_id: `issue-${number}`,
      number,
      state: "open",
      title: `Fix ${number}`,
      body: "The parser drops the last line.",
      labels: [],
      html_url: `https://example.test/${REPOSITORY}/issues/${number}`,
      user: { login: "reporter" },
      assignees: [],
      ...extra,
    };
    github.created.push(issue);
    return issue;
  };
  github.reads = 0;
  github.graphql = async (_query, { ids }) => {
    github.reads += 1;
    return {
      nodes: ids.map((id) => {
        const issue = github.created.find((entry) => entry.node_id === id);
        return {
          id,
          state: issue?.state === "closed" ? "CLOSED" : "OPEN",
          closedByPullRequestsReferences: {
            nodes: issue?.closedByMerge ? [{ merged: true }] : [],
          },
        };
      }),
    };
  };
  const writes = () => github.labels.length + github.comments.length;
  return { store, github, policy, open, writes };
}

const task = (store, id) => store.read().tasks.find((entry) => entry.id === id);

test("Deliver this makes a bounded fix with two writes and no spec", async (t) => {
  const w = setup(t);
  w.open(12);
  const result = await startGitHubItem(w.store, w.github, w.policy, {
    id: `${REPOSITORY}#12`,
    action: "deliver",
  });
  assert.deepEqual(result.writes, ["label", "comment"]);
  assert.deepEqual(w.github.labels, [["add", 12, "crew:avoozl"]]);
  assert.equal(w.github.comments.length, 1);
  assert.equal(w.github.created.length, 1, "no spec or other issue is made");
  assert.equal(w.store.list("plans").length, 0);
  const made = task(w.store, result.taskId);
  assert.equal(made.fix.v, 2);
  assert.deepEqual(made.fix.source, {
    issue: { repository: REPOSITORY, number: 12 },
  });
  assert.equal(made.approvedSource.hash, made.fix.definition);
  assert.deepEqual(made.fix.journal, { repository: REPOSITORY, number: 12 });
  assert.deepEqual(made.acceptance, made.fix.acceptance);
  assert.equal(
    made.fix.definition,
    fixRecord({
      issue: { repository: REPOSITORY, number: 12 },
      title: "Fix 12",
      body: "The parser drops the last line.",
    }).definition,
  );
  assert.equal(made.dispatch.ready, true);
  // A second start writes nothing.
  await assert.rejects(
    startGitHubItem(w.store, w.github, w.policy, {
      id: `${REPOSITORY}#12`,
      action: "deliver",
    }),
    /already tied/,
  );
  assert.equal(w.writes(), 2);
});

test("the status comment names nothing private and carries no Radar claim marker", () => {
  for (const action of ["deliver", "plan"]) {
    const text = statusComment(action);
    assert.ok(text.includes(INTAKE_MARKER));
    assert.doesNotMatch(text, /kirocrew-crew|crew: in progress/);
    assert.doesNotMatch(text, /\/|\.kiro|spec/i);
  }
});

test("a changed issue text is a changed definition", () => {
  const base = {
    issue: { repository: REPOSITORY, number: 3 },
    title: "A",
    body: "x",
  };
  assert.notEqual(
    fixRecord(base).definition,
    fixRecord({ ...base, body: "y" }).definition,
  );
  assert.equal(fixRecord(base).definition, fixRecord(base).definition);
});

test("Plan this sends the issue to the planner with the same two writes", async (t) => {
  const w = setup(t, { checkout: false });
  w.open(7);
  const result = await startGitHubItem(w.store, w.github, w.policy, {
    id: `${REPOSITORY}#7`,
    action: "plan",
  });
  assert.deepEqual(result.writes, ["label", "comment"]);
  assert.match(w.github.comments[0].body, /planning this issue/);
  const made = task(w.store, result.taskId);
  assert.equal(made.fix, undefined);
  assert.equal(made.intake.by, "person");
  assert.deepEqual(made.intake.issue, {
    repository: REPOSITORY,
    number: 7,
    nodeId: "issue-7",
  });
});

test("a retry after the GitHub writes writes nothing and finishes", async (t) => {
  const w = setup(t);
  const issue = w.open(5);
  await initialWrites(w.github, REPOSITORY, issue, "deliver", {
    comments: [],
    login: "worker",
  });
  assert.equal(w.writes(), 2);
  const result = await startGitHubItem(w.store, w.github, w.policy, {
    id: `${REPOSITORY}#5`,
    action: "deliver",
  });
  assert.deepEqual(result.writes, []);
  assert.equal(w.writes(), 2);
  assert.ok(task(w.store, result.taskId));
});

test("Avoozl's own issue is refused, and another login's marker does not count", async (t) => {
  const w = setup(t);
  w.open(9, { labels: [{ name: "crew:avoozl" }] });
  w.github.comments.push({
    id: 99,
    number: 9,
    body: INTAKE_MARKER,
    user: { login: "stranger" },
  });
  await assert.rejects(
    startGitHubItem(w.store, w.github, w.policy, {
      id: `${REPOSITORY}#9`,
      action: "deliver",
    }),
    /Avoozl's own issue/,
  );
  assert.equal(w.github.labels.length, 0);
});

test("pull requests, closed issues, unknown repositories and no checkout are refused before any write", async (t) => {
  const w = setup(t, { checkout: false });
  w.open(1, { pull_request: {} });
  w.open(2, { state: "closed" });
  w.open(3);
  const start = (id, action = "deliver") =>
    startGitHubItem(w.store, w.github, w.policy, { id, action });
  await assert.rejects(start(`${REPOSITORY}#1`), /Code review/);
  await assert.rejects(start(`${REPOSITORY}#2`), /closed/);
  await assert.rejects(start("o/other#3"), /not a registered/);
  await assert.rejects(start(`${REPOSITORY}#3`), /no local checkout/);
  await assert.rejects(start("not-an-id"), /owner\/repository#number/);
  assert.equal(w.writes(), 0);
});

test("only a person's same-repository Deliver this says Fixes", async (t) => {
  const w = setup(t);
  w.open(4);
  w.open(6);
  const deliver = await startGitHubItem(w.store, w.github, w.policy, {
      id: `${REPOSITORY}#4`,
      action: "deliver",
    }),
    plan = await startGitHubItem(w.store, w.github, w.policy, {
      id: `${REPOSITORY}#6`,
      action: "plan",
    }),
    fix = task(w.store, deliver.taskId);
  assert.equal(closingLine(fix, REPOSITORY), "Fixes #4");
  assert.equal(closingLine(fix, "O/APP"), "Fixes #4");
  assert.equal(closingLine(fix, "o/other"), null);
  assert.equal(closingLine(task(w.store, plan.taskId), REPOSITORY), null);
  assert.equal(
    closingLine({ ...fix, intake: { ...fix.intake, by: "rule" } }, REPOSITORY),
    null,
  );
});

test("closing the input issue withdraws the task and never completes it", async (t) => {
  const w = setup(t);
  const issue = w.open(8);
  const { taskId } = await startGitHubItem(w.store, w.github, w.policy, {
    id: `${REPOSITORY}#8`,
    action: "deliver",
  });
  assert.deepEqual(await watchInputs(w.store, w.github), []);
  issue.state = "closed";
  assert.deepEqual(await watchInputs(w.store, w.github), [taskId]);
  const after = task(w.store, taskId);
  assert.equal(after.dispatch.state, "withdrawn");
  assert.equal(after.dispatch.ready, false);
  assert.equal(after.status, "planned");
  // Withdrawn once: no further read.
  const reads = w.github.reads;
  assert.deepEqual(await watchInputs(w.store, w.github), []);
  assert.equal(w.github.reads, reads);
});

test("an issue its merged pull request closed is not withdrawn", async (t) => {
  const w = setup(t);
  const issue = w.open(13);
  const { taskId } = await startGitHubItem(w.store, w.github, w.policy, {
    id: `${REPOSITORY}#13`,
    action: "deliver",
  });
  Object.assign(issue, { state: "closed", closedByMerge: true });
  assert.deepEqual(await watchInputs(w.store, w.github), []);
  assert.equal(task(w.store, taskId).dispatch.state, "authorized");
});

test("the input issue leaves Untriaged once a task holds it", async (t) => {
  const w = setup(t);
  w.open(11);
  await startGitHubItem(w.store, w.github, w.policy, {
    id: `${REPOSITORY}#11`,
    action: "plan",
  });
  assert.ok(linkedItems(w.store.read().tasks).issues.has(`${REPOSITORY}#11`));
});

test("an input issue is reused only in the spec's own home", () => {
  assert.equal(
    reusableInput({ repository: "O/App", number: 2 }, "o/app"),
    true,
  );
  assert.equal(reusableInput({ repository: "o/app", number: 2 }, "o/x"), false);
  assert.equal(reusableInput({ repository: "o/app" }, "o/app"), false);
  assert.equal(reusableInput(null, "o/app"), false);
});
