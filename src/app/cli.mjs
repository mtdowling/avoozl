#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Store, fail, privateFile } from "./store.mjs";
import { workflowSkill } from "./skill.mjs";
import { workspaceConfig, applicationRoot } from "./config.mjs";
import { initializeWorkspace } from "./workspace.mjs";
import { Operations } from "./operations.mjs";
import { driverSettingsPath } from "./driver.mjs";
import { handleMcp } from "./mcp.mjs";
import { agentSessionNote, cliRefusal } from "./mcp-policy.mjs";
import { createAppMcp } from "./app-mcp.mjs";
import { startAppBackend } from "./app-backend.mjs";
import { startServe } from "./serve-server.mjs";
import { LinkStore } from "./serve-auth.mjs";
import { standaloneUiDirectory } from "./ui-bundle.mjs";
import { contentHook } from "./public-crews.mjs";
import { runSupervisor } from "./supervisor.mjs";
import { machineStatus } from "./machine-status.mjs";
import { workspaceStatus } from "./workspace-status.mjs";
import { PROGRAM, helpCommands, helpPointer, helpText } from "./cli-help.mjs";
import {
  supervisorUnit,
  unitKindFor,
  writeSupervisorUnit,
} from "./supervisor-unit.mjs";
import { reportByToken } from "./report-match.mjs";
import { HOLDS_TASKS, readRunnerConfig } from "./remote-runner.mjs";
import { hookEvent, runnerHookBrief } from "./runner.mjs";
import { validate } from "../model.mjs";
import { planFiles } from "../catalog.mjs";
import { reconcileSource } from "./source-sync.mjs";
import {
  loadHostConfig,
  machineAvoozlPaths,
  WorkspaceRegistry,
} from "./host-config.mjs";

// Reindex every plan file and stored document from the plans root.
function generate(config) {
  if (!config.configured)
    fail("Choose an initialized workspace before indexing Markdown.");
  const store = new Store(config.dbPath),
    stats = { added: 0, changed: 0, removed: 0, newTasks: 0 };
  try {
    for (const file of new Set([
      // No plans root yet means no Markdown plan files.
      ...(fs.existsSync(config.plansRoot) ? planFiles(config.plansRoot) : []),
      ...Object.keys(store.read().documents).filter(
        (id) => !store.read().documents[id].managed,
      ),
    ])) {
      const result = reconcileSource(store, config.plansRoot, file);
      if (result.changed) stats[result.removed ? "removed" : "changed"]++;
    }
    return { stats };
  } finally {
    store.close();
  }
}

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
          "iteration",
          "table-by-wave",
          "no-epic",
          "push",
          "accept-lowered",
          "full",
          "confirm-public",
          "untriaged",
          "rebuild",
          "force",
          "unfinished",
          "cancel",
          "yes",
          "skipped",
          "refused",
          "off",
          // Removed 2026-11-18; still parsed so an old command keeps its
          // other arguments, and ignored.
          "as-person",
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
        ["runner", "review", "gate", "plan"].includes(args[0]) &&
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
  const requestedWorkspace =
    options.workspace ||
    env.AVOOZL_WORKSPACE ||
    env.AICOMMANDER_WORKSPACE ||
    env.NUPP_WORKSPACE;
  // Where the workspace was named, for `status` to say so.
  const requestedFrom = options.workspace
    ? "--workspace"
    : ["AVOOZL_WORKSPACE", "AICOMMANDER_WORKSPACE", "NUPP_WORKSPACE"].find(
        (name) => env[name],
      );
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
  const useServer = () =>
    Boolean(
      options.url ||
        process.env.AVOOZL_URL ||
        process.env.AICOMMANDER_URL ||
        process.env.NUPP_WORKSPACE_URL,
    );
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
        { local: true },
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
  if (command === "init") {
    if (!positionals[0])
      throw Error("Choose a workspace directory: avoozl init PATH.");
    console.log(
      JSON.stringify(
        initializeWorkspace(positionals[0], {
          name: options.name,
          port: options.port,
          documents: options.documents || options["plans-root"],
          db: options.db,
        }),
        null,
        2,
      ),
    );
  } else if (command === "skill") {
    process.stdout.write(workflowSkill(config));
  } else if (command === "import") {
    requireLocalMaintenancePath("Import");
    const snapshot = JSON.parse(
      fs.readFileSync(
        need(
          positionals[0],
          "import SNAPSHOT.json --workspace PATH [--dry-run]",
        ),
        "utf8",
      ),
    );
    const store = new Store(dbPath);
    try {
      console.log(
        JSON.stringify(
          localOperations(store).importSnapshot(snapshot, {
            final: options.final,
            dryRun: options["dry-run"],
          }),
          null,
          2,
        ),
      );
    } finally {
      store.close();
    }
  } else if (command === "backup" || command === "export") {
    requireLocalMaintenancePath(command === "backup" ? "Backup" : "Export");
    requireDatabase();
    const store = new Store(dbPath);
    try {
      if (command === "backup") {
        if (!options.output)
          throw Error("Choose --output for the SQLite backup.");
        const target = path.resolve(options.output);
        // Created 0600 first: VACUUM INTO accepts an empty file.
        if (!fs.existsSync(target)) privateFile(target);
        store.db.prepare("VACUUM INTO ?").run(target);
        privateFile(target);
        console.log("SQLite backup saved.");
      } else {
        const value = JSON.stringify(store.read(), null, 2) + "\n";
        if (options.output) {
          privateFile(options.output);
          fs.writeFileSync(options.output, value);
        } else process.stdout.write(value);
      }
    } finally {
      store.close();
    }
  } else if (command === "mcp" && options.kirocrew) {
    // The Kiro Crew app's stdio MCP server. Kiro Crew may share this process
    // between sessions, so each request picks its own workspace (app-mcp.mjs);
    // the working directory is never used.
    const server = createAppMcp({
        fallback: requestedWorkspace ? config : null,
        env,
      }),
      lines = readline.createInterface({ input: process.stdin });
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            }) + "\n",
          );
          continue;
        }
        let reply;
        try {
          reply = await server.handle(message);
        } catch (error) {
          reply = {
            jsonrpc: "2.0",
            id: message?.id ?? null,
            error: { code: -32603, message: error.message },
          };
        }
        if (reply !== null) process.stdout.write(JSON.stringify(reply) + "\n");
      }
    } finally {
      server.close();
    }
  } else if (command === "mcp" && !useServer()) {
    // A stdio MCP server for one workspace: the same plans_* tools, served in
    // process from the workspace database with no web server running.
    requireDatabase();
    const store = new Store(dbPath),
      ops = localOperations(store),
      lines = readline.createInterface({ input: process.stdin });
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            }) + "\n",
          );
          continue;
        }
        try {
          // No gateway fronts this server, so a caller block here could come
          // from any client and is not read; `--kirocrew` is the attested form.
          const result = await handleMcp(message, ops, { base: endpoint });
          if (result.body !== null)
            process.stdout.write(JSON.stringify(result.body) + "\n");
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
    } finally {
      store.close();
    }
  } else if (command === "mcp") {
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
  } else if (command === "supervisor" && positionals[0] === "unit") {
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
  } else if (command === "supervisor") {
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
  } else if (command === "serve") {
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
      let origin;
      try {
        origin = JSON.parse(
          fs.readFileSync(
            path.join(machine.stateDirectory, "serve.json"),
            "utf8",
          ),
        ).origin;
      } catch {
        throw Error(
          "No avoozl serve is running on this machine. Start it with: avoozl serve",
        );
      }
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
  } else if (command === "app-backend") {
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
  } else if (command === "plugins") {
    // Settings' plugin actions at the command line (design §4.8). Approval
    // names the hash `plugins list` showed, so a person approves what they saw.
    const [action = "list", id] = positionals,
      calls = {
        list: () => ["plugins.list", {}],
        approve: () => [
          "plugin.approve",
          {
            id,
            hash: options.hash,
            ...(options.commit ? { commit: options.commit } : {}),
          },
        ],
        // A git plugin: resolve its ref again and fetch that commit.
        update: () => ["plugin.update", { id }],
        disable: () => ["plugin.disable", { id, disabled: true }],
        enable: () => ["plugin.disable", { id, disabled: false }],
        remove: () => ["plugin.remove", { id }],
        // A pack: what importing it would change, then the import of that
        // exact preview (design §4.14).
        "pack-preview": () => [
          "plugin.pack.preview",
          {
            id,
            ...(options.repo ? { repositories: [options.repo].flat() } : {}),
          },
        ],
        "pack-import": () => [
          "plugin.pack.import",
          {
            id,
            previewHash: options.preview,
            ...(options.repo ? { repositories: [options.repo].flat() } : {}),
            acceptLowered: Boolean(options["accept-lowered"]),
            confirmPublic: Boolean(options["confirm-public"]),
          },
        ],
        add: () => [
          "plugin.add",
          {
            scope: options.repository ? "repository" : "machine",
            confirmPublic: Boolean(options["confirm-public"]),
            entry: {
              id,
              ...(options.package ? { package: options.package } : {}),
              ...(options.path ? { path: options.path } : {}),
              ...(options.git ? { git: options.git, ref: options.ref } : {}),
              ...(options.subdir ? { subdir: options.subdir } : {}),
              contract: Number(options.contract ?? 1),
              ...(options.config ? { config: JSON.parse(options.config) } : {}),
            },
          },
        ],
      };
    if (!calls[action])
      throw Error(
        "Choose plugins list, add, update, approve, disable, enable, remove, pack-preview, or pack-import.",
      );
    if (action !== "list") need(id, `plugins ${action} ID ...`);
    console.log(
      JSON.stringify(await localOrRequest(...calls[action]()), null, 2),
    );
  } else if (command === "content" && positionals[0] === "hook") {
    // A PreToolUse hook (§6.14): reads the event JSON on stdin, exits 2 with
    // the refusal on stderr when the call would write a blocked line.
    const result = contentHook({
      stdin: await new Promise((resolve) => {
        let text = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (text += chunk));
        process.stdin.on("end", () => resolve(text));
        process.stdin.on("error", () => resolve(""));
      }),
      dbPath,
      workspaceRoot: config.workspaceRoot,
    });
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.code;
  } else if (command === "content") {
    // Content rules (design §4.9). `check --push` is the pre-push hook
    // Avoozl installs in each worktree it prepares; it reads the refs Git
    // passes on stdin and exits 1 on a match, naming set, rule, file and
    // line, never the matched text.
    const [action = "list", id] = positionals,
      calls = {
        list: () => ["content.rules", {}],
        allow: () => [
          "content.allow",
          {
            id: need(id, "content allow DECISION_ID --reason TEXT"),
            reason: options.reason,
          },
        ],
        show: () => [
          "content.show",
          { id: need(id, "content show DECISION_ID") },
        ],
        check: () => [
          "content.check",
          {
            taskId: options.task,
            push: Boolean(options.push),
            ...(options.push ? { stdin: fs.readFileSync(0, "utf8") } : {}),
            ...(options.head ? { head: options.head } : {}),
          },
        ],
      };
    if (!calls[action])
      throw Error("Choose content list, allow, show, or check.");
    console.log(
      JSON.stringify(await localOrRequest(...calls[action]()), null, 2),
    );
  } else if (command === "intake") {
    // Incoming items (design §4.12). `submit` reads a JSON list of items for
    // an mcp source; `deliver` and `plan` are a person's Deliver this and
    // Plan this.
    const [action = "list", source, id] = positionals,
      calls = {
        list: () => [
          "intake.list",
          {
            ...(options.source ? { source: options.source } : {}),
            ...(options.kind ? { kind: options.kind } : {}),
            ...(options.state ? { state: options.state } : {}),
            ...(options.untriaged ? { untriaged: true } : {}),
          },
        ],
        view: () => ["intake.view", { source, id }],
        submit: () => [
          "intake.submit",
          {
            source: options.source,
            items: JSON.parse(
              fs.readFileSync(
                need(
                  options.file,
                  "intake submit --source ID --file ITEMS.json",
                ),
                "utf8",
              ),
            ),
          },
        ],
        sources: () => ["intake.sources", {}],
        deliver: () => ["intake.deliver", { source, id }],
        plan: () => ["intake.plan", { source, id }],
        confirm: () => ["intake.confirm", { source, id, hash: options.hash }],
      };
    if (!calls[action])
      throw Error(
        "Choose intake list, view, submit, sources, deliver, plan, or confirm.",
      );
    if (["view", "deliver", "plan", "confirm"].includes(action))
      need(source && id, `intake ${action} SOURCE ID`);
    console.log(
      JSON.stringify(await localOrRequest(...calls[action]()), null, 2),
    );
  } else if (command === "setup") {
    // Preview by default; --yes applies (R89.1). Not `github setup`.
    const list = (value) =>
      value
        ?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    console.log(
      JSON.stringify(
        await localOrRequest("repository.setup", {
          repository: need(
            positionals[0],
            "setup OWNER/REPO --project ID --checks NAME[,NAME] [--base BRANCH] [--methods merge,squash,rebase] [--landing pr|direct|train|off] [--yes]",
          ),
          project: options.project,
          base: options.base,
          checks: list(options.checks),
          methods: list(options.methods),
          landing: options.landing,
          confirm: Boolean(options.yes),
        }),
        null,
        2,
      ),
    );
  } else if (command === "tick")
    console.log(
      JSON.stringify(await localOrRequest("workspace.tick"), null, 2),
    );
  else if (command === "next" && options.hook) {
    // An AgentSpawn hook: brief a Crew Mode conductor whose session starts in
    // one of this workspace's checkouts while delivery.runner is crew-mode.
    // Anything else prints nothing, and no failure ever blocks a session.
    try {
      const event = await hookEvent(process.stdin),
        cwd =
          typeof event?.cwd === "string" && path.isAbsolute(event.cwd)
            ? event.cwd
            : process.cwd();
      if (fs.existsSync(dbPath)) {
        const store = new Store(dbPath);
        try {
          const brief = runnerHookBrief(store, {
            workspaceRoot: config.workspaceRoot,
            cwd,
            command: `node ${JSON.stringify(process.argv[1])}`,
          });
          if (brief) process.stdout.write(brief);
        } finally {
          store.close();
        }
      }
    } catch {
      // A hook that cannot brief stays silent; the session starts as usual.
    }
  } else if (command === "next")
    console.log(JSON.stringify(await localOrRequest("runner.next"), null, 2));
  else if (command === "checks" && positionals[0] === "run")
    console.log(
      JSON.stringify(
        await localOrRequest("flow.checks.run", {
          taskId: options.task,
          cwd: process.cwd(),
        }),
        null,
        2,
      ),
    );
  else if (command === "gate" && positionals[0] === "list") {
    // Tracker gates (RC23.11): the rows the page shows.
    const { gates } = await localOrRequest("gate.list", {});
    if (options.json) console.log(JSON.stringify({ gates }, null, 2));
    else if (!gates.length) console.log("No tracker gates.");
    else
      for (const gate of gates)
        console.log(
          `${gate.state.padEnd(8)} ${gate.taskId}  ${gate.tracker} ${gate.item}  last ${gate.lastCheck ?? "never"}  next ${gate.nextCheck ?? "-"}${gate.held.length ? `  holds ${gate.held.join(", ")}` : ""}`,
        );
  } else if (command === "gate" && positionals[0] === "clear") {
    // A person's order (RC23.10): the gate counts as done, recorded as cleared.
    const result = await localOrRequest("gate.clear", {
      taskId: need(positionals[1], "gate clear TASK --reason TEXT"),
      reason: need(options.reason, "gate clear TASK --reason TEXT"),
    });
    console.log(
      result.cleared
        ? `Cleared ${positionals[1]} as an order by ${result.actor}.`
        : `${positionals[1]} was already ${result.state}.`,
    );
  } else if (command === "review" && positionals[0] === "drafts") {
    // Review drafts made from the review label (RC20.6): what waits on
    // people, and the GitHub search that finds them.
    const view = await localOrRequest("review.drafts", {
      ...(options.repository ? { repository: options.repository } : {}),
      ...(options.state ? { state: options.state } : {}),
    });
    if (options.json) console.log(JSON.stringify(view, null, 2));
    else {
      for (const item of view.items)
        console.log(
          `${item.state.padEnd(9)} ${item.repository}#${item.number}  ${item.reviewer}  ${item.url ?? ""}`,
        );
      if (!view.items.length) console.log("No review drafts.");
      for (const search of view.searches)
        console.log(`\nOn GitHub: ${search.query}\n${search.url}`);
    }
  } else if (command === "gap-report") {
    // An external gap report becomes proposed tasks in a parent spec's
    // sub-specs. `preview` shows the table and the proposals; `accept` adds
    // them as draft work (a person only).
    const action = positionals[0];
    if (!["preview", "accept"].includes(action))
      throw Error(
        "Usage: avoozl gap-report preview|accept PARENT_SPEC (--path FILE | --issue OWNER/REPO#N)",
      );
    const input = {
      parent: need(positionals[1], "gap-report " + action + " PARENT_SPEC"),
      ...(options.path ? { path: options.path } : {}),
      ...(options.issue ? { issue: options.issue } : {}),
    };
    if (action === "preview") {
      const found = await localOrRequest("gap.preview", input);
      console.log(found.table);
      console.log(
        found.proposals.length
          ? "\n" +
              found.proposals
                .map((p) => `${p.spec}:${p.id}  ${p.title}`)
                .join("\n")
          : "\nNo failing cell, so no proposed task.",
      );
    } else
      console.log(
        JSON.stringify(await localOrRequest("gap.accept", input), null, 2),
      );
  } else if (command === "flow" && positionals[0] === "stop")
    console.log(
      JSON.stringify(
        await localOrRequest("flow.stop", {
          scope: options.full ? "all" : options.scope,
          reason: options.reason,
          ...(options.full ? { full: true } : {}),
          ...(options.repository ? { repository: options.repository } : {}),
          ...(options.spec ? { spec: options.spec } : {}),
          ...(options.task ? { taskId: options.task } : {}),
        }),
        null,
        2,
      ),
    );
  else if (command === "public-crews" && positionals[0] === "stop")
    console.log(
      JSON.stringify(await localOrRequest("publiccrews.stop", {}), null, 2),
    );
  else if (command === "flow" && positionals[0] === "resume")
    console.log(
      JSON.stringify(
        await localOrRequest("flow.resume", {
          stopId: need(positionals[1], "flow resume STOP_ID"),
        }),
        null,
        2,
      ),
    );
  else if (command === "flow" && positionals[0] === "run-anyway")
    console.log(
      JSON.stringify(
        await localOrRequest("flow.runAnyway", {
          stopId: need(positionals[1], "flow run-anyway STOP_ID --confirm"),
          confirm: options.confirm === true,
        }),
        null,
        2,
      ),
    );
  else if (command === "flow")
    console.log(
      JSON.stringify(
        await localOrRequest("flow.view", {
          ...(options.repository ? { repository: options.repository } : {}),
          ...(options.epic ? { epic: options.epic } : {}),
          ...(options.plan ? { plan: options.plan } : {}),
          ...(options.phase ? { phase: options.phase } : {}),
          ...(options.window ? { window: Number(options.window) } : {}),
          ...(options.stage ? { stage: options.stage } : {}),
        }),
        null,
        2,
      ),
    );
  else if (command === "epics" || command === "epic")
    console.log(
      JSON.stringify(
        command === "epic"
          ? await localOrRequest("epic.get", { id: positionals[0] })
          : await localOrRequest("epic.list"),
        null,
        2,
      ),
    );
  else if (command === "runner") {
    // Runner mode over SSH (R84). `accept` and `status` run on the runner,
    // started by the driver's ssh; `handoff` and `pull` run on the driver.
    const action = positionals[0];
    let result;
    if (action === "accept")
      result = await localOrRequest("remote.accept", {
        envelope: fs.readFileSync(
          positionals[1] === "-" || !positionals[1] ? 0 : positionals[1],
          "utf8",
        ),
      });
    else if (action === "status")
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
          });
        } finally {
          store.close();
        }
      } else
        result = await localOrRequest("remote.report", {
          taskId: positionals[1],
          state,
        });
    } else if (action === "handoff") {
      need(
        positionals[1] && options.host,
        "runner handoff ENVELOPE.json --host NAME",
      );
      result = await localOrRequest("remote.handoff", {
        host: options.host,
        envelope: JSON.parse(fs.readFileSync(positionals[1], "utf8")),
      });
    } else if (action === "pull") {
      need(options.host, "runner pull --host NAME");
      result = await localOrRequest("remote.pull", { host: options.host });
    } else throw Error("Use runner accept|status|report|handoff|pull.");
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "worker") {
    // Worker mode (R90): this machine pulls offers from spec journals.
    if (!["pull", "claim", "setup"].includes(positionals[0]))
      throw Error("Use worker pull|claim|setup.");
    console.log(
      JSON.stringify(await localOrRequest(`worker.${positionals[0]}`), null, 2),
    );
  } else if (command === "driver") {
    // The spec driver (§6.10). Hand off, take over and force take over are
    // a person's: the CLI is the person at this machine's command line.
    const action = positionals[0] || "status",
      planId = options.spec || positionals[1];
    let result;
    if (action === "status")
      result = await localOrRequest("driver.status", planId ? { planId } : {});
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
          throw Error("Force take over needs --confirm SPEC, the spec's name.");
        result = await localOrRequest("driver.forceTakeover", {
          planId,
          confirm: options.confirm,
          ...(file ? { file } : { acknowledgeLoss: options.yes === true }),
        });
      } else
        result = await localOrRequest("driver.takeover", {
          planId,
          ...(file ? { file } : {}),
          ...(options.rebuild
            ? { rebuild: true, acknowledgeLoss: options.yes === true }
            : {}),
        });
      // A rebuild shows what it loses first; --yes runs it.
      if (result?.needs === "acknowledge")
        result =
          "A rebuild from GitHub loses:\n" +
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
  } else if (command === "worktree") {
    // A chat prepares its task's worktree without MCP (worker-paths WP4.1).
    if (positionals[0] !== "prepare" || !positionals[1])
      throw Error("Use worktree prepare TASK_ID.");
    console.log(
      JSON.stringify(
        await localOrRequest("worktree.prepare", { taskId: positionals[1] }),
        null,
        2,
      ),
    );
  } else if (command === "claim")
    console.log(
      JSON.stringify(
        await localOrRequest("runner.claim", {
          taskId: positionals[0],
          slot: options.slot,
          ...(options.title ? { title: options.title } : {}),
          ...(options.model ? { model: options.model } : {}),
        }),
        null,
        2,
      ),
    );
  else if (command === "report")
    console.log(
      JSON.stringify(
        await localOrRequest("session.report", {
          taskId: positionals[0],
          slot: options.slot,
          kind: options.kind,
          ...(options.text !== undefined ? { text: options.text } : {}),
          ...(options.commit !== undefined ? { commit: options.commit } : {}),
        }),
        null,
        2,
      ),
    );
  else if (command === "verify" && positionals[0] === "allow")
    console.log(
      JSON.stringify(
        await localOrRequest("verify.allow", {
          taskId: positionals[1],
          reason: options.reason,
        }),
        null,
        2,
      ),
    );
  else if (command === "retry")
    console.log(
      JSON.stringify(
        await localOrRequest("delivery.retry", {
          taskId: positionals[0],
          ...(options.dismiss
            ? {
                dismiss: [{ finding: options.dismiss, reason: options.reason }],
              }
            : {}),
        }),
        null,
        2,
      ),
    );
  else if (command === "health") {
    // The app backend answers /health; an older server answers /api/health.
    let response;
    try {
      response = await fetch(endpoint + "/health");
      if (response.status === 404)
        response = await fetch(endpoint + "/api/health");
    } catch {
      throw Error(
        `No Avoozl server answered at ${endpoint}. Pass --url URL for a running app backend, or run avoozl check --workspace PATH to validate the database.`,
      );
    }
    console.log(JSON.stringify(await response.json(), null, 2));
    if (!response.ok) process.exitCode = 1;
  } else if (command === "rebuild")
    console.log(
      JSON.stringify(
        await localOrRequest("workspace.rebuild", {
          repository: options.repository || positionals[0],
        }),
        null,
        2,
      ),
    );
  else if (command === "seed")
    console.log(
      JSON.stringify(
        // No name installs the default pack (`examples` says which).
        await localOrRequest("workspace.seed", {
          example: options.example || positionals[0],
        }),
        null,
        2,
      ),
    );
  else if (command === "examples")
    console.log(
      JSON.stringify(await localOrRequest("workspace.examples"), null, 2),
    );
  else if (command === "github") {
    const action = positionals[0] || "status";
    let operation, value;
    if (action === "status") {
      operation = "github.repositories";
      value = {};
    } else if (action === "sync") {
      operation = "github.sync";
      value = {
        repository: options.repository || positionals[1],
        autoStart: options["auto-start"],
      };
    } else if (action === "configure") {
      operation = "github.configure";
      value = {
        repository: options.repository || positionals[1],
        projectId: options.project,
        assignee: options.assignee,
        label: options.label,
        managedLabel: options["managed-label"],
        provider: options.provider,
        model: options.model,
        autoStart: options["auto-start"],
        active: !options.inactive,
        minimumPermission: options.permission,
        allowedActors: options["allowed-actors"]
          ?.split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
    } else if (action === "project" || action === "preview") {
      operation =
        action === "project" ? "github.project" : "github.project.preview";
      value = {
        planId: need(
          options.plan || positionals[1],
          `github ${action} PLAN_ID [--repository OWNER/REPO]`,
        ),
        repository: options.repository,
      };
    } else if (action === "start") {
      operation = "github.start";
      value = {
        taskId: options.task || positionals[1],
        provider: options.provider,
        model: options.model,
        projectId: options.project,
        approvalMode: options.approvals,
      };
    } else if (action === "setup") {
      // Preview first; rerun with --confirm --preview-hash HASH to write.
      const list = (value) =>
        value
          ?.split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      const provided = input();
      operation = "github.setup";
      value = {
        ...provided,
        mode: options.mode ?? provided.mode,
        planningRepository:
          options["planning-repository"] ?? provided.planningRepository,
        repositories: list(options.repositories) ?? provided.repositories,
        project:
          options["project-owner"] ||
          options["project-number"] ||
          options["project-title"]
            ? {
                owner: options["project-owner"],
                number: options["project-number"]
                  ? Number(options["project-number"])
                  : undefined,
                title: options["project-title"],
              }
            : provided.project,
        releases: list(options.releases) ?? provided.releases,
        iteration: options.iteration ?? provided.iteration,
        tableByWave: options["table-by-wave"] ?? provided.tableByWave,
        epic: options["no-epic"] ? false : provided.epic,
        confirm: options.confirm ?? provided.confirm,
        previewHash: options["preview-hash"] ?? provided.previewHash,
      };
    } else if (action === "retire-issues") {
      // Retire task-issue bindings in order (R102.20): preview, hold,
      // apply, verify, close. Each step is a person's own act.
      const step = positionals[1] || "preview";
      if (!["preview", "hold", "apply", "verify", "close"].includes(step))
        throw Error(
          "Choose github retire-issues preview, hold, apply, verify, or close [--reason completed|not_planned].",
        );
      operation = "github.retireTaskIssues";
      value = { step, ...(options.reason ? { reason: options.reason } : {}) };
    } else
      throw Error(
        "Choose github status, configure, sync, project, preview, setup, start, or retire-issues.",
      );
    console.log(
      JSON.stringify(await localOrRequest(operation, value), null, 2),
    );
  } else if (command === "spec" && positionals[0] === "journal") {
    // Reanchor a held journal (R102.26): preview, or --yes to write it and
    // hold the spec; then resume it. Each a person's own act.
    const action = positionals[1];
    if (!["reanchor", "resume"].includes(action))
      throw Error("Choose spec journal reanchor or spec journal resume.");
    const planId = need(
        options.plan || positionals[2],
        action === "reanchor"
          ? "spec journal reanchor SPEC --held ID,... --tail ID [--yes]"
          : "spec journal resume SPEC --tail ID",
      ),
      tail = Number(
        need(options.tail, `spec journal ${action} SPEC --tail ID`),
      );
    console.log(
      JSON.stringify(
        await localOrRequest(
          `spec.journal.${action}`,
          action === "reanchor"
            ? {
                planId,
                tail,
                held: String(need(options.held, "--held ID,..."))
                  .split(",")
                  .map((id) => Number(id.trim()))
                  .filter(Boolean),
                apply: options.yes === true,
              }
            : { planId, tail },
        ),
        null,
        2,
      ),
    );
  } else if (
    command === "spec" &&
    ["offer", "claims"].includes(positionals[0])
  ) {
    // The driver offers a task to a worker login and reserves the claims its
    // workers ask for (R90.4): each a person's own act at this machine.
    // `spec claims release SPEC TASK` and `spec claims status SPEC`.
    const sub =
        positionals[0] === "claims" &&
        ["release", "status"].includes(positionals[1])
          ? positionals.splice(1, 1)[0]
          : null,
      planId = need(positionals[1], `spec ${positionals[0]} SPEC ...`);
    console.log(
      JSON.stringify(
        await localOrRequest(
          sub ? `spec.claims.${sub}` : `spec.${positionals[0]}`,
          sub === "status"
            ? { planId }
            : sub === "release"
              ? {
                  planId,
                  task: need(
                    positionals[2],
                    "spec claims release SPEC TASK --claims OWNER/REPO",
                  ),
                  claims: need(options.claims, "--claims OWNER/REPO"),
                }
              : positionals[0] === "offer"
                ? {
                    planId,
                    task: need(
                      positionals[2],
                      "spec offer SPEC TASK --worker LOGIN --repository OWNER/REPO --branch B --commit SHA --base SHA",
                    ),
                    worker: need(options.worker, "--worker LOGIN"),
                    repository: need(
                      options.repository,
                      "--repository OWNER/REPO",
                    ),
                    branch: need(options.branch, "--branch B"),
                    commit: need(options.commit, "--commit SHA"),
                    base: need(options.base, "--base SHA"),
                  }
                : {
                    planId,
                    claims: need(
                      options.claims,
                      "spec claims SPEC --claims OWNER/REPO --base BRANCH [--cap N]",
                    ),
                    base: need(options.base, "--base BRANCH"),
                    ...(options.cap ? { cap: Number(options.cap) } : {}),
                  },
        ),
        null,
        2,
      ),
    );
  } else if (command === "spec") {
    const action = positionals[0];
    if (!["publish", "takeover", "export-issues"].includes(action))
      throw Error("Choose spec publish, spec takeover or spec export-issues.");
    const planId = need(
      options.plan || positionals[1],
      action === "takeover"
        ? "spec takeover SPEC"
        : `spec ${action} SPEC [--repository OWNER/REPO]${action === "export-issues" ? " [--confirm]" : ""}`,
    );
    // Publish the spec issue or local journal (R102.2) and take it over
    // (R102.13): each a person's own act. Export issues (R102.19): preview
    // first; --confirm creates the spec's unfinished task issues and stops
    // Avoozl driving it.
    console.log(
      JSON.stringify(
        await localOrRequest(
          action === "export-issues" ? "spec.exportIssues" : `spec.${action}`,
          action === "takeover"
            ? { planId }
            : action === "publish"
              ? { planId, repository: options.repository }
              : {
                  planId,
                  repository: options.repository,
                  confirm: Boolean(options.confirm),
                },
        ),
        null,
        2,
      ),
    );
  } else if (command === "integrator") {
    const action = positionals[0];
    if (action === "status") {
      const status = await localOrRequest("integrator.status");
      console.log(
        options.json
          ? JSON.stringify(status, null, 2)
          : status.targets.length
            ? status.targets
                .map(
                  (t) =>
                    `${t.repository} ${t.target}: ${t.policy ?? "no policy"}, lease ${t.lease.state}${t.lease.holder ? ` (pid ${t.lease.holder.pid})` : ""}, train ${t.train ?? "none"}`,
                )
                .join("\n")
            : "No repository lands in trains.",
      );
    } else if (action === "run") {
      // The supervisor starts this; it is the only process that pushes a
      // train trunk, never a chat shell (LT2.2).
      if (process.env.AVOOZL_CHILD)
        throw Error(
          "A supervisor child may not run the integrator. Start it at this machine's command line or let the supervisor do it.",
        );
      await import("./integrator-main.mjs");
    } else throw Error("Choose integrator run or status.");
  } else if (command === "landing") {
    const action = positionals[0];
    if (action === "status") {
      // The same read as the Landing queue page and the MCP read: store only.
      const view = await localOrRequest("landing.queue");
      console.log(
        options.json
          ? JSON.stringify(view, null, 2)
          : view.bases
              .map(
                (b) =>
                  `${b.repository ?? b.projectId} ${b.base}: ${b.items.length} waiting${b.queue?.train ? `, ${b.queue.train.id} at ${b.queue.train.step}` : ""}`,
              )
              .join("\n") || "Nothing waits to land.",
      );
    } else if (action !== "submit")
      throw Error("Choose landing submit or status.");
    else
      console.log(
        JSON.stringify(
          await localOrRequest("landing.submit", {
            taskId: need(positionals[1], "landing submit TASK --branch NAME"),
            branch: need(options.branch, "landing submit TASK --branch NAME"),
          }),
          null,
          2,
        ),
      );
  } else if (command === "mirror") {
    // Preview first; rerun with --confirm --preview-hash HASH to apply.
    const action = positionals[0];
    if (action !== "adopt" && action !== "create")
      throw Error("Choose mirror adopt or mirror create.");
    console.log(
      JSON.stringify(
        await localOrRequest(`mirror.${action}`, {
          repository: need(
            options.repository || positionals[1],
            `mirror ${action} OWNER/MIRROR --source OWNER/REPO`,
          ),
          source: options.source,
          confirm: options.confirm,
          previewHash: options["preview-hash"],
          ticked: options.ticked
            ?.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }),
        null,
        2,
      ),
    );
  } else if (command === "project") {
    const action = positionals[0],
      provided = input();
    if (action !== "configure") throw Error("Choose project configure.");
    console.log(
      JSON.stringify(
        await localOrRequest("project.configure", {
          ...provided,
          id: options.id || positionals[1] || provided.id,
          root: options.root || provided.root,
          baseBranch: options.branch || provided.baseBranch,
          worktreeRoot: options.worktrees || provided.worktreeRoot,
        }),
        null,
        2,
      ),
    );
  } else if (command === "workspace" || command === "status") {
    const action = command === "status" ? "status" : positionals[0] || "list";
    const registry = new WorkspaceRegistry({
      env: options.env || process.env,
      ...(options["host-config"] ? { configPath: options["host-config"] } : {}),
      ...(options.catalog ? { catalogPath: options.catalog } : {}),
    });
    const hostUrl =
      registry.config.url || `http://127.0.0.1:${registry.config.port || 9428}`;
    const live = async (pathname, { method = "GET", body } = {}) => {
      if (registry.config.port === 0 && !registry.config.url) return null;
      let response;
      try {
        response = await fetch(hostUrl + pathname, {
          method,
          ...(body === undefined
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }),
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        return null;
      }
      let payload = {};
      try {
        payload = await response.json();
      } catch {}
      if (!response.ok)
        throw Error(
          payload.error ||
            `The running Avoozl host rejected ${method} ${pathname}.`,
        );
      return Object.hasOwn(payload, "result") ? payload.result : payload;
    };
    try {
      let result;
      if (action === "list" || action === "status") {
        result = (await live("/api/workspaces")) || registry.describe();
        if (command === "status") {
          // A workspace named on the command line or in the environment is
          // reported first, whether or not this machine's catalog lists it.
          // A registered ID names its root in the catalog this command reads.
          const named =
              typeof requestedWorkspace === "string"
                ? requestedWorkspace
                : null,
            registered = named ? registry.config.workspaces[named] : null;
          result = {
            ...(named
              ? {
                  workspace: workspaceStatus({
                    named,
                    from: requestedFrom,
                    config: registered
                      ? workspaceConfig({
                          ...options,
                          workspace: registered.root,
                        })
                      : config,
                    catalog: result,
                  }),
                }
              : {}),
            ...result,
            machine: machineStatus({
              stateDirectory: machineStateDirectory(),
            }),
          };
        }
      } else if (action === "add") {
        const provided = input();
        const repositories =
          provided.repositories ||
          (options.repositories ? JSON.parse(options.repositories) : {});
        const id = options.id || positionals[1] || provided.id;
        const registration = {
          id,
          root: options.root || provided.root,
          name: options.name || provided.name,
          enabled:
            options.inactive === true
              ? false
              : provided.enabled === undefined
                ? true
                : provided.enabled,
          repositories,
        };
        result =
          (await live("/api/workspaces", {
            method: "POST",
            body: registration,
          })) || registry.add(id, registration);
      } else if (action === "adopt") {
        if (await live("/api/workspaces"))
          throw Error(
            "Workspace adoption is local-only. Stop the running Avoozl host before adopting an existing workspace.",
          );
        const provided = input(),
          id = options.id || positionals[1] || provided.id;
        result = registry.adopt(id, {
          root: options.root || provided.root,
          name: options.name || provided.name,
          enabled:
            options.inactive === true
              ? false
              : provided.enabled === undefined
                ? true
                : provided.enabled,
          repositories:
            provided.repositories ||
            (options.repositories ? JSON.parse(options.repositories) : {}),
        });
      } else if (
        ["remove", "start", "drain", "resume", "stop"].includes(action)
      ) {
        const id = options.id || positionals[1];
        result = await live(
          `/api/workspaces/${encodeURIComponent(id)}/lifecycle`,
          { method: "POST", body: { action } },
        );
        if (!result) {
          if (action === "remove") result = registry.remove(id);
          else if (action === "drain") result = registry.drain(id);
          else result = registry.setEnabled(id, action !== "stop");
        }
      } else if (action === "set-default") {
        const id = options.id || positionals[1];
        result =
          (await live("/api/workspaces/default", {
            method: "POST",
            body: { workspaceId: id },
          })) || registry.setDefault(id);
      } else if (action === "rebuild") result = registry.rebuild();
      else
        throw Error(
          "Choose workspace list, add, adopt, remove, start, drain, resume, stop, set-default, or rebuild.",
        );
      console.log(JSON.stringify(result, null, 2));
    } finally {
      registry.close();
    }
  } else if (command === "workspace-repo") {
    const action = positionals[0] || "status";
    let operation, value;
    if (action === "status") {
      operation = "workspace.repository.status";
      value = {};
    } else if (action === "configure") {
      operation = "workspace.repository.configure";
      value = {
        root: options.root || positionals[1],
        remote: options.remote,
        branch: options.branch,
        directory: options.directory,
      };
    } else if (action === "publish") {
      operation = "workspace.repository.publish";
      value = {
        dryRun: options["dry-run"],
        message: options.message,
      };
    } else if (action === "sync") {
      operation = "workspace.repository.sync";
      value = {};
    } else
      throw Error("Choose workspace-repo status, configure, publish, or sync.");
    console.log(
      JSON.stringify(await localOrRequest(operation, value), null, 2),
    );
  } else if (command === "plan" && positionals[0] === "review") {
    const value = await localOrRequest("plan.review.get", {
      spec: need(positionals[1], "plan review SPEC [--start] [--json]"),
    });
    if (options.start) {
      const result = await localOrRequest("plan.review.decide", {
        planId: value.planId,
        revisionHash: value.revisionHash,
        action: "review",
        unproven: !value.writerModel,
      });
      if (result.existing) value.start = result;
      else value.queued = result;
    }
    if (options.json) console.log(JSON.stringify(value, null, 2));
    else {
      console.log(
        `${value.spec} at ${value.revisionHash}: ${value.queued ? "Review queued" : value.start?.existing ? value.start.state : value.review?.current ? value.review.state : "Not reviewed at this revision"}`,
      );
      if (value.review?.current && value.review.note)
        console.log(value.review.note);
      for (const finding of value.findings) {
        const { anchor } = finding,
          lines =
            anchor.lineStart === anchor.lineEnd
              ? anchor.lineStart
              : `${anchor.lineStart}-${anchor.lineEnd}`,
          where = `${anchor.file}:${lines}${anchor.moved ? " (moved or removed)" : ""}`;
        console.log(
          `${finding.id} ${where} ${finding.severity} ${finding.findingState} ${finding.category}: ${finding.claim}\n  Evidence: ${finding.evidence}${finding.answer ? "\n  Planner: " + finding.answer.action + " " + finding.answer.text : ""}`,
        );
      }
    }
  } else if (command === "plan" && positionals[0] === "finding") {
    // A person's action on one review finding (R104.5), at the spec's
    // current revision unless --revision names another stored one.
    const usage =
      "plan finding ID accept|reject|defer|resolve|reopen [--note TEXT] [--revision HASH]";
    const result = await localOrRequest("plan.review.finding.decide", {
      id: need(positionals[1], usage),
      action: need(positionals[2], usage),
      ...(typeof options.note === "string" ? { note: options.note } : {}),
      ...(typeof options.revision === "string"
        ? { revisionHash: options.revision }
        : {}),
    });
    const last = result.decisions.at(-1);
    console.log(
      `${result.id}: ${last.action} by ${last.by} at ${last.revisionHash}`,
    );
  } else if (command === "plan" && positionals[0] === "batches") {
    // Draft specs in the order they can be approved (plan.approvalBatches).
    const found = await localOrRequest("plan.approvalBatches", {
      writes: options.writes === true,
    });
    if (!found.batches.length) console.log("No draft specs to approve.");
    for (const batch of found.batches) {
      console.log(`Batch ${batch.batch} (${batch.specs.length} specs)`);
      for (const entry of batch.specs) console.log("  " + batchLine(entry));
    }
  } else if (command === "plan" && positionals[0] === "approve") {
    const usage =
        "plan approve PLAN... [--batch N] [--yes --expect HASHES] [--delegate NAME]",
      names = positionals.slice(1);
    if (!names.length && options.batch === undefined) need(undefined, usage);
    const listed = await localOrRequest("plan.approvalBatches", {}),
      drafts = listed.batches.flatMap((batch) => batch.specs),
      ids = [];
    if (options.batch !== undefined) {
      const batch = listed.batches[Number(options.batch) - 1];
      if (!/^[1-9][0-9]*$/.test(String(options.batch)) || !batch)
        throw Error(
          `There is no batch ${options.batch}. avoozl plan batches lists ${listed.batches.length}.`,
        );
      ids.push(...batch.specs.map((entry) => entry.id));
    }
    for (const name of names) {
      const entry = drafts.find((e) => e.id === name || e.spec === name);
      if (!entry) throw Error(`${name} is not a draft spec.`);
      if (!ids.includes(entry.id)) ids.push(entry.id);
    }
    const chosen = ids.map((id) => drafts.find((entry) => entry.id === id)),
      short = (entry) => entry.hash.slice(0, 16);
    if (!options.yes) {
      const { selection } = await localOrRequest("plan.approvalBatches", {
        ids,
      });
      console.log("Nothing approved. These specs would be approved:");
      for (const entry of selection.specs) console.log("  " + batchLine(entry));
      const tasks = selection.specs.reduce((sum, e) => sum + e.tasks, 0);
      console.log(
        `${selection.specs.length} specs, ${tasks} tasks, ${selection.writes} GitHub issue writes when projected.`,
      );
      if (selection.pullRequest)
        console.log(
          `${selection.pullRequest} of these are approved through one approval pull request: --yes opens it, and running the same command again after it merges approves them.`,
        );
      if (selection.missing.length)
        console.log(
          `${selection.waiting} ${selection.waiting === 1 ? "task waits" : "tasks wait"} on draft specs left out of the selection, and ${selection.waiting === 1 ? "starts" : "start"} only once they are approved: ${selection.missing.join(", ")}. Approving the selection does not need them.`,
        );
      for (const failure of selection.failures)
        console.log(
          `Would fail: ${failure.spec || failure.id}: ${failure.error}`,
        );
      const workspace = options.workspace
        ? ` --workspace ${JSON.stringify(options.workspace)}`
        : "";
      const delegate =
        typeof options.delegate === "string"
          ? ` --delegate ${options.delegate}`
          : "";
      console.log("To approve exactly these revisions, run:");
      console.log(
        `  avoozl plan approve ${options.batch !== undefined ? `--batch ${options.batch} ` : ""}${names.join(" ")}${names.length ? " " : ""}--yes --expect ${chosen.map(short).join(",")}${workspace}${delegate}`,
      );
      if (!selection.ok) process.exitCode = 1;
    } else {
      // --expect pins the reviewed revisions: every chosen spec's hash must
      // start with one listed prefix, and nothing else may be chosen. --yes
      // without it would approve whatever the specs say now.
      if (options.expect === undefined || options.expect === true)
        throw Error(
          "--yes needs --expect HASHES from a preview. Run the command without --yes to see them.",
        );
      const expected = String(options.expect).split(",").filter(Boolean);
      if (expected.some((prefix) => !/^[0-9a-f]{16,64}$/.test(prefix)))
        throw Error("--expect takes hash prefixes of 16 or more hex digits.");
      const changed = chosen.filter(
        (entry) => !expected.some((prefix) => entry.hash.startsWith(prefix)),
      );
      if (changed.length || expected.length !== chosen.length)
        throw Error(
          `The specs changed since that preview${changed.length ? `: ${changed.map((e) => e.spec).join(", ")}` : ""}. Nothing approved. Preview again without --yes.`,
        );
      const result = await localOrRequest("plan.approveMany", {
        items: chosen.map((entry) => ({
          id: entry.id,
          expectedHash: entry.hash,
        })),
        ...(typeof options.delegate === "string"
          ? { delegate: options.delegate }
          : {}),
      });
      if (result.pending) {
        console.log(
          "Nothing approved yet. Merge this approval pull request, then run the same command again:",
        );
        for (const pull of result.approvalPullRequests)
          console.log(
            `  https://github.com/${pull.repository}/pull/${pull.number}  (${pull.specs.length} specs)`,
          );
      } else if (result.ok) {
        const by = result.approved[0]?.delegation;
        console.log(
          `Approved ${result.approved.length} specs${by ? ` as delegate ${by.delegate} on behalf of ${by.onBehalfOf}` : ""}:`,
        );
        for (const entry of chosen)
          console.log(`  ${entry.spec}  ${short(entry)}  ${entry.tasks} tasks`);
      } else {
        console.log("Nothing approved. These specs failed:");
        for (const failure of result.failures)
          console.log(`  ${failure.spec || failure.id}: ${failure.error}`);
        process.exitCode = 1;
      }
    }
  } else if (command === "approval") {
    // Approval delegation (R109): who may approve on a person's behalf.
    const usage =
      "approval delegates | approval delegate NAME [--on-behalf-of LOGIN] [--note TEXT] | approval revoke NAME";
    if (positionals[0] === "delegates") {
      const found = await localOrRequest("approval.delegates", {});
      if (options.json) console.log(JSON.stringify(found, null, 2));
      else if (!found.delegates.length)
        console.log("No approval delegates. Only a person approves.");
      else
        for (const entry of found.delegates)
          console.log(
            `${entry.identity} approves on behalf of ${entry.onBehalfOf} since ${entry.grantedAt}${entry.note ? ` (${entry.note})` : ""}`,
          );
    } else if (positionals[0] === "delegate") {
      const granted = await localOrRequest("approval.delegate.grant", {
        identity: need(positionals[1], usage),
        ...(typeof options["on-behalf-of"] === "string"
          ? { onBehalfOf: options["on-behalf-of"] }
          : {}),
        ...(typeof options.note === "string" ? { note: options.note } : {}),
      });
      console.log(
        `${granted.identity} may approve specs on behalf of ${granted.onBehalfOf}. Revoke with: avoozl approval revoke ${granted.identity}`,
      );
    } else if (positionals[0] === "revoke") {
      const revoked = await localOrRequest("approval.delegate.revoke", {
        identity: need(positionals[1], usage),
      });
      console.log(`${revoked.identity} may no longer approve specs.`);
      for (const pull of revoked.openApprovalPullRequests)
        console.log(
          `  Still open, opened by it: https://github.com/${pull.repository}/pull/${pull.number}`,
        );
    } else need(undefined, usage);
  } else if (command === "plan" && positionals[0] === "delete") {
    const id = need(
        positionals[1],
        "plan delete PLAN_ID_OR_SPEC_NAME [--yes] [--retire] [--delete-spec-folder]",
      ),
      preview = await localOrRequest("plan.delete.preview", { id });
    if (!options.yes) {
      console.log(JSON.stringify(preview, null, 2));
      console.error("Nothing changed. Add --yes to delete this plan.");
    } else
      console.log(
        JSON.stringify(
          await localOrRequest("plan.delete", {
            id: preview.id,
            retire: options.retire === true,
            deleteSpecFolder: options["delete-spec-folder"] === true,
          }),
          null,
          2,
        ),
      );
  } else if (command === "plan" && positionals[0] === "restore") {
    console.log(
      JSON.stringify(
        await localOrRequest("plan.restore", {
          id: need(positionals[1], "plan restore PLAN_ID"),
        }),
        null,
        2,
      ),
    );
  } else if (command === "planning") {
    const action = positionals[0];
    if (action === "publish")
      console.log(
        JSON.stringify(
          await localOrRequest("planning.publish", {
            planId: need(
              options.plan || positionals[1],
              "planning publish PLAN_ID",
            ),
          }),
          null,
          2,
        ),
      );
    else if (action === "reconcile")
      console.log(
        JSON.stringify(await localOrRequest("planning.reconcile"), null, 2),
      );
    else throw Error("Choose planning publish or reconcile.");
  } else if (command === "generate")
    console.log(JSON.stringify(generate(config).stats, null, 2));
  else if (command === "check") {
    requireDatabase();
    const store = new Store(dbPath);
    try {
      const errors = validate(store.read());
      if (errors.length) throw Error(errors.join("\n"));
      console.log("Valid SQLite task graph and plan references.");
    } finally {
      store.close();
    }
  } else if (command === "show")
    console.log(
      JSON.stringify(
        await localOrRequest("task.get", {
          id: need(positionals[0], "show TASK_ID"),
        }),
        null,
        2,
      ),
    );
  else if (command === "query")
    console.log(
      JSON.stringify(
        await localOrRequest("query", {
          ...options,
          scope: options.scope || "all",
        }),
        null,
        2,
      ),
    );
  else if (command === "task" && positionals[0] === "links") {
    // Task links (R61.22): list and add for anyone; edit, remove and
    // show on the issue are a person's, as the command line is.
    const taskId = need(
        positionals[1],
        "task links TASK_ID [add|edit|remove|show]",
      ),
      action = positionals[2] || "list",
      entry = () => ({ kind: "link", url: options.link, label: options.label });
    const name = {
      list: "task.notes.list",
      add: "task.notes.add",
      edit: "task.notes.edit",
      remove: "task.notes.remove",
      show: "task.notes.show",
    }[action];
    if (!name)
      throw Error("Choose task links TASK_ID list, add, edit, remove or show.");
    const id =
        action === "list" || action === "add"
          ? undefined
          : need(positionals[3], `task links TASK_ID ${action} LINK_ID`),
      input =
        action === "list"
          ? { taskId }
          : action === "add"
            ? { taskId, ...entry() }
            : action === "edit"
              ? { taskId, id, ...entry() }
              : action === "show"
                ? { taskId, id, onIssue: !options.off }
                : { taskId, id };
    console.log(JSON.stringify(await localOrRequest(name, input), null, 2));
  } else if (
    command === "task" &&
    ["done", "reopen"].includes(positionals[0])
  ) {
    // A manual task (R61.13): a person marks it done or reopens it.
    const taskId = need(positionals[1], `task ${positionals[0]} TASK_ID`);
    console.log(
      JSON.stringify(
        await localOrRequest(
          positionals[0] === "done"
            ? "task.manual.complete"
            : "task.manual.reopen",
          positionals[0] === "done"
            ? {
                taskId,
                choice: options.refused
                  ? "refused"
                  : options.skipped
                    ? "skipped"
                    : "done",
                ...(options.link
                  ? { links: [{ url: options.link, label: options.label }] }
                  : {}),
              }
            : { taskId },
        ),
        null,
        2,
      ),
    );
  } else if (command === "task" && positionals[0] === "supersede") {
    const create = {};
    if (options.id) create.id = options.id;
    if (options.title) create.title = options.title;
    if (options.summary) create.summary = options.summary;
    if (options.requires !== undefined)
      create.requires = options.requires
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    console.log(
      JSON.stringify(
        await localOrRequest("task.supersede", {
          id: need(
            positionals[1],
            "task supersede TASK_ID [--title TITLE] ...",
          ),
          create,
          ...(options.reason ? { reason: options.reason } : {}),
        }),
        null,
        2,
      ),
    );
  } else if (command === "update") {
    const task = await localOrRequest("task.get", {
        id: need(positionals[0], "update TASK_ID [--status STATUS] ..."),
      }),
      value = { id: task.id };
    for (const key of [
      "status",
      "title",
      "summary",
      "notes",
      "nextAction",
      "owner",
    ])
      if (options[key]) value[key] = options[key];
    if (options.note)
      value.notes = [task.notes, options.note].filter(Boolean).join("\n");
    if (options.tags)
      value.tags = options.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    console.log(
      JSON.stringify(await localOrRequest("task.update", value), null, 2),
    );
  } else if (command === "activity")
    console.log(
      JSON.stringify(
        await localOrRequest("activity", {
          id: need(positionals[0], "activity TASK_ID --action ACTION ..."),
          action: options.action || "start",
          owner: options.owner,
          sessionId: options["session-id"],
          leaseId: options["lease-id"],
          branch: options.branch,
          worktree: options.worktree,
          summary: options.summary,
          leaseMinutes: options["lease-minutes"]
            ? Number(options["lease-minutes"])
            : undefined,
        }),
        null,
        2,
      ),
    );
  else if (command === "register-session" || command === "session-hook") {
    let hook = {};
    if (command === "session-hook") {
      let text = "";
      for await (const chunk of process.stdin) {
        text += chunk;
        if (text.length > 1000000) throw Error("Hook input is too large.");
      }
      hook = JSON.parse(text || "{}");
    }
    const result = await localOrRequest("session.register", {
      taskId:
        options.task ||
        process.env.AVOOZL_TASK ||
        process.env.AICOMMANDER_TASK ||
        process.env.NUPP_WORKSPACE_TASK,
      leaseId:
        options.lease ||
        process.env.AVOOZL_LEASE ||
        process.env.AICOMMANDER_LEASE ||
        process.env.NUPP_WORKSPACE_LEASE,
      provider: options.provider || "claude",
      providerSessionId: options.session || hook.session_id,
      agentId: options.agent || hook.agent_id,
    });
    if (command !== "session-hook")
      console.log(JSON.stringify(result, null, 2));
  } else if (command === "help") {
    // `avoozl help`, `avoozl help GROUP`, `avoozl help COMMAND` and
    // `avoozl help all`, all rendered from the one table in cli-help.mjs.
    // `avoozl OPERATION --help` has no page of its own and gets the overview.
    const text = helpText(positionals[0]) ?? (options.help ? helpText() : null);
    if (text === null)
      throw Error(
        `There is no help for ${positionals[0]}. ${PROGRAM} help lists every command by job.`,
      );
    console.log(text);
  } else if (["task", "checks"].includes(command))
    throw Error(
      {
        task: "Choose task supersede.",
        checks: "Choose checks run.",
      }[command],
    );
  else {
    if (!useServer() && !fs.existsSync(dbPath))
      throw Error(
        `${command} is not a command. ${helpPointer(command)} Operations need a workspace: avoozl init PATH, then use --workspace PATH.`,
      );
    try {
      console.log(
        JSON.stringify(
          await localOrRequest(
            command,
            input(),
            options.revision ? Number(options.revision) : undefined,
          ),
          null,
          2,
        ),
      );
    } catch (error) {
      if (!/^Unknown operation /.test(error.message)) throw error;
      throw Error(
        `Unknown command or operation ${command}. ${helpPointer(command)}`,
      );
    }
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
  process.exitCode =
    command === "session-hook" || (command === "next" && options.hook) ? 0 : 1;
}

// One spec in `plan batches` and the approve preview.
function batchLine(entry) {
  return [
    entry.spec,
    entry.hash.slice(0, 16),
    `${entry.tasks} tasks`,
    ...(entry.writes !== undefined && entry.writes !== null
      ? [`${entry.writes} writes`]
      : []),
    ...(entry.writesError ? [`writes unknown: ${entry.writesError}`] : []),
    ...(entry.loop ? ["loop"] : []),
    ...(entry.errors ? [`${entry.errors} lint errors`] : []),
    ...(entry.waitsOn ? [`waits on ${entry.waitsOn.join(", ")}`] : []),
    ...(entry.failure ? [`fails: ${entry.failure}`] : []),
  ].join("  ");
}
