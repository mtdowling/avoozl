// CLI commands of one kind: command, help lines and run.
import { startAppBackend } from "../executors/kirocrew/app-backend.mjs";
import { serveKirocrew, serveWorkspace } from "../mcp/mcp-stdio.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { machineStatus, serveStatus } from "../workspace/machine-status.mjs";
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
    startsWithBadConfig: true,
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
    startsWithBadConfig: true,
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
        // The process children and the last tick passes (R98.5).
        result = machineStatus({ stateDirectory: machineStateDirectory() });
      else if (action === "report") {
        const state = positionals[2] || options.state,
          token = options.token || process.env.AVOOZL_REPORT_TOKEN;
        need(
          positionals[1] && state,
          "runner report TASK done|blocked [--token T]",
        );
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
      } else throw Error("Use runner status|report.");
      console.log(JSON.stringify(result, null, 2));
    },
  },
];
