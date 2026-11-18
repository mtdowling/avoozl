// Review pull requests after landing (lt-8.2): one comment with the train and
// the trunk commit, then closed; real git with a bare remote, fake GitHub.
import assert from "node:assert/strict";
import test from "node:test";
import { git, queued, train, trunk, workspace } from "./integrator-fixture.mjs";

async function landed(t, { settings = {}, closed = [] } = {}) {
  const w = await workspace(t);
  w.store.put("projects", {
    ...w.store.get("projects", "app"),
    repository: "example/app",
  });
  const heads = {};
  for (const id of ["t1", "t2", "t3"]) {
    const { commit } = await queued(w, id);
    heads[id] = commit;
  }
  const reviewPr = { t1: 11, t2: 12, t3: 13 },
    calls = { comments: [], closed: [], remoteAtComment: [] };
  for (const [id, number] of Object.entries(reviewPr)) {
    const key = `app\0main\0${id}`;
    w.store.put("landing_queue", {
      ...w.store.get("landing_queue", key),
      reviewPr: number,
    });
  }
  const github = {
    async pullRequest(repository, number) {
      return { number, state: closed.includes(number) ? "closed" : "open" };
    },
    async createIssueComment(repository, number, body) {
      calls.comments.push({ repository, number, body });
      calls.remoteAtComment.push(
        git(w.origin, "rev-parse", `avoozl-batch/t${number - 10}`),
      );
    },
    async closePullRequest(repository, number) {
      calls.closed.push(number);
    },
  };
  const result = await train(w, {
    github,
    settings: { ...w.settings(), ...settings },
  });
  return { w, heads, calls, result };
}

test("after a landed train each open review pull request gets one comment, then is closed", async (t) => {
  const { w, heads, calls, result } = await landed(t, { closed: [13] });
  assert.equal(result.state, "landed");
  // The person-closed pull request gets no comment and no second close.
  assert.deepEqual(
    calls.comments.map((c) => c.number),
    [11, 12],
  );
  assert.deepEqual(calls.closed, [11, 12]);
  const [first] = calls.comments;
  assert.match(first.body, new RegExp(`train-|${result.train.id}`));
  assert.match(first.body, /as 1 of 3/);
  assert.ok(first.body.includes(trunk(w).slice(0, 12)));
  assert.ok(
    first.body.includes(
      `https://github.com/example/app/commit/${result.candidate}`,
    ),
  );
  // The batch branch was never moved: at comment time it still showed the
  // head queued, and it is deleted only afterward.
  assert.equal(calls.remoteAtComment[0], heads.t1);
  assert.equal(git(w.origin, "branch", "--list", "avoozl-batch/t1"), "");
});

test("a comment that fails the privacy screen is not posted, and the pull request still closes", async (t) => {
  const { calls, result } = await landed(t, {
    settings: {
      pullRequests: { commentTemplate: "Built in /home/runner/work {train}" },
    },
  });
  assert.equal(result.state, "landed");
  assert.deepEqual(calls.comments, []);
  assert.deepEqual(calls.closed, [11, 12, 13]);
  assert.match(
    result.train.steps.find((s) => s.name === "review pull requests").detail,
    /privacy screen/,
  );
});
