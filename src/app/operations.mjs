import { resolveTaskId, requireDistinctTask } from "../task-identity.mjs";
import {
  duplicateAudit,
  duplicateCandidates,
  mergeTasks,
} from "./task-dedup.mjs";
import { randomUUID } from "node:crypto";
import { queryTasks, statusComplete, digest, validate } from "../model.mjs";
import { captureTask } from "../capture.mjs";
import { applyActivity } from "../activity.mjs";
import { applyPlanMetadata, planSummaries } from "../plan-model.mjs";
import { auditPlans, dispatchMcp } from "../mcp.mjs";
import { fail, canonical } from "./store.mjs";
import {
  runPage,
  taskSessions,
  planPage,
  pendingRequests,
  compactEvent,
  recentIntegrations,
} from "./views.mjs";
import { createPlan, savePlan, approvePlan } from "./plans.mjs";
import { projectConfig, validateRun, integrateRun } from "./git.mjs";
import { Batches } from "./batches.mjs";
import { metrics } from "./telemetry.mjs";
import { taskSignals, isPlanInventory } from "../workbench-model.mjs";
import { ExternalSessions } from "./external-sessions.mjs";
import { listExamples, seedExample } from "./examples.mjs";
import { describeWorkspace } from "./client.mjs";

export class Operations {
  constructor(store, { manager = null, externalSessions } = {}) {
    this.store = store;
    this.manager = manager;
    this.externalSessions = externalSessions || new ExternalSessions(store);
    this.batches =
      manager && !manager.remote ? new Batches(store, manager) : null;
    this.pendingIntents = new Map();
  }
  read() {
    return this.store.read();
  }
  detail(id) {
    const data = this.read(),
      requestedId = id;
    id = resolveTaskId(data, id);
    const task = data.tasks.find((t) => t.id === id);
    if (!task) fail("Task not found.", 404);
    const doc = data.documents[task.source?.document];
    return {
      ...task,
      ...(requestedId !== id ? { requestedId } : {}),
      context:
        task.approvedSource?.text ||
        (doc
          ? doc.text
              .split("\n")
              .slice(task.source.lineStart - 1, task.source.lineEnd)
              .join("\n")
          : ""),
      relationships: data.edges.filter((e) => e.from === id || e.to === id),
      documents: (task.contextDocuments || [])
        .map((id) => data.documents[id])
        .filter(Boolean),
      runs: this.store
        .list("runs")
        .filter((r) => resolveTaskId(data, r.taskId) === id),
      evidenceRecords: this.store
        .list("evidence")
        .filter((e) => resolveTaskId(data, e.taskId) === id),
    };
  }
  intentResult(receipt) {
    const run = receipt.runId ? this.store.get("runs", receipt.runId) : null,
      plan = receipt.planId ? this.store.get("plans", receipt.planId) : null,
      task = receipt.taskId
        ? this.read().tasks.find(
            (t) => t.id === resolveTaskId(this.read(), receipt.taskId),
          )
        : null,
      needsRun =
        receipt.input.action !== "task" &&
        !(
          receipt.input.action === "draft" &&
          (!receipt.input.provider || !receipt.input.projectId)
        );
    return {
      ...(run ? { run } : {}),
      ...(plan ? { plan } : {}),
      ...(task ? { task } : {}),
      ...(needsRun && !run
        ? {
            pending: true,
            submissionId: receipt.submissionId,
            runId: receipt.runId,
          }
        : {}),
    };
  }
  async submitIntent(input, expectedRevision) {
    if (
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 20000
    )
      fail("Write a message.");
    const action = input.action || "task";
    if (!["task", "draft", "ask", "run"].includes(action))
      fail("Choose task, draft, ask or run.");
    const submissionId = input.submissionId || randomUUID(),
      id = "intent:" + submissionId,
      requestHash = digest(
        canonical({
          action,
          prompt: input.prompt,
          provider: input.provider,
          projectId: input.projectId,
          model: input.model,
          approvalMode: input.approvalMode,
        }),
      );
    let receipt = this.store.get("receipts", id);
    if (receipt && receipt.requestHash !== requestHash)
      fail(
        "This submission belongs to a different message. Start a new message.",
        409,
      );
    if (receipt) {
      const result = this.intentResult(receipt);
      if (!result.pending) return result;
    }
    if (this.pendingIntents.has(id)) return this.pendingIntents.get(id);
    const execute = async () => {
      if (!receipt) {
        receipt = {
          id,
          submissionId,
          requestHash,
          input: structuredClone({ ...input, submissionId }),
          runId: input.runId || "run-" + digest(submissionId).slice(0, 24),
          createdAt: new Date().toISOString(),
        };
        this.store.put("receipts", receipt);
      }
      const saved = receipt.input;
      const legacy = this.store.get("runs", receipt.runId);
      if (legacy) {
        if (
          legacy.prompt !== saved.prompt ||
          legacy.provider !== saved.provider ||
          legacy.projectId !== saved.projectId
        )
          fail("Run ID already belongs to another request.", 409);
        return this.intentResult(receipt);
      }
      if (action === "task") {
        const { task } = await this.execute(
          "task.capture",
          saved,
          expectedRevision,
        );
        receipt.taskId = task.id;
        this.store.put("receipts", receipt);
        return { task };
      }
      if (action === "draft") {
        const plan = createPlan(this.store, {
          ...saved,
          id: "plan-" + digest(submissionId).slice(0, 12),
        });
        receipt.planId = plan.id;
        this.store.put("receipts", receipt);
        if (!saved.provider || !saved.projectId) return { plan };
      }
      let taskId = resolveTaskId(this.read(), saved.context?.selected);
      if (!this.read().tasks.some((t) => t.id === taskId)) taskId = undefined;
      if (action === "run" && !taskId) {
        const { task } = await this.execute(
          "task.capture",
          saved,
          expectedRevision,
        );
        taskId = task.id;
        receipt.taskId = taskId;
        this.store.put("receipts", receipt);
      }
      const run = await this.manager.start({
        id: receipt.runId,
        ...(receipt.planId ? { planId: receipt.planId } : {}),
        ...(taskId ? { taskId } : {}),
        mode:
          action === "ask" ? "ask" : action === "draft" ? "plan" : "implement",
        provider: saved.provider,
        projectId: saved.projectId,
        model: saved.model,
        approvalMode: saved.approvalMode,
        prompt: saved.prompt,
        context: saved.context,
        title: saved.prompt.split("\n")[0].slice(0, 160),
        background: true,
      });
      receipt.acceptedAt = new Date().toISOString();
      this.store.put("receipts", receipt);
      return {
        ...(receipt.planId
          ? { plan: this.store.get("plans", receipt.planId) }
          : {}),
        run,
      };
    };
    const pending = execute();
    this.pendingIntents.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.pendingIntents.get(id) === pending)
        this.pendingIntents.delete(id);
    }
  }
  async execute(name, input = {}, expectedRevision) {
    const store = this.store;
    if (name === "client.describe")
      return describeWorkspace(store, { manager: this.manager });
    if (name === "workspace.examples") return listExamples();
    if (name === "workspace.seed")
      return seedExample(store, input, expectedRevision);
    if (
      ["task.update", "activity", "task.accept", "task.sessions"].includes(name)
    )
      input = { ...input, id: resolveTaskId(this.read(), input.id) };
    if (input.taskId)
      input = { ...input, taskId: resolveTaskId(this.read(), input.taskId) };
    if (name === "task.duplicates")
      return input.title
        ? {
            items: duplicateCandidates(this.read(), input, {
              similar: true,
              limit: input.limit,
            }),
          }
        : duplicateAudit(this.read(), input);
    if (name === "task.merge")
      return mergeTasks(store, input, expectedRevision);
    if (name === "task.merge.get") {
      const receipt = store.get("evidence", input.id);
      if (receipt?.kind !== "task-merge") fail("Merge receipt not found.", 404);
      return receipt;
    }
    if (
      [
        "run.send",
        "run.interrupt",
        "run.resume",
        "run.approvals",
        "run.answer",
        "run.model",
        "run.unsend",
        "run.queue",
        "run.validate",
        "integration.merge",
      ].includes(name)
    ) {
      const id =
        name === "run.answer"
          ? store.get("requests", input.id)?.runId
          : input.id;
      if (id && store.get("runs", id)?.external)
        fail(
          "This is a read-only external transcript. Continue or steer it in its original Claude session; no duplicate agent will be launched.",
          409,
        );
    }
    if (name === "session.discover")
      return this.externalSessions.discover(input);
    if (name === "session.register")
      return this.externalSessions.register(input);
    if (
      this.manager?.remote &&
      [
        "models",
        "run.start",
        "run.send",
        "run.interrupt",
        "run.resume",
        "run.approvals",
        "run.answer",
        "run.model",
        "run.unsend",
        "run.queue",
        "run.validate",
        "integration.merge",
        "batch.start",
        "batch.control",
      ].includes(name)
    )
      return this.manager.command(name, input);
    if (name === "state") return this.read();
    if (name === "publication.retry") return { retryRequested: true };
    if (name === "metrics") return metrics(store, input);
    if (name === "models") return this.manager.models(input.provider);
    if (name === "query")
      return queryTasks(this.read(), { scope: "all", ...input });
    if (name === "search.prompt") {
      if (
        typeof input.prompt !== "string" ||
        !input.prompt.trim() ||
        input.prompt.length > 20000
      )
        fail("Describe the tasks to find.");
      if (!input.submissionId) fail("A search submission ID is required.");
      const data = this.read(),
        vocabulary = {
          statuses: data.statuses.map((s) => ({
            id: s.id,
            label: s.label,
            complete: s.complete,
          })),
          epics: data.epics.map((e) => ({ id: e.id, title: e.title })),
          tracks: data.tracks.map((t) => ({ id: t.id, label: t.label })),
          queryKeys: [
            "status",
            "scope",
            "epic",
            "track",
            "tag",
            "id",
            "kind",
            "ready",
            "inflight",
            "activity",
            "owner",
            "depends",
            "unblocks",
            "neighbors",
          ],
        };
      const prompt =
        'NUPP_PROMPT_SEARCH\nInterpret this task search using current evidence. Use read-only plans query/context tools as needed. Do not change tasks, plans, files or presentations. Return ONLY a JSON object {"query":"supported query terms","scope":"all or runtime","explanation":"brief interpretation"}. For a union that cannot be expressed by the AND query grammar, return {"query":"","scope":"all","ids":["exact existing task IDs"],"explanation":"..."}; at most 500 IDs. Empty ids means no results. Plain words match text. status:remaining excludes complete statuses. Repeated tags mean all those tags. Do not invent task IDs or statuses.\nVocabulary: ' +
        JSON.stringify(vocabulary) +
        "\nCurrent context: " +
        JSON.stringify(input.context || {}) +
        "\nUser search: " +
        input.prompt;
      const result = await this.execute("intent.submit", {
        ...input,
        action: "ask",
        prompt,
        context: {},
        runId: "run-search-" + digest(input.submissionId).slice(0, 12),
      });
      const run = store.get("runs", result.run.id);
      run.searchContext = input.context;
      run.searchPrompt = input.prompt;
      store.put("runs", run);
      return run;
    }
    if (name === "search.result") {
      const run = store.get("runs", input.id);
      if (!run || !run.prompt?.startsWith("NUPP_PROMPT_SEARCH"))
        fail("Prompt search not found.", 404);
      if (
        ["starting", "running", "waiting-input", "waiting-approval"].includes(
          run.state,
        )
      )
        return { pending: true, id: run.id };
      if (run.state !== "completed")
        fail(run.error || "Search stopped. Inspect its session in Workspace.");
      const row = store.db
        .prepare(
          "SELECT body FROM events WHERE run_id=? AND kind='message' ORDER BY seq DESC LIMIT 1",
        )
        .get(run.id);
      const text = row ? JSON.parse(row.body).text : "";
      let parsed;
      try {
        parsed = JSON.parse(
          text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, ""),
        );
      } catch {
        fail(
          "The agent did not return a valid search. Its response is retained in Agent sessions.",
        );
      }
      if (
        typeof parsed.query !== "string" ||
        parsed.query.length > 4000 ||
        !["all", "runtime"].includes(parsed.scope)
      )
        fail("The agent returned an unsupported query.");
      const ids = parsed.ids;
      if (
        ids !== undefined &&
        (!Array.isArray(ids) ||
          ids.length > 500 ||
          ids.some((id) => !this.read().tasks.some((t) => t.id === id)))
      )
        fail("The search contains unknown or excessive task IDs.");
      const id = "search-" + run.id,
        existing = this.read().presentation?.views?.find((v) => v.id === id);
      if (existing) return { view: existing, explanation: existing.caption };
      const query = ids?.length === 0 ? "id:__no_matches__" : parsed.query,
        view = {
          id,
          title: "Search: " + (run.searchPrompt || "Tasks").slice(0, 100),
          caption: String(
            parsed.explanation || "Agent-interpreted search",
          ).slice(0, 2000),
          view: [
            "tasks",
            "activity",
            "graph",
            "epics",
            "strip",
            "report",
            "documents",
          ].includes(run.searchContext?.view)
            ? run.searchContext.view
            : "tasks",
          filters: { scope: parsed.scope, q: query },
          taskIds: ids || [],
          selected: "",
          group: run.searchContext?.group || "epic",
          detail: "all",
          createdAt: new Date().toISOString(),
          searchRunId: run.id,
        };
      store.mutate("Save prompt search", (data) => {
        data.presentation ??= { views: [] };
        data.presentation.views ??= [];
        data.presentation.views.push(view);
      });
      return { view, explanation: view.caption };
    }
    if (name === "task.get") return this.detail(input.id);
    if (["run.archive", "run.unarchive"].includes(name))
      return store.transaction(() => {
        const run = store.get("runs", input.id);
        if (!run || run.deletedAt) fail("Conversation not found.", 404);
        const key = "runArchive:" + run.id,
          old = store.getMeta(key),
          archivedAt =
            name === "run.archive" ? old || new Date().toISOString() : null;
        if (old !== archivedAt) {
          store.setMeta(key, archivedAt);
          store.event(run.id, name, { id: run.id, archivedAt });
        }
        return { id: run.id, archivedAt };
      });
    if (
      ["run.delete", "plan.delete", "run.restore", "plan.restore"].includes(
        name,
      )
    )
      return store.transaction(() => {
        const kind = name.startsWith("run.") ? "runs" : "plans",
          row = store.get(kind, input.id);
        if (!row) fail("Record not found.", 404);
        if (
          kind === "runs" &&
          ["starting", "running", "waiting-input", "waiting-approval"].includes(
            row.state,
          )
        )
          fail("Stop this session before deleting it.", 409);
        if (
          kind === "plans" &&
          (row.state === "approved" || Object.keys(row.mapping || {}).length)
        )
          fail(
            "Approved plans keep their task and approval history. Abandon the linked work instead.",
            409,
          );
        if (name.endsWith(".restore")) delete row.deletedAt;
        else row.deletedAt = new Date().toISOString();
        store.put(kind, row);
        store.event(kind === "runs" ? row.id : null, name, { id: row.id });
        return { id: row.id, deletedAt: row.deletedAt || null };
      });
    if (name === "trash")
      return {
        runs: store
          .list("runs")
          .filter((r) => r.deletedAt)
          .slice(-100)
          .map((r) => ({
            id: r.id,
            title: r.title || r.prompt?.slice(0, 160) || r.id,
          })),
        plans: store
          .list("plans")
          .filter((p) => p.deletedAt)
          .slice(-100)
          .map((p) => ({ id: p.id, title: p.title })),
      };
    if (name === "run.list") return runPage(store, input);
    if (name === "task.sessions") {
      const task = this.read().tasks.find((t) => t.id === input.id);
      if (!task) fail("Task not found.", 404);
      return taskSessions(store, {
        taskId: task.id,
        sessionId: task.activity?.connection?.runId || task.activity?.sessionId,
      });
    }
    if (name === "plan.list") return planPage(store, input);
    if (name === "document.get") {
      const doc = this.read().documents[input.id];
      if (!doc) fail("Document not found.", 404);
      return doc;
    }
    if (name === "workspace") {
      const runs = runPage(store, { archived: "all" }),
        plans = planPage(store);
      return {
        mode: store.getMeta("mode"),
        import: store.getMeta("import"),
        revision: this.read().revision,
        publication: {
          pending: store.db
            .prepare(
              "SELECT id,path,state FROM outbox WHERE state<>'published' LIMIT 100",
            )
            .all(),
          last: store.getMeta("publication") || [],
        },
        plans: plans.items,
        planTotal: plans.total,
        runs: runs.items,
        runTotal: runs.total,
        requests: pendingRequests(store),
        batches: store.list("batches").slice(0, 40),
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready")
          .slice(0, 40),
        recentIntegrations: recentIntegrations(store),
        projects: store.list("projects"),
        agentHost: this.manager?.remote
          ? await this.manager.status()
          : { connected: true },
        providers: (await this.manager?.providers()) || [],
        audit: auditPlans(this.read()),
        lastEvent: store.db
          .prepare("SELECT COALESCE(MAX(seq),0) seq FROM events")
          .get().seq,
      };
    }
    if (name === "task.capture")
      return store.mutate(
        "Capture prompt",
        (data) => captureTask(data, input),
        expectedRevision,
      );
    if (name === "intent.submit")
      return this.submitIntent(input, expectedRevision);
    if (name === "intent.get") {
      const receipt = store.get("receipts", "intent:" + input.submissionId);
      if (!receipt) fail("Submission not found.", 404);
      return this.intentResult(receipt);
    }
    if (name === "task.update")
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
              epic: "inbox",
              track: "catalog",
              tags: [],
            };
            if (!data.epics.some((e) => e.id === "inbox"))
              data.epics.push({
                id: "inbox",
                title: "Inbox",
                scope: "catalog",
              });
            data.tasks.push(task);
          }
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
            "epic",
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
          ])
            if (Object.hasOwn(input, key)) task[key] = input[key];
          if (
            typeof task.title !== "string" ||
            !task.title.trim() ||
            task.title.length > 240
          )
            fail("Title must contain 1–240 characters.");
          for (const key of ["summary", "notes", "nextAction", "owner"])
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
          if (
            !data.epics.some((e) => e.id === task.epic) &&
            !data.documents[task.epic.replace(/^doc:/, "")]
          )
            fail("Unknown epic.");
          if (input.requires !== undefined) {
            if (
              !Array.isArray(input.requires) ||
              input.requires.some((x) => typeof x !== "string")
            )
              fail("Requires must contain task IDs.");
            data.edges = data.edges.filter(
              (e) => e.to !== task.id || e.kind !== "requires",
            );
            for (const from of new Set(
              input.requires.map((id) => resolveTaskId(data, id)),
            ))
              data.edges.push({
                id: `${from}:requires:${task.id}`,
                from,
                to: task.id,
                kind: "requires",
                reason: "Authored task dependency.",
              });
          }
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
    if (name === "activity")
      return store.mutate(
        "Report activity",
        (data) => applyActivity(data, input),
        expectedRevision,
      );
    if (name === "plan.classify")
      return store.mutate(
        "Classify " + input.id,
        (data) => {
          applyPlanMetadata(data, input.id, input);
          return data.documents[input.id];
        },
        expectedRevision,
      );
    if (name === "document.update")
      return store.mutate(
        "Edit " + input.id,
        (data) => {
          const doc = data.documents[input.id];
          if (!doc) fail("Document not found.", 404);
          if (doc.hash !== input.expectedHash) fail("Document changed.", 409);
          if (typeof input.text !== "string" || input.text.length > 1000000)
            fail("Document text is required.");
          const oldHash = doc.hash;
          doc.text = input.text;
          doc.hash = digest(input.text);
          doc.modifiedAt = new Date().toISOString();
          for (const task of data.tasks.filter(
            (t) =>
              t.source?.document === doc.id ||
              t.contextDocuments?.includes(doc.id),
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
    if (name === "plan.create") return createPlan(store, input);
    if (name === "plan.save") return savePlan(store, input);
    if (name === "plan.get") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      return {
        ...plan,
        approvals: store.list("approvals").filter((a) => a.planId === plan.id),
      };
    }
    if (name === "plan.approve")
      return approvePlan(store, {
        ...input,
        expectedRevision: input.expectedRevision ?? expectedRevision,
      });
    if (name === "project.configure") {
      const project = await projectConfig(input);
      return store.put("projects", project);
    }
    if (name === "run.start") return this.manager.start(input);
    if (name === "run.send") return this.manager.send(input);
    if (name === "run.interrupt")
      return this.manager.interrupt(input.id, { reason: input.reason });
    if (name === "run.resume") return this.manager.resume(input);
    if (name === "run.approvals") return this.manager.approvals(input);
    if (name === "run.answer") return this.manager.answer(input);
    if (name === "run.model") return this.manager.setModel(input);
    if (name === "run.unsend") return this.manager.cancelDelivery(input);
    if (name === "run.queue") return this.manager.reorderQueue(input);
    if (name === "run.event") {
      const row = store.db
        .prepare("SELECT * FROM events WHERE seq=? AND run_id=?")
        .get(input.seq, input.id);
      if (!row) fail("Event not found.", 404);
      return {
        seq: row.seq,
        kind: row.kind,
        at: row.at,
        ...JSON.parse(row.body),
      };
    }
    if (name === "run.get") {
      const run = store.get("runs", input.id);
      if (!run) fail("Run not found.", 404);
      run.archivedAt = store.getMeta("runArchive:" + run.id);
      if (run.external) return this.externalSessions.get(run, input);
      const events = store.events({
          runId: run.id,
          after: input.after || 0,
          before: input.before,
          latest: input.after === undefined,
          limit: input.limit || 200,
        }),
        first = events[0]?.seq || 0;
      return {
        ...run,
        events: input.compact ? events.map(compactEvent) : events,
        hasEarlier: Boolean(
          first &&
            store.db
              .prepare("SELECT 1 FROM events WHERE run_id=? AND seq<? LIMIT 1")
              .get(run.id, first),
        ),
        deliveries: store.db
          .prepare(
            "SELECT body FROM deliveries WHERE run_id=? ORDER BY rowid DESC LIMIT 100",
          )
          .all(run.id)
          .map((r) => JSON.parse(r.body))
          .reverse(),
        requests: store.db
          .prepare(
            "SELECT body FROM requests WHERE json_extract(body,'$.runId')=? AND json_extract(body,'$.state')='pending' ORDER BY rowid LIMIT 100",
          )
          .all(run.id)
          .map((r) => JSON.parse(r.body)),
      };
    }
    if (name === "run.validate") return validateRun(store, input.id);
    if (name === "batch.start") return this.batches.start(input);
    if (name === "batch.control") return this.batches.control(input);
    if (name === "integration.merge") {
      const entry = await integrateRun(store, input);
      await this.manager?.landed(entry.runId);
      return entry;
    }
    if (name === "task.accept")
      return store.mutate(
        "Accept " + input.id,
        (data) => {
          const task = data.tasks.find((t) => t.id === input.id);
          if (!task) fail("Task not found.", 404);
          if (!input.evidence?.trim()) fail("Acceptance evidence is required.");
          if (!task.integration && !input.componentOnly)
            fail("Record integration before whole-head acceptance.");
          task.acceptanceEvidence = {
            at: new Date().toISOString(),
            evidence: input.evidence,
            componentOnly: Boolean(input.componentOnly),
          };
          task.status = input.componentOnly ? "implemented" : "accepted";
          return task;
        },
        expectedRevision,
      );
    if (name === "handoff") {
      const run = store.get("runs", input.id);
      if (run)
        return {
          run,
          task: this.read().tasks.find((t) => t.id === run.taskId) || null,
          plan: run.planId ? store.get("plans", run.planId) : null,
          requests: store.list("requests").filter((r) => r.runId === run.id),
          deliveries: store
            .list("deliveries")
            .filter((d) => d.runId === run.id),
          evidence: store.list("evidence").filter((e) => e.runId === run.id),
          reconnect:
            "Inspect durable state and uncertain delivery receipts before resuming. Keep the same provider session ID; never start duplicate work because a check-in is stale.",
        };
      const task = this.detail(input.id);
      return {
        task,
        design: task.documents,
        prerequisites: task.relationships
          .filter((e) => e.to === task.id)
          .map((e) => this.read().tasks.find((t) => t.id === e.from)),
        runs: task.runs,
        evidence: task.evidenceRecords,
        nextAction: task.nextAction,
        policy:
          "Task evidence, integration and acceptance are separate. Preserve existing worktrees and do not open GitHub issues.",
      };
    }
    if (name === "queue") {
      const data = this.read(),
        active = store
          .list("runs")
          .filter((r) =>
            [
              "starting",
              "running",
              "waiting-input",
              "waiting-approval",
            ].includes(r.state),
          ),
        ready = queryTasks(data, {
          scope: "all",
          ...input,
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
          conflicts: active
            .filter(
              (r) =>
                resolveTaskId(data, r.taskId) === t.id ||
                (r.resources || []).some((x) =>
                  (t.resources || []).includes(x),
                ),
            )
            .map((r) => r.id),
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
          active: active.length,
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
        active,
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready"),
      };
    }
    if (name === "legacy.mcp")
      return dispatchMcp(
        input.message,
        {
          read: () => this.read(),
          commit: (next, summary) =>
            store.transaction(() => store.commit(next, summary, next.revision)),
          base: input.base,
        },
        { versionHeader: input.versionHeader },
      );
    fail("Unknown operation " + name, 404);
  }
}
