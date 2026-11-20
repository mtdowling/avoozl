// Guarded pushes and merges: a fast-forward refuses when the remote moved,
// and a head-guarded merge lands only the head that was checked. Local
// scratch repositories and a fake GitHub only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "../../git/git.mjs";
import { guardedFastForward, headGuardedMerge } from "../guarded-push.mjs";
import { scratchUpstream } from "./scratch-upstream.mjs";

async function repos(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { upstream, dirs, head } = await scratchUpstream(root, ["driver"]),
    driver = dirs.driver;
  const commit = async (file, text) => {
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
  const calls = [];
  const github = {
    mergePullRequest: async (repository, number, { sha }) => {
      calls.push(sha);
      if (sha !== "a".repeat(40)) {
        const error = Error("Head branch was modified");
        error.status = 409;
        throw error;
      }
      return { merged: true };
    },
  };
  assert.equal(
    await headGuardedMerge(github, "acme/app", 3, "b".repeat(40)),
    false,
  );
  assert.equal(
    await headGuardedMerge(github, "acme/app", 3, "a".repeat(40)),
    true,
  );
  assert.equal(calls.length, 2);
});
