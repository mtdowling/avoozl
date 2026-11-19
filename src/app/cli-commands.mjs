// Every CLI command, from one table per kind of work. An entry is
// {command, help, run}: `command` is the word typed (`plan review` names a
// subcommand), `help` its usage lines for `avoozl help` (cli-help.mjs renders
// them) and `run` receives the parsed command line and the helpers cli.mjs
// builds. The dispatcher and the help both read this table.
import { commands as plans } from "./commands/plans.mjs";
import { commands as delivery } from "./commands/delivery.mjs";
import { commands as machine } from "./commands/machine.mjs";
import { commands as inspect } from "./commands/inspect.mjs";
import { commands as setup } from "./commands/setup.mjs";
import { commands as data } from "./commands/data.mjs";

export const COMMANDS = [
  ...plans,
  ...delivery,
  ...machine,
  ...inspect,
  ...setup,
  ...data,
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
