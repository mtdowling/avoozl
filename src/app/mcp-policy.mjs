// Which operations MCP may not reach, and why (R56). Every operation either
// has an MCP route (a grouped tool's action or an old plans_* name, mcp.mjs)
// or a reason here; src/app/test/mcp-tools.test.mjs enforces that.
//
// PERSON_ONLY operations are refused whenever a call comes through MCP, under
// any tool name, old or new: Operations.perform checks this before it runs
// anything. `when` limits the refusal to one input shape (a GitHub setup
// preview reads; its confirmed apply writes).
const APP = " Do it in the Avoozl app.";
const person = (reason, when) => ({ reason: reason + APP, when });

export const PERSON_ONLY = new Map([
  ["plan.approve", person("Only a person approves a plan.")],
  ["plan.delete", person("Only a person deletes a plan.")],
  ["plan.new", person("Only a person starts a new plan.")],
  ["task.manual.complete", person("Only a person marks a manual task done.")],
  ["task.manual.reopen", person("Only a person reopens a manual task.")],
  ["task.notes.edit", person("Only a person edits a link or note.")],
  ["task.notes.remove", person("Only a person removes a link or note.")],
  [
    "task.notes.show",
    person("Only a person shows a link or note on the issue."),
  ],
  ["plugin.add", person("Only a person changes plugins.")],
  ["plugin.approve", person("Only a person changes plugins.")],
  ["plugin.update", person("Only a person changes plugins.")],
  ["plugin.disable", person("Only a person changes plugins.")],
  ["plugin.remove", person("Only a person changes plugins.")],
  ["plugin.pack.import", person("Only a person changes plugins.")],
  ["content.allow", person("Only a person allows a blocked write once.")],
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
  ["radar.signoff", person("Only a person signs off a public repository.")],
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
  ["github.queue.configure", person("Only a person changes GitHub setup.")],
  ["github.queue.remove", person("Only a person changes GitHub setup.")],
  [
    "github.intake.capability.create",
    person("Only a person changes GitHub setup."),
  ],
  [
    "github.intake.capability.revoke",
    person("Only a person changes GitHub setup."),
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
  [
    "activity.settings.update",
    person("Only a person changes how long activity is kept."),
  ],
  ["routing.update", person("Only a person changes the routing prompt.")],
  ["crews.update", person("Only a person changes crew settings.")],
  ["relay.forget", person("Only a person forgets the relay chat.")],
  ["routing.retry", person("Only a person retries routing now.")],
  ["routing.turnOff", person("Only a person turns routing off.")],
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
  ["delivery.pickAgain", person("Only a person presses Pick again.")],
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
  ["flow.retro.decide", person("Only a person decides retro proposals.")],
  ["prompt.override.revert", person("Only a person changes prompt overrides.")],
  ["prompt.override.rebase", person("Only a person changes prompt overrides.")],
  ["plugin.lessons.import", person("Only a person imports a lessons pack.")],
  ["lessons.export", person("Only a person exports lessons.")],
  ["lessons.share.preview", person("Only a person shares lessons.")],
  ["lessons.share", person("Only a person shares lessons.")],
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
  ["gap.accept", person("Only a person accepts gap report proposals.")],
  [
    "integration.land",
    person("Only a person approves landing an integration branch."),
  ],
  ["spec.changed.apply", person("Only a person applies a spec change.")],
  ["quickgoal.get", person("Only a person works a quick goal.")],
  ["quickgoal.list", person("Only a person works a quick goal.")],
  ["quickgoal.confirm", person("Only a person works a quick goal.")],
  ["quickgoal.settings.get", person("Only a person works a quick goal.")],
  ["quickgoal.propose", person("Only a person works a quick goal.")],
  ["quickgoal.edit", person("Only a person works a quick goal.")],
  ["quickgoal.discard", person("Only a person works a quick goal.")],
  ["quickgoal.promote", person("Only a person works a quick goal.")],
  ["quickgoal.approve", person("Only a person works a quick goal.")],
  ["quickgoal.settings.update", person("Only a person works a quick goal.")],

  ["budget.raise", person("Only a person raises a budget.")],
  ["budget.stop", person("Only a person stops a task at its budget.")],
  [
    "budget.acknowledge",
    person("Only a person acknowledges an over-budget task."),
  ],
  ["budget.switchToStop", person("Only a person changes a budget's mode.")],
  ["budget.settings.update", person("Only a person changes budget settings.")],
  [
    "flow.stop",
    person("Only a person stops all agents.", (input) => input?.full === true),
  ],
  ["untriaged.handoff", person("Only a person sends issues to Issue Radar.")],
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
  ["idea.archive", person("Only a person archives an idea.")],
  ["idea.restore", person("Only a person restores an idea.")],
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
  ["run.delete", person("Only a person deletes a past run.")],
  ["report.delete", person("Only a person deletes a report.")],
  ["visualization.delete", person("Only a person deletes a visualization.")],
]);

// Operations no MCP tool routes to, for a reason other than a person's
// authority. Nothing refuses these by name; no route reaches them.
const moved = "Moved to Kiro Crew with no old plans_* name; nothing to offer.";
const lessonsPage =
  "The Flow tab's Proposals and Lessons views; lessons stay summaries for retros, not sessions.";
const removed = "Removed; the operation has no handler.";
const page = "App page rendering only.";
const remote =
  "Runner mode (R84) runs over ssh and the CLI; no MCP tool hands off, accepts or reports a remote task.";
export const NOT_ON_MCP = new Map([
  ...[
    "remote.accept",
    "remote.status",
    "remote.report",
    "remote.handoff",
    "remote.pull",
    "remote.view",
  ].map((name) => [name, remote]),
  ...["driversession.view", "driversession.register"].map((name) => [
    name,
    "The app page reads the driver session; the session records itself through its hooks and plans_next.",
  ]),
  ["flow.proposals", lessonsPage],
  ["lessons.view", lessonsPage],
  [
    "plugin.lessons.preview",
    "Settings reads a lessons pack before a person imports it.",
  ],
  ["legacy.mcp", "The MCP server's own fallback for the legacy plans_* tools."],
  [
    "state",
    "Whole-database read; plans_view and plans_task read what a session needs.",
  ],
  ["notifications.deliver", "The tick delivers notifications itself."],
  [
    "budget.view",
    "The page's budget chips; a session reads one task's receipt with plans_view receipt.",
  ],
  ["publication.retry", "A no-op kept for old pages."],
  ["highlight.languages", page],
  ["chat.context", page],
  ["agent.instructions.source", page],
  // The Onboard dialog's reads (onboarding.mjs); a session uses
  // repositories, plans_view and the setup preview for the same facts.
  ["onboarding.inspect", page],
  ["onboarding.scan", page],
  ["plan.issues.preview", page],
  ["spec.changed.preview", page],
  ...[
    "run.model",
    "run.unsend",
    "run.queue",
    "driver.open",
    "driver.context",
    "driver.list",
    "concurrency.status",
    "conversations.routing.preview",
    "openhands.profiles",
    "openhands.models",
    "server.restart.status",
    "server.restart.request",
    "server.restart.clear",
    "targets.pair",
    "targets.unpair",
    "jobs.dispatch",
    "jobs.redispatch",
    "jobs.stop",
    "jobs.heartbeat",
    "review.request",
    "primary.handover",
    "primary.adopt",
    "primary.rebuild",
    "github.start",
    "plan.review.pipeline",
    "safety.interrupt.retry",
    "safety.remediation.grant",
    "safety.remediation.revoke",
    "safety.resolve",
    "safety.resume",
    "safety.coordinator.ack",
  ].map((name) => [name, moved]),
  ...[
    "queue.items",
    "queue.comments",
    "queue.diff",
    "queue.sync",
    "queue.claim",
    "queue.createTask",
    "queue.confirmLink",
    "github.intake.capabilities",
    "openhands.automations.capabilities",
    "openhands.automations.recommendations",
    "openhands.automations.coverage",
    "openhands.automations.intake.preflight",
    "openhands.automations.intake.prepare",
    "openhands.automations.intake.state",
    "openhands.automations.setup",
    "work.take",
  ].map((name) => [name, removed]),
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

// The refusal for a CLI call from an agent session, or null. `--as-person`
// is the typed override.
export function cliRefusal(name, input, { env = process.env, asPerson } = {}) {
  const reason = mcpRefusal(name, input);
  if (!reason || asPerson || !agentSession(env)) return null;
  return (
    reason.replace(/ Do it in the Avoozl app\.$/, "") +
    " This command is running inside an agent session. Do it in the Avoozl" +
    " app, or add --as-person if you are the person typing it."
  );
}
