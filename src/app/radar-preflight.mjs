// Preflight for Create and release (RC2.9, design D4.3). Five items. A `fail`
// item refuses Create and release and is named; `unverified` is shown and does
// not refuse, because Avoozl cannot read it. Nothing is written.
import { effectiveShip } from "./radar-merge-path.mjs";
import { publicHold } from "./public-signoff.mjs";
import { approvalState, proseFiles, statusOf } from "./spec-approval.mjs";
import { fail } from "./store.mjs";

const item = (id, label, status, detail) => ({ id, label, status, detail });

// shortcut: the spec item reads Avoozl's approval record and the plan's own
// files, not the default branch; the crew's verify-issue still reads GitHub.
// Read the branch here when a stale record causes a wrong pass.
export function preflight({
  store,
  plan,
  repository,
  approved,
  decisionRecord,
  mergePath,
  delivery,
}) {
  const state = plan ? approvalState(store, plan.id, plan.hash) : null,
    files = plan?.files || {},
    said = proseFiles(files).every(
      (name) => statusOf(files[name]) === "Approved",
    ),
    merged = state?.state === "merged";
  const spec = !plan?.spec
      ? item(
          "spec",
          "Spec approved on the default branch",
          "fail",
          "This plan is not a spec.",
        )
      : approved && said && (merged || !decisionRecord)
        ? item(
            "spec",
            "Spec approved on the default branch",
            "ok",
            merged
              ? `Approval merged at ${String(state.commit).slice(0, 7)}.`
              : "The spec files say Status: Approved.",
          )
        : item(
            "spec",
            "Spec approved on the default branch",
            "fail",
            approved
              ? "The approval pull request has not merged, or the files changed since."
              : "Approve the spec first; it must say Status: Approved on the default branch.",
          ),
    record = !decisionRecord
      ? item(
          "decision",
          "Decision record",
          "ok",
          "approval.decisionRecord is off for this repository.",
        )
      : merged
        ? item(
            "decision",
            "Decision record",
            "ok",
            "The approval pull request added it.",
          )
        : item(
            "decision",
            "Decision record",
            "fail",
            "docs/decisions/<spec>.md is added by the approval pull request, which has not merged.",
          ),
    path = !mergePath
      ? item(
          "merge-path",
          "Merge path",
          "fail",
          "The merge path could not be read.",
        )
      : mergePath.ready || effectiveShip(delivery, repository) !== "auto-merge"
        ? item(
            "merge-path",
            "Merge path",
            "ok",
            mergePath.ready
              ? "Auto-merge can merge crew pull requests."
              : "Ship mode is manual: a person merges.",
          )
        : item(
            "merge-path",
            "Merge path",
            "fail",
            mergePath.items
              .filter((entry) => !entry.ok)
              .map((entry) => `${entry.label} (${entry.detail})`)
              .join("; "),
          ),
    scope = item(
      "crew-scope",
      "Crew label scope",
      "unverified",
      "Avoozl cannot read which label the crew watches without Radar's grant. Check it in Issue Radar.",
    ),
    hold = publicHold(store, repository),
    signoff = item(
      "public-signoff",
      "Public sign-off",
      hold ? "fail" : "ok",
      hold ?? "Private, or the public sign-off is complete.",
    ),
    items = [spec, record, path, scope, signoff];
  return {
    repository,
    ok: items.every((entry) => entry.status !== "fail"),
    items,
  };
}

// The Create and release refusal: names each failing item.
export function requirePreflight(result) {
  const failing = result.items.filter((entry) => entry.status === "fail");
  if (failing.length)
    fail(
      `Preflight failed. ${failing.map((entry) => `${entry.label}: ${entry.detail}`).join(" ")}`,
      409,
    );
  return result;
}
