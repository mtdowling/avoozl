// What is left of approve on the issue (RC18, design D23) and the claim at
// approval (RC19, design D24) now that no repository is Radar-coded (R91.6):
// the Needs you rows already raised, and the release of claims Avoozl wrote
// before. Nothing new is labeled or claimed.
import { parseMarkers, liveClaim } from "./radar-crews.mjs";

const ROWS = "approvalRows";
const lower = (value) => String(value ?? "").toLowerCase();
const labelNames = (issue) =>
  (issue?.labels || []).map((label) =>
    typeof label === "string" ? label : label?.name,
  );
const has = (issue, name) =>
  labelNames(issue).some((label) => lower(label) === lower(name));

// A claim Avoozl held for a plan names Avoozl, never a crew.
const CLAIM_HOLDER = "avoozl";
const ownClaim = (body) =>
  parseMarkers(body).some((marker) => marker.id === CLAIM_HOLDER);

// Rows for the Needs you list; each stays until its cause is gone.
export const approvalNeedsYou = (store) =>
  Object.values(store.getMeta(ROWS) || {}).map((row) => ({
    kind: "needs-human",
    reason: "approval",
    taskId: null,
    authority: "github",
    ...row,
  }));

// ---- RC19.5: release Avoozl's own older claims ---------------------------

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
        policy?.repositories?.[receipt.repository]?.crewLabels?.inProgress;
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
