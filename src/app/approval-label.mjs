// Approve on the issue (RC18, design D23) and the claim at approval (RC19,
// design D24). A trusted person's label on the issue that asked for a plan
// approves it; an approval made anywhere else is written back to that issue
// once; and the parent issue is claimed in Radar's format so no crew takes it.
// GitHub is read and written through the `github` client; nothing is merged
// and no spec text is posted.
import { instanceIdentity } from "./instance.mjs";
import { actorAllowed } from "./github-policy.mjs";
import { recordActivity } from "./activity-log.mjs";
import { planSource } from "./radar-source.mjs";
import { parseMarkers, liveClaim } from "./radar-claims.mjs";

const ROWS = "approvalRows";
const lower = (value) => String(value ?? "").toLowerCase();
const labelNames = (issue) =>
  (issue?.labels || []).map((label) =>
    typeof label === "string" ? label : label?.name,
  );
const has = (issue, name) =>
  labelNames(issue).some((label) => lower(label) === lower(name));
const ref = (source) => `${source.repository}#${source.number}`;

// A claim held for a plan: a waiting phase, so it never ages out (radar-claims
// TTL_PHASES), and the id names Avoozl, never a crew.
// shortcut: `awaiting-merge` is a waiting phase seen in Radar's own claims;
// re-read Radar's ledger spec if a release adds or renames phases.
export const CLAIM_HOLDER = "avoozl";
const claimBody = (plan, now) =>
  `👻 **Avoozl**\nheld for plan ${plan.id} · updated ${now}\n\n<!-- kirocrew-crew v=1 id=${CLAIM_HOLDER} phase=awaiting-merge updated=${now} -->`;
const ownClaim = (body) =>
  parseMarkers(body).some((marker) => marker.id === CLAIM_HOLDER);

// The hidden marker of the write-back comment: login, spec path, commit, time.
// The instance ID (never its name) follows when there is one.
export const approvalMarker = ({ approver, spec, commit, at, instance }) =>
  `<!-- avoozl-approval v=1 approver=${approver} spec=.kiro/specs/${spec} commit=${commit || "none"} at=${at}${instance ? ` instance=${instance}` : ""} -->`;

// ---- Needs you rows ------------------------------------------------------

const readRows = (store) => store.getMeta(ROWS) || {};
function addRow(store, row) {
  const rows = readRows(store);
  if (rows[row.id]) return false;
  store.setMeta(ROWS, { ...rows, [row.id]: row });
  return true;
}
export const dropRow = (store, id) => {
  const { [id]: gone, ...rest } = readRows(store);
  if (gone) store.setMeta(ROWS, rest);
};

// Rows for the Needs you list; each stays until its cause is gone.
export const approvalNeedsYou = (store) =>
  Object.values(readRows(store)).map((row) => ({
    kind: "needs-human",
    reason: "approval",
    taskId: null,
    authority: "github",
    ...row,
  }));

const rowFor = (id, source, title, detail, config) => ({
  id,
  issue: {
    number: source.number,
    repository: source.repository,
    url: config?.url ?? null,
  },
  link: null,
  title,
  detail,
  openedAt: new Date().toISOString(),
});

// ---- RC18.4 to RC18.6, RC18.9: write the approval back ---------------------

// After an approval made in Avoozl, a chat or the CLI: the approval label and
// one marker comment on the source issue. Once per revision; a failure keeps
// the approval and raises one row. A plan with no source issue writes nothing.
export async function writeBackApproval({
  store,
  github,
  policy,
  identity,
  plan,
  approver,
  commit,
  now = new Date().toISOString(),
}) {
  const source = planSource(plan, identity),
    receipt = `approval-writeback:${plan.id}:${plan.hash}`;
  if (!source || store.get("receipts", receipt)) return null;
  const config = store.get("github_repositories", source.repository),
    settings = policy?.repositories?.[source.repository],
    label = settings?.radar?.approvalLabel;
  if (!config || !label) return null;
  try {
    const issue = await github.issue(config, source.number);
    if (!has(issue, label))
      await github.addLabels(config, source.number, [label]);
    await github.createIssueComment(
      config,
      source.number,
      `Plan approved. Avoozl is releasing the work.\n\n${approvalMarker({
        approver,
        spec: plan.spec,
        commit,
        at: now,
        instance: instanceIdentity(store).id,
      })}`,
    );
    store.put("receipts", { id: receipt, planId: plan.id, at: now });
    return { written: true };
  } catch (error) {
    // Recorded so the one row is not repeated; the approval stands.
    store.put("receipts", {
      id: receipt,
      planId: plan.id,
      at: now,
      failed: true,
    });
    addRow(
      store,
      rowFor(
        `approval-writeback:${plan.id}:${plan.hash}`,
        source,
        `${ref(source)} was not updated with the approval`,
        `${plan.id} is approved, but Avoozl could not add "${label}" or its comment to the issue: ${error.message}. The approval stands.`,
        config,
      ),
    );
    return { written: false, error: error.message };
  }
}

// ---- RC19: claim the parent at approval -------------------------------------

// Radar's claim marker on the parent, and its in-progress label. A crew's own
// claim is left alone and noted once in Trace. Once per approval.
export async function claimParent({
  store,
  github,
  policy,
  identity,
  plan,
  now = new Date().toISOString(),
}) {
  const source = planSource(plan, identity),
    receipt = `approval-claim:${plan.id}:${plan.hash}`;
  if (!source || store.get("receipts", receipt)) return null;
  const config = store.get("github_repositories", source.repository),
    claimLabel = policy?.repositories?.[source.repository]?.crewLabels?.claim;
  if (!config || !claimLabel) return null;
  try {
    const comments = await github.listIssueComments(config, source.number),
      live = liveClaim(comments);
    if (live && !ownClaim(live.body)) {
      store.put("receipts", {
        id: receipt,
        planId: plan.id,
        at: now,
        skipped: true,
      });
      recordActivity(store, {
        source: "github",
        kind: "approval.claim-skipped",
        summary: `A crew already holds ${ref(source)}; Avoozl wrote no claim.`,
        targetId: plan.id,
        key: `approval.claim-skipped:${plan.id}`,
      });
      return { skipped: true };
    }
    const comment = await github.createIssueComment(
      config,
      source.number,
      claimBody(plan, now),
    );
    await github.addLabels(config, source.number, [claimLabel]);
    store.put("receipts", {
      id: receipt,
      planId: plan.id,
      at: now,
      repository: source.repository,
      number: source.number,
      commentId: comment?.id ?? null,
    });
    return { claimed: true };
  } catch (error) {
    // Not recorded: the next approval pass tries again, and nothing is posted twice.
    return { error: error.message };
  }
}

// Remove Avoozl's own claim when its plan is superseded (gone or archived) or
// the parent closes. A claim that is not Avoozl's is left, label and all.
export async function releaseClaims({ store, github, policy, plans }) {
  const released = [];
  for (const receipt of store.list("receipts")) {
    if (
      !receipt.id.startsWith("approval-claim:") ||
      !receipt.commentId ||
      receipt.released
    )
      continue;
    const config = store.get("github_repositories", receipt.repository),
      plan = plans.get(receipt.planId),
      claimLabel =
        policy?.repositories?.[receipt.repository]?.crewLabels?.claim;
    if (!config || !claimLabel) continue;
    try {
      const issue = await github.issue(config, receipt.number),
        gone = !plan || plan.archivedAt || issue?.state === "closed";
      if (!gone) continue;
      const comments = await github.listIssueComments(config, receipt.number),
        live = liveClaim(comments);
      if (live && !ownClaim(live.body)) continue;
      if (has(issue, claimLabel))
        await github.removeLabel(config, receipt.number, claimLabel);
      store.put("receipts", { ...receipt, released: true });
      released.push(receipt.id);
    } catch {
      // Tried again next tick.
    }
  }
  return released;
}

// ---- RC18.2, RC18.3: the label approves ----------------------------------

// `drafts`: [{plan, errors}] for drafted plans; `approve(plan, login)` approves
// through the one approval operation. A label from anyone who fails the
// trigger-label check, or whose login cannot be read, is removed with one row.
export async function approvalLabelStep({
  store,
  github,
  policy,
  identity,
  drafts,
  approve,
}) {
  const done = [];
  for (const { plan, errors } of drafts) {
    const source = planSource(plan, identity);
    if (!source) continue;
    const config = store.get("github_repositories", source.repository),
      settings = policy?.repositories?.[source.repository],
      label = settings?.radar?.approvalLabel;
    if (!config || !label) continue;
    try {
      const issue = await github.issue(config, source.number);
      if (!has(issue, label)) continue;
      const events = await github.issueEvents(config, source.number),
        by = (Array.isArray(events) ? events : [])
          .filter(
            (event) =>
              event.event === "labeled" &&
              lower(event.label?.name) === lower(label),
          )
          .at(-1)?.actor?.login;
      let allowed = false;
      if (by) {
        const permission = settings.minimumPermission
          ? (await github.permission(config, by))?.permission || "none"
          : null;
        allowed = actorAllowed(settings, by, permission).allowed;
      }
      if (!allowed) {
        await github.removeLabel(config, source.number, label);
        addRow(
          store,
          rowFor(
            `approval-label:${ref(source)}:${by || "unknown"}`,
            source,
            `${by || "Someone"} added "${label}" to ${ref(source)} and was ignored`,
            `${by ? `${by} is` : "The person who added it could not be read and is"} not allowed to approve plans here. Avoozl removed the label and approved nothing.`,
            config,
          ),
        );
        continue;
      }
      if (errors > 0) continue;
      await approve(plan, by);
      done.push(plan.id);
    } catch {
      // An unreadable issue is tried again next tick.
    }
  }
  return done;
}
