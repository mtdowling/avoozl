// Avoozl's grouped MCP tools (R56): one tool per thing a session acts on, each
// with an `action` naming one existing operation. The authority class of each
// operation (operation-table.mjs) is unchanged. Approvals, settings, setup and
// deletes have their own tools (plans_autopilot, plans_settings, plans_setup,
// plans_plugin_admin, plans_content_admin, plans_control), so no role that is
// allowed an older tool gains them. Activity records each of their calls with
// the caller, and a delete runs only with `confirm: true` in its input.
//
// Each action is [operation, hint] or [operation, hint, shape], where `shape`
// rewrites the input before the call (stop_line never stops every agent).
type Shape = (input: Record<string, unknown>) => Record<string, unknown>;
type Action = [operation: string, hint: string, shape?: Shape];
interface GroupedTool {
  summary: string;
  actions: Record<string, Action>;
}

const tools: Record<string, GroupedTool> = {
  plans_workspace: {
    summary: "The workspace, read only.",
    actions: {
      get: [
        "workspace",
        "repositories, plan drafts, run history, integration queue, GitHub state",
      ],
      describe: ["client.describe", "client contract and operations"],
      configuration: ["configuration.get", "the saved .avoozl.json settings"],
      flow_settings: ["flow.settings.get", "flow settings"],
      activity_settings: [
        "activity.settings.get",
        "how many days the activity log keeps rows",
      ],
      delivery_settings: [
        "delivery.settings.get",
        "the writer agent and model and pull request feedback settings",
      ],
      conversation_settings: [
        "conversations.settings.get",
        "conversation settings",
      ],
      trash: ["trash", "deleted plans and runs"],
      local_ignore: [
        "local.ignore.status",
        "whether Avoozl files are ignored locally",
      ],
    },
  },
  plans_maintain: {
    summary: "Workspace upkeep: the tick, local ignore lines.",
    actions: {
      tick: ["workspace.tick", "run one bounded tick"],
      fix_local_ignore: [
        "local.ignore.fix",
        "add the missing local ignore lines",
      ],
    },
  },
  plans_view: {
    summary: "Read-only views of the graph and its delivery.",
    actions: {
      graph: ["graph.view", "the dependency graph, optionally one plan"],
      delivery: ["delivery.view", "delivery columns"],
      claims: [
        "claims.view",
        "every claim branch: task, holder, head, age and whether it is stale",
      ],
      flow: ["flow.view", "lead time, stages, bottlenecks"],
      insights: [
        "insights.view",
        "the Insights numbers: {days?: 7|30|90, spec?, repo?}",
      ],
      log: ["workspace.tick.log", "recent tick log"],
      health: ["workspace.tick.health", "tick health"],
      activity: [
        "activity.list",
        "the activity log: {source?, kind?, actor?, offset?}, 100 rows a page",
      ],
      recent: ["activity.recent", "recent task events"],
      queue: ["queue", "ready work, resource conflicts, queued integration"],
      next: ["runner.next", "what a Crew Mode conductor does next"],
      query: ["query", "search tasks"],
    },
  },
  plans_plan: {
    summary:
      "Plans and their Kiro spec folders. Approve with plans_control approve_plan, Approve in the app, or an approver's commit on main.",
    actions: {
      list: ["plan.list", "stored plans"],
      table: ["plan.table", "plans grouped with progress"],
      epics: ["epic.list", "epics across plans with computed progress"],
      epic: [
        "epic.get",
        "one epic: goal, what done means, member plans, decisions: {id}",
      ],
      specs: ["plan.specs", "spec folders on disk"],
      get: ["plan.get", "one plan, its revisions and receipts"],
      read_spec: ["plan.spec.read", "a spec folder's documents"],
      lint: ["plan.lint", "deterministic checks on a stored revision"],
      preview: ["plan.preview", "the tasks approval would publish"],
      create: ["plan.create", "store a spec folder as a draft: {spec}"],
      save: [
        "plan.save",
        "reload a spec folder as the next draft: {id, expectedHash}",
      ],
      propose: [
        "plan.propose",
        "propose adjacent work as a draft, not executable until approved",
      ],
      classify: ["plan.classify", "set plan metadata"],
    },
  },
  plans_task: {
    summary: "One task: read it, change it, deliver it.",
    actions: {
      get: ["task.get", "one task"],
      detail: ["task.detail", "the task drawer's detail"],
      sessions: ["task.sessions", "its Kiro Crew sessions"],
      handoff: ["handoff", "design, dependencies, runs and evidence"],
      preview_change: ["task.change.preview", "what an update would change"],
      update: [
        "task.update",
        "metadata, status (deferred pauses) or dependencies",
      ],
      archive: ["task.archive", "archive, only when the user permits"],
      unarchive: ["task.unarchive", "undo archive"],
      start: ["task.start", "Start now"],
      retry: [
        "delivery.retry",
        "resume a stopped delivery, when the person asks",
      ],
      integrate: ["integration.merge", "rebase, revalidate, fast-forward"],
      accept: ["task.accept", "record acceptance evidence"],
      activity: ["activity", "an activity lease"],
    },
  },
  plans_executor: {
    summary:
      "Private Kiro Crew executor transport; process requests are never taken here.",
    actions: {
      take: [
        "executor.kirocrew.take",
        "claim one native request by id and version",
      ],
      release: [
        "executor.kirocrew.release",
        "release only after a definitive before-open refusal",
      ],
      complete: [
        "executor.kirocrew.complete",
        "complete a claimed message as sent or refused",
      ],
    },
  },
  plans_session: {
    summary: "Executor sessions working on tasks.",
    actions: {
      bind: ["session.bind", "bind a slot to a task"],
      rediscover: ["session.rediscover", "rebuild lost bindings from titles"],
      request: ["session.request", "ask the tick to open a session"],
      start: ["run.start", "dispatch a task: {taskId, repository, agent}"],
      status: ["session.status", "record a session's status"],
      report: ["session.report", "report on your bound task"],
      worktree: ["worktree.prepare", "create or return the leaf's worktree"],
      checks: ["flow.checks.run", "run declared checks at HEAD"],
      stop_line: [
        "flow.stop",
        "pull the Andon cord: {scope: all|repo|spec|task, repository?, spec?, taskId?, reason}; plans_control resume_stop resumes",
        ({ full: _full, ...rest }) => rest,
      ],
      reply: ["reply.post", "post a responder's one reply"],
    },
  },
  plans_conflicts: {
    summary: "Conflicts and open decisions.",
    actions: {
      view: ["conflicts.view", "open conflicts and decisions"],
      settle: [
        "conflicts.settle",
        "reviewed, unblock, dismiss, settle, reopen or keep items",
      ],
    },
  },
  plans_intake: {
    summary:
      "A person's requests, saved searches, and incoming items from intake sources. Plan this and Deliver this are in plans_control.",
    actions: {
      capture: [
        "task.capture",
        "record a person's own request as untriaged. Not a channel for work an agent discovered: use plans_plan propose",
      ],
      submit: ["intent.submit", "submit an intent"],
      get: ["intent.get", "read an intent"],
      submit_items: [
        "intake.submit",
        "send 1-100 items to an mcp intake source: {source, items}",
      ],
      items: [
        "intake.list",
        "incoming items: {source?, kind?, state?, untriaged?, offset?}",
      ],
      item: ["intake.view", "one incoming item: {source, id}"],
      sources: [
        "intake.sources",
        "declared intake sources and their read state",
      ],
    },
  },
  plans_document: {
    summary: "Workspace documents and reports.",
    actions: {
      get: ["document.get", "one document"],
      update: ["document.update", "update a document"],
      save_report: ["report.save", "save a report"],
      save_retro: [
        "retro.save",
        "save a retro report as Markdown: {scope, text}",
      ],
      retros: ["retro.list", "saved retros, newest first"],
      read_retro: ["retro.read", "one saved retro: {name}"],
    },
  },
  plans_github: {
    summary:
      "GitHub reads. Setup writes are in plans_setup and settings in plans_settings.",
    actions: {
      landing_queue: [
        "landing.view",
        "what waits to land on each base branch, in order and why, and what landed lately",
      ],
      integration_branches: [
        "integration.view",
        "each integration branch: tasks merged, commits behind the default branch, head checks, acceptance and landing approval",
      ],
      epics: [
        "epics.view",
        "epics, specs and phases: gate, release count and held reasons, and specs not on GitHub yet",
      ],
      release_queue: [
        "radar.releasequeue",
        "the Release queue, empty since labels stopped releasing work",
      ],
      integration_branch: [
        "radar.integrationbranch",
        "check an epic's integration branch: exists, protected, not the default",
      ],
      repositories: ["github.repositories", "registered GitHub repositories"],
      labels: ["github.repository.labels", "a repository's labels"],
      inspect: ["github.repository.inspect", "branch rules and checks"],
      settings: ["github.settings.get", "GitHub settings"],
      validate: ["github.settings.validate", "check GitHub settings"],
      detect_repository: [
        "github.repository.detect",
        "find a registered repository's GitHub remote",
      ],
      publish: ["planning.publish", "publish an approved plan"],
      reconcile: ["planning.reconcile", "reconcile planning pull requests"],
    },
  },
  plans_repos: {
    summary:
      "Registered repositories, read only. Add or remove one with plans_setup.",
    actions: {
      list: ["repositories.list", "registered repositories"],
      detect: [
        "repositories.detect",
        "what Add repository would register, and the kind of repository it looks like",
      ],
      status: ["workspace.repository.status", "the workspace repository"],
    },
  },
  plans_plugins: {
    summary:
      "Plugins, read only. Add, approve or remove one with plans_plugin_admin.",
    actions: {
      list: ["plugins.list", "installed plugins"],
      preview: ["plugin.preview", "what a plugin source holds"],
      check_stages: [
        "plugin.checks.stages",
        "the phase and branch plugin check results on this machine",
      ],
    },
  },
  plans_content: {
    summary: "Content rules. Terms and Allow once are in plans_content_admin.",
    actions: {
      rules: ["content.rules", "rule sets and their state"],
      check: ["content.check", "check text against the rules"],
    },
  },
};

// The tools for approvals, settings, setup and deletes (R56.2).
Object.assign(tools, {
  plans_autopilot: {
    summary:
      "Autopilot for this workspace: the repository's delivery block and this machine's loop, switched together as Settings › Autopilot does.",
    actions: {
      status: ["autopilot.status", "whether Autopilot is on, and why not"],
      set: ["autopilot.set", "turn it on or off: {on: true|false}"],
      release_runner: [
        "delivery.runner.release",
        "remove delivery.runner so the tick runs this workspace: {expectedHash?}",
      ],
    },
  },
  plans_settings: {
    summary:
      "Change workspace and machine settings. Read them with plans_workspace.",
    actions: {
      workspace: ["configuration.update", "the .avoozl.json settings"],
      flow: ["flow.settings.update", "flow settings"],
      models: ["models.settings.update", "chat models per role"],
      delivery: [
        "delivery.settings.update",
        "delivery limits, landing.pr, this machine's loop and engine.update",
      ],
      conversations: ["conversations.settings.update", "conversation settings"],
      activity: [
        "activity.settings.update",
        "how many days the activity log keeps rows",
      ],
      github: ["github.settings.update", "GitHub settings, Who counts"],
      telemetry: ["telemetry.configure", "telemetry export"],
      agent_instructions: [
        "agent.instructions.toggle",
        "turn one agent rule on or off",
      ],
      epic_context: ["context.machine.set", "this machine's epicContext block"],
    },
  },
  plans_setup: {
    summary:
      "Repositories, the workspace repository, GitHub setup, harnesses and rebuild.",
    actions: {
      add_repositories: [
        "repositories.configure",
        "add or change registered repositories",
      ],
      remove_repositories: [
        "repositories.remove",
        `remove registered repositories; needs confirm: true`,
      ],
      repository: ["repository.configure", "add or change one repository"],
      remove_repository: [
        "repository.remove",
        `remove one repository; needs confirm: true`,
      ],
      workspace_repository: [
        "workspace.repository.configure",
        "set the workspace repository",
      ],
      publish_workspace_repository: [
        "workspace.repository.publish",
        "publish the workspace repository",
      ],
      sync_workspace_repository: [
        "workspace.repository.sync",
        "sync the workspace repository",
      ],
      connect_github: [
        "github.repository.connect",
        "connect a repository to GitHub",
      ],
      configure_github: ["github.configure", "set up GitHub on a repository"],
      allow_github_steps: [
        "github.job.confirm",
        `allow high-risk GitHub steps: {steps: [{job, target, permissionsHash}]}; returns grant ids to pass as allow; needs confirm: true`,
      ],
      rebuild: ["workspace.rebuild", "rebuild the cache from git and GitHub"],
      list_workspaces: [
        "catalog.list",
        "the workspaces registered on this machine",
      ],
      change_workspace: [
        "catalog.change",
        "add, start, resume, stop, drain or set-default a workspace: {action, id, root?}",
      ],
      remove_workspace: [
        "catalog.remove",
        "take a workspace off this machine's list: {id}; needs confirm: true",
      ],
      approve_harness: [
        "harness.approve",
        "approve a harness definition: {name}",
      ],
      probe_harness: ["harness.probe", "check a harness's sign-in: {name}"],
      run_on: [
        "needskirocrew.runon",
        "run a role that waits on Kiro Crew on a harness: {role, harness}",
      ],
    },
  },
  plans_plugin_admin: {
    summary: "Change plugins. Read them with plans_plugins.",
    actions: {
      add: ["plugin.add", "add a plugin"],
      approve: ["plugin.approve", "approve a plugin"],
      disable: ["plugin.disable", "disable a plugin"],
      remove: ["plugin.remove", `remove a plugin; needs confirm: true`],
      update: ["plugin.update", "update a plugin"],
      pick_credentials: [
        "plugin.credentials.pick",
        "which credentials plugin serves a host",
      ],
      check_updates: ["plugin.updates.check", "check for plugin updates"],
      configure_updates: [
        "plugin.updates.configure",
        "turn the daily update check on or off",
      ],
      map: ["plugin.map", "map a checks plugin's server"],
      answer: ["plugin.answer", "answer a context plugin's questions"],
      flip_check: ["check.decide.flip", "Run it or Skip it on a plugin check"],
    },
  },
  plans_content_admin: {
    summary: "Content-rule terms, sets and Allow once.",
    actions: {
      terms: ["content.terms.get", "read the private terms file"],
      update_terms: ["content.terms.update", "write the terms file"],
      update_sets: ["content.sets.update", "replace contentRules.sets"],
      allow: ["content.allow", "allow one blocked write once: {id, reason}"],
      show: ["content.show", "the matched line of a decision: {id}"],
    },
  },
  plans_control: {
    summary:
      "Approvals, landing and delivery decisions, Needs you actions, and intake.",
    actions: {
      approve_plan: [
        "plan.approve",
        "approve a spec revision: {id, expectedHash} with expectedRevision",
      ],
      publish_spec: ["spec.publish", "make the GitHub issues of a spec"],
      take: ["runner.take", "take a task by hand: {taskId}"],
      delete_claim: [
        "claim.delete",
        `delete a stale claim branch; needs confirm: true`,
      ],
      allow_verify: [
        "verify.allow",
        "let a commit's protected paths land: {taskId, reason}",
      ],
      resume_lane: ["lane.resume", "resume a closed lane"],
      ready_pr: ["landing.ready", "release a draft pull request"],
      merge_pr: ["landing.merge", "merge a pull request Avoozl opened"],
      land_integration: [
        "integration.land",
        "approve landing an integration branch",
      ],
      task_done: [
        "task.manual.complete",
        "mark a manual task done: {taskId, choice?: done|skipped|refused}",
      ],
      task_reopen: ["task.manual.reopen", "reopen a manual task: {taskId}"],
      stop_all: [
        "flow.stop",
        "stop every agent: {reason}",
        (input) => ({ ...input, full: true }),
      ],
      resume_stop: ["flow.resume", "resume a pulled stop: {stopId}"],
      run_anyway: ["flow.runAnyway", "Run anyway past a flow limit"],
      delete_report: ["report.delete", `delete a report; needs confirm: true`],
      send_message: ["session.send", "send a message to a process session"],
      open_session: ["session.open", "open a session"],
      confirm_item: [
        "intake.confirm",
        "confirm an incoming item's changed text",
      ],
      deliver_item: ["intake.deliver", "Deliver this on an incoming item"],
      plan_item: ["intake.plan", "Plan this on an incoming item"],
      add_source: ["intake.source.add", "add an intake source"],
      remove_source: [
        "intake.source.remove",
        `remove an intake source; needs confirm: true`,
      ],
    },
  },
} satisfies Record<string, GroupedTool>);

export const GROUPED_TOOLS = tools;

// tools/list entries.
export function groupedToolList(classify: (operation: string) => unknown) {
  return Object.entries(tools).map(([name, tool]) => {
    const actions = Object.keys(tool.actions);
    return {
      name,
      description: `${tool.summary} Actions: ${actions
        .map((action) => `${action} (${tool.actions[action][1]})`)
        .join("; ")}.`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: actions },
          input: { type: "object", additionalProperties: true },
          expectedRevision: { type: "integer" },
        },
        required: ["action"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: actions.every(
          (action) => classify(tool.actions[action][0]) === "observe",
        ),
      },
    };
  });
}

// The operation and input a grouped call names, or {error}.
export function groupedCall(
  name: string,
  args: { action?: unknown; input?: unknown } = {},
) {
  const tool = tools[name];
  if (!tool) return null;
  const actions = Object.keys(tool.actions),
    action = args.action;
  if (typeof action !== "string" || !Object.hasOwn(tool.actions, action))
    return {
      error: `${action === undefined ? "Name an action" : `Unknown action ${JSON.stringify(action)}`} for ${name}. Choose one of: ${actions.join(", ")}.`,
    };
  const [operation, , shape] = tool.actions[action],
    input = args.input ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "input must be an object." };
  const object = input as Record<string, unknown>;
  return { operation, input: shape ? shape(object) : object };
}
