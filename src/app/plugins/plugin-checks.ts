// Checks from a plugin (plugin-checks D1 to D3, PK1, PK2, PK7.1, PK10.1 to
// PK10.3). A plugin that provides `checks` ships check definitions, their
// scripts and decide prompts in its own folder, so the plugin's content hash
// covers them and approving the plugin approves them. Each check's step is
// a run step (a script in the folder) or an MCP step (fixed calls to a
// local stdio MCP server this machine maps by alias). Nothing here runs a
// check: check-runs.mjs and verify.mjs do, after the filters in
// repository-checks.mjs.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonical, fail, type Store } from "../store/store.ts";
import type { PluginCheck } from "../workspace/repository-checks.ts";
import { contentBinding } from "../content/content-rules.ts";
import { pluginCheckConflicts } from "../workspace/repository-checks.ts";
import {
  contentHash,
  credentialValue,
  inspectPlugins,
  pluginSettingsPath,
  readPluginSettings,
  writePluginSettings,
} from "./plugins.ts";

export const STAGES = Object.freeze(["task", "phase", "branch"]);
const DEFINITION_KEYS = Object.freeze([
  "repos",
  "paths",
  "run",
  "mcp",
  "env",
  "network",
  "timeout",
  "decide",
  "decideAt",
  "stage",
]);
const CHECK_NAME = /^[a-z][a-z0-9-]{0,39}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const TOOL = /^[A-Za-z0-9_.:-]{1,128}$/;
const MAX_CHECKS = 20;
const MAX_GLOBS = 50;
const MAX_FILE = 64 * 1024;
// `$` then `.key` or `[index]` parts: no filter or wildcard can run.
const REPLY_PATH = /^\$(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*$/;
const PLACEHOLDER = /\{([a-z_]+)(?::([^{}]+))?\}/g;
const RUN_FILLS = ["commit", "base", "repo"];
const MCP_FILLS = ["commit", "base", "repo", "diff_path"];

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// One fixed MCP call of a check's step.
interface McpCall {
  tool: string;
  args?: Record<string, unknown>;
  id?: string;
}
// A check's MCP step: a start call, an optional poll, and the result.
interface McpStep {
  server: string;
  start: McpCall;
  poll?: McpCall & {
    everySeconds?: number;
    until: { path: string; in: unknown[] };
  };
  result: { path: string; pass: unknown[]; text?: string };
}
// A check as a plugin's manifest defines it, once validateChecksPart passed.
export interface CheckDefinition {
  repos: string[];
  paths?: string[];
  run?: string[];
  mcp?: McpStep;
  env?: string[];
  network?: boolean;
  timeout?: number;
  decide?: string;
  decideAt?: string[];
  stage?: string;
}
// A server alias a checks plugin declares.
interface ServerDeclaration {
  about: string;
}
// What a checks plugin's manifest declares.
interface ChecksManifest {
  checks?: Record<string, CheckDefinition>;
  servers?: Record<string, ServerDeclaration>;
}
// A plugin, as inspectPlugins reports what checks read of it.
interface CheckedPlugin {
  id: string;
  state?: string;
  version?: string;
  hash?: string;
  location?: string | null;
  commit?: string;
  entry?: { git?: unknown };
  provides?: string[];
  manifest?: ChecksManifest | null;
  context?: { servers?: Record<string, unknown> } | null;
}
// One alias's local MCP server: its command and the names of its env.
interface Mapping {
  command?: string[];
  env: string[];
}
// plugins.json, as far as checks read and write it.
type CheckSettings = {
  mcp?: Record<string, Record<string, Mapping>>;
  approvals: Record<string, unknown>;
  broken?: Record<string, { reason: string; at: string }>;
  [key: string]: unknown;
};
// Where this machine's plugins are declared and approved.
type Options = { workspaceRoot?: string | null; settingsFile: string };

// A relative file inside the plugin folder: no `..`, not absolute, there.
function pluginFile(
  folder: string,
  file: unknown,
  where: string,
  { ext }: { ext?: string } = {},
) {
  if (
    typeof file !== "string" ||
    !file.trim() ||
    path.isAbsolute(file) ||
    /^[A-Za-z]:/.test(file) ||
    file.split(/[\\/]/).includes("..")
  )
    fail(`${where} must be a relative path to a file inside the plugin.`);
  if (ext && !file.endsWith(ext)) fail(`${where} must be a ${ext} file.`);
  const full = path.join(folder, file);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(full);
  } catch {
    fail(`${where} names ${file}, which is not in the plugin.`);
  }
  if (!stat.isFile()) fail(`${where} names ${file}, which is not a file.`);
  return full;
}

const globs = (
  value: unknown,
  where: string,
  { required }: { required: boolean },
) => {
  if (value === undefined && !required) return;
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_GLOBS ||
    value.some(
      (glob) => typeof glob !== "string" || !glob.trim() || glob.length > 200,
    )
  )
    fail(`${where} must be 1 to ${MAX_GLOBS} globs of 1 to 200 characters.`);
};

// Every `{name}` and `{file:NAME}` in a string, checked against `allowed`.
function placeholders(
  text: unknown,
  where: string,
  allowed: string[],
  folder?: string,
) {
  for (const [, name, arg] of String(text).matchAll(PLACEHOLDER)) {
    if (name === "file" && allowed.includes("file") && folder) {
      if (
        statSize(pluginFile(folder, arg, `${where} {file:${arg}}`)) > MAX_FILE
      )
        fail(`${where} {file:${arg}} is over 64 KB.`);
      continue;
    }
    if (arg !== undefined || !allowed.includes(name))
      fail(
        `${where} holds {${name}${arg !== undefined ? ":" + arg : ""}}; use only ${allowed.map((n) => (n === "file" ? "{file:NAME}" : `{${n}}`)).join(", ")}.`,
      );
  }
}
const statSize = (file: string) => fs.statSync(file).size;

// Each string inside a JSON value; keys are never filled.
function eachString(
  value: unknown,
  visit: (text: string, where: string) => void,
  where: string,
): void {
  if (typeof value === "string") return visit(value, where);
  if (Array.isArray(value))
    return value.forEach((item, i) =>
      eachString(item, visit, `${where}[${i}]`),
    );
  if (record(value))
    for (const [key, child] of Object.entries(value))
      eachString(child, visit, `${where}.${key}`);
}

const replyPath = (value: unknown, where: string) => {
  if (typeof value !== "string" || !REPLY_PATH.test(value))
    fail(`${where} must be $ then .key or [index] parts, with no filter.`);
};
const values = (value: unknown, where: string) => {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    fail(`${where} must list 1 to 50 values.`);
};

function validateMcp(
  step: unknown,
  where: string,
  servers: Record<string, unknown>,
  folder: string,
) {
  if (!record(step)) fail(`${where} must be an object.`);
  for (const key of Object.keys(step))
    if (!["server", "start", "poll", "result"].includes(key))
      fail(`${where}.${key} is not an MCP step setting.`);
  if (typeof step.server !== "string" || !Object.hasOwn(servers, step.server))
    fail(
      `${where}.server names ${step.server}, which servers does not declare.`,
    );
  const call = (
    value: unknown,
    label: string,
    keys: string[],
    fills: string[],
  ): Record<string, unknown> => {
    if (!record(value)) fail(`${label} must be an object.`);
    for (const key of Object.keys(value))
      if (!keys.includes(key)) fail(`${label}.${key} is not a setting.`);
    if (typeof value.tool !== "string" || !TOOL.test(value.tool))
      fail(`${label}.tool must name one tool.`);
    if (value.args !== undefined && !record(value.args))
      fail(`${label}.args must be an object.`);
    eachString(
      value.args ?? {},
      (text, at) => placeholders(text, at, fills, folder),
      `${label}.args`,
    );
    return value;
  };
  const start = call(
    step.start,
    `${where}.start`,
    ["tool", "args", "id"],
    [...MCP_FILLS, "file"],
  );
  if (start.id !== undefined) replyPath(start.id, `${where}.start.id`);
  if (step.poll !== undefined) {
    if (start.id === undefined)
      fail(`${where}.start.id is needed when the step polls.`);
    const poll = call(
      step.poll,
      `${where}.poll`,
      ["tool", "args", "everySeconds", "until"],
      [...MCP_FILLS, "id", "file"],
    );
    const every = poll.everySeconds;
    if (
      every !== undefined &&
      (typeof every !== "number" ||
        !Number.isInteger(every) ||
        every < 5 ||
        every > 3600)
    )
      fail(`${where}.poll.everySeconds must be a whole number from 5 to 3600.`);
    const until = poll.until;
    if (
      !record(until) ||
      Object.keys(until).some((k) => !["path", "in"].includes(k))
    )
      fail(`${where}.poll.until must be {path, in}.`);
    replyPath(until.path, `${where}.poll.until.path`);
    values(until.in, `${where}.poll.until.in`);
  }
  const result = step.result;
  if (
    !record(result) ||
    Object.keys(result).some((k) => !["path", "pass", "text"].includes(k))
  )
    fail(`${where}.result must be {path, pass, text?}.`);
  replyPath(result.path, `${where}.result.path`);
  values(result.pass, `${where}.result.pass`);
  if (result.text !== undefined) replyPath(result.text, `${where}.result.text`);
}

// The `checks` part of a manifest whose folder is `folder` (PK1, PK10.1).
// Throws naming the plugin, the check and the key; returns the checks.
export function validateChecksPart(
  given: unknown,
  folder: string,
): Record<string, CheckDefinition> | null {
  const manifest = record(given) ? given : {},
    id = manifest.id,
    where = (name: string, key?: string) =>
      `Plugin ${id} check ${name}${key ? ` key ${key}` : ""}`;
  const provides = Array.isArray(manifest.provides) ? manifest.provides : [];
  if (!provides.includes("checks")) {
    if (manifest.checks !== undefined || manifest.servers !== undefined)
      fail(
        `Plugin ${id} has checks or servers but provides does not list checks.`,
      );
    return null;
  }
  const checks = manifest.checks;
  if (!record(checks) || !Object.keys(checks).length)
    fail(
      `Plugin ${id} provides checks, so checks must map a name to at least one check.`,
    );
  if (Object.keys(checks).length > MAX_CHECKS)
    fail(`Plugin ${id} holds more than ${MAX_CHECKS} checks.`);
  const servers = manifest.servers ?? {};
  if (!record(servers)) fail(`Plugin ${id} servers must be an object.`);
  for (const [alias, server] of Object.entries(servers)) {
    if (!CHECK_NAME.test(alias))
      fail(`Plugin ${id} server alias ${alias} is not a name.`);
    if (
      !record(server) ||
      Object.keys(server).some((k) => k !== "about") ||
      typeof server.about !== "string" ||
      !server.about.trim() ||
      server.about.length > 200
    )
      fail(
        `Plugin ${id} server ${alias} must be {about}, one line of 1 to 200 characters.`,
      );
  }
  const used = new Set<string>();
  for (const [name, check] of Object.entries(checks)) {
    if (!CHECK_NAME.test(name))
      fail(
        `Plugin ${id} check ${name} is not a check name. Use lowercase letters, digits and dashes, starting with a letter, at most 40 characters.`,
      );
    if (!record(check)) fail(`${where(name)} must be an object.`);
    for (const key of Object.keys(check))
      if (!DEFINITION_KEYS.includes(key))
        fail(`${where(name, key)} is not a check setting.`);
    globs(check.repos, where(name, "repos"), { required: true });
    globs(check.paths, where(name, "paths"), { required: false });
    if ((check.run === undefined) === (check.mcp === undefined))
      fail(`${where(name)} holds exactly one step: run or mcp.`);
    if (check.run !== undefined) {
      if (
        !Array.isArray(check.run) ||
        !check.run.length ||
        check.run.some((part) => typeof part !== "string" || !part)
      )
        fail(`${where(name, "run")} must be command arguments.`);
      pluginFile(folder, check.run[0], `${where(name, "run")} [0]`);
      check.run
        .slice(1)
        .forEach((part, i) =>
          placeholders(part, `${where(name, "run")} [${i + 1}]`, RUN_FILLS),
        );
    } else {
      validateMcp(check.mcp, where(name, "mcp"), servers, folder);
      if (record(check.mcp)) used.add(String(check.mcp.server));
      for (const key of ["network", "env"])
        if (check[key] !== undefined)
          fail(
            `${where(name, key)} goes with a run step; an MCP server's environment is this machine's mapping.`,
          );
    }
    if (
      check.env !== undefined &&
      (!Array.isArray(check.env) ||
        check.env.length > 50 ||
        check.env.some((n) => typeof n !== "string" || !ENV_NAME.test(n)))
    )
      fail(`${where(name, "env")} must list environment variable names.`);
    if (check.network !== undefined && typeof check.network !== "boolean")
      fail(`${where(name, "network")} must be true or false.`);
    if (
      check.timeout !== undefined &&
      (typeof check.timeout !== "number" ||
        !Number.isInteger(check.timeout) ||
        check.timeout < 1 ||
        check.timeout > 7200)
    )
      fail(`${where(name, "timeout")} must be whole seconds from 1 to 7200.`);
    if (check.decide !== undefined)
      pluginFile(folder, check.decide, where(name, "decide"), { ext: ".md" });
    if (check.decideAt !== undefined) {
      if (check.decide === undefined)
        fail(`${where(name, "decideAt")} goes with decide.`);
      if (
        !Array.isArray(check.decideAt) ||
        !check.decideAt.length ||
        new Set(check.decideAt).size !== check.decideAt.length ||
        check.decideAt.some((at) => !["approve", "diff"].includes(at))
      )
        fail(
          `${where(name, "decideAt")} must list approve and diff, each once.`,
        );
    }
    if (check.stage !== undefined && !STAGES.some((s) => s === check.stage))
      fail(`${where(name, "stage")} must be task, phase or branch.`);
  }
  for (const alias of Object.keys(servers))
    if (!used.has(alias))
      fail(`Plugin ${id} server ${alias} is declared but no check uses it.`);
  // The manifest's checks, each checked above.
  return checks as Record<string, CheckDefinition>;
}

// ---- This machine's MCP mappings (PK10.2, PK10.3) ----------------------

// One alias's mapping, checked: {command: argv, env: [names]}, no
// credential in it.
export function validateMapping(
  value: unknown,
  where = "mapping",
  { commandOptional = false } = {},
): Mapping {
  if (!record(value)) fail(`${where} must be {command, env}.`);
  for (const key of Object.keys(value))
    if (!["command", "env"].includes(key))
      fail(
        /token|secret|password|key|credential/i.test(key)
          ? `${where}.${key} looks like a credential. Name an environment variable in env instead.`
          : `${where}.${key} is not a mapping setting; use command and env.`,
      );
  if (
    value.env !== undefined &&
    (!Array.isArray(value.env) ||
      value.env.some((n) => typeof n !== "string" || !ENV_NAME.test(n)))
  )
    fail(`${where}.env must list environment variable names.`);
  if (commandOptional && value.command === undefined)
    return { env: [...(value.env ?? [])] };
  if (
    !Array.isArray(value.command) ||
    !value.command.length ||
    value.command.length > 50 ||
    value.command.some(
      (part) => typeof part !== "string" || !part || part.length > 1000,
    )
  )
    fail(`${where}.command must be command arguments.`);
  for (const part of value.command)
    if (credentialValue(part))
      fail(
        `${where}.command holds what looks like a credential. Name an environment variable in env instead.`,
      );
  return { command: [...value.command], env: [...(value.env ?? [])] };
}

// The hash of one plugin's mappings that its approval binds.
export const mappingHash = (mappings: unknown) =>
  createHash("sha256")
    .update(canonical(mappings ?? {}))
    .digest("hex");

// Settings › Plugins **Set mapping** and `avoozl plugin map`: a person's
// act only (the operation is person-only). A changed mapping leaves the
// plugin's approval stale until it is approved again.
export function setMapping(
  options: Options,
  {
    id,
    alias,
    command,
    env,
    remove = false,
  }: {
    id?: unknown;
    alias?: unknown;
    command?: unknown;
    env?: unknown;
    remove?: unknown;
  },
) {
  const plugins: CheckedPlugin[] = inspectPlugins(options),
    plugin = plugins.find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  // A context plugin's aliases are in its servers file; its mapping's
  // command is optional and replaces the plugin's (epic-context EC4.3).
  const declared = plugin.manifest?.servers ?? plugin.context?.servers ?? {};
  if (typeof alias !== "string" || !Object.hasOwn(declared, alias))
    fail(`Plugin ${id} declares no server ${alias}.`, 404);
  const settings: CheckSettings = readPluginSettings(options.settingsFile),
    own = { ...(settings.mcp?.[plugin.id] ?? {}) };
  if (remove) delete own[alias];
  else
    own[alias] = validateMapping(
      { ...(command ? { command } : {}), ...(env ? { env } : {}) },
      `mcp.${id}.${alias}`,
      { commandOptional: Boolean(plugin.context) },
    );
  settings.mcp = { ...settings.mcp, [plugin.id]: own };
  if (!Object.keys(own).length) delete settings.mcp[plugin.id];
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id);
}

// ---- Approved checks ---------------------------------------------------

// Each check of each approved plugin on this machine, as a check entry:
// {name, source: "plugin", plugin, repos, paths, argv, step, ...}. `argv`
// is for display; a run step's real command is resolved at run time.
export function approvedPluginChecks(options: Options): PluginCheck[] {
  const settings: CheckSettings = readPluginSettings(options.settingsFile),
    plugins: CheckedPlugin[] = inspectPlugins(options);
  return plugins
    .filter(
      (plugin) =>
        plugin.state === "approved" && plugin.provides?.includes("checks"),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((plugin) =>
      Object.entries(plugin.manifest?.checks ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, check]) => {
          const mappings = settings.mcp?.[plugin.id] ?? {},
            mapping = check.mcp ? (mappings[check.mcp.server] ?? null) : null;
          return {
            name,
            source: "plugin",
            plugin: {
              id: plugin.id,
              version: plugin.version,
              hash: plugin.hash,
              folder: plugin.location,
              git: plugin.entry?.git !== undefined,
              ...(plugin.commit ? { commit: plugin.commit } : {}),
            },
            repos: [...check.repos],
            paths: check.paths?.length ? [...check.paths] : null,
            argv: check.run
              ? [...check.run]
              : [
                  "mcp",
                  String(check.mcp?.server),
                  String(check.mcp?.start.tool),
                ],
            step: check.run ? "run" : "mcp",
            ...(check.mcp
              ? {
                  mcp: structuredClone(check.mcp),
                  mapping,
                  mappingHash: mappingHash(mapping),
                }
              : {}),
            env: [...(check.env ?? [])],
            network: check.network === true,
            ...(check.timeout ? { timeoutSeconds: check.timeout } : {}),
            ...(check.decide
              ? {
                  decide: check.decide,
                  decidePrompt: fs.readFileSync(
                    path.join(String(plugin.location), check.decide),
                    "utf8",
                  ),
                  decideAt: [...(check.decideAt ?? ["diff"])],
                }
              : {}),
            stage: check.stage ?? "task",
          };
        }),
    );
}

const loaded = new Map<
  string,
  { stamp: number; at: number; checks: PluginCheck[] }
>();
const LOAD_MS = 2000;
const mtime = (file: string) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

// The approved plugin checks of the workspace a store is bound to, loaded
// once per run or view (at most every 2 seconds). An unbound store, or a
// plugin setup that cannot be read, has none.
export function pluginChecksOf(store: Store): PluginCheck[] {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return [];
  const settingsFile = binding.pluginSettingsFile ?? pluginSettingsPath(),
    key = `${binding.workspaceRoot}\0${settingsFile}`,
    stamp = mtime(settingsFile),
    hit = loaded.get(key);
  if (hit && hit.stamp === stamp && Date.now() - hit.at < LOAD_MS)
    return hit.checks;
  let checks: PluginCheck[] = [];
  try {
    checks = approvedPluginChecks({
      workspaceRoot: binding.workspaceRoot,
      settingsFile,
    });
  } catch {
    checks = [];
  }
  loaded.set(key, { stamp, at: Date.now(), checks });
  return checks;
}

// The plugin options of a store's binding, or null.
export function pluginOptionsOf(store: Store) {
  const binding = contentBinding(store);
  return binding?.workspaceRoot
    ? {
        workspaceRoot: binding.workspaceRoot,
        settingsFile: binding.pluginSettingsFile ?? pluginSettingsPath(),
      }
    : null;
}

// A check whose plugin opened a listener, or whose server did (PK7.5):
// the plugin's approval goes and the reason stays until a person approves
// it again.
export function markPluginBroken(
  options: unknown,
  id: string,
  reason: unknown,
) {
  const file = record(options) ? options.settingsFile : null;
  if (typeof file !== "string" || !file) return;
  const settings: CheckSettings = readPluginSettings(file);
  delete settings.approvals[id];
  settings.broken = {
    ...settings.broken,
    [id]: {
      reason: String(reason).slice(0, 300),
      at: new Date().toISOString(),
    },
  };
  writePluginSettings(file, settings);
  loaded.clear();
}

// Whether a local-folder plugin's files are still the approved ones, just
// before a run (R83.6, PK7.1): null when they are, else why not. A git
// plugin sits in a commit-named folder and is not hashed again.
export function pluginChanged(plugin: { id: string; [key: string]: unknown }) {
  if (plugin.git) return null;
  let now: string;
  try {
    now = contentHash(plugin.folder);
  } catch (error) {
    return `plugin ${plugin.id} cannot be read: ${messageOf(error)}`;
  }
  return now === plugin.hash
    ? null
    : `plugin ${plugin.id} changed after it was approved; approve it again`;
}

// The Needs you rows plugin checks raise, read from stored records only:
// two plugins with one check name for a repository (PK2.4). Each row's id
// names the repository and check, so reading twice shows one row.
export function pluginCheckNeedsYou(
  store: Store,
  plugins = pluginChecksOf(store),
) {
  const items: {
    kind: string;
    reason: string;
    id: string;
    taskId: null;
    authority: string;
    title: string;
    detail: string;
  }[] = [];
  if (!plugins.length) return items;
  for (const repository of store.list<{ id: string; github?: string | null }>(
    "repositories",
  ))
    for (const clash of pluginCheckConflicts(repository, plugins).clashes)
      items.push({
        kind: "needs-human",
        reason: "plugin-check-clash",
        id: `plugin-check-clash:${repository.id}:${clash.name}`,
        taskId: null,
        authority: "avoozl",
        title: `Plugins ${clash.plugins.join(" and ")} both define check ${clash.name} for ${repository.github || repository.id}`,
        detail: `Neither runs there until one is disabled or removed in Settings › Plugins.`,
      });
  return items;
}

// What Settings › Plugins shows a person for one checks plugin before and
// after approval (PK7.2, PK8.3): each check's fields, its step (every MCP
// tool, its arguments and the full text of each file it sends), the decide
// prompt's full text, the repositories here it applies to and where it is
// shadowed or clashes, and each server alias with this machine's mapping.
export function pluginChecksView(
  store: Store,
  {
    id,
    location,
    manifest,
  }: {
    id: string;
    location?: string | null;
    manifest: unknown;
  },
  options: Options,
) {
  // A manifest inspectPlugins read and validateChecksPart checked.
  const { checks, servers } = (
    record(manifest) ? manifest : {}
  ) as ChecksManifest;
  if (!checks || !location) return null;
  const settings: CheckSettings = readPluginSettings(options.settingsFile),
    read = (file: string) => {
      try {
        return fs
          .readFileSync(path.join(location, file), "utf8")
          .slice(0, MAX_FILE);
      } catch {
        return null;
      }
    },
    sent = (step: McpStep) =>
      Object.fromEntries(
        [...JSON.stringify(step).matchAll(/\{file:([^{}]+)\}/g)].map(
          ([, name]) => [name, read(name)],
        ),
      ),
    mine = Object.entries(checks).map(([name, check]) => ({
      name,
      repos: check.repos ?? [],
      plugin: { id },
    })),
    others = pluginChecksOf(store).filter((check) => check.plugin.id !== id),
    repositories = store.list<{ id: string; github?: string | null }>(
      "repositories",
    );
  return {
    checks: Object.entries(checks).map(([name, check]) => ({
      name,
      repos: check.repos ?? [],
      paths: check.paths ?? null,
      stage: check.stage ?? "task",
      timeout: check.timeout ?? null,
      step: check.run
        ? {
            kind: "run",
            argv: check.run,
            env: check.env ?? [],
            network: check.network === true,
          }
        : check.mcp
          ? {
              kind: "mcp",
              server: check.mcp.server,
              start: check.mcp.start,
              ...(check.mcp.poll ? { poll: check.mcp.poll } : {}),
              result: check.mcp.result,
              files: sent(check.mcp),
            }
          : null,
      decide: check.decide
        ? {
            file: check.decide,
            at: check.decideAt ?? ["diff"],
            text: read(check.decide),
          }
        : null,
      appliesTo: repositories
        .filter((repository) =>
          pluginCheckConflicts(repository, mine).kept.some(
            (entry) => entry.name === name,
          ),
        )
        .map((repository) => repository.github || repository.id),
    })),
    shadowed: repositories.flatMap((repository) =>
      pluginCheckConflicts(repository, mine).shadowed.map((entry) => ({
        repository: repository.github || repository.id,
        name: entry.name,
      })),
    ),
    clashes: repositories.flatMap((repository) =>
      pluginCheckConflicts(repository, [...mine, ...others])
        .clashes.filter((clash) => clash.plugins.includes(id))
        .map((clash) => ({
          repository: repository.github || repository.id,
          ...clash,
        })),
    ),
    servers: Object.entries(servers ?? {}).map(([alias, server]) => ({
      alias,
      about: server.about,
      mapping: settings.mcp?.[id]?.[alias] ?? null,
    })),
  };
}
