// Operations of one feature: name, class, MCP policy and handler.
import { applyActivity } from "../../activity.mjs";
import { captureTask } from "../../capture.mjs";
import { dispatchMcp } from "../../mcp.mjs";
import {
  blocks,
  digest,
  matchSection,
  planOwned,
  queryTasks,
  reviewSettled,
  statusComplete,
} from "../../model.mjs";
import {
  requireDistinctTask,
  resolveTaskId,
  taskSourceRefs,
} from "../../task-identity.mjs";
import { COMPLETIONS } from "../../work-model.mjs";
import { isPlanInventory, taskSignals } from "../../workbench-model.mjs";
import {
  DEFAULT_RETENTION_DAYS,
  listActivity,
} from "../store/activity-log.mjs";
import {
  matchingAgentInstructions,
  toggleAgentInstruction,
} from "../agents/agent-instructions.mjs";
import { describeWorkspace } from "../api/client.mjs";
import { settleConflicts } from "../delivery/conflict-actions.mjs";
import { startNow } from "../delivery/delivery.mjs";
import { diskNeedsYou } from "../workspace/disk-space.mjs";
import { triageBlockedNeedsYou } from "../intake/triage.mjs";
import { triageBlock } from "../plugins/plugins.mjs";
import { resolveDecision } from "../api/direct-links.mjs";
import { machineLinks } from "../tick/crews.mjs";
import { taskEvidence } from "../tasks/evidence.mjs";
import { fixToSpec, startFix } from "../intake/fix.mjs";
import { lineBanner } from "../flow/flow-line.mjs";
import { flowView } from "../flow/flow.mjs";
import { forwardAuditRows } from "../mirror/forward-audit.mjs";
import { withWorkLock } from "../git/git.mjs";
import { paceNeedsYou } from "../github/github-pacer.mjs";
import { readGitHubPolicyOrNull } from "../github/github-policy.mjs";
import { rateNeedsYou } from "../github/github-rate.mjs";
import { credentialsNeedsYou } from "../github/github-credentials.mjs";
import { leftBranchesNeedsYou } from "./specs.mjs";
import { missingLabelsNeedsYou } from "../github/github-setup.mjs";
import { listHarnessDefinitions } from "../executors/harness-definitions.mjs";
import { highlightLanguages } from "../settings/highlight-languages.mjs";
import { instanceView } from "../workspace/instance.mjs";
import { landingNeedsYou } from "../epics/integration-head.mjs";
import { syncNeedsYou } from "../epics/integration-sync.mjs";
import { decideInvestigation } from "../delivery/investigate.mjs";
import { landingWaitNeedsYou } from "../landing/landing-queue-view.mjs";
import { completeManual, reopenManual } from "../tasks/manual-tasks.mjs";
import { publicBranchRows } from "../mirror/mirror-forward-batch.mjs";
import { mirrorForwardRows } from "../mirror/mirror-forward.mjs";
import { mirrorNeedsYou } from "../mirror/mirror-sync.mjs";
import { needsKirocrewItems } from "../tick/needs-kirocrew.mjs";
import { addItemContext } from "../api/needs-you-context.mjs";
import {
  claimedOrNone,
  kiroCrewSessions,
  refuseCycle,
  refuseGateBypass,
  refuseSpecText,
  reviewRoles,
  validationAt,
} from "../api/operation-support.mjs";
import {
  activityView,
  chatContext,
  conflictsView,
  graphView,
  helpMessage,
  taskDetailView,
  withGraphState,
} from "../api/page-views.mjs";
import { panelView } from "../api/panel-view.mjs";
import { archiveTask } from "../specs/plan-retire.mjs";
import { planReviewNeedsYou } from "../reviews/plan-review-step.mjs";
import { conversationSettings } from "../settings/repository-settings.mjs";
import { specPullNeedsYou } from "../specs/spec-pull-requests.mjs";
import { fail } from "../store/store.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { supersedeTask } from "../tasks/supersede.mjs";
import {
  duplicateAudit,
  duplicateCandidates,
  mergeTasks,
} from "../tasks/task-dedup.mjs";
import { taskDiff, taskFiles } from "../tasks/task-files.mjs";
import {
  addNote,
  editNote,
  noteAuthor,
  notesView,
  removeNote,
} from "../tasks/task-notes.mjs";
import {
  requestTaskSummary,
  submitTaskSummary,
  summaryFacts,
  taskSummaryView,
} from "../tasks/task-summary.mjs";
import { WORKSPACE_LOCK, readDeliveryPolicy } from "../tick/tick.mjs";
import { workspaceRepositories } from "../workspace/workspace-repositories.mjs";
import { randomUUID } from "node:crypto";
import { person, notOnMcp, routed } from "../api/operation-policy.mjs";
import {
  boxedHarnesses,
  preflightFailures,
  preflightNeedsYou,
  strangerNeedsYou,
} from "../intake/stranger-holds.mjs";

// Manual tasks and task links (§4.16, R61.12–R61.22).
function taskManualCompleteHandler({ name, input, context }) {
  const store = this.store;

  if (context.caller || context.mcp)
    fail(
      "Only a person marks a manual task done or reopens it, in the Avoozl page or the CLI.",
      403,
    );
  const taskId = resolveTaskId(this.read(), input.taskId),
    by = context.local ? "cli" : this.operator || "person";
  return name === "task.manual.complete"
    ? completeManual(store, { ...input, taskId }, { by })
    : reopenManual(store, { taskId }, { by });
}

function taskNotesListHandler({ name, input, context }) {
  const store = this.store;

  if (typeof input.taskId !== "string" || !input.taskId)
    fail("Name the task: taskId.");
  const data = this.read(),
    task = data.tasks.find((t) => t.id === resolveTaskId(data, input.taskId));
  if (!task) fail(`No task ${input.taskId}.`, 404);
  if (name === "task.notes.list") return notesView(store, task.id);
  if (name === "task.notes.add")
    return addNote(store, task, input, {
      author: noteAuthor(store, task.id, context, this.operator),
    });
  if (context.caller || context.mcp)
    fail(
      "Only a person edits, removes or shows a link, in the Avoozl page or the CLI.",
      403,
    );
  if (name === "task.notes.edit") return editNote(store, task, input);
  if (name === "task.notes.remove") return removeNote(store, task, input);
}
// A fix (triage-agent TA9): one change with no spec files. Starting it
// is the approval, so only a person starts one or makes it a spec.
function fixStartHandler({ name, input, context }) {
  const store = this.store;

  if (context.caller || context.mcp)
    fail("Only a person starts a fix or makes it a spec.", 403);
  return withWorkLock(store, WORKSPACE_LOCK, async () =>
    name === "fix.start"
      ? startFix(store, input, {
          workspaceRoot: this.workspaceRoot,
          actor: this.operator,
          github: this.github,
        })
      : fixToSpec(store, this.workspaceRoot, input),
  );
}

function taskArchiveHandler({ name, input, expectedRevision }) {
  const store = this.store;
  return store.mutate(
    (name === "task.archive" ? "Archive " : "Restore ") + input.id,
    (data) => {
      const task = data.tasks.find((item) => item.id === input.id);
      if (!task) fail("Task not found.", 404);
      if (name === "task.archive") {
        // Why it was archived, such as "plan removed" (Requirement 59.4:
        // a plan is done when each task is done or archived with a reason).
        if (input.reason !== undefined) {
          if (
            typeof input.reason !== "string" ||
            !input.reason.trim() ||
            input.reason.length > 200 ||
            /[\r\n]/.test(input.reason)
          )
            fail("reason is one line of 1–200 characters.");
          task.archivedReason = input.reason.trim();
        }
        return archiveTask(task);
      }
      delete task.archivedReason;
      task.archivedAt = null;
      task.updatedAt = new Date().toISOString();
      return task;
    },
    expectedRevision,
  );
}

export const entries = [
  {
    name: "client.describe",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({}) {
      const store = this.store;
      return describeWorkspace(store);
    },
  },

  {
    name: "task.duplicates",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      return input.title
        ? {
            items: duplicateCandidates(this.read(), input, {
              similar: true,
              limit: input.limit,
            }),
          }
        : duplicateAudit(this.read(), input);
    },
  },

  {
    name: "task.merge",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return mergeTasks(store, input, expectedRevision);
    },
  },

  {
    name: "task.supersede",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Supersede " + input.id,
        (data) => supersedeTask(data, input, { operator: this.operator }),
        expectedRevision,
      );
    },
  },

  {
    name: "task.merge.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const receipt = store.get("evidence", input.id);
      if (receipt?.kind !== "task-merge") fail("Merge receipt not found.", 404);
      return receipt;
    },
  },
  // The task's evidence bundle (§4.22): read only.
  {
    name: "task.evidence",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return taskEvidence(store, {
        ...input,
        taskId: resolveTaskId(this.read(), String(input.taskId ?? "")),
      });
    },
  },
  // Investigate first (§4.21): Go ahead, Investigate again or Stop.
  {
    name: "investigation.decide",
    class: "protect",
    github: "check-in",
    policy: person("Only a person decides on a task's findings."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person decides on a task's findings, in the Avoozl page or the CLI.",
          403,
        );
      return decideInvestigation(
        store,
        this.read(),
        {
          ...input,
          taskId:
            typeof input.taskId === "string"
              ? resolveTaskId(this.read(), input.taskId)
              : input.taskId,
        },
        { by: context.local ? "cli" : this.operator || "dashboard" },
      );
    },
  },

  {
    name: "highlight.languages",
    class: "observe",
    github: "check-in",
    policy: notOnMcp("App page rendering only."),
    handler({}) {
      return highlightLanguages(this.workspaceRoot);
    },
  },

  {
    name: "activity.recent",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return activityView(store, this.read(), input);
    },
  },
  // The activity log (§4.19).
  {
    name: "activity.list",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const page = listActivity(store, input);
      let tasks = new Set();
      try {
        tasks = new Set(this.read().tasks.map((task) => task.id));
      } catch {}
      return {
        ...page,
        items: page.items.map((row) =>
          row.targetId && tasks.has(row.targetId)
            ? { ...row, task: true }
            : row,
        ),
        retentionDays: this.workspaceRoot
          ? this.settingsFile().readActivitySettings().retentionDays
          : DEFAULT_RETENTION_DAYS,
      };
    },
  },

  {
    name: "activity.settings.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({}) {
      return this.settingsFile().readActivitySettings();
    },
  },

  {
    name: "activity.settings.update",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes how long activity is kept."),
    handler({ input, context }) {
      if (context.caller || context.mcp)
        fail("Only a person changes how long activity is kept.", 403);
      const written = this.settingsFile().updateActivitySettings(input);
      this.configuration?.reload();
      return written;
    },
  },

  {
    name: "task.start",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return startNow(store, input, {
        policy: readDeliveryPolicy(this.workspaceRoot),
      });
    },
  },

  {
    name: "chat.context",
    class: "observe",
    github: "check-in",
    policy: notOnMcp("App page rendering only."),
    async handler({ input, context }) {
      const store = this.store;

      // Ask for help (§8.9): the page's own words and settings.
      if (input.purpose === "help") return { message: helpMessage(input) };
      // A plan's seed carries its row and its spec documents.
      let planRow = null,
        documents = null;
      if (typeof input.plan === "string" && input.plan) {
        const table = await this.perform("plan.table", {}, undefined, context);
        planRow = table.items.find((row) => row.key === input.plan) || null;
        if (!planRow) fail("Plan not found.", 404);
        if (planRow.spec)
          try {
            documents = this.readSpecDocuments({ name: planRow.spec });
          } catch {
            documents = null;
          }
        else if (planRow.planId) {
          const stored = store.get("plans", planRow.planId);
          documents = stored?.text
            ? { documents: { "plan.md": stored.text } }
            : null;
        }
      }
      return chatContext(store, this.read(), input, { planRow, documents });
    },
  },

  {
    name: "graph.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      // Draft spec folders, display only; none when specs cannot be read.
      let folders = [];
      try {
        folders = this.specHomes().homes.map(({ spec }) => ({
          name: spec.name,
          spec,
        }));
      } catch {
        // No spec roots in this mode.
      }
      return graphView(store, this.read(), input, folders);
    },
  },

  {
    name: "conflicts.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const data = this.read(),
        view = conflictsView(store, data),
        policy = readGitHubPolicyOrNull(this.workspaceRoot);
      // A workspace a conductor drove waits for a person (WP1.3).
      if (readDeliveryPolicy(this.workspaceRoot).delivery?.crewModeHeld)
        view.items.push({
          kind: "needs-human",
          reason: "crew-mode",
          id: "crew-mode",
          taskId: null,
          title: "The tick does not start this workspace yet",
          detail:
            'This workspace\'s .avoozl.json still says "runner": "crew-mode", from before the tick started every task. Avoozl starts nothing here until you let the tick run it.',
          hash: this.settingsFile().readFile().hash,
        });
      view.items.push(...planReviewNeedsYou(store));
      view.items.push(...specPullNeedsYou(store));
      view.items.push(...landingNeedsYou(store));
      view.items.push(...landingWaitNeedsYou(store, this.read()));
      view.items.push(...syncNeedsYou(store));
      view.items.push(...diskNeedsYou(store));
      view.items.push(
        ...triageBlockedNeedsYou(policy, triageBlock(this.pluginOptions)),
      );
      // Stranger input that waits, and failed box preflights (vm-harness D5, D7).
      view.items.push(
        ...strangerNeedsYou(store, boxedHarnesses(this.configDirectory)),
      );
      view.items.push(
        ...preflightNeedsYou(
          preflightFailures(store, machineAvoozlPaths().stateDirectory),
        ),
      );
      view.items.push(...rateNeedsYou(store));
      view.items.push(...credentialsNeedsYou(store));
      view.items.push(...leftBranchesNeedsYou(store));
      view.items.push(...missingLabelsNeedsYou(store));
      view.items.push(...paceNeedsYou(store));
      view.items.push(...mirrorNeedsYou(store));
      view.items.push(...mirrorForwardRows(store, policy));
      view.items.push(...forwardAuditRows(store));
      view.items.push(...publicBranchRows(store));
      // A role waiting on Kiro Crew on a machine with none, with this
      // machine's approved harnesses for Run on (NK8.2).
      view.items.push(
        ...needsKirocrewItems(
          store,
          listHarnessDefinitions(this.configDirectory)
            .filter((d) => d.approved)
            .map((d) => d.name),
        ),
      );
      addItemContext(store, data, view.items);
      // A notice's link (direct-links D3): which item it names, marked so the
      // page opens it even when filters would hide it. Reads only.
      if (input?.decision !== undefined) {
        const { item, ...target } = resolveDecision(
          store.list("app_notifications"),
          view.items,
          String(input.decision),
        );
        if (item) item.linked = true;
        view.target = target;
      }
      return view;
    },
  },
  // The chat side panel in one read: every part it shows, each null when its
  // own read fails (panel-view.mjs).
  {
    name: "panel.view",
    class: "observe",
    github: "check-in",
    policy: notOnMcp(
      "The chat side panel's one read; its parts are each on MCP already.",
    ),
    async handler({ context }) {
      const store = this.store;

      const sub = (op, args = {}) => this.perform(op, args, undefined, context),
        data = this.read();
      return panelView({
        conflicts: async () => (await sub("conflicts.view")).items,
        remote: async () => (await sub("remote.view")).workers,
        queue: () => sub("radar.releasequeue"),
        flow: () => ({
          tasks: flowView(store, data, { window: "10" }).tasks,
          line: lineBanner(store, data),
        }),
        specs: async () => (await sub("plan.specs")).items,
        instance: () => instanceView(store),
      });
    },
  },
  {
    name: "task.manual.complete",
    class: "protect",
    github: "check-in",
    policy: person("Only a person marks a manual task done."),
    handler: taskManualCompleteHandler,
  },
  {
    name: "task.manual.reopen",
    class: "protect",
    github: "check-in",
    policy: person("Only a person reopens a manual task."),
    handler: taskManualCompleteHandler,
  },
  {
    name: "task.notes.list",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler: taskNotesListHandler,
  },
  {
    name: "task.notes.add",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler: taskNotesListHandler,
  },
  {
    name: "task.notes.edit",
    class: "protect",
    github: "check-in",
    policy: person("Only a person edits a link."),
    handler: taskNotesListHandler,
  },
  {
    name: "task.notes.remove",
    class: "protect",
    github: "check-in",
    policy: person("Only a person removes a link."),
    handler: taskNotesListHandler,
  },
  {
    name: "fix.start",
    class: "protect",
    github: "check-in",
    policy: person("Only a person starts a fix; starting it approves it."),
    handler: fixStartHandler,
  },
  {
    name: "fix.spec",
    class: "protect",
    github: "check-in",
    policy: person("Only a person makes a fix a spec."),
    handler: fixStartHandler,
  },

  {
    name: "task.detail",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const data = this.read(),
        detail = this.detail(input.id),
        plan = detail.planId ? store.get("plans", detail.planId) : null;
      const view = taskDetailView(store, data, detail, {
        plan: plan && !plan.deletedAt ? plan : null,
        approved: Boolean(plan && this.planApproved(plan)),
        destinations: {
          standalone: this.kirocrewAbsent,
          links: machineLinks(),
        },
      });
      return {
        ...view,
        summary: taskSummaryView(store, view.task.id, summaryFacts(view)),
      };
    },
  },
  // The page asks for the AI summary of the inputs it shows; the same
  // inputs never write a second one (task-summary.mjs).
  {
    name: "task.summary.request",
    class: "execute",
    github: "check-in",
    policy: person("Only a person asks for a task summary."),
    handler({ input }) {
      const store = this.store;

      const data = this.read(),
        detail = this.detail(input.id),
        plan = detail.planId ? store.get("plans", detail.planId) : null,
        view = taskDetailView(store, data, detail, {
          plan: plan && !plan.deletedAt ? plan : null,
          approved: Boolean(plan && this.planApproved(plan)),
        });
      return requestTaskSummary(store, view.task.id, summaryFacts(view), {
        retry: input.retry === true,
      });
    },
  },

  {
    name: "tasksummary.submit",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return submitTaskSummary(store, input, context.caller);
    },
  },

  {
    name: "task.files",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return taskFiles(store, this.read(), input);
    },
  },

  {
    name: "task.diff",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return taskDiff(store, this.read(), input);
    },
  },

  {
    name: "task.change.preview",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      return this.previewTaskChange(input);
    },
  },

  {
    name: "conflicts.settle",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return settleConflicts(store, input, expectedRevision);
    },
  },

  {
    name: "state",
    class: "observe",
    github: "check-in",
    policy: notOnMcp(
      "Whole-database read; plans_view and plans_task read what a session needs.",
    ),
    handler({}) {
      return this.read();
    },
  },
  // The one conversation setting still in effect: auto-archive on acceptance.
  {
    name: "conversations.settings.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({}) {
      const store = this.store;
      return conversationSettings(store);
    },
  },

  {
    name: "conversations.settings.update",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes workspace settings."),
    handler({ input }) {
      const store = this.store;
      return this.configuration
        ? this.configuration.updateConversationSettings(input).settings
        : store.transaction(() => {
            if (typeof input.autoArchiveCompleted !== "boolean")
              fail("Choose whether completed conversations auto-archive.");
            const settings = {
              autoArchiveCompleted: input.autoArchiveCompleted,
            };
            store.setMeta("conversationSettings", settings);
            return settings;
          });
    },
  },

  {
    name: "query",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      // Each row says the state the page shows for it, beside its status.
      const data = this.read();
      return queryTasks(data, {
        scope: "all",
        ...input,
        claimed: claimedOrNone(store),
      }).map(withGraphState(store, data));
    },
  },

  {
    name: "task.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return withGraphState(store, this.read())(this.detail(input.id));
    },
  },

  {
    name: "report.save",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Save report " + (input.title || ""),
        (data) => {
          if (
            input.id !== undefined &&
            (typeof input.id !== "string" ||
              !/^report-[a-z0-9-]{4,80}$/.test(input.id))
          )
            fail("Invalid report id.");
          if (
            typeof input.title !== "string" ||
            !input.title.trim() ||
            input.title.length > 160
          )
            fail("Report title must contain 1–160 characters.");
          if (
            input.view !== undefined &&
            !["overview", "tasks", "epics", "graph", "documents"].includes(
              input.view,
            )
          )
            fail("Unknown report view.");
          if (
            input.filters !== undefined &&
            (!input.filters ||
              typeof input.filters !== "object" ||
              Array.isArray(input.filters))
          )
            fail("Report filters must be an object.");
          const filters = {};
          for (const key of [
            "query",
            "scopes",
            "work",
            "statuses",
            "epics",
            "tracks",
            "tags",
            "activity",
            "historical",
          ]) {
            if (!Object.hasOwn(input.filters || {}, key)) continue;
            const value = input.filters[key];
            if (
              key === "historical"
                ? typeof value !== "boolean"
                : key === "query"
                  ? typeof value !== "string" || value.length > 2000
                  : !Array.isArray(value) ||
                    value.length > 500 ||
                    value.some(
                      (item) => typeof item !== "string" || item.length > 2000,
                    )
            )
              fail("Invalid report filter " + key + ".");
            filters[key] = structuredClone(value);
          }
          data.savedSearches ??= [];
          const now = new Date().toISOString(),
            existing = input.id
              ? data.savedSearches.find((item) => item.id === input.id)
              : null,
            record = {
              id: existing?.id || "report-" + randomUUID().slice(0, 12),
              title: input.title.trim(),
              view: input.view || existing?.view || "tasks",
              filters,
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            };
          if (input.id && !existing) fail("Saved report not found.", 404);
          if (existing)
            data.savedSearches[data.savedSearches.indexOf(existing)] = record;
          else data.savedSearches.push(record);
          return record;
        },
        expectedRevision,
      );
    },
  },

  {
    name: "report.delete",
    class: "draft",
    github: "check-in",
    policy: person("Only a person deletes a report."),
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Delete report " + input.id,
        (data) => {
          if (typeof input.id !== "string") fail("Invalid report id.");
          const existing = data.savedSearches?.find(
            (item) => item.id === input.id,
          );
          if (!existing) fail("Saved report not found.", 404);
          data.savedSearches = data.savedSearches.filter(
            (item) => item.id !== input.id,
          );
          return existing;
        },
        expectedRevision,
      );
    },
  },

  {
    name: "agent.instructions.source",
    class: "observe",
    github: "check-in",
    policy: notOnMcp("App page rendering only."),
    handler({ input }) {
      const store = this.store;

      const source = store.read().agentInstructionSource,
        snapshot = store.getMeta("agentInstructionSourceSnapshot");
      if (!source)
        fail("No .avoozl.json instructions have been synchronized.", 404);
      if (
        !snapshot ||
        snapshot.path !== source.path ||
        snapshot.hash !== source.hash
      )
        fail(
          "The synchronized .avoozl.json snapshot is unavailable. Sync it again.",
          409,
        );
      if (input.repositoryId !== undefined) {
        const selected = snapshot.sources?.find(
          (entry) => entry.repositoryId === input.repositoryId,
        );
        if (!selected)
          fail(
            "No .avoozl.json instructions were synchronized for that repository.",
            404,
          );
        return selected;
      }
      return snapshot;
    },
  },

  {
    name: "agent.instructions.toggle",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes workspace settings."),
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        (input.enabled ? "Enable " : "Disable ") +
          "agent instruction " +
          input.id,
        (data) =>
          toggleAgentInstruction(data, input.id, Boolean(input.enabled)),
        expectedRevision,
      );
    },
  },
  {
    name: "task.archive",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler: taskArchiveHandler,
  },
  {
    name: "task.unarchive",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler: taskArchiveHandler,
  },
  // Saved views and presentations are display configuration. Deleting one
  // removes that configuration only: tasks, plans and evidence are untouched.
  {
    name: "visualization.delete",
    class: "protect",
    github: "check-in",
    policy: person("Only a person deletes a visualization."),
    handler({ input, expectedRevision }) {
      const store = this.store;

      if (typeof input.id !== "string" || !input.id)
        fail("Name the saved view to delete.");
      const tours = input.kind === "tour",
        list = tours ? "tours" : "views",
        label = tours ? "presentation" : "view";
      let removed = null;
      store.mutate(
        "Delete saved " + label,
        (data) => {
          data.presentation ??= {};
          data.presentation[list] ??= [];
          removed =
            data.presentation[list].find((v) => v.id === input.id) || null;
          if (!removed) fail("Saved " + label + " not found.", 404);
          data.presentation[list] = data.presentation[list].filter(
            (v) => v.id !== input.id,
          );
          if (data.presentation.activeVisualization?.id === input.id)
            delete data.presentation.activeVisualization;
          if (data.presentation.activeTour?.id === input.id)
            delete data.presentation.activeTour;
          // A presentation step cannot point at a view that no longer exists.
          if (!tours) {
            const kept = [];
            for (const tour of data.presentation.tours || []) {
              tour.steps = (tour.steps || []).filter(
                (step) => step.viewId !== input.id,
              );
              if (tour.steps.length) kept.push(tour);
              else if (data.presentation.activeTour?.id === tour.id)
                delete data.presentation.activeTour;
            }
            if (data.presentation.tours) data.presentation.tours = kept;
          }
        },
        expectedRevision,
      );
      return { id: input.id, kind: label, title: removed?.title || input.id };
    },
  },

  {
    name: "trash",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({}) {
      const store = this.store;
      return {
        plans: store
          .list("plans")
          .filter((p) => p.deletedAt)
          .slice(-100)
          .map((p) => ({ id: p.id, title: p.title })),
      };
    },
  },

  {
    name: "task.sessions",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const task = this.read().tasks.find((t) => t.id === input.id);
      if (!task) fail("Task not found.", 404);
      return kiroCrewSessions(store, task.id).map((session) => ({
        id: session.slot,
        taskId: task.id,
        title: `${session.role} attempt ${session.attempt}`,
        state: session.status,
        provider: "kiro-crew",
        url: session.url,
      }));
    },
  },

  {
    name: "document.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const doc = this.read().documents[input.id];
      if (!doc) fail("Document not found.", 404);
      return doc;
    },
  },

  {
    name: "task.capture",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Capture prompt",
        (data) => captureTask(data, input),
        expectedRevision,
      );
    },
  },

  {
    name: "intent.submit",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      return this.submitIntent(input, expectedRevision);
    },
  },

  {
    name: "intent.get",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const receipt = store.get("receipts", "intent:" + input.submissionId);
      if (!receipt) fail("Submission not found.", 404);
      return this.intentResult(receipt);
    },
  },

  {
    name: "task.update",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;

      const reviewers = reviewRoles(readDeliveryPolicy(this.workspaceRoot));
      return store.mutate(
        "Update " + input.id,
        (data) => {
          let task = data.tasks.find((t) => t.id === input.id);
          if (!task) {
            if (!input.create || !/^[a-z][a-z0-9-]{2,80}$/.test(input.id || ""))
              fail("Task not found.", 404);
            requireDistinctTask(data, { ...input, id: input.id });
            task = {
              id: input.id,
              scope: "catalog",
              kind: "task",
              status: "planned",
              track: "catalog",
              tags: [],
            };
            data.tasks.push(task);
          }
          refuseGateBypass(data, task, input, reviewers);
          refuseSpecText(store, task, input);
          if (
            input.title &&
            (input.title !== task.title || input.distinctReason)
          ) {
            const candidates = requireDistinctTask(data, {
              ...input,
              id: task.id,
            });
            if (input.distinctReason?.trim())
              task.distinctFrom = {
                ...task.distinctFrom,
                ...Object.fromEntries(
                  candidates.map((t) => [t.id, input.distinctReason.trim()]),
                ),
              };
          }
          for (const key of [
            "title",
            "summary",
            "status",
            "phase",
            "track",
            "tags",
            "notes",
            "nextAction",
            "acceptance",
            "owner",
            "overview",
            "rank",
            "needsReview",
            "evidence",
            "resources",
            "kind",
            "route",
            "completion",
            "repository",
            "parent",
          ])
            if (Object.hasOwn(input, key)) task[key] = input[key];
          // A task's epic is its plan's (Requirement 59.2): only a stale
          // value from before that rule may be cleared, with epic: null.
          if (Object.hasOwn(input, "epic")) {
            if (input.epic !== null)
              fail(
                "A task names no epic: its plan does. Send epic: null to clear an old value.",
              );
            delete task.epic;
          }
          if (input.kind === "epic")
            fail('kind "epic" is not a task kind: write "package".');
          if (task.phase === null) delete task.phase;
          else if (
            task.phase !== undefined &&
            (!task.phase ||
              typeof task.phase !== "object" ||
              typeof task.phase.id !== "string" ||
              !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(task.phase.id) ||
              typeof task.phase.title !== "string" ||
              !task.phase.title.trim() ||
              task.phase.title.length > 240 ||
              Object.keys(task.phase).some(
                (key) => !["id", "title"].includes(key),
              ))
          )
            fail("phase is {id, title}, or null for No phase.");
          // Authority changes only through projection or taking a task back.
          if (Object.hasOwn(input, "authority"))
            fail("Authority changes only through projection.", 409);
          // A title is checked when it is set. A row imported before the
          // limit keeps its long title through edits of other fields.
          if (
            (Object.hasOwn(input, "title") || input.create) &&
            (typeof task.title !== "string" ||
              !task.title.trim() ||
              task.title.length > 240)
          )
            fail("Title must contain 1–240 characters.");
          for (const key of [
            "summary",
            "notes",
            "nextAction",
            "owner",
            "repository",
            "parent",
          ])
            if (task[key] !== undefined && typeof task[key] !== "string")
              fail(key + " must be text.");
          for (const key of ["tags", "acceptance", "evidence", "resources"])
            if (
              task[key] !== undefined &&
              (!Array.isArray(task[key]) ||
                task[key].some((v) => typeof v !== "string"))
            )
              fail(key + " must be a list of strings.");
          if (!data.tracks.some((t) => t.id === task.track))
            fail("Unknown track.");
          if (input.requires !== undefined) {
            // Each entry is a task ID, or {task, condition} naming the
            // completion level the dependency must reach (design §4.3).
            if (
              !Array.isArray(input.requires) ||
              input.requires.some(
                (x) =>
                  typeof x !== "string" &&
                  (typeof x?.task !== "string" ||
                    !COMPLETIONS.includes(x.condition)),
              )
            )
              fail(
                "Requires must contain task IDs or {task, condition} with a known completion.",
              );
            data.edges = data.edges.filter(
              (e) => e.to !== task.id || e.kind !== "requires",
            );
            const conditions = new Map();
            for (const entry of input.requires) {
              const from = resolveTaskId(
                data,
                typeof entry === "string" ? entry : entry.task,
              );
              if (!conditions.has(from) || typeof entry !== "string")
                conditions.set(
                  from,
                  typeof entry === "string" ? undefined : entry.condition,
                );
            }
            for (const [from, condition] of conditions)
              data.edges.push({
                id: `${from}:requires:${task.id}`,
                from,
                to: task.id,
                kind: "requires",
                ...(condition ? { condition } : {}),
                reason: "Authored task dependency.",
              });
          }
          if (input.sequence !== undefined) {
            // Order-only prerequisites: task IDs this task runs after.
            if (
              !Array.isArray(input.sequence) ||
              input.sequence.some((x) => typeof x !== "string")
            )
              fail("Sequence must contain task IDs.");
            data.edges = data.edges.filter(
              (e) => e.to !== task.id || e.kind !== "sequence",
            );
            for (const from of new Set(
              input.sequence.map((x) => resolveTaskId(data, x)),
            ))
              data.edges.push({
                id: `${from}:sequence:${task.id}`,
                from,
                to: task.id,
                kind: "sequence",
                reason: "Authored task order.",
              });
          }
          if (input.requires !== undefined || input.sequence !== undefined)
            refuseCycle(data, task.id);
          if (Object.hasOwn(input, "integration")) {
            const receipt = input.integration;
            if (
              !receipt ||
              typeof receipt !== "object" ||
              Array.isArray(receipt) ||
              typeof receipt.commit !== "string" ||
              typeof receipt.at !== "string" ||
              !/^[a-f0-9]{7,64}$/i.test(receipt.commit || "") ||
              !Number.isFinite(Date.parse(receipt.at)) ||
              Date.parse(receipt.at) > Date.now() + 60000 ||
              typeof receipt.branch !== "string" ||
              !receipt.branch.trim() ||
              receipt.branch.length > 240 ||
              typeof receipt.repo !== "string" ||
              !receipt.repo.trim() ||
              receipt.repo.length > 1000 ||
              !Array.isArray(receipt.evidence) ||
              !receipt.evidence.length ||
              receipt.evidence.some(
                (e) => typeof e !== "string" || !e.trim() || e.length > 2000,
              )
            )
              fail(
                "Integration requires a commit, landing time, branch, repository and evidence.",
              );
            task.integration = {
              commit: receipt.commit,
              at: new Date(receipt.at).toISOString(),
              branch: receipt.branch,
              repo: receipt.repo,
              evidence: [...new Set(receipt.evidence)],
              recordedAt: new Date().toISOString(),
            };
            task.evidence = [
              ...new Set([...(task.evidence || []), ...receipt.evidence]),
            ];
          }
          task.statusAuthority = "database";
          task.updatedAt = new Date().toISOString();
          task.needsReview = input.needsReview ?? false;
          return task;
        },
        expectedRevision,
      );
    },
  },

  {
    name: "activity",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Report activity",
        (data) => applyActivity(data, input),
        expectedRevision,
      );
    },
  },

  {
    name: "document.update",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Edit " + input.id,
        (data) => {
          const doc = data.documents[input.id];
          if (!doc) fail("Document not found.", 404);
          if (doc.hash !== input.expectedHash) fail("Document changed.", 409);
          if (typeof input.text !== "string" || input.text.length > 1000000)
            fail("Document text is required.");
          const oldHash = doc.hash,
            before = blocks(doc.text || ""),
            after = blocks(input.text);
          doc.text = input.text;
          doc.hash = digest(input.text);
          doc.modifiedAt = new Date().toISOString();
          // Only tasks whose own section changed need review.
          for (const task of data.tasks.filter(
            (t) =>
              !reviewSettled(data, t) &&
              taskSourceRefs(t).some(
                (ref) =>
                  ref.document === doc.id &&
                  !planOwned(t, ref) &&
                  matchSection(ref, before, after).changed,
              ),
          ))
            task.needsReview = true;
          store.db
            .prepare(
              "INSERT INTO outbox(id,path,text,expected_hash) VALUES (?,?,?,?)",
            )
            .run(randomUUID(), doc.path, doc.text, oldHash);
          return doc;
        },
        expectedRevision,
      );
    },
  },

  {
    name: "queue.design.triage",
    class: "execute",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const plan = store.get("plans", input.planId);
      if (!plan) fail("Plan not found.", 404);
      if (!["extract", "context"].includes(input.action))
        fail("Choose extract or context.");
      if (input.action === "context") {
        plan.triage = {
          state: "context",
          at: new Date().toISOString(),
          by: this.operator || null,
        };
        store.put("plans", plan);
        store.event(null, "queue.design.triaged", {
          planId: plan.id,
          action: "context",
        });
        return { plan, extraction: null };
      }
      const extraction = this.startExtractionPipeline({
        ...input,
        planId: plan.id,
        revisionHash: plan.hash,
      });
      plan.triage = {
        state: "extracting",
        extractionId: extraction.id,
        at: new Date().toISOString(),
        by: this.operator || null,
      };
      store.put("plans", plan);
      store.event(null, "queue.design.triaged", {
        planId: plan.id,
        action: "extract",
        extractionId: extraction.id,
      });
      return { plan, extraction };
    },
  },

  {
    name: "task.accept",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;

      // Acceptance evidence that already exists should not have to be retyped:
      // a validated run recorded what ran, against which commit, and with
      // what exit code. A caller with something further to say still can.
      const autoArchive = conversationSettings(store).autoArchiveCompleted,
        task = store.mutate(
          "Accept " + input.id,
          (data) => {
            const task = data.tasks.find((t) => t.id === input.id);
            if (!task) fail("Task not found.", 404);
            if (!task.integration && !input.componentOnly)
              fail("Record integration before whole-head acceptance.");
            const recorded = input.evidence?.trim()
              ? null
              : validationAt(store, data, task);
            task.acceptanceEvidence = {
              at: new Date().toISOString(),
              evidence: input.evidence?.trim() || recorded?.summary || "",
              ...(recorded?.evidenceIds.length
                ? { derivedFrom: recorded.evidenceIds }
                : {}),
              ...(this.operator ? { acceptedBy: this.operator } : {}),
              componentOnly: Boolean(input.componentOnly),
            };
            task.status = input.componentOnly ? "implemented" : "accepted";
            if (!input.componentOnly && autoArchive)
              task.archivedAt = task.archivedAt || task.acceptanceEvidence.at;
            return task;
          },
          expectedRevision,
        );
      return task;
    },
  },

  {
    name: "handoff",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const task = this.detail(input.id);
      return {
        task,
        design: task.documents,
        prerequisites: task.relationships
          .filter((e) => e.to === task.id)
          .map((e) => this.read().tasks.find((t) => t.id === e.from)),
        evidence: task.evidenceRecords,
        nextAction: task.nextAction,
        agentInstructions: matchingAgentInstructions(
          this.read(),
          "task.implement",
          task,
        ),
        policy:
          "Task evidence, integration and acceptance are separate. Preserve existing worktrees and do not open GitHub issues. Work discovered while implementing has three dispositions: in scope for this task, do it and record the evidence here, which is the normal case; related to this plan but out of scope, record one cited proposed fact with plan.propose for extraction review; needing a different design, write a new plan draft and tell the user. Filing anything is the exception; do not capture discoveries as new request tasks.",
      };
    },
  },

  {
    name: "queue",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const data = this.read(),
        ready = queryTasks(data, {
          scope: "all",
          ...input,
          repositories: workspaceRepositories(store).map((entry) => entry.id),
          claimed: claimedOrNone(store),
          q: [input.q, "ready:true"].filter(Boolean).join(" "),
        });
      const ranked = ready
        .map((t) => ({
          ...t,
          unblocks: data.edges.filter(
            (e) =>
              ["requires", "sequence"].includes(e.kind) &&
              e.from === t.id &&
              !statusComplete(
                data,
                data.tasks.find((x) => x.id === e.to)?.status,
              ),
          ).length,
        }))
        .sort((a, b) => b.unblocks - a.unblocks);
      const visible = data.tasks.filter((t) => !isPlanInventory(data, t)),
        blocked = visible
          .map((t) => ({ task: t, signals: taskSignals(data, t) }))
          .filter(
            ({ task, signals }) =>
              !signals.complete &&
              (task.status === "blocked" || signals.blockers.length),
          ),
        taskMap = new Map(data.tasks.map((t) => [t.id, t]));
      return {
        summary: {
          ready: ranked.length,
          blocked: blocked.length,
        },
        blocked: blocked.slice(0, 40).map(({ task, signals }) => ({
          id: task.id,
          title: task.title,
          nextAction: task.nextAction,
          summary: task.summary,
          blockers: signals.blockers.map((id) => ({
            id,
            title: taskMap.get(id)?.title || id,
            status: taskMap.get(id)?.status,
          })),
        })),
        ready: ranked.slice(
          0,
          Math.max(1, Math.min(100, Number(input.limit) || 40)),
        ),
        readyTotal: ranked.length,
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready"),
      };
    },
  },

  {
    name: "legacy.mcp",
    class: "protect",
    github: "check-in",
    policy: notOnMcp(
      "The MCP server's own protocol methods (initialize, ping, view resources) in src/mcp.mjs.",
    ),
    handler({ input }) {
      return dispatchMcp(input.message, { versionHeader: input.versionHeader });
    },
  },
];
