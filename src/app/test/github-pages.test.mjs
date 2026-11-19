// The Issues and Pull requests pages (triage-agent ta-3.1, ta-3.2, TA8):
// the list's sorts, filters and search over stored rows, the detail from
// one cached query, and one write per action on a fake GitHub.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { itemsAct, itemsDetail, itemsList } from "../github-pages.mjs";
import { readChangedItems } from "../github-items.mjs";
import { REPO, triageWorkspace } from "./triage-fixture.mjs";

async function pages(t) {
  const w = triageWorkspace(t);
  fs.writeFileSync(
    path.join(w.root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: { mode: "single-repo", repositories: { [REPO]: { baseBranch: "main" } } },
    }),
  );
  w.fake.add(1, { title: "Crash on start", body: "The parser drops the last line." });
  w.fake.add(2, { title: "Docs", labels: [{ name: "question" }], assignees: [{ login: "owner" }] });
  w.fake.add(3, { pr: true, title: "Fix the parser", head: "h3", checks: ["SUCCESS", "FAILURE"] });
  w.fake.add(4, { pr: true, title: "Add a spec", head: "h4", user: { login: "owner" } });
  await w.tick();
  await readChangedItems(w.store, w.github, REPO);
  const ops = new Operations(w.store, {
    operator: "Owner",
    github: w.github,
    workspaceRoot: w.root,
  });
  const act = (input, context = {}) =>
    ops.execute("items.act", { repository: REPO, ...input }, undefined, context);
  return { ...w, ops, act };
}

test("the list sorts, filters and searches, from stored rows only", async (t) => {
  const w = await pages(t);
  w.fake.reset();
  const issues = itemsList(w.store, { kind: "issue" }, { login: "owner" });
  assert.deepEqual(issues.items.map((row) => row.number), [2, 1]);
  assert.deepEqual(
    itemsList(w.store, { kind: "issue", sort: "number" }).items.map((row) => row.number),
    [2, 1],
  );
  assert.deepEqual(
    itemsList(w.store, { kind: "issue", q: "parser" }).items.map((row) => row.number),
    [1],
    "a word in the body finds it",
  );
  assert.deepEqual(
    itemsList(w.store, { kind: "issue", label: "question" }).items.map((row) => row.number),
    [2],
  );
  assert.deepEqual(
    itemsList(w.store, { kind: "issue", assigned: true }, { login: "owner" }).items.map((row) => row.number),
    [2],
  );
  assert.deepEqual(
    itemsList(w.store, { kind: "pr", mine: true }, { login: "owner" }).items.map((row) => row.number),
    [4],
  );
  const pull = itemsList(w.store, { kind: "pr" }).items.find((row) => row.number === 3);
  assert.deepEqual(pull.counts.checks, { failed: 1, passed: 1, skipped: 0, pending: 0 });
  assert.equal(pull.counts.additions, 10);
  assert.deepEqual(
    w.fake.calls,
    { rest: 0, notModified: 0, graphql: 0, writes: 0 },
    "the list makes no GitHub call",
  );
  // The owner queue filter shows only held items.
  w.answer(1, { class: "feature", reason: "Wants more.", toOwner: { reason: "A feature." } });
  await w.tick();
  assert.deepEqual(
    itemsList(w.store, { kind: "issue", owner: true }).items.map((row) => row.number),
    [1],
  );
});

test("the detail is one query, cached by updatedAt", async (t) => {
  const w = await pages(t);
  w.fake.reset();
  const detail = await itemsDetail(w.store, w.github, { repository: REPO, number: 3 });
  await itemsDetail(w.store, w.github, { repository: REPO, number: 3 });
  assert.equal(w.fake.calls.graphql, 1);
  assert.equal(detail.kind, "pr");
  assert.ok(detail.actions.includes("approve"));
  assert.ok(detail.triage.runs.length >= 1);
});

test("each action makes one write of the right kind and is recorded", async (t) => {
  const w = await pages(t);
  const cases = [
    [{ number: 2, action: "assign" }, "assign"],
    [{ number: 2, action: "labels", add: ["bug"] }, "labels"],
    [{ number: 2, action: "close", reason: "not_planned" }, "update"],
    [{ number: 3, action: "comment", body: "Thanks." }, "comment"],
    [{ number: 3, action: "approve" }, "review"],
    [{ number: 3, action: "requestChanges", body: "Add a test." }, "review"],
  ];
  for (const [input, kind] of cases) {
    w.fake.reset();
    await w.act(input);
    assert.equal(w.fake.writes.length, 1, `${input.action} makes one write`);
    assert.equal(w.fake.writes[0].kind, kind);
    const row = w.item(input.number);
    assert.equal(row.actions.at(-1).action, input.action);
  }
  assert.equal(w.fake.items.get(2).state, "closed");
  assert.equal(w.fake.reviews.at(-1).event, "REQUEST_CHANGES");
  assert.equal(w.fake.reviews.at(-2).event, "APPROVE");
  // Snooze and Run triage again write nothing to GitHub.
  w.fake.reset();
  await w.act({ number: 1, action: "snooze", until: "2099-01-01T00:00:00Z" });
  await w.act({ number: 1, action: "again" }).catch(() => null);
  assert.equal(w.fake.writes.length, 0);
});

test("Approve, Request changes and Close are refused over MCP and from an agent", async (t) => {
  const w = await pages(t);
  for (const action of ["approve", "requestChanges", "close"])
    for (const context of [{ mcp: true }, { caller: { sessionKey: "dashboard:chat-1" } }])
      await assert.rejects(
        w.act({ number: 3, action, body: "x" }, context),
        (error) => error.status === 403,
        `${action} with ${JSON.stringify(context)}`,
      );
  await assert.rejects(
    itemsAct(w.store, w.github, { repository: REPO, number: 3, action: "approve" }, {}),
    (error) => error.status === 403,
  );
  assert.equal(w.fake.writes.length, 0);
});

test("Fix on an issue starts a fix from it", async (t) => {
  const w = await pages(t);
  const result = await w.act({ number: 1, action: "fix" });
  const task = w.store.read().tasks.find((entry) => entry.id === result.taskId);
  assert.equal(task.fix.v, 2);
  assert.deepEqual(task.fix.source, { issue: { repository: REPO, number: 1 } });
  assert.equal(task.dispatch.ready, true);
  assert.ok(w.store.get("receipts", `spec-journal:${task.id}`), "its journal is open");
});

test("a spec-only pull request keeps Review as spec", async (t) => {
  const w = await pages(t);
  w.fake.files.set(4, [{ filename: ".kiro/specs/x/tasks.md", patch: "" }]);
  w.fake.files.set(3, [{ filename: "src/parser.js", patch: "" }]);
  w.fake.edit(4, {});
  w.fake.edit(3, {});
  await readChangedItems(w.store, w.github, REPO);
  const spec = await itemsDetail(w.store, w.github, { repository: REPO, number: 4 }),
    code = await itemsDetail(w.store, w.github, { repository: REPO, number: 3 });
  assert.ok(spec.actions.includes("reviewAsSpec"));
  assert.ok(!code.actions.includes("reviewAsSpec"));
});
