// Qualified working heads, fork checkpoints and verified integration (task
// 56.3). Every repository here is a local scratch repository: an upstream,
// two forks and the driver's checkout. Nothing reaches GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "../git.mjs";
import { appendRecord, localJournal, replayJournal } from "../spec-journal.mjs";
import {
  checkpointBranch,
  checkpointTask,
  discoverFromJournal,
  discoverFromPullRequest,
  ensureWorkingBranch,
  fetchExact,
  integrateVerified,
  integrationRef,
  landingRights,
  opaqueId,
  pushHead,
  qualifiedRef,
  recoverWorkingHeads,
  refKey,
  retainVerified,
  sourceRegistry,
  verifiedEvidence,
  verifyRelationship,
  withoutPushCredentials,
  workingBranch,
} from "../working-heads.mjs";

// Made-up names only.
const MACHINE = { hostname: "made-up-host", username: "madeupuser" };
const SPEC = opaqueId("example-spec");

async function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-heads-"));
  t.after(() =>
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    }),
  );
  const at = (name) => path.join(root, name);
  const identity = async (dir) => {
    await git(dir, ["config", "user.name", "Fixture"]);
    await git(dir, ["config", "user.email", "fixture@example.invalid"]);
  };
  // The upstream with one commit on main.
  const seed = at("seed");
  fs.mkdirSync(seed);
  await git(seed, ["init", "-q", "-b", "main"]);
  await identity(seed);
  fs.writeFileSync(path.join(seed, "app.txt"), "one\n");
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-q", "-m", "Start"]);
  await git(root, ["clone", "-q", "--bare", seed, at("upstream.git")]);
  // Two forks, each a copy of upstream, and the driver's checkout.
  await git(root, [
    "clone",
    "-q",
    "--bare",
    at("upstream.git"),
    at("alice.git"),
  ]);
  await git(root, ["clone", "-q", "--bare", at("upstream.git"), at("bob.git")]);
  await git(root, ["clone", "-q", at("upstream.git"), at("driver")]);
  const driver = at("driver");
  await identity(driver);
  const base = await git(driver, ["rev-parse", "HEAD"]);
  const registry = sourceRegistry({
    "acme/app": { url: at("upstream.git") },
    "alice/app": { url: at("alice.git"), parent: "acme/app" },
    "bob/app": { url: at("bob.git"), parent: "acme/app" },
  });
  // A contributor's own clone of a fork, to push work there as a person.
  const contributor = async (name, fork) => {
    const dir = at(name);
    await git(root, ["clone", "-q", at(fork), dir]);
    await identity(dir);
    return dir;
  };
  const commit = async (dir, file, text, message = `Change ${file}`) => {
    fs.writeFileSync(path.join(dir, file), text);
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-q", "-m", message]);
    return git(dir, ["rev-parse", "HEAD"]);
  };
  const config = at("machine.json");
  return { root, at, driver, base, registry, contributor, commit, config };
}

const target = { repository: "acme/app", base: "main" };
const passed = (commit) => ({
  commit,
  checks: [{ name: "npm test", exitCode: 0 }],
  paths: { outside: [], protected: [] },
});
const ref = (repository, branch, commit) =>
  qualifiedRef({ source: { repository, branch, commit }, target });

test("a reference names source and target exactly; a branch name is no identity", () => {
  const sha = "a".repeat(40),
    alice = ref("alice/app", "feature", sha),
    bob = ref("bob/app", "feature", sha);
  assert.notEqual(refKey(alice), refKey(bob));
  assert.equal(refKey(alice), refKey(ref("Alice/App", "feature", sha)));
  for (const repository of [
    "https://github.com/acme/app",
    "/srv/repos/app",
    "acme/app; rm -x",
    "../app",
  ])
    assert.throws(() => ref(repository, "feature", sha), /owner\/name/);
  assert.throws(() => ref("acme/app", "--upload-pack=x", sha), /branch/);
  assert.throws(() => ref("acme/app", "feature", "abc1234"), /exact/);
  // A legacy epic integration branch takes the same shape.
  assert.deepEqual(
    integrationRef({
      repository: "acme/app",
      branch: "rewrite/x",
      commit: sha,
      base: "main",
    }).target,
    target,
  );
  assert.match(workingBranch(SPEC), /^avoozl\/[0-9a-f]{16}\/work$/);
  assert.throws(() => workingBranch("a/../b"), /letters/);
});

test("only trusted setup registers a source; a PR or record cannot add one", async () => {
  const registry = sourceRegistry({ "acme/app": { url: "/x" } });
  assert.throws(() => registry.get("mallory/app"), /not a registered/);
  assert.throws(
    () => sourceRegistry({ "acme/app": { url: "--upload-pack=x" } }),
    /fetch location/,
  );
  const github = {
    pullRequest: async () => ({
      head: {
        repo: { full_name: "alice/app" },
        ref: "feature",
        sha: "b".repeat(40),
      },
      base: { repo: { full_name: "acme/app" }, ref: "main" },
    }),
  };
  const found = await discoverFromPullRequest(github, "acme/app", 7);
  assert.equal(found.state, "found");
  assert.deepEqual(found.ref.source, {
    repository: "alice/app",
    branch: "feature",
    commit: "b".repeat(40),
  });
  assert.equal(found.ref.pr, 7);
  // The PR names a fork, but fetching it still needs registration.
  await assert.rejects(
    verifyRelationship(null, found.ref, registry),
    /not a registered/,
  );
  // A deleted fork leaves the PR without a head repository: held, not done.
  const gone = await discoverFromPullRequest(
    { pullRequest: async () => ({ head: { repo: null }, base: {} }) },
    "acme/app",
    8,
  );
  assert.equal(gone.state, "unavailable");
});

test("relationships: same repository, registered fork, GitHub fork, else refused", async () => {
  const registry = sourceRegistry({
      "acme/app": { url: "/u" },
      "alice/app": { url: "/a", parent: "acme/app" },
      "carol/app": { url: "/c" },
      "dave/app": { url: "/d" },
    }),
    sha = "c".repeat(40),
    github = {
      repository: async (name) =>
        name === "carol/app"
          ? { fork: true, parent: { full_name: "acme/app" } }
          : { fork: false },
    };
  assert.equal(
    await verifyRelationship(github, ref("acme/app", "x", sha), registry),
    "same",
  );
  assert.equal(
    await verifyRelationship(github, ref("alice/app", "x", sha), registry),
    "fork",
  );
  assert.equal(
    await verifyRelationship(github, ref("carol/app", "x", sha), registry),
    "fork",
  );
  await assert.rejects(
    verifyRelationship(github, ref("dave/app", "x", sha), registry),
    /not acme\/app or a fork/,
  );
});

test("a fork checkpoint is fetched by exact commit; moves, rewrites and deletion hold", async (t) => {
  const s = await scratch(t),
    alice = await s.contributor("alice", "alice.git"),
    first = await s.commit(alice, "a.txt", "a\n");
  await git(alice, ["push", "-q", "origin", "HEAD:refs/heads/feature"]);
  const named = ref("alice/app", "feature", first);
  assert.equal((await fetchExact(s.driver, named, s.registry)).state, "exact");
  await retainVerified(s.driver, SPEC, named);
  // The owner adds work: the newer head is only a checkpoint.
  const second = await s.commit(alice, "a.txt", "a2\n");
  await git(alice, ["push", "-q", "origin", "HEAD:refs/heads/feature"]);
  const moved = await fetchExact(s.driver, named, s.registry);
  assert.equal(moved.state, "advanced");
  assert.equal(moved.head, second);
  // The owner rewrites the branch (a person's force push in their own fork).
  await git(alice, ["reset", "-q", "--hard", s.base]);
  await s.commit(alice, "other.txt", "x\n");
  await git(alice, [
    "push",
    "-q",
    "--force",
    "origin",
    "HEAD:refs/heads/feature",
  ]);
  const rewritten = await fetchExact(s.driver, named, s.registry);
  assert.equal(rewritten.state, "rewritten");
  assert.equal(rewritten.retained, true);
  // The fork is deleted: unavailable, and the verified commit is still here.
  fs.rmSync(s.at("alice.git"), { recursive: true, force: true });
  const deleted = await fetchExact(s.driver, named, s.registry);
  assert.equal(deleted.state, "unavailable");
  assert.equal(deleted.retained, true);
  assert.equal(await git(s.driver, ["cat-file", "-t", first]), "commit");
});

test("two forks with the same branch name stay two results", async (t) => {
  const s = await scratch(t),
    alice = await s.contributor("alice", "alice.git"),
    bob = await s.contributor("bob", "bob.git"),
    a = await s.commit(alice, "a.txt", "alice\n"),
    b = await s.commit(bob, "b.txt", "bob\n");
  await git(alice, ["push", "-q", "origin", "HEAD:refs/heads/feature"]);
  await git(bob, ["push", "-q", "origin", "HEAD:refs/heads/feature"]);
  const fromAlice = await fetchExact(
      s.driver,
      ref("alice/app", "feature", a),
      s.registry,
    ),
    fromBob = await fetchExact(
      s.driver,
      ref("bob/app", "feature", b),
      s.registry,
    );
  assert.equal(fromAlice.state, "exact");
  assert.equal(fromBob.state, "exact");
  assert.notEqual(fromAlice.head, fromBob.head);
  // Bob's commit under Alice's name is not Alice's head.
  const crossed = await fetchExact(
    s.driver,
    ref("alice/app", "feature", b),
    s.registry,
  );
  assert.notEqual(crossed.state, "exact");
});

test("only verified commits enter the working branch, one at a time", async (t) => {
  const s = await scratch(t),
    { ref: working } = await ensureWorkingBranch(s.driver, {
      spec: SPEC,
      repository: "acme/app",
      target,
      baseCommit: s.base,
    });
  assert.equal(working.source.branch, workingBranch(SPEC));
  assert.equal(working.source.commit, s.base);
  // Unfinished work goes to the task's checkpoint ref only.
  await git(s.driver, ["checkout", "-q", "-b", "task-one", s.base]);
  const unfinished = await s.commit(s.driver, "one.txt", "draft\n");
  const point = await checkpointTask(s.driver, {
    spec: SPEC,
    task: "t1",
    commit: unfinished,
  });
  assert.equal(point.branch, checkpointBranch(SPEC, "t1"));
  await assert.rejects(
    integrateVerified(s.driver, {
      spec: SPEC,
      task: "t1",
      commit: unfinished,
      evidence: { commit: unfinished, checks: [] },
    }),
    /not verified/,
  );
  await assert.rejects(
    integrateVerified(s.driver, {
      spec: SPEC,
      task: "t1",
      commit: unfinished,
      evidence: passed("f".repeat(40)),
    }),
    /exact commit/,
  );
  const workHead = () =>
    git(s.driver, ["rev-parse", `refs/heads/${workingBranch(SPEC)}`]);
  assert.equal(await workHead(), s.base);
  // The task passes at a later commit; that exact commit is integrated.
  const done = await s.commit(s.driver, "one.txt", "done\n");
  await checkpointTask(s.driver, { spec: SPEC, task: "t1", commit: done });
  // A checkpoint never moves backward.
  await assert.rejects(
    checkpointTask(s.driver, { spec: SPEC, task: "t1", commit: s.base }),
    /never rewrites/,
  );
  // Two more tasks verified at once: integrations run serially, none lost.
  await git(s.driver, ["checkout", "-q", "-b", "task-two", s.base]);
  const two = await s.commit(s.driver, "two.txt", "two\n");
  await git(s.driver, ["checkout", "-q", "-b", "task-three", s.base]);
  const three = await s.commit(s.driver, "three.txt", "three\n");
  const results = await Promise.all(
    [
      ["t1", done],
      ["t2", two],
      ["t3", three],
    ].map(([task, commit]) =>
      integrateVerified(s.driver, {
        spec: SPEC,
        task,
        commit,
        evidence: passed(commit),
      }),
    ),
  );
  assert.ok(results.every((result) => result.integrated));
  const head = await workHead();
  for (const commit of [done, two, three])
    await git(s.driver, ["merge-base", "--is-ancestor", commit, head]);
  // A retry of an integrated commit changes nothing.
  const again = await integrateVerified(s.driver, {
    spec: SPEC,
    task: "t2",
    commit: two,
    evidence: passed(two),
  });
  assert.equal(again.integrated, false);
  assert.equal(await workHead(), head);
  // A conflict is refused and the working branch stays where it was.
  await git(s.driver, ["checkout", "-q", "-b", "task-four", s.base]);
  const four = await s.commit(s.driver, "two.txt", "clash\n");
  await assert.rejects(
    integrateVerified(s.driver, {
      spec: SPEC,
      task: "t4",
      commit: four,
      evidence: passed(four),
    }),
    /conflicts with .* in two\.txt/,
  );
  assert.equal(await workHead(), head);
  assert.equal(verifiedEvidence(passed(four), four), null);
});

test("a fork contributor checkpoints with no upstream copy and no upstream write", async (t) => {
  const s = await scratch(t);
  await git(s.driver, ["checkout", "-q", "-b", "task-one", s.base]);
  const work = await s.commit(s.driver, "one.txt", "work\n"),
    branch = checkpointBranch(SPEC, "t1");
  const pushed = await pushHead(
    s.driver,
    { repository: "alice/app", branch, commit: work },
    s.registry,
    { since: s.base, machine: MACHINE, configFile: s.config },
  );
  assert.equal(pushed.pushed, true);
  assert.match(
    await git(s.root, ["ls-remote", "--heads", s.at("alice.git"), branch]),
    new RegExp(work),
  );
  // Nothing was copied upstream.
  assert.equal(
    await git(s.root, [
      "ls-remote",
      "--heads",
      s.at("upstream.git"),
      "avoozl/*",
    ]),
    "",
  );
  // A retry pushes nothing; a rewrite is refused by git, never forced.
  const again = await pushHead(
    s.driver,
    { repository: "alice/app", branch, commit: work },
    s.registry,
    { since: s.base, machine: MACHINE, configFile: s.config },
  );
  assert.equal(again.pushed, false);
  await git(s.driver, ["checkout", "-q", "-b", "other", s.base]);
  const other = await s.commit(s.driver, "x.txt", "x\n");
  await assert.rejects(
    pushHead(
      s.driver,
      { repository: "alice/app", branch, commit: other },
      s.registry,
      { since: s.base, machine: MACHINE, configFile: s.config },
    ),
    /Nothing was forced/,
  );
  // Source push rights and target merge rights are separate.
  const github = {
    permission: async (repository) => ({
      permission: repository === "alice/app" ? "admin" : "read",
    }),
  };
  assert.deepEqual(
    await landingRights(github, ref("alice/app", branch, work), "alice"),
    { checkpoint: true, land: "observe" },
  );
  assert.deepEqual(
    await landingRights(
      { permission: async () => ({ permission: "maintain" }) },
      ref("alice/app", branch, work),
      "maintainer",
    ),
    { checkpoint: true, land: "merge" },
  );
});

test("the content scan refuses a checkpoint before it is pushed", async (t) => {
  const s = await scratch(t);
  await git(s.driver, ["checkout", "-q", "-b", "task-one", s.base]);
  const leaky = await s.commit(
      s.driver,
      "one.txt",
      "fine\n",
      `Ran on ${MACHINE.hostname}`,
    ),
    branch = checkpointBranch(SPEC, "t1");
  await assert.rejects(
    pushHead(
      s.driver,
      { repository: "alice/app", branch, commit: leaky },
      s.registry,
      { since: s.base, machine: MACHINE, configFile: s.config },
    ),
    /content scan refused this push, nothing was pushed: rule machine-name/,
  );
  // A made-up username in a ref name is refused too.
  await assert.rejects(
    pushHead(
      s.driver,
      {
        repository: "alice/app",
        branch: `${MACHINE.username}/work`,
        commit: s.base,
      },
      s.registry,
      { since: s.base, machine: MACHINE, configFile: s.config },
    ),
    /content scan refused/,
  );
  assert.equal(
    await git(s.root, ["ls-remote", "--heads", s.at("alice.git"), "avoozl/*"]),
    "",
  );
});

test("after the database is lost, working heads come back held from the journal and git", async (t) => {
  const s = await scratch(t),
    alice = await s.contributor("alice", "alice.git"),
    work = await s.commit(alice, "a.txt", "a\n");
  await git(alice, ["push", "-q", "origin", "HEAD:refs/heads/feature"]);
  const named = ref("alice/app", "feature", work);
  assert.equal((await fetchExact(s.driver, named, s.registry)).state, "exact");
  await retainVerified(s.driver, SPEC, named);
  // The driver publishes the pre-PR head on the spec's journal.
  const file = s.at("journal.jsonl"),
    journal = localJournal(file, "owner"),
    options = {
      visibility: "private",
      machine: MACHINE,
      configFile: s.config,
    };
  await appendRecord(
    journal,
    {
      op: "checkpoint-1",
      kind: "checkpoint",
      spec: "example-spec",
      refs: [{ repository: "alice/app", branch: "feature", commit: work }],
    },
    options,
  );
  // Someone without write access adds a record naming another repository.
  fs.appendFileSync(
    file,
    JSON.stringify({
      id: 99,
      author: "stranger",
      body:
        '<!-- avoozl-journal:v1 {"generation":0,"kind":"checkpoint","op":"x","prev":null,"refs":[{"branch":"evil","commit":"' +
        "d".repeat(40) +
        '","repository":"mallory/app"}],"spec":"example-spec","v":1} -->',
    }) + "\n",
  );
  // The database is gone and the fork too; only the journal and git remain.
  fs.rmSync(s.at("alice.git"), { recursive: true, force: true });
  const replay = await replayJournal(await journal.list(), {
    permission: journal.permission,
    visibility: "private",
  });
  const recovered = await recoverWorkingHeads(s.driver, replay, {
    spec: SPEC,
    target: "acme/app",
    base: "main",
  });
  assert.equal(recovered.held, true);
  assert.equal(recovered.heads.length, 1);
  assert.equal(recovered.heads[0].source.repository, "alice/app");
  assert.equal(recovered.heads[0].source.commit, work);
  assert.equal(recovered.heads[0].retained, true);
  // A held journal yields nothing to recover from.
  assert.deepEqual(discoverFromJournal({ held: true, records: [] }, target), {
    held: true,
    refs: [],
  });
});

test("agents never receive push credentials", () => {
  const env = withoutPushCredentials({
    PATH: "/bin",
    HOME: "/tmp/home",
    GH_TOKEN: "x",
    GITHUB_TOKEN: "x",
    AVOOZL_GITHUB_TOKEN: "x",
    GIT_ASKPASS: "x",
    SSH_AUTH_SOCK: "x",
    GIT_SSH_COMMAND: "x",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "x",
  });
  assert.deepEqual(Object.keys(env).sort(), [
    "GIT_TERMINAL_PROMPT",
    "HOME",
    "PATH",
  ]);
});
