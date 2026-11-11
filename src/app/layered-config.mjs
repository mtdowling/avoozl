import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const avoozlConfigSchemaPath = fileURLToPath(
  new URL("../avoozl-config.schema.json", import.meta.url),
);

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SAFE_SECRET_LIKE_PATH_KEYS = new Set(["ahp.tokens", "ahpTokens"]);
const EXPLICIT_PATH_KEYS = new Set([
  "agentManifest",
  "ahp.manifest",
  "ahp.projection",
  "ahp.tokens",
  "ahpManifest",
  "ahpProjection",
  "ahpTokens",
  "db",
  "dbPath",
  "documents",
  "plansRoot",
]);

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
      !SAFE_SECRET_LIKE_PATH_KEYS.has(field) &&
      !SAFE_SECRET_LIKE_PATH_KEYS.has(key)
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

function normalizeAliases(value) {
  const config = structuredClone(value);
  if (config.dbPath == null && config.db != null) config.dbPath = config.db;
  if (config.documents == null && config.plansRoot != null)
    config.documents = config.plansRoot;
  if (config.url == null && config.endpoint != null)
    config.url = config.endpoint;
  delete config.db;
  delete config.plansRoot;
  delete config.endpoint;

  const ahp = isRecord(config.ahp) ? { ...config.ahp } : {};
  for (const [legacy, current] of [
    ["ahpPort", "port"],
    ["ahpHost", "host"],
    ["ahpProjection", "projection"],
    ["ahpTokens", "tokens"],
    ["ahpManifest", "manifest"],
  ]) {
    if (ahp[current] == null && config[legacy] != null)
      ahp[current] = config[legacy];
    delete config[legacy];
  }
  if (Object.keys(ahp).length) config.ahp = ahp;
  return config;
}

function readLayer(filename, label) {
  if (!fs.existsSync(filename)) return null;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    throw Error(`Could not parse ${label} at ${filename}: ${error.message}`);
  }
  if (!isRecord(value))
    throw Error(`${label} at ${filename} must contain a JSON object.`);
  if (value.version !== 1)
    throw Error(`Unsupported ${label} version at ${filename}.`);
  assertSafeConfig(value, `${label} at ${filename}`);
  return {
    label,
    filename,
    value: normalizeAliases(resolveLayerPaths(value, path.dirname(filename))),
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

function first(env, names) {
  for (const name of names) if (env[name]) return env[name];
  return undefined;
}

function environmentLayer(env) {
  const value = {
    dbPath: first(env, ["AVOOZL_DB", "AICOMMANDER_DB", "NUPP_WORKSPACE_DB"]),
    documents: first(env, [
      "AVOOZL_DOCUMENTS",
      "AVOOZL_PLANS_ROOT",
      "AICOMMANDER_DOCUMENTS",
      "AICOMMANDER_PLANS_ROOT",
      "NUPP_WORKSPACE_DOCS",
    ]),
    operator: first(env, ["AVOOZL_OPERATOR", "AICOMMANDER_OPERATOR"]),
    port: first(env, ["AVOOZL_PORT", "AICOMMANDER_PORT"]),
    host: first(env, ["AVOOZL_HOST", "AICOMMANDER_HOST"]),
    canvasOrigins: first(env, [
      "AVOOZL_CANVAS_ORIGINS",
      "AICOMMANDER_CANVAS_ORIGINS",
    ]),
    agentManifest: first(env, [
      "AVOOZL_AGENT_MANIFEST",
      "AICOMMANDER_AGENT_MANIFEST",
    ]),
    url: first(env, ["AVOOZL_URL", "AICOMMANDER_URL", "NUPP_WORKSPACE_URL"]),
    ahp: {
      port: first(env, ["AVOOZL_AHP_PORT", "AICOMMANDER_AHP_PORT"]),
      host: first(env, ["AVOOZL_AHP_HOST", "AICOMMANDER_AHP_HOST"]),
      projection: first(env, [
        "AVOOZL_AHP_PROJECTION",
        "AICOMMANDER_AHP_PROJECTION",
      ]),
      tokens: first(env, ["AVOOZL_AHP_TOKENS", "AICOMMANDER_AHP_TOKENS"]),
      manifest: first(env, ["AVOOZL_AHP_MANIFEST", "AICOMMANDER_AHP_MANIFEST"]),
    },
  };
  for (const [key, child] of Object.entries(value))
    if (child === undefined) delete value[key];
  for (const [key, child] of Object.entries(value.ahp || {}))
    if (child === undefined) delete value.ahp[key];
  if (!Object.keys(value.ahp || {}).length) delete value.ahp;
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
    documents: option(options, "documents", "plans-root", "plansRoot"),
    port: option(options, "port"),
    host: option(options, "host"),
    canvasOrigins: option(options, "canvas-origin", "canvasOrigins"),
    agentManifest: option(options, "agent-manifest", "agentManifest"),
    url: option(options, "url", "endpoint"),
    ahp: {
      port: option(options, "ahp-port", "ahpPort"),
      host: option(options, "ahp-host", "ahpHost"),
      projection: option(options, "ahp-projection", "ahpProjection"),
      tokens: option(options, "ahp-tokens", "ahpTokens"),
      manifest: option(options, "ahp-manifest", "ahpManifest"),
    },
  };
  for (const [key, child] of Object.entries(value))
    if (child === undefined) delete value[key];
  for (const [key, child] of Object.entries(value.ahp || {}))
    if (child === undefined) delete value.ahp[key];
  if (!Object.keys(value.ahp || {}).length) delete value.ahp;
  return value;
}

export function globalAvoozlConfigPath({
  env = process.env,
  home = os.homedir(),
} = {}) {
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(env.XDG_CONFIG_HOME)
    : path.join(home, ".config");
  return path.join(configHome, "avoozl", "config.json");
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
    legacy: path.join(workspaceRoot, "workspace.json"),
    repository: path.join(workspaceRoot, ".avoozl", "config.json"),
  };
  const fileLayers = [
    readLayer(files.global, "global Avoozl configuration"),
    readLayer(files.legacy, "legacy workspace configuration"),
    readLayer(files.repository, "workspace Avoozl configuration"),
  ].filter(Boolean);
  const volatileLayers = [
    {
      label: "environment configuration",
      value: normalizeAliases(
        resolveLayerPaths(environmentLayer(env), workspaceRoot),
      ),
    },
    {
      label: "command-line configuration",
      value: normalizeAliases(
        resolveLayerPaths(commandLineLayer(options), workspaceRoot),
      ),
    },
  ];
  for (const layer of volatileLayers)
    assertSafeConfig(layer.value, layer.label);
  const layers = [...fileLayers, ...volatileLayers].filter(
    (layer) => Object.keys(layer.value).length,
  );
  const mergeLayers = (selected) =>
    selected.reduce((result, layer) => deepMerge(result, layer.value), {});
  return {
    config: mergeLayers(layers),
    configWithoutRepository: mergeLayers(
      layers.filter(({ filename }) => filename !== files.repository),
    ),
    files,
    sources: layers.map(({ label, filename }) => ({ label, filename })),
    localConfigured: fileLayers.some(
      ({ filename }) => filename !== files.global,
    ),
  };
}
