// R101.9-R101.11: breakdowns are stored from a receipt field or a report
// artifact, shown in the retro brief, and compared by key only. Made-up names.
import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { buildBrief, buildPartMinutes } from "../build-breakdown.mjs";
import { readReceipts } from "../build-receipt-read.mjs";
import { retroBrief } from "../flow-retro.mjs";
import { proposalProblem } from "../flow-retro.mjs";
import { fixture } from "../../test/fixtures.mjs";

const REPO = "o/r";
const NOW = Date.UTC(2026, 10, 9, 12, 0);
const report = (extra = {}) => ({
  format: "avoozl.build-report",
  v: 1,
  workload: "widget-suite",
  engine: "engine-a",
  target: "target-x",
  toolchain: "seed-0001",
  cache: "warm",
  costs: { build: 1200, provisioning: 300, cache: 50, test: 4000 },
  parts: [
    { name: "compile-gadget", kind: "build", ms: 600_000 },
    { name: "fetch-seed", kind: "provisioning", ms: 60_000 },
  ],
  ...extra,
});

function zip(text) {
  const data = deflateRawSync(Buffer.from(text)),
    file = Buffer.from("f.jsonl"),
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
  const body = Buffer.concat([local, file, data]),
    directory = Buffer.concat([central, file]),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}
const receipt = (extra = {}) =>
  JSON.stringify({
    v: 1,
    command: "npm test",
    target: "t",
    start: "warm",
    ms: 1000,
    exit: 0,
    ...extra,
  });

// One merged pull request per entry, each with one artifact.
function setup(t, pulls, files, { names = {} } = {}) {
  const { store } = fixture(t),
    calls = { list: 0, download: 0 };
  pulls.forEach((number) =>
    store.put("pr_ci", {
      id: `${REPO}#${number}`,
      repository: REPO,
      number,
      headSha: `sha${number}`,
      mergedAt: new Date(NOW - 3 * 86_400_000 + number * 1000).toISOString(),
    }),
  );
  return {
    store,
    calls,
    github: {
      async listArtifacts() {
        calls.list += 1;
        return pulls.map((number) => ({
          id: 900 + number,
          name: names[number] ?? "build-receipt-linux",
          expired: false,
          workflow_run: { id: number, head_sha: `sha${number}` },
        }));
      },
      async downloadArtifact(_repo, id) {
        calls.download += 1;
        return zip(files[id - 900]);
      },
    },
  };
}
const count = (store) =>
  store.db.prepare("SELECT COUNT(*) AS n FROM build_breakdowns").get().n;

const FIELD = { field: "breakdown" };
const read = (store, github, setting = FIELD) =>
  readReceipts(store, github, REPO, { now: NOW, report: setting });
const retro = { id: "r1", triggers: [] };
const brief = (store) =>
  JSON.parse(
    retroBrief(store, store.read(), retro, null, {
      ciRepositories: [REPO],
      now: NOW,
    })
      .split("```json\n")[1]
      .split("\n```")[0],
  );
const { engine: _drop, ...noEngine } = report();

test("mismatched keys are never compared", async (t) => {
  const { store, github } = setup(t, [1, 2, 3, 4, 5], {
    1: receipt({ breakdown: report() }),
    2: receipt({ breakdown: report() }),
    3: receipt({ breakdown: report({ cache: "cold" }) }),
    4: receipt({ breakdown: report({ target: "target-y" }) }),
    5: receipt({ breakdown: noEngine }),
  });
  await read(store, github);
  assert.equal(count(store), 4, "the one missing a key field is skipped");
  const [entry] = buildBrief(store, [REPO], { now: NOW });
  assert.deepEqual(entry.breakdowns.map((b) => b.count).sort(), [1, 1, 2]);
  assert.equal(entry.unmatched, 0);
  const key = entry.breakdowns.find((b) => b.count === 2).key,
    measure = (n, after) =>
      buildPartMinutes(store, {
        repository: REPO,
        key,
        part: "compile-gadget",
        n,
        at: "2000-01-01T00:00:00Z",
        after,
      });
  assert.equal(measure(2, true), 10);
  assert.equal(measure(3, true), null, "other keys do not fill the window");
});

test("a retro brief includes the breakdown", async (t) => {
  const { store, github, calls } = setup(
    t,
    [1],
    { 1: JSON.stringify(report()) + "\n" },
    { names: { 1: "build-report-linux" } },
  );
  await read(store, github, { artifact: "build-report-" });
  assert.equal(calls.download, 1);
  const [entry] = brief(store).builds;
  assert.equal(entry.repository, REPO);
  const [row] = entry.breakdowns;
  assert.equal(row.costliestPart, "compile-gadget");
  assert.equal(row.count, 1);
  assert.equal(row.costs.test.latestMinutes, 0.07);
  assert.equal(row.parts.length, 2);
  // A Build part minutes proposal may name only a key and part it saw.
  const plan = {
    type: "plan",
    spec: "s",
    change: "c",
    repository: REPO,
    metric: "Build part minutes",
    direction: "down",
    evidence: "e",
    key: row.key,
    part: "compile-gadget",
  };
  assert.equal(proposalProblem(plan, null, store), null);
  assert.match(
    proposalProblem({ ...plan, part: "other" }, null, store),
    /not a part/,
  );
  assert.match(
    proposalProblem({ ...plan, key: "[]" }, null, store),
    /not a comparison key/,
  );
});

test("a repository with no reports gives the same brief and calls as before", async (t) => {
  const files = { 1: receipt() },
    off = setup(t, [1], files),
    on = setup(t, [1], files),
    none = setup(t, [], {});
  await read(off.store, off.github, null);
  await read(on.store, on.github, FIELD);
  assert.deepEqual(on.calls, off.calls);
  assert.equal(count(on.store), 0);
  assert.deepEqual(brief(on.store), brief(off.store));
  // With nothing read at all the brief has no builds block.
  assert.equal("builds" in brief(none.store), false);
});
