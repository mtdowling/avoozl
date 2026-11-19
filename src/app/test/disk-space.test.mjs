// Free space before a worktree: below 2 GiB the work waits with one Needs
// you row naming the folder and its free space, and nothing is half made.
// The volume is a stub; no test fills a disk.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkRuns, drainCheckRuns, queueCheckRun } from "../check-runs.mjs";
import {
  MIN_FREE_BYTES,
  diskNeedsYou,
  diskSpace,
  freeBytes,
  requireDiskSpace,
} from "../disk-space.mjs";
import { deliveryWorkspace, git } from "./delivery-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const BLOCK = 4096;
// A stub volume with `bytes` free.
function volume(t, bytes) {
  const real = diskSpace.statfs;
  diskSpace.statfs = () => ({
    bavail: Math.floor(bytes / BLOCK),
    bsize: BLOCK,
  });
  t.after(() => (diskSpace.statfs = real));
}

test("2 GiB free is enough; less throws before anything is made, with one Needs you row", (t) => {
  const store = memoryStore(),
    dir = path.join(temporaryDirectory("avoozl-disk-"), "not-made-yet");
  volume(t, MIN_FREE_BYTES);
  assert.equal(
    requireDiskSpace(store, dir, "Task a's worktree"),
    MIN_FREE_BYTES,
  );
  assert.deepEqual(diskNeedsYou(store), []);
  volume(t, 512 * 1024 ** 2);
  assert.throws(
    () => requireDiskSpace(store, dir, "Task a's worktree"),
    (error) => {
      assert.equal(error.status, 507);
      assert.equal(error.lowDisk.folder, path.dirname(dir));
      assert.match(error.message, /0\.5 GiB free/);
      return true;
    },
  );
  assert.equal(fs.existsSync(dir), false, "nothing made");
  const [row] = diskNeedsYou(store);
  assert.equal(row.reason, "disk");
  assert.match(row.title, /Low disk space/);
  assert.ok(
    row.detail.includes(`${path.dirname(dir)} has 0.5 GiB free`),
    row.detail,
  );
  assert.match(row.detail, /Task a's worktree waits/);
  // The row clears once there is room again.
  volume(t, 10 * 1024 ** 3);
  requireDiskSpace(store, dir, "Task a's worktree");
  assert.deepEqual(diskNeedsYou(store), []);
  // The real call reads the real volume.
  diskSpace.statfs = (folder) => fs.statfsSync(folder);
  assert.ok(freeBytes(os.tmpdir()) > 0);
});

test("a check run waits, queued, while its volume is full, then runs", async (t) => {
  const { store, checkout } = deliveryWorkspace(t, {
      prefix: "avoozl-disk-run-",
      project: { isolation: { run: "unconfined" } },
    }),
    commit = git(checkout, "rev-parse", "HEAD");
  queueCheckRun(store, {
    task: { id: "a" },
    project: store.get("projects", "app"),
    commit,
    attempt: 1,
  });
  volume(t, BLOCK);
  await drainCheckRuns(store, { run: async () => ({ exitCode: 0 }) });
  let [run] = checkRuns(store);
  assert.deepEqual([run.state, run.waiting], ["queued", "low disk"]);
  assert.equal(diskNeedsYou(store).length, 1);
  volume(t, 10 * 1024 ** 3);
  await drainCheckRuns(store, { run: async () => ({ exitCode: 0 }) });
  [run] = checkRuns(store);
  assert.equal(run.state, "finished");
  assert.deepEqual(diskNeedsYou(store), []);
});

test("a task worktree is not added while its volume is full", async (t) => {
  const { store, ops } = deliveryWorkspace(t, { prefix: "avoozl-disk-task-" });
  volume(t, BLOCK);
  await assert.rejects(
    ops.execute("worktree.prepare", { taskId: "a" }),
    (error) => error.status === 507 && /waits/.test(error.message),
  );
  assert.ok(!store.get("task_worktrees", "a"), "no worktree recorded");
  assert.equal(diskNeedsYou(store).length, 1);
});

// The few store calls the guard makes, for the unit test.
function memoryStore() {
  const meta = new Map();
  return {
    getMeta: (key) => meta.get(key),
    setMeta: (key, value) => meta.set(key, value),
  };
}
