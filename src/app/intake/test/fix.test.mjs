// Fixes without spec files (triage-agent ta-1.1, TA9, design §D5): one from
// text and one from an issue each become a ready leaf, verify and land with
// the two acceptance lines; a version 1 record loads; Make this a spec
// writes a folder that lints clean. Real git with a bare "origin"; nothing
// live.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { integrateVerified } from "../../delivery/delivery.mjs";
import { landDirect } from "../../landing/direct-landing.mjs";
import { queryTasks } from "../../../query.mjs";

import {
  FIX_ACCEPTANCE,
  fixIssue,
  fixRecord,
  fixToSpec,
  startFix,
} from "../fix.mjs";
import { lintSpec, readSpecFolder } from "../../specs/spec-plans.mjs";
import { verifiedTask } from "../../test/fixtures.mjs";
import { REPO, triageWorkspace } from "../../test/triage-fixture.mjs";

import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = REPO;

// The triage fixture's workspace (a checkout, a bare origin, a `direct`
// repository), with the agent off and a fix's journal context.
function workspace(t) {
  const w = triageWorkspace(t, { triage: { agent: "off" } }),
    context = { workspaceRoot: w.root, actor: "Operator" };
  return {
    ...w,
    origin: path.join(w.root, "origin.git"),
    context,
    start: (input) => startFix(w.store, input, context),
  };
}

const task = (store, id) => store.read().tasks.find((entry) => entry.id === id);
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

async function lands(w, taskId) {
  const ready = queryTasks(w.store.read(), { scope: "all", q: "ready:true" });
  assert.ok(
    ready.some((entry) => entry.id === taskId),
    `${taskId} is ready to start`,
  );
  const { commit } = verifiedTask(w, taskId);
  await integrateVerified(w.store);
  await landDirect(w.store, { workspaceRoot: w.root, rounds: 2, machine: {} });
  const landed = git(w.origin, "rev-parse", "main");
  git(w.origin, "merge-base", "--is-ancestor", commit, landed);
  assert.equal(w.store.get("task_deliveries", taskId).state, "integrated");
}

test("a fix from text is a ready leaf that verifies and lands", async (t) => {
  const w = workspace(t),
    { taskId } = await w.start({
      text: "Trim the trailing space in the greeting.\n\nIt shows on every page.",
      repository: "app",
    });
  const made = task(w.store, taskId);
  assert.equal(taskId, "fix-1");
  assert.equal(made.title, "Trim the trailing space in the greeting.");
  assert.deepEqual(made.acceptance, [...FIX_ACCEPTANCE]);
  assert.deepEqual(made.fix.source, {
    text: "Trim the trailing space in the greeting.\n\nIt shows on every page.",
    by: "person",
  });
  assert.equal(made.approvedSource.hash, made.fix.definition);
  assert.equal(made.dispatch.ready, true);
  assert.equal(fixIssue(made), null);
  await lands(w, taskId);
  // The next fix takes the next number.
  assert.equal(
    (await w.start({ text: "Another", repository: REPOSITORY })).taskId,
    "fix-2",
  );
});

test("the definition hash changes when the text changes", () => {
  const a = fixRecord({ text: "Do A" }),
    b = fixRecord({ text: "Do B" });
  assert.notEqual(a.definition, b.definition);
  assert.equal(a.definition, fixRecord({ text: "Do A" }).definition);
  const issue = { repository: REPOSITORY, number: 1 };
  assert.notEqual(
    fixRecord({ issue, title: "T", body: "one" }).definition,
    fixRecord({ issue, title: "T", body: "two" }).definition,
  );
});

test("a fix refuses empty text and a repository with no checkout", async (t) => {
  const w = workspace(t);
  await assert.rejects(w.start({ text: " ", repository: "app" }), /Say what/);
  await assert.rejects(
    w.start({ text: "x", repository: "nope" }),
    (error) => error.status === 404,
  );
});

test("Make this a spec writes a folder that lints clean and archives the fix", async (t) => {
  const w = workspace(t),
    { taskId } = await w.start({
      text: "Rework the greeting.\n\nIt needs a design: three pages use it.",
      repository: "app",
    });
  const result = fixToSpec(w.store, w.root, { taskId });
  assert.equal(result.spec, "fix-1");
  const spec = readSpecFolder(w.root, "fix-1"),
    lint = lintSpec({ spec, plan: { id: "fix-1" }, data: w.store.read() });
  assert.equal(lint.counts.error, 0, JSON.stringify(lint.diagnostics));
  assert.match(spec.files["requirements.md"], /> It needs a design/);
  assert.equal(lint.taskCount, 1);
  const archived = task(w.store, taskId);
  assert.ok(archived.archivedAt);
  assert.deepEqual(
    { spec: archived.fixSpec.spec, folder: archived.fixSpec.folder },
    { spec: "fix-1", folder: path.join(".kiro", "specs", "fix-1") },
  );
  assert.equal(archived.dispatch.ready, false);
  assert.throws(
    () => fixToSpec(w.store, w.root, { taskId }),
    /already archived/,
  );
});
