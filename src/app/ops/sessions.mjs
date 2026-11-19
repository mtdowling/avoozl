// Operations of one feature: name, class, MCP policy and handler.
import { resolveTaskId } from "../../task-identity.mjs";
import { validatePlanReview } from "../chat-models.mjs";
import { prepareWorktree, reportSession } from "../delivery.mjs";
import {
  completeKirocrewRequest,
  kirocrewConsumer,
  releaseKirocrewRequest,
  takeKirocrewRequest,
} from "../executors/kirocrew.mjs";
import { readFlowPolicy } from "../flow.mjs";
import { readGitHubPolicyOrNull } from "../github-policy.mjs";
import { machineRoots, postReply } from "../github-respond.mjs";
import { machineAvoozlPaths } from "../host-config.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import { markKirocrewSeen } from "../needs-kirocrew.mjs";
import { stampPrompts } from "../operation-support.mjs";
import { bindPlanAnswerSession } from "../plan-review-answers.mjs";
import { bindSpecReviewRound } from "../plan-reviews.mjs";
import { requestReviewChat, showReviewChat } from "../pr-review.mjs";
import { isSkillPath, skillHashes } from "../retro-memory.mjs";
import {
  bindSession,
  recordSessionStatus,
  rediscoverSessions,
  requestSession,
} from "../session-bindings.mjs";
import { openSession, viewOpened } from "../session-open.mjs";
import { sessionStartHold } from "../session-request-eligibility.mjs";
import { queueSessionSend } from "../session-send.mjs";
import { fail } from "../store.mjs";
import { readDeliveryPolicy } from "../tick.mjs";
import { workspaceRepositories } from "../workspace-repositories.mjs";
import path from "node:path";
import { person, notOnMcp, routed } from "../operation-policy.mjs";

export const entries = [
  // A run start is a dispatch request, and an extraction opens a record
  // for a planner session to fill.
  {
    name: "run.start",
    class: "execute",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      if (
        !input.taskId ||
        !input.repository ||
        !(input.agent || input.executor)
      )
        fail("run.start needs taskId, repository and agent.", 400);
      return requestSession(
        store,
        {
          taskId: resolveTaskId(this.read(), input.taskId),
          repository: input.repository,
          agent: input.agent,
          role: input.role,
          executor: input.executor,
          model: input.model,
          permissionClass: input.permissionClass,
        },
        workspaceRepositories(store),
      );
    },
  },

  {
    name: "session.bind",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return store.transaction(() => {
        const result = bindSession(store, input, {
          consumer: kirocrewConsumer(context),
        });
        if (result.changed && result.binding.role === "plan-review") {
          bindSpecReviewRound(store, {
            roundId: result.binding.taskId,
            slot: result.binding.slot,
          });
          result.binding = store.get("session_bindings", result.binding.slot);
        }
        if (result.changed && result.binding.role === "plan-answer") {
          bindPlanAnswerSession(store, {
            roundId: result.binding.taskId,
            slot: result.binding.slot,
          });
          result.binding = store.get("session_bindings", result.binding.slot);
        }
        return stampPrompts(store, result);
      });
    },
  },

  {
    name: "executor.kirocrew.take",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      markKirocrewSeen(store);
      return takeKirocrewRequest(store, input, context, (request, queued) =>
        sessionStartHold(store, request, queued, {
          planReviewMode:
            request.role === "plan-review"
              ? validatePlanReview(
                  this.workspaceRoot
                    ? loadLayeredConfig({ workspaceRoot: this.workspaceRoot })
                        .config.planReview
                    : undefined,
                ).mode
              : undefined,
        }),
      );
    },
  },

  {
    name: "executor.kirocrew.release",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return releaseKirocrewRequest(store, input, context);
    },
  },

  {
    name: "executor.kirocrew.complete",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return completeKirocrewRequest(store, input, context);
    },
  },

  {
    name: "session.rediscover",
    class: "execute",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return rediscoverSessions(store, input);
    },
  },

  {
    name: "session.request",
    class: "execute",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return requestSession(store, input, workspaceRepositories(store));
    },
  },

  {
    name: "session.status",
    class: "execute",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return recordSessionStatus(store, input);
    },
  },
  // Send message on a `process` session (R98.2): a person's message,
  // queued for the supervisor. An agent or MCP caller cannot steer a child.
  {
    name: "session.send",
    class: "execute",
    policy: person("Only a person sends a message to a process session."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person sends a message to a process session, in the Avoozl page.",
          403,
        );
      return queueSessionSend(store, input);
    },
  },
  // Open chat on the standalone page (SW7): a person starts a read-only
  // `process` session from a message; `session.view` reads it back.
  {
    name: "session.open",
    class: "execute",
    policy: person("Only a person opens a session, in the Avoozl page."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person opens a session, in the Avoozl page.", 403);
      return openSession(store, input, {
        config: loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config,
        configDirectory: this.configDirectory,
        workspaceRoot: this.workspaceRoot,
      });
    },
  },

  {
    name: "session.view",
    class: "observe",
    policy: notOnMcp(
      "The standalone page's process view of a session it opened; agents have the worker tools.",
    ),
    handler({ input }) {
      const store = this.store;
      return viewOpened(store, input, {
        ...machineAvoozlPaths(),
        configDirectory: this.configDirectory,
      });
    },
  },

  {
    name: "reply.post",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return postReply(store, this.github, input, context.caller, {
        roots: machineRoots(store, this.workspaceRoot),
      });
    },
  },
  {
    name: "session.report",
    class: "execute",
    policy: routed,
    async handler({ input, context }) {
      const store = this.store;

      // The skill files a session says it loaded (R68.12): absolute paths,
      // hashed here; skills read through tool calls win.
      const { skills, ...report } = input || {};
      if (
        skills !== undefined &&
        (!Array.isArray(skills) ||
          skills.length > 20 ||
          !skills.every(
            (f) =>
              typeof f === "string" &&
              f.length <= 1000 &&
              path.isAbsolute(f) &&
              isSkillPath(f),
          ))
      )
        fail(
          "skills lists up to 20 absolute paths of SKILL.md files you loaded.",
        );
      const result = await reportSession(store, report, context.caller, {
        local: context.local === true,
        flow: readFlowPolicy(this.workspaceRoot),
        policy: readDeliveryPolicy(this.workspaceRoot).delivery,
      });
      if (skills?.length && result.binding) {
        const hashes = skillHashes(store, skills, result.binding.taskId),
          current = store.get("session_bindings", result.binding.slot);
        if (current && Object.keys(hashes).length)
          store.put("session_bindings", {
            ...current,
            skills: { ...hashes, ...(current.skills || {}) },
          });
      }
      return result;
    },
  },

  {
    name: "worktree.prepare",
    class: "execute",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return prepareWorktree(store, input);
    },
  },
  // Code review (§8.5): queue one review chat for a pull request; the
  // tick cron opens it. Person-only.
  {
    name: "review.chat.show",
    class: "observe",
    policy: notOnMcp(
      "A person reads a stored pull request review with avoozl show.",
    ),
    handler({ input }) {
      const store = this.store;
      return showReviewChat(store, input.id);
    },
  },

  {
    name: "review.chat",
    class: "protect",
    policy: person("Only a person starts a code review chat."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person starts a code review chat, from the Avoozl page.",
          403,
        );
      return requestReviewChat(
        store,
        readGitHubPolicyOrNull(this.workspaceRoot),
        this.read().tasks,
        input,
        this.reviewOptions,
      );
    },
  },
];
