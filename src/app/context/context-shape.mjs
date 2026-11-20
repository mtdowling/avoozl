// The pieces the machine `epicContext` block and a plugin's `context` part
// share (epic-context EC2.1, EC3.2): repositories, read folders, an MCP
// server's command and content rule set IDs. Each check names the key that
// fails, and none accepts a credential value.
import path from "node:path";
import { credentialValue } from "../plugins/plugins.mjs";
import { fail } from "../store/store.mjs";

export const ALIAS = /^[a-z][a-z0-9-]{0,39}$/;
const OWNER_NAME =
  /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?:[A-Za-z0-9._-]{1,100}|\*)$/;
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const MAX = Object.freeze({
  repos: 50,
  reads: 20,
  mcp: 10,
  skills: 20,
  sets: 20,
});

export const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Refuse a key that is not in `known`, naming it. A credential-like key is
// said to be one, as a plugin's config says.
export function onlyKeys(value, known, where) {
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!known.includes(key))
      fail(
        /token|secret|password|credential|api_?key/i.test(key)
          ? `${where}.${key} looks like a credential. Name an environment variable in env instead.`
          : `${where}.${key} is not a setting; use ${known.join(", ")}.`,
      );
}

export function checkRepos(value, where) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX.repos ||
    value.some(
      (name) =>
        typeof name !== "string" ||
        !(OWNER_NAME.test(name) || REPOSITORY_ID.test(name)),
    )
  )
    fail(
      `${where}.repos must list 1 to ${MAX.repos} repositories: owner/name, owner/*, or a registered repository ID.`,
    );
  return [...value];
}

// A folder: absolute, or under `~/`. `{ask:NAME}` placeholders are allowed
// only before they are filled (`filled: false`).
export function folderProblem(text, { filled = true } = {}) {
  if (typeof text !== "string" || !text || text.length > 1000)
    return "must be a folder path of 1 to 1000 characters";
  const ask = /\{ask:[A-Za-z][A-Za-z0-9]{0,39}\}/g;
  // A path that starts with a placeholder is absolute once it is filled; the
  // answer is checked when it is given.
  const open = !filled && /^\{ask:/.test(text);
  if (!filled) text = text.replace(ask, "x");
  if (/[\u0000-\u001f]/.test(text)) return "must hold no control characters";
  if (!open && !(text.startsWith("~/") || path.isAbsolute(text)))
    return "must be absolute or start with ~/";
  if (text.split(/[\\/]/).includes("..")) return "must not hold ..";
  return null;
}

export function checkFolders(value, where, { max = MAX.reads } = {}) {
  if (!Array.isArray(value) || value.length > max)
    fail(`${where} must list up to ${max} folders.`);
  value.forEach((entry, i) => {
    const problem = folderProblem(entry);
    if (problem) fail(`${where}.${i} ${problem}.`);
  });
  return [...value];
}

export function checkAbout(value, where) {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    fail(`${where}.about must be 1 to 200 characters.`);
}

// An argv list. A single shell string is refused.
export function checkCommand(value, where) {
  if (typeof value === "string")
    fail(
      `${where}.command must be an argument list, not a shell string. Write ["program", "arg"].`,
    );
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 50 ||
    value.some(
      (part) => typeof part !== "string" || !part || part.length > 1000,
    )
  )
    fail(`${where}.command must be 1 to 50 command arguments.`);
  for (const part of value)
    if (credentialValue(part))
      fail(
        `${where}.command holds what looks like a credential. Name an environment variable in env instead.`,
      );
  return [...value];
}

export function checkEnvNames(value, where) {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((name) => typeof name !== "string" || !ENV_NAME.test(name))
  )
    fail(`${where}.env must list environment variable names.`);
  return [...value];
}

export function checkAlias(alias, where) {
  if (!ALIAS.test(alias))
    fail(
      `${where} alias ${alias} is not a name. Use lowercase letters, digits and dashes, starting with a letter.`,
    );
}

export function checkContentSets(value, where) {
  if (
    !Array.isArray(value) ||
    value.length > MAX.sets ||
    value.some((id) => typeof id !== "string" || !SET_ID.test(id)) ||
    new Set(value).size !== value.length
  )
    fail(`${where}.contentSets must list up to ${MAX.sets} rule set IDs.`);
  return [...value];
}

// Whether a repository (its GitHub owner/name and its registered ID) is one
// of `repos`. A repository with no GitHub remote matches only by its ID.
export function repositoryMatches(repos, { github = null, id = null }) {
  const lower = (text) => String(text).toLowerCase();
  return repos.some((pattern) => {
    if (!pattern.includes("/")) return id !== null && pattern === id;
    if (!github) return false;
    const [owner, name] = pattern.split("/");
    const [haveOwner, haveName] = lower(github).split("/");
    return (
      lower(owner) === haveOwner && (name === "*" || lower(name) === haveName)
    );
  });
}
