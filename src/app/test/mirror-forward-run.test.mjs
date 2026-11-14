// rc-23.4: forward a merged mirror change to the public repository (RC24.7 to
// RC24.10, RC24.13, RC24.14). Local scratch git repositories and a fake GitHub
// only; no real repository, issue or pull request is touched.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { bindContentRules, contentBinding } from "../content-rules.mjs";
import { instanceIdentity, instanceView } from "../instance.mjs";
import { forwardGit } from "../mirror-forward-git.mjs";
import {
  forwardRecord,
  mirrorForwardRunStep,
  stripPrivate,
} from "../mirror-forward-run.mjs";
import { mirrorForwardRows } from "../mirror-forward.mjs";
import { fixture } from "./fixtures.mjs";

const SOURCE = "example/code";
const MIRROR = "example/code-private";
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Crew",
      GIT_AUTHOR_EMAIL: "crew@example.test",
      GIT_COMMITTER_NAME: "Crew",
      GIT_COMMITTER_EMAIL: "crew@example.test",
    },
  }).trim();

function scratch(t, { file = "feature.txt", text = "hello\n" } = {}) {
  const { root, store } = fixture(t),
    pub = path.join(root, "pub.git"),
    priv = path.join(root, "priv.git"),
    work = path.join(root, "work");
  fs.writeFileSync(path.join(root, ".avoozl.json"), "{}");
  git(root, "init", "-q", "--bare", "-b", "main", pub);
  git(root, "clone", "-q", pub, work);
  fs.writeFileSync(path.join(work, "a.txt"), "base\n");
  git(work, "add", ".");
  git(work, "commit", "-q", "-m", "base");
  git(work, "push", "-q", "origin", "HEAD:refs/heads/main");
  git(root, "clone", "-q", "--bare", pub, priv);
  git(work, "remote", "add", "private", priv);
  git(work, "checkout", "-q", "-b", "avoozl/task-1");
  fs.writeFileSync(path.join(work, file), text);
  git(work, "add", ".");
  git(work, "commit", "-q", "-m", "crew work");
  git(work, "checkout", "-q", "main");
  git(work, "merge", "-q", "--no-ff", "-m", "Merge crew", "avoozl/task-1");
  git(work, "push", "-q", "private", "main:refs/heads/main");
  const sha = git(work, "rev-parse", "HEAD"),
    commands = [],
    urls = { [SOURCE]: pub, [MIRROR]: priv },
    forward = forwardGit({
      urlFor: (repo) => urls[repo],
      run: (args, options) => {
        commands.push(args.join(" "));
        return execFileSync2(args, options);
      },
    });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [{ id: "fake-rules", path: "plugins/fake-rules", contract: 1 }],
      contentRules: {
        sets: [{ id: "fake-plugin-set", plugin: "fake-rules" }],
      },
    }),
  );
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "config", "config.json"),
  });
  contentBinding(store).plugins.set("fake-rules", {
    loadedAt: Date.now(),
    sets: new Map([
      [
        "fake-plugin-set",
        {
          id: "fake-plugin-set",
          version: "1.0.0",
          rules: [{ id: "orchard", source: "\\borchard[- ]?nine\\b" }],
        },
      ],
    ]),
  });
  store.put("mirror_forward", {
    id: sha,
    repository: SOURCE,
    mirror: MIRROR,
    mirrorPr: 5,
    taskId: "task-1",
    approver: "dana",
    state: "to_forward",
    reason: "Merged in the mirror, not forwarded yet.",
    mirrorMergedAt: "2026-11-14T10:00:00.000Z",
    forwardedAt: null,
    publicPrAt: null,
    publicMergedAt: null,
    forwardBranch: null,
    publicPr: null,
  });
  return { store, pub, priv, sha, commands, forward };
}

function execFileSync2(args, { cwd, env, input } = {}) {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      env: { ...process.env, ...env },
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return Promise.resolve({ stdout, stderr: "" });
  } catch (error) {
    return Promise.reject(
      Object.assign(error, {
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? ""),
      }),
    );
  }
}

function fakeGitHub({
  title = "Add the feature",
  body = "Adds it.\n\nTests: yes.",
} = {}) {
  const github = {
    created: [],
    pulls: [],
    available: () => true,
    signedIn: () => true,
    repository: async () => ({ default_branch: "main" }),
    pullRequest: async () => ({ title, body }),
    listPullRequests: async () => github.pulls,
    createPullRequest: async (repo, input) => {
      assert.equal(repo, SOURCE);
      const pull = { number: 40 + github.created.length, ...input };
      github.created.push(pull);
      github.pulls.push(pull);
      return pull;
    },
  };
  return github;
}

const policy = (forward = "nudge", extra = {}) => ({
  mode: "single-repo",
  repositories: {
    [SOURCE]: {
      coder: "issue-radar",
      mirror: {
        source: SOURCE,
        mirror: MIRROR,
        forward,
        branchPrefix: "avoozl/",
        trustedPersons: ["dana"],
        ...extra,
      },
    },
  },
});
const grant = async () => "token";
const branches = (repo) =>
  git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads").split(
    "\n",
  );

test("a clean change forwards once, as the person, with a normal push", async (t) => {
  const { store, pub, sha, commands, forward } = scratch(t),
    github = fakeGitHub(),
    options = { policy: policy(), person: "dana", git: forward, grant };
  const first = await forwardRecord(store, github, sha, options);
  assert.equal(first.ok, true);
  assert.equal(first.record.state, "public_open");
  assert.equal(first.record.publicPr, 40);
  assert.deepEqual(branches(pub).sort(), ["avoozl/task-1", "main"]);
  const log = git(pub, "log", "--format=%an|%ae|%s", "main..avoozl/task-1");
  assert.equal(log, "dana|dana@users.noreply.github.com|Add the feature");
  assert.equal(git(pub, "show", "avoozl/task-1:feature.txt"), "hello");
  assert.match(github.created[0].body, /Contributed by @dana/);
  assert.doesNotMatch(github.created[0].body, /code-private/);
  // A second press opens no second pull request and pushes nothing.
  const before = commands.length,
    second = await forwardRecord(store, github, sha, options);
  assert.equal(second.again, true);
  assert.equal(github.created.length, 1);
  assert.equal(commands.length, before);
  // Only normal pushes of one explicit task refspec were ever issued.
  const pushes = commands.filter((c) => /(^| )push /.test(c));
  assert.equal(pushes.length, 1);
  assert.doesNotMatch(
    pushes[0],
    /--force|-f |--mirror|\+refs|:refs\/heads\/main/,
  );
  assert.match(
    pushes[0],
    /refs\/heads\/avoozl\/task-1:refs\/heads\/avoozl\/task-1/,
  );
});

test("a retry after a crash finds the open pull request and pushes nothing", async (t) => {
  const { store, sha, commands, forward } = scratch(t),
    github = fakeGitHub();
  github.pulls.push({ number: 77 });
  const result = await forwardRecord(store, github, sha, {
    policy: policy(),
    person: "dana",
    git: forward,
    grant,
  });
  assert.equal(result.record.publicPr, 77);
  assert.equal(github.created.length, 0);
  assert.equal(commands.filter((c) => / push /.test(` ${c}`)).length, 0);
});

test("a private term in the pull request text blocks the push and names only the rule", async (t) => {
  const { store, pub, sha, commands, forward } = scratch(t),
    github = fakeGitHub({ body: "Fixes the Orchard Nine report." });
  const result = await forwardRecord(store, github, sha, {
    policy: policy(),
    person: "dana",
    git: forward,
    grant,
  });
  assert.equal(result.blocked, true);
  assert.match(result.reason, /fake-plugin-set\/orchard/);
  assert.doesNotMatch(result.reason, /Orchard Nine/i);
  assert.deepEqual(branches(pub), ["main"]);
  assert.equal(github.created.length, 0);
  assert.equal(commands.filter((c) => / push /.test(` ${c}`)).length, 0);
  const rows = mirrorForwardRows(store, policy());
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /fake-plugin-set\/orchard/);
});

test("a private term in the change itself blocks the push", async (t) => {
  const { store, pub, sha, forward } = scratch(t, {
    text: "see orchard-nine\n",
  });
  const github = fakeGitHub();
  const result = await forwardRecord(store, github, sha, {
    policy: policy(),
    person: "dana",
    git: forward,
    grant,
  });
  assert.equal(result.blocked, true);
  assert.deepEqual(branches(pub), ["main"]);
  assert.equal(github.created.length, 0);
});

test("an instance name or ID in the text blocks the forward and pushes nothing", async (t) => {
  const { store, pub, sha, commands, forward } = scratch(t),
    identity = instanceIdentity(store);
  for (const body of [
    `Done by ${identity.name}.`,
    `<!-- marker instance=${identity.id} -->`,
    "From inst-0123456789ab.",
  ]) {
    const github = fakeGitHub({ body }),
      result = await forwardRecord(store, github, sha, {
        policy: policy(),
        person: "dana",
        git: forward,
        grant,
      });
    assert.equal(result.blocked, true, body);
    assert.match(result.reason, /instance/);
    assert.doesNotMatch(result.reason, new RegExp(identity.name));
    assert.equal(github.created.length, 0);
  }
  assert.deepEqual(branches(pub), ["main"]);
  assert.equal(commands.filter((c) => / push /.test(` ${c}`)).length, 0);
  // The other instance's ID was remembered, not copied anywhere.
  assert.deepEqual(instanceView(store).others, ["inst-0123456789ab"]);
});

test("no sign-in for the person means a row and no push, never a shared token", async (t) => {
  const { store, pub, sha, forward } = scratch(t),
    github = fakeGitHub(),
    result = await forwardRecord(store, github, sha, {
      policy: policy(),
      person: "dana",
      git: forward,
      grant: async () => null,
    });
  assert.equal(result.blocked, true);
  assert.match(result.reason, /no sign-in for dana/);
  assert.deepEqual(branches(pub), ["main"]);
  assert.equal(github.created.length, 0);
});

test("auto forwards for a trusted approver and not for another", async (t) => {
  const { store, pub, sha, forward } = scratch(t),
    github = fakeGitHub(),
    stranger = {
      ...store.get("mirror_forward", sha),
      id: "other-sha",
      approver: "eve",
    };
  store.put("mirror_forward", stranger);
  const result = await mirrorForwardRunStep(store, github, {
    policy: policy("auto"),
    git: forward,
    grant,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(store.get("mirror_forward", sha).state, "public_open");
  assert.equal(store.get("mirror_forward", "other-sha").state, "to_forward");
  assert.equal(github.created.length, 1);
  assert.deepEqual(branches(pub).sort(), ["avoozl/task-1", "main"]);
});

test("nudge prepares and scans once, pushes nothing, and says it is ready", async (t) => {
  const { store, pub, sha, commands, forward } = scratch(t),
    github = fakeGitHub();
  await mirrorForwardRunStep(store, github, {
    policy: policy(),
    git: forward,
    grant,
  });
  const record = store.get("mirror_forward", sha);
  assert.equal(record.state, "to_forward");
  assert.equal(record.scanClean, true);
  assert.match(record.reason, /scan clean, ready for the public repository/);
  assert.deepEqual(branches(pub), ["main"]);
  assert.equal(commands.filter((c) => / push /.test(` ${c}`)).length, 0);
  // The scan is not repeated on the next tick.
  const before = commands.length;
  await mirrorForwardRunStep(store, github, {
    policy: policy(),
    git: forward,
    grant,
  });
  assert.equal(commands.length, before);
});

test("forward off does nothing", async (t) => {
  const { store, sha, forward } = scratch(t),
    result = await forwardRecord(store, fakeGitHub(), sha, {
      policy: policy("off"),
      person: "dana",
      git: forward,
      grant,
    });
  assert.equal(result.ok, false);
});

test("stripPrivate drops lines that name the mirror, issues, or other hosts", () => {
  const text = [
    "Adds the parser.",
    "Closes: #12",
    "See example/code-private#4",
    "Details at https://tracker.internal.test/ticket/9",
    "Docs: https://github.com/example/code/blob/main/README.md",
    "<!-- avoozl-task v=2 -->",
    "Tests: added.",
  ].join("\n");
  assert.equal(
    stripPrivate(text, { mirror: MIRROR }),
    "Adds the parser.\nDocs: https://github.com/example/code/blob/main/README.md\n\nTests: added.",
  );
});
