// Quick goals, the mini-spec (RC9.3, RC9.5, design D11). On Approve a quick
// goal becomes a small spec folder in the Kiro layout, so the approval pull
// request, the provenance marker and `verify-issue` need no second path.
// This builds the files in memory and writes nothing. The approval pull
// request is spec-approval.mjs openApproval, with the manifest passed as
// `extra`.
import { createHash } from "node:crypto";
import { enforceSpec, check, screenReply } from "./content-rules.mjs";
import { fence } from "./github-respond.mjs";
import { specItems } from "./spec-plans.mjs";
import { fail } from "./store.mjs";

const REMOVED = "[removed]";
const NAME_LIMIT = 80;
const oneLine = (text) => String(text).replace(/\s+/g, " ").trim();

// goal-<words>, lowercase and hyphenated, at most 80 characters. A goal with
// no letters or digits gets a name from its hash.
export function goalSlug(goal) {
  const words = String(goal)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_LIMIT - "goal-".length)
    .replace(/-+$/, "");
  return words
    ? `goal-${words}`
    : `goal-${createHash("sha256").update(String(goal)).digest("hex").slice(0, 12)}`;
}

// The prompt with private data removed (RC9.5): each line a content rule or
// the secret and path screen flags becomes "[removed]". Findings name a line,
// never the text. A set that cannot run fails closed.
export function scrubPrompt(store, goal) {
  const lines = String(goal).split("\n"),
    flagged = new Set(screenReply(goal).map((f) => f.line)),
    { findings, unavailable } = check(store, {
      boundary: "github",
      target: "quick-goal",
      text: goal,
    });
  if (unavailable.length)
    fail("Content rules are unavailable, so nothing was written.", 422);
  for (const finding of findings) flagged.add(finding.line);
  const kept = lines.map((line, i) => (flagged.has(i + 1) ? REMOVED : line));
  if (kept.every((line) => line === REMOVED || !line.trim()))
    fail("The prompt holds only private text, so nothing was written.", 422);
  return { text: kept.join("\n"), removed: flagged.size };
}

const quote = (text) => {
  const mark = fence(text);
  return [mark + "data", text, mark].join("\n");
};

function evidenceLine(evidence) {
  return evidence.measured
    ? `measured ${evidence.measured.seconds} s with \`${evidence.measured.command}\``
    : `${evidence.file}:${evidence.line}`;
}

// The files of `.kiro/specs/<name>/`, from a checked request and proposal.
// Task IDs are numbered 1..n in proposal order, and edges become `requires`.
// Content rules run over every file, so a private name from the planner is
// refused. `checks` are the repository's check commands; every leaf names
// them (a leaf with none fails lint). Returns {name, files, removed}.
export function buildMiniSpec(store, { request, proposal, checks }) {
  if (!Array.isArray(checks) || !checks.length)
    fail(
      "Name the checks that prove each task, or configure them on the repository.",
    );
  const { text: goal, removed } = scrubPrompt(store, request.goal),
    name = goalSlug(request.goal),
    key = new Map(proposal.tasks.map((t, i) => [t.id, String(i + 1)])),
    first = oneLine(
      goal.split("\n").find((l) => l.trim() && l !== REMOVED) ?? "",
    ),
    title = `Quick goal: ${first.slice(0, 80)}`,
    prompt = `Original prompt:\n\n${quote(goal)}`;
  const requirements = [
    `# Requirements: ${title}`,
    "",
    "Status: Draft",
    "",
    `Repository: ${request.repository}. Depth: ${request.depth}.`,
    removed
      ? `Private text was removed from the goal (${removed} line${removed === 1 ? "" : "s"}).`
      : "",
    "",
    "## Goal",
    "",
    quote(goal),
    "",
    "## Evidence",
    "",
    ...proposal.tasks.map(
      (t) =>
        `- ${key.get(t.id)}. ${oneLine(t.title)}: ${evidenceLine(t.evidence)}`,
    ),
    "",
  ].join("\n");
  const list = (items) =>
    items.length ? items.map((i) => `- ${oneLine(i)}`) : ["- None."];
  const design = [
    `# Design: ${title}`,
    "",
    "Status: Draft",
    "",
    "## Approach",
    "",
    ...proposal.tasks.map((t) => `- ${key.get(t.id)}. ${oneLine(t.title)}`),
    "",
    "## Order",
    "",
    ...(proposal.edges.length
      ? proposal.edges.map(
          (e) => `- ${key.get(e.from)} before ${key.get(e.to)}`,
        )
      : ["- No task waits for another."]),
    "",
    "## Batches",
    "",
    ...(proposal.batches.length
      ? proposal.batches.map(
          (b) => `- ${b.map((id) => key.get(id)).join(", ")}`,
        )
      : ["- None."]),
    "",
    "## Risks",
    "",
    ...list(proposal.risks),
    "",
    "## Questions",
    "",
    ...list(proposal.questions.map((q) => q.text)),
    "",
  ].join("\n");
  const tasks = [
    `# Tasks: ${title}`,
    "",
    "Status: Draft",
    "",
    ...proposal.tasks.map((t) => `- [ ] ${key.get(t.id)} ${oneLine(t.title)}`),
    "",
  ].join("\n");
  const manifest = { tasks: {} };
  for (const t of proposal.tasks) {
    const requires = proposal.edges
      .filter((e) => e.to === t.id)
      .map((e) => key.get(e.from));
    manifest.tasks[key.get(t.id)] = {
      kind: "leaf",
      summary: `${oneLine(t.title)}\n\nEvidence: ${evidenceLine(t.evidence)}\n\n${prompt}`,
      ...(requires.length ? { requires } : {}),
      acceptance: [
        `${oneLine(t.title)}, with the change checked against: ${evidenceLine(t.evidence)}.`,
      ],
      checks,
      completion: "integrated",
    };
  }
  const files = {
    "requirements.md": requirements,
    "design.md": design,
    "tasks.md": tasks,
    "avoozl/manifest.json": JSON.stringify(manifest, null, 2) + "\n",
  };
  enforceSpec(store, { name, files }, { mode: "refuse" });
  return { name, files, removed };
}

// The task IDs a spec's tasks.md gives, as the marker lists them.
export const quickGoalTaskIds = (spec) =>
  specItems(spec.name, spec.files["tasks.md"])
    .map((item) => item.id)
    .filter(Boolean);
