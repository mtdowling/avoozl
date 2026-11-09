import { fail } from "./store.mjs";
export function approvalMode(value, fallback = "automatic") {
  const mode = value ?? fallback;
  if (!["automatic", "manual"].includes(mode))
    fail("Choose automatic or manual approvals.");
  return mode;
}
export function codexApprovals(value) {
  return {
    approvalPolicy: "on-request",
    approvalsReviewer:
      approvalMode(value) === "automatic" ? "auto_review" : "user",
  };
}
export function claudeApprovals(mode, value) {
  const automatic = approvalMode(value) === "automatic";
  return {
    permissionMode:
      mode === "implement" ? (automatic ? "auto" : "default") : "plan",
    settings: {
      useAutoModeDuringPlan: automatic,
      skipAutoPermissionPrompt: automatic,
    },
  };
}
