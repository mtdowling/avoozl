// A detached runner's log file, opened for append. A log past its cap moves
// to `<name>.1` (replacing the older one), so two files at most stay on disk.
import fs from "node:fs";
import path from "node:path";

export const RUNNER_LOG_BYTES = 1024 * 1024;

export function openRunnerLog(log: string, cap = RUNNER_LOG_BYTES) {
  fs.mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
  try {
    if (fs.statSync(log).size > cap) fs.renameSync(log, `${log}.1`);
  } catch {
    // No log yet.
  }
  const output = fs.openSync(log, "a", 0o600);
  fs.chmodSync(log, 0o600);
  return output;
}
