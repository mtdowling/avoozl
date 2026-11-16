// Reading build receipts back (R101.1, R101.2, R101.5, R101.6, design §4.31).
// The tick's CI step lists a repository's artifacts once per check (no name
// filter, through the HTTP cache), downloads each build-receipt artifact of a
// merged pull request's head commit once, and keeps every line as a stored
// observation. Each GitHub call counts under source `receipt`. Flow and Trace
// read the stored rows and make no call.
import { inflateRawSync } from "node:zlib";
import { parseReceipts } from "./build-receipt.mjs";
import { listOr } from "./flow.mjs";
import { withSource } from "./github-rate.mjs";

const META = "buildReceipts";
export const ARTIFACT_NAME = "build-receipt";
const ZIP_MAX = 64 * 1024;
const DAY_MS = 86_400_000;
// shortcut: one page of 100 artifacts per list; a repository that writes more
// than 100 between two checks misses the oldest, and its pull request is
// stored as having none. Read a second page if Flow shows the cap hit.
const isReceipt = (name) =>
  name === ARTIFACT_NAME || String(name).startsWith(`${ARTIFACT_NAME}-`);
const lower = (value) => String(value || "").toLowerCase();

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

// The old one-receipt-per-pull-request metadata value, moved once into
// observations (R101.2), then removed.
export function migrateReceiptMeta(store) {
  const old = store.getMeta(META);
  if (!old || typeof old !== "object") return;
  const at = new Date().toISOString();
  store.transaction(() => {
    for (const [key, receipt] of Object.entries(old)) {
      const cut = key.lastIndexOf("#"),
        repository = lower(key.slice(0, cut)),
        number = Number(key.slice(cut + 1));
      if (!receipt || cut < 1 || !Number.isSafeInteger(number)) continue;
      const head = receipt.commit || `legacy-${number}`;
      insertObservation(store, repository, number, head, 0, false, receipt, 0);
      store.db
        .prepare(
          "INSERT OR IGNORE INTO receipt_artifacts(repository,artifact_id,head_sha,run_id,name,kind,read_at,lines,skipped) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(repository, 0, head, 0, null, "migrated", at, 1, 0);
    }
    store.db.prepare("DELETE FROM meta WHERE key=?").run(META);
  });
}

function insertObservation(store, repository, pr, head, run, failed, r, seq) {
  store.db
    .prepare(
      "INSERT OR REPLACE INTO build_observations(repository,pr_number,head_sha,run_id,task,attempt,command,target,seq,phase,start,ms,exit,failed,counters,issue,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      repository,
      pr,
      head,
      run,
      r.task ?? "",
      r.attempt ?? 1,
      r.command,
      r.target ?? "",
      seq,
      r.phase ?? r.command,
      r.start ?? "unknown",
      r.ms,
      r.exit ?? null,
      failed ? 1 : 0,
      JSON.stringify(r.counters ?? {}),
      r.issue ?? null,
      r.at ?? null,
    );
}

// Rows older than the window go with their pull request (R101.2).
export function pruneReceipts(store, cut) {
  const stale = new Date(cut).toISOString(),
    gone = store.db
      .prepare("DELETE FROM receipt_artifacts WHERE read_at<?")
      .run(stale).changes;
  return (
    gone +
    store.db
      .prepare(
        "DELETE FROM build_observations WHERE NOT EXISTS (SELECT 1 FROM receipt_artifacts a WHERE a.repository=build_observations.repository AND a.head_sha=build_observations.head_sha)",
      )
      .run().changes
  );
}

// One repository's receipts (R101.1, R101.5). Reads the pull request and run
// rows the CI step just wrote. Makes no call when every merged head commit
// is settled: its runs are complete and its artifacts read, or it was
// stored as having none.
export async function readReceipts(
  store,
  github,
  repository,
  { now = Date.now() } = {},
) {
  if (typeof github?.listArtifacts !== "function") return { calls: 0 };
  const repo = lower(repository),
    settled = new Set(
      store.db
        .prepare(
          "SELECT head_sha FROM receipt_artifacts WHERE repository=? AND kind IN ('none','done','migrated')",
        )
        .all(repo)
        .map((row) => row.head_sha),
    ),
    heads = new Map();
  for (const row of listOr(store, "pr_ci"))
    if (
      lower(row.repository) === repo &&
      row.mergedAt &&
      row.headSha &&
      !settled.has(row.headSha) &&
      Date.parse(row.mergedAt) >= now - 90 * DAY_MS
    )
      heads.set(row.headSha, row);
  if (!heads.size) return { calls: 0 };
  const runs = listOr(store, "ci_runs").filter(
      (run) => lower(run.repository) === repo,
    ),
    at = new Date(now).toISOString();
  let calls = 0;
  const listed = await withSource("receipt", () => {
      calls += 1;
      return github.listArtifacts(repository);
    }),
    known = new Set(
      store.db
        .prepare("SELECT artifact_id FROM receipt_artifacts WHERE repository=?")
        .all(repo)
        .map((row) => row.artifact_id),
    );
  for (const [head, pull] of heads) {
    const headRuns = runs.filter((run) => run.headSha === head),
      conclusion = new Map(headRuns.map((run) => [run.runId, run.conclusion])),
      mine = listed.filter(
        (a) =>
          isReceipt(a.name) && !a.expired && a.workflow_run?.head_sha === head,
      );
    let ok = true;
    for (const artifact of mine) {
      if (known.has(artifact.id)) continue;
      let text;
      try {
        text = await withSource("receipt", async () => {
          calls += 1;
          return firstZipFile(
            await github.downloadArtifact(repository, artifact.id),
          );
        });
      } catch {
        ok = false;
        continue;
      }
      const run = artifact.workflow_run?.id ?? 0,
        { records, skipped } = parseReceipts(text ?? ""),
        seen = new Map();
      store.transaction(() => {
        records.forEach((record) => {
          const key = [
              record.task,
              record.attempt,
              record.command,
              record.target,
            ].join("\0"),
            seq = seen.get(key) ?? 0;
          seen.set(key, seq + 1);
          insertObservation(
            store,
            repo,
            pull.number,
            head,
            run,
            false,
            record,
            seq,
          );
        });
        store.db
          .prepare(
            "INSERT OR REPLACE INTO receipt_artifacts(repository,artifact_id,head_sha,run_id,name,kind,read_at,lines,skipped) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            repo,
            artifact.id,
            head,
            run,
            artifact.name,
            "receipt",
            at,
            records.length,
            skipped,
          );
      });
      known.add(artifact.id);
    }
    // A run that did not succeed marks its lines failed, as a non-zero exit does.
    for (const [run, result] of conclusion)
      if (result)
        store.db
          .prepare(
            "UPDATE build_observations SET failed=CASE WHEN (exit IS NOT NULL AND exit<>0) OR ?<>'success' THEN 1 ELSE 0 END WHERE repository=? AND head_sha=? AND run_id=?",
          )
          .run(result, repo, head, run);
    // shortcut: a head commit with no run in the window and merged over a day
    // ago is taken as having none, so it does not cost a list every check.
    const complete = headRuns.length
      ? headRuns.every((run) => run.endedAt)
      : Date.parse(pull.mergedAt) < now - DAY_MS;
    if (!ok || !complete) continue;
    const have = store.db
      .prepare(
        "SELECT 1 FROM build_observations WHERE repository=? AND head_sha=? LIMIT 1",
      )
      .get(repo, head);
    store.db
      .prepare(
        "INSERT OR REPLACE INTO receipt_artifacts(repository,artifact_id,head_sha,run_id,name,kind,read_at,lines,skipped) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(repo, 0, head, 0, null, have ? "done" : "none", at, 0, 0);
  }
  return { calls };
}

// Every stored observation of a pull request's head commit, oldest first.
export function observationsFor(store, repository, head, number) {
  const find = (where, value) =>
      store.db
        .prepare(
          `SELECT * FROM build_observations WHERE repository=? AND ${where}=? ORDER BY rowid`,
        )
        .all(lower(repository), value),
    byHead = find("head_sha", head ?? ""),
    // The old metadata value kept the pull request, not the head commit.
    rows = byHead.length ? byHead : find("pr_number", number ?? -1);
  return rows.map((row) => ({
    v: 1,
    issue: row.issue,
    task: row.task || null,
    attempt: row.attempt,
    phase: row.phase,
    commit: row.head_sha,
    command: row.command,
    target: row.target,
    start: row.start,
    ms: row.ms,
    exit: row.exit,
    failed: row.failed === 1,
    seq: row.seq,
    runId: row.run_id,
    counters: JSON.parse(row.counters || "{}"),
    at: row.at,
  }));
}

// `readerFor(repository)` returns `async (pull) => observations | null`: every
// stored observation of the pull request's head commit, or null. It makes no
// call; the tick's CI step does the reading.
export function receiptReader(store) {
  return (repository) => async (pull) => {
    migrateReceiptMeta(store);
    if (!pull?.merged_at) return null;
    const rows = observationsFor(
      store,
      repository,
      pull.head?.sha,
      pull.number,
    );
    return rows.length ? rows : null;
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

// A pull request's observations: failed ones apart, the rest summed per phase
// over targets, and the phase that took the most (R101.4).
export function buildOf(observations) {
  const phases = new Map();
  let totalMs = 0,
    failedMs = 0;
  for (const o of observations) {
    totalMs += o.ms;
    if (o.failed) failedMs += o.ms;
    else phases.set(o.phase, (phases.get(o.phase) ?? 0) + o.ms);
  }
  const list = [...phases].map(([phase, ms]) => ({ phase, ms }));
  list.sort((a, b) => b.ms - a.ms);
  return { totalMs, failedMs, phases: list, costliest: list[0] ?? null };
}

// Flow rows ({pullNumber, repository, instance, builds}) as the builds block:
// per pull request totals and costliest phase, the median per phase, target
// and start over successful observations only, and per instance with the sum.
export function buildView(rows, { instanceName = () => null } = {}) {
  const found = rows
      .map((row) => ({
        ...row,
        builds: row.builds ?? (row.receipt ? [row.receipt] : []),
      }))
      .filter((row) => row.builds.length)
      .map((row) => ({ ...row, build: buildOf(row.builds) })),
    group = (key) => {
      const groups = new Map();
      for (const row of found) {
        const id = key(row);
        groups.set(id, [...(groups.get(id) ?? []), row]);
      }
      return groups;
    },
    cells = new Map();
  for (const row of found)
    for (const o of row.builds) {
      if (o.failed) continue;
      const id = `${o.phase}\n${o.target}\n${o.start}`;
      cells.set(id, [...(cells.get(id) ?? []), o.ms]);
    }
  const sum = (key) => found.reduce((n, row) => n + row.build[key], 0);
  return {
    count: found.length,
    totalMs: sum("totalMs"),
    failedMs: sum("failedMs"),
    medianMs: median(found.map((row) => row.build.totalMs - row.build.failedMs)),
    byPhase: [...cells].map(([id, list]) => {
      const [phase, target, start] = id.split("\n");
      return { phase, target, start, count: list.length, medianMs: median(list) };
    }),
    byInstance: [...group((row) => row.instance ?? "")].map(([id, list]) => ({
      instance: id || null,
      name: instanceName(id) ?? null,
      count: list.length,
      medianMs: median(list.map((row) => row.build.totalMs - row.build.failedMs)),
      totalMs: list.reduce((n, row) => n + row.build.totalMs, 0),
    })),
    recent: found
      .slice(-10)
      .reverse()
      .map((row) => ({
        repository: row.repository ?? null,
        pr: row.pullNumber,
        number: row.number,
        ...row.build,
      })),
  };
}

const timeOf = (ms) => {
  const seconds = ms / 1000;
  return seconds < 90
    ? `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
    : `${Math.round(seconds / 60)} min`;
};

// The one line Trace shows on the merged step: the last observation, or the
// totals and costliest phase when there are several.
export function receiptLine(receipts) {
  const list = !receipts ? [] : Array.isArray(receipts) ? receipts : [receipts];
  if (!list.length) return null;
  if (list.length > 1) {
    const { totalMs, costliest } = buildOf(list);
    return [
      `${list.length} builds, ${timeOf(totalMs)} in all`,
      costliest && `costliest ${costliest.phase} ${timeOf(costliest.ms)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const receipt = list[0],
    counters = Object.entries(receipt.counters ?? {})
      .slice(0, 3)
      .map(([key, value]) => `${key} ${value}`);
  return [
    `Build ${timeOf(receipt.ms)}, ${receipt.start}`,
    receipt.target,
    ...counters,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Every observation, grouped by phase, for Trace's merged step; failed ones
// are marked.
export function phaseGroups(observations) {
  const groups = new Map();
  for (const o of observations)
    groups.set(o.phase, [
      ...(groups.get(o.phase) ?? []),
      {
        target: o.target,
        start: o.start,
        attempt: o.attempt,
        task: o.task,
        ms: o.ms,
        failed: o.failed === true,
      },
    ]);
  return [...groups].map(([phase, items]) => ({ phase, items }));
}
