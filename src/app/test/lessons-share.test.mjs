// Task 28.9 and P42 steps 13-14: a person shares chosen proven lessons as
// summaries by pull request; Local only shares nowhere (R69.11-R69.15).
// A temporary planning repository with a bare origin and a fake GitHub.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { retroMemory } from "../retro-memory.mjs";
import { setOutcome, writeLesson } from "../lessons.mjs";
import { recordTraits } from "../lessons-share.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const xdg = temporaryDirectory("avoozl-share-xdg-");
process.env.GIT_CONFIG_GLOBAL = path.join(xdg, "gitconfig");
fs.writeFileSync(
  process.env.GIT_CONFIG_GLOBAL,
  "[user]\n\tname = Test\n\temail = test@example.com\n",
);
const configDirectory = path.join(xdg, "avoozl");
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function workspace(t, github) {
  const root = temporaryDirectory("avoozl-share-"),
    origin = path.join(root, "origin.git"),
    plans = path.join(root, "plans");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, plans);
  fs.writeFileSync(path.join(plans, "README.md"), "plans\n");
  git(plans, "add", "-A");
  git(plans, "commit", "-qm", "base");
  git(plans, "push", "-q", "origin", "main");
  fs.writeFileSync(
    path.join(plans, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      ...(github
        ? {
            github: {
              mode: "plans-repo",
              planningRepository: "acme/plans",
              repositories: { "acme/app": { baseBranch: "main" } },
            },
          }
        : {}),
    }),
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  store.put("projects", {
    id: "plans",
    root: plans,
    baseBranch: "main",
    repository: "acme/plans",
    planning: true,
    checks: [],
  });
  const pulls = [],
    ops = new Operations(store, {
      workspaceRoot: plans,
      configDirectory,
      github: {
        available: () => true,
        createPullRequest: async (repository, input) => {
          pulls.push({ repository, ...input });
          return { number: 7, html_url: "https://example.test/pull/7" };
        },
      },
    });
  return { root, origin, plans, store, ops, pulls };
}

const lesson = (lessons, source, finding) =>
  writeLesson(lessons, {
    pattern: {
      stage: "queued",
      check: "test",
      tool: "npm",
      traits: ["lang:javascript"],
    },
    finding,
    change: {
      type: "settings",
      key: "flow.batch.max",
      summary: "Larger batches",
    },
    evidence: { tasks: 10, metric: "lead time", before: 60, after: null },
    context: { models: ["m1"] },
    source,
    by: "dashboard",
  }).lesson;

test("P42 (13): a person shares a kept lesson as summaries by pull request to the plans repo", async (t) => {
  const W1 = workspace(t, true),
    id =
      W1.store.getMeta("workspaceId") ||
      (await W1.ops.execute("lessons.view", {}),
      W1.store.getMeta("workspaceId")),
    lessons = retroMemory(W1.store).lessons,
    kept = lesson(lessons, id, "Small tasks finish sooner in a batch."),
    untested = lesson(lessons, id, "Fewer reviews at once shorten the queue.");
  setOutcome(lessons, kept.id, "kept", { after: 40 });
  recordTraits(lessons, "other-workspace", ["lang:javascript"]);
  const view = await W1.ops.execute("lessons.view", {});
  assert.deepEqual(
    view.candidates.map((c) => c.id),
    [kept.id],
  );
  assert.match(
    view.candidates[0].why,
    /kept after PDCA, 10 tasks of evidence, fits 1 other workspace/,
  );
  assert.equal(view.share.repository, "acme/plans");
  await assert.rejects(
    W1.ops.execute("lessons.share.preview", { ids: [untested.id] }),
    /Only kept, unmarked lessons/,
  );
  const preview = await W1.ops.execute("lessons.share.preview", {
    ids: [kept.id],
  });
  for (const leak of [id, "context", "history", "m1", "plans"])
    assert.equal(preview.text.includes(leak), false, leak);
  await assert.rejects(
    W1.ops.execute(
      "lessons.share",
      { ids: [kept.id], previewHash: preview.hash },
      undefined,
      { mcp: true },
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    W1.ops.execute("lessons.share", { ids: [kept.id], previewHash: "x" }),
    /changed since that preview/,
  );
  const shared = await W1.ops.execute("lessons.share", {
    ids: [kept.id],
    previewHash: preview.hash,
  });
  assert.equal(shared.pushed, true);
  assert.deepEqual(shared.pullRequest, {
    number: 7,
    url: "https://example.test/pull/7",
  });
  assert.deepEqual(
    W1.pulls.map((p) => [p.repository, p.head, p.base]),
    [["acme/plans", shared.branch, "main"]],
  );
  const file = JSON.parse(
    git(W1.origin, "show", `${shared.branch}:.avoozl/lessons.json`),
  );
  assert.deepEqual(
    file.lessons.map((l) => l.finding),
    ["Small tasks finish sooner in a batch."],
  );
  assert.equal(
    git(W1.plans, "status", "--porcelain").includes("lessons.json"),
    false,
    "the checkout is untouched",
  );

  // The raw store exports for the driver handoff (R69.15), person only.
  const out = path.join(temporaryDirectory("avoozl-share-out-"), "raw.json");
  const raw = await W1.ops.execute("lessons.export", { path: out, raw: true });
  assert.equal(raw.raw, true);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).lessons.length, 2);
});

test("P42 (14): in Local only, Share is off and says lessons share nowhere", async (t) => {
  const W2 = workspace(t, false),
    view = await W2.ops.execute("lessons.view", {});
  assert.match(view.share.off, /Local only, so lessons share nowhere/);
  await assert.rejects(
    W2.ops.execute("lessons.share.preview", { ids: ["L-1"] }),
    /share nowhere/,
  );
});
