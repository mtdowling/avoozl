// Independent refresh of a spec's git content and its GitHub state
// (Requirement 102.17, design §4.32.9, task 56.6).
//
// Each part has its own cache key and its own read, so no part's change
// hides another's:
// - Content: the branch head, then the spec files' blob hashes. A head that
//   moved with the same blobs is not reparsed; same blobs mean the same
//   definitions. Only new blobs reparse.
// - Ownership and journal: the spec issue (and the epic issue, when there
//   is one) read conditionally. A new comment or an assignee change moves
//   the issue, so an unchanged answer (a 304) means neither changed. Holds,
//   stops and reassignment are seen with no branch commit.
// - Pull requests: the pull request, its reviews and its head's checks,
//   each read conditionally, independent of branch commits.
//
// This is the cheap view for pages and readiness. Safety does not rest on
// it: every journal write, dispatch and landing replays the whole journal
// first (spec-journal.mjs appendRecord, driver-generations.mjs revalidate).
// shortcut: no webhook receiver exists yet, so only conditional reads mark
// a part changed; when one lands, let its event force that part's read.
import { driverState, effectiveOwner } from "./driver-generations.mjs";
import { githubJournal, replayJournal } from "./spec-journal.mjs";
import { taskDefinition } from "./task-outcomes.mjs";

const key = (value) =>
  JSON.stringify(
    Object.entries(value ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)),
  );

const logins = (issue) =>
  (issue?.assignees ?? []).map((user) => user?.login).filter(Boolean);

// The serializable part of a replay that refresh keeps.
function journalSummary(replay) {
  const state = driverState(replay);
  return {
    held: replay.held,
    reasons: replay.reasons.map(({ id, reason }) => ({ id, reason })),
    generation: state.generation,
    driver: state.driver,
    controls: Object.fromEntries(state.controls),
    tail: replay.tail,
  };
}

const reviewSummary = (reviews) =>
  (reviews ?? []).map((review) => ({
    id: review.id,
    login: review.user?.login ?? null,
    state: review.state,
    commit: review.commit_id ?? null,
  }));

const checkSummary = (runs) =>
  (runs ?? []).map((run) => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion ?? null,
  }));

// One refresh. `previous` is the last returned `state` (or nothing). Each
// source is read independently; see githubRefreshSources for their shape.
// Returns {state, changed, reparsed, definitions, owner, journal, replay}:
// `changed` names the parts that changed, `definitions` the tasks whose
// definition digest changed, and `replay` the full replay when the journal
// was read.
export async function refreshSpec(previous, sources, options = {}) {
  const state = structuredClone(previous ?? {}),
    changed = new Set(),
    result = { reparsed: false, definitions: [], replay: null };

  // Content: head, then blob hashes, then (only if those moved) the parse.
  const head = await sources.head(),
    content = state.content ?? {};
  if (head !== content.head) {
    changed.add("head");
    const blobs = Object.fromEntries(head ? await sources.blobs(head) : []);
    if (key(blobs) === key(content.blobs)) state.content = { ...content, head };
    else {
      changed.add("files");
      const tasks = head ? await sources.parse(head) : {},
        definitions = Object.fromEntries(
          Object.entries(tasks ?? {}).map(([task, entry]) => [
            task,
            taskDefinition(entry),
          ]),
        ),
        before = content.definitions ?? {};
      result.reparsed = true;
      result.definitions = [
        ...new Set([...Object.keys(before), ...Object.keys(definitions)]),
      ]
        .filter((task) => before[task] !== definitions[task])
        .sort();
      if (result.definitions.length) changed.add("definitions");
      state.content = { head, blobs, definitions };
    }
  }

  // Ownership and the journal, from the issues, not from the branch.
  const issues = state.issues ?? {};
  const spec = await sources.issue(issues.spec?.etag),
    epic = sources.epic ? await sources.epic(issues.epic?.etag) : null;
  const specIssue = spec.changed
      ? { etag: spec.etag, assignees: logins(spec.value) }
      : issues.spec,
    epicIssue = epic?.changed
      ? { etag: epic.etag, assignees: logins(epic.value) }
      : (issues.epic ?? null);
  const owner = effectiveOwner({
    spec: specIssue?.assignees ?? [],
    epic: epicIssue?.assignees ?? [],
  });
  if (key(owner) !== key(state.owner)) changed.add("owner");
  state.issues = { spec: specIssue, epic: epicIssue };
  state.owner = owner;
  if (spec.changed || !state.journal) {
    result.replay = await replayJournal(await sources.journal(), {
      ...options,
      permission: sources.permission,
    });
    const summary = journalSummary(result.replay);
    if (key(summary.controls) !== key(state.journal?.controls))
      changed.add("controls");
    if (
      summary.generation !== state.journal?.generation ||
      summary.driver !== state.journal?.driver
    )
      changed.add("generation");
    if (summary.held !== Boolean(state.journal?.held)) changed.add("held");
    if (key(summary.tail) !== key(state.journal?.tail)) changed.add("journal");
    state.journal = summary;
  }

  // Pull requests: each read on its own.
  const pulls = state.pulls ?? {};
  for (const source of sources.pulls ?? []) {
    const was = pulls[source.number] ?? {},
      now = { ...was },
      pull = await source.pull(was.pull?.etag);
    if (pull.changed) {
      now.pull = {
        etag: pull.etag,
        head: pull.value?.head?.sha ?? null,
        state: pull.value?.state ?? null,
        merged: Boolean(pull.value?.merged),
        mergeCommit: pull.value?.merge_commit_sha ?? null,
      };
      if (key(now.pull) !== key({ ...was.pull, etag: pull.etag }))
        changed.add("pulls");
    }
    const reviews = await source.reviews(was.reviews?.etag);
    if (reviews.changed) {
      now.reviews = { etag: reviews.etag, list: reviewSummary(reviews.value) };
      if (key(now.reviews.list) !== key(was.reviews?.list))
        changed.add("reviews");
    }
    const sha = now.pull?.head;
    if (sha) {
      // A new head has new checks; the old head's tag says nothing about it.
      const checks = await source.checks(
        sha,
        was.checks?.sha === sha ? was.checks.etag : undefined,
      );
      if (checks.changed) {
        now.checks = {
          sha,
          etag: checks.etag,
          runs: checkSummary(checks.value?.check_runs ?? checks.value),
        };
        if (
          key(now.checks.runs) !== key(was.checks?.runs) ||
          sha !== was.checks?.sha
        )
          changed.add("checks");
      }
    }
    pulls[source.number] = now;
  }
  state.pulls = pulls;

  return {
    state,
    changed: [...changed].sort(),
    reparsed: result.reparsed,
    definitions: result.definitions,
    owner,
    journal: state.journal,
    replay: result.replay,
  };
}

// A conditional GET: {changed: false} on a 304, else {changed, etag, value}.
async function conditional(github, pathname, etag, query) {
  const result = await github.request("GET", pathname, {
    query,
    headers: true,
    etag: etag || undefined,
  });
  return result.notModified
    ? { changed: false, etag }
    : { changed: true, etag: result.etag, value: result.value };
}

const repoPath = (repository) =>
  repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

// The sources refreshSpec reads, over GitHub and repo files (repo-files.mjs).
// - `repository`, `branch`: where the spec's files live; `prefix` and
//   `want(path)` pick them; `parse(sha)` returns {task: manifestEntry}.
// - `issue`: {repository, number} of the spec issue; `epic` likewise.
// - `pulls`: [{repository, number}] to watch.
export function githubRefreshSources(
  github,
  files,
  { repository, branch, prefix, want, parse, issue, epic, pulls = [] },
) {
  const journal = githubJournal(github, issue.repository, issue.number),
    issueRead = (target) => (etag) =>
      conditional(
        github,
        `/repos/${repoPath(target.repository)}/issues/${target.number}`,
        etag,
      );
  return {
    head: () => files.head(repository, branch),
    blobs: async (sha) =>
      (await files.readAt(repository, sha, { prefix, want, text: () => false }))
        .blobs,
    parse,
    issue: issueRead(issue),
    ...(epic ? { epic: issueRead(epic) } : {}),
    journal: journal.list,
    permission: journal.permission,
    pulls: pulls.map(({ repository: target, number }) => {
      const base = `/repos/${repoPath(target)}/pulls/${number}`;
      return {
        number,
        pull: (etag) => conditional(github, base, etag),
        // shortcut: the first 100 reviews only; page when a PR has more.
        reviews: (etag) =>
          conditional(github, `${base}/reviews`, etag, { per_page: 100 }),
        checks: (sha, etag) =>
          conditional(
            github,
            `/repos/${repoPath(target)}/commits/${sha}/check-runs`,
            etag,
            { per_page: 100 },
          ),
      };
    }),
  };
}
