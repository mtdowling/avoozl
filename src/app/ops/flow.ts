// Operations of one feature: name, class, MCP policy and handler.
import { taskRepository } from "../../work-model.ts";
import { runLocalChecks } from "../flow/flow-checks.ts";
import {
  lineBanner,
  pullCord,
  pullFullStop,
  resumeStop,
  runAnyway,
} from "../flow/flow-line.ts";
import { flowView } from "../flow/flow.ts";
import {
  approveHarnessByName,
  listHarnessDefinitions,
} from "../executors/harness-definitions.ts";
import { probeHarness } from "../executors/harness-probe.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { runOn } from "../tick/needs-kirocrew.ts";
import { fail } from "../store/store.ts";
import path from "node:path";
import { notOnMcp, routed, audited } from "../api/operation-policy.ts";
import { callerName, principalOf } from "../store/activity-log.ts";
import { requireInput } from "../api/operation-support.ts";
import type { OperationCall, Operations } from "../api/operations.ts";
import type { Repository } from "../git/git.ts";

export const entries = [
  // Local checks first (R45): run the declared checks in a worktree and
  // record the pass the pre-push hook and the done report read.
  {
    name: "flow.checks.run",
    class: "execute",
    github: "ci-receipts",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const task = this.read().tasks.find((t) => t.id === input.taskId);
      if (!task) fail("Task not found.", 404);
      const repository = store.get<Repository>(
        "repositories",
        taskRepository(task) || "",
      );
      if (!repository?.root)
        fail(`Task ${task.id} names no local checkout.`, 409);
      if (typeof input.cwd !== "string" || !path.isAbsolute(input.cwd))
        fail("Name the worktree folder to run the checks in.");
      return runLocalChecks({
        cwd: input.cwd,
        root: repository.root,
        repository,
        env: repository.checksEnv,
      });
    },
  },

  {
    name: "flow.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const data = this.read(),
        view = flowView(store, data, input);
      return { ...view, line: lineBanner(store, data) };
    },
  },
  // Settings › Models: Avoozl's own chats' models, in .avoozl.json.
  {
    name: "models.settings.get",
    class: "observe",
    github: "check-in",
    policy: notOnMcp(
      "Settings › Models reads the chat models; a chat has no use for them.",
    ),
    handler(this: Operations, {}: OperationCall) {
      return {
        ...this.settingsFile().readModelSettings(),
        // This machine's harness definitions a role may pick (R98.3).
        harnessDefinitions: listHarnessDefinitions(this.configDirectory),
      };
    },
  },
  // Approving a harness file lets a program run on this machine.
  {
    name: "harness.approve",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      return approveHarnessByName({
        configDirectory: this.configDirectory ?? "",
        name: String(input.name ?? ""),
      });
    },
  },
  // Check again: run a harness's sign-in probe once, a model call, and keep
  // the answer for its hash and machine.env.
  {
    name: "harness.probe",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const { stateDirectory, catalogPath } = machineAvoozlPaths();
      return probeHarness({
        configDirectory: this.machineFolder(),
        stateDirectory,
        catalogPath,
        name: String(input.name),
      });
    },
  },
  // Run on (NK8.2): move a role that waits on Kiro Crew to one
  // of this machine's approved harnesses.
  {
    name: "needskirocrew.runon",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      requireInput(input, ["role", "harness"]);
      return runOn(
        store,
        { role: String(input.role), harness: String(input.harness) },
        {
          settings: this.settingsFile(),
          approved: listHarnessDefinitions(this.configDirectory)
            .filter((d) => d.approved)
            .map((d) => d.name),
        },
      );
    },
  },

  {
    name: "models.settings.update",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const written = this.settingsFile().updateModelSettings(input);
      this.configuration?.reload();
      return written;
    },
  },

  {
    name: "flow.settings.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations) {
      return this.settingsFile().readFlowSettings();
    },
  },

  {
    name: "flow.settings.update",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      const written = this.settingsFile().updateFlowSettings(input);
      this.configuration?.reload();
      return written;
    },
  },

  // Run anyway (R44.10): confirmed in the page and recorded.
  {
    name: "flow.runAnyway",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

      return runAnyway(store, input, {
        operator: callerName(context, this.operator),
      });
    },
  },
  // Pull the Andon cord (R64): stop new dispatch in a scope, or with
  // `full` stop every agent.
  {
    name: "flow.stop",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      const by = {
        kind: principalOf(context) === "agent tool" ? "agent" : "person",
        name: callerName(context, this.operator),
      };
      if (input.full === true)
        return pullFullStop(store, input, {
          by,
          stopSession: this.sessionStopper,
        });
      return pullCord(store, input, { by });
    },
  },

  {
    name: "flow.resume",
    class: "execute",
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

      return resumeStop(store, input, {
        by: callerName(context, this.operator),
      });
    },
  },
];
