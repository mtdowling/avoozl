// Task 39.1: `avoozl content hook` reads a PreToolUse event on stdin and
// exits 2 with a refusal that never shows the matched text.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
  CANARY = "zorblatcanary",
  config = temporaryDirectory("avoozl-hook-cli-config-");

function plainEnv() {
  const env = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|KIROCREW)(_|$)|^PORT$/.test(name))
      delete env[name];
  return env;
}

const run = (args, input) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: plainEnv(),
    input,
  });

test("content hook refuses a matching write and passes a clean one", () => {
  const root = temporaryDirectory("avoozl-hook-cli-");
  assert.equal(run(["init", root]).status, 0);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "fake-terms" }] },
    }),
  );
  const dir = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "fake-terms.txt"), `canary: ${CANARY}\n`);
  const event = (command) =>
      JSON.stringify({
        hook_event_name: "preToolUse",
        cwd: root,
        tool_name: "execute_bash",
        tool_input: { command },
      }),
    hook = (command) =>
      run(["content", "hook", "--workspace", root], event(command));
  const bad = hook(`gh issue comment 4 --body ${CANARY}`);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /fake-terms/);
  assert.ok(!bad.stderr.includes(CANARY));
  assert.equal(hook("gh issue comment 4 --body fine").status, 0);
  assert.equal(
    run(["content", "hook", "--workspace", root], "{not json").status,
    2,
  );
});
