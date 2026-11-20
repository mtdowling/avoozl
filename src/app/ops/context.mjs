// Epic context operations (epic-context EC2.3, EC4.5, EC9.4): the machine
// block, a plugin ask's answer, and the Settings page's read. Changing any of
// them is a person's act, refused for MCP, a bound session and a child.
import { notOnMcp, person } from "../api/operation-policy.mjs";
import { contentBinding } from "../content/content-rules.mjs";
import { contextView, setAnswer } from "../context/plugin-context.mjs";
import {
  readEpicContext,
  writeEpicContext,
} from "../context/epic-context-config.mjs";
import { recentContextSessions } from "../context/context-record.mjs";
import { inspectPlugins, readPluginSettings } from "../plugins/plugins.mjs";
import { fail } from "../store/store.mjs";

const refuseAgent = (context, what) => {
  if (context.caller || context.mcp)
    fail(`Only a person ${what}, in Settings or the CLI.`, 403);
};

export const entries = [
  {
    name: "context.get",
    class: "observe",
    github: null,
    policy: notOnMcp(
      "A task's epic context is read with the task; this is the Settings page's read.",
    ),
    handler() {
      const options = this.pluginOptions;
      const settings = options?.workspaceRoot
        ? readPluginSettings(options.settingsFile)
        : null;
      return {
        machine: this.configDirectory
          ? readEpicContext(this.configDirectory)
          : null,
        plugins: settings
          ? inspectPlugins(options)
              .filter((plugin) => plugin.context)
              .map((plugin) => ({
                id: plugin.id,
                version: plugin.version,
                ...contextView(plugin, settings),
              }))
          : [],
        sessions: recentContextSessions(this.store),
      };
    },
  },
  {
    name: "context.machine.set",
    class: "protect",
    github: null,
    policy: person("Only a person changes this machine's epic context."),
    handler({ input, context }) {
      refuseAgent(context, "changes this machine's epic context");
      if (!this.configDirectory)
        fail("This workspace has no machine configuration folder.", 409);
      const value = input?.epicContext ?? null;
      return { epicContext: writeEpicContext(this.configDirectory, value) };
    },
  },
  {
    name: "plugin.answer",
    class: "protect",
    github: null,
    policy: person("Only a person answers a plugin's questions."),
    handler({ input, context }) {
      refuseAgent(context, "answers a plugin's questions");
      const options = this.pluginOptions;
      if (!options?.workspaceRoot) fail("Plugins need a workspace root.", 409);
      const plugin = setAnswer(options, input ?? {});
      contentBinding(this.store)?.plugins.clear();
      const { manifest: _m, entry: _e, ...shown } = plugin;
      return shown;
    },
  },
];
