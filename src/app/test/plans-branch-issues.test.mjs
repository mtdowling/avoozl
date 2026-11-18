// rc-24.5: issues from public and private plans in one mirror, with edges
// across homes (RC25.7 to RC25.10, design D30.6). Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { COMMIT, workspace } from "./radar-fixture.mjs";
import { specFiles, withFacts, writeSpec } from "./spec-fixture.mjs";

const MIRROR = "example/code-private";
const PLANS = "avoozl-plans";
const SECRET_TITLE = "Rotate the hidden signing key";

const manifest = (requires, unblocks) =>
  JSON.stringify({
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
        ...(requires ? { requires: [requires] } : {}),
        ...(unblocks ? { unblocks: [unblocks] } : {}),
        acceptance: ["It works."],
        checks: ["npm test"],
        completion: "integrated",
      },
    },
  });
const files = (title, requires, unblocks) =>
  withFacts({
  ...specFiles(),
  "tasks.md": `# Tasks\n\n- [ ] 1 Goal\n  - [ ] 1.1 ${title}\n`,
  "avoozl/manifest.json": manifest(requires, unblocks),
  });

async function setup(t) {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    file = path.join(context.root, ".avoozl.json"),
    policy = JSON.parse(fs.readFileSync(file, "utf8"));
  policy.github.repositories["example/code"].mirror = {
    source: "example/code",
    mirror: MIRROR,
    plansBranch: PLANS,
  };
  fs.writeFileSync(file, JSON.stringify(policy));
  return context;
}

// Approve a spec as the merged approval pull request would have.
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

const putPublic = (context, name, title, requires) =>
  writeSpec(context.root, name, files(title, requires));
async function putPrivate(context, name, title, requires, unblocks) {
  for (const [file, text] of Object.entries(files(title, requires, unblocks)))
    context.github.files.set(`${PLANS}:.kiro/specs/${name}/${file}`, text);
  await context.ops.refreshPrivateSpecs();
}
const issueFor = (github, id) =>
  github.created.find((issue) => issue.body.includes(`"taskId":"${id}"`));

function checkContainment(github) {
  assert.ok(github.created.length > 0);
  assert.ok(
    github.created.every((issue) => issue.repository === MIRROR),
    "every issue is written in the mirror",
  );
  assert.ok(
    github.updated.every(
      (update) => !/example\/code$/.test(update.repository ?? ""),
    ),
    "nothing is updated on the source",
  );
}

test("a public task waits on a private task: both issues are in the mirror and the public one names nothing private", async (t) => {
  const context = await setup(t),
    { github, ops } = context;
  await putPrivate(context, "secret", SECRET_TITLE, null, "pubspec.1.1");
  putPublic(context, "pubspec", "Ship the public change");
  const hidden = await approve(context, "secret", "plansBranch"),
    open = await approve(context, "pubspec", "main");
  assert.equal(hidden.home, "plansBranch");
  await ops.execute("github.project", { planId: hidden.id });
  await ops.execute("github.project", { planId: open.id });
  checkContainment(github);

  const priv = issueFor(github, "secret.1.1"),
    pub = issueFor(github, "pubspec.1.1");
  assert.match(pub.body, /^Waits on a private task\.$/m);
  for (const text of [SECRET_TITLE, "secret", PLANS])
    assert.ok(!pub.body.includes(text), `public issue holds no "${text}"`);
  // The blocked-by link GitHub holds stays in the mirror.
  const key = `${MIRROR}#${pub.number}`;
  assert.deepEqual(
    [...github.blockers.get(key).values()].map((blocker) => blocker.number),
    [priv.number],
  );
});

test("a private task waits on a public task, and its issue may name it", async (t) => {
  const context = await setup(t),
    { github, ops } = context;
  putPublic(context, "pubspec", "Ship the public change");
  await putPrivate(context, "secret", SECRET_TITLE, "pubspec.1.1");
  const open = await approve(context, "pubspec", "main"),
    hidden = await approve(context, "secret", "plansBranch");
  await ops.execute("github.project", { planId: open.id });
  await ops.execute("github.project", { planId: hidden.id });
  checkContainment(github);

  const pub = issueFor(github, "pubspec.1.1"),
    priv = issueFor(github, "secret.1.1");
  assert.doesNotMatch(pub.body, /Waits on a private task/);
  assert.match(priv.body, /- pubspec\.1\.1/);
  const key = `${MIRROR}#${priv.number}`;
  assert.deepEqual(
    [...github.blockers.get(key).values()].map((blocker) => blocker.number),
    [pub.number],
  );
});

test("a public spec that names a private task is refused at approval", async (t) => {
  const context = await setup(t),
    { github } = context;
  await putPrivate(context, "secret", SECRET_TITLE);
  putPublic(context, "pubspec", "Ship the public change", "secret.1.1");
  await approve(context, "secret", "plansBranch");
  await assert.rejects(
    approve(context, "pubspec", "main"),
    /names private tasks \(secret\.1\.1\)/,
  );
  assert.ok(!github.created.some((issue) => issue.body.includes("pubspec")));
});
