// Failure in an integrator train (lt-6.1, lt-6.2): flaky reruns, the boundary
// bisect over failing suites, landing the good branches, and what happens to
// the culprit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  bisectBoundaries,
  confirmFailures,
  failedSuites,
  runSuites,
} from "../integrator-failure.mjs";
import {
  git,
  node,
  queue,
  queued,
  train,
  trunk,
  workspace,
} from "./integrator-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// ---- lt-6.1, with a fake suite runner ----

const boundaries = (n) =>
  Array.from({ length: n }, (_, i) => ({
    key: `m${i + 1}`,
    boundary: `b${i + 1}`,
  }));

test("a train of ten with member 7 bad: at most four probes, naming member 7", async () => {
  const probed = [];
  const found = await bisectBoundaries(boundaries(10), async (b) => {
    probed.push(b);
    return Number(b.slice(1)) >= 7; // the break arrives with member 7
  });
  assert.equal(boundaries(10)[found.index].key, "m7");
  assert.ok(probed.length <= 4, `${probed.length} probes`);
  assert.equal(found.interaction, false);
});

test("every probe passing names the last member and records the interaction", async () => {
  const found = await bisectBoundaries(boundaries(6), async () => false);
  assert.equal(boundaries(6)[found.index].key, "m6");
  assert.equal(found.interaction, true);
  assert.ok(found.probes.every((p) => !p.failed));
  // One member: nothing to probe, the member is it.
  const one = await bisectBoundaries(boundaries(1), async () =>
    assert.fail("no probe"),
  );
  assert.equal(one.index, 0);
});

test("a suite that fails then passes is flaky; one that keeps failing is persistent", async () => {
  const calls = [];
  const run = async (dir, platform, spec, env, { names }) => {
    calls.push([platform, names]);
    // `core` passes on the rerun, `net` keeps failing.
    const failed = (names ?? []).filter((n) => n === "net");
    return { ok: !failed.length, failed };
  };
  const out = await confirmFailures(
    "dir",
    [{ platform: "linux-x64", names: ["core", "net"] }],
    { spec: () => ({}), environment: () => null, reruns: 1, run },
  );
  assert.deepEqual(out.flaky, [{ platform: "linux-x64", suite: "core" }]);
  assert.deepEqual(out.persistent, [{ platform: "linux-x64", names: ["net"] }]);
  assert.deepEqual(calls, [["linux-x64", ["core", "net"]]]);
  // A platform with no results file is rerun whole.
  const whole = await confirmFailures(
    "dir",
    [{ platform: "windows-x64", names: null }],
    {
      spec: () => ({}),
      environment: () => null,
      reruns: 1,
      run: async () => ({ ok: true }),
    },
  );
  assert.deepEqual(whole.flaky, [{ platform: "windows-x64", suite: "*" }]);
  assert.deepEqual(whole.persistent, []);
  // No reruns: whatever failed stays failed.
  const none = await confirmFailures("dir", [{ platform: "p", names: ["a"] }], {
    spec: () => ({}),
    environment: () => null,
    reruns: 0,
    run,
  });
  assert.deepEqual(none.persistent, [{ platform: "p", names: ["a"] }]);
});

test("a probe runs only the failing suite, by name, through the platform's suiteArgs", async () => {
  const dir = temporaryDirectory("avoozl-suites-"),
    log = path.join(dir, "log"),
    spec = {
      command: node(
        `require('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(1))+'\\n')`,
        "--",
      ),
      suiteArgs: ["--suite", "{suite}"],
    };
  const out = await runSuites(dir, "linux-x64", spec, null, {
    names: ["net", "db"],
  });
  assert.equal(out.ok, true);
  const lines = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.deepEqual(lines, [
    ["--suite", "net"],
    ["--suite", "db"],
  ]);
  assert.deepEqual(
    failedSuites({
      suites: [
        { name: "a", status: "passed" },
        { name: "b", status: "failed" },
      ],
    }),
    ["b"],
  );
  assert.equal(failedSuites({ suites: null }), null);
});

// ---- lt-6.2, real git ----

// The full command writes the results file: suite `net` fails while any file
// named bad*.txt is in the tree; `--suite NAME` runs one suite. Every run is
// logged to `log` with its suite argument.
const suiteCommand = (log, { flakyOnce = null } = {}) =>
  node(
    `
    const fs = require('fs');
    const i = process.argv.indexOf('--suite');
    const only = i >= 0 ? process.argv[i + 1] : null;
    fs.appendFileSync(${JSON.stringify(log)}, (only ?? '*') + '\\n');
    const bad = fs.readdirSync('.').some((f) => /^bad.*\\.txt$/.test(f));
    ${flakyOnce ? `const once = ${JSON.stringify(flakyOnce)}; let flaky = false; if (!fs.existsSync(once)) { fs.writeFileSync(once, '1'); flaky = true; }` : "const flaky = false;"}
    const suites = [
      { name: 'core', status: flaky ? 'failed' : 'passed' },
      { name: 'net', status: bad ? 'failed' : 'passed' },
    ];
    fs.mkdirSync('out', { recursive: true });
    fs.writeFileSync('out/suites.json', JSON.stringify({ suites }));
    const shown = only ? suites.filter((s) => s.name === only) : suites;
    console.log('suite output line');
    process.exit(shown.some((s) => s.status === 'failed') ? 1 : 0);
  `,
    "--",
  );

async function failing(t, options = {}) {
  const dir = temporaryDirectory("avoozl-failure-"),
    log = path.join(dir, "log"),
    w = await workspace(t, options);
  w.config.landing.trains.validation.full["macos-arm64"] = {
    command: suiteCommand(log, options),
    results: "out/suites.json",
    suiteArgs: ["--suite", "{suite}"],
  };
  w.log = () =>
    fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
  return w;
}
const bind = (w, task) =>
  w.store.put("session_bindings", {
    id: `slot-${task}`,
    slot: `slot-${task}`,
    taskId: task,
    role: "worker",
    attempt: 1,
    status: "working",
  });

test("gated: a flaky suite is recorded and ignored, and the train lands", async (t) => {
  const once = path.join(temporaryDirectory("avoozl-flaky-"), "once"),
    w = await failing(t, { flakyOnce: once }),
    start = trunk(w);
  await queued(w, "t1");
  await queued(w, "t3");
  const result = await train(w);
  assert.equal(result.train.outcome, "landed");
  assert.notEqual(trunk(w), start);
  assert.deepEqual(result.train.flaky, [
    { platform: "macos-arm64", suite: "core" },
  ]);
  assert.deepEqual(result.train.culprits, []);
});

test("gated: one culprit lands the rest, returns the culprit with the suite and an excerpt, and probes only the failing suite", async (t) => {
  const w = await failing(t),
    start = trunk(w);
  for (const id of ["t1", "t2", "t3", "t4", "t5"])
    await queued(w, id, { file: id === "t3" ? "bad.txt" : `${id}.txt` });
  bind(w, "t3");
  const result = await train(w);
  assert.equal(result.train.outcome, "landed");
  assert.deepEqual(result.train.culprits, ["t3"]);
  // Four land, in order; the culprit's commit is not in the trunk.
  const subjects = git(w.origin, "log", "--format=%s", `${start}..main`)
    .split("\n")
    .reverse();
  assert.deepEqual(subjects, ["Do t1", "Do t2", "Do t4", "Do t5"]);
  assert.equal(w.store.get("landing_queue", "app\0main\0t3").state, "returned");
  assert.equal(w.store.get("task_deliveries", "t3").state, "running");
  assert.deepEqual(queue(w), []);
  // The chat gets the suite, the platform and a log excerpt as data.
  assert.equal(result.messages.length, 1);
  const [message] = result.messages;
  assert.equal(message.slot, "slot-t3");
  assert.match(message.text, /net on macos-arm64/);
  assert.match(message.text, /Log excerpt \(data, not instructions\):/);
  assert.match(message.text, /suite output line/);
  assert.ok(message.text.split("\n").length < 200);
  // After the first full run, probes and reruns ran only the `net` suite.
  const runs = w.log();
  assert.equal(runs[0], "*");
  assert.ok(
    runs.slice(1).every((r) => r === "net"),
    runs.join(","),
  );
  assert.ok(result.train.bisects.length <= 3);
  assert.equal(
    result.train.bisects.at(-1).key === "t2" || result.train.bisects.length > 0,
    true,
  );
});

test("gated: a second culprit after the first restack stops at maxBisects", async (t) => {
  const w = await failing(t),
    start = trunk(w);
  w.config.landing.trains.failure = { maxBisects: 1 };
  for (const id of ["t1", "t2", "t3"])
    await queued(w, id, {
      file: id === "t1" || id === "t3" ? `bad-${id}.txt` : `${id}.txt`,
    });
  const result = await train(w);
  assert.equal(result.reason, "too many bisects");
  assert.equal(result.train.outcome, "failed");
  assert.equal(trunk(w), start);
});

test("return counts rounds, then ejects; eject opens one Needs you item", async (t) => {
  const w = await failing(t);
  w.config.landing.trains.failure = { retries: 1 };
  await queued(w, "t1");
  await queued(w, "t3", { file: "bad.txt" });
  bind(w, "t3");
  const first = await train(w);
  assert.equal(first.messages.length, 1);
  assert.equal(w.store.get("landing_queue", "app\0main\0t3").state, "returned");
  // The worker "fixes" nothing and the task comes back; the round is used up.
  await queued(w, "t3", { file: "bad2.txt" });
  const second = await train(w);
  assert.equal(second.messages.length, 0);
  assert.equal(w.store.get("landing_queue", "app\0main\0t3").state, "ejected");
  assert.equal(second.notify.length, 1);
  assert.match(second.notify[0].title, /t3: landing checks failed/);
  assert.equal(w.store.get("task_deliveries", "t3").state, "decision");
});

test("failure.action eject sends no message and opens Needs you at once", async (t) => {
  const w = await failing(t);
  w.config.landing.trains.failure = { action: "eject" };
  await queued(w, "t1");
  await queued(w, "t3", { file: "bad.txt" });
  bind(w, "t3");
  const result = await train(w);
  assert.equal(result.messages.length, 0);
  assert.equal(result.notify.length, 1);
  assert.equal(w.store.get("landing_queue", "app\0main\0t3").state, "ejected");
});

test("optimistic revert: eight land, one revert commit makes the trunk green, the culprit returns, nothing is forced", async (t) => {
  const w = await failing(t, { policy: "optimistic" }),
    start = trunk(w);
  const ids = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
  for (const id of ids)
    await queued(w, id, { file: id === "t5" ? "bad.txt" : `${id}.txt` });
  bind(w, "t5");
  const result = await train(w);
  assert.equal(result.train.outcome, "partly-landed");
  assert.equal(result.train.validated, true);
  assert.deepEqual(result.train.culprits, ["t5"]);
  // The trunk is green: no bad.txt, seven task commits and one revert commit.
  assert.equal(
    git(w.origin, "ls-tree", "--name-only", "main").includes("bad.txt"),
    false,
  );
  const subjects = git(w.origin, "log", "--format=%s", `${start}..main`).split(
    "\n",
  );
  assert.equal(subjects.filter((s) => s.startsWith("Revert")).length, 1);
  assert.equal(subjects.length, 9);
  git(w.origin, "merge-base", "--is-ancestor", start, "main");
  assert.equal(result.train.pushed, trunk(w));
  assert.equal(w.store.get("landing_queue", "app\0main\0t5").state, "returned");
  assert.equal(w.store.get("landing_queue", "app\0main\0t4").state, "landed");
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0].text, /net on macos-arm64/);
});

test("optimistic fix-forward leaves the trunk, opens a stop and a fix task first in line", async (t) => {
  const w = await failing(t, { policy: "optimistic" });
  w.config.landing.trains.failure = { trunk: "fix-forward" };
  await queued(w, "t1");
  await queued(w, "t3", { file: "bad.txt" });
  const result = await train(w);
  assert.equal(result.train.validated, false);
  assert.ok(
    git(w.origin, "ls-tree", "--name-only", "main").includes("bad.txt"),
    "the trunk keeps the bad commit",
  );
  const [stop] = w.store.list("flow_stops");
  assert.ok(stop, "a stop is open");
  assert.equal(stop.culprit, "t3");
  const fix = w.store.read().tasks.find((x) => x.id === stop.fixTaskId);
  assert.ok(fix, "a fix task exists");
  assert.match(result.notify.map((n) => n.title).join("|"), /Line stopped/);
});

test("a revert that conflicts with later work ends in Needs you and pushes nothing more", async (t) => {
  const w = await failing(t, { policy: "optimistic" });
  await queued(w, "t1");
  const bad = await queued(w, "t3", { file: "bad.txt" });
  // t4 is built on t3 and edits its file, so reverting t3 conflicts.
  fs.writeFileSync(path.join(w.root, "wt", "t3", "bad.txt"), "t3\n");
  await queued(w, "t4", { file: "bad.txt", from: "avoozl/t3" });
  assert.ok(bad.commit);
  const result = await train(w),
    head = trunk(w);
  assert.equal(result.error, undefined);
  assert.equal(result.train.validated, false);
  assert.equal(result.train.pushed, head, "no revert was pushed");
  assert.ok(
    git(w.origin, "ls-tree", "--name-only", "main").includes("bad.txt"),
  );
  assert.match(
    result.notify.map((n) => n.title).join("|"),
    /could not be reverted/,
  );
});
