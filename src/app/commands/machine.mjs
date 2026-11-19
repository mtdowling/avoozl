// CLI commands of one kind: command, help lines and run.
import { startAppBackend } from "../app-backend.mjs";
import { createAppMcp } from "../app-mcp.mjs";
import { machineAvoozlPaths } from "../host-config.mjs";
import { machineStatus, serveStatus } from "../machine-status.mjs";
import { handleMcp } from "../mcp.mjs";
import { HOLDS_TASKS, readRunnerConfig } from "../remote-runner.mjs";
import { reportByToken } from "../report-match.mjs";
import { LinkStore } from "../serve-auth.mjs";
import { startServe } from "../serve-server.mjs";
import { Store } from "../store.mjs";
import {
  supervisorUnit,
  unitKindFor,
  writeSupervisorUnit,
} from "../supervisor-unit.mjs";
import { runSupervisor } from "../supervisor.mjs";
import { standaloneUiDirectory } from "../ui-bundle.mjs";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { help } from "../command-help.mjs";

const send = (body) => process.stdout.write(JSON.stringify(body) + "\n");

// One JSON-RPC message per line on stdin: `answer` returns the reply, or null
// for none. A line that does not parse, or an answer that throws, gets an
// error reply.
async function eachMessage(answer) {
  const lines = readline.createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      continue;
    }
    let reply;
    try {
      reply = await answer(message);
    } catch (error) {
      reply = {
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: { code: -32603, message: error.message },
      };
    }
    if (reply !== null) send(reply);
  }
}

export const commands = [
  {
    command: "mcp",
    help: [
      help(
        "machine",
        "mcp --workspace PATH",
        "Stdio MCP server for the workspace database",
        { usage: "mcp --workspace PATH", about: "Stdio MCP server for agents" },
      ),
      help("machine", "mcp --url URL", "Stdio bridge to a running server"),
      help(
        "machine",
        "mcp --kirocrew",
        "Kiro Crew app server: workspace per caller",
      ),
    ],
    async run({
      options,
      env,
      requestedWorkspace,
      config,
      dbPath,
      endpoint,
      requireDatabase,
      useServer,
      localOperations,
    }) {
      if (options.kirocrew) {
        // The Kiro Crew app's stdio MCP server. Kiro Crew may share this process
        // between sessions, so each request picks its own workspace (app-mcp.mjs);
        // the working directory is never used.
        const server = createAppMcp({
          fallback: requestedWorkspace ? config : null,
          env,
        });
        try {
          await eachMessage((message) => server.handle(message));
        } finally {
          server.close();
        }
      } else if (!useServer()) {
        // A stdio MCP server for one workspace: the same plans_* tools, served in
        // process from the workspace database with no web server running.
        requireDatabase();
        const store = new Store(dbPath),
          ops = localOperations(store);
        try {
          // No gateway fronts this server, so a caller block here could come
          // from any client and is not read; `--kirocrew` is the attested form.
          await eachMessage(
            async (message) =>
              (await handleMcp(message, ops, { base: endpoint })).body,
          );
        } finally {
          store.close();
        }
      } else {
        const mcpEndpoint = endpoint + "/mcp";
        const lines = readline.createInterface({ input: process.stdin });
        for await (const line of lines) {
          let message;
          try {
            message = JSON.parse(line);
            const response = await fetch(mcpEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(message),
            });
            const text = await response.text();
            if (text) process.stdout.write(text + "\n");
          } catch (error) {
            process.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message?.id ?? null,
                error: { code: -32603, message: error.message },
              }) + "\n",
            );
          }
        }
      }
    },
  },
  {
    command: "app-backend",
    help: [
      help(
        "machine",
        "app-backend --workspace PATH",
        "Kiro Crew app backend on 127.0.0.1 ($PORT)",
      ),
    ],
    run({ options, config }) {
      const server = startAppBackend({
        config,
        port: Number(options.port ?? process.env.PORT ?? 0),
        uiDir: options["ui-dir"] ?? null,
      });
      server.once("listening", () =>
        console.log(
          `Avoozl app backend listening on 127.0.0.1:${server.address().port}`,
        ),
      );
      server.once("error", (error) => {
        console.error(`The app backend cannot listen: ${error.message}`);
        process.exitCode = 1;
        server.close();
      });
    },
  },
  {
    command: "serve",
    help: [
      help(
        "machine",
        "serve [--workspace PATH] [--port N]",
        "The standalone page on 127.0.0.1 only; prints a one-time owner link",
      ),
      help(
        "machine",
        "serve link",
        "A new owner link for the running standalone page",
      ),
    ],
    async run({ options, positionals, config }) {
      // The standalone page, on 127.0.0.1 only (spec standalone-web, SW3).
      if (process.env.AVOOZL_CHILD)
        throw Error(
          "A supervisor child may not run avoozl serve. Do it at this machine's command line.",
        );
      for (const name of ["host", "bind"])
        if (options[name] !== undefined)
          throw Error(
            `avoozl serve has no --${name} option: it listens on 127.0.0.1 only.`,
          );
      if (process.env.AVOOZL_HOST !== undefined)
        throw Error(
          "avoozl serve does not read AVOOZL_HOST: it listens on 127.0.0.1 only.",
        );
      const machine = machineAvoozlPaths();
      if (positionals[0] === "link") {
        // A new owner link for the server already running on this machine.
        const running = serveStatus(machine.stateDirectory);
        if (!running.running || !running.origin)
          throw Error(
            "No avoozl serve is running on this machine. Start it with: avoozl serve",
          );
        const origin = running.origin;
        const links = new LinkStore(machine.stateDirectory);
        try {
          console.log(`${origin}/login?token=${links.make()}`);
        } finally {
          links.close();
        }
      } else {
        if (positionals.length)
          throw Error(
            "Usage: avoozl serve [--workspace PATH] [--port N] | avoozl serve link",
          );
        const port = options.port === undefined ? 0 : Number(options.port);
        let server = null;
        try {
          server = await startServe({
            config,
            port,
            uiDir: standaloneUiDirectory(),
          });
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
        if (server) {
          console.log(`Avoozl is at ${server.origin}`);
          console.log(
            `Open this link once, within 10 minutes: ${server.ownerLink}`,
          );
          for (const signal of ["SIGINT", "SIGTERM"])
            process.once(signal, () => server.close(() => process.exit(0)));
        }
      }
    },
  },
  {
    command: "supervisor",
    help: [
      help(
        "machine",
        "supervisor [--tick-seconds N]",
        "This machine's owner of process children (one per machine); --tick-seconds runs the tick too (headless)",
      ),
    ],
    run({ options, positionals }) {
      // One per machine (R95.1); a second one exits 1 and names the first.
      // --tick-seconds runs the tick too, on a headless machine (R95.3).
      if (positionals.length)
        throw Error(
          "Choose supervisor unit, or run avoozl supervisor with no subcommand.",
        );
      const tickSeconds =
        options["tick-seconds"] === undefined
          ? null
          : Number(options["tick-seconds"]);
      if (
        tickSeconds !== null &&
        !(
          Number.isInteger(tickSeconds) &&
          tickSeconds >= 1 &&
          tickSeconds <= 86400
        )
      )
        throw Error("--tick-seconds must be 1 to 86400.");
      runSupervisor({
        stateDirectory: options["state-directory"],
        configDirectory: options["config-directory"],
        tickSeconds,
      });
    },
  },
  {
    command: "supervisor unit",
    help: [
      help(
        "machine",
        "supervisor unit [launchd|systemd] [--write [--force]]",
        "Print or write the unit that runs the supervisor and tick at login",
      ),
    ],
    run({ options, positionals }) {
      // A launchd or systemd unit for a headless machine (R95.3). It only
      // writes the file; loading it is the person's command, printed here.
      if (process.env.AVOOZL_CHILD)
        throw Error(
          "A supervisor child may not write a service unit. Do it at this machine's command line.",
        );
      if (positionals.length > 2)
        throw Error(
          "Usage: avoozl supervisor unit [launchd|systemd] [--tick-seconds N] [--write [--force]]",
        );
      const machine = machineAvoozlPaths();
      const unit = supervisorUnit({
        kind: positionals[1] ?? unitKindFor(),
        cli: fs.realpathSync(process.argv[1]),
        stateDirectory: path.resolve(
          options["state-directory"] ?? machine.stateDirectory,
        ),
        configDirectory: path.resolve(
          options["config-directory"] ?? machine.configDirectory,
        ),
        ...(options["tick-seconds"] !== undefined
          ? { tickSeconds: Number(options["tick-seconds"]) }
          : {}),
      });
      if (!options.write) process.stdout.write(unit.text);
      else {
        const written = writeSupervisorUnit(unit, { force: options.force });
        console.log(
          `${written.unchanged ? "Unchanged" : written.replaced ? "Replaced" : "Wrote"} ${unit.file}. To start it now and at each login, run:\n` +
            unit.load.map((line) => `  ${line}`).join("\n") +
            `\nTo stop it: ${unit.unload.join("; ")}`,
        );
      }
    },
  },
  {
    command: "runner",
    help: [
      help(
        "hooks",
        "runner report TASK_ID done|blocked|findings [--token T] [--file PATH] [--text TEXT]",
        "Report from the task's worktree; a worker's brief gives the token",
      ),
      help(
        "machine",
        "runner status --json",
        "This runner's tasks and workers; elsewhere the supervisor and its children",
      ),
    ],
    async run({
      options,
      positionals,
      config,
      dbPath,
      requireDatabase,
      localOperations,
      localOrRequest,
      machineStateDirectory,
      need,
    }) {
      // `status` and `report` run on a worker machine (and `status` on any one).
      const action = positionals[0];
      let result;
      if (action === "status")
        // A runner reports its remote tasks; any other machine reports the
        // supervisor and its children (R98.5).
        result = HOLDS_TASKS(readRunnerConfig(config.workspaceRoot))
          ? await localOrRequest("remote.status")
          : machineStatus({ stateDirectory: machineStateDirectory() });
      else if (action === "report") {
        const state = positionals[2] || options.state,
          token = options.token || process.env.AVOOZL_REPORT_TOKEN;
        need(
          positionals[1] && state,
          "runner report TASK done|blocked|findings [--token T] [--file PATH]",
        );
        if (token || !HOLDS_TASKS(readRunnerConfig(config.workspaceRoot))) {
          // R88.2: matched by the report token and the worktree it runs in;
          // with no token, by the worktree of this command line's claim.
          requireDatabase();
          const store = new Store(dbPath);
          try {
            result = await reportByToken(store, localOperations(store), {
              taskId: positionals[1],
              state,
              token: token || undefined,
              cwd: process.cwd(),
              text: typeof options.text === "string" ? options.text : undefined,
              file: typeof options.file === "string" ? options.file : undefined,
              role: typeof options.role === "string" ? options.role : undefined,
            });
          } finally {
            store.close();
          }
        } else
          result = await localOrRequest("remote.report", {
            taskId: positionals[1],
            state,
          });
      } else throw Error("Use runner status|report.");
      console.log(JSON.stringify(result, null, 2));
    },
  },
  {
    command: "worker",
    help: [
      help(
        "machine",
        "worker pull",
        "Worker mode: read this worker's offers from spec journals",
      ),
      help(
        "machine",
        "worker claim",
        "Worker mode: ask for pulled offers, start the acknowledged ones",
      ),
      help(
        "machine",
        "worker setup",
        "Worker mode: preview login, access, claims and executor",
      ),
    ],
    async run({ positionals, localOrRequest }) {
      // Worker mode (R90): this machine pulls offers from spec journals.
      if (!["pull", "claim", "setup"].includes(positionals[0]))
        throw Error("Use worker pull|claim|setup.");
      console.log(
        JSON.stringify(
          await localOrRequest(`worker.${positionals[0]}`),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "driver",
    help: [
      help(
        "machine",
        "driver status [SPEC]",
        "Which machine drives each spec, and why one reads only here",
      ),
      help(
        "machine",
        "driver handoff SPEC [--folder DIR [--unfinished]] [--cancel]",
        "Stop new work for SPEC; with --folder write the export (a person only)",
      ),
      help(
        "machine",
        "driver takeover SPEC [--file EXPORT.json]",
        "Drive SPEC here once its plan issue names you (a person only)",
      ),
      help(
        "machine",
        "driver takeover SPEC --force --confirm SPEC [--file EXPORT.json | --yes]",
        "Assign the plan issue to you and take over by force (a person only)",
      ),
      help(
        "machine",
        "driver set [--label LABEL] [--heartbeat MINUTES]",
        "This computer's machine label and heartbeat",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      // The spec driver (§6.10). Hand off, take over and force take over are
      // a person's: the CLI is the person at this machine's command line.
      const action = positionals[0] || "status",
        planId = options.spec || positionals[1];
      let result;
      if (action === "status")
        result = await localOrRequest(
          "driver.status",
          planId ? { planId } : {},
        );
      else if (action === "handoff") {
        // Draining already: --folder writes the export now. Otherwise this
        // starts the drain, and a --folder export is written once it drains.
        const draining = options.cancel
          ? false
          : (await localOrRequest("driver.status", { planId })).specs?.[0]
              ?.handoff?.state === "draining";
        result = await localOrRequest("driver.handoff", {
          planId,
          action: options.cancel ? "cancel" : draining ? "export" : "start",
          ...(options.folder ? { folder: path.resolve(options.folder) } : {}),
          ...(options.unfinished ? { unfinished: true } : {}),
        });
      } else if (action === "takeover") {
        const file = options.file ? path.resolve(options.file) : undefined;
        if (options.force) {
          if (typeof options.confirm !== "string")
            throw Error(
              "Force take over needs --confirm SPEC, the spec's name.",
            );
          result = await localOrRequest("driver.forceTakeover", {
            planId,
            confirm: options.confirm,
            ...(file ? { file } : { acknowledgeLoss: options.yes === true }),
          });
        } else
          result = await localOrRequest("driver.takeover", {
            planId,
            ...(file ? { file } : {}),
          });
        // Without an export it shows what is lost first; --yes runs it.
        if (result?.needs === "acknowledge")
          result =
            "A take-over without an export loses:\n" +
            result.lost.map((line) => "  - " + line).join("\n") +
            "\nRun again with --yes to go on.";
      } else if (action === "set")
        result = await localOrRequest("driver.settings.update", {
          ...(options.label !== undefined ? { label: options.label } : {}),
          ...(options.heartbeat !== undefined
            ? { heartbeatMinutes: Number(options.heartbeat) }
            : {}),
        });
      else throw Error("Use driver status|handoff|takeover|set.");
      console.log(
        typeof result === "string" ? result : JSON.stringify(result, null, 2),
      );
    },
  },
];
