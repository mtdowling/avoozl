// What Avoozl posts to GitHub: broken mentions and the posted marker, put
// on by the content-rules guard that every write passes, except a person's.
import assert from "node:assert/strict";
import test from "node:test";
import { guardGitHub } from "../../content/content-rules.mjs";
import { Operations, postingActor } from "../../api/operations.mjs";
import {
  asActor,
  defuseMentions,
  isPosted,
  POSTED,
  postedText,
} from "../github-posted.mjs";
import { fixture } from "../../test/fixtures.mjs";

const ZWSP = "​";

test("a mention is broken after its @", () => {
  assert.equal(
    defuseMentions("Thanks @octocat, and @org/team too."),
    `Thanks @${ZWSP}octocat, and @${ZWSP}org/team too.`,
  );
  assert.equal(defuseMentions("@lead first"), `@${ZWSP}lead first`);
  // Already broken text stays as it is.
  assert.equal(defuseMentions(`@${ZWSP}octocat`), `@${ZWSP}octocat`);
});

test("a mention in code, a fence or an HTML comment is left as written", () => {
  const text = [
    "Run `npm publish --tag @next` first.",
    "```js",
    'import x from "@scope/pkg"; // @octocat',
    "```",
    "~~~",
    "@octocat",
    "~~~",
    '<!-- avoozl-journal:v1 {"by":"@octocat"} -->',
    "Mail me at someone@example.com.",
  ].join("\n");
  assert.equal(defuseMentions(text), text);
  assert.equal(defuseMentions("`@a` and @b"), `\`@a\` and @${ZWSP}b`);
});

test("a post ends with the marker once", () => {
  const once = postedText("Done @octocat.");
  assert.equal(once, `Done @${ZWSP}octocat.\n\n${POSTED}`);
  assert.equal(postedText(once), once);
  assert.equal(isPosted(once), true);
  assert.equal(isPosted("Done."), false);
});

test("every comment, review and pull request write goes out defused and marked", async (t) => {
  const { store } = fixture(t),
    sent = [];
  const record =
    (name) =>
    async (...args) => {
      sent.push([name, args]);
      return { id: 1 };
    };
  const github = guardGitHub(
    {
      createIssueComment: record("comment"),
      updateIssueComment: record("update"),
      addDiscussionComment: record("discussion"),
      createPullRequest: record("pull"),
      submitReview: record("review"),
      createIssue: record("issue"),
    },
    store,
  );
  await github.createIssueComment("o/r", 3, "Hi @octocat");
  await github.updateIssueComment("o/r", 9, "Hi @octocat");
  await github.addDiscussionComment("D_1", "Hi @octocat");
  await github.createPullRequest("o/r", {
    title: "T",
    head: "h",
    base: "main",
    body: "For @octocat",
  });
  await github.submitReview("o/r", 3, {
    event: "COMMENT",
    commit_id: "abc",
    body: "Look @octocat",
    comments: [{ path: "a.js", line: 1, body: "Here @octocat" }],
  });
  await github.createIssue("o/r", { title: "T", body: "Issue @octocat" });
  const defused = `@${ZWSP}octocat`;
  const [comment, update, discussion, pull, review, issue] = sent;
  assert.equal(comment[1][2], `Hi ${defused}\n\n${POSTED}`);
  assert.equal(update[1][2], `Hi ${defused}\n\n${POSTED}`);
  assert.equal(discussion[1][1], `Hi ${defused}\n\n${POSTED}`);
  assert.equal(pull[1][1].body, `For ${defused}\n\n${POSTED}`);
  assert.equal(pull[1][1].title, "T");
  assert.equal(review[1][2].body, `Look ${defused}\n\n${POSTED}`);
  assert.equal(review[1][2].comments[0].body, `Here ${defused}\n\n${POSTED}`);
  assert.equal(review[1][2].comments[0].path, "a.js");
  // An issue body is not a post.
  assert.equal(issue[1][1].body, "Issue @octocat");
});

// A spec pull request a person rejects, with a fake GitHub that records the
// comment.
function rejecting(t) {
  const { store } = fixture(t),
    comments = [];
  const ops = new Operations(store, {
    github: {
      async createIssueComment(_repository, number, body) {
        comments.push({ number, body });
        return { id: comments.length };
      },
      async updateIssue() {
        return {};
      },
    },
  });
  const reject = (context) => {
    const id = `spec-pr:${comments.length + 1}`;
    store.put("receipts", {
      id,
      kind: "spec-pr",
      state: "open",
      repository: "o/r",
      number: 7,
      planId: "feature",
    });
    return ops.execute(
      "specpr.reject",
      { id, reason: "Not now, @octocat." },
      undefined,
      context,
    );
  };
  return { comments, reject };
}

test("a person's comment through an operation goes out as written", async (t) => {
  const { comments, reject } = rejecting(t);
  await reject({ person: true });
  assert.equal(comments[0].body, "Rejected in Avoozl: Not now, @octocat.");
  assert.equal(isPosted(comments[0].body), false);
});

test("a caller nobody named is marked", async (t) => {
  const { comments, reject } = rejecting(t);
  await reject({});
  assert.equal(
    comments[0].body,
    `Rejected in Avoozl: Not now, @${ZWSP}octocat.\n\n${POSTED}`,
  );
  // A nested operation with no word of its own keeps the enclosing actor.
  await asActor("agent", () => reject({}));
  assert.equal(isPosted(comments[1].body), true);
});

test("an agent's, a plugin's and the tick's posts are marked and defused", async (t) => {
  const person = { person: true };
  assert.equal(postingActor("task.update", person), "person");
  assert.equal(postingActor("task.update", {}), null);
  assert.equal(postingActor("reply.post", { caller: "s", mcp: true }), "agent");
  assert.equal(postingActor("reply.post", { mcp: true, ...person }), "agent");
  assert.equal(postingActor("retro.add", { plugin: "p", ...person }), "agent");
  // A person who runs the tick still gets the tick's own text, marked.
  assert.equal(postingActor("workspace.tick", person), "avoozl");
  const { store } = fixture(t),
    sent = [];
  const github = guardGitHub(
    {
      async createIssueComment(_repository, _number, body) {
        sent.push(body);
        return { id: sent.length };
      },
    },
    store,
  );
  for (const actor of ["agent", "avoozl", "unknown"])
    await asActor(actor, () => github.createIssueComment("o/r", 3, "Hi @a"));
  await github.createIssueComment("o/r", 3, "Hi @a");
  for (const body of sent) assert.equal(body, `Hi @${ZWSP}a\n\n${POSTED}`);
  await asActor("person", () => github.createIssueComment("o/r", 3, "Hi @a"));
  assert.equal(sent.at(-1), "Hi @a");
});
