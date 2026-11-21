// Preload for write-path tests: `node --import write-trace.mjs cli.ts ...`.
// Appends one JSON line to $AVOOZL_WRITE_TRACE for every SQLite statement that
// changes rows, noting whether an Operations call is on its stack. With
// $AVOOZL_DENY_OPERATIONS set, every Operations write entry point throws, so a
// caller that still changes the database must have bypassed Operations.
import fs from "node:fs";
import {
  DatabaseSync,
  type SQLInputValue,
  StatementSync,
} from "node:sqlite";
import { Operations } from "../api/operations.ts";

const trace = process.env.AVOOZL_WRITE_TRACE ?? "";
Error.stackTraceLimit = Infinity;
const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

function record(sql: string) {
  const stack = (new Error().stack ?? "").split("\n").slice(2);
  fs.appendFileSync(
    trace,
    JSON.stringify({
      sql: sql.trim().split(/\s+/).slice(0, 4).join(" "),
      operations: stack.some((line) =>
        line.includes("/src/app/api/operations.ts"),
      ),
      stack: stack.slice(0, 8).map((line) => line.trim()),
    }) + "\n",
  );
}

// The tick's own machine databases (its pass locks, last passes and
// children) live in the machine state folder and are not workspace data.
const real = (file: string) => {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
};
// Resolved at each check: the folder may not exist when this loads.
const machineOwn = (db: DatabaseSync | undefined) => {
  const state = process.env.XDG_STATE_HOME,
    where = db?.location?.();
  return Boolean(state && where && real(where).startsWith(real(state)));
};

if (trace) {
  const owner = new WeakMap<StatementSync, DatabaseSync>();
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (
    this: DatabaseSync,
    ...args: Parameters<typeof prepare>
  ) {
    const statement = prepare.apply(this, args);
    owner.set(statement, this);
    return statement;
  };
  const run = StatementSync.prototype.run;
  StatementSync.prototype.run = function (
    this: StatementSync,
    ...args: [Record<string, SQLInputValue> | SQLInputValue, ...SQLInputValue[]]
  ) {
    // The hook passes the caller's arguments through unchanged.
    const result = run.apply(
      this,
      args as [Record<string, SQLInputValue>, ...SQLInputValue[]],
    );
    if (result.changes > 0 && !machineOwn(owner.get(this)))
      record(this.sourceSQL);
    return result;
  };
  const exec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
    if (WRITE.test(sql) && !machineOwn(this)) record(sql);
    return exec.call(this, sql);
  };
}

if (process.env.AVOOZL_DENY_OPERATIONS)
  for (const name of ["execute", "perform", "initialize"] as const)
    Operations.prototype[name] = () => {
      throw Error("Operations denied by write-trace.");
    };
