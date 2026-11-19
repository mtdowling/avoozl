// Spec pull requests (Requirement 107, design §4.36). An open pull request
// that changes only one spec folder of a planning repository is adopted into
// its spec instead of waiting in Triage: its head becomes a draft revision,
// the second-model review runs on it, and Approve approves exactly that head
// and then merges the pull request once its checks pass.
//
// Detection reads the Triage search result only (untriaged.mjs). GitHub is
// called to read the head's spec files once per new head, to read a
// non-owner author's permission once a day, and for a person's action.
// Every state lives in one `spec-pr:<repository>#<number>` receipt.
import { unifiedDiff } from "./text-diff.mjs";
import { actorAllowed } from "./github-policy.mjs";
import { headGuardedMerge } from "./driver-generations.mjs";
import { decidePlanReview } from "./plan-review-step.mjs";
import { planReviewSummary } from "./plan-review-summary.mjs";
import { resolveRoles } from "./repository-roles.mjs";
import { approvedBefore, diffSpec } from "./spec-changed.mjs";
import {
  CRITIQUE,
  REVISION_FILES,
  createSpecPlan,
  saveSpecPlan,
  specHash,
} from "./spec-plans.mjs";
import { workingBranch } from "./working-heads.mjs";
import { fail } from "./store.mjs";

const SPEC_PULL_KIND = "spec-pr";
const SPEC_ROOT = ".kiro/specs/";
// The same allowed-actor or minimum-permission check the trigger labels use.
async function allowedActor(github, policy, repository, login) {
  if (!login) return { allowed: false, reason: "The actor could not be read." };
  const rules = policy?.repositories?.[repository];
  if (!rules)
    return { allowed: false, reason: `No policy names ${repository}.` };
  try {
    const permission = rules.minimumPermission
      ? ((await github.permission(repository, login))?.permission ?? "none")
      : null;
    return actorAllowed(rules, login, permission);
  } catch (error) {
    return {
      allowed: false,
      reason: `Permission not readable: ${error.message}`,
    };
  }
}

// How long an author's permission answer is kept.
const AUTHOR_TTL_MS = 24 * 60 * 60 * 1000;
// A merge GitHub refused is tried again after this long, or on a new head.
const MERGE_RETRY_MS = 10 * 60 * 1000;
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const lower = (value) => String(value ?? "").toLocaleLowerCase();
const MAX_DIFF = 20000;

export const receiptId = (repository, number) =>
  `${SPEC_PULL_KIND}:${lower(repository)}#${number}`;

// The role of one repository in a normalized policy, whether or not its
// entry names one (design §4.34).
export function roleOf(policy, repository) {
  try {
    return resolveRoles({
      mode: policy?.mode ?? null,
      planningRepository: policy?.planningRepository ?? null,
      repositories: policy?.repositories ?? {},
    }).roles[repository];
  } catch {
    return undefined;
  }
}

// The spec a cached pull request item proposes, or null (R107.1): open, in a
// planning or both repository, a complete file list, every file under one
// spec folder of the spec root.
export function specPullOf(entry, role) {
  if (entry?.kind !== "pr" || !["planning", "both"].includes(role)) return null;
  const files = entry.files;
  if (
    !files ||
    !Array.isArray(files.paths) ||
    !files.paths.length ||
    files.paths.length !== files.total
  )
    return null;
  const names = new Set();
  for (const path of files.paths) {
    if (typeof path !== "string" || !path.startsWith(SPEC_ROOT)) return null;
    const [name, ...rest] = path.slice(SPEC_ROOT.length).split("/");
    if (!NAME.test(name) || !rest.length || rest.includes("..")) return null;
    names.add(name);
  }
  return names.size === 1 ? { spec: [...names][0] } : null;
}

const receipts = (store) =>
  store.list("receipts").filter((entry) => entry.kind === SPEC_PULL_KIND);

export const openPulls = (store) =>
  receipts(store).filter((entry) => entry.state === "open");

// The open spec pull request of a spec, by spec name.
export const pullFor = (store, spec) =>
  openPulls(store).find((entry) => entry.spec === spec) ?? null;

// The spec folders adopted pull requests hold, as readSpec returns them.
export function pullSpecs(store, root = null) {
  return openPulls(store).map((entry) => ({
    name: entry.spec,
    folder: `${SPEC_ROOT}${entry.spec}/`,
    exists: true,
    files: entry.files,
    hash: entry.hash,
    critique: entry.critique ?? null,
    root,
    // Marks the folder as the pull request's, not the checkout's: a planner
    // answer reads it and never writes it.
    pull: {
      repository: entry.repository,
      number: entry.number,
      url: entry.url,
      draft: entry.draft,
    },
  }));
}

// `own`, `allowed` or `person` (R107.2). An own pull request is on the
// spec's working branch or by an owner login. Anyone else passes the same
// allowed-actor and permission check trigger labels use, read once a day.
export async function linkOf(
  store,
  github,
  policy,
  { repository, entry, spec, owners = [] },
  now = Date.now(),
) {
  let branch = null;
  try {
    branch = workingBranch(spec);
  } catch {
    branch = null;
  }
  const author = lower(entry.author);
  if (branch && entry.branch === branch) return "own";
  if (author && owners.some((login) => lower(login) === author)) return "own";
  if (!author) return "person";
  const key = `spec-pr-author:${lower(repository)}:${author}`,
    kept = store.getMeta(key);
  let answer = kept && now - kept.at < AUTHOR_TTL_MS ? kept : null;
  if (!answer) {
    const checked = await allowedActor(
      github,
      policy,
      repository,
      entry.author,
    );
    answer = {
      allowed: checked.allowed === true,
      reason: checked.reason,
      at: now,
    };
    store.setMeta(key, answer);
  }
  return answer.allowed ? "allowed" : "person";
}

function readFiles(texts, spec) {
  const files = {};
  let critique = null;
  for (const file of REVISION_FILES) {
    const text = texts.get(`${SPEC_ROOT}${spec}/${file}`);
    if (typeof text === "string") files[file] = text;
  }
  const note = texts.get(`${SPEC_ROOT}${spec}/${CRITIQUE}`);
  if (typeof note === "string") critique = note;
  return { files, critique };
}

// Adopt one pull request at its current head (R107.3). A head already
// adopted only refreshes the facts the search read. Returns the receipt, or
// null when the head holds no spec files to adopt.
export async function adoptPull(
  store,
  github,
  { repository, entry, spec, link, actor = null },
  now = new Date().toISOString(),
) {
  const id = receiptId(repository, entry.number),
    current = store.get("receipts", id),
    facts = {
      url: entry.url,
      title: entry.title,
      author: entry.author ?? null,
      draft: entry.draft === true,
      checks: entry.checks ?? null,
      branch: entry.branch ?? null,
      base: entry.base ?? null,
    };
  if (current?.state === "open" && current.head === entry.headSha) {
    const next = { ...current, ...facts };
    if (JSON.stringify(next) !== JSON.stringify(current))
      store.put("receipts", next);
    return next;
  }
  if (!/^[0-9a-f]{40}$/.test(entry.headSha ?? ""))
    fail("The pull request has no head commit to read.", 409);
  const paths = [...REVISION_FILES, CRITIQUE].map(
      (file) => `${SPEC_ROOT}${spec}/${file}`,
    ),
    { files, critique } = readFiles(
      await github.blobTexts(repository, entry.headSha, paths),
      spec,
    );
  if (!Object.keys(files).length) return null;
  const folder = {
    name: spec,
    folder: `${SPEC_ROOT}${spec}/`,
    exists: true,
    files,
    hash: specHash(files),
    critique,
  };
  const plan = store.transaction(() => {
    const stored = store
      .list("plans")
      .find((plan) => plan.spec === spec && !plan.deletedAt);
    if (!stored)
      return createSpecPlan(
        store,
        { id: spec, prompt: `Spec pull request ${repository}#${entry.number}` },
        folder,
      );
    return stored.hash === folder.hash
      ? stored
      : saveSpecPlan(
          store,
          { id: stored.id, expectedHash: stored.hash },
          folder,
        );
  });
  const receipt = {
    id,
    kind: SPEC_PULL_KIND,
    state: "open",
    repository,
    number: entry.number,
    spec,
    planId: plan.id,
    head: entry.headSha,
    hash: folder.hash,
    files,
    critique,
    link,
    adoptedBy: actor,
    adoptedAt: current?.adoptedAt ?? now,
    headAt: now,
    checkedAt: now,
    ...facts,
  };
  store.put("receipts", receipt);
  // The review runs on every adopted revision, as the settings allow; Ask
  // mode waits for no choice (R107.3). A choice already made stands.
  try {
    decidePlanReview(store, {
      planId: plan.id,
      revisionHash: folder.hash,
      action: "review",
    });
  } catch {
    // This revision already has its review choice, or is not a draft.
  }
  return receipt;
}

// The tick's pass (design §4.36): adopt own and allowed spec pull requests
// from the cached Triage read, refresh the facts of adopted ones, and close
// the receipt of one that left the read after one look at it. `cache` is
// readCache(store). Returns { adopted, closed, problems }.
export async function syncSpecPulls(
  store,
  github,
  policy,
  cache,
  { owners = [], now = Date.now() } = {},
) {
  const out = { adopted: [], closed: [], problems: [] },
    seen = new Set();
  for (const [repository, read] of Object.entries(cache.repositories || {})) {
    const role = roleOf(policy, repository);
    for (const entry of read.items || []) {
      const found = specPullOf(entry, role);
      if (!found) continue;
      const id = receiptId(repository, entry.number),
        current = store.get("receipts", id);
      seen.add(id);
      try {
        if (current?.state === "open") {
          const next = await adoptPull(store, github, {
            repository,
            entry,
            spec: current.spec,
            link: current.link,
          });
          if (next && next.head !== current.head)
            out.adopted.push({
              repository,
              number: entry.number,
              spec: found.spec,
            });
          continue;
        }
        const link = await linkOf(store, github, policy, {
          repository,
          entry,
          spec: found.spec,
          owners,
        });
        if (link === "person") continue;
        if (
          await adoptPull(store, github, {
            repository,
            entry,
            spec: found.spec,
            link,
          })
        )
          out.adopted.push({
            repository,
            number: entry.number,
            spec: found.spec,
          });
      } catch (error) {
        out.problems.push(`${repository}#${entry.number}: ${error.message}`);
      }
    }
  }
  // An open receipt the search no longer returned: merged, closed, or only
  // filtered out. One look per read, never more.
  for (const receipt of openPulls(store)) {
    if (seen.has(receipt.id)) continue;
    const read = cache.repositories?.[receipt.repository];
    if (!read?.readAt || read.error || read.truncated) continue;
    if ((receipt.checkedAt ?? "") >= read.readAt) continue;
    try {
      const pull = await github.pullRequest(receipt.repository, receipt.number),
        at = new Date(now).toISOString();
      if (pull.merged || pull.state === "closed") {
        store.put("receipts", {
          ...receipt,
          state: pull.merged ? "merged" : "closed",
          endedAt: at,
          checkedAt: at,
        });
        out.closed.push({
          repository: receipt.repository,
          number: receipt.number,
        });
      } else store.put("receipts", { ...receipt, checkedAt: at });
    } catch (error) {
      out.problems.push(
        `${receipt.repository}#${receipt.number}: ${error.message}`,
      );
    }
  }
  return out;
}

// The approval an Approve click records for an adopted pull request: the
// pull request is the commit that approves, so no approval pull request
// opens (R107.6, spec-approval.mjs states). Refuses a draft.
export function recordPullApproval(store, plan, approvedBy) {
  const pull = pullFor(store, plan.spec);
  if (!pull || pull.hash !== plan.hash) return null;
  if (pull.draft)
    fail(
      "This pull request is a draft. Mark it ready for review on GitHub, then approve.",
      409,
    );
  const key = `spec-approval:${plan.id}:${plan.hash}`,
    kept = store.getMeta(key);
  if (kept?.state === "open" || kept?.state === "merged") return kept;
  const state = {
    state: "open",
    repository: pull.repository,
    number: pull.number,
    branch: pull.branch,
    attempt: (kept?.attempt || 0) + 1,
    base: pull.base,
    spec: plan.spec,
    requestedBy: approvedBy,
    pull: true,
    head: pull.head,
  };
  store.setMeta(key, state);
  return state;
}

// After Approve: merge each adopted pull request whose approval is open once
// its checks on that exact head pass (R107.6). The merge is guarded by the
// head, uses the repository's merge method, and never forces. A refused
// merge is tried again after MERGE_RETRY_MS. Returns the pull requests merged.
// shortcut: a repository with no checks never merges here; the person merges
// it on GitHub and the receipt follows.
export async function mergeApprovedPulls(
  store,
  github,
  policy,
  now = Date.now(),
) {
  const merged = [];
  for (const [name, state] of store.metaEntries("spec-approval:")) {
    if (state?.state !== "open" || state.pull !== true) continue;
    const pull = pullFor(store, state.spec);
    if (!pull || pull.number !== state.number) continue;
    const hash = name.slice(name.lastIndexOf(":") + 1);
    if (pull.head !== state.head || pull.hash !== hash) {
      // The head moved after the click: that approval approves nothing.
      store.setMeta(name, { ...state, state: "closed", superseded: true });
      continue;
    }
    if (pull.draft || pull.checks !== "passing") continue;
    if (state.refusedAt && now - state.refusedAt < MERGE_RETRY_MS) continue;
    const method =
      policy?.repositories?.[pull.repository]?.merge?.method === "merge"
        ? "merge"
        : "squash";
    if (
      await headGuardedMerge(
        github,
        pull.repository,
        pull.number,
        pull.head,
        method,
      )
    )
      merged.push({ repository: pull.repository, number: pull.number });
    else store.setMeta(name, { ...state, refusedAt: now });
  }
  return merged;
}

const approvedFiles = (store, plan) => {
  const receipt = store
    .list("approvals")
    .filter((entry) => entry.planId === plan.id && entry.files)
    .at(-1);
  return receipt?.files ?? approvedBefore(plan);
};

const changed = (before, after) => {
  const diff = unifiedDiff(before ?? "", after ?? "");
  return {
    diff: diff.length > MAX_DIFF ? `${diff.slice(0, MAX_DIFF)}\n…` : diff,
    added: diff.split("\n").filter((line) => line.startsWith("+")).length,
    removed: diff.split("\n").filter((line) => line.startsWith("-")).length,
  };
};

// One adopted pull request as the page shows it (R107.4, R107.5): the facts
// the receipt holds, the diff against the approved revision, the review's
// counts and which buttons apply. Reads the store only.
export function specPullView(store) {
  return openPulls(store).flatMap((entry) => {
    const plan = store.get("plans", entry.planId);
    if (!plan || plan.deletedAt) return [];
    const before = approvedFiles(store, plan),
      names = [
        ...new Set([...Object.keys(before ?? {}), ...Object.keys(entry.files)]),
      ],
      files = names
        .map((file) => {
          const old = before?.[file],
            now = entry.files[file];
          if (old === now) return null;
          return {
            file,
            status:
              old === undefined
                ? "added"
                : now === undefined
                  ? "removed"
                  : "changed",
            ...changed(old, now),
          };
        })
        .filter(Boolean),
      review = planReviewSummary(store, plan.id),
      approved = store
        .list("approvals")
        .some((a) => a.planId === plan.id && a.hash === entry.hash),
      pending = store.getMeta(`spec-approval:${plan.id}:${entry.hash}`);
    return [
      {
        id: entry.id,
        spec: entry.spec,
        planId: plan.id,
        title: entry.title,
        repository: entry.repository,
        number: entry.number,
        url: entry.url,
        author: entry.author,
        draft: entry.draft,
        checks: entry.checks,
        branch: entry.branch,
        head: entry.head,
        hash: entry.hash,
        link: entry.link,
        newSpec: !before,
        files,
        tasks: diffSpec(entry.spec, before ?? {}, entry.files),
        review: {
          state: review?.state ?? "not-reviewed",
          current: review?.revisionHash === entry.hash,
          found: review?.found ?? 0,
          bySeverity: review?.bySeverity ?? {},
          openBySeverity: review?.openBySeverity ?? {},
          summary: review?.summary?.current ? review.summary.text : null,
        },
        approved,
        merging: pending?.state === "open" && pending.pull === true,
        canApprove: !entry.draft && !approved && !(pending?.state === "open"),
        adoptedAt: entry.adoptedAt,
      },
    ];
  });
}

// Reject (R107.6): a comment naming the reason, then close. The caller has
// the person's confirmation.
export async function rejectPull(store, github, { id, reason }) {
  const pull = store.get("receipts", id);
  if (pull?.kind !== SPEC_PULL_KIND || pull.state !== "open")
    fail("That spec pull request is not open here.", 404);
  const text = String(reason ?? "").trim();
  if (!text) fail("Say why the pull request is rejected.", 400);
  await github.createIssueComment(
    pull.repository,
    pull.number,
    `Rejected in Avoozl: ${text}`,
  );
  await github.updateIssue(pull.repository, pull.number, { state: "closed" });
  store.put("receipts", {
    ...pull,
    state: "closed",
    endedAt: new Date().toISOString(),
    rejectedFor: text,
  });
  for (const [name, state] of store.metaEntries(
    `spec-approval:${pull.planId}:`,
  ))
    if (state?.state === "open" && state.number === pull.number)
      store.setMeta(name, { ...state, state: "closed" });
  return { closed: true };
}

// Request changes (R107.6): the review's open findings as one comment.
export async function requestChanges(store, github, { id }) {
  const pull = store.get("receipts", id);
  if (pull?.kind !== SPEC_PULL_KIND || pull.state !== "open")
    fail("That spec pull request is not open here.", 404);
  const review = planReviewSummary(store, pull.planId),
    open = (review?.open ?? []).filter((finding) => finding.current);
  if (!open.length) fail("The review has no open findings to post.", 409);
  const lines = open.map(
    (finding) =>
      `- ${finding.severity ?? "info"}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""}: ${finding.statement}`,
  );
  await github.createIssueComment(
    pull.repository,
    pull.number,
    `Changes requested on ${pull.spec} at ${pull.head.slice(0, 7)}:\n\n${lines.join("\n")}`,
  );
  return { posted: open.length };
}

// Needs you › Decisions: one item per adopted spec pull request that waits
// for the person, with the evidence inline (R107.5). Approved ones that are
// waiting to merge are not waiting for a person.
export const specPullNeedsYou = (store) =>
  specPullView(store)
    .filter((pull) => !pull.approved && !pull.merging)
    .map((pull) => ({
      id: `spec-pull:${pull.id}`,
      kind: "spec-pull",
      taskId: null,
      plan: pull.spec,
      title: `${pull.newSpec ? "New spec" : "Proposed change to"} ${pull.spec}: ${pull.title}`,
      detail: pull.draft
        ? "A draft pull request. Read it now; approving waits until it is marked ready."
        : "Read the change and the review, then approve, request changes or reject.",
      link: pull.url,
      specPull: pull,
    }));
