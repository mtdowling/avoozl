// Approval as a commit (design D5.2, RC3.6, RC3.8). Approve opens a pull
// request in the repository that holds the spec. It sets `Status: Approved`
// in the three prose files and, with the decision record on, adds
// docs/decisions/<spec>.md. Avoozl records the merge commit and the approver
// only after that pull request merges, and records nothing when it closes
// unmerged. The Status line is outside the revision hash (see specHash).
//
// `store` needs getMeta and setMeta. `github` needs repository, branchHead,
// createBranch, putFile, createPullRequest and pullRequest.
import { COMMIT, LOGIN } from "./github-marker.mjs";
import { fail } from "./store.mjs";
import { specName, statusOf, withStatus } from "./spec-plans.mjs";

export { statusOf, withStatus, withoutStatus } from "./spec-plans.mjs";

const PROSE = ["requirements.md", "bugfix.md", "design.md", "tasks.md"];

const key = (planId, hash) => `spec-approval:${planId}:${hash}`;

export function proseFiles(files) {
  const names = PROSE.filter((name) => files[name] !== undefined);
  // A spec has requirements.md or bugfix.md, never both.
  return names.filter(
    (name) => name !== "bugfix.md" || files["requirements.md"] === undefined,
  );
}

export function decisionRecord(spec) {
  return `# Decision: ${spec}\n\nStatus: Accepted\n\nThe spec .kiro/specs/${spec}/ is approved. Automation may build it.\n`;
}

// What the approval pull request changes: path -> new text.
export function approvalChanges({
  spec,
  files,
  decisionRecord: record,
  extra = {},
}) {
  specName(spec);
  const changes = {};
  for (const name of proseFiles(files))
    changes[`.kiro/specs/${spec}/${name}`] = withStatus(
      files[name],
      "Approved",
    );
  if (record) changes[`docs/decisions/${spec}.md`] = decisionRecord(spec);
  // Files the pull request adds as they are (a quick goal's manifest).
  return { ...changes, ...extra };
}

export function approvalState(store, planId, hash) {
  return store.getMeta(key(planId, hash));
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
    decisionRecord: record = false,
    extra = {},
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
  const previous = approvalState(store, planId, hash);
  if (previous && (previous.state === "open" || previous.state === "merged"))
    return previous;
  const prose = proseFiles(files);
  if (prose.every((name) => statusOf(files[name]) === "Approved") && !record)
    fail("This spec already says Status: Approved.", 409);
  const changes = approvalChanges({
      spec,
      files,
      decisionRecord: record,
      extra,
    }),
    base = (await github.repository(repository)).default_branch,
    head = await github.branchHead(repository, base),
    // A closed pull request leaves its branch, so a new try takes a new name.
    attempt = (previous?.attempt || 0) + 1,
    branch = `avoozl/approve-${spec}${attempt > 1 ? `-${attempt}` : ""}`;
  await github.createBranch(repository, branch, head.oid);
  for (const [path, text] of Object.entries(changes))
    await github.putFile(repository, {
      path,
      branch,
      message: `Approve spec ${spec}`,
      content: Buffer.from(text).toString("base64"),
    });
  const pull = await github.createPullRequest(repository, {
      title: `Approve spec ${spec}`,
      head: branch,
      base,
      body: `Sets Status: Approved on spec ${spec}. Merge to make the approval a commit.`,
    }),
    state = {
      state: "open",
      repository: `${repository.owner}/${repository.repo}`,
      number: pull.number,
      branch,
      attempt,
      base,
      requestedBy: approvedBy,
    };
  store.setMeta(key(planId, hash), state);
  return state;
}

// Read the pull request. Only a merged one records the merge commit and the
// approver; a closed unmerged one is marked closed and records neither.
export async function reconcileApproval(
  store,
  { github, repository, planId, hash },
) {
  const state = approvalState(store, planId, hash);
  if (!state || state.state !== "open") return state;
  const pull = await github.pullRequest(repository, state.number);
  if (pull.merged) {
    if (!COMMIT.test(pull.merge_commit_sha || ""))
      fail("GitHub returned no merge commit for the approval.", 502);
    const next = {
      ...state,
      state: "merged",
      commit: pull.merge_commit_sha,
      approvedBy: state.requestedBy,
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
