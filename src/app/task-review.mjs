import { resolveTaskId } from "../task-identity.mjs";
import { statusComplete } from "../query.mjs";

function repositoryBase(store, task) {
  if (typeof task.github?.url === "string") {
    try {
      const url = new URL(task.github.url);
      const marker = url.pathname.match(/\/(?:issues|pull)\/\d+(?:\/|$)/);
      if (marker) {
        url.pathname = url.pathname.slice(0, marker.index);
        url.search = "";
        url.hash = "";
        return url.href.replace(/\/$/, "");
      }
    } catch {}
  }
  const repository =
    task.github?.repository ||
    store
      .list("github_repositories")
      .find((entry) => entry.projectId === task.projectId)?.id ||
    "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `https://github.com/${repository}`
    : "";
}

function codeChanges(store, data, task, runs, evidenceRecords) {
  const base = repositoryBase(store, task),
    commits = new Map(),
    pulls = new Map();
  const addCommit = (sha, source) => {
    if (typeof sha !== "string" || !/^[a-f0-9]{7,64}$/i.test(sha)) return;
    const existing = commits.get(sha);
    commits.set(sha, {
      sha,
      source: existing?.source || source,
      url: existing?.url || (base ? `${base}/commit/${sha}` : ""),
    });
  };
  const addPull = (value) => {
    if (typeof value === "string") value = { url: value };
    if (!value || typeof value.url !== "string" || !value.url) return;
    pulls.set(value.nodeId || value.url, {
      nodeId: value.nodeId || null,
      number: Number(value.number) || null,
      url: value.url,
      title: typeof value.title === "string" ? value.title : "",
      state: typeof value.state === "string" ? value.state : "",
    });
  };
  addCommit(task.integration?.commit, "Integrated");
  for (const evidence of evidenceRecords)
    addCommit(
      evidence.commit,
      evidence.kind === "command" ? "Validated" : "Evidence",
    );
  for (const run of runs) {
    addCommit(run.expectedCommit, "Run output");
    addCommit(run.integratedCommit, "Integrated");
    addPull(run.pullRequest);
    for (const pull of run.pullRequests || []) addPull(pull);
  }
  for (const pull of task.github?.pullRequests || []) addPull(pull);
  for (const pull of task.pullRequests || []) addPull(pull);
  for (const receipt of store.list("receipts"))
    if (
      typeof receipt.taskId === "string" &&
      resolveTaskId(data, receipt.taskId) === task.id &&
      typeof receipt.url === "string" &&
      /\/pull\/\d+(?:\/|$)/.test(receipt.url)
    )
      addPull(receipt);
  return {
    commits: [...commits.values()],
    pullRequests: [...pulls.values()],
  };
}

export function taskReviewContext(store, data, task) {
  const runs = store
      .list("runs")
      .filter((run) => resolveTaskId(data, run.taskId) === task.id),
    evidenceRecords = store
      .list("evidence")
      .filter((entry) => resolveTaskId(data, entry.taskId) === task.id);
  return {
    status: task.status,
    complete: statusComplete(data, task.status),
    progressPercent: task.progressPercent ?? null,
    acceptance: task.acceptance || [],
    acceptanceEvidence: task.acceptanceEvidence || null,
    integration: task.integration || null,
    needsReview: Boolean(task.needsReview),
    evidence: (task.evidence || []).slice(0, 100),
    codeChanges: codeChanges(store, data, task, runs, evidenceRecords),
    checks: evidenceRecords
      .filter((entry) => entry.kind === "command")
      .slice(-40)
      .map((entry) => ({
        argv: entry.argv || [],
        exitCode: entry.exitCode ?? null,
        phase: entry.phase || null,
        commit: entry.commit || null,
        at: entry.endedAt || entry.startedAt || null,
        failure:
          entry.exitCode === 0
            ? undefined
            : String(entry.stderr || "").slice(-2000) || undefined,
      })),
    sessions: runs
      .filter((run) => run.mode === "implement")
      .slice(-20)
      .map((run) => ({
        id: run.id,
        state: run.state,
        provider: run.provider || null,
        branch: run.branch || null,
        worktree: run.worktree || null,
        expectedCommit: run.expectedCommit || null,
        integratedCommit: run.integratedCommit || null,
        createdAt: run.createdAt || null,
      })),
  };
}
