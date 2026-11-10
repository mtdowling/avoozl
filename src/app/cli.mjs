#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "./store.mjs";
import { startServer, flushOutbox } from "./server.mjs";
import { ensureAgentHost } from "./remote-manager.mjs";
import { workflowSkill } from "./skill.mjs";
import { workspaceConfig, applicationRoot } from "./config.mjs";
import { initializeWorkspace } from "./workspace.mjs";
import { Operations } from "./operations.mjs";
import { validate } from "../model.mjs";
import { generate } from "./compat-server.mjs";
import {
  installOpenHandsCanvasApp,
  openHandsCanvasAppStatus,
  setupOpenHandsAgents,
} from "./openhands-app.mjs";

const args = process.argv.slice(2),
  options = {},
  positionals = [];
let command = "help",
  hasCommand = false;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (
        [
          "dry-run",
          "final",
          "ahp",
          "auto-start",
          "inactive",
          "skip-verify",
        ].includes(key)
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
  const config = workspaceConfig(options),
    { dbPath, endpoint } = config;
  const requireDatabase = () => {
    if (!fs.existsSync(dbPath))
      throw Error(
        "Initialize a workspace first: avoozl init PATH, then use --workspace PATH.",
      );
  };
  const request = async (operation, input = {}, expectedRevision) => {
    const response = await fetch(endpoint + "/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, input, expectedRevision }),
    });
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
  const localOrRequest = async (operation, input = {}) => {
    if (
      options.url ||
      process.env.AVOOZL_URL ||
      process.env.AICOMMANDER_URL ||
      process.env.NUPP_WORKSPACE_URL ||
      !fs.existsSync(dbPath)
    )
      return request(operation, input);
    const store = new Store(dbPath);
    try {
      const result = await new Operations(store, {
        operator: config.operator,
      }).execute(operation, input);
      flushOutbox(store, config.plansRoot);
      return result;
    } finally {
      store.close();
    }
  };
  // The facade is a client of the running workspace. Starting it never creates
  // a second writer and never changes which process owns a provider session.
  const describeFacade = (facade) => ({
    url: facade.url,
    host: config.ahp.host,
    port: facade.port,
    workspaceId: facade.projection.workspaceId,
    clients: Object.fromEntries(
      [...facade.grants.entries()].map(([token, grant]) => [
        grant.name,
        {
          scope: grant.scope,
          address: facade.url,
          connectionToken: token,
        },
      ]),
    ),
    note: "Loopback only. Reach it remotely through an authenticated tunnel or an SSH port forward; never publish this listener.",
  });
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
  } else if (command === "skill") process.stdout.write(workflowSkill(config));
  else if (command === "serve") {
    requireDatabase();
    const manager = await ensureAgentHost({
      dbPath,
      manifestPath: config.agentManifest,
    });
    const server = startServer({
      dbPath,
      workspaceName: config.name,
      operator: config.operator,
      port: config.port,
      projectionRoot: config.plansRoot,
      sourceRoot: config.plansRoot,
      host: config.host,
      canvasOrigins: config.canvasOrigins,
      manager,
    });
    let facade = null;
    if (options.ahp) {
      const { startAhpFacade } = await import("./ahp/facade.mjs");
      const { agentProviderId } = await import("./ahp/projection.mjs");
      const { loadTokens } = await import("./ahp/main.mjs");
      const { localClient } = await import("./client.mjs");
      // The facade records the endpoint it serves, so wait until the site is
      // actually listening and its port is known.
      if (!server.listening)
        await new Promise((resolve, reject) => {
          server.once("listening", resolve);
          server.once("error", reject);
        });
      const { store } = server.workspace;
      facade = startAhpFacade({
        store,
        client: localClient(server.workspace.ops),
        file: config.ahp.projection,
        host: config.ahp.host,
        port: config.ahp.port,
        tokens: loadTokens(config.ahp.tokens),
        manifestPath: config.ahp.manifest,
        workspaceEndpoint: "http://127.0.0.1:" + server.address().port,
        models: async () => {
          const agents = [];
          for (const provider of ["claude", "codex"])
            try {
              const catalog = await server.workspace.ops.execute("models", {
                provider,
              });
              agents.push({
                provider: agentProviderId(provider),
                displayName: "Avoozl " + provider,
                description: "Sessions owned by this workspace's agent host.",
                models: catalog.models.map((m) => ({
                  id: m.id,
                  provider: agentProviderId(provider),
                  name: m.label || m.id,
                })),
                protectedResources: [],
              });
            } catch (error) {
              agents.push({
                provider: agentProviderId(provider),
                displayName: "Avoozl " + provider,
                description: "Unavailable: " + error.message,
                models: [],
                protectedResources: [],
              });
            }
          return agents;
        },
      });
      await facade.listening;
      console.log(
        "Agent host facade: " +
          facade.url +
          " (addresses in " +
          config.ahp.manifest +
          ")",
      );
    }
    const stop = async () => {
      if (facade) await facade.close();
      server.drain();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } else if (command === "ahp") {
    requireDatabase();
    const { startFacadeForWorkspace } = await import("./ahp/main.mjs");
    const facade = await startFacadeForWorkspace({
      dbPath,
      endpoint,
      manifestPath: config.ahp.manifest,
      projectionPath: config.ahp.projection,
      tokenFile: config.ahp.tokens,
      host: config.ahp.host,
      port: config.ahp.port,
    });
    console.log(JSON.stringify(describeFacade(facade), null, 2));
    const stop = async () => {
      await facade.close();
      facade.store.close();
      process.exit(0);
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } else if (command === "reload") {
    const before = await (await fetch(endpoint + "/api/health")).json();
    await request("server.drain");
    const log = fs.openSync(
      options.log || path.join(path.dirname(path.resolve(dbPath)), "web.log"),
      "a",
    );
    const argv = [
      fileURLToPath(import.meta.url),
      "serve",
      "--workspace",
      config.workspaceRoot,
      "--host",
      options.host || before.listenHost || config.host,
      "--db",
      path.resolve(dbPath),
      "--port",
      options.port || new URL(endpoint).port || String(config.port),
      "--documents",
      config.plansRoot,
      "--agent-manifest",
      config.agentManifest,
    ];
    const child = spawn(process.execPath, argv, {
      cwd: applicationRoot,
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();
    fs.closeSync(log);
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      await delay(100);
      try {
        const next = await (
          await fetch(endpoint + "/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).json();
        if (
          next.ok &&
          next.instanceId !== before.instanceId &&
          next.pid === child.pid
        ) {
          healthy = true;
          break;
        }
      } catch {}
    }
    if (!healthy)
      throw Error(
        "Replacement web server did not become healthy. Inspect web.log; agent sessions remain in the separate host.",
      );
    console.log("Web server reloaded; agent sessions remain running.");
  } else if (command === "host") {
    requireDatabase();
    const manager = await ensureAgentHost({
        dbPath,
        manifestPath: config.agentManifest,
      }),
      before = await manager.status(),
      action = positionals[0],
      result = action ? await manager.control(action) : before;
    if (action === "stop") {
      let alive = true;
      for (let i = 0; i < 300; i++) {
        try {
          process.kill(before.pid, 0);
        } catch {
          alive = false;
          break;
        }
        await delay(100);
      }
      if (alive)
        throw Error(
          "Agent host is still finishing shutdown. Wait before replacing its code.",
        );
    }
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "editor") {
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(config.ahp.manifest, "utf8"));
    } catch {}
    const editorClient = manifest?.clients?.editor;
    // A running facade records the endpoint it was pointed at, which is the
    // live server even when the saved port is not.
    const liveEndpoint = manifest?.workspaceEndpoint || endpoint;
    console.log(
      JSON.stringify(
        {
          endpoint: liveEndpoint,
          workspace: config.workspaceRoot,
          facade: manifest
            ? { url: manifest.url, startedAt: manifest.startedAt }
            : null,
          // Paste these into the VS Code profile that should drive this
          // workspace. `connectionToken` is a credential: never commit or
          // publish it.
          //
          // With --ssh HOST the editor reaches this machine's loopback facade
          // over SSH, so an editor on another machine needs no relay and the
          // facade is still never published. HOST is an entry in the client's
          // own ~/.ssh/config.
          settings: {
            "avoozl.endpoint": liveEndpoint,
            "avoozl.facadeManifest": config.ahp.manifest,
            ...(editorClient
              ? {
                  "chat.remoteAgentHostsEnabled": true,
                  "chat.remoteAgentHosts": [
                    {
                      address: editorClient.address,
                      name: config.name,
                      connectionToken: editorClient.connectionToken,
                      ...(options.ssh
                        ? {
                            sshConfigHost: options.ssh,
                            ...(options["ssh-user"]
                              ? { sshUser: options["ssh-user"] }
                              : {}),
                            ...(options["ssh-port"]
                              ? { sshPort: Number(options["ssh-port"]) }
                              : {}),
                            sshServerType: "standalone",
                          }
                        : {}),
                    },
                  ],
                  "chat.remoteAgentHostsAutoConnect": true,
                }
              : {}),
          },
          remote: options.ssh
            ? {
                route: "ssh",
                host: options.ssh,
                note: "The editor connects over SSH and reaches this machine's loopback facade, so nothing is published and no relay is involved. The editor's SSH fields are not a documented extension contract: confirm the session list appears before relying on it.",
              }
            : {
                route: "loopback only",
                note:
                  "To reach this facade from another machine, pass --ssh HOST, or set up an SSH local port forward to " +
                  (editorClient?.address || "the facade's port") +
                  ". Do not publish the listener.",
              },
          ...(manifest
            ? {}
            : {
                note:
                  "No facade manifest at " +
                  config.ahp.manifest +
                  ". Start one with: avoozl serve --ahp --workspace " +
                  config.workspaceRoot,
              }),
        },
        null,
        2,
      ),
    );
  } else if (command === "import") {
    const snapshot = JSON.parse(fs.readFileSync(positionals[0], "utf8"));
    const store = new Store(dbPath);
    try {
      console.log(
        JSON.stringify(
          store.importSnapshot(snapshot, {
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
    requireDatabase();
    const store = new Store(dbPath);
    try {
      if (command === "backup") {
        if (!options.output)
          throw Error("Choose --output for the SQLite backup.");
        store.db.prepare("VACUUM INTO ?").run(path.resolve(options.output));
        console.log("SQLite backup saved.");
      } else {
        const value = JSON.stringify(store.read(), null, 2) + "\n";
        if (options.output) fs.writeFileSync(options.output, value);
        else process.stdout.write(value);
      }
    } finally {
      store.close();
    }
  } else if (command === "mcp") {
    const lines = readline.createInterface({ input: process.stdin });
    for await (const line of lines) {
      let message;
      try {
        message = JSON.parse(line);
        const response = await fetch(endpoint + "/mcp", {
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
  } else if (command === "health")
    console.log(
      JSON.stringify(
        await (await fetch(endpoint + "/api/health")).json(),
        null,
        2,
      ),
    );
  else if (command === "seed")
    console.log(
      JSON.stringify(
        await localOrRequest("workspace.seed", {
          example: options.example || positionals[0] || "product-launch",
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
    } else if (action === "project") {
      operation = "github.project";
      value = {
        planId: options.plan || positionals[1],
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
    } else
      throw Error("Choose github status, configure, sync, project, or start.");
    console.log(
      JSON.stringify(await localOrRequest(operation, value), null, 2),
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
  } else if (command === "planning") {
    const action = positionals[0];
    if (action === "publish")
      console.log(
        JSON.stringify(
          await localOrRequest("planning.publish", {
            planId: options.plan || positionals[1],
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
  } else if (command === "openhands") {
    const action = positionals[0] || "status";
    if (action === "serve-backend") {
      if (!config.configured)
        initializeWorkspace(config.workspaceRoot, {
          name: options.name || "Avoozl",
          port: config.port,
        });
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          "serve",
          "--workspace",
          config.workspaceRoot,
          "--host",
          "127.0.0.1",
          "--port",
          String(config.port),
        ],
        { stdio: "inherit" },
      );
      const forward = (signal) => {
        if (!child.killed) child.kill(signal);
      };
      process.once("SIGINT", () => forward("SIGINT"));
      process.once("SIGTERM", () => forward("SIGTERM"));
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (status, signal) =>
          resolve(status ?? (signal ? 1 : 0)),
        );
      });
      process.exitCode = code;
    } else if (action === "install-app")
      console.log(
        JSON.stringify(
          await installOpenHandsCanvasApp({ source: options.source }),
          null,
          2,
        ),
      );
    else if (action === "setup-agents")
      console.log(
        JSON.stringify(
          await setupOpenHandsAgents({
            agents: options.agents,
            defaultAgent: options.default,
            verify: !options["skip-verify"],
          }),
          null,
          2,
        ),
      );
    else if (action === "status")
      console.log(JSON.stringify(await openHandsCanvasAppStatus(), null, 2));
    else
      throw Error(
        "Choose openhands status, setup-agents, install-app, or serve-backend.",
      );
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
        await localOrRequest("task.get", { id: positionals[0] }),
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
  else if (command === "update") {
    const task = await localOrRequest("task.get", { id: positionals[0] }),
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
          id: positionals[0],
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
    const result = await request("session.register", {
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
  } else if (command === "help")
    console.log(`Avoozl — plans, tasks, and agents in one local workspace.
  init PATH [--name NAME] [--port 9428]   Create an empty workspace
  serve --workspace PATH [--ahp]        Start the site and agent host
  ahp --workspace PATH                  Start the editor agent-host facade
  editor --workspace PATH [--ssh HOST]  Print editor client settings
  seed --workspace PATH [--example product-launch]
  examples --workspace PATH             List available example packs
  project configure ID --root PATH [--branch main] [--worktrees PATH] [--json CONFIG]
  github configure OWNER/REPO --project ID [--assignee LOGIN] [--allowed-actors LOGINS]
  github sync [--repository OWNER/REPO]  Import assigned ready issues
  github project PLAN_ID --repository OWNER/REPO
  github start TASK_ID [--provider openhands]
  github status                          Show repository and machine registration
  workspace-repo configure PATH [--branch avoozl-workspace] [--directory .avoozl]
  workspace-repo publish [--dry-run]     Safely publish portable planning state
  workspace-repo sync                    Hydrate from the configured private repo
  workspace-repo status                  Show portable repository revisions
  planning publish PLAN_ID               Open a private planning pull request
  planning reconcile                     Project tasks from merged planning PRs
  openhands install-app                  Install and enable Avoozl inside Canvas
  openhands setup-agents [--agents claude-code,codex] [--default AGENT]
                                         Configure agent CLIs for Avoozl chats
  openhands status                       Show Canvas App installation status
  openhands serve-backend                Run an OpenHands-owned Avoozl workspace
  serve --canvas-origin URL              Allow the exact OpenHands Canvas origin
  query [--q QUERY] | show TASK_ID | update TASK_ID --status STATUS
  activity TASK_ID --action start|heartbeat|pause|finish ...
  skill --workspace PATH                Print the portable workflow skill
  mcp --workspace PATH                  Stdio bridge to the running server
  reload --workspace PATH               Restart the web server, preserving agents
  host [drain|resume|stop] --workspace PATH
  backup --workspace PATH --output FILE
  export --workspace PATH [--output FILE]
  import SNAPSHOT.json --workspace PATH [--dry-run]
  generate | check | health --workspace PATH
  OPERATION --json JSON [--revision N] --workspace PATH
  OPERATION --input FILE --workspace PATH

Use --workspace PATH or AVOOZL_WORKSPACE to choose data independently
of the application checkout. --db, --documents, --host, --port, --operator and
--url override workspace configuration. UI, CLI and MCP share application operations.`);
  else
    console.log(
      JSON.stringify(
        await request(
          command,
          input(),
          options.revision ? Number(options.revision) : undefined,
        ),
        null,
        2,
      ),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = command === "session-hook" ? 0 : 1;
}
