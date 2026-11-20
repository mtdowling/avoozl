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
import { canonical, fail } from "../store/store.mjs";
import { contentBinding } from "../content/content-rules.mjs";
import { pluginCheckConflicts } from "../workspace/repository-checks.mjs";
import {
  contentHash,
  credentialValue,
  inspectPlugins,
  pluginSettingsPath,
  readPluginSettings,
  writePluginSettings,
} from "./plugins.mjs";

export const STAGES = Object.freeze(["task", "phase", "branch"]);
export const DEFINITION_KEYS = Object.freeze([
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
export const REPLY_PATH = /^\$(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*$/;
const PLACEHOLDER = /\{([a-z_]+)(?::([^{}]+))?\}/g;
const RUN_FILLS = ["commit", "base", "repo"];
const MCP_FILLS = ["commit", "base", "repo", "diff_path"];

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// A relative file inside the plugin folder: no `..`, not absolute, there.
export function pluginFile(folder, file, where, { ext } = {}) {
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
  let stat;
  try {
    stat = fs.lstatSync(full);
  } catch {
    fail(`${where} names ${file}, which is not in the plugin.`);
  }
  if (!stat.isFile()) fail(`${where} names ${file}, which is not a file.`);
  return full;
}

const globs = (value, where, { required }) => {
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
function placeholders(text, where, allowed, folder) {
  for (const [, name, arg] of String(text).matchAll(PLACEHOLDER)) {
    if (name === "file" && allowed.includes("file")) {
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
const statSize = (file) => fs.statSync(file).size;

// Each string inside a JSON value; keys are never filled.
function eachString(value, visit, where) {
  if (typeof value === "string") return visit(value, where);
  if (Array.isArray(value))
    return value.forEach((item, i) =>
      eachString(item, visit, `${where}[${i}]`),
    );
  if (record(value))
    for (const [key, child] of Object.entries(value))
      eachString(child, visit, `${where}.${key}`);
}

const replyPath = (value, where) => {
  if (typeof value !== "string" || !REPLY_PATH.test(value))
    fail(`${where} must be $ then .key or [index] parts, with no filter.`);
};
const values = (value, where) => {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    fail(`${where} must list 1 to 50 values.`);
};

function validateMcp(step, where, servers, folder) {
  if (!record(step)) fail(`${where} must be an object.`);
  for (const key of Object.keys(step))
    if (!["server", "start", "poll", "result"].includes(key))
      fail(`${where}.${key} is not an MCP step setting.`);
  if (!Object.hasOwn(servers, step.server))
    fail(
      `${where}.server names ${step.server}, which servers does not declare.`,
    );
  const call = (value, label, keys, fills) => {
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
  };
  call(
    step.start,
    `${where}.start`,
    ["tool", "args", "id"],
    [...MCP_FILLS, "file"],
  );
  if (step.start.id !== undefined)
    replyPath(step.start.id, `${where}.start.id`);
  if (step.poll !== undefined) {
    if (step.start.id === undefined)
      fail(`${where}.start.id is needed when the step polls.`);
    call(
      step.poll,
      `${where}.poll`,
      ["tool", "args", "everySeconds", "until"],
      [...MCP_FILLS, "id", "file"],
    );
    const every = step.poll.everySeconds;
    if (
      every !== undefined &&
      (!Number.isInteger(every) || every < 5 || every > 3600)
    )
      fail(`${where}.poll.everySeconds must be a whole number from 5 to 3600.`);
    const until = step.poll.until;
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
export function validateChecksPart(manifest, folder) {
  const id = manifest?.id,
    where = (name, key) =>
      `Plugin ${id} check ${name}${key ? ` key ${key}` : ""}`;
  const provides = Array.isArray(manifest?.provides) ? manifest.provides : [];
  if (!provides.includes("checks")) {
    if (manifest?.checks !== undefined || manifest?.servers !== undefined)
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
  const used = new Set();
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
      used.add(check.mcp.server);
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
      (!Number.isInteger(check.timeout) ||
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
    if (check.stage !== undefined && !STAGES.includes(check.stage))
      fail(`${where(name, "stage")} must be task, phase or branch.`);
  }
  for (const alias of Object.keys(servers))
    if (!used.has(alias))
      fail(`Plugin ${id} server ${alias} is declared but no check uses it.`);
  return checks;
}

// ---- This machine's MCP mappings (PK10.2, PK10.3) ----------------------

// One alias's mapping, checked: {command: argv, env: [names]}, no
// credential in it.
export function validateMapping(value, where = "mapping") {
  if (!record(value)) fail(`${where} must be {command, env}.`);
  for (const key of Object.keys(value))
    if (!["command", "env"].includes(key))
      fail(
        /token|secret|password|key|credential/i.test(key)
          ? `${where}.${key} looks like a credential. Name an environment variable in env instead.`
          : `${where}.${key} is not a mapping setting; use command and env.`,
      );
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
  if (
    value.env !== undefined &&
    (!Array.isArray(value.env) ||
      value.env.some((n) => typeof n !== "string" || !ENV_NAME.test(n)))
  )
    fail(`${where}.env must list environment variable names.`);
  return { command: [...value.command], env: [...(value.env ?? [])] };
}

// The hash of one plugin's mappings that its approval binds.
export const mappingHash = (mappings) =>
  createHash("sha256")
    .update(canonical(mappings ?? {}))
    .digest("hex");

// Settings › Plugins **Set mapping** and `avoozl plugin map`: a person's
// act only (the operation is person-only). A changed mapping leaves the
// plugin's approval stale until it is approved again.
export function setMapping(
  options,
  { id, alias, command, env, remove = false },
) {
  const plugin = inspectPlugins(options).find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  const declared = plugin.manifest?.servers ?? {};
  if (!Object.hasOwn(declared, alias))
    fail(`Plugin ${id} declares no server ${alias}.`, 404);
  const settings = readPluginSettings(options.settingsFile),
    own = { ...(settings.mcp?.[id] ?? {}) };
  if (remove) delete own[alias];
  else
    own[alias] = validateMapping(
      { command, ...(env ? { env } : {}) },
      `mcp.${id}.${alias}`,
    );
  settings.mcp = { ...settings.mcp, [id]: own };
  if (!Object.keys(own).length) delete settings.mcp[id];
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id);
}

// ---- Approved checks ---------------------------------------------------

// Each check of each approved plugin on this machine, as a check entry:
// {name, source: "plugin", plugin, repos, paths, argv, step, ...}. `argv`
// is for display; a run step's real command is resolved at run time.
export function approvedPluginChecks(options) {
  const settings = readPluginSettings(options.settingsFile);
  return inspectPlugins(options)
    .filter(
      (plugin) =>
        plugin.state === "approved" && plugin.provides?.includes("checks"),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((plugin) =>
      Object.entries(plugin.manifest.checks)
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
              : ["mcp", check.mcp.server, check.mcp.start.tool],
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
                    path.join(plugin.location, check.decide),
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

const loaded = new Map();
const LOAD_MS = 2000;
const mtime = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

// The approved plugin checks of the workspace a store is bound to, loaded
// once per run or view (at most every 2 seconds). An unbound store, or a
// plugin setup that cannot be read, has none.
export function pluginChecksOf(store) {
  const binding = contentBinding(store);
  if (!binding?.workspaceRoot) return [];
  const settingsFile = binding.pluginSettingsFile ?? pluginSettingsPath(),
    key = `${binding.workspaceRoot}\0${settingsFile}`,
    stamp = mtime(settingsFile),
    hit = loaded.get(key);
  if (hit && hit.stamp === stamp && Date.now() - hit.at < LOAD_MS)
    return hit.checks;
  let checks = [];
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
export function pluginOptionsOf(store) {
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
export function markPluginBroken(options, id, reason) {
  if (!options?.settingsFile) return;
  const settings = readPluginSettings(options.settingsFile);
  delete settings.approvals[id];
  settings.broken = {
    ...settings.broken,
    [id]: {
      reason: String(reason).slice(0, 300),
      at: new Date().toISOString(),
    },
  };
  writePluginSettings(options.settingsFile, settings);
  loaded.clear();
}

// Whether a local-folder plugin's files are still the approved ones, just
// before a run (R83.6, PK7.1): null when they are, else why not. A git
// plugin sits in a commit-named folder and is not hashed again.
export function pluginChanged(plugin) {
  if (plugin.git) return null;
  let now;
  try {
    now = contentHash(plugin.folder);
  } catch (error) {
    return `plugin ${plugin.id} cannot be read: ${error.message}`;
  }
  return now === plugin.hash
    ? null
    : `plugin ${plugin.id} changed after it was approved; approve it again`;
}

// The Needs you rows plugin checks raise, read from stored records only:
// two plugins with one check name for a repository (PK2.4). Each row's id
// names the repository and check, so reading twice shows one row.
export function pluginCheckNeedsYou(store, plugins = pluginChecksOf(store)) {
  const items = [];
  if (!plugins.length) return items;
  for (const repository of store.list("repositories"))
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
export function pluginChecksView(store, { id, location, manifest }, options) {
  if (!manifest?.checks || !location) return null;
  const settings = readPluginSettings(options.settingsFile),
    read = (file) => {
      try {
        return fs
          .readFileSync(path.join(location, file), "utf8")
          .slice(0, MAX_FILE);
      } catch {
        return null;
      }
    },
    sent = (step) =>
      Object.fromEntries(
        [...JSON.stringify(step).matchAll(/\{file:([^{}]+)\}/g)].map(
          ([, name]) => [name, read(name)],
        ),
      ),
    mine = Object.entries(manifest.checks).map(([name, check]) => ({
      name,
      repos: check.repos ?? [],
      plugin: { id },
    })),
    others = pluginChecksOf(store).filter((check) => check.plugin.id !== id),
    repositories = store.list("repositories");
  return {
    checks: Object.entries(manifest.checks).map(([name, check]) => ({
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
        : {
            kind: "mcp",
            server: check.mcp.server,
            start: check.mcp.start,
            ...(check.mcp.poll ? { poll: check.mcp.poll } : {}),
            result: check.mcp.result,
            files: sent(check.mcp),
          },
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
    servers: Object.entries(manifest.servers ?? {}).map(([alias, server]) => ({
      alias,
      about: server.about,
      mapping: settings.mcp?.[id]?.[alias] ?? null,
    })),
  };
}
