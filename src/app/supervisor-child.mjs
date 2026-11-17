// The supervisor's wrapper around one agent CLI (R95.1, design §4.28):
//   node supervisor-child.mjs <exit-file> <program> [args...]
// It runs the program with no shell, in the supervisor's chosen folder and
// log, and writes the exit code to <exit-file> before it exits. A supervisor
// that restarted mid-run cannot wait on a child it did not spawn, so this file
// is how it still learns the code.
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";

const [exitFile, program, ...args] = process.argv.slice(2);
if (!exitFile || !program) {
  console.error("Usage: supervisor-child.mjs <exit-file> <program> [args...]");
  process.exit(2);
}

function finish(code, signal, error) {
  const value = {
    code: Number.isInteger(code)
      ? code
      : 128 + (os.constants.signals[signal] ?? 0),
    signal: signal ?? null,
    ...(error ? { error } : {}),
    at: new Date().toISOString(),
  };
  const temporary = `${exitFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value) + "\n");
  fs.renameSync(temporary, exitFile);
  process.exit(value.code);
}

const child = spawn(program, args, { stdio: "inherit", windowsHide: true });
let done = false;
child.once("error", (error) => {
  if (done) return;
  done = true;
  // 127: the program could not be started, as a shell reports it.
  finish(127, null, error.message);
});
child.once("exit", (code, signal) => {
  if (done) return;
  done = true;
  finish(code, signal);
});
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {
      // Already gone: its exit event writes the file.
    }
  });
