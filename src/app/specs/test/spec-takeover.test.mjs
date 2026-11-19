// Take over writes the spec journal's generation (task 42.5).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { driverState } from "../../workers/driver-generations.mjs";
import { replayJournal } from "../spec-journal.mjs";
import { localJournalFile } from "../spec-publication.mjs";
import { driverIdOf, revalidateSpecs } from "../spec-scheduler.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { FakeGitHub } from "../../test/fake-github.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = "example/code";

async function workspace(t, { github = null } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_testtesttesttest",
      github: github
        ? {
            mode: "single-repo",
            repositories: { [REPOSITORY]: { baseBranch: "main" } },
          }
        : { mode: "local" },
    }),
  );
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
    driver: { settingsFile: path.join(temporaryDirectory(), "driver.json") },
  });
  store.put("repositories", {
    id: "code",
    root,
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  if (github)
    await ops.execute("github.configure", {
      repository: REPOSITORY,
      repositoryId: "code",
      allowedActors: ["maintainer"],
    });
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { repositoryId: "code" },
  });
  return { store, root, ops, plan };
}

test("take over needs a published journal, is person-only, and writes one generation", async (t) => {
  const w = await workspace(t);
  await assert.rejects(
    w.ops.execute("spec.takeover", { planId: w.plan.id }),
    /Publish the spec first/,
  );
  await w.ops.execute("spec.publish", { planId: w.plan.id });
  await assert.rejects(
    w.ops.execute("spec.takeover", { planId: w.plan.id }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  const first = await w.ops.execute("spec.takeover", { planId: w.plan.id });
  assert.equal(first.ok, true);
  assert.equal(first.existing, false);
  assert.equal(first.generation, 1);
  assert.equal(driverIdOf(w.store, w.plan.id), first.driver);

  const file = localJournalFile(w.root, w.plan.id),
    lines = () => fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  assert.equal(lines().length, 1);
  // A retry while this workspace drives writes nothing.
  const again = await w.ops.execute("spec.takeover", { planId: w.plan.id });
  assert.deepEqual(
    { existing: again.existing, driver: again.driver },
    { existing: true, driver: first.driver },
  );
  assert.equal(lines().length, 1);
  const state = driverState(
    await replayJournal(
      lines().map((line) => JSON.parse(line)),
      { permission: async () => "admin", visibility: "private" },
    ),
  );
  assert.equal(state.driver, first.driver);
  // Dispatch here is not displaced by its own generation.
  const held = await revalidateSpecs(w.store, {
    workspaceRoot: w.root,
    planIds: [w.plan.id],
  });
  assert.equal(held.plans.size, 0);
});

test("a GitHub journal is taken over only by the spec issue's single assignee", async (t) => {
  const github = new FakeGitHub();
  github.login = "maintainer";
  github.permissions.set("maintainer", "admin");
  const w = await workspace(t, { github });
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  await assert.rejects(
    w.ops.execute("spec.takeover", { planId: w.plan.id }),
    /no assignee/,
  );
  await github.addAssignees(REPOSITORY, published.number, ["someone"]);
  await assert.rejects(
    w.ops.execute("spec.takeover", { planId: w.plan.id }),
    /Only someone/,
  );
  await github.addAssignees(REPOSITORY, published.number, ["maintainer"]);
  const result = await w.ops.execute("spec.takeover", { planId: w.plan.id });
  assert.equal(result.ok, true);
  assert.equal(driverIdOf(w.store, w.plan.id), result.driver);
  assert.equal(
    github.comments.filter((c) => c.number === published.number).length,
    1,
  );
});

test("a public-home spec is taken over with opaque IDs and replays to its own", async (t) => {
  const github = new FakeGitHub();
  github.login = "maintainer";
  github.permissions.set("maintainer", "admin");
  const repository = github.repository.bind(github);
  github.repository = async (value) => ({
    ...(await repository(value)),
    private: false,
  });
  const w = await workspace(t, { github });
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  await github.addAssignees(REPOSITORY, published.number, ["maintainer"]);
  const result = await w.ops.execute("spec.takeover", { planId: w.plan.id });
  assert.equal(result.ok, true);
  const bodies = github.comments
    .filter((c) => c.number === published.number)
    .map((c) => c.body);
  assert.equal(bodies.length, 1);
  // No readable spec or task ID reaches the public journal.
  const taskIds = w.store
    .read()
    .tasks.filter((task) => task.planId === w.plan.id)
    .map((task) => task.id);
  for (const name of [w.plan.id, ...taskIds])
    assert.ok(!bodies[0].includes(name), name);
  // A retry replays the opaque record back to this spec: nothing new.
  const again = await w.ops.execute("spec.takeover", { planId: w.plan.id });
  assert.equal(again.existing, true);
  const held = await revalidateSpecs(w.store, {
    github,
    workspaceRoot: w.root,
    planIds: [w.plan.id],
  });
  assert.equal(held.plans.size, 0);
});
