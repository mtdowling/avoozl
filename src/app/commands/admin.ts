// CLI commands for approvals, settings, setup and deletes: each names the
// operation an MCP tool also reaches (plans_autopilot, plans_settings,
// plans_setup, plans_plugin_admin, plans_control). Input comes from the
// positionals the usage names and from --json JSON (or --input FILE);
// --yes confirms a delete (cli.ts).
import {
  type Command,
  type CommandContext,
  help,
} from "../cli/command-help.ts";

// One subcommand: its operation, the input keys its positionals fill in
// order, and fixed input it always sends.
type Sub = [
  operation: string,
  positionals?: string[],
  fixed?: Record<string, unknown>,
];

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

// A command whose first positional picks a subcommand (or that is one
// operation when `subs` has the single key ""), with the rest filling the
// subcommand's input keys.
function opCommand(
  command: string,
  lines: [usage: string, about: string][],
  subs: Record<string, Sub>,
  group = "setup",
): Command {
  const words = command.split(" ").length - 1;
  return {
    command,
    help: lines.map(([usage, about]) => help(group, usage, about)),
    async run({ positionals, input, localOrRequest }: CommandContext) {
      const rest = positionals.slice(words),
        single = Object.hasOwn(subs, ""),
        name = single ? "" : (rest[0] ?? ""),
        sub = Object.hasOwn(subs, name) ? subs[name] : undefined;
      if (!sub)
        throw Error(
          `Choose ${command} ${Object.keys(subs).join(", ")}. avoozl help ${command.split(" ")[0]} shows each.`,
        );
      const [operation, keys = [], fixed = {}] = sub,
        values = single ? rest : rest.slice(1),
        named = Object.fromEntries(
          keys.flatMap((key, i) =>
            values[i] === undefined ? [] : [[key, values[i]]],
          ),
        );
      print(
        await localOrRequest(operation, { ...input(), ...named, ...fixed }),
      );
    },
  };
}

// Each settings area: the operation that reads it and the one that writes.
const SETTINGS: Record<string, [read: string, write: string]> = {
  workspace: ["configuration.get", "configuration.update"],
  flow: ["flow.settings.get", "flow.settings.update"],
  models: ["models.settings.get", "models.settings.update"],
  delivery: ["delivery.settings.get", "delivery.settings.update"],
  conversations: [
    "conversations.settings.get",
    "conversations.settings.update",
  ],
  activity: ["activity.settings.get", "activity.settings.update"],
  github: ["github.settings.get", "github.settings.update"],
  telemetry: ["telemetry.status", "telemetry.configure"],
  "content-sets": ["content.rules", "content.sets.update"],
  "content-terms": ["content.terms.get", "content.terms.update"],
  "agent-instructions": ["configuration.get", "agent.instructions.toggle"],
};

export const commands: Command[] = [
  opCommand(
    "autopilot",
    [
      [
        "autopilot on|off|status [--workspace PATH]",
        "Turn Autopilot on or off here: the workspace's delivery block and this machine's loop together, as Settings › Autopilot does",
      ],
    ],
    {
      status: ["autopilot.status"],
      on: ["autopilot.set", [], { on: true }],
      off: ["autopilot.set", [], { on: false }],
    },
    "deliver",
  ),
  {
    command: "settings",
    help: [
      help(
        "setup",
        `settings get|set AREA [--json JSON]`,
        `Read or change one settings area: ${Object.keys(SETTINGS).join(", ")}`,
      ),
    ],
    async run({ positionals, input, localOrRequest, need }) {
      const [action, area] = positionals,
        usage = "settings get|set AREA [--json JSON]";
      const pair = Object.hasOwn(SETTINGS, need(area, usage))
        ? SETTINGS[area]
        : null;
      if (!pair || (action !== "get" && action !== "set"))
        throw Error(
          `Usage: avoozl ${usage}, AREA one of ${Object.keys(SETTINGS).join(", ")}.`,
        );
      print(
        await localOrRequest(pair[action === "get" ? 0 : 1], {
          ...(action === "set" ? input() : {}),
        }),
      );
    },
  },
  opCommand(
    "runner release",
    [
      [
        "runner release",
        "Let the tick run this workspace: removes delivery.runner",
      ],
    ],
    { "": ["delivery.runner.release"] },
    "deliver",
  ),
  opCommand(
    "landing",
    [
      [
        "landing ready|merge --json JSON",
        "Release a draft pull request, or merge one Avoozl opened",
      ],
    ],
    { ready: ["landing.ready"], merge: ["landing.merge"] },
    "land",
  ),
  opCommand(
    "integration land",
    [
      [
        "integration land REPOSITORY BRANCH [--json JSON]",
        "Approve landing an integration branch",
      ],
    ],
    { "": ["integration.land", ["repository", "branch"]] },
    "land",
  ),
  opCommand(
    "harness run-on",
    [
      [
        "harness run-on ROLE HARNESS",
        "Run a role that waits on Kiro Crew on an approved harness",
      ],
    ],
    { "": ["needskirocrew.runon", ["role", "harness"]] },
    "machine",
  ),
  opCommand(
    "github connect",
    [
      [
        "github connect REPOSITORY_ID [--json JSON]",
        "Connect a registered repository to its GitHub remote",
      ],
    ],
    { "": ["github.repository.connect", ["repositoryId"]] },
  ),
  opCommand(
    "github allow",
    [
      [
        "github allow --json STEPS --yes",
        "Allow high-risk GitHub steps; prints the grant ids an apply passes as allow",
      ],
    ],
    { "": ["github.job.confirm"] },
  ),
  opCommand(
    "intake source",
    [
      [
        "intake source add --json SOURCE | intake source remove ID --yes",
        "Add or remove an intake source",
      ],
    ],
    {
      add: ["intake.source.add"],
      remove: ["intake.source.remove", ["id"]],
    },
    "plan",
  ),
  opCommand(
    "plugins admin",
    [
      [
        "plugins admin credentials|check-updates|updates|answer --json JSON",
        "Pick a host's credentials plugin, check for updates, switch the daily check, or answer a context plugin",
      ],
    ],
    {
      credentials: ["plugin.credentials.pick"],
      "check-updates": ["plugin.updates.check"],
      updates: ["plugin.updates.configure"],
      answer: ["plugin.answer"],
    },
  ),
  opCommand(
    "checks flip",
    [
      [
        "checks flip TASK_ID --json JSON",
        'Run it or Skip it on a plugin check: --json \'{"check":ID,"needed":true}\'',
      ],
    ],
    { "": ["check.decide.flip", ["taskId"]] },
    "deliver",
  ),
  opCommand(
    "session",
    [
      [
        "session send|open --json JSON",
        "Send a message to a process session, or open a session",
      ],
    ],
    { send: ["session.send"], open: ["session.open"] },
    "deliver",
  ),
  opCommand(
    "report delete",
    [["report delete ID --yes", "Delete a saved report"]],
    { "": ["report.delete", ["id"]] },
    "data",
  ),
  opCommand(
    "repositories",
    [
      [
        "repositories configure --json JSON | repositories remove ID --yes",
        "Add or change registered repositories, or remove one",
      ],
    ],
    {
      configure: ["repositories.configure"],
      remove: ["repositories.remove", ["id"]],
    },
  ),
  opCommand(
    "repository remove",
    [["repository remove ID --yes", "Remove one repository"]],
    { "": ["repository.remove", ["id"]] },
  ),
];
