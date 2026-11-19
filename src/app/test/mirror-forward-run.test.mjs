// rc-23.4: forward a merged mirror change to the public repository (RC24.7 to
// RC24.10, RC24.13, RC24.14). Local scratch git repositories and a fake GitHub
// only; no real repository, issue or pull request is touched.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { instanceIdentity, instanceView } from "../instance.mjs";
import {
  forwardRecord,
  mirrorForwardRunStep,
  stripPrivate,
} from "../mirror-forward-run.mjs";
import { mirrorForwardRows } from "../mirror-forward.mjs";
import {
  SOURCE,
  MIRROR,
  git,
  scratch,
  fakeGitHub,
  policy,
  grant,
  branches,
  forwardName,
} from "./forward-scratch.mjs";
import { throughClient } from "./crew-label-client.mjs";

test("a clean change forwards once, as the person, with a normal push", async (t) => {
  const { store, pub, sha, commands, forward } = scratch(t),
    github = fakeGitHub(),
    options = { policy: policy(), person: "dana", git: forward, grant };
  const first = await forwardRecord(store, github, sha, options);
  assert.equal(first.ok, true);
  assert.equal(first.record.state, "public_open");
  assert.equal(first.record.publicPr, 40);
  assert.deepEqual(branches(pub).sort(), [forwardName(sha), "main"]);
  const log = git(
    pub,
    "log",
    "--format=%an|%ae|%s",
    `main..${forwardName(sha)}`,
  );
  assert.equal(log, "dana|dana@users.noreply.github.com|Add the feature");
  assert.equal(git(pub, "show", `${forwardName(sha)}:feature.txt`), "hello");
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
  assert.ok(
    pushes[0].includes(
      `refs/heads/${forwardName(sha)}:refs/heads/${forwardName(sha)}`,
    ),
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
  assert.deepEqual(branches(pub).sort(), [forwardName(sha), "main"]);
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

// ---- rc-23.6: conflicts -------------------------------------------------

function moveSource(root, pub, text) {
  const dir = path.join(root, `move-${Math.random().toString(36).slice(2)}`);
  git(root, "clone", "-q", pub, dir);
  fs.writeFileSync(path.join(dir, "a.txt"), text);
  git(dir, "commit", "-q", "-am", "move");
  git(dir, "push", "-q", "origin", "HEAD:refs/heads/main");
}

test("a moved source applies on the retry after a sync", async (t) => {
  const { store, pub, priv, sha, forward } = scratch(t, {
      file: "a.txt",
      text: "crew\n",
    }),
    root = path.dirname(pub);
  moveSource(root, pub, "other\n");
  let synced = 0;
  const github = fakeGitHub(),
    result = await forwardRecord(store, github, sha, {
      policy: policy(),
      person: "dana",
      git: forward,
      grant,
      // The sync brings the public default branch to a state the change fits.
      sync: async () => {
        synced++;
        moveSource(root, pub, "base\n");
      },
    });
  assert.equal(synced, 1);
  assert.equal(result.ok, true);
  assert.equal(git(pub, "show", `${forwardName(sha)}:a.txt`), "crew");
  assert.equal(github.issues.length, 0);
  assert.ok(priv);
});

test("a true conflict opens one mirror issue with paths and no contents", async (t) => {
  const { store, pub, sha, forward } = scratch(t, {
      file: "a.txt",
      text: "crew secret text\n",
    }),
    root = path.dirname(pub);
  moveSource(root, pub, "other public text\n");
  const heads = () => git(pub, "rev-parse", "main"),
    github = fakeGitHub({ head: heads }),
    { requests } = throughClient(github),
    options = {
      policy: policy(),
      person: "dana",
      git: forward,
      grant,
      sync: async () => {},
    };
  const first = await forwardRecord(store, github, sha, options);
  assert.equal(first.conflict, true);
  assert.deepEqual(first.paths, ["a.txt"]);
  assert.equal(github.issues.length, 1);
  assert.match(github.issues[0].body, /- a\.txt/);
  assert.doesNotMatch(github.issues[0].body, /secret|public text/);
  // The issue carries no label.
  assert.deepEqual(github.issues[0].labels ?? [], []);
  assert.deepEqual(requests, [{ form: "rest", labels: [] }]);
  const record = store.get("mirror_forward", sha);
  assert.equal(record.state, "to_forward");
  assert.match(record.conflictNote, /1 path; mirror issue #61/);
  assert.deepEqual(branches(pub), ["main"]);
  // Pressing again opens no second issue.
  await forwardRecord(store, github, sha, options);
  assert.equal(github.issues.length, 1);
  // The step leaves it alone until the public default branch moves.
  const before = github.issues.length;
  await mirrorForwardRunStep(store, github, options);
  assert.equal(github.issues.length, before);
  assert.equal(store.get("mirror_forward", sha).publicPr, null);
});
