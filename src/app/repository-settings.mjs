import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CONVERSATION_SETTINGS_DEFAULTS,
  conversationSettings,
  normalizeConversationSettings,
  updateConversationSettings,
} from "./conversation-settings.mjs";
import { normalizeAgentRouting } from "./agent-routing.mjs";
import { normalizeGitHubLabelBehaviors } from "./github-label-behaviors.mjs";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
  avoozlConfigSchemaPath,
} from "./layered-config.mjs";
import { fail } from "./store.mjs";

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
      ([key]) => !["$schema", "version", "conversations"].includes(key),
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

function projectInput(value, id, base) {
  if (!record(value)) fail(`Project ${id} must contain a JSON object.`);
  const allowed = new Set([
    "name",
    "root",
    "baseBranch",
    "worktreeRoot",
    "checks",
    "planning",
    "editable",
  ]);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
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
  return {
    ...(value.name === undefined
      ? {}
      : { name: text(value.name, `Project ${id} name`) }),
    root: resolve(text(value.root, `Project ${id} root`)),
    baseBranch: text(value.baseBranch || "main", `Project ${id} base branch`),
    ...(value.worktreeRoot === undefined
      ? {}
      : {
          worktreeRoot: resolve(
            text(value.worktreeRoot, `Project ${id} worktree root`),
          ),
        }),
    checks: structuredClone(checks),
    planning: Boolean(value.planning),
    editable: value.editable !== false,
  };
}

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

function repositoryId(value, label) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
  )
    fail(`${label} must be an owner/repository name.`);
  return value;
}

function githubIssueInput(value, repository) {
  if (!record(value))
    fail(`GitHub issue intake ${repository} must contain a JSON object.`);
  const allowed = new Set([
    "projectId",
    "workspaceRepositoryId",
    "assignee",
    "label",
    "enabled",
    "autoStart",
    "provider",
    "model",
    "allowedActors",
    "minimumPermission",
  ]);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      fail(`Unknown GitHub issue intake setting ${repository}.${key}.`);
  const allowedActors = value.allowedActors ?? [];
  if (
    !Array.isArray(allowedActors) ||
    allowedActors.some((actor) => typeof actor !== "string" || !actor.trim())
  )
    fail(`GitHub issue intake ${repository} allowedActors must be names.`);
  const minimumPermission = value.minimumPermission || "write";
  if (!["write", "maintain", "admin"].includes(minimumPermission))
    fail(`GitHub issue intake ${repository} has an invalid permission.`);
  return {
    projectId: text(
      value.projectId,
      `GitHub issue intake ${repository} project`,
    ),
    ...(value.workspaceRepositoryId === undefined
      ? {}
      : {
          workspaceRepositoryId: text(
            value.workspaceRepositoryId,
            `GitHub issue intake ${repository} workspace repository`,
          ),
        }),
    assignee: text(
      value.assignee,
      `GitHub issue intake ${repository} assignee`,
    ),
    label: text(
      value.label || "avoozl:ready",
      `GitHub issue intake ${repository} label`,
    ),
    enabled: value.enabled !== false,
    autoStart: Boolean(value.autoStart),
    provider: text(value.provider, "GitHub issue provider", { nullable: true }),
    model: text(value.model, "GitHub issue model", { nullable: true }),
    allowedActors: [
      ...new Set(allowedActors.map((actor) => actor.trim())),
    ].sort(),
    minimumPermission,
  };
}

function githubQueueInput(value, repository) {
  if (!record(value))
    fail(`GitHub Queue ${repository} must contain a JSON object.`);
  const allowed = new Set([
    "projectId",
    "workspaceRepositoryId",
    "enabled",
    "includeIssues",
    "includePullRequests",
    "visibility",
    "labelBehaviors",
  ]);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      fail(`Unknown GitHub Queue setting ${repository}.${key}.`);
  const visibility = value.visibility || "private";
  if (!["private", "public"].includes(visibility))
    fail(`GitHub Queue ${repository} visibility must be private or public.`);
  return {
    projectId: text(value.projectId, `GitHub Queue ${repository} project`, {
      nullable: true,
    }),
    ...(value.workspaceRepositoryId === undefined
      ? {}
      : {
          workspaceRepositoryId: text(
            value.workspaceRepositoryId,
            `GitHub Queue ${repository} workspace repository`,
          ),
        }),
    enabled: value.enabled !== false,
    includeIssues: value.includeIssues !== false,
    includePullRequests: value.includePullRequests !== false,
    labelBehaviors: normalizeGitHubLabelBehaviors(value.labelBehaviors),
    visibility,
  };
}

function githubInput(value) {
  if (value === undefined) return { issueIntake: {}, queue: {} };
  if (!record(value)) fail("GitHub configuration must contain a JSON object.");
  for (const key of Object.keys(value))
    if (!["issueIntake", "queue"].includes(key))
      fail(`Unknown GitHub configuration setting ${key}.`);
  const map = (items, normalize, label) => {
    if (items === undefined) return {};
    if (!record(items)) fail(`${label} must contain a JSON object.`);
    return sortedRecord(
      Object.fromEntries(
        Object.entries(items).map(([name, entry]) => {
          const id = repositoryId(name, label);
          return [id, normalize(entry, id)];
        }),
      ),
    );
  };
  return {
    issueIntake: map(
      value.issueIntake,
      githubIssueInput,
      "GitHub issue intake",
    ),
    queue: map(value.queue, githubQueueInput, "GitHub Queue"),
  };
}

function planningRepositoryInput(value, base) {
  if (value === undefined || value === null) return null;
  if (!record(value))
    fail("Planning repository configuration must contain a JSON object.");
  for (const key of Object.keys(value))
    if (!["root", "remote", "branch", "directory"].includes(key))
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
    github: githubInput(value.github),
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
          ...(project.worktreeRoot
            ? { worktreeRoot: project.worktreeRoot }
            : {}),
          checks: structuredClone(project.checks || []),
          planning: Boolean(project.planning),
          editable: project.editable !== false,
        },
      ]),
    ),
    issueIntake = Object.fromEntries(
      store.list("github_repositories").map((entry) => [
        entry.id,
        {
          projectId: entry.projectId,
          ...(entry.workspaceRepositoryId
            ? { workspaceRepositoryId: entry.workspaceRepositoryId }
            : {}),
          assignee: entry.assignee,
          label: entry.label || "avoozl:ready",
          enabled: true,
          autoStart: Boolean(entry.autoStart),
          provider: entry.provider || null,
          model: entry.model || null,
          allowedActors: [...new Set(entry.allowedActors || [])].sort(),
          minimumPermission: entry.minimumPermission || "write",
        },
      ]),
    ),
    queue = Object.fromEntries(
      store.list("github_queue_repositories").map((entry) => [
        entry.id,
        {
          projectId: entry.projectId || null,
          ...(entry.workspaceRepositoryId
            ? { workspaceRepositoryId: entry.workspaceRepositoryId }
            : {}),
          enabled: entry.enabled !== false,
          includeIssues: entry.includeIssues !== false,
          includePullRequests: entry.includePullRequests !== false,
          labelBehaviors: normalizeGitHubLabelBehaviors(entry.labelBehaviors),
          visibility:
            entry.visibility ||
            (entry.private === false ? "public" : "private"),
        },
      ]),
    ),
    planning = store.getMeta("workspaceRepository");
  return {
    projects: sortedRecord(projects),
    github: {
      issueIntake: sortedRecord(issueIntake),
      queue: sortedRecord(queue),
    },
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
  assertSafeConfig(value, `workspace Avoozl configuration at ${filename}`);
  if (portable)
    assertPortableRepositoryConfig(
      value,
      `repository Avoozl configuration at ${filename}`,
    );
  return value;
}

function conversationInput(value) {
  if (value === undefined) return null;
  if (!record(value))
    fail("Conversation configuration must contain a JSON object.");
  const allowed = new Set(["autoArchiveCompleted", "driver", "routing"]);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      fail(`Unknown conversation configuration setting ${key}.`);
  const driver = value.driver;
  if (driver !== undefined && !record(driver))
    fail("Driver configuration must contain a JSON object.");
  for (const key of Object.keys(driver || {}))
    if (!["agentProfile", "model"].includes(key))
      fail(`Unknown Driver configuration setting ${key}.`);
  return {
    ...("autoArchiveCompleted" in value
      ? { autoArchiveCompleted: value.autoArchiveCompleted }
      : {}),
    ...(driver && "agentProfile" in driver
      ? { driverAgentProfile: driver.agentProfile }
      : {}),
    ...(driver && "model" in driver ? { driverModel: driver.model } : {}),
    ...(value.routing === undefined
      ? {}
      : { routing: normalizeAgentRouting(value.routing) }),
  };
}

function canonicalConversations(settings) {
  return {
    autoArchiveCompleted: settings.autoArchiveCompleted,
    driver: {
      agentProfile: settings.driverAgentProfile,
      model: settings.driverModel,
    },
    routing: settings.routing,
  };
}

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
    this.realWorkspaceRoot = fs.realpathSync(this.workspaceRoot);
    this.filename =
      files.repository || path.join(this.workspaceRoot, ".avoozl.json");
    this.directory = path.dirname(this.filename);
    this.files = {
      ...files,
      repository: this.filename,
    };
    this.sources = sources;
    this.baseConversationConfigured = baseConfig.conversations !== undefined;
    this.baseConversationSettings = normalizeConversationSettings(
      CONVERSATION_SETTINGS_DEFAULTS,
      conversationInput(baseConfig.conversations) || {},
    );
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
        restartDesired = withoutKeys(privileged, APPLY_KEYS);
      if (this.restartBaseline === null)
        this.restartBaseline = structuredClone(restartDesired);
      this.applyRequired = changedTopLevelKeys(applied, desired);
      this.restartRequired = changedTopLevelKeys(
        this.restartBaseline,
        restartDesired,
      );
      if (input || this.baseConversationConfigured || file.exists) {
        const current = conversationSettings(this.store),
          next = normalizeConversationSettings(
            this.baseConversationSettings,
            input || {},
          );
        if (!same(current, next))
          this.store.transaction(() => {
            updateConversationSettings(this.store, next);
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
    assertPortableRepositoryConfig(
      value,
      `repository Avoozl configuration at ${this.filename}`,
    );
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

  updateConversationSettings(input = {}) {
    const before = this.readFile(),
      current = {
        ...CONVERSATION_SETTINGS_DEFAULTS,
        ...(this.store.getMeta("conversationSettings") || {}),
      },
      next = normalizeConversationSettings(current, input),
      value = this.updateValue(before);
    value.version = 1;
    value.conversations = canonicalConversations(next);
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
    value.projects[project.id] = {
      ...(project.name ? { name: project.name } : {}),
      root: this.portablePath(project.root),
      baseBranch: project.baseBranch || "main",
      ...(project.worktreeRoot
        ? { worktreeRoot: this.portablePath(project.worktreeRoot) }
        : {}),
      checks: structuredClone(project.checks || []),
      planning: Boolean(project.planning),
      editable: project.editable !== false,
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

  updateGitHubIssueIntake(entry) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    value.github = record(value.github) ? value.github : {};
    value.github.issueIntake = record(value.github.issueIntake)
      ? value.github.issueIntake
      : {};
    value.github.issueIntake[entry.id] = {
      projectId: entry.projectId,
      ...(entry.workspaceRepositoryId
        ? { workspaceRepositoryId: entry.workspaceRepositoryId }
        : {}),
      assignee: entry.assignee,
      label: entry.label || "avoozl:ready",
      enabled: true,
      autoStart: Boolean(entry.autoStart),
      provider: entry.provider || null,
      model: entry.model || null,
      allowedActors: [...new Set(entry.allowedActors || [])].sort(),
      minimumPermission: entry.minimumPermission || "write",
    };
    return this.writeApplied(value, before.hash, ["github"]);
  }

  updateGitHubProjectConnection(issueIntake, queue) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    value.github = record(value.github) ? value.github : {};
    value.github.issueIntake = record(value.github.issueIntake)
      ? value.github.issueIntake
      : {};
    value.github.queue = record(value.github.queue) ? value.github.queue : {};
    value.github.issueIntake[issueIntake.id] = {
      projectId: issueIntake.projectId,
      ...(issueIntake.workspaceRepositoryId
        ? { workspaceRepositoryId: issueIntake.workspaceRepositoryId }
        : {}),
      assignee: issueIntake.assignee,
      label: issueIntake.label || "avoozl:ready",
      enabled: true,
      autoStart: Boolean(issueIntake.autoStart),
      provider: issueIntake.provider || null,
      model: issueIntake.model || null,
      allowedActors: [...new Set(issueIntake.allowedActors || [])].sort(),
      minimumPermission: issueIntake.minimumPermission || "write",
    };
    value.github.queue[queue.id] = {
      projectId: queue.projectId || null,
      ...(queue.workspaceRepositoryId
        ? { workspaceRepositoryId: queue.workspaceRepositoryId }
        : {}),
      enabled: queue.enabled !== false,
      includeIssues: queue.includeIssues !== false,
      includePullRequests: queue.includePullRequests !== false,
      labelBehaviors: normalizeGitHubLabelBehaviors(queue.labelBehaviors),
      visibility:
        queue.visibility || (queue.private === false ? "public" : "private"),
    };
    return this.writeApplied(value, before.hash, ["github"]);
  }

  updateGitHubQueue(entry) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    value.github = record(value.github) ? value.github : {};
    value.github.queue = record(value.github.queue) ? value.github.queue : {};
    value.github.queue[entry.id] = {
      projectId: entry.projectId || null,
      ...(entry.workspaceRepositoryId
        ? { workspaceRepositoryId: entry.workspaceRepositoryId }
        : {}),
      enabled: entry.enabled !== false,
      includeIssues: entry.includeIssues !== false,
      includePullRequests: entry.includePullRequests !== false,
      labelBehaviors: normalizeGitHubLabelBehaviors(entry.labelBehaviors),
      visibility:
        entry.visibility || (entry.private === false ? "public" : "private"),
    };
    return this.writeApplied(value, before.hash, ["github"]);
  }

  removeGitHubQueue(repository) {
    const before = this.readFile(),
      value = this.updateValue(before);
    value.version = 1;
    if (record(value.github?.queue)) {
      delete value.github.queue[repository];
      if (!Object.keys(value.github.queue).length) delete value.github.queue;
      if (!Object.keys(value.github).length) delete value.github;
    }
    return this.writeApplied(value, before.hash, ["github"]);
  }

  updateUnifiedRepository({
    id,
    previousRepository,
    project,
    queue,
    issueIntake,
  }) {
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
        ...(project.worktreeRoot
          ? { worktreeRoot: this.portablePath(project.worktreeRoot) }
          : {}),
        checks: structuredClone(project.checks || []),
        planning: Boolean(project.planning),
        editable: project.editable !== false,
      };
    }
    value.github = record(value.github) ? value.github : {};
    value.github.queue = record(value.github.queue) ? value.github.queue : {};
    value.github.issueIntake = record(value.github.issueIntake)
      ? value.github.issueIntake
      : {};
    for (const repository of [previousRepository, queue?.id, issueIntake?.id])
      if (repository) {
        delete value.github.queue[repository];
        delete value.github.issueIntake[repository];
      }
    if (queue)
      value.github.queue[queue.id] = {
        projectId: queue.projectId || null,
        ...(queue.workspaceRepositoryId
          ? { workspaceRepositoryId: queue.workspaceRepositoryId }
          : {}),
        enabled: queue.enabled !== false,
        includeIssues: queue.includeIssues !== false,
        includePullRequests: queue.includePullRequests !== false,
        labelBehaviors: normalizeGitHubLabelBehaviors(queue.labelBehaviors),
        visibility:
          queue.visibility || (queue.private === false ? "public" : "private"),
      };
    if (issueIntake)
      value.github.issueIntake[issueIntake.id] = {
        projectId: issueIntake.projectId,
        ...(issueIntake.workspaceRepositoryId
          ? { workspaceRepositoryId: issueIntake.workspaceRepositoryId }
          : {}),
        assignee: issueIntake.assignee,
        label: issueIntake.label || "avoozl:ready",
        enabled: true,
        autoStart: Boolean(issueIntake.autoStart),
        provider: issueIntake.provider || null,
        model: issueIntake.model || null,
        allowedActors: [...new Set(issueIntake.allowedActors || [])].sort(),
        minimumPermission: issueIntake.minimumPermission || "write",
      };
    if (!Object.keys(value.projects || {}).length) delete value.projects;
    if (!Object.keys(value.github.queue).length) delete value.github.queue;
    if (!Object.keys(value.github.issueIntake).length)
      delete value.github.issueIntake;
    if (!Object.keys(value.github).length) delete value.github;
    return this.writeApplied(value, before.hash, ["projects", "github"]);
  }

  removeUnifiedRepository(repository) {
    return this.updateUnifiedRepository({
      id: repository.id,
      previousRepository: repository.github,
      project: null,
      queue: null,
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
    else if (entryStat(absolute)) absolute = fs.realpathSync(absolute);
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
    value.$schema = "https://avoozl.dev/schema/repository-config-v1.json";
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
    if (
      Object.keys(applied.github.issueIntake).length ||
      Object.keys(applied.github.queue).length
    )
      value.github = structuredClone(applied.github);
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
