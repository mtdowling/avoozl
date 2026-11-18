// The landing lease (landing-trains LT3, design D5): at most one integrator
// holds one repository target's trunk at a time. It is the shared lease
// module (src/lease.mjs) over a `landing_leases` row, taken by
// compare-and-set inside one SQLite write transaction, renewed every
// heartbeat and expired after a few missed ones.
//
// An expired lease is not taken from a holder that is still there: a stale
// lease whose holder process is alive on this machine, with the same start
// time, is `hung`, nothing is taken, and one Needs you item names it. Git is
// the backstop for any double holder: the trunk push is a guarded
// fast-forward (D5.4).
import { execFileSync } from "node:child_process";
import os from "node:os";
import { endLease, leaseState, renewLease, takeLease } from "../lease.mjs";

const TABLE = "landing_leases";
export const leaseId = (projectId, target) => `${projectId}\0${target}`;

// When a process started, as ps prints it, or null where that is not
// available. shortcut: no start time on Windows, so a reused pid there reads
// as the same process; upgrade by reading the start time with PowerShell.
export function processStart(pid) {
  if (process.platform === "win32") return null;
  try {
    return (
      execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

export const currentHolder = () => ({
  machine: os.hostname(),
  pid: process.pid,
  start: processStart(process.pid),
});

// Is the holder still the same process on this machine? A pid that exists
// with a different start time is a reused pid, not the holder.
export function holderAlive(holder, { machine = os.hostname() } = {}) {
  if (!holder || holder.machine !== machine || !Number.isInteger(holder.pid))
    return false;
  try {
    process.kill(holder.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") return false;
  }
  const start = holder.start ? processStart(holder.pid) : null;
  return !holder.start || start === null || start === holder.start;
}

export const landingLease = (store, projectId, target) =>
  store.get(TABLE, leaseId(projectId, target));

// Takes the lease for `sessionId`, or says why not. Returns
//   {state: "taken", lease, dead}  `dead` is the stale row a taker must
//                                  clean up after (D5.3), or null
//   {state: "busy", lease}         an active lease of another session
//   {state: "hung", lease, notify} a stale lease whose holder is alive;
//                                  `notify` has the one notice, once
export function takeLandingLease(
  store,
  {
    projectId,
    target,
    sessionId,
    seconds,
    train = null,
    holder = currentHolder(),
    now = Date.now(),
    probe = holderAlive,
  },
) {
  const id = leaseId(projectId, target);
  return store.transaction(() => {
    const row = store.get(TABLE, id),
      state = leaseState(row, now);
    if (state === "stale" && probe(row.holder)) {
      const notice = !row.hung;
      const lease = notice
        ? store.put(TABLE, {
            ...row,
            hung: { at: new Date(now).toISOString(), pid: row.holder.pid },
          })
        : row;
      return {
        state: "hung",
        lease,
        notify: notice
          ? [
              {
                channel: "failure",
                title: `The integrator for ${target} is hung`,
                text: `Process ${row.holder.pid} on ${row.holder.machine} holds the landing lease for ${target} and stopped renewing it. Avoozl did not take the lease. Stop that process, and landing resumes by itself.`,
              },
            ]
          : [],
      };
    }
    const taken = takeLease(row, { sessionId, holder, seconds, now });
    if (taken.busy) return { state: "busy", lease: row };
    const lease = store.put(TABLE, {
      ...taken.record,
      id,
      projectId,
      target,
      train: taken.replaced ? train : (row?.train ?? train),
    });
    return {
      state: "taken",
      lease,
      dead: taken.replaced && state === "stale" ? taken.replaced : null,
    };
  });
}

// Renews the lease; `train` records the running train. {changed: true} when
// the lease is no longer this holder's.
export function renewLandingLease(
  store,
  { projectId, target, leaseId: held, seconds, train, now = Date.now() },
) {
  return store.transaction(() => {
    const row = store.get(TABLE, leaseId(projectId, target)),
      renewed = renewLease(row, { leaseId: held, seconds, now });
    if (renewed.changed || leaseState(row, now) === "stale")
      return { changed: true };
    return {
      lease: store.put(TABLE, {
        ...row,
        ...renewed.record,
        ...(train === undefined ? {} : { train }),
      }),
    };
  });
}

export function endLandingLease(
  store,
  { projectId, target, leaseId: held, now = Date.now() },
) {
  return store.transaction(() => {
    const row = store.get(TABLE, leaseId(projectId, target)),
      ended = endLease(row, { leaseId: held, now });
    if (ended.changed) return { changed: true };
    return { lease: store.put(TABLE, { ...row, ...ended.record }) };
  });
}

// Needs you rows for hung integrators, from the lease rows alone.
export function integratorNeedsYou(store) {
  return store
    .list(TABLE)
    .filter((row) => row.hung && row.state === "active")
    .map((row) => ({
      kind: "needs-human",
      reason: "approval",
      id: `integrator-hung:${row.id}`,
      taskId: null,
      authority: "avoozl",
      title: `The integrator for ${row.target} is hung`,
      detail: `Process ${row.holder.pid} on ${row.holder.machine} holds the landing lease and stopped renewing it since ${row.heartbeatAt}. Avoozl did not take the lease.`,
      openedAt: row.hung.at,
    }));
}
