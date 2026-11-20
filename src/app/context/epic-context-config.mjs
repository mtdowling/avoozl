// The machine `epicContext` block (epic-context EC2): extra reads and MCP
// servers for the owner's own repositories, written only in this machine's
// config.json by a person. A repository file, a layered workspace config
// and an agent can never set it (layered-config.mjs, landing-config.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "../store/store.mjs";
import {
  MAX,
  checkAbout,
  checkAlias,
  checkCommand,
  checkContentSets,
  checkEnvNames,
  checkFolders,
  checkRepos,
  onlyKeys,
  record,
} from "./context-shape.mjs";

export const EPIC_CONTEXT_KEYS = ["repos", "reads", "mcp", "contentSets"];
const SERVER_KEYS = ["about", "command", "env"];

// Throws a message naming the key that is wrong. Returns the checked block.
export function validateEpicContext(value, source = "epicContext") {
  onlyKeys(value, EPIC_CONTEXT_KEYS, source);
  if (value.repos === undefined) fail(`${source}.repos is required.`);
  const checked = { repos: checkRepos(value.repos, source) };
  if (value.reads !== undefined)
    checked.reads = checkFolders(value.reads, `${source}.reads`);
  if (value.contentSets !== undefined)
    checked.contentSets = checkContentSets(value.contentSets, source);
  if (value.mcp !== undefined) {
    if (!record(value.mcp) || Object.keys(value.mcp).length > MAX.mcp)
      fail(`${source}.mcp must map up to ${MAX.mcp} aliases to servers.`);
    checked.mcp = {};
    for (const [alias, server] of Object.entries(value.mcp)) {
      const where = `${source}.mcp.${alias}`;
      checkAlias(alias, `${source}.mcp`);
      onlyKeys(server, SERVER_KEYS, where);
      checkAbout(server.about, where);
      checked.mcp[alias] = {
        about: server.about,
        command: checkCommand(server.command, where),
        ...(server.env !== undefined
          ? { env: checkEnvNames(server.env, where) }
          : {}),
      };
    }
  }
  return checked;
}

// A save from Settings or `avoozl context set` names only folders that are
// there now; a folder that goes missing later is left out at session start.
export function checkReadsExist(value, home = os.homedir()) {
  (value?.reads ?? []).forEach((read, i) => {
    const folder = read.startsWith("~/")
      ? path.join(home, read.slice(2))
      : read;
    let found = false;
    try {
      found = fs.statSync(folder).isDirectory();
    } catch {
      // Not there.
    }
    if (!found)
      fail(`epicContext.reads.${i} ${read} is not a folder on this machine.`);
  });
}

export const machineConfigFile = (configDirectory) =>
  path.join(configDirectory, "config.json");

// This machine's block, or null. A file that cannot be read or checked
// gives null, so no context is given from it.
export function readEpicContext(configDirectory) {
  try {
    const file = JSON.parse(
      fs.readFileSync(machineConfigFile(configDirectory), "utf8"),
    );
    return file.epicContext === undefined
      ? null
      : validateEpicContext(file.epicContext, "epicContext");
  } catch {
    return null;
  }
}

// `avoozl context set`: replace the block (null removes it), keeping every
// other key of config.json.
export function writeEpicContext(configDirectory, value) {
  const checked = value === null ? null : validateEpicContext(value);
  const file = machineConfigFile(configDirectory);
  let current = { version: 1 };
  try {
    current = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      fail(`Could not read ${file}: ${error.message}`, 409);
  }
  const { epicContext: _old, ...rest } = current;
  const next = checked ? { ...rest, epicContext: checked } : rest;
  fs.mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
  return checked;
}
