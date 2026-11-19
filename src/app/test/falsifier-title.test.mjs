// A falsifier for a later worker attempt gets its own chat title (found by
// P50: Kiro Crew keys a chat by its title, so attempt 2's round 1 reused
// attempt 1's falsifier chat and never opened).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store.mjs";
import { investigationStep } from "../investigate.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = {
  id: "a",
  title: "Task a",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["a works."],
  repository: "app",
};

function titleFor(t, attempt) {
  const root = temporaryDirectory("avoozl-falsifier-title-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [leaf], edges: [] });
  store.put("repositories", { id: "app", root, baseBranch: "main" });
  const at = new Date().toISOString(),
    slot = `w-${attempt}`;
  store.put("session_bindings", {
    id: slot,
    slot,
    taskId: "a",
    role: "worker",
    attempt,
    source: "tick",
    investigate: true,
    boundAt: at,
    report: { kind: "findings", at },
  });
  store.put("task_investigations", {
    id: "a",
    taskId: "a",
    attempt,
    slot,
    state: "falsifying",
    rounds: [{ n: 1, findings: { read: "x" }, findingsAt: at }],
    openedAt: at,
    updatedAt: at,
  });
  return investigationStep(store, {}, { script: true }).dispatch[0]?.title;
}

test("attempt 1 keeps its title; a later attempt names itself", (t) => {
  assert.equal(titleFor(t, 1), "avoozl:a falsify round 1");
  assert.equal(titleFor(t, 2), "avoozl:a attempt 2 falsify round 1");
});
