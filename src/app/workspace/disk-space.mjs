// Free space before every worktree Avoozl makes (a task's, a check run's, a
// landing candidate's, a verdict session's). Below the floor the work waits
// with one Needs you row naming the folder and its free space, instead of a
// half-made worktree that fails partway. No setting: one constant.
import fs from "node:fs";
import path from "node:path";

export const MIN_FREE_BYTES = 2 * 1024 ** 3;
const META = "diskLow";

// Tests replace `statfs` with a stub.
export const diskSpace = { statfs: (dir) => fs.statfsSync(dir) };

// The nearest folder of `dir` that exists: a worktree's own folder is made
// by the add, so its volume is its parent's.
function existing(dir) {
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    if (fs.existsSync(at)) return at;
    if (path.dirname(at) === at) return at;
  }
}

// Bytes free to this process on the volume that holds `dir`.
export function freeBytes(dir) {
  const stat = diskSpace.statfs(existing(dir));
  return Number(stat.bavail) * Number(stat.bsize);
}

const gib = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const rows = (store) => {
  try {
    return store?.getMeta(META) ?? {};
  } catch {
    return {};
  }
};

// Throws, before anything is made, when the volume that holds `dir` has
// less than MIN_FREE_BYTES free; the error carries `lowDisk` and the store
// keeps one Needs you row for the folder until there is room again. `what`
// names the work that waits, such as "task a's worktree".
export function requireDiskSpace(store, dir, what) {
  const folder = existing(dir),
    free = freeBytes(dir),
    held = rows(store);
  if (free >= MIN_FREE_BYTES) {
    if (held[folder] && store) {
      const { [folder]: _gone, ...rest } = held;
      store.setMeta(META, rest);
    }
    return free;
  }
  if (store)
    store.setMeta(META, {
      ...held,
      [folder]: {
        folder,
        free,
        what,
        at: held[folder]?.at ?? new Date().toISOString(),
      },
    });
  const error = Error(
    `${what} waits: ${folder} has ${gib(free)} free, and Avoozl needs ${gib(MIN_FREE_BYTES)} before it makes a worktree there.`,
  );
  error.status = 507;
  error.lowDisk = { folder, free };
  throw error;
}

// The Needs you rows: one per folder that is short of space.
export function diskNeedsYou(store) {
  return Object.values(rows(store)).map((row) => ({
    kind: "needs-human",
    reason: "disk",
    id: `low-disk:${row.folder}`,
    taskId: null,
    authority: "local",
    title: `Low disk space in ${row.folder}`,
    detail: `${row.folder} has ${gib(row.free)} free; Avoozl needs ${gib(MIN_FREE_BYTES)} before it makes a worktree there, so ${row.what ?? "the work"} waits. Free space on that volume; the work resumes on the next tick and this row clears.`,
    openedAt: row.at,
  }));
}
