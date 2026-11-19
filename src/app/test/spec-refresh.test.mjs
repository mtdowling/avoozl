// Independent refresh of git content and GitHub state (task 56.6). Sources
// are in memory; nothing reaches GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "../../model.mjs";
import { appendRecord } from "../spec-journal.mjs";
import { githubRefreshSources, refreshSpec } from "../spec-refresh.mjs";

const SPEC = "example-spec";

function memoryJournal() {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body) => {
      const id = 100 + entries.length;
      entries.push({ id, body, author: "owner" });
      return { id };
    },
    permission: async (login) => (login === "owner" ? "admin" : "none"),
  };
}

// A spec with a branch, files and an issue whose tag moves on any change.
function world(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-refresh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = {
    visibility: "private",
    machine: { hostname: "made-up-host", username: "madeupuser" },
    configFile: path.join(dir, "machine.json"),
  };
  const journal = memoryJournal(),
    w = {
      options,
      journal,
      head: "a".repeat(40),
      blobs: { "tasks.md": "b1", "manifest.json": "m1" },
      tasks: { t1: { title: "One" }, t2: { title: "Two" } },
      assignees: ["owner"],
      issueTag: 1,
      calls: { head: 0, blobs: 0, parse: 0, issue: 0, journal: 0 },
    };
  w.sources = {
    head: async () => (w.calls.head++, w.head),
    blobs: async () => (w.calls.blobs++, new Map(Object.entries(w.blobs))),
    parse: async () => (w.calls.parse++, structuredClone(w.tasks)),
    issue: async (etag) => {
      w.calls.issue++;
      const tag = `"i${w.issueTag}"`;
      return etag === tag
        ? { changed: false, etag }
        : {
            changed: true,
            etag: tag,
            value: { assignees: w.assignees.map((login) => ({ login })) },
          };
    },
    journal: async () => (w.calls.journal++, journal.list()),
    permission: journal.permission,
  };
  // A journal write or reassignment moves the issue, as on GitHub.
  w.write = async (fields) => {
    await appendRecord(journal, { spec: SPEC, ...fields }, options);
    w.issueTag++;
  };
  return w;
}

test("an unchanged spec is not reparsed and its journal is not replayed", async (t) => {
  const w = world(t),
    first = await refreshSpec(null, w.sources, w.options);
  assert.equal(first.reparsed, true);
  assert.deepEqual(first.definitions, ["t1", "t2"]);
  const again = await refreshSpec(first.state, w.sources, w.options);
  assert.deepEqual(again.changed, []);
  assert.equal(again.reparsed, false);
  assert.equal(again.replay, null);
  assert.deepEqual(w.calls, {
    head: 2,
    blobs: 1,
    parse: 1,
    issue: 2,
    journal: 1,
  });
});

test("a new head with the same files is not reparsed; changed files are", async (t) => {
  const w = world(t);
  let { state } = await refreshSpec(null, w.sources, w.options);
  w.head = "c".repeat(40);
  const moved = await refreshSpec(state, w.sources, w.options);
  assert.deepEqual(moved.changed, ["head"]);
  assert.equal(moved.reparsed, false);
  assert.equal(w.calls.parse, 1);
  // Marks only: the file changes but no definition does.
  w.head = "d".repeat(40);
  w.blobs["tasks.md"] = "b2";
  const marked = await refreshSpec(moved.state, w.sources, w.options);
  assert.equal(marked.reparsed, true);
  assert.deepEqual(marked.definitions, []);
  assert.deepEqual(marked.changed, ["files", "head"]);
  // A changed definition is named.
  w.head = "e".repeat(40);
  w.blobs["manifest.json"] = "m2";
  w.tasks.t2 = { title: "Two, revised" };
  const edited = await refreshSpec(marked.state, w.sources, w.options);
  assert.deepEqual(edited.definitions, ["t2"]);
  assert.ok(edited.changed.includes("definitions"));
  state = edited.state;
  assert.equal(state.content.head, "e".repeat(40));
});

test("holds and reassignment are seen with no branch commit", async (t) => {
  const w = world(t);
  await w.write({
    op: "generation-1",
    kind: "generation",
    generation: 1,
    driver: "1".repeat(16),
  });
  const first = await refreshSpec(null, w.sources, w.options);
  assert.equal(first.owner.login, "owner");
  assert.equal(first.journal.generation, 1);
  // A hold: a journal record, nothing on the branch.
  await w.write({
    op: "hold-1",
    kind: "control",
    controls: [{ flag: "hold", id: "hold-1" }],
  });
  const held = await refreshSpec(first.state, w.sources, w.options);
  assert.deepEqual(held.changed, ["controls", "journal"]);
  assert.deepEqual(held.journal.controls, { "hold-1": "hold" });
  assert.equal(held.reparsed, false);
  // Reassignment: the issue moves, the branch does not.
  w.assignees = ["someone-else"];
  w.issueTag++;
  const moved = await refreshSpec(held.state, w.sources, w.options);
  assert.ok(moved.changed.includes("owner"));
  assert.equal(moved.owner.login, "someone-else");
  // Two assignees hold ownership.
  w.assignees = ["owner", "someone-else"];
  w.issueTag++;
  const ambiguous = await refreshSpec(moved.state, w.sources, w.options);
  assert.equal(ambiguous.owner.login, null);
  assert.equal(ambiguous.owner.reason, "several");
  assert.equal(w.calls.parse, 1);
  assert.equal(w.calls.head, 4);
});

test("reviews and checks refresh on their own reads, over conditional GitHub requests", async (t) => {
  const w = world(t),
    sha = "f".repeat(40),
    pages = {
      "/repos/acme/app/issues/7": { assignees: [{ login: "owner" }] },
      "/repos/acme/app/pulls/9": {
        head: { sha },
        state: "open",
        merged: false,
      },
      "/repos/acme/app/pulls/9/reviews": [],
      [`/repos/acme/app/commits/${sha}/check-runs`]: {
        check_runs: [{ name: "test", status: "in_progress" }],
      },
    },
    tags = new Map(),
    requests = [];
  const github = {
    request: async (method, pathname, { etag } = {}) => {
      requests.push({ pathname, etag });
      const tag = `"${digest(JSON.stringify(pages[pathname])).slice(0, 8)}"`;
      tags.set(pathname, tag);
      return etag === tag
        ? { notModified: true, etag }
        : { value: structuredClone(pages[pathname]), etag: tag };
    },
    listIssueComments: async () => [],
    permission: async () => ({ permission: "admin" }),
  };
  const files = {
    head: async () => "a".repeat(40),
    readAt: async (_repository, _sha, options) => {
      assert.equal(options.text("x"), false);
      return { blobs: new Map([["tasks.md", "b1"]]) };
    },
  };
  const sources = githubRefreshSources(github, files, {
    repository: "acme/app",
    branch: "main",
    prefix: ".kiro/specs/example/",
    parse: async () => ({ t1: { title: "One" } }),
    issue: { repository: "acme/app", number: 7 },
    pulls: [{ repository: "acme/app", number: 9 }],
  });
  const first = await refreshSpec(null, sources, w.options);
  assert.equal(first.state.pulls[9].checks.runs[0].status, "in_progress");
  const quiet = await refreshSpec(first.state, sources, w.options);
  assert.deepEqual(quiet.changed, []);
  // Every second-round read was conditional.
  assert.ok(requests.slice(-4).every((r) => r.etag));
  // A review arrives and a check finishes, with no commit anywhere.
  pages["/repos/acme/app/pulls/9/reviews"] = [
    { id: 1, user: { login: "reviewer" }, state: "APPROVED", commit_id: sha },
  ];
  pages[`/repos/acme/app/commits/${sha}/check-runs`] = {
    check_runs: [{ name: "test", status: "completed", conclusion: "success" }],
  };
  const reviewed = await refreshSpec(quiet.state, sources, w.options);
  assert.deepEqual(reviewed.changed, ["checks", "reviews"]);
  assert.equal(reviewed.reparsed, false);
  assert.equal(reviewed.state.pulls[9].reviews.list[0].state, "APPROVED");
});
