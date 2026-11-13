// Preload for write-path tests: `node --import write-trace.mjs cli.mjs ...`.
// Appends one JSON line to $AVOOZL_WRITE_TRACE for every SQLite statement that
// changes rows, noting whether an Operations call is on its stack. With
// $AVOOZL_DENY_OPERATIONS set, every Operations write entry point throws, so a
// caller that still changes the database must have bypassed Operations.
import fs from "node:fs";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { Operations } from "../operations.mjs";

const trace = process.env.AVOOZL_WRITE_TRACE;
Error.stackTraceLimit = Infinity;
const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

function record(sql) {
  const stack = new Error().stack.split("\n").slice(2);
  fs.appendFileSync(
    trace,
    JSON.stringify({
      sql: sql.trim().split(/\s+/).slice(0, 4).join(" "),
      operations: stack.some((line) => line.includes("/src/app/operations.mjs")),
      stack: stack.slice(0, 8).map((line) => line.trim()),
    }) + "\n",
  );
}

if (trace) {
  const run = StatementSync.prototype.run;
  StatementSync.prototype.run = function (...args) {
    const result = run.apply(this, args);
    if (result.changes > 0) record(this.sourceSQL);
    return result;
  };
  const exec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    if (WRITE.test(sql)) record(sql);
    return exec.call(this, sql);
  };
}

if (process.env.AVOOZL_DENY_OPERATIONS)
  for (const name of ["execute", "perform", "initialize", "importSnapshot"])
    Operations.prototype[name] = () => {
      throw Error("Operations denied by write-trace.");
    };
