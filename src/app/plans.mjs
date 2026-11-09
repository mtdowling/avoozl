import { resolveTaskId, requireDistinctTask } from "../task-identity.mjs";
import { randomUUID } from "node:crypto";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";

export const PLAN_TEMPLATE = (prompt) =>
  `# ${prompt.split("\n")[0].slice(0, 140)}\n\n## Intent\n\n${prompt}\n\n## Design\n\nDescribe the outcome, scope, alternatives, and decisions here.\n\n## Proposed work\n\nAdd one task block per deliverable. These remain proposals until this document revision is approved.\n\n\`\`\`task\n${JSON.stringify({ id: "first-deliverable", title: "Define the first deliverable", summary: "Describe the resulting behavior.", acceptance: ["Define an observable acceptance check."], requires: [], tags: [] }, null, 2)}\n\`\`\`\n`;
export const PLAN_FORMAT =
  "Write one Markdown plan, including design and proposed work. Describe each proposed task in a fenced task block containing a JSON object: {id,title,summary,acceptance:[strings],requires:[local IDs or existing global task IDs],sequence:[IDs],supports:[IDs],tags:[strings],resources:[shared resource names],epic,track,taskId:optional existing canonical ID,distinctReason:optional separate-scope explanation}. Only id,title,acceptance are required. No tasks are executable before revision approval. Never approve your own plan. Return the Markdown plan as your final response.";
export function extractPlan(markdown) {
  const proposals = [];
  let match;
  const re = /^```task\s*\r?\n([\s\S]*?)^```\s*$/gm;
  while ((match = re.exec(markdown))) {
    let item;
    try {
      item = JSON.parse(match[1]);
    } catch {
      fail("A task block contains invalid JSON.");
    }
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(item.id || ""))
      fail("Each task needs a stable lowercase local ID.");
    if (
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 240
    )
      fail("Each task needs a title of 1–240 characters.");
    if (
      !Array.isArray(item.acceptance) ||
      !item.acceptance.length ||
      item.acceptance.some((x) => typeof x !== "string" || !x.trim())
    )
      fail("Each proposed task needs observable acceptance criteria.");
    for (const field of [
      "requires",
      "sequence",
      "supports",
      "tags",
      "resources",
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
      "epic",
      "track",
      "taskId",
      "distinctReason",
    ])
      if (item[field] !== undefined && typeof item[field] !== "string")
        fail(field + " must be text.");
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
export function savePlan(store, { id, text, expectedHash }) {
  return store.transaction(() => {
    const plan = store.get("plans", id);
    if (!plan) fail("Plan not found.", 404);
    if (plan.hash !== expectedHash)
      fail("This draft changed. Reload before saving.", 409);
    if (typeof text !== "string" || text.length > 1000000)
      fail("Plan text is required.");
    plan.history.push({
      revision: plan.revision,
      hash: plan.hash,
      text: plan.text,
      at: plan.updatedAt,
      state: plan.state,
    });
    plan.revision++;
    plan.text = text;
    plan.hash = digest(text);
    plan.title = text.match(/^# (.+)$/m)?.[1] || plan.title;
    plan.state = "draft";
    plan.updatedAt = new Date().toISOString();
    store.put("plans", plan);
    if (plan.documentId) {
      const data = structuredClone(store.read());
      for (const task of data.tasks.filter((t) => t.planId === id))
        task.needsReview = true;
      store.commit(data, "Review amended design: " + plan.title);
    }
    store.event(null, "plan.changed", { planId: id, hash: plan.hash });
    return plan;
  });
}
// The two inputs that keep the graph correct are the hashes. Who approved is
// recorded from the workspace's operator when the caller does not say, and
// approval notes are kept only when a caller has something real to add: a
// required field containing a fixed sentence carries less than an absent one.
export function approvePlan(
  store,
  { id, expectedHash, expectedRevision, approvedBy, evidence, operator },
) {
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
    const proposals = extractPlan(plan.text),
      mapping = Object.fromEntries(
        proposals.map((t) => [
          t.id,
          resolveTaskId(
            data,
            t.taskId || plan.mapping?.[t.id] || `${id}-${t.id}`,
          ),
        ]),
      );
    if (new Set(Object.values(mapping)).size !== proposals.length)
      fail(
        "Use one task block per canonical deliverable; combine repeated references.",
      );
    const documentId = `workspace/plans/${id}.md`,
      now = new Date().toISOString(),
      known = new Set([
        ...data.tasks.map((t) => t.id),
        ...Object.values(mapping),
      ]);
    const oldMapping = plan.mapping || {};
    for (const oldId of Object.keys(oldMapping))
      if (!mapping[oldId])
        fail(
          "Removing an approved task requires explicitly retiring it before this amendment.",
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
      const epic =
        proposal.epic ||
        plan.context.filters?.epic ||
        contextTask?.epic ||
        "inbox";
      if (epic === "inbox" && !data.epics.some((e) => e.id === epic))
        data.epics.push({
          id: epic,
          title: "Inbox",
          scope: "catalog",
          color: "#96abc1",
        });
      if (
        !data.epics.some((e) => e.id === epic) &&
        !data.documents[epic.replace(/^doc:/, "")]
      )
        fail("Unknown epic " + epic);
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
        epic,
        track,
        tags: proposal.tags || [],
        resources: proposal.resources || [],
        planId: id,
        planHash: plan.hash,
        contextDocuments: [documentId],
        source: {
          document: documentId,
          key: proposal.id,
          lineStart: proposal.lineStart,
          lineEnd: proposal.lineEnd,
          hash: digest(
            plan.text
              .split("\n")
              .slice(proposal.lineStart - 1, proposal.lineEnd)
              .join("\n"),
          ),
        },
        statusAuthority: "database",
        updatedAt: now,
      };
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
      } else if (existing)
        Object.assign(existing, design, { needsReview: true });
      else {
        const candidates = requireDistinctTask(data, {
          ...proposal,
          id: taskId,
        });
        data.tasks.push({
          ...design,
          scope:
            plan.context.filters?.scope === "runtime" ? "runtime" : "catalog",
          kind: "task",
          status: "planned",
          createdAt: now,
          needsReview: false,
          ...(proposal.distinctReason
            ? {
                distinctFrom: Object.fromEntries(
                  candidates.map((t) => [t.id, proposal.distinctReason]),
                ),
              }
            : {}),
        });
      }
      data.edges = data.edges.filter(
        (e) => !(e.to === taskId && e.planId === id),
      );
      for (const kind of ["requires", "sequence", "supports"])
        for (const ref of proposal[kind] || []) {
          const from = resolveTaskId(data, mapping[ref] || ref);
          if (!known.has(from)) fail("Unknown " + kind + " reference " + ref);
          data.edges.push({
            id: `${from}:${kind}:${taskId}`,
            from,
            to: taskId,
            kind,
            planId: id,
            reason: "Approved plan revision " + plan.hash.slice(0, 12),
          });
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
    const previousDesignHash = data.documents[documentId]?.hash || null;
    const designText = plan.text.replace(
      /^```task\s*\r?\n([\s\S]*?)^```\s*$/gm,
      (_, json) => {
        const p = JSON.parse(json);
        return `<!-- task:${mapping[p.id]} -->\n[${p.title}](/?view=tasks&node=${mapping[p.id]})`;
      },
    );
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
        category: "Approved plans",
        taskIds: Object.values(mapping),
      },
    };
    // Excerpts refer to the immutable receipt. Operational links live in the design projection.
    for (const t of data.tasks.filter((t) => t.planId === id)) {
      t.approvedSource = {
        hash: plan.hash,
        text: plan.text
          .split("\n")
          .slice(t.source.lineStart - 1, t.source.lineEnd)
          .join("\n"),
      };
      t.source.lineStart = 1;
      t.source.lineEnd = designText.split("\n").length;
      t.source.hash = digest(designText);
    }
    const receipt = {
      id: "approval-" + randomUUID(),
      planId: id,
      hash: plan.hash,
      source: plan.text,
      // Provenance of which workspace minted these tasks, which is useful if
      // planning records are ever brought together from more than one source.
      approvedBy: approvedBy?.trim() || operator?.trim() || null,
      // Only a caller's own words. What is informative at approval time — the
      // reviewed hash, the revision, the proposals — is already on this
      // receipt and in the database it commits.
      ...(evidence?.trim() ? { evidence: evidence.trim() } : {}),
      at: now,
      mapping,
      taskIds: Object.values(mapping),
    };
    store.put("approvals", receipt);
    plan.state = "approved";
    plan.documentId = documentId;
    plan.mapping = mapping;
    plan.approvalId = receipt.id;
    store.put("plans", plan);
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
    });
    return receipt;
  });
}
