// Operations of one feature: name, class, MCP policy and handler.
import { resolveTaskId } from "../../task-identity.ts";
import { prepareWorktree, reportSession } from "../delivery/delivery.ts";
import {
  completeKirocrewRequest,
  kirocrewConsumer,
  releaseKirocrewRequest,
  takeKirocrewRequest,
} from "../executors/kirocrew.ts";
import { readFlowPolicy } from "../flow/flow.ts";
import { machineRoots, postReply } from "../github/github-respond.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { loadLayeredConfig } from "../settings/layered-config.ts";
import { markKirocrewSeen } from "../tick/needs-kirocrew.ts";
import { stampPrompts } from "../api/operation-support.ts";
import {
  bindSession,
  recordSessionStatus,
  rediscoverSessions,
  requestSession,
} from "../sessions/session-bindings.ts";
import { openSession, viewOpened } from "../sessions/session-open.ts";
import { sessionStartHold } from "../sessions/session-request-eligibility.ts";
import { queueSessionSend } from "../sessions/session-send.ts";
import { fail } from "../store/store.ts";
import { readDeliveryPolicy } from "../tick/tick.ts";
import { workspaceRepositories } from "../workspace/workspace-repositories.ts";
import path from "node:path";
import { person, notOnMcp, routed } from "../api/operation-policy.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

export const entries = [
  // A run start is a dispatch request, and an extraction opens a record
  // for a planner session to fill.
  {
    name: "run.start",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
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
          taskId: resolveTaskId(this.read(), String(input.taskId)),
          repository: input.repository,
          agent: input.agent,
          role: typeof input.role === "string" ? input.role : undefined,
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
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      return store.transaction(() => {
        const result = bindSession(store, input, {
          consumer: kirocrewConsumer(context),
        });
        return stampPrompts(store, result);
      });
    },
  },

  {
    name: "executor.kirocrew.take",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      markKirocrewSeen(store);
      return takeKirocrewRequest(
        store,
        input,
        context,
        (
          request: Parameters<typeof sessionStartHold>[1],
          queued?: Parameters<typeof sessionStartHold>[2],
        ) => sessionStartHold(store, request, queued),
      );
    },
  },

  {
    name: "executor.kirocrew.release",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      return releaseKirocrewRequest(store, input, context);
    },
  },

  {
    name: "executor.kirocrew.complete",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      return completeKirocrewRequest(store, input, context);
    },
  },

  {
    name: "session.rediscover",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return rediscoverSessions(store, input);
    },
  },

  {
    name: "session.request",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return requestSession(store, input, workspaceRepositories(store));
    },
  },

  {
    name: "session.status",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return recordSessionStatus(store, input);
    },
  },
  // Send message on a `process` session (R98.2): a person's message,
  // queued for the supervisor. An agent or MCP caller cannot steer a child.
  {
    name: "session.send",
    class: "execute",
    github: "check-in",
    policy: person("Only a person sends a message to a process session."),
    handler(this: Operations, { input, context }: OperationCall) {
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
    github: "check-in",
    policy: person("Only a person opens a session, in the Avoozl page."),
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person opens a session, in the Avoozl page.", 403);
      const workspaceRoot =
        this.workspaceRoot ?? fail("Opening a session needs a workspace.", 409);
      return openSession(store, input, {
        config: loadLayeredConfig({ workspaceRoot }).config,
        configDirectory: this.machineFolder(),
        workspaceRoot,
      });
    },
  },

  {
    name: "session.view",
    class: "observe",
    github: "check-in",
    policy: notOnMcp(
      "The standalone page's process view of a session it opened; agents have the worker tools.",
    ),
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return viewOpened(store, input, {
        ...machineAvoozlPaths(),
        configDirectory: this.machineFolder(),
      });
    },
  },

  {
    name: "reply.post",
    class: "execute",
    github: "respond",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      return postReply(store, this.github, input, context.caller, {
        roots: machineRoots(store, this.workspaceRoot),
      });
    },
  },
  {
    name: "session.report",
    class: "execute",
    github: "check-in",
    policy: routed,
    async handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

      // `skills` was the files a session loaded, for retro proposals.
      const { skills: _skills, ...report } = input || {};
      const result = await reportSession(store, report, context.caller, {
        local: context.local === true,
        flow: readFlowPolicy(this.workspaceRoot),
        policy: readDeliveryPolicy(this.workspaceRoot).delivery,
      });
      return result;
    },
  },

  {
    name: "worktree.prepare",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return prepareWorktree(store, input);
    },
  },
];
