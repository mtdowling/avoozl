// Operations of one feature: name, class, MCP policy and handler.
import { frontMatterCategory } from "../../front-matter.ts";
import { applyPlanMetadata } from "../../plan-model.ts";
import { approvedSpecDependency } from "../../spec-dependencies.ts";
import { resolveTaskId } from "../../task-identity.ts";
import {
  enforce as enforceContent,
  enforceSpec,
} from "../content/content-rules.ts";
import { epicsView } from "../epics/epics-view.ts";
import { queuePublish } from "../specs/spec-publication.ts";
import { crossPlanEpics, epicOfPlan } from "../epics/epics.ts";
import { epicView, ownership, plansTableView } from "../api/page-views.ts";
import { approvePlan } from "../specs/spec-approval.ts";
import { specLinks } from "../tasks/scm-links.ts";
import {
  checkedItems,
  proposeSpecWork,
  saveSpecPlan,
  specCategory,
  specEpic,
} from "../specs/spec-plans.ts";
import { fail } from "../store/store.ts";
import { planPage } from "../api/views.ts";
import { person, routed } from "../api/operation-policy.ts";
import { taskFile } from "../specs/spec-tasks.ts";
import type {
  Approval,
  OperationCall,
  Operations,
  Plan,
} from "../api/operations.ts";
import type { Task } from "../../types.ts";

// Epics span plans (Requirement 59): every approved epic and every epic
// folder on disk not yet approved, each with computed progress.
function epicListHandler(this: Operations, { name, input }: OperationCall) {
  const store = this.store;

  const data = this.read(),
    folders: ReturnType<Operations["specList"]>["items"] = (() => {
      try {
        return this.specList().items.filter((item) => item.kind === "epic");
      } catch {
        return [];
      }
    })(),
    approved = crossPlanEpics(data),
    ids = [
      ...approved.map((epic) => epic.id),
      ...folders
        .map((item) => item.name)
        .filter((id) => !approved.some((epic) => epic.id === id)),
    ],
    view = (id: string) => {
      const folder = folders.find((item) => item.name === id);
      return epicView(store, data, {
        id,
        spec: folder ? this.readSpec(id) : null,
        members: folder?.members
          ? [...new Set(folder.members.map((member) => member.plan))]
          : null,
      });
    };
  if (name === "epic.get") {
    if (typeof input.id !== "string" || !input.id)
      fail(
        "Name the epic: {id}, its spec folder name. plans_plan epics lists them.",
      );
    if (!ids.includes(input.id)) fail(`No epic ${input.id}.`, 404);
    return view(input.id);
  }
  return {
    revision: data.revision,
    items: ids.map((id) => {
      const { requirements, design, ...summary } = view(id);
      return summary;
    }),
  };
}

export const entries = [
  // The Epics screen (read only).
  {
    name: "epics.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      // shortcut: the Release queue holds no rows since labels stopped
      // releasing work (TA11.1); drop the parameter with the queue card.
      return epicsView(this.store, { repositories: [] });
    },
  },

  {
    name: "plan.spec.read",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      return this.readSpecDocuments(input);
    },
  },
  {
    name: "plan.list",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return planPage(store, input);
    },
  },

  {
    name: "plan.specs",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      return this.specList();
    },
  },
  {
    name: "epic.list",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler: epicListHandler,
  },
  {
    name: "epic.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler: epicListHandler,
  },

  {
    name: "plan.table",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;

      const specs = (() => {
        // A workspace with no spec folders for its mode still has stored
        // plans; the table shows those, and the folder problem with them.
        try {
          const list = this.specList();
          return { ...list, problem: list.homeErrors?.join(" ") || null };
        } catch (error) {
          return {
            root: null,
            items: [],
            problem: (error as Error).message,
          };
        }
      })();
      const stored = store
        .list<Plan>("plans")
        .filter(
          (plan) => !plan.deletedAt && (plan.kind || "plan") !== "conversation",
        );
      return {
        root: specs.root,
        problem: specs.problem,
        // The folders' own summaries, for the detail a row opens.
        specs: specs.items,
        ...plansTableView(store, this.read(), {
          specs: specs.items,
          stored,
          categoryOf: (plan: Plan) =>
            plan.spec
              ? specCategory(plan.files)
              : frontMatterCategory(plan.text),
        }),
      };
    },
  },

  {
    name: "plan.classify",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, expectedRevision }: OperationCall) {
      const store = this.store;
      const id = String(input.id);
      return store.mutate(
        "Classify " + id,
        (data) => {
          applyPlanMetadata(data, id, input);
          return data.documents[id];
        },
        expectedRevision,
      );
    },
  },
  {
    name: "plan.create",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

      if (input.spec === undefined)
        fail("Name the spec folder to store: {spec}.", 400);
      return this.createSpecDraft(input, context);
    },
  },

  {
    name: "plan.save",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      const agent = Boolean(context.caller || context.mcp);

      const plan = store.get<Plan>("plans", input.id);
      if (plan?.spec && input.text === undefined) {
        const spec = this.readSpec(plan.spec);
        if (spec.exists && agent) enforceSpec(store, spec, { mode: "refuse" });
        return saveSpecPlan(store, { ...input, id: plan.id }, spec);
      }
      if (!plan) fail("Plan not found.", 404);
      fail("A spec plan is read from its folder; save it without text.", 409);
    },
  },

  {
    name: "plan.propose",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;
      const agent = Boolean(context.caller || context.mcp);

      const plan = store.get<Plan>("plans", input.id);
      if (plan?.spec && !input.fact) {
        if (agent && input.proposal && typeof input.proposal === "object")
          enforceContent(
            store,
            {
              boundary: "plan",
              target: `${plan.spec}/${taskFile(plan.files ?? {})}`,
              text: JSON.stringify(input.proposal, null, 1),
            },
            { mode: "refuse" },
          );
        return proposeSpecWork(store, { ...input, id: plan.id }, (spec) =>
          this.readSpec(spec),
        );
      }
      if (!plan) fail("Plan not found.", 404);
      fail("Propose work as a task on a spec plan: {id, proposal}.", 409);
    },
  },

  {
    name: "plan.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const plan = store.get<Plan>("plans", input.id);
      if (!plan) return fail("Plan not found.", 404);
      const data = this.read(),
        epic = epicOfPlan(data, plan.id),
        phases = new Map<string, unknown>();
      for (const task of data.tasks)
        if (task.planId === plan.id && task.phase && !phases.has(task.phase.id))
          phases.set(task.phase.id, task.phase);
      return {
        ...plan,
        // The epic both sides agree on, and the one this revision's
        // front-matter names (Requirement 59.2); its phases, in task order.
        epic: epic?.id ?? null,
        epicTitle: epic?.title ?? null,
        epicNamed: plan.spec ? specEpic(plan.files) : null,
        phases: [...phases.values()],
        quality: plan.spec ? this.lintSpecPlan(plan) : null,
        ...(plan.spec ? { disk: this.specOnDisk(plan) } : {}),
        // The spec's Links box (R92.4): stored records only, no GitHub
        // call. A local read, so a private spec issue shows only here.
        ...(plan.spec ? { links: specLinks(store, plan.id) } : {}),
        approvals: store
          .list<Approval>("approvals")
          .filter((a) => a.planId === plan.id),
      };
    },
  },

  {
    name: "plan.lint",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const plan = store.get<Plan>("plans", input.id);
      if (!plan) return fail("Plan not found.", 404);
      if (!plan.spec) fail("Only a spec plan is linted.", 409);
      return this.lintSpecPlan(plan);
    },
  },

  {
    name: "plan.preview",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const plan = store.get<Plan>("plans", input.id);
      if (!plan) return fail("Plan not found.", 404);
      if (!plan.spec) fail("Only a spec plan is approved.", 409);
      if (input.text !== undefined)
        fail("A spec plan is previewed from its stored revision.");
      const specQuality = this.lintSpecPlan(plan);
      // Read-only: show exactly what approving this revision would create,
      // without creating anything. Approval remains a separate operation.
      const data = this.read(),
        proposals = specQuality.proposals,
        mapping = Object.fromEntries(
          proposals.map((p) => [
            p.id,
            resolveTaskId(
              data,
              String(p.taskId || plan.mapping?.[p.id] || p.id),
            ),
          ]),
        );
      const existing = new Set(data.tasks.map((t: Task) => t.id));
      const rows = new Map(data.tasks.map((t: Task) => [t.id, t]));
      const quality = specQuality;
      return {
        planId: plan.id,
        reviewedHash: plan.hash,
        currentHash: plan.hash,
        state: plan.state,
        quality,
        // Send this back as expectedRevision when approving.
        expectedRevision: data.revision,
        approved: store
          .list<Approval>("approvals")
          .some((a) => a.planId === plan.id && a.hash === plan.hash),
        tasks: proposals.map((p) => ({
          localId: p.id,
          taskId: mapping[p.id],
          title: p.title,
          acceptance: p.acceptance,
          existing: existing.has(mapping[p.id]),
          // The stored row's owner, else the one approval would give it.
          ...(rows.has(mapping[p.id])
            ? ownership(rows.get(mapping[p.id]))
            : {
                authority: "local",
                issue: null,
              }),
          lineStart: p.lineStart,
          lineEnd: p.lineEnd,
        })),
        dependencies: proposals.flatMap((p) =>
          (["requires", "sequence", "supports"] as const).flatMap((kind) =>
            (Array.isArray(p[kind]) ? (p[kind] as string[]) : []).map(
              (ref) => ({
                kind,
                from: mapping[ref] || ref,
                to: mapping[p.id],
                known:
                  existing.has(mapping[ref] || ref) || Boolean(mapping[ref]),
                ...(specQuality.declaredDependencies.find(
                  (entry) => entry.taskId === ref,
                )
                  ? {
                      declaredBy: specQuality.declaredDependencies.find(
                        (entry) => entry.taskId === ref,
                      )?.spec,
                      pending: (() => {
                        const declaration =
                            specQuality.declaredDependencies.find(
                              (entry) => entry.taskId === ref,
                            ),
                          owner = declaration
                            ? store.get<Plan>("plans", declaration.planId)
                            : null,
                          receipt =
                            owner?.approvalId &&
                            store.get<Approval>("approvals", owner.approvalId);
                        if (!declaration) return true;
                        return !approvedSpecDependency(
                          declaration,
                          rows.get(mapping[ref] || ref),
                          owner ?? undefined,
                          receipt || undefined,
                        );
                      })(),
                    }
                  : {}),
              }),
            ),
          ),
        ),
        retiring: Object.keys(plan.mapping || {}).filter((id) => !mapping[id]),
        // Checked [x] items approval creates as accepted (plans.mjs).
        baseline: (() => {
          const checked = checkedItems(String(plan.spec), plan.text),
            taskIds = proposals
              .filter((p) => checked.has(p.id) && !existing.has(mapping[p.id]))
              .map((p) => mapping[p.id]);
          return {
            count: taskIds.length,
            taskIds,
            text: taskIds.length
              ? `${taskIds.length} ${taskIds.length === 1 ? "task starts" : "tasks start"} as done from tasks.md marks`
              : "",
          };
        })(),
      };
    },
  },

  {
    name: "plan.approve",
    class: "protect",
    github: "spec-branch",
    policy: person("Only a person approves a plan."),
    async handler(
      this: Operations,
      { input, expectedRevision }: OperationCall,
    ) {
      const store = this.store;
      const { plan, specQuality, proposals } = this.approvalChecks(input);
      const args: Parameters<typeof approvePlan>[1] = {
        ...input,
        id: plan.id,
        githubPolicy: this.githubPolicy(),
        proposals,
        baseline: true,
        declaredDependencies: specQuality.declaredDependencies,
        approvedBy:
          (typeof input.approvedBy === "string" && input.approvedBy.trim()) ||
          this.operator,
        operator: input.operator || this.operator,
        expectedRevision: input.expectedRevision ?? expectedRevision,
      };
      // The approval is a commit by the person on main (§4.42); the receipt
      // below is its cache. It is made only once the receipt would be
      // written, tried first on a scratch copy.
      const commit = (
        await this.approveInGit([plan], () => {
          const scratch = store.scratch();
          try {
            approvePlan(scratch, args);
          } finally {
            scratch.close();
          }
        })
      )?.get(plan.id);
      if (commit) {
        args.approvedBy = commit.email;
        args.evidence = input.evidence || commit.evidence;
        args.approvalCommit = commit.commit;
      }
      const approved = approvePlan(store, args);
      // The next tick publishes its spec issue (workflow v1 rule 8.1).
      if (commit) queuePublish(store, plan.id, commit.commit);
      return approved;
    },
  },
];
