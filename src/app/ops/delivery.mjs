// Operations of one feature: name, class, MCP policy and handler.
import {
  approveIntegration,
  readyCandidates,
  retryDelivery,
} from "../delivery/delivery.mjs";
import { integrateRun } from "../git/git.mjs";
import { planningIdentity } from "../github/github-marker.mjs";
import { readGitHubPolicyOrNull } from "../github/github-policy.mjs";
import {
  checkIntegrationBranch,
  requireIntegrationBranch,
} from "../epics/integration-branch.mjs";
import { integrationView, landBranch } from "../epics/integration-head.mjs";
import { landingQueueView } from "../landing/landing-queue-view.mjs";
import { landingView } from "../landing/landing-view.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import { manualTake } from "../workers/manual-take.mjs";
import { deliverNotifications } from "../tick/notifications.mjs";
import { stampPrompts } from "../api/operation-support.mjs";
import { deliveryView } from "../api/page-views.mjs";
import {
  clearMark,
  providersView,
  queueSwitch,
  switchDryRun,
  switchPreview,
  updateProviders,
} from "../flow/provider-health.mjs";
import { releaseQueue } from "../mirror/release-queue.mjs";
import {
  acceptWork,
  pullWork,
  readRunnerConfig,
  reportDone,
  runnerStatus,
} from "../workers/remote-runner.mjs";
import { nextView } from "../workers/runner.mjs";
import { fail } from "../store/store.mjs";
import { readDeliveryPolicy } from "../tick/tick.mjs";
import { allowProtectedPaths } from "../delivery/verify.mjs";
import { previewWorker } from "../workers/worker-setup.mjs";
import { person, notOnMcp, routed } from "../api/operation-policy.mjs";

export const entries = [
  // Runner mode over SSH (R84): off unless .avoozl.json has `runner`.
  // shortcut: no machine reports remote workers to a driver now, so the
  // list is always empty. The page's In flight and Delivery still read it;
  // remove it with their remote rows, which need new screenshots.
  {
    name: "remote.view",
    class: "observe",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({}) {
      return { workers: [] };
    },
  },

  {
    name: "remote.status",
    class: "observe",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({}) {
      const store = this.store;
      return runnerStatus(store, this.workspaceRoot);
    },
  },

  {
    name: "remote.report",
    class: "execute",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({ input }) {
      const store = this.store;
      return reportDone(store, this.workspaceRoot, input);
    },
  },

  {
    name: "worker.accept",
    class: "execute",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({}) {
      const store = this.store;
      return acceptWork(store, this.workspaceRoot, this.github);
    },
  },

  {
    name: "worker.setup",
    class: "execute",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({}) {
      const config = readRunnerConfig(this.workspaceRoot);
      if (config?.role !== "worker")
        fail('This workspace is not a worker (runner.role "worker").');
      return previewWorker({ config, github: this.github });
    },
  },

  {
    name: "worker.pull",
    class: "execute",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({}) {
      const store = this.store;
      return pullWork(store, this.workspaceRoot, this.github);
    },
  },

  {
    name: "runner.next",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return nextView(store, {
        policy: readDeliveryPolicy(this.workspaceRoot),
        github: readGitHubPolicyOrNull(this.workspaceRoot),
      });
    },
  },
  // Taking a task by hand is the person's at this machine's command line
  // (worker-paths WP2.7): never over MCP or from an agent session.
  {
    name: "runner.take",
    class: "execute",
    policy: person("Only a person takes a task by hand."),
    async handler({ input, context }) {
      const store = this.store;

      if (context.local !== true || context.caller || context.mcp)
        fail(
          "Taking a task is a person's: run avoozl take TASK from the command line.",
          403,
        );
      return stampPrompts(
        store,
        await manualTake(
          store,
          { ...input, workspaceRoot: this.workspaceRoot },
          { github: readGitHubPolicyOrNull(this.workspaceRoot) },
        ),
      );
    },
  },
  // Let the tick run it (WP1.3): a person's, from the page or the CLI.
  {
    name: "delivery.runner.release",
    class: "protect",
    policy: person("Only a person lets the tick run this workspace."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail("Only a person lets the tick run this workspace.", 403);
      const file = this.settingsFile();
      file.removeDeliveryRunner({
        expectedHash: input.expectedHash ?? file.readFile().hash,
      });
      this.configuration?.reload();
      return { released: true };
    },
  },
  // Provider health and model switches (§4.20, R72). The writes are a
  // person's: mcp-policy.mjs refuses them for MCP, the backend for tokens.
  {
    name: "providers.view",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return providersView(store, this.providerOptions());
    },
  },

  {
    name: "provider.switch.preview",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return switchPreview(store, input, this.providerOptions());
    },
  },
  // Switch model's step 2 (R72.12): what Switch would do, with the ready
  // tasks Also new tasks moves. Person-only; writes nothing.
  {
    name: "provider.switch.dryRun",
    class: "protect",
    policy: person("Only a person runs a model switch's dry run."),
    handler({ input }) {
      const store = this.store;

      const github = readGitHubPolicyOrNull(this.workspaceRoot);
      let ready = [];
      // Each ready task with the model its worker would open on.
      if (input.alsoNewTasks === true)
        try {
          const model = readDeliveryPolicy(this.workspaceRoot).delivery?.model;
          ready = readyCandidates(store, { github }).map((task) => ({
            taskId: task.id,
            model: task.session?.model ?? model ?? null,
          }));
        } catch {
          // The dry run still answers; the page says the list is unread.
          ready = null;
        }
      return switchDryRun(store, input, { ...this.providerOptions(), ready });
    },
  },

  {
    name: "provider.switch",
    class: "protect",
    policy: person("Only a person switches models."),
    handler({ input }) {
      const store = this.store;
      return queueSwitch(store, input, this.providerOptions());
    },
  },

  {
    name: "provider.health.clear",
    class: "protect",
    policy: person("Only a person undoes a provider mark."),
    handler({ input }) {
      const store = this.store;
      return clearMark(store, input);
    },
  },

  {
    name: "providers.settings.update",
    class: "protect",
    policy: person("Only a person changes provider settings."),
    handler({ input }) {
      const store = this.store;
      return updateProviders(store, input);
    },
  },
  // Ship mode manual in Local only (§4.25, R80.4): a person's Integrate.
  {
    name: "delivery.integrate",
    class: "protect",
    policy: person("Only a person presses Integrate on a Ready to merge task."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person presses Integrate, in the Avoozl page or the CLI.",
          403,
        );
      return approveIntegration(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    },
  },

  {
    name: "delivery.settings.get",
    class: "observe",
    policy: routed,
    handler({}) {
      return this.settingsFile().readDeliverySettings();
    },
  },

  {
    name: "delivery.settings.update",
    class: "protect",
    policy: person("Only a person changes delivery settings."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail(
          "Only a person changes delivery settings, in the Avoozl page.",
          403,
        );
      const written = this.settingsFile().updateDeliverySettings(input);
      this.configuration?.reload();
      return written;
    },
  },

  {
    name: "verify.allow",
    class: "protect",
    policy: person("Only a person lets a commit's protected paths land."),
    handler({ input, context }) {
      const store = this.store;
      return allowProtectedPaths(store, input, {
        caller: context.caller,
        mcp: context.mcp === true,
        local: context.local === true,
      });
    },
  },

  {
    name: "delivery.retry",
    class: "protect",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return retryDelivery(store, input, {
        caller: context.caller,
        mcp: context.mcp === true,
        local: context.local === true,
      });
    },
  },

  {
    name: "notifications.deliver",
    class: "execute",
    policy: notOnMcp("The tick delivers notifications itself."),
    handler({}) {
      const store = this.store;
      return deliverNotifications(store, this.notifier);
    },
  },

  {
    name: "delivery.view",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return {
        ...deliveryView(store, this.read(), { config: this.savedConfig() }),
        // How many chats this Mac runs at once (R88.5); null when delivery is off.
        laneLimit:
          readDeliveryPolicy(this.workspaceRoot).delivery?.concurrency ?? null,
      };
    },
  },
  // Dashboards › Landing queue: per base, in order, with hold reasons;
  // from the store only, so Refresh never calls GitHub (44.5).
  {
    name: "landing.queue",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return landingQueueView(store, this.read(), {
        config: this.workspaceRoot
          ? loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config
          : null,
      });
    },
  },
  // The Release queue: mirror forwards merged in a private mirror and not
  // yet public. Read only.
  {
    name: "radar.releasequeue",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return releaseQueue(store, planningIdentity(this.workspaceRoot));
    },
  },

  // Integration branches (RC16.3, RC16.8): tasks merged, distance behind the
  // default branch, head checks, acceptance. Landing is a person's approval
  // of one head; Avoozl never merges the branch.
  {
    name: "integration.view",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return integrationView(store);
    },
  },
  // The landing queues and recent landings, from the store only (Home).
  {
    name: "landing.view",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return landingView(store, this.read());
    },
  },

  {
    name: "integration.land",
    class: "execute",
    policy: person("Only a person approves landing an integration branch."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person approves landing a branch, in the Avoozl page.",
          403,
        );
      return landBranch(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    },
  },

  {
    name: "radar.integrationbranch",
    class: "observe",
    policy: routed,
    async handler({ input }) {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        entry = policy?.repositories?.[input.repository];
      if (!input.repository || !input.branch)
        fail("Name the repository and the integration branch.", 400);
      if (!entry)
        fail(`${input.repository} is not a registered repository.`, 404);
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      return requireIntegrationBranch(
        await checkIntegrationBranch(
          this.github,
          input.repository,
          input.branch,
          entry,
        ),
      );
    },
  },

  {
    name: "integration.merge",
    class: "protect",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      return integrateRun(store, input);
    },
  },
];
