import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FORWARD_MAX_FILE_BYTES,
  scanForward,
} from "../forward-scan.mjs";
import { normalizeGitHubPolicy } from "../../github/github-policy.mjs";
import { forwardMaxFileBytesOf } from "../mirror-policy.mjs";
import {
  forwardGuard,
  metadataBlocks,
  pathBlocks,
  pushProblem,
} from "../forward-guard.mjs";
import { mirrorForwardRows } from "../mirror-forward.mjs";
import { forwardAuditRows, mirrorForwardAuditStep } from "../forward-audit.mjs";
import { mirrorPublicPollStep } from "../mirror-forward-poll.mjs";
import { resumeStop } from "../../flow/flow-line.mjs";
import { forwardRecord, mirrorForwardRunStep } from "../mirror-forward-run.mjs";
import {
  branches,
  fakeGitHub,
  git,
  grant,
  policy,
  scratch,
  forwardName,
} from "../../test/forward-scratch.mjs";

// rc-25.3: the leak scan of a forward (RC26.5.2, D31.2 test 2). Fake terms
// only: every planted value below is made up for the test.
const TERMS =
  "fake-term: \\bzorblax\\b\nfake-host: \\bbuild\\.example-corp\\.test\\b";
const clean = {
  files: [{ path: "src/a.js", content: "export const a = 1;\n" }],
  message: "Add a",
  branch: "feature/a",
  title: "Add a",
  body: "Adds a.",
};
const opts = { terms: TERMS, maxFileBytes: 1000 };
const scan = (change, extra = {}) =>
  scanForward({ ...clean, ...change }, { ...opts, ...extra });
const file = (content, path = "src/a.js") => ({ files: [{ path, content }] });
const rules = (result) => result.blocks.map((b) => b.rule);

test("a clean change passes", () => {
  assert.deepEqual(scan({}), { ok: true, blocks: [] });
});

test("a planted private term, host, ticket ID, account ID and secret each block", () => {
  const cases = {
    "fake-term": "// zorblax was here\n",
    "fake-host": "fetch('https://build.example-corp.test/x')\n",
    "ticket-id": "// see PROJ-1234\n",
    "account-id": "const a = '123456789012';\n",
    "aws-key": "const k = 'AKIAABCDEFGHIJKLMNOP';\n",
    "private-host": "http://10.1.2.3:8080/\n",
    "assigned-secret": 'password = "hunter2hunter2hunter2"\n',
  };
  for (const [rule, content] of Object.entries(cases)) {
    const result = scan(file(content));
    assert.equal(result.ok, false, rule);
    assert.ok(rules(result).includes(rule), `${rule}: ${rules(result)}`);
  }
});

test("a finding names the rule and place, never the text", () => {
  const result = scan(file("// zorblax\n// ok\n"));
  assert.deepEqual(result.blocks[0], {
    rule: "fake-term",
    place: "file 1 line 1",
  });
  assert.ok(!JSON.stringify(result).includes("zorblax"));
});

test("every place is scanned: names, message, branch, title and body", () => {
  assert.match(
    scan(file("x", "docs/zorblax.md")).blocks[0].place,
    /^file 1 name$/,
  );
  assert.equal(
    scan({ message: "fix PROJ-77" }).blocks[0].place,
    "commit message",
  );
  assert.equal(scan({ branch: "zorblax/x" }).blocks[0].place, "branch name");
  assert.equal(scan({ title: "zorblax" }).blocks[0].place, "title");
  assert.equal(scan({ body: "see PROJ-77" }).blocks[0].place, "body");
});

test("a term in a file name is not repeated in the place", () => {
  const result = scan(file("// zorblax\n", "docs/zorblax.md"));
  assert.ok(result.blocks.length >= 2);
  assert.ok(!JSON.stringify(result).includes("zorblax"));
});

test("an encoded term still blocks", () => {
  assert.equal(scan(file("%7a%6f%72%62%6c%61%78\n")).ok, false);
  assert.equal(scan(file("zor&#98;lax\n")).ok, false);
});

test("a binary file and an over-size file block; an allowlisted one passes", () => {
  const binary = { path: "img.png", content: Buffer.from([1, 2, 0, 3]) };
  const big = { path: "big.txt", content: "a".repeat(opts.maxFileBytes + 1) };
  assert.deepEqual(rules(scan({ files: [binary] })), ["binary-file"]);
  assert.deepEqual(rules(scan({ files: [big] })), ["over-size"]);
  assert.equal(
    scan({ files: [binary, big] }, { allow: ["img.png", "big.txt"] }).ok,
    true,
  );
  const edge = { path: "edge.txt", content: "a".repeat(opts.maxFileBytes) };
  assert.equal(scan({ files: [edge] }).ok, true);
});

test("an allowlisted binary is still scanned as text for its name", () => {
  const binary = { path: "zorblax.png", content: Buffer.from([0, 1]) };
  assert.equal(scan({ files: [binary] }, { allow: ["zorblax.png"] }).ok, false);
});

test("the instance ID and name block", () => {
  const identity = { id: "inst-0123456789ab", name: "Mira" };
  assert.deepEqual(
    rules(scan({ body: "from inst-0123456789ab" }, { identity })),
    ["instance"],
  );
  assert.deepEqual(rules(scan({ title: "Mira's change" }, { identity })), [
    "instance",
  ]);
});

test("it fails closed", () => {
  assert.equal(scan({}, { terms: undefined }).ok, false);
  assert.equal(scan({}, { terms: "not a rule line" }).ok, false);
  assert.equal(scan({}, { terms: "bad: (" }).ok, false);
  assert.equal(scan({ files: [{ path: "a", content: null }] }).ok, false);
  assert.equal(scan({ files: [{ path: "a", content: 5 }] }).ok, false);
  assert.equal(scan({ files: undefined }).ok, false);
  assert.equal(scan({ message: undefined }).ok, false);
  assert.equal(scan({}, { maxFileBytes: undefined }).ok, true);
  assert.equal(scan({}, { maxFileBytes: -1 }).ok, false);
  assert.equal(scan({}, { maxFileBytes: "9" }).ok, false);
  assert.equal(scanForward(null, opts).ok, false);
});

test("common false friends do not block", () => {
  const text = "// SHA-256, UTF-8, RFC-7231, ISO-8601 and v1.2.3\n";
  assert.equal(scan(file(text)).ok, true);
});

test("the default size limit is a positive number", () => {
  assert.ok(Number.isInteger(DEFAULT_FORWARD_MAX_FILE_BYTES));
  assert.equal(scanForward(clean, { terms: "" }).ok, true);
});

// The size limit is a mirror setting with a default (RC26.5.2).
const mirrorOf = (extra) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "acme/app-private": {
        baseBranch: "main",
        mirror: { source: "acme/app", mirror: "acme/app-private", ...extra },
      },
    },
  }).repositories["acme/app-private"].mirror;

test("the size limit comes from the setting, or the shown default", () => {
  assert.equal(
    forwardMaxFileBytesOf(mirrorOf({})),
    DEFAULT_FORWARD_MAX_FILE_BYTES,
  );
  assert.equal(forwardMaxFileBytesOf(null), DEFAULT_FORWARD_MAX_FILE_BYTES);
  const mirror = mirrorOf({ forwardMaxFileBytes: 50 });
  const maxFileBytes = forwardMaxFileBytesOf(mirror);
  assert.equal(maxFileBytes, 50);
  const at = { path: "a.txt", content: "a".repeat(maxFileBytes) };
  const over = { path: "b.txt", content: "a".repeat(maxFileBytes + 1) };
  assert.equal(scan({ files: [at] }, { maxFileBytes }).ok, true);
  assert.deepEqual(rules(scan({ files: [over] }, { maxFileBytes })), [
    "over-size",
  ]);
});

test("a bad size limit is refused", () => {
  for (const value of [0, -1, 1.5, "9", null])
    assert.throws(
      () => mirrorOf({ forwardMaxFileBytes: value }),
      /forwardMaxFileBytes/,
    );
});

// rc-25.2: path policy (test 1) and metadata scrub (test 3) of D31.2.
const PLANS = { plansBranch: "avoozl-plans" };
const blocked = (paths, mirror = PLANS) =>
  pathBlocks(paths, mirror).map((b) => b.rule);

test("each excluded path blocks and names its rule", () => {
  assert.deepEqual(blocked([".kiro/specs/a/design.md"]), ["path-kiro"]);
  assert.deepEqual(blocked(["pkg/.kiro/x.md"]), ["path-kiro"]);
  assert.deepEqual(blocked(["AGENTS.md"]), ["path-agents"]);
  assert.deepEqual(blocked(["docs/agents.md"]), ["path-agents"]);
  assert.deepEqual(blocked(["steering/style.md"]), ["path-steering"]);
  assert.deepEqual(blocked(["avoozl-plans/x.md"]), ["path-plans-branch"]);
  assert.deepEqual(
    blocked(["docs/private/a.md", "keys/a.pem", "src/ok.js"], {
      ...PLANS,
      forwardExclude: ["docs/private/", "**/*.pem"],
    }),
    ["path-excluded", "path-excluded"],
  );
  assert.deepEqual(blocked(["src/a.js", "README.md"]), []);
});

test("an allowlisted path passes; one block never hides another path", () => {
  const mirror = { ...PLANS, forwardAllow: [".kiro/public.md"] };
  assert.deepEqual(blocked([".kiro/public.md"], mirror), []);
  assert.deepEqual(blocked([".kiro/public.md", ".kiro/other.md"], mirror), [
    "path-kiro",
  ]);
  assert.deepEqual(
    pathBlocks([".kiro/public.md", ".kiro/other.md"], mirror)[0].place,
    "file 2",
  );
});

test("forwardExclude and forwardAllow are checked as lists of safe paths", () => {
  const ok = mirrorOf({ forwardExclude: ["docs/"], forwardAllow: ["a.md"] });
  assert.deepEqual(ok.forwardExclude, ["docs/"]);
  for (const value of ["docs/", [""], ["/etc"], ["../x"], ["a\\b"], [1]])
    assert.throws(() => mirrorOf({ forwardExclude: value }), /forwardExclude/);
  assert.throws(() => mirrorOf({ forwardAllow: "x" }), /forwardAllow/);
});

const run = (t, options, mirror = {}, github = fakeGitHub()) => {
  const made = scratch(t, options);
  return forwardRecord(made.store, github, made.sha, {
    policy: policy("nudge", mirror),
    person: "dana",
    git: made.forward,
    grant,
  }).then((result) => ({ ...made, github, result }));
};

test("a forward touching an excluded path pushes nothing and names the rule", async (t) => {
  const { pub, github, result, commands } = await run(t, {
    file: ".kiro/specs/a/design.md",
  });
  assert.equal(result.blocked, true);
  assert.match(result.reason, /path policy/);
  assert.match(result.reason, /path-kiro in file 1/);
  assert.doesNotMatch(result.reason, /design\.md/);
  assert.deepEqual(branches(pub), ["main"]);
  assert.equal(github.created.length, 0);
  assert.equal(commands.filter((c) => / push /.test(` ${c}`)).length, 0);
});

test("an allowlisted excluded path forwards", async (t) => {
  const { pub, sha, result } = await run(
    t,
    { file: ".kiro/public.md" },
    { forwardAllow: [".kiro/public.md"] },
  );
  assert.equal(result.record.state, "public_open");
  assert.deepEqual(branches(pub).sort(), [forwardName(sha), "main"]);
});

test("the pushed commit is one new commit by the person, with no trailer or mirror reference", async (t) => {
  const body = [
    "Adds it.",
    "",
    "Mirror merge abc1234 is not public.",
    "",
    "Signed-off-by: Eve <eve@corp.test>",
    "Co-authored-by: Bot <bot@corp.test>",
  ].join("\n");
  const { pub, sha, result } = await run(
    t,
    {},
    {},
    fakeGitHub({ title: "Add the feature", body: body.replace("abc1234", "") }),
  );
  assert.equal(result.record.state, "public_open");
  const main = git(pub, "rev-parse", "main"),
    parents = git(pub, "log", "-1", "--format=%P", forwardName(sha));
  assert.equal(parents, main);
  assert.equal(
    git(pub, "rev-list", "--count", `main..${forwardName(sha)}`),
    "1",
  );
  assert.equal(
    git(pub, "log", "-1", "--format=%an|%ae|%cn|%ce", forwardName(sha)),
    "dana|dana@users.noreply.github.com|dana|dana@users.noreply.github.com",
  );
  const message = git(pub, "log", "-1", "--format=%B", forwardName(sha));
  assert.doesNotMatch(message, /Signed-off-by|Co-authored-by|corp\.test/);
  assert.ok(!message.includes(sha.slice(0, 7)));
  assert.doesNotMatch(message, /code-private|\/pull\/|#\d/);
});

test("the metadata scrub blocks each planted case", () => {
  const person = { name: "dana", email: "dana@users.noreply.github.com" },
    meta = {
      parents: ["base"],
      author: person,
      committer: person,
      message: "Add\n\nBody.",
    },
    expect = {
      base: "base",
      person: "dana",
      email: person.email,
      mirror: "acme/app-private",
      sha: "abcdef1234567890",
    },
    texts = { "commit message": meta.message, title: "Add", body: "Body." },
    names = (m, x = expect, t = texts) =>
      metadataBlocks(m, x, t).map((b) => b.rule);
  assert.deepEqual(names(meta), []);
  assert.deepEqual(names({ ...meta, parents: ["base", "other"] }), [
    "metadata-history",
  ]);
  assert.deepEqual(names({ ...meta, parents: ["other"] }), [
    "metadata-history",
  ]);
  assert.deepEqual(names({ ...meta, author: { ...person, name: "Crew" } }), [
    "metadata-author",
  ]);
  assert.deepEqual(
    names({ ...meta, committer: { name: "Avoozl", email: "a@b.test" } }),
    ["metadata-author"],
  );
  assert.deepEqual(
    names({ ...meta, message: "Add\n\nBody.\n\nSigned-off-by: E <e@x.test>" }),
    ["metadata-trailer"],
  );
  const text = (body) => ({ ...texts, body });
  assert.deepEqual(names(meta, expect, text("by eve@corp.test")), [
    "metadata-email",
  ]);
  assert.deepEqual(names(meta, expect, text("<!-- avoozl-task: 1 -->")), [
    "metadata-marker",
  ]);
  assert.deepEqual(names(meta, expect, text("see acme/app-private")), [
    "metadata-mirror-link",
  ]);
  assert.deepEqual(names(meta, expect, text("commit abcdef1")), [
    "metadata-mirror-link",
  ]);
  assert.deepEqual(names(meta, expect, text("fixes #12")), [
    "metadata-mirror-link",
  ]);
});

test("a binary file and a file over the setting's size block a real forward", async (t) => {
  const binary = await run(t, {
    file: "logo.bin",
    text: Buffer.from([0, 1, 2]),
  });
  assert.equal(binary.result.blocked, true);
  assert.match(binary.result.reason, /binary-file in file 1/);
  const big = await run(
      t,
      { file: "big.txt", text: "x".repeat(40) },
      { forwardMaxFileBytes: 30 },
    ),
    limit = forwardMaxFileBytesOf({ forwardMaxFileBytes: 30 });
  assert.equal(limit, 30);
  assert.equal(big.result.blocked, true);
  assert.match(big.result.reason, /over-size in file 1/);
  assert.deepEqual(branches(big.pub), ["main"]);
  const allowed = await run(
    t,
    { file: "logo.bin", text: Buffer.from([0, 1, 2]) },
    { forwardAllow: ["logo.bin"] },
  );
  assert.equal(allowed.result.record.state, "public_open");
});

// rc-25.4: diff review and receipt (test 4 of D31.2).
const reviewed = (made, github, extra = {}) =>
  forwardRecord(made.store, github, made.sha, {
    policy: policy("nudge"),
    person: "dana",
    git: made.forward,
    grant,
    ...extra,
  });

test("the review shows the exact diff, title and body and pushes nothing", async (t) => {
  const made = scratch(t),
    github = fakeGitHub(),
    look = await reviewed(made, github, { push: false, review: true });
  assert.equal(look.ok, true);
  assert.match(look.review.diff, /\+\+\+ b\/feature\.txt/);
  assert.match(look.review.diff, /\+hello/);
  assert.equal(look.review.title, "Add the feature");
  assert.match(look.review.body, /Contributed by @dana/);
  assert.match(look.review.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(branches(made.pub), ["main"]);
  assert.equal(github.created.length, 0);
});

test("a push needs the hash that was shown; a change after display forces a new display", async (t) => {
  const made = scratch(t),
    github = fakeGitHub(),
    first = (await reviewed(made, github, { push: false, review: true }))
      .review;
  // Nothing seen, or a wrong hash: no push, no receipt, the review again.
  for (const seenHash of [null, "0".repeat(64)]) {
    const result = await reviewed(made, github, { review: true, seenHash });
    assert.equal(result.changed, true);
    assert.equal(result.review.hash, first.hash);
    assert.equal(made.store.get("mirror_forward", made.sha).receipt, undefined);
  }
  assert.deepEqual(branches(made.pub), ["main"]);
  // The mirror pull request text changes after the display.
  const edited = fakeGitHub({ body: "A different body." }),
    again = await reviewed(made, edited, {
      review: true,
      seenHash: first.hash,
    });
  assert.equal(again.changed, true);
  assert.notEqual(again.review.hash, first.hash);
  assert.match(again.review.body, /A different body/);
  assert.deepEqual(branches(made.pub), ["main"]);
  // The new hash, once shown, pushes.
  const sent = await reviewed(made, edited, {
    review: true,
    seenHash: again.review.hash,
  });
  assert.equal(sent.record.state, "public_open");
  assert.deepEqual(branches(made.pub).sort(), [forwardName(made.sha), "main"]);
  assert.equal(sent.record.receipt.hash, again.review.hash);
});

test("the receipt holds the diff, title, body, hash, target, person and time", async (t) => {
  const made = scratch(t),
    github = fakeGitHub(),
    seen = (await reviewed(made, github, { push: false, review: true })).review,
    sent = await reviewed(made, github, {
      review: true,
      seenHash: seen.hash,
      now: "2026-11-14T12:00:00.000Z",
    }),
    { receipt } = sent.record;
  assert.equal(receipt.diff, seen.diff);
  assert.equal(receipt.title, seen.title);
  assert.equal(receipt.body, seen.body);
  assert.equal(receipt.hash, seen.hash);
  assert.equal(receipt.target, "example/code:main");
  assert.equal(receipt.person, "dana");
  assert.equal(receipt.at, "2026-11-14T12:00:00.000Z");
  // A private record: the pushed commit does not hold it.
  const message = git(
    made.pub,
    "log",
    "-1",
    "--format=%B",
    forwardName(made.sha),
  );
  assert.ok(!message.includes(receipt.hash));
});

test("an auto forward leaves the receipt before the push call", async (t) => {
  const made = scratch(t),
    github = fakeGitHub(),
    seen = [];
  const spy = {
    ...made.forward,
    push: async (input) => {
      seen.push(made.store.get("mirror_forward", made.sha).receipt);
      return made.forward.push(input);
    },
  };
  const result = await mirrorForwardRunStep(made.store, github, {
    policy: policy("auto"),
    git: spy,
    grant,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(seen.length, 1);
  assert.match(seen[0].hash, /^[0-9a-f]{64}$/);
  assert.equal(seen[0].mode, "auto");
  assert.equal(
    made.store.get("mirror_forward", made.sha).receipt.hash,
    seen[0].hash,
  );
});

// rc-25.5: a block is one row and no retry; Stop the line; explicit refspecs
// (tests 5, 7 and 8 of D31.2).
const counting = (made) => {
  const spy = { count: 0, pushes: 0 };
  spy.git = {
    ...made.forward,
    prepare: async (input) => {
      spy.count += 1;
      return made.forward.prepare(input);
    },
    push: async (input) => {
      spy.pushes += 1;
      return made.forward.push(input);
    },
  };
  return spy;
};
const stopOpen = (store, extra = {}) =>
  store.put("flow_stops", {
    id: "stop:1",
    manual: true,
    scope: "all",
    reason: "A test stop.",
    openedAt: "2026-11-14T10:00:00.000Z",
    closedAt: null,
    ...extra,
  });

test("the protections run in order and a later one does not run on an earlier block", () => {
  const person = { name: "dana", email: "dana@users.noreply.github.com" },
    change = {
      paths: [".kiro/a.md"],
      files: [{ path: ".kiro/a.md", content: "// zorblax PROJ-1234\n" }],
      message: "Add",
      branch: "b",
      title: "Add",
      body: "by x@corp.test",
      meta: {
        parents: ["x", "y"],
        author: person,
        committer: person,
        message: "Add",
      },
      expect: { base: "base", person: "dana", email: person.email },
    };
  const first = forwardGuard(change, { mirror: PLANS });
  assert.equal(first.protection, "path policy");
  const second = forwardGuard(
    {
      ...change,
      paths: ["a.md"],
      files: [{ path: "a.md", content: "// see PROJ-1234\n" }],
    },
    { mirror: PLANS },
  );
  assert.equal(second.protection, "leak scan");
  const third = forwardGuard(
    { ...change, paths: ["a.md"], files: [{ path: "a.md", content: "ok\n" }] },
    { mirror: PLANS },
  );
  assert.equal(third.protection, "metadata scrub");
});

test("a block gives one row across three ticks and zero retries; Try again runs it all again", async (t) => {
  for (const mode of ["auto", "nudge"]) {
    const made = scratch(t, { file: ".kiro/x.md" }),
      spy = counting(made),
      github = fakeGitHub(),
      options = { policy: policy(mode), git: spy.git, grant };
    for (let tick = 0; tick < 3; tick++)
      assert.deepEqual(
        (await mirrorForwardRunStep(made.store, github, options)).errors,
        [],
      );
    assert.equal(spy.count, 1, mode);
    assert.equal(spy.pushes, 0, mode);
    const rows = mirrorForwardRows(made.store, policy(mode));
    assert.equal(rows.length, 1, mode);
    assert.match(rows[0].detail, /path-kiro in file 1/);
    // Try again, after the person fixes the rule: everything runs again.
    const fixed = policy(mode, { forwardAllow: [".kiro/x.md"] }),
      again = await forwardRecord(made.store, github, made.sha, {
        policy: fixed,
        person: "dana",
        git: spy.git,
        grant,
      });
    assert.equal(spy.count, 2, mode);
    assert.equal(again.record.state, "public_open", mode);
  }
});

test("an open Stop the line stops forwarding in every mode and the button says why", async (t) => {
  const made = scratch(t),
    spy = counting(made),
    github = fakeGitHub();
  stopOpen(made.store);
  const tick = await mirrorForwardRunStep(made.store, github, {
    policy: policy("auto"),
    git: spy.git,
    grant,
  });
  assert.deepEqual(tick.errors, []);
  const pressed = await forwardRecord(made.store, github, made.sha, {
    policy: policy("nudge"),
    person: "dana",
    git: spy.git,
    grant,
  });
  assert.equal(pressed.ok, false);
  assert.match(pressed.reason, /Forwarding is stopped: A test stop\./);
  const look = await forwardRecord(made.store, github, made.sha, {
    policy: policy("nudge"),
    person: "dana",
    git: spy.git,
    grant,
    push: false,
  });
  assert.equal(look.stopped, "A test stop.");
  assert.equal(spy.pushes, 0);
  assert.equal(github.created.length, 0);
  assert.deepEqual(branches(made.pub), ["main"]);
  // A stop for another repository does not stop this one; a closed one is over.
  made.store.put("flow_stops", {
    ...made.store.get("flow_stops", "stop:1"),
    scope: "repo",
    repositoryId: "example/other",
  });
  assert.equal(
    (
      await forwardRecord(made.store, github, made.sha, {
        policy: policy("nudge"),
        person: "dana",
        git: spy.git,
        grant,
      })
    ).record.state,
    "public_open",
  );
});

test("every push has one explicit refspec and none of the banned forms", async (t) => {
  const made = scratch(t),
    github = fakeGitHub();
  await forwardRecord(made.store, github, made.sha, {
    policy: policy(),
    person: "dana",
    git: made.forward,
    grant,
  });
  const pushes = made.commands.filter((c) => /(^| )push /.test(c));
  assert.equal(pushes.length, 1);
  for (const command of pushes) {
    assert.doesNotMatch(command, /--mirror|--all|--tags|--force|\+refs|\*/);
    assert.equal(pushProblem(command.split(" ")), null);
  }
  const good = ["push", "-q", "url", "refs/heads/a:refs/heads/a"];
  assert.equal(pushProblem(good), null);
  for (const bad of [
    ["push", "url"],
    ["push", "--mirror", "url", "refs/heads/a:refs/heads/a"],
    ["push", "--all", "url", "refs/heads/a:refs/heads/a"],
    ["push", "--tags", "url", "refs/heads/a:refs/heads/a"],
    ["push", "-f", "url", "refs/heads/a:refs/heads/a"],
    ["push", "url", "+refs/heads/a:refs/heads/a"],
    ["push", "url", "refs/heads/*:refs/heads/*"],
    ["push", "url", "refs/heads/a:refs/heads/b"],
    ["push", "url", "a:a"],
    ["push", "url", "refs/heads/a:refs/heads/a", "refs/heads/b:refs/heads/b"],
  ])
    assert.notEqual(pushProblem(bad), null, bad.join(" "));
  assert.notEqual(
    pushProblem(["push", "url", "refs/heads/main:refs/heads/main"], {
      forbid: ["main"],
    }),
    null,
  );
});

test("the push step refuses a protected branch before git runs", async () => {
  const { forwardGit } = await import("../mirror-forward-git.mjs"),
    ran = [],
    git = forwardGit({
      urlFor: () => "https://example.test/x.git",
      run: async (args) => ran.push(args),
    });
  await assert.rejects(
    git.push({ dir: ".", forwardTo: "o/r", branch: "main", forbid: ["main"] }),
    /protected branch/,
  );
  assert.deepEqual(ran, []);
});

// rc-25.6: the audit on the tick (test 6 of D31.2).
async function forwarded(t, over = {}) {
  const made = scratch(t),
    github = fakeGitHub(),
    pol = policy("nudge", { plansBranch: "avoozl-plans" });
  const sent = await forwardRecord(made.store, github, made.sha, {
    policy: pol,
    person: "dana",
    git: made.forward,
    grant,
  });
  const receipt = sent.record.receipt,
    calls = [],
    source = {
      ...github,
      pullRequest: async (repo, number) => {
        if (repo === "example/code-private") return { title: "t", body: "b" };
        return { number, state: "open", head: { sha: receipt.commit } };
      },
      listPullRequestReviewComments: async () => [],
      compareCommits: async (...args) => {
        calls.push(["compare", ...args]);
        return { files: [], commits: [] };
      },
      branch: async (repo, name) => {
        calls.push(["branch", repo, name]);
        throw Object.assign(Error("Not Found"), { status: 404 });
      },
      ...over,
    };
  return { ...made, receipt, source, calls, pol, github };
}
const tickAudit = async (x, extra = {}) => {
  await mirrorPublicPollStep(x.store, x.source, { policy: x.pol });
  return mirrorForwardAuditStep(x.store, x.source, {
    policy: x.pol,
    refsEveryMs: 0,
    ...extra,
  });
};
const openStops = (store) =>
  store.list("flow_stops").filter((stop) => !stop.closedAt);

test("an unchanged head is clean and costs no comparison", async (t) => {
  const x = await forwarded(t);
  assert.deepEqual((await tickAudit(x)).errors, []);
  assert.equal(forwardAuditRows(x.store).length, 0);
  assert.equal(openStops(x.store).length, 0);
  assert.deepEqual(
    x.calls.filter((c) => c[0] === "compare"),
    [],
  );
});

test("an extra file, another author or a plans-branch ref gives one row and a stop", async (t) => {
  const person = (login) => ({
      author: { login },
      commit: { author: { name: login } },
    }),
    cases = {
      "audit-extra-file": {
        compareCommits: async () => ({
          files: [{ filename: "feature.txt" }, { filename: "extra.txt" }],
          commits: [person("dana")],
        }),
      },
      "audit-author": {
        compareCommits: async () => ({
          files: [{ filename: "feature.txt" }],
          commits: [person("eve")],
        }),
      },
      "audit-path-kiro": {
        compareCommits: async () => ({
          files: [{ filename: "feature.txt" }, { filename: ".kiro/a.md" }],
          commits: [person("dana")],
        }),
      },
    };
  for (const [rule, over] of Object.entries(cases)) {
    const x = await forwarded(t, over);
    x.source.pullRequest = async (repo, number) =>
      repo === "example/code-private"
        ? { title: "t", body: "b" }
        : { number, state: "open", head: { sha: "f".repeat(40) } };
    await tickAudit(x);
    await tickAudit(x);
    const rows = forwardAuditRows(x.store);
    assert.equal(rows.length, 1, rule);
    assert.match(rows[0].detail, new RegExp(rule));
    assert.equal(openStops(x.store).length, 1, rule);
    assert.equal(openStops(x.store)[0].repositoryId, "example/code");
  }
  // A ref named for the plans branch, with the head unchanged.
  const x = await forwarded(t, {
    branch: async () => ({ name: "avoozl-plans" }),
  });
  await tickAudit(x);
  await tickAudit(x);
  assert.equal(forwardAuditRows(x.store).length, 1);
  assert.match(forwardAuditRows(x.store)[0].detail, /audit-forbidden-ref/);
  assert.equal(openStops(x.store).length, 1);
});

test("the audit's stop stops forwarding until a person resumes it", async (t) => {
  const x = await forwarded(t, {
    branch: async () => ({ name: "avoozl-plans" }),
  });
  await tickAudit(x);
  const next = {
      ...x.store.get("mirror_forward", x.sha),
      id: "next",
      state: "to_forward",
      publicPr: null,
      receipt: undefined,
      publicHead: undefined,
      audit: undefined,
    },
    spy = counting(x);
  x.store.put("mirror_forward", next);
  const result = await forwardRecord(x.store, x.source, "next", {
    policy: x.pol,
    person: "dana",
    git: spy.git,
    grant,
  });
  assert.equal(result.stopped !== undefined, true);
  assert.equal(spy.pushes, 0);
  resumeStop(x.store, { stopId: openStops(x.store)[0].id }, { by: "test" });
  assert.equal(forwardAuditRows(x.store).length, 0);
});

test("the ref check reads at most once per interval", async (t) => {
  const x = await forwarded(t);
  await tickAudit(x, { refsEveryMs: 600000, now: 1_000_000 });
  await tickAudit(x, { refsEveryMs: 600000, now: 1_100_000 });
  assert.equal(x.calls.filter((c) => c[0] === "branch").length, 2);
  await tickAudit(x, { refsEveryMs: 600000, now: 1_700_000 });
  assert.equal(x.calls.filter((c) => c[0] === "branch").length, 4);
});
