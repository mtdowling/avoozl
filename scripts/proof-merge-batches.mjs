#!/usr/bin/env node
// Proof mb-p1 (merge-batches spec): merge batches on a scratch repository.
// An isolated workspace in the temporary folder, a scratch repository with
// a bare remote, a real check that takes a few seconds, and twelve verified
// tasks across two specs: one breaks the check alone, one fails once and
// then passes, and two break it only together. The tick runs until the queue
// is empty. No real workspace, no GitHub, no images.
//
//   node scripts/proof-merge-batches.mjs [--check-seconds 3] [--out receipt.md]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { digest } from "../src/model.mjs";
import { Store } from "../src/app/store.mjs";
import { integrateVerified } from "../src/app/delivery.mjs";
import { landingQueue } from "../src/app/landing-queue.mjs";
import { landDirect } from "../src/app/direct-landing.mjs";
import { sizeRecord } from "../src/app/merge-batch-size.mjs";
import { takeOverSpec } from "../src/app/spec-takeover.mjs";
import { snapshot } from "../src/app/test/fixtures.mjs";

const { values } = parseArgs({
  options: {
    "check-seconds": { type: "string", default: "3" },
    out: { type: "string" },
  },
});
const seconds = Number(values["check-seconds"]);
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-mb-p1-")),
  origin = path.join(root, "origin.git"),
  checkout = path.join(root, "app");

git(root, "init", "--bare", "-b", "main", origin);
git(root, "clone", "-q", origin, checkout);
for (const [k, v] of [
  ["user.name", "Proof"],
  ["user.email", "proof@example.invalid"],
])
  git(checkout, "config", k, v);
fs.writeFileSync(path.join(checkout, "README.md"), "scratch\n");
git(checkout, "add", ".");
git(checkout, "commit", "-qm", "Start");
git(checkout, "push", "-q", "origin", "main");

// The check: sleeps, then fails when bad.txt exists, when pair-a.txt and
// pair-b.txt exist together, or the first time it sees flaky.txt.
const marker = path.join(root, "flaky-seen"),
  script = path.join(root, "check.mjs");
fs.writeFileSync(
  script,
  `import fs from "node:fs";
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${seconds * 1000});
const has = (f) => fs.existsSync(f);
let bad = has("bad.txt") || (has("pair-a.txt") && has("pair-b.txt"));
if (has("flaky.txt") && !has(${JSON.stringify(marker)})) {
  fs.writeFileSync(${JSON.stringify(marker)}, "x");
  bad = true;
}
process.exit(bad ? 1 : 0);
`,
);

const store = new Store(path.join(root, "workspace.sqlite"));
const leaf = (id, planId) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  planId,
});
const tasks = [];
const files = {
  t3: "bad.txt",
  t6: "flaky.txt",
  t8: "pair-a.txt",
  t9: "pair-b.txt",
};
for (let n = 1; n <= 12; n += 1)
  tasks.push(leaf(`t${n}`, n <= 6 ? "s1" : "s2"));
store.importSnapshot({ ...snapshot(), tasks, edges: [] });
store.put("repositories", {
  id: "app",
  root: fs.realpathSync.native(checkout),
  baseBranch: "main",
  landing: "direct",
  checks: [[process.execPath, script]],
  worktreeRoot: path.join(root, "wt"),
  github: "scratch/app",
});
for (const spec of ["s1", "s2"]) {
  store.put("plans", { id: spec, spec, hash: digest("plan " + spec) });
  store.put("receipts", {
    id: `spec-journal:${spec}`,
    kind: "spec-journal",
    planId: spec,
    home: "local",
  });
  await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, spec);
}
for (const task of tasks) {
  const id = task.id,
    branch = `avoozl/${id}`,
    wt = path.join(root, "wt", id);
  git(checkout, "worktree", "add", "-q", "-b", branch, wt, "main");
  fs.writeFileSync(path.join(wt, files[id] ?? `${id}.txt`), id + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", "Do " + id);
  const commit = git(wt, "rev-parse", "HEAD");
  store.put("task_worktrees", {
    id,
    taskId: id,
    path: wt,
    branch,
    repository: "app",
  });
  store.put("task_deliveries", {
    id,
    taskId: id,
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  store.put("session_bindings", {
    id: "slot-" + id,
    slot: "slot-" + id,
    taskId: id,
    role: "worker",
    attempt: 1,
    status: "working",
  });
}
await integrateVerified(store);

const Q = { repositoryId: "app", base: "main" },
  config = {
    github: {
      repositories: { "scratch/app": { baseBranch: "main", landing: {} } },
    },
  },
  rows = [],
  order = landingQueue(store, Q).map((e) => e.key),
  // The later of the pair in queue order is the one that goes back.
  [early, late] = ["t8", "t9"].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
const remoteRefs = () =>
  git(origin, "for-each-ref", "--format=%(refname)").split("\n");
const sentBack = new Map();
let guard = 0;
while (landingQueue(store, Q).length && guard++ < 40) {
  const before = landingQueue(store, Q).map((e) => e.key),
    limit = sizeRecord(store, Q).limit,
    started = Date.now(),
    result = await landDirect(store, {
      workspaceRoot: root,
      rounds: 0,
      machine: {},
      config,
    });
  for (const message of result.messages) sentBack.set(message.task, true);
  for (const note of result.notify) sentBack.set(note.task, true);
  const after = landingQueue(store, Q).map((e) => e.key),
    record = sizeRecord(store, Q),
    states = Object.fromEntries(
      tasks.map((t) => [t.id, store.get("task_deliveries", t.id).state]),
    );
  rows.push({
    step: rows.length + 1,
    limit,
    members: before.filter((k) => !after.includes(k)).length,
    queueAfter: after.length,
    nextLimit: record.limit,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    refs: remoteRefs().join(","),
    states,
  });
}
const final = Object.fromEntries(
  tasks.map((t) => [t.id, store.get("task_deliveries", t.id).state]),
);
const landed = Object.keys(final).filter((k) => final[k] === "integrated"),
  back = Object.keys(final).filter((k) => final[k] !== "integrated");
const lines = [
  "# mb-p1 receipt: merge batches on a scratch repository",
  "",
  `Run ${new Date().toISOString()} on ${process.platform} with ${git(root, "--version")}. The check sleeps ${seconds} s, then fails on \`bad.txt\`, on \`pair-a.txt\` with \`pair-b.txt\`, and the first time it sees \`flaky.txt\`. Twelve tasks, two specs: t3 breaks it alone, t6 is flaky, t8 and t9 break it only together.`,
  "",
  "| Step | Limit before | Left the queue | Queue after | Limit after | Seconds | Remote refs |",
  "| ---- | ------------ | -------------- | ----------- | ----------- | ------- | ----------- |",
  ...rows.map(
    (r) =>
      `| ${r.step} | ${r.limit} | ${r.members} | ${r.queueAfter} | ${r.nextLimit} | ${r.seconds} | ${r.refs} |`,
  ),
  "",
  `Landed (${landed.length}): ${landed.join(", ")}.`,
  `Sent back (${back.length}): ${back.map((k) => `${k} (${final[k]})`).join(", ")}.`,
  "",
  `- OBSERVED: (1) good tasks landed: ${["t1", "t2", "t4", "t5", "t7", "t10", "t11", "t12"].every((k) => landed.includes(k))}`,
  `- OBSERVED: (1) the flaky task t6 landed: ${landed.includes("t6")}`,
  `- OBSERVED: (1) the culprit t3 went back: ${back.includes("t3")}`,
  `- OBSERVED: (1) queue order was ${order.join(", ")}`,
  `- OBSERVED: (1) the later of the pair, ${late}, went back and the earlier, ${early}, landed: ${back.includes(late) && landed.includes(early)}`,
  `- OBSERVED: (2) the limit started at ${rows[0]?.limit} and reached ${Math.max(...rows.map((r) => r.nextLimit))}; limits after each step: ${rows.map((r) => r.nextLimit).join(", ")}`,
  `- OBSERVED: (2) no ref but the base on the remote after any step: ${rows.every((r) => r.refs === "refs/heads/main")}`,
  "",
];
const text = lines.join("\n");
if (values.out) fs.writeFileSync(values.out, text);
else process.stdout.write(text);
store.close();
