#!/usr/bin/env node
// Proof wp-p4 (worker-paths WP1 to WP9, design D1): one dispatcher, two
// executors, one remote route. Reads this checkout only; writes nothing but
// what it prints.
//
//   node scripts/proof-wp-p4.mjs [--before COMMIT]
//
// `--before` is the commit before Phase 2 (default: the parent of wp-2.1's
// merge, fabe9bc5).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(REPO, "src", "app");
const { values } = parseArgs({
  options: { before: { type: "string", default: "fabe9bc5^" } },
});
const git = (...args) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

// 1. The source test of WP1.4 and the pair table's test.
const tests = spawnSync(
  process.execPath,
  [
    "--test",
    "src/app/test/one-dispatcher.test.mjs",
    "src/app/test/worker-briefs.test.mjs",
  ],
  { cwd: REPO, encoding: "utf8" },
);
const count = (name) =>
  Number(tests.stdout.match(new RegExp(`^ℹ ${name} (\\d+)`, "m"))?.[1] ?? -1);

// 2. Every module whose source writes a session request with role worker,
// as the source test reads them, and the manual take, which binds a
// person's take without a request.
const REQUEST = /\b(kirocrewRequest|startRequest|enqueueSessionRequests)\(/g;
const sources = [
  ...fs.readdirSync(APP).map((name) => [name, path.join(APP, name)]),
  ...fs
    .readdirSync(path.join(APP, "executors"))
    .map((name) => [`executors/${name}`, path.join(APP, "executors", name)]),
].filter(([name]) => name.endsWith(".mjs"));
const writers = [];
for (const [name, file] of sources) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(REQUEST)) {
    let depth = 0,
      end = match.index + match[0].length - 1;
    for (; end < text.length; end++) {
      if (text[end] === "(") depth++;
      else if (text[end] === ")" && --depth === 0) break;
    }
    if (/role:\s*"worker"/.test(text.slice(match.index, end))) {
      writers.push(name);
      break;
    }
  }
}
const takeBinds = /role:\s*"worker"/.test(
  fs.readFileSync(path.join(APP, "manual-take.mjs"), "utf8"),
);

// 3. Every worker brief the pair table builds, searched for the words.
const { workerBrief } = await import("../src/app/delivery.mjs");
const { briefCell, EXECUTORS, KINDS } = await import(
  "../src/app/worker-briefs.mjs"
);
const PROJECT = { id: "app", root: "/tmp/app", baseBranch: "main" };
const TASK = { id: "a", title: "Task a", acceptance: ["Works."] };
const DATA = { tasks: [TASK, { ...TASK, id: "b", title: "Task b" }] };
const LEAF = { task: TASK, batch: { id: "x", tasks: ["a", "b"] } };
const RECORD = {
  envelope: { taskId: "a", baseCommit: "abc123", brief: "Do the work." },
};
const WHERE = { worktree: "/tmp/wt", branch: "avoozl/remote/a" };
const build = (executor, kind) => {
  const picked = briefCell(executor, kind),
    { cell } = picked;
  if (picked.declined || kind !== picked.kind) return null;
  const cliReport = { worktree: "/tmp/wt", token: "tok", workspace: "/tmp/ws" };
  if (kind === "single" || kind === "investigate")
    return workerBrief(TASK, PROJECT, {
      attempt: 1,
      investigate: kind === "investigate",
      findingsVia: { executor, cliReport },
      steps: cell.steps({ task: TASK, project: PROJECT, cliReport }),
    });
  if (kind === "batch") return cell.brief(null, DATA, LEAF, "");
  if (kind === "round") return cell.finish;
  return cell.brief(RECORD, WHERE, "avoozl");
};
const WORDS = /\bpush|pull request|auto-merge/gi;
const briefs = [],
  found = [];
let forbidding = 0,
  describing = 0;
for (const executor of EXECUTORS)
  for (const kind of KINDS) {
    const brief = build(executor, kind);
    if (brief === null) continue;
    briefs.push(`${executor} ${kind}`);
    // A sentence that tells the worker to push, open a pull request or turn
    // on auto-merge. A sentence that forbids it ("Do not push", "push
    // nothing") is counted apart, and so is one that says what Avoozl or the
    // runner does.
    for (const sentence of String(brief).split(/(?<=[.:])\s+|\n/)) {
      WORDS.lastIndex = 0;
      if (!WORDS.test(sentence)) continue;
      if (
        /\b(do not|don't)\b|\bnothing\b|\bnot\b.*\banything\b/i.test(sentence)
      )
        forbidding += 1;
      // What Avoozl or the runner does is not an instruction to the worker.
      else if (/^(Avoozl|The runner)\b/.test(sentence.trim())) describing += 1;
      else found.push(`${executor} ${kind}: ${sentence.trim()}`);
    }
  }

// 4. Lines of src/app before Phase 2 and now, and the modules that went.
const lines = (rev) =>
  git("ls-tree", "-r", "--name-only", rev, "src/app")
    .split("\n")
    .filter((file) => !file.startsWith("src/app/test/"))
    .reduce(
      (sum, file) => sum + git("show", `${rev}:${file}`).split("\n").length,
      0,
    );
const before = git("rev-parse", values.before),
  head = git("rev-parse", "HEAD");
const gone = git(
  "diff",
  "--name-only",
  "--diff-filter=D",
  before,
  head,
  "--",
  "src/app",
)
  .split("\n")
  .filter((file) => file && !file.startsWith("src/app/test/"));

const result = {
  head,
  before,
  tests: { status: tests.status, pass: count("pass"), fail: count("fail") },
  workerRequestWriters: writers,
  manualTakeBinds: takeBinds,
  briefs,
  found,
  forbidding,
  describing,
  lines: { before: lines(before), now: lines(head) },
  gone,
};
const verdict = {
  testsPass: tests.status === 0 && result.tests.fail === 0,
  oneDispatcher:
    writers.every((name) =>
      ["delivery.mjs", "remote-runner.mjs"].includes(name),
    ) &&
    writers.includes("delivery.mjs") &&
    takeBinds,
  noPushInBriefs: briefs.length > 0 && found.length === 0,
};
console.log(JSON.stringify({ verdict, result }, null, 2));
process.exit(Object.values(verdict).every(Boolean) ? 0 : 1);
