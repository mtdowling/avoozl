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
//     [--report-field report | --report-artifact build-report] [--out report.json]
//
// With --report-field, `receipts.report` names that field of each receipt
// line; with --report-artifact, that artifact prefix. With either, the
// script then starts a retrospective (a manual trigger, as
// flow.retro.start queues one) and writes its brief to <root>/retro-brief.txt.
// The retro makes no GitHub call.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { PR_CI, ciStep } from "../src/app/flow-ci.mjs";
import { buildBrief } from "../src/app/build-breakdown.mjs";
import { retroStep } from "../src/app/flow-retro.mjs";
import { flowView } from "../src/app/radar-flow.mjs";
import { GitHubClient } from "../src/app/github.mjs";
import { withGitHubReadSnapshots } from "../src/app/github-read-snapshot.mjs";
import { Store } from "../src/app/store.mjs";
import { emptySnapshot } from "../src/app/workspace.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    repository: { type: "string" },
    out: { type: "string" },
    "report-artifact": { type: "string" },
    "report-field": { type: "string" },
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
// P65 setup: receipts on, and the repository's build reports when it writes
// them; a retro every 4 tasks, as in P64.
const config = {
  flow: { retro: { everyTasks: 4 } },
  ...(values["report-field"]
    ? { receipts: { report: { field: values["report-field"] } } }
    : values["report-artifact"]
      ? { receipts: { report: { artifact: values["report-artifact"] } } }
      : {}),
};
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
    // Flow's own view (radar.flow), which now carries the builds of any
    // repository with stored observations.
    view = flowView(store).builds,
    brief = buildBrief(store, [repository], { now });
  // Start a retrospective by hand, as flow.retro.start does, and keep its
  // brief.
  let retro = null;
  if (config.receipts) {
    const s = store.getMeta("flow.retro.state") || {
      seen: [],
      pending: [],
      reverts: [],
    };
    store.setMeta("flow.retro.state", {
      ...s,
      pending: [
        ...s.pending,
        {
          kind: "manual",
          key: "manual:" + now,
          detail: "started by hand",
          at: new Date(now).toISOString(),
        },
      ],
    });
    const out = retroStep(store, config, {
      now,
      repository,
      ciRepositories: [repository],
      ciConfig: config,
    });
    const text = out.dispatch[0]?.brief ?? null;
    if (text) fs.writeFileSync(path.join(root, "retro-brief.txt"), text);
    retro = { started: Boolean(out.retro), brief: Boolean(text) };
  }
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
    breakdownRows: rows(
      "SELECT pr_number AS pr, target, attempt, workload, engine, toolchain, cache, costs, parts FROM build_breakdowns WHERE repository=? ORDER BY pr_number",
      repo,
    ),
    retro,
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
