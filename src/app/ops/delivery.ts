// Operations of one feature: name, class, MCP policy and handler.
import { retryDelivery } from "../delivery/delivery.ts";
import { type IntegrateInput, integrateRun } from "../git/git.ts";
import { readGitHubPolicyOrNull } from "../github/github-policy.ts";
import {
  checkIntegrationBranch,
  requireIntegrationBranch,
} from "../epics/integration-branch.ts";
import { integrationView, landBranch } from "../epics/integration-head.ts";
import { landingView } from "../landing/landing-view.ts";
import { approveMerge, releaseDraft } from "../landing/landing-pulls.ts";
import { loadLayeredConfig } from "../settings/layered-config.ts";
import { manualTake } from "../workers/manual-take.ts";
import { deliverNotifications } from "../tick/notifications.ts";
import { requireInput, stampPrompts } from "../api/operation-support.ts";
import { deliveryView } from "../api/page-views.ts";
import { claimNext, nextView } from "../workers/runner.ts";
import { claimsView, deleteClaim } from "../workers/claims.ts";
import { lanesView, resumeLane } from "../sessions/lane-sessions.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { processSessionDetails } from "../executors/process-view.ts";
import { landTask } from "../landing/land-task.ts";
import { fail } from "../store/store.ts";
import { laneWorkspace, readDeliveryPolicy } from "../tick/tick.ts";
import { allowProtectedPaths } from "../delivery/verify.ts";
import { machineLinks } from "../tick/crews.ts";
import {
  loopFile,
  readMachineLoop,
  validateLoop,
  writeMachineLoop,
} from "../tick/loop.ts";
import {
  notOnMcp,
  routed,
  audited,
  destructive,
} from "../api/operation-policy.ts";
import type { OperationCall, Operations } from "../api/operations.ts";
import { engineStatus, writeEngineSetting } from "../tick/engine.ts";
import { validateEngine } from "../settings/engine-config.ts";

// This machine's loop for Settings › Autopilot; a file that cannot be read
// says why instead.
function machineLoopSettings(operations: Operations) {
  try {
    return { loop: readMachineLoop(loopFile(operations.configDirectory)) };
  } catch (error) {
    return { loop: null, loopError: (error as Error).message };
  }
}

// The build this machine's tick runs, and engine.update (engine.ts).
const machineEngine = (operations: Operations) => ({
  engine: engineStatus(
    machineAvoozlPaths().stateDirectory,
    loopFile(operations.configDirectory),
  ),
});

// What turning Autopilot on writes when this machine has no loop yet, as
// Settings › Autopilot does (DeliverySettings.tsx DEFAULT_LOOP).
const DEFAULT_LOOP = { run: ["specs"] };

// Autopilot runs only with both switches (R54.8): the workspace's
// `delivery` block and this machine's `loop`.
function autopilotStatus(operations: Operations) {
  const settings = operations.settingsFile().readDeliverySettings(),
    machine = machineLoopSettings(operations);
  return {
    on: settings.on && Boolean(machine.loop),
    delivery: settings.on,
    ...machine,
    hash: settings.hash,
  };
}

export const entries = [
  // With `claim`, it creates the best ready task's claim branch on origin
  //, so it may write.
  {
    name: "runner.next",
    class: "execute",
    github: "worker-grants",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
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
  // Take a task by hand on this machine (worker-paths WP2.7), from
  // `avoozl take` or plans_take_task.
  {
    name: "runner.take",
    class: "execute",
    github: "check-in",
    policy: audited,
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      requireInput(input, ["taskId"]);
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
  // Land one reported task now by its repository's mode: the
  // caller that claimed it only, from `avoozl land` or plans_land.
  {
    name: "runner.land",
    class: "execute",
    github: "land",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
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
  // Delete branch on a stale claim, from Needs you, `avoozl claim delete`
  // or plans_control, as the high-risk claim-delete job that only the
  // confirm's grant lets through.
  {
    name: "claim.delete",
    class: "protect",
    github: "claim-delete",
    policy: destructive,
    handler(this: Operations, { input }: OperationCall) {
      return deleteClaim(this.store, this.github, input);
    },
  },
  // Let the tick run it (WP1.3).
  {
    name: "delivery.runner.release",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
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
    handler(this: Operations, {}: OperationCall) {
      return {
        ...this.settingsFile().readDeliverySettings(),
        ...machineLoopSettings(this),
        ...machineEngine(this),
      };
    },
  },

  {
    name: "autopilot.status",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations) {
      return autopilotStatus(this);
    },
  },
  // On writes the delivery block (empty when missing) and this machine's
  // loop (kept when set); off removes the loop and keeps the block, as the
  // page's switch does.
  {
    name: "autopilot.set",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      if (typeof input?.on !== "boolean") fail("Say on: true or on: false.");
      const file = this.settingsFile(),
        before = autopilotStatus(this);
      if (input.on) {
        if (!before.delivery)
          file.updateDeliverySettings({
            delivery: {},
            turnOn: true,
            expectedHash: before.hash,
          });
        if (!before.loop)
          writeMachineLoop(loopFile(this.configDirectory), DEFAULT_LOOP);
      } else if (before.loop)
        writeMachineLoop(loopFile(this.configDirectory), null);
      this.configuration?.reload();
      return autopilotStatus(this);
    },
  },
  {
    name: "delivery.settings.update",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      // `loop`: this machine's loop (an object), or null to remove it.
      // `engine`: this machine's {update}. Checked before anything is
      // written.
      const { loop, engine, ...workspace } = input ?? {};
      if (loop !== undefined && loop !== null)
        validateLoop(loop, "This machine's config");
      if (engine !== undefined) validateEngine(engine, "This machine's config");
      const written = ["delivery", "turnOn", "landingPr"].some(
        (key) => workspace[key] !== undefined,
      )
        ? this.settingsFile().updateDeliverySettings(workspace)
        : this.settingsFile().readDeliverySettings();
      if (loop !== undefined)
        writeMachineLoop(loopFile(this.configDirectory), loop);
      if (engine !== undefined)
        writeEngineSetting(loopFile(this.configDirectory), engine);
      this.configuration?.reload();
      return {
        ...written,
        ...machineLoopSettings(this),
        ...machineEngine(this),
      };
    },
  },

  {
    name: "verify.allow",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
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
    handler(this: Operations, { input, context }: OperationCall) {
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
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;
      return deliverNotifications(store, this.notifier);
    },
  },

  {
    name: "delivery.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
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
  // The claim branches in flight, from the cache.
  {
    name: "claims.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      return { claims: claimsView(this.store) };
    },
  },
  // This machine's lanes: each lane's role, harness,
  // state, task and how to open its session.
  {
    name: "lanes.view",
    class: "observe",
    github: "check-in",
    policy: notOnMcp("A person reads the lanes with avoozl lanes or the page."),
    handler(this: Operations, {}: OperationCall) {
      const policy = readDeliveryPolicy(this.workspaceRoot).delivery;
      if (!policy) return { lanes: [] };
      const paths = machineAvoozlPaths();
      return {
        lanes: lanesView(
          this.store,
          policy,
          // A lane header names the workspace as text, null included.
          String(
            laneWorkspace(
              this.workspaceRoot,
              this.store.getMeta("workspaceId"),
            ),
          ),
          {
            attach: (slot) => {
              const attach = processSessionDetails([slot], paths).get(
                slot,
              )?.attach;
              return typeof attach === "string" ? attach : null;
            },
          },
        ),
      };
    },
  },
  // Resume on a lane a person closed.
  {
    name: "lane.resume",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      return resumeLane(this.store, input ?? {});
    },
  },
  // The Release queue: empty since labels stopped releasing work (TA11.1).
  // shortcut: a Radar leftover; delete it with the Release queue card.
  {
    name: "radar.releasequeue",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations) {
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
    handler(this: Operations, {}: OperationCall) {
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
    handler(this: Operations, {}: OperationCall) {
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
    policy: audited,
    async handler(this: Operations, { input, context }: OperationCall) {
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      return releaseDraft(this.store, this.github, input);
    },
  },
  // Merge on a released pull request whose checks passed on the exact head
  // (R119.3). Avoozl never merges one on its own; the next tick checks that
  // head again and merges it. A person's only.
  {
    name: "landing.merge",
    class: "protect",
    github: null,
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const { commit, ...at } = input;
      return approveMerge(this.store, at, {
        commit: String(commit),
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    },
  },

  {
    name: "integration.land",
    class: "execute",
    github: "integration",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

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
    async handler(this: Operations, { input }: OperationCall) {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        repository = String(input.repository ?? ""),
        branch = String(input.branch ?? ""),
        entry = policy?.repositories?.[repository];
      if (!input.repository || !input.branch)
        fail("Name the repository and the integration branch.", 400);
      if (!entry)
        fail(`${input.repository} is not a registered repository.`, 404);
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      return requireIntegrationBranch(
        await checkIntegrationBranch(this.github, repository, branch, entry),
      );
    },
  },

  {
    name: "integration.merge",
    class: "protect",
    github: "integration",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      // The request's fields; integrateRun refuses an unknown run.
      return integrateRun(store, input as IntegrateInput);
    },
  },
];
