import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectCheckout } from "../git.mjs";

function checkout(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-detect-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, name);
  fs.mkdirSync(root);
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q", "-b", "trunk");
  git("-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "x");
  return { root: fs.realpathSync(root), git };
}

test("detect reads a checkout's root, branch, GitHub remote and ID without changing it", async (t) => {
  const { root, git } = checkout(t, "My_Service");
  git("remote", "add", "origin", "git@github.com:octo/my-service.git");
  fs.mkdirSync(path.join(root, "sub"));
  const found = await detectCheckout(path.join(root, "sub"));
  assert.deepEqual(found, {
    root,
    baseBranch: "trunk",
    currentBranch: "trunk",
    remote: "origin",
    github: "octo/my-service",
    id: "my-service",
  });
});

test("detect without a remote, and refusals for bad folders", async (t) => {
  const { root } = checkout(t, "local");
  const found = await detectCheckout(root);
  assert.equal(found.github, null);
  assert.equal(found.remote, null);
  await assert.rejects(detectCheckout("relative/path"), /absolute path/);
  await assert.rejects(detectCheckout(path.join(root, "missing")), /does not exist/);
  await assert.rejects(detectCheckout(os.tmpdir()), /not a Git checkout/);
});
