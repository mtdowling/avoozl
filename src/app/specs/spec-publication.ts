// Make the GitHub issues (Requirement 102.1-102.2, 115.7). The tick
// publishes a spec an approval adopted (publishApproved, workflow v1 rule
// 8.1); `avoozl spec publish` is a person's retry. One issue for the spec and
// one for its epic; the spec issue is made under its epic's issue when GitHub
// allows the link. An issue the workspace already holds for the spec or epic
// (a plan or epic issue from projection) is reused, so the assignee read
// from it stays. Publishing again writes nothing.
//
// shortcut: the home is the named or only configured repository.
import { fail } from "../store/store.ts";
import { epicOfPlan } from "../epics/epics.ts";
import { asJob } from "../github/github-jobs.ts";
import { personOf } from "../github/github.ts";
import { noreplyLogin } from "../git/git-approvals.ts";
import type { Store } from "../store/store.ts";
import type { PlanningIdentity } from "../github/github-marker.ts";

// An issue GitHub answers, as far as publication reads it.
interface Issue {
  number: number;
  id?: unknown;
  node_id?: string;
  html_url?: string;
  state?: string;
  body?: string | null;
  pull_request?: unknown;
  author_association?: string;
}
// A configured GitHub repository.
type Config = { id: string; owner?: string; [key: string]: unknown };
// A stored issue receipt.
type Receipt = {
  id: string;
  repository?: string;
  number?: number;
  nodeId?: string | null;
};
type Plan = {
  id: string;
  spec?: string;
  title?: string;
  deletedAt?: string;
  approvalId?: string;
  context?: {
    newPlan?: { source?: { repository?: string; number?: unknown } };
  };
};
type Errors = { repository: string; error: string }[];
// The GitHub calls publication makes.
interface PublishGitHub {
  available?(value?: unknown): unknown;
  issue(config: Config, number: number): Promise<Issue | null>;
  createIssue(config: Config, issue: Record<string, unknown>): Promise<Issue>;
  listIssues?(repository: string, options: { state: string }): Promise<Issue[]>;
  updateIssue?(
    repository: string,
    number: number,
    patch: Record<string, unknown>,
  ): Promise<unknown>;
  commit(
    repository: string,
    sha: string,
  ): Promise<{ author?: { login?: string } } | null>;
  pullRequest(
    repository: string,
    number: unknown,
  ): Promise<{ assignees?: (string | { login?: string } | null)[] } | null>;
}
type Identity = Pick<PlanningIdentity, "mode" | "epicIssueType"> | null;

const receiptId = (level: string, id: string) => `github-parent:${level}:${id}`;
const lower = (value: unknown) => String(value ?? "").toLowerCase();

// An input issue may become a spec's journal home only in that home's own
// repository. The same repository has the same visibility.
const reusableInput = (
  input: { repository?: string; number?: unknown } | null | undefined,
  home: string,
): input is { repository: string; number: number } =>
  Boolean(input?.repository && home) &&
  Number.isInteger(input?.number) &&
  lower(input?.repository) === lower(home);

function homeRepository(
  store: Store,
  repository: string | null | undefined,
): Config {
  const configured = store.list<Config>("github_repositories");
  const config = repository
    ? configured.find((entry) => lower(entry.id) === lower(repository))
    : configured.length === 1
      ? configured[0]
      : null;
  if (!config)
    return fail(
      repository
        ? `${repository} is not a configured repository.`
        : "Name the repository that holds this spec's issue.",
      400,
    );
  return config;
}

function remember(
  store: Store,
  level: string,
  id: string,
  config: { id: string },
  issue: Issue,
  extra: Record<string, unknown> = {},
) {
  const existing = store.get<Receipt>("receipts", receiptId(level, id));
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

// The hidden line that names the spec an issue is for (workflow rule 8.2):
// exactly `<!-- avoozl-spec:NAME -->`, so any runner finds the issue again.
// An epic's issue keeps its own mark.
const issueMark = (kind: string, id: string) =>
  kind === "spec"
    ? `<!-- avoozl-spec:${id} -->`
    : `<!-- avoozl:${kind} ${id} -->`;
const SPEC_MARK = /^<!-- avoozl-spec:([A-Za-z0-9._-]+) -->$/m;
const EPIC_MARK = /<!-- avoozl:epic ([A-Za-z0-9][A-Za-z0-9._-]{0,159}) -->/;

// The authors GitHub names as writers on an issue: the repository's owner,
// a member of its organization, or a collaborator.
// shortcut: the association stands in for a permission read; read
// permissions when a team counts a role that has no association.
const WRITER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const writerIssue = (issue: Issue) =>
  WRITER_ASSOCIATIONS.has(String(issue.author_association ?? "").toUpperCase());

// Rule 8.2 over a repository's issues: each spec's issue is the oldest open
// issue by a writer whose body holds the spec's marker line; a newer open one
// for the same spec is a duplicate. Returns {specs: Map name -> issue,
// duplicates: [issue]}.
export function specIssuesOf(
  issues: Issue[] | null | undefined,
  isWriter: (issue: Issue) => boolean = writerIssue,
) {
  const specs = new Map<string, Issue>(),
    duplicates: Issue[] = [];
  for (const issue of [...(issues ?? [])].sort((a, b) => a.number - b.number)) {
    if (issue.state && issue.state !== "open") continue;
    if (issue.pull_request || !isWriter(issue)) continue;
    const name = SPEC_MARK.exec(issue.body ?? "")?.[1];
    if (!name) continue;
    if (specs.has(name)) duplicates.push(issue);
    else specs.set(name, issue);
  }
  return { specs, duplicates };
}

const issueBody = (kind: string, id: string) =>
  [
    `This ${kind}'s one assignee drives it in Avoozl. Reassign it to hand the ${kind} to someone else.`,
    "",
    "The design and the tasks stay in the spec's files.",
    "",
    issueMark(kind, id),
  ].join("\n");

// Read every open spec and epic issue back from its hidden line, in each
// repository with a GitHub name, and keep the oldest per spec. A newer open
// issue for the same spec is a duplicate, and is closed (rule 8.2).
export async function readSpecIssues(
  store: Store,
  github: PublishGitHub | null | undefined,
) {
  const found: {
      level: string;
      id: string;
      repository: string;
      number: number;
    }[] = [],
    errors: Errors = [];
  const list = github?.listIssues?.bind(github);
  if (!github || !list) return { found, errors };
  for (const repository of store.list<{ id: string; github?: string | null }>(
    "repositories",
  )) {
    const name = repository.github;
    if (!name) continue;
    let issues: Issue[];
    try {
      issues = await list(name, { state: "open" });
    } catch (error) {
      errors.push({ repository: name, error: (error as Error).message });
      continue;
    }
    const { specs, duplicates } = specIssuesOf(issues),
      marked = [
        ...[...specs].map(([id, issue]) => ({ level: "plan", id, issue })),
        ...[...(issues ?? [])]
          .sort((a, b) => a.number - b.number)
          .flatMap((issue) => {
            const id = EPIC_MARK.exec(issue.body ?? "")?.[1];
            return id ? [{ level: "epic", id, issue }] : [];
          }),
      ];
    for (const issue of duplicates)
      if (github.updateIssue)
        try {
          await github.updateIssue(name, issue.number, {
            state: "closed",
          });
        } catch (error) {
          errors.push({ repository: name, error: (error as Error).message });
        }
    for (const { level, id, issue } of marked) {
      if (store.get<Receipt>("receipts", receiptId(level, id))?.number)
        continue;
      remember(
        store,
        level,
        id,
        { id: name },
        issue,
        level === "plan" ? { planId: id } : {},
      );
      found.push({
        level,
        id,
        repository: name,
        number: issue.number,
      });
    }
  }
  return { found, errors };
}

// Publishes one spec plan.
export async function publishSpec(
  store: Store,
  {
    github,
    identity,
    planId,
    repository,
    assignees = [],
  }: {
    github: PublishGitHub;
    identity: Identity;
    planId: unknown;
    repository?: unknown;
    assignees?: string[];
  },
) {
  const plan = store.get<Plan>("plans", planId);
  if (!plan) return fail("Plan not found.", 404);
  if (!plan.spec) fail("Only a spec plan has a spec issue.", 409);
  if (!identity?.mode || identity.mode === "local" || !github?.available?.())
    fail("Making the GitHub issues needs GitHub; run gh auth login.", 409);
  const config = homeRepository(store, repository as string | null | undefined),
    held = store.get<Receipt>("receipts", receiptId("plan", plan.id));
  if (held?.number) {
    const home =
      store.get<Config>("github_repositories", held.repository) || config;
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
  let epicIssue: {
    number: number;
    node_id?: string | null;
    owner?: string;
  } | null = null;
  if (epic) {
    const stored = store.get<Receipt>("receipts", receiptId("epic", epic.id));
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
        ...(identity?.epicIssueType ? { type: identity.epicIssueType } : {}),
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
    body: issueBody("spec", String(plan.spec)),
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

export function queuePublish(
  store: Store,
  planId: string,
  commit: string | null | undefined,
) {
  if (!commit) return;
  const pending = store.getMeta<Record<string, string>>(PENDING) ?? {};
  if (pending[planId] === commit) return;
  store.setMeta(PENDING, { ...pending, [planId]: commit });
}

const loginsOf = (
  entries: (string | { login?: string } | null)[] | null | undefined,
) =>
  (entries ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.login))
    .filter((login): login is string => Boolean(login));

const configured = (store: Store, repository: string) =>
  store
    .list<Config>("github_repositories")
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
  store: Store,
  {
    github,
    identity: given,
    evidence,
    homeOf,
  }: {
    github: PublishGitHub & Parameters<typeof personOf>[0];
    identity: Identity | (() => Identity);
    evidence?: Map<
      string,
      { mergedBy?: string; signer?: string; pushedBy?: string; pull?: unknown }
    > | null;
    homeOf: (plan: Plan) => Promise<string | null>;
  },
) {
  const pending = store.getMeta<Record<string, string>>(PENDING) ?? {};
  if (!Object.keys(pending).length) return [];
  // `identity` may be a function, read only when something is queued.
  const identity = typeof given === "function" ? given() : given;
  if (!identity?.mode || !github?.available?.()) {
    store.setMeta(PENDING, {});
    return [];
  }
  const left = { ...pending },
    errors: Errors = [],
    held = (planId: string) =>
      store.get<Receipt>("receipts", receiptId("plan", planId))?.number;
  let login: string | null;
  try {
    login = await personOf(github);
    if (Object.keys(left).some((planId) => !held(planId)))
      errors.push(...(await readSpecIssues(store, github)).errors);
  } catch (error) {
    return [{ repository: "GitHub", error: (error as Error).message }];
  }
  for (const [planId, commit] of Object.entries(pending)) {
    const plan = store.get<Plan>("plans", planId);
    if (!plan || plan.deletedAt || held(planId) || !login) {
      delete left[planId];
      continue;
    }
    let repository: string | null = null;
    try {
      repository = await homeOf(plan);
      if (!repository || !configured(store, repository)) {
        delete left[planId];
        continue;
      }
      const proof = evidence?.get(commit) ?? {},
        approval = store.get<{ id: string; approvedBy?: unknown }>(
          "approvals",
          plan.approvalId,
        );
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
      errors.push({
        repository: repository ?? "GitHub",
        error: (error as Error).message,
      });
    }
  }
  store.setMeta(PENDING, left);
  return errors;
}
