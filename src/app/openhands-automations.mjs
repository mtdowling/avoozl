import {
  AUTOMATION_INTERFACE,
  getAutomationCatalogEntry,
} from "@openhands/extensions/automations";
import { openHandsSettings } from "./providers/openhands.mjs";
import { fail } from "./store.mjs";

const AUTOMATION_PREFIX = "/api/automation";
const SETUP_TEMPLATE_IDS = Object.freeze(["github-issue-to-pr"]);

function localBaseUrl(value, label) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTP URL.`, 409);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "::1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail(`${label} must be a loopback HTTP endpoint without credentials.`, 409);
  return url.href.replace(/\/$/, "");
}

function parseRuntimeServices(value) {
  if (typeof value === "string") {
    try {
      return parseRuntimeServices(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function setupPath(id) {
  return AUTOMATION_INTERFACE.routes.setup.replace(":automationId", id);
}

function templateSummary(id) {
  const entry = getAutomationCatalogEntry(id);
  if (!entry) fail("The pinned OpenHands automation template is unavailable.");
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    version: entry.version,
    estimatedSetupMinutes: entry.estimatedSetupMinutes ?? null,
    path: setupPath(entry.id),
    requiresUserInput: true,
  };
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body.detail ||
        body.message ||
        `OpenHands returned HTTP ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

function headers(apiKey) {
  return apiKey ? { "X-Session-API-Key": apiKey } : {};
}

export class OpenHandsAutomations {
  constructor({
    settings = openHandsSettings,
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = 5000,
  } = {}) {
    this.settings = settings;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(base, pathname, apiKey) {
    return responseJson(
      await this.fetch(base + pathname, {
        headers: headers(apiKey),
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );
  }

  async endpoint(config) {
    if (config.automationHost)
      return localBaseUrl(
        config.automationHost,
        "The OpenHands automation URL",
      );

    const agentServer = localBaseUrl(
      config.host,
      "The OpenHands Agent Server URL",
    );
    try {
      await this.request(
        agentServer,
        `${AUTOMATION_PREFIX}/health`,
        config.apiKey,
      );
      return agentServer;
    } catch (error) {
      if (error.status && error.status !== 404) throw error;
    }

    const serverInfo = await this.request(
        agentServer,
        "/server_info",
        config.apiKey,
      ),
      runtime = parseRuntimeServices(serverInfo.runtime_services),
      advertised = runtime?.services?.automation?.url_from_agent;
    return advertised
      ? localBaseUrl(advertised, "The advertised OpenHands automation URL")
      : null;
  }

  async capabilities() {
    const config = this.settings(),
      templates = SETUP_TEMPLATE_IDS.map(templateSummary),
      nativeSetup = {
        templatesPath: AUTOMATION_INTERFACE.routes.templates,
        listPath: AUTOMATION_INTERFACE.routes.list,
        templates,
      };
    try {
      const endpoint = await this.endpoint(config);
      if (!endpoint)
        return {
          available: false,
          reason:
            "This OpenHands Agent Server does not advertise an Automation service. Start Agent Canvas with automations or configure AVOOZL_OPENHANDS_AUTOMATION_URL.",
          nativeSetup,
          installation: {
            mode: "native-setup",
            directInstall: false,
            reason:
              "The template needs repositories, a saved-secret name, an agent profile, and trigger settings that the user must review in OpenHands.",
          },
        };
      const [health, deployment] = await Promise.all([
        this.request(endpoint, `${AUTOMATION_PREFIX}/health`, config.apiKey),
        this.request(
          endpoint,
          `${AUTOMATION_PREFIX}/v1/capabilities`,
          config.apiKey,
        ),
      ]);
      return {
        available: health.status === "ok",
        endpoint,
        health,
        deployment,
        nativeSetup,
        installation: {
          mode: "native-setup",
          directInstall: false,
          reason:
            "The template needs repositories, a saved-secret name, an agent profile, and trigger settings that the user must review in OpenHands.",
        },
      };
    } catch (error) {
      return {
        available: false,
        reason: `OpenHands Automations are unavailable: ${error.message}`,
        nativeSetup,
        installation: {
          mode: "native-setup",
          directInstall: false,
          reason:
            "Avoozl does not create or enable an automation until OpenHands can present its native review form.",
        },
      };
    }
  }

  setup(input = {}) {
    const keys = Object.keys(input);
    if (
      keys.some((key) => key !== "templateId") ||
      typeof input.templateId !== "string" ||
      !SETUP_TEMPLATE_IDS.includes(input.templateId)
    )
      fail(
        "Choose a supported pinned OpenHands automation template. Arbitrary prompts and automation specifications are not accepted.",
      );
    return {
      action: "navigate",
      surface: "openhands",
      path: setupPath(input.templateId),
      template: templateSummary(input.templateId),
      createsAutomation: false,
      requiresUserReview: true,
    };
  }
}
