// Settings' plugin list and actions (§4.8, R34.9). Approval is a person's act
// in Settings or the CLI: an agent session cannot approve a plugin, and no MCP
// tool offers it. Operations.pluginOperation holds the work.
import { contentBinding } from "../content-rules.mjs";
import { person, routed } from "../operation-policy.mjs";

async function pluginHandler({ name, input, context }) {
  const result = await this.pluginOperation(name, input, context);
  // A plugin change reloads rules plugins on the next operation.
  if (!["plugins.list", "plugin.preview", "plugin.pack.preview"].includes(name))
    contentBinding(this.store)?.plugins.clear();
  return result;
}

const changesPlugins = person("Only a person changes plugins.");
const reads = [
  "plugins.list",
  "plugin.preview",
  "plugin.pack.preview",
  "template.list",
  "template.preview",
];
const writes = [
  "plugin.add",
  "plugin.approve",
  "plugin.disable",
  "plugin.remove",
  "plugin.update",
  "plugin.pack.import",
];

export const entries = [
  ...reads.map((name) => ({
    name,
    class: "observe",
    policy: routed,
    handler: pluginHandler,
  })),
  ...writes.map((name) => ({
    name,
    class: "protect",
    policy: changesPlugins,
    handler: pluginHandler,
  })),
];
