// A private (plans branch) spec never projects into the mirror's public
// source repository. Synthetic specs and the fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { COMMIT, workspace } from "./radar-fixture.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";

const SOURCE = "example/code";
const MIRROR = "example/code-private";
const PLANS = "avoozl-plans";

const files = (title) => ({
  ...specFiles(),
  "tasks.md": `# Tasks\n\n- [ ] 1 Goal\n  - [ ] 1.1 ${title}\n`,
  "avoozl/manifest.json": JSON.stringify({
    tasks: {
      1: {
        kind: "package",
        summary: "Goal.",
        requires: ["1.1"],
        acceptance: ["Done."],
      },
      1.1: {
        kind: "leaf",
        summary: "Do the work.",
        acceptance: ["It works."],
        checks: ["npm test"],
        completion: "integrated",
      },
    },
  }),
});

// The mirror block sits on the entry named by `key`: the source (the usual
// shape, writes go to the mirror) or the mirror itself, where nothing maps
// the configured source to its mirror.
async function setup(t, key) {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    file = path.join(context.root, ".avoozl.json"),
    policy = JSON.parse(fs.readFileSync(file, "utf8")),
    entry = policy.github.repositories[SOURCE];
  entry.mirror = { source: SOURCE, mirror: MIRROR, plansBranch: PLANS };
  policy.github.repositories = { [key]: entry };
  fs.writeFileSync(file, JSON.stringify(policy));
  return context;
}

async function approve({ store, ops }, name, home) {
  const plan = await ops.execute("plan.create", {
    spec: name,
    prompt: name,
    context: { projectId: "code" },
  });
  store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
    state: "merged",
    commit: COMMIT,
    approvedBy: "octocat",
    ...(home === "plansBranch" ? { ref: PLANS } : {}),
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  return plan;
}

async function putPrivate(context, name, title) {
  for (const [file, text] of Object.entries(files(title)))
    context.github.files.set(`${PLANS}:.kiro/specs/${name}/${file}`, text);
  await context.ops.refreshPrivateSpecs();
}

test("a private spec is refused when its write target is the mirror's source", async (t) => {
  const context = await setup(t, MIRROR),
    { github, ops } = context;
  await putPrivate(context, "secret", "Rotate the hidden key");
  const plan = await approve(context, "secret", "plansBranch");
  assert.equal(plan.home, "plansBranch");
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    (error) =>
      error.status === 409 &&
      error.message.includes(SOURCE) &&
      error.message.includes(MIRROR),
  );
  assert.deepEqual(github.created, [], "no issue is created anywhere");
  assert.deepEqual(github.updated, []);
});

test("a private spec projects into the mirror", async (t) => {
  const context = await setup(t, SOURCE),
    { github, ops } = context;
  await putPrivate(context, "secret", "Rotate the hidden key");
  const plan = await approve(context, "secret", "plansBranch");
  await ops.execute("github.project", { planId: plan.id });
  assert.ok(github.created.length > 0);
  assert.ok(github.created.every((issue) => issue.repository === MIRROR));
});

test("a private spec projects when the mirror is the execution repository", async (t) => {
  const context = await setup(t, MIRROR),
    { github, ops, store } = context;
  store.remove("github_repositories", SOURCE);
  await ops.execute("github.configure", {
    repository: MIRROR,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  await putPrivate(context, "secret", "Rotate the hidden key");
  const plan = await approve(context, "secret", "plansBranch");
  await ops.execute("github.project", { planId: plan.id });
  assert.ok(github.created.length > 0);
  assert.ok(github.created.every((issue) => issue.repository === MIRROR));
});

test("github.configure refuses the source when its writes would not reach the mirror", async (t) => {
  const { ops } = await setup(t, MIRROR);
  await assert.rejects(
    ops.execute("github.configure", {
      repository: SOURCE,
      projectId: "code",
      allowedActors: ["maintainer"],
    }),
    (error) =>
      error.status === 409 &&
      error.message.includes(`Configure the mirror ${MIRROR}`) &&
      error.message.includes(PLANS),
  );
  // The usual shape, the mirror setting on the source's own entry, is kept.
  const done = await setup(t, SOURCE);
  await done.ops.execute("github.configure", {
    repository: SOURCE,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  assert.ok(done.store.get("github_repositories", SOURCE));
});

test("a public spec still projects with the source as its target", async (t) => {
  const context = await setup(t, MIRROR),
    { github, ops } = context;
  writeSpec(context.root, "pubspec", files("Ship the public change"));
  const plan = await approve(context, "pubspec", "main");
  assert.equal(plan.home, "main");
  await ops.execute("github.project", { planId: plan.id });
  assert.ok(github.created.length > 0);
  assert.ok(github.created.every((issue) => issue.repository === SOURCE));
});
