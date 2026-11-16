// R101.1, R101.2, R101.5, R101.6 on a fake GitHub: every artifact and line of
// a merged pull request is kept, a repeat costs no call, none is remembered,
// and Flow and Trace show what was stored.
import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  firstZipFile,
  receiptLine,
  receiptReader,
  buildView,
} from "../build-receipt-read.mjs";
import { ciStep } from "../flow-ci.mjs";
import { flowView, refreshFlow } from "../radar-flow.mjs";
import { readTrace } from "../trace.mjs";
import { GitHubClient } from "../github.mjs";
import { renderMarker } from "../github-marker.mjs";
import { fixture } from "./fixtures.mjs";

const MIN = 60_000;
const at = (m) => new Date(Date.UTC(2026, 10, 9, 8, 0) + m * MIN).toISOString();
const REPO = "o/r";
const POLICY = {
  mode: "single-repo",
  repositories: {
    [REPO]: {
      coder: "issue-radar",
      buildReceipts: true,
      managedLabels: { ready: "ready" },
      crewLabels: { claim: "crew: in progress" },
    },
  },
};

// A one-file zip, as GitHub serves an artifact.
function zip(text, name = "build-receipt.jsonl") {
  const data = deflateRawSync(Buffer.from(text)),
    file = Buffer.from(name),
    local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(Buffer.byteLength(text), 22);
  local.writeUInt16LE(file.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(Buffer.byteLength(text), 24);
  central.writeUInt16LE(file.length, 28);
  central.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, file, data]),
    directory = Buffer.concat([central, file]),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}
const receiptText = (ms, extra = {}) =>
  JSON.stringify({
    v: 1,
    issue: 1,
    commit: "abc",
    command: "npm test",
    target: "linux-x64/node26",
    start: "warm",
    ms,
    exit: 0,
    counters: { hits: 4 },
    at: at(1),
    ...extra,
  }) + "\n";

const TIMES = {
  1: { ready: 0, claimed: 10, pr: 40, green: 90, merged: 100 },
  2: { ready: 0, claimed: 20, pr: 80, green: 100, merged: 110 },
  3: { ready: 0, claimed: 20, pr: 80, green: 100, merged: 120 },
};
const INSTANCE = (n) => `inst-${n.repeat(12)}`;
const NOW = Date.UTC(2026, 10, 9, 12, 0);
const run = (id, head, extra = {}) => ({
  id,
  workflow: ".github/workflows/test.yml",
  headSha: head,
  event: "pull_request",
  attempt: 1,
  status: "completed",
  conclusion: "success",
  startedAt: at(90),
  endedAt: at(100),
  pullRequests: [],
  ...extra,
});
const artifact = (id, name, head, runId = id) => ({
  id,
  name,
  expired: false,
  workflow_run: { id: runId, head_sha: head },
});
const lines = (...records) =>
  records.map((record) => receiptText(record.ms, record).trim()).join("\n") +
  "\n";

function github(options = {}) {
  const calls = { list: 0, download: 0 },
    artifacts = options.artifacts ?? [
      artifact(901, "build-receipt-linux", "sha51"),
      artifact(902, "build-receipt-linux", "sha52"),
    ],
    files = options.files ?? {
      901: receiptText(40_000),
      902: receiptText(60_000),
    };
  return {
    calls,
    available: () => true,
    async openPullRequests() {
      return [];
    },
    async recentPullRequests() {
      return (options.merged ?? [51, 52, 53]).map((number) => ({
        number,
        createdAt: at(TIMES[number - 50].pr),
        closedAt: at(TIMES[number - 50].merged),
        mergedAt: at(TIMES[number - 50].merged),
        author: { login: "someone" },
        headRefName: `b${number}`,
        headRefOid: `sha${number}`,
        files: { totalCount: 1, nodes: [{ path: "src/a.mjs" }] },
      }));
    },
    async workflowRuns() {
      return options.runs ?? [run(901, "sha51"), run(902, "sha52")];
    },
    async listIssues(_repo, { label }) {
      return label === "ready" ? [1, 2, 3].map((number) => ({ number })) : [];
    },
    async issue(_repo, number) {
      return {
        number,
        created_at: at(-5),
        body: renderMarker({
          version: 2,
          taskId: `rel-t${number}`,
          namespace: "avz_testtesttesttest",
          kind: "leaf",
          instance: INSTANCE(number === 1 ? "a" : "b"),
          source: { commit: null, manifest: "0".repeat(64) },
          applied: {
            title: "0".repeat(64),
            body: "0".repeat(64),
            labels: [],
            blockers: [],
          },
        }),
      };
    },
    async listIssueComments(_repo, number) {
      return [
        {
          id: number,
          created_at: at(TIMES[number].claimed),
          body: `<!-- kirocrew-crew v=1 id=c_${number} phase=resolved pr=${number + 50} updated=${at(0)} -->`,
        },
      ];
    },
    async issueEvents(_repo, number) {
      return [
        {
          event: "labeled",
          label: { name: "ready" },
          created_at: at(TIMES[number].ready),
        },
      ];
    },
    async pullRequest(_repo, number) {
      const t = TIMES[number - 50];
      return {
        number,
        created_at: at(t.pr),
        merged_at: at(t.merged),
        head: { sha: `sha${number}` },
      };
    },
    async checkRuns(_repo, sha) {
      const t = TIMES[Number(sha.slice(3)) - 50];
      return [
        {
          name: "test",
          status: "completed",
          conclusion: "success",
          completed_at: at(t.green),
        },
      ];
    },
    async listArtifacts() {
      calls.list += 1;
      if (options.failList && calls.list <= 1) throw new Error("down");
      return artifacts;
    },
    async downloadArtifact(_repo, id) {
      calls.download += 1;
      return zip(files[id]);
    },
  };
}

// One tick's CI step on the fake.
const check = (store, gh, now = NOW) =>
  ciStep(store, gh, { policy: POLICY, now });
const rows = (store, sql = "") =>
  store.db.prepare(`SELECT * FROM build_observations ${sql}`).all();
test("firstZipFile reads a stored or deflated file and refuses junk", () => {
  assert.equal(firstZipFile(zip("hello")), "hello");
  assert.equal(firstZipFile(Buffer.from("not a zip")), null);
});

test("several phases on 3 platforms keep every record of a pull request", async (t) => {
  const { store } = fixture(t),
    platforms = ["linux", "macos", "windows"],
    gh = github({
      artifacts: platforms.map((os, i) =>
        artifact(910 + i, `build-receipt-${os}`, "sha51", 900),
      ),
      files: Object.fromEntries(
        platforms.map((os, i) => [
          910 + i,
          lines(
            { ms: 1000, phase: "build", target: os, command: "npm run build" },
            { ms: 2000, phase: "test", target: os, command: "npm test" },
          ),
        ]),
      ),
      runs: [run(900, "sha51")],
      merged: [51],
    });
  await check(store, gh);
  assert.equal(gh.calls.list, 1);
  assert.equal(gh.calls.download, 3);
  const found = rows(store, "WHERE pr_number=51");
  assert.equal(found.length, 6);
  assert.deepEqual(
    [...new Set(found.map((row) => row.target))].sort(),
    platforms,
  );
  assert.deepEqual([...new Set(found.map((row) => row.phase))].sort(), [
    "build",
    "test",
  ]);
  assert.equal(
    store.db
      .prepare(
        "SELECT COUNT(*) AS n FROM receipt_artifacts WHERE kind='receipt'",
      )
      .get().n,
    3,
  );
});

test("a failed attempt is kept and marked; a bad line is counted", async (t) => {
  const { store } = fixture(t),
    gh = github({
      artifacts: [artifact(920, "build-receipt-linux", "sha51", 900)],
      files: {
        920:
          lines(
            { ms: 5000, task: "7.2", attempt: 1, exit: 1 },
            { ms: 4000, task: "7.2", attempt: 2, exit: 0 },
          ) + "not json\n",
      },
      runs: [run(900, "sha51")],
      merged: [51],
    });
  await check(store, gh);
  const found = rows(store, "ORDER BY attempt");
  assert.deepEqual(
    found.map((row) => [row.attempt, row.failed]),
    [
      [1, 1],
      [2, 0],
    ],
  );
  assert.equal(
    store.db
      .prepare(
        "SELECT skipped,lines FROM receipt_artifacts WHERE artifact_id=920",
      )
      .get().skipped,
    1,
  );
});

test("a run that did not succeed marks its lines failed", async (t) => {
  const { store } = fixture(t),
    gh = github({
      artifacts: [artifact(930, "build-receipt-linux", "sha51", 900)],
      files: { 930: receiptText(1000) },
      runs: [run(900, "sha51", { conclusion: "cancelled" })],
      merged: [51],
    });
  await check(store, gh);
  assert.equal(rows(store)[0].failed, 1);
});

test("one list per check, one download per new artifact, then 0", async (t) => {
  const { store } = fixture(t),
    gh = github();
  await check(store, gh);
  assert.deepEqual([gh.calls.list, gh.calls.download], [1, 2]);
  // Pull request 53 has no run yet, so it is still pending: one list, and
  // nothing to download because the list is unchanged.
  await check(store, gh, NOW + 60_000);
  assert.deepEqual([gh.calls.list, gh.calls.download], [2, 2]);
  assert.equal(rows(store).length, 2);
  // Pull request 53 settles, with no receipt: the check after it costs 0.
  await check(store, gh, NOW + 2 * 86_400_000);
  const listed = gh.calls.list;
  await check(store, gh, NOW + 2 * 86_400_000 + 60_000);
  await check(store, gh, NOW + 2 * 86_400_000 + 120_000);
  assert.equal(gh.calls.list, listed);
  assert.equal(gh.calls.download, 2);
});

test("complete runs with no artifact store none; a running run stores nothing", async (t) => {
  const { store } = fixture(t),
    gh = github({
      artifacts: [],
      runs: [
        run(901, "sha51"),
        run(902, "sha52", { status: "in_progress", endedAt: null }),
      ],
      merged: [51, 52],
    });
  await check(store, gh);
  const kinds = store.db
    .prepare("SELECT head_sha,kind FROM receipt_artifacts")
    .all();
  assert.deepEqual(
    kinds.map((row) => [row.head_sha, row.kind]),
    [["sha51", "none"]],
  );
  const listed = gh.calls.list;
  await check(store, gh, NOW + 60_000);
  // Only the running one is read again.
  assert.equal(gh.calls.list, listed + 1);
  assert.equal(rows(store).length, 0);
});

test("buildReceipts off reads nothing", async (t) => {
  const { store } = fixture(t),
    gh = github();
  await ciStep(store, gh, {
    policy: { ...POLICY, repositories: { [REPO]: {} } },
    now: NOW,
  });
  assert.deepEqual([gh.calls.list, gh.calls.download], [0, 0]);
});

test("a failed list keeps nothing and is tried again", async (t) => {
  const { store } = fixture(t),
    gh = github({ failList: true });
  await check(store, gh);
  assert.equal(rows(store).length, 0);
  await check(store, gh, NOW + 60_000);
  assert.equal(rows(store).length, 2);
});

test("the old metadata value moves once into observations", async (t) => {
  const { store } = fixture(t);
  store.setMeta("buildReceipts", {
    [`${REPO}#51`]: {
      v: 1,
      commit: "sha51",
      command: "npm test",
      target: "linux",
      start: "warm",
      ms: 7000,
      exit: 0,
      counters: {},
    },
    [`${REPO}#52`]: null,
  });
  const read = await receiptReader(store)(REPO)({
    number: 51,
    merged_at: at(1),
    head: { sha: "sha51" },
  });
  assert.equal(read[0].ms, 7000);
  assert.equal(store.getMeta("buildReceipts"), null);
  assert.equal(rows(store).length, 1);
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS n FROM meta WHERE key='buildReceipts'")
      .get().n,
    0,
  );
});

test("the reader's calls count under the receipt source", async (t) => {
  const { store } = fixture(t),
    seen = [],
    gh = github();
  const { currentSource } = await import("../github-rate.mjs");
  gh.listArtifacts = async () => {
    seen.push(currentSource());
    return [];
  };
  await check(store, gh);
  assert.deepEqual(seen, ["receipt"]);
});

test("Flow shows what was stored, grouped by instance and target", async (t) => {
  const { store } = fixture(t),
    gh = github();
  await check(store, gh);
  await refreshFlow(store, gh, POLICY, { force: true });
  const view = flowView(store).builds;
  assert.equal(view.count, 2);
  assert.equal(view.medianMs, 50_000);
  assert.deepEqual(
    view.byInstance.map((row) => [row.instance, row.count, row.totalMs]).sort(),
    [
      [INSTANCE("a"), 1, 40_000],
      [INSTANCE("b"), 1, 60_000],
    ],
  );
  assert.equal(view.byPhase.length, 1);
  const before = [gh.calls.list, gh.calls.download];
  await refreshFlow(store, gh, POLICY, { force: true });
  assert.deepEqual([gh.calls.list, gh.calls.download], before);
});

test("Trace shows the stored receipt on the merged step with no call", async (t) => {
  const { store } = fixture(t),
    gh = github();
  await check(store, gh);
  const before = [gh.calls.list, gh.calls.download],
    trace = await readTrace(gh, REPO, 1, POLICY.repositories[REPO], {
      receiptFor: (pull) => receiptReader(store)(REPO)(pull),
    }),
    merged = trace.steps.find((step) => step.key === "merged");
  assert.equal(merged.detail, "Build 40 s, warm · linux-x64/node26 · hits 4");
  assert.deepEqual([gh.calls.list, gh.calls.download], before);
});

test("receiptLine and buildView word an empty case", () => {
  assert.equal(receiptLine(null), null);
  assert.equal(buildView([]).count, 0);
});

const obs = (phase, ms, extra = {}) => ({
  phase,
  ms,
  target: "linux",
  start: "warm",
  failed: false,
  ...extra,
});

test("Flow names the costliest phase, summed over targets, and keeps failed time apart", () => {
  const view = buildView([
    {
      pullNumber: 7,
      repository: REPO,
      builds: [
        obs("build", 30_000),
        obs("test", 50_000),
        obs("test", 70_000, { target: "macos" }),
        obs("test", 500_000, { failed: true }),
      ],
    },
  ]);
  assert.deepEqual(view.recent[0].costliest, { phase: "test", ms: 120_000 });
  assert.equal(view.recent[0].failedMs, 500_000);
  assert.equal(view.recent[0].totalMs, 650_000);
  assert.equal(view.totalMs, 650_000);
  assert.equal(view.failedMs, 500_000);
});

test("failed attempts stay out of the medians", () => {
  const view = buildView([
    {
      pullNumber: 7,
      builds: [obs("test", 40_000), obs("test", 900_000, { failed: true })],
    },
    { pullNumber: 8, builds: [obs("test", 60_000)] },
  ]);
  assert.deepEqual(
    view.byPhase.map((row) => [row.phase, row.count, row.medianMs]),
    [["test", 2, 50_000]],
  );
  assert.equal(view.medianMs, 50_000);
});

test("Trace groups every observation by phase and marks failed ones", async (t) => {
  const { store } = fixture(t),
    gh = github({
      artifacts: [artifact(960, "build-receipt-linux", "sha51", 900)],
      files: {
        960: lines(
          { ms: 1000, phase: "build" },
          { ms: 9000, phase: "test", attempt: 1, exit: 1 },
          { ms: 4000, phase: "test", attempt: 2 },
        ),
      },
      runs: [run(900, "sha51")],
      merged: [51],
    });
  await check(store, gh);
  const trace = await readTrace(gh, REPO, 1, POLICY.repositories[REPO], {
      receiptFor: (pull) => receiptReader(store)(REPO)(pull),
    }),
    merged = trace.steps.find((step) => step.key === "merged");
  assert.deepEqual(
    merged.builds.map((group) => [group.phase, group.items.map((i) => i.failed)]),
    [
      ["build", [false]],
      ["test", [true, false]],
    ],
  );
  assert.match(merged.detail, /3 builds.*costliest test/);
});

test("the artifact list is one unfiltered cached read; a 304 reads nothing more", async (t) => {
  const { store } = fixture(t),
    seen = [],
    etag = '"a1"';
  let clock = NOW;
  const fetch = async (url, options) => {
    seen.push({ url: String(url), headers: options.headers });
    if (options.headers["If-None-Match"] === etag)
      return new Response(null, { status: 304, headers: { etag } });
    return new Response(
      JSON.stringify({
        artifacts: [
          {
            id: 7,
            name: "build-receipt-linux",
            expired: false,
            size_in_bytes: 9,
            workflow_run: { id: 5, head_sha: "sha51" },
          },
        ],
      }),
      { status: 200, headers: { etag } },
    );
  };
  const client = new GitHubClient({
    token: "x",
    apiUrl: "https://api.example.test",
    fetch,
  }).bind(store, { now: () => clock, cacheSeconds: () => 60 });
  const first = await client.listArtifacts(REPO);
  assert.equal(first[0].workflow_run.head_sha, "sha51");
  assert.doesNotMatch(seen[0].url, /name=/);
  assert.match(seen[0].url, /per_page=100/);
  clock += 120_000;
  const again = await client.listArtifacts(REPO);
  assert.equal(seen[1].headers["If-None-Match"], etag);
  assert.deepEqual(again, first);
});

test("the old build-receipt name and the build-receipt-<os> names are both read", async (t) => {
  const { store } = fixture(t),
    gh = github({
      artifacts: [
        artifact(940, "build-receipt", "sha51", 900),
        artifact(941, "build-receipt-ubuntu-latest", "sha52", 901),
        artifact(942, "build-receipt-macos-latest", "sha52", 901),
        artifact(943, "build-receipt-windows-latest", "sha52", 901),
        artifact(944, "build-reports", "sha52", 901),
      ],
      files: {
        940: receiptText(1000),
        941: receiptText(2000, { target: "ubuntu-latest" }),
        942: receiptText(3000, { target: "macos-latest" }),
        943: receiptText(4000, { target: "windows-latest" }),
      },
      runs: [run(900, "sha51"), run(901, "sha52")],
      merged: [51, 52],
    });
  await check(store, gh);
  assert.equal(gh.calls.download, 4);
  assert.equal(rows(store, "WHERE pr_number=51").length, 1);
  assert.equal(rows(store, "WHERE pr_number=52").length, 3);
});
