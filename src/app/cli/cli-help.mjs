// What `avoozl help` prints. Every command's usage lines sit in its entry in
// cli-commands.mjs, each naming the job a person is doing; the overview, a
// group's page, one command's page and `help all` are all rendered from those
// lines, so a command is written down once.

import { TAGLINE } from "../../work-split.mjs";
import { COMMANDS } from "./cli-commands.mjs";

// The tagline as the help's heading, wrapped to a terminal's 80 columns.
const WIDTH = 80;
const HEADING = TAGLINE.split(" ").reduce((lines, word) => {
  const last = lines.at(-1);
  if (last && (last + " " + word).length <= WIDTH)
    lines[lines.length - 1] = last + " " + word;
  else lines.push(word);
  return lines;
}, []);

// The one name the help and error text use for the program.
export const PROGRAM = "avoozl";

// The groups, in the order the overview lists them. Each command's own usage
// lines (cli-commands.mjs) say which group they belong to.
const GROUPS = Object.freeze([
  {
    id: "setup",
    title: "Set up",
    summary: "Create a workspace, register it, connect repositories and GitHub",
  },
  {
    id: "plan",
    title: "Plan",
    summary: "Bring work in, then review, approve and publish specs",
  },
  {
    id: "deliver",
    title: "Deliver",
    summary: "Run agents on ready tasks, steer them and stop the line",
  },
  {
    id: "land",
    title: "Land",
    summary: "Merge verified work in merge batches",
  },
  {
    id: "inspect",
    title: "Inspect",
    summary: "See what a workspace and this machine are doing",
  },
  {
    id: "hooks",
    title: "Agent hooks",
    summary: "What an agent session or a git hook runs for itself",
  },
  {
    id: "machine",
    title: "Servers and machines",
    summary: "MCP servers, the supervisor, and work on other machines",
  },
  {
    id: "data",
    title: "Data",
    summary: "Back up, move and reindex a workspace; run any operation",
  },
]);

export const HELP_GROUPS = Object.freeze(
  GROUPS.map((group) => ({
    ...group,
    entries: COMMANDS.flatMap((command) => command.help).filter(
      (line) => line.group === group.id,
    ),
  })),
);

const OPTIONS = `Use --workspace PATH or AVOOZL_WORKSPACE to choose data independently
of the application checkout. --db, --documents, --port, --operator and --url
override workspace configuration. A person-only operation run inside an agent
session runs and is recorded as run there. UI, CLI and MCP share application
operations.`;

// The command words a usage line starts with: `plugins disable|enable ID`
// names plugins. An OPERATION line names no command.
const commandsOf = ({ usage }) => {
  const word = usage.split(/\s/)[0];
  return /^[a-z][a-z|-]*$/.test(word) ? word.split("|") : [];
};

// Every command the help holds, in the order it first appears.
export const helpCommands = () => [
  ...new Set(HELP_GROUPS.flatMap((group) => group.entries.flatMap(commandsOf))),
];

const INDENT = "      ";
function lines({ usage, about }) {
  const [first, ...rest] = usage.split("\n");
  return [
    `  ${PROGRAM} ${first}`,
    ...rest.map((line) => INDENT + line),
    ...(about ? about.split("\n").map((line) => INDENT + line) : []),
  ];
}

const heading = (group) => `${group.title}: ${group.summary}`;

// Words wrapped to `width`, each line after `indent`.
function wrapped(words, indent, width = 78) {
  const out = [];
  let line = "";
  for (const word of words) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      out.push(indent + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(indent + line);
  return out;
}

function overview() {
  const first = HELP_GROUPS.flatMap((group) =>
      group.entries.filter((e) => e.first).map((e) => e.first),
    ),
    width = Math.max(...first.map((e) => e.usage.length)) + 2,
    pad = Math.max(...HELP_GROUPS.map((group) => group.id.length)) + 2;
  return [
    ...HEADING,
    "",
    `Usage: ${PROGRAM} COMMAND [ARGUMENTS] [--workspace PATH]`,
    "",
    "Start here:",
    ...first.map((e) =>
      `  ${PROGRAM} ${e.usage.padEnd(width)}${e.about}`.trimEnd(),
    ),
    "",
    `Every command, by job. ${PROGRAM} help GROUP shows a group in full:`,
    ...HELP_GROUPS.flatMap((group) => [
      `  ${group.id.padEnd(pad)}${group.summary}`,
      ...wrapped(
        [...new Set(group.entries.flatMap(commandsOf))],
        " ".repeat(pad + 4),
      ),
    ]),
    "",
    `  ${PROGRAM} help COMMAND   One command's usage, such as ${PROGRAM} help flow`,
    `  ${PROGRAM} help all       Every usage line`,
    "",
    `Most commands act on one workspace: pass --workspace PATH or set`,
    `AVOOZL_WORKSPACE. ${PROGRAM} help data lists the other shared options.`,
  ].join("\n");
}

const groupPage = (group) =>
  [heading(group), "", ...group.entries.flatMap(lines)].join("\n");

// The help for `topic`: nothing for the overview, a group ID, a command, or
// `all`. Returns null when there is no such topic.
export function helpText(topic) {
  if (topic === undefined || topic === null || topic === "") return overview();
  if (topic === "all")
    return [
      ...HEADING,
      "",
      ...HELP_GROUPS.flatMap((group) => [groupPage(group), ""]),
      OPTIONS,
    ].join("\n");
  const group = HELP_GROUPS.find(({ id }) => id === topic);
  if (group)
    return [
      groupPage(group),
      ...(group.id === "data" ? ["", OPTIONS] : []),
    ].join("\n");
  const found = HELP_GROUPS.flatMap((g) =>
    g.entries
      .filter((e) => commandsOf(e).includes(topic))
      .map((e) => ({ group: g, entry: e })),
  );
  if (!found.length) return null;
  const groups = [...new Set(found.map(({ group }) => group))];
  return [
    `${PROGRAM} ${topic} (${groups.map((g) => `${PROGRAM} help ${g.id}`).join(", ")})`,
    "",
    ...found.flatMap(({ entry }) => lines(entry)),
  ].join("\n");
}

// The line that sends a person to the right help after a refusal: the
// command's own page when the help holds it, else the overview.
export function helpPointer(command) {
  return helpCommands().includes(command)
    ? `Run ${PROGRAM} help ${command} for its usage.`
    : `Run ${PROGRAM} help for the commands.`;
}
