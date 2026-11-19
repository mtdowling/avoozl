// Open chat on the standalone page (standalone-web SW7, D7): a person's message
// becomes a `process` session in the workspace root, read-only unless the role
// is a write role. The page shows what Start would do (`preview`), then Start
// asks the process executor for the session, the same way every other child
// starts: a start request the supervisor's drain takes.
import { randomUUID } from "node:crypto";
import { roleHarness, KIROCREW_HARNESS } from "../settings/chat-models.mjs";
import { listHarnessDefinitions } from "../executors/harness-definitions.mjs";
import { ROLE_TABLE, roleRun } from "../agents/role-table.mjs";
import { enqueueSessionRequests } from "./session-requests.mjs";
import { SEND_MAX_CHARS } from "./session-send.mjs";
import { processSessionDetails } from "../executors/process-view.mjs";
import { fail } from "../store/store.mjs";

const OPEN_KIND = "assist-session";
const DEFAULT_ROLE = "assist";
const DEFAULT_HARNESS = "claude-code";
const TITLE_CHARS = 60;

// The role a Kiro Crew agent name maps to: `avoozl-planner` is `planner`, and
// a name that is not a role this opens falls back to `assist` (SW7.1).
// shortcut: only `assist` opens here; the write roles run on tasks and specs,
// which the tick starts. Add a role to OPENABLE when one can start on a
// message alone.
const OPENABLE = ["assist"];
export function roleFor(agent) {
  const role = typeof agent === "string" ? agent.replace(/^avoozl-/, "") : "";
  return OPENABLE.includes(role) ? role : DEFAULT_ROLE;
}

// The harness this role runs on, and why not when none can: the one Settings ›
// Models names for the role, else claude-code, else the only approved one.
export function pickHarness({ config, configDirectory, role }) {
  const approved = listHarnessDefinitions(configDirectory).filter(
    (definition) => definition.approved,
  );
  if (!approved.length)
    return {
      harness: null,
      reason:
        "No harness definition is approved on this machine. Approve one in Settings › Models, or copy the message into your own CLI.",
    };
  // The role's saved harness, by the same rule every dispatch uses.
  const run = roleRun("assist", { config });
  if (run.executor === "process") {
    if (approved.some((definition) => definition.name === run.harness))
      return { harness: run.harness, reason: null };
    return {
      harness: null,
      reason: `Harness ${run.harness}, picked for this role in Settings › Models, is not approved on this machine.`,
    };
  }
  if (roleHarness(config, ROLE_TABLE[role].setting) === KIROCREW_HARNESS)
    return {
      harness: null,
      reason:
        "Settings › Models picks Kiro Crew chat for this role, which needs Kiro Crew. Pick a harness there, or copy the message into your own CLI.",
    };
  const found =
    approved.find((definition) => definition.name === DEFAULT_HARNESS) ??
    approved[0];
  return { harness: found.name, reason: null };
}

function describe(input, { config, configDirectory }) {
  const role = roleFor(input.agent ?? input.role),
    row = ROLE_TABLE[role],
    { harness, reason } = pickHarness({ config, configDirectory, role });
  return {
    role,
    harness,
    // Read-only unless the role is a write role in the role table (SW7.2).
    permissionClass: row.access === "write" ? "write" : "read",
    available: harness !== null,
    reason,
  };
}

// `session.open`. With `preview: true` it changes nothing and says which role
// and harness Start would use. Otherwise it records the session and queues its
// start; the drain starts the child.
export function openSession(
  store,
  input = {},
  { config, configDirectory, workspaceRoot, now = () => new Date() },
) {
  const plan = describe(input, { config, configDirectory });
  if (input.preview === true) return plan;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) fail("Write a message to start the session with.", 422);
  if (message.length > SEND_MAX_CHARS)
    fail(`A message is at most ${SEND_MAX_CHARS} characters.`, 422);
  if (!plan.available) fail(plan.reason, 409);
  const id = `assist:${randomUUID()}`,
    title = `Assist: ${message.replace(/\s+/g, " ").slice(0, TITLE_CHARS)}`;
  store.transaction(() => {
    store.put("receipts", {
      id,
      kind: OPEN_KIND,
      title,
      role: plan.role,
      at: now().toISOString(),
    });
    enqueueSessionRequests(
      store,
      {
        starts: [
          {
            id: `${id}:${plan.role}`,
            executor: "process",
            role: plan.role,
            task: id,
            title,
            worktree: workspaceRoot,
            brief: message,
            harness: plan.harness,
            permissionClass: plan.permissionClass,
          },
        ],
      },
      { source: "person" },
    );
  });
  return { id, title, ...plan };
}

// The slot of a page-opened session once the drain has started it, or null.
function openedSlot(store, id) {
  return (
    store
      .list("session_bindings")
      .find((binding) => binding.taskId === id && binding.role === DEFAULT_ROLE)
      ?.slot ?? null
  );
}

// `session.view`: where a page-opened session stands, for the page's process
// view (SW7.4): queued until the supervisor's drain starts it, then the
// supervisor's status, the log tail, the cost and the attach command. Read-only.
export function viewOpened(store, input = {}, paths) {
  // A bound session by its slot (a link or Open chat naming one), or one this
  // page opened by its id. A Kiro Crew chat is not shown here (SW7.3).
  if (typeof input.slot === "string") {
    const binding = store.get("session_bindings", input.slot);
    if (!binding) fail("No such session.", 404);
    if (binding.executor !== "process") return { kirocrewChat: true };
    return viewSlot(store, binding, binding.title ?? binding.taskId, paths);
  }
  const id = typeof input.id === "string" ? input.id : "",
    receipt = store.get("receipts", id);
  if (receipt?.kind !== OPEN_KIND) fail("No such session.", 404);
  const slot = openedSlot(store, id);
  if (!slot) return { id, title: receipt.title, state: "queued", slot: null };
  return {
    id,
    ...viewSlot(
      store,
      store.get("session_bindings", slot),
      receipt.title,
      paths,
    ),
  };
}

function viewSlot(store, binding, title, paths) {
  const process =
    processSessionDetails([binding.slot], paths).get(binding.slot) ?? null;
  return {
    title,
    state:
      process?.state === "exited" ||
      ["closed", "lost", "gone"].includes(binding.status)
        ? "ended"
        : "working",
    slot: binding.slot,
    process,
  };
}
