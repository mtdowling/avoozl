// Reanchor a held spec journal, then Resume (R102.26, design §4.32.4, task
// 56.15). Both are a person's own acts.
//
// - Reanchor previews by default. With `apply` it writes the reanchor
//   record, then a `hold` control, so the spec stays held after the journal
//   is consistent again: nothing dispatches or lands for it until Resume.
// - Resume writes the matching `release` control. It refuses while the
//   journal is still held.
import { appendRecord, reanchorJournal } from "./spec-journal.mjs";
import { specAuthority } from "./spec-takeover.mjs";
import { fail } from "./store.mjs";

const holdId = (tail) => `reanchor-${tail}`;

export async function reanchorSpec(
  store,
  context,
  { planId, held, tail, apply = false },
) {
  const { journal, options, login } = await specAuthority(
    store,
    context,
    planId,
  );
  const result = await reanchorJournal(
    journal,
    { spec: planId, held, tail, apply },
    { ...options, author: login },
  );
  if (!apply || result.after.held) return result;
  await appendRecord(
    journal,
    {
      op: `control.${holdId(tail)}`,
      kind: "control",
      spec: planId,
      controls: [{ flag: "hold", id: holdId(tail) }],
    },
    options,
  );
  return {
    ...result,
    heldUntilResume: true,
    resume: `avoozl spec journal resume ${planId} --tail ${tail}`,
  };
}

export async function resumeSpec(store, context, { planId, tail }) {
  if (!Number.isSafeInteger(Number(tail)) || Number(tail) < 1)
    fail("Name the reanchored tail record ID.", 400);
  const { journal, options } = await specAuthority(store, context, planId);
  return appendRecord(
    journal,
    {
      op: `control.${holdId(tail)}.release`,
      kind: "control",
      spec: planId,
      controls: [{ flag: "release", id: holdId(tail) }],
    },
    options,
  );
}
