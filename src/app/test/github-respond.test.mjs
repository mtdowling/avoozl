// Task 4.3: the respond action. A matched issue snapshot gets the configured
// responding label and one read-only responder session; plans_post_reply
// screens the reply, posts at most one comment and removes the label.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Operations } from "../operations.mjs";
import { responseId, screenReply } from "../github-respond.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const REPO = "example/code",
  LABEL = "bot:answering",
  ISSUE = "github:example/code:I_7",
  app = fileURLToPath(new URL("../../../kirocrew-app/", import.meta.url));

function workspace(t, { managedLabels = { responding: LABEL } } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    checkout = temporaryDirectory(),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            managedLabels,
            rules: [{ id: "ask", action: "respond", labelsAll: ["ask-bot"] }],
          },
        },
      },
    }),
  );
  store.put("projects", {
    id: "code",
    root: checkout,
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    projectId: "code",
  });
  // GitHub holds the issue and the allowed actor's label event; the tick's
  // intake turns them into the authorized row.
  const source = {
    number: 7,
    node_id: "I_7",
    title: "How do I run the tests?",
    body: "Which command runs them?",
    state: "open",
    labels: [{ name: "ask-bot" }],
  };
  github.created.push(source);
  github.issues = [source];
  github.permissions.set("maintainer", "write");
  let event = 0;
  const label = () =>
    github.events.set(7, [
      ...(github.events.get(7) || []),
      {
        id: ++event,
        node_id: `label-${event}`,
        event: "labeled",
        label: { name: "ask-bot" },
        actor: { login: "maintainer" },
        created_at: new Date(Date.UTC(2026, 10, 12, 0, event)).toISOString(),
      },
    ]);
  label();
  // A new body and a new trigger event: a new snapshot. No label: withdrawn.
  const issue = ({ body, labeled = true }) => {
    if (body) source.body = body;
    source.labels = labeled ? [{ name: "ask-bot" }] : [];
    github.issues = labeled ? [source] : [];
    if (labeled) label();
  };
  const ops = new Operations(store, { github, workspaceRoot: root }),
    tick = (sessions = []) => ops.execute("workspace.tick", { sessions }),
    post = (body, slot = "slot-r") =>
      ops.execute("reply.post", { body }, undefined, {
        caller: { sessionKey: "dashboard:" + slot },
      }),
    bind = (taskId, slot = "slot-r") =>
      ops.execute("session.bind", {
        taskId,
        slot,
        role: "responder",
        attempt: 1,
        source: "tick",
      });
  const snapshot = () => store.get("github_issues", ISSUE).snapshotHash;
  return { store, github, ops, tick, post, bind, issue, snapshot, checkout };
}

const labels = (github) =>
  github.labels.filter(([kind]) => kind === "add" || kind === "remove");

async function boundResponder(t, options) {
  const w = workspace(t, options);
  const first = await w.tick();
  const [dispatch] = first.dispatch;
  await w.bind(dispatch.task);
  return { ...w, dispatch };
}

test("a matched issue gets the label and one read-only responder session", async (t) => {
  // Nearby inputs: a second tick before binding (same dispatch, no second
  // label), a tick after binding (nothing), and the brief fencing issue text.
  const w = workspace(t);
  const first = await w.tick();
  assert.equal(first.dispatch.length, 1);
  const [dispatch] = first.dispatch;
  assert.equal(dispatch.task, responseId(ISSUE, w.snapshot()));
  assert.equal(dispatch.role, "responder");
  assert.equal(dispatch.agent, "avoozl-responder");
  assert.equal(dispatch.folder, "Avoozl/code");
  assert.match(dispatch.title, /^avoozl:respond-\w+ respond example\/code#7$/);
  assert.match(dispatch.brief, /```issue-snapshot\nTitle: How do I run/);
  assert.match(dispatch.brief, /plans_post_reply/);
  assert.deepEqual(labels(w.github), [["add", 7, LABEL]]);

  const again = await w.tick();
  assert.deepEqual(
    again.dispatch.map((d) => d.task),
    [dispatch.task],
  );
  assert.equal(labels(w.github).length, 1, "the label is added once");

  await w.bind(dispatch.task);
  const bound = await w.tick([{ target: "slot-r", status: "working" }]);
  assert.deepEqual(bound.dispatch, []);
});

test("a clean reply posts once and Avoozl removes the label", async (t) => {
  // Nearby inputs: repository-relative paths, an HTTPS URL, an API route and
  // a fenced command pass; a second post is refused; the next tick writes
  // nothing more.
  const w = await boundResponder(t);
  const clean = [
    "Run the tests from the repository root:",
    "",
    "```sh",
    "npm test",
    "```",
    "",
    "The runner lives in src/app/test/ and the API answers on /api/command.",
    "See https://github.com/example/code/blob/main/README.md for more.",
  ].join("\n");
  const result = await w.post(clean);
  assert.equal(result.posted, true);
  assert.equal(result.labelRemoved, true);
  assert.equal(w.github.comments.length, 1);
  assert.equal(w.github.comments[0].number, 7);
  assert.equal(w.github.comments[0].body, clean);
  assert.deepEqual(labels(w.github), [
    ["add", 7, LABEL],
    ["remove", 7, LABEL],
  ]);
  await assert.rejects(w.post("A second answer."), /already has its one reply/);
  assert.equal(w.github.comments.length, 1);
  const after = await w.tick([{ target: "slot-r", status: "idle" }]);
  assert.deepEqual(after.dispatch, []);
  assert.equal(labels(w.github).length, 2);
});

test("a reply with a secret or a machine path is refused and nothing is posted", async (t) => {
  const w = await boundResponder(t);
  const home = os.homedir();
  const refused = {
    "GitHub token": "Use ghp_" + "a".repeat(36) + " to call it.",
    "fine-grained token": "github_pat_" + "B".repeat(30),
    "token in a code fence": "```\nexport GH=gho_" + "c".repeat(36) + "\n```",
    "AWS access key": "key AKIA" + "ABCDEFGHIJKLMNOP",
    "private key": "-----BEGIN OPENSSH PRIVATE KEY-----",
    "API key": "sk-ant-" + "d".repeat(30),
    "Slack token": "xoxb-1234567890-abcdef",
    "JSON web token": "eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4",
    "bearer header": "Authorization: Bearer " + "e".repeat(32),
    "URL with credentials": "Clone https://bot:hunter2secret@github.com/x/y",
    "credential assignment": 'password = "correct-horse-battery"',
    "absolute macOS path": "It is in /Users/someone/projects/code/README.md",
    "absolute Linux path": "Logs go to /home/ci/build.log",
    "temporary path": "See `/private/tmp/run-1/out.txt`.",
    "home-relative path": "Edit ~/.config/avoozl/settings.json",
    "HOME variable": "Look in $HOME/.kiro",
    "Windows path": "Open C:\\Users\\someone\\code",
    "this machine's home": "Found under " + home + "x",
    "this machine's checkout": "Open " + w.checkout + "/README.md",
  };
  for (const [name, body] of Object.entries(refused)) {
    await assert.rejects(
      w.post("Here is the answer.\n" + body),
      (error) =>
        error.status === 422 &&
        /nothing was posted/.test(error.message) &&
        / on line \d+/.test(error.message) &&
        !error.message.includes(body.trim().split(/\s+/).pop()),
      name,
    );
  }
  assert.equal(w.github.comments.length, 0);
  assert.deepEqual(labels(w.github), [["add", 7, LABEL]], "label kept");
  // The session may fix the reply and post again.
  const result = await w.post("Run `npm test` from the repository root.");
  assert.equal(result.posted, true);
  assert.equal(w.github.comments.length, 1);
});

test("only the bound responder session may post", async (t) => {
  // Nearby inputs: no caller identity, an unbound slot, and a worker binding.
  const w = await boundResponder(t);
  await assert.rejects(
    w.ops.execute("reply.post", { body: "Hi." }),
    (error) => error.status === 403,
  );
  await assert.rejects(w.post("Hi.", "slot-other"), (e) => e.status === 403);
  await w.ops.execute("task.update", {
    id: "work",
    create: true,
    title: "Work",
  });
  await w.ops.execute("session.bind", { taskId: "work", slot: "slot-w" });
  await assert.rejects(w.post("Hi.", "slot-w"), (e) => e.status === 403);
  assert.equal(w.github.comments.length, 0);
});

test("a session that ends without a reply has its label removed", async (t) => {
  // Nearby inputs: a closed and a lost session; a new body snapshot opens a
  // new response; a withdrawn issue that never bound removes its label.
  const w = await boundResponder(t);
  await w.tick([{ target: "slot-r", status: "closed" }]);
  assert.deepEqual(labels(w.github), [
    ["add", 7, LABEL],
    ["remove", 7, LABEL],
  ]);
  await assert.rejects(
    w.post("Late."),
    (e) => e.status === 403 || e.status === 409,
  );

  w.issue({ body: "Which command runs them? On Windows too?" });
  const next = await w.tick([{ target: "slot-r", status: "closed" }]);
  assert.deepEqual(
    next.dispatch.map((d) => d.task),
    [responseId(ISSUE, w.snapshot())],
  );
  await w.bind(next.dispatch[0].task, "slot-r2");
  await w.tick([
    { target: "slot-r", status: "closed" },
    { target: "slot-r2", status: "lost" },
  ]);
  assert.equal(
    labels(w.github).filter(([kind]) => kind === "remove").length,
    2,
  );

  w.issue({ body: "Which command runs the unit tests?" });
  const opened = await w.tick([
    { target: "slot-r", status: "closed" },
    { target: "slot-r2", status: "lost" },
  ]);
  assert.equal(opened.dispatch.length, 1);
  w.issue({ labeled: false });
  const withdrawn = await w.tick([
    { target: "slot-r", status: "closed" },
    { target: "slot-r2", status: "lost" },
  ]);
  assert.deepEqual(withdrawn.dispatch, []);
  assert.equal(
    labels(w.github).filter(([kind]) => kind === "remove").length,
    3,
  );
});

test("a respond rule needs a configured responding label", () => {
  // Nearby inputs: any label name works (no required prefix); a repository
  // with no respond rule needs none.
  const policy = (managedLabels) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        [REPO]: {
          baseBranch: "main",
          allowedActors: ["maintainer"],
          managedLabels,
          rules: [{ id: "ask", action: "respond", labelsAll: ["ask-bot"] }],
        },
      },
    });
  assert.throws(() => policy({}), /managedLabels.responding/);
  assert.equal(
    policy({ responding: "answering" }).repositories[REPO].managedLabels
      .responding,
    "answering",
  );
  assert.doesNotThrow(() =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        [REPO]: {
          baseBranch: "main",
          allowedActors: ["maintainer"],
          rules: [{ id: "go", action: "deliver", labelsAll: ["go"] }],
        },
      },
    }),
  );
});

test("the screen passes ordinary replies", () => {
  for (const body of [
    "Run `npm test`.",
    "The file is src/app/github-respond.mjs; see docs/evidence/.",
    "Open https://github.com/example/code/issues/7 or http://localhost:9428/api/command.",
    "The `token` field is optional, and the password prompt appears once.",
    "Use `${{ secrets.GITHUB_TOKEN }}` in the workflow.",
    "Paths like ./scripts/build.mjs and ../app/README.md are relative.",
  ])
    assert.deepEqual(screenReply(body), [], body);
});

test("the responder agent has read tools and plans_post_reply only", () => {
  const manifest = JSON.parse(
      fs.readFileSync(path.join(app, "app.json"), "utf8"),
    ),
    file = manifest.agents.find((a) => a.endsWith("avoozl-responder.json")),
    spec = JSON.parse(fs.readFileSync(path.join(app, file), "utf8"));
  assert.deepEqual(spec.tools.toSorted(), [
    "@avoozl:avoozl/plans_post_reply",
    "fs_read",
    "glob",
    "grep",
    "thinking",
  ]);
  assert.deepEqual(spec.allowedTools, []);
  assert.equal(spec.includeMcpJson, false);
  // The tool ref names the server Kiro Crew registers for the app.
  assert.ok(Object.hasOwn(manifest.mcpServers, "avoozl"));
});
