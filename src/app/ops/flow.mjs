// Operations of one feature: name, class, MCP policy and handler.
import { taskRepository } from "../../work-model.mjs";
import { runLocalChecks } from "../flow-checks.mjs";
import {
  ciFlowView,
  ciRepositoryPickerIds,
  ciSettingsView,
} from "../flow-ci-view.mjs";
import { readEffectiveCIConfig } from "../flow-ci.mjs";
import {
  lineBanner,
  pullCord,
  pullFullStop,
  resumeStop,
  runAnyway,
} from "../flow-line.mjs";
import {
  applyToConfig,
  decideProposal,
  retroInstructions,
  retroPrompt,
  runRetroAgain,
  setRetroInstructions,
} from "../flow-retro.mjs";
import { usageView } from "../flow-usage.mjs";
import { flowView, readFlowConfig } from "../flow.mjs";
import { buildRows, buildView } from "../build-receipt-read.mjs";
import { peekInstance } from "../instance.mjs";
import { withWorkLock } from "../git.mjs";
import { readGitHubPolicyOrNull } from "../github-policy.mjs";
import { listHarnessDefinitions } from "../harness-definitions.mjs";
import { deliverRetroRule, deliverRetroSkill } from "../intake.mjs";
import { runOn } from "../needs-kirocrew.mjs";
import { createPlan } from "../plans.mjs";
import { withRetroChats } from "../retro-chat.mjs";
import { fail } from "../store.mjs";
import { WORKSPACE_LOCK } from "../tick.mjs";
import path from "node:path";
import { person, notOnMcp, routed } from "../operation-policy.mjs";

export const entries = [
  // Local checks first (R45): run the declared checks in a worktree and
  // record the pass the pre-push hook and the done report read.
  {
    name: "flow.checks.run",
    class: "execute",
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

  // Flow's Builds: every stored build observation of the base branch
  // (R101.4), from the store only.
  {
    name: "builds.view",
    class: "observe",
    policy: routed,
    handler() {
      const instance = peekInstance(this.store);
      return buildView(buildRows(this.store), {
        instanceName: (id) =>
          id && id === instance?.id ? instance.name : null,
      });
    },
  },
  {
    name: "flow.view",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const data = this.read(),
        config = readEffectiveCIConfig(store, {
          workspaceRoot: this.workspaceRoot,
          persist: false,
        }),
        policy = this.workspaceRoot
          ? readGitHubPolicyOrNull(this.workspaceRoot)
          : null,
        view = flowView(store, data, input),
        filtered = input.repository || input.epic || input.plan || input.phase;
      return {
        ...view,
        retros: withRetroChats(store, view.retros),
        repositories: [
          ...new Set([
            ...view.repositories,
            ...ciRepositoryPickerIds(store, policy, view.repositories),
          ]),
        ].sort(),
        ci: ciFlowView(store, config, policy, input),
        line: lineBanner(store, data),
        // Tokens and credits per task, plan, stage and model (§4.11).
        usage: usageView(store, data, {
          tasks: filtered ? view.tasks.map((t) => t.taskId) : null,
        }),
      };
    },
  },
  // Settings > Flow (§8.4) and the retros (§4.11).
  // Settings › Models: Avoozl's own chats' models, in .avoozl.json.
  {
    name: "models.settings.get",
    class: "observe",
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
  // Run on (NK8.2): a person moves a role that waits on Kiro Crew to one
  // of this machine's approved harnesses.
  {
    name: "needskirocrew.runon",
    class: "execute",
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
    policy: routed,
    handler({ context }) {
      const store = this.store;
      return {
        ...this.settingsFile().readFlowSettings(),
        ...ciSettingsView(
          readEffectiveCIConfig(store, {
            workspaceRoot: this.workspaceRoot,
            persist: false,
          }),
        ),
        // The built-in retro prompt, shown read-only above the owner's own.
        retroPrompt: retroPrompt(),
        instructions:
          context.caller || context.mcp ? null : retroInstructions(store),
      };
    },
  },

  {
    name: "flow.settings.update",
    class: "execute",
    policy: person("Only a person changes flow settings."),
    handler({ input }) {
      const written = this.settingsFile().updateFlowSettings(input);
      this.configuration?.reload();
      return written;
    },
  },

  {
    name: "flow.instructions.update",
    class: "execute",
    policy: person("Only a person changes flow settings."),
    handler({ input }) {
      const store = this.store;
      return setRetroInstructions(store, input.instructions);
    },
  },

  {
    name: "flow.retro.start",
    class: "execute",
    policy: person("Only a person starts a retro."),
    handler({}) {
      const store = this.store;

      const s = store.getMeta("flow.retro.state") || {
        seen: [],
        pending: [],
        reverts: [],
      };
      if (!s.pending.some((t) => t.kind === "manual"))
        store.setMeta("flow.retro.state", {
          ...s,
          pending: [
            ...s.pending,
            {
              kind: "manual",
              key: "manual:" + Date.now(),
              detail: "started by hand",
              at: new Date().toISOString(),
            },
          ],
        });
      return { queued: true };
    },
  },

  {
    name: "flow.retro.again",
    class: "execute",
    policy: person("Only a person runs a retro again."),
    handler({ input }) {
      const store = this.store;
      return runRetroAgain(store, input.id);
    },
  },

  {
    name: "flow.retro.decide",
    class: "execute",
    policy: person("Only a person decides retro proposals."),
    handler({ input, context }) {
      const store = this.store;

      const settings = this.settingsFile(),
        config = readFlowConfig(this.workspaceRoot);
      return decideProposal(store, input, {
        config,
        ciConfig: readEffectiveCIConfig(store, {
          workspaceRoot: this.workspaceRoot,
          fallback: config,
          persist: false,
        }),
        by: context.local ? "cli" : this.operator || "dashboard",
        // A repository skill change is one leaf through Deliver this
        // (R68.10, R50.15).
        skill: async (change) =>
          withWorkLock(store, WORKSPACE_LOCK, async () =>
            deliverRetroSkill(
              store,
              readGitHubPolicyOrNull(this.workspaceRoot),
              change,
            ),
          ),
        // A rule from repeated corrections is one leaf too (R78.3).
        rule: async (change) =>
          withWorkLock(store, WORKSPACE_LOCK, async () =>
            deliverRetroRule(
              store,
              readGitHubPolicyOrNull(this.workspaceRoot),
              change,
            ),
          ),
        apply: async (proposal, expectedHash) => {
          if (proposal.key.startsWith("delivery."))
            return settings.updateDeliveryKey({
              key: proposal.key,
              from: proposal.from,
              to: proposal.to,
              expectedHash,
            });
          const file = settings.readFlowSettings(),
            flow = applyToConfig(file, proposal);
          return settings.updateFlowSettings({
            flow,
            repository:
              proposal.file === "repository" ? proposal.repository : null,
            expectedHash,
          });
        },
        draft: async (proposal) =>
          createPlan(store, {
            // A CI change names its workflow file (§4.30): one new task.
            prompt: `Retro ${input.retroId} proposal for spec ${proposal.spec}: ${proposal.change}${proposal.workflow ? `\n\nOne new task in ${proposal.repository} that changes ${proposal.workflow}.` : ""}\n\nWhy: ${proposal.evidence}`,
            context: {
              retro: input.retroId,
              spec: proposal.spec,
              ...(proposal.workflow
                ? {
                    repository: proposal.repository,
                    workflow: proposal.workflow,
                  }
                : {}),
            },
          }).id,
      });
    },
  },
  // Run anyway (R44.10): a person only, confirmed and recorded.
  {
    name: "flow.runAnyway",
    class: "execute",
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
