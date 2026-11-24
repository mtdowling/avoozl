// How an operation relates to MCP (R56). Every operation entry names one:
//   routed    an MCP tool action reaches it (mcp-tools.mjs); a test checks.
//             `audit` records every call in Activity with the caller that
//             made it, and `confirm` refuses the call unless its input says
//             `confirm: true` (the CLI's --yes) or the owner's own page
//             session makes it.
//   notOnMcp  no MCP tool routes to it, for the written reason.
export type Policy =
  | {
      kind: "routed";
      reason?: undefined;
      audit?: boolean;
      confirm?: boolean;
    }
  | {
      kind: "notOnMcp";
      reason: string;
      audit?: undefined;
      confirm?: undefined;
    };

export const routed: Policy = Object.freeze({ kind: "routed" });
// A change to approvals, settings, setup or delivery: every call is
// recorded with its caller.
export const audited: Policy = Object.freeze({ kind: "routed", audit: true });
// A delete, or a step that allows one: recorded, and refused without
// `confirm: true`.
export const destructive: Policy = Object.freeze({
  kind: "routed",
  audit: true,
  confirm: true,
});
export const notOnMcp = (reason: string): Policy => ({
  kind: "notOnMcp",
  reason,
});
