// The approval pull request (design §4.42, RC3.6). A spec Avoozl reads from
// GitHub, not a local checkout (a private spec on a mirror's plans branch,
// or an adopted spec pull request), is approved by a pull request whose
// one commit holds the spec's files as they are and is authored by the
// person approving. Its merge commit is then the approval in git, like any
// other (git-approvals.mjs): no Status line, marker or decision record.
// Avoozl records the merge commit and the approver only after that pull
// request merges, and records nothing when it closes unmerged.
//
// `store` needs getMeta and setMeta. `github` needs repository, branchHead,
// createBranch, commitFiles, createPullRequest, pullRequest and blobTexts.
// A merge counts only when the spec at the merge commit still has the hash
// that was approved, and its merger may approve (`mayApprove`).
import { branchNameProblem } from "../epics/integration-branch.mjs";
import { COMMIT, LOGIN } from "../github/github-marker.mjs";
import { fail } from "../store/store.mjs";
import {
  KIRO_FILES,
  isSpecFile,
  revisionFiles,
  specHash,
  specName,
} from "./spec-plans.mjs";
import { DEFAULT_SPECS_PATH, specsPathOf } from "./specs-path.mjs";
import { asJob } from "../github/github-jobs.mjs";

const key = (planId, hash) => `spec-approval:${planId}:${hash}`;

// What the approval pull request's commit writes: the spec's own files,
// unchanged, under `folder` (the repository's specs path). path -> text.
export function approvalChanges({
  spec,
  files,
  folder = `${DEFAULT_SPECS_PATH}/${spec}/`,
}) {
  specName(spec);
  return Object.fromEntries(
    revisionFiles(files)
      .filter((name) => typeof files[name] === "string")
      .map((name) => [`${folder}${name}`, files[name]]),
  );
}

export function approvalState(store, planId, hash) {
  return store.getMeta(key(planId, hash));
}

// The approval branch for `attempt`, or the next free name when a branch of
// that name is left over. GitHub answers 422 for a name that exists.
async function freshBranch(github, repository, spec, attempt, oid) {
  for (let tries = 0; ; tries += 1, attempt += 1) {
    const name = `avoozl/approve-${spec}${attempt > 1 ? `-${attempt}` : ""}`;
    try {
      await asJob("spec-branch", github).createBranch(repository, name, oid);
      return { name, attempt };
    } catch (error) {
      if (error.status !== 422 || tries >= 9) throw error;
    }
  }
}

// One spec's part of an approval: its earlier state (returned when a pull
// request for this revision is already open or merged) or the file changes
// a new one makes.
function approvalPart(
  store,
  {
    planId,
    hash,
    spec,
    files,
    diagnostics = [],
    approvedBy,
    ref,
    repository = null,
  },
) {
  const error = diagnostics.find((d) => d.severity === "error");
  if (error)
    fail(
      `Resolve plan diagnostic ${error.code} before approval: ${error.message}`,
      409,
    );
  if (!LOGIN.test(approvedBy || ""))
    fail("The approver must be a GitHub login.", 409);
  if (ref !== undefined && branchNameProblem(ref) !== null)
    fail("The private spec ref must be a usable branch name.", 409);
  const previous = approvalState(store, planId, hash);
  if (
    previous &&
    ["open", "merged"].includes(previous.state) &&
    previous.ref !== ref
  )
    fail(
      "The approval target changed. Close the old approval before requesting this home.",
      409,
    );
  if (previous && (previous.state === "open" || previous.state === "merged"))
    return { previous };
  const folder = `${specsPathOf(store, repository)}/${spec}/`,
    changes = approvalChanges({ spec, files, folder });
  if (
    ref !== undefined &&
    Object.keys(changes).some(
      (file) =>
        !file.startsWith(folder) ||
        file.split("/").some((part) => part === ".." || part === "."),
    )
  )
    fail("Private approval changes must stay inside the spec folder.", 409);
  return { previous, changes };
}

// The branch an approval targets, checked: a private spec's ref must be an
// orphan branch apart from the default branch.
async function approvalBase(github, repository, ref) {
  const defaultBranch = (await github.repository(repository)).default_branch,
    base = ref ?? defaultBranch,
    head = await github.branchHead(repository, base);
  if (ref !== undefined) {
    if (ref === defaultBranch)
      fail("The private spec ref must differ from the default branch.", 409);
    let orphan = false;
    try {
      await github.compareCommits(repository, defaultBranch, ref);
    } catch (error) {
      if (
        error.status === 404 &&
        /no common ancestor/i.test(error.message || "")
      )
        orphan = true;
      else fail("The private spec branch history could not be verified.", 409);
    }
    if (!orphan)
      fail(
        "The private spec branch shares history with the default branch.",
        409,
      );
  }
  return { base, head };
}

// Open the approval pull request. Returns the pending state. A pull request
// already open for this revision is returned and no second one opens.
export async function openApproval(
  store,
  {
    github,
    repository,
    planId,
    hash,
    spec,
    files,
    diagnostics = [],
    approvedBy,
    // The branch the pull request targets when it is not the default branch:
    // a private spec's plans branch (RC25.3).
    ref,
    // Configured spec reviewers; none leaves CODEOWNERS and rules to GitHub.
    reviewers = [],
    // `owner/repo#N` of the spec issue, only when visibility permits.
    specIssue = null,
    // The delegation a delegate opens it under (R109), kept on the state.
    delegation = null,
  },
) {
  const part = approvalPart(store, {
    planId,
    hash,
    spec,
    files,
    diagnostics,
    approvedBy,
    ref,
    repository,
  });
  if (!part.changes) return part.previous;
  const { previous, changes } = part,
    { base, head } = await approvalBase(github, repository, ref),
    // A closed pull request leaves its branch, so a new try takes a new name.
    firstAttempt = (previous?.attempt || 0) + 1;
  // So does a try that failed after making its branch: the name is taken.
  const branch = await freshBranch(
      github,
      repository,
      spec,
      firstAttempt,
      head.oid,
    ),
    attempt = branch.attempt;
  await asJob("spec-branch", github).commitFiles(repository, {
    branch: branch.name,
    message: `Approve spec ${spec}`,
    expectedHeadOid: head.oid,
    files: encoded(changes),
  });
  const pull = await asJob("spec-branch", github).createPullRequest(
      repository,
      {
        title: `Approve spec ${spec}`,
        head: branch.name,
        base,
        body:
          `Approves spec ${spec} as it stands. Its merge commit is the approval.` +
          (specIssue ? `\n\nSpec issue: ${specIssue}` : "") +
          delegationLine(delegation),
      },
    ),
    requested = await askReviewers(github, repository, pull.number, reviewers),
    state = {
      state: "open",
      repository: `${repository.owner}/${repository.repo}`,
      number: pull.number,
      branch: branch.name,
      attempt,
      base,
      spec,
      ...(ref !== undefined ? { ref } : {}),
      requestedBy: approvedBy,
      ...(requested.length ? { reviewersRequested: requested } : {}),
      ...(delegation ? { delegation } : {}),
    };
  store.setMeta(key(planId, hash), state);
  return state;
}

// The pull request names a delegate that opened it on a person's behalf.
const delegationLine = (delegation) =>
  delegation
    ? `\n\nOpened by approval delegate ${delegation.delegate} on behalf of @${delegation.onBehalfOf}.`
    : "";

// Requests the configured reviewers, best effort: the pull request stands
// whatever GitHub answers. Returns the logins asked.
async function askReviewers(github, repository, number, reviewers) {
  if (!reviewers?.length || !github.requestReviewers) return [];
  try {
    await asJob("spec-branch", github).requestReviewers(
      repository,
      number,
      reviewers,
    );
    return [...reviewers];
  } catch {
    return [];
  }
}

// Whether a pull request may name the spec issue (R102.12, R102.18): never
// a private issue from a public pull request. Unknown visibility links
// nothing.
export function mayLinkSpecIssue({ pullPrivate, issuePrivate }) {
  if (typeof pullPrivate !== "boolean" || typeof issuePrivate !== "boolean")
    return false;
  return pullPrivate || !issuePrivate;
}

const encoded = (changes) =>
  Object.fromEntries(
    Object.entries(changes).map(([path, text]) => [
      path,
      Buffer.from(text).toString("base64"),
    ]),
  );

// One approval pull request for several specs with the same target
// (plan.approveMany). Each spec records the same pending state, so each one
// reconciles from the one merge. A spec whose revision already has an open
// or merged approval keeps it. Returns each spec's state by plan ID.
export async function openBatchApproval(
  store,
  {
    github,
    repository,
    ref,
    approvedBy,
    specs,
    reviewers = [],
    delegation = null,
  },
) {
  const parts = specs.map((entry) => ({
      entry,
      ...approvalPart(store, {
        ...entry,
        approvedBy,
        ref,
        repository,
      }),
    })),
    fresh = parts.filter((part) => part.changes),
    result = new Map(
      parts
        .filter((part) => !part.changes)
        .map((part) => [part.entry.planId, part.previous]),
    );
  if (!fresh.length) return result;
  const { base, head } = await approvalBase(github, repository, ref),
    names = fresh.map((part) => part.entry.spec),
    branch = await freshBranch(
      github,
      repository,
      `batch-${names[0]}`,
      1,
      head.oid,
    );
  await asJob("spec-branch", github).commitFiles(repository, {
    branch: branch.name,
    message: `Approve ${names.length} specs`,
    expectedHeadOid: head.oid,
    files: encoded(Object.assign({}, ...fresh.map((part) => part.changes))),
  });
  const pull = await asJob("spec-branch", github).createPullRequest(
    repository,
    {
      title: `Approve ${names.length} specs`,
      head: branch.name,
      base,
      body:
        `Approves these specs as they stand. Its merge commit is their approval.\n\n${names.map((name) => `- ${name}`).join("\n")}` +
        delegationLine(delegation),
    },
  );
  const requested = await askReviewers(
    github,
    repository,
    pull.number,
    reviewers,
  );
  for (const part of fresh) {
    const state = {
      state: "open",
      repository: `${repository.owner}/${repository.repo}`,
      number: pull.number,
      branch: branch.name,
      attempt: part.previous?.attempt || 0,
      base,
      spec: part.entry.spec,
      ...(ref !== undefined ? { ref } : {}),
      requestedBy: approvedBy,
      ...(requested.length ? { reviewersRequested: requested } : {}),
      ...(delegation ? { delegation } : {}),
      batch: names,
    };
    store.setMeta(key(part.entry.planId, part.entry.hash), state);
    result.set(part.entry.planId, state);
  }
  return result;
}

// Every approval pull request a record still calls open, read once each
// (the specs of a batch share one), with each spec's record moved to merged
// or closed as reconcileApproval does. A failed read leaves its records open
// for the next pass. Returns each spec still waiting to be approved in
// Avoozl after its pull request merged, grouped by pull request:
// [{ repository, number, approvedBy, specs: [{ planId, hash }] }].
// `approverFor(repository)` gives each repository's mayApprove.
export async function reconcileOpenApprovals(
  store,
  { github, approverFor = null },
) {
  const entries = store.metaEntries("spec-approval:").map(([name, state]) => {
      const rest = name.slice("spec-approval:".length),
        cut = rest.lastIndexOf(":");
      return { planId: rest.slice(0, cut), hash: rest.slice(cut + 1), state };
    }),
    pulls = new Map();
  for (const entry of entries) {
    if (entry.state?.state !== "open") continue;
    const id = `${entry.state.repository}#${entry.state.number}`;
    if (!pulls.has(id)) pulls.set(id, []);
    pulls.get(id).push(entry);
  }
  for (const group of pulls.values()) {
    const { repository, number } = group[0].state;
    let pull;
    try {
      pull = await github.pullRequest(repository, number);
    } catch {
      continue;
    }
    const once = {
      pullRequest: async () => pull,
      blobTexts: (...args) => github.blobTexts(...args),
      commit: async (...args) => github.commit?.(...args),
      pullRequestReviews: (...args) => github.pullRequestReviews?.(...args),
    };
    const mayApprove = approverFor?.(repository) ?? null;
    for (const entry of group)
      try {
        entry.state = await reconcileApproval(store, {
          github: once,
          repository,
          mayApprove,
          planId: entry.planId,
          hash: entry.hash,
        });
      } catch {
        // A wrong base or a missing merge commit approves nothing.
      }
  }
  const merged = new Map();
  for (const entry of entries) {
    if (entry.state?.state !== "merged") continue;
    const plan = store.get("plans", entry.planId);
    if (!plan || plan.deletedAt || plan.hash !== entry.hash) continue;
    if (approvalOf(store, plan)) continue;
    const id = `${entry.state.repository}#${entry.state.number}`;
    if (!merged.has(id))
      merged.set(id, {
        repository: entry.state.repository,
        number: entry.state.number,
        approvedBy: entry.state.approvedBy,
        specs: [],
      });
    merged.get(id).specs.push({ planId: entry.planId, hash: entry.hash });
  }
  return [...merged.values()];
}
const approvalOf = (store, plan) =>
  store
    .list("approvals")
    .some((a) => a.planId === plan.id && a.hash === plan.hash);

// Read the pull request. Only a merged one records the merge commit and the
// approver; a closed unmerged one is marked closed and records neither.
export async function reconcileApproval(
  store,
  { github, repository, planId, hash, ref, mayApprove = null },
) {
  const state = approvalState(store, planId, hash);
  if (
    state &&
    state.state !== "closed" &&
    ref !== undefined &&
    state.ref !== ref
  )
    fail(
      "The approval target changed. Request approval in the current spec home.",
      409,
    );
  if (!state || state.state !== "open") return state;
  const pull = await github.pullRequest(repository, state.number);
  if (pull.merged) {
    const actualBase =
      typeof pull.base === "string" ? pull.base : pull.base?.ref;
    if (state.ref && actualBase !== state.ref)
      fail(
        "The approval merged into a different branch from the private spec home.",
        409,
      );
    if (!COMMIT.test(pull.merge_commit_sha || ""))
      fail("GitHub returned no merge commit for the approval.", 502);
    // The spec as it landed: a commit pushed to the approval branch before
    // the merge changes what was approved, and approves nothing.
    const spec = state.spec ?? store.get?.("plans", planId)?.spec,
      folder = `${specsPathOf(store, repository)}/${specName(spec)}/`,
      // Kiro's files and the ones this revision holds.
      names = [
        ...new Set([
          ...KIRO_FILES,
          ...Object.keys(store.get?.("plans", planId)?.files ?? {}),
        ]),
      ].filter(isSpecFile),
      texts = await github.blobTexts(
        repository,
        pull.merge_commit_sha,
        names.map((file) => folder + file),
      ),
      landed = {};
    for (const file of names) {
      const text = texts.get(folder + file);
      if (typeof text === "string") landed[file] = text;
    }
    const mergedBy = pull.merged_by?.login ?? null,
      landedHash = specHash(landed);
    // The approval is the merge commit's author (git-approvals.mjs): the
    // committer and the merger neither grant nor block it.
    if (mayApprove) {
      // A squash merge's author is the pull request's author; the commit
      // read says so exactly when it answers.
      const merged = await (async () =>
          github.commit?.(repository, pull.merge_commit_sha))().catch(
          () => null,
        ),
        email = merged?.commit?.author?.email ?? null;
      if (
        !(await mayApprove(
          email,
          pull.merge_commit_sha,
          merged?.author?.login ?? pull.user?.login ?? null,
        ))
      ) {
        const next = {
          ...state,
          state: "refused",
          commit: pull.merge_commit_sha,
          author: email,
          mergedBy,
          verified: false,
        };
        store.setMeta(key(planId, hash), next);
        return next;
      }
    }
    if (landedHash !== hash) {
      const next = {
        ...state,
        state: "changed",
        commit: pull.merge_commit_sha,
        landedHash,
        mergedBy,
        verified: false,
      };
      store.setMeta(key(planId, hash), next);
      return next;
    }
    // Evidence after the merge (§4.32.6): who asked, who actually approved
    // on GitHub, who merged and when, and that the re-hash matched.
    const next = {
      ...state,
      state: "merged",
      commit: pull.merge_commit_sha,
      approvedBy: state.requestedBy,
      reviewers: await approvingReviewers(github, repository, state.number),
      mergedBy,
      mergedAt: pull.merged_at ?? null,
      verified: true,
    };
    store.setMeta(key(planId, hash), next);
    return next;
  }
  if (pull.state === "closed") {
    const next = { ...state, state: "closed" };
    store.setMeta(key(planId, hash), next);
    return next;
  }
  return state;
}

// The logins whose newest decisive review approved the pull request. A
// failed read records none; the approval itself does not depend on them.
async function approvingReviewers(github, repository, number) {
  let reviews;
  try {
    reviews = (await github.pullRequestReviews?.(repository, number)) ?? [];
  } catch {
    return [];
  }
  const latest = new Map();
  for (const review of reviews) {
    const login = review?.user?.login,
      state = String(review?.state ?? "").toUpperCase();
    if (login && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(state))
      latest.set(login, state);
  }
  return [...latest]
    .filter(([, state]) => state === "APPROVED")
    .map(([login]) => login)
    .sort();
}

// The evidence line of an approval that merged: the commit and who merged it.
export const approvalEvidence = (state) =>
  `Approval merged at ${state.commit}${state.mergedBy ? ` by @${state.mergedBy}` : ""}.`;

// Refuse an approval whose pull request merged a different revision.
export function approvalChangedAtMerge(state) {
  if (state?.state === "refused")
    fail(
      `The approval pull request merged at ${String(state.commit).slice(0, 12)}, but its author ${state.author ?? "(unknown)"} is not on the approvers list. Nothing was approved.`,
      409,
    );
  if (state?.state === "changed")
    fail(
      `The approval pull request merged a different revision (${String(state.landedHash).slice(0, 12)} at ${String(state.commit).slice(0, 12)}). Nothing was approved. Reload the spec and approve it again.`,
      409,
    );
}
