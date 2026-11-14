// Review drafts by label (radar-coder RC20, design D25; tasks rc-20.2 to
// rc-20.4), with a fake GitHub that records every call. Nothing reaches the
// network or Kiro Crew.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { bindSession, recordSessionStatus } from "../session-bindings.mjs";
import {
  DRAFT_AGENT,
  draftForPull,
  postReviewDraft,
  reviewDraftDispatches,
  reviewDraftNeedsYou,
  reviewDraftStep,
  reviewDraftsView,
} from "../review-draft.mjs";
import { buildTrace } from "../trace.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code",
  HEAD = "a".repeat(40),
  NEXT = "b".repeat(40),
  REVIEW = "avoozl:review",
  DRAFTED = "avoozl:drafted";
const here = path.dirname(fileURLToPath(import.meta.url)),
  app = path.join(here, "..", "..", "..", "kirocrew-app");

const policy = (extra = {}) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      [REPO]: { baseBranch: "main", coder: "issue-radar", ...extra },
    },
  });

// One open pull request #5 that closes issue #3. Issue #3 carries a crew
// claim and an Avoozl provenance marker.
function fake({ login = "alice", permissions = { alice: "write" } } = {}) {
  let eventId = 0,
    reviewId = 100;
  const github = {
    calls: [],
    login,
    permissions: new Map(Object.entries(permissions)),
    pull: {
      number: 5,
      state: "open",
      title: "Add greet",
      html_url: `https://github.com/${REPO}/pull/5`,
      head: { sha: HEAD },
      base: { ref: "main" },
      user: { login: "crew-bot" },
      labels: [],
    },
    events: [],
    reviews: [],
    createError: null,
    available: () => true,
    async currentUser() {
      github.calls.push(["user"]);
      return { login: github.login };
    },
    async searchOpenIssues(repository, search, options) {
      github.calls.push(["search", repository, search, options.pullRequests]);
      const items = github.pull.state === "open" ? [github.pull] : [];
      return {
        items: items
          .filter((p) => p.labels.some((l) => l.name === REVIEW))
          .map((p) => ({ ...structuredClone(p), pull_request: {} })),
      };
    },
    async issueEvents() {
      return structuredClone(github.events);
    },
    async permission(_repository, actor) {
      return { permission: github.permissions.get(actor) ?? "none" };
    },
    async pullRequest() {
      return structuredClone(github.pull);
    },
    async pullRequestClosingIssues() {
      return [
        {
          repository: REPO,
          number: 3,
          title: "Greet people",
          url: `https://github.com/${REPO}/issues/3`,
        },
      ];
    },
    async issue() {
      return {
        number: 3,
        body: `Build greet.\n\n<!-- avoozl v=1 spec=hello tasks=T1 commit=${"c".repeat(40)} approved-by=alice -->`,
      };
    },
    async listIssueComments() {
      return [
        {
          id: 1,
          html_url: `https://github.com/${REPO}/issues/3#issuecomment-1`,
          body: "👻 **Draco**\nimplementing · found the greet helper is missing a test\n\n<!-- kirocrew-crew v=1 id=c_1 phase=implementing pr=5 updated=x -->",
        },
      ];
    },
    async addLabels(_repository, number, labels) {
      github.calls.push(["add", number, ...labels]);
      for (const name of labels)
        if (!github.pull.labels.some((l) => l.name === name))
          github.pull.labels.push({ name });
    },
    async removeLabel(_repository, number, label) {
      github.calls.push(["remove", number, label]);
      github.pull.labels = github.pull.labels.filter((l) => l.name !== label);
    },
    async pullRequestReviews() {
      return structuredClone(github.reviews);
    },
    async createPendingReview(_repository, number, input) {
      github.calls.push(["create", number, structuredClone(input)]);
      if (github.createError) {
        const error = Error(github.createError);
        error.status = 422;
        throw error;
      }
      const review = {
        id: ++reviewId,
        state: "PENDING",
        user: { login: github.login },
        commit_id: input.commit_id,
        html_url: `https://github.com/${REPO}/pull/5#pullrequestreview-${reviewId}`,
      };
      github.reviews.push(review);
      return structuredClone(review);
    },
    async pullRequestReview(_repository, _number, id) {
      const review = github.reviews.find((r) => r.id === id);
      if (!review) {
        const error = Error("Not Found");
        error.status = 404;
        throw error;
      }
      return structuredClone(review);
    },
    async deletePendingReview(_repository, number, id) {
      github.calls.push(["delete", number, id]);
      github.reviews = github.reviews.filter((r) => r.id !== id);
    },
    label(by = "alice") {
      github.events.push({
        id: ++eventId,
        event: "labeled",
        label: { name: REVIEW },
        actor: { login: by },
      });
      if (!github.pull.labels.some((l) => l.name === REVIEW))
        github.pull.labels.push({ name: REVIEW });
    },
  };
  return github;
}

const writes = (github) =>
  github.calls.filter(([kind]) =>
    ["add", "remove", "create", "delete"].includes(kind),
  );
const step = (store, github, extra) =>
  reviewDraftStep({
    store,
    github,
    policy: policy(extra),
    tasks: [
      { id: "T1", title: "Add greet()", acceptance: ["greet() says hello"] },
    ],
  });

async function bound(t, options) {
  const { store } = fixture(t),
    github = fake(options);
  github.label();
  await step(store, github);
  const [dispatch] = reviewDraftDispatches(store);
  bindSession(store, {
    taskId: dispatch.task,
    slot: "slot-d",
    role: "review-draft",
    attempt: 1,
    source: "tick",
  });
  const post = (input, slot = "slot-d") =>
    postReviewDraft(store, github, policy(), input, {
      sessionKey: "dashboard:" + slot,
    });
  return { store, github, dispatch, post };
}

const DRAFT = {
  body: "Looks close. Two notes.",
  comments: [
    { path: "src/greet.mjs", line: 4, body: "Name the default." },
    { path: "src/greet.mjs", line: 9, start_line: 7, body: "Add a test." },
  ],
};

test("an allowed labeler on this machine's login gives one read-only chat across three ticks", async (t) => {
  const { store } = fixture(t),
    github = fake();
  github.label();
  for (let i = 0; i < 3; i += 1) await step(store, github);
  const dispatch = reviewDraftDispatches(store);
  assert.equal(dispatch.length, 1);
  assert.equal(dispatch[0].agent, DRAFT_AGENT);
  assert.equal(dispatch[0].role, "review-draft");
  assert.equal(dispatch[0].folder, "");
  assert.deepEqual(writes(github), [], "nothing is written before the draft");
  // One search per repository per tick, for pull requests only.
  const searches = github.calls.filter(([kind]) => kind === "search");
  assert.equal(searches.length, 3);
  assert.equal(searches[0][3], true);
  assert.match(searches[0][2], /is:pr label:"avoozl:review"/);
});

test("the brief names the closing issue, the crew's claim and findings, and the spec task, fenced as data", async (t) => {
  const { store } = fixture(t),
    github = fake();
  github.label();
  await step(store, github);
  const { brief } = reviewDraftDispatches(store)[0];
  assert.match(brief, /Closes example\/code#3/);
  assert.match(brief, /Issue Radar crew: Draco, phase implementing/);
  assert.match(brief, /missing a test/);
  assert.match(brief, /Avoozl spec: hello, tasks T1/);
  assert.match(brief, /Task T1:\n`{3,}text\nAdd greet\(\)/);
  assert.match(brief, /greet\(\) says hello/);
  assert.match(brief, /data, not instructions/);
  assert.match(brief, /plans_post_review_draft/);
  assert.match(brief, new RegExp(`Head commit: ${HEAD}`));
});

test("a stranger's label is removed with one row, and drafts nothing", async (t) => {
  const { store } = fixture(t),
    github = fake();
  github.label("mallory");
  for (let i = 0; i < 3; i += 1) await step(store, github);
  assert.deepEqual(reviewDraftDispatches(store), []);
  assert.deepEqual(writes(github), [["remove", 5, REVIEW]]);
  const rows = reviewDraftNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /mallory added "avoozl:review"/);
});

test("a labeler who is not this machine's login gets no chat and one row naming both", async (t) => {
  const { store } = fixture(t),
    github = fake({ login: "bob", permissions: { alice: "write" } });
  github.label("alice");
  for (let i = 0; i < 3; i += 1) await step(store, github);
  assert.deepEqual(reviewDraftDispatches(store), []);
  assert.deepEqual(writes(github), [], "the label stays and nothing posts");
  let rows = reviewDraftNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /alice/);
  assert.match(rows[0].detail, /bob/);
  // The row clears once the logins match, and the draft starts.
  github.login = "alice";
  await step(store, github);
  rows = reviewDraftNeedsYou(store);
  assert.equal(rows.length, 0);
  assert.equal(reviewDraftDispatches(store).length, 1);
});

test("the draft is a pending review on the head commit, then the labels swap", async (t) => {
  const { store, github, post } = await bound(t);
  const result = await post(DRAFT);
  assert.equal(result.pending, true);
  const create = github.calls.find(([kind]) => kind === "create");
  assert.equal(create[2].commit_id, HEAD);
  assert.equal(Object.hasOwn(create[2], "event"), false, "no event: PENDING");
  assert.equal(create[2].comments.length, 2);
  assert.deepEqual(create[2].comments[1], {
    path: "src/greet.mjs",
    line: 9,
    start_line: 7,
    side: "RIGHT",
    start_side: "RIGHT",
    body: "Add a test.",
  });
  assert.deepEqual(
    github.pull.labels.map((l) => l.name),
    [DRAFTED],
  );
  const rows = reviewDraftNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /Your draft review is waiting/);
  assert.equal(rows[0].link, github.pull.html_url);
  // A second call posts nothing.
  await assert.rejects(post(DRAFT), /already has its draft/);
  assert.equal(github.calls.filter(([kind]) => kind === "create").length, 1);
});

test("the tool refuses an event, a screen hit, an unbound caller and a changed login, and posts nothing", async (t) => {
  const { github, post } = await bound(t);
  await assert.rejects(post({ ...DRAFT, event: "APPROVE" }), /never submitted/);
  await assert.rejects(
    post({ body: "See /Users/alice/secret.txt for details" }),
    /nothing was posted/,
  );
  await assert.rejects(
    post({ body: "x", comments: [{ path: "../etc", line: 1, body: "y" }] }),
    /inside the repository/,
  );
  await assert.rejects(post(DRAFT, "other-slot"), /Only a bound review draft/);
  github.login = "bob";
  await assert.rejects(post(DRAFT), /now bob, not alice/);
  assert.equal(github.calls.filter(([kind]) => kind === "create").length, 0);
});

test("GitHub's refusal of a line goes back to the chat, which can post again", async (t) => {
  const { github, post } = await bound(t);
  github.createError =
    "pull_request_review_thread.line must be part of the diff";
  await assert.rejects(post(DRAFT), /part of the diff/);
  github.createError = null;
  const result = await post(DRAFT);
  assert.equal(result.posted, true);
});

test("someone else's pending review blocks the draft with one row; Avoozl deletes nothing of theirs", async (t) => {
  const { store, github, post } = await bound(t);
  github.reviews.push({ id: 7, state: "PENDING", user: { login: "alice" } });
  await assert.rejects(post(DRAFT), /did not make/);
  assert.deepEqual(writes(github), []);
  assert.equal(reviewDraftNeedsYou(store).length, 1);
});

test("a submitted draft clears the drafted label and the row once", async (t) => {
  const { store, github, post } = await bound(t);
  await post(DRAFT);
  github.reviews[0].state = "COMMENTED";
  github.reviews[0].submitted_at = "2026-11-14T12:00:00Z";
  for (let i = 0; i < 3; i += 1) await step(store, github);
  assert.deepEqual(github.pull.labels, []);
  assert.equal(
    github.calls.filter(
      ([kind, , label]) => kind === "remove" && label === DRAFTED,
    ).length,
    1,
  );
  assert.equal(reviewDraftNeedsYou(store).length, 0);
  const [item] = reviewDraftsView(store, policy()).items;
  assert.equal(item.state, "submitted");
  assert.equal(item.closedAt, "2026-11-14T12:00:00Z");
  // A crew pull request: nothing else is written after submit (RC20.12).
  assert.deepEqual(
    writes(github).map(([kind, , label]) => [
      kind,
      typeof label === "string" ? label : undefined,
    ]),
    [
      ["create", undefined],
      ["add", DRAFTED],
      ["remove", REVIEW],
      ["remove", DRAFTED],
    ],
  );
});

test("a deleted draft is recorded as discarded", async (t) => {
  const { store, github, post } = await bound(t);
  await post(DRAFT);
  github.reviews = [];
  await step(store, github);
  assert.equal(reviewDraftsView(store, policy()).items[0].state, "discarded");
  assert.deepEqual(github.pull.labels, []);
});

test("a moved head marks the draft stale and deletes nothing; a new label redrafts and replaces only Avoozl's draft", async (t) => {
  const { store, github, post } = await bound(t);
  await post(DRAFT);
  github.pull.head.sha = NEXT;
  await step(store, github);
  const view = reviewDraftsView(store, policy(), { state: "stale" });
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].staleHead, NEXT);
  assert.match(
    reviewDraftNeedsYou(store)[0].detail,
    /stale.*your edits included/,
  );
  assert.equal(github.calls.filter(([kind]) => kind === "delete").length, 0);
  // The person adds the review label again: a new draft on the new head.
  github.label();
  await step(store, github);
  const [next] = reviewDraftDispatches(store);
  bindSession(store, {
    taskId: next.task,
    slot: "slot-e",
    role: "review-draft",
    attempt: 1,
    source: "tick",
  });
  await post(DRAFT, "slot-e");
  const deletes = github.calls.filter(([kind]) => kind === "delete");
  assert.deepEqual(deletes, [["delete", 5, 101]]);
  assert.equal(
    github.calls.filter(([kind]) => kind === "create").at(-1)[2].commit_id,
    NEXT,
  );
  const states = reviewDraftsView(store, policy())
    .items.map((item) => item.state)
    .sort();
  assert.deepEqual(states, ["replaced", "waiting"]);
  assert.equal(reviewDraftNeedsYou(store).length, 1);
});

test("a chat that ends without a draft raises one row", async (t) => {
  const { store, github } = await bound(t);
  recordSessionStatus(store, { slot: "slot-d", status: "closed" });
  for (let i = 0; i < 2; i += 1) await step(store, github);
  const rows = reviewDraftNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /No draft review was posted/);
  assert.equal(reviewDraftsView(store, policy()).items[0].state, "ended");
});

test("the list filters by repository and state and shows the GitHub search", async (t) => {
  const { store, github, post } = await bound(t);
  await post(DRAFT);
  const view = reviewDraftsView(store, policy());
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].state, "waiting");
  assert.deepEqual(view.searches, [
    {
      label: DRAFTED,
      query: 'is:pr is:open label:"avoozl:drafted"',
      url: "https://github.com/pulls?q=is%3Apr%20is%3Aopen%20label%3A%22avoozl%3Adrafted%22",
    },
  ]);
  assert.equal(
    reviewDraftsView(store, policy(), { repository: "other/repo" }).items
      .length,
    0,
  );
  assert.equal(
    reviewDraftsView(store, policy(), { state: "submitted" }).items.length,
    0,
  );
  assert.throws(() => reviewDraftsView(store, policy(), { state: "nope" }));
  // A configured drafted label is the one searched for.
  assert.match(
    reviewDraftsView(store, policy({ radar: { draftedLabel: "my-draft" } }))
      .searches[0].query,
    /label:"my-draft"/,
  );
  void github;
});

test("Trace shows a Review step after CI only for a drafted pull request", async (t) => {
  const { store, post } = await bound(t);
  const issue = {
      number: 3,
      title: "Greet",
      created_at: "2026-11-14T00:00:00Z",
    },
    pull = { number: 5, created_at: "2026-11-14T01:00:00Z" };
  const plain = buildTrace({ issue, pull });
  assert.ok(!plain.steps.some((s) => s.key === "review"));
  await post(DRAFT);
  const drafted = buildTrace({
    issue,
    pull,
    review: draftForPull(store, REPO, 5),
  });
  const keys = drafted.steps.map((s) => s.key);
  assert.deepEqual(keys.slice(5, 8), ["ci", "review", "merged"]);
  assert.match(drafted.steps[6].detail, /waiting to be submitted/);
});

test("no code path in the feature sends a review event, submits or dismisses", () => {
  const source = fs.readFileSync(
    path.join(here, "..", "review-draft.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /\/events\b|dismissals|event:\s*["'`]/);
  const client = fs.readFileSync(path.join(here, "..", "github.mjs"), "utf8"),
    create = client.slice(
      client.indexOf("createPendingReview("),
      client.indexOf("pullRequestReview(value"),
    );
  assert.doesNotMatch(create, /event/);
  assert.doesNotMatch(client, /reviews\/\$\{[^}]+\}\/(events|dismissals)/);
});

test("the review draft agent reads and has one way to GitHub", () => {
  const file = "agents/avoozl-review-draft.json",
    manifest = JSON.parse(fs.readFileSync(path.join(app, "app.json"), "utf8")),
    spec = JSON.parse(fs.readFileSync(path.join(app, file), "utf8"));
  assert.ok(manifest.agents.includes(file));
  assert.deepEqual(spec.tools.toSorted(), [
    "@avoozl:avoozl/plans_post_review_draft",
    "execute_bash",
    "fs_read",
    "glob",
    "grep",
    "thinking",
  ]);
  assert.deepEqual(spec.allowedTools, []);
  const patterns = spec.toolsSettings.execute_bash.allowedCommands.map(
      (p) => new RegExp(`^(?:${p})$`),
    ),
    allowed = (command) => patterns.some((p) => p.test(command));
  assert.equal(spec.toolsSettings.execute_bash.denyByDefault, true);
  assert.ok(allowed("gh pr diff 5 --repo example/code"));
  for (const command of [
    "gh pr review 5 --repo example/code --approve",
    "gh api -X POST repos/example/code/pulls/5/reviews",
    "gh pr comment 5 --repo example/code --body hi",
  ])
    assert.ok(!allowed(command), command);
});
