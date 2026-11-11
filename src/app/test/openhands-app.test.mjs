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
  setupOpenHandsAgents,
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
    ),
    canvasSource = fs.readFileSync(
      path.join(OPENHANDS_CANVAS_APP.source, "../src/web/canvas.tsx"),
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
  assert.equal(manifest.version, "0.1.18");
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
  assert.match(source, /\/conversations/);
  assert.match(source, /avoozl:openhands-conversation/);
  assert.match(canvasSource, /event\.source === frame\?\.contentWindow/);
  assert.match(source, /Open the persistent project Driver/);
  assert.match(source, /Shape work from project context/);
  assert.doesNotMatch(source, /avoozl:openhands-route/);
  assert.doesNotMatch(source, /process\.env\.NODE_ENV/);
  const pluginRoot = path.resolve(
      OPENHANDS_CANVAS_APP.source,
      "../src/app/providers/openhands-plugin",
    ),
    pluginManifest = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, ".plugin/plugin.json"), "utf8"),
    ),
    mcp = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"),
    ),
    skill = fs.readFileSync(
      path.join(pluginRoot, "skills/avoozl/SKILL.md"),
      "utf8",
    );
  assert.equal(pluginManifest.name, "avoozl");
  assert.equal(pluginManifest.version, OPENHANDS_VERSIONS.plugin);
  assert.equal(
    pluginManifest.automation.schema_version,
    "openhands.automation.plugin.v1",
  );
  assert.equal(pluginManifest.automation.entrypoint.runner, "script");
  assert.equal(
    pluginManifest.automation.entrypoint.command,
    "python3 avoozl_github_intake.py",
  );
  assert.equal(pluginManifest.automation.runtime.agent_profile, undefined);
  assert.equal(pluginManifest.automation.runtime.llm_profile, undefined);
  assert.ok(
    pluginManifest.automation.config_schema.required.includes("callback_url"),
  );
  assert.ok(
    pluginManifest.automation.config_schema.required.includes(
      "ingest_secret_name",
    ),
  );
  const intakeWorker = fs.readFileSync(
    path.join(pluginRoot, "scripts", "avoozl_github_intake.py"),
    "utf8",
  );
  assert.match(intakeWorker, /launches an agent/);
  assert.match(intakeWorker, /method="GET"/);
  assert.match(intakeWorker, /"X-Avoozl-Intake-Version": "2"/);
  assert.match(intakeWorker, /"avoozl.github-intake.v2"/);
  assert.match(intakeWorker, /"observation-only"/);
  assert.match(intakeWorker, /repository_private/);
  assert.match(intakeWorker, /"repository-complete"/);
  assert.match(intakeWorker, /"pull-request"/);
  assert.match(skill, /^---\nname: avoozl\b/);
  assert.equal(mcp.mcpServers.avoozl.url, "${AVOOZL_MCP_URL}");
  assert.equal(
    mcp.mcpServers.avoozl.headers.Authorization,
    "Bearer ${AVOOZL_MCP_TOKEN}",
  );
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
      if (pathname === "/api/plugins/install")
        return { name: "avoozl", enabled: false };
      return { name: "avoozl", enabled: false };
    },
    patch: async (pathname, body) => {
      calls.push(["patch", pathname, body]);
      if (pathname === "/api/plugins/installed/avoozl")
        return { name: "avoozl", enabled: true };
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
    "/api/plugins/install",
    {
      source: path.resolve(
        OPENHANDS_CANVAS_APP.source,
        "../src/app/providers/openhands-plugin",
      ),
      force: true,
    },
  ]);
  assert.deepEqual(calls[1], [
    "patch",
    "/api/plugins/installed/avoozl",
    { enabled: true },
  ]);
  assert.deepEqual(calls[2], [
    "post",
    "/api/canvas-extensions/install",
    { source: OPENHANDS_CANVAS_APP.source, force: true },
  ]);
  assert.deepEqual(calls[3], [
    "get",
    "/api/canvas-extensions/installed/avoozl/backend",
  ]);
  assert.deepEqual(calls[4], [
    "patch",
    "/api/canvas-extensions/installed/avoozl",
    { enabled: true, revision: "sha256:backend-revision" },
  ]);
  assert.deepEqual(calls[5], [
    "get",
    "/api/canvas-extensions/installed/avoozl/backend",
  ]);
  assert.equal(result.backend.state, "ready");
  assert.equal(result.integration.enabled, true);
  assert.deepEqual(result.integration.skills, ["avoozl"]);
  assert.equal(
    result.integration.mcpServers.avoozl.bearerSecret,
    "AVOOZL_MCP_TOKEN",
  );
  assert.ok(
    !calls.some(([, pathname]) => pathname.startsWith("/api/settings/mcp")),
  );
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

test("unsupported hosts enable the separately managed exact-origin backend", async () => {
  const calls = [];
  const client = {
    server: {
      getServerInfo: async () => ({ version: OPENHANDS_VERSIONS.server }),
    },
    get: async () => ({ name: "avoozl", state: "unsupported" }),
    post: async (pathname, body) => {
      calls.push(["post", pathname, body]);
      if (pathname === "/api/plugins/install")
        return { name: "avoozl", enabled: true };
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

test("agent setup installs provider-neutral profiles and activates a verified default", async () => {
  const calls = [],
    saved = new Map(),
    ids = {
      "avoozl-claude-code": "profile-claude",
      "avoozl-codex": "profile-codex",
    },
    client = {
      server: {
        getServerInfo: async () => ({ version: OPENHANDS_VERSIONS.server }),
      },
      async get(pathname) {
        calls.push(["get", pathname]);
        if (pathname === "/api/agent-profiles")
          return {
            profiles: [...saved.entries()].map(([name, profile]) => ({
              id: ids[name],
              name,
              agent_kind: profile.agent_kind,
            })),
            active_agent_profile_id: null,
          };
        const name = decodeURIComponent(pathname.split("/").at(-1));
        return { name, profile: saved.get(name) };
      },
      async post(pathname, body) {
        calls.push(["post", pathname, body]);
        if (pathname === "/api/plugins/install")
          return { name: "avoozl", enabled: true };
        if (pathname === "/api/acp/models")
          return {
            current_model_id: "default",
            available_models: [{ model_id: "default" }],
            error: null,
          };
        if (pathname.endsWith("/materialize"))
          return { valid: true, errors: [] };
        if (pathname.endsWith("/activate")) return { id: "activated" };
        const name = decodeURIComponent(pathname.split("/").at(-1));
        saved.set(name, body);
        return { name };
      },
    };

  const result = await setupOpenHandsAgents({
    client,
    settings: { host: "http://127.0.0.1:38100" },
    defaultAgent: "codex",
  });

  assert.equal(result.activeProfile, "avoozl-codex");
  assert.deepEqual(
    result.configured.map((entry) => entry.ready),
    [true, true],
  );
  assert.equal(result.integration.enabled, true);
  assert.deepEqual(saved.get("avoozl-claude-code").secret_refs, [
    "AVOOZL_MCP_URL",
    "AVOOZL_MCP_TOKEN",
    "ANTHROPIC_API_KEY",
  ]);
  assert.deepEqual(saved.get("avoozl-codex").secret_refs, [
    "AVOOZL_MCP_URL",
    "AVOOZL_MCP_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_AUTH_JSON",
  ]);
  assert.ok(
    calls.some(
      ([kind, pathname]) =>
        kind === "post" &&
        pathname === "/api/agent-profiles/profile-codex/activate",
    ),
  );
  assert.ok(
    !calls.some(([, pathname]) => pathname.startsWith("/api/settings/mcp")),
  );
  assert.doesNotMatch(JSON.stringify({ calls, result }), /aws|bedrock|asbx/i);
});

test("agent setup preserves managed profile customization on retries", async () => {
  const existing = {
      id: "profile-claude",
      revision: 4,
      name: "avoozl-claude-code",
      agent_kind: "acp",
      acp_server: "claude-code",
      acp_model: "preferred",
      acp_session_mode: "isolated",
      acp_prompt_timeout: 99,
      acp_startup_timeout: 44,
      acp_command: "custom-command",
      acp_args: ["--flag"],
      mcp_server_refs: ["team-tools"],
      integration_refs: ["source-control"],
      secret_refs: ["UNSAFE_EXTRA"],
    },
    saved = [],
    client = {
      server: {
        getServerInfo: async () => ({ version: OPENHANDS_VERSIONS.server }),
      },
      async get(pathname) {
        if (pathname === "/api/agent-profiles")
          return {
            profiles: [
              {
                id: existing.id,
                name: existing.name,
                agent_kind: existing.agent_kind,
              },
            ],
            active_agent_profile_id: existing.id,
          };
        return { name: existing.name, profile: existing };
      },
      async post(pathname, body) {
        if (pathname === "/api/plugins/install")
          return { name: "avoozl", enabled: true };
        if (pathname.endsWith("/materialize"))
          return { valid: true, errors: [] };
        if (pathname.endsWith("/activate")) return {};
        saved.push(body);
        return {};
      },
    };

  const result = await setupOpenHandsAgents({
    agents: ["claude-code"],
    verify: false,
    client,
    settings: { host: "http://127.0.0.1:38100" },
  });

  assert.equal(result.activeProfile, "avoozl-claude-code");
  assert.equal(saved[0].acp_model, "preferred");
  assert.equal(saved[0].acp_command, "custom-command");
  assert.deepEqual(saved[0].mcp_server_refs, ["team-tools"]);
  assert.ok(!saved[0].secret_refs.includes("UNSAFE_EXTRA"));
});
