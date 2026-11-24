// Settings' plugin list and actions (§4.8, R34.9), from Settings, the CLI or
// the plans_plugin_admin MCP tool. Operations.pluginOperation holds the work.
import { contentBinding } from "../content/content-rules.ts";
import { audited, destructive, routed } from "../api/operation-policy.ts";
import { setMapping } from "../plugins/plugin-checks.ts";
import { flipDecide, submitDecide } from "../plugins/check-decide.ts";
import { stageResults } from "../plugins/check-stages.ts";
import { fail } from "../store/store.ts";
import { callerName } from "../store/activity-log.ts";
import { requireInput } from "../api/operation-support.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

async function pluginHandler(
  this: Operations,
  { name, input, context }: OperationCall,
) {
  if (BY_ID.has(name)) requireInput(input, ["id"]);
  const result = await this.pluginOperation(name, input, context);
  // A plugin change reloads rules plugins on the next operation.
  if (!["plugins.list", "plugin.preview"].includes(name))
    contentBinding(this.store)?.plugins.clear();
  return result;
}

const reads = ["plugins.list", "plugin.preview"];
// The plugin writes that name one declared plugin.
const BY_ID = new Set([
  "plugin.approve",
  "plugin.disable",
  "plugin.remove",
  "plugin.update",
]);
const writes = [
  "plugin.add",
  "plugin.approve",
  "plugin.disable",
  "plugin.remove",
  "plugin.update",
  // Which credentials plugin serves a host where two claim one owner
  // (plugin-credentials PC2.6, PC8.2).
  "plugin.credentials.pick",
  // Check now, and the daily update check's switch (R34.17).
  "plugin.updates.check",
  "plugin.updates.configure",
];

// A checks plugin's server mapping (plugin-checks PK10.3). A changed
// mapping leaves the plugin's approval stale.
function mapHandler(this: Operations, { input }: OperationCall) {
  requireInput(input, ["id"]);
  const options = this.pluginOptions;
  if (!options?.workspaceRoot) fail("Plugins need a workspace root.", 409);
  const plugin = setMapping(options, input ?? {});
  contentBinding(this.store)?.plugins.clear();
  const { manifest: _m, entry: _e, ...shown } = plugin ?? {};
  return shown;
}

export const entries = [
  ...reads.map((name) => ({
    name,
    class: "observe",
    github: null,
    policy: routed,
    handler: pluginHandler,
  })),
  ...writes.map((name) => ({
    name,
    class: "protect",
    github: null,
    policy: name === "plugin.remove" ? destructive : audited,
    handler: pluginHandler,
  })),
  {
    name: "plugin.map",
    github: null,
    class: "protect",
    policy: audited,
    handler: mapHandler,
  },
  // A plugin check's decide call (plugin-checks D5): its bound session's
  // one answer, and Run it / Skip it.
  {
    name: "check.decide.submit",
    github: null,
    class: "execute",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      return submitDecide(this.store, input, context.caller);
    },
  },
  {
    name: "check.decide.flip",
    github: null,
    class: "protect",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      return flipDecide(this.store, input, {
        by: callerName(context, this.operator),
      });
    },
  },
  // The phase and branch plugin check results (plugin-checks D10). Reads
  // only stored records.
  {
    name: "plugin.checks.stages",
    github: null,
    class: "observe",
    policy: routed,
    handler(this: Operations) {
      return stageResults(this.store);
    },
  },
];
