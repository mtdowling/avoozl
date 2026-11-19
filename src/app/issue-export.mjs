// Export issues (Requirement 102.19, R91.2, R103.6; design §4.32.11): the
// offboarding path, and the only one meant to create task issues once task
// projection is retired (56.5). It hands a spec's unfinished work away from
// Avoozl.
//
//   preview  what would be made: one issue per incomplete leaf, then the
//            blocked-by links between them. Writes nothing.
//   apply    holds the spec first (no dispatch, no landing), then creates the
//            issues and links, recording a stable binding after each write,
//            then posts `Status: Exported` on the spec issue and marks the
//            spec Exported. Avoozl stops driving it.
//
// A retry creates nothing twice: a recorded binding is reused, a task that
// already has a projected issue keeps it, and a create whose answer was lost
// is found again by its export marker. A failure part way leaves the spec
// held in `exporting` and a retry resumes where it stopped. Person outcomes
// and the journal are kept.
//
// Export issues never carry crew:avoozl (owner decision 2026-11-16): the
// create names the `export` opt-out, so Issue Radar and people may take
// them. Writes go through the caller's GitHub client, which paces them and
// runs the content and privacy scan before each one (guardGitHub).
import { digest, statusComplete } from "../model.mjs";
import { completionReached, taskKind, taskRepository } from "../work-model.mjs";
import { fail } from "./store.mjs";

const receiptId = (planId) => `issue-export:${planId}`;
const lower = (value) => String(value ?? "").toLowerCase();
// Opaque and stable: names no task, title or plan.
const exportKey = (planId, taskId) =>
  digest(`export:${planId}:${taskId}`).slice(0, 20);
const markerOf = (key) => `<!-- avoozl-export:${key} -->`;
const MARKER = /<!-- avoozl-export:([0-9a-f]{20}) -->/;

export const exportOf = (store, planId) =>
  store.get("receipts", receiptId(planId)) || null;

// Specs an export holds or finished: Avoozl no longer dispatches or lands
// their tasks (driver-scope.mjs reads this).
export function exportedPlanIds(store) {
  return new Set(
    store
      .list("receipts")
      .filter((row) => row.kind === "issue-export" && row.state)
      .map((row) => row.planId),
  );
}

function repositoryFor(store, task, named) {
  const configured = store.list("github_repositories");
  if (named) {
    const config = configured.find((c) => lower(c.id) === lower(named));
    if (!config) fail(`${named} is not a configured repository.`, 400);
    return config;
  }
  const project = taskRepository(task),
    owned = configured.filter((c) => c.projectId === project);
  if (owned.length === 1) return owned[0];
  if (configured.length === 1) return configured[0];
  fail(`Name the repository for ${task.id}'s issue.`, 400);
}

function bodyOf(task, key) {
  return [
    task.prose || task.title || task.id,
    ...(task.acceptance?.length
      ? ["", "## Acceptance", "", ...task.acceptance.map((line) => `- ${line}`)]
      : []),
    "",
    "Exported from an Avoozl spec. Avoozl no longer drives this work.",
    markerOf(key),
  ].join("\n");
}

// The plan's incomplete leaves and the links between them, in task order.
function planOf(store, planId, named) {
  const plan = store.get("plans", planId);
  if (!plan) fail("Plan not found.", 404);
  const data = store.read(),
    complete = (status) => statusComplete(data, status),
    tasks = data.tasks.filter(
      (task) =>
        task.planId === planId &&
        taskKind(task) === "leaf" &&
        !task.archivedAt &&
        task.status !== "superseded" &&
        !completionReached(task, null, complete),
    ),
    ids = new Set(tasks.map((task) => task.id)),
    items = tasks.map((task) => {
      const config = repositoryFor(store, task, named);
      return {
        taskId: task.id,
        key: exportKey(planId, task.id),
        repository: config.id,
        title: task.title || task.id,
        body: bodyOf(task, exportKey(planId, task.id)),
        // A projected issue is this task's issue already.
        existing:
          task.github?.number && task.github.origin !== "issue"
            ? {
                number: task.github.number,
                databaseId: task.github.issueId ?? null,
                nodeId: task.github.nodeId ?? null,
              }
            : null,
      };
    }),
    links = data.edges
      .filter(
        (edge) =>
          ["requires", "blocks"].includes(edge.kind) &&
          ids.has(edge.from) &&
          ids.has(edge.to),
      )
      .map((edge) => ({ blocker: edge.from, blocked: edge.to }));
  return { plan, items, links };
}

export function previewExport(store, { planId, repository } = {}) {
  const { items, links } = planOf(store, planId, repository),
    current = exportOf(store, planId),
    bound = current?.bindings || {};
  return {
    planId,
    state: current?.state ?? null,
    create: items
      .filter((item) => !bound[item.taskId] && !item.existing)
      .map(({ taskId, repository: repo, title }) => ({
        taskId,
        repository: repo,
        title,
      })),
    reuse: items
      .filter((item) => bound[item.taskId] || item.existing)
      .map((item) => ({
        taskId: item.taskId,
        number: bound[item.taskId]?.number ?? item.existing.number,
      })),
    links: links.filter(
      (link) =>
        !(current?.links || []).includes(`${link.blocker}>${link.blocked}`),
    ),
  };
}

const configOf = (store, id) => store.get("github_repositories", id) || id;

function save(store, row) {
  return store.put("receipts", { ...row, updatedAt: new Date().toISOString() });
}

// A create whose answer was lost: the issue carrying this key's marker.
async function findByMarker(github, repository, key) {
  if (!github.listIssues) return null;
  const issues = await github.listIssues(repository, { state: "all" });
  return issues.find((issue) => MARKER.exec(issue.body || "")?.[1] === key);
}

export async function applyExport(
  store,
  { github, planId, repository, actor = null } = {},
) {
  if (!github?.available?.()) fail("Export issues needs GitHub.", 400);
  const { items, links } = planOf(store, planId, repository);
  // Hold first: from here no dispatch and no landing for this spec.
  let row = exportOf(store, planId) || {
    id: receiptId(planId),
    kind: "issue-export",
    planId,
    startedAt: new Date().toISOString(),
    startedBy: actor,
    bindings: {},
    links: [],
  };
  if (row.state === "exported") return { ...row, created: 0, linked: 0 };
  row = save(store, { ...row, state: "exporting", error: null });
  let created = 0,
    linked = 0;
  try {
    for (const item of items) {
      if (row.bindings[item.taskId]) continue;
      let issue = item.existing
        ? {
            number: item.existing.number,
            id: item.existing.databaseId,
            node_id: item.existing.nodeId,
            reused: true,
          }
        : null;
      if (!issue && row.pending?.[item.taskId])
        issue = await findByMarker(
          github,
          configOf(store, item.repository),
          item.key,
        );
      if (!issue) {
        row = save(store, {
          ...row,
          pending: { ...(row.pending || {}), [item.taskId]: item.key },
        });
        issue = await github.createIssue(configOf(store, item.repository), {
          title: item.title,
          body: item.body,
          withoutCrewLabel: "export",
        });
        created += 1;
      }
      const { [item.taskId]: _done, ...pending } = row.pending || {};
      row = save(store, {
        ...row,
        pending,
        bindings: {
          ...row.bindings,
          [item.taskId]: {
            repository: item.repository,
            number: issue.number,
            databaseId: Number(issue.id) || null,
            nodeId: issue.node_id ?? null,
            key: item.key,
            ...(issue.reused ? { reused: true } : {}),
          },
        },
      });
    }
    for (const link of links) {
      const id = `${link.blocker}>${link.blocked}`;
      if (row.links.includes(id)) continue;
      const blocked = row.bindings[link.blocked],
        blocker = row.bindings[link.blocker];
      if (lower(blocked.repository) !== lower(blocker.repository)) {
        row = save(store, {
          ...row,
          unlinked: [...new Set([...(row.unlinked || []), id])],
          links: [...row.links, id],
        });
        continue;
      }
      // A link already on GitHub (an earlier answer lost) is not added again.
      const existing = github.listIssueBlockers
        ? await github.listIssueBlockers(
            configOf(store, blocked.repository),
            blocked.number,
          )
        : [];
      if (
        !existing.some(
          (entry) =>
            Number(entry?.id) === blocker.databaseId ||
            entry?.number === blocker.number,
        )
      ) {
        await github.addIssueBlocker(
          configOf(store, blocked.repository),
          blocked.number,
          blocker.databaseId,
        );
        linked += 1;
      }
      row = save(store, { ...row, links: [...row.links, id] });
    }
    // The spec issue, when published, says so once.
    const spec = store.get("receipts", `github-parent:plan:${planId}`);
    if (spec?.number && !row.statusComment) {
      const comment = await github.createIssueComment(
        configOf(store, spec.repository),
        spec.number,
        "Status: Exported. Avoozl no longer drives this spec; its unfinished tasks are now separate issues.",
      );
      row = save(store, { ...row, statusComment: comment?.id ?? true });
    }
    row = save(store, {
      ...row,
      state: "exported",
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    row = save(store, { ...row, error: error.message });
    error.exportHeld = true;
    throw error;
  }
  return { ...row, created, linked };
}
