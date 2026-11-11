import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentServerClient } from "@openhands/typescript-client/clients";
import { fail } from "./store.mjs";
import {
  OPENHANDS_PLUGIN,
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

const OPENHANDS_AGENT_PRESETS = Object.freeze({
  "claude-code": Object.freeze({
    label: "Claude Code",
    profile: "avoozl-claude-code",
    secretRefs: ["AVOOZL_MCP_URL", "AVOOZL_MCP_TOKEN"],
  }),
  codex: Object.freeze({
    label: "Codex",
    profile: "avoozl-codex",
    secretRefs: ["AVOOZL_MCP_URL", "AVOOZL_MCP_TOKEN"],
  }),
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

function assertPluginPackage(source) {
  source = path.resolve(source);
  const manifestPath = path.join(source, ".plugin", "plugin.json"),
    mcpPath = path.join(source, ".mcp.json"),
    skillNames = ["avoozl", "avoozl-ui"],
    skillPaths = skillNames.map((name) =>
      path.join(source, "skills", name, "SKILL.md"),
    ),
    intakePath = path.join(source, "scripts", "avoozl_github_intake.py");
  for (const file of [manifestPath, mcpPath, ...skillPaths, intakePath]) {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch {
      fail("The packaged Avoozl OpenHands plugin is incomplete.", 500);
    }
    if (!stat.isFile() || stat.isSymbolicLink())
      fail("The packaged Avoozl OpenHands plugin is invalid.", 500);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8")),
    skills = skillPaths.map((skillPath) => fs.readFileSync(skillPath, "utf8")),
    server = mcp?.mcpServers?.avoozl,
    automation = manifest.automation;
  if (
    manifest.name !== OPENHANDS_PLUGIN.name ||
    manifest.version !== OPENHANDS_PLUGIN.version ||
    automation?.schema_version !== "openhands.automation.plugin.v1" ||
    automation.entrypoint?.runner !== "script" ||
    automation.entrypoint?.working_dir !== "scripts" ||
    automation.entrypoint?.command !== "python3 avoozl_github_intake.py" ||
    automation.runtime?.agent_profile ||
    automation.runtime?.llm_profile ||
    !automation.config_schema?.required?.includes("callback_url") ||
    !automation.config_schema?.required?.includes("ingest_secret_name") ||
    !skills.every((skill, index) =>
      new RegExp(`^---\\s*\\nname:\\s*${skillNames[index]}\\b`, "m").test(
        skill,
      ),
    ) ||
    server?.type !== "http" ||
    server.url !== "${AVOOZL_MCP_URL}" ||
    server.headers?.Authorization !== "Bearer ${AVOOZL_MCP_TOKEN}"
  )
    fail("The packaged Avoozl OpenHands plugin is invalid.", 500);
  return {
    name: manifest.name,
    version: manifest.version,
    source,
    skills: skillNames,
    automations: [
      {
        id: "avoozl-github-intake",
        version: manifest.version,
        runner: "script",
        enabled: false,
      },
    ],
    mcpServers: {
      avoozl: {
        scope: "conversation",
        urlSecret: "AVOOZL_MCP_URL",
        bearerSecret: "AVOOZL_MCP_TOKEN",
      },
    },
  };
}

async function installOpenHandsPlugin(client, settings) {
  const registration = assertPluginPackage(
      settings.pluginSource || OPENHANDS_PLUGIN.source,
    ),
    installed = await client.post("/api/plugins/install", {
      source: registration.source,
      force: true,
    });
  let enabled = installed.enabled;
  if (!enabled) {
    const state = await client.patch(
      `/api/plugins/installed/${encodeURIComponent(registration.name)}`,
      { enabled: true },
    );
    enabled = state.enabled;
  }
  if (!enabled) fail("OpenHands did not enable the Avoozl plugin.", 409);
  return {
    ...registration,
    installed: true,
    enabled: true,
  };
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

async function backendStatus(client, manifest) {
  if (!manifest.backend) return null;
  const pathname = `/api/canvas-extensions/installed/${encodeURIComponent(manifest.name)}/backend`;
  return client.get(pathname);
}

function selectedAgentIds(value) {
  const ids = Array.isArray(value)
    ? value
    : String(value || "claude-code,codex").split(",");
  const selected = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!selected.length) fail("Choose at least one OpenHands agent.", 409);
  const unsupported = selected.filter((id) => !OPENHANDS_AGENT_PRESETS[id]);
  if (unsupported.length)
    fail(`Unsupported OpenHands agent: ${unsupported.join(", ")}.`, 409);
  return selected;
}

function safeDiscoveryError(error) {
  return error?.code || "unavailable";
}

export async function setupOpenHandsAgents({
  agents,
  defaultAgent,
  verify = true,
  settings = openHandsSettings(),
  client,
} = {}) {
  const selected = selectedAgentIds(agents),
    own = !client,
    active = client || ownedClient(settings);
  if (defaultAgent && !selected.includes(defaultAgent))
    fail("The default OpenHands agent must be included in --agents.", 409);
  try {
    const server = await compatible(active);
    const integration = await installOpenHandsPlugin(active, settings);
    let listing = await active.get("/api/agent-profiles");
    const priorActive = listing.active_agent_profile_id;
    const results = [];
    for (const id of selected) {
      const preset = OPENHANDS_AGENT_PRESETS[id],
        summary = (listing.profiles || []).find(
          (entry) => entry.name === preset.profile,
        );
      let existing = null;
      if (summary) {
        const response = await active.get(
          `/api/agent-profiles/${encodeURIComponent(preset.profile)}`,
        );
        existing = response.profile;
        if (existing.agent_kind !== "acp" || existing.acp_server !== id)
          fail(
            `${preset.profile} exists but is not the expected ${preset.label} profile.`,
            409,
          );
      }
      const profile = {
        agent_kind: "acp",
        acp_server: id,
        acp_model: existing?.acp_model ?? null,
        acp_session_mode: existing?.acp_session_mode ?? null,
        acp_prompt_timeout: existing?.acp_prompt_timeout ?? 300,
        acp_startup_timeout: existing?.acp_startup_timeout ?? 60,
        acp_command: existing?.acp_command ?? null,
        acp_args: existing?.acp_args ?? null,
        mcp_server_refs: existing?.mcp_server_refs ?? [],
        integration_refs: existing?.integration_refs ?? [],
        secret_refs: preset.secretRefs,
      };
      await active.post(
        `/api/agent-profiles/${encodeURIComponent(preset.profile)}`,
        profile,
      );
      const diagnostics = await active.post(
        `/api/agent-profiles/${encodeURIComponent(preset.profile)}/materialize`,
        {},
      );
      let discovery = null;
      if (verify && diagnostics.valid)
        try {
          discovery = await active.post("/api/acp/models", {
            agent_settings: { agent_kind: "acp", acp_server: id },
            secrets: {},
            refresh: true,
          });
        } catch (error) {
          discovery = { error: { code: safeDiscoveryError(error) } };
        }
      const ready =
        diagnostics.valid && (!verify || (discovery && !discovery.error));
      results.push({
        agent: id,
        label: preset.label,
        profile: preset.profile,
        ready,
        valid: Boolean(diagnostics.valid),
        verified: verify ? Boolean(discovery && !discovery.error) : null,
        defaultModel: discovery?.current_model_id || null,
        modelCount: discovery?.available_models?.length || 0,
        errorCode: diagnostics.valid
          ? discovery?.error
            ? safeDiscoveryError(discovery.error)
            : null
          : "invalid-profile",
      });
    }
    listing = await active.get("/api/agent-profiles");
    const wantedDefault =
      defaultAgent ||
      selected.find((id) => {
        const preset = OPENHANDS_AGENT_PRESETS[id];
        return (listing.profiles || []).some(
          (entry) => entry.id === priorActive && entry.name === preset.profile,
        );
      }) ||
      results.find((entry) => entry.ready)?.agent ||
      (!verify ? selected[0] : null);
    let activeProfile = null;
    if (wantedDefault) {
      const preset = OPENHANDS_AGENT_PRESETS[wantedDefault],
        profile = (listing.profiles || []).find(
          (entry) => entry.name === preset.profile,
        );
      if (!profile?.id)
        fail("OpenHands did not return the configured agent profile.", 409);
      const result = results.find((entry) => entry.agent === wantedDefault);
      if (verify && !result?.ready)
        fail(
          `${preset.label} could not be verified. Authenticate its agent CLI or configure its credentials in OpenHands, then retry.`,
          409,
        );
      await active.post(
        `/api/agent-profiles/${encodeURIComponent(profile.id)}/activate`,
        {},
      );
      activeProfile = preset.profile;
    }
    return {
      configured: results,
      activeProfile,
      agentServer: settings.host,
      serverVersion: server.version,
      integration,
      note: results.every((entry) => entry.ready || !verify)
        ? "OpenHands agents are ready for Avoozl conversations."
        : "Some profiles were installed but could not be verified. Authenticate the corresponding agent CLI or configure credentials in OpenHands, then retry.",
    };
  } finally {
    if (own) active.close();
  }
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
    const integration = await installOpenHandsPlugin(active, settings);
    const installed = await active.post("/api/canvas-extensions/install", {
      source,
      force: Boolean(force),
    });
    let enabled = installed.enabled,
      backend = await backendStatus(active, manifest);
    if (enable && !enabled) {
      const consent =
        backend &&
        backend.state !== "unsupported" &&
        backend.state !== "missing"
          ? { revision: backend.revision }
          : {};
      if ("revision" in consent && !consent.revision)
        fail("OpenHands did not return an Avoozl backend revision.", 409);
      const state = await active.patch(
        `/api/canvas-extensions/installed/${encodeURIComponent(manifest.name)}`,
        { enabled: true, ...consent },
      );
      enabled = state.enabled;
      backend = await backendStatus(active, manifest);
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
      integration,
      backend,
      note:
        backend?.state === "ready"
          ? "OpenHands owns the Avoozl process and exposes it to Canvas through a short-lived authenticated backend session."
          : "This OpenHands platform cannot own the Avoozl backend yet. Start avoozl serve separately; Canvas will use that exact-origin local backend.",
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
      backend: installed
        ? await active
            .get(
              `/api/canvas-extensions/installed/${encodeURIComponent(OPENHANDS_CANVAS_APP.name)}/backend`,
            )
            .catch(() => null)
        : null,
      route: OPENHANDS_CANVAS_APP.route,
      agentServer: settings.host,
      serverVersion: server.version,
    };
  } finally {
    if (own) active.close();
  }
}
