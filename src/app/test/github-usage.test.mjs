// Calls counted by source, and one query for all open pull requests. Fake
// fetch and a temporary store; no network.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import { rateView, withSource, countFilePath } from "../github-rate.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const T0 = Date.parse("2026-11-15T10:00:00Z");

function setup(t, nodes = []) {
  const dir = temporaryDirectory("avoozl-usage-"),
    store = new Store(path.join(dir, "workspace.sqlite")),
    countFile = path.join(dir, "gh-calls.jsonl"),
    log = { queries: [] };
  t.after(() => store.close());
  const github = new GitHubClient({
    token: "test-token",
    apiUrl: "https://api.example.test",
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      log.queries.push(body);
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequests: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes,
              },
            },
          },
        }),
        { status: 200 },
      );
    },
  }).bind(store, { now: () => T0, cacheSeconds: () => 60, countFile });
  return { github, store, log, countFile, dir };
}

const pull = (n) => ({
  number: n,
  url: `https://example.test/pull/${n}`,
  updatedAt: "2026-11-15T09:00:00Z",
  headRefName: `task/t${n}`,
  headRefOid: `sha${n}`,
  baseRefName: "main",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  labels: { nodes: [{ name: "ready" }] },
  closingIssuesReferences: {
    nodes: [
      {
        number: 100 + n,
        title: "t",
        url: "u",
        repository: { nameWithOwner: "example/code" },
      },
    ],
  },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
});

test("ten open pull requests cost one query", async (t) => {
  const nodes = Array.from({ length: 10 }, (_, i) => pull(i + 1)),
    { github, log } = setup(t, nodes),
    branches = nodes.map((n) => n.headRefName),
    heads = await github.pullRequestHeads("example/code", branches);
  assert.equal(Object.values(heads).filter(Boolean).length, 10);
  assert.equal(heads["task/t3"].head, "sha3");
  // Closing issues, labels and checks come from the same read.
  const closing = await github.pullRequestClosingIssues("example/code", 4);
  assert.equal(closing[0].number, 104);
  const open = await github.openPullRequests("example/code");
  assert.equal(open[0].labels.nodes[0].name, "ready");
  assert.equal(log.queries.length, 1);
});

test("calls are counted by source, cache hits apart", async (t) => {
  const { github, store, countFile } = setup(t, [pull(1)]);
  await withSource("view", () => github.openPullRequests("example/code"));
  await withSource("view", () => github.openPullRequests("example/code"));
  await withSource("tick", () => github.openPullRequests("example/other"));
  github.rate.flush(true);
  const view = rateView(store, T0, { countFile });
  assert.deepEqual(view.bySource.view, { calls: 1, notModified: 0, cached: 1 });
  assert.equal(view.bySource.tick.calls, 1);
  assert.equal(view.hourCalls, 2);
});

test("bin/gh-counted runs gh and records the source", async (t) => {
  const { dir, github, store } = setup(t);
  const countFile = path.join(dir, "wrapper.jsonl"),
    run = spawnSync(
      process.execPath,
      [path.resolve("bin/gh-counted"), "--version"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          AVOOZL_GH_COUNT_FILE: countFile,
          AVOOZL_GH_SOURCE: "radar",
        },
      },
    );
  assert.equal(run.status, 0);
  assert.match(run.stdout, /gh version/);
  assert.equal(
    rateView(store, Date.now(), { countFile }).bySource.radar.calls,
    1,
  );
  // A tick takes the lines into the store and empties the file.
  github.rate.countFile = countFile;
  github.rate.now = Date.now;
  github.rate.dirty = true;
  github.rate.flush(true);
  assert.equal(
    rateView(store, Date.now(), { countFile }).bySource.radar.calls,
    1,
  );
  assert.equal(countFilePath().endsWith("gh-calls.jsonl"), true);
});
