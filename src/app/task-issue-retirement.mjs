// Retiring task-issue bindings (Requirement 102.20, design §4.32.13).
// Tasks stay in the spec; their projected GitHub issues stop being state.
// The order is fixed, and each step is a person's explicit act:
//   1. hold     release is held and task-issue steps stop (projection, close
//               reconciliation, intake rebinding). Nothing else changes.
//   2. apply    the projected issue bindings, close verdicts and dispatch
//               flags are moved into this record. Task statuses, plans and
//               approved sources are not touched. Refused, still held, when
//               it would change which tasks are ready.
//   3. verify   one tick through a recording client: the ready set and the
//               statuses are unchanged, and no call reads, writes or
//               recreates a retired task issue. Only then is release free.
//   4. close    only after verify: close the obsolete task issues. Spec, plan
//               and epic issues are never in the list; they stay journals.
// A retry of any step is idempotent, and a migration stopped part way stays
// held. Intake issues (origin "issue") are input issues, not projections,
// and keep their bindings.
import { digest, queryTasks } from "../model.mjs";
import { fail } from "./store.mjs";

const META = "taskIssueRetirement";
// The fields a projection or a close verdict wrote on a task row.
const BINDING_FIELDS = [
  "github",
  "githubVerdict",
  "dispatch",
  "projectionConflicts",
  "githubClosedAt",
];
const CLOSE_REASONS = new Set(["completed", "not_planned"]);
const TASK_MARKER = /<!--\s*avoozl-task\b/;

export const retirementOf = (store) => store.getMeta(META) || null;

// From the hold on, no step reads or writes a task issue.
export const taskIssuesRetired = (store) => Boolean(retirementOf(store)?.state);

// Release stays held until the verifying tick passed.
export const retirementHoldsRelease = (store) =>
  ["held", "retired"].includes(retirementOf(store)?.state);

// Set only while verifyRetirement runs its one tick in this process.
let verifying = false;

// Ticks stop from the hold until the verifying tick passed; that one tick
// runs. A crash mid-verify leaves the workspace held.
export const ticksHeld = (store) => !verifying && retirementHoldsRelease(store);

// A row whose GitHub link is a projection of the spec, not an input issue.
const projected = (task) =>
  Boolean(
    task?.github &&
      (task.github.number || task.github.nodeId) &&
      task.github.origin !== "issue",
  );

// `held` are tasks the release policy keeps back (policyHeld).
const readySet = (data, held = new Set()) =>
  queryTasks(data, { scope: "all", q: "ready:true" })
    .map((task) => task.id)
    .filter((id) => !held.has(id))
    .sort();

// Whether a plan's release policy, as its last projection recorded it
// (radar-coder-queue.mjs), releases nothing: mode Hold, capacity 0, or a
// public hold.
function releasesNothing(fingerprint) {
  try {
    const { release, publicHold } = JSON.parse(fingerprint);
    return release?.mode === "hold" || release?.capacity === 0 || publicHold;
  } catch {
    return false;
  }
}

// Projected tasks whose `dispatch.ready: false` is the release policy's
// verdict, not their binding's: stripping the flag does not release them
// (with no issue they are not dispatch candidates), so the ready check
// applies the same policy before and after.
// shortcut: Step mode and capacity N > 0 still count as changes; read the
// live release policy here if a workspace on those modes needs to migrate.
function policyHeld(store, data) {
  const prints = store.getMeta("releaseFingerprint") || {};
  return data.tasks
    .filter(
      (task) =>
        projected(task) &&
        task.dispatch?.ready === false &&
        task.dispatch.state === "blocked" &&
        releasesNothing(prints[task.planId]),
    )
    .map((task) => task.id)
    .sort();
}

const statusesOf = (data) =>
  Object.fromEntries(data.tasks.map((task) => [task.id, task.status ?? null]));

// What must not move: approved sources and plan revisions.
const sourcesOf = (store, data) =>
  digest(
    JSON.stringify({
      tasks: data.tasks.map((task) => [task.id, task.approvedSource ?? null]),
      plans: store
        .list("plans")
        .map((plan) => [plan.id, plan.hash ?? null, plan.state ?? null]),
    }),
  );

function strip(task) {
  const removed = {};
  for (const field of BINDING_FIELDS)
    if (task[field] !== undefined) {
      removed[field] = task[field];
      delete task[field];
    }
  return removed;
}

// The bindings apply would retire, and the ready set it would leave.
function plan(store) {
  const data = store.read(),
    after = structuredClone(data),
    bindings = [];
  for (const task of after.tasks) {
    if (!projected(task)) continue;
    const { github } = task;
    bindings.push({
      taskId: task.id,
      repository: github.repository,
      number: github.number ?? null,
      nodeId: github.nodeId ?? null,
      verdict: task.githubVerdict?.state ?? null,
      removed: strip(task),
    });
  }
  const records = store
      .list("github_issues")
      .filter((record) => record.projectedPlanId),
    orders = store
      .list("receipts")
      .filter((row) => String(row.id).startsWith("github-order:")),
    held = policyHeld(store, data),
    before = readySet(data),
    later = readySet(after, new Set(held)),
    changed = [
      ...before.filter((id) => !later.includes(id)),
      ...later.filter((id) => !before.includes(id)),
    ].sort();
  return { data, after, bindings, records, orders, before, held, changed };
}

// The issues kept: spec, plan and epic issues stay as journals.
const keptIssues = (store) =>
  store
    .list("receipts")
    .filter((row) => row.kind === "github-parent")
    .map((row) => ({
      level: row.level,
      repository: row.repository,
      number: row.number,
    }));

const view = (bindings) =>
  bindings.map(({ removed: _removed, ...binding }) => binding);

export function previewRetirement(store) {
  const current = retirementOf(store);
  if (current?.state && current.state !== "held")
    return {
      state: current.state,
      bindings: view(current.bindings || []),
      records: current.records?.length ?? 0,
      kept: keptIssues(store),
      changed: [],
      ...(current.failure ? { failure: current.failure } : {}),
      ...(current.closed ? { closed: current.closed } : {}),
    };
  const { bindings, records, orders, changed } = plan(store);
  return {
    state: current?.state ?? null,
    bindings: view(bindings),
    records: records.length,
    orders: orders.length,
    kept: keptIssues(store),
    changed,
  };
}

// Step 1. Idempotent: a later state is returned as it is.
export function holdRetirement(store, { actor = null, at } = {}) {
  const current = retirementOf(store);
  if (current?.state) return current;
  const data = store.read(),
    next = {
      state: "held",
      heldAt: at || new Date().toISOString(),
      heldBy: actor,
      ready: readySet(data),
    };
  store.setMeta(META, next);
  return next;
}

// Step 2. One transaction: either every binding moves, or none does.
export function applyRetirement(store, { at } = {}) {
  const current = retirementOf(store);
  if (!current?.state)
    fail(
      "Hold the workspace first: task-issue retirement starts with a hold.",
      409,
    );
  if (current.state !== "held") return current;
  const { data, after, bindings, records, orders, before, held, changed } =
    plan(store);
  if (changed.length)
    fail(
      `Retiring the bindings would change which tasks are ready: ${changed.join(", ")}. The workspace stays held; settle those tasks first.`,
      409,
    );
  const next = {
    ...current,
    state: "retired",
    retiredAt: at || new Date().toISOString(),
    // The ready set the verifying tick must leave unchanged.
    ready: before,
    // Held by release policy, not counted as ready by the verifying tick.
    policyHeld: held,
    bindings,
    records,
    orders,
    statuses: statusesOf(data),
    sources: sourcesOf(store, data),
  };
  store.transaction(() => {
    store.commit(after, "Retire task-issue bindings");
    for (const record of records) store.remove("github_issues", record.id);
    for (const row of orders) store.remove("receipts", row.id);
    store.setMeta(META, next);
  });
  return next;
}

// Repository identity of a client call's first argument.
const repositoryOf = (value) =>
  typeof value === "string"
    ? value.toLowerCase()
    : value?.id
      ? String(value.id).toLowerCase()
      : value?.owner && value?.repo
        ? `${value.owner}/${value.repo}`.toLowerCase()
        : null;

const strings = (value, out = []) => {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object")
    for (const entry of Object.values(value)) strings(entry, out);
  return out;
};

// A client that passes every call through and notes any call that touches
// a retired task issue: its number on its repository, its node ID, or a
// created or edited issue carrying a task marker (a recreation).
export function recordingClient(github, bindings) {
  const numbers = new Set(
      bindings
        .filter((b) => b.number)
        .map((b) => `${String(b.repository).toLowerCase()}#${b.number}`),
    ),
    nodes = new Set(bindings.map((b) => b.nodeId).filter(Boolean)),
    touched = [];
  const client = new Proxy(github, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (typeof value !== "function") return value;
      return (...args) => {
        const repository = repositoryOf(args[0]),
          number = Number(args[1]),
          texts = strings(args.slice(1));
        if (
          (repository && numbers.has(`${repository}#${number}`)) ||
          texts.some((text) => nodes.has(text)) ||
          (["createIssue", "updateIssue"].includes(name) &&
            texts.some((text) => TASK_MARKER.test(text)))
        )
          touched.push({ call: String(name), repository, number });
        return value.apply(target, args);
      };
    },
  });
  return { client, touched };
}

// Step 3. `runTick(client)` runs one tick with the given GitHub client.
// A failure keeps the workspace held and says what changed; a retry runs
// the check again.
export async function verifyRetirement(store, { github, runTick, at } = {}) {
  const current = retirementOf(store);
  if (current?.state === "verified" || current?.state === "closed")
    return current;
  if (current?.state !== "retired")
    fail("Apply the retirement before its verifying tick.", 409);
  if (typeof runTick !== "function") fail("Verify needs a tick to run.", 400);
  const recorder = github
    ? recordingClient(github, current.bindings || [])
    : { client: null, touched: [] };
  // The one tick a held workspace runs (ticksHeld lets it through);
  // release stays held during it.
  verifying = true;
  try {
    await runTick(recorder.client);
  } finally {
    verifying = false;
  }
  const data = store.read(),
    ready = readySet(data, new Set(current.policyHeld || [])),
    statuses = statusesOf(data),
    readyChanged = [
      ...current.ready.filter((id) => !ready.includes(id)),
      ...ready.filter((id) => !current.ready.includes(id)),
    ].sort(),
    statusChanged = Object.keys(current.statuses).filter(
      (id) => statuses[id] !== current.statuses[id],
    ),
    rebound = data.tasks
      .filter(
        (task) =>
          projected(task) &&
          current.bindings.some((binding) => binding.taskId === task.id),
      )
      .map((task) => task.id),
    sourcesChanged = sourcesOf(store, data) !== current.sources,
    ok =
      !readyChanged.length &&
      !statusChanged.length &&
      !rebound.length &&
      !sourcesChanged &&
      !recorder.touched.length;
  const next = ok
    ? (({ failure: _failure, ...rest }) => ({
        ...rest,
        state: "verified",
        verifiedAt: at || new Date().toISOString(),
      }))(current)
    : {
        ...current,
        failure: {
          at: at || new Date().toISOString(),
          readyChanged,
          statusChanged,
          rebound,
          sourcesChanged,
          touched: recorder.touched,
        },
      };
  store.setMeta(META, next);
  return next;
}

// Step 4. Each retired issue closes once; a retry skips those already
// closed and those this machine does not write. `reason` picks one close
// reason for all; without it a completed task closes as completed and every
// other as not planned. A failure part way keeps what was closed.
export async function closeRetiredIssues(store, { github, reason, at } = {}) {
  const current = retirementOf(store);
  if (!["verified", "closed"].includes(current?.state))
    fail(
      "Close obsolete task issues only after the verifying tick passed.",
      409,
    );
  if (reason !== undefined && !CLOSE_REASONS.has(reason))
    fail("Close reason must be completed or not_planned.", 400);
  if (!github) fail("Closing task issues needs GitHub.", 400);
  const machine = store.getMeta("machineIdentity")?.id,
    writes = (repository) =>
      Boolean(
        machine &&
          store.get("github_repositories", repository)?.activeMachine ===
            machine,
      ),
    data = store.read(),
    complete = new Set(
      (data.statuses || []).filter((s) => s.complete).map((s) => s.id),
    ),
    closed = { ...(current.closed || {}) },
    skipped = [],
    seen = new Set();
  let error = null;
  for (const binding of current.bindings || []) {
    if (!binding.number) continue;
    const key = `${binding.repository}#${binding.number}`;
    if (seen.has(key) || closed[key]) continue;
    seen.add(key);
    if (!writes(binding.repository)) {
      skipped.push(key);
      continue;
    }
    const status = current.statuses?.[binding.taskId],
      state_reason =
        reason || (complete.has(status) ? "completed" : "not_planned");
    try {
      const issue = await github.issue(binding.repository, binding.number);
      if (issue?.state !== "closed")
        await github.updateIssue(binding.repository, binding.number, {
          state: "closed",
          state_reason,
        });
      closed[key] = {
        reason: issue?.state === "closed" ? issue.state_reason : state_reason,
        at: at || new Date().toISOString(),
      };
      store.setMeta(META, { ...retirementOf(store), closed });
    } catch (caught) {
      error = caught.message;
      break;
    }
  }
  const done =
      !error &&
      (current.bindings || []).every(
        (b) => !b.number || closed[`${b.repository}#${b.number}`],
      ),
    next = {
      ...retirementOf(store),
      closed,
      ...(done ? { state: "closed" } : {}),
    };
  store.setMeta(META, next);
  return { state: next.state, closed, skipped, ...(error ? { error } : {}) };
}
