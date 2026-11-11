import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "./temporary.mjs";
import { waitFor } from "./fixtures.mjs";
import { workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";

const cli = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../cli.mjs",
);

// `serve --ahp` runs the site, the agent host, and the editor facade together.
// It reads the site's own port to record the endpoint the facade serves, which
// is only known once the site is listening.
test("serve --ahp brings up the site and a loopback-only authenticated facade", async (t) => {
  const root = temporaryDirectory("avoozl-serve-");
  const workspace = path.join(root, "workspace");
  initializeWorkspace(workspace, { name: "Serve fixture", port: 0 });
  const config = workspaceConfig({ workspace });
  const log = path.join(root, "serve.log");
  const child = spawn(
    process.execPath,
    [
      cli,
      "serve",
      "--workspace",
      workspace,
      "--ahp",
      "--port",
      "0",
      "--ahp-port",
      "0",
    ],
    { stdio: ["ignore", fs.openSync(log, "a"), fs.openSync(log, "a")] },
  );
  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    // The agent host is deliberately detached so it outlives a web reload.
    // A test must still stop the one it caused to start.
    const hostManifest = config.agentManifest;
    if (!fs.existsSync(hostManifest)) return;
    const host = JSON.parse(fs.readFileSync(hostManifest, "utf8"));
    try {
      await fetch(host.url + "/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + host.secret,
        },
        body: JSON.stringify({ action: "stop" }),
      });
    } catch {}
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        process.kill(host.pid, 0);
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    try {
      process.kill(host.pid, "SIGTERM");
    } catch {}
  });
  const output = await waitFor(
    () => {
      const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
      return /Avoozl: http:\/\/\S+/.test(text) &&
        /Agent host facade: ws:\/\/\S+/.test(text)
        ? text
        : null;
    },
    { timeoutMs: 40000, label: "the site and the facade to start" },
  );
  assert.doesNotMatch(
    output,
    /Cannot read properties/,
    "the facade must not be started before the site's port is known",
  );
  const site = output.match(/Avoozl: (http:\/\/\S+)/)[1];
  const facade = output.match(/Agent host facade: (ws:\/\/\S+)/)[1];
  // Loopback only. A listener that hands out owned provider sessions is never
  // published on another interface.
  assert.match(site, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(facade, /^ws:\/\/127\.0\.0\.1:\d+$/);

  const health = await fetch(site + "/api/health").then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.listenHost, "127.0.0.1");

  // No anonymous access, even on loopback.
  const anonymous = await fetch(facade.replace("ws://", "http://") + "/health");
  assert.equal(anonymous.status, 401);

  const manifestPath = config.ahp.manifest;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.workspaceEndpoint, site);
  assert.equal(
    (fs.statSync(manifestPath).mode & 0o777).toString(8),
    "600",
    "the manifest holds client credentials",
  );
  assert.equal(
    (fs.statSync(config.ahp.tokens).mode & 0o777).toString(8),
    "600",
  );
  assert.deepEqual(Object.keys(manifest.clients).sort(), [
    "editor",
    "observer",
  ]);
  // The credential is its own field. The address stays clean, because the
  // editor derives a session's identity from it and a query string forces an
  // opaque encoding.
  assert.equal(manifest.clients.editor.address, facade);
  assert.match(manifest.clients.editor.connectionToken, /^[0-9a-f-]{30,}$/);
  const authorized = await fetch(
    facade.replace("ws://", "http://") + "/health",
    {
      headers: {
        Authorization: "Bearer " + manifest.clients.editor.connectionToken,
      },
    },
  ).then((r) => r.json());
  assert.equal(authorized.ok, true);
  assert.equal(authorized.workspaceId, manifest.workspaceId);
  assert.ok(authorized.protocolVersions.includes("0.9.0"));
});
