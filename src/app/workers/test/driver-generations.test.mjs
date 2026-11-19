// Driver generations, guarded intents and landing reconciliation (task
// 56.4). Journals are in memory; repositories are local scratch repositories.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "../../../model.mjs";
import { git } from "../../git/git.mjs";
import { appendRecord, replayJournal } from "../../specs/spec-journal.mjs";
import {
  driverState,
  effectiveOwner,
  guardedFastForward,
  headGuardedMerge,
  landIntent,
  outstandingIntents,
  revalidate,
  takeOver,
} from "../driver-generations.mjs";

const SPEC = "example-spec";
const REVISION = digest("revision");
const DEF = digest("definition t1");
const owner = { login: "owner", from: "spec" };
const person = { kind: "person", login: "owner" };

function memory() {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body) => {
      const id = 1000 + entries.length * 7;
      entries.push({ id, body, author: "owner" });
      return { id };
    },
    permission: async (login) => (login === "owner" ? "admin" : "none"),
  };
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-gen-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = {
    visibility: "private",
    machine: { hostname: "made-up-host", username: "madeupuser" },
    configFile: path.join(root, "machine.json"),
  };
  return { root, options, journal: memory() };
}

async function repos(root) {
  const seed = path.join(root, "seed"),
    upstream = path.join(root, "upstream.git"),
    driver = path.join(root, "driver");
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
  await git(root, ["clone", "-q", upstream, driver]);
  await identity(driver);
  const commit = async (file, text, message = `Change ${file}`) => {
    fs.writeFileSync(path.join(driver, file), text);
    await git(driver, ["add", "."]);
    await git(driver, ["commit", "-q", "-m", message]);
    return git(driver, ["rev-parse", "HEAD"]);
  };
  const head = async () =>
    (
      await git(root, ["ls-remote", "--heads", upstream, "refs/heads/main"])
    ).split(/\s+/)[0];
  return { upstream, driver, commit, head, base: await head() };
}

const intentInput = (r, candidate, extra = {}) => ({
  owner,
  login: "owner",
  spec: SPEC,
  op: "intent-1",
  revision: REVISION,
  candidate,
  base: r.base,
  tasks: [{ task: "t1", definition: DEF }],
  checks: [{ name: "npm test", conclusion: "success" }],
  refs: [
    { repository: "acme/app", branch: "avoozl/spec/work", commit: candidate },
  ],
  land: () =>
    guardedFastForward(r.driver, {
      url: r.upstream,
      branch: "main",
      base: r.base,
      candidate,
    }),
  ...extra,
});

const state = async (journal) =>
  driverState(
    await replayJournal(journal.entries, {
      permission: journal.permission,
      visibility: "private",
    }),
  );

test("authority: the spec's single assignee, else the epic's; none or several hold", () => {
  assert.deepEqual(effectiveOwner({ spec: ["a"] }), {
    login: "a",
    from: "spec",
  });
  assert.deepEqual(effectiveOwner({ spec: [], epic: ["b"] }), {
    login: "b",
    from: "epic",
  });
  assert.equal(
    effectiveOwner({ spec: ["a", "b"], epic: ["c"] }).reason,
    "several",
  );
  assert.equal(effectiveOwner({ spec: [], epic: [] }).reason, "no-assignee");
});

test("take over is person-only for the owner and writes the next generation", async (t) => {
  const { journal, options } = setup(t);
  await assert.rejects(
    takeOver(journal, { by: { kind: "app" }, owner, spec: SPEC }, options),
    /person's action/,
  );
  await assert.rejects(
    takeOver(
      journal,
      { by: { kind: "person", login: "other" }, owner, spec: SPEC },
      options,
    ),
    /Only owner/,
  );
  await assert.rejects(
    takeOver(
      journal,
      { by: person, owner: effectiveOwner({ spec: ["a", "b"] }), spec: SPEC },
      options,
    ),
    /several assignees/,
  );
  const first = await takeOver(
    journal,
    { by: person, owner, spec: SPEC },
    options,
  );
  assert.equal(first.generation, 1);
  const second = await takeOver(
    journal,
    { by: person, owner, spec: SPEC },
    options,
  );
  assert.equal(second.generation, 2);
  assert.notEqual(first.driver, second.driver);
  // The first driver is displaced and can neither dispatch nor land.
  assert.equal(
    (
      await revalidate(
        journal,
        { driver: first.driver, owner, login: "owner" },
        options,
      )
    ).reason,
    "displaced",
  );
  assert.equal(
    (
      await revalidate(
        journal,
        { driver: second.driver, owner, login: "owner" },
        options,
      )
    ).ok,
    true,
  );
});

test("two takeovers at once hold the journal and dispatch", async (t) => {
  const { journal, options } = setup(t);
  await takeOver(journal, { by: person, owner, spec: SPEC }, options);
  const results = await Promise.all([
    takeOver(journal, { by: person, owner, spec: SPEC }, options),
    takeOver(journal, { by: person, owner, spec: SPEC }, options),
  ]);
  assert.ok(results.every((result) => !result.ok));
  for (const { driver } of results)
    assert.equal(
      (await revalidate(journal, { driver, owner, login: "owner" }, options))
        .reason,
      "journal-held",
    );
  await assert.rejects(
    takeOver(journal, { by: person, owner, spec: SPEC }, options),
    /held/,
  );
});

test("revalidation catches an owner change and open holds", async (t) => {
  const { journal, options } = setup(t);
  const { driver } = await takeOver(
    journal,
    { by: person, owner, spec: SPEC },
    options,
  );
  assert.equal(
    (
      await revalidate(
        journal,
        { driver, owner: { login: "someone-else" }, login: "owner" },
        options,
      )
    ).reason,
    "owner-changed",
  );
  await appendRecord(
    journal,
    {
      op: "hold-1",
      kind: "control",
      spec: SPEC,
      driver,
      controls: [{ flag: "hold", id: "h1" }],
    },
    options,
  );
  assert.equal(
    (await revalidate(journal, { driver, owner, login: "owner" }, options))
      .reason,
    "stopped",
  );
  await appendRecord(
    journal,
    {
      op: "resume-1",
      kind: "control",
      spec: SPEC,
      driver,
      controls: [{ flag: "resume", id: "h1" }],
    },
    options,
  );
  assert.equal(
    (await revalidate(journal, { driver, owner, login: "owner" }, options)).ok,
    true,
  );
});

test("an intent is written and read back before a guarded land, then one outcome", async (t) => {
  const { root, journal, options } = setup(t),
    r = await repos(root),
    candidate = await r.commit("b.txt", "b\n");
  const { driver } = await takeOver(
    journal,
    { by: person, owner, spec: SPEC },
    options,
  );
  const result = await landIntent(
    journal,
    { driver, ...intentInput(r, candidate) },
    options,
  );
  assert.equal(result.state, "landed");
  assert.equal(await r.head(), candidate);
  const after = await state(journal);
  assert.equal(after.outcomes.length, 1);
  assert.equal(after.outcomes[0].kind, "landed");
  assert.equal(after.outcomes[0].commit, candidate);
  assert.equal(outstandingIntents(after).length, 0);
});

test("a head-guarded merge lands only the head that was checked", async () => {
  const calls = [];
  const github = {
    mergePullRequest: async (repository, number, { sha }) => {
      calls.push(sha);
      if (sha !== "a".repeat(40)) {
        const error = Error("Head branch was modified");
        error.status = 409;
        throw error;
      }
      return { merged: true };
    },
  };
  assert.equal(
    await headGuardedMerge(github, "acme/app", 3, "b".repeat(40)),
    false,
  );
  assert.equal(
    await headGuardedMerge(github, "acme/app", 3, "a".repeat(40)),
    true,
  );
  assert.equal(calls.length, 2);
});
