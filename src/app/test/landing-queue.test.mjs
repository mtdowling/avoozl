import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./fixtures.mjs";
import { git, withWorkLock } from "../git.mjs";
import { guardedFastForward } from "../driver-generations.mjs";
import {
  enqueueLanding,
  landNext,
  landingQueue,
  pausedBy,
} from "../landing-queue.mjs";

const Q = { projectId: "fixture", base: "main" };

// A bare upstream, the landing checkout and a second clone that can move
// the base behind the queue's back.
async function repos(root) {
  const seed = path.join(root, "seed"),
    upstream = path.join(root, "upstream.git"),
    landing = path.join(root, "landing"),
    other = path.join(root, "other");
  fs.mkdirSync(seed);
  const identity = async (dir) => {
    await git(dir, ["config", "user.name", "Fixture"]);
    await git(dir, ["config", "user.email", "fixture@example.invalid"]);
  };
  await git(seed, ["init", "-q", "-b", "main"]);
  await identity(seed);
  fs.writeFileSync(path.join(seed, "a.txt"), "a\n");
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-q", "-m", "Start"]);
  await git(root, ["clone", "-q", "--bare", seed, upstream]);
  for (const dir of [landing, other]) {
    await git(root, ["clone", "-q", upstream, dir]);
    await identity(dir);
  }
  const head = async () =>
    (
      await git(root, ["ls-remote", "--heads", upstream, "refs/heads/main"])
    ).split(/\s+/)[0];
  const base = await head();
  // A task portion: one commit on its own branch from `from`.
  const portion = async (name, file, text, from = base) => {
    await git(landing, ["checkout", "-q", "-B", name, from]);
    fs.writeFileSync(path.join(landing, file), text);
    await git(landing, ["add", "."]);
    await git(landing, ["commit", "-q", "-m", `Work on ${name}`]);
    return git(landing, ["rev-parse", "HEAD"]);
  };
  const moveBase = async (file) => {
    await git(other, ["pull", "-q", "--ff-only"]);
    fs.writeFileSync(path.join(other, file), "moved\n");
    await git(other, ["add", "."]);
    await git(other, ["commit", "-q", "-m", "Move the base"]);
    await git(other, ["push", "-q", "origin", "main"]);
    return git(other, ["rev-parse", "HEAD"]);
  };
  return { upstream, landing, head, base, portion, moveBase };
}

// The direct-landing steps over real git: merge the portion with the current
// base in the landing checkout, then a guarded fast-forward.
function steps(r, { check = async () => ({ ok: true }), land } = {}) {
  const log = { checked: [], landed: [] };
  return {
    log,
    readBase: r.head,
    async prepare([entry], baseHead) {
      await git(r.landing, ["fetch", "-q", "origin", "main"]);
      let tree;
      try {
        tree = (
          await git(r.landing, [
            "merge-tree",
            "--write-tree",
            "--no-messages",
            baseHead,
            entry.commit,
          ])
        ).split("\n")[0];
      } catch (error) {
        return {
          conflict: [
            ...new Set(
              String(error.stdout ?? "")
                .split("\n")
                .slice(1)
                .map((line) => line.split("\t")[1])
                .filter(Boolean),
            ),
          ],
        };
      }
      const candidate = await git(r.landing, [
        "commit-tree",
        tree,
        "-p",
        baseHead,
        "-p",
        entry.commit,
        "-m",
        `Land ${entry.key}`,
      ]);
      return { candidate };
    },
    async check(candidate, [entry]) {
      log.checked.push(candidate);
      return check(candidate, entry);
    },
    async land(input) {
      const pushed = await (land
        ? land(input)
        : guardedFastForward(r.landing, {
            url: r.upstream,
            branch: "main",
            base: input.baseHead,
            candidate: input.candidate,
          }));
      if (pushed) log.landed.push(input.candidate);
      return pushed;
    },
  };
}

const locks = (store) =>
  store.db
    .prepare("SELECT kind FROM work_locks")
    .all()
    .map((r) => r.kind);

test("portions land one at a time in queue order; a waiting key is not queued twice", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n"),
    two = await r.portion("two", "two.txt", "2\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one, tasks: ["t1"] });
  enqueueLanding(store, { ...Q, key: "two", commit: two, tasks: ["t2"] });
  enqueueLanding(store, { ...Q, key: "one", commit: one, tasks: ["t1"] });
  assert.deepEqual(
    landingQueue(store, Q).map((e) => e.key),
    ["one", "two"],
  );
  assert.throws(() =>
    enqueueLanding(store, { ...Q, key: "x", commit: "main" }),
  );
  const s = steps(r);
  assert.equal((await landNext(store, Q, s)).state, "landed");
  assert.deepEqual(
    landingQueue(store, Q).map((e) => e.key),
    ["two"],
  );
  assert.equal((await landNext(store, Q, s)).state, "landed");
  assert.equal((await landNext(store, Q, s)).state, "empty");
  assert.equal(await r.head(), s.log.landed[1]);
  // Both portions are on the base, in order.
  await git(r.landing, ["fetch", "-q", "origin", "main"]);
  for (const commit of [one, two])
    await git(r.landing, ["merge-base", "--is-ancestor", commit, "FETCH_HEAD"]);
});

test("Stop the line pauses the queue and keeps its order", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n"),
    two = await r.portion("two", "two.txt", "2\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one, tasks: ["t1"] });
  enqueueLanding(store, { ...Q, key: "two", commit: two, tasks: ["t2"] });
  const stop = {
    id: "stop:test",
    manual: true,
    scope: "task",
    taskId: "t1",
    projectId: "fixture",
    openedAt: new Date().toISOString(),
    closedAt: null,
  };
  store.put("flow_stops", stop);
  const s = steps(r);
  // A stop on the head's task holds the whole queue: two does not jump ahead.
  const paused = await landNext(store, Q, s);
  assert.equal(paused.state, "paused");
  assert.equal(paused.stop, "stop:test");
  assert.deepEqual(s.log.checked, []);
  assert.equal(await r.head(), r.base);
  assert.deepEqual(
    landingQueue(store, Q).map((e) => e.key),
    ["one", "two"],
  );
  // A repository stop pauses it too; another repository's does not.
  store.put("flow_stops", { ...stop, scope: "repo", taskId: null });
  assert.ok(pausedBy(store, landingQueue(store, Q)[1]));
  store.put("flow_stops", { ...stop, projectId: "elsewhere", scope: "repo" });
  assert.equal(pausedBy(store, landingQueue(store, Q)[1]), null);
  // Resume: the same order lands.
  store.put("flow_stops", { ...stop, closedAt: new Date().toISOString() });
  assert.equal((await landNext(store, Q, s)).entry.key, "one");
  assert.equal((await landNext(store, Q, s)).entry.key, "two");
});

test("a stop pulled while checks run keeps the head queued and pushes nothing", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one, tasks: ["t1"] });
  const s = steps(r, {
    check: async () => {
      store.put("flow_stops", {
        id: "stop:late",
        scope: "all",
        projectId: null,
        openedAt: new Date().toISOString(),
        closedAt: null,
      });
      return { ok: true };
    },
  });
  assert.equal((await landNext(store, Q, s)).state, "paused");
  assert.equal(await r.head(), r.base);
  assert.equal(landingQueue(store, Q)[0].key, "one");
});

test("checks run outside the integration lock; only the ref move holds it", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one });
  const seen = {};
  const s = steps(r, {
    check: async () => {
      seen.check = locks(store);
      // A validation elsewhere in the project may run during the checks.
      await withWorkLock(
        store,
        { id: "other-run", projectId: "fixture", kind: "validation" },
        async () => {},
      );
      return { ok: true };
    },
    land: async (input) => {
      seen.land = locks(store);
      return guardedFastForward(r.landing, {
        url: r.upstream,
        branch: "main",
        base: input.baseHead,
        candidate: input.candidate,
      });
    },
  });
  assert.equal((await landNext(store, Q, s)).state, "landed");
  assert.deepEqual(seen.check, []);
  assert.deepEqual(seen.land, ["integration"]);
  assert.deepEqual(locks(store), []);
});

test("a held validation lock makes the landing wait without losing its place", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one });
  let release;
  const held = withWorkLock(
    store,
    { id: "other-run", projectId: "fixture", kind: "validation" },
    () => new Promise((resolve) => (release = resolve)),
  );
  const s = steps(r);
  assert.equal((await landNext(store, Q, s)).state, "busy");
  assert.equal(await r.head(), r.base);
  assert.equal(landingQueue(store, Q)[0].key, "one");
  release();
  await held;
  assert.equal((await landNext(store, Q, s)).state, "landed");
});

test("a concurrent base move cannot land an unchecked candidate", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one, tasks: ["t1"] });
  let moved;
  const s = steps(r, {
    check: async () => {
      // While the checks run, another writer advances the base.
      if (!moved) moved = await r.moveBase("elsewhere.txt");
      return { ok: true };
    },
  });
  const first = await landNext(store, Q, s);
  assert.equal(first.state, "base-moved");
  // The checked candidate was built on the old base and was not pushed.
  assert.equal(await r.head(), moved);
  assert.deepEqual(s.log.landed, []);
  assert.equal(landingQueue(store, Q)[0].key, "one");
  // The next step builds a new candidate on the moved base and checks it.
  const second = await landNext(store, Q, s);
  assert.equal(second.state, "landed");
  assert.equal(s.log.checked.length, 2);
  assert.notEqual(s.log.checked[1], s.log.checked[0]);
  assert.equal(await r.head(), s.log.checked[1]);
  assert.deepEqual(s.log.landed, [s.log.checked[1]]);
  // Every landed head is one the checks saw.
  assert.ok(s.log.landed.every((c) => s.log.checked.includes(c)));
});

test("a base move after the re-read is refused by the guarded push", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one });
  let moved;
  const s = steps(r, {
    land: async (input) => {
      moved = await r.moveBase("late.txt");
      return guardedFastForward(r.landing, {
        url: r.upstream,
        branch: "main",
        base: input.baseHead,
        candidate: input.candidate,
      });
    },
  });
  assert.equal((await landNext(store, Q, s)).state, "not-landed");
  assert.equal(await r.head(), moved);
  assert.equal(landingQueue(store, Q)[0].key, "one");
});

test("a failed check or a conflict leaves the queue and the next portion goes on", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const bad = await r.portion("bad", "bad.txt", "x\n"),
    clash = await r.portion("clash", "a.txt", "mine\n"),
    good = await r.portion("good", "good.txt", "ok\n");
  await r.moveBase("a.txt");
  enqueueLanding(store, { ...Q, key: "bad", commit: bad });
  enqueueLanding(store, { ...Q, key: "clash", commit: clash });
  enqueueLanding(store, { ...Q, key: "good", commit: good });
  const s = steps(r, {
    check: async (_candidate, entry) => ({
      ok: entry.key !== "bad",
      checks: [{ command: "npm test", exitCode: entry.key === "bad" ? 1 : 0 }],
    }),
  });
  const failed = await landNext(store, Q, s);
  assert.equal(failed.state, "failed");
  assert.equal(failed.entry.checks[0].exitCode, 1);
  const conflict = await landNext(store, Q, s);
  assert.equal(conflict.state, "conflict");
  assert.deepEqual(conflict.entry.files, ["a.txt"]);
  assert.equal((await landNext(store, Q, s)).entry.key, "good");
  // A failed key queued again comes back at the end.
  enqueueLanding(store, { ...Q, key: "bad", commit: bad });
  assert.deepEqual(
    landingQueue(store, Q).map((e) => e.key),
    ["bad"],
  );
});

test("one step per base at a time in a process", async (t) => {
  const { root, store } = fixture(t),
    r = await repos(root);
  const one = await r.portion("one", "one.txt", "1\n");
  enqueueLanding(store, { ...Q, key: "one", commit: one });
  const s = steps(r);
  const [a, b] = await Promise.all([
    landNext(store, Q, s),
    landNext(store, Q, s),
  ]);
  assert.deepEqual([a.state, b.state].sort(), ["landed", "running"]);
  // Another base has its own queue.
  assert.equal(
    (await landNext(store, { projectId: "fixture", base: "release" }, s)).state,
    "empty",
  );
});
