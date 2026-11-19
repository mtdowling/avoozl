// A private (plans branch) spec never projects into the mirror's public
// source repository. Synthetic specs and the fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { COMMIT, workspace } from "./radar-fixture.mjs";
import { specFiles, withFacts } from "./spec-fixture.mjs";

const SOURCE = "example/code";
const MIRROR = "example/code-private";
const PLANS = "avoozl-plans";

const files = (title) =>
  withFacts({
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
    context: { repositoryId: "code" },
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

test("github.configure refuses the source when its writes would not reach the mirror", async (t) => {
  const { ops } = await setup(t, MIRROR);
  await assert.rejects(
    ops.execute("github.configure", {
      repository: SOURCE,
      repositoryId: "code",
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
    repositoryId: "code",
    allowedActors: ["maintainer"],
  });
  assert.ok(done.store.get("github_repositories", SOURCE));
});
