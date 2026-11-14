// Proof 15 (rc-p15): a remote coder end to end with a fake harness. Run on a
// fake GitHub and a fake harness process in an isolated temporary workspace;
// no real harness is started and no real repository is written.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { remoteCountsAsDone, remoteTasks } from "../remote-coder.mjs";
import { mergeAndClose } from "./radar-fixture.mjs";
import {
  labelsOf,
  leaf,
  READY,
  setup,
} from "./radar-coder-release-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const HARNESS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fake-harness.mjs",
);

async function remote(t, tasks) {
  const w = await setup(t, { release: { capacity: 5 } }, tasks, "remote"),
    scratch = temporaryDirectory("avoozl-harness-");
  const log = path.join(scratch, "log.jsonl"),
    state = path.join(scratch, "state.json");
  fs.writeFileSync(log, "");
  fs.writeFileSync(state, JSON.stringify({ auth: "ok", statuses: {} }));
  process.env.FAKE_HARNESS_LOG = log;
  process.env.FAKE_HARNESS_STATE = state;
  fs.mkdirSync(path.join(w.root, ".avoozl", "local"), { recursive: true });
  fs.writeFileSync(
    path.join(w.root, ".avoozl", "local", "remote.json"),
    JSON.stringify({ command: [process.execPath, HARNESS] }),
  );
  w.github.available = () => true;
  w.github.closing = new Map();
  w.github.closingPullRequests = (_repository, number) =>
    Promise.resolve(structuredClone(w.github.closing.get(number) || []));
  const calls = () =>
      fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    set = (value) =>
      fs.writeFileSync(
        state,
        JSON.stringify({ auth: "ok", statuses: {}, ...value }),
      ),
    run = () => w.ops.execute("workspace.tick", { sessions: [] }),
    rows = async () =>
      (await w.ops.execute("conflicts.view", {})).items.filter((item) =>
        /^remote-/.test(String(item.id)),
      );
  await w.tick();
  return { ...w, calls, set, run, rows };
}

test("Proof 15: two tasks, no pull request, publish, merge, then the dependent", async (t) => {
  const w = await remote(t, [
    leaf("leaf-a"),
    leaf("leaf-b"),
    leaf("leaf-c", { requires: ["leaf-a"] }),
  ]);
  const [idA, idB, idC] = w.approved.taskIds;
  const ready = () => labelsOf(w.issueOf(idC)).includes(READY);
  // Release: a and b are filed once each; c waits for a.
  await w.run();
  await w.run();
  const sent = w.calls().filter((call) => call.tool === "create-code-task");
  assert.equal(sent.length, 2);
  assert.equal(ready(), false);
  // The harness finishes a with no pull request.
  const receipt = remoteTasks(w.store).find((r) => r.taskIds[0] === idA);
  w.set({
    statuses: {
      [receipt.harnessId]: {
        state: "completed",
        url: "https://harness.example/a",
      },
    },
  });
  for (let round = 0; round < 3; round += 1) await w.run();
  const waiting = () => remoteTasks(w.store).find((r) => r.taskIds[0] === idA);
  assert.equal(waiting().state, "finished-unpublished");
  assert.equal(remoteCountsAsDone(waiting()), false);
  const rows = await w.rows();
  assert.equal(rows.length, 1, "one Needs you row across three ticks");
  assert.match(rows[0].title, /Waiting for a person to publish/);
  assert.equal(ready(), false, "a finished harness does not release c");
  // A person publishes: the row clears; an open pull request is not done.
  const issue = w.issueOf(idA);
  w.github.closing.set(issue.number, [
    { number: 9, state: "OPEN", merged: false },
  ]);
  await w.run();
  assert.equal(waiting().state, "pr-open");
  assert.deepEqual(await w.rows(), []);
  assert.equal(ready(), false, "an open pull request does not release c");
  // The merge counts as done and releases the dependent.
  mergeAndClose(w.github, issue);
  await w.run();
  await w.run();
  assert.equal(waiting().state, "merged");
  assert.equal(remoteCountsAsDone(waiting()), true);
  assert.equal(ready(), true, "c is released after the merge");
  // b was never merged and is not done.
  assert.equal(
    remoteCountsAsDone(remoteTasks(w.store).find((r) => r.taskIds[0] === idB)),
    false,
  );
});
