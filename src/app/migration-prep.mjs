// Migration preparation for an old workspace (design §10.2 steps 1, 3 and 4).
// Every function here reads a snapshot and returns plain data. Nothing writes
// the workspace; the caller decides where the reports go.
import { createHash } from "node:crypto";
import { canonical } from "./store.mjs";
import { blocks } from "../model.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Reports leave this machine (§10.2 step 8), so local paths are cut.
export const redactPaths = (text) =>
  String(text ?? "")
    .replace(/\/(?:Users|home)\/[^/\s`)\]]+\//g, "~/")
    .replace(/\/private\/tmp\//g, "/tmp/")
    .replace(/\/Volumes\/[^/\s`)\]]+\//g, "<volume>/")
    .replace(
      /https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?[^\s)\]]*/g,
      "<local app>",
    );

// The delivery epics: every snapshot epic that is not a catalog epic.
export function deliveryEpics(data, ids) {
  const epics = (data.epics || []).filter((e) => e.scope !== "catalog");
  return ids ? epics.filter((e) => ids.includes(e.id)) : epics;
}

export function completeStatuses(data) {
  return new Set(
    (data.statuses || []).filter((s) => s.complete).map((s) => s.id),
  );
}

// Step 3: assign `kind` without changing any ID or edge. Rules, first match:
// a stored milestone stays a milestone (it becomes a Release value, §10.1);
// a task with children is a package; an unfinished partial task is a package
// until it is reconciled (§10.1); an unfinished task that is not in review
// and has no acceptance criteria is not bounded (R5.5), so it is a package;
// everything else is a leaf.
export function migrationKinds(data, epicIds) {
  const epics = deliveryEpics(data, epicIds);
  const inEpic = new Set(epics.map((e) => e.id));
  const complete = completeStatuses(data);
  const tasks = data.tasks.filter((t) => inEpic.has(t.epic));
  const parents = new Set(tasks.map((t) => t.parentId).filter(Boolean));
  const kinds = tasks.map((t) => {
    const done = complete.has(t.status);
    const [kind, reason] =
      t.kind === "milestone"
        ? ["milestone", "stored milestone; becomes a Release value"]
        : parents.has(t.id)
          ? ["package", "has child tasks"]
          : !done && t.status === "partial"
            ? ["package", "partial; package until reconciled"]
            : !done && t.status !== "review" && !t.acceptance?.length
              ? ["package", "unfinished with no acceptance criteria"]
              : [
                  "leaf",
                  done
                    ? "finished"
                    : t.status === "review"
                      ? "in review"
                      : "bounded: has acceptance",
                ];
    return {
      id: t.id,
      epic: t.epic,
      status: t.status,
      storedKind: t.kind ?? null,
      kind,
      reason,
    };
  });
  const ids = new Set(tasks.map((t) => t.id));
  const edges = data.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind }));
  return {
    epics: epics.map((e) => ({ id: e.id, title: e.title, kind: "epic" })),
    tasks: kinds,
    edges,
  };
}

const COMMIT = /\b[0-9a-f]{9,40}\b/g;

// Step 1 of R23.2: the finished tasks become one read-only baseline. Each
// keeps its status, source pin, evidence paths, commits named in its text,
// the last activity, and a hash of its stored body so a later read can show
// the row did not change. Edges from it to unfinished tasks (from is the prerequisite) are met.
export function migrationBaseline(
  data,
  epicIds,
  { evidence = [], runs = [] } = {},
) {
  const inEpic = new Set(deliveryEpics(data, epicIds).map((e) => e.id));
  const complete = completeStatuses(data);
  const tasks = data.tasks.filter((t) => inEpic.has(t.epic));
  const done = new Set(
    tasks.filter((t) => complete.has(t.status)).map((t) => t.id),
  );
  const receipts = (id) =>
    evidence.filter((e) => e.taskId === id).map((e) => e.id);
  const ranBy = (id) =>
    runs
      .filter((r) => r.taskId === id)
      .map((r) => ({ id: r.id, state: r.state }));
  const finished = tasks
    .filter((t) => done.has(t.id))
    .map((t) => {
      const text = [
        t.summary,
        t.nextAction,
        t.notes,
        t.overview,
        t.activity?.summary,
      ]
        .filter((x) => typeof x === "string")
        .join(" ");
      return {
        id: t.id,
        epic: t.epic,
        title: t.title,
        status: t.status,
        statusAuthority: t.statusAuthority ?? null,
        source: t.source
          ? {
              document: t.source.document,
              lineStart: t.source.lineStart,
              lineEnd: t.source.lineEnd,
              hash: t.source.hash,
              checked: t.source.checked ?? null,
            }
          : null,
        evidence: t.evidence ?? [],
        receipts: receipts(t.id),
        runs: ranBy(t.id),
        commits: [...new Set(text.match(COMMIT) || [])],
        acceptance: t.acceptance ?? [],
        activity: t.activity
          ? {
              state: t.activity.state,
              branch: t.activity.branch ?? null,
              at: t.activity.finishedAt ?? t.activity.updatedAt ?? null,
            }
          : null,
        updatedAt: t.updatedAt ?? null,
        bodyHash: sha256(canonical(t)),
      };
    });
  const ids = new Set(tasks.map((t) => t.id));
  const met = data.edges
    .filter((e) => ids.has(e.to) && done.has(e.from) && !done.has(e.to))
    .map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind }));
  return { tasks: finished, metEdges: met };
}

const STOP = new Set(
  "the a an and or of to in on for with from by at is are be as it its this that into not no all each every one two only than then their them they after before until when which while use used using via per but so if do does".split(
    " ",
  ),
);
// Words of three or more letters, without commit hashes and stop words.
export function words(text) {
  return (
    String(text || "")
      .toLowerCase()
      .replace(/\b[0-9a-f]{7,40}\b/g, " ")
      .match(/[a-z][a-z0-9_]{2,}/g)
      ?.filter((w) => !STOP.has(w)) || []
  );
}

function headingPath(lines, lineStart) {
  const out = [];
  let level = 9;
  for (let i = lineStart - 1; i >= 0; i--) {
    const m = /^(#+)\s+(.*)/.exec(lines[i] || "");
    if (m && m[1].length < level) {
      out.unshift(m[2].trim());
      level = m[1].length;
      if (level === 1) break;
    }
  }
  return out;
}

// Step 4: map document-derived checklist entries onto delivery tasks.
// Matching is lexical (TF-IDF cosine over the entry's lines plus its section
// headings, against each task's title, summary, overview, notes, acceptance
// and epic title). A match is only a proposal: the owner, or a critique
// session the owner reviews, accepts it before anything is applied (§10.2).
// shortcut: lexical scoring misses reworded entries; upgrade to a critique
// session pass over the unmatched list when the owner reviews it.
export function mapChecklistEntries(
  data,
  { epicIds, entryEpics, readDocument, minScore = 0.25, minMargin = 0.05 },
) {
  const inEpic = new Set(deliveryEpics(data, epicIds).map((e) => e.id));
  const epicTitle = new Map((data.epics || []).map((e) => [e.id, e.title]));
  const complete = completeStatuses(data);
  const targets = data.tasks.filter(
    (t) => inEpic.has(t.epic) && t.kind !== "milestone",
  );
  const entries = data.tasks.filter((t) => entryEpics.includes(t.epic));
  const text = (t) =>
    [
      t.title,
      t.title,
      t.summary,
      t.overview,
      t.nextAction,
      t.notes,
      ...(t.acceptance || []),
      ...(t.tags || []),
      epicTitle.get(t.epic),
    ]
      .filter((x) => typeof x === "string")
      .join(" ");
  const bags = targets.map((t) => words(text(t)));
  const df = new Map();
  for (const bag of bags)
    for (const w of new Set(bag)) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) =>
    Math.log((targets.length + 1) / ((df.get(w) || 0) + 1)) + 1;
  const vector = (bag) => {
    const v = new Map();
    for (const w of bag) v.set(w, (v.get(w) || 0) + 1);
    let norm = 0;
    for (const [w, c] of v) {
      const x = (1 + Math.log(c)) * idf(w);
      v.set(w, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, x] of v) v.set(w, x / norm);
    return v;
  };
  const cosine = (a, b) => {
    let s = 0;
    for (const [w, x] of a) s += x * (b.get(w) || 0);
    return s;
  };
  const vectors = bags.map(vector);
  const docs = new Map();
  const lines = (p) => {
    if (!docs.has(p)) docs.set(p, readDocument(p));
    return docs.get(p);
  };
  // The document read here can be newer than the snapshot's line numbers, so
  // find each entry's block by its source key. An entry whose block is gone
  // falls back to its stored title rather than to whatever now sits there.
  const located = new Map();
  const block = (p, key) => {
    if (!located.has(p)) {
      const doc = lines(p);
      located.set(
        p,
        new Map(doc ? blocks(doc.join("\n")).map((b) => [b.key, b]) : []),
      );
    }
    return located.get(p).get(key);
  };
  const rows = entries.map((e) => {
    const src = e.source || {};
    const doc = src.document ? lines(src.document) : null;
    const b = doc && src.key ? block(src.document, src.key) : null;
    const at = b ?? (doc && !src.key ? src : null);
    const lineText = at
      ? doc
          .slice(at.lineStart - 1, at.lineEnd)
          .join(" ")
          .trim()
      : "";
    const body = lineText || [e.title, e.summary].join(" ");
    const section = at ? headingPath(doc, at.lineStart).slice(1) : [];
    const query = vector(words(body + " " + section.join(" ")));
    const scores = vectors
      .map((v, i) => ({ i, score: cosine(query, v) }))
      .sort(
        (a, b) =>
          b.score - a.score || targets[a.i].id.localeCompare(targets[b.i].id),
      );
    const candidates = scores.slice(0, 3).map(({ i, score }) => ({
      task: targets[i].id,
      epic: targets[i].epic,
      score: Math.round(score * 1000) / 1000,
    }));
    const [top, next] = candidates;
    const matched =
      top &&
      top.score >= minScore &&
      top.score - (next?.score ?? 0) >= minMargin;
    const target = matched ? targets[scores[0].i] : null;
    const open = !complete.has(e.status) && !src.checked;
    return {
      id: e.id,
      document: src.document ?? null,
      lineStart: at?.lineStart ?? src.lineStart ?? null,
      lineEnd: at?.lineEnd ?? src.lineEnd ?? null,
      located: Boolean(at),
      section: section.join(" > "),
      // Reports leave this machine (§10.2 step 8), so local paths are cut.
      text: redactPaths(lineText || e.title)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240),
      status: e.status,
      checked: src.checked ?? null,
      mergeReceipts: e.mergeReceipts ?? [],
      result: matched
        ? open && !complete.has(target.status)
          ? "acceptance"
          : "context"
        : "unmatched",
      task: target?.id ?? null,
      epic: target?.epic ?? null,
      candidates,
    };
  });
  return { entries: rows, minScore, minMargin };
}
