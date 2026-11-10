import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentServerClient } from "@openhands/typescript-client/clients";
import { fail } from "./store.mjs";
import {
  OPENHANDS_VERSIONS,
  openHandsSettings,
} from "./providers/openhands.mjs";

export const OPENHANDS_CANVAS_APP = Object.freeze({
  name: "avoozl",
  route: "/extensions/avoozl/workspace",
  source: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../canvas-app",
  ),
});

function localAgentServerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Configure OpenHands with a valid HTTP URL.", 409);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "::1", "localhost"].includes(url.hostname)
  )
    fail(
      "Canvas App installation requires a loopback OpenHands Agent Server.",
      409,
    );
  return url.href.replace(/\/$/, "");
}

function ownedClient(settings) {
  return new AgentServerClient({
    host: localAgentServerUrl(settings.host),
    apiKey: settings.apiKey,
    timeout: 30000,
  });
}

function assertPackage(source) {
  const manifestPath = path.join(source, "canvas-extension.json");
  if (!fs.existsSync(manifestPath))
    fail("The packaged Avoozl Canvas App is missing.", 500);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    manifest.schema_version !== 1 ||
    manifest.name !== OPENHANDS_CANVAS_APP.name ||
    manifest.entrypoint !== "extension.js"
  )
    fail("The packaged Avoozl Canvas App manifest is invalid.", 500);
  return manifest;
}

async function compatible(client) {
  const info = await client.server.getServerInfo();
  if (info.version !== OPENHANDS_VERSIONS.server)
    fail(
      `OpenHands Agent Server ${OPENHANDS_VERSIONS.server} is required; found ${info.version || "an unknown version"}.`,
      409,
    );
  return info;
}

export async function installOpenHandsCanvasApp({
  source = OPENHANDS_CANVAS_APP.source,
  force = true,
  enable = true,
  settings = openHandsSettings(),
  client,
} = {}) {
  source = path.resolve(source);
  const manifest = assertPackage(source),
    own = !client,
    active = client || ownedClient(settings);
  try {
    const server = await compatible(active);
    const installed = await active.post("/api/canvas-extensions/install", {
      source,
      force: Boolean(force),
    });
    let enabled = installed.enabled;
    if (enable && !enabled) {
      const state = await active.patch(
        `/api/canvas-extensions/installed/${encodeURIComponent(manifest.name)}`,
        { enabled: true },
      );
      enabled = state.enabled;
    }
    return {
      name: manifest.name,
      version: manifest.version,
      source,
      installed: true,
      enabled: Boolean(enabled),
      route: OPENHANDS_CANVAS_APP.route,
      agentServer: settings.host,
      serverVersion: server.version,
      note: "Start Avoozl with the Canvas web origin explicitly allowed, then enter its loopback address on the App page. The address is browser-local and no credentials are copied into Canvas.",
    };
  } finally {
    if (own) active.close();
  }
}

export async function openHandsCanvasAppStatus({
  settings = openHandsSettings(),
  client,
} = {}) {
  const own = !client,
    active = client || ownedClient(settings);
  try {
    const server = await compatible(active),
      response = await active.get("/api/canvas-extensions/installed"),
      installed = (response.canvas_extensions || []).find(
        (entry) => entry.name === OPENHANDS_CANVAS_APP.name,
      );
    return {
      installed: Boolean(installed),
      enabled: Boolean(installed?.enabled),
      app: installed || null,
      route: OPENHANDS_CANVAS_APP.route,
      agentServer: settings.host,
      serverVersion: server.version,
    };
  } finally {
    if (own) active.close();
  }
}
