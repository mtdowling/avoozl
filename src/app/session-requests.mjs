// Durable, executor-neutral starts and messages. A claim never expires by age.
import { createHash, randomUUID } from "node:crypto";
import { canonical, fail } from "./store.mjs";

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const entity = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value, name) => {
  if (typeof value !== "string" || !value.trim())
    fail(`${name} must be a nonempty string.`, 422);
  return value;
};
export function startRequest(input) {
  if (!entity(input)) fail("A session request must be an object.", 422);
  for (const field of ["folder", "project", "agent", "agentFile", "mode"])
    if (Object.hasOwn(input, field))
      fail(`Session requests cannot carry ${field}.`, 422);
  const executor = text(input.executor, "executor"),
    role = text(input.role ?? "worker", "role"),
    task = text(input.task, "task"),
    permissionClass =
      input.permissionClass ??
      (["worker", "planner", "plan-answer"].includes(role) ? "write" : "read");
  if (!["read", "write"].includes(permissionClass))
    fail("permissionClass must be read or write.", 422);
  for (const field of ["worktree", "model", "harness"])
    if (input[field] != null) text(input[field], field);
  if (
    input.attempt !== undefined &&
    (!Number.isSafeInteger(input.attempt) || input.attempt < 1)
  )
    fail("attempt must be a positive integer.", 422);
  if (
    input.context !== undefined &&
    (!entity(input.context) || JSON.stringify(input.context).length > 8192)
  )
    fail("context must be a bounded object.", 422);
  if (typeof input.brief !== "string") fail("brief must be a string.", 422);
  const { version, operation, ...portable } = input;
  const request = {
    ...portable,
    executor,
    role,
    task,
    worktree: input.worktree ?? input.checkout ?? null,
    permissionClass,
  };
  if (!request.id)
    request.id = `start:${digest([executor, task, role, input.attempt ?? 1, input.title ?? null, input.commit ?? null])}`;
  return request;
}

const view = (row) => ({
  ...row.request,
  operation: row.kind,
  id: row.id,
  version: row.version,
});
const queued = (store) =>
  store
    .list("session_requests")
    .filter((row) => ["start", "send"].includes(row.kind));
const hasStartBinding = (store, request) =>
  store
    .list("session_bindings")
    .some(
      (binding) =>
        binding.taskId === request.task &&
        binding.role === request.role &&
        (binding.attempt ?? 1) === (request.attempt ?? 1),
    );
export function pendingSessionRequests(store, executor, preferred = []) {
  const order = new Map(preferred.map((request, index) => [request.id, index]));
  return queued(store)
    .filter(
      (row) =>
        (executor === undefined || row.executor === executor) &&
        row.state === "pending",
    )
    .filter(
      (row) => row.kind !== "start" || !hasStartBinding(store, row.request),
    )
    .sort(
      (a, b) =>
        (order.get(a.id) ?? preferred.length) -
        (order.get(b.id) ?? preferred.length),
    )
    .map(view);
}

export function enqueueSessionRequests(
  store,
  { starts = [], sends = [] } = {},
  { source = "tick" } = {},
) {
  return store.transaction(() => {
    const save = (request, kind) => {
      const task =
        kind === "start" && request.role === "worker"
          ? store.read().tasks.find((task) => task.id === request.task)
          : null;
      const plan = task?.planId ? store.get("plans", task.planId) : null;
      const approval = plan ? { planId: plan.id, hash: plan.hash } : null;
      const version = digest({ request, approval }),
        current = store.get("session_requests", request.id);
      if (
        current &&
        current.kind &&
        current.kind !== kind &&
        current.kind !== "intent"
      )
        fail("A request ID cannot change kind.", 409);
      if (current?.executor && current.executor !== request.executor)
        fail("A request ID cannot change executor.", 409);
      if (
        current?.kind === "start" &&
        kind === "start" &&
        ["task", "role", "attempt"].some(
          (field) =>
            (current.request[field] ?? (field === "attempt" ? 1 : null)) !==
            (request[field] ?? (field === "attempt" ? 1 : null)),
        )
      )
        fail("A start request ID cannot change target.", 409);
      if (
        current &&
        ["claimed", "bound", "sent", "refused"].includes(current.state)
      )
        return view(current);
      const intent =
        current?.intent ??
        (current && !["start", "send"].includes(current.kind) ? current : null);
      const row = {
        ...(intent ? { intent } : {}),
        id: request.id,
        kind,
        executor: request.executor,
        source,
        ...(approval ? { approval } : {}),
        state: "pending",
        version,
        request,
        requestedAt: current?.requestedAt ?? new Date().toISOString(),
      };
      if (
        !current ||
        current.version !== version ||
        current.state !== "pending"
      )
        store.put("session_requests", row);
      return view(current?.version === version ? current : row);
    };
    return {
      starts: starts.map((request) => save(startRequest(request), "start")),
      sends: sends.map((input) => {
        const request = {
          ...input,
          executor: text(input.executor, "executor"),
        };
        text(request.slot ?? request.sessionId, "sessionId");
        if (typeof request.text !== "string")
          fail("text must be a string.", 422);
        request.id ??= `send:${randomUUID()}`;
        return save(request, "send");
      }),
    };
  });
}

// The caller supplies a server-owned executor/consumer, never a request field.
export function takeSessionRequest(
  store,
  input,
  { executor, consumer, eligible } = {},
) {
  return store.transaction(() => {
    const row = store.get("session_requests", input.id);
    if (
      !row ||
      row.executor !== executor ||
      row.state !== "pending" ||
      row.version !== input.version
    )
      return null;
    if (row.kind === "start") {
      const request = row.request;
      if (hasStartBinding(store, request)) {
        store.put("session_requests", { ...row, state: "bound" });
        return null;
      }
      const hold = eligible?.(request, row);
      if (hold) {
        store.put("session_requests", {
          ...row,
          state: "canceled",
          reason: hold,
        });
        return null;
      }
    }
    const claim = {
      token: randomUUID(),
      consumer: text(consumer, "consumer"),
      claimedAt: new Date().toISOString(),
    };
    store.put("session_requests", { ...row, state: "claimed", claim });
    return { request: view(row), claimToken: claim.token };
  });
}

export function ownedSessionRequest(store, input, { executor, consumer } = {}) {
  const row = store.get("session_requests", input.id);
  if (
    !row ||
    row.executor !== executor ||
    row.state !== "claimed" ||
    row.claim?.token !== input.claimToken ||
    row.claim.consumer !== consumer
  )
    fail("This executor consumer does not own the request claim.", 403);
  return row;
}

export function releaseSessionRequest(store, input, owner) {
  return store.transaction(() => {
    const row = ownedSessionRequest(store, input, owner);
    // Only the adapter may report a definitive refusal before any open call.
    if (input.reason !== "before-open")
      fail("Only a refusal before opening may release a start claim.", 409);
    if (row.kind !== "start") fail("Only a start claim can be released.", 409);
    const { claim, ...rest } = row;
    store.put("session_requests", { ...rest, state: "pending" });
    return { released: true };
  });
}

export function completeSessionRequest(store, input, owner) {
  return store.transaction(() => {
    const row = ownedSessionRequest(store, input, owner);
    if (row.kind !== "send" || !["sent", "refused"].includes(input.outcome))
      fail("Messages complete as sent or refused.", 422);
    store.put("session_requests", {
      ...row,
      state: input.outcome,
      completedAt: new Date().toISOString(),
    });
    return { completed: true };
  });
}

export function bindSessionRequest(store, input, binding, owner) {
  const row = ownedSessionRequest(
    store,
    { id: input.requestId, claimToken: input.claimToken },
    owner,
  );
  const request = row.request;
  if (
    row.kind !== "start" ||
    request.task !== binding.taskId ||
    request.role !== binding.role ||
    (request.attempt ?? 1) !== binding.attempt ||
    request.executor !== input.executor ||
    (request.model ?? null) !== (binding.model ?? null) ||
    (request.commit ?? null) !== (binding.commit ?? null) ||
    (request.worktree ?? null) !== (binding.worktree ?? null) ||
    request.permissionClass !== binding.permissionClass ||
    canonical(request.context ?? null) !== canonical(binding.context ?? null)
  )
    fail("The binding does not match its claimed session request.", 409);
  store.put("session_requests", {
    ...row,
    state: "bound",
    slot: binding.slot,
    completedAt: new Date().toISOString(),
  });
}
