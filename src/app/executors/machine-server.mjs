// The machine server's front doors (MS1, MS3, design D4): the start and stop
// a command runs, and the pass it asks for. The loop itself is startSupervisor.
import {
  launchSupervisor,
  openSupervisorDatabase,
  processIsSame,
  runningSupervisor,
} from "./supervisor.mjs";
import { buildId } from "./machine-build.mjs";
import { addRequest } from "./machine-requests.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wait for a request's state to be `done`, up to timeoutMs. Returns its
// result text, or null when the time ran out.
async function waitDone(db, id, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const row = db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
    if (row?.state === "done") return row.result ?? "";
    await sleep(200);
  }
  return null;
}

export async function waitUntil(test, timeoutMs, pauseMs = 100) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = test();
    if (found) return found;
    await sleep(pauseMs);
  }
  return null;
}

// Ask the running server to stop through a database row, wait `waitMs`, then
// end it by pid after checking its start time. Children are detached and keep
// running (R95.4). Returns a sentence saying what happened.
export async function stopMachineServer({ stateDirectory, waitMs = 30_000 }) {
  const holder = runningSupervisor(stateDirectory);
  if (!holder) return "No machine server runs.";
  const db = openSupervisorDatabase(stateDirectory);
  try {
    addRequest(db, "stop");
  } finally {
    db.close();
  }
  if (await waitUntil(() => !runningSupervisor(stateDirectory), waitMs))
    return `Stopped the machine server (pid ${holder.pid}); its children keep running.`;
  if (holder.pid && processIsSame(holder.pid, holder.started)) {
    try {
      process.kill(holder.pid, "SIGTERM");
    } catch {}
    if (await waitUntil(() => !runningSupervisor(stateDirectory), 5000))
      return `The machine server (pid ${holder.pid}) did not answer in ${waitMs / 1000} seconds, so it was ended by pid; its children keep running.`;
  }
  throw Error(
    `The machine server (pid ${holder.pid}) is still running after a stop request and a signal.`,
  );
}

// Start a detached machine server and return once it holds the lock, or
// name the holder (MS3.1). A holder of another build is stopped and replaced
// (MS3.4) only when `replace` is set.
export async function startMachineServer({
  stateDirectory,
  configDirectory,
  starter = "terminal",
  replace = false,
  env = process.env,
}) {
  let holder = runningSupervisor(stateDirectory);
  let note = "";
  if (holder && replace && holder.build !== buildId()) {
    note = `${await stopMachineServer({ stateDirectory })} `;
    holder = null;
  }
  if (holder)
    return { started: false, holder, message: describeHolder(holder) };
  const launched = launchSupervisor({
    stateDirectory,
    configDirectory,
    starter,
    env,
  });
  // Returned once it holds the lock and has written its control address.
  const found = await waitUntil(() => {
    const holder = runningSupervisor(stateDirectory);
    return holder?.control ? holder : null;
  }, 20_000).then((holder) => holder ?? runningSupervisor(stateDirectory));
  if (!found)
    throw Error(
      "The machine server did not take its lock within 20 seconds. See supervisor.log in the machine state folder.",
    );
  return {
    started: found.pid === launched.pid,
    holder: found,
    message:
      note +
      (found.pid === launched.pid
        ? `Started the machine server: pid ${found.pid}, build ${found.build}.`
        : describeHolder(found)),
  };
}

export const describeHolder = (holder) =>
  `The machine server already runs: pid ${holder.pid}, build ${holder.build ?? "unknown"}, started ${holder.at}.`;

// Ask a running server for one pass now and wait for it. Returns the result
// lines, or null when no server runs.
export async function requestPass({ stateDirectory, waitMs = 600_000 }) {
  if (!runningSupervisor(stateDirectory)) return null;
  const db = openSupervisorDatabase(stateDirectory);
  try {
    const id = addRequest(db, "tick");
    const result = await waitDone(db, id, waitMs);
    if (result === null)
      throw Error("The machine server did not finish a pass in time.");
    return result
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } finally {
    db.close();
  }
}
