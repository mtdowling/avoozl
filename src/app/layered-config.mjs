import { validateNotifications } from "./notification-sinks.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReportSetting } from "./build-report.mjs";
import { validateRoles, validatePlanReview } from "./chat-models.mjs";
import { validateLanes } from "./lanes.mjs";
import {
  assertNoMachineKeys,
  conflictRounds,
  validateLandingConfig,
} from "./landing-config.mjs";
import { deriveGitHubKeys } from "./repository-roles.mjs";

export const avoozlConfigSchemaPath = fileURLToPath(
  new URL("../avoozl-config.schema.json", import.meta.url),
);

// Every top-level key a file may set: the schema's property names. The
// machine file is also the host config (host-config.mjs), so it may set the
// host schema's keys too.
const schemaKeys = (file) =>
  Object.keys(JSON.parse(fs.readFileSync(file, "utf8")).properties);
const TOP_LEVEL_KEYS = new Set(schemaKeys(avoozlConfigSchemaPath));
const MACHINE_KEYS = new Set([
  ...TOP_LEVEL_KEYS,
  ...schemaKeys(
    fileURLToPath(new URL("../host-config.schema.json", import.meta.url)),
  ),
]);

// Refuse a top-level key the schema does not list, naming the file and key.
export function assertKnownKeys(value, source, { machine = false } = {}) {
  const known = machine ? MACHINE_KEYS : TOP_LEVEL_KEYS;
  for (const key of Object.keys(value))
    if (!known.has(key))
      throw Error(`Unknown setting "${key}" in ${source}. Remove it.`);
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const EXPLICIT_PATH_KEYS = new Set(["dbPath", "documents"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function secretLikeKey(key) {
  const normalized = normalizedKey(key);
  return /(^|_)(?:api_key|access_key(?:_id)?|private_key|client_secret|secret|password|passwd|token|credential)s?(?:_|$)/.test(
    normalized,
  );
}

export function assertSafeConfig(value, source = "configuration", trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafeConfig(item, source, [...trail, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const field = [...trail, key].join(".");
    if (DANGEROUS_KEYS.has(key))
      throw Error(`${source} contains unsafe key ${field}.`);
    if (
      secretLikeKey(key) &&
      // A plugin's config names the environment variable that holds its
      // credential (design §4.8); plugins.mjs checks the value is a name.
      !/^plugins\.\d+\.config\.(?:.+\.)?[A-Za-z0-9]+Env$/.test(field)
    )
      throw Error(
        `${source} contains secret-like key ${field}. Keep credentials outside Avoozl configuration.`,
      );
    assertSafeConfig(child, source, [...trail, key]);
  }
}

function pathField(trail) {
  const field = trail.join(".");
  if (EXPLICIT_PATH_KEYS.has(field)) return true;
  const key = trail.at(-1) || "";
  return (
    ["path", "root", "directory", "file", "manifest", "projection"].includes(
      key,
    ) || /(?:Path|Root|Directory|File|Manifest|Projection)$/.test(key)
  );
}

function absolutePortablePath(value) {
  return (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

export function assertPortableRepositoryConfig(
  value,
  source = "repository Avoozl configuration",
  trail = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertPortableRepositoryConfig(item, source, [...trail, String(index)]),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value))
      assertPortableRepositoryConfig(child, source, [...trail, key]);
    return;
  }
  if (
    typeof value === "string" &&
    value &&
    pathField(trail) &&
    absolutePortablePath(value)
  )
    throw Error(
      `${source} contains absolute path ${trail.join(".")}. Put machine-local paths in ~/.config/avoozl/config.json.`,
    );
}

function resolveLayerPaths(value, base, trail = []) {
  if (Array.isArray(value))
    return value.map((item, index) =>
      resolveLayerPaths(item, base, [...trail, String(index)]),
    );
  if (!isRecord(value)) {
    if (
      typeof value === "string" &&
      value &&
      pathField(trail) &&
      !path.isAbsolute(value)
    )
      return path.resolve(base, value);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      resolveLayerPaths(child, base, [...trail, key]),
    ]),
  );
}

function readLayer(
  filename,
  label,
  { portable = false, machine = false } = {},
) {
  if (!fs.existsSync(filename)) return null;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    // A supervisor child's sandbox hides Avoozl's machine config on purpose
    // (R95.6). There it reads as absent, so the CLI still answers, and
    // refuses person-only commands with its own reason (R95.5).
    if (process.env.AVOOZL_CHILD && ["EPERM", "EACCES"].includes(error.code))
      return null;
    throw Error(`Could not parse ${label} at ${filename}: ${error.message}`);
  }
  if (!isRecord(value))
    throw Error(`${label} at ${filename} must contain a JSON object.`);
  if (value.version !== 1)
    throw Error(`Unsupported ${label} version at ${filename}.`);
  assertKnownKeys(value, `${label} at ${filename}`, { machine });
  assertSafeConfig(value, `${label} at ${filename}`);
  if (portable)
    assertPortableRepositoryConfig(value, `${label} at ${filename}`);
  return {
    label,
    filename,
    value: resolveLayerPaths(value, path.dirname(filename)),
  };
}

function deepMerge(left, right) {
  if (!isRecord(left) || !isRecord(right)) return structuredClone(right);
  const result = structuredClone(left);
  for (const [key, value] of Object.entries(right))
    result[key] =
      isRecord(result[key]) && isRecord(value)
        ? deepMerge(result[key], value)
        : structuredClone(value);
  return result;
}

function environmentLayer(env) {
  const value = {
    dbPath: env.AVOOZL_DB ?? env.AICOMMANDER_DB ?? env.NUPP_WORKSPACE_DB,
    documents:
      env.AVOOZL_DOCUMENTS ??
      env.AICOMMANDER_DOCUMENTS ??
      env.NUPP_WORKSPACE_DOCUMENTS ??
      env.NUPP_WORKSPACE_DOCS,
    operator:
      env.AVOOZL_OPERATOR ??
      env.AICOMMANDER_OPERATOR ??
      env.NUPP_WORKSPACE_OPERATOR,
    port: env.AVOOZL_PORT ?? env.AICOMMANDER_PORT ?? env.NUPP_WORKSPACE_PORT,
    host: env.AVOOZL_HOST ?? env.AICOMMANDER_HOST ?? env.NUPP_WORKSPACE_HOST,
    url: env.AVOOZL_URL ?? env.AICOMMANDER_URL ?? env.NUPP_WORKSPACE_URL,
  };
  for (const [key, child] of Object.entries(value))
    if (!child) delete value[key];
  return value;
}

function option(options, ...names) {
  for (const name of names) {
    const value = options[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function commandLineLayer(options) {
  const value = {
    name: option(options, "name"),
    operator: option(options, "operator"),
    dbPath: option(options, "db", "dbPath"),
    documents: option(options, "documents"),
    port: option(options, "port"),
    host: option(options, "host"),
    url: option(options, "url"),
  };
  for (const [key, child] of Object.entries(value))
    if (child === undefined) delete value[key];
  return value;
}

// Avoozl's folder inside a second Kiro Crew home, or null. A gateway started
// with KIROCREW_HOME set to anything but the main home (~/.kiro/crew) is a
// separate crew, so its Avoozl gets its own config and state there and never
// opens the main crew's catalog. Kiro Crew passes KIROCREW_HOME, not XDG_*,
// to an app's backend and MCP server, so this wins over XDG.
export function crewHomeAvoozlDirectory({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
} = {}) {
  if (!env.KIROCREW_HOME) return null;
  const p = platform === "win32" ? path.win32 : path.posix;
  const real = (file) => {
    try {
      return fs.realpathSync.native(file);
    } catch {
      return p.resolve(file);
    }
  };
  const named = real(env.KIROCREW_HOME),
    main = real(p.join(home, ".kiro", "crew"));
  const same =
    platform === "win32" || platform === "darwin"
      ? named.toLowerCase() === main.toLowerCase()
      : named === main;
  return same ? null : p.join(named, "avoozl");
}

export function globalAvoozlConfigPath({
  env = process.env,
  home = os.homedir(),
} = {}) {
  const scoped = crewHomeAvoozlDirectory({ env, home });
  if (scoped) return path.join(scoped, "config.json");
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(env.XDG_CONFIG_HOME)
    : path.join(home, ".config");
  return path.join(configHome, "avoozl", "config.json");
}

// Runner mode over SSH was removed; a file that still names its roles is
// refused, naming the key and the replacement (worker-paths WP5.4).
function validateRunnerRole(runner) {
  if (["runner", "driver"].includes(runner?.role))
    throw Error(
      `runner.role "${runner.role}" was removed. Set runner.role to "worker": the machine's tick pulls its work (avoozl worker pull).`,
    );
}

export function loadLayeredConfig({
  workspaceRoot,
  options = {},
  env = process.env,
  home = os.homedir(),
} = {}) {
  if (!workspaceRoot) throw Error("Choose a workspace root.");
  workspaceRoot = path.resolve(workspaceRoot);
  const files = {
    global: globalAvoozlConfigPath({ env, home }),
    repository: path.join(workspaceRoot, ".avoozl.json"),
  };
  const fileLayers = [
    readLayer(files.global, "global Avoozl configuration", { machine: true }),
    readLayer(files.repository, "repository Avoozl configuration", {
      portable: true,
    }),
  ].filter(Boolean);
  const volatileLayers = [
    {
      label: "environment configuration",
      value: resolveLayerPaths(environmentLayer(env), workspaceRoot),
    },
    {
      label: "command-line configuration",
      value: resolveLayerPaths(commandLineLayer(options), workspaceRoot),
    },
  ];
  for (const layer of volatileLayers)
    assertSafeConfig(layer.value, layer.label);
  const layers = [...fileLayers, ...volatileLayers].filter(
    (layer) => Object.keys(layer.value).length,
  );
  const mergeLayers = (selected) =>
    selected.reduce((result, layer) => deepMerge(result, layer.value), {});
  const config = mergeLayers(layers);
  // Repository roles decide the GitHub mode, so readers of the raw keys see
  // the derived value (R105.8).
  if (config.github) config.github = deriveGitHubKeys(config.github);
  validateRoles(config);
  validateRunnerRole(config.runner);
  validatePlanReview(config.planReview);
  validateLanes(config.lanes);
  validateNotifications(config.notifications);
  conflictRounds(config.landing);
  for (const layer of fileLayers)
    if (layer.filename === files.repository)
      assertNoMachineKeys(layer.value, layer.filename, files.global);
  validateLandingConfig(config, {
    repository: files.repository,
    global: files.global,
  });
  validateReportSetting(config.receipts?.report);
  return {
    config,
    configWithoutRepository: mergeLayers(
      layers.filter(({ filename }) => filename !== files.repository),
    ),
    files,
    warnings: [],
    sources: layers.map(({ label, filename }) => ({ label, filename })),
    localConfigured: fileLayers.some(
      ({ filename }) => filename !== files.global,
    ),
  };
}
