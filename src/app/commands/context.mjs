// CLI commands of one kind: command, help lines and run.
// Epic context (epic-context EC2.3, EC4.2): the machine block and a plugin
// ask's answer, a person's acts at a terminal.
import { help } from "../cli/command-help.mjs";

const print = (value) => console.log(JSON.stringify(value, null, 2));

export const commands = [
  {
    command: "context set",
    help: [
      help(
        "setup",
        "context set --json '{...}' | --remove",
        "Set this machine's epicContext block (repos, reads, mcp, contentSets)",
      ),
    ],
    async run({ options, localOrRequest }) {
      const value = options.remove ? null : JSON.parse(options.json ?? "null");
      if (value === null && !options.remove)
        throw Error("Give --json with the epicContext block, or --remove.");
      print(
        await localOrRequest("context.machine.set", { epicContext: value }),
      );
    },
  },
  {
    command: "context show",
    help: [
      help(
        "setup",
        "context show",
        "This machine's epicContext block, each plugin's context part and the last sessions that got context",
      ),
    ],
    async run({ localOrRequest }) {
      print(await localOrRequest("context.get", {}));
    },
  },
  {
    command: "plugins answer",
    help: [
      help(
        "setup",
        "plugins answer ID NAME VALUE",
        "Answer a context plugin's question on this machine; the plugin needs approving again",
      ),
    ],
    async run({ positionals, localOrRequest, need }) {
      const [, id, name, ...value] = positionals;
      need(value.length ? id : null, "plugins answer ID NAME VALUE");
      print(
        await localOrRequest("plugin.answer", {
          id,
          name,
          value: value.join(" "),
        }),
      );
    },
  },
];
