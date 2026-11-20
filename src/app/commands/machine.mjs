// CLI commands of one kind: command, help lines and run.
import { startAppBackend } from "../executors/kirocrew/app-backend.mjs";
import { serveKirocrew, serveWorkspace } from "../mcp/mcp-stdio.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { machineStatus, serveStatus } from "../workspace/machine-status.mjs";
import { HOLDS_TASKS, readRunnerConfig } from "../workers/remote-runner.mjs";
import { reportByToken } from "../workers/report-match.mjs";
import { LinkStore } from "../serve/serve-auth.mjs";
import { Store } from "../store/store.mjs";
import { help } from "../cli/command-help.mjs";
import {
  approveHarnessByName,
  listHarnessDefinitions,
} from "../executors/harness-definitions.mjs";
import { agentSessionNote, cliRefusal } from "../mcp/mcp-policy.mjs";
import { runCredentialHelper } from "../github/credential-helper.mjs";

// A `process` child never makes an owner link for the page (MS3.2).
function refuseChild(name) {
  if (process.env.AVOOZL_CHILD)
    throw Error(
      `A process child may not run avoozl ${name}. Do it at this machine's command line.`,
    );
}

export const commands = [
  {
    command: "mcp",
    help: [
      help(
        "machine",
        "mcp --workspace PATH",
        "Stdio MCP server for agents, one per chat, on the workspace database; it never loops",
        { usage: "mcp --workspace PATH", about: "Stdio MCP server for agents" },
      ),
      help(
        "machine",
        "mcp --kirocrew",
        "The same, for the Kiro Crew app: workspace per caller",
      ),
    ],
    async run({
      options,
      env,
      requestedWorkspace,
      config,
      dbPath,
      requireDatabase,
      localOperations,
    }) {
      if (options.kirocrew)
        return serveKirocrew({
          fallback: requestedWorkspace ? config : null,
          env,
        });
      requireDatabase();
      const store = new Store(dbPath);
      try {
        await serveWorkspace({
          ops: localOperations(store),
          workspaceRoot: config.workspaceRoot,
        });
      } finally {
        store.close();
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
    command: "link",
    help: [
      help(
        "machine",
        "link",
        "A new one-time owner link for the standalone page each tick keeps up",
      ),
    ],
    run({ positionals }) {
      refuseChild("link");
      if (positionals.length) throw Error("Usage: avoozl link");
      const machine = machineAvoozlPaths();
      const running = serveStatus(machine.stateDirectory);
      if (!running.running || !running.origin)
        throw Error(
          "The standalone page is not running. Set serve.enabled in this machine's config.json and run: avoozl tick",
        );
      const links = new LinkStore(machine.stateDirectory);
      try {
        console.log(`${running.origin}/login?token=${links.make()}`);
      } finally {
        links.close();
      }
    },
  },
  {
    command: "credential",
    // The git credential helper Avoozl gives its own git commands; git runs
    // it, so it is not in the help a person reads.
    help: [],
    // Git runs it, with no workspace; it answers only under Avoozl's git.
    run({ positionals }) {
      return runCredentialHelper(positionals[0]);
    },
  },
  {
    command: "harness",
    help: [
      help(
        "machine",
        "harness list",
        "This machine's harness files and whether each is approved",
      ),
      help(
        "machine",
        "harness approve NAME",
        "Approve the harness file as it is now, by hash (a person only)",
      ),
    ],
    // Harness files belong to the machine, so no workspace is needed.
    run({ positionals, need }) {
      const usage = "harness list | harness approve NAME",
        { configDirectory } = machineAvoozlPaths();
      if (positionals[0] === "list") {
        const found = listHarnessDefinitions(configDirectory);
        if (!found.length) console.log("No harness files on this machine.");
        for (const d of found)
          console.log(
            `${d.name}  ${d.approved ? "approved" : d.changed ? "changed since approval" : "not approved"}`,
          );
      } else if (positionals[0] === "approve") {
        // Approving lets a program run here: the same person-only rule as
        // the operation (R95.5), and a note when an agent session typed it.
        const refusal = cliRefusal("harness.approve", {}),
          note = agentSessionNote("harness.approve", {});
        if (refusal) throw Error(refusal);
        if (note) console.error(note);
        const done = approveHarnessByName({
          configDirectory,
          name: need(positionals[1], usage),
        });
        console.log(`Approved ${done.name}\n${done.path}\nsha256 ${done.hash}`);
      } else throw Error(`Use ${usage}.`);
    },
  },
  {
    command: "runner",
    help: [
      help(
        "hooks",
        "runner report TASK_ID done|blocked [--token T] [--text TEXT]",
        "Report from the task's worktree; a worker's brief gives the token",
      ),
      help(
        "machine",
        "runner status --json",
        "This runner's tasks and workers; elsewhere the process children and the last tick passes",
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
        // process children and the last tick passes (R98.5).
        result = HOLDS_TASKS(readRunnerConfig(config.workspaceRoot))
          ? await localOrRequest("remote.status")
          : machineStatus({ stateDirectory: machineStateDirectory() });
      else if (action === "report") {
        const state = positionals[2] || options.state,
          token = options.token || process.env.AVOOZL_REPORT_TOKEN;
        need(
          positionals[1] && state,
          "runner report TASK done|blocked [--token T]",
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
    command: "driver",
    help: [
      help(
        "machine",
        "driver status [SPEC]",
        "Who drives each spec (its issue's assignee), and why one reads only here",
      ),
      help("machine", "driver set [--label LABEL]", "This computer's label"),
    ],
    async run({ options, positionals, localOrRequest }) {
      // The spec driver (§6.10) is the spec issue's assignee: hand a spec
      // to someone by reassigning its issue on GitHub.
      const action = positionals[0] || "status",
        planId = options.spec || positionals[1];
      let result;
      if (action === "status")
        result = await localOrRequest(
          "driver.status",
          planId ? { planId } : {},
        );
      else if (action === "set")
        result = await localOrRequest("driver.settings.update", {
          ...(options.label !== undefined ? { label: options.label } : {}),
        });
      else throw Error("Use driver status|set.");
      console.log(
        typeof result === "string" ? result : JSON.stringify(result, null, 2),
      );
    },
  },
];
