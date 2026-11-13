// GitHub Project sync (design §6.7, Requirements 29 and 33). Avoozl adds each
// managed issue to the configured Project and writes Release, Wave, an
// optional Iteration and an optional Avoozl state. It never writes Status. Of the board's Status values it
// reads one order: Deferred, by an actor the repository policy allows,
// pauses new dispatch for the task. Projection and the tick both call
// `syncProject`, so they agree, and a second pass writes nothing.
//
// SQLite keeps one `project-item:<task>` receipt per task as the cache of
// what Avoozl last wrote and saw; the issue marker's `applied.project` holds
// the same values for a fresh workspace (§3.4).
import { recordRevert } from "./activity-log.mjs";
import { digest } from "../model.mjs";
import { statusComplete } from "../query.mjs";
import { taskAuthority, taskKind, taskRepository } from "../work-model.mjs";
import { parseRepository } from "./github.mjs";
import {
  assertPlanningProjectItem,
  parseMarker,
  renderMarker,
} from "./github-marker.mjs";
import { actorAllowed, legacyRepositoryPolicy } from "./github-policy.mjs";
import { fail } from "./store.mjs";
import { allowWrite } from "./content-rules.mjs";
import { AVOOZL_STATES } from "../delivery-lanes.mjs";
import { avoozlStates } from "./page-views.mjs";

const ITEM = "project-item:";
const SYNC = "project-sync";
const BLOCKING = new Set(["requires", "sequence"]);
const MARKER = /<!--\s*avoozl-task\s*\n[\s\S]*?\n-->/;
export const PROJECT_SCOPE_FIX = "gh auth refresh -s project";
const STATE_OPTION = new Map(AVOOZL_STATES);

// Wave per task ID: 1 for a task that waits on nothing, else 1 plus the
// highest wave among its blockers. Only `requires` and `sequence` count.
// Waves depend on edges alone, so finishing a task never moves one.
export function computeWaves(data) {
  const ids = new Set(data.tasks.map((task) => task.id)),
    blockers = new Map();
  for (const edge of data.edges || [])
    if (BLOCKING.has(edge.kind) && ids.has(edge.from) && ids.has(edge.to)) {
      if (!blockers.has(edge.to)) blockers.set(edge.to, []);
      blockers.get(edge.to).push(edge.from);
    }
  const waves = new Map(),
    visiting = new Set();
  const wave = (id) => {
    if (waves.has(id)) return waves.get(id);
    // Validation refuses cycles (§5); this guards a hand-edited database.
    if (visiting.has(id)) fail(`Task ${id} is in a dependency cycle.`, 409);
    visiting.add(id);
    let value = 1;
    for (const from of blockers.get(id) || [])
      value = Math.max(value, wave(from) + 1);
    visiting.delete(id);
    waves.set(id, value);
    return value;
  };
  for (const id of ids) wave(id);
  return waves;
}

// Tasks a person paused by moving the card to Deferred. Dispatch, the ready
// label, and linked-branch creation skip them; a running session is not
// touched.
export function pausedTaskIds(store) {
  return new Set(
    store
      .list("receipts")
      .filter((record) => record.kind === "project-item" && record.paused)
      .map((record) => record.taskId),
  );
}

// Per-task Project state for the Delivery view.
export function projectItemRecords(store) {
  return new Map(
    store
      .list("receipts")
      .filter((record) => record.kind === "project-item")
      .map((record) => [record.taskId, record]),
  );
}

// The last sync outcome, for Settings: {status, reason, fix, problems}.
export function projectSyncStatus(store) {
  return store.get("receipts", SYNC);
}

const optionName = (option) =>
  option?.name?.raw ?? option?.name ?? option?.title?.raw ?? option?.title;

function fieldOptions(field) {
  if (field.data_type === "iteration")
    return [
      ...(field.configuration?.iterations || []),
      ...(field.configuration?.completed_iterations || []),
    ].map((entry) => ({ id: entry.id, name: optionName(entry) }));
  return (field.options || []).map((entry) => ({
    id: entry.id,
    name: optionName(entry),
  }));
}

// The value an item holds in `field`: a number for number fields, else the
// option or iteration name. Null when empty.
export function projectFieldValue(item, field) {
  if (!field) return null;
  const value = (item?.fields || []).find(
    (entry) => Number(entry.id) === Number(field.id),
  )?.value;
  if (value === null || value === undefined) return null;
  if (field.data_type === "number") {
    const number = typeof value === "number" ? value : Number(value?.raw);
    return Number.isFinite(number) ? number : null;
  }
  const name = typeof value === "string" ? value : optionName(value);
  return typeof name === "string" ? name : null;
}

function record(store, status) {
  const previous = store.get("receipts", SYNC),
    next = { id: SYNC, kind: "project-sync", ...status };
  if (JSON.stringify(previous) !== JSON.stringify(next))
    store.put("receipts", next);
  return status;
}

function unavailable(store, error) {
  return {
    ...record(store, {
      status: "unavailable",
      reason: error.message,
      fix: PROJECT_SCOPE_FIX,
      problems: [],
    }),
    writes: [],
    notify: [],
  };
}

// The repository whose policy decides a board order: in plans-repo mode the
// leaf's code repository, else the issue's own.
function policyRepository(store, policy, task) {
  const issueRepository = task.github.repository;
  if (policy.mode !== "plans-repo") return issueRepository;
  const target = taskRepository(task);
  if (target && policy.repositories?.[target]) return target;
  const planning = String(policy.planningRepository || "").toLowerCase();
  return (
    store
      .list("github_repositories")
      .find(
        (entry) =>
          entry.projectId === target && entry.id.toLowerCase() !== planning,
      )?.id || issueRepository
  );
}

async function orderCheck(store, github, policy, task, move) {
  if (!move?.actor)
    return {
      allowed: false,
      actor: null,
      at: move?.at ?? null,
      reason: "Avoozl cannot read who moved this card.",
    };
  const repository = policyRepository(store, policy, task),
    rules =
      policy.repositories?.[repository] ||
      legacyRepositoryPolicy(
        store.get("github_repositories", repository) || {},
      );
  let held = null;
  try {
    held = (await github.permission(repository, move.actor))?.permission;
  } catch {
    held = null;
  }
  return {
    ...actorAllowed(rules, move.actor, held || "none"),
    actor: move.actor,
    at: move.at,
  };
}

// The newest Status move on this Project into (or out of) `name`.
async function statusMove(github, task, project, name, into) {
  const moves = await github.projectStatusChanges(task.github.nodeId);
  return (
    moves.findLast(
      (move) =>
        move.projectId === project.node_id &&
        (into ? move.status === name : move.previousStatus === name),
    ) || null
  );
}

// Fresh workspace: the marker's `applied.project` is the baseline.
async function markerApplied(github, task) {
  const issue = await github.issue(task.github.repository, task.github.number),
    marker = parseMarker(issue?.body);
  return marker?.version === 2 ? marker.applied.project || {} : {};
}

// Write `applied.project` into the issue marker, and keep the stored body
// hashes in step so the new body does not read as a person's edit.
async function writeMarker(store, github, task, applied, identity) {
  const issue = await github.issue(task.github.repository, task.github.number),
    marker = parseMarker(issue?.body);
  if (marker?.version !== 2) return false;
  const next = structuredClone(marker);
  if (Object.keys(applied).length) next.applied.project = applied;
  else delete next.applied.project;
  if (JSON.stringify(next) === JSON.stringify(marker)) return false;
  const body = String(issue.body).replace(MARKER, () =>
      renderMarker(next, { planningRepository: identity?.planningRepository }),
    ),
    updated = await github.updateIssue(
      task.github.repository,
      task.github.number,
      { body },
    ),
    text = String(updated?.body ?? body),
    bodyHash = digest(text);
  store.transaction(() => {
    const row = store
      .list("github_issues")
      .find(
        (entry) =>
          entry.taskId === task.id &&
          entry.repository === task.github.repository,
      );
    if (row) store.put("github_issues", { ...row, body: text, bodyHash });
    const data = structuredClone(store.read()),
      local = data.tasks.find((candidate) => candidate.id === task.id);
    if (local?.github) {
      local.github.bodyHash = bodyHash;
      store.commit(data, "Record Project fields for " + task.id);
    }
  });
  return true;
}

function cleanApplied(applied) {
  return Object.fromEntries(
    ["Release", "Wave", "Iteration"]
      .filter((key) => applied[key] !== undefined && applied[key] !== null)
      .map((key) => [key, applied[key]]),
  );
}

// Avoozl state (design §6.7): Avoozl's own lane for each task, written only
// when it differs from the board. A value Avoozl did not write is a
// person's edit: written back once and recorded as a conflict, which stays
// until the state next moves. `row.next.state` is what Avoozl last wrote.
async function syncStates(store, github, project, field, rows, out) {
  const states = avoozlStates(store, store.read()),
    options = fieldOptions(field);
  for (const row of rows.values()) {
    const next = row.next,
      lane = next.paused ? "deferred" : states.get(row.task.id),
      want = STATE_OPTION.get(lane) ?? null,
      current = row.current.State ?? null,
      last = next.state;
    if (!want) continue;
    if (last !== undefined && last !== want) delete next.stateConflict;
    if (current !== want) {
      const option = options.find((entry) => entry.name === want);
      if (!option) {
        out.problems.push(
          `${field.name} option ${want} is missing; run Set up GitHub to add it.`,
        );
        continue;
      }
      await github.updateProjectItem(project, row.item.id, [
        { id: field.id, value: option.id },
      ]);
      out.writes.push({
        taskId: row.task.id,
        write: "fields",
        fields: [field.id],
      });
      if (!row.added && last !== undefined && current !== last) {
        next.stateConflict = {
          board: current,
          avoozl: want,
          at: new Date().toISOString(),
        };
        out.notify.push({
          channel: "decision",
          task: row.task.id,
          title: `${field.name} for ${row.task.id} reset to ${want}`,
          text: `Someone set ${field.name} on ${row.task.id} to ${current ?? "empty"}. Avoozl fills ${field.name} from its own state and wrote ${want} back.`,
          resume: "Move the card's Status instead; Avoozl never writes Status.",
        });
      }
    }
    next.state = want;
  }
}

// One sync pass. `claimed` is the set of tasks with a live session or a
// delivery under way, used only to show a Status mismatch in Delivery.
// Returns {status, writes, notify, problems, paused}. Writes nothing to
// GitHub or SQLite when nothing changed.
export async function syncProject(
  store,
  github,
  { policy, identity = null, claimed = new Set() },
) {
  const config = policy?.project;
  if (!config) return { status: "off", writes: [], notify: [] };
  let project, fields;
  try {
    project = await github.projectV2(config);
    // Classic tokens list their scopes; fine-grained tokens list none.
    if (
      typeof project.scopes === "string" &&
      !project.scopes.split(/,\s*/).includes("project")
    )
      throw Error("The GitHub token lacks the project scope.");
    fields = await github.projectFields(project);
  } catch (error) {
    return unavailable(store, error);
  }
  const problems = [],
    writes = [],
    notify = [];
  const named = (key, fallback, type) => {
    const name = Object.hasOwn(config.fields || {}, key)
      ? config.fields[key]
      : fallback;
    if (!name) return null;
    const field = fields.find((entry) => entry.name === name);
    if (!field) problems.push(`The Project has no field named ${name}.`);
    else if (field.data_type !== type)
      problems.push(`Project field ${name} must be ${type}.`);
    else return field;
    return null;
  };
  const statusField = named("status", "Status", "single_select"),
    releaseField = named("release", "Release", "single_select"),
    waveField = named("wave", "Wave", "number"),
    iterationField = named("iteration", null, "iteration"),
    // Each task's phase (R59.8), only when .avoozl.json names the field.
    phaseField = named("phase", null, "text"),
    // Blank skips the field: only a name set in .avoozl.json turns it on.
    namedState = named("avoozlState", null, "single_select"),
    // Avoozl never writes Status, so the two may not share a field.
    stateField =
      namedState && namedState.id === statusField?.id
        ? (problems.push(
            `Avoozl state cannot use the Status field ${namedState.name}; Avoozl never writes Status.`,
          ),
          null)
        : namedState,
    // Setup names the first column Ready; a board made before that keeps
    // its Todo.
    statusNames = new Set(
      statusField ? fieldOptions(statusField).map((option) => option.name) : [],
    ),
    values = {
      todo:
        !statusNames.has("Ready") && statusNames.has("Todo") ? "Todo" : "Ready",
      inProgress: "In progress",
      done: "Done",
      deferred: "Deferred",
      ...config.statusValues,
    };
  const items = await github.projectItems(
      project,
      [
        statusField,
        releaseField,
        waveField,
        iterationField,
        stateField,
        phaseField,
      ]
        .filter(Boolean)
        .map((field) => field.id),
    ),
    byNode = new Map(
      items
        .filter((item) => item.content_type === "Issue" && item.content)
        .map((item) => [item.content.node_id, item]),
    );
  const data = store.read(),
    records = projectItemRecords(store),
    waves = computeWaves(data),
    tasks = data.tasks.filter(
      (task) =>
        task.authority !== "local" &&
        taskAuthority(task) === "github" &&
        task.github?.nodeId &&
        task.github?.number &&
        task.github?.repository,
    );

  const rows = new Map();
  for (const task of tasks) {
    assertPlanningProjectItem(identity, {
      repository: task.github.repository,
    });
    const previous = records.get(task.id) || null;
    let item = byNode.get(task.github.nodeId),
      added = false;
    if (!item) {
      const { owner, repo } = parseRepository(task.github.repository);
      item = await github.addProjectItem(project, {
        owner,
        repo,
        number: task.github.number,
      });
      writes.push({ taskId: task.id, write: "add" });
      added = true;
    }
    const baseline = previous
      ? previous.applied
      : await markerApplied(github, task);
    rows.set(task.id, {
      task,
      previous,
      item,
      added,
      baseline: { ...baseline },
      applied: { ...baseline },
      current: {
        Release: projectFieldValue(item, releaseField),
        Wave: projectFieldValue(item, waveField),
        Iteration: projectFieldValue(item, iterationField),
        Status: projectFieldValue(item, statusField),
        State: projectFieldValue(item, stateField),
        Phase: projectFieldValue(item, phaseField),
      },
    });
  }

  // Release. A value Avoozl did not write is a person's: kept, used for the
  // parent rule, and drafted as a manifest change.
  const rank = new Map(
      releaseField
        ? fieldOptions(releaseField).map((option, index) => [
            option.name,
            index,
          ])
        : [],
    ),
    children = new Map();
  for (const task of data.tasks)
    if (task.parent) {
      if (!children.has(task.parent)) children.set(task.parent, []);
      children.get(task.parent).push(task);
    }
  for (const row of rows.values())
    row.personal =
      Boolean(releaseField) &&
      (row.current.Release ?? null) !== (row.applied.Release ?? null);
  const effective = new Map();
  const release = (task) => {
    if (effective.has(task.id)) return effective.get(task.id);
    effective.set(task.id, null);
    const row = rows.get(task.id);
    let value;
    if (row?.personal && row.current.Release) value = row.current.Release;
    else {
      // A leaf takes its own milestone; a parent the latest of its children
      // by the order of the Release options.
      const latest = (children.get(task.id) || [])
        .map(release)
        .filter(Boolean)
        .reduce(
          (best, name) =>
            best === null || (rank.get(name) ?? -1) > (rank.get(best) ?? -1)
              ? name
              : best,
          null,
        );
      value = latest ?? task.milestone ?? null;
    }
    effective.set(task.id, value);
    return value;
  };

  for (const row of rows.values()) {
    const { task, item } = row,
      updates = [];
    let releaseDraft = null;
    // Release and Iteration values pass content rules before any field
    // write (§4.9): a match writes nothing for this item and opens a
    // decision; the other items go on.
    const fieldText = [
      releaseField && release(task),
      iterationField && task.iteration,
    ]
      .filter((value) => typeof value === "string" && value)
      .join("\n");
    const fieldsAllowed =
      !fieldText ||
      allowWrite(
        store,
        {
          boundary: "github",
          repository: task.github?.repository ?? null,
          target: `project-item:${task.id}`,
          text: fieldText,
        },
        { taskId: task.id },
      );
    if (releaseField) {
      const want = release(task);
      if (!row.personal) {
        if (want !== (row.current.Release ?? null)) {
          const option = fieldOptions(releaseField).find(
            (entry) => entry.name === want,
          );
          if (want && !option)
            problems.push(
              `Release option ${want} for ${task.id} is missing; add it to the Project.`,
            );
          else {
            updates.push({ id: releaseField.id, value: option?.id ?? null });
            row.applied.Release = want;
          }
        }
      } else if (row.current.Release) {
        const manifest = task.milestone ?? null;
        // An approved manifest that says the same closes the draft.
        if (manifest === row.current.Release)
          row.applied.Release = row.current.Release;
        else if (taskKind(task) === "leaf" || manifest)
          releaseDraft = {
            planId: task.planId ?? null,
            specKey: task.source?.key ?? null,
            from: manifest,
            to: row.current.Release,
          };
      }
    }
    if (waveField) {
      const want = waves.get(task.id);
      if (row.current.Wave !== want) {
        updates.push({ id: waveField.id, value: want });
        // A Wave Avoozl did not write is refused and written back.
        if (
          !row.added &&
          row.applied.Wave !== undefined &&
          row.current.Wave !== row.applied.Wave
        ) {
          notify.push({
            channel: "decision",
            task: task.id,
            title: `Wave for ${task.id} reset to ${want}`,
            text: `Someone set Wave on ${task.id} to ${row.current.Wave ?? "empty"}. Avoozl computes Wave from blocking edges and wrote ${want} back.`,
            resume:
              "Change the plan's requires or sequence edges to move a wave.",
          });
          recordRevert(store, { taskId: task.id, field: "Wave" });
        }
      }
      row.applied.Wave = want;
    }
    // Phase is Avoozl's like Wave: a person's edit is written back on the
    // next tick and nothing else happens.
    if (phaseField) {
      const want = task.phase?.title ?? null;
      if ((row.current.Phase ?? null) !== want)
        updates.push({ id: phaseField.id, value: want });
      row.applied.Phase = want;
    }
    if (iterationField) {
      const want = task.iteration ?? null,
        current = row.current.Iteration ?? null;
      // Like Release, a person's Iteration is kept.
      if (current === (row.applied.Iteration ?? null) && want !== current) {
        const option = fieldOptions(iterationField).find(
          (entry) => entry.name === want,
        );
        if (want && !option)
          problems.push(`Iteration ${want} for ${task.id} is missing.`);
        else {
          updates.push({ id: iterationField.id, value: option?.id ?? null });
          row.applied.Iteration = want;
        }
      }
    }
    if (!fieldsAllowed) {
      updates.length = 0;
      row.applied = { ...row.baseline };
    }
    if (updates.length) {
      await github.updateProjectItem(project, item.id, updates);
      writes.push({
        taskId: task.id,
        write: "fields",
        fields: updates.map((update) => update.id),
      });
    }

    // Status: only Deferred is an order, and only from an allowed actor.
    const board = row.current.Status,
      was = row.previous ? row.previous.status : undefined;
    let paused = row.previous?.paused ?? null,
      ignored = row.previous?.ignored ?? null;
    if (statusField && board !== was) {
      const into = board === values.deferred;
      if (into || was === values.deferred) {
        const move = await statusMove(
            github,
            task,
            project,
            values.deferred,
            into,
          ),
          check = await orderCheck(store, github, policy, task, move);
        if (into && check.allowed) {
          paused = { actor: check.actor, at: check.at };
          ignored = null;
          notify.push({
            channel: "decision",
            task: task.id,
            title: `${task.id} is deferred on the board`,
            text: `${check.actor} moved ${task.id} to ${values.deferred}. Avoozl starts no new session or linked branch for it; a running session keeps going.`,
            resume: `Move the card out of ${values.deferred} to resume.`,
          });
        } else if (into)
          ignored = {
            direction: "into",
            actor: check.actor,
            at: check.at,
            reason: check.reason,
          };
        else if (paused && check.allowed) {
          paused = null;
          ignored = null;
        } else if (paused)
          ignored = {
            direction: "out",
            actor: check.actor,
            at: check.at,
            reason: check.reason,
          };
        else ignored = null;
      }
    }
    const expected = paused
        ? values.deferred
        : statusComplete(data, task.status)
          ? values.done
          : claimed.has(task.id)
            ? values.inProgress
            : values.todo,
      applied = cleanApplied(row.applied);
    if (
      JSON.stringify(applied) !== JSON.stringify(cleanApplied(row.baseline))
    ) {
      if (await writeMarker(store, github, task, applied, identity))
        writes.push({ taskId: task.id, write: "marker" });
    }
    const next = {
      id: ITEM + task.id,
      kind: "project-item",
      taskId: task.id,
      itemId: item.id,
      applied,
      status: board,
      paused,
      ignored,
      releaseDraft,
      mismatch:
        board !== null && board !== expected
          ? { board, avoozl: expected }
          : null,
    };
    // Avoozl state is written after every Status order is read below, so
    // a card paused this pass shows Deferred in this same pass.
    if (row.previous?.state !== undefined) next.state = row.previous.state;
    if (row.previous?.stateConflict)
      next.stateConflict = row.previous.stateConflict;
    row.next = next;
  }
  if (stateField)
    await syncStates(store, github, project, stateField, rows, {
      problems,
      writes,
      notify,
    });
  for (const row of rows.values())
    if (JSON.stringify(row.next) !== JSON.stringify(row.previous))
      store.put("receipts", row.next);
  record(store, { status: "synced", reason: "", fix: "", problems });
  return {
    status: "synced",
    writes,
    notify,
    problems,
    paused: [...pausedTaskIds(store)],
  };
}
