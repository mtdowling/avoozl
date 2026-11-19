import {
  validateHarnesses,
  dropOlderRoleKeys,
  mergeRoles,
  resolveRoles,
  validateModels,
  validateRoles,
  validatePlanReview,
} from "./chat-models.mjs";
import { sandboxWriteRoots } from "./harness-definitions.mjs";
import { sandboxAllowCommands } from "./harness-allow.mjs";
import { sandboxNetwork } from "./sandbox.mjs";
import { validateLanes } from "./lanes.mjs";
import { applyLandingModes } from "./landing-config.mjs";
import { flowPolicy } from "./flow.mjs";
import { deliveryPolicy } from "./delivery.mjs";
import { refuseTrackedProviders } from "./provider-health.mjs";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { githubSources, writeGitHubSources } from "./github-sources.mjs";
import {
  normalizeGitHubPolicy,
  POLICY_KEYS,
  RETIRED_KEYS,
  policySection,
} from "./github-policy.mjs";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
  avoozlConfigSchemaPath,
} from "./layered-config.mjs";
import { validateContentRules } from "./content-rules.mjs";
import {
  DEFAULT_RETENTION_DAYS,
  activityRetention,
  validateActivitySettings,
} from "./activity-log.mjs";
import { fail } from "./store.mjs";
import { REPOSITORY_CONFIG_SCHEMA_URL } from "./config-schema.mjs";
import { deriveGitHubKeys, rolesNote, withRoles } from "./repository-roles.mjs";

const MAX_CONFIG_BYTES = 1024 * 1024;
const APPLY_KEYS = Object.freeze(["projects", "github", "planningRepository"]);

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function privilegedConfiguration(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      // `packs` only records where imported settings came from.
      ([key]) =>
        !["$schema", "version", "conversations", "packs"].includes(key),
    ),
  );
}

function changedTopLevelKeys(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !same(left[key], right[key]))
    .sort();
}

function text(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required.`);
  return value.trim();
}

function sortedRecord(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function envNames(value, id) {
  if (
    !Array.isArray(value) ||
    value.some(
      (n) => typeof n !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n),
    )
  )
    fail(
      `Project ${id} checksEnv must be a list of environment variable names.`,
    );
  return [...value];
}

function helperHash(value, id) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    fail(`Project ${id} worktreeHelper must be a SHA-256 hash.`);
  return value;
}

function landingOf(value, id) {
  if (!["direct", "pr", "train", "off"].includes(value))
    fail(`Project ${id} landing must be direct, pr, train or off.`);
  return value;
}

// Every key one `projects` entry, its sandbox, a legacy issue intake entry
// and a legacy Queue entry accept. A test holds
// src/avoozl-config.schema.json to these lists.
export const PROJECT_KEYS = Object.freeze([
  "name",
  "root",
  "baseBranch",
  "integrationBranch",
  "worktreeRoot",
  "checks",
  "checksEnv",
  "worktreeHelper",
  "landing",
  "planning",
  "editable",
  "executor",
  "harness",
  "sandbox",
  // Settings > Flow writes a repository's override here; flow.mjs reads and
  // validates it (flowSection), so this list only has to let it through.
  "flow",
]);
export const SANDBOX_KEYS = Object.freeze([
  "writeRoots",
  "allowCommands",
  "network",
]);
// Old `github.issueIntake` keys, read by github-sources.mjs (§4.39).
export { ISSUE_INTAKE_KEYS } from "./github-sources.mjs";
export const PLANNING_REPOSITORY_KEYS = Object.freeze([
  "root",
  "remote",
  "branch",
  "directory",
]);
// Old `github.queue` keys: accepted and ignored (§4.39).
export const QUEUE_KEYS = Object.freeze([
  "projectId",
  "workspaceRepositoryId",
  "enabled",
  "includeIssues",
  "includePullRequests",
  "visibility",
  "labelBehaviors",
]);

function projectInput(value, id, base) {
  if (!record(value)) fail(`Project ${id} must contain a JSON object.`);
  for (const key of Object.keys(value))
    if (!PROJECT_KEYS.includes(key))
      fail(`Unknown project setting projects.${id}.${key}.`);
  const checks = value.checks ?? [];
  if (
    !Array.isArray(checks) ||
    checks.some(
      (command) =>
        !Array.isArray(command) ||
        !command.length ||
        command.some((part) => typeof part !== "string"),
    )
  )
    fail(`Project ${id} checks must be arrays of command arguments.`);
  const resolve = (candidate) =>
    path.isAbsolute(candidate) ? candidate : path.resolve(base, candidate);
  // Branches reach git as positional arguments; a leading dash is an option.
  const branch = (value, label) => {
    const name = text(value, label);
    if (name.startsWith("-")) fail(`${label} must not start with a dash.`);
    return name;
  };
  return {
    ...(value.name === undefined
      ? {}
      : { name: text(value.name, `Project ${id} name`) }),
    root: resolve(text(value.root, `Project ${id} root`)),
    baseBranch: branch(value.baseBranch || "main", `Project ${id} base branch`),
    ...(value.integrationBranch === undefined
      ? {}
      : {
          integrationBranch: branch(
            value.integrationBranch,
            `Project ${id} integration branch`,
          ),
        }),
    ...(value.worktreeRoot === undefined
      ? {}
      : {
          worktreeRoot: resolve(
            text(value.worktreeRoot, `Project ${id} worktree root`),
          ),
        }),
    checks: structuredClone(checks),
    ...(value.checksEnv === undefined
      ? {}
      : { checksEnv: envNames(value.checksEnv, id) }),
    ...(value.worktreeHelper === undefined
      ? {}
      : { worktreeHelper: helperHash(value.worktreeHelper, id) }),
    ...(value.landing === undefined
      ? {}
      : { landing: landingOf(value.landing, id) }),
    planning: Boolean(value.planning),
    editable: value.editable !== false,
    ...executorInput(value, id),
  };
}

// Which executor runs the project's sessions (R93.5), the harness a
// `process` session uses, and its sandbox (R94.4, R94.4c, R95.6).
function executorInput(value, id) {
  const out = {};
  if (value.executor !== undefined) {
    if (!["kirocrew", "process"].includes(value.executor))
      fail(`Project ${id} executor must be kirocrew or process.`);
    out.executor = value.executor;
  }
  if (value.harness !== undefined) {
    if (
      typeof value.harness !== "string" ||
      !/^[a-z][a-z0-9-]{0,60}$/.test(value.harness)
    )
      fail(`Project ${id} harness must name a harness definition.`);
    out.harness = value.harness;
  }
  if (value.sandbox !== undefined) {
    if (!record(value.sandbox))
      fail(`Project ${id} sandbox must be an object.`);
    for (const key of Object.keys(value.sandbox))
      if (!SANDBOX_KEYS.includes(key))
        fail(`Unknown project setting projects.${id}.sandbox.${key}.`);
    const { writeRoots, allowCommands, network } = value.sandbox;
    sandboxWriteRoots(writeRoots);
    sandboxAllowCommands(allowCommands, {
      source: `projects.${id}.sandbox.allowCommands`,
    });
    sandboxNetwork(network);
    out.sandbox = structuredClone(value.sandbox);
  }
  return out;
}

// The executor settings of a stored project, as saved.
const executorSettings = (project) => ({
  ...(project.executor ? { executor: project.executor } : {}),
  ...(project.harness ? { harness: project.harness } : {}),
  ...(project.sandbox ? { sandbox: structuredClone(project.sandbox) } : {}),
});

function projectsInput(value, base) {
  if (value === undefined) return {};
  if (!record(value))
    fail("Projects configuration must contain a JSON object.");
  const result = {};
  for (const [id, project] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{1,60}$/.test(id)) fail(`Invalid project ID ${id}.`);
    result[id] = projectInput(project, id, base);
  }
  return sortedRecord(result);
}

// The `github` block's policy, checked, and the GitHub sources of the
// whole file (`intake.sources` plus old `github.issueIntake`, §4.39) by
// repository. `github.queue` is ignored.
function githubInput(github, whole = { github }) {
  if (github !== undefined) {
    if (!record(github))
      fail("GitHub configuration must contain a JSON object.");
    // Mode, Project and repository rules (§4.4); applied when read, not here.
    normalizeGitHubPolicy(github);
  }
  return {
    issueIntake: sortedRecord(
      Object.fromEntries(
        githubSources(whole).map((source) => [
          source.repository,
          source.settings,
        ]),
      ),
    ),
  };
}

function planningRepositoryInput(value, base) {
  if (value === undefined || value === null) return null;
  if (!record(value))
    fail("Planning repository configuration must contain a JSON object.");
  for (const key of Object.keys(value))
    if (!PLANNING_REPOSITORY_KEYS.includes(key))
      fail(`Unknown planning repository setting ${key}.`);
  const root = text(value.root, "Planning repository root");
  return {
    root: path.isAbsolute(root) ? root : path.resolve(base, root),
    remote: text(value.remote || "origin", "Planning repository remote"),
    branch: text(
      value.branch || "avoozl-workspace",
      "Planning repository branch",
    ),
    directory: text(value.directory || ".", "Planning repository directory"),
  };
}

function desiredActions(value, base) {
  return {
    projects: projectsInput(value.projects, base),
    github: githubInput(value.github, value),
    planningRepository: planningRepositoryInput(value.planningRepository, base),
  };
}

function appliedActions(store) {
  const projects = Object.fromEntries(
      store.list("projects").map((project) => [
        project.id,
        {
          ...(project.name === undefined ? {} : { name: project.name }),
          root: project.root,
          baseBranch: project.baseBranch || "main",
          ...(project.integrationBranch
            ? { integrationBranch: project.integrationBranch }
            : {}),
          ...(project.worktreeRoot
            ? { worktreeRoot: project.worktreeRoot }
            : {}),
          checks: structuredClone(project.checks || []),
          ...(project.checksEnv ? { checksEnv: [...project.checksEnv] } : {}),
          ...(project.worktreeHelper
            ? { worktreeHelper: project.worktreeHelper }
            : {}),
          ...(project.landing ? { landing: project.landing } : {}),
          planning: Boolean(project.planning),
          editable: project.editable !== false,
          ...executorSettings(project),
        },
      ]),
    ),
    issueIntake = Object.fromEntries(
      store.list("github_repositories").map((entry) => [
        entry.id,
        {
          projectId: entry.projectId,
          ...(entry.workspaceRepositoryId &&
          entry.workspaceRepositoryId !== entry.projectId
            ? { workspaceRepositoryId: entry.workspaceRepositoryId }
            : {}),
          assignee: entry.assignee,
          label: entry.label || "avoozl:ready",
          managedLabel: entry.managedLabel || "avoozl:managed",
          enabled: true,
          autoStart: Boolean(entry.autoStart),
          provider: entry.provider || null,
          model: entry.model || null,
          allowedActors: [...new Set(entry.allowedActors || [])].sort(),
          minimumPermission: entry.minimumPermission || "write",
        },
      ]),
    ),
    planning = store.getMeta("workspaceRepository");
  return {
    projects: sortedRecord(projects),
    github: { issueIntake: sortedRecord(issueIntake) },
    planningRepository: planning
      ? {
          root: planning.root,
          remote: planning.remote || "origin",
          branch: planning.branch || "avoozl-workspace",
          directory: planning.directory,
        }
      : null,
  };
}

function withoutKeys(value, excluded) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.includes(key)),
  );
}

function entryStat(filename) {
  try {
    return fs.lstatSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertDirectory(filename, label) {
  const stat = entryStat(filename);
  if (!stat) fail(`${label} does not exist.`);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    fail(`${label} must be a real directory.`);
}

function assertFile(filename) {
  const stat = entryStat(filename);
  if (!stat) fail("Workspace Avoozl configuration does not exist.");
  if (stat.isSymbolicLink() || !stat.isFile())
    fail("Workspace Avoozl configuration must be a regular file.");
}

function readText(filename) {
  assertFile(filename);
  const stat = fs.statSync(filename);
  if (stat.size > MAX_CONFIG_BYTES)
    fail("Workspace Avoozl configuration is too large.");
  return fs.readFileSync(filename, "utf8");
}

function parse(text, filename, { portable = false } = {}) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(
      `Could not parse workspace Avoozl configuration at ${filename}: ${error.message}`,
    );
  }
  if (!record(value))
    fail("Workspace Avoozl configuration must contain a JSON object.");
  if (value.version !== 1)
    fail("Unsupported workspace Avoozl configuration version.");
  validateModels(value.models);
  validateHarnesses(value.harnesses);
  validateRoles(value);
  validatePlanReview(value.planReview);
  assertSafeConfig(value, `workspace Avoozl configuration at ${filename}`);
  if (portable)
    assertPortableRepositoryConfig(
      value,
      `repository Avoozl configuration at ${filename}`,
    );
  return value;
}

// `.avoozl.json` `conversations`. Only autoArchiveCompleted acts: an
// accepted task's finished runs leave the conversation list. Other keys are
// dropped.
export const CONVERSATION_KEYS = new Set(["autoArchiveCompleted"]);
function conversationInput(value) {
  if (value === undefined) return null;
  if (!record(value))
    fail("Conversation configuration must contain a JSON object.");
  if (
    "autoArchiveCompleted" in value &&
    typeof value.autoArchiveCompleted !== "boolean"
  )
    fail("Choose whether completed conversations auto-archive.");
  return "autoArchiveCompleted" in value
    ? { autoArchiveCompleted: value.autoArchiveCompleted }
    : {};
}

export function conversationSettings(store) {
  return {
    autoArchiveCompleted:
      store.getMeta("conversationSettings")?.autoArchiveCompleted !== false,
  };
}

// The worker's agent and model are in the roles table (Settings › Models,
// R98.7); a save here keeps any older `delivery.agent` and `model`.
const DELIVERY_FORM_KEYS = [
  "prFeedback",
  "feedbackRounds",
  // Investigate first and ship mode (§4.21, §4.25).
  "investigate",
  "ship",
];

export class RepositorySettings {
  constructor(
    store,
    {
      workspaceRoot,
      files = {},
      sources = [],
      baseConfig = {},
      debounceMs = 350,
      watchFactory = fs.watch,
    } = {},
  ) {
    if (!workspaceRoot) fail("Choose a workspace root.");
    this.store = store;
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.realWorkspaceRoot = fs.realpathSync.native(this.workspaceRoot);
    this.filename =
      files.repository || path.join(this.workspaceRoot, ".avoozl.json");
    this.directory = path.dirname(this.filename);
    this.files = {
      ...files,
      repository: this.filename,
    };
    this.sources = sources;
    validateModels(baseConfig.models);
    validateHarnesses(baseConfig.harnesses);
    validateRoles(baseConfig);
    this.baseRoles = resolveRoles(baseConfig);
    this.baseConversationConfigured = baseConfig.conversations !== undefined;
    this.baseConversationSettings = {
      autoArchiveCompleted: true,
      ...conversationInput(baseConfig.conversations),
    };
    this.debounceMs = debounceMs;
    this.watchFactory = watchFactory;
    this.watcher = null;
    this.timer = null;
    this.restartBaseline = null;
    this.restartRequired = [];
    this.applyRequired = [];
    this.lastApplied = store.getMeta("repositorySettingsLastApplied") || null;
    this.state = {
      filename: this.filename,
      exists: false,
      hash: null,
      loadedAt: null,
      error: null,
    };
  }

  assertParents({ create = false } = {}) {
    assertDirectory(this.workspaceRoot, "Workspace root");
    if (!entryStat(this.directory)) {
      if (!create) return false;
      fs.mkdirSync(this.directory, { mode: 0o755 });
    }
    assertDirectory(this.directory, "Repository configuration directory");
    return true;
  }

  readFile() {
    if (!this.assertParents() || !entryStat(this.filename)) {
      return {
        value: { version: 1 },
        text: null,
        hash: null,
        exists: false,
      };
    }
    const text = readText(this.filename);
    return {
      value: parse(text, this.filename, { portable: true }),
      text,
      hash: hash(text),
      exists: true,
    };
  }

  readConfiguration(scope) {
    if (!["global", "repository"].includes(scope))
      fail("Choose the global or repository Avoozl configuration.");
    if (scope === "repository") {
      const file = this.readFile();
      return {
        scope,
        filename: this.filename,
        exists: file.exists,
        hash: file.hash,
        text: file.text || JSON.stringify({ version: 1 }, null, 2) + "\n",
      };
    }
    const filename = this.files.global;
    if (!filename) fail("Global Avoozl configuration is unavailable.", 404);
    if (!entryStat(filename))
      return {
        scope,
        filename,
        exists: false,
        hash: null,
        text: JSON.stringify({ version: 1 }, null, 2) + "\n",
      };
    const text = readText(filename);
    parse(text, filename);
    return {
      scope,
      filename,
      exists: true,
      hash: hash(text),
      text,
    };
  }

  updateConfiguration({ scope, text, expectedHash }) {
    if (typeof text !== "string") fail("Configuration JSON is required.");
    if (Buffer.byteLength(text) > MAX_CONFIG_BYTES)
      fail("Avoozl configuration is too large.");
    const current = this.readConfiguration(scope);
    if (expectedHash !== current.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const value = parse(text, current.filename, {
      portable: scope === "repository",
    });
    if (scope === "repository") {
      // Refuse an invalid GitHub policy before it reaches the file.
      githubInput(value.github, value);
      this.write(value, { expectedHash });
      this.reload();
      return {
        ...this.readConfiguration(scope),
        restartRequired: this.metadata().restartRequired,
      };
    }
    const directory = path.dirname(current.filename);
    fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    assertDirectory(directory, "Global Avoozl configuration directory");
    if (entryStat(current.filename)) assertFile(current.filename);
    const formatted = JSON.stringify(value, null, 2) + "\n",
      pending = path.join(
        directory,
        `.config.json.${process.pid}.${randomUUID()}.pending`,
      ),
      mode = current.exists
        ? fs.statSync(current.filename).mode & 0o777
        : 0o644;
    let descriptor;
    try {
      descriptor = fs.openSync(pending, "wx", mode);
      fs.writeFileSync(descriptor, formatted);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      if (entryStat(current.filename)) assertFile(current.filename);
      fs.renameSync(pending, current.filename);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (entryStat(pending)) fs.unlinkSync(pending);
    }
    return {
      ...this.readConfiguration(scope),
      restartRequired: ["Restart Avoozl to apply global configuration changes"],
    };
  }

  assertWritable() {
    this.readFile();
    return true;
  }

  metadata() {
    const sources = structuredClone(this.sources);
    if (
      this.state.exists &&
      !sources.some(({ filename }) => filename === this.filename)
    )
      sources.push({
        label: "repository Avoozl configuration",
        filename: this.filename,
      });
    return {
      version: 1,
      schemaPath: avoozlConfigSchemaPath,
      files: structuredClone(this.files),
      sources,
      repository: structuredClone(this.state),
      pending: [...new Set([...this.applyRequired, ...this.restartRequired])],
      applyRequired: [...this.applyRequired],
      restartRequired: [...this.restartRequired],
      lastApplied: structuredClone(this.lastApplied),
    };
  }

  reload({ emit = true } = {}) {
    try {
      const file = this.readFile(),
        input = conversationInput(file.value.conversations),
        privileged = privilegedConfiguration(file.value),
        desired = desiredActions(file.value, this.realWorkspaceRoot),
        applied = appliedActions(this.store),
        // `intake` is read on each use (intake.mjs declaredSources), and
        // its GitHub sources are compared under `github` above.
        restartDesired = withoutKeys(privileged, [...APPLY_KEYS, "intake"]);
      // Each repository's `landing.mode` onto its checkouts (§4.25).
      applyLandingModes(this.store, file.value);
      if (this.restartBaseline === null)
        this.restartBaseline = structuredClone(restartDesired);
      this.applyRequired = changedTopLevelKeys(applied, desired);
      this.restartRequired = changedTopLevelKeys(
        this.restartBaseline,
        restartDesired,
      );
      if (input || this.baseConversationConfigured || file.exists) {
        const next = { ...this.baseConversationSettings, ...input };
        if (!same(this.store.getMeta("conversationSettings"), next))
          this.store.transaction(() => {
            this.store.setMeta("conversationSettings", next);
            this.store.event(null, "workspace.settings.applied", {
              filename: this.filename,
              hash: file.hash,
            });
          });
      }
      this.state = {
        filename: this.filename,
        exists: file.exists,
        hash: file.hash,
        loadedAt: new Date().toISOString(),
        error: null,
      };
      return this.metadata();
    } catch (error) {
      this.state = {
        ...this.state,
        filename: this.filename,
        error: {
          message: error.message,
          at: new Date().toISOString(),
        },
      };
      if (emit)
        this.store.event(null, "workspace.settings.error", {
          filename: this.filename,
          message: error.message,
        });
      return this.metadata();
    }
  }

  write(value, { expectedHash } = {}) {
    this.assertParents({ create: true });
    const before = this.readFile();
    if (expectedHash !== undefined && expectedHash !== before.hash)
      fail(
        "Workspace Avoozl configuration changed; reload before saving.",
        409,
      );
    assertSafeConfig(
      value,
      `workspace Avoozl configuration at ${this.filename}`,
    );
    // Old GitHub intake keys move into `intake.sources` on this write (§4.39).
    if (
      record(value.github) &&
      (Object.hasOwn(value.github, "issueIntake") ||
        Object.hasOwn(value.github, "queue"))
    )
      value = writeGitHubSources(structuredClone(value));
    assertPortableRepositoryConfig(
      value,
      `repository Avoozl configuration at ${this.filename}`,
    );
    validateContentRules(value.contentRules);
    validateModels(value.models);
    validateRoles(value);
    validateRoles({ roles: mergeRoles(this.baseRoles, resolveRoles(value)) });
    validatePlanReview(value.planReview);
    validateLanes(value.lanes);
    try {
      validateActivitySettings(value.activity);
      flowPolicy(value);
      deliveryPolicy(value);
      refuseTrackedProviders(value);
    } catch (error) {
      fail(error.message);
    }
    const text = JSON.stringify(value, null, 2) + "\n";
    if (Buffer.byteLength(text) > MAX_CONFIG_BYTES)
      fail("Workspace Avoozl configuration is too large.");
    const pending = path.join(
      this.directory,
      `.${path.basename(this.filename)}.${process.pid}.${randomUUID()}.pending`,
    );
    const mode = before.exists
      ? fs.statSync(this.filename).mode & 0o777
      : 0o644;
    let descriptor;
    try {
      descriptor = fs.openSync(pending, "wx", mode);
      fs.writeFileSync(descriptor, text);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      this.assertParents();
      if (entryStat(this.filename)) assertFile(this.filename);
      fs.renameSync(pending, this.filename);
      let directory;
      try {
        directory = fs.openSync(this.directory, "r");
        fs.fsyncSync(directory);
      } catch {}
      if (directory !== undefined) fs.closeSync(directory);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (entryStat(pending)) fs.unlinkSync(pending);
    }
    return { text, hash: hash(text) };
  }

  // The `github` policy keys of this file (design §4.4) for the Settings view.
  readGitHubSettings() {
    const file = this.readFile(),
      github = record(file.value.github) ? file.value.github : {};
    return {
      filename: this.filename,
      exists: file.exists,
      hash: file.hash,
      // Every entry carries its role, read from the stored mode when the
      // file has none yet; nothing is written by reading (R105.7).
      github: policySection(
        withRoles(
          Object.fromEntries(
            POLICY_KEYS.filter((key) => Object.hasOwn(github, key)).map(
              (key) => [key, github[key]],
            ),
          ),
        ),
      ),
      rolesNote: rolesNote(github),
    };
  }

  // Replaces the policy keys of `github` and keeps every other key. The
  // whole block is validated before the file is written.
  updateGitHubSettings({ github, expectedHash } = {}) {
    const section = deriveGitHubKeys(policySection(github)),
      before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const value = this.updateValue(before),
      next = Object.fromEntries(
        Object.entries(record(value.github) ? value.github : {}).filter(
          ([key]) => !POLICY_KEYS.includes(key) && !RETIRED_KEYS.includes(key),
        ),
      );
    Object.assign(next, section);
    githubInput(next, { ...value, github: next });
    if (Object.keys(next).length) value.github = next;
    else delete value.github;
    this.write(value, { expectedHash: before.hash });
    return this.readGitHubSettings();
  }

  // Settings > Flow (§8.4): the workspace's `flow` and each repository's
  // override (`projects.<id>.flow`).
  readFlowSettings() {
    const file = this.readFile(),
      projects = record(file.value.projects) ? file.value.projects : {};
    return {
      filename: this.filename,
      exists: file.exists,
      hash: file.hash,
      flow: record(file.value.flow) ? structuredClone(file.value.flow) : {},
      repositories: Object.fromEntries(
        Object.entries(projects)
          .filter(([, p]) => record(p) && record(p.flow))
          .map(([id, p]) => [id, structuredClone(p.flow)]),
      ),
    };
  }

  // Replace the workspace's `flow` (or one repository's override) whole,
  // with an expected hash so a stale edit fails instead of overwriting.
  updateFlowSettings({ flow, repository = null, expectedHash } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    if (!record(flow)) fail("Give the flow settings as an object.");
    const value = this.updateValue(before);
    // Settings > Flow does not edit `verify` (protected paths, check
    // timeouts), so a save without it keeps the file's own.
    const kept = (old) =>
      flow.verify === undefined && record(old?.verify)
        ? { ...flow, verify: old.verify }
        : flow;
    if (repository) {
      if (!record(value.projects?.[repository]))
        fail(`Repository ${repository} is not in .avoozl.json projects.`, 404);
      flow = kept(value.projects[repository].flow);
      if (Object.keys(flow).length) value.projects[repository].flow = flow;
      else delete value.projects[repository].flow;
    } else if (Object.keys((flow = kept(value.flow))).length) value.flow = flow;
    else delete value.flow;
    this.write(value, { expectedHash: before.hash });
    return this.readFlowSettings();
  }

  // Settings > Models: the roles table (R98.6), each role's harness,
  // agent and model, with the older keys read in (R98.8).
  readModelSettings() {
    const file = this.readFile();
    return {
      filename: this.filename,
      exists: file.exists,
      hash: file.hash,
      roles: mergeRoles(this.baseRoles, resolveRoles(file.value)),
    };
  }

  // Replace the table whole and drop the older keys it replaces (R98.9).
  // An empty table removes `roles`.
  updateModelSettings({ roles = {}, expectedHash } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const checked = validateRoles({ roles });
    for (const role of Object.keys(checked))
      if (!Object.keys(checked[role]).length) delete checked[role];
    const value = dropOlderRoleKeys(this.updateValue(before));
    if (Object.keys(checked).length) value.roles = checked;
    else delete value.roles;
    this.write(value, { expectedHash: before.hash });
    return this.readModelSettings();
  }

  // Settings > General: how long the activity log keeps rows (§4.19).
  readActivitySettings() {
    const file = this.readFile();
    return {
      filename: this.filename,
      exists: file.exists,
      hash: file.hash,
      retentionDays: activityRetention(file.value),
      default: DEFAULT_RETENTION_DAYS,
    };
  }

  // null clears the key, so the default applies again.
  updateActivitySettings({ retentionDays, expectedHash } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const value = this.updateValue(before);
    if (retentionDays === null || retentionDays === undefined)
      delete value.activity;
    else value.activity = { ...(value.activity || {}), retentionDays };
    try {
      validateActivitySettings(value.activity);
    } catch (error) {
      fail(error.message);
    }
    this.write(value, { expectedHash: before.hash });
    return this.readActivitySettings();
  }

  // Settings > Delivery: who merges, investigate first and pull request
  // feedback (R54.8). Other delivery keys are kept as they are.
  readDeliverySettings() {
    const file = this.readFile(),
      delivery = record(file.value.delivery) ? file.value.delivery : {};
    return {
      filename: this.filename,
      exists: file.exists,
      hash: file.hash,
      on: record(file.value.delivery),
      delivery: Object.fromEntries(
        DELIVERY_FORM_KEYS.filter((key) => key in delivery).map((key) => [
          key,
          delivery[key],
        ]),
      ),
    };
  }

  // `turnOn: true` writes an empty `delivery` section first (every key at
  // its default), so Settings > Delivery can turn delivery on with one save.
  updateDeliverySettings({ delivery, expectedHash, turnOn } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    if (!record(delivery)) fail("Give the delivery settings as an object.");
    for (const key of Object.keys(delivery))
      if (!DELIVERY_FORM_KEYS.includes(key))
        fail(`delivery.${key} is not set here.`);
    const value = this.updateValue(before);
    if (!record(value.delivery) && turnOn === true) value.delivery = {};
    if (!record(value.delivery))
      fail(
        "Delivery is off in .avoozl.json; turn it on before changing these.",
        409,
      );
    const next = { ...value.delivery };
    for (const key of DELIVERY_FORM_KEYS)
      if (delivery[key] === undefined || delivery[key] === null)
        delete next[key];
      else next[key] = delivery[key];
    // An older falsifier agent and model stay until a Models save moves
    // them into `roles` (R98.9).
    const older = value.delivery.investigate;
    if (record(older)) {
      const rest = Object.fromEntries(
        ["agent", "model"].filter((k) => k in older).map((k) => [k, older[k]]),
      );
      if (Object.keys(rest).length)
        next.investigate = { ...rest, ...(next.investigate || {}) };
    }
    // The tick's own check, so a save never leaves a policy it refuses.
    try {
      deliveryPolicy({ ...value, delivery: next });
    } catch (error) {
      fail(error.message);
    }
    value.delivery = next;
    this.write(value, { expectedHash: before.hash });
    return this.readDeliverySettings();
  }

  // An approved retro proposal for a delivery setting (§4.11): one key,
  // refused when its value is no longer the proposal's `from`.
  updateDeliveryKey({ key, from, to, expectedHash } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const value = this.updateValue(before),
      name = key.replace(/^delivery\./, ""),
      delivery = record(value.delivery) ? value.delivery : {};
    if (JSON.stringify(delivery[name]) !== JSON.stringify(from))
      fail(
        `${key} is now ${JSON.stringify(delivery[name])}, not ${JSON.stringify(from)}; this proposal is stale.`,
        409,
      );
    value.delivery = { ...delivery, [name]: to };
    this.write(value, { expectedHash: before.hash });
    return this.readFile();
  }

  // Settings > Content rules: replace `contentRules.sets`. `options` are the
  // plugin ids a set may name, so a save never leaves a policy the guard
  // reads as invalid (which would block every write).
  updateContentRules({ sets, expectedHash } = {}, { pluginIds = null } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    if (!Array.isArray(sets)) fail("Give the list of rule sets.");
    const value = this.updateValue(before);
    validateContentRules({ sets }, { pluginIds });
    if (sets.length) value.contentRules = { sets };
    else delete value.contentRules;
    const written = this.write(value, { expectedHash: before.hash });
    return { hash: written?.hash ?? this.readFile().hash };
  }

  updateConversationSettings(input = {}) {
    const before = this.readFile(),
      next = {
        ...conversationSettings(this.store),
        ...conversationInput(
          "autoArchiveCompleted" in input
            ? { autoArchiveCompleted: input.autoArchiveCompleted }
            : {},
        ),
      },
      value = this.updateValue(before);
    value.version = 1;
    value.conversations = next;
    const written = this.write(value, {
      expectedHash: Object.hasOwn(input, "expectedHash")
        ? input.expectedHash
        : before.hash,
    });
    this.reload();
    return {
      settings: next,
      configuration: {
        ...this.metadata().repository,
        hash: written.hash,
      },
    };
  }

  updateExecutionProject(project) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    value.projects = record(value.projects) ? value.projects : {};
    // `landing` here is the older key of the repository's `landing.mode`
    // (§4.25): kept as the file has it, never written from the row.
    const old = value.projects[project.id]?.landing;
    value.projects[project.id] = {
      ...(project.name ? { name: project.name } : {}),
      root: this.portablePath(project.root),
      baseBranch: project.baseBranch || "main",
      ...(project.integrationBranch
        ? { integrationBranch: project.integrationBranch }
        : {}),
      ...(project.worktreeRoot
        ? { worktreeRoot: this.portablePath(project.worktreeRoot) }
        : {}),
      checks: structuredClone(project.checks || []),
      ...(project.checksEnv ? { checksEnv: [...project.checksEnv] } : {}),
      ...(project.worktreeHelper
        ? { worktreeHelper: project.worktreeHelper }
        : {}),
      ...(old === undefined ? {} : { landing: old }),
      planning: Boolean(project.planning),
      editable: project.editable !== false,
      ...executorSettings(project),
    };
    return this.writeApplied(value, before.hash, ["projects"]);
  }

  removeExecutionProject(id) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    if (record(value.projects)) {
      delete value.projects[id];
      if (!Object.keys(value.projects).length) delete value.projects;
    }
    return this.writeApplied(value, before.hash, ["projects"]);
  }

  // A GitHub source for `entry`, a github_repositories record (§4.39).
  updateGitHubIssueIntake(entry) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    writeGitHubSources(value, {
      upsert: { repository: entry.id, settings: entry },
    });
    return this.writeApplied(value, before.hash, ["github"]);
  }

  updateUnifiedRepository({ id, previousRepository, project, issueIntake }) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    if (record(value.projects)) delete value.projects[id];
    if (project) {
      value.projects = record(value.projects) ? value.projects : {};
      value.projects[id] = {
        ...(project.name ? { name: project.name } : {}),
        root: this.portablePath(project.root),
        baseBranch: project.baseBranch || "main",
        ...(project.integrationBranch
          ? { integrationBranch: project.integrationBranch }
          : {}),
        ...(project.worktreeRoot
          ? { worktreeRoot: this.portablePath(project.worktreeRoot) }
          : {}),
        checks: structuredClone(project.checks || []),
        ...(project.checksEnv ? { checksEnv: [...project.checksEnv] } : {}),
        ...(project.worktreeHelper
          ? { worktreeHelper: project.worktreeHelper }
          : {}),
        planning: Boolean(project.planning),
        editable: project.editable !== false,
        ...executorSettings(project),
      };
    }
    writeGitHubSources(value, {
      upsert: issueIntake
        ? { repository: issueIntake.id, settings: issueIntake }
        : null,
      remove: [previousRepository],
    });
    if (!Object.keys(value.projects || {}).length) delete value.projects;
    return this.writeApplied(value, before.hash, ["projects", "github"]);
  }

  removeUnifiedRepository(repository) {
    return this.updateUnifiedRepository({
      id: repository.id,
      previousRepository: repository.github,
      project: null,
      issueIntake: null,
    });
  }

  updatePlanningRepository(configuration) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    value.planningRepository = {
      root: this.portablePath(configuration.root),
      remote: configuration.remote || "origin",
      branch: configuration.branch || "avoozl-workspace",
      directory: configuration.directory,
    };
    return this.writeApplied(value, before.hash, ["planningRepository"]);
  }

  writeApplied(value, expectedHash, keys) {
    const written = this.write(value, { expectedHash });
    this.lastApplied = {
      at: new Date().toISOString(),
      keys: [...new Set(keys)].sort(),
      hash: written.hash,
    };
    this.store.setMeta("repositorySettingsLastApplied", this.lastApplied);
    this.reload();
    return {
      configuration: {
        ...this.metadata().repository,
        hash: written.hash,
      },
      status: {
        pending: [...this.metadata().pending],
        applyRequired: [...this.metadata().applyRequired],
        restartRequired: [...this.metadata().restartRequired],
        lastApplied: structuredClone(this.lastApplied),
      },
    };
  }

  portablePath(value) {
    let absolute = path.resolve(value);
    if (
      absolute === this.workspaceRoot ||
      absolute.startsWith(this.workspaceRoot + path.sep)
    )
      absolute =
        this.realWorkspaceRoot + absolute.slice(this.workspaceRoot.length);
    else if (entryStat(absolute)) absolute = fs.realpathSync.native(absolute);
    const relative = path.relative(this.realWorkspaceRoot, absolute);
    if (path.isAbsolute(relative))
      fail(
        "Repository configuration cannot contain an absolute machine path. Put machine-local paths in ~/.config/avoozl/config.json.",
      );
    return relative || ".";
  }

  updateValue(before) {
    const value = structuredClone(before.value);
    value.version = 1;
    value.$schema = REPOSITORY_CONFIG_SCHEMA_URL;
    if (before.exists) return value;
    const applied = appliedActions(this.store);
    if (Object.keys(applied.projects).length)
      value.projects = Object.fromEntries(
        Object.entries(applied.projects).map(([id, project]) => [
          id,
          {
            ...project,
            root: this.portablePath(project.root),
            ...(project.worktreeRoot
              ? { worktreeRoot: this.portablePath(project.worktreeRoot) }
              : {}),
          },
        ]),
      );
    for (const [repository, settings] of Object.entries(
      applied.github.issueIntake,
    ))
      writeGitHubSources(value, { upsert: { repository, settings } });
    if (applied.planningRepository)
      value.planningRepository = {
        ...applied.planningRepository,
        root: this.portablePath(applied.planningRepository.root),
      };
    return value;
  }

  watch() {
    if (this.watcher) return () => this.close();
    this.assertParents({ create: true });
    this.reload();
    this.watcher = this.watchFactory(this.directory, (_kind, name) => {
      if (String(name || "") !== path.basename(this.filename)) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.reload(), this.debounceMs);
      this.timer.unref?.();
    });
    return () => this.close();
  }

  close() {
    clearTimeout(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
  }
}
