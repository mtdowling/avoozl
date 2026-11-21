// @ts-nocheck: typing debt
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
const SERVER_KEYS = ["about", "command"];
const READ_KEYS = ["id", "about", "path"];
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const ASK = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const PLACEHOLDER = /\{ask:([^{}]*)\}/g;
const MAX_SKILL = 64 * 1024;
export const DEFAULT_SERVERS = "mcp/servers.json";

const insidePath = (folder, file) => {
  const full = path.resolve(folder, file),
    relative = path.relative(path.resolve(folder), full);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? full
    : null;
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// The `name` and `description` of a SKILL.md's front matter.
function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fields = {};
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return fields;
}

// Every regular file of a skill folder with its SHA-256, so a copy at session
// start can be checked against the approved files. A link is refused.
export function skillFiles(folder, where = folder) {
  const found = [];
  const walk = (directory) => {
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
function readSkills(folder, skills, where) {
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
    let buffer;
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
function checkProgram(command, folder, where) {
  const program = command[0];
  if (!/[\\/]/.test(program) && !path.isAbsolute(program)) return;
  if (!insidePath(folder, program))
    fail(
      `${where}.command[0] must be a program name or a path inside the plugin.`,
    );
}

function readServers(folder, file, where) {
  const full = insidePath(folder, file);
  if (!full || !/\.json$/.test(file))
    fail(`${where}.mcp must be a .json file inside the plugin.`);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    fail(`${where}.mcp ${file} cannot be read: ${error.message}`);
  }
  if (!record(value) || Object.keys(value).length > MAX.mcp)
    fail(`${file} must map up to ${MAX.mcp} aliases to servers.`);
  const servers = {};
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
export function readContextPart(manifest, folder) {
  const where = "avoozl-plugin.json context",
    provides = Array.isArray(manifest.provides) ? manifest.provides : [];
  if (!provides.includes("context")) {
    if (manifest.context !== undefined)
      fail(`${where} goes with provides context.`);
    return null;
  }
  onlyKeys(manifest.context, CONTEXT_KEYS, where);
  const part = manifest.context,
    checked = {
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
    const ids = new Set();
    part.reads.forEach((read, i) => {
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
      checked.reads.push({ id: read.id, about: read.about, path: read.path });
    });
  }
  const used = new Set();
  for (const read of checked.reads)
    for (const [, name] of read.path.matchAll(PLACEHOLDER)) {
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
export const fillAsk = (text, answers) =>
  text.replace(PLACEHOLDER, (whole, name) => answers?.[name] ?? whole);

// The questions a context part still needs answered, and the aliases it
// still needs this machine to map.
export function missingFor(context, settings, id) {
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
export const contextHash = (settings, id) =>
  sha256(
    canonical({
      answers: settings.context?.[id]?.answers ?? {},
      servers: settings.mcp?.[id] ?? {},
    }),
  );

// A mapping's command replaces the plugin's. The server's `env` names are
// this machine's alone.
export const serverFor = (server, mapping) => ({
  about: server.about,
  command: mapping?.command ?? server.command,
  env: mapping?.env ?? [],
  replaced: Boolean(mapping?.command),
});

// What Settings and the approval view list for a plugin's context part.
export function contextView(plugin, settings) {
  if (!plugin.context) return null;
  const answers = settings.context?.[plugin.id]?.answers ?? {},
    mapped = settings.mcp?.[plugin.id] ?? {},
    missing = missingFor(plugin.context, settings, plugin.id);
  return {
    repos: plugin.context.repos,
    skills: plugin.context.skills.map(({ name, description, hash }) => ({
      name,
      description,
      hash,
    })),
    reads: plugin.context.reads.map((read) => ({
      id: read.id,
      about: read.about,
      written: read.path,
      filled: fillAsk(read.path, answers),
    })),
    ask: Object.entries(plugin.context.ask).map(([name, question]) => ({
      name,
      question,
      answer: answers[name] ?? null,
    })),
    servers: Object.entries(plugin.context.servers).map(([alias, server]) => ({
      alias,
      ...serverFor(server, mapped[alias]),
      mapped: Object.hasOwn(mapped, alias),
    })),
    contentSets: plugin.context.contentSets,
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
export function contextSources(options) {
  const settings = readPluginSettings(options.settingsFile),
    sources = [];
  for (const plugin of inspectPlugins(options)) {
    if (!plugin.context || plugin.source !== "machine") continue;
    if (plugin.state !== "approved") continue;
    const missing = missingFor(plugin.context, settings, plugin.id);
    if (missing.questions.length || missing.aliases.length) continue;
    const answers = settings.context?.[plugin.id]?.answers ?? {},
      mapped = settings.mcp?.[plugin.id] ?? {};
    sources.push({
      kind: "plugin",
      id: plugin.id,
      name: plugin.id,
      folder: plugin.location,
      repos: plugin.context.repos,
      reads: plugin.context.reads.map((read) => ({
        id: read.id,
        about: read.about,
        path: fillAsk(read.path, answers),
      })),
      skills: plugin.context.skills,
      servers: Object.fromEntries(
        Object.entries(plugin.context.servers).map(([alias, server]) => [
          alias,
          serverFor(server, mapped[alias]),
        ]),
      ),
      contentSets: plugin.context.contentSets,
    });
  }
  return sources;
}

// `avoozl plugins answer ID NAME VALUE`: one ask answered on this machine.
// A changed answer leaves the plugin's approval stale until it is approved
// again.
export function setAnswer(options, { id, name, value }) {
  const plugin = inspectPlugins(options).find((p) => p.id === id);
  if (!plugin) fail(`Plugin ${id} is not declared.`, 404);
  if (!plugin.context || plugin.source !== "machine")
    fail(`Plugin ${id} has no context part declared on this machine.`, 404);
  if (!Object.hasOwn(plugin.context.ask, name))
    fail(`Plugin ${id} asks no question ${name}.`, 404);
  if (typeof value !== "string" || !value.trim() || value.length > 1000)
    fail(`The answer must be 1 to 1000 characters.`);
  checkConfig(value, `answer ${name}`);
  const settings = readPluginSettings(options.settingsFile),
    next = { ...settings.context?.[id]?.answers, [name]: value.trim() };
  const problem = folderProblem(
    fillAsk(
      plugin.context.reads.find((read) => read.path.includes(`{ask:${name}}`))
        ?.path ?? "~/x",
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
