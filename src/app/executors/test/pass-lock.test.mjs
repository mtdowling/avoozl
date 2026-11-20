// The pass locks (MS2, design D3): an operating-system lock, so eight ticks
// at once leave one holder and a killed holder frees it.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { loopLockPaths, takeLock, tryLock } from "../pass-lock.mjs";

const LOCK = new URL("../pass-lock.mjs", import.meta.url).href;

// A tick: waits for the barrier file, takes the workspace's pass lock, prints
// "held" or "refused <pid>", and keeps a held lock until its stdin closes.
const STARTER = `
import fs from "node:fs";
import { loopLockPaths, takeLock } from ${JSON.stringify(LOCK)};
const [database, barrier] = process.argv.slice(2);
while (!fs.existsSync(barrier)) await new Promise((r) => setTimeout(r, 5));
const taken = takeLock(loopLockPaths(database), { pid: process.pid });
if (taken.held) {
  console.log("held " + process.pid);
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
} else {
  console.log("refused " + taken.holder?.pid);
  process.exit(0);
}
`;

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-lock-"));
  const children = [];
  t.after(async () => {
    for (const child of children) child.kill("SIGKILL");
    await Promise.all(
      children.map(
        (child) =>
          child.exitCode !== null ||
          child.signalCode !== null ||
          new Promise((resolve) => child.once("exit", resolve)),
      ),
    );
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  });
  fs.writeFileSync(path.join(root, "starter.mjs"), STARTER);
  const start = (state, barrier) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "starter.mjs"), state, barrier],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    children.push(child);
    child.line = new Promise((resolve) => {
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
        if (out.includes("\n")) resolve(out.trim());
      });
      child.once("exit", () => resolve(out.trim() || "exited"));
    });
    return child;
  };
  return { root, start };
}

test("an exclusive lock is held for the handle's life and refused at once to a second opener", (t) => {
  const { root } = scratch(t);
  const file = path.join(root, "one.sqlite");
  const first = tryLock(file);
  assert.equal(first.held, true);
  const begun = Date.now();
  assert.equal(tryLock(file).held, false);
  assert.ok(Date.now() - begun < 1000, "the refusal does not wait");
  first.close();
  const again = tryLock(file);
  assert.equal(again.held, true);
  again.close();
});

test("eight ticks behind one barrier leave one holder, and a killed holder is replaced within 5 seconds", async (t) => {
  const { root, start } = scratch(t);
  const state = path.join(root, "workspace.sqlite");
  const barrier = path.join(root, "go");
  const first = Array.from({ length: 8 }, () => start(state, barrier));
  fs.writeFileSync(barrier, "");
  const lines = await Promise.all(first.map((child) => child.line));
  const held = first.filter((_, index) => lines[index].startsWith("held"));
  assert.equal(held.length, 1);
  const refused = lines.filter((line) => line.startsWith("refused"));
  assert.equal(refused.length, 7);
  for (const line of refused) assert.equal(line, `refused ${held[0].pid}`);

  held[0].kill("SIGKILL");
  await new Promise((resolve) => held[0].once("exit", resolve));
  const barrier2 = path.join(root, "go2");
  const second = Array.from({ length: 8 }, () => start(state, barrier2));
  fs.writeFileSync(barrier2, "");
  const begun = Date.now();
  const lines2 = await Promise.all(second.map((child) => child.line));
  assert.equal(lines2.filter((line) => line.startsWith("held")).length, 1);
  assert.ok(Date.now() - begun < 5000);
});

test("two state folders on one workspace leave one pass lock holder, named by its record, and the next takes over", (t) => {
  const { root } = scratch(t);
  const paths = loopLockPaths(path.join(root, "workspace.sqlite"));
  const a = takeLock(paths, { pid: 1, stateDirectory: "a" });
  const b = takeLock(paths, { pid: 2, stateDirectory: "b" }, { tries: 1 });
  assert.equal(a.held, true);
  assert.equal(b.held, false);
  assert.equal(b.holder.stateDirectory, "a");
  a.close();
  const c = takeLock(paths, { pid: 2, stateDirectory: "b" });
  assert.equal(c.held, true);
  c.close();
  assert.ok(fs.existsSync(paths.lock), "the lock file is never deleted");
});
