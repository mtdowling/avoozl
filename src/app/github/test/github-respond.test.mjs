// The responder's one reply (R27.13): plans_post_reply screens the reply,
// posts at most one comment, and only for the bound responder session. No
// label starts a responder (triage-agent TA11.1); discussions answering
// opens one (proof-discussions.test.mjs).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Operations } from "../../api/operations.mjs";
import { screenReply } from "../github-respond.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { FakeGitHub } from "../../test/fake-github.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { postedText } from "../github-posted.mjs";

const REPO = "example/code",
  RESPONSE = "respond-test",
  app = fileURLToPath(new URL("../../../../kirocrew-app/", import.meta.url));

// A workspace with one open discussion response, bound to slot-r.
async function boundResponder(t) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    checkout = temporaryDirectory(),
    github = new FakeGitHub();
  github.addDiscussionComment = async (discussionId, body) => {
    const comment = {
      id: github.comments.length + 1,
      number: 7,
      discussionId,
      body,
    };
    github.comments.push(comment);
    return comment;
  };
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: { [REPO]: { baseBranch: "main" } },
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
  store.put("github_responses", {
    id: RESPONSE,
    kind: "discussion",
    discussionId: "D_7",
    repository: REPO,
    number: 7,
    title: "How do I run the tests?",
    body: "Which command runs them?",
    snapshotHash: "h",
    state: "open",
  });
  const ops = new Operations(store, { github, workspaceRoot: root }),
    tick = (sessions = []) => ops.execute("workspace.tick", { sessions }),
    post = (body, slot = "slot-r") =>
      ops.execute("reply.post", { body }, undefined, {
        caller: { sessionKey: "dashboard:" + slot },
      });
  await ops.execute("session.bind", {
    taskId: RESPONSE,
    slot: "slot-r",
    role: "responder",
    attempt: 1,
    source: "tick",
  });
  return { store, github, ops, tick, post, checkout };
}

test("a clean reply posts once", async (t) => {
  // Nearby inputs: repository-relative paths, an HTTPS URL, an API route and
  // a fenced command pass; a second post is refused.
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
  assert.equal(w.github.comments.length, 1);
  assert.equal(w.github.comments[0].body, postedText(clean));
  await assert.rejects(w.post("A second answer."), /already has its one reply/);
  assert.equal(w.github.comments.length, 1);
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
    "absolute macOS path":
      "It is in /Users/someone/repositories/code/README.md",
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

test("a session that ends without a reply ends its response", async (t) => {
  const w = await boundResponder(t);
  await w.tick([{ target: "slot-r", status: "closed" }]);
  const response = w.store.get("github_responses", RESPONSE);
  assert.equal(response.state, "ended");
  assert.ok(response.endedAt);
  await assert.rejects(
    w.post("Late."),
    (e) => e.status === 403 || e.status === 409,
  );
  assert.equal(w.github.comments.length, 0);
});

test("the screen passes ordinary replies", () => {
  for (const body of [
    "Run `npm test`.",
    "The file is src/app/github/github-respond.mjs; see docs/evidence/.",
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

test("a public reply may not quote another repository on this machine", async (t) => {
  // Nearby inputs: the same line in the public checkout passes; a private
  // target passes; an unreadable repository counts as public; short lines
  // and the responder's own words pass; quote and list marks are dropped.
  const w = await boundResponder(t),
    plans = temporaryDirectory(),
    secret = "const signingKeyRotation = rotateEveryHours(36);",
    shared = "export function runAllTheTests(options) {";
  fs.writeFileSync(path.join(plans, "design.md"), `${secret}\n${shared}\n`);
  fs.writeFileSync(path.join(w.checkout, "index.mjs"), `${shared}\n`);
  // Only files the public repository tracks count as its own.
  fs.writeFileSync(path.join(w.checkout, "notes.txt"), `${secret}\n`);
  execFileSync("git", ["init", "-q"], { cwd: w.checkout });
  execFileSync("git", ["add", "index.mjs"], { cwd: w.checkout });
  w.store.put("repositories", {
    id: "plans",
    root: plans,
    planning: true,
    baseBranch: "main",
    checks: [],
  });
  w.github.repository = async () => ({ private: false });
  for (const body of [
    "It does this:\n\n```js\n" + secret + "\n```",
    "> " + secret,
    "- " + secret,
  ])
    await assert.rejects(
      w.post(body),
      (error) =>
        error.status === 422 &&
        /text from another repository on line \d/.test(error.message) &&
        !error.message.includes("signingKey"),
      body,
    );
  w.github.repository = async () => {
    throw Error("offline");
  };
  await assert.rejects(w.post(secret), (e) => e.status === 422);
  assert.equal(w.github.comments.length, 0);
  w.github.repository = async () => ({ private: false });
  const ok = await w.post(
    "The entry point is:\n\n```js\n" +
      shared +
      "\n```\n\nRun `npm test` to try it.",
  );
  assert.equal(ok.posted, true);
});

test("a private repository's reply may quote another checkout", async (t) => {
  const w = await boundResponder(t),
    other = temporaryDirectory(),
    line = "const signingKeyRotation = rotateEveryHours(36);";
  fs.writeFileSync(path.join(other, "a.mjs"), line + "\n");
  w.store.put("repositories", {
    id: "other",
    root: other,
    baseBranch: "main",
    checks: [],
  });
  assert.equal((await w.post(line)).posted, true);
});
