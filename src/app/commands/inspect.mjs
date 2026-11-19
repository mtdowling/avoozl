// CLI commands of one kind: command, help lines and run.
import { validate } from "../../model.mjs";
import { Store } from "../store.mjs";
import fs from "node:fs";
import { help } from "../command-help.mjs";
import { runWorkspace } from "./setup.mjs";

async function runEpics({ positionals, command, localOrRequest }) {
  console.log(
    JSON.stringify(
      command === "epic"
        ? await localOrRequest("epic.get", { id: positionals[0] })
        : await localOrRequest("epic.list"),
      null,
      2,
    ),
  );
}

export const commands = [
  {
    command: "status",
    help: [
      help(
        "inspect",
        "status [--workspace PATH]",
        "The named workspace, then the machine host, its workspaces, the supervisor and its children",
        {
          usage: "status --workspace PATH",
          about: "The workspace, then this machine",
        },
      ),
    ],
    run: runWorkspace,
  },
  {
    command: "query",
    help: [
      help("inspect", "query [--q QUERY]", "Tasks, all or matching a query", {
        usage: "query --workspace PATH",
        about: "List tasks",
      }),
    ],
    async run({ options, localOrRequest }) {
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
    },
  },
  {
    command: "show",
    help: [
      help("inspect", "show TASK_ID", "One task", {
        usage: "show TASK_ID --workspace PATH",
        about: "One task",
      }),
    ],
    async run({ positionals, localOrRequest, need }) {
      const id = need(positionals[0], "show TASK_ID");
      // A pull request review a `process` child wrote (NK4.4).
      if (/^pr-review:/.test(id)) {
        const shown = await localOrRequest("review.chat.show", { id });
        console.log(
          shown.review
            ? `${shown.repository}#${shown.number} at ${shown.review.head ?? "unknown head"}\n\n${shown.review.text}`
            : JSON.stringify(shown, null, 2),
        );
      } else
        console.log(
          JSON.stringify(await localOrRequest("task.get", { id }), null, 2),
        );
    },
  },
  {
    command: "check",
    help: [
      help("inspect", "check --workspace PATH", "Validate the task graph", {
        usage: "check --workspace PATH",
        about: "Validate the task graph",
      }),
    ],
    run({ dbPath, requireDatabase }) {
      requireDatabase();
      const store = new Store(dbPath);
      try {
        const errors = validate(store.read());
        if (errors.length) throw Error(errors.join("\n"));
        console.log("Valid SQLite task graph and plan references.");
      } finally {
        store.close();
      }
    },
  },
  {
    command: "flow",
    help: [
      help(
        "inspect",
        "flow [--repository ID] [--epic ID] [--plan ID [--phase ID]] [--window N] [--stage STAGE]",
        "Where delivery time goes (§4.11)",
      ),
    ],
    async run({ options, localOrRequest }) {
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
    },
  },
  {
    command: "epics",
    help: [
      help(
        "inspect",
        "epics",
        "Epics across plans, each with member plans and computed progress",
      ),
    ],
    run: runEpics,
  },
  {
    command: "epic",
    help: [
      help(
        "inspect",
        "epic ID",
        "One epic: goal, what done means, member plans, open decisions",
      ),
    ],
    run: runEpics,
  },
  {
    command: "review drafts",
    help: [
      help(
        "inspect",
        "review drafts [--repository OWNER/REPO] [--state STATE] [--json]",
        "Review drafts made from the review label, and the GitHub search for them",
      ),
    ],
    async run({ options, localOrRequest }) {
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
    },
  },
  {
    command: "content",
    help: [
      help(
        "deliver",
        "content allow DECISION_ID --reason TEXT",
        "Allow one blocked write once (a person only)",
      ),
      help(
        "inspect",
        "content [list]",
        "Content rule sets, open decisions and report findings",
      ),
      help(
        "inspect",
        "content show DECISION_ID",
        "Read the matched line again from its source",
      ),
      help(
        "hooks",
        "content check --push --task TASK_ID",
        "The pre-push hook: refuse a push whose added lines match",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
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
    },
  },
  {
    command: "health",
    help: [
      help(
        "inspect",
        "health [--url URL]",
        "Ask a running app backend whether it is up",
      ),
    ],
    async run({ endpoint }) {
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
    },
  },
];
