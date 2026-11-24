// Operations of one feature: name, class, MCP policy and handler.
import {
  allowOnce,
  contentItems,
  describeSets,
  readTermsFile,
  showDecisionLine,
  writeTermsFile,
} from "../content/content-rules.ts";
import { inspectPlugins } from "../plugins/plugins.ts";
import { fail } from "../store/store.ts";
import { routed, audited } from "../api/operation-policy.ts";
import { callerName } from "../store/activity-log.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

// Settings > Content rules editing, and the terms file it writes.
function contentTermsGetHandler(
  this: Operations,
  { name, input }: OperationCall,
) {
  const store = this.store;

  if (name === "content.terms.get") return readTermsFile(store, input);
  if (name === "content.terms.update") return writeTermsFile(store, input);
  const written = this.settingsFile().updateContentRules(input, {
    pluginIds: inspectPlugins(this.pluginOptions)
      .map((p) => p.id)
      .filter(Boolean),
  });
  this.configuration?.reload();
  return {
    ...describeSets(store),
    ...contentItems(store),
    configHash: written.hash,
    mode: this.contentMode(),
  };
}

export const entries = [
  {
    name: "content.rules",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;

      let configHash = null;
      try {
        configHash = this.settingsFile().readFile().hash;
      } catch {}
      return {
        ...describeSets(store),
        ...contentItems(store),
        configHash,
        mode: this.contentMode(),
      };
    },
  },
  {
    name: "content.terms.get",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler: contentTermsGetHandler,
  },
  {
    name: "content.terms.update",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler: contentTermsGetHandler,
  },
  {
    name: "content.sets.update",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler: contentTermsGetHandler,
  },

  {
    name: "content.allow",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      return allowOnce(store, input, {
        operator: callerName(context, this.operator),
      });
    },
  },

  {
    name: "content.show",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      return showDecisionLine(store, input.id);
    },
  },

  {
    name: "content.check",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      return this.contentCheck(input);
    },
  },
];
