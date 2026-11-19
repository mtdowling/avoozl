// The merge batch size limit of one base branch (Requirement MB2, design
// D2). The record per base is {limit, results, alone}: the limit, the
// outcome ("landed" or "culprit") of the last 20 members that reached a
// result, and the keys of culprits that must land alone. It is plain data
// in the store's meta, so a restart keeps it and the Landing queue page
// reads it.
export const MAX_LIMIT = 16;
export const WINDOW = 20;
const MIN_RESULTS = 5;
const ASSUMED_RATE = 0.1;
const META = "mergeBatchSize";

export const emptySize = () => ({
  limit: 1,
  results: [],
  alone: [],
  last: [],
});
const LAST = 10;

// The share of the last results that were culprits, with 10% assumed below
// five results.
export function failureRate(results) {
  if (results.length < MIN_RESULTS) return ASSUMED_RATE;
  return results.filter((r) => r === "culprit").length / results.length;
}

// The most a batch may hold at failure rate p: max(1, floor(0.7 / p)), so a
// batch's chance to pass stays near one half or better. Whole numbers keep
// floor() exact: 0.7 / 0.1 is 6.99... in floats.
export function ceiling(results) {
  if (results.length < MIN_RESULTS) return 7;
  const culprits = results.filter((r) => r === "culprit").length;
  if (!culprits) return MAX_LIMIT;
  return Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor((7 * results.length) / (10 * culprits))),
  );
}

// The record after one merge batch. `landed` and `culprits` are member
// counts; `held` is how many members the batch held and `waiting` how many
// waited in the queue when it was built.
export function afterBatch(
  record,
  { landed = 0, culprits = 0, held, waiting, halve = false },
) {
  const results = [
    ...record.results,
    ...Array(landed).fill("landed"),
    ...Array(culprits).fill("culprit"),
  ].slice(-WINDOW);
  let limit = record.limit;
  if (culprits || halve) limit = Math.max(1, Math.floor(limit / 2));
  else if (landed && waiting > held) limit += 1;
  return { ...record, results, limit: Math.min(limit, ceiling(results)) };
}

// `setting` is landing.mergeBatch: "auto" or a whole number from 1 to 16
// that replaces the limit.
export const sizeLimit = (record, setting = "auto") =>
  Number.isInteger(setting) ? setting : record.limit;

export function sizeRecord(store, { repositoryId, base }) {
  return {
    ...emptySize(),
    ...(store.getMeta(META)?.[repositoryId]?.[base] ?? {}),
  };
}

// Writes the record after a batch: `landed` and `culprits` are task keys.
export function recordBatch(
  store,
  { repositoryId, base },
  { landed = [], culprits = [], held, waiting, halve, at, seconds },
) {
  return store.transaction(() => {
    const all = store.getMeta(META) ?? {},
      before = sizeRecord(store, { repositoryId, base }),
      next = afterBatch(before, {
        landed: landed.length,
        culprits: culprits.length,
        held,
        waiting,
        halve,
      });
    next.alone = [
      ...before.alone.filter((k) => !landed.includes(k)),
      ...culprits.filter((k) => !before.alone.includes(k)),
    ];
    // The page's "Last merge batches": outcome, size and duration.
    if (at)
      next.last = [
        ...before.last,
        {
          at,
          size: held,
          landed: landed.length,
          culprits: culprits.length,
          seconds,
          outcome: !culprits.length
            ? "landed"
            : landed.length
              ? "partly landed"
              : "culprit sent back",
        },
      ].slice(-LAST);
    store.setMeta(META, {
      ...all,
      [repositoryId]: { ...(all[repositoryId] ?? {}), [base]: next },
    });
    return next;
  });
}

// The merge batch being tested now, for the Landing queue page: {members,
// step, since}, or null when none runs. Plain data in the store's meta.
const NOW = "mergeBatchNow";
export function setTesting(store, { repositoryId, base }, value) {
  store.transaction(() => {
    const all = store.getMeta(NOW) ?? {},
      mine = { ...(all[repositoryId] ?? {}) };
    if (value) mine[base] = value;
    else delete mine[base];
    store.setMeta(NOW, { ...all, [repositoryId]: mine });
  });
}

export const testingNow = (store, { repositoryId, base }) =>
  store.getMeta(NOW)?.[repositoryId]?.[base] ?? null;
