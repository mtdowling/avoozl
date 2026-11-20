// Settings' plugin list and actions (§4.8, R34.9). Approval is a person's act
// in Settings or the CLI: an agent session cannot approve a plugin, and no MCP
// tool offers it. Operations.pluginOperation holds the work.
import { contentBinding } from "../content/content-rules.mjs";
import { person, routed } from "../api/operation-policy.mjs";
import { setMapping } from "../plugins/plugin-checks.mjs";
import { flipDecide, submitDecide } from "../plugins/check-decide.mjs";
import { stageResults } from "../plugins/check-stages.mjs";
import { fail } from "../store/store.mjs";

async function pluginHandler({ name, input, context }) {
  const result = await this.pluginOperation(name, input, context);
  // A plugin change reloads rules plugins on the next operation.
  if (!["plugins.list", "plugin.preview"].includes(name))
    contentBinding(this.store)?.plugins.clear();
  return result;
}

const changesPlugins = person("Only a person changes plugins.");
const reads = ["plugins.list", "plugin.preview"];
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

// A checks plugin's server mapping (plugin-checks PK10.3): a person's act
// only, refused over MCP and for an app token. A changed mapping leaves the
// plugin's approval stale.
function mapHandler({ input, context }) {
  if (context.caller || context.mcp)
    fail("Only a person maps a plugin's server, in Settings or the CLI.", 403);
  const options = this.pluginOptions;
  if (!options?.workspaceRoot) fail("Plugins need a workspace root.", 409);
  const plugin = setMapping(options, input ?? {});
  contentBinding(this.store)?.plugins.clear();
  const { manifest: _m, entry: _e, ...shown } = plugin;
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
    policy: changesPlugins,
    handler: pluginHandler,
  })),
  {
    name: "plugin.map",
    github: null,
    class: "protect",
    policy: changesPlugins,
    handler: mapHandler,
  },
  // A plugin check's decide call (plugin-checks D5): its bound session's
  // one answer, and a person's Run it / Skip it.
  {
    name: "check.decide.submit",
    github: null,
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      return submitDecide(this.store, input, context.caller);
    },
  },
  {
    name: "check.decide.flip",
    github: null,
    class: "protect",
    policy: person("Only a person runs or skips a plugin check."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail("Only a person runs or skips a plugin check.", 403);
      return flipDecide(this.store, input, {
        by: this.operator || (context.local ? "cli" : "dashboard"),
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
    handler() {
      return stageResults(this.store);
    },
  },
];
