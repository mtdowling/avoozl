#!/usr/bin/env node
// @ts-nocheck: typing debt, see the commit message
// Writes docs/github-workflow-scenarios.md from the workflow kit's cases:
//
//   node scripts/kit/scenarios-doc.ts          write the page
//   node scripts/kit/scenarios-doc.ts --check  fail when the page is stale
//
// Each case becomes a Given / When / Then section with links to the rules it
// checks. `renderScenarios` is the same function the test calls.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probesOf, readCases } from "../../workflow-kit/load.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PAGE = "docs/github-workflow-scenarios.md";

// GitHub's anchor for a heading: lower case, punctuation dropped, spaces to
// hyphens, and `-1`, `-2` for a repeated heading.
function slugger() {
  const seen = new Map();
  return (text) => {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9 _-]/g, "")
        .replace(/ /g, "-"),
      count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  };
}

// The rule numbers of the workflow page, and the anchor of the section each
// belongs to.
export function ruleSections(workflow) {
  const slug = slugger(),
    sections = new Map();
  for (const match of workflow.matchAll(/^## (\d+)\. (.+)$/gm))
    sections.set(match[1], slug(`${match[1]}. ${match[2]}`));
  return sections;
}

export const ruleAnchor = (rule) => `rule-${rule.replace(".", "")}`;

const code = (value) =>
  `\`${typeof value === "string" ? value : JSON.stringify(value)}\``;
const list = (items) => items.map(code).join(", ");

// A step's sentence, from its `do` and arguments.
const SENTENCE = {
  next: () => "reads the ready tasks",
  claim: (step) =>
    step.task ? `claims ${code(step.task)}` : "claims the first ready task",
  readLeases: (step) => `reads the leases of ${code(step.task)}`,
  takeOver: (step) =>
    `takes over ${code(step.task)}${step.afterHours ? ` after ${step.afterHours} hours` : ""}`,
  push: (step) =>
    step.branch
      ? `pushes a change to ${code(step.branch)}`
      : `pushes work to the claim branch of ${code(step.task)}`,
  land: (step) =>
    `lands ${code(step.task)}${step.interrupt ? `, interrupted ${step.interrupt.replace("-", " ")}` : ""}`,
  recover: (step) => `recovers ${code(step.task)} after an interruption`,
  mergePr: (step) => `merges the pull request of ${code(step.task)}`,
  deleteBranch: (step) =>
    `deletes the claim branch of ${code(step.task ?? step.branch)}`,
};

const stepLine = (step, index) => {
  const { runner, do: action, expect, pause } = step,
    text = `${code(runner)} ${SENTENCE[action](step)}`,
    notes = [
      expect &&
        `expects ${Object.entries(expect)
          .map(([k, v]) => `${k} ${code(v)}`)
          .join(", ")}`,
      pause && "then waits",
    ].filter(Boolean);
  return `${index + 1}. ${text}${notes.length ? `, and ${notes.join(" and ")}` : ""}.`;
};

// What each probe of a scenario's `then` says, as a sentence.
const THEN = {
  leaseHolder: (value) =>
    Object.entries(value).map(
      ([task, who]) =>
        `The newest lease of ${code(task)} is ${who ? `${code(who)}'s` : "no one's"}.`,
    ),
  leases: (value) =>
    Object.entries(value).map(([task, generations]) =>
      generations.length
        ? `${code(task)} has the lease generations ${list(generations)}.`
        : `${code(task)} has no lease.`,
    ),
  claims: (value) =>
    Object.entries(value).map(([who, task]) =>
      task
        ? `${code(who)} holds ${code(task)}.`
        : `${code(who)} holds no task.`,
    ),
  rejectedPushes: (value) => [
    value.length
      ? `GitHub rejects the pushes of ${list(value)}.`
      : "GitHub rejects no push.",
  ],
  ticked: (value) => [
    value.length
      ? `The done branches tick ${list(value)}.`
      : "The done branches tick no task.",
  ],
  branches: (value) => [
    value.length
      ? `Origin holds the claim branches ${list(value)}.`
      : "Origin holds no claim branch.",
  ],
  pullRequests: (value) =>
    Object.entries(value).map(
      ([head, pull]) =>
        `The pull request from ${code(head)} is ${pull.state}${pull.mergedBy ? `, merged by ${code(pull.mergedBy)}${pull.verified ? " with a verified signature" : ""}` : ""}.`,
    ),
  ready: (value) => [
    value.length ? `The ready tasks are ${list(value)}.` : "No task is ready.",
  ],
};

const taskLines = (text) =>
  text
    .split("\n")
    .filter((line) => /^\s*- \[[ x~-]\] /.test(line) && !/^\s{2,}/.test(line));

// The sections of one case.
function givenOf(testCase) {
  const out = [],
    { runner, origin = {} } = testCase;
  if (testCase.runners)
    for (const [name, login] of Object.entries(testCase.runners))
      out.push(`Runner ${code(name)} acts as ${code(login)}.`);
  else out.push(`The runner acts as ${code(runner.login)}.`);
  out.push(
    `The default branch is ${code(runner.defaultBranch)}${runner.specsBranch ? `, and the specs branch is ${code(runner.specsBranch)}` : ""}.`,
  );
  if (runner.staleHours)
    out.push(`A claim or lease is stale after ${runner.staleHours} hours.`);
  if (origin.branches?.length)
    out.push(`Origin holds the branches ${list(origin.branches)}.`);
  if (origin.behind?.length)
    out.push(
      `Origin's ${list(origin.behind)} lacks the default branch's head.`,
    );
  if (testCase.landing)
    out.push(
      `The landing mode is ${code(testCase.landing.mode)}${testCase.landing.pr ? ` with ${code(testCase.landing.pr)} pull requests` : ""}.`,
    );
  if (testCase.repository?.deleteBranchOnMerge)
    out.push("GitHub deletes a pull request's head branch when it merges.");
  for (const [spec, who] of Object.entries(testCase.issues ?? {}))
    out.push(`The issue of spec ${code(spec)} is assigned to ${list(who)}.`);
  for (const spec of testCase.stops ?? [])
    out.push(`The issue of spec ${code(spec)} has a stop label.`);
  const extras = [
    ["writers", testCase.writers],
    ["approvers", testCase.approvers],
    ["approvalTrust", testCase.approvalTrust],
    ["history", testCase.history?.map(({ files: _files, ...rest }) => rest)],
    ["leases", origin.leases],
    ["claimAgeHours", origin.claimAgeHours],
    ["graph", origin.graph],
    ["heads", origin.heads],
    ["taskFiles", origin.taskFiles],
    ["mergedPullHeads", origin.mergedPullHeads],
    ["land", testCase.land],
    ["push", testCase.push],
    ["revision", testCase.revision],
    ["manual", testCase.manual],
    ["actions", testCase.actions],
    ["resume", testCase.resume],
    ["issueList", testCase.issueList],
  ];
  for (const [key, value] of extras)
    if (value !== undefined) out.push(`${code(key)} is ${code(value)}.`);
  return out;
}

function specBlocks(testCase) {
  const blocks = [];
  for (const [file, text] of Object.entries(testCase.files).sort())
    if (file.endsWith("tasks.md") && taskLines(text).length)
      blocks.push(
        `The tasks of ${code(file.replace(/^\.kiro\/specs\//, "").replace(/\/tasks\.md$/, ""))}:`,
        "",
        "```markdown",
        ...taskLines(text),
        "```",
      );
  return blocks;
}

function thenOf(testCase) {
  const out = [];
  for (const [probe, value] of Object.entries(probesOf(testCase))) {
    const lines = THEN[probe]?.(value) ?? [
      `Probe ${code(probe)} is ${code(value)}.`,
    ];
    for (const line of lines)
      out.push(
        testCase.expectFail?.[probe]
          ? `${line} Avoozl does not pass this yet.`
          : line,
      );
  }
  return out;
}

const WHEN_PROBES = (testCase) =>
  `The runner answers ${list(Object.keys(probesOf(testCase)))}.`;

export function renderScenarios(cases, workflow) {
  const sections = ruleSections(workflow),
    slug = slugger(),
    anchors = new Map(),
    ruleCases = new Map(),
    scenarios = cases.filter((item) => item.steps),
    snapshots = cases.filter((item) => !item.steps),
    first = scenarios.find((item) => item.then.claims);
  // Anchors follow the order the headings are written in.
  for (const testCase of [...scenarios, ...snapshots])
    anchors.set(testCase.name, slug(testCase.title));
  for (const testCase of cases)
    for (const rule of testCase.rules) {
      if (!ruleCases.has(rule)) ruleCases.set(rule, []);
      ruleCases.get(rule).push(testCase);
    }
  const link = (rule) =>
    `[${rule}](github-workflow.md#${sections.get(rule.split(".")[0])})`;
  const out = [
    "# Workflow scenarios",
    "",
    "Each scenario states what runners are given, what they do, and what must be",
    "true afterward. The [workflow kit](../workflow-kit/README.md) runs every one",
    "of them, and `npm run kit:docs` writes this page from the kit's cases.",
    "",
    "A scenario is a list of steps, as the kit stores it:",
    "",
    "```json",
    JSON.stringify(
      {
        steps: first.steps.slice(0, 4).map(({ expect, ...rest }) => rest),
        then: { claims: first.then.claims },
      },
      null,
      2,
    ),
    "```",
    "",
    "The steps and their arguments are in the [adapter contract](../workflow-kit/README.md#adapter-contract).",
    "A case under Cases holds the state a runner read and the answers it gave,",
    "so it has no steps.",
    "",
    "## Scenarios",
  ];
  const render = (testCase) => {
    out.push(
      "",
      `### ${testCase.title}`,
      "",
      `Rules: ${testCase.rules.map(link).join(", ")}. Case: ${code(testCase.name)}.`,
      "",
      "Given",
      "",
      ...givenOf(testCase).map((line) => `- ${line}`),
      ...(specBlocks(testCase).length ? ["", ...specBlocks(testCase)] : []),
      "",
      "When",
      "",
    );
    if (testCase.steps) out.push(...testCase.steps.map(stepLine));
    else out.push(`- ${WHEN_PROBES(testCase)}`);
    out.push("", "Then", "", ...thenOf(testCase).map((line) => `- ${line}`));
  };
  for (const testCase of scenarios) render(testCase);
  out.push("", "## Cases");
  for (const testCase of snapshots) render(testCase);
  out.push("", "## Rules");
  const byRule = [...ruleCases.keys()].sort((a, b) => {
    const [x, y] = [a, b].map((rule) => rule.split(".").map(Number));
    return x[0] - y[0] || x[1] - y[1];
  });
  for (const rule of byRule) {
    out.push("", `### Rule ${rule}`, "");
    for (const testCase of ruleCases.get(rule))
      out.push(`- [${testCase.title}](#${anchors.get(testCase.name)})`);
  }
  return `${out.join("\n")}\n`;
}

export const pagePath = path.join(root, PAGE);

export function currentPage() {
  return renderScenarios(
    readCases(),
    fs.readFileSync(path.join(root, "docs/github-workflow.md"), "utf8"),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const text = currentPage();
  if (process.argv.includes("--check")) {
    if (
      !fs.existsSync(pagePath) ||
      fs.readFileSync(pagePath, "utf8") !== text
    ) {
      console.error(`${PAGE} is stale. Run npm run kit:docs.`);
      process.exit(1);
    }
  } else fs.writeFileSync(pagePath, text);
}
