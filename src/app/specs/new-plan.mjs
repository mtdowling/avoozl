// New plan (Plans page): a person names a plan idea, and Kiro Crew's Spec
// Builder drafts its spec folder. `requestNewPlan` checks the fields, runs
// content rules on the text it hands over, records the request, and returns
// it; the page makes the Spec Builder create call. `importNewPlans` (each
// tick) stores a requested folder as a draft plan once it lints clean. Nothing here approves a plan, starts delivery, or pushes.
import path from "node:path";
import { fail } from "../store/store.mjs";
import { contentBinding, enforce } from "../content/content-rules.mjs";
import { createSpecPlan, isEpicFolder, specName } from "./spec-plans.mjs";
import { specFolderPath, specsDirectory } from "./specs-path.mjs";
import { shippedPrompts } from "../agents/prompts.mjs";
import {
  STEERING_FILE,
  STEERING_TEXT,
  steeringStatus,
  writeSteering,
} from "./spec-steering.mjs";

const META = "newPlans";
const GOAL_LIMIT = 20000;
const CONTEXT_LIMIT = 20000;
const LINE_LIMIT = 200;
const PHASE_LIMIT = 30;
// Spec Builder's feature type writes requirements.md, design.md and
// tasks.md; its quick type skips design.md, which Avoozl requires.
const SPEC_TYPE = "feature";

const text = (value, label, limit, { required = false } = {}) => {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(`${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) fail(`${label} is required.`);
  if (trimmed.length > limit)
    fail(`${label} must be at most ${limit} characters.`);
  return trimmed;
};

const oneLine = (value, label) => {
  const line = text(value, label, LINE_LIMIT);
  if (/[\r\n]/.test(line)) fail(`${label} must be one line.`);
  return line;
};

export function pendingNewPlans(store) {
  const value = store.getMeta(META);
  return Array.isArray(value) ? value : [];
}

// What New plan hands Spec Builder as the user's first words. Spec Builder
// appends it to its own seed prompt. The rules come from the steering file
// when it is there; otherwise they ride along here.
function specBuilderDescription(request, steering, rules = STEERING_TEXT) {
  const { category, epic, phases, repositories, goal, context } = request;
  const front = [
    category && `category: ${category}`,
    epic && `epic: ${epic}`,
  ].filter(Boolean);
  return [
    "Avoozl will deliver this spec. Spec details from Avoozl's New spec form:",
    "",
    steering === "missing" || steering === "older"
      ? `Follow these spec rules:\n\n${rules.replace(/^---\n[\s\S]*?\n---\n\n/, "")}`
      : `Follow the spec rules in ${STEERING_FILE.split("\\").join("/")}.`,
    front.length
      ? `Start requirements.md with this front-matter, exactly:\n---\n${front.join("\n")}\n---`
      : "Leave out the front-matter block: this plan has no category or epic.",
    phases.length
      ? `Phases, as ## headings in tasks.md:\n${phases.map((phase) => `- ${phase}`).join("\n")}`
      : null,
    `Repositories in scope (use these IDs in _Repository:_ lines): ${repositories
      .map((repo) =>
        repo.localCheckout ? `${repo.id} (${repo.localCheckout})` : repo.id,
      )
      .join(", ")}.`,
    `What I want:\n${goal}`,
    context ? `Links and context:\n${context}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Check one New plan request and record it. Returns the Spec Builder create
// body; with `preview`, only checks the fields and says
// whether the steering file is there, recording and writing nothing.
// `deps`: {readSpec(name), repositories, specRoot}.
// `source` ({repository, number}) names the GitHub issue a Radar-coded plan
// comes from; the plan's issues are projected under it (rc-1.3).
export function requestNewPlan(store, input = {}, deps, source = null) {
  if (!input || typeof input !== "object") fail("Send the New spec fields.");
  const name = specName(
    typeof input.name === "string" ? input.name.trim() : input.name,
  );
  const category = oneLine(input.category, "Category");
  if (category && !/^[^:#{}[\]]+$/.test(category))
    fail("Category may not use : # { } [ or ].");
  const epic = oneLine(input.epic, "Epic");
  if (epic && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(epic))
    fail(
      "Name the epic by its spec folder: lowercase letters, digits and hyphens.",
    );
  const handoff = input.handoff ?? "spec-builder";
  if (handoff !== "spec-builder") fail("handoff must be spec-builder.");
  // An epic is a goal across plans: name one epic folder (R59.11). The old
  // free-text list is refused, never read as phases.
  if (input.epics !== undefined)
    fail("Name one epic in epic, and phases in phases.");
  if (epic) {
    const folder = deps.readSpec(epic);
    if (!folder.exists || !isEpicFolder(folder.files))
      fail(
        `${epic} is not an epic folder. Pick an epic, or leave Epic empty.`,
        404,
      );
  }
  const phasesInput = input.phases ?? [];
  if (!Array.isArray(phasesInput)) fail("Phases must be a list.");
  const phases = phasesInput
    .map((phase, index) => oneLine(phase, `Phase ${index + 1}`))
    .filter(Boolean);
  if (phases.length > PHASE_LIMIT) fail(`Name at most ${PHASE_LIMIT} phases.`);
  const goal = text(input.goal, "What you want", GOAL_LIMIT, {
    required: true,
  });
  const context = text(input.context, "Links and context", CONTEXT_LIMIT);

  const registered = deps.repositories;
  if (!registered.length)
    fail(
      "Register a repository in Settings › Repositories first. A spec's tasks each name one.",
      409,
    );
  const wanted = input.repositories ?? [];
  if (!Array.isArray(wanted) || !wanted.length)
    fail("Pick at least one repository.");
  const repositories = [...new Set(wanted)].map((id) => {
    const repo = registered.find((entry) => entry.id === id);
    if (!repo) fail(`${id} is not a registered repository.`, 404);
    return repo;
  });

  if (!deps.specRoot)
    fail(
      "Avoozl has no folder for specs yet. Set the planning or code repository in Settings first.",
      409,
    );
  if (store.get("plans", name))
    fail(`A spec named ${name} already exists. Pick another name.`, 409);
  if (deps.readSpec(name).exists)
    fail(
      `A spec folder ${specFolderPath(deps.specRoot, name)} already exists. Pick another name, or import that folder from the Specs table.`,
      409,
    );

  const folder = path.join(specsDirectory(deps.specRoot), name),
    rules = { text: shippedPrompts()["steering.specs"], older: [] };
  if (input.preview === true)
    return {
      name,
      folder,
      steering: { ...steeringStatus(deps.specRoot, rules), text: rules.text },
    };
  const request = {
    name,
    folder,
    category,
    epic,
    phases,
    repositories: repositories.map((repo) => ({
      id: repo.id,
      localCheckout: repo.localCheckout || null,
    })),
    goal,
    context,
  };
  // Asked first on the page; a changed or present copy is never written.
  let steering = steeringStatus(deps.specRoot, rules);
  const handed = specBuilderDescription(
    request,
    input.writeSteering === true ? "written" : steering.state,
    rules.text,
  );
  // A content rule that blocks the text refuses it: nothing is recorded.
  if (contentBinding(store)?.workspaceRoot)
    enforce(
      store,
      { boundary: "brief", target: `new-plan/${name}`, text: handed },
      { mode: "refuse" },
    );
  if (input.writeSteering === true)
    steering = writeSteering(deps.specRoot, rules);
  const at = new Date().toISOString();
  // Asking again for the same name replaces the earlier request.
  const earlier = pendingNewPlans(store),
    rest = earlier.filter((entry) => entry.name !== name);
  store.setMeta(META, [
    ...rest,
    {
      name,
      goal,
      repositories: request.repositories.map((repo) => repo.id),
      requestedAt: at,
      lastError: null,
      handoff,
      ...(epic ? { epic } : {}),
      ...(source ? { source } : {}),
    },
  ]);
  return {
    name,
    folder,
    handoff,
    steering,
    specBuilder: {
      name,
      working_dir: deps.specRoot,
      spec_type: SPEC_TYPE,
      description: handed,
    },
  };
}

// Store each requested folder that lints clean as a draft plan.
// `deps`: {readSpec(name), lint(spec)} where lint
// returns {canApprove}, content rule matches included, so a blocked folder
// stays pending. Returns the names imported this call.
// shortcut: a request whose folder never lints clean stays pending until
// the folder is imported by hand (Import in the Plans table); add an
// expiry if pending requests pile up.
export function importNewPlans(store, deps) {
  const pending = pendingNewPlans(store);
  if (!pending.length) return [];
  const imported = [],
    keep = [];
  let changed = false;
  for (const start of pending) {
    let entry = start;
    const plan = store.get("plans", entry.name),
      builder = entry.handoff === "spec-builder";
    // Imported by hand, or another plan took the name: nothing left to do.
    if (plan) {
      changed = true;
      continue;
    }
    let spec;
    try {
      spec = deps.readSpec(entry.name);
    } catch {
      keep.push(entry);
      continue;
    }
    if (!spec.exists) {
      keep.push(entry);
      continue;
    }
    try {
      const quality = deps.lint(spec);
      if (!quality.canApprove) {
        const lastError = builder
          ? "Waiting for Spec Builder's tasks.md, or the folder has lint errors to fix."
          : "The folder has lint errors; Spec Builder is still writing, or it needs a fix.";
        if (entry.lastError !== lastError) changed = true;
        keep.push({ ...entry, lastError });
        continue;
      }
      const created = createSpecPlan(
        store,
        {
          id: entry.name,
          prompt: entry.goal,
          context: {
            newPlan: {
              repositories: entry.repositories,
              ...(entry.source ? { source: entry.source } : {}),
            },
          },
        },
        spec,
      );
      imported.push(entry.name);
      // Spec Builder added the plan to the picked epic: the epic's change
      // comes back as its own draft revision (R61.8).
      if (entry.epic && deps.saveEpic) deps.saveEpic(entry.epic);
      changed = true;
    } catch (error) {
      if (entry.lastError !== error.message) changed = true;
      keep.push({ ...entry, lastError: error.message });
    }
  }
  if (changed) store.setMeta(META, keep);
  return imported;
}
