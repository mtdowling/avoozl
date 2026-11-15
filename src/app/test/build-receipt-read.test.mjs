// RC32.5 to RC32.7 on a fake GitHub: one receipt read per merged pull request,
// a repeat costs no call, none is remembered, a failed read is retried, and
// Flow and Trace show what was read.
import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  firstZipFile,
  receiptLine,
  receiptReader,
  receiptsView,
} from "../build-receipt-read.mjs";
import { flowView, refreshFlow } from "../radar-flow.mjs";
import { readTrace } from "../trace.mjs";
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
function github(options = {}) {
  const calls = { list: 0, download: 0 },
    artifacts = options.artifacts ?? [
      { id: 901, expired: false, workflow_run: { head_sha: "sha51" } },
      { id: 902, expired: false, workflow_run: { head_sha: "sha52" } },
    ];
  return {
    calls,
    available: () => true,
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
      if (options.failList && calls.list <= 3) throw new Error("down");
      return artifacts;
    },
    async downloadArtifact(_repo, id) {
      calls.download += 1;
      return zip(receiptText(id === 901 ? 40_000 : 60_000));
    },
  };
}

test("firstZipFile reads a stored or deflated file and refuses junk", () => {
  assert.equal(firstZipFile(zip("hello")), "hello");
  assert.equal(firstZipFile(Buffer.from("not a zip")), null);
});

test("one read per merged pull request; a repeat costs no call; no receipt is remembered", async (t) => {
  const { store } = fixture(t),
    gh = github();
  await refreshFlow(store, gh, POLICY, { force: true });
  // Three merged pull requests; two have an artifact, one has none.
  assert.equal(gh.calls.list, 1);
  assert.equal(gh.calls.download, 2);
  const view = flowView(store);
  assert.equal(view.receipts.count, 2);
  assert.equal(view.receipts.medianMs, 50_000);
  await refreshFlow(store, gh, POLICY, { force: true });
  await refreshFlow(store, gh, POLICY, { force: true });
  assert.equal(gh.calls.list, 1);
  assert.equal(gh.calls.download, 2);
});

test("receipts group by the marker's instance and by target", async (t) => {
  const { store } = fixture(t),
    gh = github();
  await refreshFlow(store, gh, POLICY, { force: true });
  const { byInstance, byTarget } = flowView(store).receipts;
  assert.deepEqual(
    byInstance.map((row) => [row.instance, row.count, row.totalMs]).sort(),
    [
      [INSTANCE("a"), 1, 40_000],
      [INSTANCE("b"), 1, 60_000],
    ],
  );
  assert.equal(byTarget.length, 1);
  assert.equal(byTarget[0].count, 2);
});

test("a failed read keeps nothing and is tried again", async (t) => {
  const { store } = fixture(t),
    gh = github({ failList: true });
  await refreshFlow(store, gh, POLICY, { force: true });
  assert.equal(flowView(store).receipts.count, 0);
  assert.equal(store.getMeta("buildReceipts") ?? null, null);
  await refreshFlow(store, gh, POLICY, { force: true });
  assert.equal(flowView(store).receipts.count, 2);
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
  const read = receiptReader(store, gh)(REPO);
  await read({ number: 9, merged_at: at(1), head: { sha: "x" } });
  assert.deepEqual(seen, ["receipt"]);
});

test("Trace shows the receipt on the merged step", async (t) => {
  const { store } = fixture(t),
    gh = github(),
    trace = await readTrace(gh, REPO, 1, POLICY.repositories[REPO], {
      receiptFor: (pull) => receiptReader(store, gh)(REPO)(pull),
    }),
    merged = trace.steps.find((step) => step.key === "merged");
  assert.equal(merged.detail, "Build 40 s, warm · linux-x64/node26 · hits 4");
  assert.equal(gh.calls.download, 1);
});

test("receiptLine and receiptsView word an empty case", () => {
  assert.equal(receiptLine(null), null);
  assert.equal(receiptsView([]).count, 0);
});
