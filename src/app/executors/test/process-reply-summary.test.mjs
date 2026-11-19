// The responder and the task summary as `process` children (without-kirocrew
// nk-2.2, NK2.2, NK2.3, NK2.5): the same request on either executor, the
// child's result recorded by the operation a chat's tool call runs, and no
// network for the child.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import {
  finishProcessSession,
  processBrief,
  processExecutor,
} from "../process.mjs";
import { childRecord, openSupervisorDatabase } from "../supervisor.mjs";
import { taskSummaryDispatches } from "../../tasks/task-summary.mjs";
import { fixture, snapshot } from "../../test/fixtures.mjs";
import { FakeGitHub } from "../../test/fake-github.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { postedText } from "../../github/github-posted.mjs";

const REPO = "example/code";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// A workspace whose responder runs on the role harness `harness`, with a
// checkout at a real commit and one open discussion on a fake GitHub.
function responder(t, harness) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    checkout = temporaryDirectory(),
    github = new FakeGitHub();
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "Run npm test.\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Start");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      ...(harness ? { roles: { responder: { harness } } } : {}),
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            discussions: { categories: ["Q&A"] },
          },
        },
      },
    }),
  );
  store.put("repositories", {
    id: "code",
    root: checkout,
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    repositoryId: "code",
  });
  github.listDiscussions = async () => [
    {
      id: "D_7",
      number: 7,
      url: `https://example.test/${REPO}/discussions/7`,
      title: "How do I run the tests?",
      body: "Which command runs them?",
      closed: false,
      locked: false,
      isAnswered: false,
      category: "Q&A",
      author: "maintainer",
    },
  ];
  github.addDiscussionComment = async (discussionId, body) => {
    const comment = { id: github.comments.length + 1, discussionId, body };
    github.comments.push(comment);
    return comment;
  };
  const ops = new Operations(store, { github, workspaceRoot: root });
  return { store, github, ops, checkout };
}

// Bind the dispatch as the drain does for a `process` child.
async function bindChild(ops, dispatch, slot) {
  await ops.execute("session.bind", {
    taskId: dispatch.task,
    slot,
    role: dispatch.role,
    attempt: dispatch.attempt ?? 1,
    source: "tick",
  });
  return ops.store.get("session_bindings", slot);
}

test("the responder asks for the same reply on either executor", async (t) => {
  const chat = responder(t, null);
  const [onChat] = (await chat.ops.execute("workspace.tick", { sessions: [] }))
    .dispatch;
  assert.equal(onChat.executor, "kirocrew");
  assert.equal(onChat.role, "responder");

  const w = responder(t, "fake-cli");
  const [child] = (await w.ops.execute("workspace.tick", { sessions: [] }))
    .dispatch;
  assert.equal(child.executor, "process");
  assert.equal(child.harness, "fake-cli");
  assert.equal(child.permissionClass, "read");
  // A detached copy of the base branch, beside the checkout.
  assert.equal(child.commit, git(w.checkout, "rev-parse", "main"));
  assert.equal(child.repository, "code");
  assert.notEqual(path.resolve(child.worktree), path.resolve(w.checkout));
  assert.equal(child.brief, onChat.brief);
  const brief = processBrief("responder", child.brief);
  assert.match(brief, /Instead of calling plans_post_reply/);
  assert.match(brief, /"report": \{"body"/);
});

test("a child's reply is posted once, and none for a blocked result", async (t) => {
  const w = responder(t, "fake-cli");
  const [dispatch] = (await w.ops.execute("workspace.tick", { sessions: [] }))
    .dispatch;
  const binding = await bindChild(w.ops, dispatch, "process-r1");
  await finishProcessSession(
    w.ops,
    binding,
    { state: "blocked", text: "No answer here." },
    w.store,
  );
  assert.equal(w.github.comments.length, 0);
  const body = "Run `npm test` from the repository root.";
  const posted = await finishProcessSession(
    w.ops,
    binding,
    { state: "done", text: "", report: { body } },
    w.store,
  );
  assert.equal(posted.posted, true);
  assert.equal(w.github.comments.length, 1);
  assert.equal(w.github.comments[0].body, postedText(body));
  await assert.rejects(
    finishProcessSession(
      w.ops,
      binding,
      { state: "done", report: { body: "Again." } },
      w.store,
    ),
    /already has its one reply/,
  );
  assert.equal(w.github.comments.length, 1);
});

test("a child's reply the screen refuses is held as a chat's is", async (t) => {
  const w = responder(t, "fake-cli");
  const [dispatch] = (await w.ops.execute("workspace.tick", { sessions: [] }))
    .dispatch;
  const binding = await bindChild(w.ops, dispatch, "process-r2");
  await assert.rejects(
    finishProcessSession(
      w.ops,
      binding,
      {
        state: "done",
        report: { body: "Use ghp_" + "a".repeat(36) + " to call it." },
      },
      w.store,
    ),
    (error) => error.status === 422 && /nothing was posted/.test(error.message),
  );
  assert.equal(w.github.comments.length, 0);
});

test("a child's task summary is stored and shown", async (t) => {
  const { root, store } = fixture(t),
    data = snapshot();
  data.tasks = [
    {
      id: "b",
      title: "Task b",
      scope: "catalog",
      status: "planned",
      epic: "sample",
      track: "catalog",
      tags: [],
      acceptance: ["b is observable."],
    },
  ];
  store.initialize(data);
  const ops = new Operations(store, { workspaceRoot: root });
  await ops.execute("task.summary.request", { id: "b" });
  const config = { roles: { taskSummary: { harness: "fake-cli" } } };
  const [onChat] = taskSummaryDispatches(store);
  assert.equal(onChat.executor, "kirocrew");
  const [child] = taskSummaryDispatches(store, { config });
  assert.equal(child.executor, "process");
  assert.equal(child.harness, "fake-cli");
  assert.equal(child.permissionClass, "read");
  assert.equal(child.brief, onChat.brief);
  const binding = await bindChild(ops, child, "process-s1");
  const summary = "Task b is planned and waits on nothing.";
  await finishProcessSession(
    ops,
    binding,
    { state: "done", report: { summary } },
    store,
  );
  const shown = (await ops.execute("task.detail", { id: "b" })).summary;
  assert.equal(shown.state, "ready");
  assert.equal(shown.text, summary);
});

test("neither child gets a network path, whatever its repository allows", async (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-offline-"));
  t.after(() => fs.rmSync(state, { recursive: true, force: true }));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-offline-w-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const executor = processExecutor({
    stateDirectory: state,
    repositoryFor: () => ({
      harness: "fake-cli",
      sandbox: { network: ["localhost:8080"] },
    }),
  });
  const settings = async (role) => {
    const id = await executor.start(role, "t", folder, "Brief.", null, "read");
    const db = openSupervisorDatabase(state);
    try {
      return JSON.parse(childRecord(db, id).settings);
    } finally {
      db.close();
    }
  };
  assert.equal((await settings("responder")).network, "off");
  assert.equal((await settings("task-summary")).network, "off");
  // A verifier still gets its repository's network.
  assert.notEqual((await settings("verifier")).network, "off");
});

test("every child reaches the model proxy; only an online one the network too", async (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-proxy-"));
  t.after(() => fs.rmSync(state, { recursive: true, force: true }));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-proxy-w-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const executor = processExecutor({
    stateDirectory: state,
    repositoryFor: () => ({
      harness: "fake-cli",
      sandbox: {
        network: ["localhost:8080"],
        modelProxy: ["localhost:18471"],
      },
    }),
  });
  const network = async (role) => {
    const id = await executor.start(role, "t", folder, "Brief.", null, "read");
    const db = openSupervisorDatabase(state);
    try {
      return JSON.parse(childRecord(db, id).settings).network;
    } finally {
      db.close();
    }
  };
  // The triage agent reads only its snapshot: its model and nothing else.
  assert.deepEqual(await network("triage"), ["localhost:18471"]);
  assert.deepEqual(await network("verifier"), [
    "localhost:18471",
    "localhost:8080",
  ]);
});
