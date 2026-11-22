// Plugin loading and trust (design §4.8, Requirement 34). A plugin is a
// package or folder outside the Avoozl tree, declared by a `plugins` entry
// in `.avoozl.json` (shared, reviewed in Git) or in this machine's
// `plugins.json` beside the global Avoozl config (never committed). Avoozl
// loads one only after a person approved its exact id, version and content
// hash on this machine; the tick and example installation never approve.
// Each approved plugin runs in its own Node child process over stdio
// (plugin-child.mjs), with no port, a minimal environment, a per-call time
// limit, and a listening-socket check after start and after every call.
// Nothing here runs unless a plugin is declared and approved.
import { type ChildProcessByStdio, execFile, spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { SUPPORTED_CONTRACTS } from "./plugin-contract.ts";
import {
  fetchGitCommit,
  gitRemote,
  resolveGitRef,
  validateGitSource,
} from "./plugin-git.ts";
import { pluginSession } from "./plugin-session.ts";
import { jsonLines } from "./child-io.ts";
import {
  type CheckDefinition,
  mappingHash,
  validateChecksPart,
} from "./plugin-checks.ts";
import { fail } from "../store/store.ts";
import {
  contextHash,
  contextView,
  readContextPart,
} from "../context/plugin-context.ts";

// A JSON object.
type Obj = Record<string, unknown>;
// One `plugins` entry, once validateEntry passed it.
export interface PluginEntry {
  id: string;
  package?: string;
  path?: string;
  git?: string;
  ref?: string;
  subdir?: string;
  contract: number;
  config?: Obj;
}
// A person's approval of one plugin on this machine (R34.4).
export interface Approval {
  version?: string;
  hash?: string;
  commit?: string;
  provides?: string[];
  kinds?: string[];
  credentials?: { hosts: string[]; owners: string[] | null };
  location?: string | null;
  mcpHash?: string;
  contextHash?: string;
  approvedAt?: string;
  approvedBy?: string;
}
// A git entry's resolved commit on this machine (R34.13).
interface Pin {
  git?: string;
  ref?: string;
  subdir?: string;
  commit: string;
  pinnedAt?: string;
}
// This machine's plugins.json, as readPluginSettings checks it.
export interface PluginSettings {
  plugins: unknown[];
  approvals: Record<string, Approval>;
  disabled: string[];
  pins: Record<string, Pin>;
  mcp?: Record<string, Record<string, { command?: string[]; env?: string[] }>>;
  broken?: Record<string, { reason: string; at: string }>;
  context?: Record<string, { answers?: Record<string, string> }>;
  intake?: Obj;
  credentialsPick?: Record<string, string>;
  updateChecks?: false;
  [key: string]: unknown;
}
// An avoozl-plugin.json, once validateManifest passed it.
export interface Manifest {
  id: string;
  version: string;
  contract: number;
  provides?: string[];
  kinds?: string[];
  capabilities?: Record<string, string[]>;
  entry?: string;
  credentials?: { entry: string; hosts: string[]; owners?: string[] };
  checks?: Record<string, CheckDefinition>;
  servers?: Record<string, { about: string }>;
  context?: unknown;
  [key: string]: unknown;
}
// One declared plugin: its entry as written, where it was declared, and
// why it cannot load if it cannot.
interface Declared {
  entry: Partial<PluginEntry>;
  source: string;
  index?: number;
  error: string | null;
}
// What Settings shows and the loader decides on, for one declared plugin.
export interface InspectedPlugin {
  id: string;
  source: string;
  entry: Partial<PluginEntry>;
  state: string;
  reason: string | null;
  location?: string | null;
  commit?: string;
  version?: string;
  contract?: number;
  provides?: string[];
  kinds?: string[];
  capabilities?: Obj;
  hash?: string;
  manifest?: Manifest;
  context?: ReturnType<typeof readContextPart>;
  credentials?: { hosts: string[]; owners: string[] | null };
  approval?: Approval;
}
// Where this workspace's and this machine's plugins are declared.
export interface PluginOptions {
  workspaceRoot?: string | null;
  settingsFile: string;
}
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const codeOf = (error: unknown) =>
  error && typeof error === "object" && "code" in error ? error.code : null;

const PLUGIN_MANIFEST = "avoozl-plugin.json";
const RESERVED_IDS = new Set(["local", "github"]);
export const KINDS = ["rules"];
const CAPABILITIES: Record<string, string[]> = { rules: [] };
// The parts one plugin may bundle (simplify SM11), and the code kind each
// runs as. `credentials` hands Avoozl GitHub tokens (plugin-credentials §D1)
// from its own entry, in a child apart from the plugin's other code.
// `checks` are check definitions and their files (plugin-checks D1): they
// run as checks, never as a plugin child. `context` is data the
// epic-context spec reads.
export const PARTS = ["rules", "credentials", "checks", "context"];
const PART_KIND: Record<string, string> = {
  rules: "rules",
  credentials: "credentials",
};
const CODE_KINDS = [...KINDS, "credentials"];

// A manifest's parts and the code kinds they need. A manifest written
// before `provides` names its kinds, and each kind is its own part.
function pluginParts(manifest: unknown) {
  const given = record(manifest) ? manifest : {},
    provides: unknown[] = Array.isArray(given.provides)
      ? given.provides
      : Array.isArray(given.kinds)
        ? given.kinds
        : [];
  return {
    provides: provides.map(String),
    kinds: CODE_KINDS.filter((kind) =>
      provides.some((part) => PART_KIND[String(part)] === kind),
    ),
  };
}
const ID = /^[a-z][a-z0-9-]{0,60}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
const CHILD = fileURLToPath(
  new URL(`./plugin-child${path.extname(import.meta.url)}`, import.meta.url),
);
const MAX_FILES = 10000;
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_LINE = 1024 * 1024;
const CALL_TIMEOUT_MS = 20_000;
// Plugin calls stop at a safe point inside the tick's own budget (§4.5).
const TICK_BUDGET_MS = 45_000;

const record = (value: unknown): value is Obj =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// This machine's plugin settings: {plugins, approvals, disabled, pins}.
// `pins` holds each git entry's resolved commit (R34.13).
export function pluginSettingsPath(
  options: Parameters<typeof machineAvoozlPaths>[0] = {},
) {
  return path.join(machineAvoozlPaths(options).configDirectory, "plugins.json");
}

export function readPluginSettings(file: string): PluginSettings {
  let value: Obj = {};
  try {
    const read: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (record(read)) value = read;
  } catch (error) {
    if (codeOf(error) !== "ENOENT")
      throw Error(
        `Could not read plugin settings ${file}: ${messageOf(error)}`,
      );
  }
  return {
    plugins: Array.isArray(value.plugins) ? value.plugins : [],
    // The approvals and pins this module wrote.
    approvals: record(value.approvals)
      ? (value.approvals as Record<string, Approval>)
      : {},
    disabled: Array.isArray(value.disabled) ? value.disabled.map(String) : [],
    pins: record(value.pins) ? (value.pins as Record<string, Pin>) : {},
    // Each checks plugin's server aliases mapped to local MCP server
    // commands (plugin-checks PK10.2), and plugins marked broken (PK7.5).
    // The mappings, broken marks and answers Settings wrote.
    ...(record(value.mcp)
      ? { mcp: value.mcp as NonNullable<PluginSettings["mcp"]> }
      : {}),
    ...(record(value.broken)
      ? { broken: value.broken as NonNullable<PluginSettings["broken"]> }
      : {}),
    // Each context plugin's answers to its asks (epic-context EC4.2).
    ...(record(value.context)
      ? { context: value.context as NonNullable<PluginSettings["context"]> }
      : {}),
    // This machine's intake sources (design §4.12), kept through plugin edits.
    ...(record(value.intake) ? { intake: value.intake } : {}),
    // Which credentials plugin serves a host where two claim one owner
    // (PC2.6): {host: pluginId}.
    ...(record(value.credentialsPick)
      ? {
          credentialsPick: Object.fromEntries(
            Object.entries(value.credentialsPick).map(([host, id]) => [
              host,
              String(id),
            ]),
          ),
        }
      : {}),
    // The daily update check (plugin-updates.mjs) is on unless this is false.
    ...(value.updateChecks === false ? { updateChecks: false as const } : {}),
  };
}

export function writePluginSettings(file: string, value: object) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}

// A credential never sits in an entry: `config` holds plain data and names
// environment variables (keys ending in `Env`) for the plugin to read.
const SECRET_KEY =
  /(^|_)(?:api_key|access_key|private_key|client_secret|secret|password|passwd|token|credential)s?(_|$)/;
export const SECRET_VALUE = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{22,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
];
// Whether a string looks like a credential value.
export const credentialValue = (text: unknown) =>
  SECRET_VALUE.some((pattern) => pattern.test(String(text)));
const snake = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

export function checkConfig(value: unknown, where: string): void {
  if (Array.isArray(value))
    return value.forEach((item, i) => checkConfig(item, `${where}.${i}`));
  if (typeof value === "string") {
    if (SECRET_VALUE.some((pattern) => pattern.test(value)))
      fail(
        `${where} looks like a credential. Name an environment variable instead.`,
      );
    return;
  }
  if (!record(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const field = `${where}.${key}`;
    if (/Env$/.test(key)) {
      if (typeof child !== "string" || !ENV_NAME.test(child))
        fail(`${field} must name an environment variable.`);
      continue;
    }
    if (SECRET_KEY.test(snake(key)))
      fail(
        `${field} looks like a credential. Name an environment variable in ${where}.${key}Env instead.`,
      );
    checkConfig(child, field);
  }
}

// One `plugins` entry (§4.4): id, one of package, path or git (with ref and
// an optional subdir), contract, config.
export const ENTRY_KEYS = Object.freeze([
  "id",
  "package",
  "path",
  "git",
  "ref",
  "subdir",
  "contract",
  "config",
]);
export function validateEntry(
  entry: unknown,
  where = "plugins entry",
): PluginEntry {
  if (!record(entry)) fail(`${where} must be an object.`);
  for (const key of Object.keys(entry))
    if (!ENTRY_KEYS.includes(key))
      fail(`${where}.${key} is not a plugin setting.`);
  if (typeof entry.id !== "string" || !ID.test(entry.id))
    fail(`${where}.id must be a lowercase plugin id.`);
  if (RESERVED_IDS.has(entry.id)) fail(`${where}.id ${entry.id} is reserved.`);
  if (
    ["package", "path", "git"].filter((key) => entry[key] !== undefined)
      .length !== 1
  )
    fail(`${where} names exactly one of package, path or git.`);
  if (entry.git !== undefined) validateGitSource(entry, where);
  else if (entry.ref !== undefined || entry.subdir !== undefined)
    fail(`${where}.ref and ${where}.subdir go with git.`);
  if (
    entry.package !== undefined &&
    (typeof entry.package !== "string" ||
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(entry.package))
  )
    fail(`${where}.package must be a package name.`);
  if (
    entry.path !== undefined &&
    (typeof entry.path !== "string" || !entry.path.trim())
  )
    fail(`${where}.path must be a folder.`);
  if (!Number.isInteger(entry.contract))
    fail(`${where}.contract (the contract version) must be a whole number.`);
  if (entry.config !== undefined) {
    if (!record(entry.config)) fail(`${where}.config must be an object.`);
    if (JSON.stringify(entry.config).length > 64 * 1024)
      fail(`${where}.config is too large.`);
    checkConfig(entry.config, `${where}.config`);
  }
  // Each field was checked above; this names the shape for the compiler.
  if (!isEntry(entry)) fail(`${where} is not a plugins entry.`);
  return entry;
}
const isEntry = (value: Obj): value is Obj & PluginEntry =>
  typeof value.id === "string" && typeof value.contract === "number";

// `.avoozl.json` `plugins`, checked when the tick loads policy.
export function repositoryPlugins(policy: unknown) {
  const list = record(policy) ? policy.plugins : undefined;
  if (list === undefined) return [];
  if (!Array.isArray(list)) fail("plugins must be a list.");
  return list.map((entry, i) => validateEntry(entry, `plugins.${i}`));
}

function readRepositoryPolicy(workspaceRoot: string | null | undefined): Obj {
  if (!workspaceRoot) return {};
  try {
    const value: unknown = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8"),
    );
    return record(value) ? value : {};
  } catch (error) {
    if (codeOf(error) === "ENOENT") return {};
    throw Error(`.avoozl.json is invalid: ${messageOf(error)}`);
  }
}

// Every declared plugin with where it came from. An entry that does not
// validate, or an id declared twice, is kept with its error so Settings can
// show it; it never loads.
function declaredPlugins({ workspaceRoot, settingsFile }: PluginOptions) {
  const found: Declared[] = [];
  const add = (entries: unknown[], source: string) =>
    entries.forEach((entry, i) => {
      let error: string | null = null,
        checked: Partial<PluginEntry> = {};
      try {
        checked = validateEntry(entry, `${source} plugins.${i}`);
      } catch (refused) {
        error = messageOf(refused);
        // As written, so Settings can show it.
        if (record(entry)) checked = entry as Partial<PluginEntry>;
      }
      found.push({ entry: checked, source, index: i, error });
    });
  let repository: unknown[] = [];
  try {
    const policy = readRepositoryPolicy(workspaceRoot);
    repository = Array.isArray(policy.plugins) ? policy.plugins : [];
  } catch (error) {
    found.push({
      entry: {},
      source: "repository",
      error: messageOf(error),
    });
  }
  add(repository, "repository");
  add(readPluginSettings(settingsFile).plugins, "machine");
  const counts = new Map<string, number>();
  for (const { entry } of found)
    if (typeof entry?.id === "string")
      counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  for (const item of found)
    if (!item.error && (counts.get(String(item.entry.id)) ?? 0) > 1)
      item.error = `Plugin ${item.entry.id} is declared more than once across .avoozl.json and this machine's settings.`;
  return found;
}

const sourceBase = (
  source: string,
  { workspaceRoot, settingsFile }: PluginOptions,
) =>
  source === "repository" ? (workspaceRoot ?? "") : path.dirname(settingsFile);
const gitRoot = (settingsFile: string, id: string) =>
  path.join(path.dirname(settingsFile), "plugins", "git", id);

// A git entry's pin on this machine, or null when there is none or it was
// made for a different git, ref or subdir.
function gitPin(entry: Partial<PluginEntry>, settings: PluginSettings) {
  const pin = settings.pins?.[String(entry.id)];
  if (
    !record(pin) ||
    pin.git !== entry.git ||
    pin.ref !== entry.ref ||
    (pin.subdir ?? null) !== (entry.subdir ?? null) ||
    typeof pin.commit !== "string" ||
    !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(pin.commit)
  )
    return null;
  return pin;
}

// Where an entry's files are: a path relative to `.avoozl.json` (repository)
// or to the settings file (machine), a package installed into the plugin
// folder beside the machine settings, or a git entry's pinned commit there.
function pluginLocation(
  { entry, source }: { entry: Partial<PluginEntry>; source: string },
  options: PluginOptions,
  pin: Pin | null = null,
) {
  const { settingsFile } = options;
  if (entry.path !== undefined)
    return path.resolve(sourceBase(source, options), entry.path);
  if (entry.git !== undefined) {
    if (!pin) return null;
    const top = path.join(gitRoot(settingsFile, String(entry.id)), pin.commit);
    return entry.subdir ? path.join(top, entry.subdir) : top;
  }
  return path.join(
    path.dirname(settingsFile),
    "plugins",
    "node_modules",
    String(entry.package),
  );
}

// `folder`, when known, is where the manifest's files are: a checks part
// is checked against it (plugin-checks PK1.5).
export function validateManifest(
  manifest: unknown,
  entry: { id?: unknown },
  folder: string | null = null,
): Manifest {
  if (!record(manifest)) fail(`${PLUGIN_MANIFEST} must be an object.`);
  if (manifest.id !== entry.id)
    fail(
      `${PLUGIN_MANIFEST} id ${manifest.id} does not match the entry's id ${entry.id}.`,
    );
  if (RESERVED_IDS.has(String(manifest.id)))
    fail(`Plugin id ${manifest.id} is reserved.`);
  if (typeof manifest.version !== "string" || !VERSION.test(manifest.version))
    fail(`${PLUGIN_MANIFEST} version must be a version string.`);
  if (!Number.isInteger(manifest.contract))
    fail(
      `${PLUGIN_MANIFEST} contract (the contract version) must be a whole number.`,
    );
  const list = (value: unknown): value is unknown[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length;
  if (manifest.provides !== undefined) {
    const other = Array.isArray(manifest.provides)
      ? manifest.provides.find((part) => !PARTS.includes(String(part)))
      : undefined;
    if (other !== undefined) fail(`${other} is not a plugin part.`);
    if (!list(manifest.provides))
      fail(
        `${PLUGIN_MANIFEST} provides must list ${PARTS.join(", ")}, each once.`,
      );
  } else if (
    !list(manifest.kinds) ||
    manifest.kinds.some((kind) => !KINDS.includes(String(kind)))
  )
    fail(
      `${PLUGIN_MANIFEST} kinds must list rules, or provides must list its parts.`,
    );
  const { provides, kinds } = pluginParts(manifest);
  if (
    manifest.provides !== undefined &&
    manifest.kinds !== undefined &&
    (!Array.isArray(manifest.kinds) ||
      [...manifest.kinds].sort().join() !== [...kinds].sort().join())
  )
    fail(
      `${PLUGIN_MANIFEST} kinds must be ${kinds.join(", ") || "empty"} to match provides, or be left out.`,
    );
  const capabilities = manifest.capabilities ?? {};
  if (!record(capabilities))
    fail(`${PLUGIN_MANIFEST} capabilities must be an object.`);
  for (const [kind, list] of Object.entries(capabilities)) {
    if (!KINDS.includes(kind))
      fail(`${PLUGIN_MANIFEST} capabilities.${kind} is not a kind.`);
    if (
      !Array.isArray(list) ||
      list.some((name) => !CAPABILITIES[kind]?.includes(String(name)))
    )
      fail(
        `${PLUGIN_MANIFEST} capabilities.${kind} may list only ${CAPABILITIES[kind]?.join(", ") || "nothing"}.`,
      );
  }
  if (manifest.telemetry !== undefined)
    fail(`${PLUGIN_MANIFEST} may not set telemetry: it is a machine setting.`);
  if (folder) readContextPart(manifest, folder);
  else if (!provides.includes("context") && manifest.context !== undefined)
    fail(`${PLUGIN_MANIFEST} context goes with provides context.`);
  if (provides.includes("credentials")) checkCredentials(manifest.credentials);
  else if (manifest.credentials !== undefined)
    fail(`${PLUGIN_MANIFEST} credentials goes with provides credentials.`);
  if (
    provides.includes("checks") ||
    manifest.checks !== undefined ||
    manifest.servers !== undefined
  ) {
    if (!provides.includes("checks"))
      fail(
        `${PLUGIN_MANIFEST} has checks or servers, so provides must list checks.`,
      );
    if (folder) validateChecksPart(manifest, folder);
  }
  // A plugin of data parts only has no entry. A credentials part names its
  // own entry.
  if (!kinds.some((kind) => kind !== "credentials")) {
    if (manifest.entry !== undefined)
      fail(
        kinds.length
          ? `${PLUGIN_MANIFEST} entry is for rules; credentials names its own entry. Remove entry.`
          : `${PLUGIN_MANIFEST} provides only ${provides.join(", ")}, which run${provides.length === 1 ? "s" : ""} no code; remove entry.`,
      );
  } else if (!inside(manifest.entry))
    fail(
      `${PLUGIN_MANIFEST} entry must be a .mjs or .js file inside the plugin.`,
    );
  // Each part was checked above.
  return manifest as Manifest;
}

const inside = (file: unknown) =>
  typeof file === "string" &&
  /\.(?:mjs|js)$/.test(file) &&
  !path.isAbsolute(file) &&
  !file.split(/[\\/]/).includes("..");
const HOST =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::[0-9]{1,5})?$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

// The credentials part (PC1.2): {entry, hosts, owners?}.
function checkCredentials(value: unknown) {
  const where = `${PLUGIN_MANIFEST} credentials`;
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!["entry", "hosts", "owners"].includes(key))
      fail(`${where}.${key} is not a credentials setting.`);
  if (!inside(value.entry))
    fail(`${where}.entry must be a .mjs or .js file inside the plugin.`);
  const { hosts, owners } = value;
  if (
    !Array.isArray(hosts) ||
    hosts.length < 1 ||
    hosts.length > 10 ||
    hosts.some((host) => typeof host !== "string" || !HOST.test(host)) ||
    new Set(hosts).size !== hosts.length
  )
    fail(
      `${where}.hosts must list 1 to 10 lowercase GitHub host names, each once.`,
    );
  if (
    owners !== undefined &&
    (!Array.isArray(owners) ||
      owners.length < 1 ||
      owners.length > 100 ||
      owners.some((owner) => typeof owner !== "string" || !OWNER.test(owner)) ||
      new Set(owners.map((owner) => owner.toLowerCase())).size !==
        owners.length)
  )
    fail(`${where}.owners must list 1 to 100 GitHub owner names, each once.`);
}

// A repository may not choose who Avoozl signs in as (PC2.2).
const repositoryCredentials = (key: string, id: unknown) =>
  `.avoozl.json ${key}: plugin ${id} provides credentials; only this machine's plugins.json may declare who Avoozl signs in as.`;

// SHA-256 over every file's relative path and bytes, sorted; a symbolic link
// counts by its target text and is never followed.
export function contentHash(folder: unknown) {
  const hash = createHash("sha256"),
    files: string[] = [];
  let bytes = 0;
  const walk = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name === ".git") continue;
      const full = path.join(directory, item.name);
      if (item.isDirectory()) walk(full);
      else files.push(full);
      if (files.length > MAX_FILES)
        fail(`The plugin has more than ${MAX_FILES} files.`);
    }
  };
  if (typeof folder !== "string") fail("The plugin has no folder.");
  walk(folder);
  for (const file of files.sort()) {
    const relative = path.relative(folder, file).split(path.sep).join("/"),
      stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      hash.update(`${relative}\0link\0${fs.readlinkSync(file)}\0`);
      continue;
    }
    bytes += stat.size;
    if (bytes > MAX_BYTES) fail("The plugin is larger than 100 MB.");
    hash.update(`${relative}\0${stat.size}\0`);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

// What Settings shows and the loader decides on, for one declared plugin.
// state: invalid | missing | unsupported | disabled | unapproved | changed |
// approved.
function inspectPlugin(
  declared: Declared,
  options: PluginOptions,
  settings: PluginSettings,
): InspectedPlugin {
  const { entry, source, error } = declared,
    base: Pick<InspectedPlugin, "id" | "source" | "entry" | "commit"> = {
      id: String(entry?.id ?? ""),
      source,
      entry,
    };
  if (error) return { ...base, state: "invalid", reason: error };
  const pin = entry.git !== undefined ? gitPin(entry, settings) : null;
  if (pin) Object.assign(base, { commit: pin.commit });
  if (entry.git !== undefined && !pin)
    return {
      ...base,
      state: "missing",
      reason: `Not fetched on this machine. Choose Update to resolve ${entry.ref} and fetch it.`,
    };
  const location = pluginLocation(declared, options, pin) ?? "";
  let manifest: Manifest, hash: string;
  try {
    if (!fs.statSync(location).isDirectory()) throw Error("not a folder");
    const read: unknown = JSON.parse(
      fs.readFileSync(path.join(location, PLUGIN_MANIFEST), "utf8"),
    );
    try {
      manifest = validateManifest(read, entry, location);
      hash = contentHash(location);
    } catch (invalid) {
      return {
        ...base,
        location,
        state: "invalid",
        reason: messageOf(invalid),
      };
    }
  } catch (missing) {
    return {
      ...base,
      location,
      state: "missing",
      reason:
        codeOf(missing) === "ENOENT" || messageOf(missing) === "not a folder"
          ? `No plugin at ${location}.`
          : `${PLUGIN_MANIFEST} is unreadable: ${messageOf(missing)}`,
    };
  }
  const { provides, kinds } = pluginParts(manifest);
  if (source === "repository" && provides.includes("credentials"))
    return {
      ...base,
      location,
      provides,
      state: "invalid",
      reason: repositoryCredentials(`plugins.${declared.index}`, entry.id),
    };
  const shown = {
    ...base,
    location,
    version: manifest.version,
    contract: manifest.contract,
    provides,
    kinds,
    capabilities: manifest.capabilities ?? {},
    hash,
    manifest,
    ...(provides.includes("context")
      ? { context: readContextPart(manifest, location) }
      : {}),
    ...(provides.includes("credentials") && manifest.credentials
      ? {
          credentials: {
            hosts: manifest.credentials.hosts,
            owners: manifest.credentials.owners ?? null,
          },
        }
      : {}),
  };
  if (!SUPPORTED_CONTRACTS.includes(manifest.contract))
    return {
      ...shown,
      state: "unsupported",
      reason: `Contract version ${manifest.contract} is not supported; this Avoozl loads contract version ${SUPPORTED_CONTRACTS.join(", ")}.`,
    };
  if (entry.contract !== manifest.contract)
    return {
      ...shown,
      state: "unsupported",
      reason: `The entry expects contract version ${entry.contract}, but the plugin declares contract version ${manifest.contract}.`,
    };
  const id = String(entry.id);
  if (settings.disabled.includes(id))
    return { ...shown, state: "disabled", reason: "Disabled in Settings." };
  const approval = settings.approvals[id],
    broken = settings.broken?.[id];
  if (!approval)
    return {
      ...shown,
      state: "unapproved",
      reason: broken
        ? `Marked broken: ${broken.reason} Approve it again to run it.`
        : "Not approved on this machine.",
    };
  if (pin && approval.commit !== pin.commit)
    return {
      ...shown,
      state: "changed",
      approval,
      reason: `Approved commit ${String(approval.commit ?? "none").slice(0, 12)} differs from ${pin.commit.slice(0, 12)}; approve it again.`,
    };
  if (approval.version !== manifest.version || approval.hash !== hash)
    return {
      ...shown,
      state: "changed",
      approval,
      reason: `Approved version ${approval.version} (${String(approval.hash).slice(0, 12)}) differs from ${manifest.version} (${hash.slice(0, 12)}); approve it again.`,
    };
  // A checks plugin's approval binds this machine's server mappings too
  // (plugin-checks PK10.3).
  if (
    manifest.servers &&
    (approval.mcpHash ?? null) !== mappingHash(settings.mcp?.[id])
  )
    return {
      ...shown,
      state: "changed",
      approval,
      reason:
        "This machine's MCP server mapping changed since the approval; approve it again.",
    };
  // A context part's approval binds this machine's answers and mappings
  // too (epic-context EC4.4).
  if (
    shown.context &&
    (approval.contextHash ?? null) !== contextHash(settings, id)
  )
    return {
      ...shown,
      state: "changed",
      approval,
      reason:
        "This machine's answers or server mappings changed since the approval; approve it again.",
    };
  return { ...shown, state: "approved", approval, reason: null };
}

// Add plugin, before anything is declared: what a folder or an installed
// package holds ({id, version, contract, kinds, capabilities, supported}),
// or the commit a git ref names now ({commit}). Reads only; a git source is
// resolved with ls-remote and not fetched, so its manifest is read after
// Add fetches that commit. A problem comes back as {error}.
export async function previewPlugin(options: PluginOptions, input: Obj = {}) {
  const scope = input.scope === "repository" ? "repository" : "machine",
    where = ["path", "package", "git"].filter(
      (key) => input[key] !== undefined,
    );
  if (where.length !== 1) fail("Name exactly one of path, package or git.");
  const given = {
    id: "preview",
    ...Object.fromEntries(
      ["path", "package", "git", "ref", "subdir"]
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    ),
    contract: SUPPORTED_CONTRACTS[0],
  };
  let entry: PluginEntry;
  try {
    entry = validateEntry(given, "plugin");
  } catch (error) {
    return { error: messageOf(error).replace(/^plugin\.?/, "The source ") };
  }
  if (entry.git !== undefined) {
    const scratch = path.join(
      path.dirname(options.settingsFile),
      "plugins",
      "git",
      ".preview",
    );
    fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
    try {
      const remote = gitRemote(entry.git, sourceBase(scope, options));
      return {
        commit: await resolveGitRef(remote, String(entry.ref), { scratch }),
      };
    } catch (error) {
      return { error: messageOf(error) };
    }
  }
  const location = pluginLocation({ entry, source: scope }, options) ?? "";
  let read: unknown;
  try {
    read = JSON.parse(
      fs.readFileSync(path.join(location, PLUGIN_MANIFEST), "utf8"),
    );
  } catch (error) {
    return {
      location,
      error:
        codeOf(error) === "ENOENT" || codeOf(error) === "ENOTDIR"
          ? entry.package !== undefined
            ? `The package is not installed in this machine's plugin folder (${location}).`
            : `No ${PLUGIN_MANIFEST} in that folder.`
          : `${PLUGIN_MANIFEST} is unreadable: ${messageOf(error)}`,
    };
  }
  let context: ReturnType<typeof contextView> = null,
    manifest: Manifest;
  try {
    manifest = validateManifest(
      read,
      { id: record(read) ? read.id : undefined },
      location,
    );
    // What an approval of a context part would bind (epic-context EC4.1).
    const part = readContextPart(manifest, location);
    if (part)
      context = contextView(
        { id: manifest.id, source: scope, state: "unapproved", context: part },
        readPluginSettings(options.settingsFile),
      );
  } catch (error) {
    return { location, error: messageOf(error) };
  }
  return {
    location,
    id: manifest.id,
    version: manifest.version,
    contract: manifest.contract,
    ...pluginParts(manifest),
    capabilities: manifest.capabilities ?? {},
    ...(manifest.credentials
      ? {
          credentials: {
            hosts: manifest.credentials.hosts,
            owners: manifest.credentials.owners ?? null,
          },
        }
      : {}),
    ...(context ? { context } : {}),
    supported: SUPPORTED_CONTRACTS.includes(manifest.contract),
  };
}

export function inspectPlugins(options: PluginOptions): InspectedPlugin[] {
  const settings = readPluginSettings(options.settingsFile);
  return declaredPlugins(options).map((declared) =>
    inspectPlugin(declared, options, settings),
  );
}

// One Needs you row per declared plugin waiting for this machine's
// approval (simplify §D13); a person approves it in Settings › Plugins.
export function pluginApprovalNeedsYou(
  options: PluginOptions | null | undefined,
) {
  if (!options?.workspaceRoot) return [];
  let plugins: InspectedPlugin[];
  try {
    plugins = inspectPlugins(options);
  } catch {
    return [];
  }
  return plugins
    .filter((plugin) => ["unapproved", "changed"].includes(plugin.state))
    .map((plugin) => ({
      kind: "needs-human",
      reason: "plugin-approval",
      id: `plugin-approval:${plugin.id}`,
      taskId: null,
      authority: "avoozl",
      title: `Plugin ${plugin.id} waits for approval`,
      detail: `${plugin.reason} Approve it in Settings › Plugins.`,
    }));
}

// A /proc/net/tcp{,6} address ("0100007F:1F90") as lsof prints it
// ("127.0.0.1:8080", "[::1]:8080"). The address is 32-bit words in host
// byte order; shortcut: assumes a little-endian host, as every Linux
// platform Node ships for is.
export function procAddress(hex: string) {
  const [address = "", port = "0"] = hex.split(":"),
    words = (address.match(/.{8}/g) ?? []).map((word) =>
      (word.match(/../g) ?? []).reverse().map((byte) => parseInt(byte, 16)),
    ),
    bytes = words.flat(),
    number = parseInt(port, 16);
  if (bytes.length === 4) return `${bytes.join(".")}:${number}`;
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2)
    groups.push((((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0)).toString(16));
  return `${new URL(`http://[${groups.join(":")}]`).hostname}:${number}`;
}

// Listening TCP addresses `netstat -ano` shows for `pid` (Windows). A
// listening row's foreign address has port 0 ("0.0.0.0:0", "[::]:0"); that
// is read instead of the State column, which Windows translates.
export function netstatListeners(text: string, pid: number | string) {
  const found: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (
      parts.length === 5 &&
      parts[0] === "TCP" &&
      parts[4] === String(pid) &&
      /:0$/.test(parts[2] ?? "")
    )
      found.push(String(parts[1]));
  }
  return found;
}

// TCP listeners the process holds: lsof on macOS and BSD, /proc on Linux,
// netstat on Windows. A process Avoozl cannot check is treated as listening
// (fail closed).
export async function listeningSockets(pid: number): Promise<string[]> {
  if (process.platform === "linux") {
    const inodes = new Set<string>();
    for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
      try {
        const target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`),
          match = target.match(/^socket:\[(\d+)\]$/);
        if (match?.[1]) inodes.add(match[1]);
      } catch {}
    }
    const found: string[] = [];
    for (const table of ["tcp", "tcp6"]) {
      let text = "";
      try {
        text = fs.readFileSync(`/proc/${pid}/net/${table}`, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n").slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts[3] === "0A" && inodes.has(parts[9] ?? ""))
          found.push(procAddress(parts[1] ?? ""));
      }
    }
    return found;
  }
  if (process.platform === "win32")
    return new Promise<string[]>((resolve, reject) =>
      execFile(
        // By full path, so a folder on PATH cannot stand in for it.
        process.env.SystemRoot
          ? path.join(process.env.SystemRoot, "System32", "netstat.exe")
          : "netstat.exe",
        ["-ano"],
        { timeout: 5000, windowsHide: true },
        (error, stdout) => {
          if (error)
            return reject(
              Error(`cannot check for listeners: ${messageOf(error)}`),
            );
          resolve(netstatListeners(stdout, pid));
        },
      ),
    );
  return new Promise<string[]>((resolve, reject) =>
    execFile(
      "lsof",
      ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"],
      { timeout: 5000 },
      (error, stdout) => {
        // lsof exits 1 when it finds nothing.
        if (error && error.code !== 1)
          return reject(
            Error(`cannot check for listeners: ${messageOf(error)}`),
          );
        resolve(
          stdout
            .split("\n")
            .filter((line) => line.startsWith("n"))
            .map((line) => line.slice(1)),
        );
      },
    ),
  );
}

// The minimal environment a plugin gets: enough to run Node, plus each
// variable its config names in a `...Env` key (R34.2).
function childEnvironment(config: unknown, extra: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "SystemRoot",
  ]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const named = (value: unknown) => {
    if (!record(value)) return;
    for (const [key, child] of Object.entries(value))
      if (/Env$/.test(key) && typeof child === "string") {
        const set = process.env[child];
        if (set !== undefined) env[child] = set;
      } else named(child);
  };
  named(config);
  return { ...env, ...extra };
}

// One running plugin: JSON lines over stdio, one call at a time. The
// credentials host (github-credentials.mjs) runs one too, outside any tick.
// One call waiting for its reply.
interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
export class PluginProcess {
  plugin: { location?: string | null; entry?: { config?: unknown } };
  timeoutMs: number;
  deadline: number;
  checkListeners: (pid: number) => Promise<string[]>;
  next: number;
  pending: Map<number, Waiting>;
  broken: string | null;
  violation?: string;
  exited: Promise<unknown>;
  child: ChildProcessByStdio<Writable, Readable, null>;
  constructor(
    plugin: PluginProcess["plugin"],
    {
      timeoutMs,
      deadline,
      guard,
      checkListeners,
    }: {
      timeoutMs: number;
      deadline: number;
      guard: boolean;
      checkListeners: (pid: number) => Promise<string[]>;
    },
  ) {
    this.plugin = plugin;
    this.timeoutMs = timeoutMs;
    this.deadline = deadline;
    this.checkListeners = checkListeners;
    this.next = 1;
    this.pending = new Map();
    this.broken = null;
    this.child = spawn(process.execPath, [CHILD], {
      cwd: plugin.location ?? undefined,
      stdio: ["pipe", "pipe", "ignore"],
      env: childEnvironment(
        plugin.entry?.config,
        guard ? {} : { AVOOZL_PLUGIN_GUARD: "off" },
      ),
      windowsHide: true,
    });
    this.exited = new Promise((resolve) => this.child.on("exit", resolve));
    // A write after the plugin died fails here, not as an unhandled error.
    this.child.stdin.on("error", () => {});
    this.child.on("exit", (code, signal) =>
      this.fail(
        this.violation || `crashed (exit ${code ?? signal ?? "unknown"}).`,
      ),
    );
    this.child.on("error", (error) =>
      this.fail(`could not start: ${messageOf(error)}`),
    );
    jsonLines(this.child.stdout, {
      maxLine: MAX_LINE,
      onLine: (line) => this.receive(line),
      onOverflow: () => this.stop("sent a reply over 1 MB."),
    });
  }
  receive(line: string) {
    // One contract message from the child.
    let message: {
      id?: number;
      violation?: string;
      error?: unknown;
      result?: unknown;
    } | null;
    try {
      message = JSON.parse(line);
    } catch {
      return this.stop("wrote something that is not a contract message.");
    }
    if (message?.violation) {
      this.violation = `opened a network listener (${message.violation}); plugins may not listen.`;
      return this.stop(this.violation);
    }
    const id = Number(message?.id),
      waiting = this.pending.get(id);
    if (!message || !waiting) return;
    this.pending.delete(id);
    clearTimeout(waiting.timer);
    if (typeof message.error === "string")
      waiting.reject(Error(`failed: ${message.error.slice(0, 500)}`));
    else waiting.resolve(message.result);
  }
  fail(reason: string) {
    this.broken ||= reason;
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(Error(this.broken ?? reason));
    }
    this.pending.clear();
  }
  stop(reason: string) {
    this.fail(reason);
    this.child.kill("SIGKILL");
  }
  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.broken) throw Error(this.broken);
    const timeoutMs = Math.min(this.timeoutMs, this.deadline - Date.now());
    if (timeoutMs <= 0)
      throw Error("waits for the next tick: this tick's time budget is spent.");
    const id = this.next++;
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop(`timed out after ${Math.round(timeoutMs / 1000)} s.`);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    const result = await reply;
    await this.listenCheck();
    return result;
  }
  // After start and after every reply (R34.5).
  async listenCheck() {
    let listening: string[];
    try {
      listening = await this.checkListeners(Number(this.child.pid));
    } catch (error) {
      this.stop(messageOf(error));
      throw Error(this.broken ?? "broken.");
    }
    if (listening.length) {
      this.stop(
        `opened a network listener (${listening.join(", ")}); plugins may not listen.`,
      );
      throw Error(this.broken ?? "broken.");
    }
  }
  async close() {
    this.broken ||= "closed.";
    this.child.stdin.end();
    this.child.kill("SIGKILL");
    await this.exited;
  }
}

// The loader. `open()` starts one tick's plugin session; a plugin starts on
// its first call and stops when the session closes.
export function pluginHost({
  workspaceRoot,
  settingsFile = pluginSettingsPath(),
  timeoutMs = CALL_TIMEOUT_MS,
  budgetMs = TICK_BUDGET_MS,
  guard = true,
  checkListeners = listeningSockets,
}: {
  workspaceRoot?: string | null;
  settingsFile?: string;
  timeoutMs?: number;
  budgetMs?: number;
  guard?: boolean;
  checkListeners?: (pid: number) => Promise<string[]>;
} = {}) {
  const options: PluginOptions = { workspaceRoot, settingsFile };
  return {
    options,
    inspect: () => inspectPlugins(options),
    open() {
      const deadline = Date.now() + budgetMs,
        running = new Map<string, PluginProcess>(),
        plugins = new Map(inspectPlugins(options).map((p) => [p.id, p]));
      const connect = async (id: string, kind: string) => {
        const plugin = plugins.get(id);
        if (!plugin) return { reason: `Plugin ${id} is not declared.` };
        if (plugin.state !== "approved")
          return { reason: plugin.reason ?? plugin.state };
        // Tokens never sit in a tick's plugin child (PC1.3, PC1.7).
        if (kind === "credentials" || !plugin.kinds?.includes(kind))
          return { reason: `Plugin ${id} does not declare the kind ${kind}.` };
        if (!running.has(id)) {
          // A local folder can change between the check above and the spawn;
          // hash it once more just before it starts (R83.6). Git plugins sit
          // in a commit-named folder and are not re-hashed.
          // shortcut: files can still change between this hash and the
          // child's own read; upgrade by copying the folder first.
          if (plugin.entry.git === undefined) {
            let now: string;
            try {
              now = contentHash(plugin.location);
            } catch (error) {
              return {
                reason: `Plugin ${id} cannot be read: ${messageOf(error)}`,
              };
            }
            if (now !== plugin.hash)
              return {
                reason: `Plugin ${id} changed after it was approved (${String(plugin.hash).slice(0, 12)} to ${now.slice(0, 12)}); approve it again.`,
              };
          }
          const child = new PluginProcess(plugin, {
            timeoutMs,
            deadline,
            guard,
            checkListeners,
          });
          running.set(id, child);
          try {
            await child.request("hello", {
              entry: path.join(
                String(plugin.location),
                String(plugin.manifest?.entry),
              ),
              config: plugin.entry.config ?? {},
              kind,
            });
          } catch (error) {
            return { reason: messageOf(error) };
          }
        }
        const child = running.get(id);
        if (!child) return { reason: `Plugin ${id} did not start.` };
        if (child.broken) return { reason: child.broken };
        return {
          manifest: plugin.manifest,
          config: plugin.entry.config ?? {},
          call: (method: string, params?: unknown) =>
            child.request(method, params),
        };
      };
      return pluginSession(connect, {
        close: async () => {
          await Promise.all(
            [...running.values()].map((child) => child.close()),
          );
        },
      });
    },
  };
}

// The approval a person gives in Settings (R34.4): the exact id, version and
// hash they were shown. Never called by the tick or example installation.
export function approvePlugin(
  options: PluginOptions,
  {
    id,
    version,
    hash,
    commit,
  }: { id: string; version?: unknown; hash?: unknown; commit?: unknown },
  approvedBy = "",
) {
  const plugin = inspectPlugins(options).find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  if (!plugin.hash)
    fail(`Plugin ${id} cannot be approved: ${plugin.reason}`, 409);
  if (plugin.state === "unsupported") fail(String(plugin.reason), 409);
  if (
    hash !== plugin.hash ||
    (version !== undefined && version !== plugin.version) ||
    (commit !== undefined && commit !== plugin.commit)
  )
    fail(
      `Plugin ${id} is now version ${plugin.version}${plugin.commit ? ` at commit ${plugin.commit}` : ""} with hash ${plugin.hash}. Review it again before approving.`,
      409,
    );
  const settings = readPluginSettings(options.settingsFile);
  settings.approvals[id] = {
    ...(plugin.version !== undefined ? { version: plugin.version } : {}),
    hash: plugin.hash,
    ...(plugin.commit ? { commit: plugin.commit } : {}),
    provides: plugin.provides,
    kinds: plugin.kinds,
    ...(plugin.credentials ? { credentials: plugin.credentials } : {}),
    location: plugin.location,
    ...(plugin.manifest?.servers
      ? { mcpHash: mappingHash(settings.mcp?.[id]) }
      : {}),
    ...(plugin.context ? { contextHash: contextHash(settings, id) } : {}),
    approvedAt: new Date().toISOString(),
    ...(approvedBy ? { approvedBy } : {}),
  };
  if (settings.broken) delete settings.broken[id];
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id);
}

export function disablePlugin(
  options: PluginOptions,
  { id, disabled = true }: { id: string; disabled?: boolean },
) {
  const settings = readPluginSettings(options.settingsFile);
  // Enabling still clears a stale entry for a plugin no longer declared.
  if (
    !inspectPlugins(options).some((p) => p.id === id) &&
    !(disabled === false && settings.disabled.includes(id))
  )
    fail(`Plugin ${id} is not declared.`, 404);
  settings.disabled = settings.disabled.filter((item) => item !== id);
  if (disabled) settings.disabled.push(id);
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id) ?? null;
}

// The `.avoozl.json` text with its `plugins` list changed by `edit`.
function editRepositoryPlugins(
  workspaceRoot: string | null | undefined,
  edit: (list: unknown[]) => unknown[],
) {
  const file = path.join(workspaceRoot ?? "", ".avoozl.json");
  let value: Obj = { version: 1 };
  try {
    const read: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (record(read)) value = read;
  } catch (error) {
    if (codeOf(error) !== "ENOENT")
      fail(`.avoozl.json is invalid: ${messageOf(error)}`, 409);
  }
  const plugins = edit(Array.isArray(value.plugins) ? value.plugins : []);
  if (plugins.length) value.plugins = plugins;
  else delete value.plugins;
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(temporary, file);
}

// Settings **Add plugin**: one entry, machine-local by default. Saving into
// `.avoozl.json` needs `confirmPublic` unless the repository is known to be
// private, because a plugin's name may be private (R34.10).
// What Add plugin asks for.
interface AddInput {
  scope?: string;
  entry?: unknown;
  confirmPublic?: boolean;
}
function checkAdd(
  options: PluginOptions,
  { scope, entry: given, confirmPublic }: AddInput,
  visibility: string,
) {
  const entry = validateEntry(given);
  if (scope !== "machine" && scope !== "repository")
    fail('Choose scope "machine" or "repository".');
  if (scope === "repository") {
    if (entry.path !== undefined && path.isAbsolute(entry.path))
      fail(
        "A plugin in .avoozl.json names its path relative to the repository.",
      );
    if (visibility !== "private" && !confirmPublic) {
      throw Object.assign(
        Error(
          visibility === "public"
            ? "This repository is public. Its .avoozl.json would publish this plugin's id, package and config. Declare it on this machine instead, or confirm."
            : "Avoozl cannot tell whether this repository is private. Its .avoozl.json may publish this plugin's id, package and config. Declare it on this machine instead, or confirm.",
        ),
        { status: 409, code: "plugin-public-repository" },
      );
    }
  }
  if (declaredPlugins(options).some((p) => p.entry?.id === entry.id))
    fail(`Plugin ${entry.id} is already declared.`, 409);
  return entry;
}

// Add plugin refuses the repository scope for a credentials plugin (PC2.2).
function refuseRepositoryCredentials(location: string | null, id: string) {
  let manifest: unknown = null;
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(location ?? "", PLUGIN_MANIFEST), "utf8"),
    );
  } catch {
    return;
  }
  if (pluginParts(manifest).provides.includes("credentials"))
    fail(
      `Plugin ${id} provides credentials; only this machine's plugins.json may declare who Avoozl signs in as. Add it on this machine.`,
      409,
    );
}

export function addPlugin(
  options: PluginOptions,
  { scope = "machine", entry: given, confirmPublic = false }: AddInput,
  { visibility = "unknown" }: { visibility?: string } = {},
) {
  if (record(given) && given.git !== undefined)
    fail("A git plugin is added with addGitPlugin, which fetches it.");
  const entry = checkAdd(
    options,
    { scope, entry: given, confirmPublic },
    visibility,
  );
  if (scope === "repository")
    refuseRepositoryCredentials(
      pluginLocation({ entry, source: "repository" }, options),
      entry.id,
    );
  if (scope === "machine") {
    const settings = readPluginSettings(options.settingsFile);
    settings.plugins.push(entry);
    writePluginSettings(options.settingsFile, settings);
  } else
    editRepositoryPlugins(options.workspaceRoot, (list) => [...list, entry]);
  return inspectPlugins(options).find((p) => p.id === entry.id);
}

// Resolve a git entry's ref, fetch that one commit and check it holds a
// plugin whose manifest matches the entry. Returns the pin to store.
async function pinGit(
  options: PluginOptions,
  { entry, source }: { entry: Partial<PluginEntry>; source: string },
): Promise<Pin> {
  const root = gitRoot(options.settingsFile, String(entry.id)),
    remote = gitRemote(String(entry.git), sourceBase(source, options));
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const ref = String(entry.ref),
    commit =
      (await resolveGitRef(remote, ref, { scratch: root })) ??
      fail(`${ref} names no commit.`, 409);
  const folder = await fetchGitCommit({
    remote,
    ref,
    commit,
    subdir: entry.subdir,
    root,
  });
  try {
    validateManifest(
      JSON.parse(fs.readFileSync(path.join(folder, PLUGIN_MANIFEST), "utf8")),
      entry,
      folder,
    );
  } catch (error) {
    fail(`Commit ${commit.slice(0, 12)}: ${messageOf(error)}`, 409);
  }
  return {
    git: entry.git,
    ref: entry.ref,
    ...(entry.subdir !== undefined ? { subdir: entry.subdir } : {}),
    commit,
    pinnedAt: new Date().toISOString(),
  };
}

// Drop fetched commits of `id` other than `keep`.
function pruneGit(
  settingsFile: string,
  id: string,
  keep: string | null = null,
) {
  const root = gitRoot(settingsFile, id);
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of names)
    if (name !== keep && /^[0-9a-f]{40,64}$/.test(name))
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
}

// Settings **Add from git** (R34.12–34.13): nothing is written unless the
// ref resolves, the commit fetches, and it holds this plugin. The result
// shows the commit for the person to approve.
export async function addGitPlugin(
  options: PluginOptions,
  { scope = "machine", entry: given, confirmPublic = false }: AddInput,
  { visibility = "unknown" }: { visibility?: string } = {},
) {
  if (!record(given) || given.git === undefined)
    fail("A git plugin names git and ref.");
  const entry = checkAdd(
    options,
    { scope, entry: given, confirmPublic },
    visibility,
  );
  const source = scope === "repository" ? "repository" : "machine";
  const pin = await pinGit(options, { entry, source });
  if (scope === "repository")
    refuseRepositoryCredentials(
      pluginLocation({ entry, source }, options, pin),
      entry.id,
    );
  if (declaredPlugins(options).some((p) => p.entry?.id === entry.id))
    fail(`Plugin ${entry.id} is already declared.`, 409);
  const settings = readPluginSettings(options.settingsFile);
  settings.pins[entry.id] = pin;
  if (scope === "machine") settings.plugins.push(entry);
  writePluginSettings(options.settingsFile, settings);
  if (scope === "repository")
    editRepositoryPlugins(options.workspaceRoot, (list) => [...list, entry]);
  return inspectPlugins(options).find((p) => p.id === entry.id);
}

// Settings **Update** for a git plugin: resolve its ref again and fetch the
// commit it names now. A new commit leaves the approval stale (R34.14).
export async function updateGitPlugin(
  options: PluginOptions,
  { id }: { id: string },
) {
  const declared = declaredPlugins(options).find((p) => p.entry?.id === id);
  if (!declared) fail(`Plugin ${id} is not declared.`, 404);
  if (declared.error) fail(declared.error, 409);
  if (declared.entry.git === undefined)
    fail(`Plugin ${id} does not come from git.`, 409);
  const pin = await pinGit(options, declared);
  const settings = readPluginSettings(options.settingsFile);
  settings.pins[id] = pin;
  writePluginSettings(options.settingsFile, settings);
  pruneGit(options.settingsFile, id, pin.commit);
  return inspectPlugins(options).find((p) => p.id === id);
}

// Removing a plugin never deletes its tasks: they park as "needs you"
// (R34.9). Its approval and disabled mark go too.
export function removePlugin(options: PluginOptions, { id }: { id: string }) {
  const declared = declaredPlugins(options).filter((p) => p.entry?.id === id);
  if (!declared.length) fail(`Plugin ${id} is not declared.`, 404);
  const settings = readPluginSettings(options.settingsFile);
  settings.plugins = settings.plugins.filter(
    (entry) => !record(entry) || entry.id !== id,
  );
  delete settings.approvals[id];
  delete settings.pins[id];
  settings.disabled = settings.disabled.filter((item) => item !== id);
  const picks = settings.credentialsPick ?? {};
  for (const [host, picked] of Object.entries(picks))
    if (picked === id) delete picks[host];
  writePluginSettings(options.settingsFile, settings);
  pruneGit(options.settingsFile, id);
  if (declared.some((p) => p.source === "repository"))
    editRepositoryPlugins(options.workspaceRoot, (list) =>
      list.filter((entry) => !record(entry) || entry.id !== id),
    );
  return { id, removed: true };
}
