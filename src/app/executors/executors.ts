// The session boundary: implementations own all provider-specific details.
// Keep its data contract readable by adapters running in other languages.
import contract from "../../executor-contract.json" with { type: "json" };

for (const value of Object.values(contract)) {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value))
      if (nested && typeof nested === "object") Object.freeze(nested);
    Object.freeze(value);
  }
}
export const EXECUTOR_CONTRACT = Object.freeze(contract);
const EXIT_STATUS = new RegExp(contract.exitStatusPattern);

// Token and cost use of one session.
type Usage = { tokens?: number; cost?: number };

// The checked session boundary createExecutor returns.
export interface Executor {
  start(
    role: string,
    task: string,
    worktree: string | null,
    brief: string,
    model: string | null,
    permissionClass: string,
  ): Promise<string>;
  send(sessionId: string, message: string): Promise<string>;
  status(sessionId: string): Promise<string>;
  stop?(sessionId: string): Promise<string>;
  usage?(sessionId: string): Promise<Usage | null>;
}

// What an implementation gives: each call may answer at once or later, and
// createExecutor checks every answer.
type Implementation = {
  [Method in keyof Executor]-?: (
    ...args: Parameters<NonNullable<Executor[Method]>>
  ) => unknown;
};

function text(
  value: unknown,
  name: string,
  { nullable = false, empty = false } = {},
) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || (!empty && !value.trim()))
    throw new TypeError(
      `${name} must be ${nullable ? "null or " : ""}${empty ? "a string" : "a nonempty string"}.`,
    );
  return value;
}

export function executorStatus(value: unknown): string {
  if (
    (typeof value === "string" && contract.statusValues.includes(value)) ||
    (typeof value === "string" &&
      EXIT_STATUS.test(value) &&
      Number.isSafeInteger(Number(value.slice("exited ".length))))
  )
    return value as string;
  throw new TypeError(
    "Executor status must be working, idle, exited <code>, or gone.",
  );
}

// Calls may be synchronous or asynchronous. Rejections stay rejections; a
// failed observation must never be converted into evidence that a session is gone.
export function createExecutor(
  implementation: Partial<Implementation> &
    Pick<Implementation, "start" | "send" | "status">,
): Readonly<Executor> {
  if (!implementation || typeof implementation !== "object")
    throw new TypeError("An executor implementation is required.");
  for (const method of ["start", "send", "status"])
    if (typeof implementation[method as keyof Implementation] !== "function")
      throw new TypeError(`Executor ${method} must be a function.`);
  for (const method of Object.keys(contract.optional))
    if (
      implementation[method as keyof Implementation] !== undefined &&
      typeof implementation[method as keyof Implementation] !== "function"
    )
      throw new TypeError(
        `Executor ${method} must be a function when present.`,
      );

  const executor: Executor = {
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
      ) as string;
    },
    async send(sessionId, message) {
      text(sessionId, "sessionId");
      text(message, "text", { empty: true });
      const result = await implementation.send(sessionId, message);
      if (typeof result !== "string" || !contract.sendValues.includes(result))
        throw new TypeError("Executor send must return accepted or refused.");
      return result;
    },
    async status(sessionId) {
      text(sessionId, "sessionId");
      return executorStatus(await implementation.status(sessionId));
    },
  };
  const { stop, usage } = implementation;
  if (stop)
    executor.stop = async (sessionId) => {
      text(sessionId, "sessionId");
      const result = await stop.call(implementation, sessionId);
      if (result !== contract.stopValue)
        throw new TypeError("Executor stop must return stopped.");
      return result as string;
    };
  if (usage)
    executor.usage = async (sessionId) => {
      text(sessionId, "sessionId");
      const result = await usage.call(implementation, sessionId);
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
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          (key === "tokens" && !Number.isSafeInteger(value))
        )
          throw new TypeError(
            `Executor usage ${key} must be a nonnegative ${key === "tokens" ? "integer" : "number"}.`,
          );
      return { ...(result as Usage) };
    };
  return Object.freeze(executor);
}
