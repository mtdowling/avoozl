// Kiro Crew chat workers (epic-context ec-2.5): a chat that passes the
// tests gets the skills and reads named in its brief and no MCP server, and
// its binding reads "brief only"; one that fails gets a brief with no
// epic context section.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { chatBrief } from "../epic-context.mjs";
import { approverCheck } from "../../git/git-approvals.mjs";
import { bindSession } from "../../sessions/session-bindings.mjs";
import { listActivity } from "../../store/activity-log.mjs";
import { contextMachine } from "../../context/test/context-fixture.mjs";
import { seedApproval, unapprove } from "../../test/epic-context-seed.mjs";
import { keepKiroCrewHome } from "../../executors/test/epic-context-world.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { OWNER, specCheckout } from "../../test/spec-checkout.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";

const TASK = "config.1.1";

async function world(t) {
  const r = specCheckout(),
    { store } = fixture(t),
    ctx = contextMachine({
      approve: false,
      edit: (manifest) => {
        delete manifest.context.contentSets;
        return manifest;
      },
    });
  ctx.approve();
  keepKiroCrewHome(t, ctx.root);
  writeSpec(r.root, "config");
  r.run(["add", "-A"]);
  r.run(["commit", "-q", "-m", "Spec"]);
  store.put("repositories", {
    id: "app",
    github: "acme/widgets",
    root: r.root,
  });
  await seedApproval(store, {
    root: r.root,
    tasks: [{ id: TASK, repository: "app" }],
  });
  const ops = {
    configDirectory: path.join(ctx.root, "config"),
    workspaceRoot: r.root,
    pluginOptions: ctx.options,
    approvalCheckout: async () => r.root,
    approverOf: async () =>
      approverCheck({
        repository: { allowedActors: [OWNER] },
        trust: "branch-protection",
      }),
  };
  return { r, store, ctx, ops };
}

const entry = { task: TASK, role: "worker", attempt: 1, executor: "kirocrew" };

test("a passing chat worker's brief names its skills and reads and no MCP server", async (t) => {
  const w = await world(t);
  const section = await chatBrief(w.store, w.ops, entry);
  assert.match(section, /^## Epic context/);
  assert.match(section, /module-layout: How the team lays out a module/);
  assert.ok(
    section.includes(
      path.join(w.ctx.folder, "skills", "module-layout", "SKILL.md"),
    ),
  );
  assert.match(section, /The team's design notes/);
  assert.doesNotMatch(section, /MCP|research/);
  // The binding reads "brief only"; the row's chip and Activity follow it.
  const { binding } = bindSession(w.store, {
    slot: "chat-1",
    taskId: TASK,
    role: "worker",
    executor: "kirocrew",
  });
  assert.equal(binding.epicContext.mode, "brief only");
  assert.deepEqual(
    binding.epicContext.tests.map((x) => x.passed),
    [true, true],
  );
  const row = listActivity(w.store).items.find(
    (i) => i.kind === "epic-context.session",
  );
  assert.match(row.summary, /skill module-layout/);
  // The tick plans the same start again: one row per attempt.
  await chatBrief(w.store, w.ops, entry);
  assert.equal(
    listActivity(w.store).items.filter((i) => i.kind === "epic-context.session")
      .length,
    1,
  );
});

test("a failing chat worker's brief has no epic context section and its binding no context", async (t) => {
  const w = await world(t);
  unapprove(w.store);
  assert.equal(await chatBrief(w.store, w.ops, entry), "");
  const { binding } = bindSession(w.store, {
    slot: "chat-2",
    taskId: TASK,
    role: "worker",
    executor: "kirocrew",
  });
  assert.equal(binding.epicContext, undefined);
  // A repository no source names writes no row at all.
  w.store.put("repositories", {
    id: "app",
    github: "other/repo",
    root: w.r.root,
  });
  const before = listActivity(w.store).items.length;
  assert.equal(await chatBrief(w.store, w.ops, { ...entry, attempt: 2 }), "");
  assert.equal(listActivity(w.store).items.length, before);
});

test("only a worker's brief is asked", async (t) => {
  const w = await world(t);
  assert.equal(
    await chatBrief(w.store, w.ops, { ...entry, role: "verifier" }),
    "",
  );
  assert.equal(await chatBrief(w.store, null, entry), "");
});
