// Review pull requests open only on request (lt-8.1), with a fake GitHub.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { enqueueLanding } from "../landing-queue.mjs";
import { landingQueueView } from "../landing-queue-view.mjs";
import { reviewBranch } from "../integrator-review.mjs";
import { fixture } from "./fixtures.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);

function seed(t) {
  const { store } = fixture(t);
  store.importSnapshot({
    ...store.read(),
    tasks: [
      {
        id: "t1",
        title: "Task t1",
        scope: "catalog",
        status: "planned",
        track: "catalog",
        kind: "leaf",
        tags: [],
        acceptance: ["t1 works."],
        repository: "code",
      },
    ],
  });
  store.put("projects", {
    id: "code",
    repository: "example/code",
    landing: "train",
  });
  enqueueLanding(store, {
    projectId: "code",
    base: "main",
    key: "t1",
    commit: "a".repeat(40),
    tasks: [{ task: "t1" }],
    extra: { branch: "avoozl-batch/t1" },
  });
  return store;
}
const fakeGitHub = () => {
  const calls = [];
  return {
    calls,
    async createPullRequest(repository, input) {
      calls.push({ repository, ...input });
      return { number: 40 + calls.length };
    },
  };
};

test("no pull request exists until review runs, then one, and the number is on the entry", async (t) => {
  const store = seed(t),
    github = fakeGitHub();
  assert.equal(github.calls.length, 0);
  const first = await reviewBranch(store, { github, taskId: "t1" }),
    second = await reviewBranch(store, { github, taskId: "t1" });
  assert.equal(github.calls.length, 1);
  assert.deepEqual(github.calls[0], {
    repository: "example/code",
    title: "Task t1",
    head: "avoozl-batch/t1",
    base: "main",
    body: github.calls[0].body,
  });
  assert.match(github.calls[0].body, /t1 works\./);
  assert.deepEqual([first.number, first.created], [41, true]);
  assert.deepEqual([second.number, second.created], [41, false]);
  const view = landingQueueView(store, store.read());
  assert.equal(view.bases[0].items[0].reviewPr, 41);
});

test("a task that is not queued, or in a repository without trains, is refused", async (t) => {
  const store = seed(t),
    github = fakeGitHub();
  await assert.rejects(
    reviewBranch(store, { github, taskId: "nope" }),
    /not found/,
  );
  store.put("projects", {
    ...store.get("projects", "code"),
    landing: "direct",
  });
  await assert.rejects(
    reviewBranch(store, { github, taskId: "t1" }),
    /does not land in trains/,
  );
  assert.equal(github.calls.length, 0);
});

test("only the review module opens a pull request in the integrator code", () => {
  const dir = path.join(here, ".."),
    openers = fs
      .readdirSync(dir)
      .filter((f) => /^integrator-.*\.mjs$/.test(f))
      .filter((f) =>
        fs
          .readFileSync(path.join(dir, f), "utf8")
          .includes("createPullRequest"),
      );
  assert.deepEqual(openers, ["integrator-review.mjs"]);
});
