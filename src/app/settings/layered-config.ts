import { validateTelemetry } from "./telemetry-config.ts";
import { validateLoop } from "../tick/loop.ts";
import { validateNotifications } from "../tick/notification-sinks.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRoles } from "../agents/role-table.ts";
import { validateLanes } from "../tick/lanes.ts";
import {
  assertNoMachineKeys,
  type LandingConfig,
  validateLandingConfig,
} from "../landing/landing-config.ts";
import {
  SPECS_LAYOUTS,
  type SpecsLayout,
  specsPathProblem,
} from "../specs/specs-path.ts";
import { branchNameProblem } from "../epics/integration-branch.ts";

export const avoozlConfigSchemaPath = fileURLToPath(
  new URL("../../avoozl-config.schema.json", import.meta.url),
);

// Every key a file may set: the schema's property names, at the top and in
// each object the schema closes (additionalProperties false). The machine
// file is also the host config (host-config.mjs), so it may set the host
// schema's top-level keys too; host-config.mjs checks what is under them.
// It also holds a setting only a machine has: each content rule set's terms
// file (`contentRules.terms`, content-rules.mjs), which checks its own value.
const MACHINE_ONLY = new Set(["contentRules.terms"]);
// A JSON object read from a file or built from settings.
type Json = Record<string, unknown>;
// The part of a JSON Schema node the key check reads.
interface SchemaNode {
  $ref?: string;
  items?: SchemaNode;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
}
interface Schema extends SchemaNode {
  properties: Record<string, SchemaNode>;
  $defs: Record<string, SchemaNode>;
}
// The merged settings, by the top-level keys callers read; the validators
// below check each value before it is returned.
export interface LayeredConfig extends LandingConfig {
  name?: string;
  operator?: string;
  dbPath?: string;
  documents?: string;
  port?: number | string;
  host?: string;
  specs?: { path?: string; branch?: string; layout?: SpecsLayout };
  lanes?: Record<string, number>;
  [key: string]: unknown;
}
// One configuration layer: where it came from and what it sets.
interface Layer {
  label: string;
  filename?: string;
  value: Json;
}
const readSchema = (file: string): Schema =>
  JSON.parse(fs.readFileSync(file, "utf8"));
const SCHEMA = readSchema(avoozlConfigSchemaPath);
const HOST_KEYS = new Set(
  Object.keys(
    readSchema(
      fileURLToPath(new URL("../../host-config.schema.json", import.meta.url)),
    ).properties,
  ),
);

// A `$ref` resolved, and the object schemas a value may match: the node
// and its oneOf and anyOf branches.
const own = (object: unknown, key: string) =>
  isRecord(object) && Object.hasOwn(object, key);
const resolve = (node: SchemaNode | undefined): SchemaNode | undefined =>
  node?.$ref ? resolve(SCHEMA.$defs[node.$ref.split("/").at(-1) ?? ""]) : node;
const branches = (node: SchemaNode | undefined) =>
  [node, ...(node?.oneOf ?? []), ...(node?.anyOf ?? [])]
    .map(resolve)
    .filter(
      (branch): branch is SchemaNode => !!branch && typeof branch === "object",
    );

// The dotted path of the first key under `value` that `node` does not
// list, or null. `allowed` paths are not checked.
function unknownKey(
  value: unknown,
  node: SchemaNode | undefined,
  trail: (string | number)[],
  allowed: Set<string>,
): string | null {
  if (Array.isArray(value)) {
    const items = resolve(node)?.items;
    for (const [index, item] of value.entries()) {
      const found =
        items && unknownKey(item, items, [...trail, index], allowed);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const shapes = branches(node);
  for (const [key, child] of Object.entries(value)) {
    const at = [...trail, key];
    if (allowed.has(at.join("."))) continue;
    const named = shapes.find((shape) => own(shape.properties, key)),
      open = shapes.find((shape) => isRecord(shape.additionalProperties)),
      next =
        named?.properties?.[key] ??
        (isRecord(open?.additionalProperties)
          ? open.additionalProperties
          : undefined);
    if (next) {
      const found = unknownKey(child, next, at, allowed);
      if (found) return found;
    } else if (shapes.some((shape) => shape.additionalProperties === false))
      return at.join(".");
  }
  return null;
}

// Refuse a key the schema does not list, naming the file and the key path.
export function assertKnownKeys(
  value: Json,
  source: string,
  { machine = false } = {},
) {
  const allowed = machine ? MACHINE_ONLY : new Set<string>();
  const found = unknownKey(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          !(machine && HOST_KEYS.has(key) && !own(SCHEMA.properties, key)),
      ),
    ),
    { properties: SCHEMA.properties, additionalProperties: false },
    [],
    allowed,
  );
  if (found) throw Error(`Unknown setting "${found}" in ${source}. Remove it.`);
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const EXPLICIT_PATH_KEYS = new Set(["dbPath", "documents"]);

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function secretLikeKey(key: string) {
  const normalized = normalizedKey(key);
  return /(^|_)(?:api_key|access_key(?:_id)?|private_key|client_secret|secret|password|passwd|token|credential)s?(?:_|$)/.test(
    normalized,
  );
}

export function assertSafeConfig(
  value: unknown,
  source = "configuration",
  trail: string[] = [],
) {
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

function pathField(trail: string[]) {
  const field = trail.join(".");
  if (EXPLICIT_PATH_KEYS.has(field)) return true;
  // Relative to the spec repository's root wherever it is read, so it is
  // kept as written (specs-path.mjs checks it).
  if (field === "specs.path") return false;
  const key = trail.at(-1) || "";
  return (
    ["path", "root", "directory", "file", "manifest", "projection"].includes(
      key,
    ) || /(?:Path|Root|Directory|File|Manifest|Projection)$/.test(key)
  );
}

function absolutePortablePath(value: string) {
  return (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

export function assertPortableRepositoryConfig(
  value: unknown,
  source = "repository Avoozl configuration",
  trail: string[] = [],
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

function resolveLayerPaths(
  value: unknown,
  base: string,
  trail: string[] = [],
): unknown {
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
  filename: string,
  label: string,
  { portable = false, machine = false } = {},
): Layer | null {
  if (!fs.existsSync(filename)) return null;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    // A supervisor child's sandbox hides Avoozl's machine config on purpose
    // (R95.6). There it reads as absent, so the CLI still answers, and
    // refuses person-only commands with its own reason (R95.5).
    const failed = error as NodeJS.ErrnoException;
    if (
      process.env.AVOOZL_CHILD &&
      ["EPERM", "EACCES"].includes(String(failed.code))
    )
      return null;
    throw Error(`Could not parse ${label} at ${filename}: ${failed.message}`);
  }
  if (!isRecord(value))
    throw Error(`${label} at ${filename} must contain a JSON object.`);
  if (value.version !== 1)
    throw Error(`Unsupported ${label} version at ${filename}.`);
  assertSafeConfig(value, `${label} at ${filename}`);
  assertKnownKeys(value, `${label} at ${filename}`, { machine });
  if (portable)
    assertPortableRepositoryConfig(value, `${label} at ${filename}`);
  return {
    label,
    filename,
    value: resolveLayerPaths(value, path.dirname(filename)) as Json,
  };
}

function deepMerge(left: Json, right: Json): Json {
  if (!isRecord(left) || !isRecord(right)) return structuredClone(right);
  const result = structuredClone(left);
  for (const [key, value] of Object.entries(right))
    result[key] =
      isRecord(result[key]) && isRecord(value)
        ? deepMerge(result[key], value)
        : structuredClone(value);
  return result;
}

function environmentLayer(env: NodeJS.ProcessEnv) {
  const value: Record<string, string | undefined> = {
    dbPath: env.AVOOZL_DB,
    documents: env.AVOOZL_DOCUMENTS,
    operator: env.AVOOZL_OPERATOR,
    port: env.AVOOZL_PORT,
    host: env.AVOOZL_HOST,
  };
  for (const [key, child] of Object.entries(value))
    if (!child) delete value[key];
  return value;
}

function option(options: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = options[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function commandLineLayer(options: Record<string, unknown>) {
  const value: Record<string, unknown> = {
    name: option(options, "name"),
    operator: option(options, "operator"),
    dbPath: option(options, "db", "dbPath"),
    documents: option(options, "documents"),
    port: option(options, "port"),
    host: option(options, "host"),
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
  const real = (file: string) => {
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

// `specs`, where spec folders live: `path` (specs-path.mjs) and `branch`
// (specs-branch.mjs), and `layout`, the files the spec skills write for a new
// spec. The symlink check needs the checkout, so specsPath makes it when it
// reads.
export const SPECS_KEYS = ["path", "branch", "layout"];
function validateSpecs(value: unknown) {
  if (value === undefined) return;
  if (!isRecord(value)) throw Error("specs must be an object.");
  for (const key of Object.keys(value))
    if (!SPECS_KEYS.includes(key))
      throw Error(
        `specs.${key} is not a setting; use ${SPECS_KEYS.join(", ")}.`,
      );
  if (value.path !== undefined) {
    const problem = specsPathProblem(value.path);
    if (problem) throw Error(problem);
  }
  const problem =
    value.branch === undefined ? null : branchNameProblem(value.branch);
  if (problem) throw Error(`specs.branch: ${problem}`);
  if (
    value.layout !== undefined &&
    !SPECS_LAYOUTS.includes(value.layout as SpecsLayout)
  )
    throw Error(
      `specs.layout ${JSON.stringify(value.layout)} is not a layout; use ${SPECS_LAYOUTS.join(" or ")}.`,
    );
}
export function loadLayeredConfig({
  workspaceRoot,
  options = {},
  env = process.env,
  home = os.homedir(),
}: {
  workspaceRoot?: string | null;
  options?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  home?: string;
} = {}) {
  if (!workspaceRoot) throw Error("Choose a workspace root.");
  workspaceRoot = path.resolve(workspaceRoot);
  const files = {
    global: globalAvoozlConfigPath({ env, home }),
    repository: path.join(workspaceRoot, ".avoozl.json"),
  };
  const fileLayers: Layer[] = [
    readLayer(files.global, "global Avoozl configuration", { machine: true }),
    readLayer(files.repository, "repository Avoozl configuration", {
      portable: true,
    }),
  ].filter((layer) => layer !== null);
  const volatileLayers: Layer[] = [
    {
      label: "environment configuration",
      value: resolveLayerPaths(environmentLayer(env), workspaceRoot) as Json,
    },
    {
      label: "command-line configuration",
      value: resolveLayerPaths(
        commandLineLayer(options),
        workspaceRoot,
      ) as Json,
    },
  ];
  for (const layer of volatileLayers)
    assertSafeConfig(layer.value, layer.label);
  const layers = [...fileLayers, ...volatileLayers].filter(
    (layer) => Object.keys(layer.value).length,
  );
  // The merged JSON, read as the settings it holds.
  const mergeLayers = (selected: Layer[]) =>
    selected.reduce<Json>(
      (result, layer) => deepMerge(result, layer.value),
      {},
    ) as LayeredConfig;
  const config = mergeLayers(layers);
  validateRoles(config);
  validateLanes(config.lanes);
  validateSpecs(config.specs);
  validateNotifications(config.notifications);
  validateTelemetry(config.telemetry);
  validateLoop(config.loop);
  for (const layer of fileLayers)
    if (layer.filename === files.repository)
      assertNoMachineKeys(layer.value, layer.filename, files.global);
  validateLandingConfig(config, {
    repository: files.repository,
    global: files.global,
  });
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
