// Removed commands and operations answer with their replacement and change
// nothing (worker-paths WP7.1, WP7.2).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MOVED_OPERATIONS } from "../moved-operations.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

function env(home) {
  const out = { ...process.env, XDG_CONFIG_HOME: home, HOME: home };
  for (const name of Object.keys(out))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|KIROCREW)(_|$)/.test(name))
      delete out[name];
  return out;
}

function workspace(t) {
  const root = temporaryDirectory("avoozl-moved-");
  const init = spawnSync(process.execPath, [cli, "init", root], {
    encoding: "utf8",
    env: env(root),
  });
  assert.equal(init.status, 0, init.stderr);
  return root;
}

// Every file under the workspace with its bytes, so a changed byte shows.
function files(root) {
  const out = {};
  for (const name of fs.readdirSync(root, { recursive: true })) {
    const file = path.join(root, name);
    if (fs.statSync(file).isFile())
      out[name] = fs.readFileSync(file).toString("base64");
  }
  return out;
}

const REMOVED = [
  [["report", "a", "--slot", "s", "--kind", "done"], /avoozl claim TASK/, 1],
  [["claim", "a", "--slot", "s"], /avoozl claim TASK/, 1],
  [["next", "--hook"], /avoozl claim TASK/, 1],
  [["register-session", "--task", "a"], /plans_rediscover_sessions/, 1],
  // A session-start hook never fails the session it runs in.
  [["session-hook"], /plans_rediscover_sessions/, 0],
  [["runner", "accept", "-"], /avoozl worker pull/, 1],
  [["runner", "handoff", "x.json", "--host", "h"], /avoozl worker pull/, 1],
  [["runner", "pull", "--host", "h"], /avoozl worker pull/, 1],
];

test("each removed command prints one line naming its replacement and changes nothing", (t) => {
  const root = workspace(t),
    before = files(root);
  for (const [args, replacement, status] of REMOVED) {
    const out = spawnSync(
      process.execPath,
      [cli, ...args, "--workspace", root],
      { encoding: "utf8", env: env(root), input: "{}" },
    );
    assert.equal(out.status, status, args.join(" "));
    const lines = out.stdout.trim().split("\n");
    assert.equal(lines.length, 1, args.join(" "));
    assert.match(lines[0], replacement, args.join(" "));
  }
  assert.deepEqual(files(root), before);
});

test("each removed operation answers with its replacement and writes nothing", async (t) => {
  const root = temporaryDirectory("avoozl-moved-ops-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  const ops = new Operations(store, { workspaceRoot: root }),
    before = JSON.stringify(store.read());
  for (const name of [
    "remote.accept",
    "remote.handoff",
    "remote.pull",
    "session.register",
    "session.discover",
  ]) {
    assert.ok(MOVED_OPERATIONS.has(name), name);
    const answer = await ops.execute(name, {});
    assert.equal(answer.moved, true, name);
    assert.equal(answer.message.split("\n").length, 1, name);
  }
  assert.equal(JSON.stringify(store.read()), before);
});
