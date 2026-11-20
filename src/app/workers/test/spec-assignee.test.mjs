// The spec issue's assignee says who works on a spec (Requirement 116,
// design §4.44, changed by Requirement 118 and §4.46: Avoozl never writes
// the assignee). Two workspaces, alice's and bob's, share one fake GitHub;
// each has its own SQLite and machine ID. No network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { driverDecisions, driverStep } from "../driver.mjs";
import { readOnlyPlanIds } from "../driver-scope.mjs";
import { bindSession } from "../../sessions/session-bindings.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { FakeGitHub } from "../../test/fake-github.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = "example/code";

// One GitHub for both logins: bob's client reads and writes alice's issues.
function world() {
  const alice = new FakeGitHub();
  alice.login = "alice";
  alice.permissions.set("alice", "admin");
  alice.permissions.set("bob", "admin");
  const bob = Object.create(alice);
  bob.login = "bob";
  // Every call by name, for "this wrote nothing" and "this read once".
  const calls = [];
  for (const client of [alice, bob])
    for (const name of [
      "issue",
      "addAssignees",
      "removeAssignees",
      "updateIssue",
    ]) {
      const call = FakeGitHub.prototype[name] ?? alice[name];
      client[name] = function (...args) {
        calls.push({ login: this.login, name });
        return call.apply(this, args);
      };
    }
  return { alice, bob, calls };
}

async function workspace(t, github) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_specassigneetest",
      github: {
        mode: "single-repo",
        repositories: { [REPOSITORY]: { baseBranch: "main" } },
      },
    }),
  );
  const ops = new Operations(store, {
    github,
    operator: github.login,
    workspaceRoot: root,
    driver: {
      settingsFile: path.join(temporaryDirectory(), "driver.json"),
      sleep: async () => {},
    },
  });
  store.put("repositories", {
    id: "code",
    root,
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  await ops.execute("github.configure", {
    repository: REPOSITORY,
    repositoryId: "code",
    allowedActors: ["alice", "bob"],
  });
  writeSpec(root, "config");
  const created = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { repositoryId: "code" },
  });
  const preview = await ops.execute("plan.preview", { id: created.id });
  await ops.execute("plan.approve", {
    id: created.id,
    expectedHash: created.hash,
    expectedRevision: preview.expectedRevision,
  });
  const planId = created.id,
    tick = () => driverStep(store, github, { script: true }),
    status = async () =>
      (await ops.execute("driver.status", { planId })).specs[0];
  return { store, root, ops, planId, tick, status, github };
}

// Alice publishes the spec issue; bob's workspace knows the same issue, as
// a rebuild from GitHub would.
async function pair(t) {
  const w = world(),
    a = await workspace(t, w.alice),
    b = await workspace(t, w.bob);
  const published = await a.ops.execute("spec.publish", { planId: a.planId });
  b.store.put("receipts", {
    ...a.store.get("receipts", `github-parent:plan:${a.planId}`),
  });
  const issue = () =>
    w.alice.created.find((item) => item.number === published.number);
  const assignees = () => issue().assignees.map((entry) => entry.login);
  return { ...w, a, b, number: published.number, issue, assignees };
}

test("the spec issue's one assignee drives; reassigning moves it and unassigning releases it", async (t) => {
  const p = await pair(t);
  await p.alice.addAssignees(REPOSITORY, p.number, ["alice"]);
  await p.a.tick();
  await p.b.tick();
  assert.equal((await p.a.status()).state, "driver");
  const other = await p.b.status();
  assert.equal(other.reason, "other-person");
  assert.match(other.text, /Taken by alice/);
  assert.equal(readOnlyPlanIds(p.b.store).has(p.b.planId), true);
  // Handing off is reassigning the issue on GitHub; Avoozl writes nothing.
  const from = p.calls.length;
  await p.alice.removeAssignees(REPOSITORY, p.number, ["alice"]);
  await p.bob.addAssignees(REPOSITORY, p.number, ["bob"]);
  await p.a.tick();
  await p.b.tick();
  assert.equal((await p.a.status()).reason, "other-person");
  assert.equal((await p.b.status()).state, "driver");
  assert.deepEqual(
    p.calls
      .slice(from + 2)
      .filter((call) => call.name !== "issue")
      .map((call) => call.name),
    [],
    "the ticks only read",
  );
  // Unassigning releases it: nobody drives, and no Needs you item opens.
  await p.bob.removeAssignees(REPOSITORY, p.number, ["bob"]);
  for (const w of [p.a, p.b]) {
    await w.tick();
    assert.equal((await w.status()).reason, "no-assignee");
    assert.deepEqual(driverDecisions(w.store), []);
  }
});

test("two assignees hold both machines and raise one Needs you item naming both", async (t) => {
  const p = await pair(t);
  await p.alice.addAssignees(REPOSITORY, p.number, ["alice"]);
  // A person adds bob on GitHub too.
  await p.bob.addAssignees(REPOSITORY, p.number, ["bob"]);
  for (const w of [p.a, p.b]) {
    const first = await w.tick(),
      again = await w.tick();
    assert.equal((await w.status()).reason, "several");
    assert.equal(readOnlyPlanIds(w.store).has(w.planId), true);
    const items = driverDecisions(w.store);
    assert.equal(items.length, 1);
    assert.match(items[0].detail, /2 assignees: alice, bob/);
    assert.equal(first.notify.length, 1, "one notice, the first time");
    assert.deepEqual(again.notify, []);
  }
  // Removing one closes it by itself.
  await p.bob.removeAssignees(REPOSITORY, p.number, ["bob"]);
  await p.a.tick();
  assert.deepEqual(driverDecisions(p.a.store), []);
  assert.equal((await p.a.status()).state, "driver");
});

test("a fully landed spec closes its issue once, and the tick reads it once", async (t) => {
  const p = await pair(t);
  await p.alice.addAssignees(REPOSITORY, p.number, ["alice"]);
  let from = p.calls.length;
  await p.a.tick();
  assert.deepEqual(
    p.calls.slice(from).map((call) => call.name),
    ["issue"],
    "one conditional read per spec per tick, no write",
  );
  p.a.store.mutate("Land every task", (data) => {
    for (const task of data.tasks)
      if (task.planId === p.a.planId) task.status = "accepted";
  });
  await p.a.tick();
  assert.equal(p.issue().state, "closed");
  assert.equal(p.issue().state_reason, "completed");
  from = p.calls.length;
  await p.a.tick();
  assert.deepEqual(
    p.calls.slice(from).map((call) => call.name),
    ["issue"],
    "closed once",
  );
});

test("a spec with no spec issue drives here as Not shared, and no issue is made", async (t) => {
  const w = world(),
    a = await workspace(t, w.alice);
  await a.tick();
  const seen = await a.status();
  assert.equal(seen.state, "driver");
  assert.equal(seen.reason, "not-shared");
  assert.match(seen.text, /Not shared/);
  assert.equal(w.alice.created.length, 0);
  // There is no Take over, Hand off or Release to press (R118.4).
  for (const name of ["driver.takeover", "driver.handoff"])
    await assert.rejects(
      a.ops.execute(name, { planId: a.planId }),
      /Unknown operation/,
    );
});
