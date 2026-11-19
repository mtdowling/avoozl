import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../../github/github.mjs";
import {
  appendRecord,
  githubJournal,
  journalNames,
  journalOutcomes,
  localJournal,
  parseRecord,
  renderRecord,
  replayJournal,
  validateRecord,
} from "../spec-journal.mjs";
import { isComplete, taskOutcome } from "../task-outcomes.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const SPEC = "a1b2c3d4e5f60718",
  TASK = "0f1e2d3c4b5a6978",
  REVISION = "a".repeat(64),
  DEFINITION = "b".repeat(64),
  PUBLIC = { visibility: "public", publicRepositories: ["example/code"] };

const outcome = (op, kind = "done", extra = {}) => ({
  op,
  kind: "outcome",
  spec: SPEC,
  revision: REVISION,
  outcomes: [{ task: TASK, kind, definition: DEFINITION, ...extra }],
});

// An in-memory journal shaped like a spec issue's comments.
function memory(author = "owner") {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body) => {
      const id = 1000 + entries.length * 7;
      entries.push({ id, body, author });
      return { id };
    },
    permission: async (login) =>
      ({ owner: "admin", writer: "write", reader: "read" })[login] ?? "none",
  };
}
const replay = (journal, options = PUBLIC) =>
  replayJournal(journal.entries, {
    ...options,
    permission: journal.permission,
  });

test("a public record holds only allowlisted fields and opaque identifiers", () => {
  const record = {
    v: 1,
    generation: 0,
    prev: null,
    alias: "Draco",
    ...outcome("op-1", "landed", {
      commit: "abc1234",
      checks: [{ name: "test (ubuntu-latest)", conclusion: "success", run: 7 }],
    }),
    refs: [{ repository: "example/code", branch: "spec/x", commit: "abc1234" }],
  };
  const body = renderRecord(record, PUBLIC);
  assert.deepEqual(
    parseRecord(body).record,
    JSON.parse(JSON.stringify(record)),
  );
  const refused = {
    actor: "someone",
    hostname: "made-up-host",
    path: "/Users/someone/x",
    command: "npm test",
    transcript: "…",
    output: "…",
    spend: 3,
    url: "https://example.test",
  };
  for (const [name, value] of Object.entries(refused))
    assert.throws(
      () => validateRecord({ ...record, [name]: value }, PUBLIC),
      /may not carry/,
      name,
    );
  for (const [where, bad] of [
    ["private spec name", { ...record, spec: "config" }],
    [
      "unlisted repository",
      {
        ...record,
        refs: [{ repository: "example/private", commit: "abc1234" }],
      },
    ],
    [
      "absolute branch",
      {
        ...record,
        refs: [
          { repository: "example/code", branch: "/tmp/x", commit: "abc1234" },
        ],
      },
    ],
    [
      "URL in a check",
      {
        ...record,
        outcomes: [
          {
            task: TASK,
            kind: "done",
            definition: DEFINITION,
            checks: [{ name: "https://host.corp/x", conclusion: "success" }],
          },
        ],
      },
    ],
    ["hostname alias", { ...record, alias: "laptop.corp.example" }],
    ["poll snapshot", { ...record, kind: "poll" }],
    ["frontier", { ...record, kind: "frontier" }],
    [
      "extra outcome field",
      {
        ...record,
        outcomes: [{ ...record.outcomes[0], note: "free prose" }],
      },
    ],
  ])
    assert.throws(() => validateRecord(bad, PUBLIC), undefined, where);
  // A private surface may use real names.
  validateRecord(
    {
      ...record,
      spec: "config",
      outcomes: [{ task: "1.1", kind: "done", definition: DEFINITION }],
      refs: [{ repository: "example/private", commit: "abc1234" }],
    },
    { visibility: "private" },
  );
});

test("writes link the tail and a retry is one transition", async () => {
  const journal = memory();
  const first = await appendRecord(journal, outcome("op-1"), PUBLIC);
  const second = await appendRecord(
    journal,
    outcome("op-2", "reopened"),
    PUBLIC,
  );
  assert.equal(second.record.prev.id, first.id);
  const retry = await appendRecord(
    journal,
    outcome("op-2", "reopened"),
    PUBLIC,
  );
  assert.equal(retry.existing, true);
  assert.equal(journal.entries.length, 2);
  await assert.rejects(
    appendRecord(journal, outcome("op-2", "done"), PUBLIC),
    /another payload/,
  );
  const result = await replay(journal);
  assert.equal(result.held, false);
  assert.equal(result.records.length, 2);
  // The latest outcome reduces through task-outcomes.mjs.
  const state = taskOutcome(journalOutcomes(result), {
    spec: SPEC,
    task: TASK,
    revision: REVISION,
    definition: DEFINITION,
  });
  assert.equal(state.state, "reopened");
});

test("an identical duplicate counts once; a conflicting one holds", async () => {
  const journal = memory();
  await appendRecord(journal, outcome("op-1"), PUBLIC);
  // A retried write that landed twice with the same payload.
  journal.entries.push({ ...journal.entries[0], id: 2000 });
  let result = await replay(journal);
  assert.equal(result.held, false);
  assert.equal(result.records.length, 1);
  const parsed = parseRecord(journal.entries[0].body).record;
  journal.entries.push({
    id: 3000,
    author: "owner",
    body: renderRecord(
      {
        ...parsed,
        outcomes: [{ ...parsed.outcomes[0], kind: "refused" }],
      },
      PUBLIC,
    ),
  });
  result = await replay(journal);
  assert.equal(result.held, true);
  assert.equal(result.reasons.at(-1).reason, "conflict");
  await assert.rejects(appendRecord(journal, outcome("op-9"), PUBLIC), /held/);
});

test("edited, missing and forked records hold; a deleted tail cannot be seen", async () => {
  const build = async () => {
    const journal = memory();
    for (const op of ["op-1", "op-2", "op-3"])
      await appendRecord(journal, outcome(op), PUBLIC);
    return journal;
  };
  let journal = await build();
  // A middle record changed: the next record's link no longer matches.
  journal.entries[1].body = journal.entries[1].body.replace(
    '"done"',
    '"skipped"',
  );
  assert.deepEqual(
    (await replay(journal)).reasons.map((r) => r.reason),
    ["mutated"],
  );
  journal = await build();
  journal.entries[2].edited = true;
  assert.equal((await replay(journal)).held, true);
  journal = await build();
  journal.entries.splice(1, 1);
  assert.deepEqual(
    (await replay(journal)).reasons.map((r) => r.reason),
    ["missing"],
  );
  // The documented limit: nothing links to a deleted tail.
  journal = await build();
  journal.entries.pop();
  assert.equal((await replay(journal)).held, false);
  // Two children of one record.
  journal = await build();
  const parsed = parseRecord(journal.entries[2].body).record;
  journal.entries.push({
    id: 9000,
    author: "owner",
    body: renderRecord({ ...parsed, op: "op-4" }, PUBLIC),
  });
  assert.equal((await replay(journal)).reasons.at(-1).reason, "conflict");
});

test("the actor is the authenticated author with write permission", async () => {
  const journal = memory();
  await appendRecord(journal, outcome("op-1"), PUBLIC);
  const parsed = parseRecord(journal.entries[0].body).record;
  for (const [id, author] of [
    [5000, "reader"],
    [5001, "stranger"],
    [5002, null],
  ])
    journal.entries.push({
      id,
      author,
      body: renderRecord({ ...parsed, op: `forged-${id}`, prev: null }, PUBLIC),
    });
  // Discussion comments are not records.
  journal.entries.push({ id: 6000, author: "reader", body: "Looks good." });
  const result = await replay(journal);
  assert.equal(result.held, false);
  assert.equal(result.records.length, 1);
  assert.deepEqual(
    result.rejected.map((entry) => entry.reason),
    ["unauthorized", "unauthorized", "unauthorized"],
  );
  // A writer's malformed record holds.
  journal.entries.push({
    id: 7000,
    author: "writer",
    body: "<!-- avoozl-journal:v1 {not json} -->",
  });
  assert.equal((await replay(journal)).reasons[0].reason, "invalid");
});

test("generations advance by one and older ones authorize nothing", async () => {
  const journal = memory();
  await appendRecord(journal, outcome("op-1"), PUBLIC);
  await appendRecord(
    journal,
    {
      op: "gen-1",
      kind: "generation",
      spec: SPEC,
      generation: 1,
      alias: "Draco",
    },
    PUBLIC,
  );
  const next = await appendRecord(journal, outcome("op-2", "reopened"), PUBLIC);
  assert.equal(next.record.generation, 1);
  await appendRecord(journal, { ...outcome("op-3"), generation: 0 }, PUBLIC);
  let result = await replay(journal);
  assert.equal(result.held, false);
  assert.equal(result.generation, 1);
  assert.deepEqual(result.rejected, [
    { id: journal.entries[3].id, reason: "stale-generation" },
  ]);
  await appendRecord(
    journal,
    { op: "gen-3", kind: "generation", spec: SPEC, generation: 3 },
    PUBLIC,
  );
  result = await replay(journal);
  assert.equal(result.reasons.at(-1).reason, "conflict");
});

test("replay reads every comment page and orders by comment ID", async () => {
  const journal = memory();
  for (let index = 0; index < 101; index += 1)
    await appendRecord(journal, outcome(`op-${index}`), PUBLIC);
  const comments = journal.entries
      .map((entry) => ({
        id: entry.id,
        body: entry.body,
        user: { login: "owner" },
        created_at: "2026-11-16T00:00:00Z",
        updated_at: "2026-11-16T00:00:00Z",
      }))
      .reverse(),
    pages = [];
  const github = new GitHubClient({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/permission"))
        return new Response(JSON.stringify({ permission: "admin" }), {
          status: 200,
        });
      const page = Number(parsed.searchParams.get("page"));
      pages.push(page);
      return new Response(
        JSON.stringify(comments.slice((page - 1) * 100, page * 100)),
        { status: 200 },
      );
    },
  });
  const remote = githubJournal(github, "example/code", 4),
    result = await replayJournal(await remote.list(), {
      ...PUBLIC,
      permission: remote.permission,
    });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.held, false);
  assert.equal(result.records.length, 101);
  assert.equal(result.tail.id, journal.entries.at(-1).id);
});

test("a local file journal follows the same protocol", async () => {
  const file = path.join(temporaryDirectory(), "journal", "config.jsonl"),
    journal = localJournal(file, "Operator"),
    options = { visibility: "private" },
    record = (op, kind) => ({
      op,
      kind: "outcome",
      spec: "config",
      revision: REVISION,
      outcomes: [{ task: "1.1", kind, definition: DEFINITION }],
    });
  await appendRecord(journal, record("op-1", "done"), options);
  await appendRecord(journal, record("op-2", "refused"), options);
  await appendRecord(journal, record("op-2", "refused"), options);
  assert.equal(fs.readFileSync(file, "utf8").trim().split("\n").length, 2);
  const result = await replayJournal(await journal.list(), {
    ...options,
    permission: journal.permission,
  });
  assert.equal(result.held, false);
  const state = taskOutcome(journalOutcomes(result), {
    spec: "config",
    task: "1.1",
    revision: REVISION,
    definition: DEFINITION,
  });
  assert.equal(state.state, "refused");
  assert.equal(isComplete(state), false);
});

test("a public journal stores opaque spec and task IDs and replays readable ones", async () => {
  const journal = memory(),
    names = journalNames({
      salt: "avz_testtesttesttest",
      spec: "config",
      tasks: ["config.1.1"],
    }),
    options = { ...PUBLIC, names },
    intent = {
      op: "land.0123456789abcdef",
      kind: "intent",
      spec: "config",
      revision: REVISION,
      base: "abc1234",
      tasks: [{ task: "config.1.1", definition: DEFINITION }],
      refs: [{ repository: "example/code", commit: "def5678" }],
    };
  // Readable IDs are refused on a public journal without names.
  await assert.rejects(appendRecord(journal, intent, PUBLIC), /invalid spec/);
  await appendRecord(journal, intent, options);
  await appendRecord(
    journal,
    {
      op: "landed.0123456789abcdef",
      kind: "outcome",
      spec: "config",
      revision: REVISION,
      outcomes: [
        {
          task: "config.1.1",
          kind: "landed",
          definition: DEFINITION,
          commit: "def5678",
        },
      ],
    },
    options,
  );
  // A retry of the same operation writes nothing.
  await appendRecord(journal, intent, options);
  assert.equal(journal.entries.length, 2);
  for (const { body } of journal.entries) {
    assert.ok(!body.includes("config"), body);
    assert.match(body, new RegExp(names.spec("config")));
  }
  const replayed = await replay(journal, options);
  assert.equal(replayed.held, false);
  assert.deepEqual(
    replayed.records.map(({ record }) => [
      record.spec,
      (record.tasks ?? record.outcomes).map((t) => t.task),
    ]),
    [
      ["config", ["config.1.1"]],
      ["config", ["config.1.1"]],
    ],
  );
  assert.deepEqual(
    journalOutcomes(replayed).map((o) => [o.spec, o.task, o.kind]),
    [["config", "config.1.1", "landed"]],
  );
  // Without the names a replay keeps the opaque IDs: they match no task.
  const blind = await replay(journal);
  assert.equal(blind.records[0].record.spec, names.spec("config"));
});
