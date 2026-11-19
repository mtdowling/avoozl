// Task 43.2 (R90.3, R90.5, R102.7): a worker pulls minimal offers from the
// spec journal and resolves qualified references, one offer per free lane.
import assert from "node:assert/strict";
import test from "node:test";
import { appendRecord } from "../../specs/spec-journal.mjs";
import { pullOffers, workerId } from "../worker-offers.mjs";

const SPEC = "demo",
  DRIVER = "d".repeat(16),
  SHA = (n) => String(n).repeat(40).slice(0, 40),
  DEF = "b".repeat(64),
  OPTIONS = { visibility: "private" },
  POOL = {
    spec: SPEC,
    repository: "example/code",
    issue: 7,
    target: "example/code",
    base: "main",
    visibility: "private",
  },
  SOURCES = {
    "example/code": { url: "https://example.test/code.git" },
    "fork/code": {
      url: "https://example.test/fork.git",
      parent: "example/code",
    },
  };

function memory() {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body, author = "owner") => {
      const id = 100 + entries.length * 3;
      entries.push({ id, body, author });
      return { id };
    },
    permission: async (login) =>
      ({ owner: "admin", writer: "write" })[login] ?? "read",
  };
}

const offer = (task, login, repository = "example/code", extra = {}) => ({
  op: `offer-${task}-${login}-${repository.replace("/", "-")}`,
  kind: "offer",
  spec: SPEC,
  driver: DRIVER,
  worker: workerId(login),
  base: SHA(1),
  tasks: [{ task, definition: DEF }],
  refs: [{ repository, branch: "avoozl/demo/work", commit: SHA(2) }],
  ...extra,
});

async function started() {
  const journal = memory();
  await appendRecord(
    journal,
    {
      op: "generation-1",
      kind: "generation",
      spec: SPEC,
      generation: 1,
      driver: DRIVER,
    },
    OPTIONS,
  );
  return journal;
}
const pull = (journal, over = {}) =>
  pullOffers({
    github: {},
    pools: [POOL],
    sources: SOURCES,
    login: "Worker-A",
    free: 3,
    journalFor: () => journal,
    ...over,
  });

test("a worker sees only its own current offers, in journal order", async () => {
  const journal = await started();
  for (const record of [
    offer("t1", "worker-a"),
    offer("t2", "someone-else"),
    offer("t3", "worker-a"),
  ])
    await appendRecord(journal, record, OPTIONS);
  const { offers } = await pull(journal);
  assert.deepEqual(
    offers.map((o) => o.task),
    ["t1", "t3"],
  );
  assert.equal(offers[0].ref.source.commit, SHA(2));
  assert.equal(offers[0].ref.target.base, "main");
  assert.equal(offers[0].generation, 1);
});

test("at most one offer per free lane", async () => {
  const journal = await started();
  for (const task of ["t1", "t2", "t3"])
    await appendRecord(journal, offer(task, "worker-a"), OPTIONS);
  assert.equal((await pull(journal, { free: 2 })).offers.length, 2);
  assert.equal((await pull(journal, { free: 0 })).offers.length, 0);
});

test("a fork keeps its own identity and an unregistered source is refused", async () => {
  const journal = await started();
  await appendRecord(journal, offer("t1", "worker-a", "fork/code"), OPTIONS);
  await appendRecord(
    journal,
    offer("t2", "worker-a", "stranger/code"),
    OPTIONS,
  );
  const result = await pull(journal);
  assert.deepEqual(
    result.offers.map((o) => [o.task, o.ref.source.repository]),
    [["t1", "fork/code"]],
  );
  assert.equal(result.offers[0].ref.target.repository, "example/code");
  assert.equal(result.refused.length, 1);
  assert.match(result.refused[0].reason, /not a registered repository/);
});

test("a granted, settled or older-generation task is not offered", async () => {
  const journal = await started();
  for (const task of ["granted", "settled", "old", "open"])
    await appendRecord(journal, offer(task, "worker-a"), OPTIONS);
  await appendRecord(
    journal,
    {
      op: "grant-1",
      kind: "grant",
      spec: SPEC,
      driver: DRIVER,
      worker: workerId("other"),
      tasks: [{ task: "granted", definition: DEF }],
    },
    OPTIONS,
  );
  await appendRecord(
    journal,
    {
      op: "done-1",
      kind: "outcome",
      spec: SPEC,
      revision: "a".repeat(64),
      driver: DRIVER,
      outcomes: [{ task: "settled", kind: "done", definition: DEF }],
    },
    OPTIONS,
  );
  assert.deepEqual(
    (await pull(journal)).offers.map((o) => o.task),
    ["old", "open"],
  );
  // A takeover makes every earlier offer stale.
  await appendRecord(
    journal,
    {
      op: "generation-2",
      kind: "generation",
      spec: SPEC,
      generation: 2,
      driver: "e".repeat(16),
    },
    OPTIONS,
  );
  assert.deepEqual((await pull(journal)).offers, []);
});

test("a hold, an unauthorized writer or an edited record offers nothing", async () => {
  const journal = await started();
  await appendRecord(journal, offer("t1", "worker-a"), OPTIONS);
  await appendRecord(
    journal,
    {
      op: "hold-1",
      kind: "control",
      spec: SPEC,
      driver: DRIVER,
      controls: [{ flag: "hold", id: "stop-1" }],
    },
    OPTIONS,
  );
  assert.deepEqual((await pull(journal)).offers, []);

  const forged = await started();
  const { body } = (await forged.list())[0];
  forged.entries.push({
    id: 500,
    body: body.replace(/generation-1/g, "generation-2"),
    author: "mallory",
  });
  await appendRecord(forged, offer("t1", "worker-a"), OPTIONS);
  assert.equal((await pull(forged)).offers.length, 1);

  const edited = await started();
  await appendRecord(edited, offer("t1", "worker-a"), OPTIONS);
  edited.entries[1].edited = true;
  const held = await pull(edited);
  assert.deepEqual(held.offers, []);
  assert.equal(held.held.length, 1);
});
