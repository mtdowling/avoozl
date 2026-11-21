// @ts-nocheck: typing debt
// Operations of one feature: name, class, MCP policy and handler.
import { taskRepository } from "../../work-model.mjs";
import { runLocalChecks } from "../flow/flow-checks.mjs";
import {
  lineBanner,
  pullCord,
  pullFullStop,
  resumeStop,
  runAnyway,
} from "../flow/flow-line.mjs";
import { flowView } from "../flow/flow.mjs";
import {
  approveHarnessByName,
  listHarnessDefinitions,
} from "../executors/harness-definitions.mjs";
import { probeHarness } from "../executors/harness-probe.ts";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { runOn } from "../tick/needs-kirocrew.mjs";
import { fail } from "../store/store.ts";
import path from "node:path";
import { person, notOnMcp, routed } from "../api/operation-policy.mjs";

export const entries = [
  // Local checks first (R45): run the declared checks in a worktree and
  // record the pass the pre-push hook and the done report read.
  {
    name: "flow.checks.run",
    class: "execute",
    github: "ci-receipts",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const task = this.read().tasks.find((t) => t.id === input.taskId);
      if (!task) fail("Task not found.", 404);
      const repository = store.get("repositories", taskRepository(task) || "");
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
    handler({ input }) {
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
    handler({}) {
      return {
        ...this.settingsFile().readModelSettings(),
        // This machine's harness definitions a role may pick (R98.3).
        harnessDefinitions: listHarnessDefinitions(this.configDirectory),
      };
    },
  },
  // The harness files on this machine and whether each is approved.
  {
    name: "harness.list",
    class: "observe",
    github: "check-in",
    policy: notOnMcp("Harness files are this machine's; a chat has no use."),
    handler({}) {
      return listHarnessDefinitions(this.configDirectory);
    },
  },
  // Approving a harness file lets a program run on this machine.
  {
    name: "harness.approve",
    class: "execute",
    github: "check-in",
    policy: person("Only a person approves a program to run on this machine."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail("Only a person approves a harness, in the app or CLI.", 403);
      return approveHarnessByName({
        configDirectory: this.configDirectory,
        name: input.name,
      });
    },
  },
  // Check again: run a harness's sign-in probe once, a model call, and keep
  // the answer for its hash and machine.env.
  {
    name: "harness.probe",
    class: "execute",
    github: "check-in",
    policy: person("Only a person runs a harness's sign-in check."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail(
          "Only a person checks a harness's sign-in, in the app or CLI.",
          403,
        );
      const { stateDirectory, catalogPath } = machineAvoozlPaths();
      return probeHarness({
        configDirectory: this.configDirectory,
        stateDirectory,
        catalogPath,
        name: input.name,
      });
    },
  },
  // Run on (NK8.2): a person moves a role that waits on Kiro Crew to one
  // of this machine's approved harnesses.
  {
    name: "needskirocrew.runon",
    class: "execute",
    github: "check-in",
    policy: person("Only a person chooses the harness a waiting role runs on."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person chooses where a role runs, in the Avoozl app.",
          403,
        );
      return runOn(store, input, {
        settings: this.settingsFile(),
        approved: listHarnessDefinitions(this.configDirectory)
          .filter((d) => d.approved)
          .map((d) => d.name),
      });
    },
  },

  {
    name: "models.settings.update",
    class: "execute",
    github: "check-in",
    policy: person("Only a person changes chat models."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail("Only a person changes chat models, in Settings.", 403);
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
    handler() {
      return this.settingsFile().readFlowSettings();
    },
  },

  {
    name: "flow.settings.update",
    class: "execute",
    github: "check-in",
    policy: person("Only a person changes flow settings."),
    handler({ input }) {
      const written = this.settingsFile().updateFlowSettings(input);
      this.configuration?.reload();
      return written;
    },
  },

  // Run anyway (R44.10): a person only, confirmed and recorded.
  {
    name: "flow.runAnyway",
    class: "execute",
    github: "check-in",
    policy: person("Only a person presses Run anyway."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person presses Run anyway, in the Avoozl page or the CLI.",
          403,
        );
      return runAnyway(store, input, {
        operator: context.local ? "cli" : this.operator || "dashboard",
      });
    },
  },
  // Pull the Andon cord (R64): a person or an agent session stops new
  // dispatch in a scope; only a person resumes.
  {
    name: "flow.stop",
    class: "execute",
    github: "check-in",
    policy: person(
      "Only a person stops all agents.",
      (input) => input?.full === true,
    ),
    handler({ input, context }) {
      const store = this.store;
      if (input.full === true) {
        if (context.caller || context.mcp)
          fail("Only a person stops all agents. Do it in the Avoozl app.", 403);
        return pullFullStop(store, input, {
          by: {
            kind: "person",
            name: context.local ? "cli" : this.operator || "dashboard",
          },
          stopSession: this.sessionStopper,
        });
      }
      return pullCord(store, input, {
        by:
          context.caller || context.mcp
            ? {
                kind: "agent",
                name: `session:${context.caller?.sessionKey || context.caller || "mcp"}`,
              }
            : {
                kind: "person",
                name: context.local ? "cli" : this.operator || "dashboard",
              },
      });
    },
  },

  {
    name: "flow.resume",
    class: "execute",
    github: "check-in",
    policy: person("Only a person resumes a pulled stop."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person resumes a pulled stop, in the Avoozl page or the CLI.",
          403,
        );
      return resumeStop(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    },
  },
];
