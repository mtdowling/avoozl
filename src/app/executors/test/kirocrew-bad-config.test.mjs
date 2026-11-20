// A workspace whose .avoozl.json has a key the schema does not list: the app
// backend and the MCP server still start, and every caller gets the
// configuration's own refusal instead of a page with no backend.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkspaceRegistry } from "../../settings/host-config.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { ownMachineEnv } from "../../test/own-machine.mjs";
import { SECRET, sign } from "../../test/signed-principal.mjs";

const cli = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));
const REFUSAL =
  /Unknown setting "oldKey" in repository Avoozl configuration at .*\.avoozl\.json\. Remove it\./;

// A registered, initialized workspace, then one unknown key in its file.
function badWorkspace() {
  const root = temporaryDirectory(),
    env = ownMachineEnv(root),
    served = path.join(root, "served");
  initializeWorkspace(served);
  const registry = new WorkspaceRegistry({ env });
  registry.add("bad", { root: served });
  registry.close();
  const file = path.join(served, ".avoozl.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), oldKey: 1 }),
  );
  return { env, served };
}

test("the app backend starts on a bad .avoozl.json and the page reads its error", async (t) => {
  const { env, served } = badWorkspace();
  const child = spawn(
    process.execPath,
    [cli, "app-backend", "--workspace", served],
    {
      env: { ...env, KIROCREW_PROXY_SECRET: SECRET, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => child.kill());
  let output = "";
  const port = await new Promise((resolve, reject) => {
    const read = (chunk) => {
      output += chunk;
      const found = /listening on 127\.0\.0\.1:(\d+)/.exec(output);
      if (found) resolve(Number(found[1]));
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("exit", (code) =>
      reject(Error(`app-backend exited ${code}: ${output}`)),
    );
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, app: "avoozl" });

  const call = async (value) => {
    const body = JSON.stringify(value),
      response = await fetch(base + "/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KiroCrew-Principal": sign(body),
        },
        body,
      });
    return { status: response.status, body: await response.json() };
  };
  const listed = await call({ operation: "workspaces.list" });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const [item] = listed.body.result.items;
  assert.equal(item.id, "bad");
  assert.equal(item.served, true);
  assert.match(item.configError, REFUSAL);

  // Its operations refuse with the same message, named or served.
  for (const workspaceId of ["bad", undefined]) {
    const read = await call({
      operation: "workspace.tick.health",
      workspaceId,
    });
    assert.equal(read.status, 409, JSON.stringify(read.body));
    assert.match(read.body.error, REFUSAL);
  }
});

test("the CLI refuses and the MCP server answers with the configuration's error", () => {
  const { env, served } = badWorkspace();
  const status = spawnSync(
    process.execPath,
    [cli, "status", "--workspace", served],
    { env, encoding: "utf8" },
  );
  assert.equal(status.status, 1);
  assert.match(status.stderr, REFUSAL);
  assert.doesNotMatch(status.stderr, /\n\s+at /);

  const mcp = spawnSync(
    process.execPath,
    [cli, "mcp", "--kirocrew", "--workspace", served],
    {
      env,
      encoding: "utf8",
      input:
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "plans_task",
            arguments: { action: "sessions", input: { id: "t" } },
          },
        }) + "\n",
    },
  );
  assert.equal(mcp.status, 0, mcp.stderr);
  const reply = JSON.parse(mcp.stdout.trim().split("\n")[0]);
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, REFUSAL);
});
