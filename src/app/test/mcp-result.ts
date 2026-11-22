// Test helper: the result of an MCP tools/call answer, checked at run time.
import assert from "node:assert/strict";
import type { handleMcp } from "../mcp/mcp.ts";

// A tool call's result, for the fields tests read.
export interface ToolResult {
  isError?: boolean;
  content: { type?: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

// The tool result in `response`, failing the test when it carries none.
export function toolResult(
  response: Awaited<ReturnType<typeof handleMcp>>,
): ToolResult {
  const body = response.body,
    result: unknown = body && "result" in body ? body.result : null;
  assert.ok(
    result && typeof result === "object" && "content" in result,
    "the answer is a tool result",
  );
  const content: unknown = result.content;
  assert.ok(Array.isArray(content), "its content is a list");
  return { ...result, content };
}
