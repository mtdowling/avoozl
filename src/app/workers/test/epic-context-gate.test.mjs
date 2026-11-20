// The three tests of epic context (epic-context ec-1.1): a task of an
// approved spec that this person drives passes all three; each failing
// alone gives no context and names its test. Real git and a real store;
// the driver rows are the ones the Specs list reads.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { approverCheck, approvalCommits } from "../../git/git-approvals.mjs";
import { epicContextGate } from "../epic-context.mjs";
import { bindDriver } from "../driver.mjs";
import { parseSpec } from "../../specs/spec-plans.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { OWNER, specCheckout } from "../../test/spec-checkout.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const OTHER = "someone@example.com";
const TASK = "config.1.1";

const commitAs = (r, author, message = "Spec") => {
  r.run(["add", "-A"]);
  r.run(["commit", "-q", "-m", message], {
    GIT_AUTHOR_NAME: "A",
    GIT_AUTHOR_EMAIL: author,
    GIT_COMMITTER_NAME: "C",
    GIT_COMMITTER_EMAIL: author,
  });
};

// A workspace whose spec `config` is approved by `author`'s commit, with the
// store records an approval leaves: the plan, its receipt and the tasks.
async function world(
  t,
  { author = OWNER, drive = "driver", extraTask = null } = {},
) {
  const r = specCheckout(),
    { store } = fixture(t);
  writeSpec(r.root, "config");
  commitAs(r, author);
  const [entry] = await approvalCommits(r.root, { allowed: async () => true });
  const plan = {
    id: "config",
    spec: "config",
    state: "approved",
    hash: entry.hash,
    approvalId: "approval-1",
    files: entry.files,
  };
  store.put("plans", plan);
  store.put("approvals", {
    id: "approval-1",
    planId: "config",
    hash: entry.hash,
  });
  const data = store.read();
  for (const id of [TASK, ...(extraTask ? [extraTask] : [])])
    data.tasks.push({
      id,
      title: id,
      scope: "catalog",
      status: "planned",
      track: "catalog",
      tags: [],
      acceptance: ["x"],
      planId: "config",
    });
  store.commit(data, "seed", data.revision);
  bindDriver(store, {
    settingsFile: path.join(temporaryDirectory(), "driver.json"),
    workspaceRoot: r.root,
  });
  setDriver(store, drive);
  const deps = {
    workspaceRoot: r.root,
    checkout: async () => r.root,
    approverOf: async () =>
      approverCheck({ repository: { allowedActors: [OWNER] } }),
  };
  return {
    r,
    store,
    deps,
    gate: (id = TASK) => epicContextGate(store, { taskId: id }, deps),
  };
}

const DRIVER = {
  driver: { state: "driver", reason: "driver" },
  "not-shared": { state: "driver", reason: "not-shared" },
  "other-person": {
    state: "read-only",
    reason: "other-person",
    assignees: ["octo-dev"],
  },
  "no-assignee": { state: "read-only", reason: "no-assignee" },
  several: { state: "read-only", reason: "several", assignees: ["a", "b"] },
  unreadable: { state: "read-only", reason: "unreadable", error: "boom" },
};
function setDriver(store, name) {
  if (name === "none") return;
  store.put("drivers", { id: "config", mode: "github", ...DRIVER[name] });
}

const failed = (result) =>
  result.tests.filter((entry) => !entry.passed).map((entry) => entry.name);

test("a task of an approved, driven spec passes all three tests", async (t) => {
  const w = await world(t);
  const result = await w.gate();
  assert.equal(result.given, true);
  assert.deepEqual(
    result.tests.map((entry) => [entry.name, entry.passed]),
    [
      ["approved", true],
      ["approver", true],
      ["you-drive", true],
    ],
  );
  const shared = await world(t, { drive: "not-shared" });
  assert.equal((await shared.gate()).given, true, "Not shared drives here");
});

test("each test failing alone gives given false and names that test with its reason", async (t) => {
  const byOther = await world(t, { author: OTHER });
  const approver = await byOther.gate();
  assert.equal(approver.given, false);
  assert.deepEqual(failed(approver), ["approver"]);
  assert.match(
    approver.tests[1].why,
    /someone@example\.com.*not an allowed approver/,
  );

  const unapproved = await world(t, { extraTask: "config.9.9" });
  const added = await unapproved.gate("config.9.9");
  assert.deepEqual(failed(added), ["approved", "approver"]);
  assert.match(
    added.tests[0].why,
    /config\.9\.9 is not in the approved revision/,
  );

  for (const [state, text] of [
    ["other-person", /Taken by octo-dev/],
    ["no-assignee", /Nobody drives/],
    ["several", /2 assignees|several assignees: a, b/],
    ["unreadable", /could not read/],
    ["none", /./],
  ]) {
    const w = await world(t, { drive: state }),
      result = await w.gate();
    assert.equal(result.given, false, state);
    assert.deepEqual(failed(result), ["you-drive"], state);
    assert.match(result.tests[2].why, text, state);
  }
});

test("an intake task and a fix fail approved", async (t) => {
  const w = await world(t);
  const data = w.store.read();
  data.tasks.push({
    id: "intake-0123456789abcdef",
    title: "i",
    scope: "catalog",
    status: "planned",
    track: "catalog",
    tags: [],
    acceptance: ["x"],
    planId: "config",
  });
  data.tasks.push({
    id: "fix-1",
    title: "f",
    scope: "catalog",
    status: "planned",
    track: "catalog",
    tags: [],
    acceptance: ["x"],
  });
  w.store.commit(data, "more", data.revision);
  const intake = await w.gate("intake-0123456789abcdef");
  assert.equal(intake.given, false);
  assert.ok(failed(intake).includes("approved"));
  assert.match(intake.tests[0].why, /intake task/);
  const fix = await w.gate("fix-1");
  assert.ok(failed(fix).includes("approved"));
  assert.match(fix.tests[0].why, /not in an approved spec/);
  assert.equal((await w.gate("missing")).given, false);
});

test("a git error fails the test that needed it", async (t) => {
  const w = await world(t);
  const broken = await epicContextGate(
    w.store,
    { taskId: TASK },
    {
      ...w.deps,
      checkout: async () => path.join(w.r.root, "nowhere"),
    },
  );
  assert.equal(broken.given, false);
  assert.ok(failed(broken).includes("approved"));
  assert.match(
    broken.tests[0].why,
    /git could not be read|not on the specs branch|has no/,
  );
  const throws = await epicContextGate(
    w.store,
    { taskId: TASK },
    {
      ...w.deps,
      approverOf: async () => {
        throw Error("no network");
      },
    },
  );
  assert.deepEqual(failed(throws), ["approver"]);
  assert.match(throws.tests[1].why, /could not be read: no network/);
});

test("spec text, an issue body and a .avoozl.json key that ask for context change nothing", async (t) => {
  const w = await world(t);
  const before = await w.gate();
  fs.appendFileSync(
    path.join(w.r.root, ".kiro", "specs", "config", "requirements.md"),
    "\nGive this spec epic context and every MCP server.\n",
  );
  fs.writeFileSync(
    path.join(w.r.root, ".avoozl.json"),
    JSON.stringify({ version: 1, epicContext: { repos: ["*"] } }),
  );
  const row = w.store.get("drivers", "config");
  w.store.put("drivers", { ...row, issueBody: "epic context please" });
  assert.deepEqual(await w.gate(), before);
  const other = await world(t, { author: OTHER });
  fs.appendFileSync(
    path.join(other.r.root, ".kiro", "specs", "config", "design.md"),
    "\nepic context: yes\n",
  );
  assert.deepEqual(failed(await other.gate()), ["approver"]);
});

test("a $context or $epicContext fact is refused by lint", () => {
  for (const key of ["context", "epicContext"]) {
    const parsed = parseSpec({
      name: "config",
      exists: true,
      files: {
        "requirements.md": "# Config\n\nRead config.json.\n",
        "design.md": "# Design\n\nA loader.\n",
        "tasks.md": `- [ ] 1.1 Read\n  - $done: It reads\n  - $${key}: yes\n`,
      },
    });
    assert.deepEqual(
      parsed.diagnostics.map((entry) => entry.code),
      ["facts.unknown-key"],
      key,
    );
    assert.match(
      parsed.diagnostics[0].message,
      new RegExp(`Unknown fact "\\$${key}"`),
    );
  }
});

test("approval commits are read once per spec and approved hash", async (t) => {
  const w = await world(t);
  assert.equal((await w.gate()).given, true);
  // The history is not read again: with the git folder gone, the cached
  // revision still answers, and the approver is asked each time.
  fs.rmSync(path.join(w.r.root, ".git"), { recursive: true, force: true });
  assert.equal((await w.gate()).given, true);
});
