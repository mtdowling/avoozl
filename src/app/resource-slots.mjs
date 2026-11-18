// Machine-wide resource slots (landing-trains LT13, design D14). A slot is a
// counted resource such as one Windows VM or one Linux container, declared in
// the global configuration (`machine.slots`). Rows live in the supervisor's
// machine database, not a workspace database, so every workspace on the
// machine shares them. A train takes every slot its platforms use before full
// validation and releases them when it ends; a worker check that needs a held
// slot waits with the train named.
import { contentBinding } from "./content-rules.mjs";
import { machineAvoozlPaths } from "./host-config.mjs";
import { holderAlive } from "./landing-lease.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { openSupervisorDatabase } from "./supervisor.mjs";
import os from "node:os";

// Takes every slot in `names` for `train`, or none. `counts` is
// `machine.slots`. {ok: true, held: [{slot, n}]}, or {ok: false, waiting:
// {slot, train, workspace}} naming a holder. A name already held by this
// train is kept, so a retry never takes a second one.
export function takeSlots(
  db,
  {
    names,
    counts,
    workspace,
    train,
    pid = process.pid,
    startedAt = null,
    now = Date.now(),
  },
) {
  const unique = [...new Set(names)];
  db.exec("BEGIN IMMEDIATE");
  try {
    const held = [];
    for (const slot of unique) {
      const rows = db
          .prepare("SELECT * FROM resource_slots WHERE slot = ?")
          .all(slot),
        mine = rows.find((r) => r.train === train);
      if (mine) {
        held.push({ slot, n: mine.n });
        continue;
      }
      const count = counts?.[slot] ?? 1,
        taken = new Set(rows.map((r) => r.n));
      let n = 1;
      while (taken.has(n) && n <= count) n++;
      if (n > count) {
        db.exec("ROLLBACK");
        const blocker = rows[0];
        return {
          ok: false,
          waiting: {
            slot,
            train: blocker.train,
            workspace: blocker.workspace,
          },
        };
      }
      db.prepare(
        "INSERT INTO resource_slots (slot, n, workspace, train, pid, process_started, taken_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        slot,
        n,
        workspace,
        train,
        pid,
        startedAt,
        new Date(now).toISOString(),
      );
      held.push({ slot, n });
    }
    db.exec("COMMIT");
    return { ok: true, held };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

// Releases every slot a train holds. Returns how many rows went.
export function releaseSlots(db, { train }) {
  return db.prepare("DELETE FROM resource_slots WHERE train = ?").run(train)
    .changes;
}

export const heldSlots = (db) =>
  db.prepare("SELECT * FROM resource_slots ORDER BY slot, n").all();

// Why a worker check must wait for `slot`: "waiting for windows-vm
// (train-...)" when the slot has no free count, else null.
export function slotWait(db, slot, counts) {
  const rows = db
    .prepare("SELECT * FROM resource_slots WHERE slot = ?")
    .all(slot);
  if (rows.length < (counts?.[slot] ?? 1)) return null;
  return `waiting for ${slot} (${rows[0].train})`;
}

// Frees the rows of a holder that is gone (a crashed integrator): the taker
// of a dead train's lease calls this with that train's ID (D5.3). Only rows
// whose process is not alive on this machine are freed. Returns the rows.
export function freeDeadSlots(
  db,
  {
    train,
    alive = (row) =>
      holderAlive({
        machine: os.hostname(),
        pid: row.pid,
        start: row.process_started,
      }),
  },
) {
  const rows = db
      .prepare("SELECT * FROM resource_slots WHERE train = ?")
      .all(train),
    freed = rows.filter((row) => !alive(row));
  for (const row of freed)
    db.prepare("DELETE FROM resource_slots WHERE slot = ? AND n = ?").run(
      row.slot,
      row.n,
    );
  return freed;
}

// The slot a command needs: the first platform environment whose wrapper is
// a prefix of the command and that names a slot. null when it needs none.
export function slotOfCommand(argv, platforms = {}) {
  for (const env of Object.values(platforms))
    if (
      env?.slot &&
      Array.isArray(env.wrapper) &&
      env.wrapper.every((word, i) => argv[i] === word)
    )
      return env.slot;
  return null;
}

// The gate a worker check consults before it runs: a function from the
// check's argv lists to a wait reason or null, or null when this machine
// declares no platform with a slot. Opens the supervisor's database for each
// call, so no handle outlives it.
export function machineSlotGate(store) {
  let platforms, counts;
  try {
    const workspaceRoot = contentBinding(store)?.workspaceRoot;
    if (!workspaceRoot) return null;
    const { config } = loadLayeredConfig({ workspaceRoot });
    platforms = config.machine?.platforms;
    counts = config.machine?.slots;
  } catch {
    return null;
  }
  if (!Object.values(platforms ?? {}).some((env) => env?.slot)) return null;
  return (argvs) => {
    let db;
    try {
      db = openSupervisorDatabase(machineAvoozlPaths().stateDirectory);
      for (const argv of argvs) {
        const slot = slotOfCommand(argv, platforms),
          wait = slot && slotWait(db, slot, counts);
        if (wait) return wait;
      }
      return null;
    } catch {
      return null;
    } finally {
      db?.close();
    }
  };
}
