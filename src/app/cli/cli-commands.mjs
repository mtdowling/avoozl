// Every CLI command, from one table per kind of work. An entry is
// {command, help, run}: `command` is the word typed (`plan review` names a
// subcommand), `help` its usage lines for `avoozl help` (cli-help.mjs renders
// them) and `run` receives the parsed command line and the helpers cli.mjs
// builds. The dispatcher and the help both read this table.
import { commands as plans } from "../commands/plans.ts";
import { commands as delivery } from "../commands/delivery.ts";
import { commands as machine } from "../commands/machine.ts";
import { commands as inspect } from "../commands/inspect.ts";
import { commands as setup } from "../commands/setup.ts";
import { commands as data } from "../commands/data.ts";
import { commands as context } from "../commands/context.ts";
import { commands as telemetry } from "../commands/telemetry.ts";
import { commands as insights } from "../commands/insights.ts";

export const COMMANDS = [
  ...plans,
  ...delivery,
  ...machine,
  ...inspect,
  ...setup,
  ...data,
  ...context,
  ...telemetry,
  ...insights,
];

const byWords = new Map();
for (const entry of COMMANDS) {
  if (byWords.has(entry.command))
    throw Error(`CLI command ${entry.command} is registered twice.`);
  byWords.set(entry.command, entry);
}

// The entry for `command` and its first argument: `plan review` before
// `plan`. With none, the command names an operation (the OPERATION entry).
export const findCommand = (command, positionals) =>
  byWords.get(`${command} ${positionals[0]}`) ??
  byWords.get(command) ??
  byWords.get("OPERATION");
