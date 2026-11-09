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

const args = process.argv.slice(2),
  options = {},
  positionals = [];
let command = "help",
  hasCommand = false;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (["dry-run", "final"].includes(key)) options[key] = true;
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
      process.env.NUPP_WORKSPACE_URL ||
      !fs.existsSync(dbPath)
    )
      return request(operation, input);
    const store = new Store(dbPath);
    try {
      const result = await new Operations(store).execute(operation, input);
      flushOutbox(store, config.plansRoot);
      return result;
    } finally {
      store.close();
    }
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
      port: config.port,
      projectionRoot: config.plansRoot,
      sourceRoot: config.plansRoot,
      host: config.host,
      manager,
    });
    process.once("SIGTERM", () => server.drain());
    process.once("SIGINT", () => server.drain());
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
  else if (command === "generate")
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
        process.env.NUPP_WORKSPACE_TASK,
      leaseId:
        options.lease ||
        process.env.AVOOZL_LEASE ||
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
  serve --workspace PATH                Start the site and agent host
  seed --workspace PATH [--example product-launch]
  examples --workspace PATH             List available example packs
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
of the application checkout. --db, --documents, --host, --port and --url
override workspace configuration. UI, CLI and MCP share application operations.`);
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
