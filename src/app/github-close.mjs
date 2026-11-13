// Completion and close-without-code for GitHub leaves (design §6.5,
// Requirements 16 and 33). GitHub closes every leaf issue; Avoozl only reads
// the close, records a verdict on the task, and writes the marker `order`.
// It never closes, reopens, or edits a leaf issue's state. Parents are the
// one exception: Avoozl closes a parent issue whose children are all done.
import { recordGitHubTiming } from "./flow-checks.mjs";
import { digest, statusComplete } from "../model.mjs";
import { canonical } from "./store.mjs";
import {
  allowWrite,
  check as checkContent,
  contentBinding,
} from "./content-rules.mjs";
import {
  completionReached,
  taskAuthority,
  taskKind,
  taskRepository,
} from "../work-model.mjs";
import { inspectGitHubTaskCompletion } from "./github-completion.mjs";
import {
  parseMarker,
  renderMarker,
  withOrder,
  withoutOrder,
} from "./github-marker.mjs";
import {
  CREW_LABEL_DEFAULTS,
  actorAllowed,
  uncheckedReason,
} from "./github-policy.mjs";
import { reviewHoldReason, reviewVerdict } from "./github-reviews.mjs";
import { branchReviewRule, ruleBranch } from "./github-branch-rules.mjs";
import {
  codeRepository,
  isLinkedBranchLeaf,
  linkedBranch,
  linkedBranchName,
  pullRequestLeak,
} from "./github-plans-repo.mjs";
import { FINAL_STATUSES, listSessionBindings } from "./session-bindings.mjs";

const MARKER_BLOCK = /<!--\s*avoozl-task\s*\n[\s\S]*?\n-->/;
const AUTOMATION = /^github-project-automation(\[bot\])?$/i;

// Projection's question for a managed issue that is closed while its task is
// not done. The tick has already judged the close; projection only reads the
// verdict and never closes, reopens, or edits the issue itself.
//   "order"    an allowed actor's close without code: done by order;
//   "decision" anything else: hold the dependents and ask a person.
export function closeWithoutCode({ task, issue }) {
  if (task.githubVerdict?.state === "order")
    return { verdict: "order", reason: "" };
  return {
    verdict: "decision",
    reason:
      task.githubVerdict?.reason ||
      `Issue #${issue.number} for ${task.id} is closed (${issue.state_reason || "no reason"}) but the task is not done.`,
  };
}

// Notes for a dependent whose blocker closed without merged code (R33.9).
// The verdict carries the issue link only outside plans-repo mode.
export function blockerNotes(data, task) {
  const notes = [];
  for (const edge of data.edges) {
    if (edge.to !== task.id || !["requires", "sequence"].includes(edge.kind))
      continue;
    const blocker = data.tasks.find((candidate) => candidate.id === edge.from),
      order =
        (blocker?.githubVerdict?.state === "order" && blocker.githubVerdict) ||
        (blocker?.trackerVerdict?.state === "order" &&
          blocker.trackerVerdict) ||
        (blocker?.intakeVerdict?.state === "order" && blocker.intakeVerdict);
    if (!order) continue;
    const name = order.issue
      ? `${blocker.id} (${order.issue})`
      : `${blocker.id} "${blocker.title || blocker.id}"`;
    notes.push(
      `Blocker ${name} closed without merged code: ${order.order.actor} closed it as ${order.order.reason.toLowerCase()} at ${order.order.closedAt}. Check whether its code exists before relying on it.`,
    );
  }
  return notes;
}

const login = (event) => event?.actor?.login || "";

// Who closed the issue: the newest `closed` event's actor. A close by the
// Auto-close workflow names the project automation; then the person is the
// newest Status change's actor at or before the close. shortcut: the Status
// change is read from the REST events and timeline as
// `project_v2_item_status_changed` (Inferred until proof P11); both lists are
// one page of 100.
export async function readCloser(github, repository, issue) {
  const [events, timeline] = await Promise.all([
      github.issueEvents(repository, issue.number),
      github.issueTimeline
        ? github.issueTimeline(repository, issue.number)
        : Promise.resolve([]),
    ]),
    closed = (events || []).filter((event) => event.event === "closed").at(-1);
  if (!closed || !login(closed)) return null;
  const closedAt = closed.created_at || issue.closed_at,
    reason =
      String(closed.state_reason || issue.state_reason || "").toLowerCase() ===
      "not_planned"
        ? "NOT_PLANNED"
        : "COMPLETED";
  if (!AUTOMATION.test(login(closed)))
    return { actor: login(closed), reason, closedAt, source: "close-event" };
  const drag = [...(events || []), ...(timeline || [])]
    .filter(
      (event) =>
        event.event === "project_v2_item_status_changed" &&
        login(event) &&
        !AUTOMATION.test(login(event)) &&
        String(event.created_at || "") <= String(closedAt || ""),
    )
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .at(-1);
  return drag
    ? { actor: login(drag), reason, closedAt, source: "status-change" }
    : null;
}

// Pull requests once each, by URL.
function unique(pulls) {
  const seen = new Set();
  return pulls.filter((pull) => {
    const key = pull.url || pull.id || pull.number;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A verdict without its bookkeeping, to tell a real change from a re-read.
// Key order does not count: a stored verdict has gained fields since.
const stable = (verdict) =>
  verdict &&
  canonical({ ...verdict, key: null, at: null, previousStatus: null });

export function verdictKey(issue) {
  return [issue.state, issue.state_reason, issue.closed_at, issue.updated_at]
    .map((value) => value ?? "")
    .join("|");
}

// Write the marker `order`, and keep the stored body hashes in step (as the
// Project marker write does) so the new body does not read as a person's
// edit and rebuild finds the hash SQLite holds.
async function writeMarker(store, github, task, issue, change, options) {
  const repository = task.github.repository,
    marker = parseMarker(issue.body);
  if (marker?.version !== 2) return false;
  const next = change(marker);
  if (JSON.stringify(next) === JSON.stringify(marker)) return false;
  const body = String(issue.body).replace(MARKER_BLOCK, () =>
      renderMarker(next, options),
    ),
    updated = await github.updateIssue(repository, issue.number, { body }),
    text = String(updated?.body ?? body),
    bodyHash = digest(text),
    previousHash = digest(String(issue.body || ""));
  store.transaction(() => {
    const row = store
      .list("github_issues")
      .find(
        (entry) => entry.taskId === task.id && entry.repository === repository,
      );
    if (row)
      store.put("github_issues", {
        ...row,
        body: text,
        bodyHash,
        // A trigger snapshot of the body before our write moves with it.
        ...(row.snapshotHash === previousHash
          ? { snapshotHash: bodyHash }
          : {}),
      });
    const data = structuredClone(store.read()),
      local = data.tasks.find((candidate) => candidate.id === task.id);
    if (local?.github && local.github.bodyHash !== bodyHash) {
      local.github.bodyHash = bodyHash;
      store.commit(data, `Record issue body for ${task.id}`);
    }
  });
  return true;
}

// How many approving reviews the code repository's base branch requires:
// GitHub's own rule when it can be read (owner decision 2026-11-12), else
// the deprecated `pullRequestReviews` key in .avoozl.json, else none.
// shortcut: an unreadable rule counts as none, because GitHub itself still
// refuses the merge the rule guards; upgrade if rules can be bypassed.
// The same holds for classic protection hidden from a non-admin
// (`rule.hidden`): only the count GitHub showed applies, none is invented.
async function neededApprovals(reviewRule, repo, code) {
  const rule = reviewRule ? await reviewRule(code, repo) : null;
  if (rule?.approvals) return rule.approvals;
  return repo.pullRequestReviews ? (repo.pullRequestReviews.approvals ?? 1) : 0;
}

// The reviews on `pull`'s head, when the leaf's code repository needs
// approvals (task 9.10); else null.
async function readReviews(github, repo, code, pull, reviewRule) {
  const needed = await neededApprovals(reviewRule, repo, code);
  if (!needed || !pull?.number) return null;
  const reviews = await github.pullRequestReviews(code, pull.number);
  return reviewVerdict(
    { ...repo, pullRequestReviews: { approvals: needed } },
    pull,
    reviews,
    async (login) =>
      (await github.permission(code, login))?.permission || "none",
  );
}

// The pull request whose reviews an open leaf shows: the newest open one,
// else the newest merged one.
function shownPullRequest(pulls) {
  const newest = (list) =>
    [...list].sort((a, b) => (b.number || 0) - (a.number || 0))[0];
  return (
    newest(pulls.filter((p) => p.merged !== true && p.state !== "CLOSED")) ||
    newest(pulls.filter((p) => p.merged === true)) ||
    null
  );
}

// The first candidate pull request a content rule blocks: {url, text}, or
// null. `text` names set, rule, field and line, never the matched text.
async function pullRequestContent(store, github, pulls, code, task) {
  if (!contentBinding(store)?.workspaceRoot) return null;
  for (const pull of pulls || []) {
    const fields = [
      ["title", pull.title],
      ["body", pull.body],
      ...(pull.commits || []).map((commit) => [
        commit.oid
          ? `commit ${commit.oid.slice(0, 12)} message`
          : "commit message",
        commit.message,
      ]),
    ];
    for (const [field, text] of fields) {
      if (typeof text !== "string" || !text) continue;
      const input = {
        boundary: "github",
        repository: code,
        target: `pull:${code}#${pull.number}:${field}`,
        text,
      };
      if (!allowWrite(store, input, { taskId: task.id })) {
        const found = checkContent(store, input);
        const first = found.findings[0];
        return {
          url: pull.url,
          text: first
            ? `content rule ${first.set} rule ${first.rule} matches its ${field} line ${first.line}`
            : `content rule set ${found.unavailable[0]?.set} is unavailable`,
        };
      }
    }
    if (pull.number && pull.merged !== true && github.listPullRequestFiles) {
      const { files } = await github.listPullRequestFiles(code, pull.number);
      const added = files.flatMap((file) =>
        patchAdded(file.filename, file.patch),
      );
      if (!added.length) continue;
      const input = {
        boundary: "diff",
        repository: code,
        target: `pull:${code}#${pull.number}:diff`,
        added,
      };
      if (!allowWrite(store, input, { taskId: task.id })) {
        const first = checkContent(store, input).findings[0];
        return {
          url: pull.url,
          text: first
            ? `content rule ${first.set} rule ${first.rule} matches ${first.target} line ${first.line}`
            : "a content rule set covering its diff is unavailable",
        };
      }
    }
  }
  return null;
}

// Added lines of one file's unified diff patch.
function patchAdded(file, patch) {
  const lines = [];
  let next = 0;
  for (const line of String(patch || "").split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) next = Number(hunk[1]);
    else if (line.startsWith("+"))
      lines.push({ target: file, line: next++, text: line.slice(1) });
    else if (!line.startsWith("-")) next += 1;
  }
  return lines;
}

// One verdict for one GitHub leaf from its issue as GitHub reports it now.
async function judge(github, store, task, issue, { policy, mode, reviewRule }) {
  const repository = task.github.repository,
    code = codeRepository(store, task, mode),
    repo = (code && policy.repositories[code]) || {},
    project = store.get("projects", taskRepository(task)),
    options = {
      baseBranch: repo.baseBranch || project?.baseBranch || "main",
      requiredChecks: repo.requiredChecks || [],
      codeRepository: code || repository,
    };
  const closing = await github.closingPullRequests(repository, issue.number),
    linked = Boolean(code) && isLinkedBranchLeaf(task, policy),
    // For a linked-branch leaf the pull requests on its branch, merged or
    // not, are read with the closers: the leak screen (plans-repo mode)
    // and the merged-but-open check use them (§6.6).
    candidates = linked
      ? unique([
          ...closing,
          ...(await github.branchPullRequests(code, linkedBranchName(task.id))),
        ])
      : closing;
  if (linked) {
    const leak = pullRequestLeak(candidates, policy.planningRepository);
    if (leak)
      return {
        state: "held",
        leak: true,
        retry: true,
        pullRequest: leak.url,
        reason: `Pull request ${leak.url} names the planning repository (${leak.form}) in its ${leak.field}. Edit that text; completion waits until it no longer does.`,
      };
  }
  // Content rules (§4.9 `github` pull requests and `diff`): candidate pull
  // request titles, bodies, commit messages and added lines. A match holds
  // completion, opens a decision, and tells the worker the rule and place.
  const content = await pullRequestContent(
    store,
    github,
    candidates,
    code || repository,
    task,
  );
  if (content)
    return {
      state: "held",
      leak: true,
      retry: true,
      pullRequest: content.url,
      reason: `Pull request ${content.url}: ${content.text}. Edit that text; completion waits until it no longer matches.`,
    };
  if (issue.state !== "closed") {
    // Merged and passing while the issue stays open: GitHub did not close
    // it (wrong base, no link). Avoozl asks; it does not close it.
    const merged = candidates.filter((pull) => pull.merged === true);
    for (const pull of merged) {
      const checked = await inspectGitHubTaskCompletion(github, task, {
        ...options,
        issue: { ...issue, state: "closed", state_reason: "completed" },
        closing: [pull],
      });
      if (checked.completed)
        return {
          state: "held",
          reason: `Pull request ${pull.url} merged and passed, but issue #${issue.number} is still open.`,
        };
    }
    // A dispatched plans-repo leaf is still read every tick (`watched` in
    // reconcileGitHubCompletion): its pull request changes without touching
    // the planning issue.
    const reviews = await readReviews(
      github,
      repo,
      code || repository,
      shownPullRequest(candidates),
      reviewRule,
    );
    return reviews ? { state: "open", reviews } : { state: "open" };
  }
  const checked = await inspectGitHubTaskCompletion(github, task, {
    ...options,
    issue,
    closing,
  });
  if (checked.completed) {
    // With pull-request reviews on, they are the leaf's review gate: the
    // merged head needs its allowed approvals before dependents start.
    const reviews = await readReviews(
        github,
        repo,
        code || repository,
        { ...closing[0], headRefOid: checked.headSha },
        reviewRule,
      ),
      held = reviews && reviewHoldReason(reviews);
    if (held)
      return {
        state: "held",
        retry: true,
        reason: held,
        pullRequest: checked.pullRequest,
        headSha: checked.headSha,
        reviews,
      };
    return {
      state: "verified",
      pullRequest: checked.pullRequest,
      headSha: checked.headSha,
      checks: checked.checks,
      ...(checked.mergedAt ? { mergedAt: checked.mergedAt } : {}),
      ...(reviews ? { reviews } : {}),
    };
  }
  if (checked.conflict || checked.mergedCloser)
    return {
      state: "held",
      reason: checked.reason,
      ...(checked.headSha ? { headSha: checked.headSha } : {}),
      ...(checked.checks ? { checks: checked.checks } : {}),
    };
  // Closed with no merged closing pull request: an order or a decision.
  // A crew closes with the owner's login, so a close on an issue it claims
  // is never an order (R52.8, overriding R33.8 for claimed issues).
  const claim = (repo.crewLabels || CREW_LABEL_DEFAULTS).claim,
    claimed = (issue.labels || []).some(
      (label) =>
        String(
          typeof label === "string" ? label : label?.name,
        ).toLocaleLowerCase() === claim.toLocaleLowerCase(),
    );
  if (claimed)
    return {
      state: "held",
      reason: `Issue #${issue.number} closed without merged code while it carries Issue Radar's claim "${claim}". A crew closes with your login, so Avoozl does not count this as your order. Check the crew's work in Issue Radar, then reopen the issue or settle this decision.`,
    };
  const closer = await readCloser(github, repository, issue);
  if (!closer)
    return {
      state: "held",
      reason: `Issue #${issue.number} closed without merged code and no person can be read as its closer.`,
    };
  let permission = null;
  if (repo.minimumPermission)
    try {
      permission =
        (await github.permission(code || repository, closer.actor))
          ?.permission || "none";
    } catch (error) {
      // No push access: GitHub will not show the closer's permission.
      if (error?.status !== 403) throw error;
      return {
        state: "held",
        reason: `Issue #${issue.number} closed without merged code by ${closer.actor}. ${uncheckedReason(repo, closer.actor)}`,
        closer,
      };
    }
  const check = actorAllowed(repo, closer.actor, permission);
  if (!check.allowed)
    return {
      state: "held",
      reason: `Issue #${issue.number} closed without merged code by ${closer.actor}, whom the policy does not allow: ${check.reason}`,
      closer,
    };
  return {
    state: "order",
    order: {
      actor: closer.actor,
      reason: closer.reason,
      closedAt: closer.closedAt,
    },
    source: closer.source,
    // Plans-repo mode names the blocker by task ID and title only (R28.7).
    issue: mode === "plans-repo" ? null : issue.html_url || null,
  };
}

// The tick's GitHub step: judge every GitHub leaf whose issue changed since
// its last verdict, write orders into markers, then close parent issues whose
// children are all done. Only repositories this machine writes are read. A
// tick with no GitHub change writes nothing. Returns notices for the cron.
export async function reconcileGitHubCompletion(store, github, { policy }) {
  const writers = writerRepositories(store),
    mode = policy.mode,
    markerOptions = { planningRepository: policy.planningRepository },
    notify = [],
    messages = [];
  if (!writers.size) return { notify, messages };
  const data = store.read(),
    complete = data.statuses.find((status) => status.complete)?.id;
  // Each code repository's branch review rule, read once per tick.
  const rules = new Map(),
    reviewRule = (code, repo) => {
      if (!rules.has(code))
        rules.set(
          code,
          ruleBranch(github, code, repo)
            .then((branch) =>
              branch ? branchReviewRule(github, code, branch) : null,
            )
            .catch(() => null),
        );
      return rules.get(code);
    };
  for (const task of data.tasks) {
    const repository = task.github?.repository;
    if (
      taskKind(task) !== "leaf" ||
      !task.github?.number ||
      !writers.has(repository)
    )
      continue;
    const issue = await github.issue(repository, task.github.number),
      key = verdictKey(issue),
      previous = task.githubVerdict;
    // Cached: recomputed only when GitHub changes. A held verdict waiting on
    // checks is retried, because checks change without touching the issue,
    // and so is an open linked-branch leaf the tick has dispatched.
    // An open leaf whose repository reads pull-request reviews is watched
    // too: a review changes nothing on the issue. shortcut: two GitHub reads
    // per open leaf per tick; batch them in one GraphQL query if a
    // repository has many open leaves.
    const code = codeRepository(store, task, mode),
      watched =
        (!previous || previous.state === "open") &&
        ((isLinkedBranchLeaf(task, policy) && linkedBranch(store, task.id)) ||
          (issue.state !== "closed" &&
            Boolean(
              code &&
                (await neededApprovals(
                  reviewRule,
                  policy.repositories[code] || {},
                  code,
                )),
            )));
    if (previous?.key === key && !previous.retry && !watched) continue;
    const verdict = await judge(github, store, task, issue, {
      policy,
      mode,
      reviewRule,
    });
    verdict.key = key;
    if (verdict.state === "held" && /checks/i.test(verdict.reason))
      verdict.retry = true;
    if (verdict.state === "order")
      await writeMarker(
        store,
        github,
        task,
        issue,
        (marker) => withOrder(marker, verdict.order),
        markerOptions,
      );
    if (verdict.state !== "order" && previous?.state === "order")
      await writeMarker(
        store,
        github,
        task,
        issue,
        withoutOrder,
        markerOptions,
      );
    if (stable(previous) === stable(verdict)) {
      // Only the issue changed (often our own marker write): keep the key.
      // A re-read that found nothing new writes nothing.
      if (previous.key !== key)
        store.mutate(`GitHub verdict key for ${task.id}`, (draft) => {
          draft.tasks.find((t) => t.id === task.id).githubVerdict.key = key;
        });
      continue;
    }
    const done = ["verified", "order"].includes(verdict.state),
      wasDone = ["verified", "order"].includes(previous?.state),
      decision =
        verdict.state === "held" ? `github-completion:${task.id}` : null;
    store.mutate(`GitHub verdict ${verdict.state} for ${task.id}`, (draft) => {
      const row = draft.tasks.find((candidate) => candidate.id === task.id);
      row.githubVerdict = {
        ...verdict,
        previousStatus: wasDone ? previous.previousStatus : row.status,
        at: new Date().toISOString(),
      };
      if (done && complete && !statusComplete(draft, row.status))
        row.status = complete;
      if (!done && wasDone) row.status = previous.previousStatus || "planned";
      if (decision) row.decision = decision;
      else if (String(row.decision || "").startsWith("github-completion:"))
        row.decision = null;
    });
    // Timing (§4.11): CI wait and CI-only failures from this same read.
    await recordGitHubTiming(store, task, verdict).catch(() => {});
    if (verdict.state === "order")
      store.put("receipts", {
        id: `github-order:${task.id}`,
        taskId: task.id,
        repository,
        number: issue.number,
        ...verdict.order,
        source: verdict.source,
        at: new Date().toISOString(),
      });
    if (verdict.state !== "order" && previous?.state === "order")
      store.remove("receipts", `github-order:${task.id}`);
    if (verdict.state === "held" && previous?.reason !== verdict.reason)
      notify.push({
        channel: "decision",
        title: `${task.id} needs a decision`,
        text: verdict.reason,
        resume: verdict.leak
          ? "Ask the worker to edit the pull request text; the next tick reads it again."
          : "Decide on GitHub, then the next tick reads it.",
      });
    // The tick's own worker is asked to fix its text (R28.8); a Crew Mode
    // conductor sees the decision in next.
    if (verdict.leak && previous?.reason !== verdict.reason) {
      const worker = listSessionBindings(store)
        .filter(
          (b) =>
            b.taskId === task.id &&
            b.role === "worker" &&
            b.source === "tick" &&
            !FINAL_STATUSES.has(b.status),
        )
        .sort((a, b) => b.attempt - a.attempt)[0];
      if (worker)
        messages.push({
          slot: worker.slot,
          task: task.id,
          text: `Avoozl task ${task.id}: ${verdict.reason} Rewrite it with \`gh pr edit\` (title or body) or by amending and force-pushing your branch (commit messages), using only this task's own title and acceptance.`,
        });
    }
  }
  return { notify, messages };
}

// Repositories this machine writes. Read only: a machine identity is minted
// when a repository is registered, never by the tick.
function writerRepositories(store) {
  const machine = store.getMeta("machineIdentity")?.id;
  if (!machine) return new Map();
  return new Map(
    store
      .list("github_repositories")
      .filter((entry) => entry.activeMachine === machine)
      .map((entry) => [entry.id, entry]),
  );
}

// A parent issue closes as completed, by Avoozl, once every child is done
// (R12.6). No pull request closes a parent. Runs after completeParents.
export async function closeGitHubParents(store, github) {
  const writers = writerRepositories(store);
  for (const parent of store.read().tasks) {
    if (
      taskKind(parent) !== "package" ||
      !parent.childrenComplete ||
      parent.githubClosedAt ||
      !parent.github?.number ||
      !writers.has(parent.github.repository)
    )
      continue;
    const issue = await github.issue(
      parent.github.repository,
      parent.github.number,
    );
    if (issue.state !== "closed")
      await github.updateIssue(parent.github.repository, parent.github.number, {
        state: "closed",
        state_reason: "completed",
      });
    store.mutate(`Close parent issue for ${parent.id}`, (draft) => {
      draft.tasks.find((t) => t.id === parent.id).githubClosedAt =
        new Date().toISOString();
    });
  }
}

// Plan and epic issues (Requirement 59.8): Avoozl closes a plan issue once
// every task of its plan is complete, and an epic issue once every member
// plan's issue is closed. No pull request closes either, in either mode.
export async function closePlanAndEpicIssues(store, github) {
  const writers = writerRepositories(store),
    data = store.read(),
    complete = (status) => statusComplete(data, status),
    receipts = store
      .list("receipts")
      .filter((row) => row.kind === "github-parent"),
    close = async (row) => {
      if (row.closedAt || !writers.has(row.repository)) return;
      const issue = await github.issue(row.repository, row.number);
      if (issue.state !== "closed")
        await github.updateIssue(row.repository, row.number, {
          state: "closed",
          state_reason: "completed",
        });
      store.put("receipts", { ...row, closedAt: new Date().toISOString() });
      row.closedAt = true;
    };
  for (const row of receipts.filter((entry) => entry.level === "plan")) {
    const tasks = data.tasks.filter(
      (task) =>
        task.planId === row.planId &&
        taskAuthority(task) !== "local" &&
        !task.archivedAt &&
        task.status !== "superseded",
    );
    if (
      tasks.length &&
      tasks.every((task) => completionReached(task, null, complete))
    )
      await close(row);
  }
  for (const row of receipts.filter((entry) => entry.level === "epic")) {
    const epic = (data.epics || []).find((entry) => entry.id === row.parentId),
      members = (epic?.plans || []).map((id) =>
        receipts.find((entry) => entry.level === "plan" && entry.planId === id),
      );
    if (members.length && members.every((entry) => entry?.closedAt))
      await close(row);
  }
}
