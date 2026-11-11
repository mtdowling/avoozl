import {
  AUTOMATION_INTERFACE,
  getAutomationCatalogEntry,
} from "@openhands/extensions/automations";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OPENHANDS_PLUGIN, openHandsSettings } from "./providers/openhands.mjs";
import { fail } from "./store.mjs";

const AUTOMATION_PREFIX = "/api/automation";
const SETUP_TEMPLATE_IDS = Object.freeze([
  "github-issue-to-pr",
  "github-pr-reviewer",
  "github-repo-monitor",
]);
const COVERAGE_PAGE_SIZE = 100;
const COVERAGE_LIMIT = 2000;
const INTAKE_ID = "avoozl-github-intake";
const TEMPLATE_ROLES = Object.freeze({
  "github-issue-to-pr": {
    role: "issue-implementation",
    summary: "Implement labelled issues and update their pull requests.",
    effects: [
      "creates branches",
      "pushes commits",
      "opens or updates pull requests",
    ],
  },
  "github-pr-reviewer": {
    role: "pull-request-review",
    summary: "Review eligible pull requests and publish GitHub reviews.",
    effects: ["reads code", "runs agents", "publishes pull-request reviews"],
  },
  "github-repo-monitor": {
    role: "comment-response",
    summary: "Respond to authorized trigger phrases in issue and PR comments.",
    effects: [
      "posts comments",
      "may push commits when configured to implement",
    ],
  },
});

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

function localCallbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("The Avoozl intake callback must be a valid HTTP URL.", 409);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "::1", "localhost", "host.docker.internal"].includes(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/github-intake"
  )
    fail(
      "The Avoozl intake callback must be the credential-free local /api/github-intake endpoint.",
      409,
    );
  return url.href;
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

function packagedIntakeArtifact() {
  const root = OPENHANDS_PLUGIN.source,
    manifestPath = path.join(root, ".plugin", "plugin.json"),
    workerPath = path.join(root, "scripts", "avoozl_github_intake.py");
  for (const file of [manifestPath, workerPath]) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      fail("The packaged Avoozl intake automation artifact is invalid.", 500);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    automation = manifest.automation,
    source = path.resolve(root, "../../../.."),
    repoPath = path.relative(source, root).split(path.sep).join("/");
  if (
    manifest.name !== OPENHANDS_PLUGIN.name ||
    manifest.version !== OPENHANDS_PLUGIN.version ||
    automation?.schema_version !== "openhands.automation.plugin.v1" ||
    automation.entrypoint?.runner !== "script" ||
    automation.entrypoint?.command !== "python3 avoozl_github_intake.py" ||
    automation.runtime?.agent_profile ||
    automation.runtime?.llm_profile
  )
    fail("The packaged Avoozl intake automation artifact is invalid.", 500);
  return {
    id: INTAKE_ID,
    version: manifest.version,
    runner: "script",
    deterministic: true,
    launchesAgents: false,
    mutatesGitHub: false,
    source,
    repoPath,
    manifestPath,
    workerPath,
  };
}

function fileDigest(files) {
  const hash = createHash("sha256");
  for (const file of files) hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function verifyMaterializedArtifact(root, expectedDigest) {
  const pluginRoot = path.join(root, "avoozl"),
    files = [
      path.join(pluginRoot, ".plugin", "plugin.json"),
      path.join(pluginRoot, "scripts", "avoozl_github_intake.py"),
    ];
  return (
    files.every((file) => {
      try {
        const stat = fs.lstatSync(file);
        return stat.isFile() && !stat.isSymbolicLink();
      } catch {
        return false;
      }
    }) && fileDigest(files) === expectedDigest
  );
}

function materializeIntakeArtifact({
  home = os.homedir(),
  run = execFileSync,
} = {}) {
  const packaged = packagedIntakeArtifact(),
    sourceFiles = [packaged.manifestPath, packaged.workerPath],
    contentDigest = fileDigest(sourceFiles),
    cacheRoot = path.join(
      home,
      ".config",
      "avoozl",
      "local",
      "openhands-automations",
    ),
    destination = path.join(
      cacheRoot,
      `${packaged.version}-${contentDigest.slice(0, 16)}`,
    );
  if (!verifyMaterializedArtifact(destination, contentDigest)) {
    fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
    const temporary = path.join(
      cacheRoot,
      `.prepare-${process.pid}-${randomUUID()}`,
    );
    try {
      const pluginRoot = path.join(temporary, "avoozl");
      fs.mkdirSync(path.join(pluginRoot, ".plugin"), {
        recursive: true,
        mode: 0o700,
      });
      fs.mkdirSync(path.join(pluginRoot, "scripts"), {
        recursive: true,
        mode: 0o700,
      });
      fs.copyFileSync(
        packaged.manifestPath,
        path.join(pluginRoot, ".plugin", "plugin.json"),
      );
      fs.copyFileSync(
        packaged.workerPath,
        path.join(pluginRoot, "scripts", "avoozl_github_intake.py"),
      );
      run("git", ["init", "--quiet"], { cwd: temporary, stdio: "ignore" });
      run("git", ["config", "user.name", "Avoozl"], {
        cwd: temporary,
        stdio: "ignore",
      });
      run("git", ["config", "user.email", "avoozl@localhost"], {
        cwd: temporary,
        stdio: "ignore",
      });
      run("git", ["add", "--", "avoozl"], {
        cwd: temporary,
        stdio: "ignore",
      });
      run("git", ["commit", "--quiet", "-m", "Package intake automation"], {
        cwd: temporary,
        stdio: "ignore",
      });
      try {
        fs.renameSync(temporary, destination);
      } catch (error) {
        if (
          !["EEXIST", "ENOTEMPTY"].includes(error.code) ||
          !verifyMaterializedArtifact(destination, contentDigest)
        )
          throw error;
      }
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  if (!verifyMaterializedArtifact(destination, contentDigest))
    fail("The machine-local Avoozl intake automation cache is invalid.", 500);
  return {
    ...packaged,
    source: destination,
    repoPath: "avoozl",
    materialized: true,
    contentDigest,
  };
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

function ownershipBoundary() {
  return {
    continuousGitHubOwner: "openhands-automations",
    authorizationAndExecutionOwner: "avoozl",
    reconciliationOwner: "avoozl",
    reconciliationOperation: "queue.sync",
    directIngest: {
      available: true,
      required: true,
      reason:
        "Avoozl packages a deterministic OpenHands watcher that submits exact repository snapshots without launching agents or mutating GitHub. Public repositories use observation-only capabilities.",
      safeFutureContract: {
        credential: "repository-scoped ingest-only capability",
        permits: ["submit authenticated GitHub event snapshots"],
        denies: [
          "launch conversations",
          "approve plans or tasks",
          "accept work",
          "integrate or merge",
          "change configuration",
        ],
        replayProtection: true,
        implemented: true,
      },
    },
  };
}

function repositoryId(value) {
  const text =
    typeof value === "string"
      ? value.trim()
      : typeof value?.url === "string"
        ? value.url.trim()
        : "";
  const shorthand = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) return `${shorthand[1]}/${shorthand[2]}`;
  const url = text
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  } catch {
    return null;
  }
}

function configuredRepositories(value) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(entries.map(repositoryId).filter(Boolean))];
}

function metadataTemplate(value) {
  const metadata = value?.preset_metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const template = metadata.template;
  return template && typeof template === "object" ? template : null;
}

function automationTemplateId(value) {
  const template = metadataTemplate(value);
  return typeof template?.id === "string" ? template.id : null;
}

function automationRepositories(value) {
  const metadata = value?.preset_metadata,
    template = metadataTemplate(value),
    config =
      template?.config && typeof template.config === "object"
        ? template.config
        : null;
  return configuredRepositories([
    ...(Array.isArray(value?.repositories) ? value.repositories : []),
    ...(Array.isArray(metadata?.repos) ? metadata.repos : []),
    ...(Array.isArray(config?.repos) ? config.repos : []),
    ...(Array.isArray(config?.repositories) ? config.repositories : []),
    config?.repository,
  ]);
}

function automationState(value) {
  if (typeof value?.state === "string")
    return value.state.toUpperCase() === "ACTIVE" ? "active" : "inactive";
  if (value?.enabled === true) return "active";
  return "inactive";
}

function intakeTemplateId(workspaceId, repository) {
  if (!workspaceId || !repository)
    fail("Avoozl intake preparation requires a workspace and repository.");
  return (
    "avoozl-github-intake-" +
    createHash("sha256")
      .update(`${workspaceId}:${repository}`)
      .digest("hex")
      .slice(0, 24)
  );
}

function intakeAutomationRepositories(value) {
  return configuredRepositories(
    value?.plugin_spec?.config?.repositories ||
      value?.config?.repositories ||
      [],
  );
}

function intakeAutomationMode(value) {
  const mode = value?.plugin_spec?.config?.mode || value?.config?.mode || null;
  return ["authorization", "observation-only"].includes(mode)
    ? mode
    : "authorization";
}

function isIntakeAutomation(value) {
  return (
    String(automationTemplateId(value) || "").startsWith(
      "avoozl-github-intake-",
    ) ||
    (value?.plugin_spec?.plugin?.repo_path === "avoozl" &&
      intakeAutomationRepositories(value).length > 0)
  );
}

function draftTemplateId(value) {
  return typeof value?.source_automation_id === "string"
    ? value.source_automation_id
    : typeof value?.sourceAutomationId === "string"
      ? value.sourceAutomationId
      : null;
}

function draftRepositories(value) {
  const draft =
    value?.draft && typeof value.draft === "object" ? value.draft : {};
  return configuredRepositories([
    ...(Array.isArray(draft.repos) ? draft.repos : []),
    draft.repository,
  ]);
}

function templateRelationship(templateId) {
  return templateId === "github-pr-reviewer"
    ? "supplemental"
    : "standalone-bypass";
}

function templateWarning(templateId) {
  return templateId === "github-pr-reviewer"
    ? "This can publish native pull-request reviews, but it does not feed Avoozl's Queue or authorize Avoozl work."
    : "This automation launches and acts outside Avoozl's authorization and acceptance lifecycle. Do not treat it as Avoozl-controlled issue intake.";
}

function recommendationFor(repository, templateId) {
  const template = templateSummary(templateId),
    project = repository.project || {};
  return {
    ...TEMPLATE_ROLES[templateId],
    relationship: templateRelationship(templateId),
    satisfiesAvoozlIntake: false,
    warning: templateWarning(templateId),
    template,
    handoff: {
      action: "navigate",
      surface: "openhands",
      path: template.path,
      prefill: {
        repository: repository.id,
        repositories: [repository.id],
        ref: project.baseBranch || repository.baseBranch || "main",
      },
      createsAutomation: false,
      createsDraft: false,
      requiresUserReview: true,
    },
  };
}

function intakeRequirement(repository, eligible, observationOnly) {
  const required =
    repository.includeIssues !== false ||
    repository.includePullRequests !== false;
  return {
    id: INTAKE_ID,
    role: "control-plane-intake",
    required,
    state: required ? "missing" : "not-required",
    available: eligible,
    satisfiesAvoozlIntake: false,
    reason: eligible
      ? observationOnly
        ? "Install the packaged deterministic OpenHands watcher in observation-only mode. It populates Queue from this public repository without authorizing work or mutating GitHub; explicit user actions such as Claim are separate."
        : "Install the packaged deterministic OpenHands watcher. It observes GitHub; Avoozl retains authorization and execution policy."
      : "Enable this monitored repository before preparing its deterministic watcher.",
    handoff: null,
  };
}

function recommendationsFor(repositories) {
  return {
    ownership: ownershipBoundary(),
    repositories: repositories
      .filter((repository) => repository?.enabled !== false)
      .map((repository) => {
        const privateRepository =
            repository.visibility === "private" || repository.private === true,
          watcherEligible = repository.enabled !== false,
          templateIds = [
            ...(repository.includeIssues === false
              ? []
              : ["github-issue-to-pr"]),
            ...(repository.includePullRequests === false
              ? []
              : ["github-pr-reviewer"]),
            ...(repository.includeIssues === false &&
            repository.includePullRequests === false
              ? []
              : ["github-repo-monitor"]),
          ],
          relatedAutomations = privateRepository
            ? templateIds.map((templateId) =>
                recommendationFor(repository, templateId),
              )
            : [];
        return {
          repository: repository.id,
          projectId: repository.projectId || null,
          eligible: watcherEligible,
          controlPlane: intakeRequirement(
            repository,
            watcherEligible,
            !privateRepository,
          ),
          ...(privateRepository
            ? {}
            : {
                reason:
                  "This public repository is eligible for observation-only Queue snapshots. Native OpenHands automations that run agents or publish GitHub changes remain private-repository only.",
              }),
          recommendations: relatedAutomations.filter(
            (automation) => automation.relationship === "supplemental",
          ),
          relatedAutomations,
        };
      }),
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
    artifactHome = os.homedir(),
    run = execFileSync,
  } = {}) {
    this.settings = settings;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.artifactHome = artifactHome;
    this.run = run;
  }

  async request(base, pathname, apiKey, { method = "GET", body } = {}) {
    return responseJson(
      await this.fetch(base + pathname, {
        ...(method === "GET" ? {} : { method }),
        headers: {
          ...headers(apiKey),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );
  }

  artifact() {
    return materializeIntakeArtifact({
      home: this.artifactHome,
      run: this.run,
    });
  }

  async listCollection(endpoint, pathname, field, apiKey) {
    const items = [];
    for (
      let offset = 0;
      offset <= COVERAGE_LIMIT;
      offset += COVERAGE_PAGE_SIZE
    ) {
      const separator = pathname.includes("?") ? "&" : "?",
        result = await this.request(
          endpoint,
          `${pathname}${separator}limit=${COVERAGE_PAGE_SIZE}&offset=${offset}`,
          apiKey,
        ),
        page = Array.isArray(result?.[field]) ? result[field] : [];
      if (offset === COVERAGE_LIMIT) {
        if (page.length)
          fail(
            `OpenHands returned more than ${COVERAGE_LIMIT} ${field}. Narrow the automation inventory before retrying.`,
            413,
          );
        return items;
      }
      items.push(...page);
      if (
        page.length < COVERAGE_PAGE_SIZE ||
        (Number.isFinite(result?.total) && items.length >= result.total)
      )
        return items;
    }
    return items;
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

  recommendations(input = {}) {
    if (!Array.isArray(input.repositories))
      fail("Automation recommendations require a repository list.");
    return recommendationsFor(input.repositories);
  }

  async intakePreflight(input = {}) {
    const recommendations = this.recommendations(input),
      artifact = this.artifact(),
      capabilities = await this.capabilities(),
      intakeCapabilities = Array.isArray(input.intake?.capabilities)
        ? input.intake.capabilities
        : [],
      activeIntake = intakeCapabilities.filter(
        (capability) => capability.state === "active",
      );
    let pluginSpec = {
        status: "unavailable",
        reason: capabilities.reason || "OpenHands Automations are unavailable.",
      },
      githubCredential = {
        status: "unavailable",
        reason: capabilities.reason || "OpenHands Agent Server is unavailable.",
      };
    if (capabilities.available) {
      const query = new URLSearchParams({
        source: artifact.source,
        repo_path: artifact.repoPath,
      });
      try {
        const result = await this.request(
          capabilities.endpoint,
          `${AUTOMATION_PREFIX}/v1/plugin-spec/preflight?${query}`,
          this.settings().apiKey,
        );
        pluginSpec = {
          status: "ready",
          resolvedRef: result.resolved_ref || null,
          manifest: result.manifest || null,
        };
      } catch (error) {
        pluginSpec = {
          status: "unavailable",
          reason: `OpenHands cannot preflight the packaged intake plugin from this runtime: ${error.message}`,
        };
      }
      try {
        const config = this.settings(),
          saved = await this.request(
            localBaseUrl(config.host, "The OpenHands Agent Server URL"),
            "/api/settings/secrets",
            config.apiKey,
          ),
          name = input.githubSecretName || "GITHUB_PERSONAL_ACCESS_TOKEN",
          available = (saved.secrets || []).some(
            (secret) => secret?.name === name,
          );
        githubCredential = {
          status: available ? "configured" : "missing",
          name,
          reason: available
            ? "OpenHands has the named GitHub credential. Avoozl cannot read its value."
            : `Add ${name} in OpenHands Settings → Secrets before preparing this watcher.`,
        };
      } catch (error) {
        githubCredential = {
          status: "unavailable",
          reason: `OpenHands saved-secret inventory is unavailable: ${error.message}`,
        };
      }
    }
    const repository = recommendations.repositories[0] || null,
      callbackReady = Boolean(
        input.intake?.callbackUrl || input.intake?.callbackPath,
      ),
      assigneeRequired = input.intake?.issueAuthorization === true,
      assigneeReady = !assigneeRequired || Boolean(input.intake?.assignee),
      canMint = input.intake?.canMint !== false,
      readyToPrepare =
        Boolean(repository?.eligible && repository.controlPlane.required) &&
        pluginSpec.status === "ready" &&
        githubCredential.status === "configured" &&
        callbackReady &&
        assigneeReady &&
        (activeIntake.length > 0 || canMint);
    return {
      id: INTAKE_ID,
      version: artifact.version,
      repository: repository?.repository || null,
      readyToPrepare,
      readyToPrepareDraft: false,
      createsAutomation: true,
      createsDraft: false,
      enablesAutomation: false,
      recommendations,
      prerequisites: {
        artifact: { status: "ready", ...artifact },
        pluginSpec,
        lifecycle: {
          status: "ready",
          mode: "installed-inactive",
          reason:
            "OpenHands plugin-spec drafts are unsupported. Prepare installs the idempotent watcher as INACTIVE; enabling it remains a separate action.",
        },
        callback: {
          status: callbackReady ? "ready" : "missing",
          url: input.intake?.callbackUrl || null,
          path: input.intake?.callbackPath || null,
          reachability: callbackReady ? "local-contract" : "unverified",
          reason: callbackReady
            ? "The watcher is restricted to Avoozl's local ingest-only endpoint. Its first disabled test run proves runtime reachability before activation."
            : "Avoozl does not expose the repository-scoped ingest-only HTTP endpoint that this watcher requires.",
        },
        credential: {
          status: activeIntake.length
            ? "configured"
            : canMint
              ? "available"
              : "missing",
          minted: activeIntake.length > 0,
          capabilities: activeIntake.map((capability) => ({
            id: capability.id,
            repository: capability.repository,
            expiresAt: capability.expiresAt,
            suggestedSecretName: capability.suggestedSecretName,
          })),
          reason: activeIntake.length
            ? "A repository-scoped intake capability already exists."
            : canMint
              ? "Prepare will mint a repository-scoped token, save it directly into OpenHands, and never persist or return its plaintext."
              : "This Avoozl instance cannot mint the required repository-scoped intake capability.",
        },
        githubCredential,
        routing: {
          status: assigneeReady
            ? assigneeRequired
              ? "configured"
              : "not-required"
            : "missing",
          assignee: input.intake?.assignee || null,
          reason: assigneeReady
            ? assigneeRequired
              ? "The issue-intake assignee routes authorized work to this user."
              : "This repository is monitored for Queue visibility only; label-authorized execution is not configured."
            : "Configure label-authorized issue intake with an assignee before preparing the watcher.",
        },
      },
      next: readyToPrepare
        ? "Prepare the watcher. Avoozl will install it disabled for review."
        : "Resolve the listed prerequisites, then prepare the disabled watcher.",
    };
  }

  async prepareIntake(input = {}) {
    const repository = String(input.repository || ""),
      capability = input.capability;
    if (
      !capability ||
      capability.state !== "active" ||
      capability.repository !== repository
    )
      fail("Mint an active repository-scoped intake capability first.", 409);
    const callbackUrl = localCallbackUrl(input.callbackUrl),
      secretName = String(
        input.ingestSecretName || capability.suggestedSecretName || "",
      );
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(secretName))
      fail("The OpenHands ingest saved-secret name is invalid.");
    const githubSecretName = String(
      input.githubSecretName || "GITHUB_PERSONAL_ACCESS_TOKEN",
    );
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(githubSecretName))
      fail("The OpenHands GitHub saved-secret name is invalid.");
    const assignee = String(input.assignee || "");
    const mode = String(input.mode || capability.mode || "authorization");
    if (!["authorization", "observation-only"].includes(mode))
      fail("The GitHub intake capability mode is invalid.", 409);
    if (capability.mode && mode !== capability.mode)
      fail("The GitHub intake capability mode changed.", 409);
    const repositoryPrivate = capability.repositoryPrivate !== false;
    if (mode === "authorization" && !repositoryPrivate)
      fail("Public repositories cannot authorize issue execution.", 403);
    const capabilityToken = String(input.capabilityToken || ""),
      schedule = String(input.schedule || "*/5 * * * *"),
      timezone = String(input.timezone || "UTC"),
      artifact = this.artifact(),
      capabilities = await this.capabilities();
    if (!capabilities.available)
      fail(
        capabilities.reason || "OpenHands Automations are unavailable.",
        503,
      );
    const config = this.settings(),
      endpoint = capabilities.endpoint,
      name = `Avoozl GitHub intake · ${repository}`,
      templateId = intakeTemplateId(input.workspaceId, repository),
      automations = await this.listCollection(
        endpoint,
        `${AUTOMATION_PREFIX}/v1`,
        "automations",
        config.apiKey,
      ),
      existing = automations.find(
        (automation) =>
          automationTemplateId(automation) === templateId ||
          (automation.name === name &&
            intakeAutomationRepositories(automation).includes(repository)),
      );
    if (existing && input.repair !== true) {
      if (!intakeAutomationRepositories(existing).includes(repository))
        fail(
          "An OpenHands automation with this Avoozl name has different repository configuration.",
          409,
        );
      return {
        repository,
        prepared: true,
        created: false,
        automation: {
          id: existing.id,
          name: existing.name,
          enabled: automationState(existing) === "active",
          state: existing.state || null,
        },
        detailPath: `/automations/${existing.id}`,
      };
    }
    if (!capabilityToken)
      fail(
        "The returned-once intake capability token is unavailable. Revoke the unused capability and prepare again.",
        409,
      );
    const agentServer = localBaseUrl(
        config.host,
        "The OpenHands Agent Server URL",
      ),
      saved = await this.request(
        agentServer,
        "/api/settings/secrets",
        config.apiKey,
      );
    if (
      !(saved.secrets || []).some((secret) => secret?.name === githubSecretName)
    )
      fail(
        `Add ${githubSecretName} in OpenHands Settings → Secrets before preparing this watcher.`,
        409,
      );
    if (
      (saved.secrets || []).some((secret) => secret?.name === secretName) &&
      input.repair !== true
    )
      fail(
        `OpenHands already has ${secretName}. Use Repair to rotate the intake capability deliberately.`,
        409,
      );
    await this.request(agentServer, "/api/settings/secrets", config.apiKey, {
      method: "PUT",
      body: {
        name: secretName,
        value: capabilityToken,
        description: `Avoozl ingest-only capability for ${repository}`,
      },
    });
    const request = {
      name,
      plugin: {
        source: artifact.source,
        repo_path: artifact.repoPath,
      },
      config: {
        repositories: [repository],
        mode,
        repository_private: repositoryPrivate,
        ...(mode === "authorization" && assignee ? { assignee } : {}),
        ...(mode === "authorization"
          ? { ready_label: input.readyLabel || "avoozl:ready" }
          : {}),
        callback_url: callbackUrl,
        ingest_secret_name: secretName,
        github_secret_name: githubSecretName,
        schedule,
        timezone,
      },
      trigger: {
        type: "cron",
        schedule,
        timezone,
      },
      template: {
        id: templateId,
        version: artifact.version,
        config: { repository },
      },
      state: "INACTIVE",
      enabled: false,
    };
    let automation;
    try {
      automation = existing
        ? await this.request(
            endpoint,
            `${AUTOMATION_PREFIX}/v1/${encodeURIComponent(existing.id)}`,
            config.apiKey,
            {
              method: "PATCH",
              body: {
                name,
                plugin: request.plugin,
                config: request.config,
                trigger: request.trigger,
                state: "INACTIVE",
              },
            },
          )
        : await this.request(
            endpoint,
            `${AUTOMATION_PREFIX}/v1/plugin-spec`,
            config.apiKey,
            { method: "POST", body: request },
          );
    } catch (error) {
      await this.request(
        agentServer,
        `/api/settings/secrets/${encodeURIComponent(secretName)}`,
        config.apiKey,
        { method: "DELETE" },
      ).catch(() => {});
      throw error;
    }
    if (
      automation.enabled === true ||
      ["active", "enabled", "running"].includes(
        String(automation.state || "").toLowerCase(),
      )
    ) {
      await this.request(
        endpoint,
        `${AUTOMATION_PREFIX}/v1/${encodeURIComponent(automation.id)}`,
        config.apiKey,
        {
          method: "PATCH",
          body: { state: "INACTIVE", enabled: false },
        },
      ).catch(() => {});
      await this.request(
        agentServer,
        `/api/settings/secrets/${encodeURIComponent(secretName)}`,
        config.apiKey,
        { method: "DELETE" },
      ).catch(() => {});
      fail(
        "OpenHands unexpectedly enabled the prepared intake automation. Disable and review it before continuing.",
        502,
      );
    }
    return {
      repository,
      prepared: true,
      created: !existing,
      repaired: Boolean(existing),
      automation: {
        id: automation.id,
        name: automation.name,
        enabled: false,
        state: automation.state || "INACTIVE",
      },
      detailPath: `/automations/${automation.id}`,
    };
  }

  async coverage(input = {}) {
    const recommendations = this.recommendations(input),
      capabilities = await this.capabilities();
    if (!capabilities.available)
      return {
        ...recommendations,
        available: false,
        state: "missing-control-plane-intake",
        reason: capabilities.reason,
        capabilities,
      };
    const config = this.settings(),
      endpoint = capabilities.endpoint,
      automations = await this.listCollection(
        endpoint,
        `${AUTOMATION_PREFIX}/v1`,
        "automations",
        config.apiKey,
      ),
      supportsDrafts =
        capabilities.deployment?.features?.includes("automationDrafts"),
      drafts = supportsDrafts
        ? await this.listCollection(
            endpoint,
            `${AUTOMATION_PREFIX}/v1/drafts`,
            "drafts",
            config.apiKey,
          )
        : [],
      installed = automations
        .map((automation) => ({
          id: automation.id || null,
          name: automation.name || null,
          templateId: automationTemplateId(automation),
          repositories: automationRepositories(automation),
          state: automationState(automation),
        }))
        .filter((automation) =>
          SETUP_TEMPLATE_IDS.includes(automation.templateId),
        ),
      intakeInstalled = automations
        .filter(isIntakeAutomation)
        .map((automation) => ({
          id: automation.id || null,
          name: automation.name || null,
          templateId: automationTemplateId(automation),
          repositories: intakeAutomationRepositories(automation),
          mode: intakeAutomationMode(automation),
          state: automationState(automation),
          enabled: automationState(automation) === "active",
          detailPath: automation.id ? `/automations/${automation.id}` : null,
        })),
      prepared = drafts
        .map((draft) => ({
          id: draft.id || null,
          name: draft.name || null,
          templateId: draftTemplateId(draft),
          repositories: draftRepositories(draft),
          dispatchable: draft.dispatchable === true,
        }))
        .filter((draft) => SETUP_TEMPLATE_IDS.includes(draft.templateId));
    return {
      ...recommendations,
      available: true,
      state: recommendations.repositories.some((repository) => {
        if (repository.controlPlane.state === "not-required") return false;
        return !intakeInstalled.some((automation) =>
          automation.repositories.includes(repository.repository),
        );
      })
        ? "missing-control-plane-intake"
        : "covered",
      capabilities,
      installed,
      intakeInstalled,
      drafts: prepared,
      repositories: recommendations.repositories.map((repository) => {
        const intake = intakeInstalled.filter((automation) =>
            automation.repositories.includes(repository.repository),
          ),
          intakeState = intake.some((automation) => automation.enabled)
            ? "active"
            : intake.length
              ? "inactive"
              : repository.controlPlane.state === "not-required"
                ? "not-required"
                : "missing";
        return {
          ...repository,
          controlPlane: {
            ...repository.controlPlane,
            state: intakeState,
            available: intake.length > 0,
            satisfiesAvoozlIntake: intake.length > 0,
            reason: intake.length
              ? intakeState === "active"
                ? "OpenHands is scheduling deterministic repository snapshots for Avoozl."
                : "The deterministic OpenHands watcher is installed but disabled."
              : repository.controlPlane.reason,
            automations: intake,
          },
          coverage: repository.relatedAutomations.map((recommendation) => {
            const active = installed.filter(
                (automation) =>
                  automation.templateId === recommendation.template.id &&
                  automation.repositories.includes(repository.repository),
              ),
              matchingDrafts = prepared.filter(
                (draft) =>
                  draft.templateId === recommendation.template.id &&
                  draft.repositories.includes(repository.repository),
              );
            return {
              role: recommendation.role,
              templateId: recommendation.template.id,
              satisfiesAvoozlIntake: false,
              state: active.some((automation) => automation.state === "active")
                ? "active"
                : active.length
                  ? "inactive"
                  : matchingDrafts.length
                    ? "draft"
                    : "recommended",
              automations: active,
              drafts: matchingDrafts,
            };
          }),
        };
      }),
    };
  }

  async setIntakeState(input = {}, { authorizeEnable } = {}) {
    const id = String(input.id || ""),
      enabled = input.enabled;
    if (!id || typeof enabled !== "boolean")
      fail("Choose an intake automation and whether it should be enabled.");
    const capabilities = await this.capabilities();
    if (!capabilities.available)
      fail(
        capabilities.reason || "OpenHands Automations are unavailable.",
        503,
      );
    const config = this.settings(),
      current = await this.request(
        capabilities.endpoint,
        `${AUTOMATION_PREFIX}/v1/${encodeURIComponent(id)}`,
        config.apiKey,
      );
    if (!isIntakeAutomation(current))
      fail(
        "The selected OpenHands automation is not an Avoozl intake watcher.",
        403,
      );
    const repositories = intakeAutomationRepositories(current);
    if (repositories.length !== 1)
      fail(
        "The selected Avoozl intake watcher must target exactly one repository.",
        409,
      );
    if (enabled) {
      if (typeof authorizeEnable !== "function")
        fail(
          "Enabling an Avoozl intake watcher requires repository authorization.",
          403,
        );
      await authorizeEnable({
        id,
        repository: repositories[0],
        mode: intakeAutomationMode(current),
      });
    }
    const updated = await this.request(
      capabilities.endpoint,
      `${AUTOMATION_PREFIX}/v1/${encodeURIComponent(id)}`,
      config.apiKey,
      {
        method: "PATCH",
        body: { enabled, state: enabled ? "ACTIVE" : "INACTIVE" },
      },
    );
    return {
      id: updated.id || id,
      name: updated.name || current.name || null,
      repository: repositories[0],
      enabled: automationState(updated) === "active",
      state: updated.state || (enabled ? "ACTIVE" : "INACTIVE"),
      detailPath: `/automations/${updated.id || id}`,
    };
  }

  setup(input = {}) {
    const keys = Object.keys(input);
    if (
      keys.some(
        (key) => !["templateId", "repository", "baseBranch"].includes(key),
      ) ||
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
      relationship: templateRelationship(input.templateId),
      satisfiesAvoozlIntake: false,
      warning: templateWarning(input.templateId),
      ...(input.repository
        ? {
            prefill: {
              repository: input.repository,
              repositories: [input.repository],
              ref: input.baseBranch || "main",
            },
          }
        : {}),
      createsAutomation: false,
      createsDraft: false,
      requiresUserReview: true,
    };
  }
}
