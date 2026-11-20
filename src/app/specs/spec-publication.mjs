// Make the GitHub issues (Requirement 102.1-102.2, 115.7). The tick
// publishes a spec an approval adopted (publishApproved, workflow v1 rule
// 8.1); `avoozl spec publish` is a person's retry. One issue for the spec and
// one for its epic; the spec issue is made under its epic's issue when GitHub
// allows the link. An issue the workspace already holds for the spec or epic
// (a plan or epic issue from projection) is reused, so the assignee read
// from it stays. Publishing again writes nothing.
//
// shortcut: the home is the named or only configured repository.
import { fail } from "../store/store.mjs";
import { epicOfPlan } from "../epics/epics.mjs";
import { asJob } from "../github/github-jobs.mjs";
import { personOf } from "../github/github.mjs";
import { noreplyLogin } from "../git/git-approvals.mjs";

const receiptId = (level, id) => `github-parent:${level}:${id}`;
const lower = (value) => String(value ?? "").toLowerCase();

// An input issue may become a spec's journal home only in that home's own
// repository. The same repository has the same visibility.
const reusableInput = (input, home) =>
  Boolean(input?.repository && home) &&
  Number.isInteger(input.number) &&
  lower(input.repository) === lower(home);

function homeRepository(store, repository) {
  const configured = store.list("github_repositories");
  const config = repository
    ? configured.find((entry) => lower(entry.id) === lower(repository))
    : configured.length === 1
      ? configured[0]
      : null;
  if (!config)
    fail(
      repository
        ? `${repository} is not a configured repository.`
        : "Name the repository that holds this spec's issue.",
      400,
    );
  return config;
}

function remember(store, level, id, config, issue, extra = {}) {
  const existing = store.get("receipts", receiptId(level, id));
  return store.put("receipts", {
    ...(existing || {}),
    id: receiptId(level, id),
    kind: "github-parent",
    level,
    parentId: id,
    repository: config.id,
    number: issue.number,
    nodeId: issue.node_id ?? null,
    databaseId: Number(issue.id) || null,
    url: issue.html_url ?? null,
    ...extra,
    updatedAt: new Date().toISOString(),
  });
}

// The hidden comment that names the spec or epic an issue is for (workflow
// rule 8.2), so a rebuilt cache finds the issue again.
const issueMark = (kind, id) => `<!-- avoozl:${kind} ${id} -->`;
const MARK = /<!-- avoozl:(spec|epic) ([A-Za-z0-9][A-Za-z0-9._-]{0,159}) -->/;

const issueBody = (kind, id) =>
  [
    `This ${kind}'s one assignee drives it in Avoozl. Reassign it to hand the ${kind} to someone else.`,
    "",
    "The design and the tasks stay in the spec's files.",
    "",
    issueMark(kind, id),
  ].join("\n");

// Read every open spec and epic issue back from its hidden comment, in each
// repository with a GitHub name, and keep the oldest per spec. Reads only.
// shortcut: two open issues for one spec are not closed here (rule 8.2);
// the older one is used.
export async function readSpecIssues(store, github) {
  const found = [],
    errors = [];
  if (!github?.listIssues) return { found, errors };
  for (const repository of store.list("repositories")) {
    if (!repository.github) continue;
    let issues;
    try {
      issues = await github.listIssues(repository.github, { state: "open" });
    } catch (error) {
      errors.push({ repository: repository.github, error: error.message });
      continue;
    }
    for (const issue of [...(issues ?? [])].sort(
      (a, b) => a.number - b.number,
    )) {
      const match = MARK.exec(issue.body ?? "");
      if (!match) continue;
      const level = match[1] === "spec" ? "plan" : "epic",
        id = match[2];
      if (store.get("receipts", receiptId(level, id))?.number) continue;
      remember(
        store,
        level,
        id,
        { id: repository.github },
        issue,
        level === "plan" ? { planId: id } : {},
      );
      found.push({
        level,
        id,
        repository: repository.github,
        number: issue.number,
      });
    }
  }
  return { found, errors };
}

// Publishes one spec plan.
export async function publishSpec(
  store,
  { github, identity, planId, repository, assignees = [] },
) {
  const plan = store.get("plans", planId);
  if (!plan) fail("Plan not found.", 404);
  if (!plan.spec) fail("Only a spec plan has a spec issue.", 409);
  if (!identity?.mode || identity.mode === "local" || !github?.available?.())
    fail("Making the GitHub issues needs GitHub; run gh auth login.", 409);
  const config = homeRepository(store, repository),
    held = store.get("receipts", receiptId("plan", plan.id));
  if (held?.number) {
    const home = store.get("github_repositories", held.repository) || config;
    return {
      home: "github",
      existing: true,
      repository: home.id,
      number: held.number,
    };
  }
  const epic = epicOfPlan(store.read(), plan.id);
  // The issue a plan came from becomes its spec issue when it lives in the
  // spec's home (R102.13). shortcut: only a plan with no epic reuses it;
  // under an epic a new issue is made, so the sub-issue link comes from the
  // create call. Lift this if an epic plan should reuse its input too.
  const input = plan.context?.newPlan?.source;
  if (!epic && reusableInput(input, config.id)) {
    const issue = await github.issue(config, input.number);
    if (issue && issue.state === "open") {
      remember(store, "plan", plan.id, config, issue, {
        planId: plan.id,
        epic: null,
        reused: true,
      });
      return {
        home: "github",
        existing: false,
        reused: true,
        repository: config.id,
        number: issue.number,
      };
    }
  }
  let epicIssue = null;
  if (epic) {
    const stored = store.get("receipts", receiptId("epic", epic.id));
    if (stored?.number)
      epicIssue = {
        number: stored.number,
        node_id: stored.nodeId,
        owner: stored.repository?.split("/")[0],
      };
    else {
      const made = await asJob("spec-issues", github).createIssue(config, {
        title: epic.title || epic.id,
        body: issueBody("epic", epic.id),
        ...(identity.epicIssueType ? { type: identity.epicIssueType } : {}),
      });
      remember(store, "epic", epic.id, config, made);
      epicIssue = { ...made, owner: config.owner };
    }
  }
  // Made under its epic in the create call; GitHub links within one owner.
  const under =
    epicIssue?.node_id && lower(epicIssue.owner) === lower(config.owner)
      ? epicIssue.node_id
      : undefined;
  const issue = await asJob("spec-issues", github).createIssue(config, {
    title: plan.title || plan.id,
    body: issueBody("spec", plan.spec),
    ...(under ? { parentIssueId: under } : {}),
    ...(assignees.length ? { assignees } : {}),
  });
  remember(store, "plan", plan.id, config, issue, {
    planId: plan.id,
    epic: epic?.id ?? null,
    ...(epic && !under
      ? {
          unlinked: {
            parent: `epic.${epic.id}`,
            reason: "GitHub links sub-issues only within one owner.",
          },
        }
      : {}),
  });
  return {
    home: "github",
    existing: false,
    repository: config.id,
    number: issue.number,
    ...(epicIssue ? { epicNumber: epicIssue.number } : {}),
  };
}

// Approvals the next tick publishes (workflow v1 rule 8.1), as plan ID ->
// approval commit. Only an approval this workspace adopts or makes is queued,
// so a rebuild publishes nothing and specs approved before stay as they are.
const PENDING = "publish.pending";

export function queuePublish(store, planId, commit) {
  if (!commit) return;
  const pending = store.getMeta(PENDING) ?? {};
  if (pending[planId] === commit) return;
  store.setMeta(PENDING, { ...pending, [planId]: commit });
}

const loginsOf = (entries) =>
  (entries ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.login))
    .filter(Boolean);

const configured = (store, repository) =>
  store
    .list("github_repositories")
    .some((entry) => lower(entry.id) === lower(repository));

// Publish each queued approval that has no spec issue (rule 8.1). Only the
// runner acting as the approver publishes, so runners do not race: the login
// that merged the approving pull request, signed the commit, or pushed it
// from Approve (the evidence cache), else the commit author's GitHub login.
// Before it creates an issue it reads the open issues for one with the
// spec's marker (rule 8.2). The new issue copies the approving pull
// request's assignees, and stays unassigned when it has none or there was
// no pull request.
//   evidence  the approval evidence cache (git-approvals evidenceCache)
//   homeOf    async plan -> the GitHub repository that holds its spec, or null
// Returns [{repository, error}]; a failed spec stays queued for the next tick.
export async function publishApproved(
  store,
  { github, identity, evidence, homeOf },
) {
  const pending = store.getMeta(PENDING) ?? {};
  if (!Object.keys(pending).length) return [];
  // `identity` may be a function, read only when something is queued.
  if (typeof identity === "function") identity = identity();
  if (!identity?.mode || !github?.available?.()) {
    store.setMeta(PENDING, {});
    return [];
  }
  const left = { ...pending },
    errors = [],
    held = (planId) => store.get("receipts", receiptId("plan", planId))?.number;
  let login;
  try {
    login = await personOf(github);
    if (Object.keys(left).some((planId) => !held(planId)))
      errors.push(...(await readSpecIssues(store, github)).errors);
  } catch (error) {
    return [{ repository: "GitHub", error: error.message }];
  }
  for (const [planId, commit] of Object.entries(pending)) {
    const plan = store.get("plans", planId);
    if (!plan || plan.deletedAt || held(planId) || !login) {
      delete left[planId];
      continue;
    }
    let repository = null;
    try {
      repository = await homeOf(plan);
      if (!repository || !configured(store, repository)) {
        delete left[planId];
        continue;
      }
      const proof = evidence?.get(commit) ?? {},
        approval = store.get("approvals", plan.approvalId);
      let actor =
        proof.mergedBy ??
        proof.signer ??
        proof.pushedBy ??
        noreplyLogin(approval?.approvedBy);
      if (!actor)
        actor = (await github.commit(repository, commit))?.author?.login;
      if (String(actor ?? "").toLowerCase() !== login.toLowerCase()) {
        delete left[planId];
        continue;
      }
      const assignees = proof.pull
        ? loginsOf(
            (await github.pullRequest(repository, proof.pull))?.assignees,
          )
        : [];
      await publishSpec(store, {
        github,
        identity,
        planId,
        repository,
        assignees,
      });
      delete left[planId];
    } catch (error) {
      errors.push({ repository: repository ?? "GitHub", error: error.message });
    }
  }
  store.setMeta(PENDING, left);
  return errors;
}
