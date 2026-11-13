#!/usr/bin/env node
// Reconcile an old workspace before cutover (design §10.2 steps 5–7):
// partial-task evidence and verdicts, broad-task decomposition, and the
// evidence of runs the old host left open. Reads a frozen, read-only database
// copy, documents at one Git commit, a code repository's refs, the 6.2 and
// 6.4 reports, and the planner's proposal files. Writes only into --out.
//
//   node scripts/migration-reconcile.mjs --db <copy.sqlite> --docs <git dir>
//     --commit <sha> --code <git dir> --refs <name=ref,...> --prep <dir>
//     --reconcile <proposals.json> --decompose <proposals.json>
//     [--drained <scratch.sqlite>] [--present <json>] [--epics <id,...>]
//     [--branch-prefixes <prefix,...>]
//     --out <dir>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { Store } from "../src/app/store.mjs";
import {
  DRAIN_STATES,
  applyProposals,
  broadScope,
  partialEvidence,
  runEvidence,
} from "../src/app/migration-reconcile.mjs";

const { values: args } = parseArgs({
  options: {
    db: { type: "string" },
    docs: { type: "string" },
    commit: { type: "string" },
    code: { type: "string" },
    refs: { type: "string" },
    prep: { type: "string" },
    reconcile: { type: "string" },
    decompose: { type: "string" },
    drained: { type: "string" },
    present: { type: "string" },
    epics: { type: "string" },
    "branch-prefixes": { type: "string" },
    out: { type: "string" },
  },
});
for (const key of [
  "db",
  "docs",
  "commit",
  "code",
  "refs",
  "prep",
  "reconcile",
  "decompose",
  "out",
])
  if (!args[key]) throw Error("--" + key + " is required");
if (!/^[0-9a-f]{40}$/.test(args.commit))
  throw Error("--commit must be a full commit hash");

const store = new Store(args.db);
if (!store.readOnly) throw Error("--db must be a read-only file");
const data = store.read();
const runs = store.list("runs");
const events = [];
for (const r of runs.filter((r) => DRAIN_STATES.includes(r.state))) {
  let after = 0;
  for (;;) {
    const page = store.events({ runId: r.id, after, limit: 1000 });
    if (!page.length) break;
    events.push(...page);
    after = page.at(-1).seq;
  }
}
const deliveries = store.list("deliveries");
store.close();

// Archive marks the old host wrote into its own scratch copy (step 7).
const archived = {};
if (args.drained) {
  const drained = new Store(args.drained);
  for (const r of runs) {
    const at = drained.getMeta("runArchive:" + r.id);
    if (at) archived[r.id] = at;
  }
  drained.close();
}

const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const kinds = json(path.join(args.prep, "kinds.json"));
const mapping = json(path.join(args.prep, "checklist-mapping.json"));
const git = (dir, ...argv) => {
  try {
    return execFileSync("git", ["-C", dir, ...argv], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};
const readDocument = (file) =>
  git(args.docs, "show", `${args.commit}:${file}`)?.split("\n") ?? null;
const refs = Object.fromEntries(args.refs.split(",").map((p) => p.split("=")));
const known = new Map();
const commitRefs = (sha) => {
  if (!known.has(sha)) {
    const full = git(
      args.code,
      "rev-parse",
      "--verify",
      "-q",
      sha + "^{commit}",
    )?.trim();
    known.set(
      sha,
      full
        ? Object.entries(refs)
            .filter(
              ([, ref]) =>
                git(args.code, "merge-base", "--is-ancestor", full, ref) !==
                null,
            )
            .map(([name]) => name)
        : null,
    );
  }
  return known.get(sha);
};
const branchExists = (name) =>
  git(
    args.code,
    "rev-parse",
    "--verify",
    "-q",
    "refs/remotes/origin/" + name,
  ) !== null ||
  git(args.code, "rev-parse", "--verify", "-q", "refs/heads/" + name) !== null;

const existingIds = data.tasks.map((t) => t.id);
const partial = partialEvidence(data, {
  epicIds: args.epics?.split(","),
  runs: runs.map((r) => ({
    id: r.id,
    taskId: r.taskId ?? r.task_id,
    state: r.state,
  })),
  mapping,
  readDocument,
  commitRefs,
  branchExists,
  branchPrefixes: (args["branch-prefixes"] || "").split(",").filter(Boolean),
});
const reconciliation = applyProposals(partial, json(args.reconcile).proposals, {
  verdicts: ["complete-pending-acceptance", "partial", "stale"],
  existingIds,
});
const broad = broadScope(data, kinds, { mapping });
const decomposition = applyProposals(broad, json(args.decompose).proposals, {
  verdicts: ["leaf", "package", "hold"],
  existingIds: [...existingIds, ...reconciliation.leaves.map((l) => l.id)],
});
const drain = runEvidence(data, {
  runs,
  events,
  deliveries,
  archived,
  commitRefs,
  present: args.present ? json(args.present) : {},
});
const errors = [...reconciliation.errors, ...decomposition.errors];
fs.mkdirSync(args.out, { recursive: true });
// The planner reads these to write its proposals; they are kept with them.
fs.writeFileSync(
  path.join(args.out, "partial-evidence.json"),
  JSON.stringify(partial, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(args.out, "broad-scope.json"),
  JSON.stringify(broad, null, 2) + "\n",
);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const count = (rows, key) =>
  rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
const table = (obj) =>
  Object.entries(obj)
    .sort()
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
const cell = (s) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
const source = `Source revision ${data.revision}; documents at commit \`${args.commit}\`; code refs ${Object.entries(
  refs,
)
  .map(
    ([n, r]) =>
      `${n} = \`${git(args.code, "rev-parse", r)?.trim().slice(0, 12)}\``,
  )
  .join(", ")}.`;
const commitCell = (cs) => {
  const by = (pred) => cs.filter(pred).length;
  return `${cs.length} named: ${by((c) => c.refs.length)} on a kept ref, ${by((c) => c.resolved && !c.refs.length)} unmerged, ${by((c) => !c.resolved)} do not resolve`;
};
const leafRows = (leaves) =>
  leaves
    .map(
      (l) =>
        `| ${l.id} | ${cell(l.title)} | ${cell(l.acceptance.join(" / "))} | ${l.entries.join(", ")} |`,
    )
    .join("\n");

fs.mkdirSync(args.out, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(args.out, name), text);
write("reconciliation.json", JSON.stringify(reconciliation, null, 2) + "\n");
write("decomposition.json", JSON.stringify(decomposition, null, 2) + "\n");
write("drain.json", JSON.stringify({ runs: drain }, null, 2) + "\n");

write(
  "reconciliation.md",
  `# Partial-task reconciliation (proposal)

${source} ${reconciliation.rows.length} partial tasks; ${reconciliation.leaves.length} proposed remaining leaves. Every verdict is a planner proposal for owner review; none is applied.

| Verdict | Count |
|---|---|
${table(count(reconciliation.rows, "verdict"))}

| Task | Epic | Verdict | Commits | Branches | Reason |
|---|---|---|---|---|---|
${reconciliation.rows
  .map(
    (r) =>
      `| ${r.id} | ${r.epic} | ${r.verdict} | ${commitCell(r.commits)} | ${r.branches.map((b) => `${b.name} ${b.exists ? "kept" : "gone"}`).join(", ") || "none"} | ${cell(r.reason)}${r.acceptance.length ? " Check: " + cell(r.acceptance.join(" / ")) : ""} |`,
  )
  .join("\n")}

## Proposed remaining leaves

| Leaf | Title | Acceptance | Checklist entries |
|---|---|---|---|
${leafRows(reconciliation.leaves)}

## Commit-like words on no kept ref

A word here does not resolve to a commit on a kept ref: a commit only on a deleted branch or in an archive, or a digest that is not a commit.

| Task | Commits |
|---|---|
${reconciliation.rows
  .filter((r) => r.commits.some((c) => !c.refs.length))
  .map(
    (r) =>
      `| ${r.id} | ${r.commits
        .filter((c) => !c.refs.length)
        .map(
          (c) =>
            "`" +
            c.sha +
            "`" +
            (c.resolved ? " unmerged" : " does not resolve"),
        )
        .join(", ")} |`,
  )
  .join("\n")}
`,
);

write(
  "decomposition.md",
  `# Broad-task decomposition (proposal)

${source} ${decomposition.rows.length} unfinished packages that are not partial; ${decomposition.leaves.length} proposed leaves. Only leaves can become ready. Every row is a planner proposal for owner review; none is applied.

| Verdict | Count |
|---|---|
${table(count(decomposition.rows, "verdict"))}

| Task | Epic | Status | Verdict | Leaves | Reason |
|---|---|---|---|---|---|
${decomposition.rows
  .map(
    (r) =>
      `| ${r.id} | ${r.epic} | ${r.status} | ${r.verdict} | ${r.leaves.length || (r.verdict === "leaf" ? "itself" : 0)} | ${cell(r.reason)}${r.acceptance.length ? " Acceptance: " + cell(r.acceptance.join(" / ")) : ""} |`,
  )
  .join("\n")}

## Proposed leaves

| Leaf | Title | Acceptance | Checklist entries |
|---|---|---|---|
${leafRows(decomposition.leaves)}
`,
);

write(
  "drain.md",
  `# Old-host run drain

${source} ${drain.length} runs were open in the old host (${Object.entries(
    count(drain, "state"),
  )
    .map(([k, v]) => `${v} ${k}`)
    .join(", ")}).

| Run | Task | Task status | State | Ended as | Transcript | Worktree | Archived in old host |
|---|---|---|---|---|---|---|---|
${drain
  .map(
    (r) =>
      `| ${r.id} | ${r.taskId} | ${r.taskStatus ?? "none"} | ${r.state} | ${r.endedAs ?? "-"} | ${r.transcriptPresent === null ? "-" : r.transcriptPresent ? "present" : "gone"} | ${r.worktreePresent === null ? "-" : r.worktreePresent ? "present" : "gone"} | ${r.archivedAt ?? "no"} |`,
  )
  .join("\n")}

${drain
  .map(
    (r) => `## ${r.id}

- Task: ${r.taskId} (${r.taskStatus ?? "no task"}); ${r.provider ?? "-"} ${r.mode ?? ""}${r.external ? ", external observation" : ""}; created ${r.createdAt}; last event ${r.lastEventAt ?? "none"}
- Branch: ${r.branch ?? r.activity?.branch ?? "none"}
${r.activity ? `- Task activity: ${r.activity.state}: ${cell(r.activity.summary)}\n` : ""}${r.commits.length ? `- Commits: ${r.commits.map((c) => "`" + c.sha + "` " + (c.refs.join("+") || (c.resolved ? "unmerged" : "missing"))).join(", ")}\n` : ""}${r.prompt ? `- Prompt: ${cell(r.prompt)}\n` : ""}${r.deliveries.map((d) => `- Owner message (${d.state}): ${cell(d.text)}\n`).join("")}${r.messages.map((m) => `- ${m.at}: ${cell(m.text)}\n`).join("")}`,
  )
  .join("\n")}`,
);

console.log(
  JSON.stringify({
    partial: reconciliation.rows.length,
    verdicts: count(reconciliation.rows, "verdict"),
    remainingLeaves: reconciliation.leaves.length,
    broad: decomposition.rows.length,
    decomposition: count(decomposition.rows, "verdict"),
    newLeaves: decomposition.leaves.length,
    drained: count(drain, "state"),
  }),
);
