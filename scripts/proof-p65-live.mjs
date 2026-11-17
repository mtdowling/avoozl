#!/usr/bin/env node
// Proof P65 (design §4.31, R101): every build receipt kept, read live and
// read only from a real repository. It makes a scratch workspace with
// `buildReceipts` on, runs the tick's CI step (`ciStep`) twice against
// GitHub with the owner's `gh` login, and reports what was stored, what
// Flow's build view and the retro brief make of it, and every request.
// Every request goes through a guard that allows only GraphQL queries (no
// mutation) and GET requests on the named repository, and refuses anything
// else before it leaves the machine.
//
//   node scripts/proof-p65-live.mjs --root <temp dir> --repository o/r \
//     [--out report.json]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { PR_CI, ciStep } from "../src/app/flow-ci.mjs";
import { buildView, observationsFor } from "../src/app/build-receipt-read.mjs";
import { buildBrief } from "../src/app/build-breakdown.mjs";
import { GitHubClient } from "../src/app/github.mjs";
import { withGitHubReadSnapshots } from "../src/app/github-read-snapshot.mjs";
import { Store } from "../src/app/store.mjs";
import { emptySnapshot } from "../src/app/workspace.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    repository: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.root || !values.repository) {
  console.error("Name a scratch --root and the --repository to read.");
  process.exit(2);
}
const root = path.resolve(values.root),
  repository = values.repository,
  allowed = repository.toLowerCase();
const temp = [os.tmpdir(), "/tmp"].flatMap((dir) => [
  path.resolve(dir) + path.sep,
  fs.realpathSync(dir) + path.sep,
]);
if (!temp.some((dir) => (root + path.sep).startsWith(dir))) {
  console.error("The scratch root must be in the temporary folder.");
  process.exit(2);
}
fs.mkdirSync(path.join(root, ".avoozl", "local"), { recursive: true });
// P65 setup: receipts on; no `receipts.report`, because the repository's CI
// writes none (a field set to a name no line carries reads nothing).
const config = {};
fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(config));

// Requests per check, by kind.
let check = null;
const checks = [],
  refused = [],
  signed = new Set();
const kind = (pathname) =>
  /\/actions\/artifacts\/\d+\/zip$/.test(pathname)
    ? "download"
    : /\/actions\/artifacts$/.test(pathname)
      ? "list"
      : /\/actions\/runs$/.test(pathname)
        ? "runs"
        : "other";
const guarded = async (url, init = {}) => {
  const method = (init.method || "GET").toUpperCase(),
    target = new URL(url);
  let ok = false,
    label = "graphql";
  if (method === "POST" && target.pathname === "/graphql") {
    const body = JSON.parse(init.body || "{}");
    ok =
      !/^\s*mutation\b/.test(body.query || "") &&
      !/\bmutation\s*[({]/.test(body.query || "") &&
      `${body.variables?.owner}/${body.variables?.repo}`.toLowerCase() ===
        allowed;
  } else if (method === "GET") {
    ok = target.pathname.toLowerCase().startsWith(`/repos/${allowed}/`);
    label = kind(target.pathname);
    // The signed address an allowed artifact download redirected to, sent
    // with no token (github.mjs downloadArtifact): the file itself.
    if (!ok && signed.has(String(url))) {
      const auth = new Headers(init.headers || {}).get("authorization");
      ok = !auth;
      label = "signed";
    }
  }
  if (!ok) {
    refused.push(`${method} ${target.host}${target.pathname}`);
    throw new Error(`P65 live guard refused ${method} ${target.pathname}`);
  }
  const response = await fetch(url, init);
  if (label === "download") {
    const location = response.headers.get("location");
    if (location) signed.add(location);
  }
  check.counts[label] = (check.counts[label] ?? 0) + 1;
  check.log.push(`${method} ${target.pathname} ${response.status}`);
  if (label === "list" && response.status === 304) check.counts.list304 = 1;
  return response;
};

const token = execFileSync("gh", ["auth", "token"], {
    encoding: "utf8",
  }).trim(),
  store = new Store(path.join(root, ".avoozl", "local", "workspace.sqlite"));
try {
  store.read();
} catch {
  store.importSnapshot(emptySnapshot("P65 scratch"));
}
const rows = (sql, ...args) => store.db.prepare(sql).all(...args);
let report;
try {
  const github = new GitHubClient({ token, fetch: guarded }).bind(store, {
    cacheSeconds: () => 0,
    countFile: path.join(root, "calls.jsonl"),
  });
  const policy = {
    mode: "single-repo",
    repositories: { [repository]: { buildReceipts: true } },
  };
  for (const name of ["first", "second"]) {
    check = { name, counts: {}, log: [] };
    const now = Date.now(),
      step = await withGitHubReadSnapshots(() =>
        ciStep(store, github, { policy, config, now }),
      );
    check.errors = step.errors;
    check.artifactsRead = rows(
      "SELECT COUNT(*) AS n FROM receipt_artifacts WHERE kind IN ('receipt','report')",
    )[0].n;
    checks.push(check);
  }
  const repo = allowed,
    now = Date.now(),
    pulls = store.list(PR_CI).filter((row) => row.mergedAt),
    artifacts = rows(
      "SELECT kind, COUNT(*) AS n, SUM(lines) AS lines, SUM(skipped) AS skipped FROM receipt_artifacts WHERE repository=? GROUP BY kind",
      repo,
    ),
    perPull = rows(
      "SELECT pr_number AS pr, head_sha AS head, COUNT(*) AS n, SUM(failed) AS failed, COUNT(DISTINCT target) AS targets, COUNT(DISTINCT run_id) AS runs, COUNT(DISTINCT attempt) AS attempts, GROUP_CONCAT(DISTINCT phase) AS phases FROM build_observations WHERE repository=? GROUP BY pr_number, head_sha ORDER BY pr_number DESC",
      repo,
    ),
    // Flow's build view (buildView, as radar-flow's flowView calls it) over
    // every merged pull request with stored observations.
    flowRows = pulls
      .map((pull) => ({
        pullNumber: pull.number,
        repository,
        instance: null,
        builds: observationsFor(store, repository, pull.headSha, pull.number),
      }))
      .filter((row) => row.builds.length),
    view = buildView(flowRows),
    brief = buildBrief(store, [repository], { now });
  report = {
    at: new Date(now).toISOString(),
    repository,
    checks,
    refused,
    mergedPullRequests: pulls.length,
    artifacts,
    observations: rows(
      "SELECT COUNT(*) AS n, SUM(failed) AS failed FROM build_observations WHERE repository=?",
      repo,
    )[0],
    breakdowns: rows(
      "SELECT COUNT(*) AS n FROM build_breakdowns WHERE repository=?",
      repo,
    )[0].n,
    perPull,
    failedObservations: rows(
      "SELECT pr_number AS pr, target, attempt, exit, run_id AS run, ms FROM build_observations WHERE repository=? AND failed=1",
      repo,
    ),
    flow: view,
    brief,
    rate: {
      core: github.rateLimit("core"),
      graphql: github.rateLimit("graphql"),
    },
  };
} finally {
  store.close();
}
const text = JSON.stringify(report, null, 2);
if (values.out) fs.writeFileSync(values.out, text + "\n");
console.log(text);
process.exit(refused.length || checks.some((c) => c.errors.length) ? 1 : 0);
