// rc-24.4: the plans branch never leaves the mirror (RC25.6, design D30.5).
// Fake GitHub and local scratch repositories only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { blockReason, forwardGuard, plansBlocks } from "../forward-guard.mjs";
import { mirrorSyncStep } from "../mirror-sync.mjs";
import { forwardRecord } from "../mirror-forward-run.mjs";
import { plansBranchFacts } from "../plans-facts.mjs";
import { fixture } from "./fixtures.mjs";
import { fakeGitHub, grant, policy, scratch } from "./forward-scratch.mjs";

const PLANS = "avoozl-plans";
const HEAD = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const mirror = { plansBranch: PLANS };
const facts = { specNames: ["pay-fix"], commits: [HEAD] };
const change = (over = {}) => ({
  paths: ["src/a.js"],
  message: "Add a",
  branch: "avoozl/task-1",
  title: "Add a",
  body: "Adds a.",
  ...over,
});
const rules = (blocks) => blocks.map((b) => `${b.rule} in ${b.place}`);
const blocksOf = (over, m = mirror) =>
  rules(plansBlocks(change(over), m, facts));

test("the plans branch name, a private spec path and a plans commit each block, naming the rule", () => {
  assert.deepEqual(blocksOf({}), []);
  assert.deepEqual(blocksOf({ body: "Moved from avoozl-plans." }), [
    "plans-branch-name in body",
  ]);
  assert.deepEqual(blocksOf({ title: "See AVOOZL-PLANS" }), [
    "plans-branch-name in title",
  ]);
  assert.deepEqual(blocksOf({ branch: "from-avoozl-plans" }), [
    "plans-branch-name in branch name",
  ]);
  assert.deepEqual(blocksOf({ message: "Per .kiro/specs/pay-fix/design.md" }), [
    "plans-spec-path in commit message",
  ]);
  assert.deepEqual(blocksOf({ paths: [".kiro/specs/pay-fix/tasks.md"] }), [
    "plans-spec-path in file 1",
  ]);
  assert.deepEqual(blocksOf({ body: "Based on a1b2c3d." }), [
    "plans-commit in body",
  ]);
  // A short hex word that is not a prefix of the plans commit passes.
  assert.deepEqual(blocksOf({ body: "Fixes deadbeef." }), []);
  // No plans branch set: nothing to name.
  assert.deepEqual(blocksOf({ body: PLANS }, {}), []);
});

test("the guard reports the plans rule as a leak scan block and never the text", () => {
  const person = { name: "d", email: "d@x.test" },
    meta = {
      parents: ["b"],
      author: person,
      committer: person,
      message: "Add a",
    };
  const verdict = forwardGuard(
    {
      ...change({ body: "From avoozl-plans" }),
      files: [],
      meta,
      expect: {
        base: "b",
        person: "d",
        email: "d@x.test",
        mirror: "m/m",
        sha: "c",
      },
    },
    { mirror, plans: facts },
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.protection, "leak scan");
  assert.match(blockReason(verdict), /plans-branch-name in body/);
  assert.doesNotMatch(blockReason(verdict), /From avoozl-plans/);
});

const forward = (t, body, plansFacts) => {
  const made = scratch(t),
    github = fakeGitHub({ body });
  return forwardRecord(made.store, github, made.sha, {
    policy: policy("nudge", { plansBranch: PLANS }),
    person: "dana",
    git: made.forward,
    grant,
    plansFacts,
  }).then((result) => ({ ...made, github, result }));
};
const pushed = (commands) => commands.filter((c) => / push /.test(` ${c}`));

test("a planted plans branch name blocks the forward with one row and pushes nothing", async (t) => {
  const { result, commands, github } = await forward(
    t,
    `Copied from ${PLANS}.`,
    async () => facts,
  );
  assert.equal(result.blocked, true);
  assert.match(result.reason, /leak scan blocked/);
  assert.match(result.reason, /plans-branch-name in body/);
  assert.equal(github.created.length, 0);
  assert.equal(pushed(commands).length, 0);
});

test("a plans branch that cannot be read blocks the forward", async (t) => {
  const { result, commands } = await forward(t, "Adds it.", async () => {
    throw new Error("offline");
  });
  assert.equal(result.blocked, true);
  assert.match(result.reason, /plans branch could not be read/);
  assert.equal(pushed(commands).length, 0);
});

test("a clean forward fetches the default branch and one commit, and sends one refspec", async (t) => {
  const { result, commands } = await forward(t, "Adds it.", async () => facts);
  assert.equal(result.record.state, "public_open");
  const fetches = commands.filter((c) => / fetch /.test(` ${c}`)),
    sent = pushed(commands);
  assert.equal(fetches.length, 2);
  assert.match(fetches[0], /refs\/heads\/main$/);
  assert.match(fetches[1], /[0-9a-f]{40}$/);
  assert.equal(sent.length, 1);
  assert.match(
    sent[0],
    /refs\/heads\/avoozl\/task-1:refs\/heads\/avoozl\/task-1$/,
  );
  for (const line of commands) {
    assert.doesNotMatch(line, new RegExp(PLANS));
    assert.doesNotMatch(line, /--all|--mirror|--tags|\*/);
  }
});

const status404 = () =>
  Promise.reject(Object.assign(new Error("x"), { status: 404 }));

test("the plans branch facts are the head commit and the private spec folders", async () => {
  const github = {
    branch: async () => ({ commit: { sha: HEAD } }),
    contents: async () => [
      { name: "pay-fix", type: "dir" },
      { name: "note.md", type: "file" },
    ],
  };
  const target = { mirror: "a/b-private", plansBranch: PLANS };
  assert.deepEqual(await plansBranchFacts(github, target), {
    commits: [HEAD],
    specNames: ["pay-fix"],
  });
  const missing = { branch: status404, contents: status404 };
  assert.deepEqual(await plansBranchFacts(missing, target), {
    commits: [],
    specNames: [],
  });
  const down = { ...missing, branch: () => Promise.reject(new Error("500")) };
  await assert.rejects(plansBranchFacts(down, target));
});

test("the sync names the default branch only and leaves the plans branch alone", async (t) => {
  const { store } = fixture(t),
    seen = [],
    copies = [],
    github = {
      available: () => true,
      repository: async () => ({ default_branch: "main" }),
      branch: async (repo, name) => {
        seen.push(name);
        return { commit: { sha: repo === "example/code" ? "s2" : "s1" } };
      },
      compareCommits: async () => ({ status: "ahead" }),
    },
    config = {
      mode: "single-repo",
      repositories: {
        "example/code": {
          coder: "issue-radar",
          mirror: {
            source: "example/code",
            mirror: "example/code-private",
            plansBranch: PLANS,
          },
        },
      },
    };
  await mirrorSyncStep(store, github, {
    policy: config,
    copy: async (input) => copies.push(input),
  });
  assert.deepEqual(
    copies.map((c) => c.branch),
    ["main"],
  );
  assert.ok(seen.length > 0 && seen.every((name) => name === "main"));
  assert.ok(!JSON.stringify(copies).includes(PLANS));
});

// A static check: every git push in the app source has one explicit refspec
// and none of the banned flags. The seeding of the mirror (`pushMirror`) is
// the one named exception (RC25.6d).
test("no git push in the app source uses --mirror, --all, --tags or a wildcard", () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const found = [];
  for (const file of fs.readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
    if (file === "cli.mjs") continue; // the word there is an option name
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    for (const match of text.matchAll(
      /^\s*"push",\n([\s\S]{0,200}?)\n\s*\]/gm,
    )) {
      const call = match[1];
      if (file === "mirror-setup.mjs") {
        assert.match(call, /--mirror/, "the one seeding call");
        continue;
      }
      found.push(file);
      assert.doesNotMatch(call, /--mirror|--all|--tags|--follow-tags|\*/, file);
      assert.match(call, /:/, `${file} names one explicit refspec`);
    }
  }
  assert.deepEqual(found.sort(), [
    "lessons-share.mjs",
    "mirror-forward-git.mjs",
    "workspace-repository.mjs",
  ]);
});
