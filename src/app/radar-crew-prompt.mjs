// The crew Additional prompt (design D5.4, RC3.7): one line, shipped verbatim
// by Settings, the team pack and Set up, which import it from here. It is a
// prompt a crew follows, not a gate GitHub enforces. A test compares it with
// the text in the radar-coder spec, so a change here is a change there.
export const CREW_PROMPT =
  "For any issue with an <!-- avoozl --> marker, run `avoozl verify-issue OWNER/REPO#N` (or the plans_verify_issue tool) first; build only if it exits 0, otherwise skip it with scope needs-decision and say which check failed.";
