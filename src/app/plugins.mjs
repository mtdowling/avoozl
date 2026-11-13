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
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { machineAvoozlPaths } from "./host-config.mjs";
import { SUPPORTED_CONTRACTS } from "./plugin-contract.mjs";
import {
  PACK_FILE,
  packPreview,
  readPack,
  withProvenance,
} from "./plugin-pack.mjs";
import {
  fetchGitCommit,
  gitRemote,
  resolveGitRef,
  validateGitSource,
} from "./plugin-git.mjs";
import { pluginSession } from "./plugin-session.mjs";
import { fail } from "./store.mjs";

export const PLUGIN_MANIFEST = "avoozl-plugin.json";
export const RESERVED_IDS = new Set(["local", "github"]);
export const KINDS = ["route", "tracker", "rules"];
export const CAPABILITIES = {
  route: [],
  // `poll` brings outside work in (R50.7): the intake part.
  tracker: ["edges", "subtasks", "actor", "pause", "poll"],
  rules: [],
};
// The parts one plugin may bundle (R55.1), and the code kind each runs as.
// A pack is settings only and runs as nothing; intake is a tracker's `poll`.
export const PARTS = ["pack", "rules", "tracker", "intake", "route"];
const PART_KIND = {
  rules: "rules",
  tracker: "tracker",
  intake: "tracker",
  route: "route",
};

// A manifest's parts and the code kinds they need. A manifest written
// before `provides` names its kinds, and each kind is its own part.
export function pluginParts(manifest) {
  const provides = Array.isArray(manifest?.provides)
    ? manifest.provides
    : Array.isArray(manifest?.kinds)
      ? manifest.kinds
      : [];
  return {
    provides: [...provides],
    kinds: KINDS.filter((kind) =>
      provides.some((part) => PART_KIND[part] === kind),
    ),
  };
}
const ID = /^[a-z][a-z0-9-]{0,60}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
const CHILD = fileURLToPath(new URL("./plugin-child.mjs", import.meta.url));
const MAX_FILES = 10000;
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_LINE = 1024 * 1024;
export const CALL_TIMEOUT_MS = 20_000;
// Plugin calls stop at a safe point inside the tick's own budget (§4.5).
export const TICK_BUDGET_MS = 45_000;

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// This machine's plugin settings: {plugins, approvals, disabled, pins}.
// `pins` holds each git entry's resolved commit (R34.13).
export function pluginSettingsPath(options = {}) {
  return path.join(machineAvoozlPaths(options).configDirectory, "plugins.json");
}

export function readPluginSettings(file) {
  let value = {};
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error(`Could not read plugin settings ${file}: ${error.message}`);
  }
  return {
    plugins: Array.isArray(value.plugins) ? value.plugins : [],
    approvals: record(value.approvals) ? value.approvals : {},
    disabled: Array.isArray(value.disabled) ? value.disabled : [],
    pins: record(value.pins) ? value.pins : {},
    // This machine's intake sources (design §4.12), kept through plugin edits.
    ...(record(value.intake) ? { intake: value.intake } : {}),
  };
}

export function writePluginSettings(file, value) {
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
const SECRET_VALUE = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{22,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
];
const snake = (key) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

function checkConfig(value, where) {
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
export function validateEntry(entry, where = "plugins entry") {
  if (!record(entry)) fail(`${where} must be an object.`);
  const keys = ["id", "package", "path", "git", "ref", "subdir"];
  for (const key of Object.keys(entry))
    if (![...keys, "contract", "config"].includes(key))
      fail(`${where}.${key} is not a plugin setting.`);
  if (typeof entry.id !== "string" || !ID.test(entry.id))
    fail(`${where}.id must be a lowercase plugin id.`);
  if (RESERVED_IDS.has(entry.id))
    fail(`${where}.id ${entry.id} is reserved for a built-in route.`);
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
  return entry;
}

// `.avoozl.json` `plugins`, checked when the tick loads policy.
export function repositoryPlugins(policy) {
  const list = policy?.plugins;
  if (list === undefined) return [];
  if (!Array.isArray(list)) fail("plugins must be a list.");
  list.forEach((entry, i) => validateEntry(entry, `plugins.${i}`));
  return list;
}

function readRepositoryPolicy(workspaceRoot) {
  if (!workspaceRoot) return {};
  try {
    return JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw Error(`.avoozl.json is invalid: ${error.message}`);
  }
}

// Every declared plugin with where it came from. An entry that does not
// validate, or an id declared twice, is kept with its error so Settings can
// show it; it never loads.
export function declaredPlugins({ workspaceRoot, settingsFile }) {
  const found = [];
  const add = (entries, source) =>
    entries.forEach((entry, i) => {
      let error = null;
      try {
        validateEntry(entry, `${source} plugins.${i}`);
      } catch (refused) {
        error = refused.message;
      }
      found.push({ entry, source, error });
    });
  let repository = [];
  try {
    const policy = readRepositoryPolicy(workspaceRoot);
    repository = Array.isArray(policy.plugins) ? policy.plugins : [];
  } catch (error) {
    found.push({
      entry: { id: null },
      source: "repository",
      error: error.message,
    });
  }
  add(repository, "repository");
  add(readPluginSettings(settingsFile).plugins, "machine");
  const counts = new Map();
  for (const { entry } of found)
    if (typeof entry?.id === "string")
      counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  for (const item of found)
    if (!item.error && counts.get(item.entry.id) > 1)
      item.error = `Plugin ${item.entry.id} is declared more than once across .avoozl.json and this machine's settings.`;
  return found;
}

const sourceBase = (source, { workspaceRoot, settingsFile }) =>
  source === "repository" ? workspaceRoot : path.dirname(settingsFile);
const gitRoot = (settingsFile, id) =>
  path.join(path.dirname(settingsFile), "plugins", "git", id);

// A git entry's pin on this machine, or null when there is none or it was
// made for a different git, ref or subdir.
export function gitPin(entry, settings) {
  const pin = settings.pins?.[entry.id];
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
export function pluginLocation({ entry, source }, options, pin = null) {
  const { settingsFile } = options;
  if (entry.path !== undefined)
    return path.resolve(sourceBase(source, options), entry.path);
  if (entry.git !== undefined) {
    if (!pin) return null;
    const top = path.join(gitRoot(settingsFile, entry.id), pin.commit);
    return entry.subdir ? path.join(top, entry.subdir) : top;
  }
  return path.join(
    path.dirname(settingsFile),
    "plugins",
    "node_modules",
    entry.package,
  );
}

export function validateManifest(manifest, entry) {
  if (!record(manifest)) fail(`${PLUGIN_MANIFEST} must be an object.`);
  if (manifest.id !== entry.id)
    fail(
      `${PLUGIN_MANIFEST} id ${manifest.id} does not match the entry's id ${entry.id}.`,
    );
  if (RESERVED_IDS.has(manifest.id))
    fail(`Plugin id ${manifest.id} is reserved.`);
  if (typeof manifest.version !== "string" || !VERSION.test(manifest.version))
    fail(`${PLUGIN_MANIFEST} version must be a version string.`);
  if (!Number.isInteger(manifest.contract))
    fail(
      `${PLUGIN_MANIFEST} contract (the contract version) must be a whole number.`,
    );
  const list = (value) =>
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length;
  if (manifest.provides !== undefined) {
    if (
      !list(manifest.provides) ||
      manifest.provides.some((part) => !PARTS.includes(part))
    )
      fail(
        `${PLUGIN_MANIFEST} provides must list ${PARTS.join(", ")}, each once.`,
      );
  } else if (
    !list(manifest.kinds) ||
    manifest.kinds.some((kind) => !KINDS.includes(kind))
  )
    fail(
      `${PLUGIN_MANIFEST} kinds must list route, tracker, or rules, or provides must list its parts.`,
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
      list.some((name) => !CAPABILITIES[kind].includes(name))
    )
      fail(
        `${PLUGIN_MANIFEST} capabilities.${kind} may list only ${CAPABILITIES[kind].join(", ") || "nothing"}.`,
      );
  }
  if (provides.includes("intake") && !capabilities.tracker?.includes("poll"))
    fail(
      `${PLUGIN_MANIFEST} provides intake, so capabilities.tracker must list poll.`,
    );
  if (provides.includes("pack")) {
    const file = manifest.pack ?? PACK_FILE;
    if (
      typeof file !== "string" ||
      !/\.json$/.test(file) ||
      path.isAbsolute(file) ||
      file.split(/[\\/]/).includes("..")
    )
      fail(`${PLUGIN_MANIFEST} pack must be a .json file inside the plugin.`);
  } else if (manifest.pack !== undefined)
    fail(`${PLUGIN_MANIFEST} pack goes with provides pack.`);
  // A pack runs no code (R55.3): a plugin of settings only has no entry.
  if (!kinds.length) {
    if (manifest.entry !== undefined)
      fail(
        `${PLUGIN_MANIFEST} provides only a pack, which runs no code; remove entry.`,
      );
    return manifest;
  }
  if (
    typeof manifest.entry !== "string" ||
    !/\.(?:mjs|js)$/.test(manifest.entry) ||
    path.isAbsolute(manifest.entry) ||
    manifest.entry.split(/[\\/]/).includes("..")
  )
    fail(
      `${PLUGIN_MANIFEST} entry must be a .mjs or .js file inside the plugin.`,
    );
  return manifest;
}

// SHA-256 over every file's relative path and bytes, sorted; a symbolic link
// counts by its target text and is never followed.
export function contentHash(folder) {
  const hash = createHash("sha256"),
    files = [];
  let bytes = 0;
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name === ".git") continue;
      const full = path.join(directory, item.name);
      if (item.isDirectory()) walk(full);
      else files.push(full);
      if (files.length > MAX_FILES)
        fail(`The plugin has more than ${MAX_FILES} files.`);
    }
  };
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
export function inspectPlugin(declared, options, settings) {
  const { entry, source, error } = declared,
    base = { id: entry?.id ?? null, source, entry };
  if (error) return { ...base, state: "invalid", reason: error };
  const pin = entry.git !== undefined ? gitPin(entry, settings) : null;
  if (pin) Object.assign(base, { commit: pin.commit });
  if (entry.git !== undefined && !pin)
    return {
      ...base,
      state: "missing",
      reason: `Not fetched on this machine. Choose Update to resolve ${entry.ref} and fetch it.`,
    };
  const location = pluginLocation(declared, options, pin);
  let manifest, hash;
  try {
    if (!fs.statSync(location).isDirectory()) throw Error("not a folder");
    manifest = JSON.parse(
      fs.readFileSync(path.join(location, PLUGIN_MANIFEST), "utf8"),
    );
  } catch (missing) {
    return {
      ...base,
      location,
      state: "missing",
      reason:
        missing.code === "ENOENT" || missing.message === "not a folder"
          ? `No plugin at ${location}.`
          : `${PLUGIN_MANIFEST} is unreadable: ${missing.message}`,
    };
  }
  let pack = null;
  try {
    validateManifest(manifest, entry);
    hash = contentHash(location);
    if (pluginParts(manifest).provides.includes("pack"))
      pack = readPack(location, manifest.pack ?? PACK_FILE);
  } catch (invalid) {
    return { ...base, location, state: "invalid", reason: invalid.message };
  }
  const { provides, kinds } = pluginParts(manifest);
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
    ...(pack ? { pack } : {}),
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
  if (settings.disabled.includes(entry.id))
    return { ...shown, state: "disabled", reason: "Disabled in Settings." };
  const approval = settings.approvals[entry.id];
  if (!approval)
    return {
      ...shown,
      state: "unapproved",
      reason: "Not approved on this machine.",
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
      reason: `Approved version ${approval.version} (${approval.hash.slice(0, 12)}) differs from ${manifest.version} (${hash.slice(0, 12)}); approve it again.`,
    };
  return { ...shown, state: "approved", approval, reason: null };
}

// Add plugin, before anything is declared: what a folder or an installed
// package holds ({id, version, contract, kinds, capabilities, supported}),
// or the commit a git ref names now ({commit}). Reads only; a git source is
// resolved with ls-remote and not fetched, so its manifest is read after
// Add fetches that commit. A problem comes back as {error}.
export async function previewPlugin(options, input = {}) {
  const scope = input.scope === "repository" ? "repository" : "machine",
    where = ["path", "package", "git"].filter(
      (key) => input[key] !== undefined,
    );
  if (where.length !== 1) fail("Name exactly one of path, package or git.");
  const entry = {
    id: "preview",
    ...Object.fromEntries(
      ["path", "package", "git", "ref", "subdir"]
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    ),
    contract: SUPPORTED_CONTRACTS[0],
  };
  try {
    validateEntry(entry, "plugin");
  } catch (error) {
    return { error: error.message.replace(/^plugin\.?/, "The source ") };
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
      return { commit: await resolveGitRef(remote, entry.ref, { scratch }) };
    } catch (error) {
      return { error: error.message };
    }
  }
  const location = pluginLocation({ entry, source: scope }, options);
  let manifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(location, PLUGIN_MANIFEST), "utf8"),
    );
  } catch (error) {
    return {
      location,
      error:
        error.code === "ENOENT" || error.code === "ENOTDIR"
          ? entry.package !== undefined
            ? `The package is not installed in this machine's plugin folder (${location}).`
            : `No ${PLUGIN_MANIFEST} in that folder.`
          : `${PLUGIN_MANIFEST} is unreadable: ${error.message}`,
    };
  }
  let pack = null;
  try {
    validateManifest(manifest, { id: manifest?.id });
    if (pluginParts(manifest).provides.includes("pack"))
      pack = readPack(location, manifest.pack ?? PACK_FILE);
  } catch (error) {
    return { location, error: error.message };
  }
  return {
    location,
    id: manifest.id,
    version: manifest.version,
    contract: manifest.contract,
    ...pluginParts(manifest),
    capabilities: manifest.capabilities ?? {},
    ...(pack ? { pack } : {}),
    supported: SUPPORTED_CONTRACTS.includes(manifest.contract),
  };
}

export function inspectPlugins(options) {
  const settings = readPluginSettings(options.settingsFile);
  return declaredPlugins(options).map((declared) =>
    inspectPlugin(declared, options, settings),
  );
}

// A /proc/net/tcp{,6} address ("0100007F:1F90") as lsof prints it
// ("127.0.0.1:8080", "[::1]:8080"). The address is 32-bit words in host
// byte order; shortcut: assumes a little-endian host, as every Linux
// platform Node ships for is.
export function procAddress(hex) {
  const [address, port] = hex.split(":"),
    words = address.match(/.{8}/g).map((word) =>
      word
        .match(/../g)
        .reverse()
        .map((byte) => parseInt(byte, 16)),
    ),
    bytes = words.flat(),
    number = parseInt(port, 16);
  if (bytes.length === 4) return `${bytes.join(".")}:${number}`;
  const groups = [];
  for (let i = 0; i < 16; i += 2)
    groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return `${new URL(`http://[${groups.join(":")}]`).hostname}:${number}`;
}

// Listening TCP addresses `netstat -ano` shows for `pid` (Windows). A
// listening row's foreign address has port 0 ("0.0.0.0:0", "[::]:0"); that
// is read instead of the State column, which Windows translates.
export function netstatListeners(text, pid) {
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (
      parts.length === 5 &&
      parts[0] === "TCP" &&
      parts[4] === String(pid) &&
      /:0$/.test(parts[2])
    )
      found.push(parts[1]);
  }
  return found;
}

// TCP listeners the process holds: lsof on macOS and BSD, /proc on Linux,
// netstat on Windows. A process Avoozl cannot check is treated as listening
// (fail closed).
export async function listeningSockets(pid) {
  if (process.platform === "linux") {
    const inodes = new Set();
    for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
      try {
        const target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`),
          match = target.match(/^socket:\[(\d+)\]$/);
        if (match) inodes.add(match[1]);
      } catch {}
    }
    const found = [];
    for (const table of ["tcp", "tcp6"]) {
      let text = "";
      try {
        text = fs.readFileSync(`/proc/${pid}/net/${table}`, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n").slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts[3] === "0A" && inodes.has(parts[9]))
          found.push(procAddress(parts[1]));
      }
    }
    return found;
  }
  if (process.platform === "win32")
    return new Promise((resolve, reject) =>
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
              Error(`cannot check for listeners: ${error.message}`),
            );
          resolve(netstatListeners(stdout, pid));
        },
      ),
    );
  return new Promise((resolve, reject) =>
    execFile(
      "lsof",
      ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"],
      { timeout: 5000 },
      (error, stdout) => {
        // lsof exits 1 when it finds nothing.
        if (error && error.code !== 1)
          return reject(Error(`cannot check for listeners: ${error.message}`));
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
function childEnvironment(config, extra) {
  const env = {};
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "SystemRoot",
  ])
    if (process.env[name] !== undefined) env[name] = process.env[name];
  const named = (value) => {
    if (!record(value)) return;
    for (const [key, child] of Object.entries(value))
      if (/Env$/.test(key) && typeof child === "string") {
        if (process.env[child] !== undefined) env[child] = process.env[child];
      } else named(child);
  };
  named(config);
  return { ...env, ...extra };
}

// One running plugin: JSON lines over stdio, one call at a time.
class PluginProcess {
  constructor(plugin, { timeoutMs, deadline, guard, checkListeners }) {
    this.plugin = plugin;
    this.timeoutMs = timeoutMs;
    this.deadline = deadline;
    this.checkListeners = checkListeners;
    this.next = 1;
    this.pending = new Map();
    this.broken = null;
    this.child = spawn(process.execPath, [CHILD], {
      cwd: plugin.location,
      stdio: ["pipe", "pipe", "ignore"],
      env: childEnvironment(
        plugin.entry.config,
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
      this.fail(`could not start: ${error.message}`),
    );
    let buffer = "";
    this.child.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) return this.stop("sent a reply over 1 MB.");
      let at;
      while ((at = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        this.receive(line);
      }
    });
  }
  receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return this.stop("wrote something that is not a contract message.");
    }
    if (message?.violation) {
      this.violation = `opened a network listener (${message.violation}); plugins may not listen.`;
      return this.stop(this.violation);
    }
    const waiting = this.pending.get(message?.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (typeof message.error === "string")
      waiting.reject(Error(`failed: ${message.error.slice(0, 500)}`));
    else waiting.resolve(message.result);
  }
  fail(reason) {
    this.broken ||= reason;
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(Error(this.broken));
    }
    this.pending.clear();
  }
  stop(reason) {
    this.fail(reason);
    this.child.kill("SIGKILL");
  }
  async request(method, params) {
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
    let listening;
    try {
      listening = await this.checkListeners(this.child.pid);
    } catch (error) {
      this.stop(error.message);
      throw Error(this.broken);
    }
    if (listening.length) {
      this.stop(
        `opened a network listener (${listening.join(", ")}); plugins may not listen.`,
      );
      throw Error(this.broken);
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
} = {}) {
  const options = { workspaceRoot, settingsFile };
  return {
    options,
    inspect: () => inspectPlugins(options),
    open() {
      const deadline = Date.now() + budgetMs,
        running = new Map(),
        plugins = new Map(inspectPlugins(options).map((p) => [p.id, p]));
      const connect = async (id, kind) => {
        const plugin = plugins.get(id);
        if (!plugin) return { reason: `Plugin ${id} is not declared.` };
        if (plugin.state !== "approved") return { reason: plugin.reason };
        if (!plugin.kinds.includes(kind))
          return { reason: `Plugin ${id} does not declare the kind ${kind}.` };
        if (!running.has(id)) {
          const child = new PluginProcess(plugin, {
            timeoutMs,
            deadline,
            guard,
            checkListeners,
          });
          running.set(id, child);
          try {
            await child.request("hello", {
              entry: path.join(plugin.location, plugin.manifest.entry),
              config: plugin.entry.config ?? {},
              kind,
            });
          } catch (error) {
            return { reason: error.message };
          }
        }
        const child = running.get(id);
        if (child.broken) return { reason: child.broken };
        return {
          manifest: plugin.manifest,
          config: plugin.entry.config ?? {},
          call: (method, params) => child.request(method, params),
        };
      };
      return pluginSession(connect, {
        close: () =>
          Promise.all([...running.values()].map((child) => child.close())),
      });
    },
  };
}

// The approval a person gives in Settings (R34.4): the exact id, version and
// hash they were shown. Never called by the tick or example installation.
export function approvePlugin(
  options,
  { id, version, hash, commit },
  approvedBy = "",
) {
  const plugin = inspectPlugins(options).find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  if (!plugin.hash)
    fail(`Plugin ${id} cannot be approved: ${plugin.reason}`, 409);
  if (plugin.state === "unsupported") fail(plugin.reason, 409);
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
    version: plugin.version,
    hash: plugin.hash,
    ...(plugin.commit ? { commit: plugin.commit } : {}),
    provides: plugin.provides,
    kinds: plugin.kinds,
    location: plugin.location,
    approvedAt: new Date().toISOString(),
    ...(approvedBy ? { approvedBy } : {}),
  };
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id);
}

export function disablePlugin(options, { id, disabled = true }) {
  const settings = readPluginSettings(options.settingsFile);
  settings.disabled = settings.disabled.filter((item) => item !== id);
  if (disabled) settings.disabled.push(id);
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id) ?? null;
}

// The `.avoozl.json` text with its `plugins` list changed by `edit`.
function editRepositoryPlugins(workspaceRoot, edit) {
  const file = path.join(workspaceRoot, ".avoozl.json");
  let value = { version: 1 };
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      fail(`.avoozl.json is invalid: ${error.message}`, 409);
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
function checkAdd(options, { scope, entry, confirmPublic }, visibility) {
  validateEntry(entry);
  if (!["machine", "repository"].includes(scope))
    fail('Choose scope "machine" or "repository".');
  if (scope === "repository") {
    if (entry.path !== undefined && path.isAbsolute(entry.path))
      fail(
        "A plugin in .avoozl.json names its path relative to the repository.",
      );
    if (visibility !== "private" && !confirmPublic) {
      const error = Error(
        visibility === "public"
          ? "This repository is public. Its .avoozl.json would publish this plugin's id, package and config. Declare it on this machine instead, or confirm."
          : "Avoozl cannot tell whether this repository is private. Its .avoozl.json may publish this plugin's id, package and config. Declare it on this machine instead, or confirm.",
      );
      error.status = 409;
      error.code = "plugin-public-repository";
      throw error;
    }
  }
  if (declaredPlugins(options).some((p) => p.entry?.id === entry.id))
    fail(`Plugin ${entry.id} is already declared.`, 409);
}

export function addPlugin(
  options,
  { scope = "machine", entry, confirmPublic = false },
  { visibility = "unknown" } = {},
) {
  if (entry?.git !== undefined)
    fail("A git plugin is added with addGitPlugin, which fetches it.");
  checkAdd(options, { scope, entry, confirmPublic }, visibility);
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
async function pinGit(options, { entry, source }) {
  const root = gitRoot(options.settingsFile, entry.id),
    remote = gitRemote(entry.git, sourceBase(source, options));
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const commit = await resolveGitRef(remote, entry.ref, { scratch: root });
  const folder = await fetchGitCommit({
    remote,
    ref: entry.ref,
    commit,
    subdir: entry.subdir,
    root,
  });
  try {
    validateManifest(
      JSON.parse(fs.readFileSync(path.join(folder, PLUGIN_MANIFEST), "utf8")),
      entry,
    );
  } catch (error) {
    fail(`Commit ${commit.slice(0, 12)}: ${error.message}`, 409);
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
function pruneGit(settingsFile, id, keep = null) {
  const root = gitRoot(settingsFile, id);
  let names = [];
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
  options,
  { scope = "machine", entry, confirmPublic = false },
  { visibility = "unknown" } = {},
) {
  if (entry?.git === undefined) fail("A git plugin names git and ref.");
  checkAdd(options, { scope, entry, confirmPublic }, visibility);
  const source = scope === "repository" ? "repository" : "machine";
  const pin = await pinGit(options, { entry, source });
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
export async function updateGitPlugin(options, { id }) {
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
export function removePlugin(options, { id }) {
  const declared = declaredPlugins(options).filter((p) => p.entry?.id === id);
  if (!declared.length) fail(`Plugin ${id} is not declared.`, 404);
  const settings = readPluginSettings(options.settingsFile);
  settings.plugins = settings.plugins.filter((entry) => entry?.id !== id);
  delete settings.approvals[id];
  delete settings.pins[id];
  settings.disabled = settings.disabled.filter((item) => item !== id);
  writePluginSettings(options.settingsFile, settings);
  pruneGit(options.settingsFile, id);
  if (declared.some((p) => p.source === "repository"))
    editRepositoryPlugins(options.workspaceRoot, (list) =>
      list.filter((entry) => entry?.id !== id),
    );
  return { id, removed: true };
}

// `.avoozl.json` `packs`: which pack and version each imported setting
// came from (R55.6). An unreadable file reads as none.
export function repositoryPacks(workspaceRoot) {
  try {
    const packs = readRepositoryPolicy(workspaceRoot).packs;
    return record(packs) ? packs : {};
  } catch {
    return {};
  }
}

// A plugin's pack against this repository's `.avoozl.json` (R55.5). Reads
// only. It works before approval, so a person can look before trusting it.
function packPlugin(options, id) {
  if (typeof id !== "string" || !id) fail("Name the plugin by its id.");
  const plugin = inspectPlugins(options).find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  if (plugin.state === "invalid" || plugin.state === "missing")
    fail(`Plugin ${id} cannot be previewed: ${plugin.reason}`, 409);
  if (!plugin.provides?.includes("pack"))
    fail(`Plugin ${id} provides no pack.`, 409);
  return plugin;
}

function previewFor(options, plugin, repositories) {
  let current;
  try {
    current = readRepositoryPolicy(options.workspaceRoot);
  } catch (error) {
    fail(error.message, 409);
  }
  return packPreview({
    plugin,
    pack: plugin.pack,
    current: { version: 1, ...current },
    repositories,
    pluginIds: declaredPlugins(options)
      .map((p) => p.entry?.id)
      .filter(Boolean),
  });
}

export function previewPluginPack(options, { id, repositories } = {}) {
  const { next, ...preview } = previewFor(
    options,
    packPlugin(options, id),
    repositories,
  );
  return preview;
}

// Settings **Import** (R55.5-R55.7): only an approved plugin, only the exact
// preview the person saw, a who-counts change only when they accepted it,
// and a machine-only plugin's id written into `.avoozl.json` only when they
// confirmed. Never called by the tick or example installation.
export function importPluginPack(
  options,
  {
    id,
    repositories,
    previewHash,
    acceptLowered = false,
    confirmPublic = false,
  } = {},
  importedBy = "",
) {
  const plugin = packPlugin(options, id);
  if (plugin.state !== "approved")
    fail(
      `Approve plugin ${id} version ${plugin.version} before importing its pack.`,
      409,
    );
  const preview = previewFor(options, plugin, repositories);
  if (previewHash !== preview.previewHash)
    fail(
      `The pack or .avoozl.json changed since that preview. Preview ${id} again.`,
      409,
    );
  if (preview.warnings.length && !acceptLowered) {
    const error = Error(
      `${preview.warnings.join(" ")} Accept the change to import it.`,
    );
    error.status = 409;
    error.code = "pack-lowers-who-counts";
    throw error;
  }
  if (plugin.source === "machine" && !confirmPublic) {
    const error = Error(
      `Importing writes ${id}'s settings and its id into .avoozl.json, which anyone who can read the repository sees. Confirm to import.`,
    );
    error.status = 409;
    error.code = "plugin-public-repository";
    throw error;
  }
  const next = withProvenance(preview, {
    at: new Date().toISOString(),
    by: importedBy,
  });
  const file = path.join(options.workspaceRoot, ".avoozl.json"),
    temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(temporary, file);
  const { next: _, ...result } = preview;
  return { ...result, imported: next.packs[id] };
}
