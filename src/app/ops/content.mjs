// Operations of one feature: name, class, MCP policy and handler.
import {
  allowOnce,
  contentItems,
  describeSets,
  readTermsFile,
  showDecisionLine,
  writeTermsFile,
} from "../content/content-rules.mjs";
import { inspectPlugins } from "../plugins/plugins.mjs";
import { fail } from "../store/store.mjs";
import { person, routed } from "../api/operation-policy.mjs";

// Settings > Content rules editing: a person only. Terms are private, so
// a session can neither read nor write them.
function contentTermsGetHandler({ name, input, context }) {
  const store = this.store;

  if (context.caller || context.mcp)
    fail("Only a person edits content rules, in the Avoozl page.", 403);
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
    policy: routed,
    handler({}) {
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
    policy: person("Only a person reads content-rule terms."),
    handler: contentTermsGetHandler,
  },
  {
    name: "content.terms.update",
    class: "protect",
    policy: person("Only a person edits content-rule terms."),
    handler: contentTermsGetHandler,
  },
  {
    name: "content.sets.update",
    class: "protect",
    policy: person("Only a person edits content-rule sets."),
    handler: contentTermsGetHandler,
  },

  {
    name: "content.allow",
    class: "protect",
    policy: person("Only a person allows a blocked write once."),
    handler({ input, context }) {
      const store = this.store;
      return allowOnce(store, input, {
        operator: this.operator,
        caller: context.caller || context.mcp ? context.caller || "mcp" : null,
      });
    },
  },

  {
    name: "content.show",
    class: "protect",
    policy: person("Only a person reads a matched line."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person reads a matched line, in the Avoozl page or the CLI.",
          403,
        );
      return showDecisionLine(store, input.id);
    },
  },

  {
    name: "content.check",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      return this.contentCheck(input, context);
    },
  },
];
