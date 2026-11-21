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
import { scratchUpstream } from "./scratch-upstream.ts";

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
