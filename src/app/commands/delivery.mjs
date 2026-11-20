// CLI commands of one kind: command, help lines and run.
import { loopLockPaths, takeLock } from "../executors/machine-lock.mjs";
import { requestPass } from "../executors/machine-server.mjs";
import { contentHook } from "../content/content-hook.mjs";
import { RETIRED_LANDING, landingStatusLine } from "./support.mjs";
import { help } from "../cli/command-help.mjs";
import { confirmHighRisk } from "../cli/confirm-high-risk.mjs";
import { confirmStep } from "../github/github-jobs.mjs";
import { watchTick } from "../tick/tick-watchdog.mjs";
import { laneTable } from "../sessions/lane-sessions.mjs";

async function runTaskDone({ options, positionals, localOrRequest, need }) {
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
            }
          : { taskId },
      ),
      null,
      2,
    ),
  );
}

export const commands = [
  {
    command: "fix",
    help: [
      help(
        "deliver",
        'fix "TEXT" --repo ID',
        "Start one change with no spec files; starting it approves it (a person only)",
      ),
      help(
        "deliver",
        "fix spec TASK_ID",
        "Make a fix that grew into a draft spec folder (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const result =
        positionals[0] === "spec"
          ? await localOrRequest("fix.spec", {
              taskId: need(positionals[1], "fix spec TASK_ID"),
            })
          : await localOrRequest("fix.start", {
              text: need(positionals.join(" ").trim(), 'fix "TEXT" --repo ID'),
              repository: need(options.repo, 'fix "TEXT" --repo ID'),
            });
      console.log(
        result.spec
          ? `${result.taskId} is now spec ${result.spec} (${result.folder}); the fix is archived.`
          : `Started ${result.taskId}.`,
      );
    },
  },
  {
    command: "tick",
    help: [
      help(
        "deliver",
        "tick --workspace PATH",
        "Run one workspace tick and print its intents",
      ),
    ],
    async run({ localOrRequest, dbPath, machineStateDirectory }) {
      // A running machine server runs the pass now (MS1.5); with none, this
      // process runs one tick under the workspace loop lock (MS2.3).
      const pass = await requestPass({
        stateDirectory: machineStateDirectory(),
      });
      if (pass) return console.log(JSON.stringify(pass, null, 2));
      const loop = dbPath
        ? takeLock(
            loopLockPaths(dbPath),
            { pid: process.pid, at: new Date().toISOString() },
            { tries: 1 },
          )
        : { held: true, close() {} };
      if (!loop.held)
        throw Error(
          `Another process (pid ${loop.holder?.pid ?? "unknown"}) runs this workspace's loop.`,
        );
      try {
        console.log(
          JSON.stringify(await localOrRequest("workspace.tick"), null, 2),
        );
      } finally {
        loop.close();
      }
    },
  },
  {
    command: "tick watchdog",
    help: [
      help(
        "deliver",
        "tick watchdog --workspace PATH [--stale-minutes 10] [--dry-run]",
        "Post a macOS notification when the last tick is stale or failed; it only reads",
      ),
    ],
    run({ options, config, need }) {
      need(config.workspaceRoot, "tick watchdog --workspace PATH");
      process.exitCode = watchTick(config.workspaceRoot, {
        staleMinutes: Number(options["stale-minutes"] ?? 10),
        dryRun: Boolean(options["dry-run"]),
      });
    },
  },
  {
    command: "graph",
    help: [
      help(
        "deliver",
        "graph [SPEC] [--format mermaid] [--write]",
        "The task graph by phase in list order, as text or a Mermaid flowchart",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      if (options.write) {
        if (!positionals[0])
          throw Error("Name the spec: avoozl graph SPEC --write.");
        console.log(
          JSON.stringify(
            await localOrRequest("spec.graph.write", { spec: positionals[0] }),
            null,
            2,
          ),
        );
        return;
      }
      const graph = await localOrRequest(
        "graph.view",
        positionals[0] ? { spec: positionals[0] } : {},
      );
      if (options.format && !["text", "mermaid"].includes(options.format))
        throw Error("Choose --format text or --format mermaid.");
      process.stdout.write(
        options.format === "mermaid" ? graph.mermaid : graph.text,
      );
    },
  },
  {
    command: "next",
    help: [
      help(
        "deliver",
        "next [--claim]",
        "The ready, running, waiting, Needs you and done lists; --claim takes the first ready task by its claim branch",
      ),
    ],
    async run({ options, localOrRequest }) {
      console.log(
        JSON.stringify(
          await localOrRequest(
            "runner.next",
            options.claim ? { claim: true } : {},
          ),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "lanes",
    help: [
      help(
        "deliver",
        "lanes [--json]",
        "This machine's lane sessions: each lane's role, harness, state, task and how to open its session",
      ),
    ],
    async run({ options, localOrRequest }) {
      const { lanes } = await localOrRequest("lanes.view", {});
      if (options.json) {
        console.log(JSON.stringify(lanes, null, 2));
        return;
      }
      process.stdout.write(laneTable(lanes));
    },
  },
  {
    command: "lane resume",
    help: [
      help(
        "deliver",
        "lane resume LANE",
        "Open a new session for a lane a person closed, on the next tick (a person only)",
      ),
    ],
    async run({ positionals, localOrRequest, need }) {
      console.log(
        JSON.stringify(
          await localOrRequest("lane.resume", {
            lane: need(positionals[0], "lane resume LANE"),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "land",
    help: [
      help(
        "land",
        "land TASK_ID",
        "Land a task you claimed now, by its repository's landing mode",
      ),
    ],
    async run({ positionals, localOrRequest, need }) {
      console.log(
        JSON.stringify(
          await localOrRequest("runner.land", {
            taskId: need(positionals[0], "land TASK_ID"),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "claim",
    help: [
      help(
        "deliver",
        "claim delete REPOSITORY BRANCH [--yes]",
        "Delete a stale claim branch on origin so its task is ready again; asks first (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need, env }) {
      if (positionals[0] !== "delete")
        throw Error("Use claim delete REPOSITORY BRANCH.");
      const usage = "claim delete REPOSITORY BRANCH",
        repository = need(positionals[1], usage),
        branch = need(positionals[2], usage);
      // The same high-risk confirm the page shows (simplify §D3).
      const allow = await confirmHighRisk(
        [
          confirmStep({
            job: "claim-delete",
            target: repository,
            action: `Delete ${branch}`,
          }),
        ],
        { yes: options.yes === true, localOrRequest, env },
      );
      if (allow === null) {
        console.log("Cancelled: nothing was deleted.");
        return;
      }
      console.log(
        JSON.stringify(
          await localOrRequest("claim.delete", { repository, branch, allow }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "worktree",
    help: [
      help(
        "hooks",
        "worktree prepare TASK_ID",
        "Create or return the task's worktree and print it",
      ),
    ],
    async run({ positionals, localOrRequest }) {
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
    },
  },
  {
    command: "content hook",
    help: [
      help(
        "hooks",
        "content hook",
        "A PreToolUse hook: refuse a session's write that matches a rule",
      ),
    ],
    async run({ config, dbPath }) {
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
    },
  },
  {
    command: "take",
    help: [
      help(
        "deliver",
        "take TASK_ID [--release [--discard]]",
        "Take a ready task by hand: prints its worktree and the report command; --release gives it back",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      // Taking a task by hand is a person's: not from an agent the supervisor started.
      if (process.env.AVOOZL_CHILD)
        throw Error(
          "Taking a task is a person's. This command is running inside an agent the supervisor started.",
        );
      console.log(
        JSON.stringify(
          await localOrRequest("runner.take", {
            taskId: positionals[0],
            ...(options.release ? { release: true } : {}),
            ...(options.discard ? { discard: true } : {}),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "retry",
    help: [
      help(
        "deliver",
        "retry TASK_ID [--dismiss FINDING --reason TEXT]",
        "Resume a leaf that stopped for a decision",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      console.log(
        JSON.stringify(
          await localOrRequest("delivery.retry", {
            taskId: positionals[0],
            ...(options.dismiss
              ? {
                  dismiss: [
                    { finding: options.dismiss, reason: options.reason },
                  ],
                }
              : {}),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "verify allow",
    help: [
      help(
        "deliver",
        "verify allow TASK_ID --reason TEXT",
        "Let one held commit's protected paths land",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
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
    },
  },
  {
    command: "checks run",
    help: [
      help(
        "deliver",
        "checks run --task TASK_ID",
        "Run the declared checks in this worktree and record the pass",
      ),
    ],
    async run({ options, localOrRequest }) {
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
    },
  },
  {
    command: "landing",
    help: [
      help(
        "land",
        "landing status [--json]",
        "Per base: who waits, the batch being tested, the last batches and the size limit, from stored records",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      const action = positionals[0];
      if (action === "status") {
        // The same read as the Landing queue page and the MCP read: store only.
        const view = await localOrRequest("landing.queue");
        console.log(
          options.json
            ? JSON.stringify(view, null, 2)
            : view.bases.map(landingStatusLine).join("\n") ||
                "Nothing waits to land.",
        );
      } else if (action === "submit" || action === "review")
        console.log(RETIRED_LANDING);
      else throw Error("Choose landing status.");
    },
  },
  {
    command: "activity",
    help: [
      help(
        "deliver",
        "activity TASK_ID --action start|heartbeat|pause|finish ...",
        "",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
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
    },
  },
  {
    command: "update",
    help: [help("deliver", "update TASK_ID --status STATUS", "")],
    async run({ options, positionals, localOrRequest, need }) {
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
    },
  },
  {
    command: "task done",
    help: [
      help(
        "deliver",
        "task done TASK_ID [--skipped|--refused]",
        "Mark a manual task done, skipped or refused (a person only;\nrefused is a no-go and keeps its dependents held)",
      ),
    ],
    run: runTaskDone,
  },
  {
    command: "task reopen",
    help: [
      help(
        "deliver",
        "task reopen TASK_ID",
        "Reopen a manual task; its dependents wait again (a person only)",
      ),
    ],
    run: runTaskDone,
  },
  {
    command: "flow stop",
    help: [
      help(
        "deliver",
        "flow stop --scope all|repo|spec|task [--repository ID] [--spec ID] [--task ID] --reason TEXT",
        "Pull the Andon cord: stop new work in a scope",
      ),
      help(
        "deliver",
        "flow stop --full --reason TEXT",
        "Stop all agents: also stop every running chat Avoozl opened (needs the app backend)",
      ),
    ],
    async run({ options, localOrRequest }) {
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
    },
  },
  {
    command: "flow resume",
    help: [
      help(
        "deliver",
        "flow resume STOP_ID",
        "Resume a pulled stop (a person only)",
      ),
    ],
    async run({ positionals, localOrRequest, need }) {
      console.log(
        JSON.stringify(
          await localOrRequest("flow.resume", {
            stopId: need(positionals[1], "flow resume STOP_ID"),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "flow run-anyway",
    help: [
      help(
        "deliver",
        "flow run-anyway STOP_ID --confirm",
        "Resume dispatch while a line stop stays open (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
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
    },
  },
];
