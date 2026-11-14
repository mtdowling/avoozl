#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Store, fail } from "./store.mjs";
import { workflowSkill } from "./skill.mjs";
import { workspaceConfig, applicationRoot } from "./config.mjs";
import { initializeWorkspace } from "./workspace.mjs";
import { Operations } from "./operations.mjs";
import { driverSettingsPath } from "./driver.mjs";
import { handleMcp } from "./mcp.mjs";
import { createAppMcp } from "./app-mcp.mjs";
import { startAppBackend } from "./app-backend.mjs";
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
      ...planFiles(config.plansRoot),
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
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (
        [
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
          "off",
        ].includes(key) &&
        // `driver takeover --force --confirm SPEC` names the spec (R66.15).
        !(key === "confirm" && command === "driver")
      )
        options[key] = true;
      // `avoozl budget receipt TASK --json` prints the receipt object.
      else if (
        key === "json" &&
        args[0] === "budget" &&
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
  const env = options.env || process.env;
  const requestedWorkspace =
    options.workspace ||
    env.AVOOZL_WORKSPACE ||
    env.AICOMMANDER_WORKSPACE ||
    env.NUPP_WORKSPACE;
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
  } else if (command === "app-backend") {
    const server = startAppBackend({
      config,
      port: Number(options.port ?? process.env.PORT ?? 0),
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
        // Ideas (R63): `intake idea add|note|archive|restore`; the second
        // word is the idea action and the third the idea's id.
        idea: () => {
          const [, step, ideaId] = positionals,
            ideaCalls = {
              add: () => [
                "idea.capture",
                {
                  title: options.title,
                  ...(options.note ? { notes: options.note } : {}),
                  ...(options.link ? { links: [options.link] } : {}),
                },
              ],
              note: () => [
                "idea.append",
                {
                  id: ideaId,
                  ...(options.note ? { note: options.note } : {}),
                  ...(options.link ? { link: options.link } : {}),
                },
              ],
              archive: () => ["idea.archive", { id: ideaId }],
              restore: () => ["idea.restore", { id: ideaId }],
            };
          if (!ideaCalls[step])
            throw Error("Choose intake idea add, note, archive, or restore.");
          return ideaCalls[step]();
        },
      };
    if (!calls[action])
      throw Error(
        "Choose intake list, view, submit, sources, deliver, plan, confirm, or idea.",
      );
    if (["view", "deliver", "plan", "confirm"].includes(action))
      need(source && id, `intake ${action} SOURCE ID`);
    console.log(
      JSON.stringify(await localOrRequest(...calls[action]()), null, 2),
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
  // Budgets and receipts (§4.17).
  else if (command === "budget" && positionals[0] === "receipt") {
    const receipt = await localOrRequest("budget.receipt", {
      taskId: positionals[1],
    });
    if (options.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(receiptText(receipt));
  } else if (command === "budget" && positionals[0] === "view")
    console.log(
      JSON.stringify(await localOrRequest("budget.view", {}), null, 2),
    );
  else if (command === "budget" && positionals[0] === "raise")
    console.log(
      JSON.stringify(
        await localOrRequest("budget.raise", {
          taskId: positionals[1],
          ...(options.usd !== undefined ? { usd: Number(options.usd) } : {}),
          ...(options.tokens !== undefined
            ? { tokens: Number(options.tokens) }
            : {}),
          ...(options.credits !== undefined
            ? { credits: Number(options.credits) }
            : {}),
        }),
        null,
        2,
      ),
    );
  else if (
    command === "budget" &&
    ["stop", "acknowledge", "switch-to-stop"].includes(positionals[0])
  )
    console.log(
      JSON.stringify(
        await localOrRequest(
          {
            stop: "budget.stop",
            acknowledge: "budget.acknowledge",
            "switch-to-stop": "budget.switchToStop",
          }[positionals[0]],
          { taskId: positionals[1] },
        ),
        null,
        2,
      ),
    );
  else if (command === "flow" && positionals[0] === "stop")
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
  else if (command === "driver") {
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
  else if (command === "routing") {
    // Routing (§8.3): view, read-only preview, and validated edits with the
    // expected revision read first, as the page does.
    const action = positionals[0] || "view";
    let result;
    if (action === "view") result = await localOrRequest("routing.view", {});
    else if (action === "preview")
      result = await localOrRequest("routing.preview", {});
    else if (action === "set") {
      if (!options.file)
        throw Error(
          "Name the routing JSON: avoozl routing set --file ROUTING.json ({enabled, prompt, model}).",
        );
      const view = await localOrRequest("routing.view", {});
      result = await localOrRequest("routing.update", {
        where: "machine",
        routing: JSON.parse(fs.readFileSync(options.file, "utf8")),
        expectedHash: view.machineHash,
      });
    } else throw Error("Choose routing view, preview, or set.");
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "crews" && positionals[0] === "set") {
    if (!options.file)
      throw Error(
        "Name the crews JSON: avoozl crews set --file CREWS.json [--stale SECONDS].",
      );
    const view = await localOrRequest("routing.view", {});
    console.log(
      JSON.stringify(
        await localOrRequest("crews.update", {
          crews: JSON.parse(fs.readFileSync(options.file, "utf8")),
          ...(options.stale !== undefined
            ? {
                staleSeconds:
                  options.stale === "" ? null : Number(options.stale),
              }
            : {}),
          expectedHash: view.machineHash,
        }),
        null,
        2,
      ),
    );
  } else if (command === "pick-again")
    console.log(
      JSON.stringify(
        await localOrRequest("delivery.pickAgain", { taskId: positionals[0] }),
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
    } else
      throw Error(
        "Choose github status, configure, sync, project, preview, setup, or start.",
      );
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
      if (action === "list" || action === "status")
        result = (await live("/api/workspaces")) || registry.describe();
      else if (action === "add") {
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
          maxConcurrentRuns: Number(
            options["max-concurrent-runs"] ?? provided.maxConcurrentRuns ?? 2,
          ),
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
          maxConcurrentRuns: Number(
            options["max-concurrent-runs"] ?? provided.maxConcurrentRuns ?? 2,
          ),
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
      } else if (action === "concurrency") {
        const id = options.id || positionals[1],
          limit = Number(options.limit ?? positionals[2]);
        result =
          (await live(
            `/api/workspaces/${encodeURIComponent(
              id,
            )}/operations/workspace.concurrency.configure`,
            {
              method: "POST",
              body: { input: { limit } },
            },
          )) || registry.setConcurrency(id, limit);
      } else if (action === "rebuild") result = registry.rebuild();
      else
        throw Error(
          "Choose workspace list, add, adopt, remove, start, drain, resume, stop, set-default, concurrency, or rebuild.",
        );
      console.log(JSON.stringify(result, null, 2));
    } finally {
      registry.close();
    }
  } else if (command === "andon") {
    // The andon gate became repository rule actions; this answers with how.
    console.log(
      JSON.stringify(await localOrRequest("safety.status", {}), null, 2),
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
  else if (command === "task" && positionals[0] === "notes") {
    // Links and notes (R61.22): list and add for anyone; edit, remove and
    // show on the issue are a person's, as the command line is.
    const taskId = need(
        positionals[1],
        "task notes TASK_ID [add|edit|remove|show]",
      ),
      action = positionals[2] || "list",
      entry = () =>
        options.link !== undefined
          ? { kind: "link", url: options.link, label: options.label }
          : { kind: "note", text: options.note };
    const name = {
      list: "task.notes.list",
      add: "task.notes.add",
      edit: "task.notes.edit",
      remove: "task.notes.remove",
      show: "task.notes.show",
    }[action];
    if (!name)
      throw Error("Choose task notes TASK_ID list, add, edit, remove or show.");
    const id =
        action === "list" || action === "add"
          ? undefined
          : need(positionals[3], `task notes TASK_ID ${action} NOTE_ID`),
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
                choice: options.skipped ? "skipped" : "done",
                ...(options.note ? { note: options.note } : {}),
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
  } else if (command === "help")
    console.log(`Avoozl — plans, tasks, and agents in one local workspace.
  init PATH [--name NAME] [--port 9428]   Create an empty workspace
  seed --workspace PATH [--example product-launch]
  examples --workspace PATH             List available example packs
  status                                Show the machine host and workspaces
  workspace list
  workspace add ID --root PATH [--max-concurrent-runs 2]
  workspace adopt ID --root PATH         Adopt an existing stopped workspace in place
  workspace remove|start|drain|resume|stop|set-default ID
  workspace concurrency ID LIMIT        Zero pauses new dispatch
  workspace rebuild                     Rebuild the catalog from configuration
  project configure ID --root PATH [--branch main] [--worktrees PATH] [--json CONFIG]
  github configure OWNER/REPO --project ID [--assignee LOGIN] [--allowed-actors LOGINS]
  github sync [--repository OWNER/REPO]  Import assigned ready issues
  github project PLAN_ID --repository OWNER/REPO
  github preview PLAN_ID                 List projection writes, making none
  github status                          Show repository and machine registration
  rebuild [--repository OWNER/REPO]      Rebuild GitHub tasks from their issues and tracker plugin tasks from their records
  github setup --mode plans-repo|single-repo [--planning-repository OWNER/REPO]
      [--repositories A,B] [--project-owner LOGIN] [--project-number N | --project-title T]
      [--releases A,B] [--iteration] [--table-by-wave] [--no-epic]
                                         Preview the GitHub setup; add --confirm --preview-hash HASH to apply
  workspace-repo configure PATH [--branch avoozl-workspace] [--directory .avoozl]
  workspace-repo publish [--dry-run]     Safely publish portable planning state
  workspace-repo sync                    Hydrate from the configured private repo
  workspace-repo status                  Show portable repository revisions
  andon                                 Where the old andon gate went (rule actions and flow stop)
  planning publish PLAN_ID               Open a private planning pull request
  planning reconcile                     Project tasks from merged planning PRs
  query [--q QUERY] | show TASK_ID | update TASK_ID --status STATUS
  task notes TASK_ID [list]             A task's links and notes, newest first
  task notes TASK_ID add --note TEXT | --link URL --label LABEL
  task notes TASK_ID edit NOTE_ID --note TEXT | --link URL --label LABEL  (a person only)
  task notes TASK_ID remove NOTE_ID     Remove a link or note; it stays in the activity history (a person only)
  task notes TASK_ID show NOTE_ID [--off]  Show it on the task's issue, or stop (a person only)
  task done TASK_ID [--skipped] [--note TEXT] [--link URL --label LABEL]
                                         Mark a manual task done or skipped (a person only)
  task reopen TASK_ID                   Reopen a manual task; its dependents wait again (a person only)
  task supersede TASK_ID [--id NEW_ID] [--title TITLE] [--requires A,B] [--reason TEXT]
                                         Replace a local task; its dependents wait on the new one
  activity TASK_ID --action start|heartbeat|pause|finish ...
  skill --workspace PATH                Print the portable workflow skill
  mcp --workspace PATH                  Stdio MCP server for the workspace database
  mcp --url URL                         Stdio bridge to a running server
  mcp --kirocrew                        Kiro Crew app server: workspace per caller
  tick --workspace PATH                 Run one workspace tick and print its intents
  content [list]                        Content rule sets, open decisions and report findings
  content allow DECISION_ID --reason TEXT Allow one blocked write once (a person only)
  content show DECISION_ID              Read the matched line again from its source
  content check --push --task TASK_ID   The pre-push hook: refuse a push whose added lines match
  intake [list] [--source ID] [--kind KIND] [--state open|closed] [--untriaged]  Incoming items
  intake view SOURCE ID                 One incoming item, its route and history
  intake submit --source ID --file ITEMS.json  Send 1-100 items to an mcp intake source
  intake sources                        Declared intake sources and their read state
  intake deliver|plan SOURCE ID         Deliver this or Plan this on an item (a person only)
  intake confirm SOURCE ID --hash H     Confirm an item's changed text, H from intake view (a person only)
  intake idea add --title T [--note N] [--link URL]  Save an idea; it never runs work
  intake idea note ID [--note N] [--link URL]  Add a note or link to an open idea
  intake idea archive|restore ID        Archive or restore an idea (a person only)
  plugins [list]                        Declared plugins, their approval and health
  plugins add ID --path DIR|--package NAME|--git URL --ref REF [--subdir DIR] [--contract 1] [--config JSON] [--repository [--confirm-public]]
  plugins update ID                     Resolve a git plugin's ref again and fetch that commit
  plugins approve ID --hash HASH [--commit SHA] Approve the exact version, hash and commit \`plugins list\` shows
  plugins disable|enable|remove ID      Stop, restart, or remove a plugin; its tasks park as needs you
  plugins pack-preview ID [--repo OWNER/REPO]  What importing a plugin's pack would create, change, or keep
  plugins pack-import ID --preview HASH [--repo OWNER/REPO] [--accept-lowered] [--confirm-public]  Import the exact preview
  next [--hook]                         Crew Mode buckets: ready, running, waiting, needsYou, done
  flow [--repository ID] [--epic ID] [--plan ID [--phase ID]] [--window N] [--stage STAGE] Where delivery time goes (§4.11)
  epics                                 Epics across plans, each with member plans and computed progress
  epic ID                               One epic: goal, what done means, member plans, open decisions
  flow run-anyway STOP_ID --confirm     Resume dispatch while a line stop stays open (a person only)
  budget receipt TASK [--json]          A task's usage receipt: spend by stage, model and attempt (§4.17)
  budget view                           Every task's spend against its cap
  budget raise TASK [--usd N] [--tokens N] [--credits N]
                                        Raise a task's cap (a person only)
  budget stop|acknowledge|switch-to-stop TASK
                                        Act on a budget stop or an over-budget task (a person only)
  flow stop --scope all|repo|spec|task [--repository ID] [--spec ID] [--task ID] --reason TEXT
                                        Pull the Andon cord: stop new work in a scope
  flow stop --full --reason TEXT        Stop all agents: also stop every running chat Avoozl opened (needs the app backend)
  flow resume STOP_ID                   Resume a pulled stop (a person only)
  checks run --task TASK_ID             Run the declared checks in this worktree and record the pass
  driver status [SPEC]                  Which machine drives each spec, and why one reads only here
  driver handoff SPEC [--folder DIR [--unfinished]] [--cancel]
                                        Stop new work for SPEC; with --folder write the export (a person only)
  driver takeover SPEC [--file EXPORT.json | --rebuild [--yes]]
                                        Drive SPEC here once its plan issue names you (a person only)
  driver takeover SPEC --force --confirm SPEC [--file EXPORT.json | --yes]
                                        Assign the plan issue to you and take over by force (a person only)
  driver set [--label LABEL] [--heartbeat MINUTES]  This computer's machine label and heartbeat
  claim TASK_ID --slot SESSION [--model MODEL] Claim a ready leaf for a Crew Mode worker session
  report TASK_ID --slot SESSION --kind done|blocked|question|progress [--commit SHA] [--text TEXT]
  retry TASK_ID [--dismiss FINDING --reason TEXT] Resume a leaf that stopped for a decision
  pick-again TASK_ID                    The next attempt picks its agent and model afresh
  routing [view|preview]                Crews and checks, the routing prompt, providers; a dry run on ready tasks
  routing set --file ROUTING.json       This machine's routing: {enabled, prompt, model}
  crews set --file CREWS.json [--stale SECONDS]  This machine's crew tags, limits, and hand-back
  app-backend --workspace PATH          Kiro Crew app backend on 127.0.0.1 ($PORT)
  backup --workspace PATH --output FILE  Local-only; registered IDs are refused
  export --workspace PATH [--output FILE] Local-only; registered IDs are refused
  import SNAPSHOT.json --workspace PATH [--dry-run] Local-only; registered IDs are refused
  generate | check --workspace PATH    Reindex Markdown; validate the task graph
  health [--url URL]                    Ask a running app backend whether it is up
  OPERATION --json JSON [--revision N] --workspace PATH
  OPERATION --input FILE --workspace PATH

Use --workspace PATH or AVOOZL_WORKSPACE to choose data independently
of the application checkout. --db, --documents, --port, --operator and --url
override workspace configuration. UI, CLI and MCP share application operations.`);
  else if (["task", "checks", "crews"].includes(command))
    throw Error(
      {
        task: "Choose task supersede.",
        checks: "Choose checks run.",
        crews: "Choose crews set.",
      }[command],
    );
  else {
    if (!useServer() && !fs.existsSync(dbPath))
      throw Error(
        `${command} is not a command; run avoozl help. Operations need a workspace: avoozl init PATH, then use --workspace PATH.`,
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
        `Unknown command or operation ${command}. Run avoozl help for commands.`,
      );
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode =
    command === "session-hook" || (command === "next" && options.hook) ? 0 : 1;
}

// A receipt as a few lines of text, for the terminal.
function receiptText(r) {
  const usd = (n) => (n == null ? "no cap" : `$${Number(n).toFixed(2)}`);
  const lines = [
    `${r.taskId}: ${usd(r.totals.usd)} of ${usd(r.cap.usd)} (${r.cap.mode}, cap from ${r.cap.level || "nowhere"})`,
    `Tokens ${Math.round(r.totals.input + r.totals.output)}, credits ${r.totals.credits}, unpriced turns ${r.totals.unpricedTurns}`,
    `Prices: version ${r.price.version}${r.readAt ? `; last usage read ${r.readAt}` : ""}`,
  ];
  if (!r.complete)
    lines.push(
      `Incomplete: ${[...new Set(r.missing.map((m) => m.reason))].join(", ")}`,
    );
  for (const row of r.byStage)
    lines.push(
      `  ${row.stage}: ${usd(row.usd)}${row.priced ? "" : " (some unpriced)"}`,
    );
  return lines.join("\n");
}
