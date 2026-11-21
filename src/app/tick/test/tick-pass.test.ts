// `avoozl tick` is one pass and an exit (MS1, MS2), driven through the real
// CLI on an isolated machine, and the source rules of MS1.2.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { loopLockPaths, tryLock } from "../../executors/pass-lock.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { ownMachineEnv } from "../../test/own-machine.ts";

const CLI = fileURLToPath(new URL("../../../../cli.ts", import.meta.url));
const SRC = fileURLToPath(new URL("../../../", import.meta.url));

// One parsed `avoozl tick` result line.
type Ticked = { root?: string; tick?: string; skipped?: string };

function machine(t: TestContext) {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tick-")),
  );
  const env = ownMachineEnv(root);
  const run = (args: string[], extra: Record<string, string> = {}) =>
    spawnSync(process.execPath, [CLI, ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 120_000,
    });
  t.after(() =>
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 200,
    }),
  );
  // Two workspaces in this machine's catalog.
  const workspaces = ["one", "two"].map((name) => {
    const folder = path.join(root, name);
    for (const args of [
      ["init", folder, "--name", name],
      ["workspace", "add", name, "--root", folder],
    ]) {
      const done = run(args);
      assert.equal(done.status, 0, `${args.join(" ")}: ${done.stderr}`);
    }
    return folder;
  });
  return { root, env, run, workspaces };
}

const ticked = (out: string) =>
  (JSON.parse(out) as Ticked[])
    .filter((result) => result.root)
    .map((result) => [
      path.basename(String(result.root)),
      result.tick ?? result.skipped,
    ])
    .sort();

test("avoozl tick passes every enabled workspace once, records it for status, and exits holding nothing", (t) => {
  const m = machine(t);
  const begun = Date.now();
  const tick = m.run(["tick"]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.deepEqual(ticked(tick.stdout), [
    ["one", "ran"],
    ["two", "ran"],
  ]);
  // The process exited, and it left no lock held behind it.
  for (const folder of m.workspaces) {
    const lock = tryLock(
      loopLockPaths(workspaceConfig({ workspace: folder }).dbPath).lock,
    );
    assert.equal(lock.held, true, folder);
    lock.close();
  }
  const status = m.run(["status"]);
  assert.equal(status.status, 0, status.stderr);
  const passes = JSON.parse(status.stdout).machine.passes;
  const roots = (passes as { root: string; at: string }[]).map((pass) =>
    path.basename(pass.root),
  );
  assert.deepEqual(roots.sort(), ["one", "two"]);
  for (const pass of passes as { at: string }[])
    assert.ok(Date.parse(pass.at) >= begun - 1000);
});

test("avoozl tick --workspace passes only that workspace", (t) => {
  const m = machine(t);
  const tick = m.run(["tick", "--workspace", m.workspaces[1]]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.deepEqual(ticked(tick.stdout), [["two", "ran"]]);
});

test("a tick that overlaps another skips the workspace the other holds", (t) => {
  const m = machine(t);
  const held = tryLock(
    loopLockPaths(workspaceConfig({ workspace: m.workspaces[0] }).dbPath).lock,
  );
  assert.ok(held.held);
  try {
    const tick = m.run(["tick"]);
    assert.equal(tick.status, 0, tick.stderr);
    const [one, two] = ticked(tick.stdout);
    assert.match(String(one[1]), /Another tick .* runs this workspace's pass/);
    assert.deepEqual(two, ["two", "ran"]);
  } finally {
    held.close();
  }
});

test("start, stop, supervisor and serve are unknown commands", (t) => {
  const m = machine(t);
  for (const args of [
    ["start"],
    ["stop"],
    ["supervisor"],
    ["serve"],
    ["serve", "link"],
  ]) {
    const found = m.run(args);
    assert.notEqual(found.status, 0, args.join(" "));
    assert.match(found.stderr, /is not a command/, args.join(" "));
  }
});

test("a process child is refused link", (t) => {
  const m = machine(t);
  const found = m.run(["link"], { AVOOZL_CHILD: "1" });
  assert.notEqual(found.status, 0);
  assert.match(found.stderr, /A process child may not run avoozl link/);
});

// MS1.2: the tick pass is the only caller of the drains, and nothing runs
// the tick on a timer of its own.
test("only the tick pass drains requests, and nothing runs the tick on a timer", () => {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test") walk(file);
      } else if (/\.(mjs|ts)$/.test(file)) files.push(file);
    }
  };
  walk(SRC);
  const rel = (file: string) => path.relative(SRC, file).replaceAll("\\", "/");
  const callers = (pattern: RegExp) =>
    files
      .filter((file) => pattern.test(fs.readFileSync(file, "utf8")))
      .map(rel);
  for (const name of ["drainProcessRequests", "drainCheckRuns"]) {
    const found = callers(new RegExp(`\\b${name}\\(`)).filter(
      (file) =>
        !/^app\/(executors\/process|delivery\/check-runs)\.(mjs|ts)$/.test(
          file,
        ),
    );
    assert.deepEqual(
      found,
      ["app/tick/tick-pass.ts"],
      `${name} is called outside the pass`,
    );
  }
  const timed = files
    .filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return (
        /["']workspace\.tick["']|\brunPass\(/.test(text) &&
        /setInterval|setTimeout/.test(text)
      );
    })
    .map(rel);
  assert.deepEqual(timed, [], "the tick runs on a timer");
});
