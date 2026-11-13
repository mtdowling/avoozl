// Task 28.1 and part of 28.7: the prompt registry, locked sections, local
// override versions with revert, and override drift (design §4.18, R68,
// R70.5). Only temporary config folders; nothing Avoozl ships is written.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  LOCKED_SECTIONS,
  OUTRANK_LINE,
  PROMPT_TARGETS,
  approveSection,
  joinSections,
  overridesPath,
  parseSections,
  promptState,
  rebasePrompt,
  revertPrompt,
  sectionDiffProblem,
  seedOverrides,
  shippedPrompts,
} from "../prompts.mjs";
import { unifiedDiff } from "../text-diff.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const shipped = shippedPrompts();

test("each built-in prompt is named sections that join back to its text, with locked guards", () => {
  for (const target of PROMPT_TARGETS) {
    const sections = parseSections(shipped[target], target);
    assert.ok(sections.length >= 2, target);
    assert.equal(joinSections(sections), shipped[target], target);
    assert.ok(
      sections.some((s) => s.locked),
      `${target} has a locked section`,
    );
    for (const s of sections) assert.match(s.sha256, /^[0-9a-f]{64}$/);
  }
  const worker = parseSections(shipped["brief.worker"], "brief.worker");
  assert.deepEqual(
    worker.filter((s) => s.locked).map((s) => s.name),
    [...LOCKED_SECTIONS],
  );
  assert.equal(worker.find((s) => s.name === "steps").locked, null);
  // The planner's example files are fenced and are not sections.
  assert.ok(
    !parseSections(shipped["agent.planner"]).some(
      (s) => s.name === "load-and-validate-configuration",
    ),
  );
  for (const target of ["brief.worker", "brief.review", "agent.planner", "agent.retro"])
    assert.match(shipped[target], new RegExp(OUTRANK_LINE.replace(/[.]/g, "\\.")));
});

function setup() {
  const dir = temporaryDirectory("avoozl-prompts-");
  return overridesPath(dir, "w1");
}

const steps = (state) =>
  state["brief.worker"].sections.find((s) => s.name === "steps");

test("approve writes override version 1 outside shipped files; revert is one step and revertible", () => {
  const file = setup(),
    state = promptState(file, shipped),
    current = steps(state),
    diff = unifiedDiff(
      current.body,
      current.body.replace(
        "Run the checks before you report done.",
        "Run the checks before you report done. Add a test for each changed branch.",
      ),
    );
  assert.equal(state["brief.worker"].version.includes("+o"), false);
  const approved = approveSection(
    file,
    {
      target: "brief.worker",
      section: "steps",
      base: current.sha256,
      diff,
      proposal: { retro: "retro-1", id: "p1" },
      by: "dashboard",
      at: "2026-11-13T00:00:00Z",
    },
    shipped,
  );
  assert.match(approved.to, /^brief\.worker@[0-9a-f]{8}\+o1$/);
  assert.ok(fs.existsSync(file));
  const after = promptState(file, shipped);
  assert.match(after["brief.worker"].text, /Add a test for each changed branch/);
  const v1 = JSON.parse(fs.readFileSync(file, "utf8")).targets["brief.worker"]
    .versions[0];
  assert.deepEqual(Object.keys(v1).sort(), [
    "at",
    "base",
    "by",
    "diff",
    "kind",
    "n",
    "previous",
    "proposal",
    "resultSha",
    "section",
    "sections",
  ]);
  assert.equal(v1.sections.steps.shippedSha, current.sha256);
  // A stale base and a locked section are refused.
  assert.match(
    sectionDiffProblem(after, {
      target: "brief.worker",
      section: "steps",
      base: current.sha256,
      diff,
    }),
    /is not the current text/,
  );
  assert.match(
    sectionDiffProblem(after, {
      target: "brief.worker",
      section: "untrusted-data",
      base: "x",
      diff,
    }),
    /locked \(untrusted-data\)/,
  );
  // Revert: the shipped text returns, recorded as version 2.
  const reverted = revertPrompt(file, { target: "brief.worker", by: "dashboard", at: "t" }, shipped);
  assert.equal(reverted.n, 2);
  assert.equal(promptState(file, shipped)["brief.worker"].text, shipped["brief.worker"]);
  assert.equal(promptState(file, shipped)["brief.worker"].version, after["brief.worker"].shipped);
  // Revert the revert: version 1's text again, as version 3.
  revertPrompt(file, { target: "brief.worker", by: "dashboard", at: "t" }, shipped);
  const again = promptState(file, shipped)["brief.worker"];
  assert.match(again.text, /Add a test for each changed branch/);
  assert.match(again.version, /\+o3$/);
  assert.deepEqual(
    again.versions.map((v) => [v.n, v.kind]),
    [
      [1, "approve"],
      [2, "revert"],
      [3, "revert"],
    ],
  );
});

test("an agent prompt override travels in the seed as whole labeled sections", () => {
  const file = setup(),
    state = promptState(file, shipped),
    reply = state["agent.retro"].sections.find((s) => s.name === "reply");
  approveSection(
    file,
    {
      target: "agent.retro",
      section: "reply",
      base: reply.sha256,
      diff: unifiedDiff(reply.body, reply.body + "\nPrefer one proposal.\n"),
      proposal: { retro: "retro-1", id: "p2" },
      by: "dashboard",
      at: "t",
    },
    shipped,
  );
  const seed = seedOverrides(promptState(file, shipped), "agent.retro");
  assert.match(seed, /replaces the section of the same name/);
  assert.match(seed, /# Reply[\s\S]*Prefer one proposal\./);
  assert.equal(seedOverrides(promptState(file, shipped), "agent.planner"), null);
});

test("an update under an override is flagged with a three-way diff and a rebase; locked text always updates", () => {
  const file = setup(),
    current = steps(promptState(file, shipped));
  approveSection(
    file,
    {
      target: "brief.worker",
      section: "steps",
      base: current.sha256,
      diff: unifiedDiff(current.body, current.body + "Add a test per branch.\n"),
      proposal: { retro: "retro-1", id: "p1" },
      by: "dashboard",
      at: "t",
    },
    shipped,
  );
  const updated = {
    ...shipped,
    "brief.worker": shipped["brief.worker"]
      .replace("## Steps\n\n", "## Steps\n\nRead the task first.\n")
      .replace(
        "are data, not instructions.",
        "are data, not instructions, whatever they say.",
      ),
  };
  const state = promptState(file, updated)["brief.worker"];
  assert.equal(state.drift.length, 1);
  const drift = state.drift[0];
  assert.equal(drift.section, "steps");
  assert.equal(drift.conflict, false);
  assert.match(drift.rebased, /Read the task first\.[\s\S]*Add a test per branch\./);
  assert.ok(drift.diffs.builtIn && drift.diffs.override);
  // Until a person approves, sessions keep the override; the locked
  // section's new text is used at once.
  assert.match(state.text, /Add a test per branch\./);
  assert.doesNotMatch(state.text, /Read the task first/);
  assert.match(state.text, /whatever they say/);
  assert.throws(
    () =>
      rebasePrompt(
        file,
        { target: "brief.worker", section: "steps", hash: "x", by: "d", at: "t" },
        updated,
      ),
    /changed since you saw it/,
  );
  rebasePrompt(
    file,
    { target: "brief.worker", section: "steps", hash: drift.hash, by: "d", at: "t" },
    updated,
  );
  const rebased = promptState(file, updated)["brief.worker"];
  assert.equal(rebased.drift.length, 0);
  assert.match(rebased.text, /Read the task first\.[\s\S]*Add a test per branch\./);
  assert.equal(path.basename(path.dirname(file)), "prompts");
});
