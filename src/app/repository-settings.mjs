import { flowPolicy } from "./flow.mjs";
import { deliveryPolicy } from "./delivery.mjs";
import { validateTrackedRouting } from "./placement.mjs";
import { validateTrackedBudgets } from "./budget.mjs";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeGitHubLabelBehaviors } from "./github-label-behaviors.mjs";
import {
  normalizeGitHubPolicy,
  POLICY_KEYS,
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

function projectInput(value, id, base) {
  if (!record(value)) fail(`Project ${id} must contain a JSON object.`);
  const allowed = new Set([
    "name",
    "root",
    "baseBranch",
    "integrationBranch",
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
    ...(value.integrationBranch === undefined
      ? {}
      : {
          integrationBranch: text(
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
    "managedLabel",
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
    managedLabel: text(
      value.managedLabel || "avoozl:managed",
      `GitHub issue intake ${repository} managed label`,
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
  // Mode, Project and repository rules (§4.4); applied when read, not here.
  normalizeGitHubPolicy(value);
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
          ...(project.integrationBranch
            ? { integrationBranch: project.integrationBranch }
            : {}),
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

// `.avoozl.json` `conversations`. Only autoArchiveCompleted still acts: an
// accepted task's finished runs leave the conversation list. `driver` and
// `routing` configured the removed agent host; files that set them still
// load, and the values are ignored.
const CONVERSATION_KEYS = new Set([
  "autoArchiveCompleted",
  "driver",
  "routing",
]);
function conversationInput(value) {
  if (value === undefined) return null;
  if (!record(value))
    fail("Conversation configuration must contain a JSON object.");
  for (const key of Object.keys(value))
    if (!CONVERSATION_KEYS.has(key))
      fail(`Unknown conversation configuration setting ${key}.`);
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

const DELIVERY_FORM_KEYS = ["agent", "model", "prFeedback", "feedbackRounds"];

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
      githubInput(value.github);
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
    assertPortableRepositoryConfig(
      value,
      `repository Avoozl configuration at ${this.filename}`,
    );
    validateContentRules(value.contentRules);
    try {
      validateActivitySettings(value.activity);
      flowPolicy(value);
      deliveryPolicy(value);
      validateTrackedRouting(value);
      validateTrackedBudgets(value, this.filename);
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
      github: policySection(
        Object.fromEntries(
          POLICY_KEYS.filter((key) => Object.hasOwn(github, key)).map((key) => [
            key,
            github[key],
          ]),
        ),
      ),
    };
  }

  // Replaces the policy keys of `github` and keeps every other key. The
  // whole block is validated before the file is written.
  updateGitHubSettings({ github, expectedHash } = {}) {
    const section = policySection(github),
      before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    const value = this.updateValue(before),
      next = Object.fromEntries(
        Object.entries(record(value.github) ? value.github : {}).filter(
          ([key]) => !POLICY_KEYS.includes(key),
        ),
      );
    Object.assign(next, section);
    githubInput(next);
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
    if (repository) {
      if (!record(value.projects?.[repository]))
        fail(`Repository ${repository} is not in .avoozl.json projects.`, 404);
      if (Object.keys(flow).length) value.projects[repository].flow = flow;
      else delete value.projects[repository].flow;
    } else if (Object.keys(flow).length) value.flow = flow;
    else delete value.flow;
    this.write(value, { expectedHash: before.hash });
    return this.readFlowSettings();
  }

  // Settings > Budgets (§4.17): the workspace's per-task cap and mode, and
  // each repository's. Prices are not here: they are this machine's only.
  readBudgetSettings() {
    const file = this.readFile(),
      projects = record(file.value.projects) ? file.value.projects : {};
    return {
      filename: this.filename,
      exists: file.exists,
      hash: file.hash,
      budget: record(file.value.budget)
        ? structuredClone(file.value.budget)
        : {},
      repositories: Object.fromEntries(
        Object.entries(projects)
          .filter(([, p]) => record(p))
          .map(([id, p]) => [
            id,
            record(p.budget) ? structuredClone(p.budget) : {},
          ]),
      ),
    };
  }

  updateBudgetSettings({ budget, repository = null, expectedHash } = {}) {
    const before = this.readFile();
    if (expectedHash !== before.hash)
      fail("Avoozl configuration changed; reload before saving.", 409);
    if (!record(budget)) fail("Give the budget as an object.");
    const value = this.updateValue(before);
    if (repository) {
      if (!record(value.projects?.[repository]))
        fail(`Repository ${repository} is not in .avoozl.json projects.`, 404);
      if (Object.keys(budget).length)
        value.projects[repository].budget = budget;
      else delete value.projects[repository].budget;
    } else if (Object.keys(budget).length) value.budget = budget;
    else delete value.budget;
    this.write(value, { expectedHash: before.hash });
    return this.readBudgetSettings();
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

  // Settings > Delivery: the writer's agent and model and pull request
  // feedback (R53.3, R54.8). Other delivery keys are kept as they are.
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
      managedLabel: entry.managedLabel || "avoozl:managed",
      enabled: true,
      autoStart: Boolean(entry.autoStart),
      provider: entry.provider || null,
      model: entry.model || null,
      allowedActors: [...new Set(entry.allowedActors || [])].sort(),
      minimumPermission: entry.minimumPermission || "write",
    };
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
        ...(project.integrationBranch
          ? { integrationBranch: project.integrationBranch }
          : {}),
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
