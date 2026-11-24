// Epic context operations (epic-context EC2.3, EC4.5, EC9.4): the machine
// block, a plugin ask's answer, and the Settings page's read. Changing any of
// them is recorded in Activity with its caller.
import { notOnMcp, audited } from "../api/operation-policy.ts";
import { contentBinding } from "../content/content-rules.ts";
import { contextView, setAnswer } from "../context/plugin-context.ts";
import {
  checkReadsExist,
  readEpicContext,
  validateEpicContext,
  writeEpicContext,
} from "../context/epic-context-config.ts";
import { recentContextSessions } from "../context/context-record.ts";
import { inspectPlugins, readPluginSettings } from "../plugins/plugins.ts";
import { fail } from "../store/store.ts";
import { requireInput } from "../api/operation-support.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

export const entries = [
  {
    name: "context.get",
    class: "observe",
    github: null,
    policy: notOnMcp(
      "A task's epic context is read with the task; this is the Settings page's read.",
    ),
    handler(this: Operations) {
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
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      if (!this.configDirectory)
        fail("This workspace has no machine configuration folder.", 409);
      const value = input?.epicContext ?? null;
      if (value !== null) checkReadsExist(validateEpicContext(value));
      return { epicContext: writeEpicContext(this.configDirectory, value) };
    },
  },
  {
    name: "plugin.answer",
    class: "protect",
    github: null,
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      requireInput(input, ["id"]);
      const options = this.pluginOptions;
      if (!options?.workspaceRoot) fail("Plugins need a workspace root.", 409);
      const plugin = setAnswer(
        options,
        (input ?? {}) as Parameters<typeof setAnswer>[1],
      );
      contentBinding(this.store)?.plugins.clear();
      const { manifest: _m, entry: _e, ...shown } = plugin ?? {};
      return shown;
    },
  },
];
