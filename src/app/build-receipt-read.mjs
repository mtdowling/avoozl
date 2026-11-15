// Reading build receipts back (RC32.5 to RC32.7, design D37). One receipt per
// merged pull request: the `build-receipt` artifact of its head commit's CI
// run. Each GitHub call counts under source `receipt`. The answer, or "none",
// is kept, so a pull request costs nothing after its first read.
import { inflateRawSync } from "node:zlib";
import { parseReceipt } from "./build-receipt.mjs";
import { withSource } from "./github-rate.mjs";

const META = "buildReceipts";
export const ARTIFACT_NAME = "build-receipt";
// shortcut: only the newest 100 artifacts of a repository are listed. A pull
// request older than that reads as having none; page if a repository's CI
// writes more than 100 artifacts between merges.
const KEEP = 300;
const ZIP_MAX = 64 * 1024;

// The first file of a small zip, as text. Reads the central directory, so a
// data descriptor after the file does not matter. Null for anything else.
export function firstZipFile(buffer) {
  try {
    if (buffer.length > ZIP_MAX) return null;
    let end = buffer.length - 22;
    while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
    if (end < 0) return null;
    const central = buffer.readUInt32LE(end + 16);
    if (buffer.readUInt32LE(central) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(central + 10),
      size = buffer.readUInt32LE(central + 20),
      local = buffer.readUInt32LE(central + 42);
    if (buffer.readUInt32LE(local) !== 0x04034b50) return null;
    const start =
        local +
        30 +
        buffer.readUInt16LE(local + 26) +
        buffer.readUInt16LE(local + 28),
      data = buffer.subarray(start, start + size);
    if (method === 0) return data.toString("utf8");
    if (method === 8) return inflateRawSync(data).toString("utf8");
    return null;
  } catch {
    return null;
  }
}

const keyOf = (repository, number) => `${repository}#${number}`;

// `readerFor(repository)` returns `async (pull) => receipt | null | undefined`:
// a receipt, null when the pull request has none, undefined when GitHub could
// not be read (nothing is kept, so the next check tries again).
export function receiptReader(store, github) {
  return (repository) => {
    let listed;
    return async (pull) => {
      const key = keyOf(repository, pull.number),
        known = store.getMeta(META) ?? {};
      if (key in known) return known[key];
      if (
        typeof github?.listArtifacts !== "function" ||
        !pull?.head?.sha ||
        !pull.merged_at
      )
        return undefined;
      let receipt = null;
      try {
        await withSource("receipt", async () => {
          listed ??= await github.listArtifacts(repository, ARTIFACT_NAME);
          const hit = listed.find(
            (artifact) =>
              !artifact.expired &&
              artifact.workflow_run?.head_sha === pull.head.sha,
          );
          if (!hit) return;
          const zip = await github.downloadArtifact(repository, hit.id);
          receipt = parseReceipt(firstZipFile(zip) ?? "");
        });
      } catch {
        return undefined;
      }
      const next = { ...(store.getMeta(META) ?? {}), [key]: receipt };
      // Oldest first out, so the table stays small.
      for (const old of Object.keys(next).slice(0, -KEEP)) delete next[old];
      store.setMeta(META, next);
      return receipt;
    };
  };
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Flow rows ({pr, repository, instance, receipt}) as the receipts block:
// every receipt, the median per target and start, and per instance with the sum.
export function receiptsView(rows, { instanceName = () => null } = {}) {
  const found = rows.filter((row) => row.receipt),
    group = (key) => {
      const groups = new Map();
      for (const row of found) {
        const id = key(row);
        groups.set(id, [...(groups.get(id) ?? []), row]);
      }
      return groups;
    };
  return {
    count: found.length,
    medianMs: median(found.map((row) => row.receipt.ms)),
    byTarget: [
      ...group((row) => `${row.receipt.target}\n${row.receipt.start}`),
    ].map(([id, list]) => {
      const [target, start] = id.split("\n");
      return {
        target,
        start,
        count: list.length,
        medianMs: median(list.map((row) => row.receipt.ms)),
      };
    }),
    byInstance: [...group((row) => row.instance ?? "")].map(([id, list]) => ({
      instance: id || null,
      name: instanceName(id) ?? null,
      count: list.length,
      medianMs: median(list.map((row) => row.receipt.ms)),
      totalMs: list.reduce((sum, row) => sum + row.receipt.ms, 0),
    })),
    recent: found
      .slice(-10)
      .reverse()
      .map((row) => ({
        repository: row.repository ?? null,
        pr: row.pullNumber,
        number: row.number,
        ms: row.receipt.ms,
        start: row.receipt.start,
        target: row.receipt.target,
      })),
  };
}

// The one line Trace shows on the merged step.
export function receiptLine(receipt) {
  if (!receipt) return null;
  const seconds = receipt.ms / 1000,
    time =
      seconds < 90
        ? `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
        : `${Math.round(seconds / 60)} min`,
    counters = Object.entries(receipt.counters ?? {})
      .slice(0, 3)
      .map(([key, value]) => `${key} ${value}`);
  return [`Build ${time}, ${receipt.start}`, receipt.target, ...counters]
    .filter(Boolean)
    .join(" · ");
}
