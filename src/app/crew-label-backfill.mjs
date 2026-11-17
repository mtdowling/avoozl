// The crew:avoozl backfill (R103.5, design §4.32.11). An Issue Radar crew
// with an empty scope takes any open issue that has no `crew:` label, and
// task issues Avoozl projected before 56.12 carry none. This adds
// `crew:avoozl` once to each open projected task issue with no `crew:`
// label, after a preview a person confirms. Writes go through the client's
// write pacer; a paced stop keeps what was written, and a retry reads the
// labels again, so it adds nothing twice. An issue a crew already labeled is
// left alone and gets one Needs you row. Avoozl removes no crew label.
import { AVOOZL_CREW_LABEL, hasAvoozlLabel } from "./github.mjs";
import { fail } from "./store.mjs";

const ROWS = "crewLabelBackfillRows";
const lower = (value) => String(value ?? "").toLowerCase();
const names = (issue) =>
  (issue?.labels || []).map((label) => String(label?.name ?? label));
const ref = (repository, number) => `${repository}#${number}`;

// One entry per projected task issue: the open task issues Avoozl made.
function projected(store) {
  const seen = new Map();
  for (const task of store.read().tasks)
    if (task.github?.repository && Number.isSafeInteger(task.github.number))
      seen.set(lower(ref(task.github.repository, task.github.number)), {
        taskId: task.id,
        repository: task.github.repository,
        number: task.github.number,
      });
  return [...seen.values()];
}

// Reads each projected issue and sorts it: `add` gets the label, `claimed`
// carries a crew's label and is left alone, `labeled` already has it.
async function survey(store, github) {
  const add = [],
    claimed = [],
    errors = [];
  let labeled = 0,
    closed = 0;
  for (const entry of projected(store)) {
    const config =
      store.get("github_repositories", entry.repository) || entry.repository;
    let issue;
    try {
      issue = await github.issue(config, entry.number);
    } catch (error) {
      errors.push({ ...entry, error: error.message });
      continue;
    }
    if (!issue || issue.state === "closed") {
      closed += 1;
      continue;
    }
    const labels = names(issue);
    if (hasAvoozlLabel(labels)) labeled += 1;
    else if (labels.some((label) => lower(label).startsWith("crew:")))
      claimed.push({
        ...entry,
        title: issue.title ?? "",
        url: issue.html_url ?? null,
        crewLabels: labels.filter((label) => lower(label).startsWith("crew:")),
      });
    else
      add.push({
        ...entry,
        config,
        title: issue.title ?? "",
        url: issue.html_url ?? null,
      });
  }
  return { add, claimed, labeled, closed, errors };
}

const shown = ({ config, ...entry }) => entry;

// ---- Needs you rows ------------------------------------------------------

const readRows = (store) => store.getMeta(ROWS) || {};

// One row per claimed issue, kept until a later run no longer finds it.
function syncRows(store, claimed) {
  const before = readRows(store),
    next = {};
  for (const entry of claimed) {
    const id = `crew-label-claimed:${lower(ref(entry.repository, entry.number))}`;
    next[id] = before[id] ?? {
      id,
      issue: {
        number: entry.number,
        repository: entry.repository,
        url: entry.url,
      },
      link: entry.url,
      title: `A crew already has ${ref(entry.repository, entry.number)}`,
      detail: `Task ${entry.taskId}'s issue carries ${entry.crewLabels.join(", ")}, so Avoozl did not add ${AVOOZL_CREW_LABEL}. Avoozl leaves a crew's labels alone; decide who keeps this issue.`,
      openedAt: new Date().toISOString(),
    };
  }
  if (JSON.stringify(before) !== JSON.stringify(next))
    store.setMeta(ROWS, next);
}

export const crewLabelNeedsYou = (store) =>
  Object.values(readRows(store)).map((row) => ({
    kind: "needs-human",
    reason: "crew-label",
    taskId: null,
    authority: "github",
    ...row,
  }));

// `github.crewlabel.backfill`: `{preview: true}` reads and lists; `{confirm:
// true}` adds the label to the issues the preview listed that still need it.
// Person-only (operations.mjs).
export async function crewLabelBackfill(store, github, input = {}) {
  if (!github?.available?.()) fail("GitHub is not connected.", 409);
  if (input.preview !== true && input.confirm !== true)
    fail("Preview the backfill, then confirm it.");
  const found = await survey(store, github);
  syncRows(store, found.claimed);
  const preview = {
    label: AVOOZL_CREW_LABEL,
    add: found.add.map(shown),
    claimed: found.claimed,
    labeled: found.labeled,
    closed: found.closed,
    errors: found.errors,
  };
  if (input.preview === true) return { ...preview, written: [] };
  const written = [];
  for (const entry of found.add) {
    try {
      await github.addLabels(entry.config, entry.number, [AVOOZL_CREW_LABEL]);
      written.push(shown(entry));
    } catch (error) {
      // A paced stop or a failure keeps what was written; run it again later.
      return {
        ...preview,
        written,
        stopped: {
          ...shown(entry),
          error: error.message,
          paced: error.paced === true,
        },
      };
    }
  }
  return { ...preview, written };
}
