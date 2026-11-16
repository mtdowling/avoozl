#!/usr/bin/env node
// Proof P64 (design §4.30, R100): the retro's steady CI waste triggers on a
// real repository, read only. It makes a scratch workspace, runs the tick's
// CI step (`ciStep`) once against GitHub with the owner's `gh` login, then
// the retro's trigger and brief code on what it recorded. Every request goes
// through a guard that allows only GraphQL queries (no mutation) and GET
// requests on the named repository, and refuses anything else before it
// leaves the machine.
//
//   node scripts/proof-p64-live.mjs --root <temp dir> --repository o/r \
//     [--fixed-at <ISO time of the CI fix>] [--out report.json]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  CI_RUNS,
  PR_CI,
  ciBrief,
  ciFacts,
  ciMinutesPerPullRequest,
  ciStep,
  ciTriggers,
  docsOnly,
  repeatRuns,
} from "../src/app/flow-ci.mjs";
import { GitHubClient } from "../src/app/github.mjs";
import { withGitHubReadSnapshots } from "../src/app/github-read-snapshot.mjs";
import { Store } from "../src/app/store.mjs";
import { emptySnapshot } from "../src/app/workspace.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    repository: { type: "string" },
    "fixed-at": { type: "string" },
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
// The proof's settings (P64 setup): a retro every 4 tasks, docs-only waste
// over 1 CI minute.
const config = {
  flow: { retro: { everyTasks: 4 }, ci: { docsOnlyMinutes: 1 } },
};
fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(config));

const requests = { graphql: 0, get: 0, refused: [], log: [] };
const guarded = async (url, init = {}) => {
  const method = (init.method || "GET").toUpperCase(),
    target = new URL(url);
  let ok = false;
  if (method === "POST" && target.pathname === "/graphql") {
    const body = JSON.parse(init.body || "{}");
    ok =
      !/^\s*mutation\b/.test(body.query || "") &&
      !/\bmutation\s*[({]/.test(body.query || "") &&
      `${body.variables?.owner}/${body.variables?.repo}`.toLowerCase() ===
        allowed;
    if (ok) requests.graphql += 1;
  } else if (method === "GET")
    ok = target.pathname.toLowerCase().startsWith(`/repos/${allowed}/`);
  if (ok && method === "GET") requests.get += 1;
  requests.log.push(`${ok ? "sent" : "refused"} ${method} ${target.pathname}`);
  if (!ok) {
    requests.refused.push(`${method} ${target.pathname}`);
    throw new Error(`P64 live guard refused ${method} ${target.pathname}`);
  }
  const response = await fetch(url, init);
  requests.log.push(`  ${response.status}`);
  return response;
};

const token = execFileSync("gh", ["auth", "token"], {
    encoding: "utf8",
  }).trim(),
  store = new Store(path.join(root, ".avoozl", "local", "workspace.sqlite")),
  now = Date.now();
// A new, empty workspace: no tasks, so every pull request is `other`.
try {
  store.read();
} catch {
  store.importSnapshot(emptySnapshot("P64 scratch"));
}
let report;
try {
  const github = new GitHubClient({ token, fetch: guarded }).bind(store, {
    cacheSeconds: () => 0,
    countFile: path.join(root, "calls.jsonl"),
  });
  const policy = { mode: "single-repo", repositories: { [repository]: {} } };
  const step = await withGitHubReadSnapshots(() =>
    ciStep(store, github, { policy, config, now }),
  );
  const pulls = store.list(PR_CI),
    runs = store.list(CI_RUNS),
    facts = ciFacts(store, config, repository, { now }),
    fixedAt = values["fixed-at"] ? Date.parse(values["fixed-at"]) : null,
    split = (list, after) =>
      list.filter((run) =>
        after
          ? Date.parse(run.startedAt) > fixedAt
          : Date.parse(run.startedAt) <= fixedAt,
      ),
    linked = runs.filter((run) => run.prNumber !== null);
  report = {
    at: new Date(now).toISOString(),
    repository,
    errors: step.errors,
    read: {
      pullRequests: pulls.length,
      openPullRequests: pulls.filter((row) => !row.closedAt).length,
      docsOnlyPullRequests: pulls.filter((row) => docsOnly(row.classes)).length,
      runs: runs.length,
      runsLinkedToPullRequests: linked.length,
      oldestRun: runs.map((r) => r.startedAt).sort()[0] || null,
      newestRun:
        runs
          .map((r) => r.startedAt)
          .sort()
          .at(-1) || null,
      events: Object.fromEntries(
        [...new Set(runs.map((r) => r.event))].map((e) => [
          e,
          runs.filter((r) => r.event === e).length,
        ]),
      ),
      workflows: facts.workflows,
    },
    facts: {
      docsOnlyMinutes: Math.round(facts.docsOnlyMs / 6000) / 10,
      closed: facts.closed,
      waitShare: facts.waitShare,
      byClass: facts.byClass,
      repeats: facts.repeats.length,
    },
    triggers: ciTriggers(store, config, [repository], { now }),
    brief: ciBrief(store, config, [repository], { now }),
    split: fixedAt
      ? {
          fixedAt: new Date(fixedAt).toISOString(),
          repeatsBefore: repeatRuns(split(runs, false)),
          repeatsAfter: repeatRuns(split(runs, true)),
          specMinutesPerPullRequest: {
            before: ciMinutesPerPullRequest(store, {
              repository,
              cls: "spec",
              n: 4,
              at: new Date(fixedAt).toISOString(),
            }),
            after: ciMinutesPerPullRequest(store, {
              repository,
              cls: "spec",
              n: 4,
              at: new Date(fixedAt).toISOString(),
              after: true,
            }),
          },
        }
      : null,
    requests: {
      graphql: requests.graphql,
      get: requests.get,
      refused: requests.refused,
      log: requests.log,
    },
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
process.exit(report.requests.refused.length || report.errors.length ? 1 : 0);
