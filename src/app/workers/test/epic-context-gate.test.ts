// The two tests of epic context (epic-context ec-1.1): a task of an
// approved spec passes both; each failing alone gives no context and names
// its test. Real git and a real store.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { approverCheck } from "../../git/git-approvals.ts";
import { epicContextGate } from "../epic-context.ts";
import { parseSpec } from "../../specs/spec-plans.ts";
import { fixture } from "../../test/fixtures.ts";
import { seedApproval } from "../../test/epic-context-seed.ts";
import { OWNER, specCheckout } from "../../test/spec-checkout.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const OTHER = "someone@example.com";
const TASK = "config.1.1";

const commitAs = (
  r: ReturnType<typeof specCheckout>,
  author: string,
  message = "Spec",
) => {
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
  t: TestContext,
  {
    author = OWNER,
    extraTask = null,
  }: { author?: string; extraTask?: string | null } = {},
) {
  const r = specCheckout(),
    { store } = fixture(t);
  writeSpec(r.root, "config");
  commitAs(r, author);
  await seedApproval(store, {
    root: r.root,
    tasks: [TASK, ...(extraTask ? [extraTask] : [])],
  });
  const deps = {
    workspaceRoot: r.root,
    checkout: async () => r.root,
    approverOf: async () =>
      approverCheck({
        repository: { allowedActors: [OWNER] },
        trust: "branch-protection",
      }),
  };
  return {
    r,
    store,
    deps,
    gate: (id = TASK) => epicContextGate(store, { taskId: id }, deps),
  };
}

const failed = (result: { tests: { name: string; passed: boolean }[] }) =>
  result.tests.filter((entry) => !entry.passed).map((entry) => entry.name);

test("a task of an approved spec passes both tests", async (t) => {
  const w = await world(t);
  const result = await w.gate();
  assert.equal(result.given, true);
  assert.deepEqual(
    result.tests.map((entry) => [entry.name, entry.passed]),
    [
      ["approved", true],
      ["approver", true],
    ],
  );
});

test("each test failing alone gives given false and names that test with its reason", async (t) => {
  const byOther = await world(t, { author: OTHER });
  const approver = await byOther.gate();
  assert.equal(approver.given, false);
  assert.deepEqual(failed(approver), ["approver"]);
  assert.match(
    approver.tests[1].why ?? "",
    /someone@example\.com.*not an allowed approver/,
  );

  const unapproved = await world(t, { extraTask: "config.9.9" });
  const added = await unapproved.gate("config.9.9");
  assert.deepEqual(failed(added), ["approved", "approver"]);
  assert.match(
    added.tests[0].why ?? "",
    /config\.9\.9 is not in the approved revision/,
  );
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
  assert.match(intake.tests[0].why ?? "", /intake task/);
  const fix = await w.gate("fix-1");
  assert.ok(failed(fix).includes("approved"));
  assert.match(fix.tests[0].why ?? "", /not in an approved spec/);
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
    broken.tests[0].why ?? "",
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
  assert.match(throws.tests[1].why ?? "", /could not be read: no network/);
});

test("spec text and a .avoozl.json key that ask for context change nothing", async (t) => {
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
        "tasks.md": `- [ ] \`1.1\` Read\n  - It reads\n  - $${key}: yes\n`,
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
