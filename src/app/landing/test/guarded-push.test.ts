// Guarded pushes and merges: a fast-forward refuses when the remote moved,
// and a head-guarded merge lands only the head that was checked. Local
// scratch repositories and a fake GitHub only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { git } from "../../git/git.ts";
import { guardedFastForward, headGuardedMerge } from "../guarded-push.ts";
import { pushLease, scratchUpstream } from "./scratch-upstream.ts";
import { runnerId } from "../../workers/claims.ts";

async function repos(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { upstream, dirs, head } = await scratchUpstream(root, ["driver"]),
    driver = dirs.driver;
  const commit = async (file: string, text: string) => {
    fs.writeFileSync(path.join(driver, file), text);
    await git(driver, ["add", "."]);
    await git(driver, ["commit", "-q", "-m", file]);
    return git(driver, ["rev-parse", "HEAD"]);
  };
  return { driver, upstream, commit, head };
}

test("a guarded fast-forward pushes from the expected base only", async (t) => {
  const r = await repos(t),
    base = await r.head(),
    candidate = await r.commit("b.txt", "b\n");
  // A base that is not the remote's head refuses and pushes nothing.
  assert.equal(
    await guardedFastForward(r.driver, {
      url: r.upstream,
      branch: "main",
      base: candidate,
      candidate,
    }),
    false,
  );
  assert.equal(await r.head(), base);
  assert.equal(
    await guardedFastForward(r.driver, {
      url: r.upstream,
      branch: "main",
      base,
      candidate,
    }),
    true,
  );
  assert.equal(await r.head(), candidate);
});

test("a head-guarded merge lands only the head that was checked", async () => {
  const calls: unknown[] = [];
  const github = {
    mergePullRequest: async (
      _repository: string,
      _number: number,
      { sha }: Record<string, unknown>,
    ) => {
      calls.push(sha);
      if (sha !== "a".repeat(40)) {
        throw Object.assign(Error("Head branch was modified"), {
          status: 409,
        });
      }
      return { merged: true };
    },
  };
  assert.equal(
    await headGuardedMerge(github, "acme/app", 3, "b".repeat(40), "squash"),
    false,
  );
  assert.equal(
    await headGuardedMerge(github, "acme/app", 3, "a".repeat(40), "squash"),
    true,
  );
  assert.equal(calls.length, 2);
});

// Workflow rules 15.3 and 15.9: the leases are read right before the push to
// the base, and a newer lease this runner did not take, or a released one,
// stops the landing.
test("a guarded land reads the claim's leases first and lands only while this runner holds the newest", async (t) => {
  const r = await repos(t),
    base = await r.head(),
    candidate = await r.commit("b.txt", "b\n"),
    ours = String(await runnerId(r.driver)),
    claims = ["avoozl/parser/p-2"],
    lease = (generation: number, runner: string, released = false) =>
      pushLease(r.driver, r.upstream, { generation, base, runner, released }),
    land = () =>
      guardedFastForward(r.driver, {
        url: r.upstream,
        branch: "main",
        base,
        candidate,
        claims,
      }),
    merges: unknown[] = [],
    // GitHub's lease reads, answered from the upstream's own refs.
    github = {
      branchesUnder: async (_repository: string, prefix: string) =>
        (
          await git(r.driver, [
            "ls-remote",
            r.upstream,
            `refs/heads/${prefix}*`,
          ])
        )
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [sha, ref] = line.split(/\s+/);
            return { ref, object: { sha } };
          }),
      commit: async (_repository: string, sha: string) => {
        await git(r.driver, [
          "fetch",
          "-q",
          r.upstream,
          "+refs/heads/*:refs/remotes/up/*",
        ]);
        return {
          commit: {
            message: await git(r.driver, ["log", "-1", "--format=%B", sha]),
          },
        };
      },
      mergePullRequest: async () => {
        merges.push(1);
        return { merged: true };
      },
    },
    merge = () =>
      headGuardedMerge(
        github,
        "acme/app",
        3,
        candidate,
        "squash",
        {},
        {
          root: r.driver,
          branch: claims[0],
        },
      );
  await lease(1, ours);
  await lease(2, "runner-other");
  await assert.rejects(land(), /stops work on p-2 and pushes nothing/);
  await assert.rejects(merge(), /stops work on p-2/);
  await lease(3, ours, true);
  await assert.rejects(land(), /released/);
  assert.equal(await r.head(), base, "nothing reached the base");
  assert.deepEqual(merges, [], "no merge was asked for");
  await lease(4, ours);
  assert.equal(await merge(), true);
  assert.equal(await land(), true);
  assert.equal(await r.head(), candidate);
});
