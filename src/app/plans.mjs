import { duplicateCandidates, resolveTaskId } from "../task-identity.mjs";
import { randomUUID } from "node:crypto";
import { digest } from "../model.mjs";
import { COMPLETIONS, TASK_KINDS, isSource } from "../work-model.mjs";
import { fail } from "./store.mjs";
import { validateNeeds, validateSession } from "./placement.mjs";
import { budgetInput } from "./budget.mjs";
import { frontMatterCategory } from "../front-matter.mjs";
import { newTaskAuthority } from "./github-policy.mjs";
import {
  checkedItems,
  epicMembers,
  isEpicFolder,
  specEpic,
  specTitle,
} from "./spec-plans.mjs";
import { refreshEpicMembers } from "./epics.mjs";
import {
  createExtraction,
  factIdentity,
  submitExtraction,
} from "./design-extraction.mjs";

export const PLAN_TEMPLATE = (prompt) =>
  `# ${prompt.split("\n")[0].slice(0, 140)}\n\n${prompt}\n\nDescribe the outcome, scope, alternatives, decisions, validation, and rollout in the structure that best fits this design.\n`;
export const PLAN_FORMAT =
  "Write one design as ordinary Markdown. Explain the intended outcome, boundaries, decisions, dependencies, observable acceptance, validation, and rollout where they are material. Use whatever headings and structure fit the design. Do not embed machine bookkeeping merely to make work executable: Avoozl derives cited facts in a separate extraction. No work is executable before explicit extraction approval. Never approve your own design. Return the Markdown design as your final response.";
// One fenced task block. A fresh instance per use keeps /g state local.
const taskBlocks = () => /^```task\s*\r?\n([\s\S]*?)^```\s*$/gm;
// Migration read path only (Requirement 30.8): old workspaces such as Nupp
// keep plan files with fenced task blocks. Avoozl never writes them; new
// plans are Kiro spec folders read by spec-plans.mjs.
export function extractPlan(markdown) {
  const proposals = [];
  let match;
  const re = taskBlocks();
  while ((match = re.exec(markdown))) {
    let item;
    try {
      item = JSON.parse(match[1]);
    } catch {
      fail("A task block contains invalid JSON.");
    }
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(item?.id || ""))
      fail("Each task needs a stable lowercase local ID.");
    validateProposal(item);
    if (proposals.some((x) => x.id === item.id))
      fail("Repeated local task ID " + item.id);
    proposals.push({
      ...item,
      lineStart: markdown.slice(0, match.index).split("\n").length,
      lineEnd: markdown.slice(0, re.lastIndex).split("\n").length,
    });
  }
  if (!proposals.length)
    fail("Add at least one fenced task block before approval.");
  return proposals;
}
// The field rules every proposed task meets, whichever file it came from.
// Normalizes `requires` conditions in place.
export function validateProposal(item) {
  if (!item || typeof item !== "object" || Array.isArray(item))
    fail("Describe each task as a JSON object.");
  if (
    typeof item.title !== "string" ||
    !item.title.trim() ||
    item.title.length > 240
  )
    fail("Each task needs a title of 1–240 characters.");
  if (item.kind !== undefined && !TASK_KINDS.includes(item.kind))
    fail(
      item.kind === "epic"
        ? 'kind "epic" is not a task kind: write "package". An epic is its own spec folder that lists plans.'
        : "kind must be package or leaf.",
    );
  if (item.epic !== undefined)
    fail(
      'A task names no epic: its plan does. Use "phase" to group tasks inside a plan.',
    );
  // Local is opt-in per task; github comes only from projection (§3.2). A
  // tracker plugin's authority is named in the plan and projected (R35.10).
  if (
    item.authority !== undefined &&
    item.authority !== "local" &&
    !(isSource(item.authority) && item.authority.startsWith("plugin:"))
  )
    fail(
      'authority may only be "local" or "plugin:<id>"; a task becomes github through projection.',
    );
  if (item.route !== undefined && !isSource(item.route))
    fail("route must be local, github or plugin:<id>.");
  if (item.completion !== undefined && !COMPLETIONS.includes(item.completion))
    fail("completion must be one of " + COMPLETIONS.join(", ") + ".");
  // Accept only from Avoozl-recorded validation (§5.2, R38.4).
  if (item.acceptFrom !== undefined && item.acceptFrom !== "validation")
    fail('acceptFrom may only be "validation".');
  // A verifier chat judges this bar even when it has checks (§5.2 Checks).
  if (item.verify !== undefined && item.verify !== "agent")
    fail('verify may only be "agent".');
  // Packages complete from their children; leaves are checked.
  const parent = item.kind === "package";
  if (
    (!parent || item.acceptance !== undefined) &&
    (!Array.isArray(item.acceptance) ||
      !item.acceptance.length ||
      item.acceptance.some((x) => typeof x !== "string" || !x.trim()))
  )
    fail("Each proposed task needs observable acceptance criteria.");
  // A requires entry may name the completion level it waits for.
  if (Array.isArray(item.requires)) {
    const conditions = {};
    item.requires = item.requires.map((entry) => {
      if (typeof entry === "string" || entry === null) return entry;
      if (
        typeof entry?.task !== "string" ||
        !COMPLETIONS.includes(entry.condition)
      )
        fail("A requires condition needs a task and a known completion.");
      conditions[entry.task] = entry.condition;
      return entry.task;
    });
    if (Object.keys(conditions).length) item.conditions = conditions;
  }
  for (const field of [
    "requires",
    "sequence",
    "supports",
    "tags",
    "resources",
    "checks",
  ])
    if (
      item[field] !== undefined &&
      (!Array.isArray(item[field]) ||
        item[field].some((x) => typeof x !== "string"))
    )
      fail(field + " must be a list of strings.");
  for (const field of [
    "summary",
    "nextAction",
    "track",
    "projectId",
    "taskId",
    "distinctReason",
    "repository",
    // The Project's Release and Iteration values for this task (§6.7).
    "milestone",
    "iteration",
  ])
    if (item[field] !== undefined && typeof item[field] !== "string")
      fail(field + " must be text.");
  // Batching (§4.11): only the planner knows a task is small in advance.
  if (item.size !== undefined && item.size !== "small")
    fail('size may only be "small".');
  if (
    item.paths !== undefined &&
    (!Array.isArray(item.paths) ||
      item.paths.some((x) => typeof x !== "string"))
  )
    fail("paths must be a list of strings.");
  // Placement (§4.10): labels and a type word the routing agent reads, the
  // crew tags the work needs, and a pinned agent, model or crew (R53.1).
  if (
    item.labels !== undefined &&
    (!Array.isArray(item.labels) ||
      item.labels.length > 30 ||
      item.labels.some(
        (x) => typeof x !== "string" || !x.trim() || x.length > 100,
      ))
  )
    fail("labels must be a list of at most 30 names.");
  if (
    item.type !== undefined &&
    (typeof item.type !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(item.type))
  )
    fail("type must be one lowercase word, such as test.");
  if (item.session !== undefined) validateSession(item.session);
  if (item.needs !== undefined) validateNeeds(item.needs);
  // A leaf's cap, and its spec's from the manifest top level (§4.17).
  if (item.budget !== undefined) budgetInput(item.budget, "budget");
  if (item.specBudget !== undefined)
    budgetInput(item.specBudget, "the spec budget");
  return item;
}
export function createPlan(
  store,
  { prompt, text, context = {}, id, kind = "plan" },
) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20000)
    fail("Describe the plan.");
  const now = new Date().toISOString();
  id ??= "plan-" + randomUUID().slice(0, 12);
  const previous = store.get("plans", id);
  if (previous) {
    if (previous.prompt === prompt) return previous;
    fail("Plan ID already exists.", 409);
  }
  const markdown = text ?? PLAN_TEMPLATE(prompt);
  if (typeof markdown !== "string" || markdown.length > 1000000)
    fail("Plan text is too large.");
  const plan = {
    id,
    kind,
    title: markdown.match(/^# (.+)$/m)?.[1] || prompt.slice(0, 140),
    prompt,
    text: markdown,
    hash: digest(markdown),
    revision: 1,
    state: kind === "conversation" ? "conversation" : "draft",
    context,
    createdAt: now,
    updatedAt: now,
    history: [],
  };
  return store.transaction(() => {
    store.put("plans", plan);
    store.event(null, "plan.created", { planId: id, hash: plan.hash });
    return plan;
  });
}
// One revision of the design document. An amended approved plan no longer
// matches its approval receipt, so its tasks require review until the next
// explicit approval. A spec plan's revision is its folder's files and hash.
export function writeRevision(store, plan, text, summary, spec = null) {
  plan.history.push({
    revision: plan.revision,
    hash: plan.hash,
    text: plan.text,
    ...(plan.files ? { files: plan.files } : {}),
    at: plan.updatedAt,
    state: plan.state,
  });
  plan.revision++;
  plan.text = text;
  plan.hash = spec ? spec.hash : digest(text);
  if (spec) plan.files = spec.files;
  plan.title = spec?.title || text.match(/^# (.+)$/m)?.[1] || plan.title;
  plan.state = "draft";
  plan.updatedAt = new Date().toISOString();
  store.put("plans", plan);
  if (plan.documentId) {
    const data = structuredClone(store.read()),
      held = new Set(plan.reviewHeld || []);
    for (const task of data.tasks.filter((t) => t.planId === plan.id)) {
      if (!task.needsReview) held.add(task.id);
      task.needsReview = true;
    }
    // Approval releases the tasks this draft held if their entry is unchanged.
    plan.reviewHeld = [...held];
    store.put("plans", plan);
    store.commit(data, summary + plan.title);
  }
  store.event(null, "plan.changed", { planId: plan.id, hash: plan.hash });
  return plan;
}
export function savePlan(store, { id, text, expectedHash }) {
  return store.transaction(() => {
    const plan = store.get("plans", id);
    if (!plan) fail("Plan not found.", 404);
    if (plan.spec)
      fail("A spec plan is read from its folder; save it without text.", 409);
    if (plan.hash !== expectedHash)
      fail("This draft changed. Reload before saving.", 409);
    if (typeof text !== "string" || text.length > 1000000)
      fail("Plan text is required.");
    return writeRevision(store, plan, text, "Review amended design: ");
  });
}
// Append-only amendment for an agent that discovered adjacent work. This is a
// proposal: it never mints a canonical task ID, approves a plan or touches an
// approval receipt.
export function proposeWork(store, { id, proposal, fact, expectedHash }) {
  if (fact) {
    const plan = store.get("plans", id);
    if (!plan || plan.deletedAt) fail("Plan not found.", 404);
    if (plan.kind === "conversation")
      fail(
        "A conversation is not a plan. Create an explicit plan draft before proposing work.",
      );
    if (expectedHash !== undefined && plan.hash !== expectedHash)
      fail("This plan changed. Reload before proposing work.", 409);
    if (!fact || typeof fact !== "object" || Array.isArray(fact))
      fail("Describe one cited proposed fact.");
    const latest = store
        .list("extractions")
        .find(
          (entry) =>
            entry.planId === id &&
            entry.revisionHash === plan.hash &&
            entry.state !== "stale",
        ),
      extraction =
        latest ||
        createExtraction(store, {
          planId: id,
          revisionHash: plan.hash,
          projectId: plan.context?.projectId || null,
        }),
      taskFact = {
        ...fact,
        kind: fact.kind || "task",
        derivation: fact.derivation || "stated",
      },
      taskFactId = factIdentity(taskFact),
      acceptance = Array.isArray(fact.acceptance)
        ? fact.acceptance.map((text) => ({
            kind: "acceptance",
            text,
            quote: fact.quote,
            derivation: fact.derivation || "stated",
            reasoning: fact.reasoning,
            relatesTo: taskFactId,
          }))
        : [],
      submitted = submitExtraction(store, {
        extractionId: extraction.id,
        revisionHash: plan.hash,
        facts: [taskFact, ...acceptance],
      });
    return {
      ...plan,
      extractionId: extraction.id,
      factId: taskFactId,
      facts: submitted.facts,
      approved: false,
      policy:
        "Proposed facts are not executable and do not rewrite the design. An authorized extraction approval materializes accepted work.",
    };
  }
  // A task proposal on a spec plan adds a tasks.md item and a manifest
  // entry (spec-plans.mjs). Avoozl no longer writes fenced task blocks.
  const plan = store.get("plans", id);
  if (!plan || plan.deletedAt) fail("Plan not found.", 404);
  fail(
    "This plan is not a Kiro spec folder, and Avoozl no longer writes fenced task blocks. Propose a cited fact, or move the plan to .kiro/specs/<name>/.",
    409,
  );
}
// The checked items approval would start as accepted: [x] in tasks.md, and
// not gated on Avoozl-recorded validation (R38.4), which no mark can meet.
export function baselineItems(name, text, proposals) {
  const checked = checkedItems(name, text),
    gated = new Set(
      proposals.filter((p) => p.acceptFrom === "validation").map((p) => p.id),
    );
  for (const id of gated) checked.delete(id);
  return checked;
}
function baselineAcceptance(item, hash, { at, approver }) {
  return {
    status: "accepted",
    acceptanceEvidence: {
      at,
      evidence:
        `tasks.md line ${item.line} marks ${item.key} [x] at approved revision ${hash}` +
        (item.built ? `. Built: ${item.built}` : ""),
      baseline: { file: "tasks.md", line: item.line, mark: "[x]", hash },
      ...(item.built ? { built: item.built } : {}),
      ...(approver ? { acceptedBy: approver } : {}),
      componentOnly: false,
    },
  };
}
// The two inputs that keep the graph correct are the hashes. Who approved is
// recorded from the workspace's operator when the caller does not say, and
// approval notes are kept only when a caller has something real to add: a
// required field containing a fixed sentence carries less than an absent one.
const plansById = (store) =>
  new Map(store.list("plans").map((plan) => [plan.id, plan]));

// An epic folder's approval stores its member list and prose. It never
// approves a member plan or a task (Requirement 59.4).
function approveEpic(
  store,
  data,
  plan,
  { expectedRevision, approver, evidence },
) {
  const now = new Date().toISOString(),
    plans = store.list("plans").filter((entry) => !entry.deletedAt),
    listed = epicMembers(plan.files).map(
      (name) => plans.find((entry) => entry.spec === name)?.id ?? name,
    ),
    receipt = {
      id: "approval-" + randomUUID(),
      planId: plan.id,
      hash: plan.hash,
      source: plan.text,
      approvedBy: approver,
      evidence: evidence?.trim() || "",
      at: now,
      mapping: {},
      taskIds: [],
      spec: plan.spec,
      files: plan.files,
      epic: { members: listed },
    };
  store.put("approvals", receipt);
  plan.state = "approved";
  plan.kind = "plan";
  plan.epicFolder = true;
  plan.mapping = {};
  plan.approvalId = receipt.id;
  store.put("plans", plan);
  // The store keeps cross-plan epics only (design §6.9): rows from before
  // Requirement 59 (no planId) are dropped with this write.
  data.epics = [
    ...(data.epics || []).filter(
      (epic) => epic.planId && epic.id !== plan.spec,
    ),
    {
      id: plan.spec,
      title: specTitle({ name: plan.spec, files: plan.files }),
      planId: plan.id,
      listed,
      plans: [],
    },
  ];
  refreshEpicMembers(data, plansById(store));
  store.commit(data, "Approve epic " + plan.title, expectedRevision);
  store.event(null, "plan.approved", {
    planId: plan.id,
    receiptId: receipt.id,
    taskIds: [],
    epic: plan.spec,
  });
  return receipt;
}

export function approvePlan(
  store,
  {
    id,
    expectedHash,
    expectedRevision,
    approvedBy,
    evidence,
    operator,
    proposals: suppliedProposals,
    extraction,
    githubPolicy,
    baseline = false,
  },
) {
  // Authorization is the reviewed hash and database revision below. Who
  // approved and why are recorded when supplied; typing them proves nothing.
  return store.transaction(() => {
    const plan = store.get("plans", id);
    if (!plan) fail("Plan not found.", 404);
    if (plan.kind === "conversation")
      fail(
        "A conversation is not a plan. Create an explicit plan draft before approval.",
      );
    if (plan.hash !== expectedHash)
      fail("The reviewed document hash changed.", 409);
    const previous = store
      .list("approvals")
      .find((a) => a.planId === id && a.hash === expectedHash);
    if (previous) return { ...previous, existing: true };
    const data = structuredClone(store.read());
    if (data.revision !== expectedRevision)
      fail(
        "Database changed. Review extraction against the current revision.",
        409,
      );
    if (plan.spec && isEpicFolder(plan.files))
      return approveEpic(store, data, plan, {
        expectedRevision,
        approver: approvedBy?.trim() || operator?.trim() || "",
        evidence,
      });
    // A spec plan's tasks keep their tasks.md IDs; its tasks.md is plan.text.
    const extracted = Boolean(extraction),
      spec = plan.spec || null,
      proposals = suppliedProposals || extractPlan(plan.text),
      mapping = Object.fromEntries(
        proposals.map((t) => [
          t.id,
          resolveTaskId(
            data,
            t.taskId || plan.mapping?.[t.id] || (spec ? t.id : `${id}-${t.id}`),
          ),
        ]),
      );
    if (new Set(Object.values(mapping)).size !== proposals.length)
      fail(
        "Use one task block per canonical deliverable; combine repeated references.",
      );
    const documentId = spec
        ? `spec:${spec}`
        : extracted
          ? `plan:${id}`
          : `workspace/plans/${id}.md`,
      now = new Date().toISOString(),
      known = new Set([
        ...data.tasks.map((t) => t.id),
        ...Object.values(mapping),
      ]),
      // Work a person already checked off: the [x] items of the stored
      // tasks.md this approval covers. Only the plan.approve operation asks
      // for it, and only a task this approval creates starts accepted.
      checked =
        baseline && spec && !extracted
          ? baselineItems(spec, plan.text, proposals)
          : new Map(),
      baselined = [],
      approver = approvedBy?.trim() || operator?.trim() || "";
    const oldMapping = plan.mapping || {};
    for (const oldId of Object.keys(oldMapping))
      if (!mapping[oldId])
        fail(
          "Removing an approved task requires explicitly retiring it before this amendment.",
        );
    // What review covers for one task: its entry and its incoming plan edges.
    // Line numbers are left out, since editing another entry shifts them.
    const entry = (task) =>
        JSON.stringify([
          ...[
            "title",
            "summary",
            "acceptance",
            "nextAction",
            "track",
            "tags",
            "resources",
            "projectId",
            "kind",
            "route",
            "completion",
            "repository",
            "checks",
            "acceptFrom",
            "verify",
            "milestone",
            "iteration",
            "authority",
            "parent",
            "labels",
            "paths",
            "type",
            "session",
            "needs",
          ].map((key) => task[key] ?? null),
          task.source?.hash ?? null,
          data.edges
            .filter((e) => e.to === task.id && e.planId === id)
            .map((e) => `${e.from}:${e.kind}:${e.condition ?? ""}`)
            .sort(),
        ]),
      before = new Map(
        data.tasks
          .filter((t) => t.planId === id)
          .map((t) => [t.id, { entry: entry(t), needsReview: t.needsReview }]),
      ),
      held = new Set(plan.reviewHeld || []),
      edgeById = new Map(data.edges.filter((e) => e.id).map((e) => [e.id, e])),
      livePlans = new Set(
        store
          .list("plans")
          .filter((entry) => !entry.deletedAt)
          .map((entry) => entry.id),
      );
    for (const proposal of proposals) {
      if (
        proposal.taskId &&
        !data.tasks.some((t) => t.id === resolveTaskId(data, proposal.taskId))
      )
        fail("Task to reuse was not found: " + proposal.taskId);
      const taskId = mapping[proposal.id],
        existing = data.tasks.find((t) => t.id === taskId),
        contextTask = data.tasks.find(
          (t) => t.id === resolveTaskId(data, plan.context.selected),
        );
      const track =
        proposal.track ||
        plan.context.filters?.track ||
        contextTask?.track ||
        "catalog";
      if (!data.tracks.some((t) => t.id === track))
        fail("Unknown track " + track);
      const design = {
        id: taskId,
        title: proposal.title,
        summary: proposal.summary || "",
        acceptance: proposal.acceptance,
        nextAction: proposal.nextAction || proposal.summary || proposal.title,
        track,
        tags: proposal.tags || [],
        resources: proposal.resources || [],
        projectId: proposal.projectId || plan.context.projectId,
        ...Object.fromEntries(
          [
            "kind",
            "route",
            "completion",
            "repository",
            "checks",
            "acceptFrom",
            "verify",
            "milestone",
            "iteration",
            "labels",
            "paths",
            "type",
            "session",
            "needs",
            "budget",
            "specBudget",
          ]
            .filter((key) => proposal[key] !== undefined)
            .map((key) => [key, proposal[key]]),
        ),
        planId: id,
        planHash: plan.hash,
        contextDocuments: [documentId],
        source: {
          document: documentId,
          key: proposal.id,
          lineStart: proposal.lineStart,
          lineEnd: proposal.lineEnd,
          hash: digest(
            proposal.fact?.quote ||
              plan.text
                .split("\n")
                .slice(proposal.lineStart - 1, proposal.lineEnd)
                .join("\n"),
          ),
          ...(proposal.fact
            ? {
                factId: proposal.fact.id,
                derivation: proposal.fact.derivation,
              }
            : {}),
        },
        statusAuthority: "database",
        updatedAt: now,
      };
      // A spec plan's phase groups only (Requirement 59.5); its epic is the
      // plan's, so a task never stores one.
      if (proposal.phase) design.phase = proposal.phase;
      // A spec plan names parents by nesting in tasks.md (spec-plans.mjs);
      // the parent is in the same plan, so it is in mapping.
      if (spec && proposal.parent) design.parent = mapping[proposal.parent];
      // With a GitHub mode a task defaults to github and shows as pending
      // projection until its issue exists; local stays opt-in (R28.2–R28.3).
      const authority = newTaskAuthority(githubPolicy, proposal.authority);
      if (authority !== "local" || proposal.authority === "local")
        design.authority = authority;
      if (
        existing?.planId === id &&
        authority === "local" &&
        (existing.github?.number || existing.github?.nodeId)
      )
        fail(
          `Task ${taskId} already has a GitHub issue. Take it back local explicitly instead of marking it local in the plan.`,
          409,
        );
      if (existing && existing.planId !== id) {
        existing.contextDocuments = [
          ...new Set([...(existing.contextDocuments || []), documentId]),
        ];
        existing.sourceReferences = [
          ...(existing.sourceReferences || []).filter(
            (ref) => ref.document !== documentId || ref.key !== proposal.id,
          ),
          {
            ...design.source,
            planId: id,
            approvedSource: {
              hash: plan.hash,
              text: plan.text
                .split("\n")
                .slice(proposal.lineStart - 1, proposal.lineEnd)
                .join("\n"),
            },
          },
        ];
      } else if (existing) {
        if (!design.authority) delete existing.authority;
        // A manifest that drops a milestone moves the task out of it, and
        // one that drops acceptFrom lifts the validation gate.
        for (const key of [
          "milestone",
          "iteration",
          "acceptFrom",
          "verify",
          "labels",
          "paths",
          "type",
          "session",
          "needs",
          "budget",
          "specBudget",
          "phase",
        ])
          if (design[key] === undefined) delete existing[key];
        delete existing.epic;
        // An item moved out from under its epic loses that parent.
        if (spec && design.parent === undefined) delete existing.parent;
        Object.assign(existing, design, { needsReview: true });
      } else {
        if (checked.has(proposal.id)) baselined.push(taskId);
        const candidates = duplicateCandidates(data, {
          ...proposal,
          id: taskId,
        });
        data.tasks.push({
          ...design,
          scope:
            plan.context.filters?.scope === "runtime" ? "runtime" : "catalog",
          kind: proposal.kind || "task",
          status: "planned",
          createdAt: now,
          needsReview: false,
          ...(checked.has(proposal.id)
            ? baselineAcceptance(checked.get(proposal.id), plan.hash, {
                at: now,
                approver,
              })
            : {}),
          ...(proposal.distinctReason && candidates.length
            ? {
                distinctFrom: Object.fromEntries(
                  candidates.map((t) => [t.id, proposal.distinctReason]),
                ),
              }
            : {}),
        });
      }
      data.edges = data.edges.filter((e) => {
        const drop = e.to === taskId && e.planId === id;
        if (drop && edgeById.get(e.id) === e) edgeById.delete(e.id);
        return !drop;
      });
      for (const kind of ["requires", "sequence", "supports"])
        for (const ref of proposal[kind] || []) {
          const from = resolveTaskId(data, mapping[ref] || ref);
          if (!known.has(from)) fail("Unknown " + kind + " reference " + ref);
          const edgeId = `${from}:${kind}:${taskId}`,
            same = edgeById.get(edgeId);
          // An edge ID is unique. Another live plan's copy of the same edge
          // stays its own; an unowned one (imported, hand-made, or from an
          // old revision that did not name it) becomes this plan's.
          if (same?.planId && same.planId !== id && livePlans.has(same.planId))
            continue;
          if (same) data.edges.splice(data.edges.indexOf(same), 1);
          const edge = {
            id: edgeId,
            from,
            to: taskId,
            kind,
            ...(kind === "requires" && proposal.conditions?.[ref]
              ? { condition: proposal.conditions[ref] }
              : {}),
            planId: id,
            reason: "Approved plan revision " + plan.hash.slice(0, 12),
          };
          data.edges.push(edge);
          edgeById.set(edgeId, edge);
        }
    }
    // Sequence edges also participate in readiness, so reject cycles across both kinds.
    const graph = new Map(),
      active = new Set(),
      seen = new Set();
    for (const e of data.edges.filter((e) =>
      ["requires", "sequence"].includes(e.kind),
    )) {
      if (!graph.has(e.from)) graph.set(e.from, []);
      graph.get(e.from).push(e.to);
    }
    const visit = (id) => {
      if (active.has(id)) fail("Dependency cycle " + id);
      if (seen.has(id)) return;
      active.add(id);
      for (const to of graph.get(id) || []) visit(to);
      active.delete(id);
      seen.add(id);
    };
    for (const task of data.tasks) visit(task.id);
    // Only a changed entry needs review again. An unchanged task keeps
    // the state it had before this draft and so keeps its ready label.
    for (const task of data.tasks) {
      const prior = before.get(task.id);
      if (!prior || task.planId !== id) continue;
      task.needsReview =
        entry(task) !== prior.entry ||
        (prior.needsReview && !held.has(task.id));
    }
    delete plan.reviewHeld;
    const previousDesignHash = data.documents[documentId]?.hash || null;
    // The category the approved revision's own front-matter names, if any
    // (Requirement 30.9): requirements.md or bugfix.md for a spec, the plan
    // text otherwise. Avoozl never makes one up.
    const category = frontMatterCategory(
      spec
        ? (plan.files?.["requirements.md"] ?? plan.files?.["bugfix.md"])
        : plan.text,
    );
    const designText =
      extracted || spec
        ? null
        : plan.text.replace(taskBlocks(), (_, json) => {
            const p = JSON.parse(json);
            return `<!-- task:${mapping[p.id]} -->\n[${p.title}](/?view=tasks&node=${mapping[p.id]})`;
          });
    if (!extracted && !spec) {
      data.documents[documentId] = {
        id: documentId,
        path: documentId,
        title: plan.title,
        text: designText,
        hash: digest(designText),
        modifiedAt: now,
        links: [],
        rawLinks: [],
        managed: true,
        plan: {
          status: "started",
          ...(category ? { category } : {}),
          taskIds: Object.values(mapping),
        },
      };
    } else {
      data.documents[documentId] = {
        id: documentId,
        path: documentId,
        title: plan.title,
        text: plan.text,
        hash: plan.hash,
        modifiedAt: now,
        links: [],
        rawLinks: [],
        managed: false,
        virtual: true,
        plan: {
          status: "started",
          ...(category ? { category } : {}),
          taskIds: Object.values(mapping),
        },
      };
    }
    // Excerpts refer to the immutable receipt. Operational links live in the
    // fenced-plan projection; extracted plans retain their exact fact anchor.
    for (const t of data.tasks.filter((t) => t.planId === id)) {
      const proposal = proposals.find((item) => mapping[item.id] === t.id);
      t.approvedSource = {
        hash: plan.hash,
        text:
          proposal?.fact?.quote ||
          plan.text
            .split("\n")
            .slice(t.source.lineStart - 1, t.source.lineEnd)
            .join("\n"),
        ...(proposal?.fact
          ? {
              factId: proposal.fact.id,
              derivation: proposal.fact.derivation,
              reasoning: proposal.fact.reasoning,
            }
          : {}),
      };
      if (!extracted && !spec) {
        t.source.lineStart = 1;
        t.source.lineEnd = designText.split("\n").length;
        t.source.hash = digest(designText);
      }
    }
    const receipt = {
      id: "approval-" + randomUUID(),
      planId: id,
      hash: plan.hash,
      source: plan.text,
      approvedBy: approver,
      evidence: evidence?.trim() || "",
      ...(baselined.length ? { baseline: baselined } : {}),
      at: now,
      mapping,
      taskIds: Object.values(mapping),
      ...(spec ? { spec, files: plan.files } : {}),
      ...(extracted
        ? {
            extractionId: extraction.id,
            facts: proposals.map((proposal) => proposal.fact).filter(Boolean),
          }
        : {}),
    };
    store.put("approvals", receipt);
    plan.state = "approved";
    // The epic this revision's front-matter names; an epic counts the plan
    // only while both sides agree (Requirement 59.2).
    if (spec) plan.epic = specEpic(plan.files);
    if (!extracted) plan.documentId = documentId;
    else plan.extractionId = extraction.id;
    plan.mapping = mapping;
    plan.approvalId = receipt.id;
    store.put("plans", plan);
    refreshEpicMembers(data, plansById(store));
    if (!extracted && !spec)
      store.db
        .prepare(
          "INSERT INTO outbox(id,path,text,expected_hash) VALUES (?,?,?,?)",
        )
        .run(receipt.id, documentId, designText, previousDesignHash);
    store.commit(data, "Approve " + plan.title, expectedRevision);
    store.event(null, "plan.approved", {
      planId: id,
      receiptId: receipt.id,
      taskIds: receipt.taskIds,
      extractionId: extraction?.id || null,
    });
    return receipt;
  });
}
