// Crews on public repositories, layer 3 (task 39.2, design §6.14, R85.6 and
// R85.7): the audit on the tick finds a crew's write that matched content
// rules, deletes or closes it, stops the line and tells the owner once. The
// terms file and the canary are fake; GitHub is an in-memory fake.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { bindContentRules } from "../content-rules.mjs";
import {
  FIRST_LOOKBACK_MS,
  publicCrewAudit,
  publicCrewAuditRows,
} from "../public-crews.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const CANARY = "zorblatcanary",
  REPO = "octo/pub",
  NOW = Date.parse("2026-11-17T12:00:00Z"),
  MARKER = "<!-- kirocrew-crew v=1 id=c1 phase=working -->",
  at = (minutes) => new Date(NOW - minutes * 60_000).toISOString(),
  policy = { repositories: { [REPO]: {} } };

function workspace(
  t,
  { terms = `canary: ${CANARY}\n`, visibility = false } = {},
) {
  const root = temporaryDirectory("avoozl-pca-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "fake-terms" }] },
    }),
  );
  if (terms !== null) {
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "fake-terms.txt"), terms);
  }
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "config", "config.json"),
  });
  store.put("github_repositories", { id: REPO, private: visibility });
  return store;
}

// The reads and writes the audit makes, in memory.
class FakeGitHub {
  constructor() {
    this.issues = [];
    this.pulls = [];
    this.comments = [];
    this.refs = [];
    this.compares = new Map();
    this.calls = [];
  }
  available() {
    return true;
  }
  currentUser() {
    return Promise.resolve({ login: "crewbot" });
  }
  repository() {
    return Promise.resolve({ default_branch: "main" });
  }
  issuesSince(_r, since) {
    this.calls.push(["issuesSince", since]);
    return Promise.resolve(this.issues.filter((i) => i.updated_at >= since));
  }
  recentlyUpdatedPullRequests() {
    return Promise.resolve(this.pulls);
  }
  issueCommentsSince(_r, since) {
    return Promise.resolve(this.comments.filter((c) => c.updated_at >= since));
  }
  branchesUnder() {
    return Promise.resolve(this.refs);
  }
  compareCommits(_r, base, head) {
    return Promise.resolve(
      this.compares.get(head) ?? { commits: [], files: [] },
    );
  }
  deleteIssueComment(_r, id) {
    this.calls.push(["deleteComment", id]);
    this.comments = this.comments.filter((c) => c.id !== id);
    return Promise.resolve(null);
  }
  updateIssue(_r, number, input) {
    this.calls.push(["updateIssue", number, input.state]);
    for (const item of [...this.issues, ...this.pulls])
      if (item.number === number) item.state = input.state;
    return Promise.resolve({});
  }
  deleteBranch(_r, name) {
    this.calls.push(["deleteBranch", name]);
    this.refs = this.refs.filter((r) => r.ref !== `refs/heads/${name}`);
    return Promise.resolve(null);
  }
}

const comment = (id, number, body, login = "crewbot") => ({
  id,
  body,
  user: { login },
  issue_url: `https://api.github.test/repos/${REPO}/issues/${number}`,
  html_url: `https://github.com/${REPO}/issues/${number}#issuecomment-${id}`,
  updated_at: at(5),
});

function leakyRepository() {
  const github = new FakeGitHub();
  github.issues = [
    {
      number: 7,
      title: "Fix the parser",
      body: "",
      state: "open",
      labels: [{ name: "crew: in progress" }],
      user: { login: "someone" },
      updated_at: at(5),
    },
    {
      number: 8,
      title: "Unrelated",
      body: "",
      state: "open",
      labels: [],
      user: { login: "someone" },
      updated_at: at(5),
    },
  ];
  github.comments = [
    comment(101, 7, `Working on it. ${MARKER}\nsee ${CANARY}`),
    comment(102, 7, "a clean crew note"),
    // Not the crew's: a stranger on a thread with no crew mark.
    comment(103, 8, `quoting ${CANARY}`, "someone"),
  ];
  github.pulls = [
    {
      number: 9,
      title: "Fix the parser",
      body: `Fixes #7\n${CANARY}`,
      state: "open",
      labels: [],
      head: { ref: "crew/c1/fix-7", repo: { full_name: REPO } },
      user: { login: "crewbot" },
      html_url: `https://github.com/${REPO}/pull/9`,
      updated_at: at(4),
    },
  ];
  github.refs = [
    { ref: "refs/heads/crew/c1/fix-7", object: { sha: "a".repeat(40) } },
  ];
  return github;
}

test("a crew's leaking comment is deleted, its pull request closed, one notice and one Needs you row", async (t) => {
  const store = workspace(t),
    github = leakyRepository();
  const result = await publicCrewAudit(store, github, { policy, now: NOW });
  assert.deepEqual(result.errors, []);
  assert.ok(github.calls.some((c) => c[0] === "deleteComment" && c[1] === 101));
  assert.ok(
    !github.calls.some((c) => c[0] === "deleteComment" && c[1] !== 101),
    "only the crew's matching comment is deleted",
  );
  assert.deepEqual(
    github.calls.filter((c) => c[0] === "updateIssue"),
    [["updateIssue", 9, "closed"]],
  );
  assert.ok(
    github.calls.some(
      (c) => c[0] === "deleteBranch" && c[1] === "crew/c1/fix-7",
    ),
  );
  assert.equal(result.notify.length, 1);
  const [notice] = result.notify;
  assert.match(notice.text, /fake-terms rule canary at comment on #7 line 2/);
  assert.match(notice.text, /fake-terms rule canary at pull #9 body line 2/);
  assert.match(notice.text, /can stay reachable on GitHub/);
  const rows = publicCrewAuditRows(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, "public-crew-audit");
  // The cord: a repository stop that only a person resumes.
  const stops = store.list("flow_stops");
  assert.equal(stops.length, 1);
  assert.equal(stops[0].scope, "repo");
  assert.equal(stops[0].projectId, REPO);
  assert.equal(stops[0].manual, true);
  // Who, what, when and a hash, never the text.
  const saved = JSON.stringify(store.getMeta("publicCrewAudit"));
  assert.ok(!saved.includes(CANARY));
  assert.ok(!JSON.stringify(result).includes(CANARY));
  const record = store.getMeta("publicCrewAudit")[REPO].records[0];
  assert.equal(record.who, "crewbot");
  assert.match(record.hash, /^[0-9a-f]{64}$/);
  assert.ok(record.foundAt && record.when);

  // The next pass reads from the cursor and acts on nothing twice.
  github.calls = [];
  const again = await publicCrewAudit(store, github, {
    policy,
    now: NOW + 60_000,
  });
  assert.deepEqual(again.notify, []);
  assert.ok(!github.calls.some((c) => c[0] !== "issuesSince"));
  assert.equal(github.calls[0][1], new Date(NOW).toISOString());
  assert.equal(publicCrewAuditRows(store).length, 1);
});

test("a canary only in a crew branch's file deletes the branch and closes its open pull request", async (t) => {
  const store = workspace(t),
    github = new FakeGitHub();
  github.pulls = [
    {
      number: 3,
      title: "clean",
      body: "clean",
      state: "open",
      labels: [],
      head: { ref: "crew/c2/x", repo: { full_name: REPO } },
      user: { login: "crewbot" },
      updated_at: at(60 * 48),
    },
  ];
  github.refs = [
    { ref: "refs/heads/crew/c2/x", object: { sha: "b".repeat(40) } },
  ];
  github.compares.set("crew/c2/x", {
    commits: [
      { commit: { message: "Add data" }, author: { login: "crewbot" } },
    ],
    files: [
      { filename: "data.txt", patch: `@@ -0,0 +1,2 @@\n+ok\n+${CANARY}` },
    ],
  });
  const result = await publicCrewAudit(store, github, { policy, now: NOW });
  assert.equal(result.notify.length, 1);
  assert.match(result.notify[0].text, /canary at data\.txt line 2/);
  assert.deepEqual(
    github.calls.filter((c) => c[0] !== "issuesSince"),
    [
      ["updateIssue", 3, "closed"],
      ["deleteBranch", "crew/c2/x"],
    ],
  );
});

test("a private repository is not read, and nothing is removed while a rule set is unavailable", async (t) => {
  const quiet = workspace(t, { visibility: true }),
    unread = leakyRepository();
  assert.deepEqual(await publicCrewAudit(quiet, unread, { policy, now: NOW }), {
    notify: [],
    errors: [],
  });
  assert.deepEqual(unread.calls, []);

  const store = workspace(t, { terms: null }),
    github = leakyRepository();
  const result = await publicCrewAudit(store, github, { policy, now: NOW });
  assert.equal(result.notify.length, 0);
  assert.match(result.errors[0], /fake-terms .* is unavailable/);
  assert.ok(!github.calls.some((c) => c[0] !== "issuesSince"));
  // The cursor did not move, so the next pass reads the same window.
  assert.equal(
    github.calls[0][1],
    new Date(NOW - FIRST_LOOKBACK_MS).toISOString(),
  );
  assert.equal(store.getMeta("publicCrewAuditCursors"), null);
});
