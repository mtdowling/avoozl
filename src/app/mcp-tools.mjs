// Avoozl's grouped MCP tools (R56): one tool per thing a session acts on, each
// with an `action` naming one existing operation. The authority class of each
// operation (operation-kinds.mjs) is unchanged, and person-only operations
// (mcp-policy.mjs) have no action here and are refused under any name.
//
// Each action is [operation, hint] or [operation, hint, shape], where `shape`
// rewrites the input before the call (a GitHub setup preview never confirms).
const tools = {
  // Read only, so an agent allowed the old read-only plans_workspace name
  // gains nothing by it being a grouped tool now.
  plans_workspace: {
    summary: "The workspace, read only.",
    defaultAction: "get",
    actions: {
      get: [
        "workspace",
        "projects, plan drafts, run history, integration queue, GitHub state",
      ],
      describe: ["client.describe", "client contract and operations"],
      configuration: ["configuration.get", "the saved .avoozl.json settings"],
      flow_settings: ["flow.settings.get", "flow settings"],
      delivery_settings: [
        "delivery.settings.get",
        "the writer agent and model and pull request feedback settings",
      ],
      budget_settings: [
        "budget.settings.get",
        "per-task budget caps and modes for the workspace and each repository",
      ],
      conversation_settings: [
        "conversations.settings.get",
        "conversation settings",
      ],
      examples: ["workspace.examples", "optional example packs"],
      trash: ["trash", "deleted plans and runs"],
      local_ignore: [
        "local.ignore.status",
        "whether Avoozl files are ignored locally",
      ],
    },
  },
  plans_maintain: {
    summary: "Workspace upkeep: the tick, rebuilds, examples.",
    actions: {
      tick: ["workspace.tick", "run one bounded tick"],
      rebuild: [
        "workspace.rebuild",
        "rebuild GitHub and tracker tasks from their sources",
      ],
      seed_example: [
        "workspace.seed",
        "load one example pack, once, only when asked",
      ],
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
      flow: ["flow.view", "lead time, stages, bottlenecks"],
      routing: [
        "routing.view",
        "crews, routing rules, smart pick, model router",
      ],
      routing_preview: [
        "routing.preview",
        "where ready tasks would run now; opens nothing",
      ],
      log: ["workspace.tick.log", "recent tick log"],
      health: ["workspace.tick.health", "tick health"],
      activity: ["activity.recent", "recent activity"],
      queue: ["queue", "ready work, resource conflicts, queued integration"],
      next: ["runner.next", "what a Crew Mode conductor does next"],
      query: ["query", "search tasks"],
      receipt: [
        "budget.receipt",
        "one task's usage receipt: {taskId}; counts and dollars only",
      ],
    },
  },
  plans_plan: {
    summary:
      "Plans and their Kiro spec folders. Approval and delete are a person's, in the app.",
    actions: {
      list: ["plan.list", "stored plans"],
      table: ["plan.table", "plans grouped with progress"],
      epics: ["epic.list", "epics across plans with computed progress"],
      epic: ["epic.get", "one epic: goal, what done means, member plans, decisions: {id}"],
      specs: ["plan.specs", "spec folders on disk"],
      get: ["plan.get", "one plan, its revisions and receipts"],
      read_spec: ["plan.spec.read", "a spec folder's documents"],
      lint: ["plan.lint", "deterministic checks on a stored revision"],
      preview: ["plan.preview", "the tasks approval would publish"],
      project_preview: [
        "github.project.preview",
        "GitHub writes projecting would make",
      ],
      delete_preview: ["plan.delete.preview", "what deleting would remove"],
      create: ["plan.create", "store a spec folder as a draft: {spec}"],
      save: [
        "plan.save",
        "reload a spec folder as the next draft: {id, expectedHash}",
      ],
      propose: ["plan.propose", "propose adjacent work as a draft"],
      classify: ["plan.classify", "set plan metadata"],
      archive: ["plan.archive", "archive a plan: holds its open tasks"],
      unarchive: ["plan.unarchive", "undo archive"],
      restore: ["plan.restore", "restore a deleted plan from trash"],
    },
  },
  plans_review: {
    summary:
      "Design reviews and design extraction. None of these approve a plan.",
    actions: {
      list: ["plan.review.list", "review comments"],
      submit: ["plan.review.submit", "submit anchored review comments"],
      reply: ["plan.review.reply", "reply to a comment"],
      dispose: [
        "plan.review.dispose",
        "resolve, accept, reject or defer a comment",
      ],
      apply: ["plan.review.apply", "apply a suggestion to the draft"],
      pipeline: ["plan.review.pipeline.get", "one review round"],
      extract: ["plan.extract", "open an extraction record"],
      extraction: ["plan.extract.get", "extraction rounds and facts"],
      submit_extraction: [
        "plan.extraction.submit",
        "submit one extraction round",
      ],
      dispose_fact: [
        "plan.extraction.dispose",
        "reject, edit, accept or reuse a fact",
      ],
      triage_design: ["queue.design.triage", "classify an untriaged design"],
    },
  },
  plans_task: {
    summary: "One task: read it, change it, deliver it.",
    actions: {
      get: ["task.get", "one task"],
      detail: ["task.detail", "the task drawer's detail"],
      sessions: ["task.sessions", "its Kiro Crew sessions"],
      handoff: ["handoff", "design, dependencies, runs and evidence"],
      duplicates: ["task.duplicates", "repeated-title candidates"],
      merge_receipt: ["task.merge.get", "a consolidation receipt"],
      preview_change: ["task.change.preview", "what an update would change"],
      update: [
        "task.update",
        "metadata, status (deferred pauses) or dependencies",
      ],
      supersede: ["task.supersede", "replace a local task with a new one"],
      merge: ["task.merge", "consolidate reviewed duplicates"],
      archive: ["task.archive", "archive, only when the user permits"],
      unarchive: ["task.unarchive", "undo archive"],
      start: ["task.start", "Start now"],
      retry: [
        "delivery.retry",
        "resume a stopped delivery, when the person asks",
      ],
      validate: ["run.validate", "run acceptance checks at the worktree head"],
      integrate: ["integration.merge", "rebase, revalidate, fast-forward"],
      accept: ["task.accept", "record acceptance evidence"],
      activity: ["activity", "an activity lease"],
      take_back: ["tracker.takeBack", "take a tracker task back to local"],
      release: ["work.release", "release a GitHub claim"],
      cancel_route: ["route.cancel", "cancel a plugin submission"],
      resubmit_route: ["route.resubmit", "resubmit a plugin submission"],
    },
  },
  plans_session: {
    summary: "Kiro Crew sessions working on tasks.",
    actions: {
      bind: ["session.bind", "bind a slot to a task"],
      rediscover: ["session.rediscover", "rebuild lost bindings from titles"],
      request: ["session.request", "ask the tick to open a session"],
      start: ["run.start", "dispatch a task: {taskId, repository, agent}"],
      status: ["session.status", "record a session's status"],
      report: ["session.report", "report on your bound task"],
      claim: ["runner.claim", "claim a ready leaf for a worker"],
      worktree: ["worktree.prepare", "create or return the leaf's worktree"],
      checks: ["flow.checks.run", "run declared checks at HEAD"],
      stop_line: [
        "flow.stop",
        "pull the Andon cord: {scope: all|repo|spec|task, repository?, spec?, taskId?, reason}; only a person resumes",
      ],
      reply: ["reply.post", "post a responder's one reply"],
    },
  },
  plans_conflicts: {
    summary:
      "Conflicts and open decisions. Choosing a GitHub conflict winner is a person's, in the app.",
    actions: {
      view: ["conflicts.view", "open conflicts and decisions"],
      settle: [
        "conflicts.settle",
        "reviewed, unblock, dismiss or settle items",
      ],
    },
  },
  plans_intake: {
    summary:
      "A person's requests, saved searches, and incoming items from intake sources. Items submitted here are listed and may meet only pause and quarantine rules; Plan this and Deliver this are a person's, in the app.",
    actions: {
      capture: ["task.capture", "record a person's own request as untriaged"],
      submit: ["intent.submit", "submit an intent"],
      get: ["intent.get", "read an intent"],
      search_result: ["search.result", "keep a search result as a saved view"],
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
    },
  },
  plans_github: {
    summary:
      "GitHub reads, sync, breakdowns and the Untriaged list. Setup writes, settings and handing items to Issue Radar are a person's, in the app.",
    actions: {
      untriaged: ["untriaged.view", "items no rule claims"],
      crews: ["untriaged.crews", "Issue Radar crews for a repository"],
      repositories: ["github.repositories", "registered GitHub repositories"],
      issues: ["github.issues", "cached issues"],
      labels: ["github.repository.labels", "a repository's labels"],
      inspect: ["github.repository.inspect", "branch rules and checks"],
      settings: ["github.settings.get", "GitHub settings"],
      validate: ["github.settings.validate", "check GitHub settings"],
      trigger_preview: [
        "github.trigger.preview",
        "what a trigger rule would match",
      ],
      detect_project: ["github.project.detect", "find a repository's Project"],
      setup_preview: [
        "github.setup",
        "every write setup would make, without making any",
        ({ confirm, ...input }) => input,
      ],
      sync: ["github.sync", "sync issues now"],
      project: ["github.project", "project an approved plan to issues"],
      publish: ["planning.publish", "publish an approved plan"],
      reconcile: ["planning.reconcile", "reconcile planning pull requests"],
      rebuild: ["github.rebuild", "rebuild GitHub tasks from GitHub"],
      classify: ["github.breakdown.classify", "bounded or broad"],
      draft_children: [
        "github.breakdown.draft",
        "name a broad issue's child spec",
      ],
      advance: [
        "github.breakdown.advance",
        "preview, detect approval, publish children",
      ],
    },
  },
  plans_repos: {
    summary:
      "Registered repositories, read only. Adding or removing one is a person's, in the app.",
    actions: {
      list: ["repositories.list", "registered repositories"],
      detect: ["repositories.detect", "what Add repository would register"],
      status: ["workspace.repository.status", "the workspace repository"],
    },
  },
  plans_plugins: {
    summary:
      "Plugins, read only. Adding, approving or removing one is a person's, in the app.",
    actions: {
      list: ["plugins.list", "installed plugins"],
      preview: ["plugin.preview", "what a plugin source holds"],
      pack_preview: [
        "plugin.pack.preview",
        "what importing a plugin's settings pack would change",
      ],
    },
  },
  plans_content: {
    summary: "Content rules. Terms and Allow once are a person's, in the app.",
    actions: {
      rules: ["content.rules", "rule sets and their state"],
      check: ["content.check", "check text against the rules"],
    },
  },
  plans_run: {
    summary: "Past runs (read-only history).",
    actions: {
      list: ["run.list", "past runs"],
      get: ["run.get", "one past run"],
      changes: ["run.changes", "a run's changes"],
      event: ["run.event", "one run event"],
      archive: ["run.archive", "archive a past run"],
      unarchive: ["run.unarchive", "undo archive"],
      restore: ["run.restore", "restore a deleted run from trash"],
    },
  },
};

export const GROUPED_TOOLS = tools;

// tools/list entries.
export function groupedToolList(classify) {
  return Object.entries(tools).map(([name, tool]) => {
    const actions = Object.keys(tool.actions);
    return {
      name,
      description: `${tool.summary} Actions: ${actions
        .map((action) => `${action} (${tool.actions[action][1]})`)
        .join(
          "; ",
        )}.${tool.defaultAction ? ` action defaults to ${tool.defaultAction}.` : ""}`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: actions },
          input: { type: "object", additionalProperties: true },
          expectedRevision: { type: "integer" },
        },
        required: tool.defaultAction ? [] : ["action"],
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
export function groupedCall(name, args = {}) {
  const tool = tools[name];
  if (!tool) return null;
  const actions = Object.keys(tool.actions),
    action = args.action ?? tool.defaultAction;
  if (typeof action !== "string" || !Object.hasOwn(tool.actions, action))
    return {
      error: `${action === undefined ? "Name an action" : `Unknown action ${JSON.stringify(action)}`} for ${name}. Choose one of: ${actions.join(", ")}.`,
    };
  const [operation, , shape] = tool.actions[action],
    input = args.input ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "input must be an object." };
  return { operation, input: shape ? shape(input) : input };
}
