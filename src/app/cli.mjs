#!/usr/bin/env node
import { findCommand } from "./cli-commands.mjs";
import { PROGRAM, helpCommands, helpPointer, helpText } from "./cli-help.mjs";
import { workspaceConfig } from "./config.mjs";
import { driverSettingsPath } from "./driver.mjs";
import { loadHostConfig, machineAvoozlPaths } from "./host-config.mjs";
import { agentSession, agentSessionNote, cliRefusal } from "./mcp-policy.mjs";
import { Operations } from "./operations.mjs";
import { Store } from "./store.mjs";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2),
  options = {},
  positionals = [];
let command = "help",
  hasCommand = false;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-h") options.help = true;
    else if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (
        [
          "start",
          "dry-run",
          "final",
          "auto-start",
          "inactive",
          "skip-verify",
          "allow-remote",
          "kirocrew",
          "hook",
          "confirm",
          "no-epic",
          "push",
          "accept-lowered",
          "full",
          "confirm-public",
          "untriaged",
          "force",
          "unfinished",
          "cancel",
          "yes",
          "skipped",
          "refused",
          "off",
          "release",
          "discard",
          "writes",
          "retire",
          "delete-spec-folder",
          "write",
          "help",
        ].includes(key) &&
        // `driver takeover --force --confirm SPEC` names the spec (R66.15).
        !(key === "confirm" && command === "driver")
      )
        options[key] = true;
      else if (
        key === "json" &&
        ["runner", "review", "plan"].includes(args[0]) &&
        (args[i + 1] === undefined || args[i + 1].startsWith("--"))
      )
        options.json = true;
      // `plugins add --repository` is a bare flag; elsewhere it takes a value.
      else if (
        key === "repository" &&
        (args[i + 1] === undefined || args[i + 1].startsWith("--"))
      )
        options[key] = true;
      else {
        if (args[i + 1] === undefined || args[i + 1].startsWith("--"))
          throw Error("Missing value for --" + key);
        options[key] = args[++i];
      }
    } else if (!hasCommand) {
      command = args[i];
      hasCommand = true;
    } else positionals.push(args[i]);
  }
  // `avoozl COMMAND --help` and `avoozl --help` are `avoozl help [COMMAND]`.
  if (options.help && command !== "help") {
    positionals.unshift(...(hasCommand ? [command] : []));
    command = "help";
  }
  const env = options.env || process.env;
  const requestedWorkspace = options.workspace || env.AVOOZL_WORKSPACE;
  // Where the workspace was named, for `status` to say so.
  const requestedFrom = options.workspace
    ? "--workspace"
    : env.AVOOZL_WORKSPACE
      ? "AVOOZL_WORKSPACE"
      : undefined;
  let registeredWorkspaceId = null,
    configOptions = options;
  if (
    typeof requestedWorkspace === "string" &&
    /^[a-z][a-z0-9-]{0,60}$/.test(requestedWorkspace)
  ) {
    const registered = loadHostConfig({ env }).config.workspaces[
      requestedWorkspace
    ];
    if (registered) {
      registeredWorkspaceId = requestedWorkspace;
      configOptions = { ...options, workspace: registered.root };
    }
  }
  const config = workspaceConfig(configOptions),
    { dbPath, endpoint } = config;
  const requireDatabase = () => {
    if (!fs.existsSync(dbPath))
      throw Error(
        "Initialize a workspace first: avoozl init PATH, then use --workspace PATH.",
      );
  };
  const requireLocalMaintenancePath = (action) => {
    if (!registeredWorkspaceId) return;
    throw Error(
      `${action} is a local-only maintenance operation and cannot use registered workspace ID ${registeredWorkspaceId}. Pass the workspace root path explicitly.`,
    );
  };
  const request = async (operation, input = {}, expectedRevision) => {
    let response;
    try {
      response = await fetch(endpoint + "/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, input, expectedRevision }),
      });
    } catch {
      throw Error(
        `No Avoozl server answered at ${endpoint}. Drop --url and AVOOZL_URL to act on the workspace database directly.`,
      );
    }
    // `avoozl serve` answers /api/command only to a signed-in browser's
    // session cookie, so a CLI pointed at it is refused (spec standalone-web SW5.4).
    if (response.status === 401)
      throw Error(
        `${endpoint} refused the request: avoozl serve accepts /api/command only with a valid browser session cookie, never from the CLI. Drop --url and AVOOZL_URL: the CLI works on the workspace database directly.`,
      );
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    return result.result;
  };
  const input = () =>
    options.input
      ? JSON.parse(fs.readFileSync(options.input, "utf8"))
      : options.json
        ? JSON.parse(options.json)
        : {};
  // A server is used only when one is named. Otherwise commands and the
  // stdio MCP server act in process on the workspace database, a registered
  // workspace ID naming its root.
  const useServer = () => Boolean(options.url || process.env.AVOOZL_URL);
  const localOperations = (store) =>
    new Operations(store, {
      operator: config.operator,
      workspaceRoot: config.workspaceRoot,
      plansRoot: config.plansRoot,
      configDirectory: machineAvoozlPaths().configDirectory,
      driver: { settingsFile: driverSettingsPath() },
    });
  // Without a server, every CLI write goes through Operations in process.
  // `local` marks the caller as the person at this machine's command line.
  const localOrRequest = async (operation, input = {}, expectedRevision) => {
    // Person-only operations are refused only in a supervisor child (R95.5).
    const refusal = cliRefusal(operation, input, { env: process.env });
    if (refusal) throw Error(refusal);
    // From an agent session they run and say so; an approval records it.
    const note = agentSessionNote(operation, input, process.env);
    if (note) {
      console.error(note);
      if (
        ["plan.approve", "plan.approveMany"].includes(operation) &&
        input.evidence === undefined &&
        // A delegated approval already records who approved, and for whom.
        input.delegate === undefined
      )
        input = { ...input, evidence: note };
    }
    if (useServer()) return request(operation, input, expectedRevision);
    requireDatabase();
    const store = new Store(dbPath);
    try {
      return await localOperations(store).execute(
        operation,
        input,
        expectedRevision,
        // A command a person types; never one an agent or a supervisor
        // child runs.
        {
          local: true,
          person: !process.env.AVOOZL_CHILD && !agentSession(process.env),
        },
      );
    } finally {
      store.close();
    }
  };
  // A required positional or option, refused with its usage when missing.
  const machineStateDirectory = () =>
    path.resolve(
      options["state-directory"] ?? machineAvoozlPaths().stateDirectory,
    );
  const need = (value, usage) => {
    if (value === undefined || value === true || value === "")
      throw Error("Usage: avoozl " + usage);
    return value;
  };
  if (command === "help") {
    // `avoozl help`, `avoozl help GROUP`, `avoozl help COMMAND` and
    // `avoozl help all`, all rendered from the one table in cli-help.mjs.
    // `avoozl OPERATION --help` has no page of its own and gets the overview.
    const text = helpText(positionals[0]) ?? (options.help ? helpText() : null);
    if (text === null)
      throw Error(
        `There is no help for ${positionals[0]}. ${PROGRAM} help lists every command by job.`,
      );
    console.log(text);
  } else {
    const entry = findCommand(command, positionals);
    await entry.run({
      options,
      positionals,
      command,
      env,
      requestedWorkspace,
      requestedFrom,
      config,
      dbPath,
      endpoint,
      requireDatabase,
      requireLocalMaintenancePath,
      input,
      useServer,
      localOperations,
      localOrRequest,
      machineStateDirectory,
      need,
      helpPointer,
    });
  }
} catch (error) {
  console.error(error.message);
  // A refusal over how a command was written names that command's help.
  if (
    (error.message.startsWith(`Choose ${command} `) ||
      /^(Usage: |Missing value for --)/.test(error.message)) &&
    helpCommands().includes(command)
  )
    console.error(helpPointer(command));
  process.exitCode = 1;
}
