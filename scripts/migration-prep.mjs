#!/usr/bin/env node
// Prepare an old workspace for migration (design §10.2 steps 1, 3 and 4):
// kinds, the finished-task baseline, and the checklist mapping report.
// Reads a frozen, read-only database copy and documents at one Git commit.
// Writes only into --out.
//
//   node scripts/migration-prep.mjs --db <copy.sqlite> --docs <git dir>
//     --commit <sha> --entries <epic,...> --out <dir> [--epics <id,...>]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { Store } from "../src/app/store.mjs";
import {
  mapChecklistEntries,
  migrationBaseline,
  migrationKinds,
} from "../src/app/migration-prep.mjs";

const { values: args } = parseArgs({
  options: {
    db: { type: "string" },
    docs: { type: "string" },
    commit: { type: "string" },
    entries: { type: "string" },
    epics: { type: "string" },
    out: { type: "string" },
  },
});
for (const key of ["db", "docs", "commit", "entries", "out"])
  if (!args[key]) throw Error("--" + key + " is required");
if (!/^[0-9a-f]{40}$/.test(args.commit))
  throw Error("--commit must be a full commit hash");

const store = new Store(args.db);
// The copy must be read-only, so nothing here can write it.
if (!store.readOnly) throw Error("--db must be a read-only file");
const data = store.read();
const evidence = store.list("evidence");
const runs = store.list("runs").map((r) => ({
  id: r.id,
  taskId: r.taskId ?? r.task_id,
  state: r.state,
}));
store.close();

const epicIds = args.epics?.split(",");
const entryEpics = args.entries.split(",");
const readDocument = (file) => {
  try {
    return execFileSync(
      "git",
      ["-C", args.docs, "show", `${args.commit}:${file}`],
      {
        encoding: "utf8",
        maxBuffer: 1 << 28,
      },
    ).split("\n");
  } catch {
    return null;
  }
};

const kinds = migrationKinds(data, epicIds);
const baseline = migrationBaseline(data, epicIds, { evidence, runs });
const mapping = mapChecklistEntries(data, {
  epicIds,
  entryEpics,
  readDocument,
});

const count = (rows, key) =>
  rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
const table = (obj) =>
  Object.entries(obj)
    .sort()
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");
const source = `Source revision ${data.revision}; documents at commit \`${args.commit}\`.`;

fs.mkdirSync(args.out, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(args.out, name), text);
write("kinds.json", JSON.stringify(kinds, null, 2) + "\n");
write("baseline.json", JSON.stringify(baseline, null, 2) + "\n");
write("checklist-mapping.json", JSON.stringify(mapping, null, 2) + "\n");

write(
  "kinds.md",
  `# Migration kinds

${source} IDs and edges are copied, not changed.

| Kind | Count |
|---|---|
| epic | ${kinds.epics.length} |
${table(count(kinds.tasks, "kind"))}

| Reason | Count |
|---|---|
${table(count(kinds.tasks, "reason"))}

| Edge kind | Count |
|---|---|
${table(count(kinds.edges, "kind"))}

| Task | Epic | Status | Kind | Reason |
|---|---|---|---|---|
${kinds.tasks.map((t) => `| ${t.id} | ${t.epic} | ${t.status} | ${t.kind} | ${t.reason} |`).join("\n")}
`,
);

write(
  "baseline.md",
  `# Finished-task migration baseline

${source} ${baseline.tasks.length} finished tasks; ${baseline.metEdges.length} edges from them to unfinished tasks are met.

| Status | Count |
|---|---|
${table(count(baseline.tasks, "status"))}

| Task | Epic | Status | Evidence |
|---|---|---|---|
${baseline.tasks
  .map((t) => {
    const ev = [
      ...t.evidence,
      ...t.receipts,
      ...t.runs.map((r) => `run ${r.id} (${r.state})`),
      ...t.commits.map((c) => "`" + c + "`"),
      t.source
        ? `${t.source.document}:${t.source.lineStart}${t.source.checked ? " checked" : ""}`
        : null,
      t.activity ? `activity ${t.activity.state}` : null,
    ].filter(Boolean);
    return `| ${t.id} | ${t.epic} | ${t.status} | ${cell(ev.join("; ") || "status only (" + t.statusAuthority + ")")} |`;
  })
  .join("\n")}
`,
);

const unmatched = mapping.entries.filter((e) => e.result === "unmatched");
write(
  "checklist-mapping.md",
  `# Checklist entry mapping

${source} ${mapping.entries.length} entries; 0 new tasks. Matches are lexical proposals (score >= ${mapping.minScore}, lead >= ${mapping.minMargin}) and apply only after owner review.

| Result | Count |
|---|---|
${table(count(mapping.entries, "result"))}

| Document | Entries |
|---|---|
${table(count(mapping.entries, "document"))}

## Proposed matches

| Entry | Line | Result | Task | Score | Text |
|---|---|---|---|---|---|
${mapping.entries
  .filter((e) => e.result !== "unmatched")
  .map(
    (e) =>
      `| ${e.id} | ${e.document}:${e.lineStart} | ${e.result} | ${e.task} | ${e.candidates[0].score} | ${cell(e.text)} |`,
  )
  .join("\n")}

## Unmatched entries (${unmatched.length})

| Entry | Line | Status | Best candidates | Text |
|---|---|---|---|---|
${unmatched
  .map(
    (e) =>
      `| ${e.id} | ${e.document}:${e.lineStart} | ${e.status} | ${e.candidates.map((c) => `${c.task} ${c.score}`).join(", ")} | ${cell(e.text)} |`,
  )
  .join("\n")}
`,
);

console.log(
  JSON.stringify({
    epics: kinds.epics.length,
    tasks: kinds.tasks.length,
    kinds: count(kinds.tasks, "kind"),
    edges: count(kinds.edges, "kind"),
    baseline: baseline.tasks.length,
    metEdges: baseline.metEdges.length,
    entries: mapping.entries.length,
    results: count(mapping.entries, "result"),
  }),
);
