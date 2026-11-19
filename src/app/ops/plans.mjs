// Operations of one feature: name, class, MCP policy and handler.
import { frontMatterCategory } from "../../front-matter.mjs";
import { digest } from "../../model.mjs";
import { applyPlanMetadata } from "../../plan-model.mjs";
import { approvedSpecDependency } from "../../spec-dependencies.mjs";
import { resolveTaskId } from "../../task-identity.mjs";
import { approvalBatches, approveMany } from "../approval-batches.mjs";
import {
  approvalDelegation,
  delegationEvidence,
  grantDelegate,
  listDelegates,
  revokeDelegate,
} from "../approval-delegation.mjs";
import { chatModel, validatePlanReview } from "../chat-models.mjs";
import { enforce as enforceContent, enforceSpec } from "../content-rules.mjs";
import {
  disposeFact,
  getExtraction,
  proposalsFromFacts,
  submitExtraction,
} from "../design-extraction.mjs";
import { epicsView } from "../epics-view.mjs";
import { crossPlanEpics, epicOfPlan } from "../epics.mjs";
import { planningIdentity } from "../github-marker.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import { requestNewPlan } from "../new-plan.mjs";
import { epicView, ownership, plansTableView } from "../page-views.mjs";
import { archivePlan, unarchivePlan } from "../plan-archive.mjs";
import { lintPlan } from "../plan-quality.mjs";
import { deletePlan, deletePreview, specFolderState } from "../plan-retire.mjs";
import {
  answerReview,
  assertPlanAnswerWrite,
  reviewFindings,
} from "../plan-review-answers.mjs";
import {
  completePlanReviewWriter,
  recordPlanReviewWriter,
} from "../plan-review-authorship.mjs";
import { decidePlanReview } from "../plan-review-step.mjs";
import { planReviewSummary } from "../plan-review-summary.mjs";
import { currentPlanReview } from "../plan-review-tools.mjs";
import { planReviewView } from "../plan-review-view.mjs";
import {
  applyReviewSuggestion,
  createReviewThreads,
  createSpecReviewFindings,
  disposeReview,
  listReviewThreads,
  listSpecReviewRounds,
  replyToReview,
} from "../plan-reviews.mjs";
import {
  approvePlan,
  baselineItems,
  createPlan,
  extractPlan,
  proposeWork,
  savePlan,
} from "../plans.mjs";
import { pickTemplate } from "../plugins.mjs";
import { releaseQueue } from "../radar-coder-queue.mjs";
import { recordFindingDecision } from "../review-findings.mjs";
import { specLinks } from "../scm-links.mjs";
import { approvalEvidence } from "../spec-approval.mjs";
import {
  linkSpecPlan,
  proposeSpecWork,
  saveSpecPlan,
  specCategory,
  specEpic,
} from "../spec-plans.mjs";
import { fail } from "../store.mjs";
import { planPage } from "../views.mjs";
import { workspaceRepositories } from "../workspace-repositories.mjs";
import { person, notOnMcp, routed } from "../operation-policy.mjs";

// Archive or unarchive a plan (plan-archive.mjs): a session may too
// (R56.4), and either one undoes the other. Delete below is the one-way path.
function planArchiveHandler({ name, input, context }) {
  const store = this.store;

  const plan = store.get("plans", input.id);
  if (!plan || plan.deletedAt) fail("Plan not found.", 404);
  return (name === "plan.archive" ? archivePlan : unarchivePlan)(store, plan, {
    // A session is recorded as itself, never as the operator.
    by:
      context.caller || context.mcp
        ? `session:${context.caller?.sessionKey || context.caller || "mcp"}`
        : this.operator || null,
  });
}
// Delete a plan (plan-retire.mjs): only a person, from the page or the
// CLI. A plan with an approved revision needs {retire: true}.
function planDeletePreviewHandler({ name, input, context }) {
  const store = this.store;

  if (name === "plan.delete" && (context.caller || context.mcp))
    fail("Only a person deletes a plan, from the Avoozl page or the CLI.", 403);
  // The id, or a spec name (the CLI passes either); a name shared by
  // two plans is refused instead of guessed.
  let plan = store.get("plans", input.id);
  if (!plan && typeof input.id === "string") {
    const named = store
      .list("plans")
      .filter((row) => row.spec === input.id && !row.deletedAt);
    if (named.length > 1)
      fail(
        "More than one plan uses spec " +
          input.id +
          ". Use a plan id: " +
          named.map((row) => row.id).join(", "),
        409,
      );
    plan = named[0];
  }
  if (!plan || plan.deletedAt) fail("Plan not found.", 404);
  let folder = null;
  if (plan.spec)
    try {
      const spec = this.readSpec(plan.spec);
      folder = spec.exists ? specFolderState(spec.root, plan.spec) : null;
    } catch {
      folder = null;
    }
  if (name === "plan.delete.preview")
    return deletePreview(store, this.read(), plan, folder);
  return deletePlan(store, plan, {
    retire: input.retire === true,
    deleteSpecFolder: input.deleteSpecFolder === true,
    folder,
  });
}
// Epics span plans (Requirement 59): every approved epic and every epic
// folder on disk not yet approved, each with computed progress.
function epicListHandler({ name, input }) {
  const store = this.store;

  const data = this.read(),
    folders = (() => {
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
    view = (id) => {
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
  {
    name: "plan.extract",
    class: "execute",
    policy: routed,
    handler({ input }) {
      if (
        input.provider ||
        (Array.isArray(input.sequence) && input.sequence.length)
      )
        fail(
          "plan.extract takes no provider; a planner session fills it.",
          400,
        );
      return this.startExtractionPipeline(input);
    },
  },
  // The Epics screen (read only).
  {
    name: "epics.view",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return epicsView(
        store,
        releaseQueue(store, planningIdentity(this.workspaceRoot)),
      );
    },
  },
  // An external gap report becomes proposed tasks in the sub-specs; nothing is
  // added until a person accepts (RC17.6).
  {
    name: "gap.preview",
    class: "observe",
    policy: routed,
    handler({ input, context }) {
      return this.gapPreview(input, {
        local: !(context.caller || context.mcp),
      });
    },
  },

  {
    name: "gap.accept",
    class: "execute",
    policy: person("Only a person accepts gap report proposals."),
    async handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person accepts gap report proposals.", 403);
      const found = await this.gapPreview(input, { local: true }),
        chosen = Array.isArray(input.ids)
          ? found.proposals.filter((p) =>
              input.ids.includes(`${p.spec}:${p.id}`),
            )
          : found.proposals,
        added = [];
      for (const proposal of chosen) {
        const plan = store
          .list("plans")
          .find((entry) => entry.spec === proposal.spec && !entry.deletedAt);
        if (!plan) fail(`Sub-spec ${proposal.spec} is not a plan yet.`, 409);
        const current = store.get("plans", plan.id);
        proposeSpecWork(
          store,
          {
            id: plan.id,
            expectedHash: current.hash,
            proposal: {
              id: proposal.id,
              title: proposal.title,
              kind: "leaf",
              summary: `Gap report: ${proposal.repository} fails ${proposal.requirement}.`,
              acceptance: proposal.acceptance,
            },
          },
          (spec) => this.readSpec(spec),
        );
        added.push(`${proposal.spec}:${proposal.id}`);
      }
      return { added };
    },
  },

  {
    name: "plan.spec.read",
    class: "observe",
    policy: routed,
    handler({ input }) {
      return this.readSpecDocuments(input);
    },
  },
  {
    name: "plan.archive",
    class: "protect",
    policy: routed,
    handler: planArchiveHandler,
  },
  {
    name: "plan.unarchive",
    class: "protect",
    policy: routed,
    handler: planArchiveHandler,
  },
  {
    name: "plan.delete.preview",
    class: "observe",
    policy: routed,
    handler: planDeletePreviewHandler,
  },
  {
    name: "plan.delete",
    class: "protect",
    policy: person("Only a person deletes a plan."),
    handler: planDeletePreviewHandler,
  },

  {
    name: "plan.restore",
    class: "protect",
    policy: routed,
    handler({ name, input }) {
      const store = this.store;
      return store.transaction(() => {
        const row = store.get("plans", input.id);
        if (!row) fail("Record not found.", 404);
        if (row.state === "approved" || Object.keys(row.mapping || {}).length)
          fail(
            "Approved plans keep their task and approval history. Abandon the linked work instead.",
            409,
          );
        delete row.deletedAt;
        store.put("plans", row);
        store.event(null, name, { id: row.id });
        return { id: row.id, deletedAt: null };
      });
    },
  },

  {
    name: "plan.list",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return planPage(store, input);
    },
  },

  {
    name: "plan.specs",
    class: "observe",
    policy: routed,
    handler({}) {
      return this.specList();
    },
  },
  {
    name: "epic.list",
    class: "observe",
    policy: routed,
    handler: epicListHandler,
  },
  {
    name: "epic.get",
    class: "observe",
    policy: routed,
    handler: epicListHandler,
  },

  {
    name: "plan.table",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;

      const specs = (() => {
        // A workspace with no spec folders for its mode still has stored
        // plans; the table shows those, and the folder problem with them.
        try {
          const list = this.specList();
          return { ...list, problem: list.homeErrors?.join(" ") || null };
        } catch (error) {
          return { root: null, items: [], problem: error.message };
        }
      })();
      const stored = store
        .list("plans")
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
          categoryOf: (plan) =>
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
    policy: routed,
    handler({ input, expectedRevision }) {
      const store = this.store;
      return store.mutate(
        "Classify " + input.id,
        (data) => {
          applyPlanMetadata(data, input.id, input);
          return data.documents[input.id];
        },
        expectedRevision,
      );
    },
  },
  // New plan: only a person asks, from the Avoozl page. It records the
  // request and returns the planner chat's seed; it approves nothing.
  {
    name: "plan.new",
    class: "draft",
    policy: person("Only a person starts a new plan."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person starts a new plan, from the Avoozl page.", 403);
      const result = requestNewPlan(store, input, {
        readSpec: (spec) => this.readSpec(spec),
        repositories: workspaceRepositories(store).filter(
          (repo) => !repo.planning,
        ),
        specRoot: this.specRoots()[0] || null,
        template: (ref) => pickTemplate(this.pluginOptions, ref),
      });
      return result;
    },
  },

  {
    name: "plan.create",
    class: "draft",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;

      assertPlanAnswerWrite(store, { id: input.id || input.spec }, context);
      if (input.spec === undefined) return createPlan(store, input);
      return this.createSpecDraft(input, context);
    },
  },

  {
    name: "plan.save",
    class: "draft",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      const agent = Boolean(context.caller || context.mcp);

      assertPlanAnswerWrite(store, { id: input.id }, context);
      const plan = store.get("plans", input.id);
      if (plan?.spec && input.text === undefined) {
        const spec = this.readSpec(plan.spec);
        if (spec.exists && agent) enforceSpec(store, spec, { mode: "refuse" });
        const saved = saveSpecPlan(store, input, spec);
        recordPlanReviewWriter(store, saved, {
          previousHash: plan.hash,
          caller: context.caller,
        });
        return this.carryApproval(plan, saved) ?? saved;
      }
      // An old-style plan whose spec folder now exists: link it as a draft.
      if (plan && !plan.spec && input.spec !== undefined) {
        const spec = this.readSpec(input.spec);
        if (spec.exists && agent) enforceSpec(store, spec, { mode: "refuse" });
        const linked = linkSpecPlan(store, input, spec);
        recordPlanReviewWriter(store, linked, {
          previousHash: plan.hash,
          caller: context.caller,
        });
        return linked;
      }
      return savePlan(store, input);
    },
  },

  {
    name: "plan.propose",
    class: "draft",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      const agent = Boolean(context.caller || context.mcp);

      const plan = store.get("plans", input.id);
      if (plan?.spec && !input.fact) {
        if (agent && input.proposal && typeof input.proposal === "object")
          enforceContent(
            store,
            {
              boundary: "plan",
              target: `${plan.spec}/tasks.md`,
              text: JSON.stringify(input.proposal, null, 1),
            },
            { mode: "refuse" },
          );
        return proposeSpecWork(store, input, (spec) => this.readSpec(spec));
      }
      return proposeWork(store, input);
    },
  },

  {
    name: "plan.get",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      const data = this.read(),
        epic = epicOfPlan(data, plan.id),
        phases = new Map();
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
        quality: plan.spec
          ? this.lintSpecPlan(plan)
          : lintPlan({
              text: plan.text,
              plan,
              data: {
                ...this.read(),
                repositories: store.list("repositories"),
              },
            }),
        ...(plan.spec ? { disk: this.specOnDisk(plan) } : {}),
        // The spec's Links box (R92.4): stored records only, no GitHub
        // call. A local read, so a private spec issue shows only here.
        ...(plan.spec ? { links: specLinks(store, plan.id) } : {}),
        approvals: store.list("approvals").filter((a) => a.planId === plan.id),
        reviews: listReviewThreads(store, { planId: plan.id }).items,
        review: planReviewSummary(store, plan.id),
        reviewPipelines: store
          .list("review_rounds")
          .filter((round) => round.planId === plan.id),
        extractions: store
          .list("extractions")
          .filter((extraction) => extraction.planId === plan.id)
          .map((extraction) => getExtraction(store, extraction.id)),
      };
    },
  },

  {
    name: "plan.lint",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      if (plan.spec) return this.lintSpecPlan(plan);
      const text = input.text ?? plan.text;
      if (typeof text !== "string" || text.length > 1000000)
        fail("Plan text is required.");
      return lintPlan({
        text,
        plan,
        data: {
          ...this.read(),
          repositories: store.list("repositories"),
        },
      });
    },
  },

  {
    name: "plan.preview",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      if (plan.spec && input.text !== undefined)
        fail("A spec plan is previewed from its stored revision.");
      const text = input.text ?? plan.text,
        specQuality = plan.spec ? this.lintSpecPlan(plan) : null;
      // Read-only: show exactly what approving this revision would extract,
      // without creating anything. Approval remains a separate operation.
      const data = this.read(),
        extraction = input.extractionId
          ? getExtraction(store, input.extractionId)
          : null,
        proposals = extraction
          ? proposalsFromFacts(store, extraction.id)
          : specQuality
            ? specQuality.proposals
            : extractPlan(text),
        mapping = Object.fromEntries(
          proposals.map((p) => [
            p.id,
            resolveTaskId(
              data,
              p.taskId ||
                plan.mapping?.[p.id] ||
                (plan.spec ? p.id : `${plan.id}-${p.id}`),
            ),
          ]),
        );
      const existing = new Set(data.tasks.map((t) => t.id));
      const rows = new Map(data.tasks.map((t) => [t.id, t]));
      const quality =
        specQuality ||
        lintPlan({
          text,
          plan,
          data: {
            ...data,
            repositories: store.list("repositories"),
          },
          ...(extraction ? { proposals } : {}),
        });
      return {
        planId: plan.id,
        reviewedHash: plan.spec ? plan.hash : digest(text),
        review: planReviewSummary(store, plan.id),
        currentHash: plan.hash,
        state: plan.state,
        quality,
        // Send this back as expectedRevision when approving.
        expectedRevision: data.revision,
        approved: store
          .list("approvals")
          .some(
            (a) =>
              a.planId === plan.id &&
              a.hash === (plan.spec ? plan.hash : digest(text)),
          ),
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
          ["requires", "sequence", "supports"].flatMap((kind) =>
            (p[kind] || []).map((ref) => ({
              kind,
              from: mapping[ref] || ref,
              to: mapping[p.id],
              known: existing.has(mapping[ref] || ref) || Boolean(mapping[ref]),
              ...(specQuality?.declaredDependencies.find(
                (entry) => entry.taskId === ref,
              )
                ? {
                    declaredBy: specQuality.declaredDependencies.find(
                      (entry) => entry.taskId === ref,
                    ).spec,
                    pending: (() => {
                      const declaration = specQuality.declaredDependencies.find(
                          (entry) => entry.taskId === ref,
                        ),
                        owner = store.get("plans", declaration.planId),
                        receipt =
                          owner?.approvalId &&
                          store.get("approvals", owner.approvalId);
                      return !approvedSpecDependency(
                        declaration,
                        rows.get(mapping[ref] || ref),
                        owner,
                        receipt,
                      );
                    })(),
                  }
                : {}),
            })),
          ),
        ),
        retiring: Object.keys(plan.mapping || {}).filter((id) => !mapping[id]),
        // Checked [x] items approval creates as accepted (plans.mjs).
        baseline: (() => {
          if (!specQuality) return { count: 0, taskIds: [], text: "" };
          const checked = baselineItems(plan.spec, plan.text, proposals),
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
        extractionId: extraction?.id || null,
        facts: extraction?.facts || [],
        gaps: extraction?.gaps || [],
      };
    },
  },

  {
    name: "plan.approve",
    class: "protect",
    policy: person(
      "Only a person approves a plan.",
      (input) => !input?.delegate,
    ),
    async handler({ input, expectedRevision }) {
      const store = this.store;

      // A named delegate approves as the person who granted it (R109).
      let delegation = approvalDelegation(store, {
        delegate: input.delegate,
        approvedBy: input.approvedBy,
      });
      const { plan, extraction, specQuality, proposals, quality } =
        this.approvalChecks(input);
      const approvedBy = delegation?.onBehalfOf ?? input.approvedBy;
      let approver =
          plan.spec && !extraction
            ? await this.specApprover(plan, approvedBy)
            : approvedBy?.trim() || this.operator,
        evidence = input.evidence;
      if (plan.spec && !extraction) {
        const gate = await this.approvalPullRequest(plan, {
          approvedBy: approver,
          quality,
          delegation,
        });
        if (gate?.pending)
          return {
            id: plan.id,
            hash: plan.hash,
            pending: true,
            approvalPullRequest: {
              repository: gate.pending.repository,
              number: gate.pending.number,
              branch: gate.pending.branch,
              // The adopted pull request merges itself once checks pass.
              ...(gate.pending.pull ? { adopted: true } : {}),
            },
          };
        if (gate?.merged) {
          approver = gate.merged.approvedBy;
          evidence = evidence || approvalEvidence(gate.merged);
          delegation ??= approvalDelegation(store, { state: gate.merged });
        }
      }
      const { delegate: _delegate, ...rest } = input;
      const approved = approvePlan(store, {
        ...rest,
        evidence:
          evidence || (delegation ? delegationEvidence(delegation) : evidence),
        delegation,
        githubPolicy: this.githubPolicy(),
        ...(extraction ? { extraction, proposals } : {}),
        ...(specQuality
          ? {
              proposals,
              baseline: true,
              declaredDependencies: specQuality.declaredDependencies,
            }
          : {}),
        approvedBy: approver,
        operator: input.operator || this.operator,
        expectedRevision: input.expectedRevision ?? expectedRevision,
      });
      return approved;
    },
  },
  // Several specs at once, all or none (approval-batches.mjs).
  {
    name: "plan.approveMany",
    class: "protect",
    policy: person(
      "Only a person approves a plan.",
      (input) => !input?.delegate,
    ),
    handler({ input }) {
      return approveMany(this, input);
    },
  },
  // Who may approve on a person's behalf (approval-delegation.mjs, R109).
  {
    name: "approval.delegates",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return listDelegates(store);
    },
  },

  {
    name: "approval.delegate.grant",
    class: "protect",
    policy: person("Only a person grants approval delegation."),
    async handler({ input }) {
      const store = this.store;
      return grantDelegate(store, {
        identity: input.identity,
        onBehalfOf: input.onBehalfOf?.trim() || (await this.personLogin()),
        note: input.note,
      });
    },
  },

  {
    name: "approval.delegate.revoke",
    class: "protect",
    policy: person("Only a person revokes approval delegation."),
    async handler({ input }) {
      const store = this.store;
      return revokeDelegate(store, {
        identity: input.identity,
        revokedBy: await this.personLogin(),
      });
    },
  },

  {
    name: "plan.approvalBatches",
    class: "observe",
    policy: routed,
    handler({ input }) {
      return approvalBatches(this, input);
    },
  },

  {
    name: "plan.extract.get",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return getExtraction(store, input.id || input.extractionId);
    },
  },

  {
    name: "plan.extraction.submit",
    class: "draft",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      return submitExtraction(store, input);
    },
  },

  {
    name: "plan.extraction.dispose",
    class: "draft",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return disposeFact(store, input);
    },
  },

  {
    name: "plan.review.get",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return currentPlanReview(store, input);
    },
  },

  {
    name: "plan.review.list",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return listReviewThreads(store, input);
    },
  },

  {
    name: "plan.reviewSummary",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return planReviewSummary(store, input.planId || input.id);
    },
  },

  {
    name: "plan.review.findings",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return reviewFindings(store, input);
    },
  },

  {
    name: "plan.review.view",
    class: "observe",
    policy: notOnMcp("App page rendering only."),
    handler({ input }) {
      const store = this.store;
      return planReviewView(store, input);
    },
  },

  {
    name: "plan.review.answer",
    class: "draft",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;
      return answerReview(store, input, context);
    },
  },

  {
    name: "plan.review.decide",
    class: "draft",
    policy: person("Only a person starts or skips a draft review."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person starts or skips a draft review.", 403);
      if (input.action === "review") {
        const plan = store.get("plans", input.planId),
          existing =
            plan?.hash === input.revisionHash &&
            listSpecReviewRounds(store, {
              planId: input.planId,
              revisionHash: input.revisionHash,
            }).items.at(-1);
        if (
          existing &&
          (existing.slot || ["running", "done"].includes(existing.state))
        )
          return {
            existing: true,
            state: existing.state,
            roundId: existing.id,
          };
        const config = loadLayeredConfig({
            workspaceRoot: this.workspaceRoot,
          }).config,
          reviewer = chatModel(config, "planReviewer"),
          writer = completePlanReviewWriter(
            store,
            input.planId,
            input.revisionHash,
          )?.actualModel;
        if (validatePlanReview(config.planReview).mode === "off")
          fail(
            "Plan reviews are off. Enable them in Settings before starting a review.",
            409,
          );
        if (!reviewer)
          fail("Pick a Plan reviewer model in Settings › Models.", 409);
        if (reviewer === writer)
          fail(
            "The reviewer model is the same as the model that wrote this revision.",
            409,
          );
      }
      return decidePlanReview(store, input, context);
    },
  },

  {
    name: "plan.review.submit",
    class: "draft",
    policy: routed,
    handler({ input, context }) {
      const store = this.store;

      if (store.get("plans", input.planId)?.spec)
        return createSpecReviewFindings(store, input, {
          caller: context.caller,
          mcp: context.mcp,
        });
      return createReviewThreads(store, {
        ...input,
        author: input.author || this.operator,
      });
    },
  },

  {
    name: "plan.review.reply",
    class: "draft",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return replyToReview(store, {
        ...input,
        author: input.author || this.operator,
      });
    },
  },
  // A person's action on a spec review finding (R104.5). Person-only:
  // perform refuses MCP and agent sessions before this runs.
  // Without a revision (the CLI) it is the spec's current one.
  {
    name: "plan.review.finding.decide",
    class: "draft",
    policy: person("Only a person decides a review finding."),
    handler({ input }) {
      const store = this.store;

      const thread = store.get("review_threads", input.id);
      return recordFindingDecision(store, {
        id: input.id,
        action: input.action,
        revisionHash:
          input.revisionHash || store.get("plans", thread?.planId)?.hash,
        note: input.note,
        by: this.operator,
      });
    },
  },

  {
    name: "plan.review.dispose",
    class: "draft",
    policy: person("Only a person closes a review comment."),
    handler({ input }) {
      const store = this.store;

      const thread = store.get("review_threads", input.id);
      if (thread?.source !== "plan-review")
        return disposeReview(store, {
          ...input,
          author: input.author || this.operator,
        });
      // The four old dispositions, as decisions at the named or current
      // revision (R104.6).
      const action = {
        resolved: "resolve",
        accepted: "accept",
        rejected: "reject",
        deferred: "defer",
      }[input.disposition];
      if (!action) fail("Choose resolved, accepted, rejected, or deferred.");
      return recordFindingDecision(store, {
        id: input.id,
        action,
        revisionHash:
          input.revisionHash || store.get("plans", thread.planId)?.hash,
        note: input.note,
        by: this.operator,
      });
    },
  },

  {
    name: "plan.review.apply",
    class: "draft",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return applyReviewSuggestion(store, {
        ...input,
        author: input.author || this.operator,
      });
    },
  },

  {
    name: "plan.review.pipeline.get",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;

      const round = store.get("review_rounds", input.id);
      if (!round) fail("Review pipeline not found.", 404);
      return round;
    },
  },
];
