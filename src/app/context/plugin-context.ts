// The `context` plugin part (epic-context EC3, EC4): skills, read folders,
// asks and MCP servers one plugin gives a worker on the owner's own work.
// It is data only. It counts only from a plugin this machine's plugins.json
// declares and approved here, with every ask answered and every MCP alias
// mapped; the approval binds the answers and the mappings too.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonical, fail } from "../store/store.ts";
import {
  checkConfig,
  inspectPlugins,
  readPluginSettings,
  writePluginSettings,
} from "../plugins/plugins.ts";
import {
  MAX,
  checkAbout,
  checkAlias,
  checkCommand,
  checkContentSets,
  checkRepos,
  folderProblem,
  onlyKeys,
  record,
} from "./context-shape.ts";

const CONTEXT_KEYS = ["repos", "skills", "reads", "ask", "mcp", "contentSets"];

export interface ContextServer {
  about: string;
  command: string[];
}
export interface Skill {
  name: string;
  description: string;
  folder: string;
  hash: string;
  files: { rel: string; hash: string }[];
}
interface ContextRead {
  id: string;
  about: string;
  path: string;
}
// A plugin's checked `context` part, with its files read.
export interface ContextPart {
  repos: string[];
  skills: Skill[];
  reads: ContextRead[];
  ask: Record<string, string>;
  servers: Record<string, ContextServer>;
  contentSets: string[];
}
// This machine's mapping of one alias.
type Mapping = { command?: string[]; env?: string[] };
// The part of plugins.json the context reads and writes.
interface PluginSettings {
  context?: Record<string, { answers?: Record<string, string> }>;
  mcp?: Record<string, Record<string, Mapping>>;
  [key: string]: unknown;
}
export interface ContextPlugin {
  id: string;
  context?: ContextPart | null;
  source?: string;
  state?: string;
  location?: string;
}
export interface PluginOptions {
  settingsFile: string;
  workspaceRoot?: string | null;
  [key: string]: unknown;
}
const SERVER_KEYS = ["about", "command"];
const READ_KEYS = ["id", "about", "path"];
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const ASK = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const PLACEHOLDER = /\{ask:([^{}]*)\}/g;
const MAX_SKILL = 64 * 1024;
const DEFAULT_SERVERS = "mcp/servers.json";

const insidePath = (folder: string, file: string) => {
  const full = path.resolve(folder, file),
    relative = path.relative(path.resolve(folder), full);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? full
    : null;
};

const sha256 = (buffer: string | Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

// The `name` and `description` of a SKILL.md's front matter.
function frontMatter(text: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fields: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return fields;
}

// Every regular file of a skill folder with its SHA-256, so a copy at session
// start can be checked against the approved files. A link is refused.
function skillFiles(folder: string, where = folder) {
  const found: Skill["files"] = [];
  const walk = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isSymbolicLink()) fail(`${where} holds a link, ${item.name}.`);
      if (item.isDirectory()) walk(full);
      else if (item.isFile()) {
        if (found.length >= 200) fail(`${where} holds more than 200 files.`);
        found.push({
          rel: path.relative(folder, full).split(path.sep).join("/"),
          hash: sha256(fs.readFileSync(full)),
        });
      }
    }
  };
  walk(folder);
  return found.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

// The skills folder: up to 20 folders, each with one SKILL.md whose front
// matter names the folder and describes it. Returns {name, description,
// folder, hash} for each; `hash` is the SHA-256 of its SKILL.md.
function readSkills(folder: string, skills: string, where: string): Skill[] {
  const root = insidePath(folder, skills);
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory())
    fail(`${where}.skills must name a folder inside the plugin.`);
  const found = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  if (found.length > MAX.skills)
    fail(`${where}.skills holds more than ${MAX.skills} skills.`);
  return found.map((entry) => {
    const file = path.join(root, entry.name, "SKILL.md");
    let buffer: Buffer;
    try {
      if (fs.lstatSync(file).isSymbolicLink()) throw Error("link");
      buffer = fs.readFileSync(file);
    } catch {
      fail(`${where}.skills/${entry.name} has no SKILL.md.`);
    }
    if (buffer.length > MAX_SKILL)
      fail(`${where}.skills/${entry.name}/SKILL.md is over 64 KB.`);
    const fields = frontMatter(buffer.toString("utf8"));
    if (fields.name !== entry.name)
      fail(
        `${where}.skills/${entry.name}/SKILL.md name must be ${entry.name}.`,
      );
    if (
      !fields.description ||
      fields.description.length > 300 ||
      !NAME.test(entry.name)
    )
      fail(
        `${where}.skills/${entry.name}/SKILL.md needs a description of 1 to 300 characters and a folder named in lowercase letters, digits and dashes.`,
      );
    return {
      name: entry.name,
      description: fields.description,
      folder: path.join(root, entry.name),
      hash: sha256(buffer),
      files: skillFiles(
        path.join(root, entry.name),
        `${where}.skills/${entry.name}`,
      ),
    };
  });
}

// The program of a command: a name looked up on PATH, or a path inside the
// plugin. Any other first item is refused.
function checkProgram(command: string[], folder: string, where: string) {
  const program = command[0];
  if (!/[\\/]/.test(program) && !path.isAbsolute(program)) return;
  if (!insidePath(folder, program))
    fail(
      `${where}.command[0] must be a program name or a path inside the plugin.`,
    );
}

function readServers(folder: string, file: string, where: string) {
  const full = insidePath(folder, file);
  if (!full || !/\.json$/.test(file))
    fail(`${where}.mcp must be a .json file inside the plugin.`);
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    fail(`${where}.mcp ${file} cannot be read: ${(error as Error).message}`);
  }
  if (!record(value) || Object.keys(value).length > MAX.mcp)
    fail(`${file} must map up to ${MAX.mcp} aliases to servers.`);
  const servers: Record<string, ContextServer> = {};
  for (const [alias, server] of Object.entries(value)) {
    const at = `${file} ${alias}`;
    checkAlias(alias, file);
    if (record(server) && Object.hasOwn(server, "env"))
      fail(
        `${at}.env is not allowed: a server's environment is this machine's mapping.`,
      );
    onlyKeys(server, SERVER_KEYS, at);
    checkAbout(server.about, at);
    checkConfig(server, at);
    servers[alias] = {
      about: server.about,
      command: checkCommand(server.command, at),
    };
    checkProgram(servers[alias].command, folder, at);
  }
  return servers;
}

// The checked `context` of a manifest that provides it, with its files read:
// {repos, skills, reads, ask, servers, contentSets}. Throws a message naming
// the key that is wrong.
export function readContextPart(
  manifest: { provides?: unknown; context?: unknown },
  folder: string,
): ContextPart | null {
  const where = "avoozl-plugin.json context",
    provides = Array.isArray(manifest.provides) ? manifest.provides : [];
  if (!provides.includes("context")) {
    if (manifest.context !== undefined)
      fail(`${where} goes with provides context.`);
    return null;
  }
  onlyKeys(manifest.context, CONTEXT_KEYS, where);
  const part = manifest.context,
    checked: ContextPart = {
      repos: checkRepos(part.repos, where),
      skills: [],
      reads: [],
      ask: {},
      servers: {},
      contentSets:
        part.contentSets === undefined
          ? []
          : checkContentSets(part.contentSets, where),
    };
  if (part.ask !== undefined) {
    if (!record(part.ask) || Object.keys(part.ask).length > 20)
      fail(`${where}.ask must map up to 20 names to questions.`);
    for (const [name, question] of Object.entries(part.ask)) {
      if (!ASK.test(name))
        fail(`${where}.ask.${name} is not a name of letters and digits.`);
      if (typeof question !== "string" || !question || question.length > 200)
        fail(`${where}.ask.${name} must be a question of 1 to 200 characters.`);
      checked.ask[name] = question;
    }
  }
  if (part.reads !== undefined) {
    if (!Array.isArray(part.reads) || part.reads.length > MAX.reads)
      fail(`${where}.reads must list up to ${MAX.reads} reads.`);
    const ids = new Set<string>();
    part.reads.forEach((read: unknown, i: number) => {
      const at = `${where}.reads.${i}`;
      onlyKeys(read, READ_KEYS, at);
      if (
        typeof read.id !== "string" ||
        !NAME.test(read.id) ||
        ids.has(read.id)
      )
        fail(`${at}.id must be a name, once.`);
      ids.add(read.id);
      checkAbout(read.about, at);
      const problem = folderProblem(read.path, { filled: false });
      if (problem) fail(`${at}.path ${problem}.`);
      checked.reads.push({
        id: read.id,
        about: read.about,
        path: read.path as string,
      });
    });
  }
  const used = new Set<string>();
  for (const read of checked.reads)
    for (const [, name = ""] of read.path.matchAll(PLACEHOLDER)) {
      if (!Object.hasOwn(checked.ask, name))
        fail(
          `${where}.reads ${read.id} uses {ask:${name}}, which ask does not list.`,
        );
      used.add(name);
    }
  for (const name of Object.keys(checked.ask))
    if (!used.has(name)) fail(`${where}.ask.${name} is not used by any read.`);
  if (part.skills !== undefined) {
    if (typeof part.skills !== "string")
      fail(`${where}.skills must name a folder inside the plugin.`);
    checked.skills = readSkills(folder, part.skills, where);
  }
  const serversFile =
    part.mcp ??
    (fs.existsSync(path.join(folder, DEFAULT_SERVERS))
      ? DEFAULT_SERVERS
      : null);
  if (serversFile !== null) {
    if (typeof serversFile !== "string")
      fail(`${where}.mcp must be a .json file inside the plugin.`);
    checked.servers = readServers(folder, serversFile, where);
  }
  return checked;
}

// `{ask:NAME}` filled with the answers; a name with no answer stays.
const fillAsk = (
  text: string,
  answers: Record<string, string> | null | undefined,
) =>
  text.replace(PLACEHOLDER, (whole, name: string) => answers?.[name] ?? whole);

// The questions a context part still needs answered, and the aliases it
// still needs this machine to map.
export function missingFor(
  context: ContextPart,
  settings: PluginSettings,
  id: string,
) {
  const answers = settings.context?.[id]?.answers ?? {},
    mapped = settings.mcp?.[id] ?? {};
  return {
    questions: Object.entries(context.ask).filter(
      ([name]) => typeof answers[name] !== "string" || !answers[name].trim(),
    ),
    aliases: Object.keys(context.servers).filter(
      (alias) => !Object.hasOwn(mapped, alias),
    ),
  };
}

// What an approval of a context plugin binds beyond its content hash: the
// answers and the mappings (EC4.4).
export const contextHash = (settings: PluginSettings, id: string) =>
  sha256(
    canonical({
      answers: settings.context?.[id]?.answers ?? {},
      servers: settings.mcp?.[id] ?? {},
    }),
  );

// A mapping's command replaces the plugin's. The server's `env` names are
// this machine's alone.
const serverFor = (
  server: ContextServer,
  mapping: Mapping | null | undefined,
) => ({
  about: server.about,
  command: mapping?.command ?? server.command,
  env: mapping?.env ?? [],
  replaced: Boolean(mapping?.command),
});

// What Settings and the approval view list for a plugin's context part.
export function contextView(plugin: ContextPlugin, settings: PluginSettings) {
  const context = plugin.context;
  if (!context) return null;
  const answers = settings.context?.[plugin.id]?.answers ?? {},
    mapped = settings.mcp?.[plugin.id] ?? {},
    missing = missingFor(context, settings, plugin.id);
  return {
    repos: context.repos,
    skills: context.skills.map(({ name, description, hash }) => ({
      name,
      description,
      hash,
    })),
    reads: context.reads.map((read) => ({
      id: read.id,
      about: read.about,
      written: read.path,
      filled: fillAsk(read.path, answers),
    })),
    ask: Object.entries(context.ask).map(([name, question]) => ({
      name,
      question,
      answer: answers[name] ?? null,
    })),
    servers: Object.entries(context.servers).map(([alias, server]) => ({
      alias,
      ...serverFor(server, mapped[alias]),
      mapped: Object.hasOwn(mapped, alias),
    })),
    contentSets: context.contentSets,
    ignored:
      plugin.source === "repository"
        ? "context ignored: declared in .avoozl.json"
        : null,
    state:
      plugin.source === "repository"
        ? "ignored"
        : plugin.state !== "approved"
          ? plugin.state
          : missing.questions.length
            ? "needs answers"
            : missing.aliases.length
              ? "needs mapping"
              : "approved",
    missing: {
      questions: missing.questions.map(([name]) => name),
      aliases: missing.aliases,
    },
  };
}

// Every context source of approved machine plugins that gives context:
// {id, name, repos, reads, skills, servers, contentSets}. A plugin declared
// in `.avoozl.json`, one not approved, one with an unanswered ask or an
// unmapped alias gives nothing.
export function contextSources(options: PluginOptions) {
  const settings: PluginSettings = readPluginSettings(options.settingsFile),
    sources = [];
  for (const plugin of inspectPlugins(options) as ContextPlugin[]) {
    const context = plugin.context;
    if (!context || plugin.source !== "machine") continue;
    if (plugin.state !== "approved") continue;
    const missing = missingFor(context, settings, plugin.id);
    if (missing.questions.length || missing.aliases.length) continue;
    const answers = settings.context?.[plugin.id]?.answers ?? {},
      mapped = settings.mcp?.[plugin.id] ?? {};
    sources.push({
      kind: "plugin",
      id: plugin.id,
      name: plugin.id,
      folder: plugin.location,
      repos: context.repos,
      reads: context.reads.map((read) => ({
        id: read.id,
        about: read.about,
        path: fillAsk(read.path, answers),
      })),
      skills: context.skills,
      servers: Object.fromEntries(
        Object.entries(context.servers).map(([alias, server]) => [
          alias,
          serverFor(server, mapped[alias]),
        ]),
      ),
      contentSets: context.contentSets,
    });
  }
  return sources;
}

// `avoozl plugins answer ID NAME VALUE`: one ask answered on this machine.
// A changed answer leaves the plugin's approval stale until it is approved
// again.
export function setAnswer(
  options: PluginOptions,
  { id, name, value }: { id: string; name: string; value: unknown },
) {
  const plugin = (inspectPlugins(options) as ContextPlugin[]).find(
    (p) => p.id === id,
  );
  if (!plugin) return fail(`Plugin ${id} is not declared.`, 404);
  const context = plugin.context;
  if (!context || plugin.source !== "machine")
    return fail(
      `Plugin ${id} has no context part declared on this machine.`,
      404,
    );
  if (!Object.hasOwn(context.ask, name))
    fail(`Plugin ${id} asks no question ${name}.`, 404);
  if (typeof value !== "string" || !value.trim() || value.length > 1000)
    fail(`The answer must be 1 to 1000 characters.`);
  checkConfig(value, `answer ${name}`);
  const settings: PluginSettings = readPluginSettings(options.settingsFile),
    next = { ...settings.context?.[id]?.answers, [name]: value.trim() };
  const problem = folderProblem(
    fillAsk(
      context.reads.find((read) => read.path.includes(`{ask:${name}}`))?.path ??
        "~/x",
      { [name]: next[name] },
    ),
  );
  if (problem) fail(`The answer for ${name} ${problem}.`);
  settings.context = {
    ...settings.context,
    [id]: { ...settings.context?.[id], answers: next },
  };
  writePluginSettings(options.settingsFile, settings);
  return inspectPlugins(options).find((p) => p.id === id);
}
