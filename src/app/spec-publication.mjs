// Publish issue (Requirement 102.1-102.2, design §4.32.4): an explicit,
// per-spec act that gives a spec its journal home. Approval never calls it.
//
// - GitHub: one issue for the spec and one for its epic, each created with
//   the crew:avoozl label in the create call (R103.1). The spec issue is
//   made under its epic's issue when GitHub allows the link. An issue the
//   workspace already holds for the spec or epic (a plan or epic issue from
//   projection) is reused, so ownership read from its assignee stays.
// - No GitHub: the same journal protocol in a local file.
// Publishing again writes nothing.
//
// shortcut: the home is the named or only configured repository; a private
// mirror's home rule (RC24.3) still comes from projection until 56.3
// generalizes spec homes.
import path from "node:path";
import { fail } from "./store.mjs";
import { epicOfPlan } from "./epics.mjs";
import { githubJournal, localJournal } from "./spec-journal.mjs";
import { reusableInput } from "./github-intake.mjs";

export const OWNERSHIP_LABEL = "crew:avoozl";
const receiptId = (level, id) => `github-parent:${level}:${id}`;
const lower = (value) => String(value ?? "").toLowerCase();

export const localJournalFile = (workspaceRoot, planId) =>
  path.join(workspaceRoot, ".avoozl", "local", "journal", `${planId}.jsonl`);

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

const issueBody = (kind) =>
  [
    `Avoozl keeps this ${kind}'s journal here: compact records of outcomes, approvals, controls and handoffs, one comment each.`,
    "",
    "The design and the tasks stay in the spec's files.",
  ].join("\n");

// Publishes one spec plan. `github` is null for a workspace without GitHub.
export async function publishSpec(
  store,
  { github, workspaceRoot, identity, planId, repository, actor },
) {
  const plan = store.get("plans", planId);
  if (!plan) fail("Plan not found.", 404);
  if (!plan.spec) fail("Only a spec plan has a spec issue.", 409);
  if (!identity?.mode || !github?.available?.()) {
    const file = localJournalFile(workspaceRoot, plan.id),
      journal = localJournal(file, actor);
    const existing = store.get("receipts", `spec-journal:${plan.id}`);
    if (!existing)
      store.put("receipts", {
        id: `spec-journal:${plan.id}`,
        kind: "spec-journal",
        planId: plan.id,
        home: "local",
        updatedAt: new Date().toISOString(),
      });
    return { home: "local", existing: Boolean(existing), journal };
  }
  const config = homeRepository(store, repository),
    held = store.get("receipts", receiptId("plan", plan.id));
  if (held?.number) {
    const home = store.get("github_repositories", held.repository) || config;
    return {
      home: "github",
      existing: true,
      repository: home.id,
      number: held.number,
      journal: githubJournal(github, home, held.number),
    };
  }
  const epic = epicOfPlan(store.read(), plan.id);
  // The issue a plan came from becomes its spec issue when it lives in the
  // spec's home (R102.19). shortcut: only a plan with no epic reuses it;
  // under an epic a new issue is made, so the sub-issue link comes from the
  // create call. Lift this if an epic plan should reuse its input too.
  const input = plan.context?.newPlan?.source;
  if (!epic && reusableInput(input, config.id)) {
    const issue = await github.issue(config, input.number);
    if (issue && issue.state === "open") {
      const names = (issue.labels || []).map((label) =>
        typeof label === "string" ? label : label?.name,
      );
      if (!names.some((name) => lower(name) === OWNERSHIP_LABEL))
        await github.addLabels(config, issue.number, [OWNERSHIP_LABEL]);
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
        journal: githubJournal(github, config, issue.number),
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
      const made = await github.createIssue(config, {
        title: epic.title || epic.id,
        body: issueBody("epic"),
        labels: [OWNERSHIP_LABEL],
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
  const issue = await github.createIssue(config, {
    title: plan.title || plan.id,
    body: issueBody("spec"),
    labels: [OWNERSHIP_LABEL],
    ...(under ? { parentIssueId: under } : {}),
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
    journal: githubJournal(github, config, issue.number),
  };
}
