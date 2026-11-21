#!/usr/bin/env node
import { findCommand } from "./cli-commands.ts";
import { PROGRAM, helpCommands, helpPointer, helpText } from "./cli-help.ts";
import {
  readWorkspaceConfig,
  type WorkspaceConfig,
  workspaceConfig,
} from "../settings/config.ts";
import { loadHostConfig, machineAvoozlPaths } from "../settings/host-config.ts";
import {
  agentSession,
  agentSessionNote,
  cliRefusal,
} from "../mcp/mcp-policy.ts";
import { Operations } from "../api/operations.ts";
import { Store } from "../store/store.ts";
import { initializeFirst } from "../workspace/workspace.ts";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2),
  options: Record<string, string | true | undefined> = {},
  positionals: string[] = [];
let command = "help",
  hasCommand = false;
try {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h") options.help = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (
        [
          "start",
          "dry-run",
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
          "claim",
          "writes",
          "retire",
          "delete-spec-folder",
          "write",
          "remove",
          "help",
        ].includes(key)
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
      command = arg;
      hasCommand = true;
    } else positionals.push(arg);
  }
  // `avoozl COMMAND --help` and `avoozl --help` are `avoozl help [COMMAND]`.
  if (options.help && command !== "help") {
    positionals.unshift(...(hasCommand ? [command] : []));
    command = "help";
  }
  // `--env NAME` is a plugins map flag, never an environment.
  const env = process.env;
  // The CLI acts on the workspace database itself, and so does each agent's
  // `avoozl mcp` (machine-server MS10.4); no command reaches a server.
  if (options.url !== undefined || process.env.AVOOZL_URL !== undefined)
    throw Error(
      `Avoozl takes no ${options.url !== undefined ? "--url" : "AVOOZL_URL"}: the CLI works on the workspace database directly, and agents use avoozl mcp.`,
    );
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
  // Help, the app backend and the MCP server start on a workspace whose
  // configuration does not load, and refuse its work with that message
  // (readWorkspaceConfig); every other command refuses it at once.
  const entry = command === "help" ? null : findCommand(command, positionals);
  // A configuration that did not load has only its root and configError.
  const config: Partial<WorkspaceConfig> & {
      workspaceRoot: string;
      configError?: string;
    } = (
      !entry || entry.startsWithBadConfig
        ? readWorkspaceConfig
        : workspaceConfig
    )(configOptions),
    { dbPath, endpoint } = config;
  const requireDatabase = () => {
    if (config.configError) throw Error(config.configError);
    if (!dbPath || !fs.existsSync(dbPath))
      throw Error(initializeFirst(config.workspaceRoot));
    return dbPath;
  };
  const requireLocalMaintenancePath = (action: string) => {
    if (!registeredWorkspaceId) return;
    throw Error(
      `${action} is a local-only maintenance operation and cannot use registered workspace ID ${registeredWorkspaceId}. Pass the workspace root path explicitly.`,
    );
  };
  const text = (value: string | true | undefined) =>
    typeof value === "string" ? value : undefined;
  const input = () => {
    const file = text(options.input),
      json = text(options.json);
    return file
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : json
        ? JSON.parse(json)
        : {};
  };
  const localOperations = (store: Store) =>
    new Operations(store, {
      operator: config.operator,
      workspaceRoot: config.workspaceRoot,
      plansRoot: config.plansRoot,
      configDirectory: machineAvoozlPaths().configDirectory,
    });
  // Without a server, every CLI write goes through Operations in process.
  // `local` marks the caller as the person at this machine's command line.
  const localOrRequest = async <T = unknown>(
    operation: string,
    input: Record<string, unknown> = {},
    expectedRevision?: number,
  ): Promise<T> => {
    // Person-only operations are refused only in a supervisor child (R95.5).
    const refusal = cliRefusal(operation, input, { env: process.env });
    if (refusal) throw Error(refusal);
    // From an agent session they run and say so; an approval records it.
    const note = agentSessionNote(operation, input, process.env);
    if (note) {
      console.error(note);
      if (operation === "plan.approve" && input.evidence === undefined)
        input = { ...input, evidence: note };
    }
    const store = new Store(requireDatabase());
    try {
      return await localOperations(store).execute<T>(
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
      text(options["state-directory"]) ?? machineAvoozlPaths().stateDirectory,
    );
  const need = (value: string | true | undefined, usage: string): string => {
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
    await entry!.run({
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
      localOperations,
      localOrRequest,
      machineStateDirectory,
      need,
      helpPointer,
    });
  }
} catch (thrown) {
  const error = thrown as Error;
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
