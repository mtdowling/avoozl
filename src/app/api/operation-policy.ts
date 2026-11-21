// How an operation relates to MCP (R56). Every operation entry names one:
//   routed    an MCP tool action reaches it (mcp-tools.mjs); a test checks.
//   person    refused for any MCP call, under any tool name. `when` limits
//             the refusal to one input shape (a setup preview reads; its
//             confirmed apply writes).
//   notOnMcp  no MCP tool routes to it, for the written reason.
const APP = " Do it in the Avoozl app.";

export type Policy =
  | { kind: "routed"; reason?: undefined; when?: undefined }
  | {
      kind: "person";
      reason: string;
      when?: (input: Record<string, unknown>) => boolean;
    }
  | { kind: "notOnMcp"; reason: string; when?: undefined };

export const routed: Policy = Object.freeze({ kind: "routed" });
export const person = (
  reason: string,
  when?: (input: Record<string, unknown>) => boolean,
): Policy => ({
  kind: "person",
  reason: reason + APP,
  when,
});
export const notOnMcp = (reason: string): Policy => ({
  kind: "notOnMcp",
  reason,
});
