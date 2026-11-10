import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  installOpenHandsCanvasApp,
  OPENHANDS_CANVAS_APP,
  openHandsCanvasAppStatus,
} from "../openhands-app.mjs";
import { OPENHANDS_VERSIONS } from "../providers/openhands.mjs";

test("the packaged Canvas App registers its declared Avoozl page", async () => {
  const manifest = JSON.parse(
      fs.readFileSync(
        path.join(OPENHANDS_CANVAS_APP.source, "canvas-extension.json"),
        "utf8",
      ),
    ),
    module = await import(
      pathToFileURL(path.join(OPENHANDS_CANVAS_APP.source, "extension.js")).href
    );
  const source = fs.readFileSync(
    path.join(OPENHANDS_CANVAS_APP.source, "extension.js"),
    "utf8",
  );
  const icon = fs.readFileSync(
    path.join(OPENHANDS_CANVAS_APP.source, manifest.icon),
    "utf8",
  );
  let registered,
    backendMounted = false;
  const dispose = module.activate({
    apiVersion: "1",
    extension: {
      name: manifest.name,
      version: manifest.version,
      resolvedRef: null,
    },
    backend: { id: "local", kind: "local", orgId: null },
    agentServer: {
      request: async ({ path: pathname }) => {
        assert.equal(
          pathname,
          "/api/canvas-extensions/installed/avoozl/backend",
        );
        return { state: "ready" };
      },
    },
    appBackendView: {
      mount({ container }) {
        assert.equal(container.id, "secure-backend");
        backendMounted = true;
        return () => {
          backendMounted = false;
        };
      },
    },
    registerPage(id, mount) {
      registered = { id, mount };
      return () => {
        registered = null;
      };
    },
  });
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.version, "0.1.4");
  assert.equal(manifest.backend.schema_version, 1);
  assert.equal(manifest.backend.health.path, "/api/health");
  for (const artifact of Object.values(manifest.backend.artifacts)) {
    const contents = fs.readFileSync(
      path.join(OPENHANDS_CANVAS_APP.source, artifact.path),
    );
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      artifact.sha256,
    );
  }
  assert.equal(manifest.contributes.pages[0].path, "/workspace");
  assert.match(icon, /fill="#ff5555"/);
  assert.match(source, /var\(--oh-color-primary/);
  assert.doesNotMatch(source, /<iframe|createElement\(["']iframe/);
  assert.match(source, /attachShadow/);
  assert.match(source, /createRoot/);
  assert.doesNotMatch(source, /process\.env\.NODE_ENV/);
  assert.equal(registered.id, "workspace");
  assert.equal(typeof registered.mount, "function");
  const disposeBackend = await registered.mount({
    container: { id: "secure-backend" },
    path: "",
    navigate() {},
  });
  assert.equal(backendMounted, true);
  disposeBackend();
  assert.equal(backendMounted, false);
  dispose();
  assert.equal(registered, null);
});

test("Canvas App installation is explicit, local, and enables the copied package", async () => {
  const calls = [];
  let enabled = false;
  const backend = () => ({
    name: "avoozl",
    state: enabled ? "ready" : "stopped",
    revision: "sha256:backend-revision",
    prepared_revision: enabled ? "sha256:backend-revision" : null,
  });
  const client = {
    server: {
      getServerInfo: async () => ({ version: OPENHANDS_VERSIONS.server }),
    },
    get: async (pathname) => {
      calls.push(["get", pathname]);
      return backend();
    },
    post: async (pathname, body) => {
      calls.push(["post", pathname, body]);
      return { name: "avoozl", enabled: false };
    },
    patch: async (pathname, body) => {
      calls.push(["patch", pathname, body]);
      enabled = true;
      return { name: "avoozl", enabled: true };
    },
  };
  const result = await installOpenHandsCanvasApp({
    client,
    settings: { host: "http://127.0.0.1:38100" },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.route, "/extensions/avoozl/workspace");
  assert.deepEqual(calls[0], [
    "post",
    "/api/canvas-extensions/install",
    { source: OPENHANDS_CANVAS_APP.source, force: true },
  ]);
  assert.deepEqual(calls[1], [
    "get",
    "/api/canvas-extensions/installed/avoozl/backend",
  ]);
  assert.deepEqual(calls[2], [
    "patch",
    "/api/canvas-extensions/installed/avoozl",
    { enabled: true, revision: "sha256:backend-revision" },
  ]);
  assert.deepEqual(calls[3], [
    "get",
    "/api/canvas-extensions/installed/avoozl/backend",
  ]);
  assert.equal(result.backend.state, "ready");
});

test("Canvas App status is read from the selected OpenHands backend", async () => {
  const client = {
    server: {
      getServerInfo: async () => ({ version: OPENHANDS_VERSIONS.server }),
    },
    get: async (pathname) =>
      pathname.endsWith("/backend")
        ? { state: "ready", revision: "sha256:backend-revision" }
        : { canvas_extensions: [{ name: "avoozl", enabled: true }] },
  };
  const status = await openHandsCanvasAppStatus({
    client,
    settings: { host: "http://127.0.0.1:38100" },
  });
  assert.equal(status.installed, true);
  assert.equal(status.enabled, true);
  assert.equal(status.backend.state, "ready");
});

test("unsupported hosts enable the native exact-origin fallback without backend consent", async () => {
  const calls = [];
  const client = {
    server: {
      getServerInfo: async () => ({ version: OPENHANDS_VERSIONS.server }),
    },
    get: async () => ({ name: "avoozl", state: "unsupported" }),
    post: async (pathname, body) => {
      calls.push(["post", pathname, body]);
      return { name: "avoozl", enabled: false };
    },
    patch: async (pathname, body) => {
      calls.push(["patch", pathname, body]);
      return { name: "avoozl", enabled: true };
    },
  };
  const result = await installOpenHandsCanvasApp({
    client,
    settings: { host: "http://127.0.0.1:38100" },
  });
  assert.deepEqual(calls.at(-1), [
    "patch",
    "/api/canvas-extensions/installed/avoozl",
    { enabled: true },
  ]);
  assert.equal(result.backend.state, "unsupported");
  assert.match(result.note, /cannot own/);
});
