// Operations of one feature: name, class, MCP policy and handler.
import { retryDelivery } from "../delivery/delivery.mjs";
import { integrateRun } from "../git/git.mjs";
import { readGitHubPolicyOrNull } from "../github/github-policy.mjs";
import {
  checkIntegrationBranch,
  requireIntegrationBranch,
} from "../epics/integration-branch.mjs";
import { integrationView, landBranch } from "../epics/integration-head.mjs";
import { landingQueueView } from "../landing/landing-queue-view.mjs";
import { landingView } from "../landing/landing-view.mjs";
import { approveMerge, releaseDraft } from "../landing/landing-pulls.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import { manualTake } from "../workers/manual-take.mjs";
import { deliverNotifications } from "../tick/notifications.mjs";
import { stampPrompts } from "../api/operation-support.mjs";
import { deliveryView } from "../api/page-views.mjs";
import { reportDone, runnerStatus } from "../workers/remote-runner.mjs";
import { claimNext, nextView } from "../workers/runner.mjs";
import { deleteClaim } from "../workers/claims.mjs";
import { lanesView, resumeLane } from "../sessions/lane-sessions.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { processSessionDetails } from "../executors/process-view.mjs";
import { landTask } from "../landing/land-task.mjs";
import { fail } from "../store/store.mjs";
import { laneWorkspace, readDeliveryPolicy } from "../tick/tick.mjs";
import { allowProtectedPaths } from "../delivery/verify.mjs";
import { machineLinks } from "../tick/crews.mjs";
import { person, notOnMcp, routed } from "../api/operation-policy.mjs";

export const entries = [
  // Runner mode over SSH (R84): off unless .avoozl.json has `runner`.
  // shortcut: no machine reports remote workers to a driver now, so the
  // list is always empty. The page's In flight and Delivery still read it;
  // remove it with their remote rows, which need new screenshots.
  {
    name: "remote.view",
    class: "observe",
    github: "check-in",
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
    github: "check-in",
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
    github: "worker-grants",
    policy: notOnMcp(
      "A worker machine reports by the CLI; no MCP tool accepts or reports a remote task.",
    ),
    handler({ input }) {
      const store = this.store;
      return reportDone(store, this.workspaceRoot, input);
    },
  },

  // With `claim`, it creates the best ready task's claim branch on origin
  // (simplify §D3), so it may write.
  {
    name: "runner.next",
    class: "execute",
    github: "worker-grants",
    policy: routed,
    handler({ input }) {
      const options = {
        policy: readDeliveryPolicy(this.workspaceRoot),
        github: readGitHubPolicyOrNull(this.workspaceRoot),
      };
      if (input?.claim === true)
        return claimNext(this.store, {
          ...options,
          client: this.github,
          workspaceRoot: this.workspaceRoot,
          linked: this.linkedSpecs(),
        });
      return nextView(this.store, options);
    },
  },
  // Taking a task by hand is the person's at this machine's command line
  // (worker-paths WP2.7): never over MCP or from an agent session.
  {
    name: "runner.take",
    class: "execute",
    github: "check-in",
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
  // Land one reported task now by its repository's mode (simplify §D7): the
  // caller that claimed it only, from `avoozl land` or plans_land.
  {
    name: "runner.land",
    class: "execute",
    github: "land",
    policy: routed,
    handler({ input, context }) {
      if (typeof input?.taskId !== "string" || !input.taskId)
        fail("Name the task: {taskId}.", 400);
      return landTask(this.store, input.taskId, {
        caller: context.caller,
        local: context.local === true && !context.mcp,
        github: this.github,
        workspaceRoot: this.workspaceRoot,
        config: this.workspaceRoot
          ? loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config
          : null,
      });
    },
  },
  // Delete branch on a stale claim (simplify §D3): a person's, from Needs you
  // or `avoozl claim delete`, as the high-risk claim-delete job that only
  // the confirm's grant lets through.
  {
    name: "claim.delete",
    class: "protect",
    github: "claim-delete",
    policy: person("Only a person deletes a claim branch."),
    handler({ input }) {
      return deleteClaim(this.store, this.github, input ?? {});
    },
  },
  // Let the tick run it (WP1.3): a person's, from the page or the CLI.
  {
    name: "delivery.runner.release",
    class: "protect",
    github: "check-in",
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
  {
    name: "delivery.settings.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({}) {
      return this.settingsFile().readDeliverySettings();
    },
  },

  {
    name: "delivery.settings.update",
    class: "protect",
    github: "check-in",
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
    github: "check-in",
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
    github: "check-in",
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
    github: "check-in",
    policy: notOnMcp("The tick delivers notifications itself."),
    handler({}) {
      const store = this.store;
      return deliverNotifications(store, this.notifier);
    },
  },

  {
    name: "delivery.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({}) {
      const store = this.store;
      return {
        ...deliveryView(store, this.read(), {
          destinations: {
            standalone: this.kirocrewAbsent,
            links: machineLinks(),
          },
        }),
        // How many chats this Mac runs at once (R88.5); null when delivery is off.
        laneLimit:
          readDeliveryPolicy(this.workspaceRoot).delivery?.concurrency ?? null,
      };
    },
  },
  // This machine's lanes (simplify §D22.3): each lane's role, harness,
  // state, task and how to open its session.
  {
    name: "lanes.view",
    class: "observe",
    github: "check-in",
    policy: notOnMcp("A person reads the lanes with avoozl lanes or the page."),
    handler({}) {
      const policy = readDeliveryPolicy(this.workspaceRoot).delivery;
      if (!policy) return { lanes: [] };
      const paths = machineAvoozlPaths();
      return {
        lanes: lanesView(
          this.store,
          policy,
          laneWorkspace(this.workspaceRoot),
          {
            attach: (slot) =>
              processSessionDetails([slot], paths).get(slot)?.attach ?? null,
          },
        ),
      };
    },
  },
  // Resume on a lane a person closed (simplify §D22.4).
  {
    name: "lane.resume",
    class: "execute",
    github: "check-in",
    policy: person("Only a person resumes a closed lane."),
    handler({ input }) {
      return resumeLane(this.store, input ?? {});
    },
  },
  // Dashboards › Landing queue: per base, in order, with hold reasons;
  // from the store only, so Refresh never calls GitHub (44.5).
  {
    name: "landing.queue",
    class: "observe",
    github: "check-in",
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
  // The Release queue: empty since labels stopped releasing work (TA11.1).
  // shortcut: a Radar leftover; delete it with the Release queue card.
  {
    name: "radar.releasequeue",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler() {
      return { repositories: [] };
    },
  },

  // Integration branches (RC16.3, RC16.8): tasks merged, distance behind the
  // default branch, head checks, acceptance. Landing is a person's approval
  // of one head; Avoozl never merges the branch.
  {
    name: "integration.view",
    class: "observe",
    github: "check-in",
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
    github: "check-in",
    policy: routed,
    handler({}) {
      const store = this.store;
      return landingView(store, this.read());
    },
  },

  // Approve on a draft pull request Avoozl opened (R119.3): marks it ready
  // for review on GitHub, and nothing more. GitHub refuses an approving
  // review of one's own pull request, and Avoozl opens them as the owner, so
  // Ready for review is the release. A person's only, never an agent's,
  // MCP's or the tick's.
  {
    name: "landing.ready",
    class: "execute",
    github: "land",
    policy: person("Only a person releases a draft pull request."),
    async handler({ input, context }) {
      if (context.caller || context.mcp)
        fail(
          "Only a person releases a draft pull request, in the Avoozl page or on GitHub.",
          403,
        );
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      return releaseDraft(this.store, this.github, input ?? {});
    },
  },
  // Merge on a released pull request whose checks passed on the exact head
  // (R119.3). Avoozl never merges one on its own; the next tick checks that
  // head again and merges it. A person's only.
  {
    name: "landing.merge",
    class: "protect",
    github: null,
    policy: person("Only a person merges a pull request Avoozl opened."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail(
          "Only a person merges a pull request Avoozl opened, in the Avoozl page or on GitHub.",
          403,
        );
      const { commit, ...at } = input ?? {};
      return approveMerge(this.store, at, {
        commit,
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    },
  },

  {
    name: "integration.land",
    class: "execute",
    github: "integration",
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
    github: "check-in",
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
    github: "integration",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      return integrateRun(store, input);
    },
  },
];
