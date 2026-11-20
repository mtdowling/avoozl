// Operations of one feature: name, class, MCP policy and handler.
import {
  driverContext,
  driverStatus,
  updateMachineSettings,
} from "../workers/driver.mjs";
import { planningIdentity } from "../github/github-marker.mjs";
import { publishSpec } from "../specs/spec-publication.mjs";
import { fail } from "../store/store.mjs";
import { publishPlanningPullRequest } from "../workspace/workspace-repository.mjs";
import { person, routed } from "../api/operation-policy.mjs";

export const entries = [
  // The spec driver (§6.10): the spec issue's assignee. Status reads
  // everywhere; changing this computer's settings is a person's.
  {
    name: "driver.status",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return driverStatus(store, input);
    },
  },

  {
    name: "driver.settings.update",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes this computer's driver settings."),
    handler({ input }) {
      const store = this.store;

      const ctx = driverContext(store);
      if (!ctx) fail("This workspace has no driver settings.", 409);
      updateMachineSettings(store, ctx.settingsFile, input);
      return driverStatus(store);
    },
  },

  // Publish issue (R102.2): a person's explicit act, never part of approval.
  {
    name: "spec.publish",
    class: "execute",
    github: "spec-issues",
    policy: person("Only a person publishes a spec issue."),
    async handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person publishes a spec issue.", 403);
      return publishSpec(store, {
        github: this.github,
        identity: planningIdentity(this.workspaceRoot),
        planId: input.planId,
        repository: input.repository,
      });
    },
  },
  {
    name: "planning.publish",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return publishPlanningPullRequest(store, this.github, input);
    },
  },

  {
    name: "planning.reconcile",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({}) {
      return this.reconcilePlanningPullRequests();
    },
  },
];
