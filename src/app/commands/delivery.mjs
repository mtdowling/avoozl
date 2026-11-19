// CLI commands of one kind: command, help lines and run.
import { contentHook } from "../content-hook.mjs";
import { RETIRED_LANDING, landingStatusLine } from "./support.mjs";
import { help } from "../command-help.mjs";

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
}

export const commands = [
  {
    command: "tick",
    help: [
      help(
        "deliver",
        "tick --workspace PATH",
        "Run one workspace tick and print its intents",
      ),
    ],
    async run({ localOrRequest }) {
      console.log(
        JSON.stringify(await localOrRequest("workspace.tick"), null, 2),
      );
    },
  },
  {
    command: "next",
    help: [
      help(
        "deliver",
        "next",
        "The ready, running, waiting, Needs you and done lists",
      ),
    ],
    async run({ localOrRequest }) {
      console.log(JSON.stringify(await localOrRequest("runner.next"), null, 2));
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
    command: "claim",
    help: [
      help(
        "deliver",
        "claim TASK_ID [--release [--discard]]",
        "Take a ready task by hand: prints its worktree and the report command; --release gives it back",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      // A manual claim is a person's: not from an agent the supervisor started.
      if (process.env.AVOOZL_CHILD)
        throw Error(
          "A claim is a person's. This command is running inside an agent the supervisor started.",
        );
      console.log(
        JSON.stringify(
          await localOrRequest("runner.claim", {
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
    command: "task links",
    help: [
      help(
        "deliver",
        "task links TASK_ID [list]",
        "A task's links, newest first",
      ),
      help("deliver", "task links TASK_ID add --link URL --label LABEL", ""),
      help(
        "deliver",
        "task links TASK_ID edit LINK_ID --link URL --label LABEL",
        "(a person only)",
      ),
      help(
        "deliver",
        "task links TASK_ID remove LINK_ID",
        "Remove a link; it stays in the activity history (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Task links (R61.22): list and add for anyone; edit and remove are a
      // person's, as the command line is.
      const taskId = need(
          positionals[1],
          "task links TASK_ID [add|edit|remove]",
        ),
        action = positionals[2] || "list",
        entry = () => ({
          kind: "link",
          url: options.link,
          label: options.label,
        });
      const name = {
        list: "task.notes.list",
        add: "task.notes.add",
        edit: "task.notes.edit",
        remove: "task.notes.remove",
      }[action];
      if (!name)
        throw Error("Choose task links TASK_ID list, add, edit or remove.");
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
                : { taskId, id };
      console.log(JSON.stringify(await localOrRequest(name, input), null, 2));
    },
  },
  {
    command: "task done",
    help: [
      help(
        "deliver",
        "task done TASK_ID [--skipped|--refused] [--link URL --label LABEL]",
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
    command: "task supersede",
    help: [
      help(
        "deliver",
        "task supersede TASK_ID [--id NEW_ID] [--title TITLE] [--requires A,B] [--reason TEXT]",
        "Replace a local task; its dependents wait on the new one",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
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
    },
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
