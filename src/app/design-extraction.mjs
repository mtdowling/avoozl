import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";

export const FACT_KINDS = Object.freeze([
  "task",
  "acceptance",
  "dependency",
  "constraint",
  "resource",
  "decision",
  "non-goal",
  "risk",
  "rollout",
  "validation",
]);

const derivations = new Set(["stated", "inferred", "absent"]);
const dispositions = new Set(["accepted", "reused", "edited", "rejected"]);
const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "for",
  "from",
  "into",
  "not",
  "that",
  "the",
  "this",
  "with",
]);

export function normalizeFactText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:]+$/g, "")
    .trim();
}

export function factIdentity({ kind, quote = "", text }) {
  return (
    "fact-" +
    digest(`${kind}\0${quote}\0${normalizeFactText(text)}`).slice(0, 20)
  );
}

export function resolveFactAnchor(text, quote) {
  const first = text.indexOf(quote);
  if (first < 0) fail(`Fact quote was not found in the design: ${quote}`);
  if (text.indexOf(quote, first + quote.length) >= 0)
    fail(`Fact quote is ambiguous in the design: ${quote}`);
  return {
    lineStart: text.slice(0, first).split("\n").length,
    lineEnd: text.slice(0, first + quote.length).split("\n").length,
  };
}

function planRevision(store, planId, revisionHash) {
  const plan = store.get("plans", planId);
  if (!plan || plan.deletedAt) fail("Plan not found.", 404);
  if (plan.hash !== revisionHash)
    fail("Extraction must name the current exact design revision.", 409);
  return plan;
}

function wordTerms(value) {
  return new Set(
    normalizeFactText(value)
      .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
      .split(/\s+/)
      .filter((term) => term.length >= 3 && !stopWords.has(term)),
  );
}

function sharedTerms(left, right) {
  const terms = wordTerms(right);
  return [...wordTerms(left)].filter((term) => terms.has(term));
}

function coverageCandidate(fact, kind, id, title, body, extra = {}) {
  const shared = sharedTerms(
    `${fact.text}\n${fact.quote || ""}`,
    `${title}\n${body}`,
  );
  if (shared.length < 2) return null;
  return {
    targetKind: kind,
    targetId: id,
    title,
    score: Math.min(70, shared.length * 8),
    reasons: [
      {
        code: "shared-terms",
        detail: `Shares terms: ${shared.slice(0, 8).join(", ")}.`,
        weight: Math.min(70, shared.length * 8),
      },
    ],
    advisory: true,
    ...extra,
  };
}

function codeCoverage(store, fact, projectId) {
  const project = projectId ? store.get("projects", projectId) : null;
  if (!project?.root || !fs.existsSync(project.root)) return [];
  const sought = [...wordTerms(`${fact.text}\n${fact.quote || ""}`)]
    .filter((term) => term.length >= 5)
    .slice(0, 6);
  if (!sought.length) return [];
  const ignored = new Set([".git", ".avoozl", "node_modules", "dist", "build"]);
  const found = [];
  let visited = 0;
  function walk(directory) {
    if (found.length >= 8 || visited >= 300) return;
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= 8 || visited >= 300) break;
      if (ignored.has(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(filename);
        continue;
      }
      if (!entry.isFile()) continue;
      visited++;
      let stat;
      try {
        stat = fs.statSync(filename);
      } catch {
        continue;
      }
      if (stat.size > 250_000) continue;
      let text;
      try {
        text = fs.readFileSync(filename, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      const line = lines.findIndex((value) => {
        const lower = value.toLowerCase();
        return sought.filter((term) => lower.includes(term)).length >= 2;
      });
      if (line >= 0)
        found.push({
          targetKind: "code",
          targetId: path.relative(project.root, filename),
          title: path.relative(project.root, filename),
          score: 20,
          reasons: [
            {
              code: "code-terms",
              detail:
                "Nearby source contains distinctive terms. Code is the weakest coverage signal.",
              weight: 20,
            },
          ],
          file: path.relative(project.root, filename),
          line: line + 1,
          signal: "weak",
          advisory: true,
        });
    }
  }
  walk(project.root);
  return found;
}

export function factCoverage(store, fact, { projectId } = {}) {
  if (fact.kind !== "task") return [];
  const data = store.read();
  const candidates = [
    ...data.tasks
      .filter(
        (task) => !projectId || !task.projectId || task.projectId === projectId,
      )
      .map((task) =>
        coverageCandidate(
          fact,
          "task",
          task.id,
          task.title,
          [task.summary, task.acceptance, task.nextAction].flat().join("\n"),
          { projectId: task.projectId || null },
        ),
      ),
    ...store
      .list("plans")
      .filter((plan) => plan.id !== fact.planId && !plan.deletedAt)
      .map((plan) =>
        coverageCandidate(
          fact,
          "plan",
          plan.id,
          plan.title,
          `${plan.prompt || ""}\n${plan.text || ""}`,
        ),
      ),
    ...store
      .list("github_queue_items")
      .filter((item) => ["issue", "pull-request"].includes(item.kind))
      .filter(
        (item) => !projectId || !item.projectId || item.projectId === projectId,
      )
      .map((item) =>
        coverageCandidate(
          fact,
          item.kind,
          item.id,
          item.title,
          `${item.summary || ""}\n${item.body || ""}`,
          { repository: item.repository, url: item.url || null },
        ),
      ),
    ...codeCoverage(store, fact, projectId),
  ];
  return candidates
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score || left.title.localeCompare(right.title),
    )
    .slice(0, 12);
}

function normalizeFact(plan, extraction, input, previous) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Each extracted fact must contain an object.");
  const kind = String(input.kind || "");
  if (!FACT_KINDS.includes(kind)) fail(`Unknown extracted fact kind ${kind}.`);
  const text = String(input.text || "").trim();
  if (!text || text.length > 10_000)
    fail("Each extracted fact needs concise text.");
  const derivation = input.derivation || "stated";
  if (!derivations.has(derivation))
    fail("Choose stated, inferred, or absent derivation.");
  const quote = input.quote === undefined ? "" : String(input.quote);
  if (derivation === "absent" && quote)
    fail("An absent fact cannot cite a passage.");
  if (derivation !== "absent" && !quote.trim())
    fail("A stated or inferred fact must cite an exact passage.");
  if (derivation === "inferred" && !String(input.reasoning || "").trim())
    fail("An inferred fact must explain its reasoning.");
  const anchor = quote ? resolveFactAnchor(plan.text, quote) : {};
  const id = factIdentity({ kind, quote, text });
  return {
    id,
    planId: plan.id,
    revisionHash: extraction.revisionHash,
    kind,
    text,
    quote: quote || null,
    ...anchor,
    derivation,
    reasoning:
      derivation === "inferred" ? String(input.reasoning).trim() : null,
    relatesTo: input.relatesTo ?? null,
    taskLocalId:
      typeof input.taskLocalId === "string" && input.taskLocalId.trim()
        ? input.taskLocalId.trim()
        : null,
    dependencyKind: ["requires", "sequence", "supports"].includes(
      input.dependencyKind,
    )
      ? input.dependencyKind
      : null,
    status: previous?.status || "accepted",
    taskId: previous?.taskId || null,
    edit: previous?.edit || null,
    extractionIds: [
      ...new Set([...(previous?.extractionIds || []), extraction.id]),
    ],
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createExtraction(
  store,
  { planId, revisionHash, projectId = null, sequence = [], parentRunId = null },
) {
  const plan = planRevision(store, planId, revisionHash);
  const previous = store
    .list("extractions")
    .filter(
      (entry) =>
        entry.planId === plan.id &&
        ["completed", "approved"].includes(entry.state),
    )
    .sort((left, right) =>
      String(right.endedAt || right.updatedAt || right.createdAt).localeCompare(
        String(left.endedAt || left.updatedAt || left.createdAt),
      ),
    )[0];
  const extraction = {
    id: "extraction-" + randomUUID(),
    planId: plan.id,
    revisionHash: plan.hash,
    projectId,
    parentRunId,
    sequence,
    state: "running",
    rounds: [],
    factIds: [],
    previousFactIds: previous?.factIds || [],
    withdrawnFactIds: [],
    runIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.put("extractions", extraction);
  store.event(null, "plan.extraction.started", {
    extractionId: extraction.id,
    planId: plan.id,
    revisionHash: plan.hash,
  });
  return extraction;
}

export function completeExtraction(store, id, stopReason) {
  const extraction = store.get("extractions", id);
  if (!extraction) fail("Extraction not found.", 404);
  extraction.state = "completed";
  extraction.stopReason = stopReason;
  extraction.endedAt = new Date().toISOString();
  extraction.withdrawnFactIds = (extraction.previousFactIds || []).filter(
    (factId) => !extraction.factIds.includes(factId),
  );
  extraction.updatedAt = extraction.endedAt;
  store.put("extractions", extraction);
  store.event(null, "plan.extraction.completed", {
    extractionId: extraction.id,
    planId: extraction.planId,
    facts: extraction.factIds.length,
    withdrawn: extraction.withdrawnFactIds.length,
  });
  return extraction;
}

export function submitExtraction(
  store,
  {
    extractionId,
    revisionHash,
    facts,
    provider,
    model,
    runId,
    complete = false,
  },
) {
  const extraction = store.get("extractions", extractionId);
  if (!extraction) fail("Extraction not found.", 404);
  if (!["running", "completed"].includes(extraction.state))
    fail(`Extraction is ${extraction.state}.`, 409);
  if (extraction.revisionHash !== revisionHash)
    fail("Extraction submission names another design revision.", 409);
  const plan = planRevision(store, extraction.planId, revisionHash);
  if (!Array.isArray(facts) || facts.length > 250)
    fail("Submit a list of at most 250 extracted facts.");
  const roundIds = [];
  let newFacts = 0;
  store.transaction(() => {
    for (const input of facts) {
      const provisionalId = factIdentity({
        kind: input?.kind,
        quote: input?.quote || "",
        text: input?.text,
      });
      const previous = store.get("plan_facts", provisionalId);
      const fact = normalizeFact(plan, extraction, input, previous);
      fact.coverage = factCoverage(store, fact, {
        projectId: extraction.projectId,
      });
      if (!extraction.factIds.includes(fact.id)) newFacts++;
      store.put("plan_facts", fact);
      roundIds.push(fact.id);
    }
    extraction.factIds = [...new Set([...extraction.factIds, ...roundIds])];
    extraction.rounds.push({
      index: extraction.rounds.length + 1,
      provider: provider || null,
      model: model || null,
      runId: runId || null,
      factIds: roundIds,
      facts: roundIds.length,
      newFacts,
      gaps: roundIds.filter(
        (id) => store.get("plan_facts", id)?.derivation === "absent",
      ).length,
      completedAt: new Date().toISOString(),
    });
    extraction.runIds = [
      ...new Set([...extraction.runIds, ...(runId ? [runId] : [])]),
    ];
    extraction.updatedAt = new Date().toISOString();
    store.put("extractions", extraction);
    store.event(runId || null, "plan.extraction.submitted", {
      extractionId,
      planId: plan.id,
      round: extraction.rounds.length,
      facts: roundIds.length,
      newFacts,
    });
  });
  if (complete || (extraction.rounds.length > 1 && newFacts === 0))
    completeExtraction(
      store,
      extractionId,
      newFacts === 0
        ? "The latest round found no new facts."
        : "The extractor marked the fact set complete.",
    );
  return getExtraction(store, extractionId);
}

export function getExtraction(store, id) {
  const extraction = store.get("extractions", id);
  if (!extraction) fail("Extraction not found.", 404);
  const plan = store.get("plans", extraction.planId);
  const occurrences = new Map();
  for (const round of extraction.rounds || [])
    for (const factId of new Set(round.factIds || []))
      occurrences.set(factId, (occurrences.get(factId) || 0) + 1);
  const withdrawn = new Set(extraction.withdrawnFactIds || []);
  const facts = [...new Set([...extraction.factIds, ...withdrawn])]
    .map((factId) => store.get("plan_facts", factId))
    .filter(Boolean)
    .map((fact) => ({
      ...fact,
      occurrences: occurrences.get(fact.id) || 0,
      withdrawn: withdrawn.has(fact.id),
      stale: plan?.hash !== extraction.revisionHash,
    }))
    .sort(
      (left, right) =>
        left.occurrences - right.occurrences ||
        FACT_KINDS.indexOf(left.kind) - FACT_KINDS.indexOf(right.kind) ||
        left.lineStart - right.lineStart ||
        left.id.localeCompare(right.id),
    );
  return {
    ...extraction,
    stale: !plan || plan.hash !== extraction.revisionHash,
    facts,
    gaps: facts.filter((fact) => fact.derivation === "absent"),
  };
}

export function disposeFact(
  store,
  { extractionId, factId, status, edit, taskId },
) {
  const extraction = store.get("extractions", extractionId);
  if (!extraction || !extraction.factIds.includes(factId))
    fail("Extraction fact not found.", 404);
  if (!dispositions.has(status))
    fail("Choose accepted, reused, edited, or rejected.");
  const fact = store.get("plan_facts", factId);
  if (status === "reused") {
    if (!taskId || !store.read().tasks.some((task) => task.id === taskId))
      fail("Choose an existing task to reuse.", 409);
    fact.taskId = taskId;
  } else fact.taskId = null;
  if (status === "edited") {
    if (!edit || typeof edit !== "object" || !String(edit.text || "").trim())
      fail("An edited fact needs replacement text.");
    fact.edit = { ...edit, text: String(edit.text).trim() };
  } else fact.edit = null;
  fact.status = status;
  fact.updatedAt = new Date().toISOString();
  store.put("plan_facts", fact);
  store.event(null, "plan.extraction.fact.disposed", {
    extractionId,
    factId,
    status,
    taskId: fact.taskId,
  });
  return fact;
}

function localTaskId(fact) {
  if (fact.taskLocalId && /^[a-z][a-z0-9-]{2,60}$/.test(fact.taskLocalId))
    return fact.taskLocalId;
  const slug = normalizeFactText(fact.edit?.text || fact.text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  return `${slug || "derived-task"}-${fact.id.slice(-6)}`;
}

function relatedIds(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function relatesToFact(candidate, fact) {
  const references = relatedIds(candidate.relatesTo);
  return (
    references.includes(fact.id) ||
    (fact.taskLocalId && references.includes(fact.taskLocalId))
  );
}

export function proposalsFromFacts(store, extractionId) {
  const extraction = getExtraction(store, extractionId);
  if (extraction.stale) fail("The extracted design revision is stale.", 409);
  const active = extraction.facts.filter(
    (fact) =>
      !fact.withdrawn &&
      fact.derivation !== "absent" &&
      ["accepted", "edited", "reused"].includes(fact.status),
  );
  const taskFacts = active.filter((fact) => fact.kind === "task");
  const localByFact = new Map();
  for (const fact of taskFacts) {
    const local = localTaskId(fact);
    localByFact.set(fact.id, local);
    if (fact.taskLocalId) localByFact.set(fact.taskLocalId, local);
  }
  return taskFacts.map((fact) => {
    const id = localByFact.get(fact.id);
    const acceptance = active
      .filter(
        (candidate) =>
          candidate.kind === "acceptance" && relatesToFact(candidate, fact),
      )
      .map((candidate) => candidate.edit?.text || candidate.text);
    if (!acceptance.length)
      fail(
        `Extracted task "${fact.text}" needs at least one acceptance fact.`,
        409,
      );
    const proposal = {
      id,
      title: fact.edit?.text || fact.text,
      summary: fact.reasoning || fact.text,
      acceptance,
      requires: [],
      sequence: [],
      supports: [],
      tags: active
        .filter(
          (candidate) =>
            ["constraint", "decision", "risk", "rollout"].includes(
              candidate.kind,
            ) && relatesToFact(candidate, fact),
        )
        .map(
          (candidate) =>
            `${candidate.kind}:${normalizeFactText(candidate.text).slice(0, 80)}`,
        ),
      resources: active
        .filter(
          (candidate) =>
            candidate.kind === "resource" && relatesToFact(candidate, fact),
        )
        .map((candidate) => candidate.edit?.text || candidate.text),
      taskId: fact.status === "reused" ? fact.taskId : undefined,
      lineStart: fact.lineStart,
      lineEnd: fact.lineEnd,
      fact: {
        id: fact.id,
        quote: fact.quote,
        derivation: fact.derivation,
        reasoning: fact.reasoning,
      },
    };
    for (const dependency of active.filter(
      (candidate) => candidate.kind === "dependency",
    )) {
      const relation =
        dependency.relatesTo && typeof dependency.relatesTo === "object"
          ? dependency.relatesTo
          : null;
      if (!relation || relation.to !== fact.id) continue;
      const from = localByFact.get(relation.from) || relation.from;
      const kind = dependency.dependencyKind || relation.kind || "requires";
      if (["requires", "sequence", "supports"].includes(kind))
        proposal[kind].push(from);
    }
    return proposal;
  });
}

export function extractionPrompt({ plan, extraction, round }) {
  return `Extract executable work from this exact design revision.

Plan: ${plan.id}
Revision: ${plan.hash}
Extraction: ${extraction.id}
Round: ${round}

Return only material facts. Give every task a stable taskLocalId and use that value in acceptance relatesTo fields and dependency endpoints. Every stated or inferred fact must quote one exact, unique passage from the supplied design. Never invent missing acceptance criteria: report them as absent facts. Inferred facts require reasoning. Do not approve, edit, or publish the design.

Use plans_submit_extraction once with:
{"input":{"extractionId":"${extraction.id}","revisionHash":"${plan.hash}","facts":[{"kind":"task|acceptance|dependency|constraint|resource|decision|non-goal|risk|rollout|validation","taskLocalId":"stable ID on task facts","text":"derived statement","quote":"exact unique passage, omitted only for absent","derivation":"stated|inferred|absent","reasoning":"required for inferred","relatesTo":"taskLocalId or relationship object using taskLocalIds","dependencyKind":"requires|sequence|supports"}],"complete":false}}`;
}
