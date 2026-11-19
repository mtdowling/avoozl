// What Avoozl posts to GitHub: broken mentions and the posted marker, put
// on by the content-rules guard that every write passes.
import assert from "node:assert/strict";
import test from "node:test";
import { guardGitHub } from "../content-rules.mjs";
import {
  defuseMentions,
  isPosted,
  POSTED,
  postedText,
} from "../github-posted.mjs";
import { fixture } from "./fixtures.mjs";

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
      createPendingReview: record("review"),
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
  await github.createPendingReview("o/r", 3, {
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
