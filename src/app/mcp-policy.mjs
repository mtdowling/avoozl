// Which operations MCP may not reach, and why (R56). Every operation either
// has an MCP route (a tool action, or a single-operation tool in mcp.mjs)
// or a reason here; src/app/test/mcp-tools.test.mjs enforces that.
//
// PERSON_ONLY operations are refused whenever a call comes through MCP, under
// any tool name, old or new: Operations.perform checks this before it runs
// anything. `when` limits the refusal to one input shape (a GitHub setup
// preview reads; its confirmed apply writes).
const APP = " Do it in the Avoozl app.";
const person = (reason, when) => ({ reason: reason + APP, when });

export const PERSON_ONLY = new Map([
  // A call that names a delegate goes on to the operation, which refuses it
  // unless a person granted that delegate (approval-delegation.mjs, R109).
  [
    "plan.approve",
    person("Only a person approves a plan.", (input) => !input?.delegate),
  ],
  [
    "plan.approveMany",
    person("Only a person approves a plan.", (input) => !input?.delegate),
  ],
  [
    "approval.delegate.grant",
    person("Only a person grants approval delegation."),
  ],
  [
    "approval.delegate.revoke",
    person("Only a person revokes approval delegation."),
  ],
  ["plan.delete", person("Only a person deletes a plan.")],
  ["spec.publish", person("Only a person publishes a spec issue.")],
  ["spec.takeover", person("Only a person takes over a spec.")],
  ["spec.offer", person("Only a person offers a task to a worker.")],
  ["spec.claims", person("Only a person reserves worker claims.")],
  ["spec.claims.release", person("Only a person releases a worker claim.")],
  ["spec.claims.status", person("Only a person reads worker claims.")],
  [
    "repository.setup",
    person("Only a person applies repository setup.", (input) =>
      Boolean(input?.confirm),
    ),
  ],
  ["spec.journal.reanchor", person("Only a person reanchors a spec journal.")],
  ["spec.journal.resume", person("Only a person resumes a spec journal.")],
  ["spec.exportIssues", person("Only a person exports a spec's task issues.")],
  [
    "github.retireTaskIssues",
    person("Only a person retires task-issue bindings."),
  ],
  ["plan.new", person("Only a person starts a new plan.")],
  [
    "plan.review.decide",
    person("Only a person starts or skips a draft review."),
  ],
  [
    "plan.review.finding.decide",
    person("Only a person decides a review finding."),
  ],
  ["plan.review.dispose", person("Only a person closes a review comment.")],
  ["task.manual.complete", person("Only a person marks a manual task done.")],
  [
    "session.send",
    person("Only a person sends a message to a process session."),
  ],
  [
    "session.open",
    person("Only a person opens a session, in the Avoozl page."),
  ],
  ["task.summary.request", person("Only a person asks for a task summary.")],
  ["task.manual.reopen", person("Only a person reopens a manual task.")],
  ["task.notes.edit", person("Only a person edits a link.")],
  ["task.notes.remove", person("Only a person removes a link.")],
  ["task.notes.show", person("Only a person shows a link on the issue.")],
  ["plugin.add", person("Only a person changes plugins.")],
  ["plugin.approve", person("Only a person changes plugins.")],
  ["plugin.update", person("Only a person changes plugins.")],
  ["plugin.disable", person("Only a person changes plugins.")],
  ["plugin.remove", person("Only a person changes plugins.")],
  ["plugin.pack.import", person("Only a person changes plugins.")],
  ["content.allow", person("Only a person allows a blocked write once.")],
  [
    "verify.allow",
    person("Only a person lets a commit's protected paths land."),
  ],
  ["content.show", person("Only a person reads a matched line.")],
  ["content.terms.get", person("Only a person reads content-rule terms.")],
  ["content.terms.update", person("Only a person edits content-rule terms.")],
  ["content.sets.update", person("Only a person edits content-rule sets.")],
  [
    "github.conflict.resolve",
    person("Only a person chooses a conflict winner."),
  ],
  [
    "github.authorize",
    person("Only a person authorizes an issue for delivery."),
  ],
  [
    "github.setup",
    person("Only a person applies GitHub setup.", (input) =>
      Boolean(input?.confirm),
    ),
  ],
  [
    "radar.setup",
    person("Only a person applies a Radar set up step.", (input) =>
      Boolean(input?.confirm),
    ),
  ],
  [
    "mirror.adopt",
    person("Only a person applies mirror setup.", (input) =>
      Boolean(input?.confirm),
    ),
  ],
  [
    "mirror.create",
    person("Only a person applies mirror setup.", (input) =>
      Boolean(input?.confirm),
    ),
  ],
  [
    "mirror.forward",
    person("Only a person forwards a change to the public repository."),
  ],
  [
    "mirror.forward.review",
    person("Only a person reviews a change before it is forwarded."),
  ],
  ["radar.signoff", person("Only a person signs off a public repository.")],
  [
    "publiccrews.signoff",
    person("Only a person signs off a public repository."),
  ],
  ["radar.retro.apply", person("Only a person applies a retro rule.")],
  ["github.setup.cancel", person("Only a person cancels a GitHub setup.")],
  ["github.configure", person("Only a person changes GitHub setup.")],
  [
    "github.project.connect",
    person("Only a person connects a GitHub Project."),
  ],
  [
    "github.settings.update",
    person("Only a person changes GitHub settings, including Who counts."),
  ],
  ["configuration.update", person("Only a person changes workspace settings.")],
  [
    "conversations.settings.update",
    person("Only a person changes workspace settings."),
  ],
  [
    "agent.instructions.toggle",
    person("Only a person changes workspace settings."),
  ],
  ["flow.settings.update", person("Only a person changes flow settings.")],
  ["models.settings.update", person("Only a person changes chat models.")],
  [
    "needskirocrew.runon",
    person("Only a person chooses the harness a waiting role runs on."),
  ],
  [
    "activity.settings.update",
    person("Only a person changes how long activity is kept."),
  ],
  ["provider.switch", person("Only a person switches models.")],
  [
    "provider.switch.dryRun",
    person("Only a person runs a model switch's dry run."),
  ],
  ["provider.health.clear", person("Only a person undoes a provider mark.")],
  [
    "providers.settings.update",
    person("Only a person changes provider settings."),
  ],
  [
    "delivery.integrate",
    person("Only a person presses Integrate on a Ready to merge task."),
  ],
  [
    "investigation.decide",
    person("Only a person decides on a task's findings."),
  ],
  [
    "delivery.settings.update",
    person("Only a person changes delivery settings."),
  ],
  ["flow.instructions.update", person("Only a person changes flow settings.")],
  ["flow.retro.start", person("Only a person starts a retro.")],
  ["flow.retro.again", person("Only a person runs a retro again.")],
  ["flow.retro.decide", person("Only a person decides retro proposals.")],
  ["prompt.override.revert", person("Only a person changes prompt overrides.")],
  ["prompt.override.rebase", person("Only a person changes prompt overrides.")],
  ["driver.handoff", person("Only a person hands off a spec's driver.")],
  ["driver.takeover", person("Only a person takes over a spec's driver.")],
  [
    "driver.forceTakeover",
    person("Only a person takes over a spec's driver by force."),
  ],
  ["driver.away.decide", person("Only a person decides an away task.")],
  [
    "driver.settings.update",
    person("Only a person changes this computer's driver settings."),
  ],
  ["flow.runAnyway", person("Only a person presses Run anyway.")],
  ["flow.resume", person("Only a person resumes a pulled stop.")],
  ["radar.releasestep", person("Only a person releases a phase.")],
  ["radar.disarm", person("Only a person disarms auto-merge.")],
  ["conflictfix.decide", person("Only a person decides a source conflict.")],
  ["gap.accept", person("Only a person accepts gap report proposals.")],
  [
    "integration.land",
    person("Only a person approves landing an integration branch."),
  ],
  ["spec.changed.apply", person("Only a person applies a spec change.")],

  [
    "flow.stop",
    person("Only a person stops all agents.", (input) => input?.full === true),
  ],
  ["untriaged.handoff", person("Only a person sends issues to Issue Radar.")],
  ["specpr.adopt", person("Only a person presses Review as spec.")],
  ["specpr.reject", person("Only a person rejects a spec pull request.")],
  [
    "specpr.requestChanges",
    person("Only a person requests changes on a spec pull request."),
  ],
  [
    "github.crewlabel.backfill",
    person("Only a person adds crew:avoozl to old task issues."),
  ],
  ["review.chat", person("Only a person starts a code review chat.")],
  ["untriaged.plan", person("Only a person presses Plan this on an issue.")],
  [
    "intake.deliver",
    person("Only a person presses Deliver this on an incoming item."),
  ],
  [
    "intake.plan",
    person("Only a person presses Plan this on an incoming item."),
  ],
  [
    "intake.confirm",
    person("Only a person confirms an incoming item's changed text."),
  ],
  ["intake.source.add", person("Only a person changes intake sources.")],
  ["intake.source.remove", person("Only a person changes intake sources.")],
  [
    "repositories.configure",
    person("Only a person adds or changes a repository."),
  ],
  ["repositories.remove", person("Only a person removes a repository.")],
  ["project.configure", person("Only a person adds or changes a repository.")],
  ["project.remove", person("Only a person removes a repository.")],
  [
    "workspace.repository.configure",
    person("Only a person sets the workspace repository."),
  ],
  [
    "workspace.repository.publish",
    person("Only a person publishes the workspace repository."),
  ],
  [
    "workspace.repository.sync",
    person("Only a person syncs the workspace repository."),
  ],
  ["report.delete", person("Only a person deletes a report.")],
  ["visualization.delete", person("Only a person deletes a visualization.")],
]);

// Operations no MCP tool routes to, for a reason other than a person's
// authority. Nothing refuses these by name; no route reaches them.
const moved = "Moved to Kiro Crew; no MCP tool offers it.";
const proposalsPage =
  "The Flow tab's Proposals view; proposals are a person's to decide.";
const page = "App page rendering only.";
const remote =
  "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.";
export const NOT_ON_MCP = new Map([
  [
    "review.chat.show",
    "A person reads a stored pull request review with avoozl show.",
  ],
  ...[
    "remote.status",
    "remote.report",
    "remote.view",
    "worker.pull",
    "worker.claim",
    "worker.setup",
  ].map((name) => [name, remote]),
  ...["instance.view", "instance.rename"].map((name) => [
    name,
    "The app page shows and renames this install's display name; a chat has no use for it.",
  ]),
  [
    "session.view",
    "The standalone page's process view of a session it opened; agents have the worker tools.",
  ],
  [
    "panel.view",
    "The chat side panel's one read; its parts are each on MCP already.",
  ],
  ["flow.proposals", proposalsPage],
  [
    "models.settings.get",
    "Settings › Models reads the chat models; a chat has no use for them.",
  ],
  [
    "legacy.mcp",
    "The MCP server's own protocol methods (initialize, ping, view resources) in src/mcp.mjs.",
  ],
  [
    "state",
    "Whole-database read; plans_view and plans_task read what a session needs.",
  ],
  ["notifications.deliver", "The tick delivers notifications itself."],
  ["highlight.languages", page],
  ["chat.context", page],
  ["agent.instructions.source", page],
  // The Onboard dialog's reads (onboarding.mjs); a session uses
  // repositories, plans_view and the setup preview for the same facts.
  ["onboarding.inspect", page],
  ["onboarding.scan", page],
  ["plan.issues.preview", page],
  // The spec page's Review view; plans_plan_review reads the same findings.
  ["plan.review.view", page],
  ["spec.changed.preview", page],
  // The spec page's Proposed change box; plans_view shows the same spec.
  ["specpr.view", page],
]);

// The refusal for an operation reached through MCP, or null.
export function mcpRefusal(name, input) {
  const rule = PERSON_ONLY.get(name);
  return rule && (!rule.when || rule.when(input)) ? rule.reason : null;
}

// Kiro Crew marks every agent session's process tree: the runtime sets
// KIROCREW_SPAWNED=1 on everything it starts, and KIRO_SESSION_ID names the
// session in a shell the agent runs. The dashboard terminal copies the
// gateway's own environment plus KIROCREW_TERMINAL=1, so a person's terminal
// has neither (checked in Kiro Crew 0.12.2.4). Avoozl does not trust
// KIROCREW_TERMINAL, because an agent could set it too.
// shortcut: a speed bump, not a wall. Code running as the same user can
// unset these or read the gateway secret from another process; upgrade when
// Kiro Crew passes the secret by file descriptor (R83.2).
export function agentSession(env = process.env) {
  return env.KIROCREW_SPAWNED === "1" || Boolean(env.KIRO_SESSION_ID);
}

// The refusal for a CLI call, or null. The command line is a person's tool,
// so a person-only operation runs there, even inside an agent session, and is
// recorded as run there (agentSessionNote). It is refused only in a
// supervisor child (AVOOZL_CHILD, R95.5), where nobody is typing.
export function cliRefusal(name, input, { env = process.env } = {}) {
  const reason = mcpRefusal(name, input);
  if (!reason || !env.AVOOZL_CHILD) return null;
  return (
    reason.replace(/ Do it in the Avoozl app\.$/, "") +
    " This command is running inside an agent the supervisor started" +
    `${env.AVOOZL_CHILD_SESSION ? ` (${env.AVOOZL_CHILD_SESSION})` : ""}.` +
    " Do it in the Avoozl app."
  );
}

// What a person-only CLI call from an agent session leaves in the record, or
// null when it is not one (R83.1).
export function agentSessionNote(name, input, env = process.env) {
  if (!mcpRefusal(name, input) || !agentSession(env)) return null;
  return `Run from a Kiro Crew agent session${env.KIRO_SESSION_ID ? ` (${env.KIRO_SESSION_ID})` : ""}.`;
}
