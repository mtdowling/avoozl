// Removed commands and operations are deleted: a call to one is refused as
// unknown and changes nothing (worker-paths WP7.1, WP7.2; owner decision
// 2026-11-18, no backward compatibility).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Operations } from "../api/operations.mjs";
import { Store } from "../store/store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

function env(home) {
  const out = { ...process.env, XDG_CONFIG_HOME: home, HOME: home };
  for (const name of Object.keys(out))
    if (/^(AVOOZL|KIROCREW)(_|$)/.test(name)) delete out[name];
  return out;
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

const host = "--" + "host";
const REMOVED = [
  [
    ["report", "a", "--slot", "s", "--kind", "done"],
    /Unknown command or operation report\./,
  ],
  [
    ["register-session", "--task", "a"],
    /Unknown command or operation register-session\./,
  ],
  [["session-hook"], /Unknown command or operation session-hook\./],
  [["runner", "accept", "-"], /^Use runner status\|report\.$/m],
  [
    ["runner", "handoff", "x.json", host, "h"],
    /^Use runner status\|report\.$/m,
  ],
  [["runner", "pull", host, "h"], /^Use runner status\|report\.$/m],
];

test("each removed command is refused and changes nothing", () => {
  const root = temporaryDirectory("avoozl-removed-");
  const init = spawnSync(process.execPath, [cli, "init", root], {
    encoding: "utf8",
    env: env(root),
  });
  assert.equal(init.status, 0, init.stderr);
  const before = files(root);
  for (const [args, refusal] of REMOVED) {
    const out = spawnSync(
      process.execPath,
      [cli, ...args, "--workspace", root],
      {
        encoding: "utf8",
        env: env(root),
        input: "{}",
      },
    );
    assert.equal(out.status, 1, args.join(" "));
    assert.match(out.stderr, refusal, args.join(" "));
    assert.equal(out.stdout, "", args.join(" "));
  }
  assert.deepEqual(files(root), before);
});

test("each removed operation is refused as unknown and writes nothing", async (t) => {
  const root = temporaryDirectory("avoozl-removed-ops-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize(snapshot());
  const ops = new Operations(store, { workspaceRoot: root }),
    before = JSON.stringify(store.read());
  for (const name of [
    "remote.accept",
    "remote.handoff",
    "remote.pull",
    "session.register",
    "session.discover",
  ])
    await assert.rejects(ops.execute(name, {}), /Unknown operation/, name);
  assert.equal(JSON.stringify(store.read()), before);
});
