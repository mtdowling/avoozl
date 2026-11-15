// RC31 through the real projection and queue on a fake GitHub: unblock-count
// order, the overlap hold-back (claimed work and an open pull request),
// aging, a person's order, and ranking off.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CLAIM,
  READY,
  labelsOf,
  leaf,
  setup,
} from "./radar-coder-release-fixture.mjs";

const queue = async (w) => {
  const { repositories } = await w.ops.execute("radar.releasequeue", {});
  return Object.fromEntries(
    repositories[0].rows.map((row) => [row.taskId, row]),
  );
};
const rewrite = (w, release) => {
  const file = path.join(w.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.github.repositories["example/code"].release = release;
  fs.writeFileSync(file, JSON.stringify(value));
};

test("with N=1 the task that unblocks the most is released before an earlier plain one", async (t) => {
  const w = await setup(t, { release: { capacity: 1 } }, [
    leaf("r-plain"),
    leaf("r-root"),
    leaf("r-a", { requires: ["r-root"] }),
    leaf("r-b", { requires: ["r-root"] }),
  ]);
  const [plain, root] = w.approved.taskIds;
  await w.tick();
  assert.deepEqual(w.readyIds(), [root]);
  const rows = await queue(w);
  assert.equal(rows[plain].state, "held");
});

test("a task waiting for a slot says what it would unblock", async (t) => {
  const w = await setup(t, { release: { capacity: 1 } }, [
    leaf("n-plain"),
    leaf("n-one"),
    leaf("n-root"),
    leaf("n-a", { requires: ["n-root"] }),
    leaf("n-b", { requires: ["n-root"] }),
    leaf("n-c", { requires: ["n-one"] }),
  ]);
  const [plain, one, root] = w.approved.taskIds;
  await w.tick();
  const rows = await queue(w);
  assert.equal(rows[root].state, "released");
  assert.equal(
    rows[one].reason,
    "Waiting for a free slot (1 of 1 in use). Next: unblocks 1 task.",
  );
  assert.equal(rows[plain].reason, "Waiting for a free slot (1 of 1 in use).");
});

// A claimed first task, then two more: one that overlaps it, one that does
// not. N=1 releases the first; N=2 leaves one free slot.
async function claimed(t, extra = {}) {
  const w = await setup(t, { release: { capacity: 1, ...extra } }, [
    leaf("o-claimed", { paths: ["src/app/a.mjs"] }),
    leaf("o-clash", { paths: ["src/app"] }),
    leaf("o-free", { paths: ["docs"] }),
  ]);
  const [first, clash, free] = w.approved.taskIds;
  await w.tick();
  w.issueOf(first).labels.push({ name: CLAIM });
  rewrite(w, { capacity: 2, ...extra });
  return { w, first, clash, free };
}

test("a task whose paths overlap claimed work is passed over for a free one, and the queue says why", async (t) => {
  const { w, first, clash, free } = await claimed(t);
  await w.tick();
  assert.deepEqual(w.readyIds().sort(), [first, free].sort());
  const row = (await queue(w))[clash];
  assert.equal(row.state, "held");
  assert.match(
    row.reason,
    /^Held: paths overlap #\d+ \(claimed\); moves up in 12h\.$/,
  );
});

test("a held task is released after four waits and its note says it waited", async (t) => {
  const { w, first, clash, free } = await claimed(t, {
    ranking: { agingHours: 5 },
  });
  await w.tick();
  assert.equal(labelsOf(w.issueOf(clash)).includes(READY), false);
  const meta = w.store.getMeta("releaseRanking");
  meta.heldSince[clash] = new Date(Date.now() - 21 * 3_600_000).toISOString();
  w.store.setMeta("releaseRanking", meta);
  // Free the slot the other task took, so the aged task can use it.
  w.issueOf(free).labels = w
    .issueOf(free)
    .labels.filter((label) => label.name !== READY);
  rewrite(w, { capacity: 2, ranking: { agingHours: 5 } });
  await w.tick();
  assert.equal(labelsOf(w.issueOf(clash)).includes(READY), true);
  assert.match(
    w.store.getMeta("releaseRanking").notes[clash].reason,
    /^Next: waited 2\dh\.$/,
  );
  assert.ok(first);
});

test("an open pull request that closes a task holds back overlapping work", async (t) => {
  const w = await setup(t, { release: { capacity: 0 } }, [
    leaf("p-clash", { paths: ["src/app/a.mjs"] }),
    leaf("p-free", { paths: ["docs"] }),
    leaf("p-pr", { paths: ["src/app"] }),
  ]);
  const [clash, free, pr] = w.approved.taskIds;
  await w.tick();
  w.github.openPullRequests = async () => [
    {
      number: 77,
      closingIssuesReferences: { nodes: [{ number: w.issueOf(pr).number }] },
    },
  ];
  rewrite(w, { capacity: 1 });
  await w.tick();
  assert.deepEqual(w.readyIds(), [free]);
  assert.match(
    (await queue(w))[clash].reason,
    /^Held: paths overlap #77 \(open pull request\)/,
  );
});

test("a person's ready label is kept whatever ranking says", async (t) => {
  const { w, first, clash, free } = await claimed(t);
  w.github.permissions.set("maintainer", "write");
  const issue = w.issueOf(clash);
  issue.labels.push({ name: READY });
  w.github.events.set(issue.number, [
    {
      event: "labeled",
      label: { name: READY },
      actor: { login: "maintainer" },
      created_at: new Date().toISOString(),
    },
  ]);
  await w.tick();
  assert.equal(labelsOf(w.issueOf(clash)).includes(READY), true);
  assert.ok(first && free);
});

test("ranking off keeps plan order", async (t) => {
  const { w, first, clash } = await claimed(t, { ranking: { enabled: false } });
  await w.tick();
  assert.deepEqual(w.readyIds().sort(), [first, clash].sort());
});
