// The P67 live proof's hard guards (scripts/live-proofs/p67-guards.mjs),
// with fakes only. Nothing here reaches GitHub or ticks P67.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  claimRun,
  guardedFetch,
  outputProblems,
  poller,
  recoverRun,
  pushArgs,
  refusePushFlags,
  refuseSkippingFlags,
  requestAllowed,
  writableRepository,
} from "../../../scripts/live-proofs/p67-guards.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const who = {};
const API = "https://api.github.com";

test("writes reach only the scratch org's p67 repositories", () => {
  assert.equal(writableRepository("avoozl-scratch/p67-upstream"), true);
  assert.equal(writableRepository("Avoozl-Scratch/p67-upstream-fork"), true);
  for (const repository of [
    "avoozlbot/p67-upstream-fork",
    "avoozl-scratch/other",
    "mtdowling/avoozl",
    "someone/avoozl",
    "elsewhere/p67-upstream",
    "avoozl-scratch/p67-x/../y",
  ])
    assert.equal(writableRepository(repository), false, repository);
  const write = (url, body, method = "POST") =>
    requestAllowed({ method, url: API + url, body }, who);
  assert.equal(write("/repos/mtdowling/avoozl/issues").ok, false);
  assert.equal(write("/repos/avoozl-scratch/p67-plans-public/issues").ok, true);
  assert.equal(
    write("/orgs/avoozl-scratch/repos", { name: "p67-mirror" }).ok,
    true,
  );
  assert.equal(write("/orgs/avoozl-scratch/repos", { name: "real" }).ok, false);
  assert.equal(write("/user/repos", { name: "p67-x" }).ok, false);
  assert.equal(
    requestAllowed({ method: "GET", url: API + "/repos/mtdowling/avoozl" }, who)
      .ok,
    true,
  );
  // A GraphQL write needs node IDs read from an allowed repository.
  const mutation = {
    query:
      "mutation($input:CreateIssueInput!){createIssue(input:$input){issue{id}}}",
    variables: { input: { repositoryId: "R_1", title: "x" } },
  };
  assert.equal(write("/graphql", mutation).ok, false);
  assert.equal(
    requestAllowed(
      { method: "POST", url: API + "/graphql", body: mutation },
      {
        ...who,
        known: new Set(["R_1"]),
      },
    ).ok,
    true,
  );
  assert.equal(
    write("/graphql", { query: "mutation{deleteRepository(input:{}){x}}" }).ok,
    false,
  );
});

test("pushes name one exact commit and branch, never forced", () => {
  const commit = "a".repeat(40);
  assert.deepEqual(
    pushArgs(
      { repository: "avoozl-scratch/p67-upstream", branch: "main", commit },
      who,
    ),
    [
      "push",
      "--quiet",
      "https://github.com/avoozl-scratch/p67-upstream.git",
      `${commit}:refs/heads/main`,
    ],
  );
  assert.throws(() =>
    pushArgs({ repository: "mtdowling/avoozl", branch: "main", commit }, who),
  );
  assert.throws(() =>
    pushArgs(
      {
        repository: "avoozl-scratch/p67-upstream",
        branch: "main",
        commit: "HEAD",
      },
      who,
    ),
  );
  assert.throws(() =>
    pushArgs(
      { repository: "avoozl-scratch/p67-upstream", branch: "--force", commit },
      who,
    ),
  );
  assert.throws(() =>
    pushArgs(
      { repository: "avoozl-scratch/p67-upstream", branch: "a/*", commit },
      who,
    ),
  );
  for (const flag of [
    "-f",
    "--force",
    "--force-with-lease",
    "--mirror",
    "--all",
    "--delete",
    "+main",
    ":main",
  ])
    assert.throws(() => refusePushFlags(["push", "origin", flag]), flag);
  assert.throws(() =>
    refuseSkippingFlags(["claude", "--dangerously-skip-permissions"]),
  );
  assert.throws(() =>
    refuseSkippingFlags(["x", "--permission-mode", "bypassPermissions"]),
  );
  assert.deepEqual(refuseSkippingFlags(["git", "status"]), ["git", "status"]);
});

test("a proof runs once per root", (t) => {
  const root = temporaryDirectory("p67-guard-");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = claimRun(root, { runId: "r1" });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).runId, "r1");
  assert.throws(() => claimRun(root), /already ran/);
  assert.equal(path.basename(file), "p67-run.json");
});

test("output with a token, a secret or a local path is refused", () => {
  const machine = { hostname: "zephyrhost.example", username: "qzuser" };
  assert.deepEqual(
    outputProblems("PR #4 merged at abc123 by alice", { machine }),
    [],
  );
  assert.ok(
    outputProblems(`token ghp_${"A".repeat(36)}`, { machine }).includes(
      "token",
    ),
  );
  assert.ok(
    outputProblems("x s3cr3t-value y", {
      secrets: ["s3cr3t-value"],
      machine,
    }).includes("secret"),
  );
  assert.ok(
    outputProblems("at /Users/qzuser/x", { machine }).includes("local-path"),
  );
  assert.ok(
    outputProblems("ran on zephyrhost", { machine }).includes(
      "privacy:machine-name",
    ),
  );
});

test("the fetch guard refuses outside writes and stops a private term on a public repository", async () => {
  const sent = [],
    stopped = [],
    fetch = guardedFetch({
      fetch: async (url, init) => {
        sent.push([init.method, String(url)]);
        return new Response(JSON.stringify({ node_id: "I_1" }), {
          status: 201,
        });
      },
      ...who,
      publicRepositories: ["avoozl-scratch/p67-upstream"],
      privateTerms: ["p67-private-abc"],
      onStopped: (what) => stopped.push(what),
    }),
    post = (repo, body) =>
      fetch(`${API}/repos/${repo}/issues/1/comments`, {
        method: "POST",
        body: JSON.stringify(body),
      });
  await assert.rejects(
    post("mtdowling/avoozl", { body: "hi" }),
    /P67 guard refused/,
  );
  await assert.rejects(
    post("avoozl-scratch/p67-upstream", { body: "see p67-private-abc" }),
    (e) => e.p67Stopped === true,
  );
  await post("avoozl-scratch/p67-plans-private", {
    body: "see p67-private-abc",
  });
  await post("avoozl-scratch/p67-upstream", { body: "clean" });
  assert.equal(sent.length, 2);
  assert.equal(stopped.length, 1);
});

test("waiting polls at most once per ten minutes", async () => {
  let clock = 0;
  const slept = [],
    pace = poller({
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
  await pace.wait();
  clock += 1000;
  await pace.wait();
  assert.deepEqual(slept, [10 * 60 * 1000 - 1000]);
  // A later process starts from the last poll it was handed.
  const next = poller({
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
    last: pace.last,
  });
  await next.wait();
  assert.equal(slept.at(-1), 10 * 60 * 1000);
});

test("a crashed run reruns one stage that ran and records it", () => {
  const state = {
    failure: "Command failed",
    finished: true,
    done: ["setup", "probes"],
    report: {
      steps: [{ name: "setup" }, { name: "probes", pushed: 2 }],
      stopped: [{ push: "message" }],
    },
  };
  assert.throws(() => recoverRun(state, "export"), /has not run/);
  recoverRun(state, "probes", "t1");
  assert.deepEqual(state.done, ["setup"]);
  assert.equal(state.finished, undefined);
  assert.deepEqual(state.report.stopped, []);
  assert.deepEqual(state.recoveries, [
    {
      at: "t1",
      crash: "Command failed",
      rerun: "probes",
      earlier: { name: "probes", pushed: 2 },
      stopped: [{ push: "message" }],
    },
  ]);
  assert.throws(() => recoverRun(state, "setup"), /did not crash/);
});
