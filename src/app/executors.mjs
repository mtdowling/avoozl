// The session boundary: implementations own all provider-specific details.
// Keep its data contract readable by adapters running in other languages.
import contract from "../executor-contract.json" with { type: "json" };

for (const value of Object.values(contract)) {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value))
      if (nested && typeof nested === "object") Object.freeze(nested);
    Object.freeze(value);
  }
}
export const EXECUTOR_CONTRACT = Object.freeze(contract);
const EXIT_STATUS = new RegExp(contract.exitStatusPattern);

function text(value, name, { nullable = false, empty = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || (!empty && !value.trim()))
    throw new TypeError(
      `${name} must be ${nullable ? "null or " : ""}${empty ? "a string" : "a nonempty string"}.`,
    );
  return value;
}

export function executorStatus(value) {
  if (
    contract.statusValues.includes(value) ||
    (typeof value === "string" &&
      EXIT_STATUS.test(value) &&
      Number.isSafeInteger(Number(value.slice("exited ".length))))
  )
    return value;
  throw new TypeError(
    "Executor status must be working, idle, exited <code>, or gone.",
  );
}

// Calls may be synchronous or asynchronous. Rejections stay rejections; a
// failed observation must never be converted into evidence that a session is gone.
export function createExecutor(implementation) {
  if (!implementation || typeof implementation !== "object")
    throw new TypeError("An executor implementation is required.");
  for (const method of ["start", "send", "status"])
    if (typeof implementation[method] !== "function")
      throw new TypeError(`Executor ${method} must be a function.`);
  for (const method of Object.keys(contract.optional))
    if (
      implementation[method] !== undefined &&
      typeof implementation[method] !== "function"
    )
      throw new TypeError(
        `Executor ${method} must be a function when present.`,
      );

  const executor = {
    async start(role, task, worktree, brief, model, permissionClass) {
      text(role, "role");
      text(task, "task");
      text(worktree, "worktree", { nullable: true });
      text(brief, "brief", { empty: true });
      text(model, "model", { nullable: true });
      if (!contract.permissionClasses.includes(permissionClass))
        throw new TypeError("permissionClass must be read or write.");
      return text(
        await implementation.start(
          role,
          task,
          worktree,
          brief,
          model,
          permissionClass,
        ),
        "sessionId",
      );
    },
    async send(sessionId, message) {
      text(sessionId, "sessionId");
      text(message, "text", { empty: true });
      const result = await implementation.send(sessionId, message);
      if (!contract.sendValues.includes(result))
        throw new TypeError("Executor send must return accepted or refused.");
      return result;
    },
    async status(sessionId) {
      text(sessionId, "sessionId");
      return executorStatus(await implementation.status(sessionId));
    },
  };
  if (implementation.stop)
    executor.stop = async (sessionId) => {
      text(sessionId, "sessionId");
      const result = await implementation.stop(sessionId);
      if (result !== contract.stopValue)
        throw new TypeError("Executor stop must return stopped.");
      return result;
    };
  if (implementation.usage)
    executor.usage = async (sessionId) => {
      text(sessionId, "sessionId");
      const result = await implementation.usage(sessionId);
      if (result === null) return null;
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new TypeError(
          "Executor usage must be null or an object with tokens and/or cost.",
        );
      const keys = Object.keys(result);
      if (!keys.length || keys.some((key) => !["tokens", "cost"].includes(key)))
        throw new TypeError("Executor usage may contain only tokens and cost.");
      for (const [key, value] of Object.entries(result))
        if (
          !Number.isFinite(value) ||
          value < 0 ||
          (key === "tokens" && !Number.isSafeInteger(value))
        )
          throw new TypeError(
            `Executor usage ${key} must be a nonnegative ${key === "tokens" ? "integer" : "number"}.`,
          );
      return { ...result };
    };
  return Object.freeze(executor);
}
