// Free space before every worktree Avoozl makes (a task's, a check run's, a
// landing candidate's, a verdict session's). Below the floor the work waits
// with one Needs you row naming the folder and its free space, instead of a
// half-made worktree that fails partway. No setting: one constant.
import fs from "node:fs";
import path from "node:path";
import type { Store } from "../store/store.ts";

export const MIN_FREE_BYTES = 2 * 1024 ** 3;
const META = "diskLow";

// Tests replace `statfs` with a stub.
interface Volume {
  bavail: number | bigint;
  bsize: number | bigint;
}
export const diskSpace = {
  statfs: (dir: string): Volume => fs.statfsSync(dir),
};

// One folder that is short of space, as the store keeps it.
interface LowDisk {
  folder: string;
  free: number;
  what?: string;
  at: string;
}

// The nearest folder of `dir` that exists: a worktree's own folder is made
// by the add, so its volume is its parent's.
function existing(dir: string) {
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    if (fs.existsSync(at)) return at;
    if (path.dirname(at) === at) return at;
  }
}

// Bytes free to this process on the volume that holds `dir`.
export function freeBytes(dir: string) {
  const stat = diskSpace.statfs(existing(dir));
  return Number(stat.bavail) * Number(stat.bsize);
}

const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const rows = (store: Store | null | undefined): Record<string, LowDisk> => {
  try {
    return store?.getMeta<Record<string, LowDisk>>(META) ?? {};
  } catch {
    return {};
  }
};

// Throws, before anything is made, when the volume that holds `dir` has
// less than MIN_FREE_BYTES free; the error carries `lowDisk` and the store
// keeps one Needs you row for the folder until there is room again. `what`
// names the work that waits, such as "task a's worktree".
export function requireDiskSpace(
  store: Store | null | undefined,
  dir: string,
  what: string,
) {
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
  throw Object.assign(
    Error(
      `${what} waits: ${folder} has ${gib(free)} free, and Avoozl needs ${gib(MIN_FREE_BYTES)} before it makes a worktree there.`,
    ),
    { status: 507, lowDisk: { folder, free } },
  );
}

// The Needs you rows: one per folder that is short of space.
export function diskNeedsYou(store: Store | null | undefined) {
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
